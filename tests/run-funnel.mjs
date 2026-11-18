// /api/funnel (netlify/functions/funnel.mjs): validation, same-origin rule, rate limits and the
// fail-soft answer while the table does not exist yet. No network, no keys: fetch and Netlify.env
// are stubbed. Also checks the web-only client helper in public/script.js by its source text.
//   node tests/run-funnel.mjs
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "RESEND_API_KEY", "ERROR_ALERTS", "ERROR_ALERT_EMAIL", "ERROR_REPORT_SALT"]) delete process.env[k];
const ENV = { SUPABASE_URL: "https://stub.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", ERROR_ALERTS: "off" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
const logs = [];
console.error = (...a) => logs.push(["error", a.map(String).join(" ")]);
console.warn = (...a) => logs.push(["warn", a.map(String).join(" ")]);

let calls = [];
let route = () => new Response(null, { status: 204 });
globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null }); return route(String(url), opts); };
const quotaOk = () => new Response(JSON.stringify({ allowed: true, used: 1, reset_at: new Date(Date.now() + 60000).toISOString() }), { status: 200 });

const mod = await import(pathToFileURL(path.join(root, "netlify/functions/funnel.mjs")).href);
const handler = mod.default;

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; return; } fail++; console.log(`FAIL ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`); };
const SITE = "https://cybernetai.app";
const req = (body, headers = { Origin: SITE }, method = "POST") => new Request(`${SITE}/api/funnel`, {
  method, headers: { "Content-Type": "text/plain;charset=UTF-8", ...headers }, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
});
const reset = () => { calls = []; logs.length = 0; mod.resetFunnelMemory(); };
const bumps = () => calls.filter(c => c.url.endsWith("/rpc/funnel_bump"));

// pure helpers
check("cleanSource lower-cases and strips", mod.cleanSource("TikTok Ads!") === "tiktokads");
check("cleanSource keeps - and _", mod.cleanSource("bf_2026-x") === "bf_2026-x");
check("cleanSource max 40", mod.cleanSource("a".repeat(90)).length === 40);
check("cleanSource empty -> direct", mod.cleanSource("") === "direct" && mod.cleanSource(undefined) === "direct" && mod.cleanSource(42) === "direct" && mod.cleanSource("!!!") === "direct");
for (const e of mod.EVENTS) check(`event ${e} accepted`, mod.validateFunnel({ event: e, source: "x" })?.event === e);
for (const e of ["purchase", "LAND", "", null, 5, "land "]) check(`event ${JSON.stringify(e)} rejected`, mod.validateFunnel({ event: e }) === null);
check("array body rejected", mod.validateFunnel([]) === null);
check("only event and source kept", JSON.stringify(Object.keys(mod.validateFunnel({ event: "land", source: "tiktok", user: "u1", ip: "1.2.3.4" }))) === '["event","source"]');

// happy path
reset(); route = (u) => u.includes("consume_api_quota") ? quotaOk() : new Response(null, { status: 204 });
let r = await handler(req({ event: "scan_guest", source: "TikTok" }), { ip: "203.0.113.9" });
check("valid step -> 204", r.status === 204, r.status);
check("one funnel_bump with the cleaned values", bumps().length === 1 && bumps()[0].body.p_event === "scan_guest" && bumps()[0].body.p_source === "tiktok", bumps());
check("bump payload has only event and source", JSON.stringify(Object.keys(bumps()[0]?.body || {})) === '["p_event","p_source"]');
const quotaKeys = calls.filter(c => c.url.includes("consume_api_quota")).map(c => c.body.p_key);
check("rate limit keys: hashed bucket + global", quotaKeys.length === 2 && /^cn_fun:ip:[0-9a-f]{2}$/.test(quotaKeys[0]) && quotaKeys[1] === "cn_fun:all", quotaKeys);
check("the address never leaves the function", !JSON.stringify(calls).includes("203.0.113.9"));
check("60 a minute per bucket", calls.find(c => c.url.includes("consume_api_quota"))?.body.p_window_seconds === 60 && calls.find(c => c.url.includes("consume_api_quota"))?.body.p_max_requests === 60);

// validation answers
reset(); r = await handler(req({ event: "purchase" }));
check("unknown step -> 400, nothing stored", r.status === 400 && bumps().length === 0);
reset(); r = await handler(req("not json"));
check("bad JSON -> 400", r.status === 400 && calls.length === 0);
reset(); r = await handler(req(JSON.stringify({ event: "land", source: "x".repeat(2000) })));
check("over 1 KB -> 413", r.status === 413 && calls.length === 0, r.status);
reset(); r = await handler(req(null, { Origin: SITE }, "GET"));
check("GET -> 405", r.status === 405);

