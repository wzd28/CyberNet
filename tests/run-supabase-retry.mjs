// Supabase's passing 401 PGRST303 "JWT issued at future" (netlify/lib/supabase-retry.mjs):
// retried briefly for every server-side PostgREST call, and nothing else is retried.
//   1. the helper itself, with a stubbed fetch, sleep and clock;
//   2. the functions that call it, with a stubbed global fetch (real short waits);
//   3. a source check: every file in netlify/functions and netlify/lib that calls
//      /rest/v1 goes through the helper, and no raw fetch() reaches /rest/v1.
// No network, no keys, no email: fetch and Netlify.env are stubbed and
// ERROR_ALERTS=off keeps reportError to its log line.
//   node tests/run-supabase-retry.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "RESEND_API_KEY", "ERROR_ALERTS", "ERROR_ALERT_EMAIL", "ADMIN_EMAILS", "OPENAI_API_KEY"]) delete process.env[name];

const BASE = "https://stub-project.supabase.test";
const ENV = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", ERROR_ALERTS: "off" };
globalThis.Netlify = { env: { get: (name) => ENV[name] } };

const quiet = { log: console.log, warn: console.warn, error: console.error };
const lines = [];
console.log = (...args) => lines.push(["log", args.map(String).join(" ")]);
console.warn = (...args) => lines.push(["warn", args.map(String).join(" ")]);
console.error = (...args) => lines.push(["error", args.map(String).join(" ")]);
const logged = (level, pattern) => lines.filter(([l, text]) => l === level && pattern.test(text));
const reports = () => lines.filter(([l, text]) => l === "error" && text.startsWith('{"tag":"cn_error"')).map(([, text]) => JSON.parse(text));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  quiet.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
}

