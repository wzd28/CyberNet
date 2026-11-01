import Stripe from "stripe";

import {
  json,
  updateProfile,
  getProfileByStripeCustomer,
  serviceFetch
} from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { SEAT_POOL_LIMITS } from "../lib/business-seats.mjs";

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

function subscriptionPatch(subscription) {
  const status = String(
    subscription.status || "inactive"
  );

  const active = ["active", "trialing"].includes(status);
  const lookupKey = String(subscription.items?.data?.[0]?.price?.lookup_key || "");
  const tier = lookupKey.includes("business") ? "business" : "pro";

  return {
    plan: active ? tier : "free",
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
// (SEAT_POOL_LIMITS, the pools each seat count gets, lives in
// netlify/lib/business-seats.mjs: Apple-billed teams use the same table.)

// A Business team can also be billed by Apple (In-App Purchase, see
// supabase/migrations/20261030120000_apple_iap.sql). A Stripe event that arrives
// late for an OLD Stripe plan (typically customer.subscription.deleted) must not
// close or change a team Apple now pays for. Returns what the team row says, or
// { known: false } when the billing_source column is not there yet (the
// migration has not been applied): then Stripe behaves exactly as before.
async function billingOf(accountId) {
  try {
    const response = await serviceFetch(
      `/rest/v1/business_accounts?id=eq.${encodeURIComponent(accountId)}&select=billing_source,subscription_status`
    );
    const rows = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(rows) || !rows[0]) return { known: false, apple: false, status: "" };
    return { known: true, apple: rows[0].billing_source === "apple", status: String(rows[0].subscription_status || "") };
  } catch {
    return { known: false, apple: false, status: "" };
  }
}

// Apple pays for this team right now: leave it alone. A team in Apple's billing
// retry (past_due) is left alone too, unless the Stripe subscription in the
// event is a live one (the owner has since started paying on the website).
function appleOwnsTeam(billing, stripeStatus) {
  if (!billing.apple) return false;
  if (["active", "trialing"].includes(billing.status)) return true;
  if (billing.status === "past_due") return !["active", "trialing"].includes(String(stripeStatus || ""));
  return false;
}

function isBusinessLookupKey(lookupKey) {
  return String(lookupKey || "").includes("business");
}

function seatTierFromLookupKey(lookupKey) {
  const match = String(lookupKey || "").match(/business_(\d+)seat/);
  return match ? Number(match[1]) : 5;
}

async function upsertBusinessAccount(userId, subscription) {
  const status = String(subscription.status || "inactive");
  const price = subscription.items?.data?.[0]?.price;
  const lookupKey = String(price?.lookup_key || "");
  const seatTier = seatTierFromLookupKey(lookupKey);
  const pool = SEAT_POOL_LIMITS[seatTier] || SEAT_POOL_LIMITS[5];
  const customerId = customerIdFrom(subscription);
  const subscriptionId = subscription.id || "";
  const billingInterval = price?.recurring?.interval || "";
  const effectiveUserId = userId || subscription.metadata?.supabase_user_id || "";

  const existingRes = await serviceFetch(
    `/rest/v1/business_accounts?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id`
  );
  const existing = await existingRes.json().catch(() => []);
  let accountId = existing[0]?.id;

  if (!accountId && effectiveUserId) {
    const ownerRes = await serviceFetch(
      `/rest/v1/business_accounts?owner_user_id=eq.${encodeURIComponent(effectiveUserId)}&select=id`
    );
    const ownerRows = await ownerRes.json().catch(() => []);
    accountId = ownerRows[0]?.id;
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

  // Billed by Apple: a Stripe event for an old plan changes nothing.
  let billingKnown = false;
  if (accountId) {
    const billing = await billingOf(accountId);
    if (appleOwnsTeam(billing, status)) return accountId;
    billingKnown = billing.known;
  }

  const patch = {
    seat_tier: seatTier,
    daily_pool_limit: pool.dailyPoolLimit,
    recovery_pool_limit: pool.recoveryPoolLimit,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: status,
    billing_interval: billingInterval,
    updated_at: new Date().toISOString(),
    // Stripe is billing this team now (it may have been Apple's before). Only
    // sent once the column is known to exist; a new row gets the default 'stripe'.
    ...(accountId && billingKnown ? { billing_source: "stripe" } : {})
  };

  if (accountId) {
    await serviceFetch(`/rest/v1/business_accounts?id=eq.${accountId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
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
    const raceRes = await serviceFetch(
      `/rest/v1/business_accounts?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id`
    );
    const raceRows = await raceRes.json().catch(() => []);
    const raceId = raceRows[0]?.id;

    if (raceId) {
      await serviceFetch(`/rest/v1/business_accounts?id=eq.${raceId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      await ensureOwnerMembership(raceId, effectiveUserId);
    }

    return raceId || null;
  }

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

  const existingRes = await serviceFetch(
    `/rest/v1/business_members?business_account_id=eq.${accountId}&user_id=eq.${encodeURIComponent(userId)}&select=id`
  );
  const existing = await existingRes.json().catch(() => []);
  if (existing.length) return;

  await serviceFetch("/rest/v1/business_members", {
    method: "POST",
    body: JSON.stringify({
      business_account_id: accountId,
      user_id: userId,
      role: "owner"
    })
  });
}

async function getBusinessAccountByStripeCustomer(customerId) {
  if (!customerId) return null;
  const response = await serviceFetch(
    `/rest/v1/business_accounts?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id`
  );
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
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

  const stripe = new Stripe(secret);
  let event;

  let signature = "";
  try {
    const payload = await request.text();
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
    return json(
      {
        error:
          `Invalid Stripe webhook: ${error.message}`
      },
      400
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId =
        session.metadata?.supabase_user_id ||
        session.client_reference_id ||
        "";

      if (userId && session.subscription) {
        const subscription =
          await stripe.subscriptions.retrieve(
            String(session.subscription)
          );

        const lookupKey = subscription.items?.data?.[0]?.price?.lookup_key || "";

        if (isBusinessLookupKey(lookupKey)) {
          await upsertBusinessAccount(userId, subscription);
        } else {
          await updateProfile(
            userId,
            subscriptionPatch(subscription)
          );
        }
      }
    }

    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted"
      ].includes(event.type)
    ) {
      const subscription = event.data.object;
      const lookupKey = subscription.items?.data?.[0]?.price?.lookup_key || "";

      if (isBusinessLookupKey(lookupKey)) {
        await upsertBusinessAccount(null, subscription);
      } else {
        const userId =
          await userIdForSubscription(subscription);

        if (userId) {
          await updateProfile(
            userId,
            subscriptionPatch(subscription)
          );
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customerId = customerIdFrom(invoice);

      const businessAccount = await getBusinessAccountByStripeCustomer(customerId);

      if (businessAccount) {
        // A failed Stripe invoice for an old plan does not touch an Apple-billed team.
        if (!appleOwnsTeam(await billingOf(businessAccount.id), "past_due")) {
          await serviceFetch(`/rest/v1/business_accounts?id=eq.${businessAccount.id}`, {
            method: "PATCH",
            body: JSON.stringify({ subscription_status: "past_due", updated_at: new Date().toISOString() })
          });
        }
      } else {
        const profile =
          await getProfileByStripeCustomer(customerId);

        if (profile?.id) {
          await updateProfile(profile.id, {
            plan: "free",
            subscription_status: "past_due"
          });
        }
      }
    }

    return json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing error", error);
    reportError(error, { fn: "stripe-webhook", label: `Webhook ${String(event?.type || "event").slice(0, 60)} processing failed` });

    return json(
      {
        error:
          error.message ||
          "Webhook processing failed."
      },
      500
    );
  }
};

export const config = {
  path: "/api/stripe-webhook"
};
