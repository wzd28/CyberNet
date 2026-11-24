// Regression tests for the November 2026 security audit fixes (server lane).
// Each block names the audit id it covers. No network: Supabase, OpenAI and
// the other providers are stubbed through globalThis.fetch.
//
//   node tests/run-security-hardening.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SUPABASE = "https://stub-project.supabase.test";
const ENV_NAMES = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
  "ADMIN_EMAILS", "REVIEW_ACCOUNT_EMAILS", "OPENAI_API_KEY", "OPENAI_BASE_URL", "ANALYSIS_MODEL", "ANALYSIS_MODEL_MINI", "RESEND_API_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ERROR_REPORT_SALT", "ERROR_ALERTS", "AI_DAILY_CALL_CEILING", "RATE_LIMITS", "RECOVERY_JOB_SECRET",
  "GETSCREENSHOT_API_KEY", "SITE_URL", "URL"];
for (const name of ENV_NAMES) delete process.env[name];
const ENV = {
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  ADMIN_EMAILS: "admin@example.com",
  OPENAI_API_KEY: "stub-openai-key",
  OPENAI_BASE_URL: "https://openai.stub.test/v1",
  ERROR_ALERTS: "off"
};
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const logged = [];
const quiet = { log: console.log };
console.error = (...args) => logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
console.warn = () => {};

let checks = 0, failures = 0;
export function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    quiet.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  }
}

const id = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const CONFIRMED = "2026-10-01T00:00:00Z";
const USERS = {
  "t-free": { id: id(1), email: "free@example.com", email_confirmed_at: CONFIRMED },
  "t-pro": { id: id(2), email: "pro@example.com", email_confirmed_at: CONFIRMED },
  "t-admin": { id: id(5), email: "admin@example.com", email_confirmed_at: CONFIRMED },
  "t-admin-unconfirmed": { id: id(6), email: "admin@example.com", email_confirmed_at: null }
};
const PRO = new Set([USERS["t-pro"].id]);