const FUTURE = { code: "PGRST303", details: null, hint: null, message: "JWT issued at future" };
const future = () => new Response(JSON.stringify(FUTURE), { status: 401, headers: { "Content-Type": "application/json" } });
const futureMessageOnly = () => new Response(JSON.stringify({ message: "JWT issued at future" }), { status: 401 });
const badKey = () => new Response(JSON.stringify({ message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." }), { status: 401 });
const otherJwt = () => new Response(JSON.stringify({ code: "PGRST301", message: "JWT could not be decoded" }), { status: 401 });
const ok = (data, init = {}) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

const retry = await import("../netlify/lib/supabase-retry.mjs");
const { fetchWithJwtRetry, isJwtIssuedAtFuture, RETRY_STANDARD, RETRY_TIGHT } = retry;

// A fake clock: sleeping and each request move it forward, nothing really waits.
function harness(answers, { requestMs = 50 } = {}) {
  const state = { t: 1_000_000, calls: [], sleeps: [], logs: [] };
  const queue = [...answers];
  state.policy = (extra = {}) => ({
    ...RETRY_STANDARD,
    fetch: async (url, init) => {
      state.calls.push({ url: String(url), init });
      state.t += typeof requestMs === "function" ? requestMs(state.calls.length) : requestMs;
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next() : next.clone();
    },
    sleep: async (ms) => { state.sleeps.push(ms); state.t += ms; },
    now: () => state.t,
    log: (level, line) => state.logs.push([level, line]),
    ...extra
  });
  return state;
}

/* ---------- 1. the helper ---------- */

check("policies: standard 400 then 1200 ms, tight one ~400 ms retry",
  JSON.stringify(RETRY_STANDARD.delaysMs) === "[400,1200]" && JSON.stringify(RETRY_TIGHT.delaysMs) === "[400]" && RETRY_TIGHT.maxTotalMs < RETRY_STANDARD.maxTotalMs && Object.isFrozen(RETRY_STANDARD) && Object.isFrozen(RETRY_TIGHT.delaysMs));

{
  const h = harness([future, ok([{ id: "p1" }])]);
  const response = await fetchWithJwtRetry(`${BASE}/rest/v1/profiles?select=id&plan=eq.pro`, {}, h.policy({ label: "unit" }));
  const rows = await response.json().catch(() => null);
  check("PGRST303 then 200: one retry, the 200 is returned unread", h.calls.length === 2 && response.status === 200 && rows?.[0]?.id === "p1", { calls: h.calls.length, status: response.status, rows });
  check("PGRST303 then 200: waited about 400 ms", JSON.stringify(h.sleeps) === "[400]", h.sleeps);
  check("PGRST303 then 200: one info line, method and path only", h.logs.length === 1 && h.logs[0][0] === "info" && /PGRST303/.test(h.logs[0][1]) && h.logs[0][1].includes("GET /rest/v1/profiles") && !h.logs[0][1].includes("plan=eq") && /retry 1 of 2 answered HTTP 200/.test(h.logs[0][1]) && h.logs[0][1].includes("(unit)"), h.logs);
}
{
  const h = harness([futureMessageOnly, ok([])]);
  const response = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h.policy());
  check("message-only 'JWT issued at future' is retried too", h.calls.length === 2 && response.status === 200, h.calls.length);
}
{
  const h = harness([future]);
  const response = await fetchWithJwtRetry(`${BASE}/rest/v1/profiles`, {}, h.policy());
  const body = await response.json().catch(() => null);
  check("PGRST303 three times: 2 retries, then the final 401 is returned", h.calls.length === 3 && response.status === 401 && body?.code === "PGRST303", { calls: h.calls.length, status: response.status, body });
  check("PGRST303 three times: waited 400 then 1200 ms", JSON.stringify(h.sleeps) === "[400,1200]", h.sleeps);
  check("PGRST303 three times: one warn line 'still failing'", h.logs.length === 1 && h.logs[0][0] === "warn" && /still failing after 2 retries/.test(h.logs[0][1]), h.logs);
}
for (const [name, answer] of [["another 401 (bad key)", badKey], ["another 401 (other JWT error)", otherJwt], ["200", () => ok([])], ["204", () => new Response(null, { status: 204 })], ["403", () => new Response("{}", { status: 403 })], ["409", () => new Response('{"code":"23505"}', { status: 409 })], ["500", () => new Response('{"message":"db down"}', { status: 500 })], ["503", () => new Response("upstream", { status: 503 })]]) {
  const h = harness([answer, ok([])]);
  const response = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, { method: "POST", body: "{}" }, h.policy());
  const expected = answer().status;
  check(`${name}: no retry, answer returned as it is`, h.calls.length === 1 && h.sleeps.length === 0 && h.logs.length === 0 && response.status === expected, { calls: h.calls.length, status: response.status });
}
{
  const h = harness([new TypeError("fetch failed")]);
  let thrown = null;
  try { await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h.policy()); } catch (error) { thrown = error; }
  check("network error: thrown as before, no retry", thrown?.message === "fetch failed" && h.calls.length === 1, { thrown: String(thrown), calls: h.calls.length });
}
{
  const body = JSON.stringify({ p_key: "analyze:quick:u1", p_window_seconds: 600, p_max_requests: 40 });
  const headers = { apikey: "stub-service", Authorization: "Bearer stub-service", "Content-Type": "application/json", Prefer: "return=representation" };
  for (const method of ["POST", "PATCH", "DELETE"]) {
    const h = harness([future, ok({ allowed: true })]);
    await fetchWithJwtRetry(`${BASE}/rest/v1/rpc/consume_api_quota`, { method, headers, body }, h.policy());
    const [a, b] = h.calls;
    check(`${method}: retried with the same URL, method, headers and body`, h.calls.length === 2 && a.url === b.url && b.init.method === method && b.init.body === body && JSON.stringify(b.init.headers) === JSON.stringify(headers), h.calls);
  }
}
{
  // A stream body cannot be sent twice, so it is not retried (no caller sends one).
  const h = harness([future, ok([])]);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{}")); c.close(); } });
  const response = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, { method: "POST", body: stream, duplex: "half" }, h.policy());
  check("stream body: not retried", h.calls.length === 1 && response.status === 401, h.calls.length);
}
{
  // Time cap: a retry starts only while elapsed time + the wait stays within maxTotalMs.
  const h1 = harness([future, ok([])], { requestMs: 1200 });
  await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h1.policy(RETRY_TIGHT));
  check("tight: a typical 1.2 s answer + 400 ms wait fits 3000 ms -> one retry", h1.calls.length === 2 && JSON.stringify(h1.sleeps) === "[400]", { calls: h1.calls.length, sleeps: h1.sleeps });

  const h2 = harness([future], { requestMs: 50 });
  const r2 = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h2.policy(RETRY_TIGHT));
  check("tight: at most 1 retry of ~400 ms", h2.calls.length === 2 && JSON.stringify(h2.sleeps) === "[400]" && r2.status === 401, { calls: h2.calls.length, sleeps: h2.sleeps });

  const h3 = harness([future, ok([])], { requestMs: 2700 });
  const r3 = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h3.policy(RETRY_TIGHT));
  check("tight: 2700 ms answer + 400 ms wait > 3000 ms -> no retry, the 401 stands", h3.calls.length === 1 && h3.sleeps.length === 0 && r3.status === 401 && /not retried/.test(h3.logs[0]?.[1] || ""), { calls: h3.calls.length, logs: h3.logs });

  const h4 = harness([future], { requestMs: (n) => (n === 1 ? 1000 : 4000) });
  await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h4.policy());
  check("standard: a slow first retry stops the second (cap 6000 ms)", h4.calls.length === 2 && JSON.stringify(h4.sleeps) === "[400]", { calls: h4.calls.length, sleeps: h4.sleeps });

  const h5 = harness([future], { requestMs: 1200 });
  await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h5.policy());
  check("standard: typical 1.2 s answers still get both retries", h5.calls.length === 3 && JSON.stringify(h5.sleeps) === "[400,1200]", { calls: h5.calls.length, sleeps: h5.sleeps });

  const h6 = harness([future], { requestMs: 50 });
  const started = h6.t;
  await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h6.policy());
  check("standard: tries and waits stay within maxTotalMs", h6.t - started <= RETRY_STANDARD.maxTotalMs && h6.calls.length === 3, { elapsed: h6.t - started });
}
{
  // The caller's abort signal is shared by every try: once it fires, no new try starts.
  const controller = new AbortController();
  const h = harness([future, ok([])]);
  const response = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, { signal: controller.signal }, h.policy({ sleep: async () => controller.abort() }));
  check("caller's signal fires during the wait: no new request, the 401 stands", h.calls.length === 1 && response.status === 401, h.calls.length);

  const h2 = harness([future, new DOMException("The operation was aborted due to timeout", "TimeoutError")]);
  const r2 = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, h2.policy());
  check("retry request fails: the earlier 401 is returned, not an error", h2.calls.length === 2 && r2.status === 401 && (await r2.json()).code === "PGRST303" && /could not be sent/.test(h2.logs[0]?.[1] || ""), { calls: h2.calls.length, logs: h2.logs });
}
{
  const response = future();
  const detected = await isJwtIssuedAtFuture(response);
  const body = await response.json().catch(() => null);
  check("detection reads a clone: the caller can still read the body", detected === true && body?.code === "PGRST303", body);
  check("detection: not for a 401 without PGRST303, a 200, or a non-Response", !(await isJwtIssuedAtFuture(badKey())) && !(await isJwtIssuedAtFuture(ok(FUTURE))) && !(await isJwtIssuedAtFuture({ status: 401 })) && !(await isJwtIssuedAtFuture(null)));
  check("detection: plain-text body", await isJwtIssuedAtFuture(new Response("JWT issued at future", { status: 401 })));
}
{
  // The real wait (no stub) resolves, and early when the signal fires.
  const t0 = Date.now();
  const h = harness([future, ok([])]);
  await fetchWithJwtRetry(`${BASE}/rest/v1/x`, {}, { ...h.policy(), sleep: undefined, now: undefined, delaysMs: [30] });
  check("default wait: really waits", h.calls.length === 2 && Date.now() - t0 >= 25, Date.now() - t0);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  const t1 = Date.now();
  const h2 = harness([future, ok([])]);
  const r2 = await fetchWithJwtRetry(`${BASE}/rest/v1/x`, { signal: controller.signal }, { ...h2.policy(), sleep: undefined, now: undefined, delaysMs: [5000], maxTotalMs: 10000 });
  check("default wait: ends early when the caller's signal fires", Date.now() - t1 < 2000 && h2.calls.length === 1 && r2.status === 401, Date.now() - t1);
}

