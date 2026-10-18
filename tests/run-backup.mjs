// The weekly database backup: export with pagination, encryption, the email,
// the manual trigger, and opening the file again with scripts/decrypt-backup.mjs.
// No network, no keys, no accounts: fetch and the Netlify runtime are stubbed.
//
//   node tests/run-backup.mjs
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decryptScript = path.join(root, "scripts", "decrypt-backup.mjs");

let failures = 0;
let checks = 0;
const rows = [];
function check(id, ok, detail) {
  checks += 1;
  rows.push({ check: id, result: ok ? "ok" : "FAIL" });
  if (!ok) {
    failures += 1;
    console.log(`[${id}] FAIL ${JSON.stringify(detail)?.slice(0, 1500)}`);
  }
}

// ---------------------------------------------------------------------------
// Environment: only stub values, never anything from this machine.
// ---------------------------------------------------------------------------
const NAMES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "RESEND_API_KEY", "BACKUP_PASSPHRASE",
  "BACKUP_TRIGGER_TOKEN", "BACKUP_EMAIL_TO", "RESTORE_SUPABASE_URL", "RESTORE_SERVICE_ROLE_KEY", "ERROR_ALERTS", "ERROR_ALERT_EMAIL"];
for (const name of NAMES) delete process.env[name];

const BASE = "https://testproj.supabase.co";
const KEY = "stub-service-key";
const PASSPHRASE = "stub passphrase for tests only";
let ENV = {};
// ERROR_ALERTS=off keeps netlify/lib/report-error.mjs to its log line, so its
// own emails do not mix with the backup emails counted here (one test turns
// it back on).
function setEnv(values) {
  ENV = { SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: KEY, RESEND_API_KEY: "re_stub_key", BACKUP_PASSPHRASE: PASSPHRASE, ERROR_ALERTS: "off", ...values };
  for (const [k, v] of Object.entries(ENV)) if (v === undefined) delete ENV[k];
}
globalThis.Netlify = { env: { get: (name) => ENV[name] } };

// Console capture, so expected warnings do not clutter the output.
const logs = { log: [], warn: [], error: [] };
const realConsole = { log: console.log, warn: console.warn, error: console.error };
function quiet() {
  for (const level of ["log", "warn", "error"]) {
    logs[level] = [];
    console[level] = (...args) => logs[level].push(args.map(String).join(" "));
  }
}
function loud() {
  Object.assign(console, realConsole);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BCRYPT = "$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";

function fixtureTables() {
  const t = {};
  t.profiles = [3, 1, 5, 2, 4].map((n) => ({ id: uid(n), full_name: `Fixture Person ${n}`, plan: n === 2 ? "pro" : "free", subscription_status: n === 2 ? "active" : "inactive", stripe_customer_id: n === 2 ? "cus_stub" : null, created_at: "2026-09-01T10:00:00+00:00" }));
  t.business_accounts = [{ id: uid(100), owner_user_id: uid(2), seat_tier: 5, subscription_status: "active" }];
  t.business_members = [{ id: uid(201), business_account_id: uid(100), user_id: uid(2), role: "owner", status: "active" }, { id: uid(202), business_account_id: uid(100), user_id: uid(3), role: "member", status: "active" }];
  t.business_invites = [{ id: uid(301), business_account_id: uid(100), email: "invitee@example.test", status: "pending", invited_by_user_id: uid(2) }];
  t.business_daily_usage = [{ business_account_id: uid(100), usage_date: "2026-10-17", analysis_count: 4 }];
  t.business_recovery_usage = [];
  t.daily_usage = [{ user_id: uid(3), usage_date: "2026-10-17", analysis_count: 2 }, { user_id: uid(1), usage_date: "2026-10-17", analysis_count: 1 }, { user_id: uid(1), usage_date: "2026-10-16", analysis_count: 3 }];
  t.quickscan_usage = [{ user_id: uid(1), usage_date: "2026-10-17", scan_count: 5 }];
  t.recovery_usage = [{ user_id: uid(2), window_start: "2026-10-01T00:00:00+00:00", case_count: 1 }];
  t.legal_acceptances = [];
  t.scan_history = [{ id: 9, user_id: uid(1), analysis_type: "text", verdict: "scam", score: 91, summary: "Fixture summary $cnbk$ with a dollar tag inside" }, { id: 4, user_id: uid(3), analysis_type: "url", verdict: "safe", score: 5, summary: "ok" }];
  t.recovery_cases = [{ id: uid(400), owner_user_id: uid(2), case_title: "Fixture case <b>bold</b>", status: "open", business_account_id: null, plan: { steps: ["a", "b"] } }];
  t.recovery_versions = [{ id: 1, case_id: uid(400), version: 1, plan: { riskLevel: "high" } }];
  t.recovery_tasks = [7, 3, 1, 6, 2, 5, 4].map((n) => ({ id: n, case_id: uid(400), title: `Task ${n}`, done: n % 2 === 0 }));
  t.api_rate_limits = [{ rate_key: "ip:1.2.3.4", count: 3, window_start: "2026-10-18T00:00:00+00:00" }];
  t.checkout_debug_log = [];
  t.client_errors = [{ id: 2, message: "extra table row" }, { id: 1, message: "first" }];
  return t;
}

function fixtureUsers() {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: uid(n),
    aud: "authenticated",
    role: "authenticated",
    email: `person${n}@example.test`,
    phone: "",
    encrypted_password: BCRYPT,
    password_hash: BCRYPT,
    confirmation_token: `tok-confirm-${n}`,
    recovery_token: `tok-recovery-${n}`,
    email_change_token_new: `tok-change-${n}`,
    reauthentication_token: `tok-reauth-${n}`,
    email_confirmed_at: n === 4 ? null : "2026-09-01T10:05:00Z",
    confirmed_at: n === 4 ? null : "2026-09-01T10:05:00Z",
    last_sign_in_at: "2026-10-17T08:00:00Z",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-10-17T08:00:00Z",
    banned_until: n === 5 ? "2999-01-01T00:00:00Z" : null,
    is_anonymous: false,
    app_metadata: { provider: n === 3 ? "google" : "email", providers: n === 3 ? ["email", "google"] : ["email"], role_note: "kept" },
    user_metadata: { full_name: `Fixture Person ${n}`, recovery_emails: n !== 1 },
    identities: [{ provider: "email", identity_data: { email: `person${n}@example.test`, sub: uid(n) } }]
      .concat(n === 3 ? [{ provider: "google", identity_data: { sub: "google-sub-999", avatar_url: "https://example.test/face.png" } }] : [])
  }));
}

