// Apple In-App Purchase (iPhone app 1.1, Pro only), end to end on the server:
//   /api/apple-verify, /api/apple-notifications, account-status (app and
//   website), customer-portal, the D2 plan rule, and the JWS verifier.
//
// Real code paths: Apple's own SignedDataVerifier (@apple/app-store-server-library)
// checks every JWS; the only test hook is the trusted root, set to a throwaway
// chain built by tests/apple-jws-helper.mjs. The database is REAL: PGlite runs
// supabase/schema.sql (which mirrors the 1.1 migration) and a tiny PostgREST
// stand-in forwards the few REST calls the functions make. No network, no
// keys, no accounts.
//
//   node tests/run-apple-iap.mjs
process.env.NODE_ENV = "test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeChain, signJws, transactionPayload, renewalPayload, notificationPayload } from "./apple-jws-helper.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  console.log("apple iap: skipped (PGlite is not installed; run npm install)");
  process.exit(0);
}

for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY", "ADMIN_EMAILS", "REVIEW_ACCOUNT_EMAILS", "RESEND_API_KEY", "ERROR_ALERTS"]) delete process.env[name];
const SUPABASE = "https://stub-project.supabase.test";
let ENV = { SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", STRIPE_SECRET_KEY: "sk_test_apple_iap_fake", ERROR_ALERTS: "off" };
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const quiet = { log: console.log, warn: console.warn, error: console.error };
const logs = [];
console.log = (...a) => logs.push(a.join(" "));
console.warn = (...a) => logs.push(a.join(" "));
console.error = (...a) => logs.push(a.join(" "));

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    quiet.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail).slice(0, 1500)}`}`);
  }
}

// ── the database ──
const db = new PGlite();
await db.exec(`
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
set check_function_bodies = off;`);
await db.exec(read("supabase/schema.sql").replace(/^create extension[^;]*;/gim, "--"));
await db.exec("set check_function_bodies = on;");
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const U = {
  A: "bbbbbbbb-0000-4000-8000-000000000001",
  B: "bbbbbbbb-0000-4000-8000-000000000002",
  STRIPE: "bbbbbbbb-0000-4000-8000-000000000003",
  BIZ: "bbbbbbbb-0000-4000-8000-000000000004",
  OWNER: "bbbbbbbb-0000-4000-8000-000000000005",
  MEMBER: "bbbbbbbb-0000-4000-8000-000000000006",
  W: "bbbbbbbb-0000-4000-8000-000000000007",
  FREE: "bbbbbbbb-0000-4000-8000-000000000008",
  GONE: "bbbbbbbb-0000-4000-8000-000000000099"
};
const TOKENS = {};
for (const [key, id] of Object.entries(U)) {
  TOKENS[`t-${key.toLowerCase()}`] = id;
  if (key === "GONE") continue;
  await q("insert into auth.users (id, email) values ($1, $2)", [id, `${key.toLowerCase()}@example.test`]);
  await q("insert into public.profiles (id, full_name, plan, subscription_status) values ($1, $2, 'free', 'inactive') on conflict (id) do nothing", [id, key]);
}
await q("update public.profiles set plan = 'pro', subscription_status = 'active', stripe_customer_id = 'cus_x', stripe_subscription_id = 'sub_x' where id = $1", [U.STRIPE]);
await q("update public.profiles set plan = 'business', subscription_status = 'active' where id = $1", [U.BIZ]);
const TEAMS = {
  [U.OWNER]: { role: "owner", business_accounts: { id: "cccccccc-0000-4000-8000-000000000001", seat_tier: 5, daily_pool_limit: 250, recovery_pool_limit: 100, subscription_status: "active" } },
  [U.MEMBER]: { role: "member", business_accounts: { id: "cccccccc-0000-4000-8000-000000000001", seat_tier: 5, daily_pool_limit: 250, recovery_pool_limit: 100, subscription_status: "active" } }
};

