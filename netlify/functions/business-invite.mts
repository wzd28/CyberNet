import { json, verifyUser, getActiveTeamMembership, serviceFetch, expireStaleInvites } from "../lib/supabase.mjs";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

function env(name: string): string {
  try {
    return Netlify.env.get(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

// Invites can be accepted for 24 hours after they are sent.
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Daily cap on invites a team can send, so the CyberNet domain cannot be used
// to mass-mail arbitrary addresses (a revoked invite frees its seat).
const MAX_INVITES_PER_DAY = 30;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
}

// The display name is user-controlled (supabase.auth.updateUser), so strip
// control characters, angle brackets and links, and cap the length.
function sanitizeInviterName(value: unknown): string {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .trim()
    .slice(0, 60);
}

async function sendInviteEmail(toEmail: string, inviterName: string, acceptUrl: string): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    console.error("CyberNet invite: RESEND_API_KEY missing");
    throw Object.assign(new Error("Invite emails can't be sent right now. Please try again later."), { status: 503 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "CyberNet AI <team@cybernetai.app>",
      to: [toEmail],
      subject: `${inviterName || "Your team"} invited you to a CyberNet AI Business team`,
      html: `
        <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #0f172a;">You've been invited to a CyberNet AI Business team</h2>
          <p style="color: #334155; line-height: 1.6;">
            ${inviterName ? `${escapeHtml(inviterName)} has` : "Someone has"} invited you to join their CyberNet AI Business team.
            Accepting gives you Business-tier access to Quick Scan, Analysis AI, and Recovery Mode while you're on the team.
          </p>
          <p style="margin: 32px 0;">
            <a href="${acceptUrl}" style="background: #22d3ee; color: #050a16; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept invite</a>
          </p>
          <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
            Note: on a Business team, the team owner can view what you submit and the full results of your Quick Scan,
            Analysis AI, and Recovery Mode activity (pictures you upload are not stored). Once you accept, only the team owner can remove you from the team.
          </p>
          <p style="color: #94a3b8; font-size: 12px;">This invite expires in 24 hours. If you didn't expect this, you can ignore this email.</p>
        </div>
      `,
      text: `${inviterName || "Someone"} invited you to join their CyberNet AI Business team.\n\nAccept: ${acceptUrl}\n\nNote: the team owner can view what you submit and the full results of your activity while you're on the team (pictures you upload are not stored). Only the team owner can remove you once you accept. This invite expires in 24 hours.`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error((payload as any)?.message || "Could not send the invite email.");
  }
}

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can invite teammates." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@") || email.length > 254) {
      return json({ error: "A valid email address is required." }, 400);
    }

    await expireStaleInvites(team.businessAccountId);

    // Only invites that can still be accepted hold a seat or block a resend.
    const now = new Date().toISOString();
    const [membersRes, pendingRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/business_members?business_account_id=eq.${team.businessAccountId}&status=eq.active&select=id`
      ),
      serviceFetch(
        `/rest/v1/business_invites?business_account_id=eq.${team.businessAccountId}` +
        `&status=eq.pending&expires_at=gt.${now}&select=id,email`
      ),
    ]);
    const members = await membersRes.json().catch(() => []);
    const pending = await pendingRes.json().catch(() => []);

    if ((pending as any[]).some((p) => String(p.email || "").toLowerCase() === email)) {
      return json({ error: "There's already a pending invite for this email." }, 409);
    }

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const recentRes = await serviceFetch(
      `/rest/v1/business_invites?business_account_id=eq.${team.businessAccountId}` +
      `&created_at=gt.${encodeURIComponent(since)}&select=id`
    );
    const recent = await recentRes.json().catch(() => []);
    if (Array.isArray(recent) && recent.length >= MAX_INVITES_PER_DAY) {
      return json({ error: "Invite limit reached for today. Please try again tomorrow." }, 429);
    }

    const seatsTaken = (members as any[]).length + (pending as any[]).length;
    const seatCap = { 5: 5, 10: 10, 20: 20 }[team.seatTier as 5 | 10 | 20] || 5;

    if (seatsTaken >= seatCap) {
      return json(
        { error: `Team is full (${seatsTaken}/${seatCap} seats). Remove a member or upgrade your tier to add more.` },
        409
      );
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    const insertRes = await serviceFetch("/rest/v1/business_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        business_account_id: team.businessAccountId,
        email,
        token,
        invited_by_user_id: user.id,
        expires_at: expiresAt,
      }),
    });

    if (!insertRes.ok) {
      const payload = await insertRes.json().catch(() => ({}));
      throw new Error((payload as any)?.message || "Could not create the invite.");
    }

    const acceptUrl = `${new URL(request.url).origin}/accept-invite?token=${token}`;
    const inviterName = sanitizeInviterName(user.user_metadata?.full_name);

    // The row is written before the email goes out; if sending fails, revoke it
    // so it does not hold a seat or block a retry to the same address.
    try {
      await sendInviteEmail(email, inviterName, acceptUrl);
    } catch (sendError: any) {
      await serviceFetch(`/rest/v1/business_invites?token=eq.${token}&status=eq.pending`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "revoked" }),
      }).catch(() => null);
      console.error("CyberNet invite email failed", sendError?.message);
      if (sendError?.status) throw sendError;
      throw Object.assign(
        new Error("The invite email could not be sent, so the invite was not created. Please try again in a moment."),
        { status: 502 }
      );
    }

    return json({ ok: true, expiresAt });
  } catch (error: any) {
    return json({ error: error.message || "Could not send the invite." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-invite" };
