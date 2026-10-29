// The server side of the iPhone app (BUILD-PLAN §8.1-§8.5, §8.7; owner answers
// of 29 Oct 2026): CORS for capacitor://localhost, the App tier, the refusal of
// web-only paths, the AI consent gate and /api/ai-consent, the app's result
// reports to /api/feedback, error reports from the app, and the team log.
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
  "business-account.mts", "business-activity.mts", "business-invite.mts", "business-invite-accept.mts", "business-invite-cancel.mts", "business-member-remove.mts"]) {
  fn[name.replace(/\.m[jt]s$/, "")] = (await load(`netlify/functions/${name}`, `ios-${name}.test.mjs`)).default;
}
const cors = await import(pathToFileURL(path.join(root, "netlify/lib/cors.mjs")).href);
const tier = await import(pathToFileURL(path.join(root, "netlify/lib/app-tier.mjs")).href);
const consentLib = await import(pathToFileURL(path.join(root, "netlify/lib/ai-consent.mjs")).href);
const filters = await import(pathToFileURL(path.join(root, "netlify/lib/client-error-filters.mjs")).href);
const { CLIENT_UA } = await import(pathToFileURL(path.join(root, "netlify/lib/report-error.mjs")).href);
const { validateReport, resetClientErrorMemory } = await import(pathToFileURL(path.join(root, "netlify/functions/client-error.mjs")).href);
const { resetFeedbackMemory } = await import(pathToFileURL(path.join(root, "netlify/functions/feedback.mjs")).href);
const { DEFAULT_MINI_MODEL } = await import(pathToFileURL(path.join(root, "netlify/lib/ai-models.mjs")).href);

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
  "t-review-unconfirmed": { id: id(7), email: "review@example.com", email_confirmed_at: null }
};
const TEAM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const byId = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]));
const PROFILE = { [USERS["t-pro"].id]: { plan: "pro", subscription_status: "active", billing_interval: "month" } };
const TEAM_ROLE = { [USERS["t-owner"].id]: "owner", [USERS["t-member"].id]: "member" };

