// Regression checks for the November 2026 security pass (ids such as AI-1,
// SRV-3 are the audit's finding ids). Every fix has a check that the attack no
// longer works AND a twin that the legitimate request still behaves as before.
//
// No network, no keys, no accounts: fetch and Netlify.env are stubbed.
//
//   node tests/run-security-hardening.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE = "https://stub-project.supabase.test";
const ENV_NAMES = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
  "ADMIN_EMAILS", "REVIEW_ACCOUNT_EMAILS", "OPENAI_API_KEY", "OPENAI_BASE_URL", "ANALYSIS_MODEL", "ANALYSIS_MODEL_MINI", "RESEND_API_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ERROR_REPORT_SALT", "FEEDBACK_ALERT_EMAIL", "GETSCREENSHOT_API_KEY", "SITE_URL", "URL",
  "RECOVERY_JOB_SECRET", "AI_DAILY_CALL_CEILING", "RATE_LIMITS"];
for (const name of ENV_NAMES) delete process.env[name];
const ENV = {
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  ADMIN_EMAILS: "admin@example.com,unconfirmed-admin@example.com",
  OPENAI_API_KEY: "stub-openai-key",
  OPENAI_BASE_URL: "https://openai.stub.test/v1"
};
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const logged = [];
console.error = (...args) => logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
console.warn = () => {};

const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  }
}

// ── accounts ──
const id = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const CONFIRMED = "2026-10-01T00:00:00Z";
const USERS = {
  "t-free": { id: id(1), email: "free@example.com", email_confirmed_at: CONFIRMED },
  "t-pro": { id: id(2), email: "pro@example.com", email_confirmed_at: CONFIRMED },
  "t-admin": { id: id(5), email: "admin@example.com", email_confirmed_at: CONFIRMED },
  "t-admin-unconfirmed": { id: id(6), email: "unconfirmed-admin@example.com", email_confirmed_at: null }
};
const byId = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]));
const PROFILE = { [USERS["t-pro"].id]: { plan: "pro", subscription_status: "active" } };

// ── stubbed network ──
let state, calls;
function reset(over = {}) {
  state = { ai: "ok", quotaDenied: [], ...over };
  calls = [];
}
const rpcCalls = (name) => calls.filter((c) => c.host === "supabase" && c.path === `/rest/v1/rpc/${name}`);
const openaiCalls = () => calls.filter((c) => c.host === "openai");
const quotaKeys = () => rpcCalls("consume_api_quota").map((c) => c.body?.p_key);
function json(data, status = 200, headers = {}) {
  return new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}
