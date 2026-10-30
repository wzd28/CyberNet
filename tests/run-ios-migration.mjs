// The iPhone app's database migration (supabase/migrations/20261029120000_ios_app_1_0.sql),
// run for real in PGlite (PostgreSQL in WebAssembly, already in node_modules):
// supabase/schema.sql (which now carries the same objects) loads top to bottom,
// the migration file then runs twice on top (it must be idempotent), and the
// consent and App-tier functions are exercised. No network, no keys, no accounts.
//
//   node tests/run-ios-migration.mjs
//
// Supabase's own objects are stubbed: an auth schema with users and uid(), and
// the anon / authenticated / service_role roles. schema.sql needs
// check_function_bodies = off, because get_platform_stats is created before the
// quickscan_usage table it reads.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  console.log("ios migration: skipped (PGlite is not installed; run npm install)");
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

// pgcrypto is not bundled in PGlite; gen_random_uuid() is built into PostgreSQL 13+.
const withoutExtensions = (sql) => sql.replace(/^create extension[^;]*;/gim, "-- (extension skipped in PGlite)");
const migration = read("supabase/migrations/20261029120000_ios_app_1_0.sql");

try {
  await db.exec(withoutExtensions(read("supabase/schema.sql")));
  check("schema.sql loads", true);
} catch (error) {
  check("schema.sql loads", false, error.message);
}
for (const run of [1, 2]) {
  try {
    await db.exec(withoutExtensions(migration));
    check(`migration run ${run} succeeds`, true);
  } catch (error) {
    check(`migration run ${run} succeeds`, false, error.message);
  }
}
await db.exec("set check_function_bodies = on;");

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

// The verify query from the migration's footer.
const verify = await q(`select 'table' as kind, to_regclass('public.ai_consents')::text as name
  union all
  select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in
    ('grant_ai_consent','withdraw_ai_consent','has_ai_consent',
     'consume_analysis_app','consume_recovery_case_app','consume_recovery_update_app')`);
check("verify query: 7 rows", verify.length === 7 && verify[0].name === "ai_consents", verify);

const FREE = "11111111-1111-4111-8111-111111111111";
const PRO = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
for (const [id, email] of [[FREE, "free@example.com"], [PRO, "pro@example.com"], [GONE, "gone@example.com"]]) {
  await db.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [id, email]);
  await db.query("insert into public.profiles (id, plan, subscription_status) values ($1, 'free', 'inactive') on conflict (id) do nothing", [id]);
}
await db.query("update public.profiles set plan = 'pro', subscription_status = 'active' where id = $1", [PRO]);

// ── AI consent ──
const V1 = "2026-11-ios-1";
const V2 = "2026-12-ios-2";
const has = async (user, version, platform = "ios") => (await one("select public.has_ai_consent($1, $2, $3) as ok", [user, version, platform])).ok;
const openRows = async (user) => Number((await one("select count(*)::int as n from public.ai_consents where user_id = $1 and withdrawn_at is null", [user])).n);

check("consent: none at first", (await has(FREE, V1)) === false);
const granted = await one("select * from public.grant_ai_consent($1, $2, 'ios', 'CyberNetAI-iOS/1.0.0')", [FREE, V1]);
check("consent: grant returns the version", granted?.consent_version === V1 && granted?.granted_at, granted);
check("consent: granted", (await has(FREE, V1)) === true);
await one("select * from public.grant_ai_consent($1, $2, 'ios', null)", [FREE, V1]);
check("consent: same-version re-grant keeps one row", (await openRows(FREE)) === 1 && Number((await one("select count(*)::int as n from public.ai_consents where user_id = $1", [FREE])).n) === 1);
check("consent: web is separate from ios", (await has(FREE, V1, "web")) === false);
await one("select * from public.grant_ai_consent($1, $2, 'ios', null)", [FREE, V2]);
check("consent: a new version closes the old one", (await has(FREE, V1)) === false && (await has(FREE, V2)) === true && (await openRows(FREE)) === 1);
const withdrawn = await one("select public.withdraw_ai_consent($1, 'ios') as n", [FREE]);
check("consent: withdraw closes one row", Number(withdrawn.n) === 1 && (await has(FREE, V2)) === false && (await openRows(FREE)) === 0, withdrawn);
const again = await one("select public.withdraw_ai_consent($1, 'ios') as n", [FREE]);
check("consent: withdraw again closes nothing", Number(again.n) === 0);
await one("select * from public.grant_ai_consent($1, $2, 'ios', null)", [FREE, V1]);
check("consent: can be given again after withdrawal", (await has(FREE, V1)) === true);
await one("select * from public.grant_ai_consent($1, $2, 'banana', null)", [PRO, V1]);
check("consent: an unknown platform is stored as ios", (await has(PRO, V1, "ios")) === true);

