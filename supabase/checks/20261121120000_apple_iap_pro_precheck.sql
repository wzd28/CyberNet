-- PRE-CHECK for supabase/migrations/20261121120000_apple_iap_pro.sql (iPhone app 1.1, Apple Pro).
-- READ-ONLY: it changes nothing. The owner runs it in the Supabase SQL Editor
-- BEFORE the migration and sends Claude the results.
--
-- Why: the migration replaces the four usage functions every website limit
-- uses. Their new bodies were copied from supabase/schema.sql (origin/main
-- 4576f6a). This proves the live database has exactly those bodies, so the
-- migration (and its rollback file) change only the plan lookup.

-- 1) The four live bodies. Expected "matches_repo" = true on all 4 rows.
--    If a row says false, STOP and send Claude the "definition" column of that
--    row: production differs from the repo and the migration must be adapted.
--    consume_recovery_update expects the body AFTER the website lane's
--    20261124120000_security_recovery_update_cooldown.sql (DB-4). If its row
--    shows body_md5 c80d61ead7046dd3bbfbbf2d8136d10b, that file has not been
--    run yet: run it first, then this check again.
select
  p.proname as function_name,
  md5(p.prosrc) as body_md5,
  md5(p.prosrc) = case p.proname
    when 'consume_analysis'        then '75716c553750569336d1c4a839e3fcba'
    when 'consume_recovery_case'   then '924170a552b5cad502fe6e7af957122e'
    when 'consume_recovery_update' then 'e1f87ce58e10b57b3e82b177113c9fc5'
    when 'consume_quickscan'       then '67afc1bf74e4d48320c37cb6719ba155'
  end as matches_repo,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('consume_analysis', 'consume_recovery_case', 'consume_recovery_update', 'consume_quickscan')
order by p.proname;

-- 2) Nothing of the migration exists yet (a first run). Expected: 0 rows.
--    Rows here are fine too if the migration was already run once (it is safe to re-run).
select 'table' as kind, c.relname as name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('apple_subscriptions', 'apple_notifications')
union all
select 'function', p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('entitlement_of', 'plan_of', 'apply_apple_subscription', 'apple_pro_user_ids');

-- 3) How many accounts have a paid website plan today (a number only, for the
--    smoke test afterwards: the same accounts must keep the same plan).
select
  count(*) filter (where plan = 'pro' and subscription_status in ('active', 'trialing')) as pro_accounts,
  count(*) filter (where plan = 'business' and subscription_status in ('active', 'trialing')) as business_accounts,
  count(*) as all_accounts
from public.profiles;
