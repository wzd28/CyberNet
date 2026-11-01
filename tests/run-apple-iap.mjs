// Apple In-App Purchase on the server (the iPhone app sells Free / Pro / Business):
//   * netlify/lib/apple-jws.mjs      the JWS verifier, with a certificate chain built here
//   * netlify/lib/apple-products.mjs the catalog, compared with the SQL
//   * netlify/lib/entitlements.mjs   who pays, and what the app shows
//   * netlify/functions/apple-verify.mjs, apple-notifications.mjs, apple-sweep.mjs
//
// No network, no keys, no accounts, no Apple certificate: fetch and Netlify.env
// are stubbed, and the tests sign their own JWS with a throwaway P-256 chain
// (tests/apple-jws-helper.mjs) that apple-jws.mjs is told to trust through its
// test hook. Everything else is the production code.
//
//   node tests/run-apple-iap.mjs
//
// ONE CHECK FAILS ON PURPOSE until the real Apple Root CA - G3 is embedded in
// netlify/lib/apple-root-ca-g3.mjs: "embedded Apple Root CA - G3 matches its
// pinned SHA-256". Without that certificate the server cannot verify a real
// purchase, and this keeps that from shipping by accident. See that file.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

process.env.NODE_ENV = "test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const SUPABASE = "https://stub-project.supabase.test";
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
  "ADMIN_EMAILS", "REVIEW_ACCOUNT_EMAILS", "RESEND_API_KEY", "ERROR_ALERTS", "APPLE_APP_APPLE_ID", "APPLE_SWEEP"]) delete process.env[name];
let ENV = {};
const baseEnv = () => ({ SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", ERROR_ALERTS: "off" });
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
ENV = baseEnv();

const logged = [];
const realConsole = { log: console.log, warn: console.warn, error: console.error };
for (const level of ["log", "warn", "error"]) console[level] = (...args) => logged.push(args.map(String).join(" "));

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    realConsole.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  }
}

const helper = await imp("tests/apple-jws-helper.mjs");
const { makeChain, signJws, transactionPayload, renewalPayload, notificationPayload, OID_LEAF_MARKER, OID_INTERMEDIATE_MARKER } = helper;
const jws = await imp("netlify/lib/apple-jws.mjs");
const products = await imp("netlify/lib/apple-products.mjs");
const seats = await imp("netlify/lib/business-seats.mjs");
const plans = await imp("netlify/lib/plans.mjs");
const ent = await imp("netlify/lib/entitlements.mjs");
const cors = await imp("netlify/lib/cors.mjs");
const rootCa = await imp("netlify/lib/apple-root-ca-g3.mjs");
const supa = await imp("netlify/lib/supabase.mjs");
const verifyFn = (await imp("netlify/functions/apple-verify.mjs")).default;
const notifyMod = await imp("netlify/functions/apple-notifications.mjs");
const notifyFn = notifyMod.default;
const sweepMod = await imp("netlify/functions/apple-sweep.mjs");

const MAIN = makeChain();
const NOW = Date.parse("2026-10-30T12:00:00Z");
const ROOTS = [MAIN.rootDer];
const codeOf = (fn) => { try { fn(); return "no error"; } catch (error) { return error?.code || error?.message; } };

// ══════════════ 1. catalog ══════════════
{
  const ids = Object.keys(products.PRODUCTS);
  check("catalog: the five products, exactly", JSON.stringify(ids) === JSON.stringify([
    "app.cybernetai.pro.monthly", "app.cybernetai.pro.yearly", "app.cybernetai.business5.monthly", "app.cybernetai.business10.monthly", "app.cybernetai.business20.monthly"]), ids);
  check("catalog: bundle id and group", products.BUNDLE_ID === "app.cybernetai" && products.SUBSCRIPTION_GROUP === "CyberNet AI Plans");
  const P = products.PRODUCTS;
  check("catalog: Pro monthly and yearly", P["app.cybernetai.pro.monthly"].plan === "pro" && P["app.cybernetai.pro.monthly"].interval === "month" && P["app.cybernetai.pro.yearly"].interval === "year" && P["app.cybernetai.pro.yearly"].seats === null);
  check("catalog: Business 5 / 10 / 20 seats are monthly with the website's pools", [[5, 50, 20], [10, 90, 36], [20, 160, 64]].every(([n, d, r]) => {
    const p = P[`app.cybernetai.business${n}.monthly`];
    return p.plan === "business" && p.interval === "month" && p.seats === n && p.dailyPoolLimit === d && p.recoveryPoolLimit === r;
  }));
  check("catalog: no yearly Business product", !ids.some((id) => /business.*year/.test(id)));
  check("catalog: planForProduct / seatPools / unknown", products.planForProduct("app.cybernetai.business10.monthly") === "business" && products.planForProduct("app.cybernetai.pro.yearly") === "pro" && products.planForProduct("nope") === null && products.planForProduct("__proto__") === null && products.seatPools("app.cybernetai.pro.monthly") === null && products.seatPools("app.cybernetai.business20.monthly").dailyPoolLimit === 160);
  check("catalog: frozen", Object.isFrozen(products.PRODUCTS) && Object.isFrozen(seats.SEAT_POOL_LIMITS));
  check("catalog: stripe-webhook uses the shared seat pools", /import \{ SEAT_POOL_LIMITS \} from "..\/lib\/business-seats.mjs"/.test(read("netlify/functions/stripe-webhook.mjs")) && !/const SEAT_POOL_LIMITS/.test(read("netlify/functions/stripe-webhook.mjs")));

  // The SQL mirror: apply_apple_subscription's product table and the CHECK on product_id.
  for (const file of ["supabase/migrations/20261030120000_apple_iap.sql", "supabase/schema.sql"]) {
    const sql = read(file);
    const rows = [...sql.matchAll(/\('(app\.cybernetai\.[a-z0-9.]+)',\s*'(pro|business)',\s*(null|\d+)::smallint,\s*'(month|year)',\s*(null|\d+)::smallint,\s*(null|\d+)::smallint\)/g)]
      .map((m) => ({ id: m[1], plan: m[2], seats: m[3] === "null" ? null : Number(m[3]), interval: m[4], daily: m[5] === "null" ? null : Number(m[5]), recovery: m[6] === "null" ? null : Number(m[6]) }));
    const js = Object.entries(products.PRODUCTS).map(([id, p]) => ({ id, plan: p.plan, seats: p.seats, interval: p.interval, daily: p.dailyPoolLimit, recovery: p.recoveryPoolLimit }));
    check(`catalog parity: ${file} product table equals apple-products.mjs`, JSON.stringify(rows) === JSON.stringify(js), { rows, js });
    const checkList = /product_id text not null check \(product_id in \(([^)]*)\)\)/.exec(sql)?.[1] || "";
    const listed = [...checkList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    check(`catalog parity: ${file} CHECK constraint lists the same ids`, JSON.stringify(listed) === JSON.stringify(products.PRODUCT_IDS), listed);
  }
}

// ══════════════ 2. the Apple root ══════════════
{
  check("root: the pinned fingerprint is the one in the plan", rootCa.APPLE_ROOT_CA_G3_SHA256 === "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79".replace(/:/g, "").toLowerCase());
  const embedded = jws.embeddedRoots();
  // THE ONE EXPECTED FAILURE until the certificate is embedded (see the header).
  check("embedded Apple Root CA - G3 matches its pinned SHA-256", embedded !== null && createHash("sha256").update(embedded[0]).digest("hex") === rootCa.APPLE_ROOT_CA_G3_SHA256,
    "NOT EMBEDDED: put the base64 DER of AppleRootCA-G3.cer in netlify/lib/apple-root-ca-g3.mjs (see the comment there)");
  const token = signJws(MAIN, transactionPayload());
  check("root: without the real root every message is refused, never trusted", embedded === null
    ? codeOf(() => jws.verifyJws(token)) === "root_not_configured"
    : codeOf(() => jws.verifyJws(token)) === "untrusted_root", codeOf(() => jws.verifyJws(token)));
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let refused = false;
  try { jws.setTrustedRootsForTests([MAIN.rootDer]); } catch { refused = true; }
  process.env.NODE_ENV = saved;
  check("root: the test hook refuses to work outside NODE_ENV=test", refused);
}

