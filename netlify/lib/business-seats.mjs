// The shared pools of a Business team, by seat count. One copy for both ways a
// team can be billed: Stripe (netlify/functions/stripe-webhook.mjs) and Apple
// In-App Purchase (netlify/lib/apple-products.mjs and apply_apple_subscription
// in supabase/migrations/20261030120000_apple_iap.sql, which a test compares).
//
//   seats -> shared AI analyses per day, shared Recovery cases per window
export const SEAT_POOL_LIMITS = Object.freeze({
  5: Object.freeze({ dailyPoolLimit: 50, recoveryPoolLimit: 20 }),
  10: Object.freeze({ dailyPoolLimit: 90, recoveryPoolLimit: 36 }),
  20: Object.freeze({ dailyPoolLimit: 160, recoveryPoolLimit: 64 })
});

export const SEAT_TIERS = Object.freeze([5, 10, 20]);
