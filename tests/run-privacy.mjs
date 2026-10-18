// Privacy controls (netlify/functions/privacy-data.mts) and the service-key
// fallback in netlify/functions/legal-acceptance.mts. No network, no keys, no
// accounts: fetch and the Netlify env are stubbed, and every request the
// function makes is recorded so the order of the deletion steps can be checked.
//
//   node tests/run-privacy.mjs
//
// The .mts functions are imported directly (Node 22.18+/23.6+ strips the types; these
// files have none). On an older Node they are bundled with esbuild into .tmp/ instead.
// PRIVACY_ENTRY=<path> runs the same checks against another copy of privacy-data.mts.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Only the stubbed env is read: drop any real variables of these names from this process.
const ENV_NAMES = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "ADMIN_EMAILS"];
for (const name of ENV_NAMES) delete process.env[name];

let ENV = {};
globalThis.Netlify = { env: { get: name => ENV[name] } };

async function load(entry, name) {
  const file = path.resolve(root, entry);
  try {
    return await import(pathToFileURL(file).href);
  } catch (error) {
    if (error?.code !== "ERR_UNKNOWN_FILE_EXTENSION") throw error;
  }
  // Older Node without type stripping: bundle with esbuild instead.
  const esbuild = await import("esbuild");
  mkdirSync(path.join(root, ".tmp"), { recursive: true });
  const out = path.join(root, ".tmp", name);
  await esbuild.build({ entryPoints: [file], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "warning" });
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

// The function logs every failed step on purpose; keep those lines for a failure report.
const logged = [];
console.error = (...args) => logged.push(args.map(String).join(" "));

const privacy = (await load(process.env.PRIVACY_ENTRY || "netlify/functions/privacy-data.mts", "privacy-data.test.mjs")).default;
const legal = (await load("netlify/functions/legal-acceptance.mts", "legal-acceptance.test.mjs")).default;

// ── fixtures (fake values only) ──
const BASE = "https://example-project.supabase.co";
const ANON = "test-anon-key";
const SERVICE = "test-service-key";
const SECRET = "test-secret-key";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const TEAM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TEAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPEN = "subscription_status=not.in.(active,trialing,past_due,unpaid)";

const fullEnv = () => ({ SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE });

// A tiny fake of the Supabase REST + Auth endpoints the function uses.
// `db` describes the state; `fail` maps "METHOD path-prefix" to a status to return.
let calls = [];
function install(db = {}) {
  const state = {
    profile: { id: USER, plan: "free", subscription_status: "inactive" },
    owned: [],
    teamDeleteReturns: null, // rows returned by the business_accounts DELETE (default: the team)
    teamStillThere: [],
    authDelete: 200,
    fail: {},
    ...db
  };
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const headers = init.headers || {};
    const target = decodeURIComponent(url.pathname + url.search);
    const call = { method, target, apikey: headers.apikey, auth: headers.Authorization, prefer: headers.Prefer, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const respond = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    for (const [key, status] of Object.entries(state.fail)) {
      const [m, prefix] = key.split(" ");
      if (m === method && target.startsWith(prefix)) return respond(status, { message: "simulated failure" });
    }

    if (target === "/auth/v1/user") {
      return call.auth === "Bearer good-user-token" ? respond(200, { id: USER, email: "person@example.com", created_at: "2026-10-01T00:00:00Z", user_metadata: { full_name: "Test Person" } }) : respond(401, { msg: "invalid JWT" });
    }
    if (target.startsWith("/auth/v1/admin/users/")) return respond(state.authDelete, {});
    if (method === "GET" && target.startsWith(`/rest/v1/profiles?id=eq.${USER}`)) return respond(200, state.profile ? [state.profile] : []);
    if (method === "GET" && target.startsWith(`/rest/v1/business_accounts?owner_user_id=eq.${USER}`)) return respond(200, state.owned);
    if (method === "GET" && target.startsWith("/rest/v1/business_accounts?id=eq.")) return respond(200, state.teamStillThere);
    if (method === "DELETE" && target.startsWith("/rest/v1/business_accounts?id=eq.")) {
      const teamId = target.match(/id=eq\.([^&]+)/)[1];
      return respond(200, state.teamDeleteReturns ?? [{ id: teamId }]);
    }
    if (method === "GET" && target.startsWith(`/rest/v1/recovery_cases?owner_user_id=eq.${USER}`)) return respond(200, [{ id: CASE, owner_user_id: USER }]);
    if (method === "GET" && target.startsWith("/rest/v1/recovery_versions?")) return respond(200, [{ case_id: CASE, version: 1 }]);
    if (method === "GET" && target.startsWith("/rest/v1/recovery_tasks?")) return respond(200, [{ case_id: CASE, title: "Call the bank" }]);
    if (method === "GET" && target.startsWith(`/rest/v1/business_members?user_id=eq.${USER}`)) return respond(200, [{ business_account_id: OTHER_TEAM, role: "member", status: "active" }]);
    if (method === "GET") return respond(200, []);
    if (method === "DELETE" || method === "PATCH" || method === "POST") return respond(204);
    return respond(404, { message: "unexpected" });
  };
}

function request(body, { token = "good-user-token", method = "POST" } = {}) {
  const headers = { "Content-Type": "application/json", "user-agent": "run-privacy" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://cybernetai.app/api/privacy-data", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
}

async function call(body, options) {
  const response = await privacy(request(body, options));
  return { status: response.status, data: await response.json() };
}

const writes = () => calls.filter(c => ["DELETE", "PATCH", "POST"].includes(c.method)).map(c => `${c.method} ${c.target}`);

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Every write must stay on this user's rows, or on the closed team this user owns.
function ownOnly(name, allowedTeams = []) {
  const ok = writes().every(w =>
    w.includes(`user_id=eq.${USER}`) ||
    w.includes(`invited_by_user_id=eq.${USER}`) ||
    w.includes(`/auth/v1/admin/users/${USER}`) ||
    allowedTeams.some(t => w.includes(`business_account_id=eq.${t}`) || w.includes(`business_accounts?id=eq.${t}&owner_user_id=eq.${USER}`))
  );
  check(`${name}: writes touch only this user's rows`, ok, writes());
}

// ── 1. free user is deleted ──
ENV = fullEnv();
install();
let r = await call({ action: "delete-account", confirmation: "DELETE" });
check("free user: 200 deleted", r.status === 200 && r.data.deleted === true && r.data.closedTeams === 0, r);
check("free user: write order", same(writes(), [
  `DELETE /rest/v1/business_members?user_id=eq.${USER}`,
  `DELETE /rest/v1/business_invites?invited_by_user_id=eq.${USER}`,
  `DELETE /auth/v1/admin/users/${USER}`
]), writes());
check("free user: caller checked with the anon key and their own JWT", calls[0].target === "/auth/v1/user" && calls[0].apikey === ANON && calls[0].auth === "Bearer good-user-token", calls[0]);
check("free user: data calls use the service role", calls.slice(1).every(c => c.apikey === SERVICE && c.auth === `Bearer ${SERVICE}`), calls.map(c => c.apikey));
check("free user: invites sent to the user's email by other teams are left alone", !writes().some(w => w.includes("email=eq.")), writes());
ownOnly("free user");

// ── 2. an open personal subscription blocks deletion ──
for (const status of ["active", "trialing", "past_due", "unpaid", "ACTIVE"]) {
  install({ profile: { id: USER, plan: "pro", subscription_status: status } });
  r = await call({ action: "delete-account", confirmation: "DELETE" });
  check(`subscription ${status}: 409 SUBSCRIPTION_ACTIVE`, r.status === 409 && r.data.code === "SUBSCRIPTION_ACTIVE" && /Manage Billing/.test(r.data.error), r);
  check(`subscription ${status}: nothing written`, writes().length === 0, writes());
}
for (const status of ["canceled", "incomplete_expired", "inactive", ""]) {
  install({ profile: { id: USER, plan: "free", subscription_status: status } });
  r = await call({ action: "delete-account", confirmation: "DELETE" });
  check(`subscription "${status}": deletion goes ahead`, r.status === 200 && r.data.deleted === true, r);
}
install({ profile: null });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("no profile row: deletion goes ahead", r.status === 200 && r.data.deleted === true, r);

// ── 3. an owned team with an open plan blocks deletion ──
for (const status of ["active", "trialing", "past_due", "unpaid"]) {
  install({ owned: [{ id: TEAM, subscription_status: status }] });
  r = await call({ action: "delete-account", confirmation: "DELETE" });
  check(`team ${status}: 409 TEAM_ACTIVE`, r.status === 409 && r.data.code === "TEAM_ACTIVE" && /Manage Billing/.test(r.data.error), r);
  check(`team ${status}: nothing written`, writes().length === 0, writes());
}
install({ owned: [{ id: TEAM, subscription_status: "canceled" }, { id: OTHER_TEAM, subscription_status: "active" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("one closed + one active team: 409 before any write", r.status === 409 && r.data.code === "TEAM_ACTIVE" && writes().length === 0, { r, w: writes() });

// ── 4. closed-team owner: team rows go first, in order, then the user ──
install({ owned: [{ id: TEAM, subscription_status: "canceled" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("closed-team owner: 200 deleted, 1 team closed", r.status === 200 && r.data.deleted === true && r.data.closedTeams === 1, r);
check("closed-team owner: exact call order", same(writes(), [
  `DELETE /rest/v1/business_members?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_invites?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_daily_usage?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_recovery_usage?business_account_id=eq.${TEAM}`,
  `PATCH /rest/v1/scan_history?business_account_id=eq.${TEAM}`,
  `PATCH /rest/v1/recovery_cases?business_account_id=eq.${TEAM}`,
  `DELETE /rest/v1/business_accounts?id=eq.${TEAM}&owner_user_id=eq.${USER}&${OPEN}`,
  `DELETE /rest/v1/business_members?user_id=eq.${USER}`,
  `DELETE /rest/v1/business_invites?invited_by_user_id=eq.${USER}`,
  `DELETE /auth/v1/admin/users/${USER}`
]), writes());
const unlinks = calls.filter(c => c.method === "PATCH");
check("closed-team owner: history and cases are unlinked, not deleted", unlinks.length === 2 && unlinks.every(c => same(c.body, { business_account_id: null })), unlinks);
check("closed-team owner: the team row is deleted only while it is closed and still theirs", calls.some(c => c.method === "DELETE" && c.target.includes(`business_accounts?id=eq.${TEAM}&owner_user_id=eq.${USER}&${OPEN}`)));
ownOnly("closed-team owner", [TEAM]);

// two closed teams: both are closed before the user is touched
install({ owned: [{ id: TEAM, subscription_status: "canceled" }, { id: OTHER_TEAM, subscription_status: "incomplete_expired" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
const firstUserWrite = writes().findIndex(w => w.includes(`user_id=eq.${USER}`) && !w.includes("owner_user_id"));
const lastTeamWrite = writes().map(w => w.includes(OTHER_TEAM)).lastIndexOf(true);
check("two closed teams: both closed, then the user", r.status === 200 && r.data.closedTeams === 2 && lastTeamWrite >= 0 && lastTeamWrite < firstUserWrite, writes());

// ── 5. member of another team: only their own link is removed ──
install({ owned: [] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("member of another team: 200 deleted", r.status === 200 && r.data.deleted === true, r);
check("member of another team: the other team is never touched", !calls.some(c => c.method !== "GET" && (c.target.includes(OTHER_TEAM) || c.target.includes("business_account_id=") || c.target.includes("business_accounts?"))), writes());
check("member of another team: own membership removed before the auth user", writes().indexOf(`DELETE /rest/v1/business_members?user_id=eq.${USER}`) === 0 && writes().at(-1) === `DELETE /auth/v1/admin/users/${USER}`, writes());
ownOnly("member of another team");

// ── 6. stops at the first failure, with a clear code ──
install({ owned: [{ id: TEAM, subscription_status: "canceled" }], fail: { [`DELETE /rest/v1/business_invites?business_account_id=eq.${TEAM}`]: 500 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("team cleanup fails: 502 TEAM_CLEANUP_FAILED", r.status === 502 && r.data.code === "TEAM_CLEANUP_FAILED" && /still open/.test(r.data.error), r);
check("team cleanup fails: nothing after the failing step", writes().at(-1) === `DELETE /rest/v1/business_invites?business_account_id=eq.${TEAM}` && !writes().some(w => w.includes("/auth/v1/admin")), writes());

install({ fail: { [`DELETE /rest/v1/business_members?user_id=eq.${USER}`]: 500 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("membership cleanup fails: 502 MEMBERSHIP_CLEANUP_FAILED, auth user kept", r.status === 502 && r.data.code === "MEMBERSHIP_CLEANUP_FAILED" && !writes().some(w => w.includes("/auth/v1/admin")), { r, w: writes() });

install({ authDelete: 500 });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("auth delete fails: 502 AUTH_DELETE_FAILED", r.status === 502 && r.data.code === "AUTH_DELETE_FAILED", r);

install({ fail: { [`GET /rest/v1/profiles`]: 500 } });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("profile lookup fails: 502 PROFILE_LOOKUP_FAILED, nothing written", r.status === 502 && r.data.code === "PROFILE_LOOKUP_FAILED" && writes().length === 0, { r, w: writes() });

// ── 7. idempotent ──
install({ authDelete: 404 });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("auth user already gone (404): still a success", r.status === 200 && r.data.deleted === true, r);

install({ owned: [{ id: TEAM, subscription_status: "canceled" }], teamDeleteReturns: [], teamStillThere: [] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("team row already gone on a retry: continues to the user", r.status === 200 && r.data.deleted === true && writes().at(-1) === `DELETE /auth/v1/admin/users/${USER}`, { r, w: writes() });

install({ owned: [{ id: TEAM, subscription_status: "canceled" }], teamDeleteReturns: [], teamStillThere: [{ id: TEAM, subscription_status: "active" }] });
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("team reactivated mid-request: 409 TEAM_ACTIVE, auth user kept", r.status === 409 && r.data.code === "TEAM_ACTIVE" && !writes().some(w => w.includes("/auth/v1/admin")), { r, w: writes() });

// ── 8. confirmation, method and action guards ──
install();
r = await call({ action: "delete-account" });
check("no confirmation: 400 CONFIRMATION_REQUIRED, nothing written", r.status === 400 && r.data.code === "CONFIRMATION_REQUIRED" && writes().length === 0, r);
r = await call({ action: "delete-account", confirmation: "delete" });
check("lower-case confirmation: 400", r.status === 400 && r.data.code === "CONFIRMATION_REQUIRED", r);
r = await call({ action: "launch" });
check("unknown action: 400 UNSUPPORTED_ACTION", r.status === 400 && r.data.code === "UNSUPPORTED_ACTION", r);
install();
r = await call(null, { method: "GET" });
check("GET: 405 and no calls", r.status === 405 && r.data.code === "METHOD_NOT_ALLOWED" && calls.length === 0, r);

// ── 9. unauthenticated ──
install();
r = await call({ action: "delete-account", confirmation: "DELETE" }, { token: "" });
check("no token: 401 AUTH_REQUIRED and no calls at all", r.status === 401 && r.data.code === "AUTH_REQUIRED" && calls.length === 0, { r, calls });
install();
r = await call({ action: "delete-account", confirmation: "DELETE" }, { token: "someone-elses-or-expired" });
check("rejected token: 401 AUTH_REQUIRED, nothing written", r.status === 401 && r.data.code === "AUTH_REQUIRED" && writes().length === 0, r);
install();
r = await call({ action: "export" }, { token: "" });
check("export without a token: 401", r.status === 401, r);

// ── 10. missing env and the SUPABASE_SECRET_KEY fallback ──
ENV = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON };
install();
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("no service key: 503 NOT_CONFIGURED, no calls", r.status === 503 && r.data.code === "NOT_CONFIGURED" && calls.length === 0, { r, calls });
ENV = { SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE };
install();
r = await call({ action: "export" });
check("no SUPABASE_URL: 503 NOT_CONFIGURED", r.status === 503 && r.data.code === "NOT_CONFIGURED", r);

ENV = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SECRET_KEY: SECRET };
install();
r = await call({ action: "delete-account", confirmation: "DELETE" });
check("only SUPABASE_SECRET_KEY: deletion works", r.status === 200 && r.data.deleted === true, r);
check("only SUPABASE_SECRET_KEY: data calls use it", calls.slice(1).every(c => c.apikey === SECRET && c.auth === `Bearer ${SECRET}`), calls.map(c => c.apikey));

ENV = { ...fullEnv(), SUPABASE_SECRET_KEY: SECRET };
install();
await call({ action: "clear-history" });
check("both keys set: SUPABASE_SERVICE_ROLE_KEY wins", calls.slice(1).every(c => c.apikey === SERVICE), calls.map(c => c.apikey));

// ── 11. export ──
ENV = fullEnv();
install({ owned: [{ id: TEAM, seat_tier: 5, subscription_status: "canceled" }] });
r = await call({ action: "export" });
const d = r.data.data || {};
check("export: 200 with every section", r.status === 200 && ["account", "profile", "dailyUsage", "savedHistory", "legalAcceptances", "recoveryCases", "recoveryVersions", "recoveryTasks", "recoveryUsage", "quickscanUsage", "teamMemberships", "ownedTeams"].every(k => k in d), Object.keys(d));
check("export: account is the caller", d.account?.id === USER && d.account?.email === "person@example.com", d.account);
check("export: Recovery versions and tasks of the user's cases", d.recoveryVersions?.length === 1 && d.recoveryTasks?.length === 1 && calls.some(c => c.target.startsWith(`/rest/v1/recovery_tasks?case_id=in.(${CASE})`)), d);
check("export: memberships and owned teams included", d.teamMemberships?.[0]?.business_account_id === OTHER_TEAM && d.ownedTeams?.[0]?.id === TEAM, d);
check("export: read-only", writes().length === 0, writes());
check("export: every read is filtered to this user or their cases", calls.slice(1).every(c => c.target.includes(USER) || c.target.includes(`case_id=in.(${CASE})`)), calls.map(c => c.target));

install({ fail: { "GET /rest/v1/quickscan_usage": 500 } });
r = await call({ action: "export" });
check("export failure: 502 EXPORT_FAILED", r.status === 502 && r.data.code === "EXPORT_FAILED", r);

// ── 12. clear-history ──
install();
r = await call({ action: "clear-history" });
check("clear-history: 200 cleared", r.status === 200 && r.data.cleared === true, r);
check("clear-history: one delete, this user's history only", same(writes(), [`DELETE /rest/v1/scan_history?user_id=eq.${USER}`]), writes());
install({ fail: { "DELETE /rest/v1/scan_history": 500 } });
r = await call({ action: "clear-history" });
check("clear-history failure: 502 CLEAR_FAILED", r.status === 502 && r.data.code === "CLEAR_FAILED", r);

// ── 13. unexpected errors stay generic ──
install();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => (String(input).endsWith("/auth/v1/user") ? realFetch(input, init) : Promise.reject(new TypeError("fetch failed")));
r = await call({ action: "clear-history" });
check("network failure to the database: 502 with the step code", r.status === 502 && r.data.code === "CLEAR_FAILED", r);
globalThis.fetch = async () => Promise.reject(new TypeError("fetch failed"));
r = await call({ action: "clear-history" });
check("auth server unreachable: 500 SERVER_ERROR with a plain message", r.status === 500 && r.data.code === "SERVER_ERROR" && !/fetch failed/.test(r.data.error), r);

// ── 14. legal-acceptance: the same key fallback ──
async function accept(env) {
  ENV = env;
  install();
  const response = await legal(new Request("https://cybernetai.app/api/legal-acceptance", {
    method: "POST",
    headers: { Authorization: "Bearer good-user-token", "Content-Type": "application/json", "user-agent": "run-privacy" },
    body: JSON.stringify({ kind: "signup", page: "https://cybernetai.app/" })
  }));
  return { status: response.status, data: await response.json() };
}
r = await accept({ SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON, SUPABASE_SECRET_KEY: SECRET });
const insert = calls.find(c => c.method === "POST" && c.target === "/rest/v1/legal_acceptances");
check("legal-acceptance with only SUPABASE_SECRET_KEY: recorded", r.status === 200 && r.data.recorded === true && insert?.apikey === SECRET && insert?.body?.user_id === USER, { r, insert });
r = await accept(fullEnv());
check("legal-acceptance with SUPABASE_SERVICE_ROLE_KEY: recorded with it", r.status === 200 && calls.find(c => c.method === "POST")?.apikey === SERVICE, r);
r = await accept({ SUPABASE_URL: BASE, SUPABASE_ANON_KEY: ANON });
check("legal-acceptance with no service key: 503", r.status === 503, r);

console.log(`privacy: ${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`(${logged.length} lines the functions logged; last 5:)\n  ${logged.slice(-5).join("\n  ")}`);
  process.exit(1);
}
