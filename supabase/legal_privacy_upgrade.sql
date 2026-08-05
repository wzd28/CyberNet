-- CyberNet final legal and privacy controls
-- Run once in Supabase Dashboard -> SQL Editor before deploying the final release.

create extension if not exists pgcrypto;

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  acceptance_type text not null check (acceptance_type in ('signup','checkout','reaccept')),
  terms_version text not null,
  privacy_version text not null,
  acceptable_use_version text not null,
  refund_version text not null,
  billing_cycle text check (billing_cycle is null or billing_cycle in ('monthly','yearly')),
  accepted_at timestamptz not null default now(),
  page_url text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_created_idx
  on public.legal_acceptances (user_id, created_at desc);

alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from anon, authenticated;
grant select on public.legal_acceptances to authenticated;

-- Users can view only their own acceptance history. Inserts are performed only
-- by the authenticated Netlify Function using the Supabase service-role key.
drop policy if exists "Users can read their own legal acceptances" on public.legal_acceptances;
create policy "Users can read their own legal acceptances"
  on public.legal_acceptances for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Allow users to delete their own saved AI history through the secure server
-- endpoint. Existing service-role access remains unchanged.
-- No direct browser DELETE grant is added; the Netlify Function performs it.
