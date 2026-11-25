-- ROLLBACK for supabase/migrations/20261121120000_apple_iap_pro.sql (iPhone app 1.1, Apple Pro).
--
-- WHO RUNS IT: the owner, in the Supabase SQL Editor, ONLY if something breaks
-- after the migration (for example the website's daily limits misbehave).
-- WHAT IT DOES: puts back the four usage functions exactly as they were before
-- the migration (copied byte for byte from supabase/schema.sql at origin/main
-- 4576f6a), so every limit check reads profiles.plan again, as today.
-- WHAT IT KEEPS: the tables apple_subscriptions / apple_notifications and the
-- functions entitlement_of / plan_of / apply_apple_subscription /
-- apple_pro_user_ids. Nothing is deleted, so no Apple purchase record is lost;
-- while this rollback is in place an Apple Pro buyer gets Free limits from
-- the SQL usage functions (the website itself keeps working).
-- SAFE TO RE-RUN: yes (create or replace).
-- To undo the rollback, run the migration file again.

begin;

-- consume_analysis: original body
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
  select
    profiles.plan,
    profiles.subscription_status
  into
    v_plan,
    v_status
  from public.profiles
  where profiles.id = p_user_id;

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

-- consume_recovery_case: original body
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
  select profiles.plan, profiles.subscription_status
  into v_plan, v_status
  from public.profiles
  where profiles.id = p_user_id;

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

-- consume_recovery_update: original body
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
  select profiles.plan, profiles.subscription_status
  into v_plan, v_status
  from public.profiles
  where profiles.id = p_user_id;

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

-- consume_quickscan: original body
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
  select profiles.plan, profiles.subscription_status
  into v_plan, v_status
  from public.profiles
  where profiles.id = p_user_id;

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
grant execute on function public.consume_analysis(uuid) to service_role;
revoke all on function public.consume_recovery_case(uuid) from public, anon, authenticated;
grant execute on function public.consume_recovery_case(uuid) to service_role;
revoke all on function public.consume_recovery_update(uuid) from public, anon, authenticated;
grant execute on function public.consume_recovery_update(uuid) to service_role;
revoke all on function public.consume_quickscan(uuid) from public, anon, authenticated;
grant execute on function public.consume_quickscan(uuid) to service_role;

commit;
