import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

const EXPIRED_MESSAGE = "This invite has expired. Ask the team owner to send a new one.";

// Why an invite that isn't pending can't be accepted, in the invitee's terms.
function inactiveInviteResponse(status: string) {
  if (status === "revoked") return json({ error: "This invite was cancelled by the team owner." }, 410);
  if (status === "expired") return json({ error: EXPIRED_MESSAGE }, 410);
  return json({ error: "This invite has already been used." }, 410);
}

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const body = await request.json().catch(() => ({}));
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
    return json({ error: error.message || "Could not accept the invite." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-invite-accept" };
