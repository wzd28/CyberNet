// One paid plan per person: /api/create-checkout-session refuses a second
// checkout (409) when the signed-in person already pays for a plan (Pro on
// their profile, a Business team they own, a live subscription in Stripe, or a
// past-due one Stripe is still retrying) or is covered by a Business team. A
// free account, or one whose old plan has ended, can still check out. The
// Stripe webhook's grant path is checked to be unchanged.
//
// No network, no keys, no accounts: fetch (Supabase REST/Auth) and Node's
// https.request (the Stripe SDK's transport) are stubbed with fake values.
//
//   node tests/run-checkout-guard.mjs
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── environment (fake values only; real variables of these names are dropped) ──
const SUPABASE = "https://stub-project.supabase.test";
const SITE = "https://cybernet.example.test";
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ERROR_REPORT_SALT", "RESEND_API_KEY", "ADMIN_EMAILS"]) delete process.env[name];
const WHSEC = "whsec_run_checkout_guard_fake";
const ENV = {
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  STRIPE_SECRET_KEY: "sk_test_run_checkout_guard_fake",
  STRIPE_WEBHOOK_SECRET: WHSEC
};
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
console.error = () => {};
console.warn = () => {};

// ── accounts (by bearer token) ──
const USER_ID = "00000000-0000-4000-8000-0000000000a1";
let state;
function reset(next = {}) {
  state = {
    profile: { id: USER_ID, full_name: "Test User", plan: "free", subscription_status: "inactive", billing_interval: "", stripe_customer_id: null, stripe_subscription_id: null },
    ownedTeams: [],      // business_accounts rows where owner_user_id = USER_ID
    memberships: [],     // business_members rows (with embedded business_accounts)
    stripeSubs: [],      // what Stripe lists for the customer
    supabaseDown: false,
    rest: [],
    stripe: [],
    ...next
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// ── Supabase stub ──
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method || "GET").toUpperCase();
  if (!url.origin.startsWith(SUPABASE)) throw new Error(`unexpected fetch ${url}`);
  if (url.pathname === "/auth/v1/user") return jsonResponse({ id: USER_ID, email: "user@example.test" });
  state.rest.push({ method, path: url.pathname, query: url.search, body: init.body ? JSON.parse(init.body) : null });
  if (url.pathname === "/rest/v1/profiles") {
    if (method === "GET") return jsonResponse([state.profile]);
    if (method === "PATCH") { Object.assign(state.profile, JSON.parse(init.body)); return jsonResponse([state.profile]); }
  }
  if (url.pathname === "/rest/v1/business_accounts") {
    if (state.supabaseDown) return jsonResponse({ message: "down" }, 500);
    if (method === "GET") {
      const live = decodeURIComponent(url.search).match(/subscription_status=in\.\(([^)]*)\)/)?.[1]?.split(",");
      return jsonResponse(state.ownedTeams.filter((t) => !live || live.includes(t.subscription_status)));
    }
    if (method === "POST") return jsonResponse([{ id: "team-new" }], 201);
    return jsonResponse([]);
  }
  if (url.pathname === "/rest/v1/business_members") {
    if (method === "GET") return jsonResponse(state.memberships);
    return jsonResponse([], 201);
  }
  if (url.pathname === "/rest/v1/checkout_debug_log") return jsonResponse([], 201);
  return jsonResponse([]);
};

// ── Stripe stub: intercepts the SDK's https.request ──
https.request = (options) => {
  const req = new EventEmitter();
  let body = "";
  req.setTimeout = () => req;
  req.destroy = () => {};
  req.write = (chunk) => { if (chunk) body += chunk; };
  req.end = () => {
    const call = { method: options.method, path: options.path, body };
    state.stripe.push(call);
    const [status, data] = stripeAnswer(call);
    const res = new PassThrough();
    res.statusCode = status;
    res.headers = { "content-type": "application/json", "request-id": "req_fake" };
    process.nextTick(() => { req.emit("response", res); res.end(JSON.stringify(data)); });
  };
  process.nextTick(() => req.emit("socket", { connecting: false }));
  return req;
};

function stripeAnswer({ method, path: p }) {
  if (method === "GET" && p.startsWith("/v1/subscriptions")) return [200, { object: "list", data: state.stripeSubs, has_more: false }];
  if (method === "GET" && p.startsWith("/v1/prices")) {
    const key = decodeURIComponent(p).match(/lookup_keys\[0\]=([^&]+)/)?.[1] || "";
    return [200, { object: "list", data: [{ id: `price_${key}`, type: "recurring", lookup_key: key }], has_more: false }];
  }
  if (method === "GET" && p.startsWith("/v1/customers/")) return [200, { id: p.split("/").pop(), object: "customer" }];
  if (method === "POST" && p === "/v1/customers") return [200, { id: "cus_new", object: "customer" }];
  if (method === "POST" && p === "/v1/checkout/sessions") return [200, { id: "cs_test_1", object: "checkout.session", url: "https://checkout.stripe.test/c/pay/cs_test_1" }];
  return [404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such object" } }];
}

const checkout = (await import(pathToFileURL(path.join(root, "netlify/functions/create-checkout-session.mjs")).href)).default;
const webhook = (await import(pathToFileURL(path.join(root, "netlify/functions/stripe-webhook.mjs")).href)).default;

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  }
}

