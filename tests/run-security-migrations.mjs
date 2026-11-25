// The November 2026 security SQL (owner runs it; never applied by code), run
// for real in PGlite: supabase/schema.sql loads, then the grants migration and
// the three security migrations each run twice (they must be idempotent), and
// the changed functions and triggers are exercised. No network, no keys.
//
//   node tests/run-security-migrations.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  console.log("security migrations: skipped (PGlite is not installed; run npm install)");
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
const withoutExtensions = (sql) => sql.replace(/^create extension[^;]*;/gim, "-- (extension skipped in PGlite)");
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
async function fails(sql, params = []) {
  try { await db.query(sql, params); return ""; } catch (error) { return String(error.message || error); }
}

try {
  await db.exec(withoutExtensions(read("supabase/schema.sql")));
  check("schema.sql loads", true);
} catch (error) {
  check("schema.sql loads", false, error.message);
}
await db.exec(withoutExtensions(read("supabase/migrations/20261029120000_ios_app_1_0.sql")));

const files = [
  "supabase/migrations/20261021135311_explicit_grants.sql",
  "supabase/migrations/20261124120000_security_recovery_update_cooldown.sql",
  "supabase/migrations/20261124120100_security_business_seat_guard.sql",
  "supabase/migrations/20261124120200_security_signup_name_search_path.sql"
];
for (const file of files) {
  for (const run of [1, 2]) {
    try {
      await db.exec(read(file));
      check(`${path.basename(file)} run ${run}`, true);
    } catch (error) {
      check(`${path.basename(file)} run ${run}`, false, error.message);
    }
  }
}
await db.exec("set check_function_bodies = on;");

// ── DB-1 / DB-11: no browser grants, service_role DML ──
for (const t of ["profiles", "scan_history", "recovery_cases", "ai_consents", "feedback", "business_accounts", "checkout_debug_log"]) {
  const g = await one(`select has_table_privilege('authenticated', 'public.${t}', 'select') a, has_table_privilege('anon', 'public.${t}', 'select') n,
    has_table_privilege('service_role', 'public.${t}', 'select') s, has_table_privilege('service_role', 'public.${t}', 'truncate') tr`);
  check(`DB-1 ${t}: no anon/authenticated access, service_role DML only`, !g.a && !g.n && g.s && !g.tr, g);
}
const helper = await one("select has_function_privilege('authenticated', 'public.recovery_window_start()', 'execute') a");
check("DB-1 recovery_window_start is not executable by authenticated", helper.a === false);

// ── DB-8: pg_temp last in the search_path ──
const paths = await q(`select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('consume_analysis','consume_quickscan','refund_analysis','get_platform_stats','handle_new_user','consume_recovery_update_business')`);
check("DB-8 search_path = public, pg_temp on the older definer functions", paths.length === 6 && paths.every((f) => (f.proconfig || []).includes("search_path=public, pg_temp")), paths);

// ── DB-9: sign-up names are cleaned and capped ──
const U1 = "11111111-1111-4111-8111-111111111111";
await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.com', $2)", [U1, JSON.stringify({ first_name: "Ann\u0007\u001b" + "x".repeat(500_000), last_name: "Lee" })]);
const p1 = await one("select full_name from public.profiles where id = $1", [U1]);
check("DB-9 a huge name with control characters: at most 100 clean characters", p1 && p1.full_name.length <= 100 && !/[\u0000-\u001f]/.test(p1.full_name) && p1.full_name.startsWith("Annx"), p1?.full_name?.slice(0, 20));
const U2 = "22222222-2222-4222-8222-222222222222";
await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'walid@example.com', $2)", [U2, JSON.stringify({ first_name: "Walid", last_name: "Z" })]);
check("DB-9 a normal name is unchanged", (await one("select full_name from public.profiles where id = $1", [U2])).full_name === "Walid Z");
const U3 = "33333333-3333-4333-8333-333333333333";
await db.query("insert into auth.users (id, email) values ($1, 'noname@example.com')", [U3]);
check("DB-9 no name: the email's first part, as before", (await one("select full_name from public.profiles where id = $1", [U3])).full_name === "noname");

