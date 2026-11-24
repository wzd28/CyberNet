import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { publicErrorBody } from "../lib/public-error.mjs";
import { readJsonCapped } from "../lib/abuse-guard.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";

const EXPIRED_MESSAGE = "This invite has expired. Ask the team owner to send a new one.";

// Why an invite that isn't pending can't be accepted, in the invitee's terms.
function inactiveInviteResponse(status: string) {
  if (status === "revoked") return json({ error: "This invite was cancelled by the team owner." }, 410);
  if (status === "expired") return json({ error: EXPIRED_MESSAGE }, 410);
  return json({ error: "This invite has already been used." }, 410);
}

export default webOnly(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    // SRV-11: the body is one token; capped while it streams in.
    const read = await readJsonCapped(request, 16_000);
    if (!read.ok && read.status === 413) return json({ error: "Request is too large." }, 413);
    const body: any = read.ok && read.body && typeof read.body === "object" ? read.body : {};
    const token = String(body.token || "").trim();

    if (!token) return json({ error: "Missing invite token." }, 400);

    const existingTeam = await getActiveTeamMembership(user.id);
    if (existingTeam) {
      return json(
        { error: "You're already on a team. Ask your current team owner to remove you before joining another." },
        409
      );
    }

    const inviteRes = await serviceFetch(
      `/rest/v1/business_invites?token=eq.${encodeURIComponent(token)}&select=*`
    );
    const invites = await inviteRes.json().catch(() => []);
    const invite = (invites as any[])[0];

    if (!invite) return json({ error: "This invite link is invalid." }, 404);
    if (invite.status !== "pending") return inactiveInviteResponse(invite.status);
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await serviceFetch(`/rest/v1/business_invites?id=eq.${invite.id}&status=eq.pending`, {
        method: "PATCH",
        body: JSON.stringify({ status: "expired" }),
      });
      return json({ error: EXPIRED_MESSAGE }, 410);
    }
    if (String(user.email || "").toLowerCase() !== String(invite.email || "").toLowerCase()) {
      return json({ error: "This invite was sent to a different email address. Sign in with that email to accept it." }, 403);
    }
    // SRV-AUTH-6: the address must be confirmed, so nobody holding a forwarded
    // link can sign up with the invitee's address and join in their name.
    // Google and Apple sign-ins are always confirmed.
    if (!user.email_confirmed_at && !user.confirmed_at) {
      return json({ error: "Please confirm your email address first, then open the invite link again." }, 403);
    }

    // PAY-12 / DB-5: the seat count is checked again here, so invites sent in a
    // burst cannot add more members than the team pays for (the owner counts).
    const [teamRes, activeRes] = await Promise.all([
      serviceFetch(`/rest/v1/business_accounts?id=eq.${encodeURIComponent(invite.business_account_id)}&select=seat_tier`),
      serviceFetch(`/rest/v1/business_members?business_account_id=eq.${encodeURIComponent(invite.business_account_id)}&status=eq.active&select=id`),
    ]);
    const teamRows = await teamRes.json().catch(() => null);
    const activeRows = await activeRes.json().catch(() => null);
    if (!teamRes.ok || !activeRes.ok || !Array.isArray(teamRows) || !Array.isArray(activeRows)) {
      throw Object.assign(new Error("Could not check the team's seats. Please try again in a moment."), { status: 503, expose: true });
    }
    const seatCap = ({ 5: 5, 10: 10, 20: 20 } as Record<number, number>)[Number(teamRows[0]?.seat_tier)] || 5;
    if (activeRows.length >= seatCap) {
      return json({ error: "This team is full. Ask the team owner to free a seat, then open the invite link again." }, 409);
    }

    // Claim the invite before creating the membership. The update only matches
    // while the invite is still pending and unexpired, so an owner cancelling
    // at the same moment either wins (and nobody joins) or loses cleanly.
    const claimRes = await serviceFetch(
      `/rest/v1/business_invites?id=eq.${invite.id}&status=eq.pending` +
      `&expires_at=gt.${new Date().toISOString()}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "accepted", accepted_at: new Date().toISOString() }),
      }
    );
    const claimed = await claimRes.json().catch(() => []);
    if (!claimRes.ok) {
      throw new Error((claimed as any)?.message || "Could not accept the invite.");
    }

    if (!Array.isArray(claimed) || !claimed.length) {
      const recheckRes = await serviceFetch(`/rest/v1/business_invites?id=eq.${invite.id}&select=status`);
      const recheck = await recheckRes.json().catch(() => []);
      const status = String((recheck as any[])[0]?.status || "");
      if (!status) return json({ error: "This invite link is invalid." }, 404);
      // Still pending here means it ran out between the two reads.
      return inactiveInviteResponse(status === "pending" ? "expired" : status);
    }

    try {
      // Someone the owner removed earlier still has their old row (one row per
      // person per team), so rejoining the same team reactivates that row.
      const rejoinRes = await serviceFetch(
        `/rest/v1/business_members?business_account_id=eq.${invite.business_account_id}` +
        `&user_id=eq.${user.id}&status=eq.removed`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            status: "active",
            role: "member",
            removed_at: null,
            joined_at: new Date().toISOString(),
          }),
        }
      );
      const rejoined = await rejoinRes.json().catch(() => []);
      if (!rejoinRes.ok) {
        throw new Error((rejoined as any)?.message || "Could not join the team.");
      }

      if (!Array.isArray(rejoined) || !rejoined.length) {
        const memberInsert = await serviceFetch("/rest/v1/business_members", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            business_account_id: invite.business_account_id,
            user_id: user.id,
            role: "member",
          }),
        });

        if (!memberInsert.ok) {
          const payload = await memberInsert.json().catch(() => ({}));
          throw new Error((payload as any)?.message || "Could not join the team.");
        }
      }
    } catch (insertError) {
      // Hand the invite back (also when the request itself failed) so the link
      // still works once the problem is fixed.
      await serviceFetch(`/rest/v1/business_invites?id=eq.${invite.id}&status=eq.accepted`, {
        method: "PATCH",
        body: JSON.stringify({ status: "pending", accepted_at: null }),
      }).catch(() => null);
      throw insertError;
    }

    return json({ ok: true });
  } catch (error: any) {
    reportError(error, { fn: "business-invite-accept", label: "Invite accept failed", status: error?.status });
    // SRV-AUTH-11 / SRV-14: our own 4xx texts are kept; database text is not shown.
    const failure = publicErrorBody(error, "Could not accept the invite. Please try again in a moment.");
    return json(failure.body, failure.status);
  }
});

export const config = { path: "/api/business-invite-accept" };
