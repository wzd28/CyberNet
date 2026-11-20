// What the iPhone app sells with Apple In-App Purchase (StoreKit 2): CyberNet
// AI Pro only, monthly or yearly, in one subscription group. Business is sold
// on the website only. Prices are set in App Store Connect, never here.
//
// These are public constants, deliberately not environment variables, so the
// app's behaviour cannot be switched remotely (App Review 2.5.19 / 2.3.1).
// The same two ids are hard-coded in the SQL check of public.apple_subscriptions
// (supabase/migrations/20261121120000_apple_iap_pro.sql); tests/run-apple-iap.mjs
// compares them.

export const BUNDLE_ID = "app.cybernetai"; // mobile/capacitor.config.ts appId
export const APP_APPLE_ID = 6828596086; // App Store Connect > App Information > Apple ID

export const PRO_PRODUCT_IDS = Object.freeze(["app.cybernetai.pro.monthly", "app.cybernetai.pro.yearly"]);

export function isProProduct(productId) {
  return typeof productId === "string" && PRO_PRODUCT_IDS.includes(productId);
}
