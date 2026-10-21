# CyberNet AI: notes for Claude

This repository is public. Never put keys, tokens, passwords or customer data in it.

## Database (Supabase)

- How data is reached: the browser only uses `supabase.auth`. Every table read/write and RPC goes through a Netlify Function with the service-role key (`netlify/lib/supabase.mjs`). So `anon` and `authenticated` need no table or function grants.
- Supabase no longer grants Data API access to new objects in `public` automatically (new projects since 30 May 2026, existing projects from 30 Oct 2026). A table without explicit grants answers `42501 permission denied`, even for the service role.
- New schema changes go in `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Until a baseline migration exists, mirror the change in `supabase/schema.sql` too (it is the restore path in `docs/BACKUPS.md`).
- Never apply anything to the production database yourself. Write the SQL; the owner runs it.

### Rule: every migration that creates a table in `public`

In the same file, in this order: CREATE TABLE → ENABLE ROW LEVEL SECURITY → policies → explicit least-privilege GRANTs (no `anon` by default; `authenticated` only for a real browser need, with a policy).

```sql
create table if not exists public.example_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.example_items enable row level security;

-- Policies: only when the browser reads the table directly.
drop policy if exists "Users read their own example items" on public.example_items;
create policy "Users read their own example items"
  on public.example_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Grants: least privilege. No anon unless the data is truly public (say why).
revoke all on table public.example_items from public, anon, authenticated;
grant select, insert, update, delete on table public.example_items to service_role;
-- grant select on table public.example_items to authenticated;  -- only with the policy above
```

### Functions in `public`

```sql
create or replace function public.example_fn(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''          -- or: public, pg_temp; qualify every table as public.x
as $$
begin
  -- ...
end;
$$;

revoke all on function public.example_fn(uuid) from public, anon, authenticated;
grant execute on function public.example_fn(uuid) to service_role;
```

A quota or billing function must take the user id from the server (verified token), never from the request body, and must never be executable by `anon` or `authenticated`.

Check the live state any time with the read-only `supabase/audit/grants-rls-audit.sql`.
