-- Business seat guard in the database (security audit Nov 2026, DB-5 /
-- SRV-AUTH-7 / PAY-12).
--
-- Before: business-invite.mts counted members and pending invites, then
-- inserted in a separate request, so 20 invites sent at the same moment all
-- passed a 5-seat check. Now two BEFORE triggers take a per-team advisory
-- lock and count again inside the transaction:
--   * business_invites (insert, pending): active members + live pending
--     invites must stay under seat_tier ("Team is full"), and at most 30
--     invites a team per 24 hours ("Invite limit reached").
--   * business_members (becoming an active member): active members must stay
--     under seat_tier ("Team is full"). The owner's own row is never refused.
-- The functions' answers match what the code already says, and the code
-- maps them to the same 409 / 429 answers (business-invite.mts,
-- business-invite-accept.mts). Existing members are never removed; a team
-- that is over its seats after a downgrade only stops adding people.
--
-- SECURITY DEFINER with an empty search_path and qualified names; executable
-- by nobody directly (triggers do not need EXECUTE).
-- Idempotent. NOT applied: the owner runs it in the Supabase SQL Editor (as
-- postgres). Mirrored in supabase/schema.sql.
--
-- Optional, later: a partial unique index on pending invite emails. Only
-- after this read-only check returns no rows:
--   select business_account_id, lower(email), count(*) from public.business_invites
--   where status = 'pending' group by 1, 2 having count(*) > 1;
-- then:
--   create unique index if not exists business_invites_one_pending_email
--     on public.business_invites (business_account_id, lower(email)) where status = 'pending';
--
-- Undo:
--   drop trigger if exists business_invites_seat_guard on public.business_invites;
--   drop trigger if exists business_members_seat_guard on public.business_members;
--   drop function if exists public.business_invite_seat_guard();
--   drop function if exists public.business_member_seat_guard();

begin;

create or replace function public.business_invite_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seats integer;
  v_taken integer;
  v_recent integer;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cn_team_seats:' || new.business_account_id::text, 0));

  select a.seat_tier into v_seats
  from public.business_accounts a
  where a.id = new.business_account_id;
  v_seats := coalesce(v_seats, 5);

  select
    (select count(*) from public.business_members m
      where m.business_account_id = new.business_account_id and m.status = 'active')
    + (select count(*) from public.business_invites i
      where i.business_account_id = new.business_account_id and i.status = 'pending' and i.expires_at > now())
  into v_taken;
  if v_taken >= v_seats then
    raise exception 'Team is full (% of % seats)', v_taken, v_seats using errcode = 'P0001';
  end if;

  select count(*) into v_recent
  from public.business_invites i
  where i.business_account_id = new.business_account_id and i.created_at > now() - interval '24 hours';
  if v_recent >= 30 then
    raise exception 'Invite limit reached for today' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.business_member_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seats integer;
  v_active integer;
begin
  if new.status is distinct from 'active' or new.role = 'owner' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cn_team_seats:' || new.business_account_id::text, 0));

  select a.seat_tier into v_seats
  from public.business_accounts a
  where a.id = new.business_account_id;
  v_seats := coalesce(v_seats, 5);

  select count(*) into v_active
  from public.business_members m
  where m.business_account_id = new.business_account_id and m.status = 'active' and m.id <> new.id;
  if v_active >= v_seats then
    raise exception 'Team is full (% of % seats)', v_active, v_seats using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.business_invite_seat_guard() from public, anon, authenticated, service_role;
revoke all on function public.business_member_seat_guard() from public, anon, authenticated, service_role;

drop trigger if exists business_invites_seat_guard on public.business_invites;
create trigger business_invites_seat_guard
  before insert on public.business_invites
  for each row execute function public.business_invite_seat_guard();

drop trigger if exists business_members_seat_guard on public.business_members;
create trigger business_members_seat_guard
  before insert or update of status on public.business_members
  for each row execute function public.business_member_seat_guard();

commit;
