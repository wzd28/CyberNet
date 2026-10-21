-- Explicit, least-privilege Data API grants for every object in public.
--
-- Why: Supabase is ending the automatic grants on new objects in public
-- (new projects since 30 May 2026, every existing project on 30 Oct 2026):
--   https://supabase.com/docs/guides/api/securing-your-api
--   https://github.com/orgs/supabase/discussions/45329
-- Existing objects keep their grants, but a database rebuilt from
-- supabase/schema.sql (restore, new project, preview branch, db reset) gets
-- none: schema.sql never grants the service role anything on a table, and
-- the five business_* tables never had explicit grants at all.
--
-- Plan:
--   * The browser never reads a table or calls an RPC (it only uses
--     supabase.auth). Every Data API call comes from a Netlify Function with
--     the service-role key. So anon and authenticated get NOTHING here.
--   * service_role gets SELECT/INSERT/UPDATE/DELETE on the tables (no
--     TRUNCATE/REFERENCES/TRIGGER) and EXECUTE on the functions it calls.
--   * RLS stays on for every table. The existing "read your own ..." policies
--     are kept; they only matter if a SELECT grant to authenticated returns.
--
-- Status: NOT applied. Run it in the Supabase SQL Editor (as postgres) after
-- checking the results of supabase/audit/grants-rls-audit.sql. One
-- transaction; REVOKE/GRANT are idempotent, so it is safe to run again.
-- On a fresh database, run it after supabase/schema.sql.

begin;

-- 1. Tables: RLS on, no anon/authenticated access, service_role DML only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'daily_usage', 'scan_history', 'quickscan_usage',
    'legal_acceptances',
    'recovery_cases', 'recovery_versions', 'recovery_tasks', 'recovery_usage',
    'business_accounts', 'business_members', 'business_invites',
    'business_daily_usage', 'business_recovery_usage',
    'api_rate_limits', 'checkout_debug_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- Identity sequences need no grant for inserts; the API roles need none.
revoke all on all sequences in schema public from public, anon, authenticated;

-- 2. Functions.
-- 2a. Quota, refund and stats functions (all SECURITY DEFINER): server only.
revoke all on function public.consume_analysis(uuid) from public, anon, authenticated;
revoke all on function public.refund_analysis(uuid) from public, anon, authenticated;
revoke all on function public.consume_quickscan(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_case(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_update(uuid) from public, anon, authenticated;
revoke all on function public.consume_analysis_business(uuid) from public, anon, authenticated;
revoke all on function public.refund_analysis_business(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_case_business(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_update_business(uuid) from public, anon, authenticated;
revoke all on function public.consume_api_quota(text, integer, integer) from public, anon, authenticated;
revoke all on function public.check_protect_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_platform_stats() from public, anon, authenticated;

grant execute on function public.consume_analysis(uuid) to service_role;
grant execute on function public.refund_analysis(uuid) to service_role;
grant execute on function public.consume_quickscan(uuid) to service_role;
grant execute on function public.consume_recovery_case(uuid) to service_role;
grant execute on function public.consume_recovery_update(uuid) to service_role;
grant execute on function public.consume_analysis_business(uuid) to service_role;
grant execute on function public.refund_analysis_business(uuid) to service_role;
grant execute on function public.consume_recovery_case_business(uuid) to service_role;
grant execute on function public.consume_recovery_update_business(uuid) to service_role;
grant execute on function public.consume_api_quota(text, integer, integer) to service_role;
grant execute on function public.check_protect_rate_limit(text, integer, integer) to service_role;
grant execute on function public.get_platform_stats() to service_role;

-- 2b. Recovery window helpers: no client calls them (only the functions
-- above, which run as their owner). Drop the unused authenticated grant.
revoke all on function public.recovery_window_start() from public, anon, authenticated;
revoke all on function public.recovery_next_reset() from public, anon, authenticated;
grant execute on function public.recovery_window_start() to service_role;
grant execute on function public.recovery_next_reset() to service_role;

-- 2c. Sign-up trigger function: fired by the trigger, never called directly.
-- EXECUTE is checked only when the trigger is created, so this is safe.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 3. New objects: adopt the 30 Oct 2026 default now (same statements as the
-- Supabase docs, with ALL for tables). Every new table or function then needs
-- the explicit grants that CLAUDE.md asks for. Note: Postgres' built-in
-- EXECUTE-to-PUBLIC on new functions is a global default that a per-schema
-- REVOKE cannot remove, so every function must still revoke from public.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;

commit;
