# Database backups

CyberNet AI runs on the Supabase free plan, which makes no backups of its own. This page covers the free weekly backup that is built into the site: how it works, how to set it up, how to open a backup, and how to restore one into a new Supabase project.

## In short

- Every Sunday at 00:00 UTC (04:00 in the UAE), the Netlify function `backup-weekly` copies every database table and the list of sign-in accounts. Passwords are never included.
- It packs everything into one file, locks it with your backup passphrase, and emails it to support@cybernetai.app, which forwards to your Gmail.
- Without the passphrase it does nothing, so no unlocked data ever leaves the site.
- To open a backup: `node scripts/decrypt-backup.mjs <file>`. To restore one, follow "Restore into a new Supabase project" below.

## What is in a backup, and what is not

In the backup:

- Every table in the database's `public` schema: profiles and plans, usage counters, scan history, Recovery cases, their versions and tasks, Business teams, members and invites, legal acceptances and the checkout error log.
- Every sign-in account: id, email, phone, when it was created, confirmed and last used, whether it is banned, its metadata, and which sign-in methods it used (email, Google).

Not in the backup:

- **Passwords.** Password hashes and sign-in tokens are never copied. After a restore, people who used a password choose a new one with "Forgot password". People who use Google sign in as usual.
- **The database structure** (tables, functions, security rules). That lives in `supabase/schema.sql` in this repository, plus the extra SQL in "Step 3" below.
- **Supabase settings**: email templates, sign-in providers, redirect addresses, SMTP. Step 6 of the restore lists them.
- **Stored files.** The project has no Supabase Storage files today.
- **Rate-limit counters** (`api_rate_limits`). They only count recent requests, so a restore does not need them: the counters start again from zero. The table can also grow faster than the weekly job could read it. The daily `rate-limit-cleanup` function deletes rows that have not been used for 90 days, as the Privacy Policy says.

## One-time setup

1. **Choose a backup passphrase.** Use five or six random words (at least 16 characters). Save it in your password manager as "CyberNet backup passphrase", with today's date. If it is lost, no one can open the backups, including Supabase, Netlify or Claude.
2. **Add it to Netlify.** In Netlify, open the cybernetai project, then Project configuration, then Environment variables, then Add a variable:
   - Key: `BACKUP_PASSPHRASE`
   - Value: the passphrase
   - Scopes: Functions must be included. Deploy contexts: **Production** only, so test builds cannot make backups. If Netlify offers "Contains secret values", tick it.
3. **Optional: a manual trigger token.** The simplest way to make a backup right away is the "Run now" button (step 5). If you also want to start one from a terminal, add `BACKUP_TRIGGER_TOKEN` the same way (Functions scope, Production only). It must be at least 32 characters. To make one, run this in a terminal and copy the output:

   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

   Without this variable, `/api/backup-now` answers "not found" to everyone.
4. **Deploy.** Netlify functions only see new environment variables after the next deploy.
5. **Make the first backup now** instead of waiting for Sunday. In Netlify, open the project's Functions page (under Logs), choose `backup-weekly` (it shows a "Scheduled" badge), and press **Run now**. Or, with the token from step 3, in PowerShell:

   ```
   Invoke-RestMethod -Method Post -Uri https://cybernetai.app/api/backup-now -Headers @{ "x-backup-token" = "<your token>" }
   ```

   The answer lists the row counts, never the data.
6. **Check that it opens.** Within a minute an email titled "CyberNet AI weekly backup <date>" arrives. Save the attachment and follow "Open a backup" below once, to prove the passphrase works. Then delete the opened `.json` file.
7. **Keep each backup for 8 weeks, then delete it.** The Privacy Policy tells users that backups are kept for 8 weeks and then deleted, so that data someone deleted is gone from the backups too. In Gmail, create a filter for the subject "CyberNet AI weekly backup", give it a label such as "Backups", and tick "Never send it to Spam". Then add a monthly reminder to your calendar ("Delete old CyberNet backups"). Each month:
   1. In Gmail's search box, paste `subject:"CyberNet AI weekly backup" older_than:56d` and press Enter. (56 days is 8 weeks.) This finds the backups and the FAILED notices that are more than 8 weeks old.
   2. Tick the box above the list to select them all (and "Select all conversations that match this search" if Gmail offers it), then press Delete.
   3. Open Trash, select the same emails and choose "Delete forever". Gmail would empty Trash by itself after 30 days, which is too long for the promise above.
   4. If you ever saved a backup file or an opened `.json` to your computer, delete those the same way once they are 8 weeks old.

   Keep at least the newest backup, so there is always one to restore from. If you would like to keep older copies (for example one per month for a year), that is a change to the Privacy Policy first: ask for the wording to be updated before you start keeping them.

