// Error tracking: the scrubbing, the /api/client-error checks, the alert
// dedupe and daily cap, and the browser reporter (public/cybernet-errors.js).
// No network, no keys, no real email: fetch and Netlify.env are stubbed.
//
//   node tests/run-errors.mjs              unit checks (part of npm test)
//   node tests/run-errors.mjs --browser    also loads a real page in headless Edge that throws,
//                                          and catches its beacons in a local stub server
//                                          (PORT, default 8831; the browser debug port is PORT+4000)
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
let checks = 0;
function check(id, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    process.stdout.write(`[${id}] FAIL ${JSON.stringify(detail)?.slice(0, 600)}\n`);
  }
}

/* ---------- stubs ---------- */

const SUPABASE = "https://stub-project.supabase.test";
const ENV = {
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  RESEND_API_KEY: "stub-resend"
};
let envThrows = false;
globalThis.Netlify = {
  env: {
    get(name) {
      if (envThrows) throw new Error("env unavailable");
      return ENV[name];
    }
  }
};

const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

const logs = [];
const realConsoleError = console.error;
console.error = (...args) => {
  logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
};
const errorLines = () => logs.filter((l) => l.startsWith('{"tag":"cn_error"')).map((l) => JSON.parse(l));

// consume_api_quota with the database function's semantics.
const quotaStore = new Map();
const quotaKeys = [];
function quotaRpc({ p_key: key, p_window_seconds: windowSeconds, p_max_requests: max }) {
  quotaKeys.push(key);
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  let row = quotaStore.get(key);
  if (!row || now >= row.start + windowSeconds * 1000) {
    row = { start: now, count: 1 };
    quotaStore.set(key, row);
    return { allowed: true, used: 1, limit: max, remaining: max - 1, reset_at: iso(now + windowSeconds * 1000) };
  }
  if (row.count < max) {
    row.count += 1;
    return { allowed: true, used: row.count, limit: max, remaining: max - row.count, reset_at: iso(row.start + windowSeconds * 1000) };
  }
  return { allowed: false, used: row.count, limit: max, remaining: 0, reset_at: iso(row.start + windowSeconds * 1000) };
}

const mode = { rpc: "ok", mail: "ok", denyPrefix: "", authUser: null, other: "404" };
const emails = [];
const fetchCalls = [];
// A request that never answers. A real socket keeps the process alive while it
// waits; the interval stands in for it (AbortSignal.timeout alone does not).
function hang(signal) {
  return new Promise((_, reject) => {
    const keepAlive = setInterval(() => {}, 1000);
    if (signal) signal.addEventListener("abort", () => { clearInterval(keepAlive); reject(signal.reason || new Error("aborted")); }, { once: true });
  });
}
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init = {}) => {
  // A synchronous throw, not a rejected promise: the worst a fetch can do.
  if (mode.fetchThrowsSync) throw new Error("fetch exploded");
  return stubFetch(input, init);
};
async function stubFetch(input, init) {
  const url = String(input instanceof Request ? input.url : input);
  fetchCalls.push(url);
  if (url === `${SUPABASE}/rest/v1/rpc/consume_api_quota`) {
    if (mode.rpc === "hang") return hang(init.signal);
    if (mode.rpc === "throw") throw new TypeError("fetch failed");
    if (mode.rpc === "500") return new Response('{"message":"db down"}', { status: 500 });
    const body = JSON.parse(init.body);
    if (mode.denyPrefix && body.p_key.startsWith(mode.denyPrefix)) {
      return Response.json({ allowed: false, used: 99, limit: body.p_max_requests, remaining: 0, reset_at: new Date(Date.now() + 3600e3).toISOString() });
    }
    return Response.json(quotaRpc(body));
  }
  if (url === "https://api.resend.com/emails") {
    if (mode.mail === "hang") return hang(init.signal);
    if (mode.mail === "500") return new Response("{}", { status: 500 });
    const headers = new Headers(init.headers);
    emails.push({ body: JSON.parse(init.body), idempotency: headers.get("idempotency-key"), auth: headers.get("authorization") });
    return Response.json({ id: `stub-${emails.length}` });
  }
  if (url === `${SUPABASE}/auth/v1/user`) {
    return mode.authUser ? Response.json(mode.authUser) : new Response("{}", { status: 401 });
  }
  if (url.startsWith(`${SUPABASE}/rest/v1/`)) {
    return new Response('{"message":"stub database error for jane.doe@example.com"}', { status: mode.other === "500" ? 500 : 404 });
  }
  return new Response("not found", { status: 404 });
}

function reset() {
  quotaStore.clear();
  quotaKeys.length = 0;
  emails.length = 0;
  fetchCalls.length = 0;
  logs.length = 0;
  Object.assign(mode, { rpc: "ok", mail: "ok", denyPrefix: "", authUser: null, other: "404", fetchThrowsSync: false });
  delete ENV.ERROR_ALERTS;
  ENV.RESEND_API_KEY = "stub-resend";
  envThrows = false;
  clockOffset = 0;
  resetErrorMemory();
  resetClientErrorMemory();
}

const { reportError, scrubText, resetErrorMemory, limits, buildAlertEmail } = await import("../netlify/lib/report-error.mjs");
const clientError = await import("../netlify/functions/client-error.mjs");
const { resetClientErrorMemory } = clientError;
const handler = clientError.default;

