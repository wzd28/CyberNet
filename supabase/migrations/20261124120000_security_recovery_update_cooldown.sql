-- Security audit Nov 2026, DB-4: the Recovery update cooldown can no longer
-- be skipped with parallel requests.
--
-- Before: the cooldown was only checked by an unlocked SELECT at the top, and
-- the guarded UPDATE only required updates_used < v_limit (999 for Pro and
-- Business). Twenty parallel updates all read the same last_update_at, all
-- passed, and each ran a paid AI plan rewrite. Now the UPDATE also requires
-- the cooldown to have passed; under READ COMMITTED a waiting UPDATE re-checks
-- its WHERE against the committed row, so exactly one request wins and the
-- others get the same "wait N minutes" answer as before.
--
-- Same signatures, same results for normal use; grants re-applied.
-- Idempotent (CREATE OR REPLACE). NOT applied: the owner runs it in the
-- Supabase SQL Editor (as postgres). Mirrored in supabase/schema.sql.
--
-- IMPORTANT: the not-yet-applied Apple in-app-purchase migration in the app
-- repository (cn-sec-app, 20261121120000_apple_iap_pro.sql, section 4)
-- re-creates consume_recovery_update. Add the same two changes there before
-- it is applied, or it silently undoes this one.
--
-- Undo: run the previous bodies below (remove the leading "-- " from each
-- line), then the same revoke and grant lines as at the end of this file.
-- create or replace function public.consume_recovery_update(
--   p_user_id uuid
-- )
-- returns table (
--   allowed boolean,
--   used integer,
--   daily_limit integer,
--   plan text,
--   reset_at timestamptz,
--   cooldown_seconds_remaining integer
-- )
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_plan text := 'free';
--   v_status text := 'inactive';
--   v_limit integer := 1;
--   v_cooldown interval := interval '6 hours';
--   v_used integer := 0;
--   v_window timestamptz := public.recovery_window_start();
--   v_last_update timestamptz;
--   v_cooldown_remaining integer := 0;
-- begin
--   select profiles.plan, profiles.subscription_status
--   into v_plan, v_status
--   from public.profiles
--   where profiles.id = p_user_id;
--
--   if v_plan = 'business' and v_status in ('active', 'trialing') then
--     v_limit := 999;
--     v_cooldown := interval '1 hour';
--   elsif v_plan = 'pro' and v_status in ('active', 'trialing') then
--     v_limit := 999;
--     v_cooldown := interval '2 hours';
--   else
--     v_plan := 'free';
--     v_limit := 1;
--     v_cooldown := interval '6 hours';
--   end if;
--
--   select last_update_at into v_last_update
--   from public.recovery_usage
--   where user_id = p_user_id and window_start = v_window;
--
--   if v_last_update is not null and now() < v_last_update + v_cooldown then
--     v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
--     select updates_used into v_used
--     from public.recovery_usage
--     where user_id = p_user_id and window_start = v_window;
--
--     return query select false, coalesce(v_used, 0), v_limit, v_plan, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
--     return;
--   end if;
--
--   insert into public.recovery_usage (user_id, window_start, cases_created, updates_used)
--   values (p_user_id, v_window, 0, 0)
--   on conflict (user_id, window_start) do nothing;
--
--   update public.recovery_usage
--   set updates_used = updates_used + 1, last_update_at = now(), updated_at = now()
--   where user_id = p_user_id
--     and window_start = v_window
--     and updates_used < v_limit
--   returning updates_used
--   into v_used;
--
--   if v_used is null then
--     select updates_used into v_used
--     from public.recovery_usage
--     where user_id = p_user_id and window_start = v_window;
--
--     return query select false, coalesce(v_used, 0), v_limit, v_plan, public.recovery_next_reset(), 0;
--     return;
--   end if;
--
--   return query select true, v_used, v_limit, v_plan, public.recovery_next_reset(), 0;
-- end;
-- $$;
--
-- create or replace function public.consume_recovery_update_business(p_user_id uuid)
-- returns table(allowed boolean, used integer, daily_limit integer, plan text, reset_at timestamptz, cooldown_seconds_remaining integer)
-- language plpgsql
-- security definer
-- set search_path to 'public'
-- as $$
-- declare
--   v_limit integer := 999;
--   v_cooldown interval := interval '1 hour';
--   v_used integer := 0;
--   v_window timestamptz := public.recovery_window_start();
--   v_last_update timestamptz;
--   v_cooldown_remaining integer := 0;
-- begin
--   select last_update_at into v_last_update
--   from public.recovery_usage
--   where user_id = p_user_id and window_start = v_window;
--
--   if v_last_update is not null and now() < v_last_update + v_cooldown then
--     v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
--     select updates_used into v_used
--     from public.recovery_usage
--     where user_id = p_user_id and window_start = v_window;
--
--     return query select false, coalesce(v_used, 0), v_limit, 'business'::text, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
--     return;
--   end if;
--
--   insert into public.recovery_usage (user_id, window_start, cases_created, updates_used)
--   values (p_user_id, v_window, 0, 0)
--   on conflict (user_id, window_start) do nothing;
--
--   update public.recovery_usage
--   set updates_used = updates_used + 1, last_update_at = now(), updated_at = now()
--   where user_id = p_user_id
--     and window_start = v_window
--     and updates_used < v_limit
--   returning updates_used
--   into v_used;
--
--   if v_used is null then
--     select updates_used into v_used
--     from public.recovery_usage
--     where user_id = p_user_id and window_start = v_window;
--
--     return query select false, coalesce(v_used, 0), v_limit, 'business'::text, public.recovery_next_reset(), 0;
--     return;
--   end if;
--
--   return query select true, v_used, v_limit, 'business'::text, public.recovery_next_reset(), 0;
-- end;
-- $$;
--
-- create or replace function public.consume_recovery_update_app(
--   p_user_id uuid,
--   p_limit integer,
--   p_cooldown_seconds integer
-- )
-- returns table (
--   allowed boolean,
--   used integer,
--   daily_limit integer,
--   plan text,
--   reset_at timestamptz,
--   cooldown_seconds_remaining integer
-- )
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_limit integer := greatest(0, least(coalesce(p_limit, 0), 1000));
--   v_cooldown interval := make_interval(secs => greatest(0, least(coalesce(p_cooldown_seconds, 0), 86400)));
--   v_used integer;
--   v_window timestamptz := public.recovery_window_start();
--   v_last_update timestamptz;
--   v_cooldown_remaining integer := 0;
-- begin
--   select last_update_at into v_last_update
--   from public.recovery_usage
--   where user_id = p_user_id and window_start = v_window;
--
--   if v_last_update is not null and now() < v_last_update + v_cooldown then
--     v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
--     select updates_used into v_used
--     from public.recovery_usage
--     where user_id = p_user_id and window_start = v_window;
--     return query select false, coalesce(v_used, 0), v_limit, 'app'::text, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
--     return;
--   end if;
--
--   insert into public.recovery_usage (user_id, window_start, cases_created, updates_used)
--   values (p_user_id, v_window, 0, 0)
--   on conflict (user_id, window_start) do nothing;
--
--   update public.recovery_usage
--   set updates_used = updates_used + 1, last_update_at = now(), updated_at = now()
--   where user_id = p_user_id and window_start = v_window and updates_used < v_limit
--   returning updates_used into v_used;
--
--   if v_used is null then
--     select updates_used into v_used
--     from public.recovery_usage
--     where user_id = p_user_id and window_start = v_window;
--     return query select false, coalesce(v_used, 0), v_limit, 'app'::text, public.recovery_next_reset(), 0;
--     return;
--   end if;
--
--   return query select true, v_used, v_limit, 'app'::text, public.recovery_next_reset(), 0;
-- end;
-- $$;

