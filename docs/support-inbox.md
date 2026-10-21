# Support inbox and feedback

Written 21 Oct 2026. Covers where mail to support@cybernetai.app goes, how to
check it, the options for a real inbox, and the new feedback table.

## The short answer

**support@cybernetai.app already reaches your Gmail.** This was checked on
13 Oct 2026:

- DNS for cybernetai.app is on Cloudflare, and Cloudflare Email Routing is on.
- The rules for `support@` and `walidzd@` forward to your Gmail: the Gmail
  account you use to log in to Cloudflare. The catch-all is off.
- Resend sent a test to both addresses, and both were delivered.

If you "can't see" support mail, it is almost always in one of these places:

1. a Gmail tab (Updates or Promotions) or the Spam folder;
2. a **different Gmail account** from the one you usually read (the routing
   destination is the Cloudflare-login Gmail);
3. nowhere, because you sent the test from that same Gmail. Gmail hides a
   message you sent to yourself through a forward. It only shows it in Sent.

Feedback is a separate problem. **Until this change, the feedback form never
emailed anyone.** It posted to Netlify Forms, so any submissions are only in the
Netlify dashboard (see "Old feedback in Netlify Forms" below). From now on,
every submission is saved in the database. You read it at **Account > Feedback
inbox**, and you also get an email.

## The 2-minute test