/* ---------- 1. scrubbing ---------- */

const S = (text, max) => scrubText(text, max);
check("scrub/email", !/jane|example\.co/.test(S("Contact jane.doe+x@example.co.uk now")) && S("a jane.doe+x@example.co.uk b").includes("<email>"));
check("scrub/email-encoded", S("to=jane%40example.com").includes("<email>"), S("to=jane%40example.com"));
check("scrub/jwt", S("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlMTIz end") === "token <token> end", S("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlMTIz end"));
check("scrub/bearer", S("Authorization: Bearer abc.def-ghi_123") === "Authorization: Bearer <token>", S("Authorization: Bearer abc.def-ghi_123"));
{
  const out = S("card 4242 4242 4242 4242, phone +1 (555) 123-4567, account 123456789012");
  check("scrub/digits", !/4242|555|123456789012|4567/.test(out) && out.includes("<number>"), out);
}
{
  const out = S("fetch https://cybernetai.app/accept-invite?token=abc123secret&email=x#frag failed");
  check("scrub/url-query-hash", out === "fetch https://cybernetai.app/accept-invite failed", out);
}
{
  const out = S("at foo (https://cybernetai.app/script.js?v=20261015-3:120:15)", 2048);
  check("scrub/stack-keeps-line-col", out === "at foo (https://cybernetai.app/script.js:120:15)", out);
}
{
  const out = S("at bar (/script.js?v=1:10:5) and /accept-invite?token=zzz", 2048);
  check("scrub/relative-query", out === "at bar (/script.js:10:5) and /accept-invite", out);
}
check("scrub/minified-column", S("at a (/ui/cybernet-ui.js:1:123456)", 2048) === "at a (/ui/cybernet-ui.js:1:123456)", S("at a (/ui/cybernet-ui.js:1:123456)", 2048));
{
  const out = S("keys sk-proj-abcdefghijklmnop sk_live_abcdefgh1234 whsec_abcdefgh1234 sb_secret_abcdefgh12 re_abc12345_xyz");
  check("scrub/secrets", (out.match(/<secret>/g) || []).length === 5 && !/abcdefgh/.test(out), out);
}
check("scrub/uuid", S("user 3f2c1e4a-1b2c-4d5e-8f90-123456789abc missing") === "user <id> missing");
check("scrub/stripe-id", S("No such customer: 'cus_N1a2b3c4d5'") === "No such customer: '<stripe-id>'" && S("status in_progress") === "status in_progress", [S("No such customer: 'cus_N1a2b3c4d5'"), S("status in_progress")]);
check("scrub/ip", S("from 203.0.113.7 and 2001:db8::1") === "from <ip> and <ip>", S("from 203.0.113.7 and 2001:db8::1"));
check("scrub/long-token", S("session a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5 ok") === "session <token> ok" && S("id cybernetAccountUpgradeStylesheetMore") === "id cybernetAccountUpgradeStylesheetMore");
check("scrub/credential-param", S("login password=hunter2 failed") === "login password=<redacted> failed", S("login password=hunter2 failed"));
check("scrub/length-cap", S("x".repeat(10_000)).length <= 500 && S("y".repeat(10_000), 2048).length <= 2048);
check("scrub/control-chars", S("a\u0000b\u0007c") === "abc");
check("scrub/non-strings", S(null) === "" && S(undefined) === "" && S({ toString() { throw new Error("no"); } }) === "" && S(42) === "42");
{
  const started = realNow();
  for (const evil of ["a".repeat(8000) + "@", "1".repeat(8000) + "x", "a-".repeat(4000), "/".repeat(8000) + "?", ("ab:").repeat(2500), "x@" + "a.".repeat(4000)]) S(evil, 2048);
  check("scrub/fast-on-adversarial-input", realNow() - started < 500, realNow() - started);
}

/* ---------- 2. /api/client-error ---------- */

function post(body, { headers = {}, ip = "198.51.100.23", method = "POST", raw } = {}) {
  const pending = [];
  const context = { ip, waitUntil: (p) => pending.push(p), requestId: "req-test-1" };
  const init = { method, headers: { "content-type": "text/plain;charset=UTF-8", ...headers } };
  if (method !== "GET" && method !== "HEAD") init.body = raw !== undefined ? raw : JSON.stringify(body);
  return handler(new Request("https://cybernetai.app/api/client-error", init), context).then(async (response) => {
    await Promise.all(pending);
    return { response, pending };
  });
}
const goodReport = (extra = {}) => ({
  kind: "error",
  name: "TypeError",
  message: "Uncaught TypeError: Cannot read properties of null (reading 'classList')",
  stack: "TypeError: Cannot read properties of null (reading 'classList')\n    at openModal (/script.js:812:14)\n    at HTMLButtonElement.<anonymous> (/script.js:900:3)",
  file: "/script.js",
  line: 812,
  col: 14,
  page: "/pricing",
  version: "20261017-3",
  ua: "Chrome 141 on Windows",
  ts: new Date().toISOString(),
  ...extra
});

