import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

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
    if (invite.status !== "pending") {
      return json({ error: "This invite has already been used or revoked." }, 410);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await serviceFetch(`/rest/v1/business_invites?id=eq.${invite.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "expired" }),
      });
      return json({ error: "This invite has expired. Ask the team owner to send a new one." }, 410);
    }
    if (String(user.email || "").toLowerCase() !== String(invite.email || "").toLowerCase()) {
      return json({ error: "This invite was sent to a different email address. Sign in with that email to accept it." }, 403);
    }

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

    await serviceFetch(`/rest/v1/business_invites?id=eq.${invite.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted", accepted_at: new Date().toISOString() }),
    });

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: error.message || "Could not accept the invite." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-invite-accept" };