// ── the stubbed network ──
let state;
let calls;
function reset(over = {}) {
  state = {
    consent: true, // has_ai_consent answer, or a number = HTTP status to fail with
    allowApp: true, // consume_*_app answer
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
      return json(rpc === "consume_api_quota" ? { allowed: true, used: 1, limit: 100 } : true);
    case "consume_analysis_app":
      return json([{ allowed: state.allowApp, used: state.allowApp ? 1 : body.p_limit, daily_limit: body.p_limit, plan: "app" }]);
    case "consume_analysis":
      return json([{ allowed: true, used: 1, daily_limit: PROFILE[uid] ? 15 : 3, plan: PROFILE[uid] ? "pro" : "free" }]);
    case "consume_analysis_business":
      return json([{ allowed: true, used: 1, daily_limit: 50, plan: "business" }]);
    case "consume_recovery_case_app":
      return json([{ allowed: state.allowApp, used: state.allowApp ? 1 : body.p_limit, daily_limit: body.p_limit, plan: "app", reset_at: "2026-10-30T16:00:00+00:00" }]);
    case "consume_recovery_case":
      return json([{ allowed: true, used: 1, daily_limit: 1, plan: PROFILE[uid] ? "pro" : "free", reset_at: "2026-10-30T16:00:00+00:00" }]);
    case "consume_recovery_case_business":
      return json([{ allowed: true, used: 1, daily_limit: 20, plan: "business", reset_at: "2026-10-30T16:00:00+00:00" }]);
    case "consume_recovery_update_app":
      return json([{ allowed: state.allowApp && !state.cooldown, used: 1, daily_limit: body.p_limit, plan: "app", reset_at: "2026-10-30T16:00:00+00:00", cooldown_seconds_remaining: state.cooldown }]);
    case "consume_recovery_update":
    case "consume_recovery_update_business":
      return json([{ allowed: true, used: 1, daily_limit: 999, plan: rpc.endsWith("business") ? "business" : "free", reset_at: null, cooldown_seconds_remaining: 0 }]);
    case "consume_quickscan":
      return json([{ allowed: true, used: 1, daily_limit: 5, plan: "free" }]);
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
  if (url.pathname === "/rest/v1/business_members" && method === "GET") {
    const role = TEAM_ROLE[userIn];
    return json(role ? [{ role, business_accounts: { id: TEAM, seat_tier: 5, daily_pool_limit: 50, recovery_pool_limit: 20, subscription_status: "active" } }] : []);
  }
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
async function run(handler, request) {
  const response = await handler(request, context);
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
for (const name of ["create-checkout-session", "customer-portal", "byok-analyze", "validate-openai-key", "screenshot-preview", "quickscan-usage", "feedback-admin",
  "business-account", "business-activity", "business-invite", "business-invite-accept", "business-invite-cancel", "business-member-remove"]) {
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
{
  reset();
  const r = await run(fn["quickscan-usage"], req("/api/quickscan-usage", { token: "t-free", body: {} }));
  check("quickscan-usage: website path unchanged (consume_quickscan)", r.status === 200 && rpcCalls("consume_quickscan").length === 1, r);
}

// ══════════ 3. analyze: consent, App tier, history, team log ══════════
const IMAGE = { type: "image", content: "", imageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" };
const EXPECT_LIMIT = { "t-free": 3, "t-pro": 3, "t-owner": 3, "t-member": 3, "t-admin": 50, "t-review": 50, "t-review-unconfirmed": 3 };
for (const [token, limit] of Object.entries(EXPECT_LIMIT)) {
  reset();
  const r = await run(fn.analyze, req("/api/analyze", { token, ios: true, origin: APP, body: IMAGE }));
  const names = calls.filter((c) => c.host === "supabase" && c.path.startsWith("/rest/v1/rpc/")).map(RPC_NAMES);
  const consume = rpcCalls("consume_analysis_app");
  check(`analyze app ${token}: 200 with plan "app" and CORS`, r.status === 200 && r.data.usage?.plan === "app" && corsOk(r), { status: r.status, usage: r.data?.usage, err: r.data?.error });
  check(`analyze app ${token}: consent checked first, then consume_analysis_app(${limit})`, consume.length === 1 && consume[0].body.p_limit === limit && consume[0].body.p_user_id === USERS[token].id &&
    names.indexOf("has_ai_consent") >= 0 && names.indexOf("has_ai_consent") < names.indexOf("consume_analysis_app"), names);
  check(`analyze app ${token}: never the web, team or admin path`, !names.includes("consume_analysis") && !names.includes("consume_analysis_business") && !names.includes("refund_analysis_business"), names);
  const ai = calls.filter((c) => c.host === "openai");
  check(`analyze app ${token}: routed like Free (the mini model), store:false`, ai.length === 1 && ai[0].body.model === DEFAULT_MINI_MODEL && ai[0].body.store === false, ai.map((c) => c.body?.model));
  const saved = restCalls("POST", "/rest/v1/scan_history");
  check(`analyze app ${token}: the AI explanation is saved to history (App tier)`, saved.length === 1 && Array.isArray(r.data.history) && r.data.history.length === 1, { saved: saved.length, history: r.data.history });
  if (token === "t-member") {
    check("analyze app member: the result still reaches the team owner's log", saved[0]?.body?.business_account_id === TEAM && saved[0]?.body?.analysis?.aiUsed === true && "submitted_content" in (saved[0]?.body || {}) && r.data.teamLogId === 77, saved[0]?.body);
  } else if (token === "t-owner") {
    check("analyze app owner: own activity carries no submitted content", saved[0]?.body?.business_account_id === TEAM && !("submitted_content" in (saved[0]?.body || {})), saved[0]?.body);
  } else {
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
  ({ r, names } = await web("t-member"));
  check("analyze web member: the team pool", names.includes("consume_analysis_business") && !names.includes("consume_analysis") && r.data.usage.plan === "business", names);
  ({ r, names } = await web("t-admin"));
  check("analyze web admin: the bypass, nothing reserved", r.status === 200 && !names.some((n) => n.startsWith("consume_")) && r.data.usage.limit === 999999, names);
  ({ r, names } = await web("t-review"));
  check("analyze web review account: an ordinary free account on the web", names.includes("consume_analysis") && r.data.usage.limit === 3, names);
}
// Consent missing, check failing, investigation, the limit message, the app's origin without the header.
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
  reset({ allowApp: false });
  r = await run(fn.analyze, req("/api/analyze", { token: "t-pro", ios: true, body: IMAGE }));
  check("analyze app limit: 429 with a neutral message (no plan names)", r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === tier.APP_MESSAGES.aiLimit && !PLAN_WORDS.test(r.data.error) && r.data.usage.plan === "app", r.data);
  check("analyze app limit: nothing sent to OpenAI", !calls.some((c) => c.host === "openai"));
  reset();
  r = await run(fn.analyze, new Request(`${SITE}/api/analyze`, { method: "OPTIONS", headers: { Origin: APP } }), context);
  check("analyze preflight: 204, nothing called", r.status === 204 && corsOk(r) && calls.length === 0);
  // No AI result: the App-tier counter is refunded (never the team pool).
  ENV.OPENAI_API_KEY = "";
  reset();
  r = await run(fn.analyze, req("/api/analyze", { token: "t-member", ios: true, body: IMAGE }));
  check("analyze app, no AI answer: refund_analysis (own counter), not the team pool", r.status === 200 && rpcCalls("refund_analysis").length === 1 && !rpcCalls("refund_analysis_business").length && r.data.usage.used === 0, calls.map((c) => c.path));
  ENV.OPENAI_API_KEY = "stub-openai-key";
}

// ══════════ 4. recovery-mode and recovery-update ══════════
const INCIDENT = { description: "Someone logged into my email and changed the recovery phone number.", quickAnswers: {}, region: "UAE" };
const CASE_LIMIT = { "t-free": 1, "t-pro": 1, "t-member": 1, "t-admin": 10, "t-review": 10 };
for (const [token, limit] of Object.entries(CASE_LIMIT)) {
  reset();
  const r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token, ios: true, origin: APP, body: INCIDENT }));
  const names = calls.filter((c) => c.host === "supabase" && c.path.startsWith("/rest/v1/rpc/")).map(RPC_NAMES);
  check(`recovery-mode app ${token}: 200, consent then consume_recovery_case_app(${limit})`, r.status === 200 && corsOk(r) && r.data.usage?.plan === "app" &&
    rpcCalls("consume_recovery_case_app")[0]?.body.p_limit === limit && names.indexOf("has_ai_consent") >= 0 && names.indexOf("has_ai_consent") < names.indexOf("consume_recovery_case_app"), { status: r.status, names, err: r.data?.error });
  check(`recovery-mode app ${token}: never the web, team or admin path`, !names.includes("consume_recovery_case") && !names.includes("consume_recovery_case_business"), names);
  const caseRow = restCalls("POST", "/rest/v1/recovery_cases")[0]?.body;
  if (token === "t-member") check("recovery-mode app member: the case still reaches the owner's log", caseRow?.business_account_id === TEAM && typeof caseRow?.submitted_description === "string", caseRow);
  else check(`recovery-mode app ${token}: no team link`, caseRow && !("business_account_id" in caseRow), caseRow);
}
{
  reset({ consent: false });
  let r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-free", ios: true, body: INCIDENT }));
  check("recovery-mode app without consent: 428, nothing reserved, no case, no background job", r.status === 428 && r.data.code === "AI_CONSENT_REQUIRED" && !calls.some((c) => c.path?.includes("consume_")) && !restCalls("POST", "/rest/v1/recovery_cases").length && !calls.some((c) => c.host === "background"), r.data);
  reset({ allowApp: false });
  r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-free", ios: true, body: INCIDENT }));
  check("recovery-mode app limit (1): neutral message", r.status === 429 && r.data.error === tier.APP_MESSAGES.recoveryCaseLimit && !PLAN_WORDS.test(r.data.error), r.data);
  reset({ allowApp: false });
  r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-review", ios: true, body: INCIDENT }));
  check("recovery-mode app limit (10): plural message", r.status === 429 && r.data.error === tier.APP_MESSAGES.recoveryCasesLimit, r.data);
  for (const [token, rpc] of [["t-free", "consume_recovery_case"], ["t-member", "consume_recovery_case_business"]]) {
    reset();
    r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token, body: INCIDENT }));
    check(`recovery-mode web ${token}: ${rpc}, no consent check, no CORS`, r.status === 200 && rpcCalls(rpc).length === 1 && !rpcCalls("has_ai_consent").length && noCors(r) && !calls.some((c) => c.path?.endsWith("_app")), calls.map((c) => c.path));
  }
  reset();
  r = await run(fn["recovery-mode"], req("/api/recovery-mode", { token: "t-admin", body: INCIDENT }));
  check("recovery-mode web admin: the bypass as before", r.status === 200 && !calls.some((c) => c.path?.includes("consume_")), calls.map((c) => c.path));
}
const UPDATE = { caseId: CASE, updateText: "I changed my password and turned on two-factor." };
for (const [token, limit, cooldown] of [["t-free", 1, 21600], ["t-member", 1, 21600], ["t-admin", 10, 0], ["t-review", 10, 0]]) {
  reset({ caseOwner: USERS[token].id });
  const r = await run(fn["recovery-update"], req("/api/recovery-update", { token, ios: true, origin: APP, body: UPDATE }));
  const c = rpcCalls("consume_recovery_update_app")[0]?.body;
  check(`recovery-update app ${token}: consume_recovery_update_app(${limit}, ${cooldown})`, r.status === 200 && corsOk(r) && c?.p_limit === limit && c?.p_cooldown_seconds === cooldown && r.data.usage.plan === "app", { status: r.status, c, err: r.data?.error });
  check(`recovery-update app ${token}: no team lookup, no web/team RPC`, !restCalls("GET", "/rest/v1/business_members").length && !rpcCalls("consume_recovery_update").length && !rpcCalls("consume_recovery_update_business").length, calls.map((x) => x.path));
}
{
  reset({ caseOwner: USERS["t-free"].id, consent: false });
  let r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-free", ios: true, body: UPDATE }));
  check("recovery-update app without consent: 428 before anything is read or reserved", r.status === 428 && !calls.some((c) => c.path?.includes("consume_")) && !restCalls("GET", "/rest/v1/recovery_cases").length && !calls.some((c) => c.host === "background"), calls.map((c) => c.path));
  reset({ caseOwner: USERS["t-free"].id, cooldown: 21000 });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-free", ios: true, body: UPDATE }));
  check("recovery-update app cooldown: neutral message with the wait", r.status === 429 && r.data.code === "cooldown_active" && /about 6 hours/.test(r.data.error) && !PLAN_WORDS.test(r.data.error), r.data);
  reset({ caseOwner: USERS["t-free"].id, allowApp: false });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-free", ios: true, body: UPDATE }));
  check("recovery-update app daily limit: neutral message", r.status === 429 && r.data.code === "daily_limit_reached" && r.data.error === tier.APP_MESSAGES.recoveryUpdateLimit, r.data);
  reset({ caseOwner: USERS["t-member"].id });
  r = await run(fn["recovery-update"], req("/api/recovery-update", { token: "t-member", body: UPDATE }));
  check("recovery-update web member: the Business tier as before", r.status === 200 && rpcCalls("consume_recovery_update_business").length === 1 && !rpcCalls("has_ai_consent").length && noCors(r), calls.map((c) => c.path));
  reset({ caseOwner: USERS["t-free"].id });
  r = await run(fn["recovery-case"], req("/api/recovery-case", { method: "GET", token: "t-free", ios: true, origin: APP }));
  check("recovery-case app: list with CORS", r.status === 200 && corsOk(r) && Array.isArray(r.data.cases), r);
  r = await run(fn["recovery-case"], new Request(`${SITE}/api/recovery-case`, { method: "OPTIONS", headers: { Origin: APP } }));
  check("recovery-case preflight: 204", r.status === 204 && corsOk(r));
}
check("messages: none names a plan", Object.values(tier.APP_MESSAGES).every((m) => !PLAN_WORDS.test(m)) && [30, 900, 3600, 5000, 21600].every((s) => !PLAN_WORDS.test(tier.recoveryCooldownMessage(s))), tier.APP_MESSAGES);
check("cooldown message: hours, an hour, minutes", /about 6 hours/.test(tier.recoveryCooldownMessage(21600)) && /about an hour/.test(tier.recoveryCooldownMessage(3700)) && /about 1 minute\./.test(tier.recoveryCooldownMessage(30)) && /about 15 minutes/.test(tier.recoveryCooldownMessage(900)));
check("app tier: allowance needs a confirmed email", tier.appTierFor(USERS["t-review"]) === tier.APP_TIER_ALLOWANCE && tier.appTierFor(USERS["t-review-unconfirmed"]) === tier.APP_TIER && tier.appTierFor(USERS["t-admin"]) === tier.APP_TIER_ALLOWANCE && tier.appTierFor(null) === tier.APP_TIER);
check("app tier: counts per owner answer 6", JSON.stringify(tier.APP_TIER) === JSON.stringify({ analysesPerDay: 3, recoveryCasesPerDay: 1, recoveryUpdatesPerDay: 1, recoveryUpdateCooldownSeconds: 21600 }) && JSON.stringify(tier.APP_TIER_ALLOWANCE) === JSON.stringify({ analysesPerDay: 50, recoveryCasesPerDay: 10, recoveryUpdatesPerDay: 10, recoveryUpdateCooldownSeconds: 0 }));
check("app tier: frozen (no runtime switches)", Object.isFrozen(tier.APP_TIER) && Object.isFrozen(tier.APP_TIER_ALLOWANCE));
check("app tier: real Recovery reset is 12:00 PM Gulf time (08:00 UTC)", tier.recoveryNextReset(new Date("2026-10-29T07:59:00Z")) === "2026-10-29T08:00:00.000Z" && tier.recoveryNextReset(new Date("2026-10-29T08:00:00Z")) === "2026-10-30T08:00:00.000Z" && tier.nextUtcMidnight(new Date("2026-10-29T23:59:00Z")) === "2026-10-30T00:00:00.000Z");