let state, calls;
function reset(over = {}) {
  state = { quotaDenied: [], openai: "ok", ...over };
  calls = [];
}
const rpc = (name) => calls.filter((c) => c.path === `/rest/v1/rpc/${name}`);
const quotaKeys = () => rpc("consume_api_quota").map((c) => c.body?.p_key);
const openaiCalls = () => calls.filter((c) => c.host === "openai");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
let aiAnswer = () => ({ verdict: "low_risk", score: 5, confidence: 80, threatType: "None", summary: "Looks fine.", evidence: ["Stub."], counterEvidence: [], limitations: [], actions: ["Do nothing."] });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = String(init.method || "GET").toUpperCase();
  let body;
  try { body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  const headers = new Headers(init.headers || {});
  if (url.hostname === "openai.stub.test") {
    calls.push({ host: "openai", path: url.pathname, body, raw: init.body });
    if (state.openai === "incomplete") {
      return json({ id: "r", object: "response", created_at: 1, status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, model: body?.model, output: [] });
    }
    return json({ id: "r", object: "response", created_at: 1, status: "completed", model: body?.model, output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(aiAnswer()), annotations: [] }] }] });
  }
  if (url.hostname === "api.microlink.io") {
    calls.push({ host: "microlink", target: url.searchParams.get("url") });
    return json({ status: "success", statusCode: 200, data: { screenshot: { url: state.shotImageUrl || "https://img.microlink.test/shot.jpg" } } });
  }
  if (url.hostname.startsWith("img.")) {
    calls.push({ host: "img", path: url.pathname });
    const size = state.shotBytes || 4;
    return new Response(new Uint8Array(size), { headers: { "content-type": state.shotType || "image/jpeg" } });
  }
  if (url.pathname === "/api/recovery-plan-background") {
    calls.push({ host: "background", headers: Object.fromEntries(headers.entries()), raw: init.body });
    return new Response(null, { status: 202 });
  }
  if (url.origin !== SUPABASE) return json({ message: "unexpected" }, 599);
  const call = { host: "supabase", method, path: decodeURIComponent(url.pathname + url.search), body, auth: headers.get("authorization") };
  calls.push(call);
  if (url.pathname === "/auth/v1/user") {
    const user = USERS[(call.auth || "").replace(/^Bearer /, "")];
    return user ? json(user) : json({ msg: "invalid" }, 401);
  }
  const name = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.slice(13) : "";
  if (name === "consume_api_quota" && state.quotaFail) return json({ message: "down" }, 500);
  if (url.pathname === "/rest/v1/profiles" && method === "GET") {
    const uid = (/id=eq\.([0-9a-f-]+)/.exec(call.path) || [])[1];
    return json([{ id: uid, full_name: "T", plan: PRO.has(uid) ? "pro" : "free", subscription_status: PRO.has(uid) ? "active" : null }]);
  }
  if (name === "consume_api_quota") {
    const denied = state.quotaDenied.some((p) => String(body?.p_key || "").startsWith(p));
    return json({ allowed: !denied, used: denied ? body.p_max_requests + 1 : 1, reset_at: "2026-11-24T12:00:00Z" });
  }
  if (name === "check_protect_rate_limit") return json(true);
  if (name === "consume_analysis") return json([{ allowed: true, used: 1, daily_limit: PRO.has(body.p_user_id) ? 15 : 3, plan: PRO.has(body.p_user_id) ? "pro" : "free" }]);
  if (name === "refund_analysis") return new Response(null, { status: 204 });
  if (name === "consume_recovery_case") return json([{ allowed: true, used: 1, daily_limit: 1, plan: "free" }]);
  if (url.pathname === "/rest/v1/recovery_cases" && method === "POST") return json([{ id: "case-1", current_version: 1 }], 201);
  if (["/rest/v1/recovery_versions", "/rest/v1/recovery_tasks"].includes(url.pathname) && method === "POST") return new Response(null, { status: 201 });
  if (url.pathname === "/rest/v1/business_members") return json([]);
  if (url.pathname === "/rest/v1/scan_history" && method === "POST") return json([{ id: 1 }], 201);
  return json([]);
};

const SITE = "https://cybernetai.app";
function req(pathname, { method = "POST", token = "", body, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", "user-agent": "Mozilla/5.0 run-security-hardening", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const text = body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body));
  return new Request(`${SITE}${pathname}`, { method, headers: h, body: method === "GET" ? undefined : text });
}
const context = { ip: "203.0.113.9", requestId: "req-1" };
async function run(handler, request, ctx = context) {
  const response = await handler(request, ctx);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}

const analyze = (await import(pathToFileURL(path.join(root, "netlify/functions/analyze.mts")).href)).default;
const AMBIGUOUS = "Hi, is this you in the photo? Reply when you can.";

// ── AI-16: the public GET no longer says whether the account limits are on ──
{
  reset();
  const r = await run(analyze, req("/api/analyze", { method: "GET" }));
  check("AI-16 GET /api/analyze: no secureAccountLimitsEnabled", r.status === 200 && r.data.online === true && !("secureAccountLimitsEnabled" in r.data), r.data);
}

// ── SRV-AUTH-13: signed out, the body is never read ──
{
  reset();
  const r = await run(analyze, req("/api/analyze", { body: { type: "text", content: "x".repeat(100) } }));
  check("SRV-AUTH-13 signed out: 401 before anything is reserved", r.status === 401 && r.data.code === "sign_in_required" && !rpc("consume_analysis").length, r);
}

// ── AI-1: oversized browser hints are cut before they reach the prompt ──
{
  reset();
  const huge = "A".repeat(500_000); // 8 x 500 KB = 4 MB, inside the body cap
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS, localResult: { score: 40, verdict: "suspicious", reasons: Array.from({ length: 8 }, (_, i) => huge + i) } } }));
  const sent = openaiCalls()[0]?.raw || "";
  check("AI-1 huge hint: the request still works", r.status === 200, r.status);
  check("AI-1 huge hint: the prompt stays small (under 60 KB)", openaiCalls().length === 1 && sent.length < 60_000, sent.length);
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS, localResult: { score: 40, verdict: "suspicious", reasons: ["Asks you to reply to an unknown sender."] } } }));
  check("AI-1 normal hint: its reason still reaches the model", (openaiCalls()[0]?.raw || "").includes("Asks you to reply to an unknown sender."));
}

