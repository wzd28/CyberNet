// The disclosed allowance for the App Review demo account and the admins in
// the iPhone app.
//
// Since 30 Oct 2026 the app has the website's Free / Pro / Business plans, sold
// with Apple In-App Purchase, and every account gets what its plan gives (see
// netlify/lib/plans.mjs and netlify/lib/entitlements.mjs). The earlier "App
// tier" (the same Free-sized counts for everyone, plan name "app") is gone.
//
// What remains is one exception, disclosed in the App Review notes: the review
// demo account (REVIEW_ACCOUNT_EMAILS) and the admins (ADMIN_EMAILS) get raised
// daily counts so a reviewer can exercise the app without running out. They
// stay a Free plan (the reviewer can still buy a plan with a sandbox Apple ID),
// and an admin gets no admin bypass in the app, only these counts. The counts
// are constants in code, not environment variables, so behaviour cannot be
// switched remotely (2.5.19).
//
// Environment (set by the owner in Netlify; names only, never values here):
//   REVIEW_ACCOUNT_EMAILS  comma-separated; the App Review demo account(s).
//   ADMIN_EMAILS           the existing admin list; in the app it only raises
//                          the counts like the review account.
//
// The counters are the same rows the website uses (daily_usage and
// recovery_usage), so one account has one daily total across web and app.
// The SQL functions *_app (supabase/migrations/20261029120000_ios_app_1_0.sql)
// take the limit from here and report plan "app".

import { serviceFetch as defaultServiceFetch } from "./supabase.mjs";

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
// Returns the allowance for a listed account, or null for everybody else
// (whose counts come from their plan).
export function appAllowanceFor(user) {
  const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  if (confirmed && (listed(user, "REVIEW_ACCOUNT_EMAILS") || listed(user, "ADMIN_EMAILS"))) return APP_TIER_ALLOWANCE;
  return null;
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

// ── Messages for the allowance accounts (everybody else gets the website's
// "Daily Free limit reached." style messages, so the app can offer a plan) ──
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

// ── Reservations for the allowance accounts (service-role RPCs) ──
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
