// The Apple In-App Purchase migration (supabase/migrations/20261121120000_apple_iap_pro.sql),
// run for real in PGlite (PostgreSQL in WebAssembly). No network, no keys, no accounts.
//
//   node tests/run-ios-migration-apple.mjs
//
// 1. The schema as it was before this migration (supabase/schema.sql up to the
//    mirror marker) loads, and the four original consume_* bodies are recorded.
// 2. The migration runs twice (idempotent), with zero drift for existing accounts.
// 3. Every ownership / ordering rule of apply_apple_subscription (server.md §5,
//    CRITIC #8 / #9) and the entitlement matrix.
// 4. The rollback file puts the four original bodies back byte for byte, and
//    the migration can run again afterwards.
// 5. The full supabase/schema.sql (with the mirror) ends in the same state.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  console.log("apple migration: skipped (PGlite is not installed; run npm install)");
  process.exit(0);
}

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
  }
}

const MIRROR_MARKER = "-- ===== mirror of supabase/migrations/20261121120000_apple_iap_pro.sql =====";
const MIGRATION = read("supabase/migrations/20261121120000_apple_iap_pro.sql");
const ROLLBACK = read("supabase/rollback/20261121120000_apple_iap_pro_rollback.sql");
const SCHEMA = read("supabase/schema.sql");
const withoutExtensions = (sql) => sql.replace(/^create extension[^;]*;/gim, "-- (extension skipped in PGlite)");
const CONSUMERS = ["consume_analysis", "consume_recovery_case", "consume_recovery_update", "consume_quickscan"];

async function freshDb(schemaSql) {
  const db = new PGlite();
  await db.exec(`
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
set check_function_bodies = off;
`);
  await db.exec(withoutExtensions(schemaSql));
  await db.exec("set check_function_bodies = on;");
  return db;
}

const defs = async (db) => {
  const out = {};
  for (const name of CONSUMERS) {
    out[name] = (await db.query(`select pg_get_functiondef('public.${name}(uuid)'::regprocedure) as d`)).rows[0].d;
  }
  return out;
};

const markerAt = SCHEMA.indexOf(MIRROR_MARKER);
check("schema.sql carries the mirror marker", markerAt > 0);
const before = SCHEMA.slice(0, markerAt > 0 ? markerAt : SCHEMA.length);
check("schema.sql before the mirror has no Apple objects", !/apple_subscriptions/.test(before));
check("schema.sql mirror is the migration file", markerAt > 0 && SCHEMA.slice(markerAt).includes(MIGRATION.trim()));

