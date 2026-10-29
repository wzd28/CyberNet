// Immediate cancellation of a deleted account's Stripe subscriptions
// (owner answer 7, 29 Oct 2026; BUILD-PLAN §8.5; App Review 5.1.1(v)).
//
// "Delete account" cancels every open subscription the account pays for, at
// once and without a refund or credit for unused time, then deletes the
// account. Stripe keeps its own billing records.
//
// Uses the existing `stripe` dependency and STRIPE_SECRET_KEY, which only the
// owner sets in Netlify. The SDK is given a fetch-based HTTP client so the
// tests can answer for Stripe without any network.

import Stripe from "stripe";

// Statuses after which Stripe never bills again. Everything else (active,
// trialing, past_due, unpaid, incomplete, paused, or a status Stripe adds
// later) is still open and is cancelled.
export const CLOSED_STRIPE_STATUSES = Object.freeze(["canceled", "incomplete_expired"]);

export function makeStripe(secret) {
  return new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient((url, init) => globalThis.fetch(url, init)),
    maxNetworkRetries: 1,
    timeout: 8000
  });
}

const isClosed = (status) => CLOSED_STRIPE_STATUSES.includes(String(status || "").toLowerCase());

// Cancels one subscription now. A subscription that is already gone or
// already ended counts as done; anything else that fails throws.
async function cancelOne(stripe, id) {
  try {
    const sub = await stripe.subscriptions.cancel(id, { invoice_now: false, prorate: false });
    return { id, status: sub?.status || "canceled", already: false };
  } catch (error) {
    if (error?.code === "resource_missing") return { id, status: "missing", already: true };
    if (error?.type === "StripeInvalidRequestError") {
      // For example "already canceled": check what Stripe says it is now.
      const current = await stripe.subscriptions.retrieve(id);
      if (isClosed(current?.status)) return { id, status: current.status, already: true };
    }
    throw error;
  }
}

// subscriptionIds: ids the database says are open. customerIds: the
// account's Stripe customers; each one is also listed at Stripe, so an open
// subscription the database missed (a lost webhook) is cancelled too.
// Returns the subscriptions that were open and are now cancelled.
export async function cancelOpenSubscriptions(stripe, { subscriptionIds = [], customerIds = [] } = {}) {
  const ids = new Set(subscriptionIds.map((value) => String(value || "").trim()).filter((value) => /^sub_[\w]+$/.test(value)));
  for (const customer of new Set(customerIds.map((value) => String(value || "").trim()).filter((value) => /^cus_[\w]+$/.test(value)))) {
    for await (const sub of stripe.subscriptions.list({ customer, status: "all", limit: 100 })) {
      if (sub?.id && !isClosed(sub.status)) ids.add(sub.id);
    }
  }
  const results = [];
  for (const id of ids) results.push(await cancelOne(stripe, id));
  return results;
}
