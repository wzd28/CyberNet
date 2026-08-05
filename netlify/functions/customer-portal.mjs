import Stripe from "stripe";

import {
  json,
  verifyUser,
  getProfile
} from "../lib/supabase.mjs";

function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const secret = env("STRIPE_SECRET_KEY");

    if (!secret) {
      return json(
        { error: "Stripe is not configured." },
        503
      );
    }

    const { user } = await verifyUser(request);
    const profile = await getProfile(user);
    const customerId = profile.stripe_customer_id || "";

    if (!customerId) {
      return json(
        {
          error:
            "No Stripe customer is connected to this account yet."
        },
        404
      );
    }

    const stripe = new Stripe(secret);
    const origin = new URL(request.url).origin;

    const session =
      await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/?billing=returned`
      });

    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe customer portal error", error);

    return json(
      {
        error:
          error.message ||
          "Could not open the billing portal."
      },
      Number(error.statusCode || error.status) || 500
    );
  }
};

export const config = {
  path: "/api/customer-portal"
};
