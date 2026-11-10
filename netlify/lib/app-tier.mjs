// What a signed-in account gets in the iPhone app (BUILD-PLAN §8.2; owner
// answers 6 and 18, 29 Oct 2026; owner decision 10 Nov 2026).
//
// Two rules, chosen per request by a header the app sends (./cors.mjs):
//
// 1. Without `X-CyberNet-Plans: 1` (app build 5 and earlier): the fixed App
//    tier below for every account, whatever profiles.plan says, whether the
//    account belongs to a Business team, and whether it is an admin. This is
//    the behaviour Apple reviewed; it must not change for those builds.
//
// 2. With `X-CyberNet-Plans: 1` (honoursWebPlans; build 6 on): the account's
//    WEBSITE plan applies in the app, as on the website (appLimitsFor below).
//    Precedence as on the web: an active Business team (owner or member) uses
//    the team's shared pools and the *_business functions; otherwise an active
//    Pro plan uses Pro's numbers (./plans.mjs) through the *_app functions;
//    otherwise the App tier (= the website's Free numbers). Plans are bought
//    only on the website; the app sells nothing and its answers never carry
//    prices, upgrade prompts or billing data, and the reservation's plan field
//    stays "app".
//
// In both rules the counts are constants in code (./plans.mjs) or the team's
// own pool row, never environment variables, so the app's behaviour cannot be
// switched remotely (2.5.19). The only environment input is the disclosed
// allowance below for the App Review demo account and the admins, which only
// raises counts (and wins where it is higher than the plan's).
//
// Environment (set by the owner in Netlify; names only, never values here):
//   REVIEW_ACCOUNT_EMAILS  comma-separated; the App Review demo account(s).
//                          Disclosed in the App Review notes.
//   ADMIN_EMAILS           the existing admin list; in the app it only raises
//                          the counts like the review account (no admin bypass).
//
// The counters are the same rows the website uses (daily_usage and
// recovery_usage; business_daily_usage and business_recovery_usage for a
// team), so one account has one daily total across web and app. The SQL
// functions *_app (supabase/migrations/20261029120000_ios_app_1_0.sql) take
// the limit from here and always report plan "app".

import { serviceFetch as defaultServiceFetch, effectivePlan } from "./supabase.mjs";
import { PLAN_LIMITS } from "./plans.mjs";

// The App tier is the website's Free plan.
export const APP_TIER = Object.freeze({
  analysesPerDay: PLAN_LIMITS.free.analysesPerDay,
  recoveryCasesPerDay: PLAN_LIMITS.free.recoveryCasesPerDay,
  recoveryUpdatesPerDay: PLAN_LIMITS.free.recoveryUpdatesPerDay,
  recoveryUpdateCooldownSeconds: PLAN_LIMITS.free.recoveryUpdateCooldownSeconds
});

export const APP_TIER_ALLOWANCE = Object.freeze({
  analysesPerDay: 50,
  recoveryCasesPerDay: 10,
  recoveryUpdatesPerDay: 10,
  recoveryUpdateCooldownSeconds: 0
});

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "");
  } catch {
    try { return String(process.env[name] || ""); } catch { return ""; }
  }
}

function listed(user, name) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return false;
  return env(name).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).includes(email);
}

// The raised counts need a confirmed email, so nobody can claim the review
// address by signing up with it before the owner does. The user object is the
// one Supabase's /auth/v1/user returned for the caller's own token.
export function appTierFor(user) {
  const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  if (confirmed && (listed(user, "REVIEW_ACCOUNT_EMAILS") || listed(user, "ADMIN_EMAILS"))) return APP_TIER_ALLOWANCE;
  return APP_TIER;
}

// ── Reset times ──
// AI explanations: daily_usage is keyed on the UTC date, so they reset at
// 00:00 UTC (4:00 AM Gulf time; the UAE has no daylight saving).
// Recovery: the window switches at 12:00 PM Asia/Dubai, which is 08:00 UTC.
// Note: recovery_window_start() in supabase/schema.sql switches at that
// moment, but the timestamp it returns (the recovery_usage key, and reset_at
// from the consume_recovery_* functions) is labelled 16:00 UTC because of a
// double time-zone conversion, so the SQL reset_at reads 8 hours late. The
// app is given the real time computed here; the window key is always read
// from the database (account-status calls the RPC), never computed here.
export function nextUtcMidnight(now = new Date()) {
  const next = new Date(now.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString();
}

export function recoveryWindowStart(now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0, 0);
  return new Date(now.getTime() >= start ? start : start - 86_400_000).toISOString();
}

export function recoveryNextReset(now = new Date()) {
  return new Date(Date.parse(recoveryWindowStart(now)) + 86_400_000).toISOString();
}