Optional: `BACKUP_EMAIL_TO` sends the backups to another address instead of support@cybernetai.app.

## Every week

- On Sunday an email arrives titled "CyberNet AI weekly backup <date>". A glance at the row counts is enough. If it has a yellow "Please note" box, read it: it says when a new table appeared, when the backup is getting large, or when the passphrase is short.
- If an email titled "CyberNet AI weekly backup FAILED <date>" arrives, it says what happened and what to do next. No data was sent with it. The same failure also appears in the site's error alerts (a separate "server error in backup-weekly" email) and in the Netlify function log.
- If nothing arrives by Sunday midday (UAE time), check these in order:
  1. Netlify, Functions, `backup-weekly`: is there a run, and what does its log say? A line "CyberNet backup skipped: BACKUP_PASSPHRASE is not set" means the variable is missing or was not deployed.
  2. Resend, Emails: was the email sent, and was it delivered?
  3. Gmail's Spam folder.

## Run a backup now

Use this after fixing a failed backup, or before a risky change to the database.

- In Netlify, open the project's Functions page (under Logs), choose `backup-weekly`, and press **Run now**.
- Or, if `BACKUP_TRIGGER_TOKEN` is set, in PowerShell:

  ```
  Invoke-RestMethod -Method Post -Uri https://cybernetai.app/api/backup-now -Headers @{ "x-backup-token" = "<your token>" }
  ```

The email arrives within a minute. A backup started with the token has "(manual run)" after the date in its subject; one started with Run now looks like the weekly one.

## Open a backup

You need Node.js 18 or newer and this repository (only the file `scripts/decrypt-backup.mjs` is needed; it uses no packages).

1. Save the attachment somewhere **outside** the project folder, for example Downloads. The repository is public on GitHub: never put a backup or an opened backup inside it.
2. Open a terminal in the project folder and run:

   ```
   node scripts/decrypt-backup.mjs C:\Users\<you>\Downloads\cybernet-backup-2026-10-18-0000utc.cnbk
   ```

3. Type the passphrase when asked. Nothing shows while you type; press Enter at the end.
4. A `.json` file with the same name appears next to the backup, and the script lists the row counts. Add `--sql` to also get the `.restore.sql` file used in a restore.

The opened files hold personal data without any lock. Keep them private and delete them when you are done.

What the messages mean:

| Message | What to do |
| --- | --- |
| "That passphrase does not open this backup" | Check the passphrase (capital letters matter). If you changed it at some point, older backups need the old one. If it still fails, save the attachment again or try an earlier week. |
| "This file is not a CyberNet AI backup" | You picked a different file. Backups end in `.cnbk`. |
| "... already exists" | An opened copy is already there. Move it away, or add `--force` to replace it. |
| "uses format version N, which this script does not know" | Update the project (`git pull`) and try again. |

## Restore into a new Supabase project

Use this when the Supabase project is lost, deleted or badly damaged. Plan about an hour. Work from the newest backup that opens.

**Step 1. Open the backup with the restore file.**

```
node scripts/decrypt-backup.mjs <file.cnbk> --sql
```

This writes `<file>.json` and `<file>.restore.sql`.

**Step 2. Create the new project.** In Supabase, create a new project (the free plan is fine) in the same region as before. From Project Settings, then API Keys, note its address (`https://<ref>.supabase.co`), its publishable key and its secret (service role) key.

**Step 3. Create the tables and functions.** In the new project's SQL Editor:

1. Paste the whole of `supabase/schema.sql` and run it. Use the version of the file from the date of the backup if the structure changed since then (`git log supabase/schema.sql` shows the history).
2. Only if that copy of `schema.sql` is older than 19 Oct 2026: also run the SQL in the appendix "Objects that older copies of schema.sql do not have" at the end of this page. It adds two tables and two functions that were created directly in the live database; `schema.sql` has them since 19 Oct 2026. Without them, rate limiting and error alerts stop working.

**Step 4. Recreate the sign-in accounts**, keeping their ids so every row still points at the right person. In PowerShell, in the project folder:

```
$env:RESTORE_SUPABASE_URL = "https://<new-ref>.supabase.co"
$env:RESTORE_SERVICE_ROLE_KEY = "<new project's secret key>"
node scripts/decrypt-backup.mjs --restore-auth <file>.json --dry-run
node scripts/decrypt-backup.mjs --restore-auth <file>.json
```

The dry run only lists what would happen. The real run prints how many accounts were created. If some fail, fix the cause it shows and run the same command again: accounts already created are not created twice. The script refuses to write into the project the backup came from; for the rare case of putting accounts back into the same project, add `--into-source-project`.

