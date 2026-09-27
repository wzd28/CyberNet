import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can cancel invites." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const inviteId = String(body.inviteId || "").trim();

    if (!UUID_PATTERN.test(inviteId)) return json({ error: "A valid inviteId is required." }, 400);

    // One conditional update, so an invite that is accepted at the same moment
    // is never flipped to revoked behind the new member's back.
    const updateRes = await serviceFetch(
      `/rest/v1/business_invites?id=eq.${inviteId}` +
      `&business_account_id=eq.${team.businessAccountId}&status=eq.pending`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "revoked" }),
      }
    );

    const rows = await updateRes.json().catch(() => []);
    if (!updateRes.ok) {
      throw new Error((rows as any)?.message || "Could not cancel the invite.");
    }
    if (Array.isArray(rows) && rows.length) {
      return json({ ok: true });
    }

    const lookupRes = await serviceFetch(
      `/rest/v1/business_invites?id=eq.${inviteId}` +
      `&business_account_id=eq.${team.businessAccountId}&select=status`
    );
    const found = await lookupRes.json().catch(() => []);
    if (!lookupRes.ok) {
      throw new Error((found as any)?.message || "Could not cancel the invite.");
    }

    const invite = Array.isArray(found) ? found[0] : null;
    if (!invite) return json({ error: "That invite no longer exists." }, 404);
    if (invite.status === "accepted") {
      return json({ error: "They've already accepted this invite. Remove them from the team instead." }, 409);
    }

    // Already revoked or expired: the owner's intent is already true.
    return json({ ok: true, alreadyInactive: true });
  } catch (error: any) {
    return json({ error: error.message || "Could not cancel the invite." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-invite-cancel" };
