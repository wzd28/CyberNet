// POST /api/apple-notifications: App Store Server Notifications V2.
//
// Apple calls this URL (set in App Store Connect, Production and Sandbox) when a
// subscription is bought, renewed, cancelled, refunded, fails to renew, and so
// on. It is the second way the server learns what a person has, next to the app
// sending its StoreKit data to /api/apple-verify. There is no sign-in and no
// CORS: the only thing that makes a request believable is Apple's signature on
// the JWS in the body (netlify/lib/apple-jws.mjs). No Apple API key is involved.
//
//   body      { "signedPayload": "<JWS>" }   (at most 100 KB, POST only)
//   200       processed, or nothing to do (duplicate, ignored type, other app,
//             unknown or deleted user)
//   400       not signed by Apple / malformed
//   500       the database failed or the Apple root certificate is not set up:
//             Apple delivers the notification again later
//
// Every notificationUUID is stored in public.apple_notifications. A repeated
// delivery of one that finished is answered 200 and not processed again; one
// that failed halfway (outcome stays 'error') is processed again.
//
// Handled types: SUBSCRIBED, DID_RENEW, DID_CHANGE_RENEWAL_STATUS,
// DID_CHANGE_RENEWAL_PREF, DID_FAIL_TO_RENEW (a GRACE_PERIOD subtype keeps
// access), GRACE_PERIOD_EXPIRED, EXPIRED, REFUND, REVOKE, REFUND_REVERSED,
// RENEWAL_EXTENDED, OFFER_REDEEMED. TEST, PRICE_INCREASE, CONSUMPTION_REQUEST,
// REFUND_DECLINED and the rest are recorded as ignored.
//
// Optional hardening: APPLE_APP_APPLE_ID (the app's numeric Apple ID, public,
// not a secret). When set, a Production notification must carry the same id.

import { json, serviceFetch } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { decodeNotification, decodeTransaction, decodeRenewalInfo, AppleJwsError, isUuid } from "../lib/apple-jws.mjs";
import { applyAppleTransaction, AppleApplyError } from "../lib/apple-apply.mjs";

export const HANDLED_TYPES = Object.freeze([
  "SUBSCRIBED", "DID_RENEW", "DID_CHANGE_RENEWAL_STATUS", "DID_CHANGE_RENEWAL_PREF",
  "DID_FAIL_TO_RENEW", "GRACE_PERIOD_EXPIRED", "EXPIRED", "REFUND", "REVOKE",
  "REFUND_REVERSED", "RENEWAL_EXTENDED", "OFFER_REDEEMED"
]);

const MAX_BODY_BYTES = 100 * 1024;

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}

class DatabaseError extends Error {}

// Runs one database call (a function that makes it) and turns a failure into DatabaseError.
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

// Stores the notification id. Returns true when this delivery should be
// processed: it is new, or an earlier delivery of it never finished.
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

