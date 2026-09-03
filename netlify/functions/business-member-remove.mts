import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can remove teammates." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = String(body.userId || "").trim();

    if (!targetUserId) return json({ error: "Missing userId." }, 400);
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
    return json({ error: error.message || "Could not remove the teammate." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-member-remove" };
