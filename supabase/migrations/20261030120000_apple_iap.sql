-- iPhone app plans: Apple In-App Purchase subscriptions (Pro and Business).
--
-- Written 30 Oct 2026 for the owner's decision of the same day: the iPhone app
-- sells the website's Free / Pro / Business plans with Apple In-App Purchase
-- (StoreKit 2). This replaces the 29 Oct rule "every feature unlocked with
-- Free-sized limits, no purchases in 1.0".
--
-- WHO APPLIES IT: the owner, in the Supabase SQL Editor, BEFORE the one
-- approved web/server deploy that carries netlify/functions/apple-verify.mjs
-- and the rest of this change. Claude never runs it against the live database.
-- SAFE TO RE-RUN: every statement is idempotent. The only existing objects it
-- touches are business_accounts (two new columns with defaults) and the four
-- consume_* functions, which are replaced with the same body except for ONE
-- step: the plan is read through public.plan_of() instead of straight from
-- profiles. For an account with no Apple subscription plan_of() returns
-- exactly what those functions computed before, so the website behaves
-- identically (tests/run-ios-migration.mjs compares them).
--
-- 1. apple_subscriptions: one row per Apple subscription (original
--    transaction id), written only by netlify/functions/apple-verify.mjs and
--    apple-notifications.mjs after the server has verified Apple's signed JWS
--    (netlify/lib/apple-jws.mjs). No Apple API key is involved.
-- 2. apple_notifications: App Store Server Notifications V2, kept for
--    idempotency and audit (no payload is stored; rows older than 90 days are
--    deleted by netlify/functions/rate-limit-cleanup.mjs).
-- 3. business_accounts.billing_source / apple_original_transaction_id: a
--    Business team can be billed by Stripe (the website) or by Apple.
-- 4. plan_of(user): the one place that decides a person's own plan.
-- 5. consume_analysis / consume_recovery_case / consume_recovery_update /
--    consume_quickscan: now read the plan through plan_of().
-- 6. apply_apple_subscription(...): records a verified Apple transaction and,
--    for Business products, creates or updates the team (same tables and seat
--    pools as the Stripe path), all in one database transaction.
-- 7. expire_apple_subscriptions(): hourly sweep (netlify/functions/apple-sweep.mjs).
--
-- Product catalog (mirrored in netlify/lib/apple-products.mjs; a test compares
-- them): app.cybernetai.pro.monthly, app.cybernetai.pro.yearly,
-- app.cybernetai.business5.monthly (5 seats, pools 50 / 20),
-- app.cybernetai.business10.monthly (10 seats, 90 / 36),
-- app.cybernetai.business20.monthly (20 seats, 160 / 64).

begin;

-- ───────────────────── 1. Apple subscriptions ─────────────────────