begin;

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

create or replace function public.consume_recovery_update_business(p_user_id uuid)
returns table(allowed boolean, used integer, daily_limit integer, plan text, reset_at timestamptz, cooldown_seconds_remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := 999;
  v_cooldown interval := interval '1 hour';
  v_used integer := 0;
  v_window timestamptz := public.recovery_window_start();
  v_last_update timestamptz;
  v_cooldown_remaining integer := 0;
begin
  select last_update_at into v_last_update
  from public.recovery_usage
  where user_id = p_user_id and window_start = v_window;

  if v_last_update is not null and now() < v_last_update + v_cooldown then
    v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
    select updates_used into v_used
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;

    return query select false, coalesce(v_used, 0), v_limit, 'business'::text, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
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
      return query select false, coalesce(v_used, 0), v_limit, 'business'::text, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
      return;
    end if;

    return query select false, coalesce(v_used, 0), v_limit, 'business'::text, public.recovery_next_reset(), 0;
    return;
  end if;

  return query select true, v_used, v_limit, 'business'::text, public.recovery_next_reset(), 0;
end;
$$;

create or replace function public.consume_recovery_update_app(
  p_user_id uuid,
  p_limit integer,
  p_cooldown_seconds integer
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
  v_limit integer := greatest(0, least(coalesce(p_limit, 0), 1000));
  v_cooldown interval := make_interval(secs => greatest(0, least(coalesce(p_cooldown_seconds, 0), 86400)));
  v_used integer;
  v_window timestamptz := public.recovery_window_start();
  v_last_update timestamptz;
  v_cooldown_remaining integer := 0;
begin
  select last_update_at into v_last_update
  from public.recovery_usage
  where user_id = p_user_id and window_start = v_window;

  if v_last_update is not null and now() < v_last_update + v_cooldown then
    v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
    select updates_used into v_used
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;
    return query select false, coalesce(v_used, 0), v_limit, 'app'::text, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
    return;
  end if;

  insert into public.recovery_usage (user_id, window_start, cases_created, updates_used)
  values (p_user_id, v_window, 0, 0)
  on conflict (user_id, window_start) do nothing;

  update public.recovery_usage
  set updates_used = updates_used + 1, last_update_at = now(), updated_at = now()
  where user_id = p_user_id and window_start = v_window and updates_used < v_limit
    -- DB-4: see consume_recovery_update.
    and (last_update_at is null or last_update_at <= now() - v_cooldown)
  returning updates_used into v_used;

  if v_used is null then
    select updates_used, last_update_at into v_used, v_last_update
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;
    if v_last_update is not null and now() < v_last_update + v_cooldown then
      v_cooldown_remaining := ceil(extract(epoch from ((v_last_update + v_cooldown) - now())));
      return query select false, coalesce(v_used, 0), v_limit, 'app'::text, public.recovery_next_reset(), greatest(0, v_cooldown_remaining);
      return;
    end if;
    return query select false, coalesce(v_used, 0), v_limit, 'app'::text, public.recovery_next_reset(), 0;
    return;
  end if;

  return query select true, v_used, v_limit, 'app'::text, public.recovery_next_reset(), 0;
end;
$$;

revoke all on function public.consume_recovery_update(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_update_business(uuid) from public, anon, authenticated;
revoke all on function public.consume_recovery_update_app(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_recovery_update(uuid) to service_role;
grant execute on function public.consume_recovery_update_business(uuid) to service_role;
grant execute on function public.consume_recovery_update_app(uuid, integer, integer) to service_role;

commit;