function openapiSpec(tables) {
  const definitions = {};
  for (const name of Object.keys(tables)) {
    const sample = tables[name][0] || { id: 1 };
    const properties = {};
    for (const column of Object.keys(sample)) {
      properties[column] = { format: typeof sample[column] === "number" ? "bigint" : "text", type: "string", ...(column === "id" || column === "rate_key" ? { description: "Note:\nThis is a Primary Key.<pk/>" } : {}) };
    }
    definitions[name] = { properties, type: "object" };
  }
  return { swagger: "2.0", definitions };
}

// ---------------------------------------------------------------------------
// The stub server: PostgREST, the Auth admin API and Resend.
// ---------------------------------------------------------------------------
function jsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

function makeServer({ tables = fixtureTables(), users = fixtureUsers(), maxRows = 3, authCap = 2, failTable = null, missing = [], openapi = true, delayMs = 0, resendStatus = 200 } = {}) {
  const calls = [];
  const emails = [];
  const fetchStub = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(init.headers || {});
    calls.push({ url: url.toString(), method: init.method || "GET", headers });
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));

    if (url.origin === "https://api.resend.com") {
      emails.push({ headers, body: JSON.parse(init.body) });
      return resendStatus === 200 ? jsonResponse({ id: `email_${emails.length}` }) : jsonResponse({ message: "stub refusal" }, { status: resendStatus });
    }
    if (url.origin !== BASE) throw new Error(`unexpected host ${url.origin}`);
    if (headers.get("apikey") !== KEY || headers.get("authorization") !== `Bearer ${KEY}`) return new Response("unauthorized", { status: 401 });

    if (url.pathname === "/rest/v1/") {
      return openapi ? jsonResponse(openapiSpec(Object.fromEntries(Object.entries(tables).filter(([n]) => !missing.includes(n))))) : new Response("forbidden", { status: 403 });
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const name = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
      if (!(name in tables) || missing.includes(name)) return jsonResponse({ code: "PGRST205", message: "Could not find the table" }, { status: 404 });
      if (failTable === name) return jsonResponse({ message: "stub failure secret-row-data" }, { status: 500 });
      const order = (url.searchParams.get("order") || "").split(",").filter(Boolean).map((part) => part.replace(/\.asc$/, ""));
      const all = [...tables[name]].sort((a, b) => {
        for (const column of order) {
          if (a[column] < b[column]) return -1;
          if (a[column] > b[column]) return 1;
        }
        return 0;
      });
      const [start, wantedEnd] = String(headers.get("range") || "0-999").split("-").map(Number);
      if (all.length && start >= all.length) return new Response("", { status: 416, headers: { "content-range": `*/${all.length}` } });
      if (!all.length) return jsonResponse([], { headers: { "content-range": "*/0" } });
      const end = Math.min(wantedEnd, start + maxRows - 1, all.length - 1);
      const page = all.slice(start, end + 1);
      return jsonResponse(page, { status: page.length < all.length ? 206 : 200, headers: { "content-range": `${start}-${end}/${all.length}` } });
    }

    if (url.pathname === "/auth/v1/admin/users") {
      const pageNo = Number(url.searchParams.get("page"));
      const per = Math.min(Number(url.searchParams.get("per_page")), authCap);
      return jsonResponse({ users: users.slice((pageNo - 1) * per, pageNo * per), aud: "authenticated" }, { headers: { "x-total-count": String(users.length) } });
    }
    throw new Error(`unexpected path ${url.pathname}`);
  };
  return { calls, emails, fetchStub };
}

function useServer(options) {
  const server = makeServer(options);
  globalThis.fetch = server.fetchStub;
  return server;
}

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------
const lib = await import(pathToFileURL(path.join(root, "netlify/lib/backup.mjs")).href);
const decrypt = await import(pathToFileURL(decryptScript).href);

