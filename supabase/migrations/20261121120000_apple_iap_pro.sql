-- supabase/migrations/20261121120000_apple_iap_pro.sql
-- iPhone app 1.1: Apple In-App Purchase for PRO ONLY (auto-renewable
-- subscriptions app.cybernetai.pro.monthly / app.cybernetai.pro.yearly).
-- Business stays website-only (Stripe); nothing here touches
-- business_accounts, business_members or the *_business functions.
--
-- WHO RUNS IT: the owner, in the Supabase SQL Editor, BEFORE the server deploy
-- that ships apple-verify / apple-notifications. Claude never runs it.
-- Run order and checks: OWNER-SQL steps (pre-check, this file, smoke test):
--   supabase/checks/20261121120000_apple_iap_pro_precheck.sql   (read-only, before)
--   supabase/migrations/20261121120000_apple_iap_pro.sql        (this file)
--   supabase/checks/20261121120000_apple_iap_pro_smoke.sql      (read-only, after)
--   supabase/rollback/20261121120000_apple_iap_pro_rollback.sql (only if something breaks)
-- RUN ORDER (merge of the website lane, 25 Nov 2026): AFTER
-- 20261124120000_security_recovery_update_cooldown.sql (its consume_recovery_update
-- reads profiles only; this file's copy keeps its DB-4 fix and adds plan_of). If
-- that file is ever run again after this one, run section 4 of this file again.
-- NOTE (security audit Nov 2026): re-running THIS file puts back the old
-- entitlement_of (Sandbox rows entitle everyone). Re-run
-- 20261124130000_security_iap_sandbox_allowlist.sql right after it.
-- SAFE TO RE-RUN: idempotent. With no rows in apple_subscriptions every
-- changed function answers exactly as before (plan_of = the old profile rule).
--
-- What it does
--   1. apple_subscriptions   one row per Apple subscription chain (original transaction id)
--   2. apple_notifications   App Store Server Notifications V2 seen (idempotency + audit, no payload)
--   3. entitlement_of(uuid)  THE rule: Stripe plan on profiles OR a paid-up Apple Pro row
--      plan_of(uuid)         just the plan word, for the SQL usage functions
--   4. consume_analysis / consume_recovery_case / consume_recovery_update /
--      consume_quickscan     the bodies from schema.sql with ONE change: the plan
--                            comes from plan_of() instead of profiles
--   5. apply_apple_subscription(...)  records one VERIFIED transaction (the
--      Netlify function has already checked Apple's signature and decided the
--      user id from the verified sign-in token / stored owner, never a body field)
--   6. apple_pro_user_ids()  for recovery-checkin (Apple Pro accounts get the
--      idle-case reminder like Stripe Pro accounts)
-- Stripe columns on profiles are NOT touched: stripe-webhook.mjs keeps writing
-- profiles.plan / subscription_status exactly as today, and can never clobber
-- an Apple entitlement. Nothing here cancels or refunds anything.

begin;

-- ───────────── 1. apple_subscriptions ─────────────
create table if not exists public.apple_subscriptions (
  original_transaction_id text primary key
    check (original_transaction_id ~ '^[0-9]{1,40}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null
    check (product_id in ('app.cybernetai.pro.monthly', 'app.cybernetai.pro.yearly')),
  environment text not null check (environment in ('Production', 'Sandbox')),
  -- The appAccountToken Apple signed (normally = user_id; null when the
  -- purchase was made outside the app's purchase call; an old, deleted user id
  -- when a re-created account restored it). Kept for audit only.
  app_account_token uuid,
  latest_transaction_id text check (latest_transaction_id is null or latest_transaction_id ~ '^[0-9]{1,40}$'),
  purchase_date timestamptz,
  original_purchase_date timestamptz,
  expires_at timestamptz not null,
  grace_expires_at timestamptz,
  -- null = not known yet (no signed renewal info seen): the app then shows the
  -- end date without saying "renews".
  auto_renew boolean,
  auto_renew_product_id text check (auto_renew_product_id is null or char_length(auto_renew_product_id) <= 100),
  status text not null default 'active'
    check (status in ('active', 'grace', 'billing_retry', 'expired', 'revoked')),
  revoked_at timestamptz,
  revocation_reason smallint,
  last_signed_at timestamptz not null default now(),
  last_source text not null default 'app' check (last_source in ('app', 'notification')),
  last_notification_type text check (last_notification_type is null or char_length(last_notification_type) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.apple_subscriptions is
  'Apple In-App Purchase Pro subscriptions, one row per original transaction. Written only by Netlify functions (service role) after Apple''s JWS signature was verified.';

create index if not exists apple_subscriptions_user_idx on public.apple_subscriptions (user_id);

alter table public.apple_subscriptions enable row level security;
-- No policies: the browser never reads this table (Netlify functions only).
revoke all on table public.apple_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.apple_subscriptions to service_role;

-- ───────────── 2. apple_notifications ─────────────
create table if not exists public.apple_notifications (
  notification_uuid uuid primary key,
  notification_type text not null check (char_length(notification_type) <= 60),
  subtype text check (subtype is null or char_length(subtype) <= 60),
  environment text check (environment is null or environment in ('Production', 'Sandbox')),
  original_transaction_id text check (original_transaction_id is null or char_length(original_transaction_id) <= 64),
  signed_date timestamptz,
  -- 'error' until processed: a delivery that failed half-way is processed again on Apple's retry.
  outcome text not null default 'error'
    check (outcome in ('applied', 'ignored', 'stale', 'unknown_user', 'wrong_account', 'error')),
  received_at timestamptz not null default now()
);

comment on table public.apple_notifications is
  'App Store Server Notifications V2 received (idempotency and audit). No payload and no user id stored. Rows older than 90 days are deleted by rate-limit-cleanup.';

create index if not exists apple_notifications_received_idx on public.apple_notifications (received_at);

alter table public.apple_notifications enable row level security;
revoke all on table public.apple_notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.apple_notifications to service_role;

-- ───────────── 3. entitlement_of / plan_of ─────────────
-- One row: the person's OWN plan (a Business TEAM membership is not read here;
-- team members keep using the *_business functions, unchanged).
--   plan           'business' | 'pro' | 'free'
--   stripe_active  profiles says pro/business and active|trialing (the old rule)
--   apple_active   a Pro row that is not revoked and is before expires_at, or
--                  inside Apple's billing grace period
--   apple_*        the best Apple row (entitled first, then latest expiry), for
--                  account-status / checkout guard / deletion notice
create or replace function public.entitlement_of(p_user_id uuid)
returns table (
  plan text,
  stripe_active boolean,
  apple_active boolean,
  apple_original_transaction_id text,
  apple_product_id text,
  apple_environment text,
  apple_expires_at timestamptz,
  apple_grace_expires_at timestamptz,
  apple_auto_renew boolean,
  apple_auto_renew_product_id text,
  apple_status text,
  apple_revoked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_status text;
  v_stripe text := 'free';
  r record;
  v_apple boolean := false;
begin
  select p.plan, p.subscription_status into v_plan, v_status
  from public.profiles p where p.id = p_user_id;

  if v_plan = 'business' and v_status in ('active', 'trialing') then
    v_stripe := 'business';
  elsif v_plan = 'pro' and v_status in ('active', 'trialing') then
    v_stripe := 'pro';
  end if;

  select a.* into r
  from public.apple_subscriptions a
  where a.user_id = p_user_id
  order by (a.revoked_at is null and (a.expires_at > now() or coalesce(a.grace_expires_at, '-infinity'::timestamptz) > now())) desc,
           a.expires_at desc
  limit 1;

  if not found then
    return query select
      v_stripe,
      v_stripe <> 'free', false,
      null::text, null::text, null::text, null::timestamptz, null::timestamptz, null::boolean, null::text, null::text, null::boolean;
    return;
  end if;

  v_apple := r.revoked_at is null
    and (r.expires_at > now() or coalesce(r.grace_expires_at, '-infinity'::timestamptz) > now());

  return query select
    case when v_stripe <> 'free' then v_stripe when v_apple then 'pro' else 'free' end,
    v_stripe <> 'free',
    v_apple,
    r.original_transaction_id, r.product_id, r.environment, r.expires_at,
    r.grace_expires_at, r.auto_renew, r.auto_renew_product_id, r.status, r.revoked_at is not null;
end;
$$;

revoke all on function public.entitlement_of(uuid) from public, anon, authenticated;
grant execute on function public.entitlement_of(uuid) to service_role;

create or replace function public.plan_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.plan from public.entitlement_of(p_user_id) e), 'free');
$$;

revoke all on function public.plan_of(uuid) from public, anon, authenticated;
grant execute on function public.plan_of(uuid) to service_role;

-- ───────────── 4. usage functions read the plan through plan_of ─────────────
-- Generated from supabase/schema.sql at origin/main 4576f6a: the
-- "select profiles.plan, profiles.subscription_status into v_plan, v_status
-- from public.profiles where profiles.id = p_user_id;" lookup is replaced by
-- plan_of(); nothing else changes (search_path stays 'public' as today). Checked:
-- schema.sql did not change these four bodies after 4576f6a (tests/run-ios-migration-apple.mjs compares them).
-- consume_analysis: copied from supabase/schema.sql line 162 (origin/main 4576f6a)
create or replace function public.consume_analysis(
  p_user_id uuid
)
returns table (
  allowed boolean,
  used integer,
  daily_limit integer,
  plan text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_limit integer := 5;
  v_used integer := 0;
begin
  -- CHANGED (1.1): the plan comes from public.plan_of (website Stripe plan OR a paid-up
  -- Apple Pro subscription). Everything else is the body from supabase/schema.sql.
  v_plan := public.plan_of(p_user_id);
  v_status := case when v_plan = 'free' then 'inactive' else 'active' end;

  if
    v_plan = 'business'
    and v_status in ('active', 'trialing')
  then
    v_limit := 50;
  elsif
    v_plan = 'pro'
    and v_status in ('active', 'trialing')
  then
    v_limit := 15;
  else
    v_plan := 'free';
    v_limit := 3;
  end if;

  insert into public.daily_usage (
    user_id,
    usage_date,
    analysis_count
  )
  values (
    p_user_id,
    (now() at time zone 'utc')::date,
    0
  )
  on conflict (user_id, usage_date)
  do nothing;

  update public.daily_usage
  set
    analysis_count = analysis_count + 1,
    updated_at = now()
  where
    user_id = p_user_id
    and usage_date = (now() at time zone 'utc')::date
    and analysis_count < v_limit
  returning analysis_count
  into v_used;

  if v_used is null then
    select analysis_count
    into v_used
    from public.daily_usage
    where
      user_id = p_user_id
      and usage_date = (now() at time zone 'utc')::date;

    return query
    select
      false,
      coalesce(v_used, 0),
      v_limit,
      v_plan;

    return;
  end if;

  return query
  select
    true,
    v_used,
    v_limit,
    v_plan;
end;
$$;

-- consume_recovery_case: copied from supabase/schema.sql line 451 (origin/main 4576f6a)
create or replace function public.consume_recovery_case(
  p_user_id uuid
)
returns table (
  allowed boolean,
  used integer,
  daily_limit integer,
  plan text,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_limit integer := 1;
  v_used integer := 0;
  v_window timestamptz := public.recovery_window_start();
begin
  -- CHANGED (1.1): the plan comes from public.plan_of (website Stripe plan OR a paid-up
  -- Apple Pro subscription). Everything else is the body from supabase/schema.sql.
  v_plan := public.plan_of(p_user_id);
  v_status := case when v_plan = 'free' then 'inactive' else 'active' end;

  if v_plan = 'business' and v_status in ('active', 'trialing') then
    v_limit := 20;
  elsif v_plan = 'pro' and v_status in ('active', 'trialing') then
    v_limit := 3;
  else
    v_plan := 'free';
    v_limit := 1;
  end if;

  insert into public.recovery_usage (user_id, window_start, cases_created, updates_used)
  values (p_user_id, v_window, 0, 0)
  on conflict (user_id, window_start) do nothing;

  update public.recovery_usage
  set cases_created = cases_created + 1, updated_at = now()
  where user_id = p_user_id
    and window_start = v_window
    and cases_created < v_limit
  returning cases_created
  into v_used;

  if v_used is null then
    select cases_created into v_used
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;

    return query select false, coalesce(v_used, 0), v_limit, v_plan, public.recovery_next_reset();
    return;
  end if;

  return query select true, v_used, v_limit, v_plan, public.recovery_next_reset();
end;
$$;

-- consume_recovery_update: copied from supabase/schema.sql line 514 (origin/main 4576f6a)
-- and updated with the website lane's DB-4 cooldown fix
-- (20261124120000_security_recovery_update_cooldown.sql: the cooldown in the
-- guarded UPDATE, the lost-race answer, search_path public, pg_temp), so this
-- file never undoes it.
create or replace function public.consume_recovery_update(
  p_user_id uuid
)
returns table (
  allowed boolean,
  used integer,
  daily_limit integer,
  plan text,
  reset_at timestamptz,
  cooldown_seconds_remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_limit integer := 1;
  v_cooldown interval := interval '6 hours';
  v_used integer := 0;
  v_window timestamptz := public.recovery_window_start();
  v_last_update timestamptz;
  v_cooldown_remaining integer := 0;
begin
  -- CHANGED (1.1): the plan comes from public.plan_of (website Stripe plan OR a paid-up
  -- Apple Pro subscription). Everything else is the body from supabase/schema.sql.
  v_plan := public.plan_of(p_user_id);
  v_status := case when v_plan = 'free' then 'inactive' else 'active' end;

  if v_plan = 'business' and v_status in ('active', 'trialing') then
    v_limit := 999;
    v_cooldown := interval '1 hour';
  elsif v_plan = 'pro' and v_status in ('active', 'trialing') then
    v_limit := 999;
    v_cooldown := interval '2 hours';
  else
    v_plan := 'free';
    v_limit := 1;
    v_cooldown := interval '6 hours';
  end if;

  select last_update_at into v_last_update
  from public.recovery_usage
  where user_id = p_user_id and window_start = v_window;

  if v_last_update is not null and now() < v_last_update + v_cooldown then
    v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
    select updates_used into v_used
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;

    return query select false, coalesce(v_used, 0), v_limit, v_plan, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
    return;
  end if;

  insert into public.recovery_usage (user_id, window_start, cases_created, updates_used)
  values (p_user_id, v_window, 0, 0)
  on conflict (user_id, window_start) do nothing;

  update public.recovery_usage
  set updates_used = updates_used + 1, last_update_at = now(), updated_at = now()
  where user_id = p_user_id
    and window_start = v_window
    and updates_used < v_limit
    -- DB-4: the cooldown is part of the guarded UPDATE, so parallel requests
    -- that all passed the early check cannot each take an update.
    and (last_update_at is null or last_update_at <= now() - v_cooldown)
  returning updates_used
  into v_used;

  if v_used is null then
    select updates_used, last_update_at into v_used, v_last_update
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;

    -- Lost the race to a parallel request: the same cooldown answer as above.
    if v_last_update is not null and now() < v_last_update + v_cooldown then
      v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
      return query select false, coalesce(v_used, 0), v_limit, v_plan, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
      return;
    end if;

    return query select false, coalesce(v_used, 0), v_limit, v_plan, public.recovery_next_reset(), 0;
    return;
  end if;

  return query select true, v_used, v_limit, v_plan, public.recovery_next_reset(), 0;
end;
$$;

-- consume_quickscan: copied from supabase/schema.sql line 703 (origin/main 4576f6a)
create or replace function public.consume_quickscan(
  p_user_id uuid
)
returns table (
  allowed boolean,
  used integer,
  daily_limit integer,
  plan text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_limit integer := 5;
  v_used integer := 0;
  v_date date := (now() at time zone 'utc')::date;
begin
  -- CHANGED (1.1): the plan comes from public.plan_of (website Stripe plan OR a paid-up
  -- Apple Pro subscription). Everything else is the body from supabase/schema.sql.
  v_plan := public.plan_of(p_user_id);
  v_status := case when v_plan = 'free' then 'inactive' else 'active' end;

  if v_plan = 'business' and v_status in ('active', 'trialing') then
    v_limit := 100;
  elsif v_plan = 'pro' and v_status in ('active', 'trialing') then
    v_limit := 100000; -- effectively unlimited for Pro
  else
    v_plan := 'free';
    v_limit := 5;
  end if;

  insert into public.quickscan_usage (user_id, usage_date, scan_count)
  values (p_user_id, v_date, 0)
  on conflict (user_id, usage_date) do nothing;

  update public.quickscan_usage
  set scan_count = scan_count + 1, updated_at = now()
  where user_id = p_user_id
    and usage_date = v_date
    and scan_count < v_limit
  returning scan_count
  into v_used;

  if v_used is null then
    select scan_count into v_used
    from public.quickscan_usage
    where user_id = p_user_id and usage_date = v_date;

    return query select false, coalesce(v_used, 0), v_limit, v_plan;
    return;
  end if;

  return query select true, v_used, v_limit, v_plan;
end;
$$;
-- Grants unchanged from schema.sql (repeated so the file stands alone).
revoke all on function public.consume_analysis(uuid) from public, anon, authenticated;
grant execute on function public.consume_analysis(uuid) to service_role;
revoke all on function public.consume_recovery_case(uuid) from public, anon, authenticated;
grant execute on function public.consume_recovery_case(uuid) to service_role;
revoke all on function public.consume_recovery_update(uuid) from public, anon, authenticated;
grant execute on function public.consume_recovery_update(uuid) to service_role;
revoke all on function public.consume_quickscan(uuid) from public, anon, authenticated;
grant execute on function public.consume_quickscan(uuid) to service_role;


-- ───────────── 5. apply_apple_subscription ─────────────
-- Called only by netlify/lib/apple-apply.mjs (service role) after the JWS
-- signature, bundle id, product id, type and environment were verified in JS
-- (Apple's SignedDataVerifier, pinned Apple Root CA - G3).
-- p_user_id is decided by the CALLER, never by a request body:
--   apple-verify:        the verified signed-in user
--   apple-notifications: the signed appAccountToken's user, then the stored
--                        owner of this chain
-- p_source:
--   'purchase'      the app's purchase call (reason 'purchase')
--   'app'           an app sync (reason launch / restore / update)
--   'notification'  an App Store Server Notification
-- Results:
--   applied        stored / updated
--   stale          older than what is stored (out-of-order or replayed); no change
--   wrong_account  this chain belongs to ANOTHER CyberNet account; no change
--                  (a Restore on a second account never moves a subscription)
--   unknown_user   p_user_id is not an existing account (deleted)
--   not_linked     a new chain with no appAccountToken sent by a purchase call;
--                  only an app sync may claim such a chain (critic #9). No change.
-- entitled: whether the row gives Pro right now.
--
-- Ordering (critic #8): what is "newer" is decided by the period first, then
-- the purchase date, then the signing date:
--   (expires_at, purchase_date, signed_at)
-- Apple signs device transactions and notifications at different moments, so
-- a signing date alone does not say which one describes the latest period.
-- Revocations:
--   * a revocation for the stored period (or a later one) always applies, even
--     when it was signed before the stored row;
--   * an app sync can never clear a revocation for the same or an earlier
--     period (a cached device JWS from before the refund); only a
--     notification (REFUND_REVERSED) or a strictly later period can.
create or replace function public.apply_apple_subscription(
  p_user_id uuid,
  p_original_transaction_id text,
  p_latest_transaction_id text,
  p_product_id text,
  p_environment text,
  p_app_account_token uuid,
  p_purchase_date timestamptz,
  p_original_purchase_date timestamptz,
  p_expires_at timestamptz,
  p_revoked_at timestamptz,
  p_revocation_reason integer,
  p_auto_renew boolean,              -- null = unknown (no renewal info sent)
  p_auto_renew_product_id text,
  p_grace_expires_at timestamptz,    -- null = none / unknown
  p_billing_retry boolean,           -- null = unknown
  p_signed_at timestamptz,
  p_source text,                     -- 'purchase' | 'app' | 'notification'
  p_notification_type text           -- null for app calls
)
returns table (result text, entitled boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_now timestamptz := now();
  v_old public.apple_subscriptions%rowtype;
  v_has_old boolean := false;
  v_grace timestamptz := p_grace_expires_at;
  v_auto boolean := p_auto_renew;
  v_auto_product text := p_auto_renew_product_id;
  v_entitled boolean;
  v_status text;
  v_older boolean;
  v_old_entitled boolean;
begin
  if p_product_id is null or p_product_id not in ('app.cybernetai.pro.monthly', 'app.cybernetai.pro.yearly') then
    raise exception 'Unknown Apple product %', p_product_id using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('purchase', 'app', 'notification') then
    raise exception 'Bad source %', p_source using errcode = '22023';
  end if;
  if p_environment is null or p_environment not in ('Production', 'Sandbox') then
    raise exception 'Bad environment %', p_environment using errcode = '22023';
  end if;
  if p_expires_at is null or p_signed_at is null then
    raise exception 'Missing expiry or signing date' using errcode = '22023';
  end if;

  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    return query select 'unknown_user'::text, false;
    return;
  end if;

  -- One chain at a time (app sync and notification can arrive together).
  perform pg_advisory_xact_lock(hashtextextended('apple_subscription:' || p_original_transaction_id, 0));

  select * into v_old from public.apple_subscriptions s
  where s.original_transaction_id = p_original_transaction_id;
  v_has_old := found;

  if not v_has_old then
    -- Case F: a new chain whose signed token names ANOTHER existing account is
    -- that account's purchase; a caller signed in elsewhere cannot claim it.
    -- (Token of a deleted account: case E, link to the caller.)
    if p_app_account_token is not null
       and p_app_account_token <> p_user_id
       and exists (select 1 from auth.users u where u.id = p_app_account_token) then
      return query select 'wrong_account'::text, false;
      return;
    end if;
    -- Case D (no token: offer code, resubscribe from iOS Settings): only an
    -- app sync may claim it, never the purchase call (the app always sets the
    -- token when it buys, so a token-less "purchase" is someone else's JWS).
    if p_app_account_token is null and p_source = 'purchase' then
      return query select 'not_linked'::text, false;
      return;
    end if;
  end if;

  if v_has_old then
    v_old_entitled := v_old.revoked_at is null
      and (v_old.expires_at > v_now or coalesce(v_old.grace_expires_at, '-infinity'::timestamptz) > v_now);
    if v_old.user_id <> p_user_id then
      -- Re-subscribing in the same group keeps the original transaction id.
      -- A NEWER purchase whose signed token is this caller moves a chain that
      -- no longer gives the old owner anything (lapsed / revoked). A plain
      -- Restore (token is not the caller) never moves a subscription.
      if p_app_account_token is not null
         and p_app_account_token = p_user_id
         and not v_old_entitled
         and p_revoked_at is null
         and p_expires_at > v_old.expires_at
         and (v_old.purchase_date is null or p_purchase_date is null or p_purchase_date > v_old.purchase_date) then
        update public.apple_subscriptions s
        set user_id = p_user_id, grace_expires_at = null, updated_at = v_now
        where s.original_transaction_id = p_original_transaction_id;
        v_old.user_id := p_user_id;
        v_old.grace_expires_at := null;
      else
        return query select 'wrong_account'::text, false;
        return;
      end if;
    end if;

    -- Older than what is stored (by period, then purchase date, then signing
    -- date): never moves today's state backwards.
    v_older := row(p_expires_at, coalesce(p_purchase_date, v_old.purchase_date, '-infinity'::timestamptz), p_signed_at)
             < row(v_old.expires_at, coalesce(v_old.purchase_date, p_purchase_date, '-infinity'::timestamptz), v_old.last_signed_at);
    -- A revocation of the stored period (or a later one) always applies.
    if p_revoked_at is not null and v_old.revoked_at is null and p_expires_at >= v_old.expires_at then
      v_older := false;
    end if;
    -- An app sync never clears a revocation of the same or an earlier period.
    if v_old.revoked_at is not null and p_revoked_at is null and p_source <> 'notification'
       and p_expires_at <= v_old.expires_at then
      v_older := true;
    end if;
    if v_older then
      return query select 'stale'::text, v_old_entitled;
      return;
    end if;

    -- An app sync without renewal info must not wipe the grace period or
    -- renewal state a notification already told us about for the same period.
    if p_source <> 'notification' and p_expires_at = v_old.expires_at then
      if p_grace_expires_at is null then v_grace := v_old.grace_expires_at; end if;
    end if;
    if p_auto_renew is null then v_auto := v_old.auto_renew; end if;
    if p_auto_renew_product_id is null then v_auto_product := v_old.auto_renew_product_id; end if;
  end if;

  v_entitled := p_revoked_at is null
    and (p_expires_at > v_now or coalesce(v_grace, '-infinity'::timestamptz) > v_now);
  v_status := case
    when p_revoked_at is not null then 'revoked'
    when p_expires_at > v_now then 'active'
    when coalesce(v_grace, '-infinity'::timestamptz) > v_now then 'grace'
    when coalesce(p_billing_retry, false) then 'billing_retry'
    else 'expired'
  end;

  insert into public.apple_subscriptions as s (
    original_transaction_id, user_id, product_id, environment, app_account_token,
    latest_transaction_id, purchase_date, original_purchase_date, expires_at,
    grace_expires_at, auto_renew, auto_renew_product_id, status, revoked_at,
    revocation_reason, last_signed_at, last_source, last_notification_type, created_at, updated_at
  ) values (
    p_original_transaction_id, p_user_id, p_product_id, p_environment, p_app_account_token,
    p_latest_transaction_id, p_purchase_date, p_original_purchase_date, p_expires_at,
    v_grace, v_auto, v_auto_product, v_status, p_revoked_at,
    case when p_revoked_at is null then null else p_revocation_reason::smallint end,
    p_signed_at, case when p_source = 'notification' then 'notification' else 'app' end,
    p_notification_type, v_now, v_now
  )
  on conflict (original_transaction_id) do update set
    product_id = excluded.product_id,
    environment = excluded.environment,
    app_account_token = coalesce(excluded.app_account_token, s.app_account_token),
    latest_transaction_id = coalesce(excluded.latest_transaction_id, s.latest_transaction_id),
    purchase_date = coalesce(excluded.purchase_date, s.purchase_date),
    original_purchase_date = coalesce(excluded.original_purchase_date, s.original_purchase_date),
    expires_at = excluded.expires_at,
    grace_expires_at = excluded.grace_expires_at,
    auto_renew = excluded.auto_renew,
    auto_renew_product_id = excluded.auto_renew_product_id,
    status = excluded.status,
    revoked_at = excluded.revoked_at,
    revocation_reason = excluded.revocation_reason,
    last_signed_at = greatest(excluded.last_signed_at, s.last_signed_at),
    last_source = excluded.last_source,
    last_notification_type = coalesce(excluded.last_notification_type, s.last_notification_type),
    updated_at = v_now;

  return query select 'applied'::text, v_entitled;
end;
$$;

revoke all on function public.apply_apple_subscription(
  uuid, text, text, text, text, uuid, timestamptz, timestamptz, timestamptz, timestamptz,
  integer, boolean, text, timestamptz, boolean, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.apply_apple_subscription(
  uuid, text, text, text, text, uuid, timestamptz, timestamptz, timestamptz, timestamptz,
  integer, boolean, text, timestamptz, boolean, timestamptz, text, text
) to service_role;

-- ───────────── 6. apple_pro_user_ids (recovery-checkin) ─────────────
create or replace function public.apple_pro_user_ids(p_limit integer default 1000)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.user_id
  from public.apple_subscriptions a
  where a.revoked_at is null
    and (a.expires_at > now() or coalesce(a.grace_expires_at, '-infinity'::timestamptz) > now())
  limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

revoke all on function public.apple_pro_user_ids(integer) from public, anon, authenticated;
grant execute on function public.apple_pro_user_ids(integer) to service_role;


commit;

-- Read-only checks after this file: supabase/checks/20261121120000_apple_iap_pro_smoke.sql,
-- then supabase/audit/grants-rls-audit.sql as usual.
