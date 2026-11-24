// Regression tests for the November 2026 security audit, Stripe webhook part
// (PAY-1, PAY-2 / SRV-AUTH-4, PAY-4, PAY-5, PAY-10, PAY-11, SRV-11).
// No network: Stripe is replaced through webhookDeps, Supabase through fetch.
//
//   node tests/run-security-webhook.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Stripe from "stripe";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE = "https://stub-project.supabase.test";
const WHSEC = "whsec_run_security_webhook_fake";
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ERROR_ALERTS", "RESEND_API_KEY",
  "STRIPE_PRO_MONTHLY_LOOKUP_KEY", "STRIPE_PRO_YEARLY_LOOKUP_KEY", "STRIPE_BUSINESS_MONTHLY_LOOKUP_KEY", "STRIPE_BUSINESS_YEARLY_LOOKUP_KEY"]) delete process.env[name];
const ENV = { SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", STRIPE_SECRET_KEY: "sk_test_fake_security_webhook", STRIPE_WEBHOOK_SECRET: WHSEC, ERROR_ALERTS: "off" };
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const logged = [];
const quiet = { log: console.log };
console.error = (...args) => logged.push(args.map((a) => (typeof a === "string" ? a : a?.message || JSON.stringify(a))).join(" "));
console.warn = () => {};

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    quiet.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  }
}

const USER = "00000000-0000-4000-8000-0000000000a1";
const TEAM = "00000000-0000-4000-8000-0000000000b1";
let state, rest;
function reset(over = {}) {
  state = { stripeSubs: [], profile: null, teamBySub: {}, teamByOwner: null, fail: null, memberInsert: 201, ...over };
  rest = [];
  logged.length = 0;
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== SUPABASE) return json({ message: "unexpected" }, 599);
  const method = String(init.method || "GET").toUpperCase();
  let body = null;
  try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
  const call = { method, path: url.pathname, query: decodeURIComponent(url.search), body };
  rest.push(call);
  if (state.fail && state.fail(call)) return json({ message: "relation \"business_accounts\" upstream timeout", code: "57014" }, 500);
  if (url.pathname === "/rest/v1/profiles") {
    if (method === "PATCH") return json([{ id: USER, ...body }]);
    const q = call.query;
    if (state.profile && (q.includes(`id=eq.${USER}`) || q.includes(`stripe_customer_id=eq.${state.profile.stripe_customer_id}`))) {
      if (q.includes("stripe_subscription_id=eq.") && !q.includes(`stripe_subscription_id=eq.${state.profile.stripe_subscription_id}`)) return json([]);
      return json([state.profile]);
    }
    return json([]);
  }
  if (url.pathname === "/rest/v1/business_accounts") {
    if (method === "GET") {
      const bySub = /stripe_subscription_id=eq\.([^&]+)/.exec(call.query)?.[1];
      if (bySub !== undefined) return json(state.teamBySub[bySub] ? [state.teamBySub[bySub]] : []);
      if (/owner_user_id=eq\./.test(call.query)) return json(state.teamByOwner ? [state.teamByOwner] : []);
      return json([]);
    }
    if (method === "POST") return json([{ id: TEAM }], 201);
    return new Response(null, { status: 204 });
  }
  if (url.pathname === "/rest/v1/business_members") {
    if (method === "GET") return json([]);
    return new Response(null, { status: state.memberInsert });
  }
  return json([]);
};

const mod = await import(pathToFileURL(path.join(root, "netlify/functions/stripe-webhook.mjs")).href);
const webhook = mod.default;
const signer = new Stripe(ENV.STRIPE_SECRET_KEY);
const stripeCalls = [];
mod.webhookDeps.stripe = (secret) => {
  const real = new Stripe(secret);
  real.subscriptions = {
    retrieve: async (id) => {
      stripeCalls.push({ op: "retrieve", id });
      const found = state.stripeSubs.find((s) => s.id === id);
      if (!found) throw Object.assign(new Error("No such subscription"), { statusCode: 404, code: "resource_missing" });
      return found;
    },
    list: async (params) => {
      stripeCalls.push({ op: "list", params });
      return { object: "list", data: state.stripeSubs.filter((s) => s.customer === params.customer), has_more: false };
    }
  };
  return real;
};