// same origin only
reset(); r = await handler(req({ event: "land" }, { Origin: "https://evil.example" }));
check("other origin -> 403", r.status === 403 && calls.length === 0);
reset(); r = await handler(req({ event: "land" }, { Origin: "capacitor://localhost" }));
check("the iPhone app -> 403", r.status === 403 && calls.length === 0);
reset(); r = await handler(req({ event: "land" }, { Origin: "null" }));
check("Origin null -> 403", r.status === 403);
reset(); r = await handler(req({ event: "land" }, {}));
check("no Origin, no Referer -> 403", r.status === 403);
reset(); r = await handler(req({ event: "land" }, { Referer: `${SITE}/quick-scan` }));
check("no Origin, same-site Referer -> 204", r.status === 204 && bumps().length === 1);
reset(); r = await handler(req({ event: "land" }, { Referer: "https://cybernetai.app.evil.example/" }));
check("look-alike Referer -> 403", r.status === 403);
check("no CORS header on answers", !r.headers.get("access-control-allow-origin"));

// rate limit
reset(); route = (u) => u.includes("consume_api_quota") ? new Response(JSON.stringify({ allowed: false, used: 61, reset_at: new Date().toISOString() }), { status: 200 }) : new Response(null, { status: 204 });
r = await handler(req({ event: "land" }));
check("over the limit -> 429, not counted", r.status === 429 && bumps().length === 0);

// fail soft and fail open
reset(); route = (u) => u.includes("consume_api_quota") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function public.funnel_bump" }), { status: 404 });
r = await handler(req({ event: "land" }));
check("missing RPC/table -> still 204", r.status === 204);
check("quota RPC failure fails open (bump still tried)", bumps().length === 1);
check("no error report (no cn_error line)", !logs.some(([, l]) => l.includes('"tag":"cn_error"')), logs);
check("one warning", logs.filter(([k]) => k === "warn").length === 1, logs);
r = await handler(req({ event: "land" }));
check("second miss: no second warning", r.status === 204 && logs.filter(([k]) => k === "warn").length === 1);
reset(); route = () => { throw new Error("network down"); };
r = await handler(req({ event: "land" }));
check("network failure -> 204", r.status === 204);
reset(); delete ENV.SUPABASE_SERVICE_ROLE_KEY; route = () => new Response(null, { status: 204 });
r = await handler(req({ event: "land" }));
check("Supabase not configured -> 204", r.status === 204 && calls.length === 0);
ENV.SUPABASE_SERVICE_ROLE_KEY = "svc";
check("path /api/funnel", mod.config.path === "/api/funnel");

// the migration and its mirror
const sql = readFileSync(path.join(root, "supabase/migrations/20261118120000_funnel_counts.sql"), "utf8");
const schema = readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
for (const [name, text] of [["migration", sql], ["schema.sql", schema]]) {
  check(`${name}: table`, /create table if not exists public\.funnel_daily/.test(text));
  check(`${name}: RLS on`, /alter table public\.funnel_daily enable row level security/.test(text));
  check(`${name}: no browser grants`, /revoke all on table public\.funnel_daily from public, anon, authenticated/.test(text) && !/grant [^;]* to (anon|authenticated)/i.test(text.slice(text.indexOf("public.funnel_daily"))));
  check(`${name}: function search_path ''`, /function public\.funnel_bump\(p_event text, p_source text\)[\s\S]*?security definer\s+set search_path = ''/.test(text));
  check(`${name}: function only for service_role`, /revoke all on function public\.funnel_bump\(text, text\) from public, anon, authenticated;\s*grant execute on function public\.funnel_bump\(text, text\) to service_role;/.test(text));
}
const order = ["create table if not exists public.funnel_daily", "enable row level security", "create policy funnel_daily_service_role_all", "revoke all on table public.funnel_daily"].map(s => sql.indexOf(s));
check("migration order: table, RLS, policy, grants", order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), order);
for (const e of mod.EVENTS) check(`SQL lists ${e}`, sql.includes(`'${e}'`));

// the client helper (web build only)
const script = readFileSync(path.join(root, "public/script.js"), "utf8");
const helper = script.match(/\/\*@web\*\/(?:(?!\/\*@end-web\*\/)[\s\S])*?function cnFunnel\((?:(?!\/\*@end-web\*\/)[\s\S])*\/\*@end-web\*\//);
check("cnFunnel helper is in a web region", Boolean(helper));
if (helper) {
  check("helper uses sendBeacon or fetch keepalive", /sendBeacon/.test(helper[0]) && /keepalive:true/.test(helper[0]));
  check("helper dedupes per session", /sessionStorage/.test(helper[0]));
  check("helper posts to /api/funnel", helper[0].includes('"/api/funnel"'));
}
for (const e of mod.EVENTS) check(`script.js sends ${e}`, new RegExp(`cnFunnel\\("${e}"|"${e}"`).test(script));
console.log(`funnel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