const STUB_ANALYSIS = { verdict: "low_risk", score: 3, confidence: 90, threatType: "None", summary: "Stub.", evidence: [], counterEvidence: [], limitations: [], actions: ["Nothing."] };
function openaiAnswer(body) {
  const base = { id: "resp_stub", object: "response", created_at: 1, model: body?.model };
  const msg = (text) => [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }];
  if (state.ai === "incomplete") return json({ ...base, status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: msg("{\"verd") });
  if (state.ai === "refusal") return json({ ...base, status: "completed", output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "I cannot help with the message from 4111 1111 1111 1111" }] }] });
  if (state.ai === "garbage") return json({ ...base, status: "completed", output: msg("not json at all") });
  if (state.ai === "down") return json({ error: { message: "upstream down" } }, 500);
  const analysis = typeof state.ai === "object" ? state.ai : STUB_ANALYSIS;
  return json({ ...base, status: "completed", output: msg(JSON.stringify(analysis)) });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  let body;
  try { body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  if (url.hostname === "openai.stub.test") {
    calls.push({ host: "openai", method, path: url.pathname, body });
    return openaiAnswer(body);
  }
  if (state.extraFetch) {
    const answer = await state.extraFetch(url, method, body, headers);
    if (answer) return answer;
  }
  if (url.pathname === "/api/recovery-plan-background") {
    calls.push({ host: "background", headers: Object.fromEntries(headers.entries()), raw: init.body });
    return new Response(null, { status: 202 });
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
  if (state.supabase) {
    const answer = await state.supabase(call, url);
    if (answer) return answer;
  }
  const rpc = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.slice("/rest/v1/rpc/".length) : "";
  const uid = body?.p_user_id;
  switch (rpc) {
    case "consume_api_quota": {
      const denied = state.quotaDenied.some((prefix) => String(body?.p_key || "").startsWith(prefix));
      return json({ allowed: !denied, used: denied ? body.p_max_requests + 1 : 1, reset_at: "2026-11-01T11:00:00Z" });
    }
    case "check_protect_rate_limit":
      return json(true);
    case "consume_analysis":
      return json([{ allowed: true, used: 1, daily_limit: PROFILE[uid] ? 15 : 3, plan: PROFILE[uid] ? "pro" : "free" }]);
    case "consume_recovery_case":
      return json([{ allowed: true, used: 1, daily_limit: 1, plan: "free" }]);
    case "refund_analysis":
    case "refund_analysis_business":
      return new Response(null, { status: 204 });
    default:
      break;
  }
  if (rpc) return json({ message: `unexpected rpc ${rpc}` }, 404);
  const userIn = (/user_id=eq\.([0-9a-f-]{36})/.exec(pathQ) || [])[1] || (/[?&]id=eq\.([0-9a-f-]{36})/.exec(pathQ) || [])[1];
  if (url.pathname === "/rest/v1/business_members" && method === "GET") return json([]);
  if (url.pathname === "/rest/v1/profiles" && method === "GET") {
    const user = byId[userIn];
    return json(user ? [{ id: user.id, plan: "free", subscription_status: "inactive", ...(PROFILE[user.id] || {}) }] : []);
  }
  if (url.pathname === "/rest/v1/recovery_cases" && method === "POST") return json([{ id: "case-1", current_version: 1 }], 201);
  if (["/rest/v1/recovery_versions", "/rest/v1/recovery_tasks"].includes(url.pathname) && method === "POST") return new Response(null, { status: 201 });
  if (url.pathname === "/rest/v1/scan_history" && method === "POST") return json([{ id: 77 }], 201);
  if (["POST", "PATCH", "DELETE"].includes(method)) return new Response(null, { status: 201 });
  return json([]);
};

const SITE = "https://cybernetai.app";
const APP = "capacitor://localhost";
function req(pathname, { method = "POST", token = "", body, origin = "", headers = {} } = {}) {
  const h = { "Content-Type": "application/json", "user-agent": "Mozilla/5.0 run-security", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (origin) h.Origin = origin;
  const text = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${SITE}${pathname}`, { method, headers: h, body: ["GET", "HEAD", "OPTIONS"].includes(method) ? undefined : text });
}
const context = { ip: "203.0.113.9", site: { name: "cybernet-ai" }, deploy: { id: "deploy1" }, requestId: "req-1" };
let ipCounter = 0;
async function run(handler, request, ctx) {
  // A fresh documentation address per request, so the per-instance IP limiter
  // never trips across the many checks in this file.
  ipCounter++;
  const response = await handler(request, ctx || { ...context, ip: `198.51.100.${ipCounter % 250}` });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
const promptOf = (call) => JSON.stringify(call?.body?.input || "");

// ══════════ analyze.mts ══════════
const analyzeModule = await load("netlify/functions/analyze.mts");
const analyze = analyzeModule.default;
const AMBIGUOUS = "Hi, is this you? Please check this for me";

// SRV-3: prototype-named header lines
for (const header of ["Constructor", "__proto__", "hasOwnProperty", "toString"]) {
  const raw = `From: a@b.com\n${header}: x\nReply-To: c@d.com\nAuthentication-Results: spf=pass`;
  reset();
  let r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "email_headers", content: raw } }));
  check(`SRV-3 email_headers with a "${header}:" line: 200, not a 500`, r.status === 200 && r.data?.analysis, { status: r.status, data: r.data });
  reset();
  r = await run(analyze, req("/api/analyze", { token: "t-pro", body: { mode: "investigation", caseData: { title: "Case", artifacts: [{ type: "email_headers", content: raw }] } } }));
  check(`SRV-3 investigation artifact with a "${header}:" line: 200`, r.status === 200 && r.data?.analysis, { status: r.status, data: r.data });
}
{
  reset();
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "email_headers", content: "From: a@x.com\nReply-To: b@y.com\nAuthentication-Results: dmarc=fail" } }));
  check("SRV-3 twin: ordinary headers are still read (reply-to mismatch, DMARC fail)", r.status === 200 && r.data.serverEvidence.evidence.some((e) => /Reply-To domain/.test(e)) && r.data.serverEvidence.evidence.some((e) => /DMARC/.test(e)), r.data?.serverEvidence?.evidence);
}

// AI-1: the browser hint is capped
{
  reset();
  const huge = "A".repeat(200_000);
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS, localResult: { score: 40, verdict: "suspicious", reasons: Array(8).fill(0).map((_, i) => huge + i), counterEvidence: [huge], limitations: [huge] } } }));
  const prompt = promptOf(openaiCalls()[0]);
  check("AI-1 a huge browser hint never reaches the prompt in full", r.status === 200 && openaiCalls().length === 1 && prompt.length < 40_000, { status: r.status, len: prompt.length });
  const hint = analyzeModule.sanitizeBrowserResult({ score: 40, verdict: "suspicious", reasons: ["short reason", huge] });
  check("AI-1 each hint item is capped at 300 characters", hint.evidence?.every((e) => e.length <= 300) && hint.evidence[0] === "short reason", hint.evidence?.map((e) => e.length));
  const many = analyzeModule.sanitizeBrowserResult({ score: 40, confidence: 50, verdict: "suspicious", scamType: "Phish", reasons: Array(8).fill("x".repeat(300)).map((s, i) => s + i), counterEvidence: Array(5).fill("y".repeat(300)).map((s, i) => s + i) });
  check("AI-1 a hint still over 4,000 characters keeps only its numbers", !("evidence" in many) && many.score === 40 && many.verdict === "suspicious" && many.threatType === "Phish", many);
  const normal = analyzeModule.sanitizeBrowserResult({ score: 70, confidence: 80, verdict: "suspicious", reasons: ["Asks for a code"], counterEvidence: [], limitations: [] });
  check("AI-1 twin: a normal hint is unchanged", normal.evidence?.[0] === "Asks for a code" && normal.score === 70, normal);
  reset();
  const big = new Request(`${SITE}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer t-free" }, body: new ReadableStream({ start(c) { const chunk = new TextEncoder().encode("x".repeat(1_000_000)); for (let i = 0; i < 6; i++) c.enqueue(chunk); c.close(); } }), duplex: "half" });
  const r2 = await run(analyze, big);
  check("AI-1 a 6 MB body is now refused (cap is the picture size plus ~400 KB)", r2.status === 413, r2.status);
  reset();
  const img = "data:image/png;base64," + "A".repeat(4_400_000);
  const r3 = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "image", content: "Screenshot", imageData: img } }));
  check("AI-1 twin: a maximum-size picture still goes through", r3.status === 200, r3.status);
}