Creating the accounts also creates an empty profile for each one (the `on_auth_user_created` trigger). Step 5 fills those profiles with the saved plans and details.

**Step 5. Load the tables.** Open `<file>.restore.sql`, paste it into the new project's SQL Editor and run it. If the file is too large for the editor, run it with psql and the new project's connection string (Project Settings, then Database): `psql "<connection string>" -f <file>.restore.sql`.

The file:

- loads the tables in this order, so every row comes after the rows it points to: profiles, business_accounts, business_members, business_invites, business_daily_usage, business_recovery_usage, daily_usage, quickscan_usage, recovery_usage, legal_acceptances, scan_history, recovery_cases, recovery_versions, recovery_tasks, checkout_debug_log, then any newer tables;
- runs as one transaction: if anything fails, nothing is changed, and you can fix the problem and run it again;
- adds rows and sets rows with the same key back to the saved values, and never deletes anything;
- moves the numbering of `scan_history`, `recovery_versions`, `recovery_tasks` and `checkout_debug_log` past the restored rows;
- ends with a check that shows, for each table, the rows now in the database next to the rows in the backup. The two columns should match.

**Step 6. Redo the Supabase settings** in the new project:

- Authentication, URL configuration: Site URL `https://cybernetai.app`, and the redirect URLs `https://cybernetai.app/**` plus the preview address.
- Authentication, email templates: the Confirm signup template in `supabase/email-template-confirm-signup.html` and the branded Reset password template.
- Authentication, SMTP: the Resend sender for cybernetai.app.
- Authentication, providers: Google, with the client ID and secret from Google Cloud Console. In Google Cloud Console, add the new callback address `https://<new-ref>.supabase.co/auth/v1/callback`.
- Authentication, password settings: minimum length 8 or more.

**Step 7. Point the site at the new project**, then deploy once:

- `public/config.js`: the new `SUPABASE_URL` and publishable key.
- `netlify.toml`: in the Content-Security-Policy, replace the old Supabase address in `connect-src` with the new one.
- Netlify environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`), and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) for the new project.

Stripe needs no change: the customer and subscription ids are restored in `profiles`, and the webhook address stays the same.

**Step 8. Afterwards.** Sign in with a test account to check plans, history and Recovery cases. Tell people who used a password to choose a new one with "Forgot password"; Google users sign in as usual. Delete the `.json` and `.restore.sql` files. The next weekly backup comes from the new project automatically.

## When the backup gets too big

Two limits matter, and the weekly email warns when a backup reaches half of either:

- **Time.** Netlify stops scheduled functions after 30 seconds, so the backup keeps to 25. Today it takes a few seconds.
- **Size.** Cloudflare Email Routing, which forwards support@cybernetai.app, rejects emails over 25 MiB, and an attachment grows by a third inside an email. So the backup file is capped at 15 MB. Today's database is far smaller: about 1.4 MB on disk including its indexes, and the backup file is compressed.

If a backup goes over a limit, no backup is sent; a "FAILED" email explains why. The options, simplest first:

1. **Supabase Pro** (US$25 a month): Supabase makes daily backups itself and keeps them for 7 days. It also turns on leaked-password protection.
2. **A weekly dump on your own computer**: `supabase db dump` run by Windows Task Scheduler, encrypted with 7-Zip, as described in the launch checklist (item 9, option B).

## Keeping the table list current

The tables are listed in `TABLES` at the top of `netlify/lib/backup.mjs`, in restore order. Tables in `EXCLUDED_TABLES` just below it (today only `api_rate_limits`) are left out on purpose. A new table is still backed up automatically, and the weekly email names it in the "Please note" box until it is added to the list. To add it:

1. Run the read-only query in the comment above `TABLES` in the Supabase SQL Editor.
2. Add the table with its primary key (and `identity` if its id is a generated number), after every table it references.
3. Update `SCHEMA_VERSION` to the newest migration name.
4. Run `node tests/run-backup.mjs` and deploy.

## Changing the passphrase

Set the new passphrase in Netlify and deploy. Keep the old one in your password manager, labelled with the dates it was used: backups made before the change still need it.

## How the file is protected

- The data is compressed (gzip) and then encrypted with AES-256-GCM, which also detects any change to the file.
- The key is made from the passphrase with PBKDF2-SHA256 and 600,000 rounds, using a new random salt and a new random IV for every backup. Spaces at the start and end of the passphrase are ignored.
- File layout: `CNBK` (4 bytes), format version `1` (1 byte), salt (16 bytes), IV (12 bytes), the encrypted data, and the 16-byte authentication tag. The first 33 bytes are also checked by the tag.
- The function log and the email carry row counts only, never data. The manual trigger only ever sends the backup to the fixed backup address. To switch the trigger off, delete `BACKUP_TRIGGER_TOKEN` in Netlify and deploy.

## For developers

- Code: `netlify/lib/backup.mjs` (export, encryption, email), `netlify/functions/backup-weekly.mts` (the schedule, `@weekly`), `netlify/functions/backup-now.mts` (the token trigger, `POST /api/backup-now`), `scripts/decrypt-backup.mjs` (open, restore SQL, restore accounts).
- Tests: `node tests/run-backup.mjs`. Everything is stubbed: no network, no keys, no accounts.
- Data is read through the Supabase REST API (`/rest/v1/<table>`, paged with `Range` headers in primary-key order) and the Auth admin API (`/auth/v1/admin/users`), with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`). Only GET requests are made to Supabase.
- Failures are also passed to `reportError` (`netlify/lib/report-error.mjs`).