async function buy(body) {
  const response = await checkout(new Request(`${SITE}/api/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer t-user" },
    body: JSON.stringify(body)
  }));
  const data = await response.json().catch(() => ({}));
  const sessions = state.stripe.filter((c) => c.method === "POST" && c.path === "/v1/checkout/sessions");
  return { status: response.status, data, sessions: sessions.length, stripeCalls: state.stripe.length, debugLogs: state.rest.filter((r) => r.path === "/rest/v1/checkout_debug_log").length };
}

const PRO = { plan: "pro" };
const BIZ = { plan: "business", seatTier: 5 };
const liveTeam = (status = "active") => ({ id: "team-1", subscription_status: status });
const member = (role, status = "active") => ({ role, business_accounts: { id: "team-1", seat_tier: 5, daily_pool_limit: 50, recovery_pool_limit: 5, subscription_status: status } });
const proProfile = (status = "active") => ({ id: USER_ID, full_name: "Test User", plan: status === "active" || status === "trialing" ? "pro" : "free", subscription_status: status, billing_interval: "month", stripe_customer_id: "cus_pro", stripe_subscription_id: "sub_pro" });
const is409 = (r, code) => r.status === 409 && r.data.code === code && typeof r.data.error === "string" && r.data.error.length > 20;

// ══════════ free accounts can check out ══════════
{
  reset();
  let r = await buy(PRO);
  check("free user: Pro checkout opens", r.status === 200 && r.data.url?.includes("checkout.stripe.test") && r.sessions === 1, r);
  reset();
  r = await buy(BIZ);
  check("free user: Business checkout opens", r.status === 200 && r.sessions === 1, r);
  const session = state.stripe.find((c) => c.path === "/v1/checkout/sessions");
  check("free user: Business checkout uses the 5-seat price", decodeURIComponent(session?.body || "").includes("price_cybernet_ai_business_monthly"), session);

  // A returning customer whose old plan ended: Stripe lists only cancelled subscriptions.
  reset({ profile: { ...proProfile("canceled"), plan: "free" }, stripeSubs: [{ id: "sub_pro", status: "canceled", items: { data: [{ price: { lookup_key: "cybernet_ai_pro_monthly" } }] } }] });
  r = await buy(PRO);
  check("cancelled ex-Pro: can buy Pro again", r.status === 200 && r.sessions === 1, r);

  reset({ ownedTeams: [liveTeam("canceled")], profile: { ...proProfile("inactive"), stripe_subscription_id: null, plan: "free" } });
  r = await buy(BIZ);
  check("cancelled ex-Business owner: can buy Business again", r.status === 200 && r.sessions === 1, r);

  reset({ memberships: [member("member", "canceled")] });
  r = await buy(PRO);
  check("member of a team whose plan ended: can buy Pro", r.status === 200 && r.sessions === 1, r);
}

// ══════════ Pro subscribers ══════════
{
  reset({ profile: proProfile("active") });
  let r = await buy(PRO);
  check("Pro buying Pro: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED"), r);
  check("Pro buying Pro: no Stripe request at all", r.stripeCalls === 0, r);
  check("Pro buying Pro: message points to Manage Billing", r.data.error.includes("Manage Billing"), r.data);

  reset({ profile: proProfile("active") });
  r = await buy(BIZ);
  check("Pro buying Business: 409 ALREADY_SUBSCRIBED (change it from billing, not a second checkout)", is409(r, "ALREADY_SUBSCRIBED") && r.data.error.includes("Pro"), r);
  check("Pro buying Business: no Stripe request", r.stripeCalls === 0, r);

  reset({ profile: proProfile("trialing") });
  r = await buy(BIZ);
  check("Pro on a trial buying Business: 409", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);
}

// ══════════ past due (the webhook sets plan free + past_due, the subscription id stays) ══════════
{
  reset({ profile: proProfile("past_due") });
  let r = await buy(PRO);
  check("past_due Pro buying Pro: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE"), r);
  check("past_due Pro: no Stripe request", r.stripeCalls === 0, r);
  check("past_due: message says to update the card and gives the support address (the Manage Billing button is hidden while plan is free)", /card/i.test(r.data.error) && r.data.error.includes("support@cybernetai.app"), r.data);

  reset({ profile: proProfile("unpaid") });
  r = await buy(BIZ);
  check("unpaid Pro buying Business: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE") && r.stripeCalls === 0, r);

  reset({ ownedTeams: [liveTeam("past_due")] });
  r = await buy(BIZ);
  check("past_due Business owner: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE") && r.stripeCalls === 0, r);
}

// ══════════ Business owners (team rows, never profiles.plan) ══════════
{
  reset({ ownedTeams: [liveTeam("active")], memberships: [member("owner")] });
  let r = await buy(BIZ);
  check("Business owner buying Business: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.data.error.includes("Business"), r);
  check("Business owner buying Business: no Stripe request", r.stripeCalls === 0, r);

  reset({ ownedTeams: [liveTeam("active")], memberships: [member("owner")] });
  r = await buy(PRO);
  check("Business owner buying Pro: 409", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);

  reset({ ownedTeams: [liveTeam("trialing")] });
  r = await buy({ plan: "business", seatTier: 20 });
  check("Business owner on a trial buying 20 seats: 409", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);

  // Owner membership row alone (e.g. the account row is found only through the join).
  reset({ memberships: [member("owner")] });
  r = await buy(PRO);
  check("owner role in an active team: 409", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);
}

// ══════════ team members ══════════
{
  reset({ memberships: [member("member")] });
  let r = await buy(PRO);
  check("team member buying Pro: 409 TEAM_MEMBER", is409(r, "TEAM_MEMBER"), r);
  check("team member: message says the team covers them", /team already covers you/i.test(r.data.error), r.data);
  check("team member: no Stripe request", r.stripeCalls === 0, r);

  reset({ memberships: [member("member", "trialing")] });
  r = await buy(BIZ);
  check("team member buying Business: 409 TEAM_MEMBER", is409(r, "TEAM_MEMBER") && r.stripeCalls === 0, r);
}

// ══════════ Stripe knows before the database does (webhook not processed yet) ══════════
{
  reset({ profile: { ...state.profile, stripe_customer_id: "cus_fresh" }, stripeSubs: [{ id: "sub_just_paid", status: "active", items: { data: [{ price: { lookup_key: "cybernet_ai_pro_monthly" } }] } }] });
  let r = await buy(PRO);
  check("just paid, webhook pending: 409 from the Stripe check", is409(r, "ALREADY_SUBSCRIBED") && r.sessions === 0, r);
  check("just paid: only the read-only subscription list was called", state.stripe.every((c) => c.method === "GET"), state.stripe);

  reset({ profile: { ...state.profile, stripe_customer_id: "cus_fresh" }, stripeSubs: [{ id: "sub_biz", status: "past_due", items: { data: [{ price: { lookup_key: "cybernet_ai_business_monthly" } }] } }] });
  r = await buy(PRO);
  check("past_due Business seen only in Stripe: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE") && r.data.error.includes("Business") && r.sessions === 0, r);
}

// ══════════ fail closed and quiet ══════════
{
  reset({ supabaseDown: true });
  let r = await buy(PRO);
  check("plan lookup down: no checkout is opened", r.status >= 500 && r.sessions === 0 && r.stripeCalls === 0, r);

  reset({ profile: proProfile("active") });
  r = await buy(PRO);
  check("an expected refusal writes no checkout_debug_log row", r.debugLogs === 0, r);
}

// ══════════ the webhook grant path is unchanged ══════════
{
  const Stripe = (await import("stripe")).default;
  const signer = new Stripe(ENV.STRIPE_SECRET_KEY);
  const deliver = async (type, object) => {
    const payload = JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object } });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
    const response = await webhook(new Request(`${SITE}/api/stripe-webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload }));
    return response.status;
  };
  const sub = (id, status, lookupKey) => ({ id, object: "subscription", status, customer: "cus_hook", metadata: { supabase_user_id: USER_ID },
    items: { data: [{ price: { lookup_key: lookupKey, recurring: { interval: "month" } } }] } });

  reset();
  let status = await deliver("customer.subscription.created", sub("sub_new_pro", "active", "cybernet_ai_pro_monthly"));
  const patch = state.rest.find((r) => r.method === "PATCH" && r.path === "/rest/v1/profiles");
  check("webhook: a Pro subscription still grants Pro on the profile", status === 200 && patch?.body?.plan === "pro" && patch.body.subscription_status === "active" && patch.body.stripe_subscription_id === "sub_new_pro", { status, patch });
  check("webhook: a Pro subscription touches no team rows", !state.rest.some((r) => r.path === "/rest/v1/business_accounts"), state.rest);

  reset();
  status = await deliver("customer.subscription.created", sub("sub_new_biz", "active", "cybernet_ai_business_monthly"));
  const insert = state.rest.find((r) => r.method === "POST" && r.path === "/rest/v1/business_accounts");
  check("webhook: a Business subscription still creates the team", status === 200 && insert?.body?.owner_user_id === USER_ID && insert.body.subscription_status === "active", { status, insert });
  check("webhook: a Business subscription leaves the profile alone", !state.rest.some((r) => r.method === "PATCH" && r.path === "/rest/v1/profiles"), state.rest);

  reset({ profile: proProfile("active") });
  status = await deliver("customer.subscription.deleted", sub("sub_pro", "canceled", "cybernet_ai_pro_monthly"));
  const downgrade = state.rest.find((r) => r.method === "PATCH" && r.path === "/rest/v1/profiles");
  check("webhook: a cancelled Pro subscription still returns the profile to free", status === 200 && downgrade?.body?.plan === "free" && downgrade.body.subscription_status === "canceled", { status, downgrade });
}

console.log(`checkout guard: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
