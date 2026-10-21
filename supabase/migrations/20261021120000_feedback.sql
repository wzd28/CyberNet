-- Feedback from the site's feedback form (POST /api/feedback) and the admin
-- inbox (GET/PATCH /api/feedback-admin).
--
-- Only the server touches this table: netlify/functions/feedback.mjs inserts
-- with the service role after validating and rate-limiting the request, and
-- netlify/functions/feedback-admin.mjs reads and updates it for the emails in
-- ADMIN_EMAILS. Browsers (anon, authenticated) get no access at all.
--
-- Written for a database where new public tables are no longer exposed to the
-- Data API automatically (Supabase's change of 30 Oct 2026): row level
-- security, the policies and every grant are explicit here.
--
-- Safe to run more than once. Apply it in the Supabase SQL editor (see
-- docs/support-inbox.md, "Apply the feedback migration").

begin;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  category text not null default 'other',
  message text not null,
  page text,
  ui_version text,
  user_agent_summary text,
  status text not null default 'new',
  handled_at timestamptz,
  constraint feedback_category_check check (category in ('bug', 'feature', 'billing', 'other')),
  constraint feedback_status_check check (status in ('new', 'read', 'replied')),
  constraint feedback_message_length check (char_length(message) between 1 and 5000),
  constraint feedback_email_length check (email is null or char_length(email) between 3 and 254),
  constraint feedback_page_length check (page is null or char_length(page) <= 200),
  constraint feedback_ui_version_length check (ui_version is null or char_length(ui_version) <= 32),
  constraint feedback_ua_length check (user_agent_summary is null or char_length(user_agent_summary) <= 60)
);

comment on table public.feedback is
  'Feedback form submissions. Written and read only by Netlify functions with the service role.';
comment on column public.feedback.user_agent_summary is
  'Short browser name parsed on the server, e.g. "Chrome 141 on Windows". The full user agent is never stored.';

-- The admin list: newest first, optionally filtered by status.
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);
-- Keeps ON DELETE SET NULL cheap when an account is deleted.
create index if not exists feedback_user_idx on public.feedback (user_id) where user_id is not null;

-- Row level security: on, with no way in for browser roles.
alter table public.feedback enable row level security;

drop policy if exists feedback_service_role_all on public.feedback;
create policy feedback_service_role_all on public.feedback
  for all to service_role
  using (true) with check (true);

-- Restrictive: even if a grant is added to anon or authenticated by mistake
-- later, no row is visible or writable through the Data API.
drop policy if exists feedback_no_browser_access on public.feedback;
create policy feedback_no_browser_access on public.feedback
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- Least-privilege grants: the server only inserts, reads and updates.
revoke all on table public.feedback from public, anon, authenticated;
grant select, insert, update on table public.feedback to service_role;

commit;