// ── a tiny PostgREST stand-in ──
let restDown = null; // a path prefix that answers 500
let rpcMissing = false; // entitlement_of / plan_of answer 404 (migration not run)
const restCalls = [];
const reply = (data, status = 200) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const eq = (params, key) => (params.get(key) || "").replace(/^eq\./, "");
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method || "GET").toUpperCase();
  if (!url.origin.startsWith(SUPABASE)) throw new Error(`unexpected fetch ${url}`);
  const auth = (init.headers?.Authorization || init.headers?.authorization || "").replace(/^Bearer /, "");
  if (url.pathname === "/auth/v1/user") {
    const id = TOKENS[auth];
    return id && id !== U.GONE ? reply({ id, email: `${id.slice(-2)}@example.test`, user_metadata: {} }) : reply({ msg: "bad" }, 401);
  }
  const p = url.pathname;
  restCalls.push(`${method} ${p}`);
  if (restDown && p.startsWith(restDown)) return reply({ message: "down" }, 500);
  const body = init.body ? JSON.parse(init.body) : null;
  try {
    if (p === "/rest/v1/rpc/consume_api_quota") return reply({ allowed: true, used: 1, reset_at: new Date(Date.now() + 3600e3).toISOString() });
    if (p.startsWith("/rest/v1/rpc/")) {
      const fn = p.slice("/rest/v1/rpc/".length);
      if (rpcMissing && ["entitlement_of", "plan_of", "apply_apple_subscription"].includes(fn)) return reply({ code: "PGRST202", message: "not found" }, 404);
      const keys = Object.keys(body || {});
      const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
      const rows = await q(sql, keys.map((k) => body[k]));
      if (fn === "plan_of" || fn === "recovery_window_start") return reply(rows[0]?.[fn] ?? null);
      return reply(rows.map(normal));
    }
    const params = url.searchParams;
    if (p === "/rest/v1/profiles" && method === "GET") return reply((await q("select * from public.profiles where id = $1", [eq(params, "id")])).map(normal));
    if (p === "/rest/v1/business_members" && method === "GET") {
      const team = TEAMS[eq(params, "user_id")];
      return reply(team ? [team] : []);
    }
    if (p === "/rest/v1/apple_subscriptions" && method === "GET") {
      const rows = params.get("original_transaction_id")
        ? await q("select user_id from public.apple_subscriptions where original_transaction_id = $1", [eq(params, "original_transaction_id")])
        : [];
      return reply(rows);
    }
    if (p === "/rest/v1/apple_notifications") {
      if (method === "POST") {
        const rows = await q(`insert into public.apple_notifications (notification_uuid, notification_type, subtype, environment, original_transaction_id, signed_date, outcome)
          values ($1,$2,$3,$4,$5,$6,$7) on conflict (notification_uuid) do nothing returning notification_uuid`,
        [body.notification_uuid, body.notification_type, body.subtype, body.environment, body.original_transaction_id, body.signed_date, body.outcome]);
        return reply(rows, 201);
      }
      if (method === "GET") return reply(await q("select outcome from public.apple_notifications where notification_uuid = $1", [eq(params, "notification_uuid")]));
      if (method === "PATCH") {
        await q("update public.apple_notifications set outcome = $2 where notification_uuid = $1", [eq(params, "notification_uuid"), body.outcome]);
        return reply(undefined, 204);
      }
    }
    if (method === "GET") return reply([]);
    return reply([], 201);
  } catch (error) {
    return reply({ message: error.message }, 400);
  }
};
function normal(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

// ── the code under test ──
const jws = await import("../netlify/lib/apple-verify-jws.mjs");
const products = await import("../netlify/lib/apple-products.mjs");
const rootCa = await import("../netlify/lib/apple-root-ca-g3.mjs");
const cors = await import("../netlify/lib/cors.mjs");
const tier = await import("../netlify/lib/app-tier.mjs");
const { PLAN_LIMITS } = await import("../netlify/lib/plans.mjs");
const verifyFn = (await import("../netlify/functions/apple-verify.mjs")).default;
const notifyFn = (await import("../netlify/functions/apple-notifications.mjs")).default;
const statusFn = (await import("../netlify/functions/account-status.mjs")).default;
const portalFn = (await import("../netlify/functions/customer-portal.mjs")).default;

const APP = "capacitor://localhost";
const IAP = { "X-CyberNet-Platform": "ios", "X-CyberNet-Plans": "1", "X-CyberNet-IAP": "1" };
async function call(fn, urlPath, { method = "POST", token, body, headers = {}, origin = APP } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fn(new Request(`https://cybernetai.app${urlPath}`, { method, headers: h, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) }));
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text, headers: res.headers };
}
const verify = (token, reason, transactions, headers = IAP) => call(verifyFn, "/api/apple-verify", { token, body: { reason, transactions }, headers });
const notify = (signedPayload) => call(notifyFn, "/api/apple-notifications", { body: { signedPayload }, origin: "" });
const status = (token, headers = IAP, origin = APP) => call(statusFn, "/api/account-status", { method: "GET", token, headers, origin });

