-- Security audit Nov 2026: sign-up name limits (DB-9) and pg_temp last in
-- the search_path of the older SECURITY DEFINER functions (DB-8 /
-- SRV-AUTH-19).
--
-- DB-9: profiles.full_name is copied from sign-up metadata the caller
-- chooses (supabase.auth.signUp options.data), with no limit. handle_new_user
-- now removes control characters and keeps at most 100 characters. Same
-- SECURITY DEFINER trigger function, same ON CONFLICT, same grants
-- (supabase_auth_admin keeps EXECUTE: the live ACL is postgres, service_role,
-- supabase_auth_admin).
--
-- DB-8: with "search_path = public" Postgres searches pg_temp first for
-- tables; listing it last closes that (defence in depth: none of these is
-- executable by anon or authenticated). Bodies and grants are unchanged.
--
-- Optional, only after the owner's read-only check shows the longest
-- existing name is 200 characters or less:
--   select max(char_length(full_name)) from public.profiles;
--   alter table public.profiles add constraint profiles_full_name_len
--     check (char_length(full_name) <= 200) not valid;
--
-- Idempotent. NOT applied: the owner runs it in the Supabase SQL Editor (as
-- postgres). Mirrored in supabase/schema.sql.
--
-- Undo:
--   run the previous handle_new_user below (remove the leading "-- "),
--   then the same revoke and grant lines as in this file:
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   insert into public.profiles (
--     id,
--     full_name,
--     plan,
--     subscription_status
--   )
--   values (
--     new.id,
--     coalesce(
--       nullif(
--         trim(
--           concat_ws(
--             ' ',
--             new.raw_user_meta_data ->> 'first_name',
--             new.raw_user_meta_data ->> 'last_name'
--           )
--         ),
--         ''
--       ),
--       nullif(new.raw_user_meta_data ->> 'full_name', ''),
--       split_part(coalesce(new.email, 'User'), '@', 1)
--     ),
--     'free',
--     'inactive'
--   )
--   on conflict (id) do update
--   set
--     full_name = excluded.full_name,
--     updated_at = now();
--
--   return new;
-- end;
-- $$;
--   and set the search_path back:
--   alter function public.consume_analysis(uuid) set search_path = public;
--   alter function public.consume_analysis_business(uuid) set search_path = public;
--   alter function public.consume_quickscan(uuid) set search_path = public;
--   alter function public.consume_recovery_case(uuid) set search_path = public;
--   alter function public.consume_recovery_case_business(uuid) set search_path = public;
--   alter function public.consume_recovery_update(uuid) set search_path = public;
--   alter function public.consume_recovery_update_business(uuid) set search_path = public;
--   alter function public.refund_analysis(uuid) set search_path = public;
--   alter function public.refund_analysis_business(uuid) set search_path = public;
--   alter function public.get_platform_stats() set search_path = public;

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    plan,
    subscription_status
  )
  values (
    new.id,
    -- DB-9: the name comes from sign-up metadata the caller chooses, so
    -- control characters are removed and it is cut to 100 characters.
    left(regexp_replace(
      coalesce(
        nullif(
          trim(
            concat_ws(
              ' ',
              left(new.raw_user_meta_data ->> 'first_name', 200),
              left(new.raw_user_meta_data ->> 'last_name', 200)
            )
          ),
          ''
        ),
        nullif(left(new.raw_user_meta_data ->> 'full_name', 400), ''),
        split_part(coalesce(new.email, 'User'), '@', 1)
      ),
      '[[:cntrl:]]', '', 'g'
    ), 100),
    'free',
    'inactive'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

alter function public.consume_analysis(uuid) set search_path = public, pg_temp;
alter function public.consume_analysis_business(uuid) set search_path = public, pg_temp;
alter function public.consume_quickscan(uuid) set search_path = public, pg_temp;
alter function public.consume_recovery_case(uuid) set search_path = public, pg_temp;
alter function public.consume_recovery_case_business(uuid) set search_path = public, pg_temp;
alter function public.consume_recovery_update(uuid) set search_path = public, pg_temp;
alter function public.consume_recovery_update_business(uuid) set search_path = public, pg_temp;
alter function public.refund_analysis(uuid) set search_path = public, pg_temp;
alter function public.refund_analysis_business(uuid) set search_path = public, pg_temp;
alter function public.get_platform_stats() set search_path = public, pg_temp;

commit;
