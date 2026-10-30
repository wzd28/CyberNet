-- iPhone app 1.0: AI consent and the App-tier usage functions.
--
-- Written 20 Oct 2026 (App Store dossier, checked in PGlite), corrected
-- 29 Oct 2026 for this repository's rules (CLAUDE.md):
--   * ai_consents is reached only by Netlify Functions with the service role,
--     so service_role gets explicit table grants (Supabase stops granting new
--     objects automatically on 30 Oct 2026) and anon/authenticated get none.
--     (The 20 Oct draft granted SELECT to authenticated; the browser never
--     reads tables, so that grant is dropped. The policy stays, harmless.)
--   * functions use search_path = public, pg_temp and qualify every table.
--
-- WHO APPLIES IT: the owner, in the Supabase SQL Editor, before the first
-- deploy-preview test of the iPhone server changes and in any case before the
-- one approved web/server deploy. Claude never runs it against the live
-- database.
-- SAFE TO RE-RUN: every statement is idempotent and only ADDS objects. Nothing
-- existing is altered or dropped, so the website keeps working exactly as
-- today whether or not the server changes are deployed.
--
-- 1. ai_consents: explicit permission before an iPhone user's content goes to
--    OpenAI (App Review Guideline 5.1.2(i)). legal_acceptances cannot hold it:
--    its acceptance_type CHECK allows only signup/checkout/reaccept and its
--    four *_version columns are NOT NULL. Used by netlify/functions/ai-consent.mjs
--    and the consent gate in analyze / recovery-mode / recovery-update
--    (netlify/lib/ai-consent.mjs).
-- 2. App-tier usage functions: the iPhone app gives every account the same
--    daily counts, whatever was bought on the web (Guideline 3.1.3(b)). The
--    existing consume_* functions read profiles.plan and cannot do that, so the
--    iPhone path calls these *_app variants with a limit from code
--    (netlify/lib/app-tier.mjs). They share the website's counter rows (one
--    daily total per account) and the existing refund_analysis() still works.

begin;

-- ───────────────────────── 1. AI consent ─────────────────────────

create table if not exists public.ai_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  platform text not null default 'ios' check (platform in ('ios', 'web')),
  provider text not null default 'openai' check (char_length(provider) between 1 and 40),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  check (withdrawn_at is null or withdrawn_at >= granted_at)
);

comment on table public.ai_consents is
  'iPhone app AI consent (Allow AI analysis?). Written and read only by Netlify functions with the service role.';

create index if not exists ai_consents_user_granted_idx
  on public.ai_consents (user_id, granted_at desc);

-- At most one open (not withdrawn) consent per user and platform.
create unique index if not exists ai_consents_one_open_per_user_platform
  on public.ai_consents (user_id, platform)
  where withdrawn_at is null;

alter table public.ai_consents enable row level security;

-- Only matters if a SELECT grant to authenticated is ever added; none is.
drop policy if exists "Users can read their own AI consents" on public.ai_consents;
create policy "Users can read their own AI consents"
  on public.ai_consents for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.ai_consents from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_consents to service_role;

