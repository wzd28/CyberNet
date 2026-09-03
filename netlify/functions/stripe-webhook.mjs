import Stripe from "stripe";

import {
  json,
  updateProfile,
  getProfileByStripeCustomer,
  serviceFetch
} from "../lib/supabase.mjs";

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
const SEAT_POOL_LIMITS = {
  5: { dailyPoolLimit: 50, recoveryPoolLimit: 20 },
  10: { dailyPoolLimit: 90, recoveryPoolLimit: 36 },
  20: { dailyPoolLimit: 160, recoveryPoolLimit: 64 }
};

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
  const rows = await insertRes.json().catch(() => []);
  const newAccountId = rows[0]?.id;

  if (newAccountId) {
    await serviceFetch("/rest/v1/business_members", {
      method: "POST",
      body: JSON.stringify({
        business_account_id: newAccountId,
        user_id: effectiveUserId,
        role: "owner"
      })
    });
  }

  return newAccountId;
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

  try {
    const payload = await request.text();
    const signature =
      request.headers.get("stripe-signature") || "";

    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  } catch (error) {
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
        await serviceFetch(`/rest/v1/business_accounts?id=eq.${businessAccount.id}`, {
          method: "PATCH",
          body: JSON.stringify({ subscription_status: "past_due", updated_at: new Date().toISOString() })
        });
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
