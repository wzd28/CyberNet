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
import { reportError } from "../lib/report-error.mjs";
import { withCors, isIOS } from "../lib/cors.mjs";
import { appTierFor, nextUtcMidnight, recoveryNextReset } from "../lib/app-tier.mjs";
import { hasAiConsent, AI_CONSENT_VERSION } from "../lib/ai-consent.mjs";

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

// The iPhone app (BUILD-PLAN §8.2): the App tier for every account. No plan
// name, billing state or admin flag reaches the app; team membership is only
// returned so the app can say that a team owner sees the member's AI results
// (owner answer 8). History is returned for every account (App tier).
async function appStatus(request, user, profile) {
  const tier = appTierFor(user);
  const today = new Date().toISOString().slice(0, 10);
  const [analysisRows, recoveryRows, team, consent] = await Promise.all([
    serviceFetch(
      `/rest/v1/daily_usage?user_id=eq.${encodeURIComponent(user.id)}&usage_date=eq.${today}&select=analysis_count`
    ).then(async (response) => {
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(rows?.message || "Could not load daily usage.");
      return rows;
    }),
    // The Recovery counter's key comes from the database's own window function,
    // exactly as the consume_recovery_*_app functions use it.
    serviceFetch("/rest/v1/rpc/recovery_window_start", { method: "POST", body: "{}" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((windowStart) => (typeof windowStart === "string" && windowStart
        ? serviceFetch(
          `/rest/v1/recovery_usage?user_id=eq.${encodeURIComponent(user.id)}&window_start=eq.${encodeURIComponent(windowStart)}&select=cases_created,updates_used,last_update_at`
        ).then(async (response) => (response.ok ? response.json().catch(() => []) : []))
        : []))
      .catch(() => []),
    getActiveTeamMembership(user.id).catch(() => null),
    hasAiConsent(serviceFetch, user.id, "ios").catch(() => null)
  ]);

  const used = Number(analysisRows?.[0]?.analysis_count) || 0;
  const recovery = Array.isArray(recoveryRows) ? recoveryRows[0] || {} : {};
  const lastUpdate = Date.parse(recovery.last_update_at || "");
  const cooldownEnds = Number.isFinite(lastUpdate) ? lastUpdate + tier.recoveryUpdateCooldownSeconds * 1000 : 0;

  const includeHistory = new URL(request.url).searchParams.get("includeHistory") === "1";
  const history = includeHistory ? await getHistory(user.id, 8) : [];

  return json({
    isAdmin: false,
    platform: "ios",
    profile: {
      fullName: profile.full_name || user.user_metadata?.full_name || "",
      plan: "app",
      isTeamMember: Boolean(team && team.role !== "owner"),
      teamRole: team?.role || null
    },
    usage: {
      used,
      limit: tier.analysesPerDay,
      remaining: Math.max(0, tier.analysesPerDay - used),
      resetDate: nextUtcMidnight()
    },
    recoveryUsage: {
      casesUsed: Number(recovery.cases_created) || 0,
      casesLimit: tier.recoveryCasesPerDay,
      updatesUsed: Number(recovery.updates_used) || 0,
      updatesLimit: tier.recoveryUpdatesPerDay,
      updateCooldownSecondsRemaining: Math.max(0, Math.ceil((cooldownEnds - Date.now()) / 1000)),
      resetAt: recoveryNextReset()
    },
    aiConsent: { granted: consent === true, known: consent !== null, version: AI_CONSENT_VERSION },
    history
  });
}

async function handler(request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const { user } = await verifyUser(request);
    const profile = await getProfile(user);
    if (isIOS(request)) return await appStatus(request, user, profile);
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
    // Expected answers (401 signed out) carry a 4xx status and are skipped.
    reportError(error, { fn: "account-status", label: "Account status failed", status: error?.status });
    return json(
      { error: error.message || "Account status failed." },
      Number(error.status) || 500
    );
  }
}

export default withCors(handler);

export const config = {
  path: "/api/account-status"
};