reset();
{
  const { response } = await post(null, { method: "GET" });
  check("client/get-405", response.status === 405 && response.headers.get("allow") === "POST", response.status);
  const put = await post(goodReport(), { method: "PUT" });
  check("client/put-405", put.response.status === 405);
  check("client/405-no-report", errorLines().length === 0 && emails.length === 0);
}
{
  const { response } = await post(goodReport(), { headers: { "content-length": "9000" } });
  check("client/declared-too-large-413", response.status === 413, response.status);
  const big = await post(null, { raw: JSON.stringify(goodReport({ stack: "s".repeat(9000) })) });
  check("client/body-too-large-413", big.response.status === 413, big.response.status);
  // A streamed body with no length header is still cut off at 8 KB.
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new TextEncoder().encode("x".repeat(1000))); c.close(); } });
  const res = await handler(new Request("https://cybernetai.app/api/client-error", { method: "POST", body: stream, duplex: "half" }), { ip: "198.51.100.30" });
  check("client/stream-too-large-413", res.status === 413, res.status);
}
{
  check("client/invalid-json-400", (await post(null, { raw: "{not json" })).response.status === 400);
  check("client/array-400", (await post([1, 2])).response.status === 400);
  check("client/no-message-400", (await post({ kind: "error", page: "/" })).response.status === 400);
  check("client/message-not-string-400", (await post({ message: 42 })).response.status === 400);
  check("client/400-no-report", errorLines().length === 0);
}
reset();
{
  const { response } = await post(goodReport({
    message: "Uncaught TypeError: lookup failed for jane.doe@example.com with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl",
    page: "/accept-invite?token=abc123secret#frag",
    cookie: "sb-access-token=should-never-appear",
    inputValue: "my-password-123",
    localStorage: { key: "secret-storage-value" }
  }));
  check("client/valid-204", response.status === 204 && (await response.text()) === "", response.status);
  const lines = errorLines();
  const line = lines[0] || {};
  const raw = JSON.stringify(lines);
  check("client/logged-once", lines.length === 1, lines.length);
  check("client/log-fields", line.source === "client" && line.page === "/accept-invite" && line.kind === "error" && line.name === "TypeError" && line.file === "/script.js:812:14" && line.version === "20261017-3" && line.ua === "Chrome 141 on Windows" && /^[0-9a-f]{12}$/.test(line.fingerprint), line);
  check("client/log-scrubbed", !/jane|eyJ|abc123secret|should-never-appear|my-password-123|secret-storage-value|198\.51\.100\.23/.test(raw), raw);
  check("client/log-has-frames", Array.isArray(line.frames) && line.frames[0] === "at openModal (/script.js:812:14)", line.frames);
  check("client/address-hashed-in-quota-keys", quotaKeys.some((k) => /^cn_cerr:ip:[0-9a-f]{24}$/.test(k)) && !quotaKeys.some((k) => k.includes("198.51")), quotaKeys);
  check("client/alert-sent", emails.length === 1 && emails[0].body.to[0] === "support@cybernetai.app", emails.length);
}
reset();
{
  for (const noise of [
    goodReport({ message: "ResizeObserver loop completed with undelivered notifications." }),
    goodReport({ message: "ResizeObserver loop limit exceeded", file: "", stack: "" }),
    { message: "Script error.", page: "/" },
    goodReport({ stack: "Error: x\n    at chrome-extension://abcdefghijklmnop/content.js:1:1", file: "" }),
    goodReport({ file: "moz-extension://1234/inject.js" }),
    goodReport({ file: "webkit-masked-url://hidden/", stack: "" })
  ]) {
    const { response } = await post(noise);
    check(`client/noise-204/${noise.message.slice(0, 20)}`, response.status === 204, response.status);
  }
  check("client/noise-not-reported", errorLines().length === 0 && emails.length === 0, errorLines());
}
reset();
{
  const statuses = [];
  for (let i = 0; i < 11; i++) statuses.push((await post(goodReport({ message: `Error number ${"abcdefghijk"[i]}` }))).response.status);
  check("client/memory-limit-10-per-minute", statuses.slice(0, 10).every((s) => s === 204) && statuses[10] === 429, statuses);
  check("client/other-address-unaffected", (await post(goodReport(), { ip: "192.0.2.99" })).response.status === 204);
  clockOffset = 61_000;
  check("client/limit-resets-after-a-minute", (await post(goodReport({ message: "later" }))).response.status === 204);
}
reset();
{
  mode.denyPrefix = "cn_cerr:ip:";
  check("client/durable-per-address-429", (await post(goodReport())).response.status === 429);
  mode.denyPrefix = "cn_cerr:all";
  check("client/durable-global-429", (await post(goodReport(), { ip: "192.0.2.5" })).response.status === 429);
  check("client/429-not-reported", errorLines().length === 0);
  mode.denyPrefix = "";
  mode.rpc = "500";
  check("client/quota-down-fails-open", (await post(goodReport(), { ip: "192.0.2.6" })).response.status === 204);
}
reset();
{
  // The response never waits for the alert email.
  mode.mail = "hang";
  limits.mailTimeoutMs = 2000;
  const started = realNow();
  const pending = [];
  const res = await handler(new Request("https://cybernetai.app/api/client-error", { method: "POST", body: JSON.stringify(goodReport()) }), { ip: "192.0.2.7", waitUntil: (p) => pending.push(p) });
  const took = realNow() - started;
  check("client/responds-before-email", res.status === 204 && took < 400 && pending.length === 1, { took, status: res.status });
  await Promise.all(pending);
  limits.mailTimeoutMs = 4000;
}

/* ---------- 3. reportError ---------- */

