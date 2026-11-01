// The server side of the iPhone app (BUILD-PLAN §8.1-§8.5, §8.7; owner answers
// of 29 Oct 2026, and the 30 Oct 2026 decision that the app has the website's
// Free / Pro / Business plans, bought with Apple In-App Purchase): CORS for
// capacitor://localhost, the same plans, limits and team pools as the website
// (and the disclosed review / admin allowance), the refusal of web-only paths,
// the AI consent gate and /api/ai-consent, the app's result reports to
// /api/feedback, error reports from the app, the team log, and the billing
// guards around Stripe and Apple.
// Every check that an iOS request behaves a certain way has a twin that checks
// the same request WITHOUT the iOS header still behaves exactly as before.
//
// No network, no keys, no accounts: fetch and Netlify.env are stubbed (Supabase
// REST/Auth, OpenAI at a fake base URL, Resend, the Recovery background job).
//
//   node tests/run-ios-server.mjs
//
// The .mts functions are imported directly (Node 22.18+/23.6+ strips the types).
// On an older Node they are bundled with esbuild into .tmp/ instead.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── environment (fake values only; real variables of these names are dropped) ──
const SUPABASE = "https://stub-project.supabase.test";
const ENV_NAMES = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
  "ADMIN_EMAILS", "REVIEW_ACCOUNT_EMAILS", "OPENAI_API_KEY", "OPENAI_BASE_URL", "ANALYSIS_MODEL", "ANALYSIS_MODEL_MINI", "RESEND_API_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ERROR_REPORT_SALT", "FEEDBACK_ALERT_EMAIL", "ANALYSIS_REASONING_EFFORT", "ANALYSIS_MODEL_AUTO_REPLACE"];
for (const name of ENV_NAMES) delete process.env[name];
const ENV = {
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  ADMIN_EMAILS: "admin@example.com",
  REVIEW_ACCOUNT_EMAILS: "review@example.com",
  OPENAI_API_KEY: "stub-openai-key",
  OPENAI_BASE_URL: "https://openai.stub.test/v1",
  RESEND_API_KEY: "stub-resend"
};
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const logged = [];
console.error = (...args) => logged.push(args.map(String).join(" "));
console.warn = () => {};

async function load(entry, name) {
  const file = path.resolve(root, entry);
  try {
    return await import(pathToFileURL(file).href);
  } catch (error) {
    if (error?.code !== "ERR_UNKNOWN_FILE_EXTENSION") throw error;
  }
  const esbuild = await import("esbuild");
  mkdirSync(path.join(root, ".tmp"), { recursive: true });
  const out = path.join(root, ".tmp", name);
  await esbuild.build({ entryPoints: [file], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "warning", external: ["openai", "stripe"] });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

const fn = {};
for (const name of ["account-status.mjs", "analyze.mts", "recovery-mode.mts", "recovery-update.mts", "recovery-case.mts", "legal-acceptance.mts",
  "ai-consent.mjs", "feedback.mjs", "client-error.mjs", "team-activity.mts", "quickscan-usage.mjs",
  "create-checkout-session.mjs", "customer-portal.mjs", "byok-analyze.mts", "validate-openai-key.mts", "screenshot-preview.mjs", "feedback-admin.mjs",
  "business-account.mts", "business-activity.mts", "business-invite.mts", "business-invite-accept.mts", "business-invite-cancel.mts", "business-member-remove.mts",
  "public-stats.mjs", "recovery-checkin.mjs", "privacy-data.mts"]) {
  fn[name.replace(/\.m[jt]s$/, "")] = (await load(`netlify/functions/${name}`, `ios-${name}.test.mjs`)).default;
}
const cors = await import(pathToFileURL(path.join(root, "netlify/lib/cors.mjs")).href);
const tier = await import(pathToFileURL(path.join(root, "netlify/lib/app-tier.mjs")).href);
const consentLib = await import(pathToFileURL(path.join(root, "netlify/lib/ai-consent.mjs")).href);
const filters = await import(pathToFileURL(path.join(root, "netlify/lib/client-error-filters.mjs")).href);
const { CLIENT_UA } = await import(pathToFileURL(path.join(root, "netlify/lib/report-error.mjs")).href);
const { validateReport, resetClientErrorMemory } = await import(pathToFileURL(path.join(root, "netlify/functions/client-error.mjs")).href);
const { resetFeedbackMemory } = await import(pathToFileURL(path.join(root, "netlify/functions/feedback.mjs")).href);
const { DEFAULT_MINI_MODEL, DEFAULT_MODEL } = await import(pathToFileURL(path.join(root, "netlify/lib/ai-models.mjs")).href);
const entitlements = await import(pathToFileURL(path.join(root, "netlify/lib/entitlements.mjs")).href);

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  }
}

// ── accounts (by bearer token) ──
const id = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const CONFIRMED = "2026-10-01T00:00:00Z";
const USERS = {
  "t-free": { id: id(1), email: "free@example.com", email_confirmed_at: CONFIRMED },
  "t-pro": { id: id(2), email: "pro@example.com", email_confirmed_at: CONFIRMED },
  "t-owner": { id: id(3), email: "owner@example.com", email_confirmed_at: CONFIRMED },
  "t-member": { id: id(4), email: "member@example.com", email_confirmed_at: CONFIRMED },
  "t-admin": { id: id(5), email: "Admin@Example.com", email_confirmed_at: CONFIRMED },
  "t-review": { id: id(6), email: "review@example.com", email_confirmed_at: CONFIRMED },
  "t-review-unconfirmed": { id: id(7), email: "review@example.com", email_confirmed_at: null },
  "t-apple": { id: id(8), email: "apple@example.com", email_confirmed_at: CONFIRMED }, // Pro bought in the app
  "t-guest": { id: id(9), email: "guest@example.com", email_confirmed_at: CONFIRMED } // a free account whose Apple Pro has ended
};
const TEAM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const byId = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]));
const PROFILE = { [USERS["t-pro"].id]: { plan: "pro", subscription_status: "active", billing_interval: "month" } };
const TEAM_ROLE = { [USERS["t-owner"].id]: "owner", [USERS["t-member"].id]: "member" };
// Apple subscriptions (public.apple_subscriptions rows), by account. Dates are made fresh for every read.
const DAY = 86_400_000;
const appleRow = (productId, plan, seatTier, over = {}) => ({
  original_transaction_id: "2000000100000001", product_id: productId, plan, seat_tier: seatTier, billing_interval: productId.endsWith("yearly") ? "year" : "month",
  environment: "Production", expires_at: new Date(Date.now() + 20 * DAY).toISOString(), grace_expires_at: null, auto_renew: true, status: "active", revoked_at: null,
  business_account_id: null, ...over
});
const APPLE_ROWS = {
  [USERS["t-apple"].id]: () => [appleRow("app.cybernetai.pro.monthly", "pro", null)],
  [USERS["t-owner"].id]: () => [appleRow("app.cybernetai.business5.monthly", "business", 5, { original_transaction_id: "2000000100000002", business_account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })],
  [USERS["t-guest"].id]: () => [appleRow("app.cybernetai.pro.monthly", "pro", null, { expires_at: new Date(Date.now() - 3 * DAY).toISOString(), status: "expired", auto_renew: false })]
};
const TEAM_BILLING = "apple"; // the stubbed team is billed by Apple (its owner t-owner has the Business row above)

// The plan an account's own counters would report: Pro from Stripe, or an Apple Pro row that is paid up.
const planFor = (uid) => (PROFILE[uid]?.plan === "pro" || (APPLE_ROWS[uid]?.() || []).some((row) => row.plan === "pro" && new Date(row.expires_at) > Date.now()) ? "pro" : "free");

// ── the stubbed network ──
let state;
let calls;
function reset(over = {}) {
  state = {
    consent: true, // has_ai_consent answer, or a number = HTTP status to fail with
    allowApp: true, // consume_*_app answer
    appleTable404: false, // the apple_subscriptions table is not there yet (migration not applied)
    existingTeam: false, // business_accounts lookups find the stubbed team
    teamBilling: null, // { billing_source, subscription_status } the guard read returns
    billingColumn404: false, // the billing_source column is not there yet
    memberCount: 0, // active members of the stubbed team, for the invite seat count
    allowPlan: true, // consume_analysis / consume_recovery_* / consume_quickscan answer (the plan's own counters)
    proProfiles: [], // profiles?plan=eq.pro list for recovery-checkin
    appleProRows: [], // apple_subscriptions?plan=eq.pro list for recovery-checkin
    appleProFail: 0, // HTTP status to fail that list with
    staleCases: [], // recovery_cases rows for recovery-checkin
    statsFail: false,
    cooldown: 0, // consume_recovery_update_app cooldown_seconds_remaining
    feedbackRows: [],
    mails: [],
    ...over
  };
  calls = [];
  resetFeedbackMemory();
  resetClientErrorMemory();
}
const rpcCalls = (name) => calls.filter((c) => c.host === "supabase" && c.path === `/rest/v1/rpc/${name}`);
const restCalls = (method, prefix) => calls.filter((c) => c.host === "supabase" && c.method === method && c.path.startsWith(prefix));
const RPC_NAMES = (c) => c.path.replace("/rest/v1/rpc/", "");

