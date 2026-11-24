import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";
import { smallJsonBody } from "../lib/abuse-guard.mjs";
import { reportError } from "../lib/report-error.mjs";
import { publicErrorBody } from "../lib/public-error.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";

export default webOnly(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can remove teammates." }, 403);
    }

    // SRV-11: a small JSON body, capped while it streams in.
    const body: any = await smallJsonBody(request, 16_000);
    if (body === null) return json({ error: "Request is too large." }, 413);
    const targetUserId = String(body.userId || "").trim();

    if (!targetUserId) return json({ error: "Missing userId." }, 400);
    // SRV-AUTH-18: an account id is a UUID (as business-invite-cancel checks).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
      return json({ error: "That person isn't an active member of your team." }, 404);
    }
    if (targetUserId === user.id) {
      return json({ error: "The owner can't remove themselves this way — cancel the subscription instead." }, 400);
    }

    const updateRes = await serviceFetch(
      `/rest/v1/business_members?business_account_id=eq.${team.businessAccountId}` +
      `&user_id=eq.${encodeURIComponent(targetUserId)}&status=eq.active`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "removed", removed_at: new Date().toISOString() }),
      }
    );

    const rows = await updateRes.json().catch(() => []);
    if (!updateRes.ok) {
      throw new Error((rows as any)?.message || "Could not remove the teammate.");
    }
    if (!Array.isArray(rows) || !rows.length) {
      return json({ error: "That person isn't an active member of your team." }, 404);
    }

    return json({ ok: true });
  } catch (error: any) {
    reportError(error, { fn: "business-member-remove", label: "Teammate removal failed", status: error?.status });
    // SRV-AUTH-11 / SRV-14: our own 4xx texts are kept; database text is not shown.
    const failure = publicErrorBody(error, "Could not remove the teammate. Please try again in a moment.");
    return json(failure.body, failure.status);
  }
});

export const config = { path: "/api/business-member-remove" };
