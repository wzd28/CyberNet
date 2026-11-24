// POST /api/apple-verify: the iPhone app (1.1 on) hands over what StoreKit 2
// gave it (a purchase, a Restore, a renewal from Transaction.updates, the
// sync at launch) and the server decides what the person now has.
//
//   request   { "reason": "purchase" | "restore" | "update" | "launch",
//               "transactions": [ { "jws": "...", "renewalInfoJws": "..." } ] }
//             1 to 20 transactions, each string at most 16 KB. Signed in.
//   200       { "results": [ { "index", "originalTransactionId", "productId",
//                              "status", "finish" } ],
//               "entitlement": <the same object as account-status profile.billing> }
//     status  applied | expired | revoked | stale | wrong_account | not_linked
//             | not_ours | invalid
//     finish  true: the server recorded the transaction or refused it for
//             good, so the app may call Transaction.finish(). false: keep it
//             unfinished (not_linked: it is claimed by the next app sync).
//   errors    401 sign_in_required, 400 bad_request, 413 too_large,
//             429 rate_limited, 503 retry_later | apple_not_configured
//             (on any 5xx the app keeps every transaction unfinished and
//             retries at the next launch).
//
// Trust: nothing the app says is believed. Each JWS is verified with Apple's
// library against the pinned Apple Root CA - G3 (lib/apple-verify-jws.mjs).
// The user id given to the database is the verified sign-in token's, never a
// request field. Who owns a subscription chain is decided in SQL
// (apply_apple_subscription): appAccountToken = the Supabase user id.
// A valid purchase is always recorded: Apple has already taken the money.
// Nothing here cancels or refunds anything.
//
// The iosOnly wrapper and CORS are NOT security controls (the platform header
// can be forged); they only keep the website from calling this.
//
// Logging: product id and result only, never a JWS, a transaction id or a user id.

import { json, verifyUser, getProfile, getActiveTeamMembership } from "../lib/supabase.mjs";
import { withCors, iosOnly } from "../lib/cors.mjs";
import { reportError, consumeQuota } from "../lib/report-error.mjs";
import { verifyTransaction, verifyRenewalInfo, AppleJwsError, MAX_JWS_CHARS } from "../lib/apple-verify-jws.mjs";
import { applyAppleTransaction, transactionStatus, AppleApplyError } from "../lib/apple-apply.mjs";
import { loadEntitlement, appBilling } from "../lib/entitlement.mjs";

export const REASONS = Object.freeze(["purchase", "restore", "update", "launch"]);
export const MAX_TRANSACTIONS = 20;
export const VERIFIES_PER_HOUR = 30;
const MAX_BODY_BYTES = 2 * MAX_TRANSACTIONS * MAX_JWS_CHARS + 4096;

const RETRY_LATER = "We couldn't confirm your purchase yet. It will finish automatically.";

function parseBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (!REASONS.includes(body.reason)) return null;
  const items = body.transactions;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_TRANSACTIONS) return null;
  const transactions = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.jws !== "string" || !item.jws || item.jws.length > MAX_JWS_CHARS) return null;
    const renewal = item.renewalInfoJws;
    if (renewal !== undefined && renewal !== null && (typeof renewal !== "string" || renewal.length > MAX_JWS_CHARS)) return null;
    transactions.push({ jws: item.jws, renewalInfoJws: renewal || null });
  }
  return { reason: body.reason, transactions };
}

