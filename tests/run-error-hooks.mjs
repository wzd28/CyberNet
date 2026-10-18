// reportError hooks in privacy-data, legal-acceptance and business-invite (wired at integration):
// real server failures are reported once, without the database's response text, and expected
// answers (400, 401, 409) are not. No network, no keys, no email: fetch and Netlify.env are
// stubbed and ERROR_ALERTS=off keeps reportError to its log line.
//   node tests/run-error-hooks.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Only this process: make sure no real setting on this machine changes what the functions see.
for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "RESEND_API_KEY", "ERROR_ALERTS", "ERROR_ALERT_EMAIL"]) delete process.env[k];
const ENV = { SUPABASE_URL: "https://stub.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", ERROR_ALERTS: "off" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
const logs = []; console.error = (...a) => logs.push(a.map(String).join(" "));
const cn = () => logs.filter(l => l.startsWith('{"tag":"cn_error"')).map(l => JSON.parse(l));
let route = () => new Response("{}", { status: 200 });
globalThis.fetch = async (url, opts = {}) => route(String(url), opts);
const user = () => new Response(JSON.stringify({ id: "u1", email: "a@b.c" }), { status: 200 });
const imp = f => import(pathToFileURL(path.join(root, "netlify/functions", f)).href);
const legal = (await imp("legal-acceptance.mts")).default;
const privacy = (await imp("privacy-data.mts")).default;
const invite = (await imp("business-invite.mts")).default;
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : " " + JSON.stringify(detail))); };
const req = (u, body, auth = true) => new Request(u, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer t" } : {}) }, body: JSON.stringify(body) });
const reset = () => { logs.length = 0; };

// legal-acceptance
reset(); route = (u) => u.includes("/auth/v1/user") ? user() : new Response("row detail a@b.c", { status: 500 });
let r = await legal(req("https://x/api/legal-acceptance", { kind: "signup" }));
await new Promise(r => setTimeout(r, 20));
check("legal insert 500 -> 500, one report, no detail", r.status === 500 && cn().length === 1 && cn()[0].fn === "legal-acceptance" && !JSON.stringify(cn()).includes("row detail"), cn());
reset(); r = await legal(req("https://x/api/legal-acceptance", { kind: "signup" }, false));
check("legal 401 not reported", r.status === 401 && cn().length === 0, cn());
reset(); delete ENV.SUPABASE_SERVICE_ROLE_KEY; route = (u) => user();
r = await legal(req("https://x/api/legal-acceptance", { kind: "signup" }));
check("legal 503 not configured reported", r.status === 503 && cn().length === 1, cn());
ENV.SUPABASE_SERVICE_ROLE_KEY = "svc";
reset(); route = (u) => user(); r = await legal(req("https://x/api/legal-acceptance", { kind: "bogus" }));
check("legal 400 not reported", r.status === 400 && cn().length === 0, cn());

// privacy-data
reset(); route = (u) => u.includes("/auth/v1/user") ? user() : new Response("detail a@b.c", { status: 500 });
r = await privacy(req("https://x/api/privacy-data", { action: "clear-history" }));
check("privacy db 500 -> 502 CLEAR_FAILED, one report", r.status === 502 && cn().length === 1 && cn()[0].fn === "privacy-data" && !JSON.stringify(cn()).includes("detail a@b.c"), cn());
reset(); r = await privacy(req("https://x/api/privacy-data", { action: "delete-account" }));
check("privacy 400 confirmation not reported", r.status === 400 && cn().length === 0, cn());
reset(); delete ENV.SUPABASE_SERVICE_ROLE_KEY; route = (u) => user();
r = await privacy(req("https://x/api/privacy-data", { action: "clear-history" }));
check("privacy 503 not configured reported once", r.status === 503 && cn().length === 1, cn());
ENV.SUPABASE_SERVICE_ROLE_KEY = "svc";
reset(); route = (u) => u.includes("/auth/v1/user") ? user() : u.includes("/auth/v1/admin/users") ? new Response("x", { status: 500 }) : u.includes("profiles") ? new Response("[]", { status: 200 }) : u.includes("business_accounts") ? new Response("[]", { status: 200 }) : new Response(null, { status: 204 });
r = await privacy(req("https://x/api/privacy-data", { action: "delete-account", confirmation: "DELETE" }));
check("privacy auth delete 500 -> 502, one report", r.status === 502 && cn().length === 1 && /Auth delete failed/.test(cn()[0].message), cn());
reset(); route = (u) => u.includes("/auth/v1/user") ? user() : new Response("[]", { status: 200 });
r = await privacy(req("https://x/api/privacy-data", { action: "nope" }));
check("privacy unsupported not reported", r.status === 400 && cn().length === 0, cn());

// business-invite: unauthenticated is a 401 and is not reported
reset(); r = await invite(req("https://x/api/business-invite", { email: "x@y.z" }, false));
check("invite 401 not reported", r.status === 401 && cn().length === 0, cn());
console.log(`${results.filter(Boolean).length}/${results.length} error-hook checks pass`);
process.exit(results.every(Boolean) ? 0 : 1);