const db = await freshDb(before);
const original = await defs(db);
const md5s = async (d) => Object.fromEntries((await d.query("select proname, md5(prosrc) m from pg_proc where proname in ('consume_analysis','consume_recovery_case','consume_recovery_update','consume_quickscan')")).rows.map((x) => [x.proname, x.m]));
const PRECHECK = read("supabase/checks/20261121120000_apple_iap_pro_precheck.sql");
const SMOKE = read("supabase/checks/20261121120000_apple_iap_pro_smoke.sql");
const knows = (file, name, m) => new RegExp(`when '${name}'\\s+then '${m}'`).test(file);
for (const [name, m] of Object.entries(await md5s(db))) check(`precheck knows the repo body of ${name}`, knows(PRECHECK, name, m), m);
for (const run of [1, 2]) {
  try {
    await db.exec(MIGRATION);
    check(`migration run ${run} succeeds`, true);
  } catch (error) {
    check(`migration run ${run} succeeds`, false, error.message);
  }
}
const migrated = await defs(db);
for (const [name, m] of Object.entries(await md5s(db))) check(`smoke test knows the migrated body of ${name}`, knows(SMOKE, name, m), m);
for (const name of CONSUMERS) {
  check(`${name} now reads plan_of`, migrated[name].includes("public.plan_of(p_user_id)") && !original[name].includes("plan_of"));
}

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const U = {
  A: "aaaaaaaa-0000-4000-8000-000000000001",
  B: "aaaaaaaa-0000-4000-8000-000000000002",
  STRIPE: "aaaaaaaa-0000-4000-8000-000000000003",
  BIZ: "aaaaaaaa-0000-4000-8000-000000000004",
  D: "aaaaaaaa-0000-4000-8000-000000000005",
  E: "aaaaaaaa-0000-4000-8000-000000000006",
  W: "aaaaaaaa-0000-4000-8000-000000000007",
  GONE: "aaaaaaaa-0000-4000-8000-000000000099"
};
for (const [key, id] of Object.entries(U)) {
  if (key === "GONE") continue;
  await q("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, `${key.toLowerCase()}@example.test`]);
  await q("insert into public.profiles (id, plan, subscription_status) values ($1, 'free', 'inactive') on conflict (id) do nothing", [id]);
}
await q("update public.profiles set plan = 'pro', subscription_status = 'active' where id = $1", [U.STRIPE]);
await q("update public.profiles set plan = 'business', subscription_status = 'active' where id = $1", [U.BIZ]);

const DRIFT = `select count(*)::int as n from public.profiles p
  where public.plan_of(p.id) <> case
    when p.plan = 'business' and p.subscription_status in ('active','trialing') then 'business'
    when p.plan = 'pro' and p.subscription_status in ('active','trialing') then 'pro' else 'free' end`;
check("zero drift with no Apple rows", (await one(DRIFT)).n === 0);

const H = 3600e3, DAY = 86400e3;
const NOW = Date.now();
const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
// apply(user, chain, { ...fields }) -> { result, entitled }
async function apply(user, otid, f = {}) {
  const row = await one(`select * from public.apply_apple_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`, [
    user, otid, f.txid ?? otid, f.product ?? "app.cybernetai.pro.monthly", f.env ?? "Sandbox",
    f.token === undefined ? user : f.token,
    iso(f.purchase ?? NOW - H), iso(f.originalPurchase ?? NOW - H), iso(f.expires ?? NOW + 30 * DAY),
    iso(f.revoked ?? null), f.reason ?? null, f.auto ?? null, f.autoProduct ?? null,
    iso(f.grace ?? null), f.retry ?? null, iso(f.signed ?? NOW), f.source ?? "app", f.type ?? null
  ]);
  return { result: row.result, entitled: row.entitled };
}
const ent = (u) => one("select * from public.entitlement_of($1)", [u]);
const planOf = async (u) => (await one("select public.plan_of($1) as p", [u])).p;
const row = (otid) => one("select * from public.apple_subscriptions where original_transaction_id = $1", [otid]);
const same = (a, b) => a.result === b.result && a.entitled === b.entitled;

// ── purchase ──
let r = await apply(U.A, "1001", { source: "purchase" });
check("purchase: applied and entitled", same(r, { result: "applied", entitled: true }), r);
check("purchase: plan_of = pro", (await planOf(U.A)) === "pro");
let e = await ent(U.A);
check("purchase: entitlement shows Apple details", e.apple_active === true && e.stripe_active === false && e.apple_product_id === "app.cybernetai.pro.monthly" && e.apple_environment === "Sandbox", e);
check("purchase: auto_renew unknown without renewal info", e.apple_auto_renew === null, e);
check("purchase: stored as source app", (await row("1001")).last_source === "app");
const consumed = await one("select * from public.consume_analysis($1)", [U.A]);
check("Apple Pro gets 15 analyses (consume_analysis)", consumed.daily_limit === 15 && consumed.plan === "pro", consumed);
check("Apple Pro quickscan is unlimited", (await one("select * from public.consume_quickscan($1)", [U.A])).daily_limit === 100000);
check("Apple Pro recovery cases 3", (await one("select * from public.consume_recovery_case($1)", [U.A])).daily_limit === 3);
check("Apple Pro recovery updates 999", (await one("select * from public.consume_recovery_update($1)", [U.A])).daily_limit === 999);
check("free account stays free (consume_analysis)", (await one("select * from public.consume_analysis($1)", [U.B])).daily_limit === 3);

// ── second CyberNet account on the same Apple ID (case C) ──
r = await apply(U.B, "1001", { token: U.A, source: "app" });
check("restore on another account: wrong_account", r.result === "wrong_account", r);
r = await apply(U.B, "1001", { token: U.B, expires: NOW + 60 * DAY, purchase: NOW, source: "app" });
check("another account cannot take an ACTIVE chain even with its own token", r.result === "wrong_account", r);
check("nothing moved", (await row("1001")).user_id === U.A && (await planOf(U.B)) === "free");

// ── renewal and ordering (critic #8) ──
const P2 = NOW + 30 * DAY, P3 = NOW + 60 * DAY;
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 5000, auto: true, source: "app", });
check("app sync of the new period: applied", r.result === "applied", r);
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 1000, auto: true, source: "notification", type: "DID_RENEW" });
check("DID_RENEW after the app already synced it: stale, still Pro", r.result === "stale" && r.entitled === true, r);
check("DID_RENEW after sync: period kept", new Date((await row("1001")).expires_at).getTime() === P3);
r = await apply(U.A, "1001", { txid: "1001", purchase: NOW - H, expires: P2, signed: NOW + 99000, source: "app" });
check("older period with a NEWER signing date is stale (period first)", r.result === "stale" && new Date((await row("1001")).expires_at).getTime() === P3, r);
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 9000, auto: false, autoProduct: "app.cybernetai.pro.yearly", source: "notification", type: "DID_CHANGE_RENEWAL_STATUS" });
check("renewal status change applies", r.result === "applied" && (await row("1001")).auto_renew === false, r);
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 10000, source: "app" });
check("app sync without renewal info keeps auto_renew", r.result === "applied" && (await row("1001")).auto_renew === false && (await row("1001")).auto_renew_product_id === "app.cybernetai.pro.yearly", await row("1001"));
e = await ent(U.A);
check("entitlement exposes auto_renew_product_id", e.apple_auto_renew_product_id === "app.cybernetai.pro.yearly", e);

