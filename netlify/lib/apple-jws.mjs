// Verifies the signed data Apple sends for In-App Purchases: StoreKit 2
// transactions and renewal info (sent by the app) and App Store Server
// Notifications V2 (sent by Apple). All of them are ES256 JWS strings whose
// header carries a three-certificate chain (x5c: leaf, intermediate, root).
//
// Everything here is local: node:crypto only, no network, no environment, no
// Apple API key. The server therefore never trusts the app: a purchase counts
// only if the JWS it sends was signed by Apple.
//
// What is checked, in this order (verifyJws):
//   1. three dot-separated base64url parts; the header's alg is exactly ES256
//      (never "none", never HS256) and x5c holds exactly three DER certificates;
//   2. the root is byte-equal to the pinned Apple Root CA - G3
//      (netlify/lib/apple-root-ca-g3.mjs, itself pinned by SHA-256);
//   3. leaf <- intermediate <- root: each is signed by the next and names it as
//      issuer; the leaf carries Apple's receipt-signing marker
//      (1.2.840.113635.100.6.11.1) and the intermediate Apple's WWDR marker
//      (1.2.840.113635.100.6.2.1); the intermediate is a CA;
//   4. the signature over "<header>.<payload>" verifies with the leaf's P-256 key;
//   5. every certificate was valid at the payload's signedDate (leaf
//      certificates rotate, so the date the message was signed is what counts),
//      and signedDate is not more than five minutes in the future.
// Then decodeTransaction / decodeRenewalInfo / decodeNotification apply the
// rules about the content (bundle id, product, type, ownership, environment).

import { X509Certificate, createHash, verify as cryptoVerify } from "node:crypto";
import { BUNDLE_ID, productFor } from "./apple-products.mjs";
import { APPLE_ROOT_CA_G3_BASE64, APPLE_ROOT_CA_G3_SHA256 } from "./apple-root-ca-g3.mjs";

export class AppleJwsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "AppleJwsError";
    this.code = code;
  }
}

// DER contents of the two OIDs (without the 06 <length> prefix).
const LEAF_OID = Buffer.from("2a864886f763640" + "60b01", "hex"); // 1.2.840.113635.100.6.11.1
const INTERMEDIATE_OID = Buffer.from("2a864886f763640" + "60201", "hex"); // 1.2.840.113635.100.6.2.1

const MAX_JWS_CHARS = 16 * 1024;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