1. From an account that is **not** the destination Gmail (a work address, an
   Outlook or iCloud address, or a friend's phone), send an email to
   `support@cybernetai.app` with the subject `support test 1`.
2. In the destination Gmail, search `in:anywhere to:support@cybernetai.app`.
   Error alerts and backups come from Resend, so also search
   `in:anywhere from:notifications@cybernetai.app`.
3. If nothing arrives within 2 minutes, open the Cloudflare dashboard >
   cybernetai.app > **Email** > **Email Routing**:
   - **Routing rules**: confirm `support@` > your Gmail, with status *Active*.
     The destination shown there is the inbox that gets the mail.
   - **Destination addresses**: confirm the Gmail is *Verified*.
   - **Activity log**: find `support test 1`. The status is *Forwarded*,
     *Dropped* or *Rejected*, with a reason.
4. Make it impossible to miss. In Gmail, go to Settings > Filters > Create a
   filter and use
   `to:(support@cybernetai.app OR walidzd@cybernetai.app OR team@cybernetai.app OR notifications@cybernetai.app)`.
   Then tick *Never send it to Spam*, *Always mark it as important*, *Apply the
   label* "CyberNet", and *Categorize as: Primary*.

## Where the support address is used

| Where | What | Notes |
|---|---|---|
| `public/index.html` | 6 "Support and feedback" boxes (mailto link and a "Send feedback" button), meta/structured data | The button opens the feedback form |
| Legal pages | `terms.html`, `privacy.html`, `refunds.html`, `acceptable-use.html`, and the Legal Center copy in `cybernet-legal-upgrade.js` | Contact address |
| Browser JS | `script.js` (`SUPPORT_EMAIL`), `cybernet-privacy-controls.js`, `cybernet-business-team.js` | Shown in error messages |
| Supabase email templates | `supabase/email-template-confirm-signup.html`, `email-template-recovery.html` | Footer contact |
| Functions (text only) | `privacy-data.mts`, `create-checkout-session.mjs`, `business-invite.mts` | "Email support@..." in error messages |
| **Error alerts** | `netlify/lib/report-error.mjs`: from `notifications@`, **to `support@`** | `ERROR_ALERT_EMAIL` overrides the recipient. `ERROR_ALERTS=off` stops the emails |
| **Weekly backup** | `netlify/lib/backup.mjs`: from `notifications@`, **to `support@`** | Encrypted attachment |
| **Feedback emails** (new) | `netlify/lib/feedback.mjs`: from `notifications@`, **to `support@`**, reply-to = the visitor's email | `FEEDBACK_ALERT_EMAIL` overrides the recipient |
| Business invites | `business-invite.mts`: from `team@` | Now has reply-to `support@` |
| Recovery check-ins | `recovery-checkin.mjs`: from `notifications@` | Now has reply-to `support@` |

`team@` and `notifications@` have **no routing rule**, and the catch-all is off.
Before this change, a user who replied to an invite or a check-in got a bounce.
Now those emails carry `Reply-To: support@cybernetai.app`. You can also add
routing rules for `team@` and `notifications@` to your Gmail in Email Routing >
Routing rules > Create address.

Environment variables involved: `RESEND_API_KEY`, `ADMIN_EMAILS` (who can open
the feedback inbox), `ERROR_ALERT_EMAIL` and `FEEDBACK_ALERT_EMAIL` (optional
recipient overrides), and `ERROR_ALERTS`.

## The options

| | (a) Cloudflare forwarding + Gmail "Send mail as" via Resend | (b) Resend receiving | (c) Real mailbox (Google Workspace or Zoho) |
|---|---|---|---|
| Status | **Receiving is live today.** Sending as support@ is one Gmail setting away | Not set up | Not set up |
| Cost | $0 | Free plan includes inbound mail and 3 inboxes. Every received email counts toward the 100/day and 3,000/month quota that site emails share | Google Workspace Business Starter is about $7 per user per month (check the current price). Zoho Mail has a free plan for up to 5 users (web and app only) and paid plans from about $1 per user per month |
| Where you read mail | Your Gmail (app, search, filters) | The Resend dashboard, or your own code through a webhook. Not Gmail | Its own inbox and app |
| DNS change | None | Needs an MX record. On the root domain it would **replace** Cloudflare Email Routing (the lowest MX priority wins). A subdomain such as `in.cybernetai.app` avoids that but gives ugly addresses | Replace the root MX and SPF with the provider's records, and add their DKIM. Cloudflare Email Routing stops |
| Replying as support@ | Gmail "Send mail as" through smtp.resend.com (below) | Through the Resend API or inbox UI | Built in |
| Risk | Forwarded mail can land in Spam (fix it with the filter above). Replies count toward Resend's 100/day | Inbound mail eats the sending quota. A new tool to check | A monthly bill (except Zoho Free). Migration work |

**Recommendation for a solo founder: (a).** It already works and costs
nothing, and everything lands in the Gmail you already read. The one thing
missing is replying *as* support@, which takes 5 minutes with the steps below.
Customer feedback is no longer at the mercy of email: it is stored in the
database and shown in the admin inbox. Move to (c) when you hire someone or
need shared mailboxes.

### Set up Gmail "Send mail as" (your step, needs a Resend key)

1. In Resend > API Keys, create a key named `gmail-send-as` with permission
   **Sending access**, limited to domain `cybernetai.app`. Copy it. It is shown
   once. Do not paste it anywhere else.
2. In the destination Gmail, go to Settings > See all settings > **Accounts and
   Import** > Send mail as > **Add another email address**.
3. Name: `CyberNet AI Support`. Email: `support@cybernetai.app`. Leave *Treat
   as an alias* ticked. Click Next.
4. SMTP Server: `smtp.resend.com`. Port: `465`. Username: `resend`. Password:
   the key from step 1. Choose *Secured connection using SSL*, then Add
   Account. (Port `587` with TLS also works.)
5. Gmail emails a confirmation code to support@. It is forwarded straight back
   to this Gmail. Enter the code.
6. Optional: under "When replying to a message", choose *Reply from the same
   address the message was sent to*.
7. Test it: reply to `support test 1` from support@. The person receiving it
   should see `support@cybernetai.app`, and the message should pass SPF, DKIM
   and DMARC ("Show original" in Gmail shows this).

## DNS records to check (Cloudflare > cybernetai.app > DNS)

Receiving (Cloudflare Email Routing) on the root domain `cybernetai.app`:

| Type | Name | Value |
|---|---|---|
| MX | `cybernetai.app` | `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net` (priorities as Cloudflare set them) |
| TXT (SPF) | `cybernetai.app` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT (DKIM) | `cf2024-1._domainkey.cybernetai.app` | Cloudflare's key (leave as is) |
| TXT (DMARC) | `_dmarc.cybernetai.app` | Check that it exists. If it doesn't, add `v=DMARC1; p=none; adkim=r; aspf=r`, then move to `p=quarantine` after a few clean weeks |

Sending (Resend) sits on its own records. The domain was verified with return
path `send.cybernetai.app`. Check these against Resend > Domains >
cybernetai.app, which lists the exact values:

| Type | Name | Value |
|---|---|---|
| MX | `send.cybernetai.app` | `feedback-smtp.<region>.amazonses.com` (bounce handling, as shown in Resend) |
| TXT (SPF) | `send.cybernetai.app` | `v=spf1 include:amazonses.com ~all` |
| TXT (DKIM) | `resend._domainkey.cybernetai.app` | `p=...` (Resend's key) |

**Why they don't clash:**

- The root MX (Cloudflare) receives mail. The `send.` MX only takes Resend's
  bounces.
- Resend's SPF lives on `send.cybernetai.app`, the envelope sender of every
  Resend email. So do **not** add `amazonses.com` to the root SPF. Each name
  may have only **one** SPF record.
- DMARC passes for Resend mail through DKIM (`d=cybernetai.app`, aligned) and
  relaxed SPF alignment (`send.cybernetai.app` is under `cybernetai.app`).
- Gmail "Send mail as" through smtp.resend.com uses the same Resend records, so
  it needs no extra DNS.

How to test the records: send from support@ (via Gmail) to an outside address
and open "Show original". Expect `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`.
For receiving, use the 2-minute test above.

## Feedback: what changed

- The form (Send feedback) posts to `/api/feedback`. That endpoint checks the
  input (message 1 to 5,000 characters, a category, an optional email), rejects
  the hidden honeypot field, and rate-limits through the existing
  `consume_api_quota`:
  - 3 a minute and 6 an hour per connection;
  - 6 an hour per account;
  - 100 an hour for everyone.

  It then saves a row in `public.feedback` with the service role.
- After the row is saved, an email goes to support@ (at most 20 a day, to stay
  within Resend's free 100/day). If the email fails, the feedback is still
  saved.
- If the database cannot take the row, the email becomes the copy. If both
  fail, the browser falls back to the old Netlify Forms submission. Nothing is
  silently lost.
- The form no longer asks for first and last name (they were never needed to
  reply). The browser is stored as a short name such as "Chrome 141 on
  Windows", not the full user agent. The page is stored as a path without the
  query or hash.
- **Account > Feedback inbox** appears only for the emails in `ADMIN_EMAILS`.
  It shows newest first, filters by New, Read, Replied or All, and has buttons
  to mark each item read, replied or new. The server
  (`netlify/functions/feedback-admin.mjs`) does the gate. It checks your
  Supabase session with Supabase itself and compares the confirmed email to
  `ADMIN_EMAILS`. Anyone else gets 403, whatever the browser claims.

## Apply the feedback migration (your step)

Apply it **before** deploying this branch. If you deploy first, nothing is
lost: the email becomes the copy. The inbox just stays empty until the table
exists.

1. Open the Supabase dashboard > your CyberNet project > **SQL Editor** > **New
   query**.
2. Open `supabase/migrations/20261021120000_feedback.sql` from the repo, copy
   **all** of it, paste it into the editor and click **Run**. Expect
   "Success. No rows returned". It is safe to run twice.
3. Check it, in the same editor:

   ```sql
   select relrowsecurity from pg_class where oid = 'public.feedback'::regclass;
   -- expect: true

   select grantee, privilege_type
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'feedback'
   order by 1, 2;
   -- expect: service_role INSERT, SELECT, UPDATE (and the owner, postgres).
   -- No anon, no authenticated.

   select policyname, permissive, roles from pg_policies where tablename = 'feedback';
   -- expect: feedback_service_role_all (PERMISSIVE, {service_role}) and
   --         feedback_no_browser_access (RESTRICTIVE, {anon,authenticated})
   ```

4. After the deploy, send a test message through Send feedback. Then, signed
   in with an `ADMIN_EMAILS` address, open Account > Feedback inbox. To read
   the table directly instead:

   ```sql
   select created_at, category, status, email, left(message, 80) as message
   from public.feedback order by created_at desc limit 20;
   ```

The weekly backup picks up the new table by itself (backup.mjs saves public
tables that are not in its list and names them in the email). Add it to
`TABLES` in `netlify/lib/backup.mjs` when convenient.

## Old feedback in Netlify Forms (check once)

Earlier submissions went to Netlify Forms, which only stores them if form
detection is on for the site. Open Netlify > the CyberNet site > **Forms**:

- If there is a `cybernet-feedback` form, open it and export the submissions
  (CSV) so you have them. The new code still falls back to this form when the
  API is down, so leave form detection as it is.
- If the Forms page says form detection is off, older feedback was not stored
  anywhere. That is the gap this change closes.
