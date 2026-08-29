import Stripe from "stripe";

import {
  json,
  updateProfile,
  getProfileByStripeCustomer
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

        await updateProfile(
          userId,
          subscriptionPatch(subscription)
        );
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
      const userId =
        await userIdForSubscription(subscription);

      if (userId) {
        await updateProfile(
          userId,
          subscriptionPatch(subscription)
        );
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customerId = customerIdFrom(invoice);
      const profile =
        await getProfileByStripeCustomer(customerId);

      if (profile?.id) {
        await updateProfile(profile.id, {
          plan: "free",
          subscription_status: "past_due"
        });
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
