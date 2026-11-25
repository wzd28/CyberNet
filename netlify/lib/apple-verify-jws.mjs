// Verifies the signed data Apple sends for In-App Purchases, with Apple's own
// library (@apple/app-store-server-library, SignedDataVerifier):
//   * StoreKit 2 transactions and renewal info (sent by the iPhone app),
//   * App Store Server Notifications V2 (sent by Apple's server).
// All of them are ES256 JWS strings whose header carries a certificate chain
// (leaf, intermediate, root). The only trusted root is the pinned Apple Root
// CA - G3 (./apple-root-ca-g3.mjs, itself pinned by SHA-256). Online checks
// (OCSP) are off: certificates are checked at the date Apple signed the data.
//
// Two verifiers only: Production and Sandbox (App Review and TestFlight buy in
// Sandbox, so the live server honours Sandbox too; PLAN D4). The library skips
// the signature for the "Xcode" and "LocalTesting" environments, so any other
// environment is refused here before the library is called.
//
// Nothing here uses the network, an environment variable or an Apple API key.
// A JWS from the app is never trusted on its own word: only Apple's signature
// counts.

import { X509Certificate, createHash } from "node:crypto";
import appleLibrary from "@apple/app-store-server-library";
import { BUNDLE_ID, APP_APPLE_ID, isProProduct } from "./apple-products.mjs";
import { APPLE_ROOT_CA_G3_BASE64, APPLE_ROOT_CA_G3_SHA256 } from "./apple-root-ca-g3.mjs";

const { SignedDataVerifier, Environment, VerificationException } = appleLibrary;

export class AppleJwsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "AppleJwsError";
    this.code = code;
  }
}

export const MAX_JWS_CHARS = 16 * 1024;
export const MAX_NOTIFICATION_CHARS = 100 * 1024;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const B64URL = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_ID = /^[0-9]{1,40}$/;
const ENVIRONMENTS = Object.freeze({ Production: "Production", Sandbox: "Sandbox" });

export const isUuid = (value) => typeof value === "string" && UUID.test(value);

// ── trusted roots ──
let testRoots = null;

export function embeddedRoots() {
  try {
    const der = Buffer.from(String(APPLE_ROOT_CA_G3_BASE64), "base64");
    if (der.length < 200) return null;
    if (createHash("sha256").update(der).digest("hex") !== APPLE_ROOT_CA_G3_SHA256) return null;
    new X509Certificate(der);
    return [der];
  } catch {
    return null;
  }
}

// TEST HOOK: lets the tests trust a throwaway chain they build themselves
// (tests/apple-jws-helper.mjs), so every negative case runs through the real
// library. Refuses to work outside NODE_ENV=test.
export function setTrustedRootsForTests(roots) {
  if (process.env.NODE_ENV !== "test") throw new Error("setTrustedRootsForTests is for tests only");
  testRoots = roots ? roots.map((root) => Buffer.from(root)) : null;
  cache = null;
}

let cache = null;
function verifierFor(environment) {
  const roots = testRoots || embeddedRoots();
  if (!roots || !roots.length) throw new AppleJwsError("root_not_configured", "The Apple root certificate is not set up on the server.");
  if (!cache) {
    cache = {
      Production: new SignedDataVerifier(roots, false, Environment.PRODUCTION, BUNDLE_ID, APP_APPLE_ID),
      Sandbox: new SignedDataVerifier(roots, false, Environment.SANDBOX, BUNDLE_ID)
    };
  }
  return cache[environment];
}

export function rootConfigured() {
  // an empty test list stands for "no root configured" (tests of the fail-closed path once the real root is embedded)
  return Boolean((testRoots && testRoots.length) || (!testRoots && embeddedRoots()));
}

// First thing every verify call does: without the root nothing can be judged,
// so even a malformed JWS answers "try again later" (the app keeps it).
function requireRoot() {
  if (!rootConfigured()) throw new AppleJwsError("root_not_configured", "The Apple root certificate is not set up on the server.");
}

