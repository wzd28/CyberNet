import Stripe from "stripe";

import {
  json,
  verifyUser,
  getProfile,
  updateProfile,
  effectivePlan
} from "../lib/supabase.mjs";

function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

async function getOrCreateCustomer(stripe, user, profile) {
  let customerId = profile.stripe_customer_id || "";

  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);

      if (customer && !customer.deleted) {
        return customerId;
      }
    } catch (error) {
      if (error?.code !== "resource_missing") throw error;
    }
  }

  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name:
      profile.full_name ||
      user.user_metadata?.full_name ||
      undefined,
    metadata: {
      supabase_user_id: user.id
    }
  });

  customerId = customer.id;

  await updateProfile(user.id, {
    stripe_customer_id: customerId
  });

  return customerId;
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const secret = env("STRIPE_SECRET_KEY");

    if (!secret) {
      return json(
        {
          error:
            "Stripe is not configured. Add STRIPE_SECRET_KEY in Netlify."
        },
        503
      );
    }

    const { user } = await verifyUser(request);
    const profile = await getProfile(user);

    if (effectivePlan(profile) === "pro") {
      return json(
        { error: "CyberNet AI Pro is already active." },
        409
      );
    }

    const body = await request.json().catch(() => ({}));
    const cycle = body.cycle === "yearly" ? "yearly" : "monthly";

    const lookupKey =
      cycle === "yearly"
        ? (
            env("STRIPE_PRO_YEARLY_LOOKUP_KEY") ||
            "cybernet_ai_pro_yearly"
          )
        : (
            env("STRIPE_PRO_MONTHLY_LOOKUP_KEY") ||
            "cybernet_ai_pro_monthly"
          );

    const stripe = new Stripe(secret);

    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
      expand: ["data.product"]
    });

    const price = prices.data[0];

    if (!price) {
      return json(
        {
          error:
            `Stripe price '${lookupKey}' was not found. ` +
            `Check the ${cycle} lookup key in Stripe.`
        },
        503
      );
    }

    if (price.type !== "recurring") {
      return json(
        { error: "The selected Stripe price is not recurring." },
        503
      );
    }

    const customerId = await getOrCreateCustomer(
      stripe,
      user,
      profile
    );

    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: price.id,
          quantity: 1
        }
      ],
      success_url:
        `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        `${origin}/?checkout=cancelled`,
      client_reference_id: user.id,
      billing_address_collection: "auto",
      allow_promotion_codes: false,
      metadata: {
        supabase_user_id: user.id,
        cycle
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          cycle
        }
      }
    });

    if (!session.url) {
      return json(
        { error: "Stripe did not return a Checkout URL." },
        500
      );
    }

    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout error", error);

    return json(
      {
        error:
          error.message ||
          "Could not create Stripe Checkout."
      },
      Number(error.statusCode || error.status) || 500
    );
  }
};

export const config = {
  path: "/api/create-checkout-session"
};