// ── static facts ──
check("products: Pro monthly and yearly only", JSON.stringify(products.PRO_PRODUCT_IDS) === '["app.cybernetai.pro.monthly","app.cybernetai.pro.yearly"]');
check("products: the SQL allows exactly the same ids", read("supabase/migrations/20261121120000_apple_iap_pro.sql").includes("product_id in ('app.cybernetai.pro.monthly', 'app.cybernetai.pro.yearly')"));
check("bundle id matches the Capacitor app id", read("mobile/capacitor.config.ts").includes(`appId: "${products.BUNDLE_ID}"`));
check("app Apple id is 6828596086", products.APP_APPLE_ID === 6828596086);
check("root pin is Apple Root CA - G3's SHA-256", rootCa.APPLE_ROOT_CA_G3_SHA256 === "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
if (rootCa.APPLE_ROOT_CA_G3_BASE64 === rootCa.APPLE_ROOT_CA_G3_PLACEHOLDER) {
  quiet.log("NOTE: APPLE ROOT NOT EMBEDDED (netlify/lib/apple-root-ca-g3.mjs): purchases answer 503 until it is. Deploy blocker for Apple purchases only.");
  check("placeholder root: nothing is trusted", jws.embeddedRoots() === null);
} else {
  check("the embedded root matches its pinned SHA-256", Array.isArray(jws.embeddedRoots()) && jws.embeddedRoots().length === 1);
}
check("CORS allows X-CyberNet-IAP", /X-CyberNet-IAP/.test((await call(statusFn, "/api/account-status", { method: "OPTIONS" })).headers.get("access-control-allow-headers") || ""));
const hdr = (obj) => new Request("https://x.test", { headers: obj });
check("isIapBuild needs Plans: 1 and IAP: 1 from the app", cors.isIapBuild(hdr(IAP)) && !cors.isIapBuild(hdr({ "X-CyberNet-Platform": "ios", "X-CyberNet-IAP": "1" })) &&
  !cors.isIapBuild(hdr({ "X-CyberNet-Plans": "1", "X-CyberNet-IAP": "1" })) && !cors.isIapBuild(hdr({ ...IAP, "X-CyberNet-IAP": "2" })));

// ── fail closed without the root ──
let r = await verify("t-a", "launch", [{ jws: "a.b.c" }]);
check("root not configured: apple-verify 503 apple_not_configured", r.status === 503 && r.data.code === "apple_not_configured", r);
r = await notify(signJws(makeChain(), notificationPayload({ type: "TEST", uuid: "dddddddd-0000-4000-8000-000000000000", chain: makeChain() })));
check("root not configured: apple-notifications 500 (Apple retries)", r.status === 500, r);

// From here on the throwaway chain is the trusted root.
const chain = makeChain();
jws.setTrustedRootsForTests([chain.rootDer]);
const H = 3600e3, DAY = 86400e3;
let now = Date.now();
let uuidN = 0;
const uuid = () => `dddddddd-0000-4000-8000-${String(++uuidN).padStart(12, "0")}`;
const tx = (over = {}) => signJws(chain, transactionPayload({ __now: now, ...over }));
const ren = (over = {}) => signJws(chain, renewalPayload({ __now: now, ...over }));
const note = (type, txOver = {}, { subtype, renewal, environment = "Sandbox", appAppleId = 6828596086, signedDate = now, bundleId } = {}) =>
  signJws(chain, notificationPayload({ type, subtype, uuid: uuid(), chain, environment, appAppleId, bundleId, signedDate,
    tx: transactionPayload({ __now: now, environment, ...txOver, signedDate: txOver.signedDate ?? signedDate }),
    renewal: renewal ? renewalPayload({ __now: now, environment, ...renewal, signedDate: renewal.signedDate ?? signedDate }) : undefined }));
const row = async (otid) => (await q("select * from public.apple_subscriptions where original_transaction_id = $1", [otid]))[0];
const planOf = async (u) => (await q("select public.plan_of($1) as p", [u]))[0].p;

// ── iPhone only, input limits ──
r = await call(verifyFn, "/api/apple-verify", { token: "t-a", body: { reason: "launch", transactions: [{ jws: tx() }] }, origin: "" });
check("apple-verify from the website: 403", r.status === 403, r);
r = await verify(null, "launch", [{ jws: tx() }]);
check("apple-verify signed out: 401", r.status === 401 && r.data.code === "sign_in_required", r);
r = await verify("t-a", "buy", [{ jws: tx() }]);
check("apple-verify unknown reason: 400", r.status === 400, r);
r = await verify("t-a", "launch", Array.from({ length: 21 }, () => ({ jws: "x.y.z" })));
check("apple-verify more than 20: 400", r.status === 400, r);
r = await verify("t-a", "launch", [{ jws: "x".repeat(17 * 1024) }]);
check("apple-verify a JWS over 16 KB: 400", r.status === 400, r);

// ── A buys Pro (purchase) ──
const OT = "2000000100000001";
r = await verify("t-a", "purchase", [{ jws: tx({ appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000001" }), renewalInfoJws: ren({ originalTransactionId: OT }) }]);
check("purchase: applied, finish", r.status === 200 && r.data.results[0].status === "applied" && r.data.results[0].finish === true, r.data);
check("purchase: entitlement says Apple, no buying", r.data.entitlement?.source === "apple" && r.data.entitlement.canPurchase === false && r.data.entitlement.purchaseBlockedReason === "active_apple" && r.data.entitlement.appAccountToken === U.A, r.data.entitlement);
check("purchase: test purchase marked Sandbox, renews", r.data.entitlement.apple?.environment === "Sandbox" && r.data.entitlement.apple.autoRenew === true && r.data.entitlement.apple.active === true, r.data.entitlement.apple);
const e0 = r.data.entitlement;
check("purchase: flat Apple fields (server.md §6) mirror the nested ones", e0.appleProductId === "app.cybernetai.pro.monthly" && e0.appleExpiresAt === e0.apple.expiresAt &&
  e0.appleAutoRenew === true && e0.appleInGrace === false && e0.appleEnvironment === "Sandbox", e0);
check("purchase: plan_of = pro", (await planOf(U.A)) === "pro");
check("purchase: no JWS, transaction id or user id in the logs", !logs.some((l) => l.includes(OT) || l.includes(U.A) || l.includes("eyJ")), logs.filter((l) => l.includes(OT) || l.includes(U.A)));

// account-status in the IAP build
r = await status("t-a");
check("account-status IAP: appPlan pro, billing apple", r.data.profile.appPlan === "pro" && r.data.profile.billing?.source === "apple" && r.data.usage.limit === PLAN_LIMITS.pro.analysesPerDay, r.data.profile);
r = await status("t-a", { "X-CyberNet-Platform": "ios", "X-CyberNet-Plans": "1" });
check("account-status build 6-10 (Plans only): Apple Pro counts, but no billing data", r.data.profile.appPlan === "pro" && !("billing" in r.data.profile), r.data.profile);
r = await status("t-a", {}, "");
check("account-status website: plan pro, billingSource apple, Apple dates", r.data.profile.plan === "pro" && r.data.profile.billingSource === "apple" && Boolean(r.data.profile.apple?.expiresAt) && r.data.usage.limit === 15, r.data.profile);

// customer portal for an Apple-only account
r = await call(portalFn, "/api/customer-portal", { token: "t-a", origin: "" });
check("customer-portal Apple-only: 409 BILLED_BY_APPLE with the iPhone path", r.status === 409 && r.data.code === "BILLED_BY_APPLE" && /Settings > your name > Subscriptions/.test(r.data.error), r);

// ── the same purchase sent again (unfinished at launch) ──
r = await verify("t-a", "launch", [{ jws: tx({ appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000001" }) }]);
check("the same transaction again: applied (idempotent), still Pro", ["applied", "stale"].includes(r.data.results[0].status) && (await planOf(U.A)) === "pro", r.data.results);

// ── wrong_account: B signs in on the same phone and restores ──
r = await verify("t-b", "restore", [{ jws: tx({ appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000001" }) }]);
check("restore on another account: wrong_account, finish, nothing moves", r.data.results[0].status === "wrong_account" && r.data.results[0].finish === true && (await row(OT)).user_id === U.A && (await planOf(U.B)) === "free", r.data);
check("wrong_account: B can still buy in principle, the reply never names A", r.data.entitlement.canPurchase === true && !r.text.includes(U.A) && !r.text.includes("@example"), r.data);

// ── renew: DID_RENEW notification with the next period ──
const P2 = now + 60 * DAY;
r = await notify(note("DID_RENEW", { appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000002", purchaseDate: now + 1000, expiresDate: P2 }, { renewal: { originalTransactionId: OT }, signedDate: now + 2000 }));
check("DID_RENEW: 200 applied", r.status === 200 && r.data.outcome === "applied", r);
check("DID_RENEW: period extended", new Date((await row(OT)).expires_at).getTime() === P2);

// ── DID_RENEW after the app already synced the next period ──
const P3 = now + 90 * DAY;
r = await verify("t-a", "update", [{ jws: tx({ appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3, signedDate: now + 9000 }) }]);
check("app sync of the next period: applied", r.data.results[0].status === "applied", r.data);
r = await notify(note("DID_RENEW", { appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3 }, { signedDate: now + 6000 }));
check("DID_RENEW after the app sync: 200 stale, period kept, still Pro", r.data.outcome === "stale" && new Date((await row(OT)).expires_at).getTime() === P3 && (await planOf(U.A)) === "pro", r.data);

// ── duplicate delivery ──
const dup = note("DID_CHANGE_RENEWAL_STATUS", { appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3 }, { renewal: { originalTransactionId: OT, autoRenewStatus: 0 }, signedDate: now + 10000 });
r = await notify(dup);
check("renewal turned off: applied, auto_renew false", r.data.outcome === "applied" && (await row(OT)).auto_renew === false, r.data);
r = await notify(dup);
check("the same notification again: 200 duplicate", r.status === 200 && r.data.outcome === "duplicate", r.data);
r = await status("t-a");
check("account-status IAP: renewal off shows autoRenew false", r.data.profile.billing.apple.autoRenew === false, r.data.profile.billing);

// ── refund / revoke, then a stale app sync, then reversed ──
r = await notify(note("REFUND", { appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3, revocationDate: now + 11000, revocationReason: 0 }, { signedDate: now + 11000 }));
check("REFUND: applied, Pro ends at once", r.data.outcome === "applied" && (await planOf(U.A)) === "free" && (await row(OT)).status === "revoked", r.data);
r = await verify("t-a", "launch", [{ jws: tx({ appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3, signedDate: now + 20000 }) }]);
check("stale app sync after the refund: stale, Pro does NOT come back", r.data.results[0].status === "stale" && (await planOf(U.A)) === "free" && r.data.entitlement.canPurchase === true, r.data);
r = await notify(note("REFUND_REVERSED", { appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3 }, { signedDate: now + 30000 }));
check("REFUND_REVERSED: Pro again", r.data.outcome === "applied" && (await planOf(U.A)) === "pro", r.data);
r = await notify(note("REVOKE", { appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3 }, { signedDate: now + 40000 }));
check("REVOKE without a revocationDate: the notification date ends Pro", r.data.outcome === "applied" && (await planOf(U.A)) === "free" && Boolean((await row(OT)).revoked_at), r.data);
r = await verify("t-a", "launch", [{ jws: tx({ appAccountToken: U.A, originalTransactionId: OT, transactionId: "3000000000000003", purchaseDate: now + 5000, expiresDate: P3, revocationDate: now + 40000, signedDate: now + 50000 }) }]);
check("app sync of a revoked transaction: status revoked", r.data.results[0].status === "revoked" || r.data.results[0].status === "stale", r.data.results);

// ── grace period and expiry (new chain for W, already past its period) ──
const OTW = "2000000100000777";
r = await verify("t-w", "purchase", [{ jws: tx({ appAccountToken: U.W, originalTransactionId: OTW, transactionId: "3000000000000777", purchaseDate: now - 2 * DAY, expiresDate: now - H, signedDate: now - H }) }]);
check("a period that already ended: expired, not Pro", r.data.results[0].status === "expired" && (await planOf(U.W)) === "free", r.data.results);
r = await notify(note("DID_FAIL_TO_RENEW", { appAccountToken: U.W, originalTransactionId: OTW, transactionId: "3000000000000777", purchaseDate: now - 2 * DAY, expiresDate: now - H },
  { subtype: "GRACE_PERIOD", renewal: { originalTransactionId: OTW, gracePeriodExpiresDate: now + 6 * DAY, isInBillingRetryPeriod: true }, signedDate: now }));
check("DID_FAIL_TO_RENEW / GRACE_PERIOD: Pro continues", r.data.outcome === "applied" && (await planOf(U.W)) === "pro" && (await row(OTW)).status === "grace", r.data);
r = await status("t-w");
check("account-status IAP: inGrace true", r.data.profile.billing.apple?.inGrace === true && r.data.profile.billing.source === "apple", r.data.profile.billing);
r = await notify(note("GRACE_PERIOD_EXPIRED", { appAccountToken: U.W, originalTransactionId: OTW, transactionId: "3000000000000777", purchaseDate: now - 2 * DAY, expiresDate: now - H },
  { renewal: { originalTransactionId: OTW, isInBillingRetryPeriod: true }, signedDate: now + 1000 }));
check("GRACE_PERIOD_EXPIRED: Pro ends", r.data.outcome === "applied" && (await planOf(U.W)) === "free", r.data);
r = await notify(note("EXPIRED", { appAccountToken: U.W, originalTransactionId: OTW, transactionId: "3000000000000777", purchaseDate: now - 2 * DAY, expiresDate: now - H }, { subtype: "VOLUNTARY", signedDate: now + 2000 }));
check("EXPIRED: expired", r.data.outcome === "applied" && (await row(OTW)).status === "expired", r.data);

// ── no token (CRITIC #9): offer code / resubscribed in iOS Settings ──
const OTN = "2000000100000888";
const noToken = tx({ originalTransactionId: OTN, transactionId: "3000000000000888" });
r = await verify("t-free", "purchase", [{ jws: noToken }]);
check("token-less chain on a purchase call: not_linked, NOT finished, not stored", r.data.results[0].status === "not_linked" && r.data.results[0].finish === false && !(await row(OTN)), r.data.results);
r = await verify("t-free", "launch", [{ jws: noToken }]);
check("token-less chain on the launch sync: linked to the caller", r.data.results[0].status === "applied" && (await row(OTN)).user_id === U.FREE, r.data.results);
r = await notify(note("DID_RENEW", { originalTransactionId: OTN, transactionId: "3000000000000889", purchaseDate: now + 1000, expiresDate: now + 40 * DAY }, { signedDate: now + 1000 }));
check("renewal of a token-less chain reaches the stored owner", r.data.outcome === "applied" && (await row(OTN)).latest_transaction_id === "3000000000000889", r.data);
r = await notify(note("SUBSCRIBED", { originalTransactionId: "2000000100000999", transactionId: "3000000000000999" }, { subtype: "INITIAL_BUY" }));
check("notification for an unknown token-less chain: 200 unknown_user, nothing stored", r.status === 200 && r.data.outcome === "unknown_user" && !(await row("2000000100000999")), r.data);

// ── Ask to Buy approved while another account is signed in ──
const OTK = "2000000100000555";
const kid = tx({ appAccountToken: U.B, originalTransactionId: OTK, transactionId: "3000000000000555" });
r = await verify("t-w", "update", [{ jws: kid }]);
check("Ask to Buy, other account signed in: wrong_account", r.data.results[0].status === "wrong_account" && !(await row(OTK)), r.data.results);
r = await notify(note("SUBSCRIBED", { appAccountToken: U.B, originalTransactionId: OTK, transactionId: "3000000000000555" }, { subtype: "INITIAL_BUY" }));
check("Ask to Buy: the notification links the token's account", r.data.outcome === "applied" && (await row(OTK)).user_id === U.B, r.data);

// ── deleted user ──
r = await notify(note("DID_RENEW", { appAccountToken: U.GONE, originalTransactionId: "2000000100000444", transactionId: "3000000000000444" }));
check("deleted user: 200 unknown_user, no account or row re-created", r.status === 200 && r.data.outcome === "unknown_user" && !(await row("2000000100000444")) &&
  (await q("select count(*)::int n from auth.users where id = $1", [U.GONE]))[0].n === 0 && (await q("select count(*)::int n from public.profiles where id = $1", [U.GONE]))[0].n === 0, r.data);

// ── Stripe Pro + Apple Pro (a race: both paid) ──
r = await verify("t-stripe", "purchase", [{ jws: tx({ appAccountToken: U.STRIPE, originalTransactionId: "2000000100000333", transactionId: "3000000000000333" }) }]);
check("Stripe Pro buying Apple Pro anyway: recorded (Apple already charged)", r.data.results[0].status === "applied", r.data.results);
check("Stripe + Apple: source both, alsoBilledElsewhere", r.data.entitlement.source === "both" && r.data.entitlement.alsoBilledElsewhere === true && r.data.entitlement.canPurchase === false, r.data.entitlement);
r = await status("t-stripe", {}, "");
check("Stripe + Apple on the website: billingSource both, plan pro", r.data.profile.billingSource === "both" && r.data.profile.plan === "pro", r.data.profile);
check("nothing was cancelled at Stripe (no Stripe call at all)", !logs.some((l) => /stripe/i.test(l) && /cancel/i.test(l)));

// ── website Pro (Stripe) in the app: no buying ──
await q("update public.profiles set plan = 'pro', subscription_status = 'active' where id = $1", [U.FREE]);
await q("delete from public.apple_subscriptions where user_id = $1", [U.FREE]);
r = await status("t-free");
check("Stripe Pro in the IAP build: active_outside, canPurchase false", r.data.profile.billing.source === "outside" && r.data.profile.billing.purchaseBlockedReason === "active_outside" && r.data.profile.billing.canPurchase === false, r.data.profile.billing);
await q("update public.profiles set plan = 'free', subscription_status = 'inactive' where id = $1", [U.FREE]);
r = await status("t-free");
check("Free in the IAP build: canPurchase, source null, token = user id", r.data.profile.billing.canPurchase === true && r.data.profile.billing.source === null && r.data.profile.billing.apple === null && r.data.profile.billing.appAccountToken === U.FREE, r.data.profile.billing);

// ── D2: anything above Pro shows as Pro in IAP builds, never "business" ──
for (const [token, label, reason] of [["t-biz", "business profile", "active_outside"], ["t-owner", "team owner", "team"], ["t-member", "team member", "team"]]) {
  r = await status(token);
  check(`D2 ${label}: appPlan pro with Pro's own limits`, r.data.profile.appPlan === "pro" && r.data.usage.limit === PLAN_LIMITS.pro.analysesPerDay && r.data.recoveryUsage.casesLimit === PLAN_LIMITS.pro.recoveryCasesPerDay, r.data);
  check(`D2 ${label}: the word "business" never reaches the IAP build`, !/business/i.test(r.text), r.text.match(/.{30}business.{30}/i)?.[0]);
  check(`D2 ${label}: no buying (${reason})`, r.data.profile.billing.canPurchase === false && r.data.profile.billing.purchaseBlockedReason === reason, r.data.profile.billing);
  r = await status(token, { "X-CyberNet-Platform": "ios", "X-CyberNet-Plans": "1" });
  check(`D2 ${label}: builds without IAP keep today's answer`, r.data.profile.appPlan === "business", r.data.profile);
}
const owner = TEAMS[U.OWNER].business_accounts;
const team = { businessAccountId: owner.id, role: "owner", dailyPoolLimit: owner.daily_pool_limit, recoveryPoolLimit: owner.recovery_pool_limit };
let rules = tier.appLimitsFor({ email: "x@example.test" }, { plan: "free", team, iap: true });
check("appLimitsFor iap + team: own pools with Pro numbers", rules.appPlan === "pro" && rules.analyses.pool === "own" && rules.recoveryCases.pool === "own" && rules.recoveryUpdates.pool === "own" && rules.analyses.limit === PLAN_LIMITS.pro.analysesPerDay, rules);
rules = tier.appLimitsFor({ email: "x@example.test" }, { plan: "free", team, iap: false });
check("appLimitsFor without iap: team pools as before", rules.appPlan === "business" && rules.analyses.pool === "team", rules);
const callers = ["netlify/functions/analyze.mts", "netlify/functions/recovery-mode.mts", "netlify/functions/recovery-update.mts", "netlify/functions/account-status.mjs"];
check("every appLimitsFor caller passes the IAP flag", callers.every((f) => /appLimitsFor\(user, \{[^}]*\biap\b/.test(read(f))), callers.filter((f) => !/appLimitsFor\(user, \{[^}]*\biap\b/.test(read(f))));

// ── account-status without IAP for an account with no Apple row: no new keys ──
r = await status("t-w", { "X-CyberNet-Platform": "ios", "X-CyberNet-Plans": "1" });
check("Plans-only answer has exactly the 1.0 profile keys", JSON.stringify(Object.keys(r.data.profile).sort()) === JSON.stringify(["appPlan", "fullName", "isTeamMember", "plan", "teamRole"]), Object.keys(r.data.profile));
r = await status("t-w", { "X-CyberNet-Platform": "ios" });
check("no-header answer (build 9) has no appPlan or billing", !("appPlan" in r.data.profile) && !("billing" in r.data.profile) && r.data.usage.limit === 3, r.data.profile);

// ── sandbox / production and content rules ──
r = await verify("t-w", "launch", [{ jws: tx({ appAccountToken: U.W, originalTransactionId: "2000000100000101", transactionId: "3000000000000101", environment: "Production" }) }]);
check("Production transaction: applied", r.data.results[0].status === "applied" && (await row("2000000100000101")).environment === "Production", r.data.results);
const bad = async (label, over, expected) => {
  const res = await verify("t-w", "launch", [{ jws: tx({ appAccountToken: U.W, originalTransactionId: "2000000100000202", transactionId: "3000000000000202", ...over }) }]);
  check(`${label}: ${expected}`, res.data.results?.[0]?.status === expected && !(await row("2000000100000202")), res.data);
};
await bad("wrong bundle", { bundleId: "com.other.app" }, "not_ours");
await bad("Business product", { productId: "app.cybernetai.business5.monthly" }, "not_ours");
await bad("non-renewing type", { type: "Non-Renewing Subscription" }, "not_ours");
await bad("Family Sharing", { inAppOwnershipType: "FAMILY_SHARED" }, "not_ours");
await bad("Xcode environment (unsigned in Apple's library)", { environment: "Xcode" }, "not_ours");
await bad("signed in the future", { signedDate: now + 3600e3 }, "invalid");
await bad("upgraded (isUpgraded)", { isUpgraded: true }, "stale");
const other = makeChain();
let res = await verify("t-w", "launch", [{ jws: signJws(other, transactionPayload({ appAccountToken: U.W, originalTransactionId: "2000000100000203" })) }]);
check("a chain not issued by the trusted root: invalid", res.data.results[0].status === "invalid" && !(await row("2000000100000203")), res.data);
const good = tx({ appAccountToken: U.W, originalTransactionId: "2000000100000204" });
const [h, p, s] = good.split(".");
const tampered = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url")), expiresDate: now + 999 * DAY })).toString("base64url")}.${s}`;
res = await verify("t-w", "launch", [{ jws: tampered }]);
check("tampered payload: invalid", res.data.results[0].status === "invalid" && !(await row("2000000100000204")), res.data);
const noneAlg = `${Buffer.from(JSON.stringify({ alg: "none", x5c: chain.x5c })).toString("base64url")}.${p}.`;
res = await verify("t-w", "launch", [{ jws: noneAlg }]);
check("alg none: invalid", res.data.results[0].status === "invalid", res.data);
const hs = `${Buffer.from(JSON.stringify({ alg: "HS256", x5c: chain.x5c })).toString("base64url")}.${p}.${s}`;
res = await verify("t-w", "launch", [{ jws: hs }]);
check("alg HS256: invalid", res.data.results[0].status === "invalid", res.data);

// notifications: production app id, other app, bad signature
r = await notify(note("DID_RENEW", { appAccountToken: U.W, originalTransactionId: "2000000100000101", transactionId: "3000000000000102", environment: "Production", purchaseDate: now + 1000, expiresDate: now + 50 * DAY }, { environment: "Production", signedDate: now + 1000 }));
check("Production notification with our app id: applied", r.data.outcome === "applied", r.data);
r = await notify(note("DID_RENEW", { appAccountToken: U.W, originalTransactionId: "2000000100000101", environment: "Production" }, { environment: "Production", appAppleId: 1234567890 }));
check("Production notification with another app id: 400", r.status === 400, r);
r = await notify(note("DID_RENEW", { bundleId: "com.other.app" }, { bundleId: "com.other.app" }));
check("notification for another app: 200 ignored", r.status === 200 && r.data.outcome === "ignored", r);
r = await notify(signJws(other, notificationPayload({ type: "DID_RENEW", uuid: uuid(), chain: other, tx: transactionPayload({}) })));
check("notification not signed by the trusted root: 400", r.status === 400, r);
r = await notify("");
check("empty notification: 400", r.status === 400, r);
r = await notify(note("PRICE_INCREASE", { appAccountToken: U.W }));
check("unhandled type: 200 ignored", r.status === 200 && r.data.outcome === "ignored", r.data);
r = await notify(signJws(chain, notificationPayload({ type: "TEST", uuid: uuid(), chain, data: { environment: "Sandbox", bundleId: "app.cybernetai" } })));
check("TEST notification: 200 ignored", r.status === 200 && r.data.outcome === "ignored", r.data);

// database down -> 500 (Apple retries) and the half-processed one runs again
const retryNote = note("DID_RENEW", { appAccountToken: U.W, originalTransactionId: "2000000100000101", transactionId: "3000000000000103", environment: "Production", purchaseDate: now + 2000, expiresDate: now + 80 * DAY }, { environment: "Production", signedDate: now + 3000 });
restDown = "/rest/v1/rpc/apply_apple_subscription";
r = await notify(retryNote);
check("database failure: 500", r.status === 500, r);
restDown = null;
r = await notify(retryNote);
check("Apple's retry of a notification left at 'error': processed", r.status === 200 && r.data.outcome === "applied" && (await row("2000000100000101")).latest_transaction_id === "3000000000000103", r.data);
restDown = "/rest/v1/rpc/apply_apple_subscription";
r = await verify("t-w", "launch", [{ jws: tx({ appAccountToken: U.W, originalTransactionId: "2000000100000101" }) }]);
check("apple-verify database failure: 503 retry_later (app keeps it unfinished)", r.status === 503 && r.data.code === "retry_later", r);
restDown = null;

// ── before the owner runs the migration: everything behaves as today ──
rpcMissing = true;
r = await status("t-stripe", {}, "");
check("migration not run: website account-status still works with the profile plan", r.status === 200 && r.data.profile.plan === "pro" && r.data.profile.billingSource === "stripe", r.data);
r = await status("t-a");
check("migration not run: Apple rows are invisible, the app gets Free", r.status === 200 && r.data.profile.appPlan === "free", r.data.profile);
rpcMissing = false;

// ── bundling: Apple's library is bundled into the two functions ──
let esbuild = null;
try { esbuild = await import("esbuild"); } catch { esbuild = null; }
if (esbuild) {
  for (const entry of ["netlify/functions/apple-verify.mjs", "netlify/functions/apple-notifications.mjs"]) {
    const out = await esbuild.build({ entryPoints: [path.join(root, entry)], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent", target: "node20" });
    const size = out.outputFiles[0].contents.length;
    check(`${entry} resolves every import (esbuild, ${Math.round(size / 1024)} KB; Netlify itself ships it with nft and node_modules)`, size > 0 && size < 5 * 1024 * 1024, size);
  }
}

await db.close();
console.log = quiet.log;
console.log(`apple iap: ${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(logs.slice(-15).join("\n"));
  process.exit(1);
}
