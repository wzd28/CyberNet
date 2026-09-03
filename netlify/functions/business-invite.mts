import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

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

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendInviteEmail(toEmail: string, inviterName: string, acceptUrl: string): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) throw new Error("Email delivery is not configured (missing RESEND_API_KEY).");

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
            ${inviterName ? `${inviterName} has` : "Someone has"} invited you to join their CyberNet AI Business team.
            Accepting gives you Business-tier access to Quick Scan, Analysis AI, and Recovery Mode while you're on the team.
          </p>
          <p style="margin: 32px 0;">
            <a href="${acceptUrl}" style="background: #22d3ee; color: #050a16; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept invite</a>
          </p>
          <p style="color: #64748b; font-size: 13px; line-height: 1.6;">
            Note: on a Business team, the team owner can view the full content of your Quick Scan, Analysis AI, and
            Recovery Mode activity. Once you accept, only the team owner can remove you from the team.
          </p>
          <p style="color: #94a3b8; font-size: 12px;">This invite expires in 7 days. If you didn't expect this, you can ignore this email.</p>
        </div>
      `,
      text: `${inviterName || "Someone"} invited you to join their CyberNet AI Business team.\n\nAccept: ${acceptUrl}\n\nNote: the team owner can view the full content of your activity while you're on the team. Only the team owner can remove you once you accept. This invite expires in 7 days.`,
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

    const [membersRes, pendingRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/business_members?business_account_id=eq.${team.businessAccountId}&status=eq.active&select=id`
      ),
      serviceFetch(
        `/rest/v1/business_invites?business_account_id=eq.${team.businessAccountId}&status=eq.pending&select=id,email`
      ),
    ]);
    const members = await membersRes.json().catch(() => []);
    const pending = await pendingRes.json().catch(() => []);

    if ((pending as any[]).some((p) => p.email === email)) {
      return json({ error: "There's already a pending invite for this email." }, 409);
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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
    const inviterName = String(user.user_metadata?.full_name || "").trim();

    await sendInviteEmail(email, inviterName, acceptUrl);

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: error.message || "Could not send the invite." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-invite" };