## Appendix: objects that older copies of schema.sql do not have

These were created directly in the live database (checked on 18 Oct 2026). Since 19 Oct 2026 they are also at the end of `supabase/schema.sql`, so this is only needed with an older copy of that file: run it in the new project after `schema.sql` and before Step 4. It is safe to run more than once.

```sql
-- Rate-limit counters, used by consume_api_quota.
create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  constraint api_rate_limits_key_length check (char_length(rate_key) between 1 and 200),
  constraint api_rate_limits_request_count_check check (request_count >= 0)
);
create index if not exists api_rate_limits_updated_idx on public.api_rate_limits (updated_at);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;

-- Checkout error log, written by create-checkout-session.
create table if not exists public.checkout_debug_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  lookup_key text,
  cycle text,
  target_plan text,
  error_type text,
  error_code text,
  error_message text,
  error_raw text
);
alter table public.checkout_debug_log enable row level security;
revoke all on public.checkout_debug_log from anon, authenticated;

create or replace function public.consume_api_quota(p_key text, p_window_seconds integer, p_max_requests integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_started timestamptz;
  v_reset timestamptz;
begin
  if p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'invalid quota key';
  end if;
  if p_window_seconds not between 60 and 2592000 then
    raise exception 'invalid quota window';
  end if;
  if p_max_requests not between 1 and 10000 then
    raise exception 'invalid quota limit';
  end if;

  loop
    update public.api_rate_limits
       set request_count = case
             when v_now >= window_started_at + make_interval(secs => p_window_seconds) then 1
             else request_count + 1
           end,
           window_started_at = case
             when v_now >= window_started_at + make_interval(secs => p_window_seconds) then v_now
             else window_started_at
           end,
           updated_at = v_now
     where rate_key = p_key
       and (
         v_now >= window_started_at + make_interval(secs => p_window_seconds)
         or request_count < p_max_requests
       )
     returning request_count, window_started_at
          into v_count, v_started;

    if found then
      v_reset := v_started + make_interval(secs => p_window_seconds);
      return jsonb_build_object(
        'allowed', true,
        'used', v_count,
        'limit', p_max_requests,
        'remaining', greatest(0, p_max_requests - v_count),
        'reset_at', v_reset
      );
    end if;

    select request_count, window_started_at
      into v_count, v_started
      from public.api_rate_limits
     where rate_key = p_key;

    if found then
      v_reset := v_started + make_interval(secs => p_window_seconds);
      return jsonb_build_object(
        'allowed', false,
        'used', v_count,
        'limit', p_max_requests,
        'remaining', 0,
        'reset_at', v_reset
      );
    end if;

    begin
      insert into public.api_rate_limits (rate_key, window_started_at, request_count, updated_at)
      values (p_key, v_now, 1, v_now);
      return jsonb_build_object(
        'allowed', true,
        'used', 1,
        'limit', p_max_requests,
        'remaining', greatest(0, p_max_requests - 1),
        'reset_at', v_now + make_interval(secs => p_window_seconds)
      );
    exception when unique_violation then
      -- Another request inserted the bucket first; retry under the row lock.
    end;
  end loop;
end;
$function$;

create or replace function public.check_protect_rate_limit(p_key text, p_window_seconds integer, p_max_requests integer)
returns boolean
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((public.consume_api_quota(p_key, p_window_seconds, p_max_requests)->>'allowed')::boolean, false);
$function$;

-- Only the server (service role) may call them, as in the live database.
revoke execute on function public.consume_api_quota(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.check_protect_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_quota(text, integer, integer) to service_role;
grant execute on function public.check_protect_rate_limit(text, integer, integer) to service_role;
```

They are the same as the last section of `supabase/schema.sql`. If one of them changes, change both.
