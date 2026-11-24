-- supabase/migrations/20261124120000_security_iap_sandbox_allowlist.sql
-- Security audit Nov 2026, SRV-AUTH-3 / PAY-6: Sandbox (TestFlight / sandbox
-- tester) Apple purchases no longer give real Pro, except to accounts on a
-- short allow-list (the App Review demo account and the owner's test accounts).
--
-- WHO RUNS IT: the owner, in the Supabase SQL Editor, AFTER
-- 20261121120000_apple_iap_pro.sql and BEFORE the first in-app purchase build
-- ships. Claude never runs it. It ships with the paywall; until then nothing
-- calls entitlement_of with Apple rows.
-- SAFE TO RE-RUN: idempotent (create table if not exists, create or replace).
--
-- What it does
--   1. public.iap_sandbox_allowlist   user ids whose Sandbox purchases count
--                                     (service_role only; no browser access)
--   2. entitlement_of(uuid)           the 1.1 body with ONE change: an Apple
--                                     row only entitles when it is Production,
--                                     or Sandbox for an allow-listed account.
--                                     Sandbox rows are still recorded and still
--                                     shown (apple_environment), so the app can
--                                     say "test purchase".
-- Production purchases, Stripe plans and teams are unchanged.
--
-- AFTER RUNNING: add the App Review demo account (and any owner test account)
-- by id, e.g.
--   insert into public.iap_sandbox_allowlist (user_id, note)
--   select id, 'App Review demo' from auth.users where email = '<review address>'
--   on conflict (user_id) do nothing;
--
-- UNDO (only if something breaks): run the entitlement_of definition from
-- supabase/migrations/20261121120000_apple_iap_pro.sql section 3 again (it
-- replaces this one), then:
--   drop table if exists public.iap_sandbox_allowlist;

begin;

-- ───────────── 1. iap_sandbox_allowlist ─────────────
create table if not exists public.iap_sandbox_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

comment on table public.iap_sandbox_allowlist is
  'Accounts whose Sandbox (TestFlight / sandbox tester) Apple purchases give Pro: the App Review demo account and the owner''s test accounts. Everyone else''s Sandbox purchases are recorded but not entitled. Service role only.';

alter table public.iap_sandbox_allowlist enable row level security;
-- No policies: the browser never reads this table.
revoke all on table public.iap_sandbox_allowlist from public, anon, authenticated;
grant select, insert, update, delete on table public.iap_sandbox_allowlist to service_role;

-- ───────────── 2. entitlement_of: Sandbox only for the allow-list ─────────────
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
  v_sandbox_ok boolean := false;
begin
  select p.plan, p.subscription_status into v_plan, v_status
  from public.profiles p where p.id = p_user_id;

  if v_plan = 'business' and v_status in ('active', 'trialing') then
    v_stripe := 'business';
  elsif v_plan = 'pro' and v_status in ('active', 'trialing') then
    v_stripe := 'pro';
  end if;

  -- SRV-AUTH-3 / PAY-6: Sandbox rows count only for allow-listed accounts.
  v_sandbox_ok := exists (select 1 from public.iap_sandbox_allowlist w where w.user_id = p_user_id);

  select a.* into r
  from public.apple_subscriptions a
  where a.user_id = p_user_id
  order by (a.revoked_at is null
            and (a.environment = 'Production' or v_sandbox_ok)
            and (a.expires_at > now() or coalesce(a.grace_expires_at, '-infinity'::timestamptz) > now())) desc,
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
    and (r.environment = 'Production' or v_sandbox_ok)
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

commit;
