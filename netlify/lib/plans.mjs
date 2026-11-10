// The website's plan numbers, in one place, for the JavaScript that needs them.
//
// The database enforces the personal limits (supabase/schema.sql:
// consume_analysis, consume_recovery_case, consume_recovery_update) and the
// Business team pools (business_accounts.daily_pool_limit and
// recovery_pool_limit, written by the Stripe webhook from SEAT_POOL_LIMITS
// below). This file repeats those numbers so that:
//   * the website's own code (lib/supabase.mjs dailyLimit, the webhook's seat
//     pools) and
//   * the iPhone app path (lib/app-tier.mjs, for requests that send
//     `X-CyberNet-Plans: 1`)
// read the same values and cannot drift apart. tests/run-ios-server.mjs
// checks every number here against supabase/schema.sql.
//
// Business team pools are not here per plan: they belong to the team row
// (business_accounts), so the code always reads them from there.

export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    analysesPerDay: 3,
    recoveryCasesPerDay: 1,
    recoveryUpdatesPerDay: 1,
    recoveryUpdateCooldownSeconds: 6 * 3600
  }),
  pro: Object.freeze({
    analysesPerDay: 15,
    recoveryCasesPerDay: 3,
    recoveryUpdatesPerDay: 999, // "unlimited" in the SQL
    recoveryUpdateCooldownSeconds: 2 * 3600
  }),
  // A Business team member or owner: analyses and Recovery cases come from the
  // team's shared pools; Recovery updates stay per person
  // (consume_recovery_update_business: 999 with a 1 hour wait).
  businessTeam: Object.freeze({
    recoveryUpdatesPerDay: 999,
    recoveryUpdateCooldownSeconds: 3600
  }),
  // "business" on a personal profile (a single-seat plan the webhook no
  // longer creates; still handled by the SQL, so mirrored here).
  businessProfile: Object.freeze({
    analysesPerDay: 50,
    recoveryCasesPerDay: 20,
    recoveryUpdatesPerDay: 999,
    recoveryUpdateCooldownSeconds: 3600
  })
});

// Seats -> the team's shared daily pools (copied onto business_accounts by
// netlify/functions/stripe-webhook.mjs when the subscription is written).
export const SEAT_POOL_LIMITS = Object.freeze({
  5: Object.freeze({ dailyPoolLimit: 50, recoveryPoolLimit: 20 }),
  10: Object.freeze({ dailyPoolLimit: 90, recoveryPoolLimit: 36 }),
  20: Object.freeze({ dailyPoolLimit: 160, recoveryPoolLimit: 64 })
});
