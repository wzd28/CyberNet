// What each plan gives, for DISPLAY (account-status usage and recoveryUsage).
// The database functions are the enforcement authority (consume_analysis,
// consume_quickscan, consume_recovery_case, consume_recovery_update and the
// *_business versions); tests/run-apple-iap.mjs checks that these numbers equal
// what those functions enforce, for Free, Pro bought on the website and Pro
// bought in the app. Nothing in the app or on the website may be unlocked by
// this table: it only says what the server already does.
//
// Reset times: AI analyses and Quick Scans at 00:00 UTC; Recovery at 12:00 PM
// Gulf time (08:00 UTC).

import { SEAT_POOL_LIMITS } from "./business-seats.mjs";

// "No fixed cap" in the database is 999 updates and 100000 Quick Scans.
export const UNLIMITED_QUICK_SCANS = 100000;
export const UNCAPPED_UPDATES = 999;

export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    analysesPerDay: 3,
    quickScansPerDay: 5,
    recoveryCasesPerDay: 1,
    recoveryUpdatesPerDay: 1,
    recoveryUpdateCooldownSeconds: 6 * 3600
  }),
  pro: Object.freeze({
    analysesPerDay: 15,
    quickScansPerDay: UNLIMITED_QUICK_SCANS,
    recoveryCasesPerDay: 3,
    recoveryUpdatesPerDay: UNCAPPED_UPDATES,
    recoveryUpdateCooldownSeconds: 2 * 3600
  }),
  // A Business team shares pools (SEAT_POOL_LIMITS); updates are per person.
  business: Object.freeze({
    analysesPerDay: SEAT_POOL_LIMITS[5].dailyPoolLimit,
    quickScansPerDay: UNLIMITED_QUICK_SCANS,
    recoveryCasesPerDay: SEAT_POOL_LIMITS[5].recoveryPoolLimit,
    recoveryUpdatesPerDay: UNCAPPED_UPDATES,
    recoveryUpdateCooldownSeconds: 3600
  })
});

export function limitsFor(plan, team = null) {
  const base = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  if (plan !== "business" || !team) return base;
  return {
    ...base,
    analysesPerDay: Number(team.dailyPoolLimit) || base.analysesPerDay,
    recoveryCasesPerDay: Number(team.recoveryPoolLimit) || base.recoveryCasesPerDay
  };
}