// ── refund / revoke ──
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 20000, revoked: NOW + 20000, reason: 1, source: "notification", type: "REFUND" });
check("REFUND: applied, no Pro", same(r, { result: "applied", entitled: false }) && (await planOf(U.A)) === "free", r);
check("REFUND: status revoked", (await row("1001")).status === "revoked");
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 30000, source: "app" });
check("stale app sync after a refund (newer signing date, no revocation) cannot restore Pro", r.result === "stale" && (await planOf(U.A)) === "free", r);
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 40000, source: "notification", type: "REFUND_REVERSED" });
check("REFUND_REVERSED restores Pro", same(r, { result: "applied", entitled: true }) && (await planOf(U.A)) === "pro", r);
r = await apply(U.A, "1001", { txid: "1002", purchase: NOW, expires: P3, signed: NOW + 100, revoked: NOW + 50000, source: "notification", type: "REVOKE" });
check("a revocation signed BEFORE the stored row still applies (late refund)", r.result === "applied" && (await planOf(U.A)) === "free", r);
r = await apply(U.A, "1001", { txid: "1003", purchase: NOW + 1000, expires: NOW + 90 * DAY, signed: NOW + 60000, source: "app" });
check("a strictly later period after a refund applies (resubscribed)", same(r, { result: "applied", entitled: true }), r);