create table if not exists public.apple_subscriptions (
  original_transaction_id text primary key check (char_length(original_transaction_id) between 1 and 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null check (product_id in (
    'app.cybernetai.pro.monthly',
    'app.cybernetai.pro.yearly',
    'app.cybernetai.business5.monthly',
    'app.cybernetai.business10.monthly',
    'app.cybernetai.business20.monthly'
  )),
  plan text not null check (plan in ('pro', 'business')),
  seat_tier smallint check (seat_tier in (5, 10, 20)),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  environment text not null check (environment in ('Production', 'Sandbox')),
  latest_transaction_id text check (latest_transaction_id is null or char_length(latest_transaction_id) <= 64),
  purchase_date timestamptz,
  expires_at timestamptz not null,
  grace_expires_at timestamptz,
  auto_renew boolean not null default true,
  status text not null default 'active' check (status in ('active', 'grace', 'billing_retry', 'expired', 'revoked')),
  revoked_at timestamptz,
  revocation_reason smallint,
  last_signed_at timestamptz not null default now(),
  last_notification_type text check (last_notification_type is null or char_length(last_notification_type) <= 60),
  business_account_id uuid references public.business_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((plan = 'business') = (seat_tier is not null))
);

comment on table public.apple_subscriptions is
  'Apple In-App Purchase subscriptions, one row per original transaction. Written only by Netlify functions with the service role after Apple''s signed data has been verified.';

create index if not exists apple_subscriptions_user_idx
  on public.apple_subscriptions (user_id);
create index if not exists apple_subscriptions_expires_idx
  on public.apple_subscriptions (expires_at);

alter table public.apple_subscriptions enable row level security;

-- No policies: the browser never reads this table (every read goes through a
-- Netlify function with the service role).
revoke all on table public.apple_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.apple_subscriptions to service_role;

create table if not exists public.apple_notifications (
  notification_uuid uuid primary key,
  notification_type text not null check (char_length(notification_type) <= 60),
  subtype text check (subtype is null or char_length(subtype) <= 60),
  environment text check (environment is null or environment in ('Production', 'Sandbox')),
  original_transaction_id text check (original_transaction_id is null or char_length(original_transaction_id) <= 64),
  signed_date timestamptz,
  -- 'error' until the notification has been processed: a delivery that failed
  -- halfway is processed again when Apple retries it.
  outcome text not null default 'error' check (outcome in ('applied', 'ignored', 'stale', 'unknown_user', 'error')),
  received_at timestamptz not null default now()
);

comment on table public.apple_notifications is
  'App Store Server Notifications V2 already received (idempotency and audit). No payload is stored.';

create index if not exists apple_notifications_received_idx
  on public.apple_notifications (received_at);

alter table public.apple_notifications enable row level security;

revoke all on table public.apple_notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.apple_notifications to service_role;

-- ───────────── 2. Business teams: who bills them (Stripe or Apple) ─────────────

alter table public.business_accounts
  add column if not exists billing_source text not null default 'stripe' check (billing_source in ('stripe', 'apple')),
  add column if not exists apple_original_transaction_id text;

create unique index if not exists business_accounts_apple_original_transaction_unique
  on public.business_accounts (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

-- ───────────────────── 3. plan_of: one person's own plan ─────────────────────
-- 'business' / 'pro' exactly as the consume_* functions used to read them from
-- profiles (active or trialing); otherwise 'pro' when an Apple Pro subscription
-- is paid up (not revoked, not expired, or inside its billing grace period);
-- otherwise 'free'. A Business team membership is not read here: team members
-- are served by the consume_*_business functions, as before.

create or replace function public.plan_of(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_status text;
begin
  select p.plan, p.subscription_status
  into v_plan, v_status
  from public.profiles p
  where p.id = p_user_id;

  if v_plan = 'business' and v_status in ('active', 'trialing') then
    return 'business';
  end if;
  if v_plan = 'pro' and v_status in ('active', 'trialing') then
    return 'pro';
  end if;

  if exists (
    select 1
    from public.apple_subscriptions a
    where a.user_id = p_user_id
      and a.plan = 'pro'
      and a.revoked_at is null
      and (a.expires_at > now() or a.grace_expires_at > now())
  ) then
    return 'pro';
  end if;

  return 'free';
end;
$$;

revoke all on function public.plan_of(uuid) from public, anon, authenticated;
grant execute on function public.plan_of(uuid) to service_role;

-- ───────────── 4. The usage functions, reading the plan through plan_of ─────────────
-- Identical to the versions in supabase/schema.sql before 30 Oct 2026 except
-- for the plan lookup (marked below). Free 3 AI analyses / 5 Quick Scans /
-- 1 Recovery case / 1 update (6 h cooldown); Pro 15 / unlimited / 3 / no fixed
-- cap (2 h cooldown); Business as before.

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
set search_path = public
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_limit integer := 5;
  v_used integer := 0;
begin
  -- plan lookup (changed 30 Oct 2026): Apple Pro counts as Pro; see public.plan_of
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
set search_path = public
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_limit integer := 1;
  v_used integer := 0;
  v_window timestamptz := public.recovery_window_start();
begin
  -- plan lookup (changed 30 Oct 2026): Apple Pro counts as Pro; see public.plan_of
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
set search_path = public
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
  -- plan lookup (changed 30 Oct 2026): Apple Pro counts as Pro; see public.plan_of
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
  returning updates_used
  into v_used;

  if v_used is null then
    select updates_used into v_used
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;

    return query select false, coalesce(v_used, 0), v_limit, v_plan, public.recovery_next_reset(), 0;
    return;
  end if;

  return query select true, v_used, v_limit, v_plan, public.recovery_next_reset(), 0;
end;
$$;

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
set search_path = public
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_limit integer := 5;
  v_used integer := 0;
  v_date date := (now() at time zone 'utc')::date;
begin
  -- plan lookup (changed 30 Oct 2026): Apple Pro counts as Pro; see public.plan_of
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

revoke all on function public.consume_analysis(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_case(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_update(uuid) from public, anon, authenticated;
revoke all on function public.consume_quickscan(uuid) from public, anon, authenticated;
grant execute on function public.consume_analysis(uuid) to service_role;
grant execute on function public.consume_recovery_case(uuid) to service_role;
grant execute on function public.consume_recovery_update(uuid) to service_role;
grant execute on function public.consume_quickscan(uuid) to service_role;

-- ───────────── 5. apply_apple_subscription: record one verified transaction ─────────────
-- Called only by netlify/functions/apple-verify.mjs and apple-notifications.mjs
-- with the service role, after the server has checked Apple's signature and
-- that the transaction's appAccountToken is the verified caller. The user id is
-- never taken from a request body.
--
-- result: 'applied' | 'stale' | 'wrong_account' | 'unknown_user'
--         | 'conflict_web_plan' (the person already pays for a Business team on
--           the website: the Apple row is stored, the team is left alone)
--         | 'in_other_team' (the person is an active member of someone else's
--           team: the Apple row is stored and paid, no team is attached; a later
--           Restore attaches it once they have left that team).
-- entitled: whether the subscription gives access right now.

create or replace function public.apply_apple_subscription(
  p_user_id uuid,
  p_original_transaction_id text,
  p_latest_transaction_id text,
  p_product_id text,
  p_environment text,
  p_purchase_date timestamptz,
  p_expires_at timestamptz,
  p_revoked_at timestamptz,
  p_revocation_reason integer,
  p_auto_renew boolean,
  p_grace_expires_at timestamptz,
  p_signed_at timestamptz,
  p_notification_type text
)
returns table (result text, entitled boolean, business_account_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_now timestamptz := now();
  v_plan text;
  v_seat smallint;
  v_interval text;
  v_daily smallint;
  v_recovery smallint;
  v_old public.apple_subscriptions%rowtype;
  v_has_old boolean := false;
  v_entitled boolean;
  v_in_grace boolean;
  v_auto boolean;
  v_grace timestamptz := p_grace_expires_at;
  v_status text;
  v_signed timestamptz := coalesce(p_signed_at, now());
  v_team public.business_accounts%rowtype;
  v_has_team boolean := false;
  v_team_id uuid;
  v_team_status text;
  v_result text := 'applied';
begin
  -- The product catalog: the one place in SQL that maps a product to a plan,
  -- seat count and the team's shared pools (mirrored in netlify/lib/apple-products.mjs).
  select m.plan, m.seat_tier, m.billing_interval, m.daily_pool, m.recovery_pool
  into v_plan, v_seat, v_interval, v_daily, v_recovery
  from (values
    ('app.cybernetai.pro.monthly',        'pro',      null::smallint, 'month', null::smallint, null::smallint),
    ('app.cybernetai.pro.yearly',         'pro',      null::smallint, 'year',  null::smallint, null::smallint),
    ('app.cybernetai.business5.monthly',  'business', 5::smallint,    'month', 50::smallint,   20::smallint),
    ('app.cybernetai.business10.monthly', 'business', 10::smallint,   'month', 90::smallint,   36::smallint),
    ('app.cybernetai.business20.monthly', 'business', 20::smallint,   'month', 160::smallint,  64::smallint)
  ) as m(product_id, plan, seat_tier, billing_interval, daily_pool, recovery_pool)
  where m.product_id = p_product_id;

  if v_plan is null then
    raise exception 'Unknown Apple product %', p_product_id using errcode = '22023';
  end if;

  -- A deleted account: nothing to attach the subscription to.
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return query select 'unknown_user'::text, false, null::uuid;
    return;
  end if;

  -- One transaction chain is handled by one request at a time.
  perform pg_advisory_xact_lock(hashtextextended('apple_subscription:' || p_original_transaction_id, 0));

  select * into v_old
  from public.apple_subscriptions s
  where s.original_transaction_id = p_original_transaction_id;
  v_has_old := found;

  if v_has_old then
    if v_old.user_id <> p_user_id then
      return query select 'wrong_account'::text, false, null::uuid;
      return;
    end if;
    -- Older than what is stored: an out-of-order notification, or an earlier
    -- period's transaction replayed. It cannot change today's entitlement.
    -- "Earlier" is judged by the transaction's purchase date, not its end date:
    -- an upgrade (for example Pro yearly to Business monthly) starts a newer
    -- transaction whose end date can be sooner than the old one's.
    if v_old.last_signed_at > v_signed
      or (p_purchase_date is not null and v_old.purchase_date is not null and p_purchase_date < v_old.purchase_date)
      or ((p_purchase_date is null or v_old.purchase_date is null) and p_expires_at < v_old.expires_at) then
      return query select
        'stale'::text,
        (v_old.revoked_at is null and (v_old.expires_at > v_now or coalesce(v_old.grace_expires_at, '-infinity'::timestamptz) > v_now)),
        v_old.business_account_id;
      return;
    end if;
  end if;

  -- A sync from the app (no notification type) may come without renewal info;
  -- it must not end a grace period Apple has already told us about.
  if v_grace is null and p_notification_type is null and v_has_old and p_expires_at = v_old.expires_at then
    v_grace := v_old.grace_expires_at;
  end if;

  v_entitled := p_revoked_at is null
    and (p_expires_at > v_now or coalesce(v_grace, '-infinity'::timestamptz) > v_now);
  v_in_grace := p_revoked_at is null
    and p_expires_at <= v_now
    and coalesce(v_grace, '-infinity'::timestamptz) > v_now;
  v_auto := coalesce(p_auto_renew, case when v_has_old then v_old.auto_renew end, true);
  v_status := case
    when p_revoked_at is not null then 'revoked'
    when p_expires_at > v_now then 'active'
    when v_in_grace then 'grace'
    when v_auto and p_notification_type in ('DID_FAIL_TO_RENEW', 'GRACE_PERIOD_EXPIRED') then 'billing_retry'
    else 'expired'
  end;
  v_team_status := case v_status
    when 'active' then 'active'
    when 'grace' then 'active'
    when 'billing_retry' then 'past_due'
    else 'canceled'
  end;

  insert into public.apple_subscriptions as s (
    original_transaction_id, user_id, product_id, plan, seat_tier, billing_interval, environment,
    latest_transaction_id, purchase_date, expires_at, grace_expires_at, auto_renew, status,
    revoked_at, revocation_reason, last_signed_at, last_notification_type, created_at, updated_at
  )
  values (
    p_original_transaction_id, p_user_id, p_product_id, v_plan, v_seat, v_interval, p_environment,
    p_latest_transaction_id, p_purchase_date, p_expires_at, v_grace, v_auto, v_status,
    p_revoked_at, case when p_revoked_at is null then null else p_revocation_reason::smallint end,
    v_signed, p_notification_type, v_now, v_now
  )
  on conflict (original_transaction_id) do update set
    product_id = excluded.product_id,
    plan = excluded.plan,
    seat_tier = excluded.seat_tier,
    billing_interval = excluded.billing_interval,
    environment = excluded.environment,
    latest_transaction_id = coalesce(excluded.latest_transaction_id, s.latest_transaction_id),
    purchase_date = coalesce(excluded.purchase_date, s.purchase_date),
    expires_at = excluded.expires_at,
    grace_expires_at = excluded.grace_expires_at,
    auto_renew = excluded.auto_renew,
    status = excluded.status,
    revoked_at = excluded.revoked_at,
    revocation_reason = excluded.revocation_reason,
    last_signed_at = excluded.last_signed_at,
    last_notification_type = coalesce(excluded.last_notification_type, s.last_notification_type),
    updated_at = v_now;

  if v_plan = 'pro' then
    -- A product change from Business to Pro on the same subscription closes the
    -- team that was attached to it.
    if v_has_old and v_old.business_account_id is not null then
      update public.business_accounts t
      set subscription_status = 'canceled', updated_at = v_now
      where t.id = v_old.business_account_id
        and t.billing_source = 'apple'
        and t.apple_original_transaction_id = p_original_transaction_id;
      update public.apple_subscriptions s
      set business_account_id = null
      where s.original_transaction_id = p_original_transaction_id;
    end if;
    return query select v_result, v_entitled, null::uuid;
    return;
  end if;

  -- Business: the team and its owner's membership. Everything from here to the
  -- end of the block is undone together if the owner already belongs to
  -- someone else's team (the one-active-team index on business_members).
  begin
    select * into v_team
    from public.business_accounts t
    where t.apple_original_transaction_id = p_original_transaction_id;
    v_has_team := found;

    if not v_has_team then
      select * into v_team
      from public.business_accounts t
      where t.owner_user_id = p_user_id
      order by (t.subscription_status in ('active', 'trialing')) desc, t.created_at
      limit 1;
      v_has_team := found;
    end if;

    if v_has_team then
      if v_team.billing_source = 'stripe'
        and v_team.subscription_status not in ('canceled', 'incomplete_expired', 'inactive') then
        -- The person has a Business team on the website that is not closed
        -- (active, trialing, or still being retried by Stripe): it stays theirs.
        v_result := 'conflict_web_plan';
      elsif v_team.billing_source = 'apple'
        and v_team.apple_original_transaction_id is distinct from p_original_transaction_id
        and v_team.subscription_status in ('active', 'trialing')
        and not v_entitled then
        -- The team is currently paid by a newer Apple subscription; this one
        -- (an old chain) has nothing to add.
        v_team_id := v_team.id;
      else
        update public.business_accounts t
        set seat_tier = v_seat,
            daily_pool_limit = v_daily,
            recovery_pool_limit = v_recovery,
            billing_source = 'apple',
            billing_interval = v_interval,
            apple_original_transaction_id = p_original_transaction_id,
            -- An Apple-billed team has no Stripe subscription (a closed one that
            -- this row used to have is dropped, so nothing in Stripe is touched).
            stripe_subscription_id = null,
            stripe_customer_id = null,
            subscription_status = v_team_status,
            updated_at = v_now
        where t.id = v_team.id;
        v_team_id := v_team.id;
      end if;
    elsif v_entitled then
      insert into public.business_accounts (
        owner_user_id, seat_tier, daily_pool_limit, recovery_pool_limit,
        subscription_status, billing_interval, billing_source, apple_original_transaction_id
      )
      values (p_user_id, v_seat, v_daily, v_recovery, v_team_status, v_interval, 'apple', p_original_transaction_id)
      returning id into v_team_id;
    end if;

    -- The owner's membership is what makes the team theirs. Only an entitled
    -- subscription gives it back; the row is never removed here.
    if v_team_id is not null and v_entitled then
      if exists (
        select 1 from public.business_members m
        where m.business_account_id = v_team_id and m.user_id = p_user_id
      ) then
        update public.business_members m
        set role = 'owner', status = 'active', removed_at = null
        where m.business_account_id = v_team_id and m.user_id = p_user_id
          and (m.role <> 'owner' or m.status <> 'active');
      else
        insert into public.business_members (business_account_id, user_id, role, status)
        values (v_team_id, p_user_id, 'owner', 'active');
      end if;
    end if;
  exception when unique_violation then
    v_result := 'in_other_team';
    v_team_id := null;
  end;

  update public.apple_subscriptions s
  set business_account_id = v_team_id
  where s.original_transaction_id = p_original_transaction_id;

  return query select v_result, v_entitled, v_team_id;
end;
$$;

revoke all on function public.apply_apple_subscription(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_apple_subscription(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, timestamptz, timestamptz, text) to service_role;

-- ───────────── 6. expire_apple_subscriptions: the hourly safety net ─────────────
-- Notifications normally end a subscription at once. If one is missed, Pro still
-- ends on time (plan_of reads the dates), and this closes Apple-billed teams
-- within the hour: an unpaid subscription that is still set to renew goes to
-- billing_retry (team 'past_due'), one that is not renewing goes to expired
-- (team 'canceled'). A subscription that has been in billing retry for 60 days
-- is expired. Returns how many rows changed.

create or replace function public.expire_apple_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  for v_row in
    select s.original_transaction_id, s.auto_renew, s.status
    from public.apple_subscriptions s
    where s.revoked_at is null
      and (
        (s.status in ('active', 'grace')
          and s.expires_at <= now()
          and (s.grace_expires_at is null or s.grace_expires_at <= now()))
        or (s.status = 'billing_retry' and s.expires_at <= now() - interval '60 days')
      )
    for update
  loop
    if v_row.status = 'billing_retry' or not v_row.auto_renew then
      update public.apple_subscriptions s
      set status = 'expired', updated_at = now()
      where s.original_transaction_id = v_row.original_transaction_id;
      update public.business_accounts t
      set subscription_status = 'canceled', updated_at = now()
      where t.billing_source = 'apple'
        and t.apple_original_transaction_id = v_row.original_transaction_id
        and t.subscription_status in ('active', 'trialing', 'past_due');
    else
      update public.apple_subscriptions s
      set status = 'billing_retry', updated_at = now()
      where s.original_transaction_id = v_row.original_transaction_id;
      update public.business_accounts t
      set subscription_status = 'past_due', updated_at = now()
      where t.billing_source = 'apple'
        and t.apple_original_transaction_id = v_row.original_transaction_id
        and t.subscription_status in ('active', 'trialing');
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_apple_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_apple_subscriptions() to service_role;

commit;

-- ─────────────────────────── Verify ───────────────────────────
-- After running, the first query returns 5 rows (2 tables + 3 functions), the
-- second 2 rows, the third 4 rows (the four usage functions now call plan_of):
--   select 'table' as kind, to_regclass('public.apple_subscriptions')::text as name
--   union all select 'table', to_regclass('public.apple_notifications')::text
--   union all
--   select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in
--     ('plan_of','apply_apple_subscription','expire_apple_subscriptions');
--
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'business_accounts'
--     and column_name in ('billing_source','apple_original_transaction_id');
--
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in
--     ('consume_analysis','consume_recovery_case','consume_recovery_update','consume_quickscan')
--     and pg_get_functiondef(p.oid) like '%plan_of%';
--
-- ─────────────────────────── Roll back ───────────────────────────
-- Only if the iPhone plans are abandoned (deletes every stored Apple
-- subscription). FIRST put the four usage functions back as they were: run the
-- create-or-replace blocks for consume_analysis, consume_recovery_case,
-- consume_recovery_update and consume_quickscan from supabase/schema.sql as it
-- was before 30 Oct 2026 (git history: they read profiles.plan directly). THEN:
--   drop function if exists public.expire_apple_subscriptions();
--   drop function if exists public.apply_apple_subscription(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, timestamptz, timestamptz, text);
--   drop function if exists public.plan_of(uuid);
--   drop index if exists public.business_accounts_apple_original_transaction_unique;
--   alter table public.business_accounts drop column if exists apple_original_transaction_id;
--   alter table public.business_accounts drop column if exists billing_source;
--   drop table if exists public.apple_notifications;
--   drop table if exists public.apple_subscriptions;
