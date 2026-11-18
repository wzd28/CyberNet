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

// ── Duplicate-plan guard ──
// Owner's rules: never stop a customer from buying or upgrading a plan, and
// never cancel a plan anyone has. So this guard only ever answers a checkout
// request; nothing here cancels, pauses or changes a subscription (every Stripe
// call it makes is a read).
//
//   same tier, live            → 409 ALREADY_SUBSCRIBED (an exact duplicate)
//   same tier, payment failing → 409 PAYMENT_PAST_DUE (Stripe is still retrying
//                                the card; a second identical subscription would
//                                bill twice once the retry succeeds). The database
//                                alone never decides this one: a card declined at
//                                the very first payment also leaves "past due"
//                                behind with nothing live in Stripe, so Stripe is
//                                asked, and the sale goes ahead when it has no
//                                live plan of that tier.
//   member of someone else's team buying Business → 409 TEAM_MEMBER (one person
//                                cannot be in two teams, so the new team would
//                                be paid for and never set up)
//   a different tier           → 409 CONFIRM_SECOND_PLAN until the request
//                                carries confirmSecondPlan: true, then checkout
//                                opens normally
//
// Stripe statuses where a subscription is still alive and will (or may) bill.
const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid"];
const PAST_DUE_STATUSES = ["past_due", "unpaid"];
const MANAGE_BILLING = "Account → Manage billing";

function planName(plan) {
  return plan === "business" ? "Business" : "Pro";
}

function tierOfLookupKey(lookupKey) {
  return String(lookupKey || "").includes("business") ? "business" : "pro";
}

function refuseDuplicate(plan, pastDue) {
  if (pastDue) {
    return json({
      error:
        `Your CyberNet AI ${planName(plan)} plan has a payment that didn't go through. ` +
        `Update your card from ${MANAGE_BILLING} (or email support@cybernetai.app) to keep it. ` +
        `Buying ${planName(plan)} again would charge you twice.`,
      code: "PAYMENT_PAST_DUE",
      currentPlan: planName(plan)
    }, 409);
  }

  return json({
    error:
      `You already have CyberNet AI ${planName(plan)}, so buying it again would charge you twice. ` +
      `Manage your plan from ${MANAGE_BILLING}.`,
    code: "ALREADY_SUBSCRIBED",
    currentPlan: planName(plan)
  }, 409);
}

function refuseTeamMember() {
  return json({
    error:
      "Your team already covers you. To get your own Business plan, ask your team owner to remove you first.",
    code: "TEAM_MEMBER",
    currentPlan: "Business"
  }, 409);
}