// ── Messages: never a plan name, never a purchase prompt ──
export const APP_MESSAGES = Object.freeze({
  aiLimit: "You've used today's AI explanations. They reset at 00:00 UTC (4:00 AM Gulf time).",
  recoveryCaseLimit: "You've started today's Recovery case. You can start another after 12:00 PM Gulf time.",
  recoveryCasesLimit: "You've used today's Recovery cases. You can start another after 12:00 PM Gulf time.",
  recoveryUpdateLimit: "You've used today's Recovery updates. They reset at 12:00 PM Gulf time.",
  investigationNotInApp: "This kind of analysis isn't available in the app."
});

export function recoveryCaseLimitMessage(limit) {
  return Number(limit) === 1 ? APP_MESSAGES.recoveryCaseLimit : APP_MESSAGES.recoveryCasesLimit;
}

export function recoveryCooldownMessage(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s >= 5400) return `You can send your next Recovery update in about ${Math.round(s / 3600)} hours.`;
  if (s >= 3600) return "You can send your next Recovery update in about an hour.";
  const minutes = Math.max(1, Math.ceil(s / 60));
  return `You can send your next Recovery update in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

// ── Reservations (service-role RPCs) ──
// `serviceFetch` is the calling function's own serviceFetch (path, init), so
// each function keeps its timeouts and PGRST303 retry policy; by default it is
// the one in lib/supabase.mjs.
async function rpc(serviceFetch = defaultServiceFetch, name, args, failure) {
  const response = await serviceFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(args)
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(payload?.message || failure);
  return Array.isArray(payload) ? payload[0] : payload;
}

export async function consumeAnalysisApp(serviceFetch, userId, limit) {
  const row = await rpc(serviceFetch, "consume_analysis_app", { p_user_id: userId, p_limit: limit }, "Could not reserve an analysis request.");
  const daily = Number(row?.daily_limit);
  const max = Number.isFinite(daily) ? daily : Number(limit) || 0;
  const used = Number(row?.used) || 0;
  return { allowed: Boolean(row?.allowed), used, limit: max, remaining: Math.max(0, max - used), plan: "app", resetDate: nextUtcMidnight() };
}

export async function consumeRecoveryCaseApp(serviceFetch, userId, limit) {
  const row = await rpc(serviceFetch, "consume_recovery_case_app", { p_user_id: userId, p_limit: limit }, "Could not reserve a Recovery case.");
  const daily = Number(row?.daily_limit);
  return {
    allowed: Boolean(row?.allowed),
    used: Number(row?.used) || 0,
    limit: Number.isFinite(daily) ? daily : Number(limit) || 0,
    plan: "app",
    resetAt: recoveryNextReset()
  };
}

export async function consumeRecoveryUpdateApp(serviceFetch, userId, limit, cooldownSeconds) {
  const row = await rpc(serviceFetch, "consume_recovery_update_app", { p_user_id: userId, p_limit: limit, p_cooldown_seconds: cooldownSeconds }, "Could not reserve a Recovery update.");
  const daily = Number(row?.daily_limit);
  return {
    allowed: Boolean(row?.allowed),
    used: Number(row?.used) || 0,
    limit: Number.isFinite(daily) ? daily : Number(limit) || 0,
    plan: "app",
    resetAt: recoveryNextReset(),
    cooldownSecondsRemaining: Number(row?.cooldown_seconds_remaining) || 0
  };
}

// ── The website plan in the app (requests with X-CyberNet-Plans: 1) ──
//
// appLimitsFor(user, { plan, team }) decides, for each counter, which counter
// is charged and with what limit:
//   plan  the account's own website plan, effectivePlan(profile):
//         "free" | "pro" | "business" (the old single-seat profile plan)
//   team  the active Business team membership or null. Pools come from the
//         team row (dailyPoolLimit, recoveryPoolLimit); a lookup that only
//         knows "on a team" may pass true (Recovery updates need nothing more).
// Returns
//   { appPlan: "free" | "pro" | "business",
//     analyses:        { pool: "team" | "own", limit },
//     recoveryCases:   { pool: "team" | "own", limit },
//     recoveryUpdates: { pool: "team" | "own", limit, cooldownSeconds } }
// "team" means the *_business SQL functions (the website's own team path);
// "own" means the *_app functions with the limit given here. The review/admin
// allowance replaces a counter's rule wherever it is more generous.
export function appLimitsFor(user, { plan = "free", team = null } = {}) {
  const allowance = appTierFor(user) === APP_TIER_ALLOWANCE ? APP_TIER_ALLOWANCE : null;
  let appPlan;
  let analyses;
  let recoveryCases;
  let recoveryUpdates;
  if (team) {
    appPlan = "business";
    analyses = { pool: "team", limit: Number(team.dailyPoolLimit) || 0 };
    recoveryCases = { pool: "team", limit: Number(team.recoveryPoolLimit) || 0 };
    recoveryUpdates = { pool: "team", limit: PLAN_LIMITS.businessTeam.recoveryUpdatesPerDay, cooldownSeconds: PLAN_LIMITS.businessTeam.recoveryUpdateCooldownSeconds };
  } else {
    const limits = plan === "pro" ? PLAN_LIMITS.pro : plan === "business" ? PLAN_LIMITS.businessProfile : APP_TIER;
    appPlan = plan === "pro" || plan === "business" ? plan : "free";
    analyses = { pool: "own", limit: limits.analysesPerDay };
    recoveryCases = { pool: "own", limit: limits.recoveryCasesPerDay };
    recoveryUpdates = { pool: "own", limit: limits.recoveryUpdatesPerDay, cooldownSeconds: limits.recoveryUpdateCooldownSeconds };
  }
  if (allowance) {
    if (allowance.analysesPerDay > analyses.limit) analyses = { pool: "own", limit: allowance.analysesPerDay };
    if (allowance.recoveryCasesPerDay > recoveryCases.limit) recoveryCases = { pool: "own", limit: allowance.recoveryCasesPerDay };
    if (allowance.recoveryUpdatesPerDay > recoveryUpdates.limit || allowance.recoveryUpdateCooldownSeconds < recoveryUpdates.cooldownSeconds) {
      recoveryUpdates = {
        pool: "own",
        limit: Math.max(allowance.recoveryUpdatesPerDay, recoveryUpdates.limit),
        cooldownSeconds: Math.min(allowance.recoveryUpdateCooldownSeconds, recoveryUpdates.cooldownSeconds)
      };
    }
  }
  return { appPlan, analyses, recoveryCases, recoveryUpdates };
}

// The account's own website plan, read with the calling function's
// serviceFetch (the .mts functions keep their own timeouts and retries).
export async function loadWebPlan(serviceFetch = defaultServiceFetch, userId) {
  const response = await serviceFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=plan,subscription_status`);
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(rows?.message || "Could not load the account's plan.");
  return effectivePlan((Array.isArray(rows) ? rows[0] : null) || {});
}

