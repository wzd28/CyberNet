import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

export default async (request: Request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team) {
      return json({ onTeam: false });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [membersRes, usageRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/business_members?business_account_id=eq.${team.businessAccountId}` +
        "&status=eq.active&select=user_id,role,joined_at"
      ),
      serviceFetch(
        `/rest/v1/business_daily_usage?business_account_id=eq.${team.businessAccountId}` +
        `&usage_date=eq.${today}&select=analysis_count`
      ),
    ]);

    const members = await membersRes.json().catch(() => []);
    const usageRows = await usageRes.json().catch(() => []);
    const poolUsedToday = Number(usageRows[0]?.analysis_count) || 0;

    const pendingInvitesRes = await serviceFetch(
      `/rest/v1/business_invites?business_account_id=eq.${team.businessAccountId}` +
      "&status=eq.pending&select=id,email,created_at,expires_at"
    );
    const pendingInvites = await pendingInvitesRes.json().catch(() => []);

    // Per-member usage-today rollup: scan_history + recovery_cases rows
    // created today, tagged with this business_account_id, grouped by who
    // did them.
    const startOfDayUtc = `${today}T00:00:00Z`;
    const [scanRes, recoveryRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/scan_history?business_account_id=eq.${team.businessAccountId}` +
        `&created_at=gte.${startOfDayUtc}&select=user_id`
      ),
      serviceFetch(
        `/rest/v1/recovery_cases?business_account_id=eq.${team.businessAccountId}` +
        `&created_at=gte.${startOfDayUtc}&select=owner_user_id`
      ),
    ]);
    const scanRows = await scanRes.json().catch(() => []);
    const recoveryRows = await recoveryRes.json().catch(() => []);

    const perMemberToday: Record<string, number> = {};
    for (const row of scanRows as any[]) {
      perMemberToday[row.user_id] = (perMemberToday[row.user_id] || 0) + 1;
    }
    for (const row of recoveryRows as any[]) {
      perMemberToday[row.owner_user_id] = (perMemberToday[row.owner_user_id] || 0) + 1;
    }

    // Resolve member emails/names via the Supabase Auth admin endpoint
    // (service role only — never exposed to the browser directly).
    const memberDetails = await Promise.all(
      (members as any[]).map(async (m) => {
        const userRes = await serviceFetch(`/auth/v1/admin/users/${m.user_id}`);
        const userData = await userRes.json().catch(() => ({}));
        return {
          userId: m.user_id,
          role: m.role,
          joinedAt: m.joined_at,
          email: userData?.email || "",
          fullName: userData?.user_metadata?.full_name || "",
          usageToday: perMemberToday[m.user_id] || 0,
        };
      })
    );

    const seatCap = { 5: 5, 10: 10, 20: 20 }[team.seatTier as 5 | 10 | 20] || 5;

    return json({
      onTeam: true,
      role: team.role,
      seatTier: team.seatTier,
      seatCap,
      seatsUsed: memberDetails.length + (pendingInvites as any[]).length,
      dailyPoolLimit: team.dailyPoolLimit,
      poolUsedToday,
      recoveryPoolLimit: team.recoveryPoolLimit,
      members: memberDetails,
      pendingInvites: (pendingInvites as any[]).map((i) => ({
        email: i.email,
        invitedAt: i.created_at,
        expiresAt: i.expires_at,
      })),
    });
  } catch (error: any) {
    return json({ error: error.message || "Could not load team info." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-account" };