// ══════════════ 3. verifyJws ══════════════
{
  const ok = (token, over = {}) => jws.verifyJws(token, { now: NOW, trustedRoots: ROOTS, ...over });
  const payload = transactionPayload({ __now: NOW });
  const good = signJws(MAIN, payload);
  const r = ok(good);
  check("verifyJws: a correctly signed message passes and is returned", r.payload.productId === payload.productId && r.signedAt === NOW && r.header.alg === "ES256", r);
  check("verifyJws: the trusted roots can be given as PEM too", (() => {
    const pem = `-----BEGIN CERTIFICATE-----\n${MAIN.rootDer.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
    return jws.verifyJws(good, { now: NOW, trustedRoots: [pem] }).payload.bundleId === "app.cybernetai";
  })());

  // wrong root: a different chain's root is not in the trusted list
  const OTHER = makeChain();
  check("verifyJws: a chain that ends in another root is refused", codeOf(() => ok(signJws(OTHER, payload))) === "untrusted_root");
  check("verifyJws: the right root plus one changed byte is refused", (() => {
    const bent = Buffer.from(MAIN.rootDer); bent[bent.length - 3] ^= 1;
    return codeOf(() => jws.verifyJws(good, { now: NOW, trustedRoots: [bent] }));
  })() === "untrusted_root");
  // chain length
  check("verifyJws: a two-certificate chain is refused", codeOf(() => ok(signJws(MAIN, payload, { x5c: MAIN.x5c.slice(0, 2) }))) === "bad_chain");
  check("verifyJws: a four-certificate chain is refused", codeOf(() => ok(signJws(MAIN, payload, { x5c: [...MAIN.x5c, MAIN.x5c[2]] }))) === "bad_chain");
  check("verifyJws: x5c missing or not base64", codeOf(() => ok(signJws(MAIN, payload, { x5c: undefined, header: { x5c: null } }))) === "bad_chain" && codeOf(() => ok(signJws(MAIN, payload, { x5c: ["!!!", "!!!", "!!!"] }))) === "bad_chain");
  // algorithms
  check("verifyJws: alg none is refused", codeOf(() => ok(signJws(MAIN, payload, { header: { alg: "none" } }))) === "bad_alg");
  check("verifyJws: alg HS256 is refused", codeOf(() => ok(signJws(MAIN, payload, { header: { alg: "HS256" } }))) === "bad_alg");
  check("verifyJws: alg ES384 / RS256 are refused", codeOf(() => ok(signJws(MAIN, payload, { header: { alg: "ES384" } }))) === "bad_alg" && codeOf(() => ok(signJws(MAIN, payload, { header: { alg: "RS256" } }))) === "bad_alg");
  // tampering
  const [h, p, s] = good.split(".");
  const tampered = Buffer.from(JSON.stringify({ ...payload, productId: "app.cybernetai.business20.monthly" })).toString("base64url");
  check("verifyJws: a changed payload is refused", codeOf(() => ok(`${h}.${tampered}.${s}`)) === "bad_signature");
  check("verifyJws: a changed header (other certs) is refused", codeOf(() => ok(`${Buffer.from(JSON.stringify({ alg: "ES256", x5c: MAIN.x5c })).toString("base64url")}.${p}.${s}`)) === "bad_signature");
  check("verifyJws: a signature made with another key is refused", codeOf(() => ok(signJws(MAIN, payload, { signWith: OTHER.leafKey }))) === "bad_signature");
  check("verifyJws: a garbage or short signature is refused", codeOf(() => ok(`${h}.${p}.AAAA`)) === "bad_signature" && codeOf(() => ok(`${h}.${p}.${Buffer.alloc(64).toString("base64url")}`)) === "bad_signature");
  // Apple's markers
  {
    const noMarker = makeChain({ leafMarker: null });
    check("verifyJws: a leaf with no Apple marker at all is refused (not_apple_cert)", codeOf(() => jws.verifyJws(signJws(noMarker, payload), { now: NOW, trustedRoots: [noMarker.rootDer] })) === "not_apple_cert");
    const noLeafOid = makeChain({ leafMarker: "2a864886f763640" + "60c01" });
    check("verifyJws: leaf with another OID is refused (not_apple_cert)", codeOf(() => jws.verifyJws(signJws(noLeafOid, payload), { now: NOW, trustedRoots: [noLeafOid.rootDer] })) === "not_apple_cert");
    const noInterOid = makeChain({ intermediateMarker: "2a864886f763640" + "60301" });
    check("verifyJws: intermediate with another OID is refused (not_apple_cert)", codeOf(() => jws.verifyJws(signJws(noInterOid, payload), { now: NOW, trustedRoots: [noInterOid.rootDer] })) === "not_apple_cert");
    const notCa = makeChain({ intermediateCa: false });
    check("verifyJws: an intermediate that is not a CA is refused", codeOf(() => jws.verifyJws(signJws(notCa, payload), { now: NOW, trustedRoots: [notCa.rootDer] })) === "bad_chain");
    const brokenLink = makeChain({ leafSignedByOther: true });
    check("verifyJws: a leaf not signed by the intermediate is refused", codeOf(() => jws.verifyJws(signJws(brokenLink, payload), { now: NOW, trustedRoots: [brokenLink.rootDer] })) === "bad_chain");
    check("verifyJws: the leaf and intermediate OIDs are the ones in the plan", OID_LEAF_MARKER === "2a864886f76364060b01" && OID_INTERMEDIATE_MARKER === "2a864886f76364060201");
  }
  // validity at the signing date
  {
    const short = makeChain({ leafFrom: "2025-01-01T00:00:00Z", leafTo: "2025-06-01T00:00:00Z" });
    const inside = Date.parse("2025-03-01T00:00:00Z");
    const roots = [short.rootDer];
    check("verifyJws: a leaf valid when the data was signed passes (even though it has expired since)", jws.verifyJws(signJws(short, transactionPayload({ __now: inside })), { now: NOW, trustedRoots: roots }).signedAt === inside);
    check("verifyJws: a leaf that had expired when the data was signed is refused", codeOf(() => jws.verifyJws(signJws(short, transactionPayload({ __now: NOW })), { now: NOW, trustedRoots: roots })) === "cert_expired");
    check("verifyJws: a leaf not yet valid when the data was signed is refused", codeOf(() => jws.verifyJws(signJws(short, transactionPayload({ __now: Date.parse("2024-06-01T00:00:00Z") })), { now: NOW, trustedRoots: roots })) === "cert_expired");
  }
  check("verifyJws: signed five minutes ahead is tolerated, ten is not", ok(signJws(MAIN, transactionPayload({ __now: NOW, signedDate: NOW + 4 * 60_000 }))).signedAt === NOW + 4 * 60_000 && codeOf(() => ok(signJws(MAIN, transactionPayload({ __now: NOW, signedDate: NOW + 10 * 60_000 })))) === "future_signed");
  check("verifyJws: no signedDate is refused", codeOf(() => ok(signJws(MAIN, { ...payload, signedDate: undefined }))) === "no_signed_date" && codeOf(() => ok(signJws(MAIN, { ...payload, signedDate: "soon" }))) === "no_signed_date");
  // shape
  check("verifyJws: not a JWS", ["", "abc", "a.b", "a.b.c.d", "!!.!!.!!", null, undefined, 5, {}].every((value) => codeOf(() => ok(value)) === "malformed"));
  check("verifyJws: an oversize message is refused before any work", codeOf(() => ok("a".repeat(20_000))) === "malformed");
  check("verifyJws: payload that is not an object", codeOf(() => ok(signJws(MAIN, [1, 2]))) === "malformed");
}

// ══════════════ 4. decoding the content ══════════════
{
  const dec = (payload, over = {}) => jws.decodeTransaction(signJws(MAIN, payload), { now: NOW, trustedRoots: ROOTS, ...over });
  const base = transactionPayload({ __now: NOW });
  const USER = "AAAAAAAA-1111-4222-8333-BBBBBBBBBBBB";
  let r = dec({ ...base, appAccountToken: USER });
  check("decodeTransaction: normalised fields, token lowercased, ms to ISO", r.ok && r.tx.appAccountToken === USER.toLowerCase() && r.tx.productId === base.productId && r.tx.expiresDate === new Date(base.expiresDate).toISOString() && r.tx.purchaseDate === new Date(base.purchaseDate).toISOString() && r.tx.revocationDate === null && r.tx.superseded === false && r.tx.environment === "Sandbox" && r.tx.signedAt === NOW, r);
  check("decodeTransaction: Production and Sandbox are both accepted", dec({ ...base, environment: "Production" }).ok && dec({ ...base, environment: "Sandbox" }).ok);
  check("decodeTransaction: Xcode / unknown environments are refused", dec({ ...base, environment: "Xcode" }).reason === "bad_environment" && dec({ ...base, environment: undefined }).reason === "bad_environment");
  check("decodeTransaction: another bundle is not ours", dec({ ...base, bundleId: "com.example.other" }).reason === "wrong_bundle");
  check("decodeTransaction: an unknown product is not ours", dec({ ...base, productId: "app.cybernetai.business50.monthly" }).reason === "unknown_product" && dec({ ...base, productId: "constructor" }).reason === "unknown_product");
  check("decodeTransaction: only auto-renewable subscriptions", dec({ ...base, type: "Consumable" }).reason === "wrong_type" && dec({ ...base, type: "Non-Consumable" }).reason === "wrong_type");
  check("decodeTransaction: a Family Sharing transaction is refused", dec({ ...base, inAppOwnershipType: "FAMILY_SHARED" }).reason === "family_shared");
  check("decodeTransaction: isUpgraded marks it superseded", dec({ ...base, isUpgraded: true }).tx.superseded === true && dec({ ...base, isUpgraded: false }).tx.superseded === false);
  check("decodeTransaction: a revocation date and reason are kept", (() => { const t = dec({ ...base, revocationDate: NOW - 5000, revocationReason: 1 }).tx; return t.revocationDate === new Date(NOW - 5000).toISOString() && t.revocationReason === 1; })());
  check("decodeTransaction: a token that is not a UUID is dropped", dec({ ...base, appAccountToken: "not-a-uuid" }).tx.appAccountToken === null && dec({ ...base }).tx.appAccountToken === null);
  check("decodeTransaction: missing ids or expiry are malformed", dec({ ...base, transactionId: undefined }).reason === "malformed" && dec({ ...base, originalTransactionId: "abc" }).reason === "malformed" && dec({ ...base, expiresDate: undefined }).reason === "malformed");
  check("decodeTransaction: a bad signature throws, it is not a soft failure", codeOf(() => jws.decodeTransaction((() => { const [h, p, sig] = signJws(MAIN, base).split("."); return [h, p, `${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`].join("."); })(), { now: NOW, trustedRoots: ROOTS })) === "bad_signature");

  const rn = (payload) => jws.decodeRenewalInfo(signJws(MAIN, payload), { now: NOW, trustedRoots: ROOTS });
  const renewal = rn(renewalPayload({ __now: NOW, autoRenewStatus: 0, gracePeriodExpiresDate: NOW + 86_400_000, isInBillingRetryPeriod: true, expirationIntent: 2 }));
  check("decodeRenewalInfo: auto-renew off, grace date, billing retry", renewal.ok && renewal.renewal.autoRenew === false && renewal.renewal.gracePeriodExpiresDate === new Date(NOW + 86_400_000).toISOString() && renewal.renewal.isInBillingRetryPeriod === true && renewal.renewal.expirationIntent === 2, renewal);
  check("decodeRenewalInfo: auto-renew on / unknown", rn(renewalPayload({ __now: NOW, autoRenewStatus: 1 })).renewal.autoRenew === true && rn(renewalPayload({ __now: NOW, autoRenewStatus: undefined })).renewal.autoRenew === null);
  check("decodeRenewalInfo: no transaction id is malformed", rn(renewalPayload({ __now: NOW, originalTransactionId: undefined })).reason === "malformed");

  const UUID = "7d6f5f3e-0c3b-4f64-9d0e-2f6a1d9c8b11";
  const nt = (payload) => jws.decodeNotification(signJws(MAIN, payload), { now: NOW, trustedRoots: ROOTS });
  let n = nt(notificationPayload({ type: "DID_RENEW", uuid: UUID.toUpperCase(), chain: MAIN, tx: base, renewal: renewalPayload({ __now: NOW }), signedDate: NOW }));
  check("decodeNotification: type, uuid (lowercase), environment, app id, inner JWS", n.ok && n.notification.type === "DID_RENEW" && n.notification.uuid === UUID && n.notification.environment === "Sandbox" && n.notification.appAppleId === "1234567890" && n.notification.signedTransactionInfo.split(".").length === 3 && n.notification.signedRenewalInfo.split(".").length === 3, n);
  check("decodeNotification: another bundle", nt(notificationPayload({ type: "DID_RENEW", uuid: UUID, chain: MAIN, tx: base, bundleId: "com.example.other", signedDate: NOW })).reason === "wrong_bundle");
  check("decodeNotification: a summary (no data) / no bundle", nt({ notificationType: "RENEWAL_EXTENSION", notificationUUID: UUID, signedDate: NOW, summary: { x: 1 } }).reason === "no_data" && nt(notificationPayload({ type: "TEST", uuid: UUID, chain: MAIN, data: { environment: "Sandbox" }, signedDate: NOW })).reason === "no_data");
  check("decodeNotification: no type or a bad uuid is malformed", nt({ notificationUUID: UUID, signedDate: NOW, data: {} }).reason === "malformed" && nt({ notificationType: "TEST", notificationUUID: "x", signedDate: NOW, data: {} }).reason === "malformed");
}

// ══════════════ 5. the endpoints, against a stubbed Supabase ══════════════
const SITE = "https://cybernetai.app";
const APP = "capacitor://localhost";
const id = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const USERS = {
  "t-a": { id: id(1), email: "a@example.com", email_confirmed_at: "2026-10-01T00:00:00Z" },
  "t-b": { id: id(2), email: "b@example.com", email_confirmed_at: "2026-10-01T00:00:00Z" }
};
let state;
let calls;
function reset(over = {}) {
  state = {
    quotaDenied: false,
    applyStatus: 200,
    apply: () => ({ result: "applied", entitled: true, business_account_id: null }),
    profile: { plan: "free", subscription_status: "inactive", billing_interval: "" },
    appleRows: [],
    team: null,
    notifications: new Map(), // uuid -> row
    insertStatus: 200,
    sweepStatus: 200,
    sweepResult: 2,
    knownOwner: null,
    ...over
  };
  calls = [];
  logged.length = 0;
}
const rpcCalls = (name) => calls.filter((c) => c.path === `/rest/v1/rpc/${name}`);
const applyCalls = () => rpcCalls("apply_apple_subscription");
const response = (data, status = 200, headers = {}) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  let body;
  try { body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  if (url.origin !== SUPABASE) throw new Error(`unexpected fetch ${url}`);
  const target = decodeURIComponent(url.pathname + url.search);
  const call = { method, path: url.pathname, target, body, auth: headers.get("authorization"), prefer: headers.get("prefer") };
  calls.push(call);

  if (url.pathname === "/auth/v1/user") {
    const user = USERS[(call.auth || "").replace(/^Bearer /, "")];
    return user ? response(user) : response({ msg: "invalid JWT" }, 401);
  }
  if (call.auth !== "Bearer stub-service") return response({ message: "service key required" }, 401);

  switch (url.pathname) {
    case "/rest/v1/rpc/consume_api_quota":
      return response({ allowed: !state.quotaDenied, used: state.quotaDenied ? 31 : 1, limit: 30, reset_at: "2026-10-30T13:00:00Z" });
    case "/rest/v1/rpc/apply_apple_subscription": {
      if (state.applyStatus !== 200) return response({ message: "boom", code: "XX000" }, state.applyStatus);
      const answer = state.apply(body, applyCalls().length);
      return response([answer]);
    }
    case "/rest/v1/rpc/expire_apple_subscriptions":
      return state.sweepStatus === 200 ? response(state.sweepResult) : response({ message: "down" }, state.sweepStatus);
    case "/rest/v1/profiles":
      return response([{ id: USERS["t-a"].id, full_name: "Test", billing_interval: "", ...state.profile }]);
    case "/rest/v1/apple_subscriptions":
      if (target.includes("select=user_id") && target.includes("original_transaction_id=eq.")) return response(state.knownOwner ? [{ user_id: state.knownOwner }] : []);
      return response(state.appleRows);
    case "/rest/v1/business_members":
      return response(state.team ? [{ role: state.team.role, business_accounts: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seat_tier: state.team.seatTier, daily_pool_limit: 50, recovery_pool_limit: 20, subscription_status: "active", billing_source: state.team.billingSource || "stripe" } }] : []);
    case "/rest/v1/apple_notifications": {
      if (method === "POST") {
        if (state.insertStatus !== 200) return response({ message: "down" }, state.insertStatus);
        if (state.notifications.has(body.notification_uuid)) return response([]);
        state.notifications.set(body.notification_uuid, { ...body });
        return response([body], 201);
      }
      if (method === "GET") {
        const uuid = /notification_uuid=eq\.([0-9a-f-]+)/.exec(target)?.[1];
        const row = state.notifications.get(uuid);
        return response(row ? [{ outcome: row.outcome }] : []);
      }
      if (method === "PATCH") {
        const uuid = /notification_uuid=eq\.([0-9a-f-]+)/.exec(target)?.[1];
        const row = state.notifications.get(uuid);
        if (row) Object.assign(row, body);
        return new Response(null, { status: 204 });
      }
      return response({}, 405);
    }
    default:
      return response([]);
  }
};

function req(pathname, { method = "POST", token = "", body, ios = true, origin = "", headers = {}, raw } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (ios) h["X-CyberNet-Platform"] = "ios";
  if (origin) h.Origin = origin;
  const text = raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body);
  if (text) h["Content-Length"] = String(Buffer.byteLength(text));
  return new Request(`${SITE}${pathname}`, { method, headers: h, body: ["GET", "HEAD", "OPTIONS"].includes(method) ? undefined : text });
}
const context = { ip: "203.0.113.9", requestId: "req-1" };
async function run(handler, request) {
  const res = await handler(request, context);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const corsOk = (r) => r.headers.get("access-control-allow-origin") === APP;

jws.setTrustedRootsForTests(ROOTS);

const A = USERS["t-a"];
const txFor = (user, over = {}) => signJws(MAIN, transactionPayload({ appAccountToken: user.id, ...over }));
const verifyBody = (transactions, reason = "purchase", extra = {}) => ({ reason, transactions, ...extra });

// ── apple-verify ──
{
  reset();
  let r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", ios: false, body: verifyBody([{ jws: txFor(A) }]) }));
  check("apple-verify: the website gets 403 and nothing runs", r.status === 403 && r.data.code === "ONLY_AVAILABLE_IN_APP" && calls.length === 0, r);
  r = await run(verifyFn, req("/api/apple-verify", { method: "OPTIONS", ios: false, origin: APP }));
  check("apple-verify: preflight from the app origin is 204 with CORS, nothing called", r.status === 204 && corsOk(r) && calls.length === 0 && /Authorization/.test(r.headers.get("access-control-allow-headers")), [...r.headers]);
  r = await run(verifyFn, req("/api/apple-verify", { method: "GET", token: "t-a" }));
  check("apple-verify: GET is 405", r.status === 405);
  r = await run(verifyFn, req("/api/apple-verify", { body: verifyBody([{ jws: txFor(A) }]) }));
  check("apple-verify: signed out is 401 sign_in_required", r.status === 401 && r.data.code === "sign_in_required" && !applyCalls().length, r);
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-nobody", body: verifyBody([{ jws: txFor(A) }]) }));
  check("apple-verify: an invalid token is 401", r.status === 401 && !applyCalls().length);

  reset({ quotaDenied: true });
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A) }]) }));
  const quota = rpcCalls("consume_api_quota")[0]?.body;
  check("apple-verify: 30 an hour per account, then 429 before any work", r.status === 429 && r.data.code === "rate_limited" && quota?.p_key === `apple_verify:${A.id}` && quota?.p_window_seconds === 3600 && quota?.p_max_requests === 30 && !applyCalls().length, { r, quota });

  reset();
  const tooBig = "e".repeat(16 * 1024 + 1);
  for (const [label, body] of [
    ["no reason", { transactions: [{ jws: txFor(A) }] }],
    ["unknown reason", verifyBody([{ jws: txFor(A) }], "buy")],
    ["no transactions", verifyBody([])],
    ["21 transactions", verifyBody(Array.from({ length: 21 }, () => ({ jws: txFor(A) })))],
    ["not an array", { reason: "purchase", transactions: "x" }],
    ["jws not a string", verifyBody([{ jws: 5 }])],
    ["empty jws", verifyBody([{ jws: "" }])],
    ["oversize jws", verifyBody([{ jws: tooBig }])],
    ["oversize renewal info", verifyBody([{ jws: txFor(A), renewalInfoJws: tooBig }])],
    ["an array body", [1, 2]],
    ["null body", null]
  ]) {
    const res = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body }));
    check(`apple-verify: bad body (${label}) is 400 and nothing is applied`, res.status === 400 && res.data.code === "bad_request" && !applyCalls().length, res);
  }
  let res = await run(verifyFn, req("/api/apple-verify", { token: "t-a", raw: "{not json" }));
  check("apple-verify: unreadable JSON is 400", res.status === 400);
  res = await run(verifyFn, req("/api/apple-verify", { token: "t-a", raw: "x".repeat(700_000), headers: {} }));
  check("apple-verify: a huge body is 413", res.status === 413, res.status);
  check("apple-verify: exactly 20 transactions are accepted", (await (async () => {
    reset();
    return run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody(Array.from({ length: 20 }, () => ({ jws: txFor(A) }))) }));
  })()).data?.results?.length === 20);

  // purchase of Pro monthly
  reset({ appleRows: [{ original_transaction_id: "2000000100000001", product_id: "app.cybernetai.pro.monthly", plan: "pro", seat_tier: null, billing_interval: "month", environment: "Sandbox", expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), grace_expires_at: null, auto_renew: true, status: "active", revoked_at: null }] });
  const proJws = txFor(A);
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", origin: APP, body: verifyBody([{ jws: proJws }, ], "purchase", { userId: USERS["t-b"].id, p_user_id: USERS["t-b"].id }) }));
  const args = applyCalls()[0]?.body;
  check("apple-verify: a Pro purchase is applied and the app is told to finish it", r.status === 200 && corsOk(r) && r.data.results[0].status === "applied" && r.data.results[0].finish === true && r.data.results[0].index === 0 && r.data.results[0].productId === "app.cybernetai.pro.monthly" && r.data.results[0].transactionId === "2000000200000001" && r.data.results[0].originalTransactionId === "2000000100000001", r);
  check("apple-verify: the user id given to the database is the verified token's, never the body's", args?.p_user_id === A.id && applyCalls().length === 1 && JSON.stringify(args).indexOf(USERS["t-b"].id) < 0, args);
  check("apple-verify: the database gets the product, dates, environment and signing time", args?.p_product_id === "app.cybernetai.pro.monthly" && args?.p_original_transaction_id === "2000000100000001" && args?.p_latest_transaction_id === "2000000200000001" && args?.p_environment === "Sandbox" && /^\d{4}-\d\d-\d\dT/.test(args?.p_expires_at) && args?.p_revoked_at === null && args?.p_auto_renew === null && args?.p_grace_expires_at === null && /^\d{4}-/.test(args?.p_signed_at) && args?.p_notification_type === null, args);
  check("apple-verify: the reply carries the plan and the billing object", r.data.plan === "pro" && r.data.billing.source === "apple" && r.data.billing.plan === "pro" && r.data.billing.productId === "app.cybernetai.pro.monthly" && r.data.billing.interval === "month" && r.data.billing.autoRenew === true && r.data.billing.environment === "Sandbox" && r.data.billing.alsoBilledElsewhere === false, r.data);
  check("apple-verify: a reload of the profile, team and Apple rows follows the apply", calls.findIndex((c) => c.path === "/rest/v1/profiles") > calls.findIndex((c) => c.path === "/rest/v1/rpc/apply_apple_subscription") && calls.some((c) => c.path === "/rest/v1/business_members"));
  check("apple-verify: logs name the product and result, never a JWS or an id", logged.some((l) => /apple-verify purchase: app\.cybernetai\.pro\.monthly applied/.test(l)) && !logged.some((l) => /eyJ|2000000100000001|2000000200000001/.test(l)), logged);

  // restore the same transaction twice: idempotent from the endpoint's point of view
  reset();
  const first = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: proJws }], "restore") }));
  const second = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: proJws }], "restore") }));
  check("apple-verify: restoring the same transaction twice gives the same answer both times", first.status === 200 && second.status === 200 && JSON.stringify(first.data.results) === JSON.stringify(second.data.results) && applyCalls().length === 2 && JSON.stringify(applyCalls()[0].body) === JSON.stringify(applyCalls()[1].body), { first: first.data?.results, second: second.data?.results });

  // renewal info
  reset();
  const grace = Date.now() + 5 * 86_400_000;
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: proJws, renewalInfoJws: signJws(MAIN, renewalPayload({ autoRenewStatus: 0, gracePeriodExpiresDate: grace })) }], "update") }));
  check("apple-verify: renewal info sets auto-renew and the grace date", applyCalls()[0]?.body.p_auto_renew === false && applyCalls()[0]?.body.p_grace_expires_at === new Date(grace).toISOString(), applyCalls()[0]?.body);
  reset();
  await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: proJws, renewalInfoJws: signJws(MAIN, renewalPayload({ originalTransactionId: "999" })) }]) }));
  check("apple-verify: renewal info for another subscription is not used", applyCalls()[0]?.body.p_auto_renew === null);
  reset();
  await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: proJws, renewalInfoJws: "garbage" }]) }));
  check("apple-verify: unreadable renewal info is ignored, the transaction still counts", applyCalls().length === 1 && applyCalls()[0].body.p_auto_renew === null);

  // account token rules
  reset();
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(USERS["t-b"]) }]) }));
  check("apple-verify: a purchase made under another account is wrong_account, nothing applied", r.data.results[0].status === "wrong_account" && r.data.results[0].finish === true && !applyCalls().length, r.data);
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: signJws(MAIN, transactionPayload()) }]) }));
  check("apple-verify: a transaction with no account token is wrong_account", r.data.results[0].status === "wrong_account" && !applyCalls().length, r.data);
  reset();
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: signJws(MAIN, transactionPayload({ appAccountToken: A.id.toUpperCase() })) }]) }));
  check("apple-verify: the token compares case-insensitively", r.data.results[0].status === "applied" && applyCalls().length === 1, r.data);

  // not ours / invalid / superseded
  reset();
  const batch = [
    signJws(MAIN, transactionPayload({ appAccountToken: A.id, bundleId: "com.example.other" })),
    signJws(MAIN, transactionPayload({ appAccountToken: A.id, productId: "app.cybernetai.something.else" })),
    signJws(MAIN, transactionPayload({ appAccountToken: A.id, inAppOwnershipType: "FAMILY_SHARED" })),
    signJws(MAIN, transactionPayload({ appAccountToken: A.id, type: "Consumable" }))
  ];
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody(batch.map((value) => ({ jws: value })), "restore") }));
  check("apple-verify: other bundle, unknown product, Family Sharing, wrong type are not_ours", r.data.results.map((x) => x.status).join() === "not_ours,not_ours,not_ours,not_ours" && r.data.results.every((x) => x.finish === true) && !applyCalls().length, r.data);
  reset();
  const forged = signJws(makeChain(), transactionPayload({ appAccountToken: A.id }));
  const tamperedJws = (() => { const [h, p, s] = proJws.split("."); return `${h}.${Buffer.from(JSON.stringify({ ...transactionPayload(), appAccountToken: A.id, productId: "app.cybernetai.business20.monthly" })).toString("base64url")}.${s}`; })();
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: forged }, { jws: tamperedJws }, { jws: "not.a.jws" }]) }));
  check("apple-verify: a forged chain, a tampered payload and junk are invalid, nothing applied", r.status === 200 && r.data.results.map((x) => x.status).join() === "invalid,invalid,invalid" && r.data.results.every((x) => x.finish === true) && !applyCalls().length, r.data);
  reset();
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A, { isUpgraded: true }) }]) }));
  check("apple-verify: an upgraded (superseded) transaction is stale and applies nothing", r.data.results[0].status === "stale" && r.data.results[0].finish === true && !applyCalls().length, r.data);

  // statuses reported by the database
  for (const [label, answer, tx, expected] of [
    ["entitled", { result: "applied", entitled: true }, {}, "applied"],
    ["not entitled any more", { result: "applied", entitled: false }, { expiresDate: Date.now() - 86_400_000 }, "expired"],
    ["revoked", { result: "applied", entitled: false }, { revocationDate: Date.now() - 1000, revocationReason: 0 }, "revoked"],
    ["older than what is stored", { result: "stale", entitled: true }, {}, "stale"],
    ["the person has a website team", { result: "conflict_web_plan", entitled: true }, {}, "conflict_web_plan"],
    ["the person is in another team", { result: "in_other_team", entitled: true }, {}, "in_other_team"],
    ["owned by another account", { result: "wrong_account", entitled: false }, {}, "wrong_account"],
    ["account deleted", { result: "unknown_user", entitled: false }, {}, "wrong_account"]
  ]) {
    reset({ apply: () => ({ business_account_id: null, ...answer }) });
    r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A, tx) }]) }));
    check(`apple-verify: database says "${label}" -> ${expected}`, r.status === 200 && r.data.results[0].status === expected && r.data.results[0].finish === true, r.data);
    if (expected === "revoked") check("apple-verify: the revocation reaches the database", applyCalls()[0].body.p_revoked_at !== null && applyCalls()[0].body.p_revocation_reason === 0, applyCalls()[0].body);
  }

  // batch order
  reset();
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A) }, { jws: txFor(USERS["t-b"]) }, { jws: "x.y.z" }, { jws: txFor(A, { productId: "app.cybernetai.pro.yearly", originalTransactionId: "2000000100000002", transactionId: "2000000200000002" }) }], "launch") }));
  check("apple-verify: a batch answers every transaction, in order, with its index", r.data.results.map((x) => `${x.index}:${x.status}`).join() === "0:applied,1:wrong_account,2:invalid,3:applied" && applyCalls().length === 2, r.data.results);

  // Business: the reply carries the team
  reset({ team: { role: "owner", seatTier: 10, billingSource: "apple" }, appleRows: [{ original_transaction_id: "2000000100000009", product_id: "app.cybernetai.business10.monthly", plan: "business", seat_tier: 10, billing_interval: "month", environment: "Production", expires_at: new Date(Date.now() + 86_400_000).toISOString(), grace_expires_at: null, auto_renew: true, status: "active", revoked_at: null }], apply: () => ({ result: "applied", entitled: true, business_account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) });
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A, { productId: "app.cybernetai.business10.monthly" }) }]) }));
  check("apple-verify: a Business purchase answers plan business with the seat count", r.data.plan === "business" && r.data.billing.source === "apple" && r.data.billing.seatTier === 10 && r.data.billing.productId === "app.cybernetai.business10.monthly" && r.data.billing.environment === "Production", r.data);

  // the database is down: 503, nothing to finish
  reset({ applyStatus: 500 });
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A) }]) }));
  check("apple-verify: a database failure is 503 retry_later with no results to finish", r.status === 503 && r.data.code === "retry_later" && !("results" in r.data), r);
  reset({ apply: () => ({}) });
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A) }]) }));
  check("apple-verify: an answer without a result is 503 too", r.status === 503, r);

  // the Apple root is not set up
  jws.setTrustedRootsForTests(null);
  reset();
  r = await run(verifyFn, req("/api/apple-verify", { token: "t-a", body: verifyBody([{ jws: txFor(A) }]) }));
  check("apple-verify: without the Apple root the answer is 503 apple_not_configured (the app retries), never invalid", r.status === 503 && r.data.code === "apple_not_configured" && !applyCalls().length && !("results" in r.data), r);
  jws.setTrustedRootsForTests(ROOTS);
}

// ── apple-notifications ──
{
  const notify = (payloadObject, { raw, method = "POST", headers = {} } = {}) => {
    const signed = typeof payloadObject === "string" ? payloadObject : signJws(MAIN, payloadObject);
    return run(notifyFn, new Request(`${SITE}/api/apple-notifications`, { method, headers: { "Content-Type": "application/json", ...headers }, body: method === "POST" ? (raw !== undefined ? raw : JSON.stringify({ signedPayload: signed })) : undefined }));
  };
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const now = Date.now();
  const tx = (over = {}) => transactionPayload({ appAccountToken: A.id, ...over });
  const note = (type, { subtype, txOver, renewal, signedDate = now, id: nid = uuid(), noTx } = {}) =>
    notificationPayload({ type, subtype, uuid: nid, chain: MAIN, tx: noTx ? undefined : tx(txOver), renewal: renewal === null ? undefined : (renewal || renewalPayload()), signedDate });

  reset();
  let r = await run(notifyFn, new Request(`${SITE}/api/apple-notifications`, { method: "GET" }));
  check("apple-notifications: GET is 405", r.status === 405);
  r = await notify("x", { raw: "{nope" });
  check("apple-notifications: unreadable JSON is 400", r.status === 400);
  r = await notify("x", { raw: JSON.stringify({ other: 1 }) });
  check("apple-notifications: no signedPayload is 400", r.status === 400);
  r = await notify("x", { raw: "x".repeat(101 * 1024) });
  check("apple-notifications: a body over 100 KB is 413", r.status === 413);
  r = await notify("not.a.jws");
  check("apple-notifications: junk is 400", r.status === 400 && !calls.some((c) => c.path.includes("apple_notifications")));
  r = await notify(signJws(makeChain(), note("DID_RENEW")));
  check("apple-notifications: a message not signed by the trusted root is 400, nothing stored or applied", r.status === 400 && !applyCalls().length && !calls.some((c) => c.path.includes("apple_notifications")), r);
  const forgedInner = notificationPayload({ type: "DID_RENEW", uuid: uuid(), chain: MAIN, data: { environment: "Sandbox", bundleId: "app.cybernetai", appAppleId: 1, signedTransactionInfo: signJws(makeChain(), tx()) } });
  r = await notify(forgedInner);
  check("apple-notifications: a good envelope around a forged transaction is 400", r.status === 400 && !applyCalls().length, r);

  // wrong bundle / summary
  reset();
  r = await notify(notificationPayload({ type: "DID_RENEW", uuid: uuid(), chain: MAIN, tx: tx(), bundleId: "com.example.other", signedDate: now }));
  check("apple-notifications: another app's notification is 200 ignored", r.status === 200 && r.data.outcome === "ignored" && !applyCalls().length && state.notifications.size === 0, r);
  r = await notify({ notificationType: "RENEWAL_EXTENSION", notificationUUID: uuid(), signedDate: now, summary: { x: 1 } });
  check("apple-notifications: a summary notification is 200 ignored", r.status === 200 && r.data.outcome === "ignored");

  // each handled type reaches the database with the right facts
  const proId = "2000000100000001";
  const cases = [
    ["SUBSCRIBED", "INITIAL_BUY", {}, (a) => a.p_auto_renew === true && a.p_notification_type === "SUBSCRIBED" && a.p_revoked_at === null],
    ["DID_RENEW", undefined, {}, (a) => a.p_notification_type === "DID_RENEW" && a.p_auto_renew === true && a.p_grace_expires_at === null],
    ["DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED", { renewal: renewalPayload({ autoRenewStatus: 0 }) }, (a) => a.p_auto_renew === false],
    ["DID_CHANGE_RENEWAL_PREF", "UPGRADE", { txOver: { productId: "app.cybernetai.business5.monthly" } }, (a) => a.p_product_id === "app.cybernetai.business5.monthly"],
    ["DID_FAIL_TO_RENEW", "GRACE_PERIOD", { txOver: { expiresDate: now - 3600_000 }, renewal: renewalPayload({ gracePeriodExpiresDate: now + 5 * 86_400_000, isInBillingRetryPeriod: true }) }, (a) => a.p_grace_expires_at === new Date(now + 5 * 86_400_000).toISOString() && new Date(a.p_expires_at).getTime() < now],
    ["DID_FAIL_TO_RENEW", undefined, { txOver: { expiresDate: now - 3600_000 }, renewal: renewalPayload({ isInBillingRetryPeriod: true }) }, (a) => a.p_grace_expires_at === null],
    ["GRACE_PERIOD_EXPIRED", undefined, { txOver: { expiresDate: now - 20 * 86_400_000 } }, (a) => a.p_notification_type === "GRACE_PERIOD_EXPIRED"],
    ["EXPIRED", "VOLUNTARY", { txOver: { expiresDate: now - 1000 }, renewal: renewalPayload({ autoRenewStatus: 0 }) }, (a) => a.p_auto_renew === false && new Date(a.p_expires_at).getTime() < now],
    ["REFUND", undefined, { txOver: { revocationDate: now - 500, revocationReason: 0 } }, (a) => a.p_revoked_at === new Date(now - 500).toISOString() && a.p_revocation_reason === 0],
    ["REVOKE", undefined, {}, (a) => typeof a.p_revoked_at === "string" && a.p_revoked_at === new Date(now).toISOString()],
    ["REFUND_REVERSED", undefined, { txOver: { revocationDate: now - 500 } }, (a) => a.p_revoked_at === null],
    ["RENEWAL_EXTENDED", undefined, { txOver: { expiresDate: now + 40 * 86_400_000 } }, (a) => a.p_notification_type === "RENEWAL_EXTENDED"],
    ["OFFER_REDEEMED", "UPGRADE", {}, (a) => a.p_notification_type === "OFFER_REDEEMED"]
  ];
  for (const [type, subtype, opts, assertion] of cases) {
    reset();
    const nid = uuid();
    r = await notify(note(type, { subtype, ...opts, id: nid }));
    const a = applyCalls()[0]?.body;
    check(`apple-notifications: ${type}${subtype ? `/${subtype}` : ""} is applied for the account named by the token`, r.status === 200 && r.data.outcome === "applied" && applyCalls().length === 1 && a?.p_user_id === A.id && a?.p_original_transaction_id === proId && a?.p_notification_type === type && assertion(a), { r: r.data, a });
    check(`apple-notifications: ${type} is stored, then marked applied`, state.notifications.get(nid)?.outcome === "applied" && state.notifications.get(nid)?.notification_type === type && state.notifications.get(nid)?.original_transaction_id === proId, state.notifications.get(nid));
    check(`apple-notifications: ${type} orders by Apple's signing time`, new Date(a?.p_signed_at).getTime() === now, a?.p_signed_at);
  }

  // types that are recorded and ignored
  for (const type of ["TEST", "PRICE_INCREASE", "CONSUMPTION_REQUEST", "REFUND_DECLINED", "SOMETHING_NEW"]) {
    reset();
    const nid = uuid();
    r = await notify(note(type, { id: nid }));
    check(`apple-notifications: ${type} is recorded as ignored and applies nothing`, r.status === 200 && r.data.outcome === "ignored" && !applyCalls().length && state.notifications.get(nid)?.outcome === "ignored", { r: r.data, row: state.notifications.get(nid) });
  }
  reset();
  r = await notify(note("TEST", { noTx: true, renewal: null }));
  check("apple-notifications: a TEST with no transaction is fine", r.status === 200 && r.data.outcome === "ignored");

  // duplicates and retries
  reset();
  const dup = note("DID_RENEW");
  const d1 = await notify(dup);
  const d2 = await notify(dup);
  check("apple-notifications: the same notificationUUID twice is applied once", d1.data.outcome === "applied" && d2.status === 200 && d2.data.outcome === "duplicate" && applyCalls().length === 1, { d1: d1.data, d2: d2.data });
  reset({ applyStatus: 500 });
  const flaky = note("DID_RENEW");
  r = await notify(flaky);
  check("apple-notifications: a database failure is 500 (Apple will deliver it again) and the row stays 'error'", r.status === 500 && [...state.notifications.values()][0]?.outcome === "error", { r, rows: [...state.notifications.values()] });
  state.applyStatus = 200;
  r = await notify(flaky);
  check("apple-notifications: the redelivery of a failed one is processed", r.status === 200 && r.data.outcome === "applied" && applyCalls().length === 2 && [...state.notifications.values()][0]?.outcome === "applied", { r: r.data, rows: [...state.notifications.values()] });
  reset({ insertStatus: 500 });
  r = await notify(note("DID_RENEW"));
  check("apple-notifications: if the notification cannot be stored the answer is 500", r.status === 500 && !applyCalls().length, r);

  // who the subscription belongs to
  reset({ apply: () => ({ result: "unknown_user", entitled: false, business_account_id: null }) });
  let nid = uuid();
  r = await notify(note("DID_RENEW", { id: nid }));
  check("apple-notifications: a deleted account (database says unknown_user) is 200 unknown_user", r.status === 200 && r.data.outcome === "unknown_user" && state.notifications.get(nid)?.outcome === "unknown_user", r);
  reset();
  nid = uuid();
  r = await notify(note("DID_RENEW", { id: nid, txOver: { appAccountToken: undefined } }));
  check("apple-notifications: no token and no known subscription is 200 unknown_user, nothing applied", r.status === 200 && r.data.outcome === "unknown_user" && !applyCalls().length && state.notifications.get(nid)?.outcome === "unknown_user", r);
  reset({ knownOwner: USERS["t-b"].id });
  r = await notify(note("DID_RENEW", { txOver: { appAccountToken: undefined } }));
  check("apple-notifications: no token but a known subscription goes to its owner", r.status === 200 && applyCalls()[0]?.body.p_user_id === USERS["t-b"].id, applyCalls()[0]?.body);
  reset({ apply: () => ({ result: "stale", entitled: true, business_account_id: null }) });
  nid = uuid();
  r = await notify(note("DID_RENEW", { id: nid }));
  check("apple-notifications: an out-of-order one (stale) is recorded as stale", r.status === 200 && r.data.outcome === "stale" && state.notifications.get(nid)?.outcome === "stale", r);
  reset({ apply: () => ({ result: "wrong_account", entitled: false, business_account_id: null }) });
  r = await notify(note("DID_RENEW"));
  check("apple-notifications: a subscription that belongs to another account is ignored", r.status === 200 && r.data.outcome === "ignored", r);
  reset({ apply: () => ({ result: "conflict_web_plan", entitled: true, business_account_id: null }) });
  r = await notify(note("DID_RENEW"));
  check("apple-notifications: a website-team conflict is still recorded as applied", r.status === 200 && r.data.outcome === "applied", r);
  reset();
  r = await notify(note("DID_RENEW", { txOver: { productId: "app.cybernetai.mystery" } }));
  check("apple-notifications: a product that is not ours is ignored", r.status === 200 && r.data.outcome === "ignored" && !applyCalls().length, r);

  // optional hardening
  ENV = { ...baseEnv(), APPLE_APP_APPLE_ID: "1234567890" };
  reset();
  r = await notify(note("DID_RENEW", {}));
  check("apple-notifications: APPLE_APP_APPLE_ID set, Sandbox notification of the same app passes", r.status === 200 && r.data.outcome === "applied");
  reset();
  r = await notify(notificationPayload({ type: "DID_RENEW", uuid: uuid(), chain: MAIN, tx: tx(), appAppleId: 999, environment: "Production", signedDate: now }));
  check("apple-notifications: APPLE_APP_APPLE_ID set, a Production notification with another app id is 400", r.status === 400 && !applyCalls().length, r);
  reset();
  r = await notify(notificationPayload({ type: "DID_RENEW", uuid: uuid(), chain: MAIN, tx: tx(), appAppleId: 1234567890, environment: "Production", signedDate: now }));
  check("apple-notifications: APPLE_APP_APPLE_ID set, a Production notification with the right id passes", r.status === 200 && r.data.outcome === "applied");
  ENV = baseEnv();

  // root not set up: 500, Apple redelivers
  jws.setTrustedRootsForTests(null);
  reset();
  r = await notify(note("DID_RENEW"));
  check("apple-notifications: without the Apple root the answer is 500 (never 200, so Apple delivers it again)", r.status === 500 && !applyCalls().length, r);
  jws.setTrustedRootsForTests(ROOTS);
  check("apple-notifications: no log line holds a JWS", !logged.some((l) => /eyJ/.test(l)), logged.filter((l) => /eyJ/.test(l)).slice(0, 2));
  check("apple-notifications: the handled types are exactly the planned twelve", JSON.stringify([...notifyMod.HANDLED_TYPES].sort()) === JSON.stringify(["SUBSCRIBED", "DID_RENEW", "DID_CHANGE_RENEWAL_STATUS", "DID_CHANGE_RENEWAL_PREF", "DID_FAIL_TO_RENEW", "GRACE_PERIOD_EXPIRED", "EXPIRED", "REFUND", "REVOKE", "REFUND_REVERSED", "RENEWAL_EXTENDED", "OFFER_REDEEMED"].sort()));
  check("apple-notifications: no CORS wrapper, no auth, route and config", !/withCors|verifyUser/.test(read("netlify/functions/apple-notifications.mjs").replace(/\/\/.*$/gm, "")) && notifyMod.config.path === "/api/apple-notifications");
}

// ── apple-sweep ──
{
  reset();
  check("apple-sweep: scheduled hourly, no URL", sweepMod.config.schedule === "@hourly" && !("path" in sweepMod.config), sweepMod.config);
  let r = await sweepMod.sweepAppleSubscriptions();
  check("apple-sweep: calls expire_apple_subscriptions once and reports the count", r.status === "done" && r.expired === 2 && rpcCalls("expire_apple_subscriptions").length === 1 && calls[0].auth === "Bearer stub-service", { r, calls });
  const res = await sweepMod.default();
  check("apple-sweep: the scheduled handler answers JSON 200", res.status === 200 && (await res.json()).status === "done");
  reset({ sweepStatus: 500 });
  r = await sweepMod.sweepAppleSubscriptions();
  check("apple-sweep: a failure is reported, not thrown, and answers 500", r.status === "failed" && (await sweepMod.default()).status === 500);
  ENV = { ...baseEnv(), APPLE_SWEEP: "off" };
  reset();
  r = await sweepMod.sweepAppleSubscriptions();
  check("apple-sweep: APPLE_SWEEP=off sends nothing", r.status === "disabled" && calls.length === 0);
  ENV = baseEnv();
}

// ══════════════ 6. who pays: describeBilling, effectivePlan, plans ══════════════
{
  const T = Date.parse("2026-10-30T12:00:00Z");
  const iso = (offsetDays) => new Date(T + offsetDays * 86_400_000).toISOString();
  const apple = (over = {}) => ({ original_transaction_id: "1", product_id: "app.cybernetai.pro.monthly", plan: "pro", seat_tier: null, billing_interval: "month", environment: "Production", expires_at: iso(20), grace_expires_at: null, auto_renew: true, status: "active", revoked_at: null, ...over });
  const stripePro = { plan: "pro", subscription_status: "active", billing_interval: "year" };
  const d = (args) => ent.describeBilling({ now: T, ...args });

  let b = d({ profile: { plan: "free", subscription_status: "inactive" } });
  check("billing: a free account", b.source === null && b.plan === "free" && b.productId === null && b.autoRenew === null && b.alsoBilledElsewhere === false && b.inGrace === false, b);
  b = d({ profile: stripePro });
  check("billing: Stripe Pro (yearly)", b.source === "stripe" && b.plan === "pro" && b.interval === "year" && b.productId === null && b.renewsAt === null, b);
  b = d({ profile: { plan: "pro", subscription_status: "canceled" } });
  check("billing: a cancelled Stripe plan is free", b.source === null && b.plan === "free", b);
  b = d({ profile: {}, appleRows: [apple()] });
  check("billing: Apple Pro monthly, renewing", b.source === "apple" && b.plan === "pro" && b.productId === "app.cybernetai.pro.monthly" && b.interval === "month" && b.renewsAt === iso(20) && b.endsAt === null && b.autoRenew === true && b.inGrace === false && b.environment === "Production" && b.seatTier === null, b);
  b = d({ profile: {}, appleRows: [apple({ product_id: "app.cybernetai.pro.yearly", billing_interval: "year", auto_renew: false })] });
  check("billing: Apple Pro yearly, renewal switched off, ends on the expiry", b.interval === "year" && b.renewsAt === null && b.endsAt === iso(20) && b.autoRenew === false, b);
  b = d({ profile: {}, appleRows: [apple({ expires_at: iso(-1), grace_expires_at: iso(4), status: "grace" })] });
  check("billing: Apple Pro in the billing grace period is still Pro, flagged inGrace, ends at the grace end", b.plan === "pro" && b.source === "apple" && b.inGrace === true && b.renewsAt === null && b.endsAt === iso(4), b);
  b = d({ profile: {}, appleRows: [apple({ expires_at: iso(-1), status: "expired" })] });
  check("billing: an expired Apple subscription is free", b.source === null && b.plan === "free", b);
  b = d({ profile: {}, appleRows: [apple({ revoked_at: iso(-2), status: "revoked" })] });
  check("billing: a refunded (revoked) Apple subscription is free even before its end date", b.source === null && b.plan === "free", b);
  b = d({ profile: {}, appleRows: [apple({ product_id: "app.cybernetai.business10.monthly", plan: "business", seat_tier: 10 })], team: { role: "owner", seatTier: 10, billingSource: "apple" } });
  check("billing: Apple Business owner", b.source === "apple" && b.plan === "business" && b.seatTier === 10 && b.productId === "app.cybernetai.business10.monthly" && b.interval === "month" && b.alsoBilledElsewhere === false, b);
  b = d({ profile: stripePro, team: { role: "owner", seatTier: 5, billingSource: "stripe" } });
  check("billing: Stripe Business owner", b.source === "stripe" && b.plan === "business" && b.seatTier === 5, b);
  b = d({ profile: { plan: "free" }, team: { role: "member", seatTier: 20, billingSource: "stripe" } });
  check("billing: a team member gets Business from the team", b.source === "team" && b.plan === "business" && b.seatTier === 20 && b.productId === null, b);
  b = d({ profile: stripePro, appleRows: [apple()] });
  check("billing: Stripe Pro and Apple Pro together are flagged alsoBilledElsewhere", b.alsoBilledElsewhere === true && b.source === "apple" && b.plan === "pro", b);
  b = d({ profile: {}, appleRows: [apple({ product_id: "app.cybernetai.business5.monthly", plan: "business", seat_tier: 5 })], team: { role: "owner", seatTier: 5, billingSource: "apple" } });
  check("billing: the same Apple plan seen through its own team is not a duplicate", b.alsoBilledElsewhere === false, b);
  b = d({ profile: stripePro, team: { role: "owner", seatTier: 5, billingSource: "stripe" } , appleRows: [apple()] });
  check("billing: Apple Pro plus a Stripe team is flagged", b.alsoBilledElsewhere === true && b.plan === "business", b);
  b = d({ profile: {}, appleRows: [apple({ plan: "pro" }), apple({ original_transaction_id: "2", product_id: "app.cybernetai.business5.monthly", plan: "business", seat_tier: 5, expires_at: iso(10) })], team: { role: "owner", seatTier: 5, billingSource: "apple" } });
  check("billing: with two Apple rows Business wins", b.productId === "app.cybernetai.business5.monthly", b);
  b = d({ profile: {}, appleRows: [apple()], team: { role: "member", seatTier: 5, billingSource: "stripe" } });
  check("billing: a member who also has their own Apple Pro keeps that as the source", b.source === "apple" && b.plan === "business", b);
  check("billing: the keys are exactly the planned ones", JSON.stringify(Object.keys(d({}))) === JSON.stringify(["source", "plan", "productId", "seatTier", "interval", "renewsAt", "endsAt", "autoRenew", "inGrace", "environment", "alsoBilledElsewhere"]), Object.keys(d({})));

  const legacy = (profile, billing) => ent.legacyBillingFields(profile, billing);
  check("billing: the website's status/interval fields follow Apple when Stripe has nothing", JSON.stringify(legacy({ plan: "free", subscription_status: "inactive" }, d({ appleRows: [apple({ product_id: "app.cybernetai.pro.yearly", billing_interval: "year" })] }))) === JSON.stringify({ subscriptionStatus: "active", billingInterval: "year" }) && legacy({ plan: "free" }, d({ appleRows: [apple({ expires_at: iso(-1), grace_expires_at: iso(2) })] })).subscriptionStatus === "past_due" && legacy(stripePro, d({ profile: stripePro, appleRows: [apple()] })).billingInterval === "year" && legacy({}, d({})).subscriptionStatus === "inactive");

  // effectivePlan reads the Apple rows getProfile attached
  const plan = (profile) => supa.effectivePlan(profile);
  check("effectivePlan: free, Stripe Pro, Stripe canceled", plan({}) === "free" && plan(stripePro) === "pro" && plan({ plan: "pro", subscription_status: "canceled" }) === "free");
  check("effectivePlan: Apple Pro counts, an expired or revoked one does not", plan({ plan: "free", apple: [apple({ expires_at: new Date(Date.now() + 86_400_000).toISOString() })] }) === "pro"
    && plan({ plan: "free", apple: [apple({ expires_at: new Date(Date.now() - 86_400_000).toISOString() })] }) === "free"
    && plan({ plan: "free", apple: [apple({ expires_at: new Date(Date.now() + 86_400_000).toISOString(), revoked_at: iso(-1) })] }) === "free"
    && plan({ plan: "free", apple: [apple({ expires_at: new Date(Date.now() - 1000).toISOString(), grace_expires_at: new Date(Date.now() + 86_400_000).toISOString() })] }) === "pro");
  check("effectivePlan: an Apple Business row alone is not an individual plan (the team is)", plan({ plan: "free", apple: [apple({ plan: "business", expires_at: new Date(Date.now() + 86_400_000).toISOString() })] }) === "free");
  check("dailyLimit: Apple Pro gets Pro's 15", supa.dailyLimit({ plan: "free", apple: [apple({ expires_at: new Date(Date.now() + 86_400_000).toISOString() })] }) === 15 && supa.dailyLimit({}) === 3 && supa.dailyLimit(stripePro) === 15);

  // plans.mjs
  const L = plans.PLAN_LIMITS;
  check("plans: Free 3 / 5 / 1 / 1 with a 6 hour cooldown", L.free.analysesPerDay === 3 && L.free.quickScansPerDay === 5 && L.free.recoveryCasesPerDay === 1 && L.free.recoveryUpdatesPerDay === 1 && L.free.recoveryUpdateCooldownSeconds === 21600);
  check("plans: Pro 15 / unlimited / 3 / no cap with a 2 hour cooldown", L.pro.analysesPerDay === 15 && L.pro.quickScansPerDay === 100000 && L.pro.recoveryCasesPerDay === 3 && L.pro.recoveryUpdatesPerDay === 999 && L.pro.recoveryUpdateCooldownSeconds === 7200);
  check("plans: Business pools by seat count, 1 hour cooldown", plans.limitsFor("business", { dailyPoolLimit: 90, recoveryPoolLimit: 36 }).analysesPerDay === 90 && plans.limitsFor("business", { dailyPoolLimit: 160, recoveryPoolLimit: 64 }).recoveryCasesPerDay === 64 && plans.limitsFor("business").analysesPerDay === 50 && L.business.recoveryUpdateCooldownSeconds === 3600);
  check("plans: an unknown plan reads as Free, and the table is frozen", plans.limitsFor("mystery") === L.free && Object.isFrozen(L) && Object.isFrozen(L.pro));
}

// ══════════════ 7. cors: iosOnly ══════════════
{
  let ran = 0;
  const only = cors.iosOnly(async () => { ran++; return new Response("ok"); });
  let res = await only(new Request(`${SITE}/api/x`, { method: "POST" }), context);
  check("iosOnly: the website gets 403 ONLY_AVAILABLE_IN_APP and the function does not run", res.status === 403 && (await res.json()).code === "ONLY_AVAILABLE_IN_APP" && ran === 0);
  res = await only(new Request(`${SITE}/api/x`, { method: "POST", headers: { "X-CyberNet-Platform": "ios" } }), context);
  check("iosOnly: the app goes through", res.status === 200 && ran === 1);
  res = await only(new Request(`${SITE}/api/x`, { method: "POST", headers: { Origin: APP } }), context);
  check("iosOnly: the app's origin alone counts as the app", res.status === 200 && ran === 2);
  check("source: apple-verify is CORS-wrapped, iOS-only, and lets OPTIONS through", /export default withCors\(iosOnly\(handler\)\);/.test(read("netlify/functions/apple-verify.mjs")) && /method:\s*\["POST", "OPTIONS"\]/.test(read("netlify/functions/apple-verify.mjs")));
}

realConsole.log(`apple iap: ${checks - failures}/${checks} checks passed`);
if (failures) {
  realConsole.log(`(${logged.length} lines the functions logged; last 5:)\n  ${logged.slice(-5).join("\n  ").slice(0, 1500)}`);
  process.exit(1);
}