// SRV-AUTH-13: no body is read before the session is checked
{
  reset();
  const r = await run(analyze, req("/api/analyze", { body: "{not json" }));
  check("SRV-AUTH-13 signed out: 401 before the body is parsed", r.status === 401 && r.data.code === "sign_in_required", r);
}

// AI-11: a text check never carries a picture
{
  reset();
  const img = "data:image/png;base64,iVBORw0KGgo=";
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS, imageData: img } }));
  check("AI-11 type text + imageData: no input_image sent", openaiCalls().length === 1 && !promptOf(openaiCalls()[0]).includes("input_image"), promptOf(openaiCalls()[0]).slice(0, 200));
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "image", content: "Screenshot", imageData: img } }));
  check("AI-11 twin: a picture check still sends the picture", promptOf(openaiCalls()[0]).includes("input_image"));
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "image", content: "Screenshot", imageData: "data:image/svg+xml;base64,PHN2Zz4=" } }));
  check("AI-11 an SVG data URL is not forwarded", !promptOf(openaiCalls()[0]).includes("input_image"));
}

// AI-17: codes and card numbers are redacted in the model's copy only
{
  reset();
  const msg = "Your verification code is 482913. Card 4111 1111 1111 1111. Call +971 50 123 4567";
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: msg } }));
  const prompt = promptOf(openaiCalls()[0]);
  check("AI-17 the OTP and the card number are not sent to OpenAI", openaiCalls().length === 1 && !prompt.includes("482913") && !prompt.includes("4111 1111 1111 1111") && prompt.includes("[REDACTED CODE]") && prompt.includes("[REDACTED CARD]"), prompt.slice(0, 600));
  check("AI-17 twin: the phone number the analysis needs is kept", prompt.includes("+971 50 123 4567"));
  check("AI-17 twin: the rules still saw the original (the code request is evidence)", r.data.serverEvidence.evidence.length > 0 && JSON.stringify(r.data.serverEvidence).includes("4111"), r.data.serverEvidence.evidence);
  const red = analyzeModule.redactForModel;
  check("AI-17 a 13-19 digit number that fails Luhn is kept (an order number)", red("Order 1234567890123 shipped") === "Order 1234567890123 shipped");
}

// AI-2: billed-but-unusable answers are refunded only a few times a day
for (const kind of ["incomplete", "refusal", "garbage"]) {
  reset({ ai: kind });
  let r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check(`AI-2 ${kind}: first ones are still refunded`, r.status === 200 && r.data.aiUsed === false && rpcCalls("refund_analysis").length === 1 && quotaKeys().some((k) => k.startsWith("g:refund:day:")), { status: r.status, keys: quotaKeys() });
  reset({ ai: kind, quotaDenied: ["g:refund:day:"] });
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check(`AI-2 ${kind}: past the daily refund cap the attempt counts`, r.status === 200 && rpcCalls("refund_analysis").length === 0 && r.data.usage.used === 1, { usage: r.data?.usage });
}
{
  reset({ ai: "refusal" });
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-14 the refusal's own text (which quotes the submission) is not logged", !logged.some((l) => l.includes("4111 1111")), logged.filter((l) => l.includes("refus")).slice(-2));
  reset({ ai: "down" });
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-2 twin: an outage (no answer) is always refunded, without using the refund cap", rpcCalls("refund_analysis").length === 1 && !quotaKeys().some((k) => k.startsWith("g:refund:day:")), { keys: quotaKeys(), status: r.status });
  reset({ quotaDenied: ["g:aicalls:day:"] });
  const r2 = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-2 per-account daily AI-call cap: no OpenAI call, rule answer, refunded", r2.status === 200 && openaiCalls().length === 0 && r2.data.aiUsed === false && rpcCalls("refund_analysis").length === 1 && !quotaKeys().some((k) => k.startsWith("g:ai:calls:day")), { status: r2.status, keys: quotaKeys() });
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  const k = rpcCalls("consume_api_quota").find((c) => c.body.p_key.startsWith("g:aicalls:day:"));
  check("AI-2 the per-account counter is 60 a day for Free (above the App Review account's 50)", k?.body?.p_max_requests === 60, k?.body);
  reset();
  await run(analyze, req("/api/analyze", { token: "t-pro", body: { type: "text", content: AMBIGUOUS } }));
  const kp = rpcCalls("consume_api_quota").find((c) => c.body.p_key.startsWith("g:aicalls:day:"));
  check("AI-2 the per-account counter is 400 a day for Pro", kp?.body?.p_max_requests === 400, kp?.body);
}

