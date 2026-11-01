// netlify/functions/rate-limit-cleanup.mjs: the daily DELETE of api_rate_limits
// rows older than 90 days, and of apple_notifications (App Store Server
// Notifications already processed) older than 90 days.
// No network, no keys: fetch and Netlify.env are stubbed.
//   node tests/run-rate-limit-cleanup.mjs
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "RESEND_API_KEY", "RATE_LIMIT_CLEANUP", "ERROR_ALERTS"]) delete process.env[name];

const BASE = "https://stub-project.supabase.test";
let ENV = {};
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const fullEnv = () => ({ SUPABASE_URL: BASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", ERROR_ALERTS: "off" });

const quiet = { log: console.log, error: console.error };
const logged = [];
console.error = (...args) => logged.push(args.map(String).join(" "));

let calls = [];
let answer = () => new Response(null, { status: 204, headers: { "Content-Range": "*/42" } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const respond = (...args) => answer(url, ...args);
  calls.push({ method: String(init.method || "GET").toUpperCase(), path: url.pathname, query: decodeURIComponent(url.search), headers: init.headers || {} });
  if (url.pathname === "/rest/v1/rpc/consume_api_quota") return Response.json({ allowed: true, used: 1, reset_at: new Date(Date.now() + 3600e3).toISOString() });
  return respond();
};

const mod = await import("../netlify/functions/rate-limit-cleanup.mjs");

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  quiet.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
}

ENV = fullEnv();
check("schedule is daily, no URL", mod.config?.schedule === "@daily" && !("path" in mod.config), mod.config);

{
  calls = [];
  const now = Date.parse("2026-10-18T00:00:00Z");
  console.log = () => {};
  const r = await mod.cleanupRateLimits({ now });
  console.log = quiet.log;
  const del = calls.find((c) => c.method === "DELETE");
  const apple = calls.find((c) => c.path === "/rest/v1/apple_notifications");
  check("two DELETEs and nothing else: the rate limits, then the Apple notifications", calls.length === 2 && calls.every((c) => c.method === "DELETE") && del?.path === "/rest/v1/api_rate_limits" && apple, calls);
  check("only rows untouched for 90 days", del?.query === "?updated_at=lt.2026-07-20T00:00:00.000Z", del?.query);
  check("only Apple notifications received more than 90 days ago", apple?.query === "?received_at=lt.2026-07-20T00:00:00.000Z" && apple?.headers.apikey === "stub-service" && /return=minimal/.test(apple?.headers.Prefer), apple);
  check("service role and minimal return", del?.headers.apikey === "stub-service" && del?.headers.Authorization === "Bearer stub-service" && /return=minimal/.test(del?.headers.Prefer) && /count=exact/.test(del?.headers.Prefer), del?.headers);
  check("reports the number deleted (the existing result shape, plus the Apple count)", r.status === "done" && r.deleted === 42 && r.cutoff === "2026-07-20T00:00:00.000Z" && r.appleNotifications?.status === "done" && r.appleNotifications?.deleted === 42, r);
}
{
  console.log = () => {};
  // The Apple notifications table is not there yet (migration not applied): skipped, the main result unaffected.
  calls = [];
  answer = (url) => url.pathname === "/rest/v1/apple_notifications" ? new Response('{"code":"PGRST205"}', { status: 404 }) : new Response(null, { status: 204, headers: { "Content-Range": "*/7" } });
  const r = await mod.cleanupRateLimits();
  check("a missing apple_notifications table is skipped quietly", r.status === "done" && r.deleted === 7 && r.appleNotifications?.status === "skipped", r);
  // It fails but the rate-limit clean-up itself worked.
  calls = [];
  answer = (url) => url.pathname === "/rest/v1/apple_notifications" ? new Response('{"message":"db down"}', { status: 500 }) : new Response(null, { status: 204, headers: { "Content-Range": "*/7" } });
  const failed = await mod.cleanupRateLimits();
  check("a failing Apple notifications delete is reported but does not fail the run", failed.status === "done" && failed.appleNotifications?.status === "failed" && failed.appleNotifications?.httpStatus === 500, failed);
  const response = await mod.default();
  check("and the scheduled handler still answers 200", response.status === 200, response.status);
  // The rate-limit delete failing stops before the Apple one.
  calls = [];
  answer = () => new Response('{"message":"db down"}', { status: 500 });
  const first = await mod.cleanupRateLimits();
  check("if the rate-limit delete fails, the Apple one is not attempted", first.status === "failed" && !calls.some((c) => c.path === "/rest/v1/apple_notifications"), calls);
  console.log = quiet.log;
  answer = () => new Response(null, { status: 204, headers: { "Content-Range": "*/42" } });
}
{
  calls = [];
  answer = () => new Response('{"message":"db down"}', { status: 500 });
  const r = await mod.cleanupRateLimits();
  check("a failed DELETE is reported, not thrown", r.status === "failed" && r.httpStatus === 500, r);
  const response = await mod.default();
  check("the scheduled handler answers 500 on failure", response.status === 500, response.status);
}
{
  calls = [];
  answer = () => { throw new TypeError("fetch failed"); };
  const r = await mod.cleanupRateLimits();
  check("an unreachable database is reported, not thrown", r.status === "failed", r);
}
{
  calls = [];
  ENV = { ...fullEnv(), RATE_LIMIT_CLEANUP: "off" };
  const r = await mod.cleanupRateLimits();
  check("RATE_LIMIT_CLEANUP=off: nothing sent", r.status === "disabled" && calls.length === 0, { r, calls });
}
{
  calls = [];
  ENV = {};
  const r = await mod.cleanupRateLimits();
  check("no Supabase settings: fails without a request", r.status === "failed" && !calls.some((c) => c.method === "DELETE"), { r, calls });
}

console.error = quiet.error;
console.log(`rate-limit cleanup: ${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