// ── shape checks before the library (cheap, and they pin the algorithm) ──
function peek(jws, maxChars) {
  if (typeof jws !== "string" || !jws || jws.length > maxChars) throw new AppleJwsError("malformed", "The signed data is missing or too large.");
  const parts = jws.split(".");
  if (parts.length !== 3 || !parts.every((part) => B64URL.test(part))) throw new AppleJwsError("malformed", "The signed data is not a JWS.");
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new AppleJwsError("malformed", "The signed data could not be read.");
  }
  if (!header || typeof header !== "object" || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppleJwsError("malformed", "The signed data could not be read.");
  }
  if (header.alg !== "ES256") throw new AppleJwsError("bad_alg", "Only ES256 is accepted.");
  if (!Array.isArray(header.x5c) || header.x5c.length !== 3) throw new AppleJwsError("bad_chain", "The certificate chain must have three certificates.");
  return payload;
}

function checkSignedDate(payload, now) {
  const signedAt = Number(payload.signedDate);
  if (!Number.isFinite(signedAt) || signedAt <= 0) throw new AppleJwsError("no_signed_date", "The signed data has no signing date.");
  if (signedAt > now + FUTURE_SKEW_MS) throw new AppleJwsError("future_signed", "The signed data is dated in the future.");
  return signedAt;
}

// Library errors -> our codes. Status numbers are VerificationStatus.
function translate(error) {
  if (error instanceof AppleJwsError) return error;
  if (error instanceof VerificationException) {
    const status = Number(error.status);
    // 3 INVALID_APP_IDENTIFIER, 4 INVALID_ENVIRONMENT (signature was valid)
    if (status === 3) return new AppleJwsError("wrong_app", "Signed for another app.");
    if (status === 4) return new AppleJwsError("bad_environment", "Unexpected environment.");
    return new AppleJwsError("bad_signature", "The signature or certificate chain is not Apple's.");
  }
  // Not a VerificationException: an unexpected runtime or parser error inside
  // the library, not a verdict about the signature. The caller keeps a
  // StoreKit transaction unfinished (apple-verify) or asks Apple to retry
  // (apple-notifications) instead of refusing it for good.
  return new AppleJwsError("verify_error", "The signed data could not be checked right now.");
}

const iso = (ms) => {
  if (ms === undefined || ms === null || ms === "") return null;
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0 || value > 8.64e15) return null;
  return new Date(value).toISOString();
};

// verifyTransaction(jws) -> { ok: true, tx } | { ok: false, reason }
// Throws AppleJwsError for anything not signed by Apple (or root_not_configured).
// reason: wrong_bundle | unknown_product | wrong_type | family_shared |
// bad_environment | malformed. All mean "not one of our Pro purchases".
export async function verifyTransaction(jws, { now = Date.now() } = {}) {
  requireRoot();
  const peeked = peek(jws, MAX_JWS_CHARS);
  const environment = ENVIRONMENTS[peeked.environment];
  if (!environment) return { ok: false, reason: "bad_environment" };
  let payload;
  try {
    payload = await verifierFor(environment).verifyAndDecodeTransaction(jws);
  } catch (error) {
    const translated = translate(error);
    if (translated.code === "wrong_app") return { ok: false, reason: "wrong_bundle" };
    throw translated;
  }
  const signedAt = checkSignedDate(payload, now);
  if (payload.bundleId !== BUNDLE_ID) return { ok: false, reason: "wrong_bundle" };
  if (!isProProduct(payload.productId)) return { ok: false, reason: "unknown_product" };
  if (payload.type !== "Auto-Renewable Subscription") return { ok: false, reason: "wrong_type" };
  // Family Sharing is off; a shared transaction is not a purchase by this person.
  if (payload.inAppOwnershipType !== "PURCHASED") return { ok: false, reason: "family_shared" };
  const transactionId = String(payload.transactionId ?? "");
  const originalTransactionId = String(payload.originalTransactionId ?? "");
  const expiresDate = iso(payload.expiresDate);
  if (!TRANSACTION_ID.test(transactionId) || !TRANSACTION_ID.test(originalTransactionId) || !expiresDate) return { ok: false, reason: "malformed" };
  const token = payload.appAccountToken;
  return {
    ok: true,
    tx: {
      transactionId,
      originalTransactionId,
      productId: payload.productId,
      environment,
      purchaseDate: iso(payload.purchaseDate),
      originalPurchaseDate: iso(payload.originalPurchaseDate),
      expiresDate,
      revocationDate: iso(payload.revocationDate),
      revocationReason: Number.isInteger(payload.revocationReason) ? payload.revocationReason : null,
      appAccountToken: isUuid(token) ? token.toLowerCase() : null,
      // Replaced by an upgrade: the newer transaction carries the entitlement.
      superseded: payload.isUpgraded === true,
      signedAt
    }
  };
}