const sub = (id, status, lookupKey, extra = {}) => ({ id, object: "subscription", status, customer: "cus_hook", metadata: { supabase_user_id: USER },
  items: { data: [{ price: { lookup_key: lookupKey, recurring: { interval: "month" } } }] }, ...extra });
async function deliver(type, object, { raw } = {}) {
  const payload = raw ?? JSON.stringify({ id: `evt_${type}_${Math.random()}`, object: "event", type, data: { object } });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  const response = await webhook(new Request("https://cybernetai.app/api/stripe-webhook", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload }));
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
const writes = (p) => rest.filter((c) => c.path === p && c.method !== "GET");
const profilePatch = () => writes("/rest/v1/profiles").find((c) => c.method === "PATCH")?.body;

// ── PAY-1: a failed team write makes Stripe retry ──
{
  reset({ teamBySub: { sub_biz: { id: TEAM } }, stripeSubs: [sub("sub_biz", "canceled", "cybernet_ai_business_monthly")], fail: (c) => c.path === "/rest/v1/business_accounts" && c.method === "PATCH" });
  const r = await deliver("customer.subscription.deleted", sub("sub_biz", "canceled", "cybernet_ai_business_monthly"));
  check("PAY-1 team PATCH answers 500: the webhook answers 500 (Stripe retries)", r.status === 500, r);
  check("PAY-10 the 500 answer is a fixed message (no PostgREST text)", r.data?.error === "Webhook processing failed.", r.data);
  reset({ stripeSubs: [sub("sub_biz", "active", "cybernet_ai_business_monthly")], fail: (c) => c.path === "/rest/v1/business_accounts" && c.method === "GET" });
  const r2 = await deliver("customer.subscription.updated", sub("sub_biz", "active", "cybernet_ai_business_monthly"));
  check("PAY-1 a failed team lookup is a 500 too (it used to look like 'no team')", r2.status === 500 && !writes("/rest/v1/business_accounts").length, r2);
  reset({ stripeSubs: [sub("sub_biz", "active", "cybernet_ai_business_monthly")], memberInsert: 409 });
  const r3 = await deliver("customer.subscription.created", sub("sub_biz", "active", "cybernet_ai_business_monthly"));
  check("PAY-1 owner membership insert 409 (already there): success", r3.status === 200 && writes("/rest/v1/business_members").length === 1, r3);
  reset({ stripeSubs: [sub("sub_biz", "active", "cybernet_ai_business_monthly")], memberInsert: 500 });
  const r4 = await deliver("customer.subscription.created", sub("sub_biz", "active", "cybernet_ai_business_monthly"));
  check("PAY-1 owner membership insert 500: the webhook answers 500", r4.status === 500, r4);
}

