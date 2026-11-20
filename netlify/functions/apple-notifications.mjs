// POST /api/apple-notifications: App Store Server Notifications V2.
//
// Apple's server calls this URL (set by the owner in App Store Connect, for
// Production and Sandbox) when a Pro subscription is bought, renewed, changed,
// refunded, fails to renew or ends. It is the second way the server learns
// what a person has, next to the app's own sync (/api/apple-verify). There is
// no sign-in and no CORS: only Apple's signature (lib/apple-verify-jws.mjs,
// pinned Apple Root CA - G3; in Production the appAppleId must be ours) makes
// a request believable. No Apple API key is involved.
//
//   body  { "signedPayload": "<JWS>" }   (at most 100 KB, POST only)
//   200   processed, or nothing to do (duplicate, ignored type, other app,
//         unknown or deleted user). Never re-creates a deleted account.
//   400   not signed by Apple, malformed, or our bundle with another app id
//   500   the database failed or the Apple root certificate is not set up:
//         Apple delivers it again later (Production only; Sandbox sends once,
//         so the app's own sync is the safety net there)
//
// Every notificationUUID is stored in public.apple_notifications (no payload,
// no user id). A repeat of one that finished answers 200 and is not processed
// again; one that failed half-way (outcome 'error') is processed again.
//
// Who the subscription belongs to: the account the signed appAccountToken
// names (if it exists; this also moves a lapsed chain to a re-subscriber),
// else the account already stored for this chain. Everything else is decided
// in SQL (apply_apple_subscription).
//
// Nothing here cancels or refunds anything, at Apple or at Stripe.
// Logging: type, product and result only.

import { json, serviceFetch } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { verifyNotification, verifyTransaction, verifyRenewalInfo, AppleJwsError, MAX_NOTIFICATION_CHARS } from "../lib/apple-verify-jws.mjs";
import { applyAppleTransaction, AppleApplyError } from "../lib/apple-apply.mjs";

// Types that carry a transaction worth applying (server.md §4.2).
export const HANDLED_TYPES = Object.freeze([
  "SUBSCRIBED", "DID_RENEW", "DID_CHANGE_RENEWAL_STATUS", "DID_CHANGE_RENEWAL_PREF",
  "DID_FAIL_TO_RENEW", "GRACE_PERIOD_EXPIRED", "EXPIRED", "REFUND", "REVOKE",
  "REFUND_REVERSED", "RENEWAL_EXTENDED", "OFFER_REDEEMED"
]);

class DatabaseError extends Error {}

async function db(call, what) {
  let response;
  try {
    response = await call();
  } catch (error) {
    throw new DatabaseError(`${what} unreachable: ${error?.message || error}`);
  }
  if (!response.ok) throw new DatabaseError(`${what} failed (HTTP ${response.status})`);
  return response;
}

const iso = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null);

// Stores the notification id. True when this delivery should be processed:
// it is new, or an earlier delivery of it never finished.
async function claim(notification, originalTransactionId) {
  const response = await db(() => serviceFetch("/rest/v1/apple_notifications?on_conflict=notification_uuid", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      notification_uuid: notification.uuid,
      notification_type: notification.type,
      subtype: notification.subtype,
      environment: notification.environment,
      original_transaction_id: originalTransactionId,
      signed_date: iso(notification.signedAt),
      outcome: "error"
    })
  }), "Storing the notification");
  const inserted = await response.json().catch(() => []);
  if (Array.isArray(inserted) && inserted.length) return true;
  const existing = await db(
    () => serviceFetch(`/rest/v1/apple_notifications?notification_uuid=eq.${encodeURIComponent(notification.uuid)}&select=outcome`),
    "Reading the notification"
  );
  const rows = await existing.json().catch(() => []);
  return Array.isArray(rows) && rows[0]?.outcome === "error";
}