// Reservations by rule. They always report plan "app" and the real reset
// times, so no plan word and no 8-hours-late SQL reset reaches the app.
export async function reserveAnalysisForApp(serviceFetch, userId, rule, team) {
  if (rule.pool !== "team") return consumeAnalysisApp(serviceFetch, userId, rule.limit);
  const row = await rpc(serviceFetch, "consume_analysis_business", { p_business_account_id: team.businessAccountId }, "Could not reserve an analysis request.");
  const daily = Number(row?.daily_limit);
  const max = Number.isFinite(daily) ? daily : Number(rule.limit) || 0;
  const used = Number(row?.used) || 0;
  return { allowed: Boolean(row?.allowed), used, limit: max, remaining: Math.max(0, max - used), plan: "app", resetDate: nextUtcMidnight() };
}

// A refund goes back to the counter that was charged. Never throws.
export async function refundAnalysisForApp(serviceFetch, userId, rule, team) {
  const [name, args] = rule.pool === "team"
    ? ["refund_analysis_business", { p_business_account_id: team.businessAccountId }]
    : ["refund_analysis", { p_user_id: userId }];
  await serviceFetch(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) }).catch(() => undefined);
}

export async function reserveRecoveryCaseForApp(serviceFetch, userId, rule, team) {
  if (rule.pool !== "team") return consumeRecoveryCaseApp(serviceFetch, userId, rule.limit);
  const row = await rpc(serviceFetch, "consume_recovery_case_business", { p_business_account_id: team.businessAccountId }, "Could not reserve a Recovery case.");
  const daily = Number(row?.daily_limit);
  return {
    allowed: Boolean(row?.allowed),
    used: Number(row?.used) || 0,
    limit: Number.isFinite(daily) ? daily : Number(rule.limit) || 0,
    plan: "app",
    resetAt: recoveryNextReset()
  };
}

export async function reserveRecoveryUpdateForApp(serviceFetch, userId, rule) {
  if (rule.pool !== "team") return consumeRecoveryUpdateApp(serviceFetch, userId, rule.limit, rule.cooldownSeconds);
  const row = await rpc(serviceFetch, "consume_recovery_update_business", { p_user_id: userId }, "Could not reserve a Recovery update.");
  const daily = Number(row?.daily_limit);
  return {
    allowed: Boolean(row?.allowed),
    used: Number(row?.used) || 0,
    limit: Number.isFinite(daily) ? daily : Number(rule.limit) || 0,
    plan: "app",
    resetAt: recoveryNextReset(),
    cooldownSecondsRemaining: Number(row?.cooldown_seconds_remaining) || 0
  };
}