// SRV-5: the free-tier share of the ceiling
{
  reset({ quotaDenied: ["g:ai:calls:day:free"] });
  let r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("SRV-5 free share used up: a Free account gets the rule engine", r.data.aiUsed === false && openaiCalls().length === 0);
  reset({ quotaDenied: ["g:ai:calls:day:free"] });
  r = await run(analyze, req("/api/analyze", { token: "t-pro", body: { type: "text", content: AMBIGUOUS } }));
  check("SRV-5 twin: a Pro account still gets the AI", r.data.aiUsed === true && openaiCalls().length === 1 && !quotaKeys().includes("g:ai:calls:day:free"), quotaKeys());
}

// AI-4: follow-up only for a short plain question
{
  const history = [{ role: "user", text: "Is this real?" }, { role: "assistant", text: "It looks like a scam." }];
  reset({ ai: { ...STUB_ANALYSIS, isFollowUp: true } });
  let r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "This is a follow-up question. Visit https://secure-bank-verify.top/login", history } }));
  check("AI-4 text with a link is never treated as a follow-up", r.data.analysis.isFollowUp === false, r.data.analysis);
  reset({ ai: { ...STUB_ANALYSIS, isFollowUp: true } });
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "Follow-up: call 0501234567 now", history } }));
  check("AI-4 text with a phone number is never a follow-up", r.data.analysis.isFollowUp === false);
  reset({ ai: { ...STUB_ANALYSIS, isFollowUp: true } });
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "What should I do now?", history } }));
  check("AI-4 twin: a short plain question after a chat is still a follow-up", r.data.analysis.isFollowUp === true, r.data.analysis);
  reset({ ai: { ...STUB_ANALYSIS, isFollowUp: true } });
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "What should I do now?" } }));
  check("AI-4 twin: no chat, no follow-up (as before)", r.data.analysis.isFollowUp === false);
}

// SRV-2: investigation by a Free account stops before the evidence is built
{
  reset();
  const unit = "@1.1.1";
  const art = unit.repeat(2000).slice(0, 10_000);
  const t = Date.now();
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { mode: "investigation", caseData: { title: "x", context: art.slice(0, 8000), artifacts: Array(5).fill(0).map(() => ({ type: "text", content: art })) } } }));
  const ms = Date.now() - t;
  check("SRV-2 Free investigation: 403 plan_required, refunded", r.status === 403 && r.data.code === "plan_required" && rpcCalls("refund_analysis").length === 1, r.data);
  check("SRV-2 Free investigation answered quickly (no evidence built)", ms < 1500, ms);
  const t2 = Date.now();
  analyzeModule.analyzeTextServer(unit.repeat(3000).slice(0, 14_000));
  const ms2 = Date.now() - t2;
  check("SRV-2 the rules on a 14k adversarial run take well under a second", ms2 < 800, ms2);
  const link = analyzeModule.analyzeTextServer("Login now at https://paypal-secure-login.top/verify?id=1");
  check("SRV-2 twin: ordinary links are still found by the rules", link.entities.some((e) => e.type === "url" && e.value === "https://paypal-secure-login.top/verify?id=1"), link.entities);
}

// AI-16: the public GET no longer reports configuration details
{
  const r = await run(analyze, new Request(`${SITE}/api/analyze`));
  check("AI-16 GET: no secureAccountLimitsEnabled / modelRetiresOn", r.status === 200 && !("secureAccountLimitsEnabled" in r.data) && !("modelRetiresOn" in r.data) && r.data.online === true && "aiEnabled" in r.data && "model" in r.data, r.data);
}

