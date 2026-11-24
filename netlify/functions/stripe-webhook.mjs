import Stripe from "stripe";

import {
  json,
  updateProfile,
  getProfileByStripeCustomer,
  serviceFetch
} from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { SEAT_POOL_LIMITS } from "../lib/plans.mjs";
import { readBodyText } from "../lib/abuse-guard.mjs";

function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

function customerIdFrom(object) {
  return typeof object?.customer === "string"
    ? object.customer
    : object?.customer?.id || "";
}

// Security audit Nov 2026 (PAY-1, PAY-2 / SRV-AUTH-4, PAY-4, PAY-5, PAY-11):
//   - every database write and lookup checks its answer and throws on failure,
//     so the webhook answers 500 and Stripe retries instead of losing a cancel;
//   - subscription events apply Stripe's current state (re-read from Stripe),
//     never the event's snapshot, so a late or retried old event cannot bring
//     back a cancelled plan, and one subscription cannot overwrite another;
//   - a failed invoice only touches the plan its own subscription pays for;
//   - a paused subscription is not entitled; disputes and refunds alert the
//     owner (nothing is cancelled automatically: owner's rule);
//   - an unknown price lookup key is reported to the owner.
// A retried event is applied idempotently (the same state is written again).

const ENTITLED = ["active", "trialing"];

// Test seam: tests swap `stripe` for a stub. Production never changes it.
export const webhookDeps = { stripe: (secret) => new Stripe(secret) };

// Throws when a Supabase answer is not ok, so the outer catch returns 500 and
// Stripe redelivers (PAY-1). updateProfile in lib/supabase.mjs already did this.
async function checked(responsePromise, what) {
  const response = await responsePromise;
  if (!response?.ok) {
    const error = new Error(`stripe-webhook: ${what} failed (HTTP ${response?.status ?? "none"})`);
    error.status = 500;
    throw error;
  }
  return response;
}