function json(data, status = 200, headers = {}) {
  return new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  let body;
  try { body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }

  if (url.hostname === "openai.stub.test") {
    calls.push({ host: "openai", method, path: url.pathname, body });
    const analysis = { verdict: "suspicious", score: 55, confidence: 72, threatType: "Phishing", summary: "Stub explanation.", evidence: ["A stub reason."], counterEvidence: [], limitations: [], actions: ["Do not reply."] };
    return json({ id: "resp_stub", object: "response", created_at: 1, status: "completed", model: body?.model, output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(analysis), annotations: [] }] }] });
  }
  if (url.hostname === "api.resend.com") {
    state.mails.push(body);
    calls.push({ host: "resend", method, path: url.pathname, body });
    return json({ id: `mail-${state.mails.length}` });
  }
  if (url.pathname === "/api/recovery-plan-background") {
    calls.push({ host: "background", method, path: url.pathname, body });
    return json({ accepted: true }, 202);
  }
  if (url.origin !== SUPABASE) throw new Error(`unexpected fetch ${url}`);

  const pathQ = decodeURIComponent(url.pathname + url.search);
  const call = { host: "supabase", method, path: pathQ, body, auth: headers.get("authorization") };
  calls.push(call);

  if (url.pathname === "/auth/v1/user") {
    const user = USERS[(call.auth || "").replace(/^Bearer /, "")];
    return user ? json(user) : json({ msg: "invalid JWT" }, 401);
  }
  if (call.auth !== "Bearer stub-service") return json({ message: "service key required" }, 401);
  const rpc = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.slice("/rest/v1/rpc/".length) : "";
  const uid = body?.p_user_id;

  switch (rpc) {
    case "has_ai_consent":
      if (typeof state.consent === "number") return json({ message: "down" }, state.consent);
      return json(state.consent === true);
    case "grant_ai_consent":
      return json([{ consent_version: body.p_version, granted_at: "2026-11-01T10:00:00Z" }]);
    case "withdraw_ai_consent":
      return json(1);
    case "check_protect_rate_limit":
    case "consume_api_quota":
      if (rpc === "consume_api_quota" && state.quotaDenied && String(body?.p_key || "").startsWith(state.quotaDenied)) return json({ allowed: false, used: body.p_max_requests + 1, reset_at: "2026-11-01T11:00:00Z" });
      return json(rpc === "consume_api_quota" ? { allowed: true, used: 1, limit: 100 } : true);
    case "consume_analysis_app":
      return json([{ allowed: state.allowApp, used: state.allowApp ? 1 : body.p_limit, daily_limit: body.p_limit, plan: "app" }]);
    case "consume_analysis": {
      const plan = planFor(uid);
      const limit = plan === "pro" ? 15 : 3;
      return json([{ allowed: state.allowPlan, used: state.allowPlan ? 1 : limit, daily_limit: limit, plan }]);
    }
    case "consume_analysis_business":
      return json([{ allowed: state.allowPlan, used: state.allowPlan ? 1 : 50, daily_limit: 50, plan: "business" }]);
    case "consume_recovery_case_app":
      return json([{ allowed: state.allowApp, used: state.allowApp ? 1 : body.p_limit, daily_limit: body.p_limit, plan: "app", reset_at: "2026-10-30T16:00:00+00:00" }]);
    case "consume_recovery_case": {
      const plan = planFor(uid);
      const limit = plan === "pro" ? 3 : 1;
      return json([{ allowed: state.allowPlan, used: state.allowPlan ? 1 : limit, daily_limit: limit, plan, reset_at: "2026-10-30T16:00:00+00:00" }]);
    }
    case "consume_recovery_case_business":
      return json([{ allowed: state.allowPlan, used: state.allowPlan ? 1 : 20, daily_limit: 20, plan: "business", reset_at: "2026-10-30T16:00:00+00:00" }]);
    case "consume_recovery_update_app":
      return json([{ allowed: state.allowApp && !state.cooldown, used: 1, daily_limit: body.p_limit, plan: "app", reset_at: "2026-10-30T16:00:00+00:00", cooldown_seconds_remaining: state.cooldown }]);
    case "consume_recovery_update":
    case "consume_recovery_update_business": {
      const plan = rpc.endsWith("business") ? "business" : planFor(uid);
      const limit = plan === "free" ? 1 : 999;
      return json([{ allowed: state.allowPlan && !state.cooldown, used: 1, daily_limit: limit, plan, reset_at: null, cooldown_seconds_remaining: state.cooldown }]);
    }
    case "consume_quickscan": {
      const plan = planFor(uid);
      return json([{ allowed: state.allowPlan, used: state.allowPlan ? 1 : 5, daily_limit: plan === "pro" ? 100000 : 5, plan }]);
    }
    case "get_platform_stats":
      return state.statsFail ? json({ message: "down" }, 500) : json([{ total_scans: 1200, threats_found: 340, recovery_cases: 15 }]);
    case "recovery_window_start":
      return json("2026-10-29T16:00:00+00:00");
    case "refund_analysis":
    case "refund_analysis_business":
      return new Response(null, { status: 204 });
    default:
      break;
  }
  if (rpc) return json({ message: `unexpected rpc ${rpc}` }, 404);

  const userIn = (/user_id=eq\.([0-9a-f-]{36})/.exec(pathQ) || [])[1] || (/[?&]id=eq\.([0-9a-f-]{36})/.exec(pathQ) || [])[1];
  if (url.pathname === "/rest/v1/business_members" && method === "GET" && pathQ.includes("business_account_id=eq.") && !userIn) {
    return json(Array.from({ length: state.memberCount }, (_, index) => ({ id: index })));
  }
  if (url.pathname === "/rest/v1/business_accounts" && method === "GET") {
    if (pathQ.includes("select=billing_source")) return state.billingColumn404 ? json({ code: "42703", message: "column business_accounts.billing_source does not exist" }, 400) : json(state.teamBilling ? [state.teamBilling] : []);
    return json(state.existingTeam ? [{ id: TEAM }] : []);
  }
  if (url.pathname === "/rest/v1/business_members" && method === "GET") {
    const role = TEAM_ROLE[userIn];
    return json(role ? [{ role, business_accounts: { id: TEAM, seat_tier: 5, daily_pool_limit: 50, recovery_pool_limit: 20, subscription_status: "active", billing_source: TEAM_BILLING } }] : []);
  }
  if (url.pathname === "/rest/v1/apple_subscriptions" && method === "GET") {
    if (state.appleTable404) return json({ code: "PGRST205", message: "Could not find the table 'public.apple_subscriptions'" }, 404);
    if (pathQ.includes("plan=eq.pro") && pathQ.includes("select=user_id")) return state.appleProFail ? json({ message: "down" }, state.appleProFail) : json(state.appleProRows);
    return json(APPLE_ROWS[userIn] ? APPLE_ROWS[userIn]() : []);
  }
  if (url.pathname === "/rest/v1/business_recovery_usage" && method === "GET") return json([{ cases_created: 4 }]);
  if (url.pathname === "/rest/v1/profiles" && pathQ.includes("plan=eq.pro") && method === "GET") return json(state.proProfiles);
  if (url.pathname === "/rest/v1/recovery_cases" && pathQ.includes("last_checkin_sent_at") && method === "GET") return json(state.staleCases);
  if (url.pathname.startsWith("/auth/v1/admin/users/") && method === "GET") return json({ email: "case-owner@example.com", user_metadata: {} });
  if (url.pathname === "/rest/v1/profiles" && method === "GET") {
    const user = byId[userIn];
    return json(user ? [{ id: user.id, full_name: "Test", plan: "free", subscription_status: "inactive", billing_interval: "", ...(PROFILE[user.id] || {}) }] : []);
  }
  if (url.pathname === "/rest/v1/daily_usage" && method === "GET") return json([{ analysis_count: 2 }]);
  if (url.pathname === "/rest/v1/recovery_usage" && method === "GET") return json([{ cases_created: 1, updates_used: 0, last_update_at: null }]);
  if (url.pathname === "/rest/v1/business_daily_usage" && method === "GET") return json([{ analysis_count: 9 }]);
  if (url.pathname === "/rest/v1/scan_history" && method === "POST") return json([{ id: 77 }], 201);
  if (url.pathname === "/rest/v1/scan_history" && method === "GET") return json([{ id: 77, analysis_type: "image", verdict: "suspicious", score: 55, threat_type: "Phishing", summary: "Stub explanation.", created_at: "2026-10-29T10:00:00Z" }], 200, { "Content-Range": "0-0/1" });
  if (url.pathname === "/rest/v1/scan_history" && method === "PATCH") return new Response(null, { status: 204 });
  if (url.pathname === "/rest/v1/recovery_cases" && method === "POST") return json([{ id: CASE }], 201);
  if (url.pathname === "/rest/v1/recovery_cases" && method === "GET") {
    const owner = Object.values(USERS).find((u) => pathQ.includes(u.id))?.id;
    if (pathQ.includes(`id=eq.${CASE}`)) return json([{ id: CASE, owner_user_id: state.caseOwner, current_version: 1, risk_level: "medium", region: "UAE", status: "active" }]);
    return json(owner ? [{ id: CASE }] : []);
  }
  if (url.pathname === "/rest/v1/recovery_versions" && method === "GET") return json([{ version_number: 1, structured_plan: { summary: "Plan", riskLevel: "medium", urgency: "soon", immediateActions: [], timeline: { first10Minutes: [], firstHour: [], first24Hours: [], next7Days: [] } } }]);
  if (url.pathname === "/rest/v1/recovery_tasks" && method === "GET") return json([]);
  if (url.pathname === "/rest/v1/feedback" && method === "POST") {
    const row = { id: `00000000-0000-4000-8000-${String(state.feedbackRows.length + 1).padStart(12, "0")}`, created_at: "2026-10-29T10:00:00Z", ...body };
    state.feedbackRows.push(row);
    return json([row], 201);
  }
  if (["POST", "PATCH", "DELETE"].includes(method)) return new Response(null, { status: 201 });
  return json([]);
};

const SITE = "https://cybernetai.app";
const APP = "capacitor://localhost";
function req(pathname, { method = "POST", token = "", body, ios = false, origin = "", headers = {} } = {}) {
  const h = { "Content-Type": "application/json", "user-agent": ios ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CyberNetAI-iOS/1.0.0" : "Mozilla/5.0 run-ios-server", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (ios) h["X-CyberNet-Platform"] = "ios";
  if (origin) h.Origin = origin;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text) h["Content-Length"] = String(Buffer.byteLength(text));
  return new Request(`${SITE}${pathname}`, { method, headers: h, body: ["GET", "HEAD", "OPTIONS"].includes(method) ? undefined : text });
}
const context = { ip: "203.0.113.9", site: { name: "cybernet-ai" }, deploy: { id: "deploy1" }, requestId: "req-1", waitUntil: undefined };
let connection = 0;
async function run(handler, request) {
  const response = await handler(request, { ...context, ip: `203.0.${Math.floor(++connection / 250) % 250}.${(connection % 250) + 1}` });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
const PLAN_WORDS = /\b(pro|free|team|business|upgrade|plan|premium|subscription|subscribe|pricing)\b/i;
const corsOk = (r) => r.headers.get("access-control-allow-origin") === APP && r.headers.get("vary") === "Origin";
const noCors = (r) => r.headers.get("access-control-allow-origin") === null;

// ══════════ 1. lib/cors.mjs ══════════
{
  const h = (headers) => new Request(`${SITE}/api/x`, { headers });
  check("isIOS: the platform header", cors.isIOS(h({ "X-CyberNet-Platform": "ios" })) === true);
  check("isIOS: header in any case", cors.isIOS(h({ "X-CyberNet-Platform": " IOS " })) === true);
  check("isIOS: the app's origin alone", cors.isIOS(h({ Origin: APP })) === true);
  check("isIOS: the website", cors.isIOS(h({})) === false && cors.isIOS(h({ Origin: SITE })) === false && cors.isIOS(h({ "X-CyberNet-Platform": "android" })) === false);
  check("isIOS: a look-alike origin is not the app", cors.isIOS(h({ Origin: "capacitor://localhost.evil" })) === false && cors.isIOS(h({ Origin: "https://localhost" })) === false);

  let ran = 0;
  const wrapped = cors.withCors(async () => { ran++; return new Response("ok", { status: 200, headers: { "X-Own": "1" } }); });
  let r = await run(wrapped, new Request(`${SITE}/api/x`, { method: "OPTIONS", headers: { Origin: APP, "Access-Control-Request-Method": "POST" } }));
  check("withCors: app preflight 204 without running the function", r.status === 204 && corsOk(r) && ran === 0 && /Authorization/.test(r.headers.get("access-control-allow-headers")) && /X-CyberNet-App-Version/.test(r.headers.get("access-control-allow-headers")) && r.headers.get("access-control-max-age") === "600", [...r.headers]);
  r = await run(wrapped, new Request(`${SITE}/api/x`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } }));
  check("withCors: other origins' OPTIONS reach the function as before", ran === 1 && noCors(r) && r.status === 200);
  r = await run(wrapped, new Request(`${SITE}/api/x`, { headers: { Origin: APP } }));
  check("withCors: app response keeps status, body and own headers, plus CORS", r.status === 200 && r.data === "ok" && r.headers.get("x-own") === "1" && corsOk(r));
  r = await run(wrapped, new Request(`${SITE}/api/x`));
  check("withCors: website response unchanged", r.status === 200 && noCors(r) && r.headers.get("vary") === null);
  const throwing = cors.withCors(async () => { throw new Error("boom"); });
  r = await run(throwing, new Request(`${SITE}/api/x`, { headers: { Origin: APP } }));
  check("withCors: an app request gets a readable 500 on a crash", r.status === 500 && corsOk(r) && /Something went wrong/.test(r.data.error) && !/boom/.test(r.data.error), r.data);
  let rethrown = false;
  try { await throwing(new Request(`${SITE}/api/x`), context); } catch { rethrown = true; }
  check("withCors: a website crash is rethrown as before", rethrown);

  let reached = 0;
  const web = cors.webOnly(async () => { reached++; return new Response("web", { status: 200 }); });
  r = await run(web, new Request(`${SITE}/api/x`, { method: "POST", headers: { "X-CyberNet-Platform": "ios" } }));
  check("webOnly: 403 NOT_AVAILABLE_IN_APP for the app", r.status === 403 && r.data.code === "NOT_AVAILABLE_IN_APP" && reached === 0 && !PLAN_WORDS.test(r.data.error), r.data);
  r = await run(web, new Request(`${SITE}/api/x`, { method: "POST" }));
  check("webOnly: the website goes through", r.status === 200 && reached === 1);
}

