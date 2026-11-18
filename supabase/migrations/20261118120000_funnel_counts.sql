-- Funnel counts for the website (POST /api/funnel, netlify/functions/funnel.mjs).
--
-- One row per day, step and traffic source with a running total. That is all:
-- no IP address, no user id, no cookie, no browser detail is ever stored. The
-- website sends a step at most once per browser session (sessionStorage), so
-- the counts read as "sessions that reached this step".
--
-- Steps (the function rejects anything else): land, scan_guest, scan_account,
-- signup_open, signup_submit, signup_confirmed, ai_open, checkout_open.
-- Source: a short label from the visitor's first arrival (utm_source, or
-- tiktok / meta / google from the click id, else direct / referral).
--
-- Only the server touches this table: the function calls public.funnel_bump
-- with the service role. Browsers (anon, authenticated) get no access at all.
--
-- Safe to run more than once. Apply it in the Supabase SQL editor.
--
-- Reading the numbers (SQL editor):
--   select day, event, source, count from public.funnel_daily
--   where day >= current_date - 7 order by day desc, event, count desc;

begin;

create table if not exists public.funnel_daily (
  day date not null,
  event text not null,
  source text not null,
  count integer not null default 0,
  primary key (day, event, source),
  constraint funnel_daily_event_check check (event in ('land', 'scan_guest', 'scan_account', 'signup_open', 'signup_submit', 'signup_confirmed', 'ai_open', 'checkout_open')),
  constraint funnel_daily_source_check check (source ~ '^[a-z0-9_-]{1,40}$'),
  constraint funnel_daily_count_check check (count >= 0)
);

comment on table public.funnel_daily is
  'Anonymous daily totals of website steps (visit, check, sign-up). Written only by netlify/functions/funnel.mjs through public.funnel_bump. No personal data.';

-- Row level security: on, with no way in for browser roles.
alter table public.funnel_daily enable row level security;

drop policy if exists funnel_daily_service_role_all on public.funnel_daily;
create policy funnel_daily_service_role_all on public.funnel_daily
  for all to service_role
  using (true) with check (true);

-- Grants: least privilege. Nothing for anon or authenticated.
revoke all on table public.funnel_daily from public, anon, authenticated;
grant select, insert, update, delete on table public.funnel_daily to service_role;

-- Adds 1 to today's (UTC) total for one step and source. Invalid input raises,
-- so nothing outside the list above can ever be stored.
create or replace function public.funnel_bump(p_event text, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event is null or p_event not in ('land', 'scan_guest', 'scan_account', 'signup_open', 'signup_submit', 'signup_confirmed', 'ai_open', 'checkout_open') then
    raise exception 'funnel_bump: unknown event';
  end if;
  if p_source is null or p_source !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'funnel_bump: invalid source';
  end if;
  insert into public.funnel_daily (day, event, source, count)
  values ((now() at time zone 'utc')::date, p_event, p_source, 1)
  on conflict (day, event, source) do update set count = public.funnel_daily.count + 1;
end;
$$;

revoke all on function public.funnel_bump(text, text) from public, anon, authenticated;
grant execute on function public.funnel_bump(text, text) to service_role;

commit;