// ── grace period, billing retry, expiry ──
await apply(U.D, "2001", { expires: NOW - H, purchase: NOW - 2 * H, signed: NOW - H, source: "purchase" });
check("period passed without grace: no Pro", (await planOf(U.D)) === "free");
r = await apply(U.D, "2001", { expires: NOW - H, purchase: NOW - 2 * H, signed: NOW + 1000, grace: NOW + 6 * DAY, retry: true, auto: true, source: "notification", type: "DID_FAIL_TO_RENEW" });
check("grace period: Pro continues after expiry", same(r, { result: "applied", entitled: true }) && (await row("2001")).status === "grace", r);
check("grace period: plan_of = pro", (await planOf(U.D)) === "pro");
r = await apply(U.D, "2001", { expires: NOW - H, purchase: NOW - 2 * H, signed: NOW + 2000, source: "app" });
check("app sync without renewal info keeps the grace period", r.entitled === true && (await row("2001")).grace_expires_at !== null, r);
r = await apply(U.D, "2001", { expires: NOW - H, purchase: NOW - 2 * H, signed: NOW + 3000, retry: true, source: "notification", type: "GRACE_PERIOD_EXPIRED" });
check("GRACE_PERIOD_EXPIRED: billing_retry, no Pro", same(r, { result: "applied", entitled: false }) && (await row("2001")).status === "billing_retry", r);
r = await apply(U.D, "2001", { expires: NOW - H, purchase: NOW - 2 * H, signed: NOW + 4000, source: "notification", type: "EXPIRED" });
check("EXPIRED: expired, no Pro", (await row("2001")).status === "expired" && (await planOf(U.D)) === "free", r);
// expiry needs no job: a row whose period passed is not Pro
await apply(U.E, "2101", { expires: NOW - 1000, purchase: NOW - DAY, source: "app" });
check("expiry is read from the dates (no sweep job)", (await planOf(U.E)) === "free");

// ── C2: the lapsed chain moves to a new buyer with their own token ──
r = await apply(U.B, "2001", { token: U.B, txid: "2009", purchase: NOW + 5000, expires: NOW + 30 * DAY, signed: NOW + 5000, source: "purchase" });
check("C2: lapsed chain + newer purchase with caller's token moves", same(r, { result: "applied", entitled: true }) && (await row("2001")).user_id === U.B, r);
check("C2: old owner keeps nothing", (await planOf(U.D)) === "free" && (await planOf(U.B)) === "pro");

// ── no token (critic #9), deleted token, other existing token ──
r = await apply(U.W, "3001", { token: null, source: "purchase" });
check("D via purchase call: not_linked, nothing stored", r.result === "not_linked" && !(await row("3001")), r);
r = await apply(U.W, "3001", { token: null, source: "app" });
check("D via app sync: linked to the caller", same(r, { result: "applied", entitled: true }) && (await row("3001")).user_id === U.W, r);
r = await apply(U.E, "3101", { token: U.GONE, source: "app" });
check("E: token of a deleted account links to the caller", r.result === "applied" && (await row("3101")).user_id === U.E, r);
r = await apply(U.W, "3201", { token: U.D, source: "app" });
check("F: token of another existing account is wrong_account", r.result === "wrong_account" && !(await row("3201")), r);
// Ask to Buy approved while W is signed in: W's sync is refused, the notification links D.
r = await apply(U.D, "3201", { token: U.D, source: "notification", type: "SUBSCRIBED" });
check("Ask to Buy: the notification links the token's account", r.result === "applied" && (await row("3201")).user_id === U.D, r);

// ── deleted user ──
r = await apply(U.GONE, "4001", { source: "notification", type: "DID_RENEW" });
check("unknown (deleted) user: unknown_user, nothing stored", r.result === "unknown_user" && !(await row("4001")), r);
check("no user row created for the deleted user", Number((await one("select count(*)::int n from auth.users where id = $1", [U.GONE])).n) === 0);

// ── Stripe + Apple ──
await apply(U.STRIPE, "5001", { source: "purchase" });
e = await ent(U.STRIPE);
check("Stripe Pro + Apple Pro: plan pro, both active", e.plan === "pro" && e.stripe_active && e.apple_active, e);
await apply(U.BIZ, "5101", { source: "purchase" });
e = await ent(U.BIZ);
check("Stripe Business + Apple Pro: plan business", e.plan === "business" && e.apple_active, e);
check("Business keeps its own limits", (await one("select * from public.consume_analysis($1)", [U.BIZ])).daily_limit === 50);