// ══════════ 2. web-only functions refuse the app, untouched for the website ══════════
// Stripe checkout and billing portal, BYOK, link previews, the admin inbox and accepting a Business
// invite are not in the app (purchases are Apple In-App Purchase; App Review 3.1.1 and 2.5.19).
for (const name of ["create-checkout-session", "customer-portal", "byok-analyze", "validate-openai-key", "screenshot-preview", "feedback-admin", "business-invite-accept"]) {
  for (const method of ["POST", "GET"]) {
    reset();
    let r = await run(fn[name], req(`/api/${name}`, { method, token: "t-pro", ios: true, body: method === "POST" ? {} : undefined }));
    check(`${name} ${method}: 403 for the app, nothing called`, r.status === 403 && r.data.code === "NOT_AVAILABLE_IN_APP" && calls.length === 0, { status: r.status, data: r.data, calls: calls.length });
    reset();
    r = await run(fn[name], req(`/api/${name}`, { method, token: "t-pro", origin: APP, body: method === "POST" ? {} : undefined }));
    check(`${name} ${method}: 403 for the app's origin without the header`, r.status === 403 && r.data.code === "NOT_AVAILABLE_IN_APP", r.status);
    reset();
    r = await run(fn[name], req(`/api/${name}`, { method, token: "t-pro", body: method === "POST" ? {} : undefined }));
    check(`${name} ${method}: the website still reaches the function`, r.data?.code !== "NOT_AVAILABLE_IN_APP", { status: r.status, data: r.data });
  }
}
// Team management and Quick Scan counting are in the app now: they answer the app (with CORS) and the website as before.
for (const name of ["quickscan-usage", "business-account", "business-activity", "business-invite", "business-invite-cancel", "business-member-remove"]) {
  for (const method of ["POST", "GET"]) {
    reset();
    let r = await run(fn[name], req(`/api/${name}`, { method, token: "t-owner", ios: true, origin: APP, body: method === "POST" ? {} : undefined }));
    check(`${name} ${method}: the app reaches the function (no 403) and gets CORS`, r.data?.code !== "NOT_AVAILABLE_IN_APP" && r.status !== 403 && corsOk(r), { status: r.status, data: r.data });
    reset();
    r = await run(fn[name], req(`/api/${name}`, { method, token: "t-owner", body: method === "POST" ? {} : undefined }));
    check(`${name} ${method}: the website reaches the function and gets no CORS headers`, r.data?.code !== "NOT_AVAILABLE_IN_APP" && noCors(r), { status: r.status, data: r.data });
  }
  reset();
  const pre = await run(fn[name], new Request(`${SITE}/api/${name}`, { method: "OPTIONS", headers: { Origin: APP } }));
  check(`${name}: the app's preflight is 204, nothing called`, pre.status === 204 && corsOk(pre) && calls.length === 0, pre.status);
}
{
  // Quick Scans: Free's 5 a day in the app as on the website; the admin bypass is the website's.
  reset();
  let r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-free", body: {} }));
  check("quickscan-usage: website path unchanged (consume_quickscan)", r.status === 200 && rpcCalls("consume_quickscan").length === 1, r);
  reset();
  r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-free", ios: true, origin: APP, body: {} }));
  check("quickscan-usage app free: consume_quickscan, Free's limit of 5", r.status === 200 && rpcCalls("consume_quickscan")[0]?.body.p_user_id === USERS["t-free"].id && r.data.limit === 5 && r.data.plan === "free" && corsOk(r), r);
  reset();
  r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-apple", ios: true, body: {} }));
  check("quickscan-usage app, Pro bought in the app: unlimited", r.status === 200 && r.data.limit === 100000 && r.data.plan === "pro", r.data);
  reset({ allowPlan: false });
  r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-free", ios: true, body: {} }));
  check("quickscan-usage app over the limit: 429 daily_limit_reached with the website's message", r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === "Daily Quick Scan limit reached. Upgrade to Pro for unlimited scans." && r.data.plan === "free", r.data);
  reset();
  r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-member", ios: true, body: {} }));
  check("quickscan-usage app team member: never blocked (as on the website)", r.status === 200 && r.data.plan === "business" && r.data.limit === 100000 && !rpcCalls("consume_quickscan").length, r.data);
  reset();
  r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-admin", ios: true, body: {} }));
  check("quickscan-usage app admin: no bypass in the app, counted like anyone", r.status === 200 && rpcCalls("consume_quickscan").length === 1 && r.data.limit === 5, r.data);
  reset();
  r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-admin", body: {} }));
  check("quickscan-usage website admin: the bypass as before", r.status === 200 && r.data.limit === 999999 && !rpcCalls("consume_quickscan").length, r.data);
}

