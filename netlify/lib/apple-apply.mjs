// Records one VERIFIED Apple transaction in the database. Shared by
// netlify/functions/apple-verify.mjs (the app sends StoreKit data) and
// netlify/functions/apple-notifications.mjs (Apple's server sends a
// notification). The user id is always decided by the caller from verified
// data (the signed-in token, the signed appAccountToken, or the stored owner),
// never copied from a request body. Every ownership and ordering rule lives in
// public.apply_apple_subscription (supabase/migrations/20261121120000_apple_iap_pro.sql).
//
// Nothing here cancels, refunds or changes anything at Apple or Stripe.

import { serviceFetch as defaultServiceFetch } from "./supabase.mjs";

export class AppleApplyError extends Error {
  constructor(message) {
    super(message);
    this.name = "AppleApplyError";
  }
}

export const SOURCES = Object.freeze(["purchase", "app", "notification"]);
const iso = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);

// -> { result: applied|stale|wrong_account|unknown_user|not_linked, entitled }
export async function applyAppleTransaction({ userId, tx, renewal = null, source, notificationType = null, signedAtMs = null, serviceFetch = defaultServiceFetch }) {
  if (!SOURCES.includes(source)) throw new AppleApplyError(`bad source ${source}`);
  const signed = Math.max(Number(tx.signedAt) || 0, Number(renewal?.signedAt) || 0, Number(signedAtMs) || 0);
  let response;
  try {
    response = await serviceFetch("/rest/v1/rpc/apply_apple_subscription", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_user_id: userId,
        p_original_transaction_id: tx.originalTransactionId,
        p_latest_transaction_id: tx.transactionId,
        p_product_id: tx.productId,
        p_environment: tx.environment,
        p_app_account_token: tx.appAccountToken || null,
        p_purchase_date: tx.purchaseDate,
        p_original_purchase_date: tx.originalPurchaseDate,
        p_expires_at: tx.expiresDate,
        p_revoked_at: tx.revocationDate,
        p_revocation_reason: tx.revocationReason,
        p_auto_renew: renewal ? renewal.autoRenew : null,
        p_auto_renew_product_id: renewal ? renewal.autoRenewProductId : null,
        p_grace_expires_at: renewal ? renewal.gracePeriodExpiresDate : null,
        p_billing_retry: renewal ? renewal.isInBillingRetryPeriod : null,
        p_signed_at: iso(signed),
        p_source: source,
        p_notification_type: notificationType
      })
    });
  } catch (error) {
    throw new AppleApplyError(`apply_apple_subscription unreachable: ${error?.message || error}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // Never include row data in the message.
    throw new AppleApplyError(`apply_apple_subscription failed (HTTP ${response.status}${payload?.code ? `, ${payload.code}` : ""})`);
  }
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row.result !== "string") throw new AppleApplyError("apply_apple_subscription returned no result");
  return { result: row.result, entitled: Boolean(row.entitled) };
}

// What the app is told about one transaction (apple-verify results[].status):
//   applied | expired | revoked | stale | wrong_account | not_linked
export function transactionStatus(applied, tx) {
  switch (applied.result) {
    case "applied":
      if (tx.revocationDate) return "revoked";
      return applied.entitled ? "applied" : "expired";
    case "stale":
      return "stale";
    case "not_linked":
      return "not_linked";
    default: // wrong_account, unknown_user (the signed-in account vanished mid-call)
      return "wrong_account";
  }
}
