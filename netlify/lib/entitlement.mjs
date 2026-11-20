// One rule for "what plan does this person have": public.entitlement_of(uid)
// (supabase/migrations/20261121120000_apple_iap_pro.sql) = the Stripe plan on
// profiles (the old rule) OR a paid-up Apple Pro subscription (not revoked,
// before its expiry or inside Apple's billing grace period).
//
// Before the owner has run the migration the function does not exist yet
// (PostgREST answers 404). Then the old profile rule is used, so the website
// behaves exactly as before. Any other failure also falls back, unless the
// caller asks for `strict` (the checkout guard: an outage must never read as
// "this person has no plan").

import { serviceFetch as defaultServiceFetch, effectivePlan } from "./supabase.mjs";

const PLANS = new Set(["free", "pro", "business"]);
const bool = (value) => (value === true ? true : value === false ? false : null);

function fromProfile(profile, origin) {
  const plan = effectivePlan(profile || {});
  return { plan, stripeActive: plan !== "free", appleActive: false, apple: null, origin };
}

export function entitlementFromRow(row, profile) {
  if (!row || typeof row !== "object") return fromProfile(profile, "profile");
  const plan = PLANS.has(row.plan) ? row.plan : "free";
  const apple = row.apple_original_transaction_id
    ? {
        productId: row.apple_product_id || null,
        environment: row.apple_environment === "Sandbox" ? "Sandbox" : "Production",
        expiresAt: row.apple_expires_at || null,
        graceExpiresAt: row.apple_grace_expires_at || null,
        autoRenew: bool(row.apple_auto_renew),
        autoRenewProductId: row.apple_auto_renew_product_id || null,
        status: row.apple_status || null,
        revoked: row.apple_revoked === true
      }
    : null;
  return { plan, stripeActive: row.stripe_active === true, appleActive: row.apple_active === true, apple, origin: "database" };
}

// loadEntitlement(userId, { profile, strict, serviceFetch })
//   -> { plan, stripeActive, appleActive, apple, origin }
export async function loadEntitlement(userId, { profile = null, strict = false, serviceFetch = defaultServiceFetch } = {}) {
  let response;
  try {
    response = await serviceFetch("/rest/v1/rpc/entitlement_of", {
      method: "POST",
      body: JSON.stringify({ p_user_id: userId })
    });
  } catch (error) {
    if (strict) throw Object.assign(new Error("Could not check your current plan. Please try again in a moment."), { status: 503 });
    console.warn("CyberNet entitlement_of unreachable; using the profile plan", error?.message || error);
    return fromProfile(profile, "fallback");
  }
  const rows = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) return fromProfile(profile, "fallback"); // migration not run yet
    if (strict) throw Object.assign(new Error("Could not check your current plan. Please try again in a moment."), { status: 503 });
    console.warn(`CyberNet entitlement_of failed (HTTP ${response.status}); using the profile plan`);
    return fromProfile(profile, "fallback");
  }
  const row = Array.isArray(rows) ? rows[0] : rows;
  return entitlementFromRow(row, profile);
}

// Attaches the entitlement to a profile object so effectivePlan(profile) and
// dailyLimit(profile) (lib/supabase.mjs) read it. Returns the same profile.
export async function withEntitlement(profile, userId, options = {}) {
  const entitlement = await loadEntitlement(userId, { ...options, profile });
  if (profile && typeof profile === "object") {
    Object.defineProperty(profile, "entitlement", { value: entitlement, enumerable: false, configurable: true, writable: true });
  }
  return entitlement;
}

const inGrace = (apple, now = Date.now()) => Boolean(apple?.graceExpiresAt && Date.parse(apple.expiresAt) <= now && Date.parse(apple.graceExpiresAt) > now);

// The iPhone app's billing object (account-status profile.billing and the
// apple-verify reply), IAP builds only (X-CyberNet-IAP: 1). Never carries a
// price, a URL, the word "business" or another account's details.
//   source: "apple" | "outside" | "team" | "both" | null
//   canPurchase: false when anything already covers the person
//   purchaseBlockedReason: null | "active_apple" | "active_outside" | "team"
//   alsoBilledElsewhere: Apple Pro AND a paid website plan at the same time
//   appAccountToken: the user id, lowercase (StoreKit appAccountToken)
//   apple: details of the person's Apple subscription, or null
export function appBilling(entitlement, { userId, team = null, now = Date.now() } = {}) {
  const ent = entitlement || { stripeActive: false, appleActive: false, apple: null };
  const onTeam = Boolean(team);
  const outside = Boolean(ent.stripeActive) || onTeam;
  const appleActive = Boolean(ent.appleActive);
  const source = appleActive && outside ? "both" : appleActive ? "apple" : onTeam ? "team" : ent.stripeActive ? "outside" : null;
  const purchaseBlockedReason = appleActive ? "active_apple" : onTeam ? "team" : ent.stripeActive ? "active_outside" : null;
  const apple = ent.apple
    ? {
        productId: ent.apple.productId,
        environment: ent.apple.environment,
        expiresAt: ent.apple.expiresAt,
        active: appleActive,
        inGrace: appleActive && inGrace(ent.apple, now),
        // null = not known yet: show the end date without "renews".
        autoRenew: ent.apple.autoRenew,
        autoRenewProductId: ent.apple.autoRenewProductId,
        revoked: Boolean(ent.apple.revoked)
      }
    : null;
  return {
    source,
    canPurchase: !appleActive && !outside,
    purchaseBlockedReason,
    alsoBilledElsewhere: appleActive && (Boolean(ent.stripeActive) || team?.role === "owner"),
    appAccountToken: String(userId || "").toLowerCase(),
    // The same Apple details, flat (the names in the server design, server.md §6).
    appleProductId: apple ? apple.productId : null,
    appleExpiresAt: apple ? apple.expiresAt : null,
    appleAutoRenew: apple ? apple.autoRenew : null,
    appleInGrace: apple ? apple.inGrace : false,
    appleEnvironment: apple ? apple.environment : null,
    apple
  };
}

// The website's view (account-status web path).
//   billingSource: "stripe" | "apple" | "both" | "team" | null
//   apple: { expiresAt, autoRenew, inGrace, environment } while Apple Pro is active
export function webBilling(entitlement, { team = null, now = Date.now() } = {}) {
  const ent = entitlement || { stripeActive: false, appleActive: false, apple: null };
  const appleActive = Boolean(ent.appleActive);
  const stripe = Boolean(ent.stripeActive);
  const billingSource = appleActive && stripe ? "both" : appleActive ? "apple" : stripe ? "stripe" : team ? "team" : null;
  return {
    billingSource,
    apple: appleActive && ent.apple
      ? { expiresAt: ent.apple.expiresAt, autoRenew: ent.apple.autoRenew, inGrace: inGrace(ent.apple, now), environment: ent.apple.environment }
      : null
  };
}