// ── AI-1: the body cap is now about 5 MB, not 6 MB ──
{
  reset();
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "hi", imageData: "x".repeat(5_200_000) } }));
  check("AI-1 a 5.2 MB body is refused with 413", r.status === 413, r.status);
}

// ── SRV-3: prototype-named header lines no longer crash the check ──
for (const line of ["Constructor: x", "__proto__: x", "hasOwnProperty: x", "toString: y"]) {
  reset();
  const headers = `From: a@b.com\nTo: c@d.com\n${line}\nSubject: hello`;
  let r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "email_headers", content: headers } }));
  check(`SRV-3 email_headers with "${line}": 200, not 500`, r.status === 200 && r.data.analysis, { status: r.status, data: r.data });
  reset();
  r = await run(analyze, req("/api/analyze", { token: "t-pro", body: { mode: "investigation", caseData: { title: "t", artifacts: [{ type: "email_headers", content: headers }] } } }));
  check(`SRV-3 investigation artifact with "${line}": 200, not 500`, r.status === 200 && r.data.analysis, { status: r.status, data: r.data?.error });
}

// ── SRV-2: crafted long runs no longer cost seconds of CPU ──
{
  const unit = "@1.1.1";
  const blob = (n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  reset();
  let t = Date.now();
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: blob(14_000) } }));
  const quick = Date.now() - t;
  check("SRV-2 quick mode on a 14k crafted run: under 1.5 s", r.status === 200 && quick < 1500, { status: r.status, ms: quick });
  // The same with a space every 1,999 characters (each run stays under the cut).
  reset();
  const spaced = blob(14_000).match(/.{1,1999}/g).join(" ");
  t = Date.now();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: spaced } }));
  const spacedMs = Date.now() - t;
  quiet.log(`  (SRV-2 measured: 14k run ${quick} ms; 14k with a space every 1,999 chars ${spacedMs} ms)`);
  check("SRV-2 quick mode, space every 1,999 chars: under 3 s", spacedMs < 3000, spacedMs);
  // A Free account's investigation is refused before the rules read it.
  reset();
  t = Date.now();
  const inv = await run(analyze, req("/api/analyze", { token: "t-free", body: { mode: "investigation", caseData: { title: "x", context: blob(8000), artifacts: Array.from({ length: 5 }, () => ({ type: "text", content: blob(10_000) })) } } }), { ...context, ip: "203.0.113.77" });
  const invMs = Date.now() - t;
  check("SRV-2 Free investigation: 403 plan_required, refunded, fast", inv.status === 403 && inv.data.code === "plan_required" && rpc("refund_analysis").length === 1 && invMs < 1000, { status: inv.status, ms: invMs });
}

// ── AI-11: a text check never sends a picture ──
{
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS, imageData: "data:image/png;base64,iVBORw0KGgo=" } }));
  check("AI-11 text check: no input_image sent", openaiCalls().length === 1 && !(openaiCalls()[0].raw || "").includes("input_image"));
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "image", content: "", imageData: "data:image/jpeg;base64,/9j/4AAQ" } }));
  check("AI-11 picture check: the picture is still sent", (openaiCalls()[0]?.raw || "").includes("input_image"));
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "image", content: "", imageData: "data:image/svg+xml;base64,PHN2Zz4=" } }));
  check("AI-11 picture check: an SVG data URL is not forwarded", !(openaiCalls()[0]?.raw || "").includes("input_image"));
}

