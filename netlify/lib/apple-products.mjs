// The products the iPhone app sells with Apple In-App Purchase (StoreKit 2).
// One subscription group, "CyberNet AI Plans". Prices are set in App Store
// Connect, never here: the server only needs to know what each product unlocks.
//
// This table is mirrored in Swift (the app asks StoreKit for these ids), in the
// web layer, and in SQL (apply_apple_subscription in
// supabase/migrations/20261030120000_apple_iap.sql); tests/run-apple-iap.mjs
// compares this file with the SQL.
//
// Yearly Business is sold on the website only; the app does not sell it.

import { SEAT_POOL_LIMITS } from "./business-seats.mjs";

export const BUNDLE_ID = "app.cybernetai";
export const SUBSCRIPTION_GROUP = "CyberNet AI Plans";

const pro = (interval) => Object.freeze({ plan: "pro", interval, seats: null, dailyPoolLimit: null, recoveryPoolLimit: null });
const business = (seats) => Object.freeze({
  plan: "business",
  interval: "month",
  seats,
  dailyPoolLimit: SEAT_POOL_LIMITS[seats].dailyPoolLimit,
  recoveryPoolLimit: SEAT_POOL_LIMITS[seats].recoveryPoolLimit
});

export const PRODUCTS = Object.freeze({
  "app.cybernetai.pro.monthly": pro("month"),
  "app.cybernetai.pro.yearly": pro("year"),
  "app.cybernetai.business5.monthly": business(5),
  "app.cybernetai.business10.monthly": business(10),
  "app.cybernetai.business20.monthly": business(20)
});

export const PRODUCT_IDS = Object.freeze(Object.keys(PRODUCTS));

export function productFor(productId) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, productId) ? PRODUCTS[productId] : null;
}

// "pro" | "business" | null (not one of ours).
export function planForProduct(productId) {
  return productFor(productId)?.plan || null;
}

// The pools a Business product gives its team, or null for a Pro product.
export function seatPools(productId) {
  const product = productFor(productId);
  if (!product || product.plan !== "business") return null;
  return { seatTier: product.seats, dailyPoolLimit: product.dailyPoolLimit, recoveryPoolLimit: product.recoveryPoolLimit };
}
