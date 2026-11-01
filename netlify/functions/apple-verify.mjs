// POST /api/apple-verify: the iPhone app hands over what StoreKit 2 gave it
// (purchase, restore, renewal, app launch) and the server decides what the
// person now has. iPhone app only; the website gets 403.
//
//   request   { "reason": "purchase" | "restore" | "update" | "launch",
//               "transactions": [ { "jws": "...", "renewalInfoJws": "..." } ] }
//             at most 20 transactions, each string at most 16 KB.
//   response  200 { "results": [ { "index", "transactionId", "originalTransactionId", "productId",
//                                  "status", "finish" } ],
//                   "plan": "free" | "pro" | "business", "billing": { ... } }
//     status  applied | stale | expired | revoked | wrong_account | not_ours | invalid
//             | conflict_web_plan | in_other_team
//     finish  true when the server recorded the transaction or definitively
//             refused it (the app may call Transaction.finish); false is only
//             ever sent with a 5xx, so the app keeps the transaction and retries.
//   errors    401 sign_in_required, 400 bad_request, 413, 429 rate_limited,
//             503 retry_later / apple_not_configured.
//
// Trust: nothing the app says is believed. Each JWS is verified against Apple's
// root certificate (netlify/lib/apple-jws.mjs), its appAccountToken must be the
// signed-in account's id, and the user id given to the database is the verified
// token's, never a field of the request. No Apple API key is involved.
//
// Logging: product id and result only, never a JWS or an id.

import { json, verifyUser, getProfile, getActiveTeamMembership, effectivePlan } from "../lib/supabase.mjs";
import { withCors, iosOnly } from "../lib/cors.mjs";
import { reportError, consumeQuota } from "../lib/report-error.mjs";
import { decodeTransaction, decodeRenewalInfo, AppleJwsError } from "../lib/apple-jws.mjs";
import { applyAppleTransaction, transactionStatus, AppleApplyError } from "../lib/apple-apply.mjs";
import { describeBilling } from "../lib/entitlements.mjs";

export const REASONS = Object.freeze(["purchase", "restore", "update", "launch"]);
export const MAX_TRANSACTIONS = 20;
export const MAX_JWS_CHARS = 16 * 1024;
export const VERIFIES_PER_HOUR = 30;
const MAX_BODY_BYTES = 2 * MAX_TRANSACTIONS * MAX_JWS_CHARS + 4096;

function badRequest(message) {
  return json({ error: message, code: "bad_request" }, 400);
}

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

// One transaction -> its result. Throws only for "try again later" problems.
async function handleOne(user, item, index, reason) {
  const nothing = { index, transactionId: null, originalTransactionId: null, productId: null };
  let decoded;
  try {
    decoded = decodeTransaction(item.jws);
  } catch (error) {
    if (!(error instanceof AppleJwsError)) throw error;
    if (error.code === "root_not_configured") throw error; // our setup, not a bad purchase
    console.warn(`apple-verify ${reason}: refused (${error.code})`);
    return { ...nothing, status: "invalid", finish: true };
  }
  if (!decoded.ok) {
    console.warn(`apple-verify ${reason}: not ours (${decoded.reason})`);
    return { ...nothing, status: decoded.reason === "malformed" ? "invalid" : "not_ours", finish: true };
  }

  const { tx } = decoded;
  const ids = { index, transactionId: tx.transactionId, originalTransactionId: tx.originalTransactionId, productId: tx.productId };

  // The transaction must have been bought by this signed-in account.
  if (tx.appAccountToken !== String(user.id).toLowerCase()) {
    console.warn(`apple-verify ${reason}: ${tx.productId} wrong_account`);
    return { ...ids, status: "wrong_account", finish: true };
  }
  // Replaced by an upgrade: the newer transaction carries the entitlement.
  if (tx.superseded) {
    console.log(`apple-verify ${reason}: ${tx.productId} superseded`);
    return { ...ids, status: "stale", finish: true };
  }

  // Renewal info is optional. If it is missing or does not verify it is simply
  // not used (the transaction on its own is still true).
  let renewal = null;
  if (item.renewalInfoJws) {
    try {
      const decodedRenewal = decodeRenewalInfo(item.renewalInfoJws);
      if (decodedRenewal.ok && decodedRenewal.renewal.originalTransactionId === tx.originalTransactionId) renewal = decodedRenewal.renewal;
    } catch (error) {
      if (!(error instanceof AppleJwsError)) throw error;
      if (error.code === "root_not_configured") throw error;
    }
  }

  const applied = await applyAppleTransaction({ userId: user.id, tx, renewal, signedAtMs: tx.signedAt });
  const status = transactionStatus(applied, tx);
  console.log(`apple-verify ${reason}: ${tx.productId} ${status}`);
  return { ...ids, status, finish: true };
}

async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let user;
  try {
    ({ user } = await verifyUser(request));
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status === 401) return json({ error: "Sign in to continue.", code: "sign_in_required" }, 401);
    return json({ error: "Purchases are not available right now. Please try again later.", code: "retry_later" }, 503);
  }

  // null = the counter could not be reached: let the request through (the limit
  // is a backstop against a loop, not a gate).
  const quota = await consumeQuota(`apple_verify:${user.id}`, 3600, VERIFIES_PER_HOUR);
  if (quota && !quota.allowed) {
    return json({ error: "Too many purchase checks. Please try again later.", code: "rate_limited" }, 429);
  }

  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "Request is too large.", code: "too_large" }, 413);
  let raw;
  try {
    raw = await request.text();
  } catch {
    return badRequest("The request could not be read.");
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request is too large.", code: "too_large" }, 413);
  let parsed = null;
  try { parsed = parseBody(JSON.parse(raw)); } catch { parsed = null; }
  if (!parsed) return badRequest("Send a reason and one to twenty transactions.");

  try {
    const results = [];
    for (let index = 0; index < parsed.transactions.length; index++) {
      results.push(await handleOne(user, parsed.transactions[index], index, parsed.reason));
    }

    // What the person has now, read back from the database.
    const [profile, team] = await Promise.all([getProfile(user), getActiveTeamMembership(user.id)]);
    const plan = team ? "business" : effectivePlan(profile);
    const billing = describeBilling({ profile, team, appleRows: profile.apple });
    return json({ results, plan, billing });
  } catch (error) {
    if (error instanceof AppleJwsError && error.code === "root_not_configured") {
      console.error("CyberNet apple-verify: the Apple root certificate is not embedded on the server");
      reportError("Apple root certificate is not embedded; purchases cannot be verified", { fn: "apple-verify", label: "Apple root certificate missing" });
      return json({ error: "Purchases are not available right now. Please try again later.", code: "apple_not_configured" }, 503);
    }
    if (error instanceof AppleApplyError) {
      console.error("CyberNet apple-verify: database step failed", error.message);
      reportError(error, { fn: "apple-verify", label: "Apple purchase could not be recorded" });
      return json({ error: "We couldn't confirm your purchase yet. It will finish automatically.", code: "retry_later" }, 503);
    }
    console.error("CyberNet apple-verify failed", error?.message || error);
    reportError(error, { fn: "apple-verify", label: "Apple purchase check failed" });
    return json({ error: "We couldn't confirm your purchase yet. It will finish automatically.", code: "retry_later" }, 503);
  }
}

// iPhone app only (403 for the website); CORS for capacitor://localhost.
export default withCors(iosOnly(handler));

export const config = {
  path: "/api/apple-verify",
  method: ["POST", "OPTIONS"]
};