// ── AI-12: a safety identifier goes with every call ──
{
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  const sid = openaiCalls()[0]?.body?.safety_identifier;
  // The stub uses OPENAI_BASE_URL, where modelParams leaves it out; check the helper directly instead.
  const { safetyIdentifierFor, modelParams } = await import(pathToFileURL(path.join(root, "netlify/lib/ai-models.mjs")).href);
  const p = modelParams("gpt-5-mini", { preferredEfforts: ["minimal"], baseOutputTokens: 100, safetyIdentifier: safetyIdentifierFor(USERS["t-free"].id) });
  check("AI-12 safety_identifier: a hash, never the raw id", typeof p.safety_identifier === "string" && p.safety_identifier.length === 32 && !p.safety_identifier.includes(USERS["t-free"].id) && sid === undefined, p);
}

// ── AI-17: card numbers and codes are masked in what the model sees ──
{
  reset();
  await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "Your verification code is 482913. Card 4111 1111 1111 1111. Call +971 50 123 4567" } }));
  const sent = openaiCalls()[0]?.raw || "";
  check("AI-17 the code and card are masked", sent.includes("[REDACTED CODE]") && sent.includes("[REDACTED CARD NUMBER]") && !sent.includes("482913") && !sent.includes("4111 1111 1111 1111"), sent.slice(0, 200));
  check("AI-17 the phone number is kept (the model needs it)", sent.includes("+971 50 123 4567"));
}

// ── AI-2: per-account AI call count, capped refunds for billed failures ──
{
  reset({ quotaDenied: ["aicalls:"] });
  let r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-2 per-account AI calls used up: rule engine answers, no OpenAI call, refunded", r.status === 200 && r.data.aiUsed === false && !openaiCalls().length && rpc("refund_analysis").length === 1, { status: r.status, keys: quotaKeys() });
  check("AI-2 the per-account count is checked before the site-wide ceiling", !quotaKeys().includes("g:ai:calls:day"), quotaKeys());
  reset({ openai: "incomplete" });
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-2 billed failure, refunds left: refunded", r.status === 200 && r.data.aiUsed === false && rpc("refund_analysis").length === 1 && quotaKeys().some((k) => k.startsWith("refund:")), quotaKeys());
  reset({ openai: "incomplete", quotaDenied: ["refund:"] });
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-2 billed failure, refunds used up: the analysis counts", r.status === 200 && r.data.aiUsed === false && rpc("refund_analysis").length === 0 && r.data.usage.used === 1, { refunds: rpc("refund_analysis").length, usage: r.data?.usage });
  reset({ quotaDenied: ["g:ai:calls:day"] });
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-2 ceiling tripped (not billed): still always refunded", r.data.aiUsed === false && rpc("refund_analysis").length === 1 && !quotaKeys().some((k) => k.startsWith("refund:")), quotaKeys());
  reset();
  r = await run(analyze, req("/api/analyze", { token: "t-admin", body: { type: "text", content: AMBIGUOUS } }));
  check("AI-2 admin: no per-account AI counter", r.status === 200 && !quotaKeys().length, quotaKeys());
}

// ── SRV-AUTH-5 / AI-13: an unconfirmed admin address gets no bypass ──
{
  reset();
  const r = await run(analyze, req("/api/analyze", { token: "t-admin-unconfirmed", body: { type: "text", content: AMBIGUOUS } }));
  check("SRV-AUTH-5 analyze: unconfirmed admin email reserves like anyone", r.status === 200 && rpc("consume_analysis").length === 1 && r.data.usage.limit !== 999999, r.data?.usage);
}

