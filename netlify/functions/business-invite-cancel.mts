import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";
import { smallJsonBody } from "../lib/abuse-guard.mjs";
import { reportError } from "../lib/report-error.mjs";
import { publicErrorBody } from "../lib/public-error.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default webOnly(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can cancel invites." }, 403);
    }

    // SRV-11: a small JSON body, capped while it streams in.
    const body: any = await smallJsonBody(request, 16_000);
    if (body === null) return json({ error: "Request is too large." }, 413);
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
    reportError(error, { fn: "business-invite-cancel", label: "Invite cancel failed", status: error?.status });
    // SRV-AUTH-11 / SRV-14: our own 4xx texts are kept; database text is not shown.
    const failure = publicErrorBody(error, "Could not cancel the invite. Please try again in a moment.");
    return json(failure.body, failure.status);
  }
});

export const config = { path: "/api/business-invite-cancel" };
