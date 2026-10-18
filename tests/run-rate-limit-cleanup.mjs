// netlify/functions/rate-limit-cleanup.mjs: the daily DELETE of api_rate_limits
// rows older than 90 days. No network, no keys: fetch and Netlify.env are stubbed.
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
  calls.push({ method: String(init.method || "GET").toUpperCase(), path: url.pathname, query: decodeURIComponent(url.search), headers: init.headers || {} });
  if (url.pathname === "/rest/v1/rpc/consume_api_quota") return Response.json({ allowed: true, used: 1, reset_at: new Date(Date.now() + 3600e3).toISOString() });
  return answer();
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
  check("one DELETE and nothing else", calls.length === 1 && del && del.path === "/rest/v1/api_rate_limits", calls);
  check("only rows untouched for 90 days", del?.query === "?updated_at=lt.2026-07-20T00:00:00.000Z", del?.query);
  check("service role and minimal return", del?.headers.apikey === "stub-service" && del?.headers.Authorization === "Bearer stub-service" && /return=minimal/.test(del?.headers.Prefer) && /count=exact/.test(del?.headers.Prefer), del?.headers);
  check("reports the number deleted", r.status === "done" && r.deleted === 42 && r.cutoff === "2026-07-20T00:00:00.000Z", r);
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