async function finish(notification, outcome) {
  try {
    await db(() => serviceFetch(`/rest/v1/apple_notifications?notification_uuid=eq.${encodeURIComponent(notification.uuid)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ outcome })
    }), "Updating the notification");
  } catch (error) {
    // The subscription itself is recorded; a row left at 'error' is only
    // processed once more on Apple's retry, which the ordering rules make harmless.
    console.error("CyberNet apple-notifications: could not store the outcome", error.message);
  }
}

async function storedOwner(originalTransactionId) {
  const response = await db(
    () => serviceFetch(`/rest/v1/apple_subscriptions?original_transaction_id=eq.${encodeURIComponent(originalTransactionId)}&select=user_id`),
    "Looking up the subscription"
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows[0]?.user_id ? String(rows[0].user_id).toLowerCase() : null;
}

const reply = (outcome) => json({ received: true, outcome }, 200);

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (Number(request.headers.get("content-length") || 0) > MAX_NOTIFICATION_CHARS + 1024) return json({ error: "Request is too large." }, 413);
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "The request could not be read." }, 400);
  }
  if (raw.length > MAX_NOTIFICATION_CHARS + 1024) return json({ error: "Request is too large." }, 413);
  let signedPayload = "";
  try {
    const body = JSON.parse(raw);
    signedPayload = typeof body?.signedPayload === "string" ? body.signedPayload : "";
  } catch {
    signedPayload = "";
  }
  if (!signedPayload) return json({ error: "Missing signedPayload." }, 400);

  let notification;
  let tx = null;
  let renewal = null;
  try {
    const decoded = await verifyNotification(signedPayload);
    if (!decoded.ok) {
      // Another app, a summary without a transaction, or an environment we do
      // not handle: nothing to do (and nothing is stored).
      console.log(`apple-notifications: ignored (${decoded.reason})`);
      return reply("ignored");
    }
    notification = decoded.notification;
    if (HANDLED_TYPES.includes(notification.type) && notification.signedTransactionInfo) {
      const decodedTx = await verifyTransaction(notification.signedTransactionInfo);
      if (decodedTx.ok && decodedTx.tx.environment === notification.environment) tx = decodedTx.tx;
      else console.log(`apple-notifications: ${notification.type} transaction not ours (${decodedTx.reason || "environment"})`);
      if (tx && notification.signedRenewalInfo) {
        const decodedRenewal = await verifyRenewalInfo(notification.signedRenewalInfo, { environment: tx.environment });
        if (decodedRenewal.ok && decodedRenewal.renewal.originalTransactionId === tx.originalTransactionId) renewal = decodedRenewal.renewal;
      }
    }
  } catch (error) {
    if (error instanceof AppleJwsError) {
      if (error.code === "root_not_configured") {
        console.error("CyberNet apple-notifications: the Apple root certificate is not embedded on the server");
        reportError("Apple root certificate is not embedded; notifications cannot be verified", { fn: "apple-notifications", label: "Apple root certificate missing" });
        return json({ error: "Not available right now." }, 500);
      }
      if (error.code === "verify_error") {
        // The check itself failed (not a verdict on the signature): Apple retries.
        console.error("CyberNet apple-notifications: the signature check failed unexpectedly", error.message);
        reportError(error, { fn: "apple-notifications", label: "Apple notification could not be checked" });
        return json({ error: "Try again later." }, 500);
      }
      if (error.code === "wrong_app") {
        console.error("CyberNet apple-notifications: a notification for our bundle carries another app id");
        reportError("Apple notification carries an unexpected app id", { fn: "apple-notifications", label: "Apple notification app id mismatch" });
      } else {
        console.warn(`apple-notifications: refused (${error.code})`);
      }
      return json({ error: "Invalid notification." }, 400);
    }
    console.error("CyberNet apple-notifications failed while reading", error?.message || error);
    reportError(error, { fn: "apple-notifications", label: "Apple notification could not be read" });
    return json({ error: "Try again later." }, 500);
  }

  try {
    const fresh = await claim(notification, tx?.originalTransactionId || null);
    if (!fresh) {
      console.log(`apple-notifications: ${notification.type} duplicate`);
      return reply("duplicate");
    }
    if (!tx) {
      await finish(notification, "ignored");
      console.log(`apple-notifications: ${notification.type} ignored`);
      return reply("ignored");
    }

    // REFUND / REVOKE end Pro at once: the transaction should carry the
    // revocation date; if it does not, the notification's own date is used.
    let applyTx = tx;
    if ((notification.type === "REFUND" || notification.type === "REVOKE") && !applyTx.revocationDate) {
      applyTx = { ...applyTx, revocationDate: iso(notification.signedAt) };
    } else if (notification.type === "REFUND_REVERSED") {
      applyTx = { ...applyTx, revocationDate: null, revocationReason: null };
    }

    const owner = await storedOwner(applyTx.originalTransactionId);
    const candidates = [...new Set([applyTx.appAccountToken, owner].filter(Boolean))];
    let applied = { result: "unknown_user", entitled: false };
    for (const userId of candidates) {
      applied = await applyAppleTransaction({
        userId,
        tx: applyTx,
        renewal,
        source: "notification",
        notificationType: notification.type,
        signedAtMs: notification.signedAt
      });
      if (applied.result !== "unknown_user" && applied.result !== "wrong_account") break;
    }
    const outcome = ["applied", "stale", "unknown_user", "wrong_account"].includes(applied.result) ? applied.result : "ignored";
    await finish(notification, outcome);
    console.log(`apple-notifications: ${notification.type}${notification.subtype ? `/${notification.subtype}` : ""} ${applyTx.productId} ${outcome}`);
    return reply(outcome);
  } catch (error) {
    if (error instanceof DatabaseError || error instanceof AppleApplyError) {
      console.error("CyberNet apple-notifications: database step failed", error.message);
      reportError(error, { fn: "apple-notifications", label: "Apple notification could not be recorded" });
      return json({ error: "Try again later." }, 500);
    }
    console.error("CyberNet apple-notifications failed", error?.message || error);
    reportError(error, { fn: "apple-notifications", label: "Apple notification failed" });
    return json({ error: "Try again later." }, 500);
  }
}

export const config = {
  path: "/api/apple-notifications"
};