// ══════════ 3. analyze: consent, plans, history, team log ══════════
// In the app an account has the website's plan: Free 3, Pro 15 (Stripe or Apple), a Business team's shared pool.
// Only the disclosed review / admin accounts get raised counts (consume_analysis_app) instead.
const IMAGE = { type: "image", content: "", imageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" };
const TEXT = { type: "text", content: "Hi, please confirm your account details at http://bit.ly/x1 soon" }; // the rules call this suspicious: ambiguous, so the model depends on the plan
const ANALYZE_APP = {
  // token: [rpc that reserves, expected plan in usage, expected limit, history saved, model]
  "t-free": ["consume_analysis", "free", 3, false, DEFAULT_MINI_MODEL],
  "t-pro": ["consume_analysis", "pro", 15, true, DEFAULT_MODEL],
  "t-apple": ["consume_analysis", "pro", 15, true, DEFAULT_MODEL],
  "t-guest": ["consume_analysis", "free", 3, false, DEFAULT_MINI_MODEL],
  "t-owner": ["consume_analysis_business", "business", 50, true, DEFAULT_MODEL],
  "t-member": ["consume_analysis_business", "business", 50, true, DEFAULT_MODEL],
  "t-admin": ["consume_analysis_app", "app", 50, false, DEFAULT_MINI_MODEL],
  "t-review": ["consume_analysis_app", "app", 50, false, DEFAULT_MINI_MODEL],
  "t-review-unconfirmed": ["consume_analysis", "free", 3, false, DEFAULT_MINI_MODEL]
};
for (const [token, [rpc, plan, limit, history, model]] of Object.entries(ANALYZE_APP)) {
  reset();
  const r = await run(fn.analyze, req("/api/analyze", { token, ios: true, origin: APP, body: IMAGE }));
  const names = calls.filter((c) => c.host === "supabase" && c.path.startsWith("/rest/v1/rpc/")).map(RPC_NAMES);
  const reserve = rpcCalls(rpc);
  check(`analyze app ${token}: 200 with plan "${plan}" and CORS`, r.status === 200 && r.data.usage?.plan === plan && corsOk(r), { status: r.status, usage: r.data?.usage, err: r.data?.error });
  const argOk = rpc === "consume_analysis_app" ? reserve[0]?.body.p_limit === limit && reserve[0]?.body.p_user_id === USERS[token].id
    : rpc === "consume_analysis_business" ? reserve[0]?.body.p_business_account_id === TEAM : reserve[0]?.body.p_user_id === USERS[token].id;
  check(`analyze app ${token}: consent checked first, then ${rpc}`, reserve.length === 1 && argOk && names.indexOf("has_ai_consent") >= 0 && names.indexOf("has_ai_consent") < names.indexOf(rpc), names);
  const others = ["consume_analysis", "consume_analysis_business", "consume_analysis_app"].filter((n) => n !== rpc);
  check(`analyze app ${token}: no other counter is touched`, others.every((n) => !names.includes(n)), names);
  const ai = calls.filter((c) => c.host === "openai");
  check(`analyze app ${token}: the AI call is stored nowhere (store:false)`, ai.length === 1 && ai[0].body.store === false, ai.map((c) => c.body?.store));
  // An ambiguous message is where the plan shows: Free and the allowance accounts get the mini model, Pro and Business the full one.
  reset();
  await run(fn.analyze, req("/api/analyze", { token, ios: true, origin: APP, body: TEXT }));
  const routed = calls.filter((c) => c.host === "openai");
  check(`analyze app ${token}: an ambiguous message is routed by plan (${model === DEFAULT_MINI_MODEL ? "the mini model" : "the full model"})`, routed.length === 1 && routed[0].body.model === model, routed.map((c) => c.body?.model));
  reset();
  await run(fn.analyze, req("/api/analyze", { token, ios: true, origin: APP, body: IMAGE }));
  check(`analyze app ${token}: limit ${limit} reported`, r.data.usage?.limit === limit, r.data.usage);
  const saved = restCalls("POST", "/rest/v1/scan_history");
  if (history) {
    check(`analyze app ${token}: the AI explanation is saved to history (Pro / Business, as on the website)`, saved.length === 1 && Array.isArray(r.data.history) && r.data.history.length === 1, { saved: saved.length, history: r.data.history });
  } else {
    check(`analyze app ${token}: no saved history (a Pro / Business feature, as on the website)`, saved.length === 0 && Array.isArray(r.data.history) && r.data.history.length === 0, { saved: saved.length, history: r.data.history });
  }
  if (token === "t-member") {
    check("analyze app member: the result still reaches the team owner's log", saved[0]?.body?.business_account_id === TEAM && saved[0]?.body?.analysis?.aiUsed === true && "submitted_content" in (saved[0]?.body || {}) && r.data.teamLogId === 77, saved[0]?.body);
  } else if (token === "t-owner") {
    check("analyze app owner: own activity carries no submitted content", saved[0]?.body?.business_account_id === TEAM && !("submitted_content" in (saved[0]?.body || {})), saved[0]?.body);
  } else if (history) {
    check(`analyze app ${token}: no team link`, saved[0] && !("business_account_id" in saved[0].body), saved[0]?.body);
  }
}
// The same requests from the website: exactly as before.
{
  const web = async (token) => { reset(); const r = await run(fn.analyze, req("/api/analyze", { token, body: IMAGE })); return { r, names: calls.filter((c) => c.host === "supabase" && c.path.startsWith("/rest/v1/rpc/")).map(RPC_NAMES) }; };
  let { r, names } = await web("t-free");
  check("analyze web free: consume_analysis, no consent check, no CORS", r.status === 200 && names.includes("consume_analysis") && !names.includes("has_ai_consent") && !names.some((n) => n.endsWith("_app")) && noCors(r) && r.data.usage.plan === "free", names);
  check("analyze web free: no history (a Pro feature on the web)", restCalls("POST", "/rest/v1/scan_history").length === 0);
  ({ r, names } = await web("t-pro"));
  check("analyze web pro: consume_analysis with Pro's 15, history saved", r.data.usage.limit === 15 && r.data.usage.plan === "pro" && restCalls("POST", "/rest/v1/scan_history").length === 1, r.data.usage);
  ({ r, names } = await web("t-apple"));
  check("analyze web, Pro bought in the app: the same Pro path, history saved (one plan on web and app)", r.data.usage.limit === 15 && r.data.usage.plan === "pro" && names.includes("consume_analysis") && restCalls("POST", "/rest/v1/scan_history").length === 1, r.data.usage);
  ({ r, names } = await web("t-member"));
  check("analyze web member: the team pool", names.includes("consume_analysis_business") && !names.includes("consume_analysis") && r.data.usage.plan === "business", names);
  ({ r, names } = await web("t-admin"));
  check("analyze web admin: the bypass, nothing reserved", r.status === 200 && !names.some((n) => n.startsWith("consume_")) && r.data.usage.limit === 999999, names);
  ({ r, names } = await web("t-review"));
  check("analyze web review account: an ordinary free account on the web", names.includes("consume_analysis") && r.data.usage.limit === 3, names);
}
// Consent missing, check failing, investigation, the limit messages, the app's origin without the header.
{
  reset({ consent: false });
  let r = await run(fn.analyze, req("/api/analyze", { token: "t-free", ios: true, body: IMAGE }));
  check("analyze app without consent: 428 AI_CONSENT_REQUIRED with the version", r.status === 428 && r.data.code === "AI_CONSENT_REQUIRED" && r.data.version === consentLib.AI_CONSENT_VERSION && r.data.provider === "openai", r.data);
  check("analyze app without consent: nothing reserved, nothing sent to OpenAI, nothing saved", !calls.some((c) => c.path?.includes("consume_")) && !calls.some((c) => c.host === "openai") && restCalls("POST", "/rest/v1/scan_history").length === 0, calls.map((c) => c.path));
  reset({ consent: 500 });
  r = await run(fn.analyze, req("/api/analyze", { token: "t-free", ios: true, body: IMAGE }));
  check("analyze app, consent check down: 503 and nothing sent (fail closed)", r.status === 503 && r.data.code === "AI_CONSENT_CHECK_FAILED" && !calls.some((c) => c.host === "openai") && !calls.some((c) => c.path?.includes("consume_")), r.data);
  reset({ consent: false });
  r = await run(fn.analyze, req("/api/analyze", { token: "t-free", origin: APP, body: IMAGE }));
  check("analyze from the app's origin without the header: still gated", r.status === 428 && corsOk(r), r.status);
  reset({ consent: false });
  r = await run(fn.analyze, req("/api/analyze", { token: "t-free", body: IMAGE }));
  check("analyze web without any consent row: unaffected", r.status === 200 && !rpcCalls("has_ai_consent").length, r.status);
  reset();
  r = await run(fn.analyze, req("/api/analyze", { token: "t-pro", ios: true, body: { mode: "investigation", caseData: { title: "x", context: "y", artifacts: [{ type: "text", content: "hello" }] } } }));
  check("analyze app investigation: 403, nothing called", r.status === 403 && r.data.code === "NOT_AVAILABLE_IN_APP" && calls.length === 0 && !PLAN_WORDS.test(r.data.error), r.data);

  // At the limit, the app sees the website's message (so it can offer a plan); only the allowance accounts get the neutral one.
  for (const [token, message, planInUsage] of [["t-free", "Daily Free limit reached.", "free"], ["t-pro", "Daily Pro limit reached.", "pro"], ["t-apple", "Daily Pro limit reached.", "pro"], ["t-member", "Daily team limit reached.", "business"]]) {
    reset({ allowPlan: false });
    r = await run(fn.analyze, req("/api/analyze", { token, ios: true, body: IMAGE }));
    check(`analyze app limit (${token}): 429 "${message}" with code daily_limit_reached`, r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === message && r.data.usage.plan === planInUsage, r.data);
    check(`analyze app limit (${token}): nothing sent to OpenAI`, !calls.some((c) => c.host === "openai"));
  }
  reset({ allowApp: false });
  r = await run(fn.analyze, req("/api/analyze", { token: "t-review", ios: true, body: IMAGE }));
  check("analyze app limit (review allowance): the neutral message, plan app", r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === tier.APP_MESSAGES.aiLimit && !PLAN_WORDS.test(r.data.error) && r.data.usage.plan === "app", r.data);
  reset({ allowPlan: false });
  r = await run(fn.analyze, req("/api/analyze", { token: "t-free", body: IMAGE }));
  check("analyze web limit: the same message as the app gets", r.status === 429 && r.data.error === "Daily Free limit reached.", r.data);

  reset();
  r = await run(fn.analyze, new Request(`${SITE}/api/analyze`, { method: "OPTIONS", headers: { Origin: APP } }), context);
  check("analyze preflight: 204, nothing called", r.status === 204 && corsOk(r) && calls.length === 0);

  // No AI result: the counter that was charged is refunded (the team pool for a member, otherwise the person's own).
  ENV.OPENAI_API_KEY = "";
  reset();
  r = await run(fn.analyze, req("/api/analyze", { token: "t-member", ios: true, body: IMAGE }));
  check("analyze app member, no AI answer: refund_analysis_business (the team pool, as on the website)", r.status === 200 && rpcCalls("refund_analysis_business").length === 1 && !rpcCalls("refund_analysis").length && r.data.usage.used === 0, calls.map((c) => c.path));
  reset();
  r = await run(fn.analyze, req("/api/analyze", { token: "t-free", ios: true, body: IMAGE }));
  check("analyze app free, no AI answer: refund_analysis (own counter)", r.status === 200 && rpcCalls("refund_analysis").length === 1 && !rpcCalls("refund_analysis_business").length && r.data.usage.used === 0, calls.map((c) => c.path));
  reset();
  r = await run(fn.analyze, req("/api/analyze", { token: "t-review", ios: true, body: IMAGE }));
  check("analyze app review account, no AI answer: refund_analysis (the allowance counts on the person's own counter)", r.status === 200 && rpcCalls("refund_analysis").length === 1 && !rpcCalls("refund_analysis_business").length, calls.map((c) => c.path));
  ENV.OPENAI_API_KEY = "stub-openai-key";
}

// ══════════ 4. recovery-mode and recovery-update ══════════
const INCIDENT = { description: "Someone logged into my email and changed the recovery phone number.", quickAnswers: {}, region: "UAE" };
const CASE_APP = {
  // token: [rpc that reserves, plan in usage, limit]
  "t-free": ["consume_recovery_case", "free", 1],
  "t-pro": ["consume_recovery_case", "pro", 3],
  "t-apple": ["consume_recovery_case", "pro", 3],
  "t-member": ["consume_recovery_case_business", "business", 20],
  "t-owner": ["consume_recovery_case_business", "business", 20],
  "t-admin": ["consume_recovery_case_app", "app", 10],
  "t-review": ["consume_recovery_case_app", "app", 10]
};
for (const [token, [rpc, plan, limit]] of Object.entries(CASE_APP)) {
  reset();
  const r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token, ios: true, origin: APP, body: INCIDENT }));
  const names = calls.filter((c) => c.host === "supabase" && c.path.startsWith("/rest/v1/rpc/")).map(RPC_NAMES);
  const reserve = rpcCalls(rpc)[0]?.body;
  check(`recovery-mode app ${token}: 200, consent then ${rpc}`, r.status === 200 && corsOk(r) && r.data.usage?.plan === plan && r.data.usage?.limit === limit && reserve && names.indexOf("has_ai_consent") >= 0 && names.indexOf("has_ai_consent") < names.indexOf(rpc), { status: r.status, names, usage: r.data?.usage, err: r.data?.error });
  if (rpc === "consume_recovery_case_app") check(`recovery-mode app ${token}: the allowance count (${limit}) is passed`, reserve.p_limit === limit, reserve);
  const others = ["consume_recovery_case", "consume_recovery_case_business", "consume_recovery_case_app"].filter((n) => n !== rpc);
  check(`recovery-mode app ${token}: no other counter is touched`, others.every((n) => !names.includes(n)), names);
  const caseRow = restCalls("POST", "/rest/v1/recovery_cases")[0]?.body;
  if (token === "t-member") check("recovery-mode app member: the case still reaches the owner's log", caseRow?.business_account_id === TEAM && typeof caseRow?.submitted_description === "string", caseRow);
  else if (token === "t-owner") check("recovery-mode app owner: the case is linked to the team without the description", caseRow?.business_account_id === TEAM && !caseRow?.submitted_description, caseRow);
  else check(`recovery-mode app ${token}: no team link`, caseRow && !("business_account_id" in caseRow), caseRow);
}
{
  reset({ consent: false });
  let r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-free", ios: true, body: INCIDENT }));
  check("recovery-mode app without consent: 428, nothing reserved, no case, no background job", r.status === 428 && r.data.code === "AI_CONSENT_REQUIRED" && !calls.some((c) => c.path?.includes("consume_")) && !restCalls("POST", "/rest/v1/recovery_cases").length && !calls.some((c) => c.host === "background"), r.data);
  for (const [token, message] of [["t-free", "Daily Free Recovery case limit reached."], ["t-apple", "Daily Pro Recovery case limit reached."], ["t-member", "Daily team Recovery case limit reached."]]) {
    reset({ allowPlan: false });
    r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token, ios: true, body: INCIDENT }));
    check(`recovery-mode app limit (${token}): the website's message and code`, r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === message, r.data);
  }
  reset({ allowApp: false });
  r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-review", ios: true, body: INCIDENT }));
  check("recovery-mode app limit (review allowance, 10): the neutral plural message", r.status === 429 && r.data.error === tier.APP_MESSAGES.recoveryCasesLimit && !PLAN_WORDS.test(r.data.error), r.data);
  for (const [token, rpc] of [["t-free", "consume_recovery_case"], ["t-member", "consume_recovery_case_business"]]) {
    reset();
    r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token, body: INCIDENT }));
    check(`recovery-mode web ${token}: ${rpc}, no consent check, no CORS`, r.status === 200 && rpcCalls(rpc).length === 1 && !rpcCalls("has_ai_consent").length && noCors(r) && !calls.some((c) => c.path?.endsWith("_app")), calls.map((c) => c.path));
  }
  reset();
  r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-admin", body: INCIDENT }));
  check("recovery-mode web admin: the bypass as before", r.status === 200 && !calls.some((c) => c.path?.includes("consume_")), calls.map((c) => c.path));
  reset();
  r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-admin", ios: true, body: INCIDENT }));
  check("recovery-mode app admin: no bypass, the allowance count instead", r.status === 200 && rpcCalls("consume_recovery_case_app").length === 1, calls.map((c) => c.path));
}
const UPDATE = { caseId: CASE, updateText: "I changed my password and turned on two-factor." };
const UPDATE_APP = {
  // token: [rpc, plan, limit, p_limit, cooldown seconds for the _app call]
  "t-free": ["consume_recovery_update", "free", 1],
  "t-pro": ["consume_recovery_update", "pro", 999],
  "t-apple": ["consume_recovery_update", "pro", 999],
  "t-member": ["consume_recovery_update_business", "business", 999],
  "t-admin": ["consume_recovery_update_app", "app", 10, 0],
  "t-review": ["consume_recovery_update_app", "app", 10, 0]
};
for (const [token, [rpc, plan, limit, cooldown]] of Object.entries(UPDATE_APP)) {
  reset({ caseOwner: USERS[token].id });
  const r = await run(fn["recovery-update"], req("/api/recovery-update", { token, ios: true, origin: APP, body: UPDATE }));
  const names = calls.filter((c) => c.host === "supabase" && c.path.startsWith("/rest/v1/rpc/")).map(RPC_NAMES);
  const c = rpcCalls(rpc)[0]?.body;
  check(`recovery-update app ${token}: ${rpc}`, r.status === 200 && corsOk(r) && c && r.data.usage.plan === plan && r.data.usage.limit === limit && (cooldown === undefined || (c.p_limit === limit && c.p_cooldown_seconds === cooldown)), { status: r.status, c, usage: r.data?.usage, err: r.data?.error });
  const others = ["consume_recovery_update", "consume_recovery_update_business", "consume_recovery_update_app"].filter((n) => n !== rpc);
  check(`recovery-update app ${token}: no other counter is touched`, others.every((n) => !names.includes(n)), names);
  check(`recovery-update app ${token}: the team is looked up like on the website, except for the allowance accounts`, restCalls("GET", "/rest/v1/business_members").length === (token === "t-admin" ? 1 : 1), restCalls("GET", "/rest/v1/business_members").length);
}
{
  reset({ caseOwner: USERS["t-free"].id, consent: false });
  let r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-free", ios: true, body: UPDATE }));
  check("recovery-update app without consent: 428 before anything is read or reserved", r.status === 428 && !calls.some((c) => c.path?.includes("consume_")) && !restCalls("GET", "/rest/v1/recovery_cases").length && !calls.some((c) => c.host === "background"), calls.map((c) => c.path));
  reset({ caseOwner: USERS["t-free"].id, cooldown: 21000 });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-free", ios: true, body: UPDATE }));
  check("recovery-update app cooldown (Free): the website's message and code", r.status === 429 && r.data.code === "cooldown_active" && r.data.error === "Please wait before submitting another Recovery update.", r.data);
  reset({ caseOwner: USERS["t-free"].id, allowPlan: false });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-free", ios: true, body: UPDATE }));
  check("recovery-update app daily limit (Free): the website's message and code", r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === "Daily Free update limit reached.", r.data);
  reset({ caseOwner: USERS["t-review"].id, cooldown: 21000 });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-review", ios: true, body: UPDATE }));
  check("recovery-update app cooldown (review allowance): neutral message with the wait", r.status === 429 && r.data.code === "cooldown_active" && /about 6 hours/.test(r.data.error) && !PLAN_WORDS.test(r.data.error), r.data);
  reset({ caseOwner: USERS["t-review"].id, allowApp: false });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-review", ios: true, body: UPDATE }));
  check("recovery-update app daily limit (review allowance): neutral message", r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === tier.APP_MESSAGES.recoveryUpdateLimit, r.data);
  reset({ caseOwner: USERS["t-member"].id });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-member", body: UPDATE }));
  check("recovery-update web member: the Business tier as before", r.status === 200 && rpcCalls("consume_recovery_update_business").length === 1 && !rpcCalls("has_ai_consent").length && noCors(r), calls.map((c) => c.path));
  reset({ caseOwner: USERS["t-free"].id });
  r = await run(fn["recovery-case"], req("/api/recovery-case", { method: "GET", token: "t-free", ios: true, origin: APP }));
  check("recovery-case app: list with CORS", r.status === 200 && corsOk(r) && Array.isArray(r.data.cases), r);
  r = await run(fn["recovery-case"], new Request(`${SITE}/api/recovery-case`, { method: "OPTIONS", headers: { Origin: APP } }));
  check("recovery-case preflight: 204", r.status === 204 && corsOk(r));
}
// The review / admin allowance (netlify/lib/app-tier.mjs): the only thing left of the old "App tier".
check("messages: the allowance accounts' messages name no plan", Object.values(tier.APP_MESSAGES).every((m) => !PLAN_WORDS.test(m)) && [30, 900, 3600, 5000, 21600].every((s) => !PLAN_WORDS.test(tier.recoveryCooldownMessage(s))), tier.APP_MESSAGES);
check("cooldown message: hours, an hour, minutes", /about 6 hours/.test(tier.recoveryCooldownMessage(21600)) && /about an hour/.test(tier.recoveryCooldownMessage(3700)) && /about 1 minute\./.test(tier.recoveryCooldownMessage(30)) && /about 15 minutes/.test(tier.recoveryCooldownMessage(900)));
check("allowance: needs a confirmed email, and is for the review and admin lists only", tier.appAllowanceFor(USERS["t-review"]) === tier.APP_TIER_ALLOWANCE && tier.appAllowanceFor(USERS["t-review-unconfirmed"]) === null && tier.appAllowanceFor(USERS["t-admin"]) === tier.APP_TIER_ALLOWANCE && tier.appAllowanceFor(null) === null && tier.appAllowanceFor(USERS["t-free"]) === null && tier.appAllowanceFor(USERS["t-apple"]) === null);
check("allowance: the raised counts", JSON.stringify(tier.APP_TIER_ALLOWANCE) === JSON.stringify({ analysesPerDay: 50, recoveryCasesPerDay: 10, recoveryUpdatesPerDay: 10, recoveryUpdateCooldownSeconds: 0 }));
check("allowance: frozen (no runtime switches), and the old App tier is gone", Object.isFrozen(tier.APP_TIER_ALLOWANCE) && !("APP_TIER" in tier) && !("appTierFor" in tier));
check("app-tier: real Recovery reset is 12:00 PM Gulf time (08:00 UTC)", tier.recoveryNextReset(new Date("2026-10-29T07:59:00Z")) === "2026-10-29T08:00:00.000Z" && tier.recoveryNextReset(new Date("2026-10-29T08:00:00Z")) === "2026-10-30T08:00:00.000Z" && tier.nextUtcMidnight(new Date("2026-10-29T23:59:00Z")) === "2026-10-30T00:00:00.000Z");

