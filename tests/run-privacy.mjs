// Privacy controls (netlify/functions/privacy-data.mts) and the service-key
// fallback in netlify/functions/legal-acceptance.mts. No network, no keys, no
// accounts: fetch and the Netlify env are stubbed (Supabase, the Stripe
// subscriptions API and Apple's token endpoints), and every request the
// function makes is recorded so the order of the deletion steps can be checked.
// Deletion is immediate since 29 Oct 2026 (owner answer 7): an open plan is
// cancelled in Stripe, then the account is deleted; Apple tokens are revoked.
//
//   node tests/run-privacy.mjs
//
// The .mts functions are imported directly (Node 22.18+/23.6+ strips the types; these
// files have none). On an older Node they are bundled with esbuild into .tmp/ instead.
// PRIVACY_ENTRY=<path> runs the same checks against another copy of privacy-data.mts.
import { mkdirSync } from "node:fs";
import { generateKeyPairSync, verify } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Only the stubbed env is read: drop any real variables of these names from this process.
const ENV_NAMES = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "ADMIN_EMAILS",
  "STRIPE_SECRET_KEY", "APPLE_TEAM_ID", "APPLE_SIWA_KEY_ID", "APPLE_SIWA_PRIVATE_KEY", "APPLE_SIWA_CLIENT_ID", "REVIEW_ACCOUNT_EMAILS"];
for (const name of ENV_NAMES) delete process.env[name];

let ENV = {};
globalThis.Netlify = { env: { get: name => ENV[name] } };