const B64URL = /^[A-Za-z0-9_-]+$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function b64urlToBuffer(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function parseJson(buffer, code = "malformed") {
  try {
    const value = JSON.parse(buffer.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new AppleJwsError(code, "The signed data could not be read.");
  }
}

function derContainsOid(der, oidContent) {
  return der.includes(Buffer.concat([Buffer.from([0x06, oidContent.length]), oidContent]));
}

// ── trusted roots ──
// Production: the one embedded Apple root, and only if it hashes to the pinned
// constant. A placeholder or a wrong certificate gives null, which makes every
// verification fail with root_not_configured (never "trust anything").
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

function toDer(root) {
  if (Buffer.isBuffer(root)) return root;
  if (root instanceof Uint8Array) return Buffer.from(root);
  return new X509Certificate(root).raw; // PEM string
}

// TEST HOOK. Lets tests/run-apple-iap.mjs trust a certificate chain it builds
// itself, so the negative cases (wrong root, tampered payload, ...) are real.
// Production code never calls it, and it refuses to work outside NODE_ENV=test.
export function setTrustedRootsForTests(roots) {
  if (process.env.NODE_ENV !== "test") throw new Error("setTrustedRootsForTests is for tests only");
  testRoots = roots ? roots.map(toDer) : null;
}

// verifyJws(jws, { now, trustedRoots }) -> { header, payload, signedAt }
// `trustedRoots` (array of DER Buffers or PEM strings) is the same test hook as
// above, per call; production code does not pass it.
export function verifyJws(jws, { now = Date.now(), trustedRoots } = {}) {
  if (typeof jws !== "string" || !jws || jws.length > MAX_JWS_CHARS) throw new AppleJwsError("malformed", "The signed data is missing or too large.");
  const parts = jws.split(".");
  if (parts.length !== 3 || !parts.every((part) => B64URL.test(part))) throw new AppleJwsError("malformed", "The signed data is not a JWS.");

  const header = parseJson(b64urlToBuffer(parts[0]));
  if (header.alg !== "ES256") throw new AppleJwsError("bad_alg", "Only ES256 is accepted.");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((item) => typeof item === "string" && B64.test(item))) {
    throw new AppleJwsError("bad_chain", "The certificate chain must have exactly three certificates.");
  }

  const roots = trustedRoots ? trustedRoots.map(toDer) : testRoots || embeddedRoots();
  if (!roots || !roots.length) throw new AppleJwsError("root_not_configured", "The Apple root certificate is not set up on the server.");

  const ders = x5c.map((item) => Buffer.from(item, "base64"));
  if (!roots.some((root) => root.equals(ders[2]))) throw new AppleJwsError("untrusted_root", "The chain does not end in the Apple root.");

  let leaf;
  let intermediate;
  let root;
  try {
    [leaf, intermediate, root] = ders.map((der) => new X509Certificate(der));
  } catch {
    throw new AppleJwsError("bad_chain", "A certificate could not be read.");
  }

  let linked = false;
  try {
    linked = leaf.verify(intermediate.publicKey) && intermediate.verify(root.publicKey) && leaf.checkIssued(intermediate) && intermediate.checkIssued(root);
  } catch {
    linked = false;
  }
  if (!linked) throw new AppleJwsError("bad_chain", "The certificates are not linked to each other.");
  if (!intermediate.ca) throw new AppleJwsError("bad_chain", "The intermediate certificate is not a CA.");
  if (!derContainsOid(ders[0], LEAF_OID) || !derContainsOid(ders[1], INTERMEDIATE_OID)) {
    throw new AppleJwsError("not_apple_cert", "The certificates are not Apple's receipt-signing certificates.");
  }

  let key;
  try {
    key = leaf.publicKey;
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("not P-256");
  } catch {
    throw new AppleJwsError("bad_chain", "The signing key is not a P-256 key.");
  }
  const signature = b64urlToBuffer(parts[2]);
  let valid = false;
  try {
    valid = signature.length === 64 && cryptoVerify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: "ieee-p1363" }, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new AppleJwsError("bad_signature", "The signature does not match.");

  const payload = parseJson(b64urlToBuffer(parts[1]));
  const signedAt = Number(payload.signedDate);
  if (!Number.isFinite(signedAt) || signedAt <= 0) throw new AppleJwsError("no_signed_date", "The signed data has no signing date.");
  if (signedAt > now + FUTURE_SKEW_MS) throw new AppleJwsError("future_signed", "The signed data is dated in the future.");
  for (const cert of [leaf, intermediate, root]) {
    const from = Date.parse(cert.validFrom);
    const to = Date.parse(cert.validTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || signedAt < from || signedAt > to) {
      throw new AppleJwsError("cert_expired", "A certificate was not valid when the data was signed.");
    }
  }

  return { header, payload, signedAt };
}

// ── content rules ──

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_ID = /^[0-9]{1,40}$/;

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function iso(ms) {
  if (ms === undefined || ms === null || ms === "") return null;
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0 || value > 8.64e15) return null;
  return new Date(value).toISOString();
}

const isEnvironment = (value) => value === "Production" || value === "Sandbox";