// ══════════ 5. account-status ══════════
// The app gets the real plan, usage and billing (netlify/lib/entitlements.mjs); only the admin flag and the
// admin bypass stay the website's.
const STATUS_APP = {
  // token: [plan, usage limit, usage used, Recovery cases limit, Recovery cases used, history rows, billing source, billing product]
  "t-free": ["free", 3, 2, 1, 1, 0, null, null],
  "t-pro": ["pro", 15, 2, 3, 1, 1, "stripe", null],
  "t-apple": ["pro", 15, 2, 3, 1, 1, "apple", "app.cybernetai.pro.monthly"],
  "t-guest": ["free", 3, 2, 1, 1, 0, null, null],
  "t-owner": ["business", 50, 9, 20, 4, 1, "apple", "app.cybernetai.business5.monthly"],
  "t-member": ["business", 50, 9, 20, 4, 1, "team", null],
  "t-admin": ["free", 50, 2, 10, 1, 0, null, null],
  "t-review": ["free", 50, 2, 10, 1, 0, null, null]
};
for (const [token, [plan, limit, used, casesLimit, casesUsed, historyRows, source, productId]] of Object.entries(STATUS_APP)) {
  reset();
  const r = await run(fn["account-status"], req("/api/account-status?includeHistory=1", { method: "GET", token, ios: true, origin: APP }));
  const p = r.data?.profile || {};
  check(`account-status app ${token}: plan "${plan}", platform ios, no admin flag, CORS`, r.status === 200 && corsOk(r) && p.plan === plan && r.data.isAdmin === false && r.data.platform === "ios", r.data);
  check(`account-status app ${token}: usage ${used} of ${limit}`, r.data.usage.limit === limit && r.data.usage.used === used && r.data.usage.remaining === limit - used, r.data.usage);
  check(`account-status app ${token}: history only for Pro and Business (${historyRows})`, Array.isArray(r.data.history) && r.data.history.length === historyRows, r.data.history);
  check(`account-status app ${token}: Recovery ${casesUsed} of ${casesLimit}, read with the database's window key`, r.data.recoveryUsage?.casesUsed === casesUsed && r.data.recoveryUsage?.casesLimit === casesLimit && restCalls("GET", "/rest/v1/recovery_usage")[0]?.path.includes("window_start=eq.2026-10-29T16:00:00+00:00"), { ru: r.data.recoveryUsage, q: restCalls("GET", "/rest/v1/recovery_usage")[0]?.path });
  check(`account-status app ${token}: AI consent state`, r.data.aiConsent?.granted === true && r.data.aiConsent?.version === consentLib.AI_CONSENT_VERSION, r.data.aiConsent);
  check(`account-status app ${token}: billing source ${source}, product ${productId}`, p.billing?.source === source && p.billing?.productId === productId && p.billing?.plan === plan, p.billing);
  check(`account-status app ${token}: team flags (members only get the owner notice)`, p.isTeamMember === (token === "t-member") && (token === "t-owner" ? p.teamRole === "owner" : token === "t-member" ? p.teamRole === "member" : p.teamRole === null), p);
  check(`account-status app ${token}: no Stripe ids, no Apple transaction ids`, !/cus_[a-z0-9]|sub_[a-z0-9]|2000000100000001|2000000100000002/i.test(JSON.stringify(r.data)), JSON.stringify(r.data).slice(0, 300));
}
{
  reset();
  let r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-apple", ios: true }));
  check("account-status app, Apple Pro: renews on the expiry, auto-renew on, sandbox/production reported", r.data.profile.billing.renewsAt && r.data.profile.billing.endsAt === null && r.data.profile.billing.autoRenew === true && r.data.profile.billing.interval === "month" && r.data.profile.billing.environment === "Production" && r.data.profile.billing.alsoBilledElsewhere === false, r.data.profile.billing);
  check("account-status app, Apple Pro: the website-style status fields follow the Apple plan", r.data.profile.subscriptionStatus === "active" && r.data.profile.billingInterval === "month", r.data.profile);
  r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-owner", ios: true }));
  check("account-status app, Apple Business owner: seat count from the team", r.data.profile.billing.seatTier === 5 && r.data.profile.billing.interval === "month", r.data.profile.billing);
  reset({ consent: 500 });
  r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-free", ios: true }));
  check("account-status app: consent check down -> known:false, still 200", r.status === 200 && r.data.aiConsent.granted === false && r.data.aiConsent.known === false, r.data.aiConsent);
  // The website: unchanged except for the new profile.billing object.
  for (const [token, plan] of [["t-free", "free"], ["t-pro", "pro"], ["t-apple", "pro"], ["t-member", "business"], ["t-admin", "business"]]) {
    reset();
    r = await run(fn["account-status"], req("/api/account-status?includeHistory=1", { method: "GET", token }));
    check(`account-status web ${token}: plan ${plan}, no CORS, no iOS blocks`, r.status === 200 && r.data.profile.plan === plan && "subscriptionStatus" in r.data.profile && noCors(r) && !("aiConsent" in r.data) && !("recoveryUsage" in r.data) && !("platform" in r.data) && !rpcCalls("has_ai_consent").length, r.data);
    check(`account-status web ${token}: carries profile.billing`, typeof r.data.profile.billing === "object" && r.data.profile.billing.plan === plan, r.data.profile.billing);
  }
  reset();
  r = await run(fn["account-status"], req("/api/account-status?includeHistory=1", { method: "GET", token: "t-free" }));
  check("account-status web free: no history (a Pro feature on the web)", r.data.history.length === 0);
  {
    // Golden: for an account with no Apple subscription the website's answer is exactly what it was, plus profile.billing.
    reset();
    const gold = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-free" }));
    const { resetDate, ...usage } = gold.data.usage;
    check("account-status web free: the whole answer is the old one plus profile.billing (golden)", JSON.stringify({ ...gold.data, usage }) === JSON.stringify({
      isAdmin: false,
      profile: {
        fullName: "Test", plan: "free", subscriptionStatus: "inactive", billingInterval: "", isTeamMember: false, teamRole: null,
        billing: { source: null, plan: "free", productId: null, seatTier: null, interval: null, renewsAt: null, endsAt: null, autoRenew: null, inGrace: false, environment: null, alsoBilledElsewhere: false }
      },
      usage: { used: 2, limit: 3, remaining: 1 },
      history: []
    }) && typeof resetDate === "string", gold.data);
  }
  reset();
  r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-apple" }));
  check("account-status web, Pro bought in the app: Pro with an active status and Apple as the source", r.data.profile.plan === "pro" && r.data.profile.subscriptionStatus === "active" && r.data.profile.billingInterval === "month" && r.data.profile.billing.source === "apple" && r.data.usage.limit === 15, r.data);
  reset();
  r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-guest" }));
  check("account-status web, an ended Apple subscription: back to Free", r.data.profile.plan === "free" && r.data.profile.billing.source === null && r.data.usage.limit === 3, r.data);
  reset();
  r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-pro" }));
  check("account-status web, Stripe Pro: billing source stripe, yearly/monthly from the profile", r.data.profile.billing.source === "stripe" && r.data.profile.billing.interval === "month" && r.data.profile.subscriptionStatus === "active", r.data.profile);
  // A database that has not had the Apple migration yet: the Apple table answers 404 and the person is just not an Apple subscriber.
  reset({ appleTable404: true });
  r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-pro" }));
  check("account-status: a missing apple_subscriptions table never breaks the profile read", r.status === 200 && r.data.profile.plan === "pro", r);
}

