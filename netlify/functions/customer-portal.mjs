import Stripe from "stripe";

import {
  json,
  verifyUser,
  getProfile
} from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { publicErrorBody } from "../lib/public-error.mjs";
import { linkOrigin } from "../lib/site-url.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";
import { productionOnly } from "../lib/deploy-guard.mjs"; // INFRA-1: 404 on deploy previews and branch deploys

function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

export default productionOnly(webOnly(async (request) => {
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
    // SRV-12: back to the site itself (lib/site-url.mjs).
    const origin = linkOrigin(request);

    const session =
      await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/?billing=returned`
      });

    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe customer portal error", error);
    reportError(error, { fn: "customer-portal", label: "Billing portal failed", status: error?.status });

    // PAY-10: our own 4xx texts are kept; Stripe and database messages are not shown.
    const failure = publicErrorBody(error, "Could not open the billing portal. Please try again or email support@cybernetai.app.");
    return json(failure.body, failure.status);
  }
}));

export const config = {
  path: "/api/customer-portal"
};