// Two Allow requests at the same moment. PGlite has one connection, so the other request is simulated by a
// test-only trigger that inserts the "winning" open row just before grant_ai_consent's own insert, which
// is exactly the window a concurrent request hits after the old WHERE NOT EXISTS check.
await db.exec(`
create or replace function public.cn_test_race() returns trigger language plpgsql as $t$
begin
  if pg_trigger_depth() = 1 and current_setting('cn.test_race', true) = 'on' then
    insert into public.ai_consents (user_id, consent_version, platform, user_agent)
    values (new.user_id, new.consent_version, new.platform, 'the other request');
  end if;
  return new;
end $t$;
create trigger cn_test_race before insert on public.ai_consents for each row execute function public.cn_test_race();
set cn.test_race = 'on';
`);
let plain = null;
try { await db.query("insert into public.ai_consents (user_id, consent_version, platform) values ($1, $2, 'web')", [PRO, V1]); }
catch (error) { plain = error.code || error.message; }
check("race: the simulation really collides (a plain insert hits the unique index)", plain === "23505", plain);
let raced = null, racedError = null;
try { raced = await one("select * from public.grant_ai_consent($1, $2, 'web', 'CyberNetAI-iOS/1.0.0')", [PRO, V1]); }
catch (error) { racedError = error.code || error.message; }
check("race: the second Allow succeeds and returns the open consent", !racedError && raced?.consent_version === V1, racedError || raced);
check("race: still exactly one open consent", Number((await one("select count(*)::int as n from public.ai_consents where user_id = $1 and platform = 'web' and withdrawn_at is null", [PRO])).n) === 1);
await db.exec(`set cn.test_race = 'off'; drop trigger cn_test_race on public.ai_consents; drop function public.cn_test_race();`);

// ── App-tier: AI explanations ──
const appAnalysis = async (user, limit) => one("select * from public.consume_analysis_app($1, $2)", [user, limit]);
const results = [];
for (let i = 0; i < 4; i++) results.push(await appAnalysis(FREE, 3));
check("analysis_app: 3 allowed, the 4th refused", results.map((r) => r.allowed).join() === "true,true,true,false" && results[3].used === 3 && results[3].daily_limit === 3, results);
check("analysis_app: plan is always app", results.every((r) => r.plan === "app"), results.map((r) => r.plan));
await db.query("select public.refund_analysis($1)", [FREE]);
check("analysis_app: refund_analysis gives one back", (await appAnalysis(FREE, 3)).allowed === true);

// A web-Pro account: held to the App tier in the app, while the web path keeps Pro's 15.
for (let i = 0; i < 3; i++) await appAnalysis(PRO, 3);
const proApp = await appAnalysis(PRO, 3);
const proWeb = await one("select * from public.consume_analysis($1)", [PRO]);
check("analysis_app: web-Pro held to the app limit", proApp.allowed === false && proApp.used === 3, proApp);
check("analysis_app: the web path still gives Pro 15 (shared counter)", proWeb.allowed === true && Number(proWeb.daily_limit) === 15 && Number(proWeb.used) === 4, proWeb);
check("analysis_app: the shared counter refuses the app afterwards", (await appAnalysis(PRO, 3)).allowed === false);
check("analysis_app: the disclosed allowance (50) allows more", (await appAnalysis(PRO, 50)).allowed === true);

const clampHigh = await appAnalysis(GONE, 5000);
const clampLow = await appAnalysis(GONE, -5);
check("analysis_app: limit clamped to 0..1000", clampHigh.daily_limit === 1000 && clampLow.daily_limit === 0 && clampLow.allowed === false, { clampHigh, clampLow });

// ── App-tier: Recovery ──
const caseApp = async (user, limit) => one("select * from public.consume_recovery_case_app($1, $2)", [user, limit]);
const c1 = await caseApp(FREE, 1);
const c2 = await caseApp(FREE, 1);
const nextReset = (await one("select public.recovery_next_reset() as t")).t;
check("recovery_case_app: 1 allowed, the 2nd refused", c1.allowed === true && c2.allowed === false && c2.used === 1 && c2.plan === "app", { c1, c2 });
// Same reset_at as the website's consume_recovery_case (recovery_next_reset()). That value is
// labelled 16:00 UTC by an existing time-zone slip in recovery_window_start(), although the
// window really switches at 08:00 UTC (12:00 PM Gulf time); the app is told the real time by
// netlify/lib/app-tier.mjs. See the note there.
check("recovery_case_app: same reset_at as the website's Recovery functions", new Date(c2.reset_at).getTime() === new Date(nextReset).getTime(), { reset: c2.reset_at, nextReset });
check("recovery_case_app: allowance raises the count", (await caseApp(FREE, 10)).allowed === true);