// ── PAY-2 / SRV-AUTH-4: Stripe's current state wins over the event's snapshot ──
{
  // A retried, older "active" event for a subscription that has since been cancelled.
  reset({ profile: { id: USER, plan: "free", subscription_status: "canceled", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_pro" },
    stripeSubs: [sub("sub_pro", "canceled", "cybernet_ai_pro_monthly")] });
  let r = await deliver("customer.subscription.updated", sub("sub_pro", "active", "cybernet_ai_pro_monthly"));
  check("PAY-2 a late 'active' event for a cancelled subscription keeps the profile free", r.status === 200 && profilePatch()?.plan === "free" && profilePatch()?.subscription_status === "canceled", profilePatch());
  check("PAY-2 the subscription was re-read from Stripe", stripeCalls.some((c) => c.op === "retrieve" && c.id === "sub_pro"));

  // An abandoned incomplete subscription expiring while another Pro one is active.
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_good" },
    stripeSubs: [sub("sub_good", "active", "cybernet_ai_pro_yearly"), sub("sub_old", "incomplete_expired", "cybernet_ai_pro_monthly")] });
  r = await deliver("customer.subscription.updated", sub("sub_old", "incomplete_expired", "cybernet_ai_pro_monthly"));
  check("PAY-2 an expired second subscription does not downgrade the live one", r.status === 200 && profilePatch()?.plan === "pro" && profilePatch()?.stripe_subscription_id === "sub_good", profilePatch());

  // A cancellation still downgrades when there is no other live Pro subscription.
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_pro" },
    stripeSubs: [sub("sub_pro", "canceled", "cybernet_ai_pro_monthly"), sub("sub_team", "active", "cybernet_ai_business_monthly")] });
  r = await deliver("customer.subscription.deleted", sub("sub_pro", "canceled", "cybernet_ai_pro_monthly"));
  check("PAY-2 a real cancel still returns the profile to free (a team plan does not count as Pro)", r.status === 200 && profilePatch()?.plan === "free", profilePatch());

  // Business: an old subscription's event must not overwrite the team paid by a new one.
  reset({ teamByOwner: { id: TEAM, stripe_subscription_id: "sub_B", subscription_status: "active" }, stripeSubs: [sub("sub_A", "canceled", "cybernet_ai_business_monthly")] });
  r = await deliver("customer.subscription.updated", sub("sub_A", "active", "cybernet_ai_business_monthly"));
  check("PAY-2 an old team subscription's event leaves the team paid by the new one alone", r.status === 200 && !writes("/rest/v1/business_accounts").length, writes("/rest/v1/business_accounts"));
  // Re-subscribing after a cancel still takes over the owner's old row.
  reset({ teamByOwner: { id: TEAM, stripe_subscription_id: "sub_A", subscription_status: "canceled" }, stripeSubs: [sub("sub_B", "active", "cybernet_ai_business_monthly")] });
  r = await deliver("customer.subscription.created", sub("sub_B", "active", "cybernet_ai_business_monthly"));
  const patch = writes("/rest/v1/business_accounts")[0];
  check("PAY-2 re-subscribing after a cancel still reactivates the owner's team", r.status === 200 && patch?.method === "PATCH" && patch.body.stripe_subscription_id === "sub_B" && patch.body.subscription_status === "active", patch);
  // An owner whose old plan went past due buys again: the new plan takes the team.
  reset({ teamByOwner: { id: TEAM, stripe_subscription_id: "sub_A", subscription_status: "past_due" }, stripeSubs: [sub("sub_B", "active", "cybernet_ai_business_monthly")] });
  r = await deliver("customer.subscription.created", sub("sub_B", "active", "cybernet_ai_business_monthly"));
  const moved = writes("/rest/v1/business_accounts")[0];
  check("PAY-2 a new active plan takes over a team whose old plan is past due", r.status === 200 && moved?.body?.stripe_subscription_id === "sub_B" && moved.body.subscription_status === "active", moved);
  // A checkout whose subscription Stripe cannot find writes nothing and is retried.
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_pro" } });
  r = await deliver("checkout.session.completed", { id: "cs_1", object: "checkout.session", client_reference_id: USER, subscription: "sub_missing" });
  check("PAY-2 checkout with an unknown subscription: 500 (retried), the profile is not touched", r.status === 500 && !profilePatch(), { r, p: profilePatch() });
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_pro" } });
  r = await deliver("invoice.payment_failed", { id: "in_9", object: "invoice", customer: "cus_hook", subscription: "sub_missing" });
  check("PAY-4 a failed invoice whose subscription Stripe cannot find writes nothing", r.status === 500 && !profilePatch(), { r, p: profilePatch() });
  // A checkout for a real subscription still grants Pro.
  reset({ stripeSubs: [sub("sub_new", "active", "cybernet_ai_pro_monthly")] });
  r = await deliver("checkout.session.completed", { id: "cs_2", object: "checkout.session", client_reference_id: USER, subscription: "sub_new" });
  check("PAY-2 checkout for a real subscription still grants Pro", r.status === 200 && profilePatch()?.plan === "pro" && profilePatch()?.stripe_subscription_id === "sub_new", profilePatch());
  // Account deletion flow: a cancelled subscription with no team row creates nothing.
  reset({ stripeSubs: [sub("sub_gone", "canceled", "cybernet_ai_business_monthly")] });
  r = await deliver("customer.subscription.deleted", sub("sub_gone", "canceled", "cybernet_ai_business_monthly"));
  check("PAY-2 a cancelled team subscription with no row still creates nothing", r.status === 200 && !writes("/rest/v1/business_accounts").length);
}

