# Business Team Accounts — Design Spec

## Purpose

Turn the single-seat Business plan into a team plan: one subscription, multiple
named logins, an owner who can invite/remove teammates and see the full team's
activity, and per-member daily-usage visibility. Motivation (from the account
owner): if something goes wrong on the Business plan — a bad call, a leaked
report, misuse — the owner needs to trace it to a specific person, not just
"the account."

This reverses the "one verified account per subscription, not a shared team
login" positioning shipped in PR #4 earlier this session. That copy will be
rewritten as part of this work.

## Decisions made (via brainstorming dialogue — do not relitigate these)

1. **Seat tiers, flat pricing, no per-seat metering:**
   - 5 seats — $40/mo, $384/yr (existing Stripe prices, reinterpreted as the 5-seat tier)
   - 10 seats — $80/mo, $768/yr (new Stripe prices)
   - 20 seats — $160/mo, $1,536/yr (new Stripe prices)
   - Anything else (different seat count, custom needs): "email cybernetai.26@gmail.com" — no self-serve custom tier in v1.
2. **Shared usage pool per account, scaled by tier** (not per-seat, to bound cost regardless of team size):
   - 5 seats → 50/day
   - 10 seats → 90/day
   - 20 seats → 160/day
   - These numbers keep worst-case AI cost margin flat-to-improving as tiers grow (verified against real OpenAI pricing: gpt-5 $1.25/$10 per 1M in/out tokens, gpt-5-mini $0.25/$2 per 1M in/out tokens, as of Aug 2026).
   - Known tail risk: if a team's traffic skewed entirely to Recovery Mode (always full-model, no skip path), the 5-seat tier could run at an AI-cost loss. Documented as a v1.1 follow-up (weight Recovery Mode cases as multiple pool "credits"), not solved today — no real usage data exists yet to size it correctly.
3. **Roles: Owner + Member.** Owner = the person whose Stripe subscription it is. Owner can invite, remove, and see the full team's activity log (full content, not just metadata — see below). Members can use all three features and see only their own history.
4. **Existing accounts invited to a team:** their existing login is linked to the business account (not a new signup). Pre-existing scan/recovery history stays theirs, not tagged as team activity. If the invited email has no CyberNet account yet, they sign up normally, then land on the accept-invite flow.
5. **Consent on join:** invite is low-friction (one click to accept) but is NOT silent/automatic — accepting is the consent action. If the invitee isn't signed in when they open the invite link, they're prompted to sign in (or sign up if new) first, then shown the accept screen.
6. **Members cannot self-remove.** Once a member accepts, only the Owner can remove them. This is an explicit, deliberate policy (not an oversight) — must be stated plainly in Terms/Acceptable Use so members are informed before accepting.
7. **Audit log shows full content**, not just metadata: owner can see exactly what a member submitted (scanned text/screenshot, full AI response) for Quick Scan, Analysis AI, and Recovery Mode — not just verdict/score/timestamp. This is a real privacy tradeoff for members and must be disclosed in the Terms/Privacy pages before someone accepts an invite.

## Data model

Three new tables (Supabase/Postgres), two existing tables get one new nullable column.

```sql
create table business_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  seat_tier smallint not null check (seat_tier in (5, 10, 20)),
  daily_pool_limit smallint not null, -- 50 / 90 / 160, set from seat_tier at write time
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'inactive',
  billing_interval text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references business_accounts(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','member')),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (business_account_id, user_id)
);
-- A user_id may only have one 'active' row across ALL business_accounts at a time
-- (enforced in application code at accept-invite time, not a DB constraint,
-- since "one active team per person" is a product rule, not a data-integrity rule).

create table business_invites (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references business_accounts(id),
  email text not null,
  token text not null unique,
  invited_by_user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

alter table scan_history add column business_account_id uuid references business_accounts(id);
alter table recovery_cases add column business_account_id uuid references business_accounts(id);

create table business_daily_usage (
  business_account_id uuid not null references business_accounts(id),
  usage_date date not null,
  analysis_count integer not null default 0,
  primary key (business_account_id, usage_date)
);
```

Existing `daily_usage` (per-`user_id`) stays untouched and keeps governing Free/Pro.
`profiles.plan`/`stripe_customer_id`/etc. stay untouched for individual users; a
team member's own `profiles` row is NOT updated to `plan: 'business'` — their
effective plan is *derived*, not stored, while on a team (see below).

## Plan resolution

`netlify/lib/supabase.mjs` needs one new function and one changed call site:

```js
export async function getActiveTeamMembership(userId) {
  // SELECT business_members.*, business_accounts.*
  // WHERE user_id = userId AND business_members.status = 'active'
  //   AND business_accounts.subscription_status IN ('active','trialing')
  // Returns null if the user isn't on an active team.
}
```

`account-status.mjs` and every function that currently calls `getProfile()` +
`effectivePlan()` to decide AI routing/limits (`analyze.mts`, `recovery-mode.mts`,
`recovery-update.mts`, `quickscan-usage.mjs`) must check
`getActiveTeamMembership(user.id)` FIRST:

- If on an active team: effective plan = `"business"`, usage is read/written
  against `business_daily_usage` keyed by `business_account_id` (shared pool,
  limit = team's `daily_pool_limit`), and `scan_history`/`recovery_cases` writes
  include `business_account_id`.
- If not on a team: existing behavior, unchanged (individual `profiles`/`daily_usage`).

`consumeAnalysis()`/`refundAnalysis()` need a business-account-aware variant
(new Postgres RPC functions `consume_analysis_business`/`refund_analysis_business`,
mirroring the existing `consume_analysis`/`refund_analysis` RPCs but keyed on
`business_account_id` instead of `user_id`) to keep the reservation atomic
under concurrent teammates hitting the shared pool simultaneously.

## New Netlify functions

- `business-account.mts` (GET) — for the signed-in user: their business account
  (if owner or member), seat tier, pool usage today, member roster with each
  member's own usage today (`SUM` of that member's `scan_history`/`recovery_cases`
  rows for today's date where `business_account_id` matches — read-only rollup,
  no new per-member counter table needed).