// ══════════ 6. /api/ai-consent ══════════
{
  reset();
  let r = await run(fn["ai-consent"], req("/api/ai-consent", { method: "GET", ios: true }));
  check("ai-consent: signed out -> 401", r.status === 401 && r.data.code === "AUTH_REQUIRED", r);
  reset();
  r = await run(fn["ai-consent"], req("/api/ai-consent", { method: "GET", token: "t-free", ios: true, origin: APP }));
  const has = rpcCalls("has_ai_consent")[0]?.body;
  check("ai-consent GET (app): asks for the current version on ios", r.status === 200 && r.data.granted === true && r.data.version === consentLib.AI_CONSENT_VERSION && has?.p_platform === "ios" && has?.p_version === consentLib.AI_CONSENT_VERSION && has?.p_user_id === USERS["t-free"].id && corsOk(r), { data: r.data, has });
  reset();
  r = await run(fn["ai-consent"], req("/api/ai-consent", { token: "t-free", ios: true, body: { version: "2025-01-old" } }));
  check("ai-consent POST old version: 409 with the current version, nothing stored", r.status === 409 && r.data.code === "AI_CONSENT_VERSION_MISMATCH" && r.data.version === consentLib.AI_CONSENT_VERSION && !rpcCalls("grant_ai_consent").length, r.data);
  reset();
  r = await run(fn["ai-consent"], req("/api/ai-consent", { token: "t-free", ios: true, body: { version: consentLib.AI_CONSENT_VERSION, p_user_id: USERS["t-pro"].id, userId: USERS["t-pro"].id } }));
  const grant = rpcCalls("grant_ai_consent")[0]?.body;
  check("ai-consent POST: recorded for the verified user only, platform ios, with the user agent", r.status === 200 && r.data.granted === true && grant?.p_user_id === USERS["t-free"].id && grant?.p_platform === "ios" && grant?.p_version === consentLib.AI_CONSENT_VERSION && /CyberNetAI-iOS/.test(grant?.p_user_agent || ""), grant);
  // Allow answers are counted per account (a POST/DELETE loop must not grow ai_consents); withdrawing never is.
  const quota = rpcCalls("consume_api_quota")[0]?.body;
  check("ai-consent POST: counted per account, 30 an hour", quota?.p_key === `ai_consent:${USERS["t-free"].id}` && quota?.p_window_seconds === 3600 && quota?.p_max_requests === 30, quota);
  reset({ quotaDenied: "ai_consent:" });
  r = await run(fn["ai-consent"], req("/api/ai-consent", { token: "t-free", ios: true, origin: APP, body: { version: consentLib.AI_CONSENT_VERSION } }));
  check("ai-consent POST over the limit: 429, nothing stored, CORS kept", r.status === 429 && r.data.code === "rate_limited" && !rpcCalls("grant_ai_consent").length && corsOk(r), r.data);
  r = await run(fn["ai-consent"], req("/api/ai-consent", { method: "DELETE", token: "t-free", ios: true }));
  check("ai-consent DELETE over the limit: still withdrawn (never refused)", r.status === 200 && r.data.granted === false && rpcCalls("withdraw_ai_consent").length === 1, r.data);
  reset();
  r = await run(fn["ai-consent"], req("/api/ai-consent", { method: "DELETE", token: "t-free", ios: true }));
  check("ai-consent DELETE: withdrawn", r.status === 200 && r.data.granted === false && r.data.withdrawn === 1 && rpcCalls("withdraw_ai_consent")[0]?.body.p_platform === "ios", r.data);
  reset();
  r = await run(fn["ai-consent"], req("/api/ai-consent", { token: "t-free", body: { version: consentLib.AI_CONSENT_VERSION } }));
  check("ai-consent from the website: recorded as web", r.status === 200 && rpcCalls("grant_ai_consent")[0]?.body.p_platform === "web" && noCors(r));
  reset({ consent: 500 });
  r = await run(fn["ai-consent"], req("/api/ai-consent", { method: "GET", token: "t-free", ios: true }));
  check("ai-consent: database down -> 503", r.status === 503 && r.data.code === "AI_CONSENT_UNAVAILABLE", r.data);
  reset();
  r = await run(fn["ai-consent"], req("/api/ai-consent", { method: "PUT", token: "t-free", ios: true, body: {} }));
  check("ai-consent PUT: 405", r.status === 405);
  r = await run(fn["ai-consent"], new Request(`${SITE}/api/ai-consent`, { method: "OPTIONS", headers: { Origin: APP } }));
  check("ai-consent preflight: 204", r.status === 204 && corsOk(r) && /DELETE/.test(r.headers.get("access-control-allow-methods")));
}

// ══════════ 7. /api/feedback: the app's "Report a problem with this result" ══════════
{
  reset();
  let r = await run(fn.feedback, req("/api/feedback", { ios: true, origin: APP, body: { kind: "quick_scan", resultId: "qs-1730200000-ab12", platform: "ios", appVersion: "1.0.0" } }));
  let row = state.feedbackRows[0];
  check("feedback app report without a comment: 201 with CORS", r.status === 201 && r.data.ok === true && corsOk(r), r);
  check("feedback app report: stored as a bug with the result line", row?.category === "bug" && row?.message === "[Result report] Quick Scan, result qs-1730200000-ab12\n\n(no comment)", row);
  check("feedback app report: app version and app name kept, nothing else", row?.ui_version === "ios-1.0.0" && row?.user_agent_summary === "CyberNet AI app 1.0.0 on iOS" && !("kind" in row) && !("resultId" in row) && !("platform" in row), row);
  reset();
  r = await run(fn.feedback, req("/api/feedback", { ios: true, token: "t-free", body: { kind: "analysis_ai", resultId: "77", comment: "The link is my bank's real site.", platform: "ios", appVersion: "1.0.0" } }));
  row = state.feedbackRows[0];
  check("feedback app report with a comment: comment kept under the result line, signed-in user linked", r.status === 201 && row?.message === "[Result report] Analysis AI, result 77\n\nThe link is my bank's real site." && row?.user_id === USERS["t-free"].id && row?.email === "free@example.com", row);
  reset();
  r = await run(fn.feedback, req("/api/feedback", { ios: true, body: { kind: "recovery", resultId: "bad id with spaces <x>", platform: "ios", appVersion: "1.0.0; drop" } }));
  row = state.feedbackRows[0];
  check("feedback app report: a bad result id or version is dropped, not stored", r.status === 201 && row?.message === "[Result report] Recovery plan\n\n(no comment)" && row?.ui_version === null, row);
  reset();
  r = await run(fn.feedback, req("/api/feedback", { ios: true, body: { kind: "something_else", platform: "ios" } }));
  check("feedback: an unknown kind is ordinary feedback (needs a message)", r.status === 400 && state.feedbackRows.length === 0, r);
  reset();
  r = await run(fn.feedback, req("/api/feedback", { ios: true, body: { kind: "qr", comment: "x".repeat(5000), platform: "ios" } }));
  check("feedback: an over-long comment is refused", r.status === 400 && /under/.test(r.data.error), r.data);
  reset();
  r = await run(fn.feedback, req("/api/feedback", { body: { category: "feature", message: "Dark mode please.", page: "/" } }));
  row = state.feedbackRows[0];
  check("feedback from the website: unchanged", r.status === 201 && noCors(r) && row?.message === "Dark mode please." && row?.category === "feature", row);
  r = await run(fn.feedback, new Request(`${SITE}/api/feedback`, { method: "OPTIONS", headers: { Origin: APP } }));
  check("feedback preflight: 204", r.status === 204 && corsOk(r));
}

// ══════════ 8. /api/client-error from the app ══════════
{
  const APP_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CyberNetAI-iOS/1.0.0";
  const named = filters.describeUserAgent(APP_UA);
  check("client-error: the app's user agent has its own name", named?.name === "CyberNet AI in-app (iOS 26)" && named?.supported === true && CLIENT_UA.test(named.name), named);
  const report = validateReport({ message: "x is not a function", file: "capacitor://localhost/script.js?v=1", line: 10, col: 5, page: "/index.html" });
  check("client-error: the app's script path is kept", report?.file === "/script.js:10:5", report);
  check("client-error: other schemes still dropped", validateReport({ message: "m", file: "capacitor://evil/script.js", line: 1 })?.file === "", validateReport({ message: "m", file: "capacitor://evil/script.js", line: 1 }));
  reset();
  let r = await run(fn["client-error"], req("/api/client-error", { ios: true, origin: APP, headers: { "user-agent": APP_UA }, body: { message: "ios-beacon-test", kind: "manual", page: "/index.html" } }));
  check("client-error app: 204 with CORS", r.status === 204 && corsOk(r), r.status);
  r = await run(fn["client-error"], new Request(`${SITE}/api/client-error`, { method: "OPTIONS", headers: { Origin: APP } }));
  check("client-error preflight: 204", r.status === 204 && corsOk(r));
}

// ══════════ 9. team-activity and legal-acceptance ══════════
{
  const SCAN = { kind: "quick_scan", scanType: "text", content: "hello", result: { score: 10, reasons: ["r"] } };
  reset();
  let r = await run(fn["team-activity"], req("/api/team-activity", { token: "t-member", ios: true, origin: APP, body: SCAN }));
  check("team-activity app quick_scan: not logged (on-device in the app)", r.status === 200 && r.data.logged === false && r.data.reason === "on_device_in_app" && !restCalls("POST", "/rest/v1/scan_history").length && corsOk(r), r.data);
  reset();
  r = await run(fn["team-activity"], req("/api/team-activity", { token: "t-member", body: SCAN }));
  check("team-activity web quick_scan: logged as before", r.status === 200 && r.data.logged === true && restCalls("POST", "/rest/v1/scan_history").length === 1, r.data);
  reset();
  r = await run(fn["team-activity"], req("/api/team-activity", { token: "t-member", ios: true, body: { kind: "analysis_shown", logId: 77, shown: { score: 55, label: "Suspicious" } } }));
  check("team-activity app analysis_shown: still recorded for the owner's log", r.status === 200 && restCalls("GET", "/rest/v1/scan_history").length === 1, r.data);
  reset();
  r = await run(fn["legal-acceptance"], req("/api/legal-acceptance", { token: "t-free", ios: true, origin: APP, body: { kind: "signup", page: "/index.html" } }));
  check("legal-acceptance app: recorded with CORS", r.status === 200 && r.data.recorded === true && corsOk(r), r);
  r = await run(fn["legal-acceptance"], new Request(`${SITE}/api/legal-acceptance`, { method: "OPTIONS", headers: { Origin: APP } }));
  check("legal-acceptance preflight: 204", r.status === 204 && corsOk(r));
}