// ── PAY-4: a failed invoice only touches its own subscription's plan ──
{
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_pro" },
    teamBySub: { sub_team: { id: TEAM } }, stripeSubs: [sub("sub_pro", "past_due", "cybernet_ai_pro_monthly"), sub("sub_team", "active", "cybernet_ai_business_monthly")] });
  let r = await deliver("invoice.payment_failed", { id: "in_1", object: "invoice", customer: "cus_hook", subscription: "sub_pro" });
  check("PAY-4 a failed Pro invoice: Pro goes past due, the team is untouched", r.status === 200 && profilePatch()?.plan === "free" && profilePatch()?.subscription_status === "past_due" && !writes("/rest/v1/business_accounts").length, { p: profilePatch(), t: writes("/rest/v1/business_accounts") });
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_pro" },
    teamBySub: { sub_team: { id: TEAM } }, stripeSubs: [sub("sub_pro", "active", "cybernet_ai_pro_monthly"), sub("sub_team", "past_due", "cybernet_ai_business_monthly")] });
  r = await deliver("invoice.payment_failed", { id: "in_2", object: "invoice", customer: "cus_hook", parent: { subscription_details: { subscription: "sub_team" } } });
  const t = writes("/rest/v1/business_accounts")[0];
  check("PAY-4 a failed team invoice (new API shape): the team goes past due, Pro is untouched", r.status === 200 && t?.body?.subscription_status === "past_due" && !profilePatch(), { t, p: profilePatch() });
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_pro" } });
  r = await deliver("invoice.payment_failed", { id: "in_3", object: "invoice", customer: "cus_hook" });
  check("PAY-4 an invoice with no subscription changes nothing", r.status === 200 && !rest.some((c) => c.method !== "GET"), rest);
}

// ── PAY-5: allow-list, switches between Pro and Business prices ──
{
  const keys = mod.knownLookupKeys();
  check("PAY-5 the checkout keys are known with their seats", keys.get("cybernet_ai_pro_monthly")?.tier === "pro" && keys.get("cybernet_ai_business_20seat_yearly")?.seats === 20 && keys.get("cybernet_ai_business_monthly")?.seats === 5);
  reset({ teamBySub: { sub_x: { id: TEAM, subscription_status: "active" } }, stripeSubs: [sub("sub_x", "active", "cybernet_ai_pro_monthly")] });
  let r = await deliver("customer.subscription.updated", sub("sub_x", "active", "cybernet_ai_pro_monthly"));
  const closed = writes("/rest/v1/business_accounts")[0];
  check("PAY-5 a team subscription switched to a Pro price closes the team row", r.status === 200 && closed?.body?.subscription_status === "canceled" && profilePatch()?.plan === "pro", { closed, p: profilePatch() });
  reset({ profile: { id: USER, plan: "pro", subscription_status: "active", stripe_customer_id: "cus_hook", stripe_subscription_id: "sub_y" }, stripeSubs: [sub("sub_y", "active", "cybernet_ai_business_monthly")] });
  r = await deliver("customer.subscription.updated", sub("sub_y", "active", "cybernet_ai_business_monthly"));
  check("PAY-5 a Pro subscription switched to a Business price stops Pro on the profile", r.status === 200 && profilePatch()?.plan === "free" && writes("/rest/v1/business_accounts").length >= 1, { p: profilePatch() });
  reset({ stripeSubs: [sub("sub_z", "active", "some_other_product_monthly")] });
  r = await deliver("customer.subscription.created", sub("sub_z", "active", "some_other_product_monthly"));
  check("PAY-5 an unknown lookup key is reported to the owner", r.status === 200 && logged.some((l) => /Unknown Stripe lookup key/.test(l)), logged.slice(-3));
}