async function load(entry, name) {
  const file = path.resolve(root, entry);
  try {
    return await import(pathToFileURL(file).href);
  } catch (error) {
    if (error?.code !== "ERR_UNKNOWN_FILE_EXTENSION") throw error;
  }
  // Older Node without type stripping: bundle with esbuild instead.
  const esbuild = await import("esbuild");
  mkdirSync(path.join(root, ".tmp"), { recursive: true });
  const out = path.join(root, ".tmp", name);
  await esbuild.build({ entryPoints: [file], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "warning" });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

// The function logs every failed step on purpose; keep those lines for a failure report.
const logged = [];
console.error = (...args) => logged.push(args.map(String).join(" "));

const privacy = (await load(process.env.PRIVACY_ENTRY || "netlify/functions/privacy-data.mts", "privacy-data.test.mjs")).default;
const legal = (await load("netlify/functions/legal-acceptance.mts", "legal-acceptance.test.mjs")).default;

// ── fixtures (fake values only) ──
const BASE = "https://example-project.supabase.co";
const ANON = "test-anon-key";
const SERVICE = "test-service-key";
const SECRET = "test-secret-key";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const TEAM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TEAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLOSED = "subscription_status=in.(inactive,canceled,incomplete_expired)";
const CLOSED_STATUSES = ["inactive", "canceled", "incomplete_expired"];
// The two deletes that come first for every account (no foreign key to auth.users).
const FIRST = [`DELETE /rest/v1/checkout_debug_log?user_id=eq.${USER}`, `DELETE /rest/v1/api_rate_limits?rate_key=like.*${USER}`];

const fullEnv = () => ({ SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE });

// Fake Stripe and Apple credentials (generated here, never real). The Apple
// key is a throwaway P-256 key so the client secret's signature can be checked.
const STRIPE_TEST_KEY = "sk_test_run_privacy_fake";
const appleKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
const APPLE_PEM = appleKeys.privateKey.export({ type: "pkcs8", format: "pem" });
const appleEnv = () => ({ APPLE_TEAM_ID: "TEAMID1234", APPLE_SIWA_KEY_ID: "KEYID12345", APPLE_SIWA_PRIVATE_KEY: APPLE_PEM.replace(/\n/g, "\\n") });

// A tiny fake of the Supabase REST + Auth endpoints the function uses, plus
// the Stripe subscriptions API and Apple's token endpoints.
// `db` describes the state; `fail` maps "METHOD path-prefix" to a status to return.
let calls = [];
let order = []; // every call to Supabase and Stripe, in the order made
let stripeCalls = [];
let appleCalls = [];
function install(db = {}) {
  const state = {
    profile: { id: USER, plan: "free", subscription_status: "inactive" },
    owned: [],
    teamDeleteReturns: null, // rows returned by the business_accounts DELETE (default: the team)
    teamStillThere: [],
    teamNow: null, // the owned teams as the re-read just before the clean-up sees them (default: owned)
    deleted: {}, // "path-prefix" -> rows a DELETE reports (Content-Range), default 0
    authDelete: 200,
    fail: {},
    // Stripe: subscriptions by id ({ id, customer, status }), and failures by "METHOD /v1/path".
    stripe: [],
    stripeFail: {},
    // Apple: status of /auth/token and /auth/revoke.
    appleToken: 200,
    appleRevoke: 200,
    ...db
  };
  state.owned = state.owned.map(team => ({ ...team }));
  calls = [];
  order = [];
  stripeCalls = [];
  appleCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const respond = (status, body, extra = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

    if (url.hostname === "api.stripe.com") {
      const hdrs = new Headers(init.headers || {});
      const params = new URLSearchParams(url.search);
      for (const [k, v] of new URLSearchParams(typeof init.body === "string" ? init.body : "")) params.set(k, v);
      const call = { method, path: url.pathname, params: Object.fromEntries(params), auth: hdrs.get("authorization") };
      stripeCalls.push(call);
      order.push(`stripe ${method} ${url.pathname}`);
      const failKey = Object.keys(state.stripeFail).find(key => key === `${method} ${url.pathname}`);
      if (failKey) {
        const f = state.stripeFail[failKey];
        return respond(f.status, { error: { type: f.type || "api_error", code: f.code, message: "simulated Stripe failure" } });
      }
      const subId = url.pathname.split("/")[3];
      if (method === "GET" && url.pathname === "/v1/subscriptions") {
        const data = state.stripe.filter(sub => sub.customer === params.get("customer")).map(sub => ({ object: "subscription", ...sub }));
        return respond(200, { object: "list", url: "/v1/subscriptions", has_more: false, data });
      }
      const sub = state.stripe.find(item => item.id === subId);
      if (!sub) return respond(404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such subscription" } });
      if (method === "DELETE") {
        if (["canceled", "incomplete_expired"].includes(sub.status)) return respond(400, { error: { type: "invalid_request_error", message: "already canceled" } });
        sub.status = "canceled";
        return respond(200, { object: "subscription", ...sub });
      }
      if (method === "GET") return respond(200, { object: "subscription", ...sub });
      return respond(404, { error: { type: "invalid_request_error", message: "unexpected" } });
    }

    if (url.hostname === "appleid.apple.com") {
      const form = Object.fromEntries(new URLSearchParams(String(init.body || "")));
      appleCalls.push({ method, path: url.pathname, form });
      if (url.pathname === "/auth/token") return respond(state.appleToken, state.appleToken === 200 ? { access_token: "a-token", refresh_token: "r-token", token_type: "Bearer", expires_in: 3600 } : { error: "invalid_grant" });
      if (url.pathname === "/auth/revoke") return new Response(null, { status: state.appleRevoke });
      return respond(404, {});
    }

    const headers = init.headers || {};
    const target = decodeURIComponent(url.pathname + url.search);
    const call = { method, target, apikey: headers.apikey, auth: headers.Authorization, prefer: headers.Prefer, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    order.push(`${method} ${target}`);

    for (const [key, status] of Object.entries(state.fail)) {
      const [m, prefix] = key.split(" ");
      if (m === method && target.startsWith(prefix)) return respond(status, { message: "simulated failure" });
    }

    if (target === "/auth/v1/user") {
      const base = { id: USER, email: "person@example.com", created_at: "2026-10-01T00:00:00Z", user_metadata: { full_name: "Test Person" } };
      if (call.auth === "Bearer good-user-token") return respond(200, base);
      if (call.auth === "Bearer apple-user-token") return respond(200, { ...base, email: "abc123@privaterelay.appleid.com", app_metadata: { provider: "apple", providers: ["apple"] }, identities: [{ provider: "apple" }] });
      return respond(401, { msg: "invalid JWT" });
    }
    if (target.startsWith("/auth/v1/admin/users/")) return respond(state.authDelete, {});
    if (method === "GET" && target.startsWith(`/rest/v1/profiles?id=eq.${USER}`)) return respond(200, state.profile ? [state.profile] : []);
    if (method === "GET" && target.startsWith(`/rest/v1/business_accounts?owner_user_id=eq.${USER}`)) return respond(200, state.owned);
    if (method === "PATCH" && target.startsWith("/rest/v1/business_accounts?id=eq.")) {
      // The deletion marks a cancelled team closed; the re-read below sees it.
      const teamId = target.match(/id=eq\.([^&]+)/)[1];
      const row = state.owned.find(team => team.id === teamId);
      if (row && call.body?.subscription_status) row.subscription_status = call.body.subscription_status;
      return respond(204);
    }
    if (method === "GET" && target.startsWith("/rest/v1/business_accounts?id=eq.") && target.includes(`&owner_user_id=eq.${USER}&${CLOSED}`)) {
      const teamId = target.match(/id=eq\.([^&]+)/)[1];
      const row = (state.teamNow ?? state.owned).find(team => team.id === teamId);
      return respond(200, row && CLOSED_STATUSES.includes(String(row.subscription_status).toLowerCase()) ? [{ id: teamId }] : []);
    }
    if (method === "GET" && target.startsWith("/rest/v1/business_accounts?id=eq.")) return respond(200, state.teamStillThere);
    if (method === "DELETE" && target.startsWith("/rest/v1/business_accounts?id=eq.")) {
      const teamId = target.match(/id=eq\.([^&]+)/)[1];
      return respond(200, state.teamDeleteReturns ?? [{ id: teamId }]);
    }
    if (method === "GET" && target.startsWith(`/rest/v1/recovery_cases?owner_user_id=eq.${USER}`)) return respond(200, [{ id: CASE, owner_user_id: USER }]);
    if (method === "GET" && target.startsWith("/rest/v1/recovery_versions?")) return respond(200, [{ case_id: CASE, version: 1 }]);
    if (method === "GET" && target.startsWith("/rest/v1/recovery_tasks?")) return respond(200, [{ case_id: CASE, title: "Call the bank" }]);
    if (method === "GET" && target.startsWith(`/rest/v1/business_members?user_id=eq.${USER}`)) return respond(200, [{ business_account_id: OTHER_TEAM, role: "member", status: "active" }]);
    if (method === "GET" && target.startsWith(`/rest/v1/ai_consents?user_id=eq.${USER}`)) return respond(200, [{ consent_version: "2026-11-ios-1", platform: "ios", provider: "openai", granted_at: "2026-11-01T00:00:00Z", withdrawn_at: null }]);
    if (method === "GET") return respond(200, []);
    if (method === "DELETE") {
      const hit = Object.entries(state.deleted).find(([prefix]) => target.startsWith(prefix));
      return respond(204, undefined, { "Content-Range": `*/${hit ? hit[1] : 0}` });
    }
    if (method === "PATCH" || method === "POST") return respond(204);
    return respond(404, { message: "unexpected" });
  };
}

function request(body, { token = "good-user-token", method = "POST", origin = "", platform = "" } = {}) {
  const headers = { "Content-Type": "application/json", "user-agent": "run-privacy" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  if (platform) headers["X-CyberNet-Platform"] = platform;
  return new Request("https://cybernetai.app/api/privacy-data", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
}

async function call(body, options) {
  const response = await privacy(request(body, options));
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers };
}

const writes = () => calls.filter(c => ["DELETE", "PATCH", "POST"].includes(c.method)).map(c => `${c.method} ${c.target}`);

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Every write must stay on this user's rows, or on the closed team this user owns.
function ownOnly(name, allowedTeams = []) {
  const ok = writes().every(w =>
    w.includes(`user_id=eq.${USER}`) ||
    w.includes(`/rest/v1/profiles?id=eq.${USER}`) ||
    w.includes(`invited_by_user_id=eq.${USER}`) ||
    w.includes(`rate_key=like.*${USER}`) ||
    w.includes(`/auth/v1/admin/users/${USER}`) ||
    allowedTeams.some(t => w.includes(`business_account_id=eq.${t}`) || w.includes(`business_accounts?id=eq.${t}&owner_user_id=eq.${USER}`))
  );
  check(`${name}: writes touch only this user's rows`, ok, writes());
}

// ── 1. free user is deleted ──
ENV = fullEnv();
install();
let r = await call({ action: "delete-account", confirmation: "DELETE" });
check("free user: 200 deleted", r.status === 200 && r.data.deleted === true && r.data.closedTeams === 0, r);
check("free user: write order", same(writes(), [
  ...FIRST,
  `DELETE /rest/v1/business_members?user_id=eq.${USER}`,
  `DELETE /rest/v1/business_invites?invited_by_user_id=eq.${USER}`,
  `DELETE /auth/v1/admin/users/${USER}`
]), writes());
check("free user: caller checked with the anon key and their own JWT", calls[0].target === "/auth/v1/user" && calls[0].apikey === ANON && calls[0].auth === "Bearer good-user-token", calls[0]);
check("free user: data calls use the service role", calls.slice(1).every(c => c.apikey === SERVICE && c.auth === `Bearer ${SERVICE}`), calls.map(c => c.apikey));
check("free user: invites sent to the user's email by other teams are left alone", !writes().some(w => w.includes("email=eq.")), writes());
ownOnly("free user");

// ── 2. an open personal subscription is cancelled at once, then the account goes ──
// (owner answer 7, 29 Oct 2026: deletion is immediate; no 409, no refund.)
// Deny by default: incomplete and paused can still turn into a bill.
const SUB = "sub_personal1";
const CUS = "cus_person1";
for (const status of ["active", "trialing", "past_due", "unpaid", "ACTIVE", "incomplete", "paused", "PAUSED", "some_new_status"]) {
  ENV = { ...fullEnv(), STRIPE_SECRET_KEY: STRIPE_TEST_KEY };
  install({
    profile: { id: USER, plan: "pro", subscription_status: status, stripe_subscription_id: SUB, stripe_customer_id: CUS },
    stripe: [{ id: SUB, customer: CUS, status: status.toLowerCase() === "some_new_status" ? "active" : status.toLowerCase() }]
  });
  r = await call({ action: "delete-account", confirmation: "DELETE" });
  const cancels = stripeCalls.filter(c => c.method === "DELETE");
  check(`subscription ${status}: 200 deleted, 1 cancelled`, r.status === 200 && r.data.deleted === true && r.data.cancelledSubscriptions === 1, r);
  check(`subscription ${status}: Stripe cancel now, no proration, no invoice`, cancels.length === 1 && cancels[0].path === `/v1/subscriptions/${SUB}` && cancels[0].params.prorate === "false" && cancels[0].params.invoice_now === "false" && cancels[0].auth === `Bearer ${STRIPE_TEST_KEY}`, stripeCalls);
  check(`subscription ${status}: Stripe cancel before any database write`, (() => {
    const cancel = order.findIndex(o => o.startsWith("stripe DELETE"));
    const firstWrite = order.findIndex(o => /^(DELETE|PATCH|POST) /.test(o));
    return cancel >= 0 && firstWrite > cancel;
  })(), order);
  check(`subscription ${status}: profile marked cancelled, then the user deleted`, same(writes(), [
    ...FIRST,
    `PATCH /rest/v1/profiles?id=eq.${USER}`,
    `DELETE /rest/v1/business_members?user_id=eq.${USER}`,
    `DELETE /rest/v1/business_invites?invited_by_user_id=eq.${USER}`,
    `DELETE /auth/v1/admin/users/${USER}`
  ]) && same({ plan: calls.find(c => c.method === "PATCH")?.body?.plan, status: calls.find(c => c.method === "PATCH")?.body?.subscription_status }, { plan: "free", status: "canceled" }), writes());
}
ownOnly("open subscription");

for (const status of ["canceled", "incomplete_expired", "inactive", "", "CANCELED"]) {
  ENV = fullEnv();
  install({ profile: { id: USER, plan: "free", subscription_status: status } });
  r = await call({ action: "delete-account", confirmation: "DELETE" });
  check(`subscription "${status}": deletion goes ahead`, r.status === 200 && r.data.deleted === true && r.data.cancelledSubscriptions === 0, r);
  check(`subscription "${status}": no Stripe call, no profile update`, stripeCalls.length === 0 && !writes().some(w => w.startsWith("PATCH")), { stripeCalls, w: writes() });
}
install({ profile: null });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("no profile row: deletion goes ahead", r.status === 200 && r.data.deleted === true, r);

// No Stripe key on the server: an open plan with a subscription cannot be cancelled, so nothing is deleted.
ENV = fullEnv();
install({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_subscription_id: SUB, stripe_customer_id: CUS } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("no Stripe key + open plan: 503 BILLING_NOT_CONFIGURED, nothing written", r.status === 503 && r.data.code === "BILLING_NOT_CONFIGURED" && /has not been deleted/.test(r.data.error) && writes().length === 0, { r, w: writes() });
// A paid-looking row with no subscription behind it (test fixtures): nothing to cancel, deletion goes ahead.
install({ profile: { id: USER, plan: "pro", subscription_status: "active" } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("open status without a subscription id: deleted without Stripe", r.status === 200 && r.data.deleted === true && stripeCalls.length === 0, r);

// Stripe refuses: nothing is deleted, and the message says so.
ENV = { ...fullEnv(), STRIPE_SECRET_KEY: STRIPE_TEST_KEY };
install({
  profile: { id: USER, plan: "pro", subscription_status: "active", stripe_subscription_id: SUB, stripe_customer_id: CUS },
  stripe: [{ id: SUB, customer: CUS, status: "active" }],
  stripeFail: { [`DELETE /v1/subscriptions/${SUB}`]: { status: 402, type: "card_error", code: "card_declined" } }
});
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("Stripe cancel fails: 502 SUBSCRIPTION_CANCEL_FAILED, nothing written", r.status === 502 && r.data.code === "SUBSCRIPTION_CANCEL_FAILED" && /has not been deleted/.test(r.data.error) && writes().length === 0, { r, w: writes() });
install({
  profile: { id: USER, plan: "pro", subscription_status: "active", stripe_subscription_id: SUB, stripe_customer_id: CUS },
  stripeFail: { "GET /v1/subscriptions": { status: 401, type: "authentication_error" } }
});
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("Stripe list fails: 502 SUBSCRIPTION_CANCEL_FAILED, nothing written", r.status === 502 && r.data.code === "SUBSCRIPTION_CANCEL_FAILED" && writes().length === 0, { r, w: writes() });

// Already cancelled at Stripe (the webhook was late), or already gone: not an error.
install({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_subscription_id: SUB, stripe_customer_id: CUS }, stripe: [{ id: SUB, customer: "cus_other", status: "canceled" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("already cancelled at Stripe: deleted, 0 newly cancelled", r.status === 200 && r.data.deleted === true && r.data.cancelledSubscriptions === 0 && stripeCalls.some(c => c.method === "GET" && c.path === `/v1/subscriptions/${SUB}`), { r, stripeCalls });
install({ profile: { id: USER, plan: "pro", subscription_status: "past_due", stripe_subscription_id: SUB, stripe_customer_id: CUS }, stripe: [] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("subscription missing at Stripe: deleted", r.status === 200 && r.data.deleted === true && r.data.cancelledSubscriptions === 0, r);

// An open subscription the database missed (lost webhook): found by listing the customer, cancelled.
install({ profile: { id: USER, plan: "free", subscription_status: "canceled", stripe_customer_id: CUS }, stripe: [{ id: "sub_stray", customer: CUS, status: "active" }, { id: "sub_old", customer: CUS, status: "canceled" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("stray open subscription on the customer: cancelled, old one left alone", r.status === 200 && r.data.cancelledSubscriptions === 1 && same(stripeCalls.filter(c => c.method === "DELETE").map(c => c.path), ["/v1/subscriptions/sub_stray"]), stripeCalls);
check("stray subscription: the customer was listed with status=all", stripeCalls.some(c => c.method === "GET" && c.path === "/v1/subscriptions" && c.params.customer === CUS && c.params.status === "all"), stripeCalls);

// The plan was cancelled, then the account could not be deleted: the reply says the plan is cancelled.
install({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_subscription_id: SUB, stripe_customer_id: CUS }, stripe: [{ id: SUB, customer: CUS, status: "active" }], authDelete: 500 });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("cancelled, then auth delete fails: 502 PARTIAL_DELETE_BILLING saying the plan is cancelled", r.status === 502 && r.data.code === "PARTIAL_DELETE_BILLING" && /paid plan has been cancelled/.test(r.data.error) && /sign-in still work/.test(r.data.error) && /Delete again/.test(r.data.error), r);
// A retry after that: Stripe already shows it cancelled, the database too; deletion completes.
install({ profile: { id: USER, plan: "free", subscription_status: "canceled", stripe_subscription_id: SUB, stripe_customer_id: CUS }, stripe: [{ id: SUB, customer: CUS, status: "canceled" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("retry after a partial delete: deleted, no second cancel", r.status === 200 && r.data.deleted === true && !stripeCalls.some(c => c.method === "DELETE"), { r, stripeCalls });

// ── 3. an owned team with an open plan is cancelled and closed with the account ──
const TEAM_SUB = "sub_team1";
for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
  ENV = { ...fullEnv(), STRIPE_SECRET_KEY: STRIPE_TEST_KEY };
  install({ owned: [{ id: TEAM, subscription_status: status, stripe_subscription_id: TEAM_SUB, stripe_customer_id: CUS }], stripe: [{ id: TEAM_SUB, customer: CUS, status }] });
  r = await call({ action: "delete-account", confirmation: "DELETE" });
  check(`team ${status}: 200 deleted, team plan cancelled, team closed`, r.status === 200 && r.data.deleted === true && r.data.closedTeams === 1 && r.data.cancelledSubscriptions === 1, r);
  check(`team ${status}: Stripe cancel, team marked cancelled, then the clean-up`, same(writes(), [
    ...FIRST,
    `PATCH /rest/v1/business_accounts?id=eq.${TEAM}&owner_user_id=eq.${USER}`,
    `DELETE /rest/v1/business_members?business_account_id=eq.${TEAM}`,
    `DELETE /rest/v1/business_invites?business_account_id=eq.${TEAM}`,
    `DELETE /rest/v1/business_daily_usage?business_account_id=eq.${TEAM}`,
    `DELETE /rest/v1/business_recovery_usage?business_account_id=eq.${TEAM}`,
    `PATCH /rest/v1/scan_history?business_account_id=eq.${TEAM}`,
    `PATCH /rest/v1/recovery_cases?business_account_id=eq.${TEAM}`,
    `DELETE /rest/v1/business_accounts?id=eq.${TEAM}&owner_user_id=eq.${USER}&${CLOSED}`,
    `DELETE /rest/v1/business_members?user_id=eq.${USER}`,
    `DELETE /rest/v1/business_invites?invited_by_user_id=eq.${USER}`,
    `DELETE /auth/v1/admin/users/${USER}`
  ]) && stripeCalls.filter(c => c.method === "DELETE").length === 1, { w: writes(), stripeCalls });
  ownOnly(`team ${status}`, [TEAM]);
}
ENV = { ...fullEnv(), STRIPE_SECRET_KEY: STRIPE_TEST_KEY };
install({ owned: [{ id: TEAM, subscription_status: "canceled" }, { id: OTHER_TEAM, subscription_status: "active", stripe_subscription_id: TEAM_SUB, stripe_customer_id: CUS }], stripe: [{ id: TEAM_SUB, customer: CUS, status: "active" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("one closed + one active team: both closed, the active one cancelled", r.status === 200 && r.data.closedTeams === 2 && r.data.cancelledSubscriptions === 1 && writes().includes(`DELETE /rest/v1/business_accounts?id=eq.${OTHER_TEAM}&owner_user_id=eq.${USER}&${CLOSED}`), { r, w: writes() });
ENV = fullEnv();
install({ owned: [{ id: TEAM, subscription_status: "active", stripe_subscription_id: TEAM_SUB, stripe_customer_id: CUS }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("no Stripe key + open team plan: 503, nothing written", r.status === 503 && r.data.code === "BILLING_NOT_CONFIGURED" && writes().length === 0, { r, w: writes() });

// ── 4. closed-team owner: team rows go first, in order, then the user ──
install({ owned: [{ id: TEAM, subscription_status: "canceled" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("closed-team owner: 200 deleted, 1 team closed", r.status === 200 && r.data.deleted === true && r.data.closedTeams === 1, r);
check("closed-team owner: exact call order", same(writes(), [
  ...FIRST,
  `DELETE /rest/v1/business_members?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_invites?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_daily_usage?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_recovery_usage?business_account_id=eq.${TEAM}`,
  `PATCH /rest/v1/scan_history?business_account_id=eq.${TEAM}`,
  `PATCH /rest/v1/recovery_cases?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_accounts?id=eq.${TEAM}&owner_user_id=eq.${USER}&${CLOSED}`,
  `DELETE /rest/v1/business_members?user_id=eq.${USER}`,
  `DELETE /rest/v1/business_invites?invited_by_user_id=eq.${USER}`,
  `DELETE /auth/v1/admin/users/${USER}`
]), writes());
const unlinks = calls.filter(c => c.method === "PATCH");
check("closed-team owner: history and cases are unlinked, not deleted", unlinks.length === 2 && unlinks.every(c => same(c.body, { business_account_id: null })), unlinks);
check("closed-team owner: the team row is deleted only while it is closed and still theirs", calls.some(c => c.method === "DELETE" && c.target.includes(`business_accounts?id=eq.${TEAM}&owner_user_id=eq.${USER}&${CLOSED}`)));
check("closed-team owner: the team is read again, closed and theirs, before anything is removed", (() => {
  const reread = calls.findIndex(c => c.method === "GET" && c.target.startsWith(`/rest/v1/business_accounts?id=eq.${TEAM}&owner_user_id=eq.${USER}&${CLOSED}`));
  const firstTeamWrite = calls.findIndex(c => c.method !== "GET" && c.target.includes(`business_account_id=eq.${TEAM}`));
  return reread >= 0 && reread < firstTeamWrite;
})(), calls.map(c => `${c.method} ${c.target}`));
ownOnly("closed-team owner", [TEAM]);

// two closed teams: both are closed before the user is touched
install({ owned: [{ id: TEAM, subscription_status: "canceled" }, { id: OTHER_TEAM, subscription_status: "incomplete_expired" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
const firstUserWrite = writes().findIndex(w => w.includes(`business_members?user_id=eq.${USER}`));
const lastTeamWrite = writes().map(w => w.includes(OTHER_TEAM)).lastIndexOf(true);
check("two closed teams: both closed, then the user", r.status === 200 && r.data.closedTeams === 2 && lastTeamWrite >= 0 && lastTeamWrite < firstUserWrite, writes());

// ── 5. member of another team: only their own link is removed ──
install({ owned: [] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("member of another team: 200 deleted", r.status === 200 && r.data.deleted === true, r);
check("member of another team: the other team is never touched", !calls.some(c => c.method !== "GET" && (c.target.includes(OTHER_TEAM) || c.target.includes("business_account_id=") || c.target.includes("business_accounts?"))), writes());
check("member of another team: own membership removed before the auth user", writes().indexOf(`DELETE /rest/v1/business_members?user_id=eq.${USER}`) === FIRST.length && writes().at(-1) === `DELETE /auth/v1/admin/users/${USER}`, writes());
ownOnly("member of another team");

// ── 6. stops at the first failure, with a clear code ──
install({ owned: [{ id: TEAM, subscription_status: "canceled" }], fail: { [`DELETE /rest/v1/business_invites?business_account_id=eq.${TEAM}`]: 500 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("team cleanup fails after a row went: 502 PARTIAL_DELETE that says the account still works", r.status === 502 && r.data.code === "PARTIAL_DELETE" && /sign-in still work/.test(r.data.error) && /Delete again/.test(r.data.error), r);
check("team cleanup fails: nothing after the failing step", writes().at(-1) === `DELETE /rest/v1/business_invites?business_account_id=eq.${TEAM}` && !writes().some(w => w.includes("/auth/v1/admin")), writes());

install({ fail: { [`DELETE /rest/v1/business_members?user_id=eq.${USER}`]: 500 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("membership cleanup fails: 502 MEMBERSHIP_CLEANUP_FAILED, auth user kept", r.status === 502 && r.data.code === "MEMBERSHIP_CLEANUP_FAILED" && !writes().some(w => w.includes("/auth/v1/admin")), { r, w: writes() });

install({ authDelete: 500 });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("auth delete fails, nothing else changed: 502 AUTH_DELETE_FAILED (account still open)", r.status === 502 && r.data.code === "AUTH_DELETE_FAILED" && /still open/.test(r.data.error), r);

// The review's case: the user's links to another team went, then the auth delete failed.
install({ authDelete: 500, deleted: { [`/rest/v1/business_members?user_id=eq.${USER}`]: 1 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("auth delete fails after team links went: 502 PARTIAL_DELETE", r.status === 502 && r.data.code === "PARTIAL_DELETE" && /sign-in still work/.test(r.data.error), r);
install({ authDelete: 500, owned: [{ id: TEAM, subscription_status: "canceled" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("auth delete fails after a closed team was removed: 502 PARTIAL_DELETE", r.status === 502 && r.data.code === "PARTIAL_DELETE", r);

install({ fail: { [`DELETE /rest/v1/checkout_debug_log`]: 500 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("checkout log cleanup fails: 502, nothing else touched", r.status === 502 && r.data.code === "CHECKOUT_LOG_CLEANUP_FAILED" && /still open/.test(r.data.error) && writes().length === 1, { r, w: writes() });

// Re-read before the team clean-up: the plan restarted after Gate 2.
install({ owned: [{ id: TEAM, subscription_status: "canceled" }], teamNow: [{ id: TEAM, subscription_status: "active" }], teamStillThere: [{ id: TEAM, subscription_status: "active" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("team active again at the re-read: 409 TEAM_ACTIVE, no team row touched", r.status === 409 && r.data.code === "TEAM_ACTIVE" && !writes().some(w => w.includes(TEAM)) && !writes().some(w => w.includes("/auth/v1/admin")), { r, w: writes() });

install({ fail: { [`GET /rest/v1/profiles`]: 500 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("profile lookup fails: 502 PROFILE_LOOKUP_FAILED, nothing written", r.status === 502 && r.data.code === "PROFILE_LOOKUP_FAILED" && writes().length === 0, { r, w: writes() });

// ── 7. idempotent ──
install({ authDelete: 404 });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("auth user already gone (404): still a success", r.status === 200 && r.data.deleted === true, r);

install({ owned: [{ id: TEAM, subscription_status: "canceled" }], teamNow: [], teamDeleteReturns: [], teamStillThere: [] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("team row already gone on a retry: continues to the user", r.status === 200 && r.data.deleted === true && writes().at(-1) === `DELETE /auth/v1/admin/users/${USER}`, { r, w: writes() });

install({ owned: [{ id: TEAM, subscription_status: "canceled" }], teamDeleteReturns: [], teamStillThere: [{ id: TEAM, subscription_status: "active" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
// The plan restarted in the moment between the re-read and the guarded DELETE: the team row stays,
// the account stays, and the reply says that some team details already went.
check("team reactivated after the re-read: 502 PARTIAL_DELETE, team row and auth user kept", r.status === 502 && r.data.code === "PARTIAL_DELETE" && !writes().some(w => w.includes("/auth/v1/admin")), { r, w: writes() });

// ── 8. confirmation, method and action guards ──
install();
r = await call({ action: "delete-account" });
check("no confirmation: 400 CONFIRMATION_REQUIRED, nothing written", r.status === 400 && r.data.code === "CONFIRMATION_REQUIRED" && writes().length === 0, r);
r = await call({ action: "delete-account", confirmation: "delete" });
check("lower-case confirmation: 400", r.status === 400 && r.data.code === "CONFIRMATION_REQUIRED", r);
r = await call({ action: "launch" });
check("unknown action: 400 UNSUPPORTED_ACTION", r.status === 400 && r.data.code === "UNSUPPORTED_ACTION", r);
install();
r = await call(null, { method: "GET" });
check("GET: 405 and no calls", r.status === 405 && r.data.code === "METHOD_NOT_ALLOWED" && calls.length === 0, r);

// ── 9. unauthenticated ──
install();
r = await call({ action: "delete-account", confirmation: "DELETE" }, { token: "" });
check("no token: 401 AUTH_REQUIRED and no calls at all", r.status === 401 && r.data.code === "AUTH_REQUIRED" && calls.length === 0, { r, calls });
install();
r = await call({ action: "delete-account", confirmation: "DELETE" }, { token: "someone-elses-or-expired" });
check("rejected token: 401 AUTH_REQUIRED, nothing written", r.status === 401 && r.data.code === "AUTH_REQUIRED" && writes().length === 0, r);
install();
r = await call({ action: "export" }, { token: "" });
check("export without a token: 401", r.status === 401, r);

// ── 10. missing env and the SUPABASE_SECRET_KEY fallback ──
ENV = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON };
install();
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("no service key: 503 NOT_CONFIGURED, no calls", r.status === 503 && r.data.code === "NOT_CONFIGURED" && calls.length === 0, { r, calls });
ENV = { SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE };
install();
r = await call({ action: "export" });
check("no SUPABASE_URL: 503 NOT_CONFIGURED", r.status === 503 && r.data.code === "NOT_CONFIGURED", r);

ENV = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SECRET_KEY: SECRET };
install();
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("only SUPABASE_SECRET_KEY: deletion works", r.status === 200 && r.data.deleted === true, r);
check("only SUPABASE_SECRET_KEY: data calls use it", calls.slice(1).every(c => c.apikey === SECRET && c.auth === `Bearer ${SECRET}`), calls.map(c => c.apikey));

ENV = { ...fullEnv(), SUPABASE_SECRET_KEY: SECRET };
install();
await call({ action: "clear-history" });
check("both keys set: SUPABASE_SERVICE_ROLE_KEY wins", calls.slice(1).every(c => c.apikey === SERVICE), calls.map(c => c.apikey));

// ── 11. export ──
ENV = fullEnv();
install({ owned: [{ id: TEAM, seat_tier: 5, subscription_status: "canceled" }] });
r = await call({ action: "export" });
const d = r.data.data || {};
check("export: 200 with every section", r.status === 200 && ["account", "profile", "dailyUsage", "savedHistory", "legalAcceptances", "recoveryCases", "recoveryVersions", "recoveryTasks", "recoveryUsage", "quickscanUsage", "teamMemberships", "ownedTeams", "checkoutErrors", "usageCounters", "feedback"].every(k => k in d), Object.keys(d));
check("export: the user's own feedback is read", calls.some(c => c.target.startsWith(`/rest/v1/feedback?user_id=eq.${USER}&select=`)), calls.map(c => c.target));
check("export: checkout error log and usage counters are read for this user", calls.some(c => c.target.startsWith(`/rest/v1/checkout_debug_log?user_id=eq.${USER}`)) && calls.some(c => c.target.startsWith(`/rest/v1/api_rate_limits?rate_key=like.*${USER}`)), calls.map(c => c.target));
check("export: account is the caller", d.account?.id === USER && d.account?.email === "person@example.com", d.account);
check("export: Recovery versions and tasks of the user's cases", d.recoveryVersions?.length === 1 && d.recoveryTasks?.length === 1 && calls.some(c => c.target.startsWith(`/rest/v1/recovery_tasks?case_id=in.(${CASE})`)), d);
check("export: memberships and owned teams included", d.teamMemberships?.[0]?.business_account_id === OTHER_TEAM && d.ownedTeams?.[0]?.id === TEAM, d);
check("export: read-only", writes().length === 0, writes());
check("export: every read is filtered to this user or their cases", calls.slice(1).every(c => c.target.includes(USER) || c.target.includes(`case_id=in.(${CASE})`)), calls.map(c => c.target));

install({ fail: { "GET /rest/v1/quickscan_usage": 500 } });
r = await call({ action: "export" });
check("export failure: 502 EXPORT_FAILED", r.status === 502 && r.data.code === "EXPORT_FAILED", r);

// The feedback table not there yet (migration not applied): an empty section, not a failure.
install({ fail: { "GET /rest/v1/feedback": 404 } });
r = await call({ action: "export" });
check("export: missing feedback table reads as empty", r.status === 200 && Array.isArray(r.data.data?.feedback) && r.data.data.feedback.length === 0, r);

// ── 12. clear-history ──
install();
r = await call({ action: "clear-history" });
check("clear-history: 200 cleared", r.status === 200 && r.data.cleared === true, r);
check("clear-history: one delete, this user's history only", same(writes(), [`DELETE /rest/v1/scan_history?user_id=eq.${USER}`]), writes());
install({ fail: { "DELETE /rest/v1/scan_history": 500 } });
r = await call({ action: "clear-history" });
check("clear-history failure: 502 CLEAR_FAILED", r.status === 502 && r.data.code === "CLEAR_FAILED", r);

// ── 13. unexpected errors stay generic ──
install();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => (String(input).endsWith("/auth/v1/user") ? realFetch(input, init) : Promise.reject(new TypeError("fetch failed")));
r = await call({ action: "clear-history" });
check("network failure to the database: 502 with the step code", r.status === 502 && r.data.code === "CLEAR_FAILED", r);
globalThis.fetch = async () => Promise.reject(new TypeError("fetch failed"));
r = await call({ action: "clear-history" });
check("auth server unreachable: 500 SERVER_ERROR with a plain message", r.status === 500 && r.data.code === "SERVER_ERROR" && !/fetch failed/.test(r.data.error), r);

// ── 13a. Sign in with Apple: tokens revoked after the account is deleted (TN3194) ──
const APPLE_CODE = "c0ffee1234.0.abcd.EfGh-ij_kl";
ENV = { ...fullEnv(), ...appleEnv() };
install();
r = await call({ action: "delete-account", confirmation: "DELETE", appleAuthorizationCode: APPLE_CODE }, { token: "apple-user-token" });
const tokenCall = appleCalls.find(c => c.path === "/auth/token");
const revokeCall = appleCalls.find(c => c.path === "/auth/revoke");
check("apple: deleted and tokens revoked", r.status === 200 && r.data.deleted === true && r.data.appleTokensRevoked === true, r);
check("apple: code exchanged for the app's bundle id", tokenCall?.form.code === APPLE_CODE && tokenCall?.form.grant_type === "authorization_code" && tokenCall?.form.client_id === "app.cybernetai", tokenCall);
check("apple: the refresh token is revoked", revokeCall?.form.token === "r-token" && revokeCall?.form.token_type_hint === "refresh_token" && revokeCall?.form.client_id === "app.cybernetai", revokeCall);
check("apple: revoked only after the account was deleted", (() => {
  const authDelete = calls.findIndex(c => c.target.startsWith("/auth/v1/admin/users/"));
  return authDelete >= 0 && appleCalls.length === 2;
})(), { calls: calls.map(c => c.target), appleCalls });
{
  // The client secret is an ES256 JWT for this team, key and app, signed with the configured key.
  const secret = String(tokenCall?.form.client_secret || "");
  const [h, p, sig] = secret.split(".");
  const header = JSON.parse(Buffer.from(h || "", "base64url").toString() || "{}");
  const payload = JSON.parse(Buffer.from(p || "", "base64url").toString() || "{}");
  const valid = Boolean(sig) && verify("sha256", Buffer.from(`${h}.${p}`), { key: appleKeys.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
  check("apple: client secret header", header.alg === "ES256" && header.kid === "KEYID12345", header);
  check("apple: client secret claims", payload.iss === "TEAMID1234" && payload.sub === "app.cybernetai" && payload.aud === "https://appleid.apple.com" && payload.exp > payload.iat && payload.exp - payload.iat <= 300, payload);
  check("apple: client secret signature verifies", valid, secret.slice(0, 40));
  check("apple: the same client secret on both calls", revokeCall?.form.client_secret === secret);
}
install({ appleRevoke: 400 });
r = await call({ action: "delete-account", confirmation: "DELETE", appleAuthorizationCode: APPLE_CODE }, { token: "apple-user-token" });
check("apple: revoke refused -> still deleted, reported as not revoked", r.status === 200 && r.data.deleted === true && r.data.appleTokensRevoked === false, r);
install({ appleToken: 400 });
r = await call({ action: "delete-account", confirmation: "DELETE", appleAuthorizationCode: APPLE_CODE }, { token: "apple-user-token" });
check("apple: code refused -> still deleted, no revoke call", r.status === 200 && r.data.deleted === true && r.data.appleTokensRevoked === false && !appleCalls.some(c => c.path === "/auth/revoke"), { r, appleCalls });
install();
r = await call({ action: "delete-account", confirmation: "DELETE" }, { token: "apple-user-token" });
check("apple: no code sent -> deleted, not revoked, Apple not called", r.status === 200 && r.data.deleted === true && r.data.appleTokensRevoked === false && appleCalls.length === 0, { r, appleCalls });
install();
r = await call({ action: "delete-account", confirmation: "DELETE", appleAuthorizationCode: "bad code with spaces" }, { token: "apple-user-token" });
check("apple: malformed code -> not sent to Apple", r.status === 200 && appleCalls.length === 0, { r, appleCalls });
install({ authDelete: 500 });
r = await call({ action: "delete-account", confirmation: "DELETE", appleAuthorizationCode: APPLE_CODE }, { token: "apple-user-token" });
check("apple: account not deleted -> tokens not revoked", r.status === 502 && appleCalls.length === 0, { r, appleCalls });
ENV = fullEnv();
install();
r = await call({ action: "delete-account", confirmation: "DELETE", appleAuthorizationCode: APPLE_CODE }, { token: "apple-user-token" });
check("apple: keys not configured -> deleted, not revoked, Apple not called", r.status === 200 && r.data.deleted === true && r.data.appleTokensRevoked === false && appleCalls.length === 0, { r, appleCalls });
ENV = { ...fullEnv(), ...appleEnv() };
install();
r = await call({ action: "delete-account", confirmation: "DELETE", appleAuthorizationCode: APPLE_CODE });
check("apple: an email account with a code -> Apple not called", r.status === 200 && r.data.appleTokensRevoked === null && appleCalls.length === 0, { r, appleCalls });

// ── 13b. the iPhone app: CORS for capacitor://localhost, website untouched ──
ENV = fullEnv();
install();
{
  const pre = await privacy(new Request("https://cybernetai.app/api/privacy-data", { method: "OPTIONS", headers: { Origin: "capacitor://localhost", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type,x-cybernet-platform" } }));
  check("app preflight: 204 with the app origin and headers", pre.status === 204 && pre.headers.get("access-control-allow-origin") === "capacitor://localhost" && /X-CyberNet-Platform/.test(pre.headers.get("access-control-allow-headers") || "") && /POST/.test(pre.headers.get("access-control-allow-methods") || "") && calls.length === 0, [...pre.headers]);
}
r = await call({ action: "delete-account", confirmation: "DELETE" }, { origin: "capacitor://localhost", platform: "ios" });
check("app delete: 200 with CORS headers", r.status === 200 && r.data.deleted === true && r.headers.get("access-control-allow-origin") === "capacitor://localhost" && r.headers.get("vary") === "Origin", [...r.headers]);
install();
r = await call({ action: "export" }, { origin: "https://evil.example" });
check("other origin: no CORS headers", r.status === 200 && r.headers.get("access-control-allow-origin") === null, [...r.headers]);
install();
r = await call({ action: "export" });
check("website: no CORS headers", r.status === 200 && r.headers.get("access-control-allow-origin") === null, [...r.headers]);
check("export: AI consents included for this user", Array.isArray(r.data.data.aiConsents) && r.data.data.aiConsents[0]?.consent_version === "2026-11-ios-1" && calls.some(c => c.target.startsWith(`/rest/v1/ai_consents?user_id=eq.${USER}&select=`)), r.data.data.aiConsents);
install({ fail: { "GET /rest/v1/ai_consents": 404 } });
r = await call({ action: "export" });
check("export: missing ai_consents table reads as empty", r.status === 200 && Array.isArray(r.data.data.aiConsents) && r.data.data.aiConsents.length === 0, r.status);

// ── 14. legal-acceptance: the same key fallback ──
async function accept(env) {
  ENV = env;
  install();
  const response = await legal(new Request("https://cybernetai.app/api/legal-acceptance", {
    method: "POST",
    headers: { Authorization: "Bearer good-user-token", "Content-Type": "application/json", "user-agent": "run-privacy" },
    body: JSON.stringify({ kind: "signup", page: "https://cybernetai.app/" })
  }));
  return { status: response.status, data: await response.json() };
}
r = await accept({ SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SECRET_KEY: SECRET });
const insert = calls.find(c => c.method === "POST" && c.target === "/rest/v1/legal_acceptances");
check("legal-acceptance with only SUPABASE_SECRET_KEY: recorded", r.status === 200 && r.data.recorded === true && insert?.apikey === SECRET && insert?.body?.user_id === USER, { r, insert });
r = await accept(fullEnv());
check("legal-acceptance with SUPABASE_SERVICE_ROLE_KEY: recorded with it", r.status === 200 && calls.find(c => c.method === "POST")?.apikey === SERVICE, r);
r = await accept({ SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON });
check("legal-acceptance with no service key: 503", r.status === 503, r);

console.log(`privacy: ${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`(${logged.length} lines the functions logged; last 5:)\n  ${logged.slice(-5).join("\n  ")}`);
  process.exit(1);
}