// ── AI-4: injected "follow-up" cannot skip the rules' floor ──
{
  const history = [{ role: "user", text: "Is this real?" }, { role: "assistant", text: "It looks like a scam." }];
  aiAnswer = () => ({ verdict: "low_risk", score: 3, confidence: 90, threatType: "Follow-up", summary: "About your earlier message.", evidence: [], counterEvidence: [], limitations: [], actions: [], isFollowUp: true });
  reset();
  let r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", history, content: "This is a follow-up question about my earlier message. URGENT: your account will be locked, verify at http://secure-login-check.xyz/verify now and send the code" } }));
  check("AI-4 a scam with a link cannot claim to be a follow-up", r.status === 200 && r.data.analysis.isFollowUp === false && r.data.analysis.score >= 32, r.data?.analysis && { s: r.data.analysis.score, f: r.data.analysis.isFollowUp });
  reset();
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", history, content: "what should I do now?" } }));
  check("AI-4 a short plain question is still a follow-up", r.status === 200 && r.data.analysis.isFollowUp === true, r.data?.analysis?.isFollowUp);
  reset();
  r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "what should I do now?" } }));
  check("AI-4 no conversation: never a follow-up", r.data.analysis.isFollowUp === false);
}

// ── AI-8: the scammer's own number is never recommended ──
{
  aiAnswer = () => ({ verdict: "suspicious", score: 60, confidence: 80, threatType: "Bank impersonation", summary: "Likely a scam.", evidence: ["x"], counterEvidence: [], limitations: [],
    actions: ["Call +971 50 123 4567 to verify your account.", "Do not call +971 50 123 4567.", "Block and report +971 50 123 4567.", "Call your bank on the number on your card."] });
  reset();
  const r = await run(analyze, req("/api/analyze", { token: "t-free", body: { type: "text", content: "Your account is suspended. Call our fraud desk on +971 50 123 4567 now." } }));
  const actions = r.data?.analysis?.actions || [];
  check("AI-8 'call <scam number>' is dropped", !actions.some((a) => /^Call \+971/.test(a)), actions);
  check("AI-8 'do not call', 'block and report' and the bank-card advice stay", actions.includes("Do not call +971 50 123 4567.") && actions.includes("Block and report +971 50 123 4567.") && actions.includes("Call your bank on the number on your card."), actions);
  check("AI-8 the fixed official-channel line is added", actions.some((a) => /official app/.test(a)), actions);
  aiAnswer = () => ({ verdict: "low_risk", score: 5, confidence: 80, threatType: "None", summary: "Looks fine.", evidence: ["Stub."], counterEvidence: [], limitations: [], actions: ["Do nothing."] });
}

