import Stripe from "stripe";

import {
  json,
  verifyUser,
  getProfile,
  updateProfile,
  effectivePlan,
  serviceFetch,
  getActiveTeamMembership
} from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";

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

// ── One paid plan per person ──
// Stripe statuses where a subscription is still alive and will (or may) bill
// again. past_due and unpaid are included: Stripe keeps retrying the card, so a
// second checkout would leave two subscriptions billing the same person.
const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid"];
const MANAGE_BILLING = "Account → Manage Billing";

function planName(plan) {
  return plan === "business" ? "Business" : "Pro";
}

function alreadySubscribed(plan, status) {
  if (status === "past_due" || status === "unpaid") {
    return json({
      error:
        `Your CyberNet AI ${planName(plan)} plan has a payment that didn't go through. ` +
        `Update your card from ${MANAGE_BILLING} (or email support@cybernetai.app) to keep it. Starting a new checkout would charge you twice.`,
      code: "PAYMENT_PAST_DUE"
    }, 409);
  }

  return json({
    error:
      `You already have an active CyberNet AI ${planName(plan)} plan, so a second checkout would charge you twice. ` +
      `Manage it from ${MANAGE_BILLING}, or email support@cybernetai.app to switch plans.`,
    code: "ALREADY_SUBSCRIBED"
  }, 409);
}

async function readRows(response, message) {
  const rows = await response.json().catch(() => null);
  // Fail closed: an outage must never read as "this person has no plan".
  if (!response.ok || !Array.isArray(rows)) {
    const error = new Error(message);
    error.status = 503;
    throw error;
  }
  return rows;
}

// What the database already knows: the profile's own subscription (Pro), a
// Business team this person owns and pays for, or a team that covers them.
// Returns a 409 Response, or null when a new checkout is safe.
async function existingPlanBlock(user, profile) {
  const ownStatus = String(profile.subscription_status || "");

  if (profile.stripe_subscription_id && LIVE_SUBSCRIPTION_STATUSES.includes(ownStatus)) {
    return alreadySubscribed("pro", ownStatus);
  }

  const owned = await readRows(
    await serviceFetch(
      `/rest/v1/business_accounts?owner_user_id=eq.${encodeURIComponent(user.id)}` +
      `&subscription_status=in.(${LIVE_SUBSCRIPTION_STATUSES.join(",")})` +
      "&select=id,subscription_status"
    ),
    "Could not check your current plan. Please try again in a moment."
  );

  if (owned[0]) {
    return alreadySubscribed("business", String(owned[0].subscription_status || ""));
  }

  const membership = await getActiveTeamMembership(user.id);

  if (membership?.role === "owner") {
    return alreadySubscribed("business", "active");
  }

  if (membership) {
    return json({
      error:
        "Your Business team already covers you, so there's nothing to buy. " +
        "If you want a plan of your own, ask your team owner to remove you from the team first.",
      code: "TEAM_MEMBER"
    }, 409);
  }

  return null;
}

// What Stripe knows: the database can lag behind it (a delayed or failed
// webhook right after paying), so a customer who already exists in Stripe is
// checked there too. Read-only.
async function stripePlanBlock(stripe, profile) {
  const customerId = profile.stripe_customer_id || "";
  if (!customerId) return null;

  let subscriptions;
  try {
    subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
  } catch (error) {
    if (error?.code === "resource_missing") return null;
    throw error;
  }

  const live = (subscriptions?.data || []).find((sub) =>
    LIVE_SUBSCRIPTION_STATUSES.includes(String(sub.status || ""))
  );
  if (!live) return null;

  const lookupKey = String(live.items?.data?.[0]?.price?.lookup_key || "");
  return alreadySubscribed(lookupKey.includes("business") ? "business" : "pro", String(live.status));
}