// ── bad input ──
let err = null;
try { await apply(U.A, "6001", { product: "app.cybernetai.business5.monthly" }); } catch (error) { err = error.message; }
check("unknown product is refused", /Unknown Apple product/.test(err || ""), err);
err = null;
try { await apply(U.A, "6002", { source: "website" }); } catch (error) { err = error.message; }
check("unknown source is refused", /Bad source/.test(err || ""), err);

// ── recovery-checkin helper ──
const ids = (await q("select * from public.apple_pro_user_ids()")).map((x) => x.user_id);
check("apple_pro_user_ids lists entitled accounts only", ids.includes(U.W) && ids.includes(U.B) && !ids.includes(U.GONE) && ids.length === new Set(ids).size, ids);

// ── cascade on account deletion ──
await q("delete from public.profiles where id = $1", [U.E]);
await q("delete from auth.users where id = $1", [U.E]);
check("deleting the account deletes its Apple rows", !(await row("3101")) && !(await row("2101")));

// ── privileges ──
const privs = await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
  has_function_privilege('authenticated', p.oid, 'execute') authed, has_function_privilege('service_role', p.oid, 'execute') svc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('entitlement_of','plan_of','apply_apple_subscription','apple_pro_user_ids',
    'consume_analysis','consume_recovery_case','consume_recovery_update','consume_quickscan')`);
check("8 functions, service_role only", privs.length === 8 && privs.every((p) => !p.anon && !p.authed && p.svc), privs);
const tables = await q(`select c.relname, c.relrowsecurity,
  has_table_privilege('anon', c.oid, 'select') anon, has_table_privilege('authenticated', c.oid, 'select') authed,
  has_table_privilege('service_role', c.oid, 'insert') svc
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('apple_subscriptions','apple_notifications')`);
check("both tables: RLS on, no anon/authenticated, service_role writes", tables.length === 2 && tables.every((t) => t.relrowsecurity && !t.anon && !t.authed && t.svc), tables);

// ── the owner's read-only check files run ──
for (const file of ["supabase/checks/20261121120000_apple_iap_pro_precheck.sql", "supabase/checks/20261121120000_apple_iap_pro_smoke.sql"]) {
  let sql = "";
  try { sql = read(file); } catch { sql = ""; }
  check(`${file} exists`, Boolean(sql));
  check(`${file} is read-only`, sql && !/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(sql.replace(/--.*$/gm, "")), file);
  try { await db.exec(sql.replace(/<test-user-uuid>/g, U.A)); check(`${file} runs`, true); } catch (error) { check(`${file} runs`, false, error.message); }
}

// ── rollback ──
try {
  await db.exec(ROLLBACK);
  check("rollback runs", true);
} catch (error) {
  check("rollback runs", false, error.message);
}
const rolled = await defs(db);
for (const name of CONSUMERS) check(`rollback restores ${name} byte for byte`, rolled[name] === original[name]);
check("after rollback an Apple Pro account gets Free limits again", (await one("select * from public.consume_analysis($1)", [U.W])).daily_limit === 3);
check("rollback keeps the Apple rows", Boolean(await row("3001")));
try {
  await db.exec(ROLLBACK);
  await db.exec(MIGRATION);
  check("rollback twice, then the migration again", true);
} catch (error) {
  check("rollback twice, then the migration again", false, error.message);
}
check("after re-running the migration Apple Pro counts again", (await one("select * from public.consume_analysis($1)", [U.W])).daily_limit === 15);
await db.close();

// ── the full schema.sql (with the mirror) gives the migrated functions ──
const full = await freshDb(SCHEMA);
const fullDefs = await defs(full);
for (const name of CONSUMERS) check(`schema.sql mirror: ${name} matches the migration`, fullDefs[name] === migrated[name]);
await full.exec(MIGRATION);
check("migration on top of the full schema.sql", true);
await full.close();

console.log(`apple migration: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