// decodeTransaction(jws) -> { ok: true, tx } | { ok: false, reason }
// Signature problems throw AppleJwsError. `reason` is one of: malformed,
// wrong_bundle, unknown_product, wrong_type, family_shared, bad_environment.
// All of them mean "not one of our purchases" to the caller.
export function decodeTransaction(jws, options = {}) {
  const { payload, signedAt } = verifyJws(jws, options);
  if (payload.bundleId !== BUNDLE_ID) return { ok: false, reason: "wrong_bundle" };
  if (!productFor(payload.productId)) return { ok: false, reason: "unknown_product" };
  if (payload.type !== "Auto-Renewable Subscription") return { ok: false, reason: "wrong_type" };
  // Family Sharing is off for every product; a shared transaction is not a purchase by this person.
  if (payload.inAppOwnershipType !== "PURCHASED") return { ok: false, reason: "family_shared" };
  if (!isEnvironment(payload.environment)) return { ok: false, reason: "bad_environment" };
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
      bundleId: payload.bundleId,
      environment: payload.environment,
      type: payload.type,
      purchaseDate: iso(payload.purchaseDate),
      originalPurchaseDate: iso(payload.originalPurchaseDate),
      expiresDate,
      revocationDate: iso(payload.revocationDate),
      revocationReason: Number.isInteger(payload.revocationReason) ? payload.revocationReason : null,
      appAccountToken: isUuid(token) ? token.toLowerCase() : null,
      // An upgrade replaces this transaction with a newer one; it carries no entitlement of its own.
      superseded: payload.isUpgraded === true,
      signedAt
    }
  };
}

// decodeRenewalInfo(jws) -> { ok: true, renewal } | { ok: false, reason }
export function decodeRenewalInfo(jws, options = {}) {
  const { payload, signedAt } = verifyJws(jws, options);
  const originalTransactionId = String(payload.originalTransactionId ?? "");
  if (!TRANSACTION_ID.test(originalTransactionId)) return { ok: false, reason: "malformed" };
  if (payload.environment !== undefined && !isEnvironment(payload.environment)) return { ok: false, reason: "bad_environment" };
  return {
    ok: true,
    renewal: {
      originalTransactionId,
      autoRenewProductId: typeof payload.autoRenewProductId === "string" ? payload.autoRenewProductId : null,
      // 1 = will renew, 0 = the person turned renewal off.
      autoRenew: payload.autoRenewStatus === 1 ? true : payload.autoRenewStatus === 0 ? false : null,
      gracePeriodExpiresDate: iso(payload.gracePeriodExpiresDate),
      isInBillingRetryPeriod: payload.isInBillingRetryPeriod === true,
      expirationIntent: Number.isInteger(payload.expirationIntent) ? payload.expirationIntent : null,
      renewalDate: iso(payload.renewalDate),
      signedAt
    }
  };
}

// decodeNotification(jws) -> { ok: true, notification } | { ok: false, reason }
// reason: malformed | no_data (a summary or other notification without a
// transaction) | wrong_bundle. The inner signed transaction / renewal strings
// are returned untouched; the caller verifies them with the decoders above.
export function decodeNotification(jws, options = {}) {
  const { payload, signedAt } = verifyJws(jws, options);
  const type = typeof payload.notificationType === "string" ? payload.notificationType.slice(0, 60) : "";
  const uuid = typeof payload.notificationUUID === "string" ? payload.notificationUUID.toLowerCase() : "";
  if (!type || !isUuid(uuid)) return { ok: false, reason: "malformed" };
  const data = payload.data;
  if (!data || typeof data !== "object") return { ok: false, reason: "no_data" };
  if (data.bundleId !== BUNDLE_ID) return { ok: false, reason: data.bundleId ? "wrong_bundle" : "no_data" };
  return {
    ok: true,
    notification: {
      type,
      subtype: typeof payload.subtype === "string" ? payload.subtype.slice(0, 60) : null,
      uuid,
      environment: isEnvironment(data.environment) ? data.environment : null,
      bundleId: data.bundleId,
      appAppleId: data.appAppleId === undefined || data.appAppleId === null ? null : String(data.appAppleId),
      signedAt,
      signedTransactionInfo: typeof data.signedTransactionInfo === "string" ? data.signedTransactionInfo : null,
      signedRenewalInfo: typeof data.signedRenewalInfo === "string" ? data.signedRenewalInfo : null
    }
  };
}
