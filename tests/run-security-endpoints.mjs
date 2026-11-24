// Regression tests for the November 2026 security audit, smaller endpoints:
// error texts (SRV-AUTH-11 / SRV-14 / PAY-10), fixed link origins (SRV-12),
// capped bodies (SRV-11), Cloudflare address trust (SRV-7 / SRV-8), BYOK
// limits (AI-6), invite accept checks (SRV-AUTH-6 / PAY-12 / DB-5), the
// checkout debug log (PAY-3 / DB-7), legal acceptances (SRV-17) and the
// invite sender-name filter (SRV-13). No network.
//
//   node tests/run-security-endpoints.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE = "https://stub-project.supabase.test";
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "STRIPE_SECRET_KEY", "ERROR_ALERTS", "RESEND_API_KEY", "SITE_URL", "RATE_LIMITS", "ADMIN_EMAILS", "RATE_LIMIT_CLEANUP"]) delete process.env[name];
const ENV = { SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", ERROR_ALERTS: "off", STRIPE_SECRET_KEY: "sk_test_fake_endpoints" };
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const quiet = { log: console.log };
console.error = () => {};
console.warn = () => {};

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    quiet.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 900)}`}`);
  }
}

const id = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const USERS = {
  "t-free": { id: id(1), email: "free@example.com", email_confirmed_at: "2026-10-01T00:00:00Z" },
  "t-unconfirmed": { id: id(3), email: "new@example.com", email_confirmed_at: null }
};
const TEAM = id(7);
let state, calls;
function reset(over = {}) {
  state = { quotaDenied: [], seatTier: 5, activeMembers: 1, profileFails: false, openaiStatus: 200, ...over };
  calls = [];
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = String(init.method || "GET").toUpperCase();
  let body;
  try { body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  const headers = new Headers(init.headers || {});
  if (url.hostname === "api.openai.com") {
    calls.push({ host: "openai" });
    if (state.openaiStatus !== 200) return json({ error: { message: "Incorrect API key provided: sk-abc***" } }, state.openaiStatus);
    return json({ output_text: JSON.stringify({ verdict: "low_risk", score: 5, confidence: 70, threatType: "None", summary: "ok", evidence: [], counterEvidence: [], limitations: [], actions: [] }) });
  }
  if (url.origin !== SUPABASE) return json({ message: "unexpected" }, 599);
  const call = { method, path: url.pathname, query: decodeURIComponent(url.search), body, auth: headers.get("authorization") };
  calls.push(call);
  if (url.pathname === "/auth/v1/user") {
    const user = USERS[(call.auth || "").replace(/^Bearer /, "")];
    return user ? json(user) : json({ msg: "invalid" }, 401);
  }
  const rpcName = url.pathname.startsWith("/rest/v1/rpc/") ? url.pathname.slice(13) : "";
  if (rpcName === "consume_api_quota") {
    const denied = state.quotaDenied.some((p) => String(body?.p_key || "").startsWith(p));
    return json({ allowed: !denied, used: 1, reset_at: "2026-11-24T12:00:00Z" });
  }
  if (rpcName === "consume_analysis") return json([{ allowed: true, used: 1, daily_limit: 3, plan: "free" }]);
  if (rpcName === "refund_analysis") return new Response(null, { status: 204 });
  if (url.pathname === "/rest/v1/profiles") {
    if (state.profileFails) return json({ message: "column profiles.stripe_customer_id does not exist", code: "42703" }, 400);
    return json([{ id: id(1), plan: "free", subscription_status: "inactive", stripe_customer_id: "" }]);
  }
  if (url.pathname === "/rest/v1/business_members") {
    if (/status=eq\.active/.test(call.query) && /business_account_id=eq\./.test(call.query)) return json(Array.from({ length: state.activeMembers }, (_, i) => ({ id: i })));
    if (method === "PATCH") return json([]);
    if (method === "POST") return json([{ id: 99 }], 201);
    return json([]);
  }
  if (url.pathname === "/rest/v1/business_accounts") return json([{ seat_tier: state.seatTier }]);
  if (url.pathname === "/rest/v1/business_invites") {
    if (method === "GET") return json([{ id: id(8), business_account_id: TEAM, email: state.inviteEmail || "free@example.com", status: "pending", expires_at: new Date(Date.now() + 3600_000).toISOString() }]);
    if (method === "PATCH") return json([{ id: id(8) }]);
  }
  if (url.pathname === "/rest/v1/legal_acceptances") return new Response(null, { status: 201 });
  if (url.pathname === "/rest/v1/checkout_debug_log") return new Response(null, { status: 201 });
  if (url.pathname === "/rest/v1/scan_history") return json([]);
  return json([]);
};

const SITE = "https://cybernetai.app";
function req(pathname, { method = "POST", token = "", body, headers = {}, host = SITE } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  return new Request(`${host}${pathname}`, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
async function run(handler, request, ctx = { ip: "203.0.113.9" }) {
  const response = await handler(request, ctx);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}
const imp = async (f) => import(pathToFileURL(path.join(root, f)).href);
const quotaKeys = () => calls.filter((c) => c.path === "/rest/v1/rpc/consume_api_quota").map((c) => c.body?.p_key);

// ── SRV-AUTH-11 / SRV-14 / PAY-10: publicError ──
{
  const { publicError } = await imp("netlify/lib/public-error.mjs");
  const own4xx = Object.assign(new Error("Only the team owner can invite teammates."), { status: 403 });
  check("publicError keeps our own 4xx text", publicError(own4xx, "x").message === own4xx.message && publicError(own4xx, "x").status === 403);
  const pg = new Error('duplicate key value violates unique constraint "business_invites_token_key"');
  check("publicError hides a database message", publicError(pg, "Fallback.").message === "Fallback." && publicError(pg, "Fallback.").status === 500);
  const stripeErr = Object.assign(new Error("No such customer: 'cus_123'"), { type: "StripeInvalidRequestError", statusCode: 400, raw: { message: "x" } });
  check("publicError hides a Stripe message", publicError(stripeErr, "Fallback.").message === "Fallback." && publicError(stripeErr, "Fallback.").status === 500);
  const exposed = Object.assign(new Error("Could not check your current plan. Please try again in a moment."), { status: 503, expose: true });
  check("publicError keeps a friendly 5xx marked expose", publicError(exposed, "F").message === exposed.message && publicError(exposed, "F").status === 503);
  const hidden5xx = Object.assign(new Error("Supabase server environment variables are not configured."), { status: 503 });
  check("publicError hides an unmarked 5xx but keeps its status", publicError(hidden5xx, "F").message === "F" && publicError(hidden5xx, "F").status === 503);

  reset({ profileFails: true });
  const accountStatus = (await imp("netlify/functions/account-status.mjs")).default;
  const r = await run(accountStatus, req("/api/account-status", { method: "GET", token: "t-free" }));
  check("account-status: a database error no longer reaches the page", r.status >= 500 && !/column|profiles|42703/.test(JSON.stringify(r.data)), r);
  reset();
  const r2 = await run(accountStatus, req("/api/account-status", { method: "GET" }));
  check("account-status: signed out keeps its sign-in message (401)", r2.status === 401 && /sign in/i.test(r2.data.error), r2);
}

// ── SRV-12: links point at the site itself ──
{
  const { linkOrigin, siteUrl } = await imp("netlify/lib/site-url.mjs");
  const at = (u) => linkOrigin(new Request(u));
  check("linkOrigin: the site keeps its origin", at("https://cybernetai.app/api/x") === "https://cybernetai.app" && at("https://www.cybernetai.app/api/x") === "https://www.cybernetai.app");
  check("linkOrigin: the bare netlify.app host uses the site", at("https://cybernet-ai.netlify.app/api/x") === "https://cybernetai.app");
  check("linkOrigin: a deploy preview keeps its own origin", at("https://deploy-preview-12--cybernet-ai.netlify.app/api/x") === "https://deploy-preview-12--cybernet-ai.netlify.app");
  check("linkOrigin: netlify dev keeps localhost", at("http://localhost:8888/api/x") === "http://localhost:8888");
  check("linkOrigin: any other host uses the site", at("https://evil.example/api/x") === "https://cybernetai.app");
  ENV.SITE_URL = "https://staging.example.test";
  check("siteUrl: SITE_URL overrides", siteUrl() === "https://staging.example.test" && at("https://cybernet-ai.netlify.app/x") === "https://staging.example.test");
  delete ENV.SITE_URL;
}

// ── SRV-7 / SRV-8: CF-Connecting-IP only through the custom domain ──
{
  const { clientAddress } = await imp("netlify/lib/abuse-guard.mjs");
  const cfEdge = { ip: "172.70.1.1" }; // a Cloudflare range
  const viaSite = new Request("https://cybernetai.app/api/x", { headers: { "cf-connecting-ip": "198.51.100.7" } });
  const viaNetlify = new Request("https://cybernet-ai.netlify.app/api/x", { headers: { "cf-connecting-ip": "198.51.100.7" } });
  check("SRV-8 custom domain from a Cloudflare edge: the visitor's address", clientAddress(viaSite, cfEdge) === "198.51.100.7");
  check("SRV-8 netlify.app host: the header is not trusted", clientAddress(viaNetlify, cfEdge) === "172.70.1.1");
  const direct = new Request("https://cybernetai.app/api/x", { headers: { "cf-connecting-ip": "198.51.100.7" } });
  check("SRV-8 not from Cloudflare: the header is not trusted", clientAddress(direct, { ip: "203.0.113.5" }) === "203.0.113.5");
}

// ── SRV-11: small bodies are capped while they stream in ──
{
  const { smallJsonBody } = await imp("netlify/lib/abuse-guard.mjs");
  const chunked = (bytes) => new Request("https://cybernetai.app/x", { method: "POST", body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x".repeat(bytes))); c.close(); } }), duplex: "half" });
  check("smallJsonBody: a chunked body over the cap is null (413)", (await smallJsonBody(chunked(20_000), 16_000)) === null);
  check("smallJsonBody: unreadable JSON is {} as before", JSON.stringify(await smallJsonBody(new Request("https://x/", { method: "POST", body: "{nope" }))) === "{}");
  check("smallJsonBody: a normal body parses", (await smallJsonBody(new Request("https://x/", { method: "POST", body: '{"a":1}' }))).a === 1);
  const feedback = (await imp("netlify/functions/feedback.mjs")).default;
  const r = await feedback(chunked(200_000), { ip: "203.0.113.1" });
  check("feedback: a chunked oversized body is 413", r.status === 413, r.status);
}

// ── AI-6: BYOK limits and refunds ──
{
  const byok = (await imp("netlify/functions/byok-analyze.mts")).default;
  const KEY = "sk-" + "a".repeat(40);
  reset({ openaiStatus: 401 });
  let r = await run(byok, req("/api/byok-analyze", { token: "t-free", headers: { "X-CyberNet-OpenAI-Key": KEY }, body: { type: "text", content: "hello" } }));
  check("AI-6 BYOK: a rejected key answers 401", r.status === 401, r);
  check("AI-6 BYOK: a rejected key is not refunded", !calls.some((c) => c.path === "/rest/v1/rpc/refund_analysis"), calls.map((c) => c.path));
  check("AI-6 BYOK: per-account and per-connection limits are checked", quotaKeys().some((k) => k.startsWith("g:byok-analyze:u60:")) && quotaKeys().some((k) => k.startsWith("g:byok-analyze:ip60:")), quotaKeys());
  reset({ openaiStatus: 500 });
  r = await run(byok, req("/api/byok-analyze", { token: "t-free", headers: { "X-CyberNet-OpenAI-Key": KEY }, body: { type: "text", content: "hello" } }));
  check("AI-6 BYOK: an OpenAI outage is still refunded", calls.some((c) => c.path === "/rest/v1/rpc/refund_analysis"), r);
  check("SRV-AUTH-11 BYOK: a 5xx answer has a fixed text", r.status >= 500 && !/Incorrect API key/.test(r.data.error), r);
  reset({ quotaDenied: ["g:byok-analyze:u60:"] });
  r = await run(byok, req("/api/byok-analyze", { token: "t-free", headers: { "X-CyberNet-OpenAI-Key": KEY }, body: { type: "text", content: "hello" } }));
  check("AI-6 BYOK: over the per-account limit: 429, nothing reserved", r.status === 429 && !calls.some((c) => c.path === "/rest/v1/rpc/consume_analysis"), r);

  const validate = (await imp("netlify/functions/validate-openai-key.mts")).default;
  reset({ quotaDenied: ["g:validate-openai-key:u3600:"] });
  r = await run(validate, req("/api/validate-openai-key", { token: "t-free", body: { apiKey: KEY } }));
  check("AI-6 validate-openai-key: a durable per-account hourly limit", r.status === 429 && !calls.some((c) => c.host === "openai"), r);
}

// ── SRV-AUTH-6 / PAY-12 / DB-5: accepting an invite ──
{
  const accept = (await imp("netlify/functions/business-invite-accept.mts")).default;
  const token = "a".repeat(64);
  reset({ inviteEmail: "new@example.com" });
  let r = await run(accept, req("/api/business-invite-accept", { token: "t-unconfirmed", body: { token } }));
  check("SRV-AUTH-6 an unconfirmed email cannot accept an invite", r.status === 403 && /confirm your email/i.test(r.data.error) && !calls.some((c) => c.method === "PATCH"), r);
  reset({ activeMembers: 5, seatTier: 5 });
  r = await run(accept, req("/api/business-invite-accept", { token: "t-free", body: { token } }));
  check("PAY-12 a full team: 409, the invite is not claimed", r.status === 409 && /team is full/i.test(r.data.error) && !calls.some((c) => c.method === "PATCH"), r);
  reset({ activeMembers: 4, seatTier: 5 });
  r = await run(accept, req("/api/business-invite-accept", { token: "t-free", body: { token } }));
  check("PAY-12 a free seat: the invite is accepted as before", r.status === 200 && r.data.ok === true, r);
  reset({ activeMembers: 10, seatTier: 20 });
  r = await run(accept, req("/api/business-invite-accept", { token: "t-free", body: { token } }));
  check("PAY-12 a 20-seat team with 10 members still accepts", r.status === 200, r);
}

// ── SRV-13: the sender-name filter is fast on a huge name ──
{
  const { sanitizeInviterName } = await imp("netlify/functions/business-invite.mts");
  const t = Date.now();
  const out = sanitizeInviterName("1".repeat(100_000) + "!");
  check("SRV-13 a 100k-character name is handled quickly", Date.now() - t < 200, Date.now() - t);
  check("SRV-13 the name is still capped at 60", out.length <= 60);
  check("SRV-13 a normal name is kept and a domain is still dropped", sanitizeInviterName("Walid Z") === "Walid Z" && sanitizeInviterName("Claim at www.evil-pay.com") === "");
}

// ── PAY-3 / DB-7: signed-out checkout writes no debug row ──
{
  const checkout = (await imp("netlify/functions/create-checkout-session.mjs")).default;
  reset();
  const r = await run(checkout, req("/api/create-checkout-session", { body: {} }));
  check("PAY-3 signed-out checkout: 401 and no checkout_debug_log row", r.status === 401 && !calls.some((c) => c.path === "/rest/v1/checkout_debug_log"), { r, paths: calls.map((c) => c.path) });
  const cleanup = await imp("netlify/functions/rate-limit-cleanup.mjs");
  reset();
  const done = await cleanup.cleanupCheckoutDebugLog({ now: Date.parse("2026-11-24T00:00:00Z") });
  const del = calls.find((c) => c.path === "/rest/v1/checkout_debug_log");
  check("DB-7 old checkout debug rows (over 30 days) are deleted daily", done.status === "done" && del?.method === "DELETE" && del.query.includes("created_at=lt.2026-10-25"), { done, del });
}

// ── SRV-17 / SRV-AUTH-13: legal acceptances ──
{
  const legal = (await imp("netlify/functions/legal-acceptance.mts")).default;
  reset();
  let r = await run(legal, req("/api/legal-acceptance", { token: "t-free", body: { kind: "signup", termsVersion: "I accept nothing", privacyVersion: "2026-10-22" } }));
  const row = calls.find((c) => c.path === "/rest/v1/legal_acceptances")?.body;
  check("SRV-17 a non-date version label is replaced by the server's", r.status === 200 && row?.terms_version === "2026-10-29" && row?.privacy_version === "2026-10-22", row);
  reset({ quotaDenied: ["legal:"] });
  r = await run(legal, req("/api/legal-acceptance", { token: "t-free", body: { kind: "signup" } }));
  check("SRV-AUTH-13 over 20 an hour: still a success, nothing inserted", r.status === 200 && r.data.recorded === true && !calls.some((c) => c.path === "/rest/v1/legal_acceptances"), r);
}

// ── AI-4 (page) / AI-10: client-side checks, on the source and the built legacy copy ──
{
  const fs = await import("node:fs");
  for (const file of ["public/script.js", "public/legacy/script.js"]) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    check(`AI-4 ${file}: a follow-up answer is ignored when the page's own read is a warning`,
      // The legacy build spells optional chaining out ("deep == null ? void 0 : deep.isFollowUp").
      /const followUp\s*=\s*Boolean\(.{0,40}isFollowUp\)\s*&&\s*!\[\s*"suspicious",\s*"malicious"\s*\]\.includes\(.{0,40}verdict\)/.test(src) && /isFollowUp:\s*false\s*\}/.test(src));
  }
  for (const file of ["public/cybernet-account-api-upgrade.js", "public/legacy/cybernet-account-api-upgrade.js"]) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    check(`AI-10 ${file}: the OpenAI key is never written to sessionStorage`, !/sessionStorage\.setItem\(\s*KEY_STORAGE/.test(src) && /memoryKey = apiKey/.test(src), null);
  }
}

quiet.log(`security endpoints: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