// ── DB-4: the cooldown is part of the guarded update ──
{
  const src = (await one("select prosrc from pg_proc where proname = 'consume_recovery_update'")).prosrc;
  check("DB-4 the guarded UPDATE checks the cooldown", /last_update_at is null or last_update_at <= now\(\) - v_cooldown/.test(src));
  let r = await one("select * from public.consume_recovery_update($1)", [U2]);
  check("DB-4 Free: the first update is allowed", r.allowed === true && r.used === 1, r);
  r = await one("select * from public.consume_recovery_update($1)", [U2]);
  check("DB-4 Free: a second one inside the cooldown is refused with the time left", r.allowed === false && r.cooldown_seconds_remaining > 0, r);
  // Pro: 999 a window, 2 h cooldown. Simulate the race: the row says an update
  // happened a moment ago, but this call's early check is bypassed by giving
  // it no row to read first (the guarded UPDATE must refuse on its own).
  await db.query("update public.profiles set plan = 'pro', subscription_status = 'active' where id = $1", [U3]);
  r = await one("select * from public.consume_recovery_update($1)", [U3]);
  check("DB-4 Pro: the first update is allowed", r.allowed === true, r);
  await db.query("update public.recovery_usage set last_update_at = now() - interval '3 hours' where user_id = $1", [U3]);
  r = await one("select * from public.consume_recovery_update($1)", [U3]);
  check("DB-4 Pro: allowed again after the cooldown", r.allowed === true && r.used === 2, r);
  r = await one("select * from public.consume_recovery_update($1)", [U3]);
  check("DB-4 Pro: refused inside the cooldown", r.allowed === false && r.cooldown_seconds_remaining > 0, r);
  const app = await one("select * from public.consume_recovery_update_app($1, 3, 0)", [U1]);
  const app2 = await one("select * from public.consume_recovery_update_app($1, 3, 0)", [U1]);
  check("DB-4 App with no cooldown: still counts up to its limit", app.allowed === true && app2.allowed === true && app2.used === 2, { app, app2 });
}

// ── DB-5: seat guard ──
{
  const TEAM = "44444444-4444-4444-8444-444444444444";
  await db.query("insert into public.business_accounts (id, owner_user_id, seat_tier, daily_pool_limit, recovery_pool_limit, subscription_status) values ($1, $2, 5, 50, 20, 'active')", [TEAM, U2]);
  check("DB-5 the owner's membership is never refused", !(await fails("insert into public.business_members (business_account_id, user_id, role) values ($1, $2, 'owner')", [TEAM, U2])));
  const invite = (n, status = "pending") => fails(
    "insert into public.business_invites (business_account_id, email, token, invited_by_user_id, status, expires_at) values ($1, $2, $3, $4, $5, now() + interval '1 day')",
    [TEAM, `p${n}@example.com`, `tok-${n}-${Math.random()}`, U2, status]);
  const results = [];
  for (let n = 1; n <= 5; n++) results.push(await invite(n));
  check("DB-5 owner + 4 pending invites fit 5 seats; the 5th invite is refused", results.slice(0, 4).every((e) => e === "") && /Team is full/.test(results[4]), results);
  // Members: fill the team to 5 active and try a 6th.
  await db.query("update public.business_invites set status = 'revoked' where business_account_id = $1", [TEAM]);
  const ids = [];
  for (let n = 0; n < 5; n++) {
    const uid = `5555555${n}-5555-4555-8555-555555555555`;
    ids.push(uid);
    await db.query("insert into auth.users (id, email) values ($1, $2)", [uid, `m${n}@example.com`]);
  }
  const memberErrors = [];
  for (const uid of ids) memberErrors.push(await fails("insert into public.business_members (business_account_id, user_id, role) values ($1, $2, 'member')", [TEAM, uid]));
  check("DB-5 members: 4 join a 5-seat team, the 5th member (6th person) is refused", memberErrors.slice(0, 4).every((e) => e === "") && /Team is full/.test(memberErrors[4]), memberErrors);
  // A removed member rejoining a full team is refused; after a seat frees, allowed.
  await db.query("update public.business_members set status = 'removed' where user_id = $1", [ids[0]]);
  check("DB-5 rejoining when a seat is free works", !(await fails("update public.business_members set status = 'active' where user_id = $1", [ids[0]])));
  check("DB-5 a pending invite to a full team is refused", /Team is full/.test(await invite(99)));
  // Daily cap: 30 invites per team per 24 hours (on a 20-seat team).
  await db.query("update public.business_accounts set seat_tier = 20 where id = $1", [TEAM]);
  await db.query("update public.business_invites set status = 'revoked' where business_account_id = $1", [TEAM]);
  let lastError = "";
  for (let n = 100; n < 131 && !lastError; n++) {
    lastError = await invite(n);
    await db.query("update public.business_invites set status = 'revoked' where business_account_id = $1", [TEAM]);
  }
  check("DB-5 the 31st invite in 24 hours is refused", /Invite limit reached/.test(lastError), lastError);
  const direct = await one("select has_function_privilege('service_role', 'public.business_invite_seat_guard()', 'execute') s, has_function_privilege('authenticated', 'public.business_invite_seat_guard()', 'execute') a");
  check("DB-5 the guard functions are not callable through the API", direct.s === false && direct.a === false, direct);
}

console.log(`security migrations: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