export default webOnly(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let debugUserId = null;
  let debugLookupKey = null;
  let debugCycle = null;
  let debugTargetPlan = null;

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
    debugUserId = user.id;
    const profile = await getProfile(user);
    const currentPlan = effectivePlan(profile);

    const body = await request.json().catch(() => ({}));
    const cycle = body.cycle === "yearly" ? "yearly" : "monthly";
    const targetPlan = body.plan === "business" ? "business" : "pro";
    debugCycle = cycle;
    debugTargetPlan = targetPlan;

    const blocked = await existingPlanBlock(user, profile);
    if (blocked) return blocked;

    if (currentPlan === targetPlan) {
      return alreadySubscribed(targetPlan, "active");
    }

    const seatTier = targetPlan === "business" ? (Number(body.seatTier) || 5) : null;
    if (targetPlan === "business" && ![5, 10, 20].includes(seatTier)) {
      return json(
        { error: "Invalid seat tier. Choose 5, 10, or 20 seats, or email support@cybernetai.app for a custom plan." },
        400
      );
    }

    // 5-seat keeps the existing lookup keys unchanged (tierSuffix empty);
    // 10/20-seat use the new keys created for those tiers.
    const tierSuffix = seatTier && seatTier !== 5 ? `_${seatTier}seat` : "";

    const lookupKey = targetPlan === "business"
      ? (
          cycle === "yearly"
            ? (env(`STRIPE_BUSINESS${tierSuffix.toUpperCase()}_YEARLY_LOOKUP_KEY`) || `cybernet_ai_business${tierSuffix}_yearly`)
            : (env(`STRIPE_BUSINESS${tierSuffix.toUpperCase()}_MONTHLY_LOOKUP_KEY`) || `cybernet_ai_business${tierSuffix}_monthly`)
        )
      : (
          cycle === "yearly"
            ? (env("STRIPE_PRO_YEARLY_LOOKUP_KEY") || "cybernet_ai_pro_yearly")
            : (env("STRIPE_PRO_MONTHLY_LOOKUP_KEY") || "cybernet_ai_pro_monthly")
        );
    debugLookupKey = lookupKey;

    const stripe = new Stripe(secret);

    const stripeBlocked = await stripePlanBlock(stripe, profile);
    if (stripeBlocked) return stripeBlocked;

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
      allow_promotion_codes: true,
      // Stripe shows the Stripe account's business name on this page. This adds
      // the trading relationship underneath it, so the customer can see that the
      // CyberNet AI they signed up for and the entity taking the payment are the
      // same business — which is also what stops the charge looking unfamiliar
      // on a bank statement later.
      custom_text: {
        submit: {
          message: "CyberNet AI is operated under Marks Events FZ LLE."
        }
      },
      metadata: {
        supabase_user_id: user.id,
        cycle,
        plan: targetPlan,
        ...(seatTier ? { seat_tier: String(seatTier) } : {})
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          cycle,
          plan: targetPlan,
          ...(seatTier ? { seat_tier: String(seatTier) } : {})
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
    // A 401 here is a signed-out visitor, not a fault.
    reportError(error, { fn: "create-checkout-session", label: "Checkout session failed", status: error?.status });

    try {
      await serviceFetch("/rest/v1/checkout_debug_log", {
        method: "POST",
        body: JSON.stringify({
          user_id: debugUserId,
          lookup_key: debugLookupKey,
          cycle: debugCycle,
          target_plan: debugTargetPlan,
          error_type: error.type || error.name || null,
          error_code: error.code || null,
          error_message: error.message || null,
          error_raw: error.raw ? JSON.stringify(error.raw) : null
        })
      });
    } catch (logError) {
      console.error("Failed to write checkout debug log", logError);
      reportError(logError, { fn: "create-checkout-session", label: "Checkout debug log write failed" });
    }

    return json(
      {
        error:
          error.message ||
          "Could not create Stripe Checkout."
      },
      Number(error.statusCode || error.status) || 500
    );
  }
});

export const config = {
  path: "/api/create-checkout-session"
};
