// Test helper (not a test): builds a throwaway Apple-style certificate chain
// (root -> intermediate -> leaf, all P-256) with node:crypto and a small DER
// writer, and signs JWS strings with it exactly the way Apple does (ES256,
// x5c = [leaf, intermediate, root], raw r||s signature). The tests trust the
// chain's root through apple-jws.mjs's test hook, so the negative cases (wrong
// root, tampered payload, expired leaf, missing OID, ...) are real: the
// verifier is the production code, only the root is different.
//
// Nothing here is a real Apple key or certificate.
import { generateKeyPairSync, sign, createPublicKey } from "node:crypto";

// ── DER ──
const len = (n) => {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
};
const seq = (...parts) => tlv(0x30, ...parts);
const set = (...parts) => tlv(0x31, ...parts);
const oid = (hex) => tlv(0x06, Buffer.from(hex, "hex"));
const integer = (buf) => tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf);
const utf8 = (text) => tlv(0x0c, Buffer.from(text, "utf8"));
const octets = (buf) => tlv(0x04, buf);
const bitString = (buf) => tlv(0x03, Buffer.concat([Buffer.from([0]), buf]));
const utcTime = (date) => {
  const iso = new Date(date).toISOString(); // 2026-10-30T12:00:00.000Z
  return tlv(0x17, Buffer.from(`${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`, "ascii"));
};

const OID_ECDSA_SHA256 = "2a8648ce3d040302";
const OID_COMMON_NAME = "550403";
const OID_BASIC_CONSTRAINTS = "551d13";
export const OID_LEAF_MARKER = "2a864886f76364060b01"; // 1.2.840.113635.100.6.11.1
export const OID_INTERMEDIATE_MARKER = "2a864886f763640602" + "01"; // 1.2.840.113635.100.6.2.1

const name = (cn) => seq(set(seq(oid(OID_COMMON_NAME), utf8(cn))));

function extension(oidHex, critical, value) {
  return seq(oid(oidHex), ...(critical ? [tlv(0x01, Buffer.from([0xff]))] : []), octets(value));
}

// Builds one certificate. `issuerKey` signs it; `ca` sets basicConstraints;
// `marker` (hex OID) adds an extension carrying that OID, like Apple's.
function certificate({ subject, issuer, publicKey, issuerKey, notBefore, notAfter, serial, ca, marker }) {
  const extensions = [extension(OID_BASIC_CONSTRAINTS, true, ca ? seq(tlv(0x01, Buffer.from([0xff]))) : seq())];
  if (marker) extensions.push(extension(marker, false, Buffer.from([0x05, 0x00])));
  const tbs = seq(
    tlv(0xa0, integer(Buffer.from([2]))),
    integer(serial),
    seq(oid(OID_ECDSA_SHA256)),
    name(issuer),
    seq(utcTime(notBefore), utcTime(notAfter)),
    name(subject),
    publicKey.export({ type: "spki", format: "der" }),
    tlv(0xa3, seq(...extensions))
  );
  const signature = sign("sha256", tbs, { key: issuerKey, dsaEncoding: "der" });
  return seq(tbs, seq(oid(OID_ECDSA_SHA256)), bitString(signature));
}

const ec = () => generateKeyPairSync("ec", { namedCurve: "P-256" });
let serialCounter = 1;
const serial = () => Buffer.from([0x10, serialCounter++ & 0x7f, 0x42]);

const FAR_PAST = "2020-01-01T00:00:00Z";
const FAR_FUTURE = "2049-12-31T23:59:59Z";

// makeChain({ leafFrom, leafTo, leafMarker, intermediateMarker, intermediateCa, intermediateKeyForLeaf })
export function makeChain(options = {}) {
  const {
    leafFrom = FAR_PAST,
    leafTo = FAR_FUTURE,
    leafMarker = OID_LEAF_MARKER,
    intermediateMarker = OID_INTERMEDIATE_MARKER,
    intermediateCa = true,
    // sign the leaf with some other key than the intermediate's (a broken link)
    leafSignedByOther = false,
    rootName = "Test Apple Root CA - G3",
    intermediateName = "Test Apple WWDR Intermediate",
    leafName = "Test Receipt Signing"
  } = options;
  const root = ec();
  const intermediate = ec();
  const leaf = ec();
  const other = ec();
  const rootDer = certificate({ subject: rootName, issuer: rootName, publicKey: root.publicKey, issuerKey: root.privateKey, notBefore: FAR_PAST, notAfter: FAR_FUTURE, serial: serial(), ca: true });
  const intermediateDer = certificate({ subject: intermediateName, issuer: rootName, publicKey: intermediate.publicKey, issuerKey: root.privateKey, notBefore: FAR_PAST, notAfter: FAR_FUTURE, serial: serial(), ca: intermediateCa, marker: intermediateMarker });
  const leafDer = certificate({ subject: leafName, issuer: intermediateName, publicKey: leaf.publicKey, issuerKey: leafSignedByOther ? other.privateKey : intermediate.privateKey, notBefore: leafFrom, notAfter: leafTo, serial: serial(), ca: false, marker: leafMarker });
  return { rootDer, intermediateDer, leafDer, leafKey: leaf.privateKey, x5c: [leafDer, intermediateDer, rootDer].map((der) => der.toString("base64")) };
}

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

// signJws(chain, payload, { header, tamper, key }) -> "<h>.<p>.<s>"
export function signJws(chain, payload, { header = {}, signWith, x5c } = {}) {
  const h = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", x5c: x5c || chain.x5c, ...header }));
  const p = b64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${h}.${p}`), { key: signWith || chain.leafKey, dsaEncoding: "ieee-p1363" });
  return `${h}.${p}.${b64url(signature)}`;
}

// ── Apple payload builders ──
export const BUNDLE = "app.cybernetai";

export function transactionPayload(over = {}) {
  const now = over.__now ?? Date.now();
  const { __now, ...rest } = over;
  return {
    transactionId: "2000000200000001",
    originalTransactionId: "2000000100000001",
    bundleId: BUNDLE,
    productId: "app.cybernetai.pro.monthly",
    purchaseDate: now - 60_000,
    originalPurchaseDate: now - 60_000,
    expiresDate: now + 30 * 86_400_000,
    type: "Auto-Renewable Subscription",
    inAppOwnershipType: "PURCHASED",
    environment: "Sandbox",
    signedDate: now,
    ...rest
  };
}

export function renewalPayload(over = {}) {
  const now = over.__now ?? Date.now();
  const { __now, ...rest } = over;
  return {
    originalTransactionId: "2000000100000001",
    autoRenewProductId: "app.cybernetai.pro.monthly",
    autoRenewStatus: 1,
    environment: "Sandbox",
    signedDate: now,
    ...rest
  };
}

export function notificationPayload({ type, subtype, uuid, chain, tx, renewal, bundleId = BUNDLE, appAppleId = 1234567890, environment = "Sandbox", signedDate, data }) {
  const now = signedDate ?? Date.now();
  return {
    notificationType: type,
    ...(subtype ? { subtype } : {}),
    notificationUUID: uuid,
    version: "2.0",
    signedDate: now,
    data: data ?? {
      environment,
      appAppleId,
      bundleId,
      ...(tx ? { signedTransactionInfo: signJws(chain, { ...tx, signedDate: tx.signedDate ?? now }) } : {}),
      ...(renewal ? { signedRenewalInfo: signJws(chain, { ...renewal, signedDate: renewal.signedDate ?? now }) } : {})
    }
  };
}

export const publicKeyOf = (der) => createPublicKey({ key: der, format: "der", type: "spki" });