// verifyRenewalInfo(jws, environment) -> { ok: true, renewal } | { ok: false, reason }
export async function verifyRenewalInfo(jws, { environment, now = Date.now() } = {}) {
  requireRoot();
  const peeked = peek(jws, MAX_JWS_CHARS);
  const env = ENVIRONMENTS[peeked.environment];
  if (!env || (environment && env !== environment)) return { ok: false, reason: "bad_environment" };
  let payload;
  try {
    payload = await verifierFor(env).verifyAndDecodeRenewalInfo(jws);
  } catch (error) {
    throw translate(error);
  }
  const signedAt = checkSignedDate(payload, now);
  const originalTransactionId = String(payload.originalTransactionId ?? "");
  if (!TRANSACTION_ID.test(originalTransactionId)) return { ok: false, reason: "malformed" };
  return {
    ok: true,
    renewal: {
      originalTransactionId,
      autoRenewProductId: isProProduct(payload.autoRenewProductId) ? payload.autoRenewProductId : null,
      // 1 = will renew, 0 = turned off; anything else = unknown.
      autoRenew: payload.autoRenewStatus === 1 ? true : payload.autoRenewStatus === 0 ? false : null,
      gracePeriodExpiresDate: iso(payload.gracePeriodExpiresDate),
      isInBillingRetryPeriod: payload.isInBillingRetryPeriod === true,
      signedAt
    }
  };
}

// verifyNotification(signedPayload) -> { ok: true, notification } | { ok: false, reason }
// reason: wrong_bundle (another app, signed by Apple: ignore), no_data (a
// summary or a notification with no transaction), bad_environment.
// Throws AppleJwsError: bad signature, malformed, root_not_configured, and
// wrong_app (OUR bundle id but another appAppleId in Production: suspicious).
export async function verifyNotification(signedPayload, { now = Date.now() } = {}) {
  requireRoot();
  const peeked = peek(signedPayload, MAX_NOTIFICATION_CHARS);
  const scope = peeked.data || peeked.summary || peeked.appData || null;
  const environment = ENVIRONMENTS[scope?.environment];
  if (!environment) {
    // Still has to be Apple's: verify with the Production rules for the signature only.
    if (!scope) return { ok: false, reason: "no_data" };
    return { ok: false, reason: "bad_environment" };
  }
  let payload;
  try {
    payload = await verifierFor(environment).verifyAndDecodeNotification(signedPayload);
  } catch (error) {
    const translated = translate(error);
    if (translated.code === "wrong_app" && scope.bundleId !== BUNDLE_ID) return { ok: false, reason: "wrong_bundle" };
    throw translated;
  }
  const signedAt = checkSignedDate(payload, now);
  const type = typeof payload.notificationType === "string" ? payload.notificationType.slice(0, 60) : "";
  const uuid = typeof payload.notificationUUID === "string" ? payload.notificationUUID.toLowerCase() : "";
  if (!type || !isUuid(uuid)) throw new AppleJwsError("malformed", "The notification has no type or id.");
  const data = payload.data && typeof payload.data === "object" ? payload.data : null;
  return {
    ok: true,
    notification: {
      type,
      subtype: typeof payload.subtype === "string" ? payload.subtype.slice(0, 60) : null,
      uuid,
      environment,
      signedAt,
      signedTransactionInfo: typeof data?.signedTransactionInfo === "string" ? data.signedTransactionInfo : null,
      signedRenewalInfo: typeof data?.signedRenewalInfo === "string" ? data.signedRenewalInfo : null
    }
  };
}
