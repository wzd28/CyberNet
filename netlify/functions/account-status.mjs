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
import { appAllowanceFor, nextUtcMidnight, recoveryNextReset } from "../lib/app-tier.mjs";
import { hasAiConsent, AI_CONSENT_VERSION } from "../lib/ai-consent.mjs";
import { describeBilling, legacyBillingFields } from "../lib/entitlements.mjs";
import { limitsFor } from "../lib/plans.mjs";

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

// The iPhone app's extra blocks: the AI-consent state and the Recovery counters.
// The Recovery counter's key comes from the database's own window function,
// exactly as the consume_recovery_* functions use it. Limits come from the
// plan (netlify/lib/plans.mjs; the database is what actually enforces them),
// or from the disclosed allowance of the review / admin accounts.
async function iosExtras(user, plan, team, allowance) {
  const windowStart = await serviceFetch("/rest/v1/rpc/recovery_window_start", { method: "POST", body: "{}" })
    .then(async (response) => (response.ok ? response.json() : null))
    .catch(() => null);
  const hasWindow = typeof windowStart === "string" && Boolean(windowStart);
  const pooled = Boolean(team) && !allowance;

  const [userRows, teamRows, consent] = await Promise.all([
    hasWindow
      ? serviceFetch(
        `/rest/v1/recovery_usage?user_id=eq.${encodeURIComponent(user.id)}&window_start=eq.${encodeURIComponent(windowStart)}&select=cases_created,updates_used,last_update_at`
      ).then(async (response) => (response.ok ? response.json().catch(() => []) : [])).catch(() => [])
      : [],
    // A team's Recovery cases come from the team's shared pool.
    hasWindow && pooled
      ? serviceFetch(
        `/rest/v1/business_recovery_usage?business_account_id=eq.${encodeURIComponent(team.businessAccountId)}&window_start=eq.${encodeURIComponent(windowStart)}&select=cases_created`
      ).then(async (response) => (response.ok ? response.json().catch(() => []) : [])).catch(() => [])
      : [],
    hasAiConsent(serviceFetch, user.id, "ios").catch(() => null)
  ]);

  const mine = Array.isArray(userRows) ? userRows[0] || {} : {};
  const pool = Array.isArray(teamRows) ? teamRows[0] || {} : {};
  const limits = allowance || limitsFor(plan, team);
  const lastUpdate = Date.parse(mine.last_update_at || "");
  const cooldownEnds = Number.isFinite(lastUpdate) ? lastUpdate + limits.recoveryUpdateCooldownSeconds * 1000 : 0;

  return {
    recoveryUsage: {
      casesUsed: Number(pooled ? pool.cases_created : mine.cases_created) || 0,
      casesLimit: limits.recoveryCasesPerDay,
      updatesUsed: Number(mine.updates_used) || 0,
      updatesLimit: limits.recoveryUpdatesPerDay,
      updateCooldownSecondsRemaining: Math.max(0, Math.ceil((cooldownEnds - Date.now()) / 1000)),
      resetAt: recoveryNextReset()
    },
    aiConsent: { granted: consent === true, known: consent !== null, version: AI_CONSENT_VERSION }
  };
}

async function handler(request) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const { user } = await verifyUser(request);
    const profile = await getProfile(user);
    const ios = isIOS(request);
    // The admin bypass is the website's. In the app an admin only gets the
    // review accounts' raised counts (netlify/lib/app-tier.mjs).
    const isAdmin = !ios && isAdminUser(user);
    const allowance = ios ? appAllowanceFor(user) : null;
    const team = isAdmin ? null : await getActiveTeamMembership(user.id);

    const plan = isAdmin ? "business" : team ? "business" : effectivePlan(profile);
    let usage;
    if (isAdmin) {
      usage = { used: 0, limit: 999999, remaining: 999999, resetDate: null };
    } else if (allowance) {
      const own = await getUsage(user.id, profile);
      usage = {
        used: own.used,
        limit: allowance.analysesPerDay,
        remaining: Math.max(0, allowance.analysesPerDay - own.used),
        resetDate: nextUtcMidnight()
      };
    } else if (team) {
      usage = await getTeamUsage(team.businessAccountId, team.dailyPoolLimit);
    } else {
      usage = await getUsage(user.id, profile);
    }

    const includeHistory =
      new URL(request.url).searchParams.get("includeHistory") === "1";

    const history =
      includeHistory && (plan === "pro" || plan === "business" || isAdmin)
        ? await getHistory(user.id, 8)
        : [];

    const billing = describeBilling({ profile, team, appleRows: profile.apple });
    const legacy = legacyBillingFields(profile, billing);

    const body = {
      isAdmin,
      profile: {
        fullName:
          profile.full_name ||
          user.user_metadata?.full_name ||
          "",
        plan: isAdmin ? "business" : plan,
        subscriptionStatus: legacy.subscriptionStatus,
        billingInterval: legacy.billingInterval,
        // On the iPhone the flag drives the notice "your team owner sees your
        // AI results", which only members get; the website has always used it
        // for any team membership.
        isTeamMember: ios ? Boolean(team && team.role !== "owner") : Boolean(team),
        teamRole: team?.role || null,
        // Who pays and when it renews (netlify/lib/entitlements.mjs).
        billing: { ...billing, plan: isAdmin ? "business" : billing.plan }
      },
      usage,
      history
    };

    if (ios) {
      return json({ ...body, platform: "ios", ...(await iosExtras(user, plan, team, allowance)) });
    }
    return json(body);
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
