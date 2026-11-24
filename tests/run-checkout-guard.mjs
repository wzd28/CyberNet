// Duplicate-plan guard on /api/create-checkout-session. The owner's rules:
// never stop a customer from buying or upgrading, never cancel a plan anyone
// has. So the guard refuses (409) only:
//   ALREADY_SUBSCRIBED  the same tier the person already has live
//   PAYMENT_PAST_DUE    the same tier while Stripe is still retrying the card
//                       (Stripe is asked first: "past due" left in the database
//                       by a first payment that failed never blocks a sale)
//   TEAM_MEMBER         a member of someone else's team buying Business
// A different tier answers 409 CONFIRM_SECOND_PLAN until the request carries
// confirmSecondPlan: true, then checkout opens. A failed plan lookup opens
// nothing. No request to Stripe ever cancels, updates or deletes anything. The
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
const allStripe = []; // every faked Stripe request of the whole run
function reset(next = {}) {
  state = {
    profile: { id: USER_ID, full_name: "Test User", plan: "free", subscription_status: "inactive", billing_interval: "", stripe_customer_id: null, stripe_subscription_id: null },
    ownedTeams: [],      // business_accounts rows where owner_user_id = USER_ID
    memberships: [],     // business_members rows (with embedded business_accounts)
    stripeSubs: [],      // what Stripe lists for the customer
    stripeDown: false,
    applePro: false,          // an active Apple Pro subscription (entitlement_of)
    entitlementStatus: 0,     // non-zero: entitlement_of answers this HTTP status
    supabaseDown: false,
    membersDown: false,
    rest: [],
    stripe: [],
    ...next
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// The plan lookup public.entitlement_of is a read even though it is a POST.
const isWrite = (c) => c.method !== "GET" && c.path !== "/rest/v1/rpc/entitlement_of";

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
    if (state.membersDown) return jsonResponse({ message: "down" }, 500);
    if (method === "GET") return jsonResponse(state.memberships);
    return jsonResponse([], 201);
  }
  if (url.pathname === "/rest/v1/checkout_debug_log") return jsonResponse([], 201);
  if (url.pathname === "/rest/v1/rpc/entitlement_of") {
    if (state.entitlementStatus) return jsonResponse({ message: "x", code: "PGRST202" }, state.entitlementStatus);
    const p = state.profile;
    const stripe = ["active", "trialing"].includes(p.subscription_status) && ["pro", "business"].includes(p.plan) ? p.plan : "free";
    return jsonResponse([{ plan: stripe !== "free" ? stripe : state.applePro ? "pro" : "free", stripe_active: stripe !== "free", apple_active: Boolean(state.applePro),
      apple_original_transaction_id: state.applePro ? "1000" : null, apple_product_id: state.applePro ? "app.cybernetai.pro.monthly" : null }]);
  }
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
    allStripe.push(call);
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
  if (state.stripeDown) return [500, { error: { type: "api_error", message: "Stripe is down" } }];
  // stripe-webhook re-reads a subscription by id (security audit Nov 2026, PAY-2); one this fake
  // does not hold answers 404, and the webhook then uses the event's own copy.
  const one = method === "GET" && /^\/v1\/subscriptions\/([^/?]+)/.exec(p);
  if (one) {
    const found = (state.stripeSubs || []).find((s) => s.id === decodeURIComponent(one[1]));
    return found ? [200, found] : [404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such subscription" } }];
  }
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
const stripeSub = (status, lookupKey) => ({ id: `sub_${status}_${lookupKey}`, status, items: { data: [{ price: { lookup_key: lookupKey } }] } });
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
  check("Pro buying Pro: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.data.currentPlan === "Pro", r);
  check("Pro buying Pro: no Stripe request at all", r.stripeCalls === 0, r);
  check("Pro buying Pro: message points to Manage billing", r.data.error.includes("Manage billing"), r.data);

  reset({ profile: proProfile("active") });
  r = await buy({ ...PRO, cycle: "yearly", confirmSecondPlan: true });
  check("Pro buying Pro yearly with the flag: still ALREADY_SUBSCRIBED, no checkout", is409(r, "ALREADY_SUBSCRIBED") && r.sessions === 0, r);

  reset({ profile: proProfile("trialing") });
  r = await buy(PRO);
  check("Pro on a trial buying Pro: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);

  // Pro granted on the profile without a subscription id (no Stripe customer).
  reset({ profile: { ...proProfile("active"), stripe_subscription_id: null, stripe_customer_id: null } });
  r = await buy(PRO);
  check("Pro without a subscription id buying Pro: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);

  // A different tier is never refused: it asks once, then opens.
  reset({ profile: proProfile("active"), stripeSubs: [stripeSub("active", "cybernet_ai_pro_monthly")] });
  r = await buy(BIZ);
  check("Pro buying Business, no flag: 409 CONFIRM_SECOND_PLAN", is409(r, "CONFIRM_SECOND_PLAN") && r.data.currentPlan === "Pro" && r.data.targetPlan === "Business", r);
  check("Pro buying Business, no flag: no checkout session", r.sessions === 0, r);
  check("Pro buying Business: message says it adds a second subscription and does not replace Pro",
    r.data.error.includes("You already have CyberNet AI Pro") && r.data.error.includes("adds a second subscription") &&
    r.data.error.includes("does not replace Pro") && r.data.error.includes("Manage billing") && r.data.error.includes("Continue anyway?"), r.data);

  for (const flag of ["true", 1, "yes", false, null]) {
    reset({ profile: proProfile("active"), stripeSubs: [stripeSub("active", "cybernet_ai_pro_monthly")] });
    r = await buy({ ...BIZ, confirmSecondPlan: flag });
    check(`Pro buying Business with confirmSecondPlan ${JSON.stringify(flag)} (not true): still asks`, is409(r, "CONFIRM_SECOND_PLAN") && r.sessions === 0, r);
  }

  reset({ profile: proProfile("active"), stripeSubs: [stripeSub("active", "cybernet_ai_pro_monthly")] });
  r = await buy({ ...BIZ, confirmSecondPlan: true });
  check("Pro buying Business with the flag: checkout opens", r.status === 200 && r.data.url?.includes("checkout.stripe.test") && r.sessions === 1, r);
  let session = state.stripe.find((c) => c.path === "/v1/checkout/sessions");
  check("Pro buying Business with the flag: the session is for the Business price on the same customer",
    decodeURIComponent(session?.body || "").includes("price_cybernet_ai_business_monthly") && decodeURIComponent(session?.body || "").includes("customer=cus_pro"), session);
  check("Pro buying Business with the flag: the Pro profile is not touched", !state.rest.some(isWrite), state.rest);

  // A profile that itself names Business (granted by hand) is Business, not Pro.
  reset({ profile: { ...proProfile("active"), plan: "business" } });
  r = await buy(PRO);
  check("Business named on the profile buying Pro: asks, is not called a duplicate", is409(r, "CONFIRM_SECOND_PLAN") && r.data.currentPlan === "Business" && r.sessions === 0, r);
  reset({ profile: { ...proProfile("active"), plan: "business" } });
  r = await buy(BIZ);
  check("Business named on the profile buying Business: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.data.currentPlan === "Business" && r.stripeCalls === 0, r);

  reset({ profile: proProfile("trialing") });
  r = await buy(BIZ);
  check("Pro on a trial buying Business: asks, does not refuse", is409(r, "CONFIRM_SECOND_PLAN") && r.sessions === 0, r);
}

// ══════════ past due (the webhook sets plan free + past_due, the subscription id stays) ══════════
{
  // Stripe is still retrying the card on a live Pro plan: refused, after one read of Stripe.
  const proPastDue = () => ({ profile: proProfile("past_due"), stripeSubs: [stripeSub("past_due", "cybernet_ai_pro_monthly")] });
  const teamOwnerProfile = () => ({ id: USER_ID, full_name: "Test User", plan: "free", subscription_status: "inactive", billing_interval: "", stripe_customer_id: "cus_team", stripe_subscription_id: null });
  const onlyListed = (r) => r.stripeCalls === 1 && state.stripe[0].method === "GET" && state.stripe[0].path.startsWith("/v1/subscriptions?");
  reset(proPastDue());
  let r = await buy(PRO);
  check("past_due Pro buying Pro: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE"), r);
  check("past_due Pro: Stripe is only asked which plans are live", onlyListed(r), state.stripe);
  check("past_due: message says to update the card and gives the support address", /card/i.test(r.data.error) && r.data.error.includes("support@cybernetai.app"), r.data);

  reset(proPastDue());
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("past_due Pro buying Pro with the flag: still PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE") && r.sessions === 0, r);

  reset({ profile: proProfile("unpaid"), stripeSubs: [stripeSub("unpaid", "cybernet_ai_pro_monthly")] });
  r = await buy(PRO);
  check("unpaid Pro buying Pro: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE") && onlyListed(r), r);

  reset({ profile: teamOwnerProfile(), ownedTeams: [liveTeam("past_due")], stripeSubs: [stripeSub("past_due", "cybernet_ai_business_monthly")] });
  r = await buy(BIZ);
  check("past_due Business owner buying Business: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE") && r.data.currentPlan === "Business" && onlyListed(r), r);

  // No Stripe customer to ask: the database's word stands and nothing opens.
  reset({ ownedTeams: [liveTeam("past_due")] });
  r = await buy(BIZ);
  check("past_due Business, no Stripe customer on the profile: 409 PAYMENT_PAST_DUE, no Stripe request", is409(r, "PAYMENT_PAST_DUE") && r.stripeCalls === 0, r);

  // Stale "past due": a first payment that was declined at Checkout. The webhook wrote past_due,
  // but Stripe has no live plan (the subscription is incomplete, or gone), so the sale goes ahead.
  reset({ profile: proProfile("past_due"), stripeSubs: [stripeSub("incomplete", "cybernet_ai_pro_monthly")] });
  r = await buy(PRO);
  check("past_due in the database, incomplete in Stripe (declined first payment): Pro checkout opens", r.status === 200 && r.sessions === 1, r);
  check("declined first payment: Stripe subscriptions are listed once", state.stripe.filter((c) => c.path.startsWith("/v1/subscriptions")).length === 1, state.stripe);

  reset({ profile: proProfile("past_due"), stripeSubs: [] });
  r = await buy(PRO);
  check("past_due in the database, nothing in Stripe: Pro checkout opens", r.status === 200 && r.sessions === 1, r);

  reset({ profile: proProfile("unpaid"), stripeSubs: [stripeSub("canceled", "cybernet_ai_pro_monthly"), stripeSub("incomplete_expired", "cybernet_ai_pro_monthly")] });
  r = await buy(PRO);
  check("unpaid in the database, only ended plans in Stripe: Pro checkout opens", r.status === 200 && r.sessions === 1, r);

  reset({ profile: teamOwnerProfile(), ownedTeams: [liveTeam("past_due")], stripeSubs: [stripeSub("incomplete", "cybernet_ai_business_monthly")] });
  r = await buy(BIZ);
  check("past_due team in the database, incomplete in Stripe: Business checkout opens", r.status === 200 && r.sessions === 1, r);

  // The database lags the other way: the retry has succeeded and the plan is live again.
  reset({ profile: proProfile("past_due"), stripeSubs: [stripeSub("active", "cybernet_ai_pro_monthly")] });
  r = await buy(PRO);
  check("past_due in the database, active in Stripe: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.sessions === 0, r);

  // A stale past_due Pro never hides a live plan of the other tier.
  reset({ profile: proProfile("past_due"), stripeSubs: [stripeSub("active", "cybernet_ai_business_monthly")] });
  r = await buy(PRO);
  check("stale past_due Pro, live Business in Stripe, buying Pro: asks first", is409(r, "CONFIRM_SECOND_PLAN") && r.data.currentPlan === "Business" && r.sessions === 0, r);

  // Stripe cannot be read: nothing opens.
  reset({ profile: proProfile("past_due"), stripeDown: true });
  r = await buy(PRO);
  check("past_due in the database, Stripe unreachable: no checkout is opened", r.status >= 400 && r.sessions === 0, r);

  // A different tier while past due is not refused.
  reset({ profile: proProfile("past_due"), stripeSubs: [stripeSub("past_due", "cybernet_ai_pro_monthly")] });
  r = await buy(BIZ);
  check("past_due Pro buying Business, no flag: CONFIRM_SECOND_PLAN", is409(r, "CONFIRM_SECOND_PLAN") && r.data.currentPlan === "Pro" && r.sessions === 0, r);
  reset({ profile: proProfile("past_due"), stripeSubs: [stripeSub("past_due", "cybernet_ai_pro_monthly")] });
  r = await buy({ ...BIZ, confirmSecondPlan: true });
  check("past_due Pro buying Business with the flag: checkout opens", r.status === 200 && r.sessions === 1, r);

  reset({ ownedTeams: [liveTeam("past_due")] });
  r = await buy(PRO);
  check("past_due Business owner buying Pro, no flag: CONFIRM_SECOND_PLAN", is409(r, "CONFIRM_SECOND_PLAN") && r.data.currentPlan === "Business" && r.sessions === 0, r);
  reset({ ownedTeams: [liveTeam("past_due")] });
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("past_due Business owner buying Pro with the flag: checkout opens", r.status === 200 && r.sessions === 1, r);
}

// ══════════ Business owners (team rows, never profiles.plan) ══════════
{
  reset({ ownedTeams: [liveTeam("active")], memberships: [member("owner")] });
  let r = await buy(BIZ);
  check("Business owner buying Business: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.data.error.includes("Business"), r);
  check("Business owner buying Business: no Stripe request", r.stripeCalls === 0, r);

  reset({ ownedTeams: [liveTeam("trialing")] });
  r = await buy({ plan: "business", seatTier: 20, confirmSecondPlan: true });
  check("Business owner on a trial buying 20 seats, even with the flag: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);

  // Owner membership row alone (the account row is found only through the join).
  reset({ memberships: [member("owner")] });
  r = await buy(BIZ);
  check("owner role in an active team buying Business: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.stripeCalls === 0, r);

  reset({ ownedTeams: [liveTeam("active")], memberships: [member("owner")] });
  r = await buy(PRO);
  check("Business owner buying Pro, no flag: CONFIRM_SECOND_PLAN", is409(r, "CONFIRM_SECOND_PLAN") && r.data.currentPlan === "Business" && r.data.targetPlan === "Pro" && r.sessions === 0, r);
  check("Business owner buying Pro: message names both plans", r.data.error.includes("You already have CyberNet AI Business") && r.data.error.includes("Buying Pro adds a second subscription"), r.data);

  reset({ ownedTeams: [liveTeam("active")], memberships: [member("owner")] });
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("Business owner buying Pro with the flag: checkout opens", r.status === 200 && r.sessions === 1, r);
  check("Business owner buying Pro with the flag: no team row is written", !state.rest.some((c) => c.path.startsWith("/rest/v1/business_") && c.method !== "GET"), state.rest);
}

// ══════════ team members (covered by someone else's team) ══════════
{
  reset({ memberships: [member("member")] });
  let r = await buy(BIZ);
  check("team member buying Business: 409 TEAM_MEMBER", is409(r, "TEAM_MEMBER"), r);
  check("team member buying Business: message says to ask the owner", r.data.error === "Your team already covers you. To get your own Business plan, ask your team owner to remove you first.", r.data);
  check("team member buying Business: no Stripe request", r.stripeCalls === 0, r);

  reset({ memberships: [member("member", "trialing")] });
  r = await buy({ ...BIZ, confirmSecondPlan: true });
  check("team member buying Business with the flag: still TEAM_MEMBER", is409(r, "TEAM_MEMBER") && r.stripeCalls === 0, r);

  reset({ memberships: [member("member")] });
  r = await buy(PRO);
  check("team member buying Pro, no flag: CONFIRM_SECOND_PLAN", is409(r, "CONFIRM_SECOND_PLAN") && r.data.viaTeam === true && r.sessions === 0, r);
  check("team member buying Pro: message says the team covers them and stays unchanged", /team/i.test(r.data.error) && r.data.error.includes("Continue anyway?"), r.data);

  reset({ memberships: [member("member")] });
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("team member buying Pro with the flag: checkout opens", r.status === 200 && r.sessions === 1, r);
  check("team member buying Pro with the flag: membership is not touched", !state.rest.some((c) => c.path.startsWith("/rest/v1/business_") && c.method !== "GET"), state.rest);
}

// ══════════ Stripe knows before the database does (webhook not processed yet) ══════════
{
  const fresh = () => ({ id: USER_ID, full_name: "Test User", plan: "free", subscription_status: "inactive", billing_interval: "", stripe_customer_id: "cus_fresh", stripe_subscription_id: null });

  reset({ profile: fresh(), stripeSubs: [stripeSub("active", "cybernet_ai_pro_monthly")] });
  let r = await buy(PRO);
  check("just paid Pro, webhook pending, buying Pro: 409 ALREADY_SUBSCRIBED from the Stripe check", is409(r, "ALREADY_SUBSCRIBED") && r.sessions === 0, r);
  check("just paid: only the read-only subscription list was called", state.stripe.length === 1 && state.stripe[0].method === "GET" && state.stripe[0].path.startsWith("/v1/subscriptions"), state.stripe);

  reset({ profile: fresh(), stripeSubs: [stripeSub("active", "cybernet_ai_pro_monthly")] });
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("webhook-pending duplicate with the flag: still ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.sessions === 0, r);

  reset({ profile: fresh(), stripeSubs: [stripeSub("active", "cybernet_ai_business_10seat_yearly")] });
  r = await buy(BIZ);
  check("just paid Business (10 seats), webhook pending, buying Business: 409 ALREADY_SUBSCRIBED", is409(r, "ALREADY_SUBSCRIBED") && r.data.currentPlan === "Business" && r.sessions === 0, r);

  reset({ profile: fresh(), stripeSubs: [stripeSub("past_due", "cybernet_ai_pro_monthly")] });
  r = await buy(PRO);
  check("past_due Pro seen only in Stripe, buying Pro: 409 PAYMENT_PAST_DUE", is409(r, "PAYMENT_PAST_DUE") && r.sessions === 0, r);

  // A live subscription of a different tier, known only to Stripe.
  reset({ profile: fresh(), stripeSubs: [stripeSub("active", "cybernet_ai_business_monthly")] });
  r = await buy(PRO);
  check("Business seen only in Stripe, buying Pro, no flag: CONFIRM_SECOND_PLAN", is409(r, "CONFIRM_SECOND_PLAN") && r.data.currentPlan === "Business" && r.sessions === 0, r);
  reset({ profile: fresh(), stripeSubs: [stripeSub("active", "cybernet_ai_business_monthly")] });
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("Business seen only in Stripe, buying Pro with the flag: checkout opens", r.status === 200 && r.sessions === 1, r);

  reset({ profile: fresh(), stripeSubs: [stripeSub("past_due", "cybernet_ai_business_monthly")] });
  r = await buy(PRO);
  check("past_due Business seen only in Stripe, buying Pro: asks, does not refuse", is409(r, "CONFIRM_SECOND_PLAN") && r.sessions === 0, r);

  // Ended subscriptions in Stripe never count.
  reset({ profile: fresh(), stripeSubs: [stripeSub("canceled", "cybernet_ai_pro_monthly"), stripeSub("incomplete_expired", "cybernet_ai_business_monthly")] });
  r = await buy(PRO);
  check("only ended subscriptions in Stripe: checkout opens without asking", r.status === 200 && r.sessions === 1, r);
}

// ══════════ fail closed and quiet ══════════
{
  reset({ supabaseDown: true });
  let r = await buy(PRO);
  check("plan lookup down: no checkout is opened", r.status >= 500 && r.sessions === 0 && r.stripeCalls === 0, r);

  reset({ supabaseDown: true });
  r = await buy({ ...BIZ, confirmSecondPlan: true });
  check("plan lookup down, with the flag: still no checkout", r.status >= 500 && r.sessions === 0 && r.stripeCalls === 0, r);

  reset({ membersDown: true });
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("team lookup down: no checkout is opened", r.status >= 500 && r.sessions === 0 && r.stripeCalls === 0, r);

  const quiet = [
    ["ALREADY_SUBSCRIBED", { profile: proProfile("active") }, PRO],
    ["PAYMENT_PAST_DUE", { profile: proProfile("past_due"), stripeSubs: [stripeSub("past_due", "cybernet_ai_pro_monthly")] }, PRO],
    ["CONFIRM_SECOND_PLAN", { profile: proProfile("active") }, BIZ],
    ["TEAM_MEMBER", { memberships: [member("member")] }, BIZ]
  ];
  for (const [code, next, body] of quiet) {
    reset(next);
    r = await buy(body);
    check(`${code}: writes no checkout_debug_log row and nothing else`, is409(r, code) && r.debugLogs === 0 && !state.rest.some(isWrite), { r, rest: state.rest });
  }
}

// ══════════ Apple Pro bought in the iPhone app (entitlement_of) ══════════
{
  reset({ applePro: true });
  let r = await buy(PRO);
  check("Apple Pro buying Pro: 409 ALREADY_SUBSCRIBED_APPLE", is409(r, "ALREADY_SUBSCRIBED_APPLE") && r.sessions === 0 && r.stripeCalls === 0, r);
  check("Apple Pro buying Pro: message points to iPhone Settings, not Manage billing", r.data.error?.includes("iPhone Settings") && !r.data.error?.includes("Manage billing"), r.data);

  reset({ applePro: true });
  r = await buy({ ...PRO, confirmSecondPlan: true });
  check("Apple Pro buying Pro with the flag: still refused", is409(r, "ALREADY_SUBSCRIBED_APPLE") && r.sessions === 0, r);

  reset({ applePro: true });
  r = await buy(BIZ);
  check("Apple Pro buying Business: CONFIRM_SECOND_PLAN with Apple wording", is409(r, "CONFIRM_SECOND_PLAN") && r.data.viaApple === true &&
    r.data.error.includes("keeps billing through Apple") && r.data.error.includes("iPhone Settings") && r.sessions === 0, r.data);

  reset({ applePro: true });
  r = await buy({ ...BIZ, confirmSecondPlan: true });
  check("Apple Pro buying Business with the flag: checkout opens", r.status === 200 && r.sessions === 1, r);
  check("Apple Pro buying Business: nothing is cancelled or written", !state.rest.some(isWrite) || state.rest.filter(isWrite).every((c) => c.path === "/rest/v1/checkout_debug_log" || c.path === "/rest/v1/profiles"), state.rest.filter(isWrite));

  reset({ applePro: true, profile: proProfile("active") });
  r = await buy(PRO);
  check("Stripe Pro + Apple Pro buying Pro: refused as a duplicate", r.status === 409 && ["ALREADY_SUBSCRIBED", "ALREADY_SUBSCRIBED_APPLE"].includes(r.data.code), r);

  reset({ entitlementStatus: 500 });
  r = await buy(PRO);
  check("entitlement lookup outage: fails closed (503), no checkout", r.status === 503 && r.sessions === 0, r);

  reset({ entitlementStatus: 404 });
  r = await buy(PRO);
  check("before the 1.1 migration (entitlement_of missing): checkout works as before", r.status === 200 && r.sessions === 1, r);
}

// ══════════ nothing the checkout guard does can cancel or change a plan ══════════
{
  const writes = allStripe.filter((c) => c.method !== "GET");
  check("Stripe: requests were made at all (the fake is wired)", allStripe.length > 20, allStripe.length);
  check("Stripe: no DELETE request, ever", !allStripe.some((c) => c.method === "DELETE"), allStripe.filter((c) => c.method === "DELETE"));
  check("Stripe: the only writes are new checkout sessions and new customers",
    writes.every((c) => c.method === "POST" && (c.path === "/v1/checkout/sessions" || c.path === "/v1/customers")), writes);
  check("Stripe: no subscription, schedule, invoice or portal endpoint is written to",
    !writes.some((c) => /\/v1\/(subscriptions|subscription_items|subscription_schedules|invoices|billing_portal)/.test(c.path)), writes);
  check("Stripe: subscriptions are only ever listed", allStripe.filter((c) => c.path.startsWith("/v1/subscriptions")).every((c) => c.method === "GET" && /^\/v1\/subscriptions\?/.test(c.path)), allStripe.filter((c) => c.path.startsWith("/v1/subscriptions")));
  check("Stripe: no checkout session asks to cancel or replace anything",
    !allStripe.some((c) => c.path === "/v1/checkout/sessions" && /cancel_at|proration|subscription_data\[(?!metadata)/.test(decodeURIComponent(c.body || ""))), null);

  const source = (await import("node:fs")).readFileSync(path.join(root, "netlify/functions/create-checkout-session.mjs"), "utf8");
  check("source: no Stripe cancel/update/delete/pause call in the checkout function",
    !/subscriptions\.(cancel|update|del|deleteDiscount|resume)|subscriptionItems\.|subscriptionSchedules\.|pause_collection|cancel_at_period_end/.test(source), null);
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
  // It may read business_accounts (PAY-5: was this subscription a team's before a switch?), never write.
  check("webhook: a Pro subscription writes no team rows", !state.rest.some((r) => r.path === "/rest/v1/business_accounts" && r.method !== "GET"), state.rest);

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
