import {
  json,
  verifyUser,
  getProfile,
  getUsage,
  effectivePlan,
  getHistory,
  isAdminUser,
  getActiveTeamMembership,
  serviceFetch
} from "../lib/supabase.mjs";

async function getTeamUsage(businessAccountId, dailyPoolLimit) {
  const today = new Date().toISOString().slice(0, 10);
  const response = await serviceFetch(
    `/rest/v1/business_daily_usage?business_account_id=eq.${businessAccountId}` +
    `&usage_date=eq.${today}&select=analysis_count`
  );
  const rows = await response.json().catch(() => []);
  const used = Number(rows[0]?.analysis_count) || 0;

  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);

  return {
    used,
    limit: dailyPoolLimit,
    remaining: Math.max(0, dailyPoolLimit - used),
    resetDate: next.toISOString()
  };
}

export default async (request) => {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const { user } = await verifyUser(request);
    const profile = await getProfile(user);
    const isAdmin = isAdminUser(user);
    const team = isAdmin ? null : await getActiveTeamMembership(user.id);

    const plan = isAdmin ? "business" : team ? "business" : effectivePlan(profile);
    const usage = isAdmin
      ? { used: 0, limit: 999999, remaining: 999999, resetDate: null }
      : team
        ? await getTeamUsage(team.businessAccountId, team.dailyPoolLimit)
        : await getUsage(user.id, profile);

    const includeHistory =
      new URL(request.url).searchParams.get("includeHistory") === "1";

    const history =
      includeHistory && (plan === "pro" || plan === "business" || isAdmin)
        ? await getHistory(user.id, 8)
        : [];

    return json({
      isAdmin,
      profile: {
        fullName:
          profile.full_name ||
          user.user_metadata?.full_name ||
          "",
        plan: isAdmin ? "business" : plan,
        subscriptionStatus:
          profile.subscription_status || "inactive",
        billingInterval:
          profile.billing_interval || "",
        isTeamMember: Boolean(team),
        teamRole: team?.role || null
      },
      usage,
      history
    });
  } catch (error) {
    return json(
      { error: error.message || "Account status failed." },
      Number(error.status) || 500
    );
  }
};

export const config = {
  path: "/api/account-status"
};
