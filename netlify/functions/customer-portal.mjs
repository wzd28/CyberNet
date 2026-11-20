import Stripe from "stripe";

import {
  json,
  verifyUser,
  getProfile
} from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";
import { loadEntitlement } from "../lib/entitlement.mjs";

export const BILLED_BY_APPLE_MESSAGE =
  "Your CyberNet AI Pro subscription is billed by Apple, so it is managed on your iPhone: " +
  "Settings > your name > Subscriptions, or at apps.apple.com/account/subscriptions.";

function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

export default webOnly(async (request) => {
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
      // Pro bought in the iPhone app: Stripe has nothing to manage. Never
      // cancels anything; it only says where the subscription is managed.
      const entitlement = await loadEntitlement(user.id, { profile });
      if (entitlement.appleActive) {
        return json({ error: BILLED_BY_APPLE_MESSAGE, code: "BILLED_BY_APPLE" }, 409);
      }

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
    reportError(error, { fn: "customer-portal", label: "Billing portal failed", status: error?.status });

    return json(
      {
        error:
          error.message ||
          "Could not open the billing portal."
      },
      Number(error.statusCode || error.status) || 500
    );
  }
});

export const config = {
  path: "/api/customer-portal"
};