- `business-invite.mts` (POST, owner only) — validates seat cap not exceeded,
  creates a `business_invites` row, sends the invite email (Resend — already
  available as a connected service in this environment).
- `business-invite-accept.mts` (POST, authenticated) — validates token (not
  expired/revoked/already accepted), creates the `business_members` row,
  marks the invite accepted. Rejects if the accepting user already has an
  active membership elsewhere (one active team per person).
- `business-member-remove.mts` (POST, owner only) — sets a member's
  `business_members.status = 'removed'`.
- `business-activity.mts` (GET, owner only) — full-content activity feed
  across the team: join `scan_history`/`recovery_cases` on
  `business_account_id`, include the member's name/email, verdict, full
  submitted content, full AI response, timestamp. Paginated.

## Stripe changes

- `create-checkout-session.mjs`: add a `tier` param (`5`/`10`/`20`) selecting
  the right `lookup_key` (existing `cybernet_ai_business_monthly`/`_yearly`
  for tier 5; two new lookup-key pairs for tiers 10/20). Checkout success
  creates the `business_accounts` row (owner = purchasing user) instead of
  writing `plan: 'business'` onto `profiles`.
- `stripe-webhook.mjs`: subscription update/cancel events for a Business
  subscription update `business_accounts.subscription_status`/`billing_interval`
  instead of `profiles`.
- New Stripe prices needed (created the same way as the existing $40/$384
  pair — new objects, not edits to existing ones): 10-seat $80/mo + $768/yr,
  20-seat $160/mo + $1,536/yr, tax-inclusive, auto-renewing, matching the
  existing Business prices' configuration.

## Frontend — "Manage Business" UI

Triggered automatically right after a successful Business checkout, and
reachable afterward from account/nav (mirrors how the existing account
menu works). Design: dark glass-card system already in `style.css`
(`--bg:#050a16`, `--glass`/`--glass-border` translucent panels, `--green:#22d3ee`
cyan accent, JetBrains Mono for numbers/labels, Inter for body) — no new
palette, this must look like it belongs on the existing site, not a bolted-on
admin panel.

Sections:
1. **Team header** — seat tier, seats used/available, shared pool used-today/limit
   (a progress bar, consistent with the existing "Daily Quick Scans" bar already
   on the Quick Scan/Recovery pages).
2. **Member roster** — each row: name, email, role badge, joined date, *their*
   usage today (e.g. "6 analyses today"), a Remove button (owner only,
   confirmation required — this is a "removes someone's access" action).
3. **Invite box** — email input + Invite button, disabled with a clear message
   once the seat cap is reached ("Team is full (5/5 seats) — remove a member
   or upgrade to add more").
4. **Activity log** — full-content feed (per decision #7 above), filterable by
   member, newest first, each entry expandable to show the full submitted
   content and full AI response.

Sign-in gate for invitees: the invite email links to `/accept-invite?token=...`.
If not signed in, the page shows a sign-in/sign-up form first (same
`appState.supabase.auth.signInWithPassword`/`signUp` calls already used
elsewhere in `script.js`), then re-checks the token and shows the Accept screen.

## Pricing page & marketing copy

Rewrite the Business plan card and its supporting section on the pricing page:
replace the single-seat "one verified account, not a shared team login" copy
(PR #4) with team-plan copy — what a team gets, the three tiers with per-tier
pool sizes, the audit-log/accountability pitch (this is the actual differentiator
vs. Pro), and the "need more than 20 seats or something custom? Email
cybernetai.26@gmail.com" line.

## Legal / policy updates required

- **Terms of Service** (`terms.html`): team membership terms — owner controls
  membership, members cannot self-remove, owner can see full content of
  member activity, what happens to a member's access if the subscription
  lapses/cancels.
- **Privacy Policy** (`privacy.html`): explicit disclosure that on a Business
  team, the account owner can view the full content of a member's scans,
  analyses, and recovery cases — this is a real change to who can see a
  user's submitted content and must be named plainly, not buried.
- **Acceptable Use** (`acceptable-use.html`): update any single-seat/sharing
  language now that team seats are an explicit, paid feature.
- **Refunds/Cancellation** (`refunds.html`): what happens to team access on
  cancellation (all members lose Business access; grace period if any).

## Non-goals (v1)

- No self-serve mid-cycle tier upgrade/downgrade (contact support).
- No roles beyond Owner/Member.
- No SSO — existing Supabase email/password auth only.
- No per-seat metered Stripe billing — flat tiers only.
- Recovery-Mode-weighted pool consumption (the tail-risk mitigation noted in
  decision #2) is explicitly deferred pending real usage data.

## Video re-recording (separate, sequenced last)

Re-record all three how-to GIFs (`public/howto/*.gif`) once the above ships,
using: smoother/cleaner capture (current ones are choppy), on-screen caption
text explaining what's happening at each step (not just the raw recording),
and a confidently-classifiable demo message for Analysis AI (the "Not Sure"
result in the current recording is a legitimate `inconclusive` verdict for an
ambiguous test message, not a bug — a clearer demo message avoids it without
touching detection logic).