// ══════════ 9b. stripe-webhook: after an immediate deletion, and around Apple-billed teams ══════════
// Deleting an account cancels its team's plan, then removes the team row. Stripe's
// customer.subscription.deleted arrives afterwards and must not create a new team row for
// that owner (it would block the auth-user delete). A live subscription still creates one.
// A Business team can also be billed by Apple: a late Stripe event for an old plan must not close it.
{
  const Stripe = (await import("stripe")).default;
  const WHSEC = "whsec_run_ios_server_fake";
  ENV.STRIPE_SECRET_KEY = "sk_test_run_ios_server_fake";
  ENV.STRIPE_WEBHOOK_SECRET = WHSEC;
  const webhook = (await load("netlify/functions/stripe-webhook.mjs", "ios-stripe-webhook.test.mjs")).default;
  const signer = new Stripe("sk_test_run_ios_server_fake");
  const sign = (event) => {
    const payload = JSON.stringify(event);
    return { payload, header: signer.webhooks.generateTestHeaderString({ payload, secret: WHSEC }) };
  };
  const send = async (event) => {
    const { payload, header } = sign(event);
    const response = await webhook(new Request(`${SITE}/api/stripe-webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload }));
    return { status: response.status, inserts: restCalls("POST", "/rest/v1/business_accounts").length, patches: restCalls("PATCH", "/rest/v1/business_accounts") };
  };
  const subscriptionEvent = (type, status) => ({
    id: `evt_${type}_${status}`, object: "event", type,
    data: { object: { id: "sub_team_gone", object: "subscription", status, customer: "cus_owner1", metadata: { supabase_user_id: USERS["t-owner"].id },
      items: { data: [{ price: { lookup_key: "business_5seat_monthly", recurring: { interval: "month" } } }] } } }
  });
  const deliver = async (type, status, over = {}) => { reset(over); return send(subscriptionEvent(type, status)); };

  let w = await deliver("customer.subscription.deleted", "canceled");
  check("webhook: a deleted subscription with no team row creates nothing", w.status === 200 && w.inserts === 0, w);
  w = await deliver("customer.subscription.updated", "incomplete_expired");
  check("webhook: an expired subscription with no team row creates nothing", w.status === 200 && w.inserts === 0, w);
  w = await deliver("customer.subscription.created", "active");
  check("webhook: a live subscription still creates the team (website unchanged)", w.status === 200 && w.inserts === 1, w);

  // A Stripe team (the default): the event patches it and says Stripe is billing it.
  w = await deliver("customer.subscription.updated", "active", { existingTeam: true, teamBilling: { billing_source: "stripe", subscription_status: "active" } });
  check("webhook: a Stripe-billed team is patched as before, marked billing_source stripe", w.status === 200 && w.patches.length === 1 && w.patches[0].body.billing_source === "stripe" && w.patches[0].body.subscription_status === "active" && w.patches[0].body.stripe_subscription_id === "sub_team_gone" && w.patches[0].body.seat_tier === 5 && w.patches[0].body.daily_pool_limit === 50, w.patches.map((p) => p.body));

  // An Apple-billed team that Apple currently pays for: Stripe events for an old plan change nothing.
  for (const [type, status] of [["customer.subscription.deleted", "canceled"], ["customer.subscription.updated", "past_due"], ["customer.subscription.updated", "incomplete_expired"], ["customer.subscription.updated", "active"]]) {
    w = await deliver(type, status, { existingTeam: true, teamBilling: { billing_source: "apple", subscription_status: "active" } });
    check(`webhook: ${type} (${status}) does not touch a team Apple bills (active)`, w.status === 200 && w.patches.length === 0 && w.inserts === 0, w);
  }
  w = await deliver("customer.subscription.deleted", "canceled", { existingTeam: true, teamBilling: { billing_source: "apple", subscription_status: "past_due" } });
  check("webhook: a late deleted event does not touch an Apple team in billing retry (past_due)", w.status === 200 && w.patches.length === 0, w);
  w = await deliver("customer.subscription.updated", "active", { existingTeam: true, teamBilling: { billing_source: "apple", subscription_status: "past_due" } });
  check("webhook: a live Stripe subscription takes over an Apple team that is in billing retry", w.status === 200 && w.patches.length === 1 && w.patches[0].body.billing_source === "stripe" && w.patches[0].body.subscription_status === "active", w.patches.map((p) => p.body));
  w = await deliver("customer.subscription.updated", "active", { existingTeam: true, teamBilling: { billing_source: "apple", subscription_status: "canceled" } });
  check("webhook: a Stripe event on an expired Apple team takes over and sets billing_source stripe", w.status === 200 && w.patches.length === 1 && w.patches[0].body.billing_source === "stripe" && w.patches[0].body.stripe_subscription_id === "sub_team_gone" && w.patches[0].body.subscription_status === "active", w.patches.map((p) => p.body));
  w = await deliver("customer.subscription.deleted", "canceled", { existingTeam: true, teamBilling: { billing_source: "apple", subscription_status: "canceled" } });
  check("webhook: a deleted event on an already-closed Apple team is the usual patch", w.status === 200 && w.patches.length === 1 && w.patches[0].body.subscription_status === "canceled", w.patches.map((p) => p.body));

  // Before the Apple migration is applied the billing_source column does not exist: Stripe behaves exactly as before.
  w = await deliver("customer.subscription.updated", "active", { existingTeam: true, billingColumn404: true });
  check("webhook: without the billing_source column the patch is the old one (no billing_source key)", w.status === 200 && w.patches.length === 1 && !("billing_source" in w.patches[0].body) && w.patches[0].body.subscription_status === "active", w.patches.map((p) => p.body));

  // invoice.payment_failed for an old Stripe customer on an Apple-billed team.
  const failed = { id: "evt_pf", object: "event", type: "invoice.payment_failed", data: { object: { id: "in_1", object: "invoice", customer: "cus_owner1" } } };
  reset({ existingTeam: true, teamBilling: { billing_source: "apple", subscription_status: "active" } });
  w = await send(failed);
  check("webhook: a failed Stripe invoice does not mark an Apple-billed team past_due", w.status === 200 && w.patches.length === 0, w);
  reset({ existingTeam: true, teamBilling: { billing_source: "stripe", subscription_status: "active" } });
  w = await send(failed);
  check("webhook: a failed Stripe invoice still marks a Stripe-billed team past_due", w.status === 200 && w.patches.length === 1 && w.patches[0].body.subscription_status === "past_due", w.patches.map((p) => p.body));

  delete ENV.STRIPE_SECRET_KEY;
  delete ENV.STRIPE_WEBHOOK_SECRET;
}

// ══════════ 11. billing guards: checkout, billing portal, team invites, check-ins, live stats ══════════
{
  // The decision itself.
  const T = Date.now();
  const proApple = [appleRow("app.cybernetai.pro.monthly", "pro", null)];
  const cc = (args) => entitlements.checkoutConflict({ now: T, ...args });
  check("checkout guard: a free account may buy Pro or Business", cc({ currentPlan: "free", targetPlan: "pro" }) === null && cc({ currentPlan: "free", targetPlan: "business" }) === null);
  check("checkout guard: Stripe Pro buying Pro again keeps the website's message", cc({ profile: { plan: "pro", subscription_status: "active" }, currentPlan: "pro", targetPlan: "pro" }) === "CyberNet AI Pro is already active.");
  check("checkout guard: Stripe Pro may go up to Business", cc({ profile: { plan: "pro", subscription_status: "active" }, currentPlan: "pro", targetPlan: "business" }) === null);
  check("checkout guard: Apple Pro buying Pro on the website is refused without naming the store", cc({ profile: { plan: "free" }, appleRows: proApple, currentPlan: "pro", targetPlan: "pro" }) === "Your plan is already active on this account.");
  check("checkout guard: Apple Pro may still go up to Business", cc({ profile: { plan: "free" }, appleRows: proApple, currentPlan: "pro", targetPlan: "business" }) === null);
  check("checkout guard: an owner or member of a Business team cannot buy Business or Pro", ["owner", "member"].every((role) => ["pro", "business"].every((targetPlan) => cc({ team: { role, seatTier: 5, billingSource: "stripe" }, currentPlan: "free", targetPlan }) === "CyberNet AI Business is already active.")));
  check("checkout guard: an Apple-billed Business owner gets the plain message", cc({ profile: { plan: "free" }, appleRows: [appleRow("app.cybernetai.business5.monthly", "business", 5)], team: { role: "owner", seatTier: 5, billingSource: "apple" }, currentPlan: "free", targetPlan: "business" }) === "Your plan is already active on this account.");
  check("checkout guard: a higher plan outranks a lower target", cc({ team: { role: "owner", billingSource: "stripe" }, currentPlan: "free", targetPlan: "pro" }) === "CyberNet AI Business is already active.");

  // Through the function (STRIPE_SECRET_KEY is needed for it to get that far; the 409 comes before any Stripe call).
  ENV.STRIPE_SECRET_KEY = "sk_test_run_ios_server_fake";
  const checkout = (token, plan) => run(fn["create-checkout-session"], req("/api/create-checkout-session", { token, ios: false, body: { plan, cycle: "monthly", seatTier: 5 } }));
  for (const [token, plan, message] of [
    ["t-apple", "pro", "Your plan is already active on this account."],
    ["t-pro", "pro", "CyberNet AI Pro is already active."],
    ["t-member", "business", "CyberNet AI Business is already active."],
    ["t-member", "pro", "CyberNet AI Business is already active."],
    ["t-owner", "business", "Your plan is already active on this account."]
  ]) {
    reset();
    const r = await checkout(token, plan);
    check(`create-checkout-session: ${token} buying ${plan} is 409 "${message}"`, r.status === 409 && r.data.error === message && !restCalls("POST", "/rest/v1/checkout_debug_log").length, r);
  }
  reset();
  let r = await run(fn["create-checkout-session"], req("/api/create-checkout-session", { token: "t-apple", ios: true, body: { plan: "pro" } }));
  check("create-checkout-session: the app still gets 403, even with a Stripe key configured", r.status === 403 && r.data.code === "NOT_AVAILABLE_IN_APP" && calls.length === 0, r);

  // Billing portal for a plan Apple bills.
  reset();
  r = await run(fn["customer-portal"], req("/api/customer-portal", { token: "t-apple", ios: false, body: {} }));
  check("customer-portal: a plan billed by Apple answers 409 BILLED_BY_APPLE with where to manage it", r.status === 409 && r.data.code === "BILLED_BY_APPLE" && r.data.error === "This plan is billed by Apple. Manage it in Settings > your name > Subscriptions on your iPhone.", r);
  reset();
  r = await run(fn["customer-portal"], req("/api/customer-portal", { token: "t-free", ios: false, body: {} }));
  check("customer-portal: an account with no plan at all is still the old 404", r.status === 404 && /No Stripe customer/.test(r.data.error), r);
  reset();
  r = await run(fn["customer-portal"], req("/api/customer-portal", { token: "t-guest", ios: false, body: {} }));
  check("customer-portal: an Apple plan that has ended is the old 404 too", r.status === 404, r);
  reset();
  r = await run(fn["customer-portal"], req("/api/customer-portal", { token: "t-apple", ios: true, body: {} }));
  check("customer-portal: the app gets 403 (it uses Apple's own Manage subscription)", r.status === 403 && r.data.code === "NOT_AVAILABLE_IN_APP", r);
  delete ENV.STRIPE_SECRET_KEY;
}
{
  // Team invites: the way to more seats in the app is the plan, never an offer outside it.
  const invite = (ios) => run(fn["business-invite"], req("/api/business-invite", { token: "t-owner", ios, origin: ios ? APP : "", body: { email: "new.person@example.com" } }));
  reset({ memberCount: 5 });
  let r = await invite(true);
  check("business-invite app, team full: 409 with no pointer to an outside offer", r.status === 409 && r.data.error === "Team is full (5/5 seats, including you). Remove a member to free a seat." && !/support@|email|tier/i.test(r.data.error) && corsOk(r), r);
  reset({ memberCount: 5 });
  r = await invite(false);
  check("business-invite website, team full: the old message, unchanged", r.status === 409 && r.data.error === "Team is full (5/5 seats, including you). Remove a member, or email support@cybernetai.app to move up a tier.", r);
}
{
  // Live numbers on Home need CORS; the website's answer is unchanged.
  reset();
  const stats = (opts) => run(fn["public-stats"], req("/api/public-stats", { method: "GET", ios: true, ...opts }));
  let r = await stats({ origin: APP });
  check("public-stats: the app gets the live numbers with CORS", r.status === 200 && r.data.live === true && r.data.totalScans === 1200 && r.data.threatsFound === 340 && r.data.recoveryCases === 15 && corsOk(r), r);
  r = await run(fn["public-stats"], req("/api/public-stats", { method: "GET", ios: false }));
  check("public-stats: the website's answer is the same and has no CORS headers", r.status === 200 && r.data.live === true && noCors(r), r);
  r = await run(fn["public-stats"], new Request(`${SITE}/api/public-stats`, { method: "OPTIONS", headers: { Origin: APP } }));
  check("public-stats: the app's preflight is 204", r.status === 204 && corsOk(r));
  r = await run(fn["public-stats"], req("/api/public-stats", { method: "POST", ios: true, origin: APP, body: {} }));
  check("public-stats: POST is 405", r.status === 405);
  const fresh = (await import(pathToFileURL(path.join(root, "netlify/functions/public-stats.mjs")).href + `?fresh=${Date.now()}`)).default;
  reset({ statsFail: true });
  r = await run(fresh, req("/api/public-stats", { method: "GET", ios: true, origin: APP }));
  check("public-stats: when the database fails the app gets live:false (503) with CORS, not a made-up number", r.status === 503 && r.data.live === false && corsOk(r), r);
}
{
  // Idle-case reminders: Pro bought in the app gets them like Pro bought on the website.
  const checkin = async () => {
    const response = await fn["recovery-checkin"]();
    return { status: response.status, data: JSON.parse(await response.text()) };
  };
  const owner1 = USERS["t-pro"].id, owner2 = USERS["t-apple"].id;
  const casesQuery = () => restCalls("GET", "/rest/v1/recovery_cases").map((c) => c.path).find((p) => p.includes("owner_user_id=in.("));
  const idsIn = (query) => (/owner_user_id=in\.\(([^)]*)\)/.exec(query || "") || [])[1]?.split(",").sort() || [];
  reset({
    proProfiles: [{ id: owner1 }],
    appleProRows: [{ user_id: owner2 }, { user_id: owner1 }],
    staleCases: [{ id: "case-1", owner_user_id: owner1, case_title: "Hacked email", status: "open" }, { id: "case-2", owner_user_id: owner2, case_title: "Stolen card", status: "open" }]
  });
  let r = await checkin();
  check("recovery-checkin: Stripe Pro and Apple Pro accounts are both checked, each once", r.status === 200 && JSON.stringify(idsIn(casesQuery())) === JSON.stringify([owner1, owner2].sort()), { r, q: casesQuery() });
  check("recovery-checkin: a reminder email goes to each case owner (Apple Pro included)", r.data.pro.checked === 2 && r.data.pro.sent === 2 && state.mails.filter((m) => m.subject === "Checking in on your recovery case").length === 2, { pro: r.data.pro, mails: state.mails.map((m) => m.subject) });
  check("recovery-checkin: the Apple query reads plan, revoked_at and expires_at", (() => {
    const query = restCalls("GET", "/rest/v1/apple_subscriptions")[0]?.path || "";
    return /plan=eq\.pro/.test(query) && /revoked_at=is\.null/.test(query) && /expires_at=gt\.\d{4}-\d\d-\d\dT/.test(query) && /select=user_id/.test(query);
  })(), restCalls("GET", "/rest/v1/apple_subscriptions").map((c) => c.path));
  reset({ proProfiles: [], appleProRows: [{ user_id: owner2 }], staleCases: [{ id: "case-2", owner_user_id: owner2, case_title: "Stolen card", status: "open" }] });
  r = await checkin();
  check("recovery-checkin: an Apple Pro account with no Stripe profile row is still reminded", r.data.pro.sent === 1 && JSON.stringify(idsIn(casesQuery())) === JSON.stringify([owner2]), r.data);
  reset({ proProfiles: [{ id: owner1 }], appleProFail: 500, staleCases: [{ id: "case-1", owner_user_id: owner1, case_title: "Hacked email", status: "open" }] });
  r = await checkin();
  check("recovery-checkin: if the Apple read fails, the Stripe Pro accounts are still reminded", r.status === 200 && r.data.pro.sent === 1, r);
  reset({ proProfiles: [], appleProRows: [] });
  r = await checkin();
  check("recovery-checkin: nobody on Pro: nothing checked", r.status === 200 && r.data.pro.checked === 0 && !casesQuery(), r);
  reset({ proProfiles: [], appleProRows: [], appleTable404: true });
  r = await checkin();
  check("recovery-checkin: before the Apple migration (table missing) it quietly checks Stripe Pro only", r.status === 200 && r.data.pro.checked === 0, r);
}

// ══════════ 10. source checks: routes and wrapping ══════════
{
  const { readFileSync, mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const src = (f) => readFileSync(path.join(root, "netlify/functions", f), "utf8");
  for (const f of ["account-status.mjs", "analyze.mts", "recovery-mode.mts", "recovery-update.mts", "recovery-case.mts", "privacy-data.mts", "legal-acceptance.mts", "ai-consent.mjs", "client-error.mjs", "feedback.mjs", "team-activity.mts",
    "quickscan-usage.mjs", "public-stats.mjs", "business-account.mts", "business-activity.mts", "business-invite.mts", "business-invite-cancel.mts", "business-member-remove.mts"]) {
    const s = src(f);
    check(`source: ${f} default export is CORS-wrapped`, /export default withCors\(handler\);/.test(s));
    const methods = /method:\s*\[([^\]]*)\]/.exec(s.slice(s.indexOf("export const config")));
    check(`source: ${f} route lets OPTIONS through`, !methods || /"OPTIONS"/.test(methods[1]), methods?.[1]);
  }
  for (const f of ["create-checkout-session.mjs", "customer-portal.mjs", "byok-analyze.mts", "validate-openai-key.mts", "screenshot-preview.mjs", "stripe-webhook.mjs", "backup-now.mts", "feedback-admin.mjs", "business-invite-accept.mts", "apple-notifications.mjs", "apple-sweep.mjs"]) {
    check(`source: ${f} is not CORS-wrapped`, !/withCors/.test(src(f).replace(/\/\/.*$/gm, "")));
  }
  // The web-only wrapper stays on exactly the functions the app must not reach.
  for (const f of ["create-checkout-session.mjs", "customer-portal.mjs", "byok-analyze.mts", "validate-openai-key.mts", "screenshot-preview.mjs", "feedback-admin.mjs", "business-invite-accept.mts"]) {
    check(`source: ${f} is web-only`, /export default webOnly\(/.test(src(f)));
  }
  for (const f of ["quickscan-usage.mjs", "public-stats.mjs", "business-account.mts", "business-activity.mts", "business-invite.mts", "business-invite-cancel.mts", "business-member-remove.mts", "account-status.mjs", "analyze.mts", "recovery-mode.mts", "recovery-update.mts"]) {
    check(`source: ${f} is no longer web-only`, !/webOnly/.test(src(f).replace(/\/\/.*$/gm, "")));
  }
  // Nothing of the old fixed "App tier" is left in the functions, and nothing reads a plan called "app" except the allowance helpers.
  for (const f of ["account-status.mjs", "analyze.mts", "recovery-mode.mts", "recovery-update.mts"]) {
    check(`source: ${f} has no App tier`, !/appTierFor|APP_TIER\b/.test(src(f)));
  }
  {
    const server = readFileSync(path.join(root, "netlify/functions/apple-verify.mjs"), "utf8");
    check("source: apple-verify never reads the user id from the request body", !/body\??\.(userId|user_id|p_user_id)|parsed\.(userId|user_id)/.test(server));
    const all = ["apple-verify.mjs", "apple-notifications.mjs", "apple-sweep.mjs"].map((n) => src(n)).concat(["apple-jws.mjs", "apple-apply.mjs", "entitlements.mjs", "apple-products.mjs", "apple-root-ca-g3.mjs"].map((n) => readFileSync(path.join(root, "netlify/lib", n), "utf8"))).join("\n");
    const appleVars = [...all.matchAll(/env\("(APPLE[A-Z_]*|APP_STORE[A-Z_]*)"\)/g)].map((m) => m[1]);
    check("source: the purchase code reads no Apple API key, issuer id or private key (only the optional public app id and the sweep switch)", appleVars.every((name) => ["APPLE_APP_APPLE_ID", "APPLE_SWEEP"].includes(name)) && !/BEGIN (EC )?PRIVATE KEY/.test(all), appleVars);
  }
  const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
  const ignore = /^\s*ignore = '([^'\n]*)'\s*$/m.exec(toml)?.[1] || "";
  check("netlify.toml: mobile-only commits skip the Netlify build", /git diff --quiet "\$CACHED_COMMIT_REF" "\$COMMIT_REF" -- public netlify netlify\.toml package\.json package-lock\.json supabase$/.test(ignore), ignore);
  check("netlify.toml: a build with nothing to compare always runs", /^if \[ "\$CACHED_COMMIT_REF" = "\$COMMIT_REF" \]; then exit 1; fi; /.test(ignore), ignore);
  // Run the command for real in a scratch git repository when a POSIX shell and git are available
  // (Netlify runs it with bash; on Windows, Git for Windows provides sh). Exit 0 = skip the build.
  const sh = spawnSync("sh", ["-c", "git --version"], { encoding: "utf8" });
  if (sh.status === 0 && ignore) {
    const repo = mkdtempSync(path.join(tmpdir(), "cn-ignore-"));
    const git = (...a) => spawnSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { cwd: repo, encoding: "utf8" });
    const head = () => git("rev-parse", "HEAD").stdout.trim();
    git("init", "-q");
    mkdirSync(path.join(repo, "public"), { recursive: true });
    mkdirSync(path.join(repo, "mobile"), { recursive: true });
    writeFileSync(path.join(repo, "public", "a.txt"), "1");
    git("add", "-A"); git("commit", "-qm", "one");
    const c1 = head();
    writeFileSync(path.join(repo, "mobile", "b.txt"), "2");
    git("add", "-A"); git("commit", "-qm", "mobile only");
    const c2 = head();
    writeFileSync(path.join(repo, "public", "a.txt"), "3");
    git("add", "-A"); git("commit", "-qm", "website");
    const c3 = head();
    const runIgnore = (cached, commit) => spawnSync("sh", ["-c", ignore], { cwd: repo, env: { ...process.env, CACHED_COMMIT_REF: cached, COMMIT_REF: commit }, encoding: "utf8" }).status;
    check("ignore command: mobile-only change -> skip (0)", runIgnore(c1, c2) === 0);
    check("ignore command: website change -> build (non-zero)", runIgnore(c2, c3) !== 0);
    check("ignore command: same commit (no cache / redeploy) -> build", runIgnore(c3, c3) !== 0);
    check("ignore command: no cached ref -> build", runIgnore("", c3) !== 0);
    rmSync(repo, { recursive: true, force: true });
  } else {
    console.log("(netlify.toml ignore command not executed: no sh/git on this machine)");
  }
}

console.log(`ios server: ${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`(${logged.length} lines the functions logged; last 5:)\n  ${logged.slice(-5).join("\n  ").slice(0, 2000)}`);
  process.exit(1);
}