reset();
limits.rpcTimeoutMs = 80;
limits.mailTimeoutMs = 150;
{
  const weird = [
    undefined, null, 42, Symbol("s"), "plain string", { message: 123 },
    Object.defineProperty({}, "message", { get() { throw new Error("getter"); } }),
    new Proxy({}, { get() { throw new Error("proxy"); }, has() { throw new Error("proxy"); } }),
    (() => { const o = { name: "Loop" }; o.self = o; o.message = "circular"; return o; })(),
    Object.assign(new Error("x".repeat(100_000)), { stack: "y\n".repeat(100_000) }),
    new AggregateError([new Error("a")], "All promises were rejected")
  ];
  let threw = false;
  const results = [];
  for (const value of weird) {
    try { results.push(await reportError(value, { fn: "test-weird" })); } catch { threw = true; }
  }
  check("report/never-throws-on-odd-values", !threw && results.every((r) => r && typeof r === "object"), results.map((r) => r?.email));
  check("report/huge-error-capped", errorLines().every((l) => l.message.length <= 500 && (l.stack || "").length <= 2048));
}
for (const [label, setup] of [
  ["fetch-throws-sync", () => { mode.fetchThrowsSync = true; }],
  ["rpc-throws", () => { mode.rpc = "throw"; }],
  ["rpc-500", () => { mode.rpc = "500"; }],
  ["env-throws", () => { envThrows = true; }],
  ["mail-500", () => { mode.mail = "500"; }]
]) {
  reset();
  limits.rpcTimeoutMs = 80;
  setup();
  let threw = false;
  let result;
  try { result = await reportError(new Error(`boom ${label}`), { fn: "test" }); } catch { threw = true; }
  check(`report/never-throws/${label}`, !threw && result && typeof result.email === "string", result);
}
reset();
{
  mode.rpc = "hang";
  mode.mail = "hang";
  limits.rpcTimeoutMs = 80;
  limits.mailTimeoutMs = 150;
  const started = realNow();
  const promise = reportError(new Error("slow services"), { fn: "test" });
  const syncTook = realNow() - started;
  const result = await promise;
  const total = realNow() - started;
  check("report/returns-immediately", syncTook < 30, syncTook);
  check("report/bounded-by-timeouts", total < 80 + 80 + 150 + 300 && result.email === "failed", { total, email: result.email });
}
reset();
{
  let waited = null;
  const p = reportError(new Error("with context"), { fn: "test", context: { waitUntil: (x) => { waited = x; }, deploy: { context: "deploy-preview" }, requestId: "01HTEST" } });
  check("report/uses-waitUntil", waited === p);
  const r = await p;
  check("report/deploy-tag-in-subject", r.email === "sent" && emails[0].body.subject.startsWith("[deploy-preview] "), emails[0]?.body?.subject);
  let threw = false;
  try { await reportError(new Error("bad context"), { fn: "test", context: { waitUntil() { throw new Error("no"); } } }); } catch { threw = true; }
  check("report/waitUntil-throwing-is-fine", !threw);
}
reset();
{
  const r = await reportError(Object.assign(new Error("Sign in is required."), { status: 401 }), { fn: "account-status", status: 401 });
  check("report/4xx-skipped", r.skipped === "expected" && errorLines().length === 0 && fetchCalls.length === 0, r);
  const r5 = await reportError(new Error("Supabase down"), { fn: "account-status", status: 503 });
  check("report/5xx-reported", r5.email === "sent", r5.email);
}
reset();
{
  const error = new Error("Lookup failed for jane.doe@example.com (session eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl) at https://x.test/a?token=zz");
  error.stack = `Error: ${error.message}\n    at loadProfile (file:///var/task/netlify/functions/account-status.mjs:41:11)\n    at async handler (file:///var/task/netlify/functions/account-status.mjs:40:5)`;
  const r = await reportError(error, { fn: "account-status", label: "Account status failed" });
  const mail = emails[0]?.body || {};
  const all = `${mail.subject}\n${mail.text}\n${mail.html}`;
  check("email/sent-once", r.email === "sent" && emails.length === 1, r.email);
  check("email/from-and-to", mail.from === "CyberNet AI <notifications@cybernetai.app>" && mail.to?.[0] === "support@cybernetai.app", [mail.from, mail.to]);
  check("email/has-fingerprint", all.includes(r.fingerprint) && /^[0-9a-f]{12}$/.test(r.fingerprint), r.fingerprint);
  check("email/has-count", /Count: 1 time since \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC \(all servers\)/.test(mail.text), mail.text);
  check("email/has-message", mail.text.includes("Message: Error: Lookup failed for <email>"), mail.text);
  check("email/has-frames", mail.text.includes("at loadProfile (file:///var/task/netlify/functions/account-status.mjs:41:11)"), mail.text);
  check("email/has-function-and-time", mail.text.includes("What happened: Account status failed.") && mail.text.includes("Where: function account-status") && /Time: \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}:\d{2} UTC/.test(mail.text), mail.text);
  check("email/html-shows-message-once", (mail.html.match(/Lookup failed for &lt;email&gt;/g) || []).length === 1, mail.html.length);
  check("email/no-personal-data", !/jane|eyJ|token=zz|example\.com/.test(all), all.slice(0, 400));
  check("email/idempotency-key", /^cn-error-[0-9a-f]{12}-\d+$/.test(emails[0]?.idempotency || ""), emails[0]?.idempotency);
  check("email/html-escaped", !/<script/i.test(mail.html) && mail.html.includes("&lt;email&gt;"));
}
reset();
{
  // Same error five times: one email. Six hours later: one more, with the count.
  const make = () => Object.assign(new Error("Stripe is unreachable"), { stack: "Error: Stripe is unreachable\n    at x (file:///var/task/a.mjs:1:1)" });
  const outcomes = [];
  for (let i = 0; i < 5; i++) outcomes.push((await reportError(make(), { fn: "create-checkout-session", label: "Checkout session failed" })).email);
  check("dedupe/one-email-per-fingerprint", emails.length === 1 && outcomes[0] === "sent" && outcomes.slice(1).every((o) => o === "deduped"), outcomes);
  // A fresh server instance: the shared quota still knows.
  resetErrorMemory();
  const fresh = await reportError(make(), { fn: "create-checkout-session", label: "Checkout session failed" });
  check("dedupe/across-instances", fresh.email === "deduped" && emails.length === 1, fresh.email);
  clockOffset = 6 * 3600e3 + 1000;
  const later = await reportError(make(), { fn: "create-checkout-session", label: "Checkout session failed" });
  check("dedupe/again-after-6-hours", later.email === "sent" && emails.length === 2, later.email);
  check("dedupe/count-in-second-email", /Count: 7 times since/.test(emails[1]?.body?.text || ""), emails[1]?.body?.text?.split("\n").find((l) => l.startsWith("Count")));
  const other = await reportError(new Error("A different failure"), { fn: "create-checkout-session" });
  check("dedupe/different-error-own-email", other.email === "sent" && other.fingerprint !== later.fingerprint && emails.length === 3);
  check("dedupe/number-variants-share-fingerprint", (await reportError(new Error("Timeout after 1200 ms"), { fn: "t" })).fingerprint === (await reportError(new Error("Timeout after 3400 ms"), { fn: "t" })).fingerprint);
}
reset();
{
  const outcomes = [];
  for (let i = 0; i < 25; i++) outcomes.push((await reportError(new Error(`Distinct failure ${"abcdefghijklmnopqrstuvwxy"[i]}`), { fn: "cap-test" })).email);
  check("cap/20-emails-a-day", emails.length === 20 && outcomes.filter((o) => o === "daily_cap").length === 5, { emails: emails.length, outcomes });
  clockOffset = 24 * 3600e3 + 1000;
  const next = await reportError(new Error("Distinct failure next day"), { fn: "cap-test" });
  check("cap/resets-next-day", next.email === "sent" && emails.length === 21, next.email);
}
for (const rpc of ["ok", "500"]) {
  // Anyone can send a browser report, so those may use only 10 of the 20 daily
  // alerts; server errors keep the rest (shared quota, then the memory fallback).
  reset();
  mode.rpc = rpc;
  const client = [];
  for (let i = 0; i < 15; i++) client.push((await reportError({ name: "Error", message: `Browser junk ${"abcdefghijklmno"[i]}` }, { source: "client", page: "/", kind: "error" })).email);
  check(`reserve/${rpc}/client-max-10`, emails.length === 10 && client.filter((o) => o === "daily_cap").length === 5, { emails: emails.length, client });
  const server = [];
  for (let i = 0; i < 12; i++) server.push((await reportError(new Error(`Server fault ${"abcdefghijkl"[i]}`), { fn: "reserve-test" })).email);
  check(`reserve/${rpc}/server-keeps-10`, emails.length === 20 && server.filter((o) => o === "sent").length === 10 && server.slice(10).every((o) => o === "daily_cap"), { emails: emails.length, server });
}
reset();
{
  // The shared quota is down: the per-instance fallback keeps both limits.
  mode.rpc = "500";
  const same = [];
  for (let i = 0; i < 3; i++) same.push((await reportError(new Error("Fallback same"), { fn: "fallback" })).email);
  check("fallback/dedupe-in-memory", emails.length === 1 && same[0] === "sent" && same[1] === "deduped", same);
  check("fallback/count-says-this-server", /on this server since/.test(emails[0]?.body?.text || ""));
  for (let i = 0; i < 25; i++) await reportError(new Error(`Fallback distinct ${"abcdefghijklmnopqrstuvwxy"[i]}`), { fn: "fallback" });
  check("fallback/daily-cap-in-memory", emails.length === 20, emails.length);
}
reset();
{
  ENV.ERROR_ALERTS = "off";
  const r = await reportError(new Error("switch off"), { fn: "t" });
  check("switch/alerts-off-still-logs", r.email === "disabled" && emails.length === 0 && errorLines().length === 1);
  delete ENV.ERROR_ALERTS;
  ENV.RESEND_API_KEY = "";
  const r2 = await reportError(new Error("no key"), { fn: "t" });
  check("switch/no-resend-key", r2.email === "no_key" && emails.length === 0);
}
{
  const html = buildAlertEmail({ source: "client", page: "/pricing", fn: undefined, where: undefined, name: "TypeError", message: "x <img src=x onerror=alert(1)>", fingerprint: "abcdef123456", frames: [], time: new Date().toISOString(), file: "/script.js:1:2", version: "1", ua: "Chrome 141 on Windows" }, { n: 3, since: Date.now(), scope: "all" }).html;
  check("email/escapes-client-text", !html.includes("<img") && html.includes("&lt;img"));
}

