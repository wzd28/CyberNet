// Records one verified Apple transaction in the database. Shared by
// netlify/functions/apple-verify.mjs (the app sends a StoreKit transaction) and
// netlify/functions/apple-notifications.mjs (Apple sends a notification).
//
// The user id is always the verified one (the signed-in caller, or the user the
// transaction's appAccountToken names after the token was checked); it is never
// copied from a request body. All the logic that decides what the subscription
// means (plan, seats, team, ordering) is in the SQL function
// public.apply_apple_subscription (supabase/migrations/20261030120000_apple_iap.sql).

import { serviceFetch as defaultServiceFetch } from "./supabase.mjs";

export class AppleApplyError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = "AppleApplyError";
    this.status = status;
  }
}

const iso = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);

// tx / renewal: the objects from decodeTransaction / decodeRenewalInfo.
// signedAtMs: when Apple signed the newest piece of data this call is based on
// (used to ignore data older than what is stored).
// Returns { result, entitled, businessAccountId } or throws AppleApplyError.
export async function applyAppleTransaction({ userId, tx, renewal = null, notificationType = null, signedAtMs, serviceFetch = defaultServiceFetch }) {
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
        p_purchase_date: tx.purchaseDate,
        p_expires_at: tx.expiresDate,
        p_revoked_at: tx.revocationDate,
        p_revocation_reason: tx.revocationReason,
        p_auto_renew: renewal ? renewal.autoRenew : null,
        p_grace_expires_at: renewal ? renewal.gracePeriodExpiresDate : null,
        p_signed_at: iso(signedAtMs ?? tx.signedAt),
        p_notification_type: notificationType
      })
    });
  } catch (error) {
    throw new AppleApplyError(`apply_apple_subscription unreachable: ${error?.message || error}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // Never include row data in the message; the code and text are enough.
    throw new AppleApplyError(`apply_apple_subscription failed (HTTP ${response.status}${payload?.code ? `, ${payload.code}` : ""})`);
  }
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row.result !== "string") throw new AppleApplyError("apply_apple_subscription returned no result");
  return { result: row.result, entitled: Boolean(row.entitled), businessAccountId: row.business_account_id || null };
}

// What the app is told about one transaction.
//   applied | stale | expired | revoked | wrong_account | conflict_web_plan | in_other_team
export function transactionStatus(applied, tx) {
  switch (applied.result) {
    case "applied":
      if (tx.revocationDate) return "revoked";
      return applied.entitled ? "applied" : "expired";
    case "stale":
      return "stale";
    case "conflict_web_plan":
      return "conflict_web_plan";
    case "in_other_team":
      return "in_other_team";
    default: // wrong_account, unknown_user
      return "wrong_account";
  }
}