// ── PAY-11: paused collection, disputes and refunds ──
{
  reset({ stripeSubs: [sub("sub_p", "active", "cybernet_ai_pro_monthly", { pause_collection: { behavior: "void" } })] });
  let r = await deliver("customer.subscription.updated", sub("sub_p", "active", "cybernet_ai_pro_monthly"));
  check("PAY-11 a paused Pro subscription is not Pro", r.status === 200 && profilePatch()?.plan === "free", profilePatch());
  reset({ teamBySub: { sub_tp: { id: TEAM } }, stripeSubs: [sub("sub_tp", "active", "cybernet_ai_business_monthly", { pause_collection: { behavior: "void" } })] });
  r = await deliver("customer.subscription.updated", sub("sub_tp", "active", "cybernet_ai_business_monthly"));
  check("PAY-11 a paused team subscription is stored as paused (not entitled)", r.status === 200 && writes("/rest/v1/business_accounts")[0]?.body?.subscription_status === "paused", writes("/rest/v1/business_accounts"));
  for (const type of ["charge.dispute.created", "charge.refunded"]) {
    reset();
    r = await deliver(type, { id: "ch_1", object: type === "charge.refunded" ? "charge" : "dispute", customer: "cus_hook" });
    check(`PAY-11 ${type}: alert logged with the customer id only, nothing written`, r.status === 200 && logged.some((l) => l.includes("cus_hook")) && !rest.some((c) => c.method !== "GET"), { r, logged: logged.slice(-2) });
  }
}

// A real Dispute object has no customer: the alert names its charge.
{
  reset();
  const r = await deliver("charge.dispute.created", { id: "dp_1", object: "dispute", charge: "ch_disputed_1" });
  // report-error.mjs scrubs Stripe ids from what it keeps, so the alert says "<stripe-id>"; the owner looks it up in Stripe.
  check("PAY-11 a dispute without a customer still alerts", r.status === 200 && logged.some((l) => /Stripe dispute opened/.test(l) && /Stripe dispute for (<stripe-id>|ch_disputed_1)/.test(l)), logged.slice(-2));
}

// A declined first payment: the profile gets Stripe's "incomplete", which does
// not count as a live plan for checkout, so the buyer can try again.
{
  reset({ profile: { id: USER, plan: "free", subscription_status: "inactive", stripe_customer_id: "cus_hook", stripe_subscription_id: "" },
    stripeSubs: [sub("sub_first", "incomplete", "cybernet_ai_pro_monthly")] });
  const r = await deliver("invoice.payment_failed", { id: "in_first", object: "invoice", customer: "cus_hook", subscription: "sub_first" });
  check("PAY-4 a declined first payment: free, status incomplete (not past_due)", r.status === 200 && profilePatch()?.plan === "free" && profilePatch()?.subscription_status === "incomplete", profilePatch());
}

// ── PAY-10 / SRV-11: signature failures and oversized bodies ──
{
  reset();
  const payload = JSON.stringify({ id: "evt_x", object: "event", type: "customer.subscription.updated", data: { object: {} } });
  const response = await webhook(new Request("https://cybernetai.app/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: payload }));
  const data = await response.json();
  check("PAY-10 a bad signature: 400 with a fixed message", response.status === 400 && data.error === "Invalid Stripe webhook signature.", data);
  const big = await deliver("customer.subscription.updated", null, { raw: "x".repeat(1_100_000) });
  check("SRV-11 a body over 1 MB is refused with 413", big.status === 413, big.status);
}

quiet.log(`security webhook: ${checks - failures}/${checks} checks passed`);
if (failures) {
  quiet.log(`(last logged lines)\n  ${logged.slice(-5).join("\n  ").slice(0, 2000)}`);
  process.exit(1);
}