/* ---------- 4. server functions keep their answers and report ---------- */

reset();
limits.rpcTimeoutMs = 1500;
limits.mailTimeoutMs = 4000;
{
  const stats = (await import("../netlify/functions/public-stats.mjs")).default;
  mode.other = "500";
  const res = await stats(new Request("https://cybernetai.app/api/public-stats"));
  const body = await res.json();
  check("server/public-stats-response-unchanged", res.status === 503 && body.live === false && body.error === "Live stats are temporarily unavailable.", body);
  await new Promise((r) => setTimeout(r, 50));
  check("server/public-stats-reported", errorLines().some((l) => l.fn === "public-stats" && l.message.includes("Supabase returned 500")), errorLines());
}
reset();
{
  const usage = (await import("../netlify/functions/quickscan-usage.mjs")).default;
  mode.authUser = { id: "00000000-0000-4000-8000-000000000001", email: "tester@example.com" };
  mode.other = "500";
  const res = await usage(new Request("https://cybernetai.app/api/quickscan-usage", { method: "POST", headers: { authorization: "Bearer test-token" } }));
  const body = await res.json();
  check("server/quickscan-response-unchanged", res.status === 503 && body.error === "Could not check Quick Scan usage right now. Please try again.", body);
  await new Promise((r) => setTimeout(r, 50));
  const line = errorLines().find((l) => l.fn === "quickscan-usage");
  check("server/quickscan-reported-scrubbed", line && line.message.includes("<email>") && !JSON.stringify(errorLines()).includes("tester@example.com"), line);
}
reset();
{
  const status = (await import("../netlify/functions/account-status.mjs")).default;
  const res = await status(new Request("https://cybernetai.app/api/account-status"));
  check("server/account-status-401-unchanged-and-not-reported", res.status === 401 && errorLines().length === 0, res.status);
}
{
  // Every function on the list imports and calls reportError (the last three
  // were wired at integration, after their owners finished).
  const owned = ["analyze.mts", "recovery-mode.mts", "recovery-update.mts", "recovery-plan-background.mts", "recovery-case.mts", "recovery-checkin.mjs", "create-checkout-session.mjs", "customer-portal.mjs", "stripe-webhook.mjs", "account-status.mjs", "screenshot-preview.mjs", "byok-analyze.mts", "team-activity.mts", "business-account.mts", "business-activity.mts", "business-invite-accept.mts", "business-invite-cancel.mts", "business-member-remove.mts", "quickscan-usage.mjs", "public-stats.mjs", "validate-openai-key.mts", "client-error.mjs", "privacy-data.mts", "legal-acceptance.mts", "business-invite.mts"];
  for (const file of owned) {
    const source = readFileSync(path.join(root, "netlify/functions", file), "utf8");
    check(`wired/${file}`, /import \{ reportError(?:, [^}]+)? \} from "\.\.\/lib\/report-error\.mjs";/.test(source) && /reportError\(/.test(source.replace(/^import .*$/gm, "")), file);
  }
  const functions = readdirSync(path.join(root, "netlify/functions"));
  check("client-error-route", readFileSync(path.join(root, "netlify/functions/client-error.mjs"), "utf8").includes('path: "/api/client-error"') && functions.includes("client-error.mjs"));
  const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
  check("csp-allows-self-connect", /connect-src 'self'/.test(toml), "connect-src");
}