// One transaction -> its result. Throws only for "try again later" problems
// (root not configured, database down).
async function handleOne(user, item, index, reason) {
  const nothing = { index, originalTransactionId: null, productId: null };
  let decoded;
  try {
    decoded = await verifyTransaction(item.jws);
  } catch (error) {
    if (!(error instanceof AppleJwsError) || error.code === "root_not_configured") throw error;
    console.warn(`apple-verify ${reason}: refused (${error.code})`);
    // verify_error: the check itself failed (not a verdict on the signature),
    // so the app keeps the transaction and sends it again on the next sync.
    return { ...nothing, status: "invalid", finish: error.code !== "verify_error" };
  }
  if (!decoded.ok) {
    console.warn(`apple-verify ${reason}: not ours (${decoded.reason})`);
    return { ...nothing, status: decoded.reason === "malformed" ? "invalid" : "not_ours", finish: true };
  }

  const { tx } = decoded;
  const ids = { index, originalTransactionId: tx.originalTransactionId, productId: tx.productId };
  // Replaced by an upgrade: the newer transaction carries the entitlement.
  if (tx.superseded) {
    console.log(`apple-verify ${reason}: ${tx.productId} superseded`);
    return { ...ids, status: "stale", finish: true };
  }

  // Renewal info is optional; one that does not verify or belongs to another
  // chain is simply not used (the transaction alone is still true).
  let renewal = null;
  if (item.renewalInfoJws) {
    try {
      const decodedRenewal = await verifyRenewalInfo(item.renewalInfoJws, { environment: tx.environment });
      if (decodedRenewal.ok && decodedRenewal.renewal.originalTransactionId === tx.originalTransactionId) renewal = decodedRenewal.renewal;
    } catch (error) {
      if (!(error instanceof AppleJwsError) || error.code === "root_not_configured") throw error;
    }
  }

  const applied = await applyAppleTransaction({
    userId: user.id,
    tx,
    renewal,
    // Only an app sync may claim a chain with no appAccountToken (CRITIC #9).
    source: reason === "purchase" ? "purchase" : "app"
  });
  const status = transactionStatus(applied, tx);
  // A chain with no appAccountToken claimed by an app sync (CRITIC #9): logged, never silent.
  // SRV-AUTH-15 / PAY-7 (security audit Nov 2026): also sent to the owner's alerts (a fixed
  // message, no ids, so one alert per 6 hours at most), because whoever presents such a JWS
  // first owns the chain.
  if (!tx.appAccountToken && status === "applied") {
    console.warn(`apple-verify ${reason}: ${tx.productId} claimed without an account token`);
    reportError(new Error("Apple subscription claimed without an account token"), { fn: "apple-verify", label: "Token-less Apple subscription linked to the signed-in account (check it is the buyer)" });
  }
  // PAY-6: a Sandbox (TestFlight / sandbox tester) purchase recorded for an account; it only
  // gives Pro when the account is on public.iap_sandbox_allowlist. Made visible to the owner.
  if (tx.environment === "Sandbox" && status === "applied") {
    console.warn(`apple-verify ${reason}: Sandbox purchase recorded`);
    reportError(new Error("Sandbox Apple purchase recorded on the live server"), { fn: "apple-verify", label: "Sandbox purchase (Pro only for allow-listed accounts)" });
  }
  if (status === "not_linked") console.warn(`apple-verify ${reason}: ${tx.productId} not_linked (no account token on a purchase call)`);
  else console.log(`apple-verify ${reason}: ${tx.productId} ${status}`);
  return { ...ids, status, finish: status !== "not_linked" };
}

async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let user;
  try {
    ({ user } = await verifyUser(request));
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status === 401) return json({ error: "Sign in to continue.", code: "sign_in_required" }, 401);
    return json({ error: RETRY_LATER, code: "retry_later" }, 503);
  }

  // A backstop against a loop, not a gate: null (counter unreachable) lets it through.
  const quota = await consumeQuota(`apple_verify:${user.id}`, 3600, VERIFIES_PER_HOUR);
  if (quota && !quota.allowed) {
    return json({ error: "Too many purchase checks. Please try again later.", code: "rate_limited" }, 429);
  }

  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "Request is too large.", code: "too_large" }, 413);
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "The request could not be read.", code: "bad_request" }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request is too large.", code: "too_large" }, 413);
  let parsed = null;
  try { parsed = parseBody(JSON.parse(raw)); } catch { parsed = null; }
  if (!parsed) return json({ error: "Send a reason and one to twenty transactions.", code: "bad_request" }, 400);

  try {
    const results = [];
    for (let index = 0; index < parsed.transactions.length; index++) {
      results.push(await handleOne(user, parsed.transactions[index], index, parsed.reason));
    }
    // What the person has now, read back from the database.
    const [profile, team] = await Promise.all([getProfile(user), getActiveTeamMembership(user.id).catch(() => null)]);
    const entitlement = await loadEntitlement(user.id, { profile });
    return json({ results, entitlement: appBilling(entitlement, { userId: user.id, team }) });
  } catch (error) {
    if (error instanceof AppleJwsError && error.code === "root_not_configured") {
      console.error("CyberNet apple-verify: the Apple root certificate is not embedded on the server");
      reportError("Apple root certificate is not embedded; purchases cannot be verified", { fn: "apple-verify", label: "Apple root certificate missing" });
      return json({ error: "Purchases are not available right now. Please try again later.", code: "apple_not_configured" }, 503);
    }
    if (error instanceof AppleApplyError) {
      console.error("CyberNet apple-verify: database step failed", error.message);
      reportError(error, { fn: "apple-verify", label: "Apple purchase could not be recorded" });
      return json({ error: RETRY_LATER, code: "retry_later" }, 503);
    }
    console.error("CyberNet apple-verify failed", error?.message || error);
    reportError(error, { fn: "apple-verify", label: "Apple purchase check failed" });
    return json({ error: RETRY_LATER, code: "retry_later" }, 503);
  }
}

export default withCors(iosOnly(handler));

export const config = {
  path: "/api/apple-verify",
  method: ["POST", "OPTIONS"]
};