// The .mts entry points load directly on Node 22.18+ (type stripping); older
// Node versions bundle them with esbuild, like the other test runners.
async function loadFunction(file) {
  const entry = path.join(root, "netlify/functions", file);
  try {
    return await import(pathToFileURL(entry).href);
  } catch (error) {
    const esbuild = path.join(root, "node_modules/.bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
    if (!existsSync(esbuild)) throw error;
    mkdirSync(path.join(root, ".tmp"), { recursive: true });
    const out = path.join(root, ".tmp", `${file}.test.mjs`);
    const build = spawnSync(esbuild, [entry, "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`, "--log-level=warning"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    if (build.status !== 0) throw new Error(`esbuild failed for ${file}`);
    return import(pathToFileURL(out).href + `?t=${Date.now()}`);
  }
}
const weekly = await loadFunction("backup-weekly.mts");
const now = await loadFunction("backup-now.mts");

const tmp = mkdtempSync(path.join(os.tmpdir(), "cn-backup-test-"));
const childEnv = () => {
  const env = { ...process.env };
  for (const name of NAMES) delete env[name];
  return env;
};
function runDecrypt(args, { passphraseEnv, input } = {}) {
  const env = childEnv();
  if (passphraseEnv !== undefined) env.BACKUP_PASSPHRASE = passphraseEnv;
  return spawnSync(process.execPath, [decryptScript, ...args], { env, input: input ?? "", encoding: "utf8", timeout: 60_000 });
}
function walkKeys(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => walkKeys(v, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.push(k); walkKeys(v, out); }
  return out;
}
const sortById = (list) => list.map((row) => JSON.stringify(row)).sort();

try {
  // ── Config of the two functions ──
  check("weekly-schedule", weekly.config?.schedule === "@weekly" && !("path" in weekly.config), weekly.config);
  check("now-path", now.config?.path === "/api/backup-now" && !("schedule" in now.config), now.config);
  check("table-list", lib.TABLES.length === 15 && new Set(lib.TABLES.map((t) => t.name)).size === 15 && lib.TABLES.every((t) => t.key.length), lib.TABLES.map((t) => t.name));
  check("rate-limits-excluded", JSON.stringify(lib.EXCLUDED_TABLES) === '["api_rate_limits"]' && !lib.TABLES.some((t) => t.name === "api_rate_limits"), lib.EXCLUDED_TABLES);
  check("restore-order-fk", ["business_accounts", "business_members", "recovery_cases", "recovery_versions", "recovery_tasks"].map((n) => lib.TABLES.findIndex((t) => t.name === n)).every((v, i, a) => !i || v > a[i - 1]), lib.TABLES.map((t) => t.name));

  // ── Refusal without a passphrase: nothing read, nothing sent ──
  {
    setEnv({ BACKUP_PASSPHRASE: undefined });
    const server = useServer();
    quiet();
    const result = await lib.runBackup();
    const response = await weekly.default(new Request("https://cybernetai.app/.netlify/functions/backup-weekly", { method: "POST", body: JSON.stringify({ next_run: "2026-10-25T00:00:00.000Z" }) }));
    const body = await response.json();
    loud();
    check("no-passphrase-skips", result.status === "skipped", result);
    check("no-passphrase-no-requests", server.calls.length === 0 && server.emails.length === 0, server.calls.map((c) => c.url));
    check("no-passphrase-warns", logs.warn.some((line) => line.includes("BACKUP_PASSPHRASE")), logs.warn);
    check("no-passphrase-handler", response.status === 200 && body.status === "skipped", body);
    setEnv({ BACKUP_PASSPHRASE: "   " });
    quiet();
    const blank = await lib.runBackup();
    loud();
    check("blank-passphrase-skips", blank.status === "skipped" && server.calls.length === 0, blank);
  }

  // ── A full run ──
  setEnv({});
  const tables = fixtureTables();
  const users = fixtureUsers();
  const server = useServer({ tables, users });
  quiet();
  const result = await lib.runBackup();
  loud();
  check("run-sent", result.status === "sent", { result, logs });
  check("run-log-has-no-data", ![...logs.log, ...logs.warn, ...logs.error].some((line) => line.includes("Fixture Person") || line.includes("person1@example.test")), logs);

  // Pagination: the server caps pages at 3 rows, so 7 tasks take 3 requests.
  const taskCalls = server.calls.filter((c) => c.url.includes("/rest/v1/recovery_tasks"));
  check("pagination-requests", taskCalls.length === 3, taskCalls.map((c) => c.headers.get("range")));
  check("pagination-ranges", taskCalls.map((c) => c.headers.get("range")).join(" ") === "0-999 3-1002 6-1005", taskCalls.map((c) => c.headers.get("range")));
  check("pagination-headers", taskCalls.every((c) => c.headers.get("range-unit") === "items" && c.headers.get("prefer") === "count=exact"), taskCalls.map((c) => [c.headers.get("range-unit"), c.headers.get("prefer")]));
  check("pagination-order", taskCalls.every((c) => new URL(c.url).searchParams.get("order") === "id.asc"), taskCalls.map((c) => c.url));
  const usageCall = server.calls.find((c) => c.url.includes("/rest/v1/daily_usage"));
  check("pagination-order-composite", new URL(usageCall.url).searchParams.get("order") === "user_id.asc,usage_date.asc", usageCall?.url);
  check("pagination-empty-table-one-request", server.calls.filter((c) => c.url.includes("/rest/v1/checkout_debug_log")).length === 1, null);
  const authCalls = server.calls.filter((c) => c.url.includes("/auth/v1/admin/users"));
  check("auth-pagination", authCalls.length === 3 && authCalls.every((c, i) => new URL(c.url).searchParams.get("page") === String(i + 1)), authCalls.map((c) => c.url));
  check("only-get-requests-to-supabase", server.calls.filter((c) => c.url.startsWith(BASE)).every((c) => c.method === "GET"), server.calls.filter((c) => c.method !== "GET").map((c) => c.url));

  // The email payload.
  check("one-email", server.emails.length === 1, server.emails.length);
  const email = server.emails[0]?.body || {};
  const emailHeaders = server.emails[0]?.headers;
  const attachment = email.attachments?.[0] || {};
  const file = Buffer.from(String(attachment.content || ""), "base64");
  check("email-from", email.from === "CyberNet AI <notifications@cybernetai.app>", email.from);
  check("email-to", JSON.stringify(email.to) === JSON.stringify(["support@cybernetai.app"]), email.to);
  check("email-subject", /^CyberNet AI weekly backup \d{4}-\d{2}-\d{2}$/.test(email.subject || ""), email.subject);
  check("email-auth-header", emailHeaders?.get("authorization") === "Bearer re_stub_key" && /^cybernet-backup\/[0-9a-f-]{36}$/.test(emailHeaders?.get("idempotency-key") || ""), [emailHeaders?.get("authorization"), emailHeaders?.get("idempotency-key")]);
  check("email-one-attachment", email.attachments?.length === 1 && /^cybernet-backup-\d{4}-\d{2}-\d{2}-\d{4}utc\.cnbk$/.test(attachment.filename || "") && attachment.content_type === "application/octet-stream", { ...attachment, content: undefined });
  check("email-subject-date-matches-file", (attachment.filename || "").slice(16, 26) === (email.subject || "").slice(-10), [attachment.filename, email.subject]);
  check("file-layout", file.subarray(0, 4).toString("ascii") === "CNBK" && file[4] === 1 && file.length > lib.HEADER_BYTES + 16 && lib.HEADER_BYTES === 33, file.subarray(0, 8));
  check("file-not-plain", !file.includes(Buffer.from("Fixture Person")) && !file.includes(Buffer.from("person1@example.test")), null);
  check("email-text-counts", email.text?.includes("recovery_tasks: 7") && email.text?.includes("profiles: 5") && email.text?.includes("Sign-in accounts (no passwords): 5") && email.text?.includes("client_errors: 2"), email.text);
  check("email-html-counts", email.html?.includes(">recovery_tasks<") && email.html?.includes(">7<") && email.html?.includes("How to restore"), null);
  check("email-restore-steps", email.text?.includes("node scripts/decrypt-backup.mjs") && email.text?.includes("docs/BACKUPS.md") && email.html?.includes("decrypt-backup.mjs"), email.text);
  check("email-no-row-data", !(email.text + email.html).includes("Fixture Person") && !(email.text + email.html).includes("person1@example.test") && !(email.text + email.html).includes("Fixture case"), null);
  check("email-notes-extra-table", email.text?.includes("client_errors") && email.text?.includes("Add them to TABLES"), email.text);
  check("email-no-emoji", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(email.html + email.text), null);
  check("summary-counts", result.tables?.recovery_tasks === 7 && result.authUsers === 5 && result.bytes === file.length && result.to === "support@cybernetai.app", result);

  // In-process decrypt and the document itself.
  let doc;
  try {
    doc = await decrypt.decryptBackup(file, PASSPHRASE);
    check("decrypt-in-process", true);
  } catch (error) {
    check("decrypt-in-process", false, error.message);
    throw error;
  }
  const docText = JSON.stringify(doc);
  check("doc-manifest", doc.manifest.format === "cybernet-ai-backup" && doc.manifest.formatVersion === 1 && doc.manifest.schemaVersion === lib.SCHEMA_VERSION && /^[0-9a-f]{16}$/.test(doc.manifest.schemaFingerprint || "") && doc.manifest.source === "testproj.supabase.co" && !Number.isNaN(Date.parse(doc.manifest.createdAt)), doc.manifest);
  const backedUp = Object.entries(tables).filter(([name]) => !lib.EXCLUDED_TABLES.includes(name));
  check("doc-row-counts", backedUp.every(([name, list]) => doc.manifest.tables[name]?.rows === list.length && doc.tables[name]?.length === list.length) && doc.manifest.authUsers.rows === 5, doc.manifest.tables);
  check("doc-rows-complete", backedUp.every(([name, list]) => JSON.stringify(sortById(doc.tables[name])) === JSON.stringify(sortById(list))), null);
  check("doc-rows-ordered", JSON.stringify(doc.tables.recovery_tasks.map((r) => r.id)) === "[1,2,3,4,5,6,7]", doc.tables.recovery_tasks.map((r) => r.id));
  check("doc-excluded-table-absent", !("api_rate_limits" in doc.tables) && !doc.manifest.restoreOrder.includes("api_rate_limits") && !server.calls.some((c) => c.url.includes("/rest/v1/api_rate_limits")), doc.manifest.restoreOrder);
  check("email-retention-line", email.text?.includes("Keep this email for 8 weeks, then delete it.") && email.html?.includes("Keep this email for 8 weeks, then delete it"), email.text);
  check("doc-restore-order", doc.manifest.restoreOrder.join(",") === [...lib.TABLES.map((t) => t.name), "client_errors"].join(","), doc.manifest.restoreOrder);
  check("doc-extra-table", doc.manifest.tables.client_errors?.found === "auto" && JSON.stringify(doc.manifest.tables.client_errors?.key) === '["id"]', doc.manifest.tables.client_errors);
  check("doc-identity-info", doc.manifest.tables.recovery_tasks.identity === "id" && doc.manifest.tables.checkout_debug_log.identityAlways === true, doc.manifest.tables.checkout_debug_log);

  // No password hashes or tokens anywhere.
  const keys = walkKeys(doc.authUsers);
  check("no-password-hashes", !docText.includes(BCRYPT) && !docText.includes("$2a$") && !keys.some((k) => /password|hash/i.test(k)), keys.filter((k) => /password|hash/i.test(k)));
  check("no-auth-tokens", !/tok-(confirm|recovery|change|reauth)/.test(docText) && !keys.some((k) => /token/i.test(k)), keys.filter((k) => /token/i.test(k)));
  check("no-identity-details", !docText.includes("google-sub-999") && !docText.includes("face.png") && !keys.includes("identities") && !keys.includes("identity_data"), null);
  check("auth-fields-kept", doc.authUsers.length === 5 && doc.authUsers.every((u) => u.id && u.email && "created_at" in u && "last_sign_in_at" in u && "confirmed_at" in u && u.app_metadata && u.user_metadata) && JSON.stringify(doc.authUsers.find((u) => u.id === uid(3)).identity_providers) === '["email","google"]', doc.authUsers[2]);
  check("auth-fields-allowlist", keys.filter((k) => !["app_metadata", "user_metadata"].includes(k)).every((k) => lib.AUTH_USER_FIELDS.includes(k) || k === "identity_providers" || ["provider", "providers", "role_note", "full_name", "recovery_emails"].includes(k)), [...new Set(keys)]);

  // ── Round trip through the decrypt script ──
  {
    const dir = mkdtempSync(path.join(tmp, "rt-"));
    const backup = path.join(dir, attachment.filename);
    writeFileSync(backup, file);
    const run = runDecrypt([backup, "--sql"], { passphraseEnv: PASSPHRASE });
    const jsonFile = backup.replace(/\.cnbk$/, ".json");
    const sqlFile = backup.replace(/\.cnbk$/, ".restore.sql");
    check("cli-env-exit", run.status === 0, { status: run.status, stderr: run.stderr, stdout: run.stdout });
    check("cli-wrote-json", existsSync(jsonFile) && JSON.stringify(JSON.parse(readFileSync(jsonFile, "utf8"))) === docText, jsonFile);
    check("cli-wrote-sql", existsSync(sqlFile), sqlFile);
    check("cli-summary", run.stdout.includes("recovery_tasks: 7") && run.stdout.includes("sign-in accounts: 5") && run.stdout.includes("Keep them private"), run.stdout);

    const again = runDecrypt([backup], { passphraseEnv: PASSPHRASE });
    check("cli-no-overwrite", again.status === 1 && again.stderr.includes("already exists") && again.stderr.includes("--force"), again.stderr);

    const viaStdin = runDecrypt([backup, "--force"], { input: `${PASSPHRASE}\n` });
    check("cli-stdin-passphrase", viaStdin.status === 0 && JSON.stringify(JSON.parse(readFileSync(jsonFile, "utf8"))) === docText, { status: viaStdin.status, stderr: viaStdin.stderr });

    const wrongDir = mkdtempSync(path.join(tmp, "wrong-"));
    const wrongFile = path.join(wrongDir, "b.cnbk");
    writeFileSync(wrongFile, file);
    const wrong = runDecrypt([wrongFile], { passphraseEnv: "not the passphrase" });
    check("cli-wrong-passphrase", wrong.status === 1 && wrong.stderr.includes("does not open this backup") && !existsSync(path.join(wrongDir, "b.json")), { status: wrong.status, stderr: wrong.stderr });

    const empty = runDecrypt([wrongFile], { input: "\n" });
    check("cli-empty-passphrase", empty.status === 1 && empty.stderr.includes("No passphrase was given"), empty.stderr);

    const notBackup = path.join(wrongDir, "notes.cnbk");
    writeFileSync(notBackup, "hello, this is not a backup");
    const bad = runDecrypt([notBackup], { passphraseEnv: PASSPHRASE });
    check("cli-not-a-backup", bad.status === 1 && bad.stderr.includes("not a CyberNet AI backup"), bad.stderr);

    const missingFile = runDecrypt([path.join(wrongDir, "nope.cnbk")], { passphraseEnv: PASSPHRASE });
    check("cli-missing-file", missingFile.status === 1 && missingFile.stderr.includes("Could not find"), missingFile.stderr);

    const usage = runDecrypt([]);
    check("cli-usage", usage.status === 2 && usage.stderr.includes("Usage:"), usage.stderr);

    // Tampering with the header (authenticated as GCM additional data) or the body is caught.
    for (const [label, offset] of [["salt", 6], ["iv", 25], ["body", lib.HEADER_BYTES + 2], ["tag", file.length - 3]]) {
      const tampered = Buffer.from(file);
      tampered[offset] ^= 0x01;
      let rejected = false;
      try { await decrypt.decryptBackup(tampered, PASSPHRASE); } catch (error) { rejected = error instanceof decrypt.CliError; }
      check(`tamper-${label}`, rejected, offset);
    }

    // The restore SQL.
    const sql = readFileSync(sqlFile, "utf8");
    const at = (name) => sql.indexOf(`insert into public."${name}"`);
    check("sql-transaction", sql.includes("\nbegin;\n") && sql.includes("\ncommit;\n") && sql.indexOf("begin;") < sql.indexOf("commit;"), null);
    check("sql-never-deletes", !/\b(delete|truncate|drop)\b/i.test(sql.replace(/^--.*$/gm, "").replace(/\$cnbk\d*\$[\s\S]*?\$cnbk\d*\$/g, "")), null);
    check("sql-order", at("profiles") >= 0 && at("profiles") < at("business_accounts") && at("business_accounts") < at("business_members") && at("recovery_cases") < at("recovery_versions") && at("recovery_versions") < at("recovery_tasks") && at("recovery_tasks") < at("client_errors"), [at("profiles"), at("business_accounts"), at("recovery_tasks"), at("client_errors")]);
    check("sql-empty-table-comment", sql.includes("-- checkout_debug_log: 0 rows") && at("checkout_debug_log") === -1, null);
    check("sql-upsert-profiles", /insert into public\."profiles" \([^)]*\)\nselect [^\n]* from json_populate_recordset\(null::public\."profiles", \$cnbk\$/.test(sql) && sql.includes('on conflict ("id") do update set "full_name" = excluded."full_name"'), null);
    check("sql-composite-key", sql.includes('on conflict ("user_id", "usage_date") do update set "analysis_count" = excluded."analysis_count"'), null);
    check("sql-identity", sql.includes('insert into public."recovery_tasks" ("id", "case_id", "title", "done") overriding system value') && sql.includes(`select setval(pg_get_serial_sequence('public."recovery_tasks"', 'id'), coalesce(max("id"), 0) + 1, false) from public."recovery_tasks";`), null);
    check("sql-no-identity-clause-elsewhere", !/insert into public\."profiles" \([^)]*\) overriding/.test(sql), null);
    check("sql-dollar-tag-collision", sql.includes("json_populate_recordset(null::public.\"scan_history\", $cnbk1$") && sql.includes("$cnbk1$::json"), null);
    const embedded = /json_populate_recordset\(null::public\."recovery_tasks", \$cnbk\$(.*)\$cnbk\$::json\)/.exec(sql);
    check("sql-json-roundtrip", embedded && JSON.stringify(JSON.parse(embedded[1])) === JSON.stringify(doc.tables.recovery_tasks), null);
    check("sql-auto-table-note", sql.includes("-- client_errors: 2 rows (found automatically"), null);
    check("sql-check-query", sql.includes("select 'profiles' as table_name, (select count(*) from public.\"profiles\") as rows_now, 5 as rows_in_backup"), null);

    // Restoring the sign-in accounts.
    const restoreCalls = [];
    globalThis.fetch = async (input, init = {}) => {
      const body = JSON.parse(init.body);
      restoreCalls.push({ url: String(input), headers: new Headers(init.headers), body });
      if (body.id === uid(2)) return jsonResponse({ code: "email_exists", msg: "A user with this email address has already been registered" }, { status: 422 });
      if (body.id === uid(4)) return jsonResponse({ msg: "stub server error" }, { status: 500 });
      return jsonResponse({ id: body.id });
    };
    const restoreLog = [];
    const restored = await decrypt.restoreAuthUsers(doc, { url: "https://newproj.supabase.co/", serviceKey: "stub-new-key", log: (l) => restoreLog.push(l) });
    check("restore-auth-counts", restored.created === 3 && restored.existing === 1 && restored.failed.length === 1 && restored.failed[0].who === "person4@example.test", restored);
    check("restore-auth-requests", restoreCalls.length === 5 && restoreCalls.every((c) => c.url === "https://newproj.supabase.co/auth/v1/admin/users" && c.headers.get("apikey") === "stub-new-key"), restoreCalls.map((c) => c.url));
    const payload1 = restoreCalls.find((c) => c.body.id === uid(1))?.body || {};
    check("restore-auth-payload", payload1.email === "person1@example.test" && payload1.email_confirm === true && payload1.user_metadata?.full_name === "Fixture Person 1" && payload1.app_metadata?.role_note === "kept" && !("provider" in payload1.app_metadata) && !("providers" in payload1.app_metadata), payload1);
    check("restore-auth-no-password", restoreCalls.every((c) => !walkKeys(c.body).some((k) => /password|hash|token/i.test(k))), restoreCalls.map((c) => Object.keys(c.body)));
    check("restore-auth-unconfirmed", restoreCalls.find((c) => c.body.id === uid(4))?.body.email_confirm === false, null);
    check("restore-auth-ban-kept", /^\d+h$/.test(restoreCalls.find((c) => c.body.id === uid(5))?.body.ban_duration || ""), restoreCalls.find((c) => c.body.id === uid(5))?.body);

    // The command refuses to write accounts back into the project the backup came from.
    process.env.RESTORE_SUPABASE_URL = BASE;
    process.env.RESTORE_SERVICE_ROLE_KEY = "stub-new-key";
    restoreCalls.length = 0;
    let refused = "";
    try { await decrypt.main(["--restore-auth", jsonFile], { log: () => {} }); } catch (error) { refused = error.message; }
    check("restore-auth-refuses-source", refused.includes("is the project this backup came from") && restoreCalls.length === 0, refused);
    process.env.RESTORE_SUPABASE_URL = "https://newproj.supabase.co";
    const dry = await decrypt.main(["--restore-auth", jsonFile, "--dry-run"], { log: () => {} });
    check("restore-auth-dry-run", dry === 0 && restoreCalls.length === 0, restoreCalls.length);
    delete process.env.RESTORE_SUPABASE_URL;
    delete process.env.RESTORE_SERVICE_ROLE_KEY;
  }

  // ── Passphrase handling ──
  {
    const decomposed = "  Passphrase cafe\u0301 long enough  "; // e + combining accent (NFD), spaces around
    const encrypted = await lib.encryptBackup(Buffer.from("x"), decomposed);
    let ok = false;
    try { ok = Boolean(await decrypt.decryptBackup(encrypted, "Passphrase caf\u00e9 long enough")); } catch (error) { ok = error.message.includes("could not be read") || error.message.includes("does not look like"); }
    check("passphrase-normalized", ok, null);
    check("random-salt-iv", !(await lib.encryptBackup(Buffer.from("same"), "p")).subarray(5, 33).equals((await lib.encryptBackup(Buffer.from("same"), "p")).subarray(5, 33)), null);
  }

  // ── Short passphrase: backup still made, with advice ──
  {
    setEnv({ BACKUP_PASSPHRASE: "short pass" });
    const s = useServer();
    quiet();
    const r = await lib.runBackup();
    loud();
    check("short-passphrase-note", r.status === "sent" && s.emails[0]?.body.text.includes("shorter than 16 characters"), r);
  }

  // ── Too big: no backup, an alert instead ──
  {
    setEnv({});
    const s = useServer();
    quiet();
    const r = await lib.runBackup({ maxAttachmentBytes: 200 });
    loud();
    const alert = s.emails[0]?.body || {};
    check("too-big-fails", r.status === "failed" && r.alertSent === true && s.emails.length === 1, r);
    check("too-big-alert", /^CyberNet AI weekly backup FAILED \d{4}-\d{2}-\d{2}$/.test(alert.subject || "") && !alert.attachments && alert.text?.includes("What happened:") && alert.text?.includes("What to do next:") && alert.text?.includes("When the backup gets too big"), alert);
    check("too-big-alert-no-data", !JSON.stringify(alert).includes("Fixture") && !JSON.stringify(alert).includes("@example.test"), null);
  }

  // ── A database error: an alert without the error body ──
  {
    setEnv({});
    const s = useServer({ failTable: "recovery_cases" });
    quiet();
    const r = await lib.runBackup();
    loud();
    const alert = s.emails[0]?.body || {};
    check("db-error-fails", r.status === "failed" && r.alertSent && s.emails.length === 1 && !alert.attachments, r);
    check("db-error-alert-text", alert.text?.includes("recovery_cases") && alert.text?.includes("HTTP 500") && !JSON.stringify(alert).includes("secret-row-data"), alert.text);
    check("db-error-logged", logs.error.some((line) => line.includes("CyberNet backup failed")), logs.error);
    const reported = logs.error.map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((r) => r?.tag === "cn_error");
    check("db-error-reported", reported?.fn === "backup-weekly" && reported?.name === "BackupError" && reported?.message.includes("recovery_cases") && !JSON.stringify(reported).includes("secret-row-data"), reported);
  }

  // ── With error alerts on, the site-wide reporter runs next to the backup alert ──
  {
    setEnv({ ERROR_ALERTS: undefined, SUPABASE_ANON_KEY: "stub-anon" });
    const s = useServer({ failTable: "profiles" });
    quiet();
    const r = await lib.runBackup({ trigger: "manual" });
    loud();
    const subjects = s.emails.map((e) => e.body.subject);
    check("reporter-runs", r.status === "failed" && subjects.some((x) => x.startsWith("CyberNet AI weekly backup FAILED")) && subjects.some((x) => x.includes("server error in backup-now")) && s.calls.some((c) => c.url.endsWith("/rest/v1/rpc/consume_api_quota")), subjects);
  }

  // ── Wrong project (every table missing): never an empty backup ──
  {
    setEnv({});
    const s = useServer({ missing: Object.keys(fixtureTables()) });
    quiet();
    const r = await lib.runBackup();
    loud();
    check("all-missing-fails", r.status === "failed" && r.error.includes("None of the database tables") && s.emails.length === 1 && !s.emails[0].body.attachments, r);
  }

  // ── One table gone, the REST table list unavailable ──
  {
    setEnv({});
    const s = useServer({ missing: ["checkout_debug_log"], openapi: false });
    quiet();
    const r = await lib.runBackup();
    loud();
    const text = s.emails[0]?.body.text || "";
    check("missing-table-note", r.status === "sent" && text.includes("no longer exist were skipped: checkout_debug_log"), text);
    check("no-openapi-note", text.includes("could not be checked this week") && !text.includes("client_errors"), text);
  }

  // ── Email refused by Resend: failure reported, one alert attempt ──
  {
    setEnv({});
    const s = useServer({ resendStatus: 422 });
    quiet();
    const r = await lib.runBackup();
    loud();
    check("resend-refused", r.status === "failed" && r.error.includes("did not accept") && s.emails.length === 2 && s.emails[1].body.subject.includes("FAILED"), { r, n: s.emails.length });
  }

  // ── Missing Resend key: nothing read, nothing sent ──
  {
    setEnv({ RESEND_API_KEY: undefined });
    const s = useServer();
    quiet();
    const r = await lib.runBackup();
    loud();
    check("no-resend-key", r.status === "failed" && r.alertSent === false && s.calls.length === 0, { r, calls: s.calls.length });
  }

  // ── Time budget ──
  {
    setEnv({});
    const s = useServer({ delayMs: 150 });
    quiet();
    const r = await lib.runBackup({ budgetMs: 6_200 });
    loud();
    check("deadline-fails", r.status === "failed" && /ran out of time|took too long/.test(r.error) && s.emails.length === 1 && !s.emails[0].body.attachments, r);
  }

  // ── Recipient override ──
  {
    setEnv({ BACKUP_EMAIL_TO: "owner@example.test" });
    const s = useServer();
    quiet();
    await lib.runBackup();
    loud();
    check("recipient-override", JSON.stringify(s.emails[0]?.body.to) === '["owner@example.test"]', s.emails[0]?.body.to);
    setEnv({ BACKUP_EMAIL_TO: "not an address" });
    check("recipient-invalid-falls-back", lib.backupRecipient() === "support@cybernetai.app", lib.backupRecipient());
  }

  // ── Manual trigger: 404 unless the token is set and matches ──
  {
    const TOKEN = "stub-trigger-token-0123456789abcdefghij";
    const post = (headers = {}, method = "POST") => new Request("https://cybernetai.app/api/backup-now", { method, headers });
    setEnv({});
    let s = useServer();
    quiet();
    const off = await now.default(post({ "x-backup-token": TOKEN }));
    loud();
    check("trigger-off-404", off.status === 404 && s.calls.length === 0, off.status);

    setEnv({ BACKUP_TRIGGER_TOKEN: "too-short-token" });
    quiet();
    const short = await now.default(post({ "x-backup-token": "too-short-token" }));
    loud();
    check("trigger-short-token-404", short.status === 404 && s.calls.length === 0 && logs.warn.some((l) => l.includes("shorter than 32")), short.status);

    setEnv({ BACKUP_TRIGGER_TOKEN: TOKEN });
    const get = await now.default(post({ "x-backup-token": TOKEN }, "GET"));
    const wrong = await now.default(post({ "x-backup-token": TOKEN.slice(0, -1) + "X" }));
    const none = await now.default(post());
    check("trigger-get-404", get.status === 404, get.status);
    check("trigger-wrong-404", wrong.status === 404 && none.status === 404 && s.calls.length === 0, [wrong.status, none.status]);

    s = useServer();
    quiet();
    const ok = await now.default(post({ "x-backup-token": TOKEN }));
    const okBody = await ok.json();
    loud();
    check("trigger-runs", ok.status === 200 && okBody.status === "sent" && s.emails.length === 1 && s.emails[0].body.subject.endsWith("(manual run)") && okBody.tables?.recovery_tasks === 7, okBody);
    check("trigger-response-no-data", !JSON.stringify(okBody).includes("Fixture") && !JSON.stringify(okBody).includes("@example.test"), okBody);

    setEnv({ BACKUP_TRIGGER_TOKEN: TOKEN, BACKUP_PASSPHRASE: undefined });
    s = useServer();
    quiet();
    const skipped = await now.default(post({ "x-backup-token": TOKEN }));
    loud();
    check("trigger-no-passphrase-503", skipped.status === 503 && (await skipped.json()).status === "skipped" && s.calls.length === 0, skipped.status);

    check("token-compare", lib.tokenMatches("abc", "abc") && !lib.tokenMatches("abc", "abd") && !lib.tokenMatches("", "") && !lib.tokenMatches(null, "abc"), null);
  }

  // ── Content-Range parsing ──
  check("content-range", JSON.stringify([lib.parseContentRange("0-999/1234"), lib.parseContentRange("*/0"), lib.parseContentRange("0-9/*"), lib.parseContentRange("junk")]) ===
    JSON.stringify([{ start: 0, end: 999, total: 1234 }, { start: null, end: null, total: 0 }, { start: 0, end: 9, total: null }, { start: null, end: null, total: null }]), null);
} finally {
  loud();
  rmSync(tmp, { recursive: true, force: true });
}

console.table(rows);
console.log(`${checks - failures}/${checks} backup checks pass`);
process.exit(failures ? 1 : 0);