// ══════════ 5. account-status ══════════
for (const [token, limit] of [["t-free", 3], ["t-pro", 3], ["t-member", 3], ["t-owner", 3], ["t-admin", 50]]) {
  reset();
  const r = await run(fn["account-status"], req("/api/account-status?includeHistory=1", { method: "GET", token, ios: true, origin: APP }));
  const p = r.data?.profile || {};
  check(`account-status app ${token}: plan "app", no billing fields, no admin flag`, r.status === 200 && corsOk(r) && p.plan === "app" && !("subscriptionStatus" in p) && !("billingInterval" in p) && r.data.isAdmin === false && r.data.platform === "ios", r.data);
  check(`account-status app ${token}: usage ${limit} a day from the shared counter`, r.data.usage.limit === limit && r.data.usage.used === 2 && r.data.usage.remaining === limit - 2, r.data.usage);
  check(`account-status app ${token}: history for every account`, Array.isArray(r.data.history) && r.data.history.length === 1, r.data.history);
  check(`account-status app ${token}: Recovery usage read with the database's window key`, r.data.recoveryUsage?.casesUsed === 1 && r.data.recoveryUsage?.casesLimit === (limit === 50 ? 10 : 1) && restCalls("GET", "/rest/v1/recovery_usage")[0]?.path.includes("window_start=eq.2026-10-29T16:00:00+00:00"), { ru: r.data.recoveryUsage, q: restCalls("GET", "/rest/v1/recovery_usage")[0]?.path });
  check(`account-status app ${token}: AI consent state`, r.data.aiConsent?.granted === true && r.data.aiConsent?.version === consentLib.AI_CONSENT_VERSION, r.data.aiConsent);
  check(`account-status app ${token}: team notice flag only for members`, p.isTeamMember === (token === "t-member") && (token === "t-owner" ? p.teamRole === "owner" : true), p);
  check(`account-status app ${token}: no plan words anywhere`, !/"(pro|business|free)"/i.test(JSON.stringify(r.data)), JSON.stringify(r.data).slice(0, 300));
}
{
  reset({ consent: 500 });
  let r = await run(fn["account-status"], req("/api/account-status", { method: "GET", token: "t-free", ios: true }));
  check("account-status app: consent check down -> known:false, still 200", r.status === 200 && r.data.aiConsent.granted === false && r.data.aiConsent.known === false, r.data.aiConsent);
  for (const [token, plan] of [["t-free", "free"], ["t-pro", "pro"], ["t-member", "business"], ["t-admin", "business"]]) {
    reset();
    r = await run(fn["account-status"], req("/api/account-status?includeHistory=1", { method: "GET", token }));
    check(`account-status web ${token}: as before (plan ${plan}, no CORS)`, r.status === 200 && r.data.profile.plan === plan && "subscriptionStatus" in r.data.profile && noCors(r) && !("aiConsent" in r.data) && !rpcCalls("has_ai_consent").length, r.data);
  }
  reset();
  r = await run(fn["account-status"], req("/api/account-status?includeHistory=1", { method: "GET", token: "t-free" }));
  check("account-status web free: no history (a Pro feature on the web)", r.data.history.length === 0);
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

// ══════════ 9b. stripe-webhook after an immediate deletion ══════════
// Deleting an account cancels its team's plan, then removes the team row. Stripe's
// customer.subscription.deleted arrives afterwards and must not create a new team row for
// that owner (it would block the auth-user delete). A live subscription still creates one.
{
  const Stripe = (await import("stripe")).default;
  const WHSEC = "whsec_run_ios_server_fake";
  ENV.STRIPE_SECRET_KEY = "sk_test_run_ios_server_fake";
  ENV.STRIPE_WEBHOOK_SECRET = WHSEC;
  const webhook = (await load("netlify/functions/stripe-webhook.mjs", "ios-stripe-webhook.test.mjs")).default;
  const signer = new Stripe("sk_test_run_ios_server_fake");
  const deliver = async (type, status) => {
    reset();
    const payload = JSON.stringify({
      id: `evt_${type}_${status}`, object: "event", type,
      data: { object: { id: "sub_team_gone", object: "subscription", status, customer: "cus_owner1", metadata: { supabase_user_id: USERS["t-owner"].id },
        items: { data: [{ price: { lookup_key: "business_5seat_monthly", recurring: { interval: "month" } } }] } } }
    });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
    const response = await webhook(new Request(`${SITE}/api/stripe-webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": header }, body: payload }));
    return { status: response.status, inserts: restCalls("POST", "/rest/v1/business_accounts").length };
  };
  let w = await deliver("customer.subscription.deleted", "canceled");
  check("webhook: a deleted subscription with no team row creates nothing", w.status === 200 && w.inserts === 0, w);
  w = await deliver("customer.subscription.updated", "incomplete_expired");
  check("webhook: an expired subscription with no team row creates nothing", w.status === 200 && w.inserts === 0, w);
  w = await deliver("customer.subscription.created", "active");
  check("webhook: a live subscription still creates the team (website unchanged)", w.status === 200 && w.inserts === 1, w);
  delete ENV.STRIPE_SECRET_KEY;
  delete ENV.STRIPE_WEBHOOK_SECRET;
}

// ══════════ 10. source checks: routes and wrapping ══════════
{
  const { readFileSync } = await import("node:fs");
  const src = (f) => readFileSync(path.join(root, "netlify/functions", f), "utf8");
  for (const f of ["account-status.mjs", "analyze.mts", "recovery-mode.mts", "recovery-update.mts", "recovery-case.mts", "privacy-data.mts", "legal-acceptance.mts", "ai-consent.mjs", "client-error.mjs", "feedback.mjs", "team-activity.mts"]) {
    const s = src(f);
    check(`source: ${f} default export is CORS-wrapped`, /export default withCors\(handler\);/.test(s));
    const methods = /method:\s*\[([^\]]*)\]/.exec(s.slice(s.indexOf("export const config")));
    check(`source: ${f} route lets OPTIONS through`, !methods || /"OPTIONS"/.test(methods[1]), methods?.[1]);
  }
  for (const f of ["create-checkout-session.mjs", "customer-portal.mjs", "byok-analyze.mts", "validate-openai-key.mts", "screenshot-preview.mjs", "stripe-webhook.mjs", "public-stats.mjs", "backup-now.mts"]) {
    check(`source: ${f} is not CORS-wrapped`, !/withCors/.test(src(f)));
  }
  const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
  check("netlify.toml: mobile-only commits skip the Netlify build", /^\s*ignore = "git diff --quiet \$CACHED_COMMIT_REF \$COMMIT_REF -- public netlify netlify.toml package.json package-lock.json supabase"/m.test(toml));
}

console.log(`ios server: ${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`(${logged.length} lines the functions logged; last 5:)\n  ${logged.slice(-5).join("\n  ").slice(0, 2000)}`);
  process.exit(1);
}