const updApp = async (user, limit, cooldown) => one("select * from public.consume_recovery_update_app($1, $2, $3)", [user, limit, cooldown]);
const u1 = await updApp(FREE, 1, 6 * 3600);
const u2 = await updApp(FREE, 1, 6 * 3600);
check("recovery_update_app: first allowed", u1.allowed === true && u1.plan === "app", u1);
check("recovery_update_app: then a ~6 h cooldown", u2.allowed === false && u2.cooldown_seconds_remaining > 21_500 && u2.cooldown_seconds_remaining <= 21_600, u2);
const u3 = await updApp(PRO, 10, 0);
const u4 = await updApp(PRO, 10, 0);
check("recovery_update_app: no cooldown for the allowance", u3.allowed === true && u4.allowed === true && u4.used === 2, { u3, u4 });
await db.query("update public.recovery_usage set last_update_at = now() - interval '7 hours' where user_id = $1", [FREE]);
const u5 = await updApp(FREE, 1, 6 * 3600);
check("recovery_update_app: after the cooldown, the daily limit still holds", u5.allowed === false && u5.cooldown_seconds_remaining === 0 && u5.used === 1, u5);

// ── Deletion cascades ──
await one("select * from public.grant_ai_consent($1, $2, 'ios', null)", [GONE, V1]);
await db.query("delete from public.profiles where id = $1", [GONE]);
await db.query("delete from public.daily_usage where user_id = $1", [GONE]);
await db.query("delete from auth.users where id = $1", [GONE]);
check("cascade: AI consents go with the auth user", Number((await one("select count(*)::int as n from public.ai_consents where user_id = $1", [GONE])).n) === 0);

// ── Grants: server only ──
const FUNCTIONS = [
  "public.grant_ai_consent(uuid, text, text, text)",
  "public.withdraw_ai_consent(uuid, text)",
  "public.has_ai_consent(uuid, text, text)",
  "public.consume_analysis_app(uuid, integer)",
  "public.consume_recovery_case_app(uuid, integer)",
  "public.consume_recovery_update_app(uuid, integer, integer)"
];
for (const fn of FUNCTIONS) {
  const row = await one(`select has_function_privilege('anon', $1, 'execute') as anon,
    has_function_privilege('authenticated', $1, 'execute') as authed,
    has_function_privilege('service_role', $1, 'execute') as service`, [fn]);
  check(`grants: only service_role may run ${fn}`, row.anon === false && row.authed === false && row.service === true, row);
}
const table = await one(`select
  has_table_privilege('anon', 'public.ai_consents', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.ai_consents', 'select') as authed_select,
  has_table_privilege('authenticated', 'public.ai_consents', 'insert') as authed_insert,
  has_table_privilege('service_role', 'public.ai_consents', 'select') as service_select,
  has_table_privilege('service_role', 'public.ai_consents', 'insert') as service_insert,
  has_table_privilege('service_role', 'public.ai_consents', 'update') as service_update,
  has_table_privilege('service_role', 'public.ai_consents', 'truncate') as service_truncate`);
check("grants: ai_consents is service_role only (no browser access)", table.anon_select === false && table.authed_select === false && table.authed_insert === false && table.service_select && table.service_insert && table.service_update && table.service_truncate === false, table);
const rls = await one("select relrowsecurity as on from pg_class where oid = 'public.ai_consents'::regclass");
check("rls: on for ai_consents", rls.on === true);
const definer = await q(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('grant_ai_consent','withdraw_ai_consent','has_ai_consent','consume_analysis_app','consume_recovery_case_app','consume_recovery_update_app')`);
check("functions: security definer with a fixed search_path", definer.length === 6 && definer.every((f) => f.prosecdef === true && (f.proconfig || []).some((c) => /^search_path=public, pg_temp$/.test(c))), definer);

// schema.sql carries the same SQL as the migration (it is the restore path).
{
  const schema = read("supabase/schema.sql");
  const body = migration.slice(migration.indexOf("begin;\n") + 7, migration.indexOf("\ncommit;")).trim();
  check("schema.sql mirrors the migration", schema.includes(body));
}

await db.close();
console.log(`ios migration: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