async function finish(notification, outcome, originalTransactionId = null) {
  try {
    await db(() => serviceFetch(`/rest/v1/apple_notifications?notification_uuid=eq.${encodeURIComponent(notification.uuid)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ outcome, ...(originalTransactionId ? { original_transaction_id: originalTransactionId } : {}) })
    }), "Updating the notification");
  } catch (error) {
    // The subscription itself is already recorded; a row left at 'error' is
    // only ever processed once more, which is harmless.
    console.error("CyberNet apple-notifications: could not store the outcome", error.message);
  }
}

// The account the subscription belongs to: the appAccountToken the app set at
// purchase, otherwise the account already linked to this subscription.
async function knownOwner(originalTransactionId) {
  const response = await db(
    () => serviceFetch(`/rest/v1/apple_subscriptions?original_transaction_id=eq.${encodeURIComponent(originalTransactionId)}&select=user_id`),
    "Looking up the subscription"
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows[0]?.user_id ? String(rows[0].user_id).toLowerCase() : null;
}

function reply(outcome, status = 200, extra = {}) {
  return json({ received: status === 200, outcome, ...extra }, status);
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413);
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "The request could not be read." }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413);
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
    const decoded = decodeNotification(signedPayload);
    if (!decoded.ok) {
      if (decoded.reason === "malformed") return json({ error: "Malformed notification." }, 400);
      // Signed by Apple but about another app, or a notification with no
      // transaction (a summary): nothing for this server to do.
      console.log(`apple-notifications: ignored (${decoded.reason})`);
      return reply("ignored");
    }
    notification = decoded.notification;

    const expectedAppId = env("APPLE_APP_APPLE_ID");
    if (expectedAppId && notification.environment === "Production" && notification.appAppleId !== expectedAppId) {
      console.error("CyberNet apple-notifications: a Production notification carries another app id");
      reportError("Apple notification carries an unexpected app id", { fn: "apple-notifications", label: "Apple notification app id mismatch" });
      return json({ error: "Unexpected app." }, 400);
    }

    if (HANDLED_TYPES.includes(notification.type) && notification.signedTransactionInfo) {
      const decodedTx = decodeTransaction(notification.signedTransactionInfo);
      if (decodedTx.ok) tx = decodedTx.tx;
      else console.log(`apple-notifications: ${notification.type} transaction not ours (${decodedTx.reason})`);
      if (notification.signedRenewalInfo) {
        const decodedRenewal = decodeRenewalInfo(notification.signedRenewalInfo);
        if (decodedRenewal.ok) renewal = decodedRenewal.renewal;
      }
    }
  } catch (error) {
    if (error instanceof AppleJwsError) {
      if (error.code === "root_not_configured") {
        console.error("CyberNet apple-notifications: the Apple root certificate is not embedded on the server");
        reportError("Apple root certificate is not embedded; notifications cannot be verified", { fn: "apple-notifications", label: "Apple root certificate missing" });
        return json({ error: "Not available right now." }, 500);
      }
      console.warn(`apple-notifications: refused (${error.code})`);
      return json({ error: "Invalid notification." }, 400);
    }
    console.error("CyberNet apple-notifications failed while reading", error?.message || error);
    reportError(error, { fn: "apple-notifications", label: "Apple notification could not be read" });
    return json({ error: "Try again later." }, 500);
  }

  try {
    const handled = HANDLED_TYPES.includes(notification.type) && tx;
    const fresh = await claim(notification, tx?.originalTransactionId || null);
    if (!fresh) {
      console.log(`apple-notifications: ${notification.type} duplicate`);
      return reply("duplicate");
    }
    if (!handled) {
      await finish(notification, "ignored");
      console.log(`apple-notifications: ${notification.type} ignored`);
      return reply("ignored");
    }

    // Only the two revocation types end an entitlement by themselves; the
    // transaction should say so, and if it does not, the notification does.
    let applyTx = tx;
    if ((notification.type === "REFUND" || notification.type === "REVOKE") && !applyTx.revocationDate) {
      applyTx = { ...applyTx, revocationDate: iso(notification.signedAt) };
    } else if (notification.type === "REFUND_REVERSED") {
      applyTx = { ...applyTx, revocationDate: null, revocationReason: null };
    }

    const token = applyTx.appAccountToken && isUuid(applyTx.appAccountToken) ? applyTx.appAccountToken : null;
    const userId = token || (await knownOwner(applyTx.originalTransactionId));
    if (!userId) {
      await finish(notification, "unknown_user", applyTx.originalTransactionId);
      console.log(`apple-notifications: ${notification.type} ${applyTx.productId} unknown_user`);
      return reply("unknown_user");
    }

    const applied = await applyAppleTransaction({
      userId,
      tx: applyTx,
      renewal,
      notificationType: notification.type,
      signedAtMs: notification.signedAt
    });
    const outcome = applied.result === "stale" ? "stale"
      : applied.result === "unknown_user" ? "unknown_user"
      : applied.result === "wrong_account" ? "ignored"
      : "applied";
    await finish(notification, outcome, applyTx.originalTransactionId);
    console.log(`apple-notifications: ${notification.type}${notification.subtype ? `/${notification.subtype}` : ""} ${applyTx.productId} ${applied.result}`);
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