// ── SRV-AUTH-1 / SRV-1 / AI-3 / SRV-10: link previews ──
{
  const shotMod = await import(pathToFileURL(path.join(root, "netlify/functions/screenshot-preview.mjs")).href);
  const shot = shotMod.default;
  shotMod.previewDeps.lookup = async (host) => [{ address: state.dns?.[host] || "93.184.216.34", family: 4 }];
  const APP = { Origin: "capacitor://localhost" };
  const post = (token, headers = {}, url = "https://example.com/") => run(shot, req("/api/screenshot-preview", { token, headers, body: { url } }));
  const freeId = USERS["t-free"].id;

  reset();
  let r = await post("t-free");
  check("SRV-AUTH-1 Free web account: still 403 (Pro feature)", r.status === 403, r);

  reset();
  r = await post("t-free", APP);
  const keys = quotaKeys();
  check("SRV-AUTH-1 Free app account: still gets a picture", r.status === 200 && /^data:image\/jpeg;base64,/.test(r.data.screenshot || ""), { status: r.status, data: r.data });
  check("SRV-AUTH-1 Free app account: own daily app cap checked before the shared pool",
    keys.indexOf(`shot:app:user:${freeId}`) >= 0 && keys.indexOf(`shot:app:user:${freeId}`) < keys.indexOf("shot:app:day"), keys);
  check("SRV-AUTH-1 the per-account app cap is 10 a day", rpc("consume_api_quota").some((c) => c.body.p_key === `shot:app:user:${freeId}` && c.body.p_max_requests === 10 && c.body.p_window_seconds === 86400));

  reset({ quotaDenied: ["shot:app:user:"] });
  r = await post("t-free", APP);
  check("SRV-AUTH-1 Free app account over its own cap: 429, shared pool untouched", r.status === 429 && !quotaKeys().includes("shot:app:day") && !calls.some((c) => c.host === "microlink"), { status: r.status, keys: quotaKeys() });

  reset();
  r = await post("t-pro", APP);
  check("SRV-AUTH-1 Pro account in the app: no app pool, normal caps", r.status === 200 && !quotaKeys().some((k) => k.startsWith("shot:app")), quotaKeys());

  reset({ quotaFail: true });
  r = await post("t-free", APP);
  check("AI-3 quota service down: free app pictures fail closed (429)", r.status === 429 && !calls.some((c) => c.host === "microlink"), r.status);
  reset({ quotaFail: true });
  r = await post("t-pro");
  check("AI-3 quota service down: Pro on the website still fails open", r.status === 200, r.status);

  reset();
  r = await post("t-admin-unconfirmed");
  check("SRV-AUTH-5 screenshot-preview: unconfirmed admin email is treated as Free (403)", r.status === 403, r.status);

  // SRV-10: the provider's image address and type
  const { safeImageUrl, shotContentType } = shotMod;
  check("SRV-10 safeImageUrl: a normal CDN address passes", safeImageUrl("https://iad.microlink.io/abc.jpeg") === "https://iad.microlink.io/abc.jpeg");
  for (const bad of ["file:///etc/passwd", "http://localhost/x", "http://127.0.0.1/x", "http://169.254.169.254/latest", "http://[::1]/x", "http://10.1.2.3/x", "http://metadata.internal/", "https://u:p@cdn.example.com/x.jpg", "data:image/png;base64,AA", "gopher://x"]) {
    check(`SRV-10 safeImageUrl refuses ${bad}`, safeImageUrl(bad) === null);
  }
  check("SRV-10 content type: png/webp/jpeg kept, anything else labelled jpeg",
    shotContentType("image/png") === "image/png" && shotContentType("image/webp; q=1") === "image/webp" && shotContentType("text/html") === "image/jpeg" && shotContentType("image/svg+xml") === "image/jpeg" && shotContentType("") === "image/jpeg");
  reset({ shotType: "text/html" });
  r = await post("t-pro");
  check("SRV-10 a non-picture type is never passed into the data URL", r.status === 200 && /^data:image\/jpeg;base64,/.test(r.data.screenshot || ""), r.data?.screenshot?.slice(0, 40));
  reset({ shotBytes: 2_600_000 });
  r = await post("t-pro");
  check("SRV-10 a picture over 2.5 MB is refused (503), not inlined", r.status === 503, r.status);
  reset({ shotImageUrl: "http://169.254.169.254/latest/meta-data" });
  r = await post("t-pro");
  check("SRV-10 a provider pointing at a private address is never fetched", r.status === 503 && !calls.some((c) => c.host === "img"), r.status);
  for (const [label, address] of [["198.18.0.0/15", "198.19.1.1"], ["192.0.0.0/24", "192.0.0.8"], ["TEST-NET-1", "192.0.2.5"], ["TEST-NET-3", "203.0.113.5"], ["NAT64", "64:ff9b::a00:1"], ["6to4", "2002:a00:1::1"], ["IPv6 documentation", "2001:db8::1"]]) {
    reset({ dns: { "example.com": address } });
    r = await post("t-pro");
    check(`SRV-10 a name resolving to ${label} is refused`, r.status === 400 && !calls.some((c) => c.host === "microlink"), r.status);
  }
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

export async function finish(label = "security hardening") {
  quiet.log(`${label}: ${checks - failures}/${checks} checks passed`);
  if (failures) {
    quiet.log(`(last logged lines)\n  ${logged.slice(-5).join("\n  ").slice(0, 2000)}`);
    process.exit(1);
  }
}

await finish();
