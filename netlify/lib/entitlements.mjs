// Who pays for a person's plan, and what the app should show about it.
//
// A plan can come from four places:
//   * Stripe Pro            profiles.plan = 'pro' (status active / trialing)
//   * Stripe Business       a business_accounts team billed by Stripe
//   * Apple Pro             an entitled row in public.apple_subscriptions
//   * Apple Business        a team billed by Apple (billing_source = 'apple')
// plus Business team membership, which gives the member Business whoever pays.
// The effective plan is the highest of them (team > pro > free). It is derived
// when read and never copied into profiles.plan.
//
// describeBilling() builds the `profile.billing` object of /api/account-status:
//   { source: "apple" | "stripe" | "team" | null, plan, productId, seatTier,
//     interval, renewsAt, endsAt, autoRenew, inGrace, environment,
//     alsoBilledElsewhere }
// The app uses it to show the plan, "Renews on / Ends on", Manage subscription
// (only when source is "apple") and the neutral duplicate-plan note.

import { serviceFetch as defaultServiceFetch } from "./supabase.mjs";

const COLUMNS =
  "original_transaction_id,product_id,plan,seat_tier,billing_interval,environment," +
  "expires_at,grace_expires_at,auto_renew,status,revoked_at,business_account_id";

// All of the person's Apple subscriptions (normally one). Throws when the table
// cannot be read; getProfile() turns that into "no Apple subscription".
export async function loadAppleSubscriptions(userId, serviceFetch = defaultServiceFetch) {
  const response = await serviceFetch(
    `/rest/v1/apple_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=${COLUMNS}&order=expires_at.desc&limit=20`
  );
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    const error = new Error((rows && rows.message) || `Could not load Apple subscriptions (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return rows;
}

const ms = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
};

// Paid up right now: not revoked, and either inside the paid period or inside
// the billing grace period Apple allows after a failed renewal.
export function appleEntitled(row, now = Date.now()) {
  if (!row || row.revoked_at) return false;
  if (String(row.status || "") === "revoked") return false;
  const expires = ms(row.expires_at);
  const grace = ms(row.grace_expires_at);
  return (expires !== null && expires > now) || (grace !== null && grace > now);
}

export function entitledAppleRows(rows, now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).filter((row) => appleEntitled(row, now));
}

// True when an entitled Apple Pro subscription exists (what plan_of() checks).
export function appleProActive(rows, now = Date.now()) {
  return entitledAppleRows(rows, now).some((row) => row.plan === "pro");
}

function stripeProfilePlan(profile) {
  const active = ["active", "trialing"].includes(String(profile?.subscription_status || ""));
  if (!active) return null;
  return profile.plan === "business" ? "business" : profile.plan === "pro" ? "pro" : null;
}

// Business over Pro, then the one that runs longest.
function bestApple(rows) {
  return [...rows].sort((a, b) => {
    const rank = (row) => (row.plan === "business" ? 1 : 0);
    return rank(b) - rank(a) || (ms(b.expires_at) || 0) - (ms(a.expires_at) || 0);
  })[0] || null;
}

// profile: the profiles row (plan, subscription_status, billing_interval)
// team:    getActiveTeamMembership() result or null ({ role, seatTier, billingSource })
// appleRows: loadAppleSubscriptions() rows
export function describeBilling({ profile = {}, team = null, appleRows = [], now = Date.now() } = {}) {
  const apple = bestApple(entitledAppleRows(appleRows, now));
  const stripePlan = stripeProfilePlan(profile);
  const ownsTeam = Boolean(team && team.role === "owner");
  const stripeTeamOwner = ownsTeam && team.billingSource !== "apple";
  const stripe = Boolean(stripePlan) || stripeTeamOwner;

  const plan = team ? "business" : apple ? apple.plan : stripePlan || "free";

  let source = null;
  if (apple) source = "apple";
  else if (stripe) source = "stripe";
  else if (team) source = "team";

  const base = {
    source,
    plan,
    productId: null,
    seatTier: team?.seatTier ?? null,
    interval: null,
    renewsAt: null,
    endsAt: null,
    autoRenew: null,
    inGrace: false,
    environment: null,
    // Two subscriptions are paying for this account at once.
    alsoBilledElsewhere: Boolean(apple && stripe)
  };

  if (source === "apple") {
    const expires = ms(apple.expires_at);
    const grace = ms(apple.grace_expires_at);
    const inGrace = expires !== null && expires <= now && grace !== null && grace > now;
    const autoRenew = apple.auto_renew !== false;
    return {
      ...base,
      productId: apple.product_id,
      seatTier: apple.seat_tier ?? base.seatTier,
      interval: apple.billing_interval === "year" ? "year" : "month",
      renewsAt: autoRenew && !inGrace ? apple.expires_at : null,
      endsAt: inGrace ? apple.grace_expires_at : autoRenew ? null : apple.expires_at,
      autoRenew,
      inGrace,
      environment: apple.environment || null
    };
  }

  if (source === "stripe") {
    const interval = String(profile?.billing_interval || "").toLowerCase();
    return { ...base, interval: interval === "year" || interval === "month" ? interval : null };
  }

  return base;
}

// What the website's Account panel has always read from profile.subscriptionStatus /
// billingInterval, filled in for a plan that Apple bills (the profiles row itself
// is not touched by an Apple purchase).
export function legacyBillingFields(profile, billing) {
  if (billing?.source === "apple" && !stripeProfilePlan(profile)) {
    return { subscriptionStatus: billing.inGrace ? "past_due" : "active", billingInterval: billing.interval || "" };
  }
  return { subscriptionStatus: profile?.subscription_status || "inactive", billingInterval: profile?.billing_interval || "" };
}

// create-checkout-session: the message for a Stripe checkout the person does not
// need (they already have that plan or a higher one, from Stripe, from Apple or
// from a Business team), or null when the checkout may go ahead. Never charge
// twice for the same thing, whoever bills it. Apple's plan is not named: the
// website does not manage it.
export function checkoutConflict({ profile = {}, team = null, currentPlan = "free", targetPlan = "pro", appleRows = [], now = Date.now() } = {}) {
  const rank = { free: 0, pro: 1, business: 2 };
  const heldPlan = team ? "business" : currentPlan;
  if ((rank[heldPlan] ?? 0) < (rank[targetPlan] ?? 1)) return null;
  const billing = describeBilling({ profile, team, appleRows, now });
  if (billing.source === "apple") return "Your plan is already active on this account.";
  return `CyberNet AI ${heldPlan === "business" ? "Business" : "Pro"} is already active.`;
}