/* ---------- 2. the functions ---------- */

// Routes by path: a list of answers used in order (the last one repeats), or a
// function of the call.
let routes = {};
let calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const headers = new Headers(init.headers || {});
  const call = { method: String(init.method || "GET").toUpperCase(), path: url.pathname, query: decodeURIComponent(url.search), body: init.body, apikey: headers.get("apikey"), auth: headers.get("authorization") };
  calls.push(call);
  if (url.pathname === "/auth/v1/user") return ok({ id: "u1", email: "person@example.invalid" });
  const key = Object.keys(routes).find((prefix) => url.pathname.startsWith(prefix));
  if (!key) return ok([]);
  if (typeof routes[key] === "function") return routes[key](call);
  const list = routes[key];
  const next = list.length > 1 ? list.shift() : list[0];
  // A repeated Response is handed out as a fresh copy each time.
  return typeof next === "function" ? next() : next.clone();
};
const callsTo = (p) => calls.filter((c) => c.path === p);
const reset = (r = {}) => { routes = r; calls = []; lines.length = 0; };
const authed = (url, body, method = "POST") => new Request(url, { method, headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });

// Functions run straight from source on a Node with type stripping, otherwise bundled with esbuild.
async function load(file) {
  const entry = path.join(root, file);
  try {
    return await import(pathToFileURL(entry).href);
  } catch (error) {
    const esbuild = path.join(root, "node_modules/.bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
    if (!existsSync(esbuild)) throw error;
    mkdirSync(path.join(root, ".tmp"), { recursive: true });
    const out = path.join(root, ".tmp", `retry-${path.basename(file).replace(/\.\w+$/, "")}.test.mjs`);
    const build = spawnSync(esbuild, [entry, "--bundle", "--platform=node", "--format=esm", "--external:openai", `--outfile=${out}`, "--log-level=warning"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    if (build.status !== 0) throw new Error(`esbuild failed for ${file}`);
    return import(pathToFileURL(out).href + `?t=${Date.now()}`);
  }
}

const supabase = await import("../netlify/lib/supabase.mjs");
{
  reset({ "/rest/v1/profiles": [future, ok([{ id: "u1", plan: "pro" }])] });
  const profile = await supabase.getProfile({ id: "u1" }).catch((error) => ({ error: String(error) }));
  const sent = callsTo("/rest/v1/profiles");
  check("lib serviceFetch (getProfile): PGRST303 then rows -> profile, one retry", profile?.plan === "pro" && sent.length === 2 && sent.every((c) => c.apikey === "stub-service" && c.auth === "Bearer stub-service"), sent);
  check("lib serviceFetch: one info line", logged("log", /PGRST303.*GET \/rest\/v1\/profiles.*retry 1 of 2 answered HTTP 200/).length === 1, lines);

  reset({ "/rest/v1/profiles": [badKey] });
  let thrown = null;
  try { await supabase.getProfile({ id: "u1" }); } catch (error) { thrown = error; }
  check("lib serviceFetch: a bad key 401 is not retried and still fails", thrown && callsTo("/rest/v1/profiles").length === 1, { thrown: String(thrown), calls });

  reset({ "/rest/v1/scan_history": [future, new Response(null, { status: 201 })] });
  await supabase.saveHistory("u1", { analysisType: "text", verdict: "safe", score: 5, summary: "s" }).catch(() => null);
  const posts = callsTo("/rest/v1/scan_history");
  check("lib serviceFetch (saveHistory): POST retried once with the same body", posts.length === 2 && posts[0].method === "POST" && posts[1].method === "POST" && posts[0].body === posts[1].body && JSON.parse(posts[1].body).user_id === "u1", posts);
}

const reportErrorLib = await import("../netlify/lib/report-error.mjs");
{
  reset({ "/rest/v1/rpc/consume_api_quota": [future] });
  const answer = await reportErrorLib.consumeQuota("cn-err:test", 3600, 5);
  check("alert quota (time-boxed): tight policy, one retry only, then null", answer === null && callsTo("/rest/v1/rpc/consume_api_quota").length === 2, { answer, calls });
  reset({ "/rest/v1/rpc/consume_api_quota": [future, ok({ allowed: true, used: 1, reset_at: new Date(Date.now() + 3600e3).toISOString() })] });
  const answer2 = await reportErrorLib.consumeQuota("cn-err:test", 3600, 5);
  check("alert quota: PGRST303 then answer -> allowed", answer2?.allowed === true && callsTo("/rest/v1/rpc/consume_api_quota").length === 2, answer2);
}

const checkin = (await import("../netlify/functions/recovery-checkin.mjs")).default;
{
  reset({ "/rest/v1/profiles": [future, ok([])] });
  const response = await checkin();
  const result = await response.json();
  check("recovery-checkin: PGRST303 once -> run succeeds, nothing reported", response.status === 200 && result.business?.checked === 0 && result.pro?.checked === 0 && reports().length === 0, { result, reports: reports() });
  check("recovery-checkin: the retry is logged with the function name", logged("log", /PGRST303.*\/rest\/v1\/profiles.*\(recovery-checkin\).*answered HTTP 200/).length >= 1, lines);

  reset({ "/rest/v1/profiles": [future] });
  const response2 = await checkin();
  const result2 = await response2.json();
  const sent = reports();
  check("recovery-checkin: still PGRST303 after the retries -> reported once per plan", response2.status === 200 && result2.business?.checked === 0 && sent.length === 2 && sent.every((r) => r.fn === "recovery-checkin" && /Profiles query failed \(HTTP 401\)/.test(r.message)), { result2, sent });
  check("recovery-checkin: 3 tries per plan (2 retries)", callsTo("/rest/v1/profiles").length === 6, callsTo("/rest/v1/profiles").length);

  reset({ "/rest/v1/profiles": [badKey] });
  await checkin();
  check("recovery-checkin: a bad key 401 is reported without retrying", callsTo("/rest/v1/profiles").length === 2 && reports().length === 2, { calls: callsTo("/rest/v1/profiles").length, reports: reports().length });

  // One business case whose owner turned the emails off: no email, only the PATCH.
  let patchesSeen = 0;
  reset({
    "/rest/v1/profiles": (call) => ok(call.query.includes("plan=eq.business") ? [{ id: "u1" }] : []),
    "/rest/v1/recovery_cases": (call) => call.method === "GET" ? ok([{ id: "c1", owner_user_id: "u1", case_title: "t" }]) : patchesSeen++ === 0 ? future() : new Response(null, { status: 204 }),
    "/auth/v1/admin/users": [ok({ email: "person@example.invalid", user_metadata: { recovery_emails: false } })]
  });
  const response3 = await checkin();
  const result3 = await response3.json();
  const patches = callsTo("/rest/v1/recovery_cases").filter((c) => c.method === "PATCH");
  check("recovery-checkin: PATCH (mark checked in) retried once with the same body", patches.length === 2 && patches[0].body === patches[1].body && /last_checkin_sent_at/.test(patches[1].body) && result3.business?.skipped === 1 && reports().length === 0, { patches, result3 });
}

const recoveryMode = await load("netlify/functions/recovery-mode.mts");
{
  reset({ "/rest/v1/rpc/consume_recovery_case": [future, ok([{ allowed: true }])] });
  const body = JSON.stringify({ p_user_id: "u1" });
  const response = await recoveryMode.serviceFetch("/rest/v1/rpc/consume_recovery_case", { method: "POST", body });
  const sent = callsTo("/rest/v1/rpc/consume_recovery_case");
  check("recovery-mode serviceFetch (also used by recovery-plan-background): one retry, same body", response.status === 200 && sent.length === 2 && sent[1].body === body && sent[1].apikey === "stub-service", sent);
}

const recoveryCase = (await load("netlify/functions/recovery-case.mts")).default;
{
  reset({ "/rest/v1/recovery_cases": [future, ok([{ id: "c1", owner_user_id: "u1" }])] });
  const response = await recoveryCase(authed("https://x.invalid/api/recovery-case", null, "GET"));
  const data = await response.json();
  check("recovery-case: list survives one PGRST303", response.status === 200 && data.cases?.length === 1 && callsTo("/rest/v1/recovery_cases").length === 2, { status: response.status, data });
}

const recoveryUpdate = (await load("netlify/functions/recovery-update.mts")).default;
{
  // Without the retry the case read fails and the answer is 404; with it, the
  // row is found and belongs to someone else, so the answer is 403.
  reset({ "/rest/v1/recovery_cases": [future, ok([{ id: "c1", owner_user_id: "someone-else" }])] });
  const response = await recoveryUpdate(authed("https://x.invalid/api/recovery-update", { caseId: "c1", updateText: "I changed my password" }));
  check("recovery-update: case read survives one PGRST303", response.status === 403 && callsTo("/rest/v1/recovery_cases").length === 2, { status: response.status, calls });
}

const analyze = (await load("netlify/functions/analyze.mts")).default;
{
  // Without the retry the limiter fails open; with it, its answer (false) is used.
  reset({ "/rest/v1/rpc/check_protect_rate_limit": [future, ok(false)], "/rest/v1/business_members": [ok([])] });
  const response = await analyze(authed("https://x.invalid/api/analyze", { type: "text", content: "hello" }), { ip: "203.0.113.7" });
  const sent = callsTo("/rest/v1/rpc/check_protect_rate_limit");
  check("analyze: rate-limit RPC survives one PGRST303 (429 from its real answer)", response.status === 429 && sent.length === 2 && sent[0].body === sent[1].body, { status: response.status, sent });

  reset({ "/rest/v1/rpc/check_protect_rate_limit": [future], "/rest/v1/business_members": [ok([])], "/rest/v1/rpc/consume_analysis": [ok([{ allowed: false, used: 3, daily_limit: 3, plan: "free" }])] });
  await analyze(authed("https://x.invalid/api/analyze", { type: "text", content: "hello again" }), { ip: "203.0.113.8" });
  check("analyze: tight policy, at most one retry", callsTo("/rest/v1/rpc/check_protect_rate_limit").length === 2, callsTo("/rest/v1/rpc/check_protect_rate_limit").length);
}

const legal = (await load("netlify/functions/legal-acceptance.mts")).default;
{
  reset({ "/rest/v1/legal_acceptances": [future, new Response(null, { status: 201 })] });
  const response = await legal(authed("https://x.invalid/api/legal-acceptance", { kind: "signup" }));
  const sent = callsTo("/rest/v1/legal_acceptances");
  check("legal-acceptance: insert retried once with the same body, recorded", response.status === 200 && sent.length === 2 && sent[0].body === sent[1].body && reports().length === 0, { status: response.status, sent: sent.length, reports: reports() });
}

const privacy = (await load("netlify/functions/privacy-data.mts")).default;
{
  reset({ "/rest/v1/scan_history": [future, new Response(null, { status: 204 })] });
  const response = await privacy(authed("https://x.invalid/api/privacy-data", { action: "clear-history" }));
  const sent = callsTo("/rest/v1/scan_history");
  check("privacy-data: DELETE retried once, history cleared, nothing reported", response.status === 200 && sent.length === 2 && sent.every((c) => c.method === "DELETE") && reports().length === 0, { status: response.status, sent, reports: reports() });
}

const backup = await import("../netlify/lib/backup.mjs");
{
  reset({ "/rest/v1/profiles": [future, ok([], { headers: { "Content-Range": "*/0" } })] });
  const result = await backup.exportTable({ url: BASE, serviceKey: "stub-service" }, { name: "profiles", key: ["id"] }, Date.now() + 60_000).catch((error) => ({ rows: [null], error: String(error) }));
  check("backup exportTable: read survives one PGRST303", result.rows.length === 0 && result.missing === false && callsTo("/rest/v1/profiles").length === 2, { result, calls });
}

/* ---------- 3. every /rest/v1 caller uses the helper ---------- */

const sourceFiles = [
  ...readdirSync(path.join(root, "netlify/functions")).filter((f) => /\.(m?[jt]s)$/.test(f)).map((f) => `netlify/functions/${f}`),
  ...readdirSync(path.join(root, "netlify/lib")).filter((f) => /\.(m?[jt]s)$/.test(f)).map((f) => `netlify/lib/${f}`)
].filter((f) => f !== "netlify/lib/supabase-retry.mjs");

const stripComments = (text) => text.split("\n").map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? "" : line)).join("\n");
const libServiceFetch = /import\s*\{[^}]*\bserviceFetch\b[^}]*\}\s*from\s*["'](\.\.\/lib|\.)\/supabase\.mjs["']/;
const siblingServiceFetch = /import\s*\{[^}]*\bserviceFetch\b[^}]*\}\s*from\s*["']\.\/([\w-]+\.m?[jt]s)["']/;
const helperImport = /import\s*\{[^}]*\bfetchWithJwtRetry\b[^}]*\}\s*from\s*["'](\.\.\/lib|\.)\/supabase-retry\.mjs["']/;

function localServiceFetchUsesHelper(text) {
  const start = text.search(/(async\s+)?function\s+serviceFetch\s*\(/);
  if (start < 0) return null;
  const end = text.indexOf("\n}\n", start);
  return /fetchWithJwtRetry\(/.test(text.slice(start, end < 0 ? undefined : end));
}

const restCallers = [];
for (const file of sourceFiles) {
  const text = stripComments(readFileSync(path.join(root, file), "utf8"));
  if (!text.includes("/rest/v1")) continue;
  restCallers.push(file);

  // No raw fetch() may reach /rest/v1: each occurrence must sit in a serviceFetch( or
  // fetchWithJwtRetry( call that started in the same statement.
  const problems = [];
  for (let at = text.indexOf("/rest/v1"); at >= 0; at = text.indexOf("/rest/v1", at + 1)) {
    const before = text.slice(Math.max(0, at - 600), at);
    const opener = [...before.matchAll(/(serviceFetch|fetchWithJwtRetry|(?<![\w.$])fetch)\(/g)].pop();
    const line = text.slice(0, at).split("\n").length;
    if (!opener) { problems.push(`line ${line}: /rest/v1 outside a fetch call`); continue; }
    if (opener[1] === "fetch") { problems.push(`line ${line}: raw fetch() to /rest/v1`); continue; }
    if (/;\s*\n/.test(before.slice(opener.index))) problems.push(`line ${line}: /rest/v1 built in an earlier statement`);
  }

  const local = localServiceFetchUsesHelper(text);
  const sibling = siblingServiceFetch.exec(text)?.[1];
  const siblingOk = sibling ? localServiceFetchUsesHelper(readFileSync(path.join(root, path.dirname(file), sibling), "utf8")) === true : false;
  const usesHelper = local === true || libServiceFetch.test(text) || siblingOk || (helperImport.test(text) && /fetchWithJwtRetry\(/.test(text));
  if (local === false) problems.push("its own serviceFetch does not call fetchWithJwtRetry");
  if (!usesHelper) problems.push("does not import or use the retry helper");
  check(`source: ${file} sends /rest/v1 through the PGRST303 retry`, problems.length === 0, problems);
}
{
  const lib = readFileSync(path.join(root, "netlify/lib/supabase.mjs"), "utf8");
  const body = lib.slice(lib.indexOf("export async function serviceFetch"), lib.indexOf("\n}\n", lib.indexOf("export async function serviceFetch")));
  check("source: lib/supabase.mjs serviceFetch calls fetchWithJwtRetry", /return fetchWithJwtRetry\(/.test(body) && !/(?<![\w.$])fetch\(/.test(body), body);
  const expected = ["analyze.mts", "recovery-case.mts", "recovery-mode.mts", "recovery-update.mts", "recovery-checkin.mjs", "legal-acceptance.mts", "privacy-data.mts", "screenshot-preview.mjs", "stripe-webhook.mjs"].map((f) => `netlify/functions/${f}`).concat(["netlify/lib/backup.mjs", "netlify/lib/supabase.mjs"]);
  check("source: the scan found the known /rest/v1 callers", expected.every((f) => restCallers.includes(f)), { missing: expected.filter((f) => !restCallers.includes(f)) });
  // The RPCs above (consume_api_quota, check_protect_rate_limit) and their tables are
  // documented in schema.sql, the same as the live definitions in docs/BACKUPS.md.
  const schema = readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
  const guide = readFileSync(path.join(root, "docs/BACKUPS.md"), "utf8");
  const appendix = guide.slice(guide.indexOf("```sql\n", guide.indexOf("## Appendix")) + 7, guide.indexOf("\n```", guide.indexOf("```sql\n", guide.indexOf("## Appendix")) + 7));
  check("schema.sql has api_rate_limits, checkout_debug_log, consume_api_quota, check_protect_rate_limit",
    ["create table if not exists public.api_rate_limits", "create table if not exists public.checkout_debug_log", "create or replace function public.consume_api_quota(", "create or replace function public.check_protect_rate_limit("].every((s) => schema.includes(s)));
  check("schema.sql carries the BACKUPS.md appendix SQL unchanged", appendix.length > 500 && schema.includes(appendix), appendix.length);
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  check("npm test runs this file", /node tests\/run-supabase-retry\.mjs/.test(pkg.scripts?.test || ""), pkg.scripts?.test);
}

console.log = quiet.log;
console.warn = quiet.warn;
console.error = quiet.error;
console.log(`supabase retry: ${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