function askToConfirm(currentPlan, targetPlan, viaTeam) {
  const current = planName(currentPlan);
  const target = planName(targetPlan);

  return json({
    error: viaTeam
      ? `Your team's CyberNet AI Business plan already covers you. Buying ${target} adds a subscription of your own; ` +
        "it does not change your team. Continue anyway?"
      : `You already have CyberNet AI ${current}. Buying ${target} adds a second subscription; it does not replace ${current}. ` +
        `You can manage ${current} from ${MANAGE_BILLING}. Continue anyway?`,
    code: "CONFIRM_SECOND_PLAN",
    currentPlan: current,
    targetPlan: target,
    viaTeam: Boolean(viaTeam)
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

// What the database knows. Returns the plans this person pays for
// ([{ tier, status }]) and whether someone else's Business team covers them.
// Throws (503) when a lookup fails, so an outage is never read as "no plan".
async function plansInDatabase(user, profile) {
  const plans = [];
  const ownStatus = String(profile.subscription_status || "");

  // The profile row carries the person's own subscription: Pro, unless the
  // profile itself names another tier. A plan granted on the profile without a
  // subscription id still counts.
  const granted = effectivePlan(profile);

  if (profile.stripe_subscription_id && LIVE_SUBSCRIPTION_STATUSES.includes(ownStatus)) {
    plans.push({ tier: granted !== "free" ? granted : "pro", status: ownStatus });
  } else if (granted !== "free") {
    plans.push({ tier: granted, status: "active" });
  }

  const owned = await readRows(
    await serviceFetch(
      `/rest/v1/business_accounts?owner_user_id=eq.${encodeURIComponent(user.id)}` +
      `&subscription_status=in.(${LIVE_SUBSCRIPTION_STATUSES.join(",")})` +
      "&select=id,subscription_status"
    ),
    "Could not check your current plan. Please try again in a moment."
  );

  for (const team of owned) {
    plans.push({ tier: "business", status: String(team.subscription_status || "") });
  }

  const membership = await getActiveTeamMembership(user.id);

  if (membership?.role === "owner" && !owned.length) {
    plans.push({ tier: "business", status: "active" });
  }

  return { plans, teamMember: Boolean(membership) && membership.role !== "owner" };
}

// What Stripe knows: the database can lag behind it (a delayed or failed
// webhook right after paying), so a customer who already exists in Stripe is
// checked there too. Read-only: it only lists.
async function plansInStripe(stripe, profile) {
  const customerId = profile.stripe_customer_id || "";
  if (!customerId) return [];

  let subscriptions;
  try {
    subscriptions = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
  } catch (error) {
    if (error?.code === "resource_missing") return [];
    throw error;
  }

  return (subscriptions?.data || [])
    .filter((sub) => LIVE_SUBSCRIPTION_STATUSES.includes(String(sub.status || "")))
    .map((sub) => ({
      tier: tierOfLookupKey(sub.items?.data?.[0]?.price?.lookup_key),
      status: String(sub.status)
    }));
}

// True when all the database knows of the target tier is a failing payment.
function onlyPastDue(plans, targetPlan) {
  const sameTier = plans.filter((p) => p.tier === targetPlan);
  return sameTier.length > 0 && sameTier.every((p) => PAST_DUE_STATUSES.includes(p.status));
}

// Returns a 409 Response, or null when checkout may open.
function checkoutBlock({ plans, teamMember }, targetPlan, confirmed) {
  const sameTier = plans.filter((p) => p.tier === targetPlan);

  if (sameTier.length) {
    // A healthy duplicate is reported as such; otherwise the card needs fixing.
    return refuseDuplicate(targetPlan, sameTier.every((p) => PAST_DUE_STATUSES.includes(p.status)));
  }

  if (teamMember && targetPlan === "business") return refuseTeamMember();

  if (confirmed) return null;

  const other = plans.find((p) => p.tier !== targetPlan);
  if (other) return askToConfirm(other.tier, targetPlan, false);
  if (teamMember) return askToConfirm("business", targetPlan, true);

  return null;
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

    const body = await request.json().catch(() => ({}));
    const cycle = body.cycle === "yearly" ? "yearly" : "monthly";
    const targetPlan = body.plan === "business" ? "business" : "pro";
    debugCycle = cycle;
    debugTargetPlan = targetPlan;

    // Only an explicit true counts as "yes, add a second plan".
    const confirmSecondPlan = body.confirmSecondPlan === true;

    let known = await plansInDatabase(user, profile);
    let stripe = null;
    let stripePlans = null;

    // "Past due" in the database can be stale (the webhook writes it for any
    // failed invoice, including a first payment that never started a plan), so
    // Stripe has the last word before a sale is refused for it. Without a Stripe
    // customer to ask, or if Stripe cannot be read, nothing opens.
    if (onlyPastDue(known.plans, targetPlan) && profile.stripe_customer_id) {
      stripe = new Stripe(secret);
      stripePlans = await plansInStripe(stripe, profile);

      if (!stripePlans.some((p) => p.tier === targetPlan)) {
        known = { ...known, plans: known.plans.filter((p) => p.tier !== targetPlan) };
      }
    }

    const blocked = checkoutBlock(
      // Stripe's own status wins for the tier it was asked about.
      stripePlans?.some((p) => p.tier === targetPlan)
        ? { ...known, plans: [...known.plans.filter((p) => p.tier !== targetPlan), ...stripePlans.filter((p) => p.tier === targetPlan)] }
        : known,
      targetPlan,
      confirmSecondPlan
    );
    if (blocked) return blocked;

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

    if (!stripe) stripe = new Stripe(secret);
    if (!stripePlans) stripePlans = await plansInStripe(stripe, profile);

    const stripeBlocked = checkoutBlock(
      { plans: stripePlans, teamMember: known.teamMember },
      targetPlan,
      confirmSecondPlan
    );
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