// AI-13: the admin bypass needs a confirmed email
{
  reset();
  let r = await run(analyze, req("/api/analyze", { token: "t-admin-unconfirmed", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-13 an unconfirmed admin address is an ordinary account", rpcCalls("consume_analysis").length === 1 && r.data.usage.limit !== 999999, r.data?.usage);
  reset();
  r = await run(analyze, req("/api/analyze", { token: "t-admin", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-13 twin: the confirmed admin keeps the bypass", rpcCalls("consume_analysis").length === 0 && r.data.usage.limit === 999999, r.data?.usage);
}

// AI-8: the scammer's own number or link is never given back as advice
{
  const lure = { ...STUB_ANALYSIS, verdict: "suspicious", score: 60, actions: ["Call +971 50 123 4567 to verify your account.", "Call +971 50 123 4567 to report the fraud.", "Do not call +971 50 123 4567.", "Block +971 50 123 4567 and delete the message.", "Change your password."] };
  reset({ ai: lure });
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "Your account is locked. Call +971 50 123 4567 now." } }));
  const acts = r.data?.analysis?.actions || [];
  check("AI-8 an action to call the number from the message is dropped", !acts.some((a) => /^Call \+971/.test(a)) && acts.some((a) => /official app/.test(a)), acts);
  check("AI-8 'call their number to report the fraud' is dropped too", !acts.some((a) => /to report the fraud/.test(a)), acts);
  check("AI-8 twin: the warning lines and ordinary advice stay", acts.includes("Do not call +971 50 123 4567.") && acts.includes("Block +971 50 123 4567 and delete the message.") && acts.includes("Change your password."), acts);
}

export { check, reset, run, req, state, calls, rpcCalls, quotaKeys, USERS, SITE, APP, json, load, ENV, logged };

// More sections are appended below this line by later fixes.
// @@SECTIONS@@

// ══════════ screenshot-preview (SRV-AUTH-1, SRV-1, AI-3, SRV-10) ══════════
{
  const shotMod = await load("netlify/functions/screenshot-preview.mjs");
  const shot = shotMod.default;
  shotMod.previewDeps.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  let imageHost = [{ address: "93.184.216.34", family: 4 }];
  shotMod.previewDeps.imageLookup = async () => imageHost;
  let imageUrl = "https://cdn.microlink.test/shot.png";
  let imageType = "image/png";
  let providerHits = 0;
  const providers = async (url) => {
    if (url.hostname === "api.microlink.io") providerHits++;
    if (url.hostname === "api.microlink.io") return json({ status: "success", statusCode: 200, data: { screenshot: { url: imageUrl } } });
    if (url.hostname === "cdn.microlink.test") return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": imageType } });
    return null;
  };
  const appShot = (token) => req("/api/screenshot-preview", { token, origin: APP, headers: { "X-CyberNet-Platform": "ios" }, body: { url: "https://example.com" } });

  reset({ extraFetch: providers });
  let r = await run(shot, appShot("t-free"));
  check("SRV-AUTH-1 app path, Free account: still gets a picture", r.status === 200 && /^data:image\/png;base64,/.test(r.data?.screenshot || ""), { status: r.status, data: r.data });
  const keys = quotaKeys();
  check("SRV-AUTH-1 app path, Free account: its own app cap is checked before the shared pool", keys.indexOf(`shot:appuser:day:${USERS["t-free"].id}`) >= 0 && keys.indexOf(`shot:appuser:day:${USERS["t-free"].id}`) < keys.indexOf("shot:app:day"), keys);

  reset({ extraFetch: providers, quotaDenied: ["shot:appuser:day:"] });
  r = await run(shot, appShot("t-free"));
  check("SRV-AUTH-1 over the per-account app cap: 429, the shared pool is not touched", r.status === 429 && !quotaKeys().includes("shot:app:day"), { status: r.status, keys: quotaKeys() });

  reset({ extraFetch: providers });
  r = await run(shot, appShot("t-pro"));
  check("SRV-AUTH-1 twin: a Pro account in the app is not counted against the free pool", r.status === 200 && !quotaKeys().includes("shot:app:day") && !quotaKeys().some((k) => k.startsWith("shot:appuser:")), quotaKeys());

  reset({ extraFetch: providers });
  r = await run(shot, req("/api/screenshot-preview", { token: "t-free", body: { url: "https://example.com" } }));
  check("SRV-AUTH-1 twin: a Free account on the website still gets 403", r.status === 403, r.status);

  reset({ extraFetch: providers, supabase: async (call) => (call.path === "/rest/v1/rpc/consume_api_quota" ? json({ message: "down" }, 503) : null) });
  providerHits = 0;
  r = await run(shot, appShot("t-free"));
  check("AI-3 quota service down: the free app path fails closed (no paid credit spent)", r.status === 429 && providerHits === 0, { status: r.status, providerHits });
  reset({ extraFetch: providers, supabase: async (call) => (call.path === "/rest/v1/rpc/consume_api_quota" ? json({ message: "down" }, 503) : null) });
  r = await run(shot, req("/api/screenshot-preview", { token: "t-pro", body: { url: "https://example.com" } }));
  check("AI-3 twin: a Pro website account still gets its preview when the quota service is down", r.status === 200, r.status);

  imageType = "image/svg+xml";
  reset({ extraFetch: providers });
  r = await run(shot, req("/api/screenshot-preview", { token: "t-pro", body: { url: "https://example.com" } }));
  check("SRV-10 a non-picture content type from the provider is refused", r.status === 503 && !r.data?.screenshot, r);
  imageType = "image/png";
  imageUrl = "http://cdn.microlink.test/shot.png";
  reset({ extraFetch: providers });
  r = await run(shot, req("/api/screenshot-preview", { token: "t-pro", body: { url: "https://example.com" } }));
  check("SRV-10 an http image address is refused", r.status === 503, r.status);
  imageUrl = "https://cdn.microlink.test/shot.png";
  imageHost = [{ address: "10.0.0.5", family: 4 }];
  reset({ extraFetch: providers });
  r = await run(shot, req("/api/screenshot-preview", { token: "t-pro", body: { url: "https://example.com" } }));
  check("SRV-10 an image host that resolves to a private address is refused", r.status === 503, r.status);
  imageHost = [{ address: "93.184.216.34", family: 4 }];
  reset({ extraFetch: providers });
  r = await run(shot, req("/api/screenshot-preview", { token: "t-pro", body: { url: "https://example.com" } }));
  check("SRV-10 twin: a normal provider picture still comes through", r.status === 200 && /^data:image\/png;base64,/.test(r.data?.screenshot || ""), r.status);
}

// AI-4 (page): a follow-up answer is only shown as one when the local engine
// does not itself warn about the new text.
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(path.join(root, "public/script.js"), "utf8");
  check("AI-4 page: follow-up view needs the local engine not to warn", /const followUp=Boolean\(deep\?\.isFollowUp\)&&!localWarns;/.test(src) && /localWarns=\["suspicious","malicious"\]\.includes/.test(src));
  const legacy = readFileSync(path.join(root, "public/legacy/script.js"), "utf8");
  check("AI-4 page: the legacy build carries the same rule", legacy.includes("localWarns"));
}

// ══════════ BYOK, key checks, addresses, admin (AI-6, SRV-7, SRV-8, SRV-AUTH-5) ══════════
{
  const KEY = "sk-" + "a".repeat(40);
  const byok = (await load("netlify/functions/byok-analyze.mts")).default;
  const openaiStatus = (status, message) => async (url) =>
    url.hostname === "api.openai.com" ? json({ error: { message } }, status) : null;

  reset({ extraFetch: openaiStatus(401, "Incorrect API key provided") });
  let r = await run(byok, req("/api/byok-analyze", { token: "t-free", headers: { "x-cybernet-openai-key": KEY }, body: { type: "text", content: "hello" } }));
  check("AI-6 BYOK: a rejected key is not refunded (no free key checker)", r.status === 401 && rpcCalls("refund_analysis").length === 0, { status: r.status, refunds: rpcCalls("refund_analysis").length });
  check("AI-6 BYOK: burst limits are checked per account", quotaKeys().some((k) => k.startsWith("g:byok-analyze:u60:")), quotaKeys());

  reset({ extraFetch: openaiStatus(500, "internal upstream detail xyz") });
  r = await run(byok, req("/api/byok-analyze", { token: "t-free", headers: { "x-cybernet-openai-key": KEY }, body: { type: "text", content: "hello" } }));
  check("AI-6 twin: an OpenAI outage is still refunded", rpcCalls("refund_analysis").length === 1, { status: r.status });
  check("SRV-AUTH-11 BYOK 5xx: no upstream text in the answer", !JSON.stringify(r.data).includes("xyz"), r.data);

  reset({ quotaDenied: ["g:byok-analyze:"] });
  r = await run(byok, req("/api/byok-analyze", { token: "t-free", headers: { "x-cybernet-openai-key": KEY }, body: { type: "text", content: "hello" } }));
  check("AI-6 BYOK over the burst limit: 429 before anything is reserved", r.status === 429 && rpcCalls("consume_analysis").length === 0, { status: r.status });

  const validate = (await load("netlify/functions/validate-openai-key.mts")).default;
  reset({ quotaDenied: ["g:validate-openai-key:u3600:"] });
  r = await run(validate, req("/api/validate-openai-key", { token: "t-free", body: { apiKey: KEY } }));
  check("AI-6 key check: the per-account limit is durable (429 from the quota table)", r.status === 429, r);
  reset({ extraFetch: async (url) => (url.hostname === "api.openai.com" ? json({ data: [{ id: "gpt-6-luna" }] }) : null) });
  r = await run(validate, req("/api/validate-openai-key", { token: "t-free", body: { apiKey: KEY } }));
  check("AI-6 twin: a real key check still works", r.status === 200 && r.data.valid === true && r.data.model === "gpt-6-luna", r);
  reset();
  r = await run(validate, req("/api/validate-openai-key", { body: { apiKey: KEY } }));
  check("SRV-AUTH-11 twin: signed out keeps its own 401 message", r.status === 401 && /sign in/i.test(r.data.error), r);

  const guard = await load("netlify/lib/abuse-guard.mjs");
  const CF_EDGE = "104.16.0.1";
  const viaCf = (host) => new Request(`https://${host}/api/x`, { headers: { "cf-connecting-ip": "203.0.113.50" } });
  check("SRV-8 custom domain behind Cloudflare: the visitor address is used", guard.clientAddress(viaCf("cybernetai.app"), { ip: CF_EDGE }) === "203.0.113.50");
  check("SRV-8 netlify.app host: CF-Connecting-IP is not believed", guard.clientAddress(viaCf("cybernet-ai.netlify.app"), { ip: CF_EDGE }) === CF_EDGE);
  check("SRV-8 twin: a direct visitor is their own address", guard.clientAddress(new Request("https://cybernetai.app/api/x"), { ip: "198.51.100.7" }) === "198.51.100.7");

  // SRV-5: Recovery plans and updates use the website lane's option name ({ free }).
  reset({ quotaDenied: ["g:ai:calls:day:free"] });
  check("SRV-5 allowAiCall { free: true } stops at the free share", (await guard.allowAiCall("recovery-plan", undefined, { free: true })) === false);
  reset({ quotaDenied: ["g:ai:calls:day:free"] });
  check("SRV-5 twin: a paid caller is not stopped by the free share", (await guard.allowAiCall("recovery-plan", undefined, {})) === true && !quotaKeys().includes("g:ai:calls:day:free"), quotaKeys());

  // SRV-AUTH-17: the Apple ID is checked before anything is revoked.
  {
    const siwa = await load("netlify/lib/apple-siwa.mjs");
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const config = { teamId: "TEAM", keyId: "KEY", clientId: "app.cybernetai", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) };
    const idToken = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;
    const appleRun = async (sub, expectedSub) => {
      const paths = [];
      reset({ extraFetch: async (url) => {
        if (url.hostname !== "appleid.apple.com") return null;
        paths.push(url.pathname);
        return url.pathname === "/auth/token" ? json({ refresh_token: "r", id_token: idToken(sub) }) : new Response(null, { status: 200 });
      } });
      const result = await siwa.revokeAppleTokens("c".repeat(40), config, { expectedSub });
      return { result, paths };
    };
    let a = await appleRun("other-apple-id", "account-apple-id");
    check("SRV-AUTH-17 a different Apple ID is not revoked (no /auth/revoke call)", a.result.reason === "different_apple_id" && !a.paths.includes("/auth/revoke"), a);
    a = await appleRun("account-apple-id", "account-apple-id");
    check("SRV-AUTH-17 twin: the account's own Apple ID is revoked", a.result.revoked === true && a.paths.includes("/auth/revoke"), a);
  }

  const supa = await load("netlify/lib/supabase.mjs");
  check("SRV-AUTH-5 isAdminUser: an unconfirmed admin address is not admin", supa.isAdminUser({ email: "admin@example.com", email_confirmed_at: null }) === false);
  check("SRV-AUTH-5 twin: the confirmed admin is", supa.isAdminUser({ email: "admin@example.com", email_confirmed_at: CONFIRMED }) === true);

  const feedback = (await load("netlify/functions/feedback.mjs")).default;
  reset();
  const chunked = new Request(`${SITE}/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x".repeat(400_000))); c.close(); } }), duplex: "half" });
  r = await run(feedback, chunked);
  check("SRV-11 feedback: a chunked oversized body is refused with 413", r.status === 413, r.status);
}

// ── SRV-4 / AI-7 / SRV-AUTH-13 / SRV-AUTH-8 / SRV-9 / AI-15: Recovery ──
{
  const recoveryMod = await import(pathToFileURL(path.join(root, "netlify/functions/recovery-mode.mts")).href);
  const recovery = recoveryMod.default;
  const { cleanQuickAnswers, signBackgroundJob, verifyBackgroundSignature } = recoveryMod;

  reset();
  let r = await run(recovery, req("/api/recovery-mode", { body: "{not json" }));
  check("SRV-AUTH-13 recovery-mode signed out: 401 before the body is read", r.status === 401 && r.data.code === "sign_in_required", r);

  const qa = cleanQuickAnswers({ sharedOtp: true, sentMoney: false, clickedLink: "yes", nested: { a: 1 }, "bad key": true, ["x".repeat(40)]: true, __proto__: { polluted: true } });
  check("SRV-4 quick answers: true/false camelCase flags only", JSON.stringify(qa) === JSON.stringify({ sharedOtp: true, sentMoney: false }), qa);
  const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${"abcdefghijklmnopqrstuvwxyz"[Math.floor(i / 26)]}`, true]));
  check("SRV-4 quick answers: at most 20", Object.keys(cleanQuickAnswers(many)).length === 20);

  reset();
  r = await run(recovery, req("/api/recovery-mode", { token: "t-free", body: {
    description: "I clicked a link and entered my bank password, then they called asking for the code.",
    quickAnswers: { clickedLink: true, sharedPassword: true, junk: "Z".repeat(200_000), deep: { x: "Y".repeat(10_000) } },
    accountsInvolved: ["My bank " + "B".repeat(5_000), "card 4111 1111 1111 1111"],
    incidentTime: "today", region: "United Arab Emirates" } }));
  const job = calls.find((c) => c.host === "background");
  check("SRV-4 recovery-mode still answers with the rule-based plan", r.status === 200 && r.data.caseId === "case-1", { status: r.status, data: r.data?.error });
  check("SRV-4 the background job is small (junk quick answers dropped)", job && job.raw.length < 20_000, job?.raw?.length);
  const parsed = job ? JSON.parse(job.raw) : {};
  check("SRV-4 the job's quick answers are the two real flags", JSON.stringify(parsed.input?.quickAnswers) === JSON.stringify({ clickedLink: true, sharedPassword: true }), parsed.input?.quickAnswers);
  check("AI-7 account names capped at 80 and redacted", (parsed.input?.accountsInvolved || []).every((a) => a.length <= 80) && !JSON.stringify(parsed.input?.accountsInvolved).includes("4111 1111"), parsed.input?.accountsInvolved);
  check("AI-12 the job carries the account id for the safety identifier", parsed.input?.userId === USERS["t-free"].id);
  check("SRV-AUTH-8 the trigger sends a timestamp header with the signature", /^\d{13}$/.test(job?.headers?.["x-cybernet-signed-at"] || "") && /^[0-9a-f]{64}$/.test(job?.headers?.["x-cybernet-signature"] || ""), job?.headers);
  check("SRV-AUTH-8 the trigger's signature verifies", job && await verifyBackgroundSignature(job.raw, job.headers["x-cybernet-signature"], job.headers["x-cybernet-signed-at"]));

  const body = JSON.stringify({ kind: "start", caseId: "c" });
  const now = Date.now();
  const fresh = await signBackgroundJob(body, now);
  check("SRV-AUTH-8 a fresh signature verifies", await verifyBackgroundSignature(body, fresh.signature, fresh.signedAt, now + 1000));
  check("SRV-AUTH-8 a tampered body is refused", !(await verifyBackgroundSignature(body + " ", fresh.signature, fresh.signedAt, now)));
  check("SRV-AUTH-8 a changed timestamp is refused", !(await verifyBackgroundSignature(body, fresh.signature, String(now + 1), now)));
  check("SRV-AUTH-8 no timestamp is refused (old body-only signatures)", !(await verifyBackgroundSignature(body, fresh.signature, "", now)));
  check("SRV-AUTH-8 a 16-minute-old job is refused (replay)", !(await verifyBackgroundSignature(body, fresh.signature, fresh.signedAt, now + 16 * 60_000)));
  check("SRV-AUTH-8 a job 14 minutes old still runs (platform retry)", await verifyBackgroundSignature(body, fresh.signature, fresh.signedAt, now + 14 * 60_000));
  check("SRV-AUTH-8 a job dated 2 minutes ahead is refused", !(await verifyBackgroundSignature(body, fresh.signature, fresh.signedAt, now - 2 * 60_000)));
  check("SRV-AUTH-8 a malformed signature is refused without throwing", !(await verifyBackgroundSignature(body, "z".repeat(64), fresh.signedAt, now)) && !(await verifyBackgroundSignature(body, "ab", fresh.signedAt, now)));
  ENV.RECOVERY_JOB_SECRET = "stub-dedicated-job-secret";
  check("SRV-AUTH-8 RECOVERY_JOB_SECRET, once set, is the key", !(await verifyBackgroundSignature(body, fresh.signature, fresh.signedAt, now)) && await verifyBackgroundSignature(body, (await signBackgroundJob(body, now)).signature, String(now), now));
  delete ENV.RECOVERY_JOB_SECRET;

  const background = (await import(pathToFileURL(path.join(root, "netlify/functions/recovery-plan-background.mts")).href)).default;
  reset();
  const bg = await background(new Request(`${SITE}/api/recovery-plan-background`, { method: "POST", headers: { "X-CyberNet-Signature": fresh.signature }, body }));
  check("SRV-9 background job without its timestamp: 403", bg.status === 403, bg.status);
  const huge = await background(new Request(`${SITE}/api/recovery-plan-background`, { method: "POST", body: "x".repeat(400_000) }));
  check("SRV-9 an oversized body is refused before the signature check", huge.status === 413, huge.status);
}


console.log(`security hardening: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
