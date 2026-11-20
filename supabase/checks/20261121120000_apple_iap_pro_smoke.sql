-- SMOKE TEST after supabase/migrations/20261121120000_apple_iap_pro.sql (iPhone app 1.1, Apple Pro).
-- READ-ONLY: it changes nothing. The owner runs it in the Supabase SQL Editor
-- right AFTER the migration and sends Claude the results.
-- Before running: replace <test-user-uuid> (two places, step 5) with the id of
-- the owner's OWN test account (Authentication > Users > copy the user's UID).

-- 1) Both tables exist with row level security on. Expected: 2 rows, rls_on = true.
select c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('apple_subscriptions', 'apple_notifications')
order by 1;

-- 2) Nobody but the server can use the new functions.
--    Expected: 8 rows, anon = false, authed = false, server = true on every row.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authed,
       has_function_privilege('service_role', p.oid, 'execute') as server
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('entitlement_of', 'plan_of', 'apply_apple_subscription', 'apple_pro_user_ids',
                    'consume_analysis', 'consume_recovery_case', 'consume_recovery_update', 'consume_quickscan')
order by 1;

-- 3) The four usage functions now read the plan through plan_of.
--    Expected: 4 rows, uses_plan_of = true and matches_repo = true.
select p.proname as function_name,
       position('public.plan_of(p_user_id)' in p.prosrc) > 0 as uses_plan_of,
       md5(p.prosrc) = case p.proname
         when 'consume_analysis'        then '24c44cf35db1d2d5a4fef2da95935c17'
         when 'consume_recovery_case'   then 'df1ac9cbdf6ab3abc6a1c9bd8d66bc53'
         when 'consume_recovery_update' then '27270630e5b90bb259aa078a635e9512'
         when 'consume_quickscan'       then '352351f869282d60693b48f569b283b2'
       end as matches_repo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('consume_analysis', 'consume_recovery_case', 'consume_recovery_update', 'consume_quickscan')
order by 1;

-- 4) Nothing changed for existing accounts. Expected: drift = 0, and the
--    pro / business numbers equal step 3 of the pre-check.
select
  count(*) filter (where public.plan_of(p.id) <> case
    when p.plan = 'business' and p.subscription_status in ('active', 'trialing') then 'business'
    when p.plan = 'pro' and p.subscription_status in ('active', 'trialing') then 'pro'
    else 'free' end) as drift,
  count(*) filter (where public.plan_of(p.id) = 'pro') as pro_accounts,
  count(*) filter (where public.plan_of(p.id) = 'business') as business_accounts,
  (select count(*) from public.apple_subscriptions) as apple_rows
from public.profiles p;

-- 5) Your own test account. Expected before any test purchase: one row with
--    plan = your website plan, apple_active = false; and plan_of = the same word.
select * from public.entitlement_of('<test-user-uuid>'::uuid);
select public.plan_of('<test-user-uuid>'::uuid) as plan_of;