-- Records consent. Idempotent: if an open consent with the same version
-- exists it is kept; an open consent with an older version is closed first.
create or replace function public.grant_ai_consent(
  p_user_id uuid,
  p_version text,
  p_platform text default 'ios',
  p_user_agent text default null
)
returns table (consent_version text, granted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform text := case when p_platform in ('ios', 'web') then p_platform else 'ios' end;
  v_version text := left(coalesce(nullif(trim(p_version), ''), 'unknown'), 40);
begin
  update public.ai_consents c
  set withdrawn_at = now()
  where c.user_id = p_user_id
    and c.platform = v_platform
    and c.withdrawn_at is null
    and c.consent_version <> v_version;

  -- Two Allow taps at the same moment (a double tap, or a retry while the
  -- first request is still running) must not fail: the second insert meets
  -- the open row through the partial unique index and does nothing.
  insert into public.ai_consents (user_id, consent_version, platform, user_agent)
  values (p_user_id, v_version, v_platform, left(p_user_agent, 500))
  on conflict (user_id, platform) where withdrawn_at is null do nothing;

  return query
  select c.consent_version, c.granted_at
  from public.ai_consents c
  where c.user_id = p_user_id and c.platform = v_platform and c.withdrawn_at is null
  limit 1;
end;
$$;

-- Withdraws consent (Account > Privacy & data switch). Returns rows closed.
create or replace function public.withdraw_ai_consent(
  p_user_id uuid,
  p_platform text default 'ios'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.ai_consents c
  set withdrawn_at = now()
  where c.user_id = p_user_id
    and c.platform = case when p_platform in ('ios', 'web') then p_platform else 'ios' end
    and c.withdrawn_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- True when the user has an open consent for exactly this version.
create or replace function public.has_ai_consent(
  p_user_id uuid,
  p_version text,
  p_platform text default 'ios'
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ai_consents c
    where c.user_id = p_user_id
      and c.platform = case when p_platform in ('ios', 'web') then p_platform else 'ios' end
      and c.consent_version = p_version
      and c.withdrawn_at is null
  );
$$;

revoke all on function public.grant_ai_consent(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.withdraw_ai_consent(uuid, text) from public, anon, authenticated;
revoke all on function public.has_ai_consent(uuid, text, text) from public, anon, authenticated;
grant execute on function public.grant_ai_consent(uuid, text, text, text) to service_role;
grant execute on function public.withdraw_ai_consent(uuid, text) to service_role;
grant execute on function public.has_ai_consent(uuid, text, text) to service_role;

-- ─────────────────── 2. App-tier usage (iPhone app) ───────────────────
-- p_limit comes from constants in code (netlify/lib/app-tier.mjs) or the
-- disclosed review/admin allowance. It is clamped to 0..1000. plan is always
-- returned as 'app' so no plan name reaches the iPhone app. The user id is
-- always the verified caller's (the server passes it; never a request body).

create or replace function public.consume_analysis_app(
  p_user_id uuid,
  p_limit integer
)
returns table (allowed boolean, used integer, daily_limit integer, plan text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(0, least(coalesce(p_limit, 0), 1000));
  v_used integer;
begin
  insert into public.daily_usage (user_id, usage_date, analysis_count)
  values (p_user_id, (now() at time zone 'utc')::date, 0)
  on conflict (user_id, usage_date) do nothing;

  update public.daily_usage
  set analysis_count = analysis_count + 1, updated_at = now()
  where user_id = p_user_id
    and usage_date = (now() at time zone 'utc')::date
    and analysis_count < v_limit
  returning analysis_count into v_used;

  if v_used is null then
    select analysis_count into v_used
    from public.daily_usage
    where user_id = p_user_id and usage_date = (now() at time zone 'utc')::date;
    return query select false, coalesce(v_used, 0), v_limit, 'app'::text;
    return;
  end if;

  return query select true, v_used, v_limit, 'app'::text;
end;
$$;

create or replace function public.consume_recovery_case_app(
  p_user_id uuid,
  p_limit integer
)
returns table (allowed boolean, used integer, daily_limit integer, plan text, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(0, least(coalesce(p_limit, 0), 1000));
  v_used integer;
  v_window timestamptz := public.recovery_window_start();
begin
  insert into public.recovery_usage (user_id, window_start, cases_created, updates_used)
  values (p_user_id, v_window, 0, 0)
  on conflict (user_id, window_start) do nothing;

  update public.recovery_usage
  set cases_created = cases_created + 1, updated_at = now()
  where user_id = p_user_id and window_start = v_window and cases_created < v_limit
  returning cases_created into v_used;

  if v_used is null then
    select cases_created into v_used
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;
    return query select false, coalesce(v_used, 0), v_limit, 'app'::text, public.recovery_next_reset();
    return;
  end if;

  return query select true, v_used, v_limit, 'app'::text, public.recovery_next_reset();
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
  returning updates_used into v_used;

  if v_used is null then
    select updates_used into v_used
    from public.recovery_usage
    where user_id = p_user_id and window_start = v_window;
    return query select false, coalesce(v_used, 0), v_limit, 'app'::text, public.recovery_next_reset(), 0;
    return;
  end if;

  return query select true, v_used, v_limit, 'app'::text, public.recovery_next_reset(), 0;
end;
$$;

revoke all on function public.consume_analysis_app(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_recovery_case_app(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_recovery_update_app(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_analysis_app(uuid, integer) to service_role;
grant execute on function public.consume_recovery_case_app(uuid, integer) to service_role;
grant execute on function public.consume_recovery_update_app(uuid, integer, integer) to service_role;

commit;

-- ─────────────────────────── Verify ───────────────────────────
-- After running, this returns 7 rows (1 table + 6 functions):
--   select 'table' as kind, to_regclass('public.ai_consents')::text as name
--   union all
--   select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in
--     ('grant_ai_consent','withdraw_ai_consent','has_ai_consent',
--      'consume_analysis_app','consume_recovery_case_app','consume_recovery_update_app');
--
-- ─────────────────────────── Roll back ───────────────────────────
-- Only if the iPhone launch is abandoned (deletes all stored AI consents):
--   drop function if exists public.consume_recovery_update_app(uuid, integer, integer);
--   drop function if exists public.consume_recovery_case_app(uuid, integer);
--   drop function if exists public.consume_analysis_app(uuid, integer);
--   drop function if exists public.has_ai_consent(uuid, text, text);
--   drop function if exists public.withdraw_ai_consent(uuid, text);
--   drop function if exists public.grant_ai_consent(uuid, text, text, text);
--   drop table if exists public.ai_consents;