/* ---------- 5. the browser reporter, in a sandbox ---------- */

const reporterSource = readFileSync(path.join(root, "public/cybernet-errors.js"), "utf8");
function sandbox({ beacon = true, ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" } = {}) {
  const listeners = {};
  const beacons = [];
  const fetches = [];
  const win = {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    location: { origin: "https://cybernetai.app", pathname: "/pricing", search: "?q=private-search", hash: "#private-hash", href: "https://cybernetai.app/pricing?q=private-search#private-hash" },
    navigator: {
      userAgent: ua,
      sendBeacon: beacon ? (url, blob) => { beacons.push({ url, blob }); return beacon === true; } : undefined
    },
    document: {
      cookie: "sb-token=cookie-secret",
      querySelector: () => ({ getAttribute: (n) => (n === "src" ? "/ui/cybernet-ui.js?v=20261017-3" : null) })
    },
    localStorage: { getItem: () => "storage-secret" },
    Blob,
    JSON,
    Date,
    fetch: (url, init) => { fetches.push({ url, init }); return Promise.resolve(new Response(null, { status: 204 })); }
  };
  win.window = win;
  const context = vm.createContext(win);
  vm.runInContext(reporterSource, context);
  // Inside the sandbox "window" is the context's global, which is what a real
  // page's events carry as their target.
  const inner = vm.runInContext("window", context);
  const fire = (type, event) => (listeners[type] || []).forEach((fn) => fn(event));
  const bodies = async () => {
    const out = [];
    for (const b of beacons) out.push(JSON.parse(await b.blob.text()));
    for (const f of fetches) out.push(JSON.parse(f.init.body));
    return out;
  };
  return { win: inner, fire, beacons, fetches, bodies };
}
const ALLOWED_KEYS = new Set(["kind", "name", "message", "stack", "file", "line", "col", "page", "version", "ua", "ts", "where"]);
{
  const sb = sandbox();
  const err = new TypeError("Cannot read properties of null (reading 'classList') for jane.doe@example.com");
  err.stack = "TypeError: Cannot read properties of null\n    at openModal (https://cybernetai.app/script.js?v=20261015-3:812:14)\n    at https://cybernetai.app/pricing?q=private-search:5:3";
  const event = { target: sb.win, error: err, message: "Uncaught TypeError: Cannot read properties of null (reading 'classList') for jane.doe@example.com", filename: "https://cybernetai.app/script.js?v=20261015-3", lineno: 812, colno: 14 };
  sb.fire("error", event);
  sb.fire("error", event); // the same error again
  const [body] = await sb.bodies();
  check("browser/one-report-for-duplicates", sb.beacons.length === 1 && sb.beacons[0].url === "/api/client-error" && sb.beacons[0].blob.type === "text/plain;charset=utf-8", sb.beacons.length);
  check("browser/only-allowed-fields", body && Object.keys(body).every((k) => ALLOWED_KEYS.has(k)), body && Object.keys(body));
  check("browser/fields", body.kind === "error" && body.name === "TypeError" && body.file === "/script.js" && body.line === 812 && body.col === 14 && body.page === "/pricing" && body.version === "20261017-3" && body.ua === "Chrome 141 on Windows" && !Number.isNaN(Date.parse(body.ts)), body);
  check("browser/message-scrubbed", body.message === "TypeError: Cannot read properties of null (reading 'classList') for <email>", body.message);
  check("browser/stack-without-query-or-origin", body.stack.includes("at openModal (/script.js:812:14)") && body.stack.includes("at /pricing:5:3") && !body.stack.includes("?"), body.stack);
  const raw = JSON.stringify(await sb.bodies());
  check("browser/no-private-data", !/private-search|private-hash|cookie-secret|storage-secret|jane/.test(raw), raw);

  for (const noise of [
    { target: sb.win, message: "ResizeObserver loop completed with undelivered notifications.", filename: "", lineno: 0, colno: 0 },
    { target: sb.win, message: "Script error.", filename: "", lineno: 0, colno: 0 },
    { target: sb.win, message: "Uncaught Error: injected", filename: "chrome-extension://abcdefghijklmnop/content.js", lineno: 1, colno: 1 },
    { target: sb.win, message: "Uncaught ReferenceError: dataLayer is not defined", filename: "https://www.googletagmanager.com/gtag/js", lineno: 1, colno: 1 },
    { target: { tagName: "IMG" }, message: "", filename: "", lineno: 0, colno: 0 }
  ]) sb.fire("error", noise);
  check("browser/noise-ignored", sb.beacons.length === 1, sb.beacons.length);

  sb.fire("unhandledrejection", { reason: new Error("Failed to fetch") });
  sb.fire("unhandledrejection", { reason: "plain string reason with 4242 4242 4242 4242" });
  sb.fire("unhandledrejection", { reason: { some: "object", password: "never" } });
  sb.win.CN_reportError(new Error("Checkout button failed"), "checkout");
  const all = await sb.bodies();
  check("browser/cap-5-per-page", sb.beacons.length === 5 && all.length === 5, all.length);
  check("browser/rejection-kinds", all[1].kind === "rejection" && all[1].message === "Failed to fetch" && all[2].message === "plain string reason with <number>" && all[3].message === "Unhandled promise rejection (not an Error)" && !JSON.stringify(all[3]).includes("never"), all.slice(1, 4));
  check("browser/manual-report", all[4].kind === "manual" && all[4].where === "checkout" && all[4].message === "Checkout button failed", all[4]);
  sb.win.CN_reportError(new Error("sixth"));
  check("browser/nothing-after-cap", sb.beacons.length === 5);

  // Each body passes the server's own checks.
  reset();
  for (const b of all) {
    const { response } = await post(b, { ip: "192.0.2.50" });
    check(`browser/server-accepts/${b.kind}`, response.status === 204, response.status);
  }
}
{
  const sb = sandbox({ beacon: "refuse" });
  sb.win.CN_reportError(new Error("beacon refused"));
  check("browser/fetch-fallback", sb.fetches.length === 1 && sb.fetches[0].init.keepalive === true && sb.fetches[0].init.credentials === "omit" && sb.fetches[0].init.method === "POST", sb.fetches[0]?.init);
  const sb2 = sandbox({ beacon: false });
  sb2.win.CN_reportError("no beacon api");
  check("browser/fetch-when-no-beacon", sb2.fetches.length === 1);
}
{
  const sb = sandbox();
  const err = new Error("big");
  err.stack = "\u{1F600}\u4e2d".repeat(5000);
  sb.win.CN_reportError(err);
  const size = sb.beacons[0] ? sb.beacons[0].blob.size : 0;
  check("browser/payload-under-8kb", size > 0 && size < 8 * 1024, size);
  let threw = false;
  try {
    sb.fire("error", null);
    sb.fire("error", { target: sb.win, error: Object.defineProperty({}, "stack", { get() { throw new Error("x"); } }), message: "odd", filename: "", lineno: 0, colno: 0 });
    sb.win.CN_reportError(undefined, { where: "obj context" });
  } catch { threw = true; }
  check("browser/never-throws", !threw);
}
{
  const fam = (ua) => { const sb = sandbox({ ua }); sb.win.CN_reportError(new Error("ua")); return sb.bodies().then((b) => b[0]?.ua); };
  check("browser/ua-edge", (await fam("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0")) === "Edge 141 on Windows");
  check("browser/ua-safari-ios", (await fam("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")) === "Safari 18 on iOS");
  check("browser/ua-firefox-android", (await fam("Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0")) === "Firefox 131 on Android");
}

/* ---------- 6. optional: a real page in headless Edge ---------- */

if (process.argv.includes("--browser")) await browserCheck();

console.error = realConsoleError;
process.stdout.write(`${checks - failures}/${checks} error-tracking checks pass\n`);
process.exit(failures ? 1 : 0);

async function browserCheck() {
  const PORT = Number(process.env.PORT) || 8831;
  const DEBUG_PORT = PORT + 4000;
  const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  if (!exe) {
    process.stdout.write("browser check skipped: Microsoft Edge not found\n");
    return;
  }
  const captured = [];
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Error reporter test</title>
<script src="/cybernet-errors.js" defer></script>
<script src="/ui/cybernet-ui.js?v=20261018-test" defer></script>
<script src="/app.js" defer></script></head>
<body><form><label>Password <input id="pw" type="password" value="my-password-123"></label></form>
<p>Signed in as jane.doe@example.com</p></body></html>`;
  const app = `document.cookie = "visitor=cookie-secret-value; path=/";
try { localStorage.setItem("cn-test", "storage-secret-value"); } catch (e) {}
function openModal() { const el = document.getElementById("missing-" + document.getElementById("pw").value.length); return el.classList; }
setTimeout(function () { openModal(); }, 50);
setTimeout(function () { openModal(); }, 100);
setTimeout(function () { Promise.reject(new Error("Lookup failed for jane.doe@example.com")); }, 150);
setTimeout(function () { window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." })); }, 200);
setTimeout(function () { window.CN_reportError(new Error("Manual report from the test page"), "checkout"); }, 250);
setTimeout(function () { document.title = "done"; }, 600);`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (req.method === "POST" && url.pathname === "/api/client-error") {
      let data = "";
      req.on("data", (c) => { data += c; });
      req.on("end", () => {
        captured.push({ body: data, contentType: req.headers["content-type"], cookie: req.headers.cookie || "" });
        res.statusCode = 204;
        res.end();
      });
      return;
    }
    const files = { "/cybernet-errors.js": [reporterSource, "text/javascript"], "/ui/cybernet-ui.js": ["", "text/javascript"], "/app.js": [app, "text/javascript"] };
    if (files[url.pathname]) {
      res.setHeader("Content-Type", files[url.pathname][1]);
      res.end(files[url.pathname][0]);
      return;
    }
    if (url.pathname === "/test/page") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(page);
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const profile = mkdtempSync(path.join(os.tmpdir(), "cn-errors-"));
  const browser = spawn(exe, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore" });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let target;
    for (let i = 0; i < 120 && !target; i++) {
      try { target = (await (await realFetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
      if (!target) await sleep(250);
    }
    if (!target) throw new Error("Edge did not start");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
    };
    const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/test/page?token=abc123secret&email=jane.doe%40example.com#private-hash` });
    for (let i = 0; i < 40; i++) {
      const r = await send("Runtime.evaluate", { expression: "document.title", returnByValue: true });
      if (r?.result?.value === "done") break;
      await sleep(150);
    }
    await sleep(500);
    ws.close();
  } catch (error) {
    check("real-browser/ran", false, String(error?.message || error));
  } finally {
    try { browser.kill(); } catch { /* ignore */ }
    spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore", timeout: 20000 });
    server.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold it */ }
  }
  const bodies = captured.map((c) => { try { return JSON.parse(c.body); } catch { return null; } });
  const raw = captured.map((c) => c.body).join("\n");
  process.stdout.write(`real browser sent ${captured.length} report(s):\n${bodies.map((b) => `  ${JSON.stringify(b)}`).join("\n")}\n`);
  check("real-browser/three-reports", captured.length === 3, captured.length);
  check("real-browser/sendBeacon-plain-text", captured.every((c) => /^text\/plain/i.test(c.contentType || "")), captured.map((c) => c.contentType));
  check("real-browser/only-allowed-fields", bodies.every((b) => b && Object.keys(b).every((k) => ALLOWED_KEYS.has(k))), bodies);
  const first = bodies[0] || {};
  check("real-browser/error-fields", first.kind === "error" && first.name === "TypeError" && first.file === "/app.js" && first.line === 3 && first.col > 0 && first.page === "/test/page" && first.version === "20261018-test" && /^Edge \d+ on Windows$/.test(first.ua), first);
  check("real-browser/rejection-and-manual", bodies.some((b) => b?.kind === "rejection" && b.message === "Lookup failed for <email>") && bodies.some((b) => b?.kind === "manual" && b.where === "checkout"), bodies);
  check("real-browser/no-private-data", !/my-password-123|abc123secret|private-hash|jane|cookie-secret-value|storage-secret-value|token=/.test(raw), raw);
  // What the server does with them.
  reset();
  for (const b of bodies.filter(Boolean)) {
    const { response } = await post(b, { ip: "192.0.2.77" });
    check(`real-browser/server-accepts/${b.kind}`, response.status === 204, response.status);
  }
  check("real-browser/server-logged", errorLines().length === bodies.length, errorLines().length);
}

function realFetch(...args) {
  return nativeFetch(...args);
}