async function rowsOf(responsePromise, what) {
  const response = await checked(responsePromise, what);
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function isPaused(subscription) {
  return Boolean(subscription?.pause_collection);
}

function subscriptionPatch(subscription) {
  const status = String(
    subscription.status || "inactive"
  );

  // PAY-11: a subscription whose payment collection is paused keeps the status
  // "active" in Stripe, but nobody is paying for it.
  const active = ENTITLED.includes(status) && !isPaused(subscription);

  return {
    // Business plans never land here (they go to business_accounts), so an
    // entitled subscription on a profile is always Pro.
    plan: active ? "pro" : "free",
    subscription_status: status,
    billing_interval:
      subscription.items?.data?.[0]?.price?.recurring?.interval || "",
    stripe_customer_id:
      customerIdFrom(subscription),
    stripe_subscription_id:
      subscription.id || ""
  };
}

async function userIdForSubscription(subscription) {
  const metadataUserId =
    subscription.metadata?.supabase_user_id;

  if (metadataUserId) return metadataUserId;

  const customerId = customerIdFrom(subscription);
  const profile = await getProfileByStripeCustomer(customerId);

  return profile?.id || "";
}

// Business team accounts: every Business-tier subscription (5/10/20 seat)
// is billed and provisioned through business_accounts, never through
// profiles.plan. profiles.plan only ever holds 'free' or 'pro' at the
// database level (a CHECK constraint enforces this — a pre-existing
// constraint that predates this feature and would reject any attempt to
// write plan:'business' onto an individual profile).
// The seat -> pool table (SEAT_POOL_LIMITS) lives in netlify/lib/plans.mjs.

// PAY-5: the lookup keys checkout sells (the same env overrides and defaults
// as create-checkout-session.mjs), each with its plan and seat count.
export function knownLookupKeys() {
  const keys = new Map();
  for (const cycle of ["MONTHLY", "YEARLY"]) {
    const c = cycle.toLowerCase();
    keys.set(env(`STRIPE_PRO_${cycle}_LOOKUP_KEY`) || `cybernet_ai_pro_${c}`, { tier: "pro" });
    for (const seats of [5, 10, 20]) {
      const suffix = seats === 5 ? "" : `_${seats}seat`;
      keys.set(env(`STRIPE_BUSINESS${suffix.toUpperCase()}_${cycle}_LOOKUP_KEY`) || `cybernet_ai_business${suffix}_${c}`, { tier: "business", seats });
    }
  }
  return keys;
}

// { tier, seats? } for a lookup key. A key checkout does not sell is
// classified the way it always was (so an older price keeps working) and the
// owner is told, so an unrelated price can no longer grant a plan unnoticed.
function planOfLookupKey(lookupKey) {
  const key = String(lookupKey || "");
  const known = knownLookupKeys().get(key);
  if (known) return known;
  {
    reportError(new Error("Stripe subscription with a price lookup key checkout does not sell"), {
      fn: "stripe-webhook", label: `Unknown Stripe lookup key "${key.slice(0, 60) || "(none)"}": check the price in Stripe`
    });
  }
  return isBusinessLookupKey(key) ? { tier: "business", seats: seatTierFromLookupKey(key) } : { tier: "pro" };
}

function lookupKeyOf(subscription) {
  return subscription?.items?.data?.[0]?.price?.lookup_key || "";
}

function isBusinessLookupKey(lookupKey) {
  return String(lookupKey || "").includes("business");
}

function seatTierFromLookupKey(lookupKey) {
  const match = String(lookupKey || "").match(/business_(\d+)seat/);
  return match ? Number(match[1]) : 5;
}

// PAY-2: the subscription as Stripe has it now. A cancelled subscription
// still retrieves (status "canceled"). Only "no such subscription" falls back
// to the event's copy, and only when the event carried a whole subscription
// (checkout and failed-invoice events pass just an id: then it throws, as the
// old code did, so nothing is written and Stripe retries). Any other failure
// throws too.
async function currentSubscription(stripe, snapshot) {
  if (!snapshot?.id) return snapshot;
  try {
    return await stripe.subscriptions.retrieve(String(snapshot.id));
  } catch (error) {
    if ((error?.statusCode === 404 || error?.code === "resource_missing") && snapshot.status) return snapshot;
    throw error;
  }
}

// PAY-2: which Pro subscription the profile should follow. When this one is
// no longer entitled but the same customer has another live Pro subscription,
// that one stays in charge (so a stale event for an old or abandoned
// subscription never downgrades a paying customer).
async function proSubscriptionInCharge(stripe, current) {
  if (ENTITLED.includes(String(current.status)) && !isPaused(current)) return current;
  const customerId = customerIdFrom(current);
  if (!customerId) return current;
  const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  const other = (list?.data || []).find((s) =>
    s.id !== current.id && ENTITLED.includes(String(s.status)) && !isPaused(s) && planOfLookupKey(lookupKeyOf(s)).tier === "pro");
  return other || current;
}

async function applyProSubscription(stripe, userId, current) {
  const inCharge = await proSubscriptionInCharge(stripe, current);
  await updateProfile(userId, subscriptionPatch(inCharge));
  // PAY-5: a subscription that used to pay for a team and was switched to a
  // Pro price no longer pays for that team.
  const teamRows = await rowsOf(serviceFetch(
    `/rest/v1/business_accounts?stripe_subscription_id=eq.${encodeURIComponent(current.id || "")}&select=id,subscription_status`
  ), "team lookup by subscription");
  for (const row of teamRows) {
    if (!ENTITLED.includes(String(row.subscription_status))) continue;
    await checked(serviceFetch(`/rest/v1/business_accounts?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ subscription_status: "canceled", updated_at: new Date().toISOString() })
    }), "team close after a switch to Pro");
  }
}

// PAY-5: a Pro subscription switched to a Business price stops being Pro on
// the profile that recorded it (the team row takes over).
async function closeProfileForBusinessSwitch(userId, subscription) {
  if (!userId || !subscription?.id) return;
  const rows = await rowsOf(serviceFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&stripe_subscription_id=eq.${encodeURIComponent(subscription.id)}&select=id,plan`
  ), "profile lookup by subscription");
  if (rows[0]?.plan === "pro") await updateProfile(userId, { plan: "free" });
}

async function upsertBusinessAccount(userId, subscription) {
  const paused = isPaused(subscription);
  // PAY-11: a paused team is not entitled (getActiveTeamMembership needs active/trialing).
  const status = paused ? "paused" : String(subscription.status || "inactive");
  const price = subscription.items?.data?.[0]?.price;
  const lookupKey = String(price?.lookup_key || "");
  const plan = planOfLookupKey(lookupKey);
  const seatTier = [5, 10, 20].includes(plan.seats) ? plan.seats : seatTierFromLookupKey(lookupKey);
  const pool = SEAT_POOL_LIMITS[seatTier] || SEAT_POOL_LIMITS[5];
  const customerId = customerIdFrom(subscription);
  const subscriptionId = subscription.id || "";
  const billingInterval = price?.recurring?.interval || "";
  const effectiveUserId = userId || subscription.metadata?.supabase_user_id || "";

  const existing = await rowsOf(serviceFetch(
    `/rest/v1/business_accounts?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id`
  ), "team lookup by subscription");
  let accountId = existing[0]?.id;

  if (!accountId && effectiveUserId) {
    const ownerRows = await rowsOf(serviceFetch(
      `/rest/v1/business_accounts?owner_user_id=eq.${encodeURIComponent(effectiveUserId)}&select=id,stripe_subscription_id,subscription_status`
    ), "team lookup by owner");
    const owned = ownerRows[0];
    // PAY-2: this subscription (re-read from Stripe) has ended or is not paid,
    // and the owner's team is held by a different subscription that is still
    // live: an old or retried event must not overwrite it. A new subscription
    // that is active or trialing always takes the team over (an owner whose
    // old plan went past due may buy again: checkout allows it).
    const incomingEntitled = ENTITLED.includes(status);
    if (!incomingEntitled && owned && owned.stripe_subscription_id && owned.stripe_subscription_id !== subscriptionId &&
      ["active", "trialing", "past_due", "unpaid", "paused"].includes(String(owned.subscription_status))) {
      return null;
    }
    accountId = owned?.id;
  }

  if (!accountId && !effectiveUserId) {
    // No existing row to update and no owner to create one for yet —
    // nothing to do with this event.
    return null;
  }

  if (!accountId && ["canceled", "incomplete_expired"].includes(status)) {
    // A subscription that has already ended never creates a team. This is the
    // customer.subscription.deleted that follows an account deletion
    // (privacy-data.mts cancels the team's plan, then removes the team row):
    // creating a fresh row for that owner would block the deletion.
    return null;
  }

  const patch = {
    seat_tier: seatTier,
    daily_pool_limit: pool.dailyPoolLimit,
    recovery_pool_limit: pool.recoveryPoolLimit,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: status,
    billing_interval: billingInterval,
    updated_at: new Date().toISOString()
  };

  if (accountId) {
    await checked(serviceFetch(`/rest/v1/business_accounts?id=eq.${encodeURIComponent(accountId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }), "team update");
    return accountId;
  }

  const insertRes = await serviceFetch("/rest/v1/business_accounts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_user_id: effectiveUserId, ...patch })
  });

  // Stripe sends checkout.session.completed and customer.subscription.created
  // for the same purchase within milliseconds of each other, and Netlify runs
  // the two deliveries concurrently. Both can pass the lookups above before
  // either has inserted, so the unique index on stripe_subscription_id turns
  // the second insert into a 409: treat that as "the other delivery created
  // it" and update that row instead of creating a second account.
  if (insertRes.status === 409) {
    const raceRows = await rowsOf(serviceFetch(
      `/rest/v1/business_accounts?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id`
    ), "team lookup after a 409");
    const raceId = raceRows[0]?.id;

    if (raceId) {
      await checked(serviceFetch(`/rest/v1/business_accounts?id=eq.${encodeURIComponent(raceId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      }), "team update after a 409");
      await ensureOwnerMembership(raceId, effectiveUserId);
    }

    return raceId || null;
  }

  await checked(Promise.resolve(insertRes), "team insert");
  const rows = await insertRes.json().catch(() => []);
  const newAccountId = rows[0]?.id;

  if (newAccountId) {
    await ensureOwnerMembership(newAccountId, effectiveUserId);
  }

  return newAccountId;
}

// The owner's membership row is what makes the account theirs; it is created
// once and left alone if it already exists.
async function ensureOwnerMembership(accountId, userId) {
  if (!accountId || !userId) return;

  const existing = await rowsOf(serviceFetch(
    `/rest/v1/business_members?business_account_id=eq.${encodeURIComponent(accountId)}&user_id=eq.${encodeURIComponent(userId)}&select=id`
  ), "owner membership lookup");
  if (existing.length) return;

  const insert = await serviceFetch("/rest/v1/business_members", {
    method: "POST",
    body: JSON.stringify({
      business_account_id: accountId,
      user_id: userId,
      role: "owner"
    })
  });
  // 409: the row was created meanwhile (a concurrent delivery). That is success.
  if (insert.status !== 409) await checked(Promise.resolve(insert), "owner membership insert");
}

// Applies one subscription's current state wherever it belongs.
async function applySubscription(stripe, snapshot, userIdHint = "") {
  const current = await currentSubscription(stripe, snapshot);
  const plan = planOfLookupKey(lookupKeyOf(current));
  if (plan.tier === "business") {
    await upsertBusinessAccount(userIdHint || null, current);
    await closeProfileForBusinessSwitch(userIdHint || current.metadata?.supabase_user_id || "", current);
    return;
  }
  const userId = userIdHint || (await userIdForSubscription(current));
  if (userId) await applyProSubscription(stripe, userId, current);
}

// PAY-4: the subscription an invoice belongs to (older and newer API shapes).
function invoiceSubscriptionId(invoice) {
  const value = invoice?.subscription || invoice?.parent?.subscription_details?.subscription || "";
  return typeof value === "string" ? value : value?.id || "";
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const secret = env("STRIPE_SECRET_KEY");
  const webhookSecret = env("STRIPE_WEBHOOK_SECRET");

  if (!secret || !webhookSecret) {
    return json(
      { error: "Stripe webhook is not configured." },
      503
    );
  }

  const stripe = webhookDeps.stripe(secret);
  let event;

  let signature = "";
  try {
    // SRV-11: Stripe events are small; anything over 1 MB is refused while it
    // streams in, before the signature check reads it.
    const read = await readBodyText(request, 1_000_000);
    if (!read.ok) return json({ error: "Request is too large." }, read.status === 413 ? 413 : 400);
    const payload = read.text;
    signature =
      request.headers.get("stripe-signature") || "";

    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  } catch (error) {
    // A delivery that carries a Stripe signature but fails the check means the endpoint in
    // Stripe signs with a different secret than STRIPE_WEBHOOK_SECRET: paid plans would not
    // activate. It used to fail silently (28 Oct 2026); now it is logged and alerted.
    // Requests with no signature at all (bots, probes) stay quiet.
    if (signature) {
      console.error("stripe-webhook: signature check failed", error?.message);
      await Promise.resolve(reportError(error, { fn: "stripe-webhook", label: "Stripe webhook signature check failed: check that STRIPE_WEBHOOK_SECRET matches this endpoint's signing secret in Stripe" })).catch(() => {});
    }
    // PAY-10: a fixed answer; the detail stays in the log.
    return json({ error: "Invalid Stripe webhook signature." }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId =
        session.metadata?.supabase_user_id ||
        session.client_reference_id ||
        "";

      if (userId && session.subscription) {
        await applySubscription(stripe, { id: String(session.subscription) }, userId);
      }
    }

    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted"
      ].includes(event.type)
    ) {
      await applySubscription(stripe, event.data.object);
    }

    if (event.type === "invoice.payment_failed") {
      // PAY-4: re-read the invoice's own subscription and apply its state
      // (past_due, unpaid, incomplete ...) to the plan that subscription pays
      // for. An invoice without a subscription changes nothing.
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      if (subscriptionId) await applySubscription(stripe, { id: subscriptionId });
    }

    if (event.type === "charge.dispute.created" || event.type === "charge.refunded") {
      // PAY-11: tell the owner; never cancel anything automatically. Only the
      // Stripe customer id is named.
      const object = event.data.object || {};
      const customerId = customerIdFrom(object) || "(unknown customer)";
      await Promise.resolve(reportError(new Error(`Stripe ${event.type === "charge.refunded" ? "refund" : "dispute"} for ${customerId}`), {
        fn: "stripe-webhook",
        label: event.type === "charge.refunded"
          ? "Stripe refund: check whether the plan should stay on"
          : "Stripe dispute opened: check the customer's plan in Stripe"
      })).catch(() => {});
    }

    return json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing error", error);
    reportError(error, { fn: "stripe-webhook", label: `Webhook ${String(event?.type || "event").slice(0, 60)} processing failed` });

    // PAY-10: a fixed answer; Stripe retries on any 5xx.
    return json({ error: "Webhook processing failed." }, 500);
  }
};

export const config = {
  path: "/api/stripe-webhook"
};
