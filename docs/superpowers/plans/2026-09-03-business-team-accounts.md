# Business Team Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-seat Business plan into a team plan — one subscription
(5/10/20 seats), an Owner who invites/removes named Members, a shared
per-account daily usage pool, and a full-content team activity log — while
leaving Free/Pro entirely untouched.

**Architecture:** A new `business_accounts` table becomes the billing/plan
anchor for teams (instead of `profiles`, which stays the anchor for
individual Free/Pro users). `business_members` links `auth.users` rows to a
business account with a role. A new `getActiveTeamMembership()` check is
inserted at the front of every plan/usage decision point across the codebase
— if the caller is on an active team, everything routes to the shared pool
and team tables instead of their personal ones. `scan_history`/`recovery_cases`
keep their existing per-user attribution columns unchanged and just gain an
extra nullable `business_account_id` tag for team rollups.

**Tech Stack:** Netlify Functions (`.mts` via esbuild/TypeScript, `.mjs`
plain JS), Supabase (Postgres REST + Auth, accessed via raw `fetch` — no
Supabase JS SDK is used server-side anywhere in this repo), Stripe
(`lookup_key`-based price resolution, never hardcoded Price IDs), vanilla
JS/CSS frontend (`public/script.js`, `public/style.css`, `public/index.html`
— no frontend framework or bundler).

**Spec:** `docs/superpowers/specs/2026-09-03-business-team-accounts-design.md`

## Global Constraints

- Never hardcode a Stripe Price ID — always resolve by `lookup_key`, exactly
  like `create-checkout-session.mjs` already does for the existing Pro/Business prices.
- No detection weight/threshold/keyword changes anywhere (standing constraint
  from earlier in this project — this feature is additive only).
- Every `.mts` file edit must pass `npx esbuild <file> --loader:.mts=ts --outfile=/dev/null`
  before commit — this repo has no typecheck or test framework, so this parse-check
  plus live/manual verification (browser tools against the deploy preview or
  production after merge) is the actual verification method used throughout
  this project. Do not invent a test framework that doesn't exist here.
- Branch-per-task, named `phase-N/description`, one PR per branch, opened and
  merged via the GitHub web UI (no `gh` CLI in this environment).
- `analyze.mts`, `recovery-mode.mts`, and `recovery-update.mts` each carry
  their OWN duplicated inline copies of `serviceFetch`/usage-reservation logic
  — they do **not** import `netlify/lib/supabase.mjs`. Only the `.mjs`
  functions (`quickscan-usage.mjs`, `account-status.mjs`,
  `create-checkout-session.mjs`) import the shared lib. Follow this existing
  split: add shared team-membership logic to `netlify/lib/supabase.mjs` for
  the `.mjs` files, and add an equivalent duplicated version directly inside
  each `.mts` file, matching how those files already duplicate this pattern.
  Do not attempt to unify them — that's a pre-existing repo convention, not
  a gap to close as part of this feature.
- Tax-inclusive, auto-renewing Stripe prices only, matching the existing
  5-seat Business prices' configuration exactly (per the "no taxes,
  autorenewal" instruction those were created under).

---

## Task 1: Supabase schema migration

**Files:**
- Create: `supabase/migrations/2026090301_business_team_accounts.sql`
  (check `supabase/migrations/` for the existing naming convention first —
  if migrations aren't tracked as files in this repo, run the SQL directly
  against the Supabase project via the SQL editor and save a copy of exactly
  what was run to this path anyway, so it's in version control.)

**Interfaces:**
- Produces: tables `business_accounts`, `business_members`, `business_invites`,
  `business_daily_usage`; new nullable column `business_account_id` on
  `scan_history` and `recovery_cases`; RPC functions `consume_analysis_business(p_business_account_id uuid, p_daily_limit smallint)`
  and `refund_analysis_business(p_business_account_id uuid)`; RPC function
  `consume_recovery_case_business(p_business_account_id uuid, p_daily_limit smallint)`
  (mirrors `consume_recovery_case`, pool-aware).

- [ ] **Step 1: Read the existing RPCs this migration must mirror**

Run against the Supabase SQL editor (read-only):
```sql
select prosrc from pg_proc where proname in ('consume_analysis', 'refund_analysis', 'consume_recovery_case');
```
Copy the actual logic (locking/upsert pattern) rather than guessing — the
new `_business` RPCs must use the same atomic-reservation approach (almost
certainly `insert ... on conflict (user_id, usage_date) do update set
analysis_count = analysis_count + 1 where analysis_count < daily_limit
returning ...`, or equivalent), just keyed on `business_account_id` +
`usage_date` against the new `business_daily_usage` table instead of
`user_id` + `usage_date` against `daily_usage`.

- [ ] **Step 2: Write and run the schema migration**

```sql
create table business_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  seat_tier smallint not null check (seat_tier in (5, 10, 20)),
  daily_pool_limit smallint not null,
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

create index business_members_user_id_active_idx
  on business_members (user_id)
  where status = 'active';

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

create index business_invites_token_idx on business_invites (token);

create table business_daily_usage (
  business_account_id uuid not null references business_accounts(id),
  usage_date date not null,
  analysis_count integer not null default 0,
  primary key (business_account_id, usage_date)
);

alter table scan_history add column business_account_id uuid references business_accounts(id);
alter table recovery_cases add column business_account_id uuid references business_accounts(id);

create index scan_history_business_account_idx on scan_history (business_account_id) where business_account_id is not null;
create index recovery_cases_business_account_idx on recovery_cases (business_account_id) where business_account_id is not null;
```

- [ ] **Step 3: Write the two pool-aware RPC functions**

Base this on whatever `consume_analysis`/`consume_recovery_case` actually
does (from Step 1) — same atomicity guarantee, different key:

```sql
create or replace function consume_analysis_business(p_business_account_id uuid, p_daily_limit smallint)
returns table(allowed boolean, used integer, daily_limit smallint) as $$
declare
  v_used integer;
begin
  insert into business_daily_usage (business_account_id, usage_date, analysis_count)
  values (p_business_account_id, current_date, 1)
  on conflict (business_account_id, usage_date)
  do update set analysis_count = business_daily_usage.analysis_count + 1
    where business_daily_usage.analysis_count < p_daily_limit
  returning business_daily_usage.analysis_count into v_used;

  if v_used is null then
    select business_daily_usage.analysis_count into v_used
    from business_daily_usage
    where business_account_id = p_business_account_id and usage_date = current_date;
    return query select false, coalesce(v_used, 0), p_daily_limit;
  else
    return query select true, v_used, p_daily_limit;
  end if;
end;
$$ language plpgsql;

create or replace function refund_analysis_business(p_business_account_id uuid)
returns void as $$
begin
  update business_daily_usage
  set analysis_count = greatest(0, analysis_count - 1)
  where business_account_id = p_business_account_id and usage_date = current_date;
end;
$$ language plpgsql;

create or replace function consume_recovery_case_business(p_business_account_id uuid, p_daily_limit smallint)
returns table(allowed boolean, used integer, daily_limit smallint) as $$
declare
  v_used integer;
begin
  insert into business_daily_usage (business_account_id, usage_date, analysis_count)
  values (p_business_account_id, current_date, 1)
  on conflict (business_account_id, usage_date)
  do update set analysis_count = business_daily_usage.analysis_count + 1
    where business_daily_usage.analysis_count < p_daily_limit
  returning business_daily_usage.analysis_count into v_used;

  if v_used is null then
    select business_daily_usage.analysis_count into v_used
    from business_daily_usage
    where business_account_id = p_business_account_id and usage_date = current_date;
    return query select false, coalesce(v_used, 0), p_daily_limit;
  else
    return query select true, v_used, p_daily_limit;
  end if;
end;
$$ language plpgsql;
```

(This reuses one shared `business_daily_usage` pool table for both Quick
Scan/Analysis AI consumption and Recovery Mode case consumption — a team's
50/90/160 daily pool is one shared number across all three features, matching
"50 analyses/day per Business subscription, shared across your team" from
the spec. If Step 1's real RPCs reveal Quick Scan and Recovery Mode already
draw from two *separate* individual counters today, keep them separate here
too by adding a `kind text` column to `business_daily_usage` — check this
before implementing, don't assume.)

- [ ] **Step 4: Verify the migration applied cleanly**

Query each new table (`select * from business_accounts limit 1;` etc.) and
confirm no errors, then confirm the two new columns exist on `scan_history`/`recovery_cases`
(`select business_account_id from scan_history limit 1;`).

- [ ] **Step 5: Commit the migration file**

```bash
git add supabase/migrations/2026090301_business_team_accounts.sql
git commit -m "Add Business team accounts schema (tables + pool RPCs)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Shared team-membership helper in `netlify/lib/supabase.mjs`

**Files:**
- Modify: `netlify/lib/supabase.mjs`

**Interfaces:**
- Consumes: `serviceFetch` (already in this file).
- Produces: `getActiveTeamMembership(userId): Promise<{ businessAccountId, role, dailyPoolLimit, seatTier } | null>`,
  exported for use by `quickscan-usage.mjs`, `account-status.mjs`,
  `create-checkout-session.mjs`.

- [ ] **Step 1: Add `getActiveTeamMembership`**

```js
export async function getActiveTeamMembership(userId) {
  const response = await serviceFetch(
    `/rest/v1/business_members?user_id=eq.${encodeURIComponent(userId)}` +
    "&status=eq.active" +
    "&select=role,business_accounts(id,seat_tier,daily_pool_limit,subscription_status)"
  );

  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(rows?.message || "Could not check team membership.");
  }

  const row = rows.find((r) =>
    ["active", "trialing"].includes(String(r.business_accounts?.subscription_status || ""))
  );
  if (!row) return null;

  return {
    businessAccountId: row.business_accounts.id,
    role: row.role,
    dailyPoolLimit: row.business_accounts.daily_pool_limit,
    seatTier: row.business_accounts.seat_tier
  };
}
```

- [ ] **Step 2: Verify the PostgREST embed syntax works**

Call it manually against a test user id that has no team (expect `null`)
via a throwaway `node -e` script hitting the same Supabase REST endpoint, or
defer verification to Task 3's live check since `quickscan-usage.mjs` will
exercise this function directly.

- [ ] **Step 3: Commit**

```bash
git add netlify/lib/supabase.mjs
git commit -m "Add getActiveTeamMembership() to shared Supabase lib

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Team-aware plan/usage resolution in `quickscan-usage.mjs` and `account-status.mjs`

**Files:**
- Modify: `netlify/functions/quickscan-usage.mjs`
- Modify: `netlify/functions/account-status.mjs`

**Interfaces:**
- Consumes: `getActiveTeamMembership` (Task 2).

- [ ] **Step 1: Update `account-status.mjs` to report team plan/usage**

After `const profile = await getProfile(user);`, add:
```js
const team = await getActiveTeamMembership(user.id);
const plan = team ? "business" : effectivePlan(profile);
```
Replace the existing `const plan = effectivePlan(profile);` line with this
block. Usage reporting: if `team`, fetch today's `business_daily_usage` row
for `team.businessAccountId` instead of calling `getUsage(user.id, profile)`
(mirror `getUsage`'s date/shape, keyed on `business_account_id`). Include
`isTeamMember: Boolean(team)` and `teamRole: team?.role || null` in the
returned `profile` object so the frontend knows whether to show "Manage
Business" (owner) vs. just team-membership context (member).

- [ ] **Step 2: Same team-check in `quickscan-usage.mjs`**

Read the file's current body first (it wasn't fully read during planning —
read it now) and apply the same "check team membership before individual
plan" pattern established in Step 1, consistent with whatever this
endpoint's actual current shape is.

- [ ] **Step 3: Parse-check and live-verify**

```bash
npx esbuild netlify/functions/account-status.mjs --outfile=/dev/null
```
(`.mjs` files don't need the `--loader:.mts=ts` flag.) Live-verify after
deploy: sign in as a non-team user, confirm `/api/account-status` still
reports their real individual plan unchanged.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/quickscan-usage.mjs netlify/functions/account-status.mjs
git commit -m "Resolve effective plan/usage from team membership first

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Team-aware usage in `analyze.mts`, `recovery-mode.mts`, `recovery-update.mts`

**Files:**
- Modify: `netlify/functions/analyze.mts` (lines ~772-815, the local
  `consumeAnalysis`/`refundAnalysis`/`saveHistory` functions, plus the call
  sites at ~1113/1188/1204)
- Modify: `netlify/functions/recovery-mode.mts` (lines ~479-495,
  `consumeRecoveryCase`, plus `saveCase` at ~497 to accept and write
  `business_account_id`)
- Modify: `netlify/functions/recovery-update.mts` (equivalent local usage
  function — read the file to find its exact name/line before editing)

**Interfaces:**
- Consumes: none new (each `.mts` file gets its own inline copy of the
  team-membership check — see Global Constraints on why these files don't
  import the shared lib).
- Produces: `business_account_id` now flows into every `scan_history` and
  `recovery_cases` insert made by a team member.

- [ ] **Step 1: Add a local `getActiveTeamMembership` to `analyze.mts`**

Insert near the file's existing `serviceFetch`/`isAdminUser` block (~line
763-770):
```ts
async function getActiveTeamMembership(userId: string): Promise<{
  businessAccountId: string;
  dailyPoolLimit: number;
} | null> {
  const response = await serviceFetch(
    `/rest/v1/business_members?user_id=eq.${encodeURIComponent(userId)}` +
    "&status=eq.active" +
    "&select=business_accounts(id,daily_pool_limit,subscription_status)"
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) return null;
  const row = (rows as any[]).find((r) =>
    ["active", "trialing"].includes(String(r.business_accounts?.subscription_status || ""))
  );
  if (!row) return null;
  return {
    businessAccountId: row.business_accounts.id,
    dailyPoolLimit: row.business_accounts.daily_pool_limit
  };
}
```

- [ ] **Step 2: Route `consumeAnalysis`/`refundAnalysis` through the team pool when applicable**

At the call site (~line 1113, `usage = await consumeAnalysis(user.id);`),
change to:
```ts
const team = await getActiveTeamMembership(user.id);
usage = team
  ? await consumeAnalysisBusiness(team.businessAccountId, team.dailyPoolLimit)
  : await consumeAnalysis(user.id);
```
Add `consumeAnalysisBusiness`/`refundAnalysisBusiness` as new local
functions right next to the existing `consumeAnalysis`/`refundAnalysis`
(~line 772-798), calling the `consume_analysis_business`/
`refund_analysis_business` RPCs from Task 1, same response-shaping pattern
as the existing functions but returning `plan: "business"` unconditionally.
Update the refund call site (~line 1188) and the `saveHistory` call site
(~line 1204) to pass `team?.businessAccountId` through so
`saveHistory`'s insert body includes `business_account_id: team?.businessAccountId || null`.

- [ ] **Step 3: Same pattern in `recovery-mode.mts`**

Add the local `getActiveTeamMembership` (same body as Step 1). At the
`consumeRecoveryCase` call site (~line 593 area), branch the same way,
calling a new local `consumeRecoveryCaseBusiness` that hits
`consume_recovery_case_business`. Fix the pre-existing plan-label bug found
during planning while touching this function: line 492's
`plan: row?.plan === "pro" ? "pro" : "free"` silently drops "business" —
when adding the business branch, also widen this to
`row?.plan === "pro" ? "pro" : row?.plan === "business" ? "business" : "free"`
so a non-team Business-plan user (if any still exist — check Task 8) isn't
mislabeled "Free" in error messages like line 602's
`` `Daily ${usage.plan === "pro" ? "Pro" : "Free"} Recovery case limit reached.` ``.
Also update `saveCase` (~line 497) to accept a `businessAccountId` param and
include it in the `recovery_cases` insert.

- [ ] **Step 4: Same pattern in `recovery-update.mts`**

Read the file to find its equivalent usage-reservation function and apply
the identical team-check branch.

- [ ] **Step 5: Parse-check all three files**

```bash
npx esbuild netlify/functions/analyze.mts --loader:.mts=ts --outfile=/dev/null
npx esbuild netlify/functions/recovery-mode.mts --loader:.mts=ts --outfile=/dev/null
npx esbuild netlify/functions/recovery-update.mts --loader:.mts=ts --outfile=/dev/null
```

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/analyze.mts netlify/functions/recovery-mode.mts netlify/functions/recovery-update.mts
git commit -m "Route AI usage through the shared team pool when on a Business team

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(This task cannot be live-verified end-to-end until Task 6's Stripe wiring
exists — no one can actually be on a team yet. Parse-check is the
verification gate for this task; full live verification happens after Task 6/7.)

---

## Task 5: New Netlify functions — account info, invite, accept, remove, activity

**Files:**
- Create: `netlify/functions/business-account.mts`
- Create: `netlify/functions/business-invite.mts`
- Create: `netlify/functions/business-invite-accept.mts`
- Create: `netlify/functions/business-member-remove.mts`
- Create: `netlify/functions/business-activity.mts`

**Interfaces:**
- Consumes: `verifyUser`, `serviceFetch`, `json`, `getActiveTeamMembership`
  from `netlify/lib/supabase.mjs` (these are `.mts` files but, unlike
  `analyze.mts`/`recovery-mode.mts`, they're new — start them importing the
  shared lib the way `quickscan-usage.mjs` does, since there's no existing
  duplicated-copy precedent to match for brand-new files).
- Produces: the five endpoints the frontend (Task 6) calls.

- [ ] **Step 1: `business-account.mts` — GET, returns the caller's team state**

```ts
import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

export default async (request: Request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team) {
      return json({ onTeam: false });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [membersRes, usageRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/business_members?business_account_id=eq.${team.businessAccountId}` +
        "&status=eq.active&select=user_id,role,joined_at"
      ),
      serviceFetch(
        `/rest/v1/business_daily_usage?business_account_id=eq.${team.businessAccountId}` +
        `&usage_date=eq.${today}&select=analysis_count`
      )
    ]);

    const members = await membersRes.json().catch(() => []);
    const usageRows = await usageRes.json().catch(() => []);
    const poolUsedToday = Number(usageRows[0]?.analysis_count) || 0;

    // Per-member usage-today rollup: count today's scan_history + recovery_cases
    // rows per user_id within this business_account_id.
    const scanRes = await serviceFetch(
      `/rest/v1/scan_history?business_account_id=eq.${team.businessAccountId}` +
      `&created_at=gte.${today}T00:00:00Z&select=user_id`
    );
    const recoveryRes = await serviceFetch(
      `/rest/v1/recovery_cases?business_account_id=eq.${team.businessAccountId}` +
      `&created_at=gte.${today}T00:00:00Z&select=owner_user_id`
    );
    const scanRows = await scanRes.json().catch(() => []);
    const recoveryRows = await recoveryRes.json().catch(() => []);

    const perMemberToday: Record<string, number> = {};
    for (const row of scanRows as any[]) {
      perMemberToday[row.user_id] = (perMemberToday[row.user_id] || 0) + 1;
    }
    for (const row of recoveryRows as any[]) {
      perMemberToday[row.owner_user_id] = (perMemberToday[row.owner_user_id] || 0) + 1;
    }

    // Resolve member emails/names via auth admin endpoint (service role).
    const memberDetails = await Promise.all(
      (members as any[]).map(async (m) => {
        const userRes = await serviceFetch(`/auth/v1/admin/users/${m.user_id}`);
        const userData = await userRes.json().catch(() => ({}));
        return {
          userId: m.user_id,
          role: m.role,
          joinedAt: m.joined_at,
          email: userData?.email || "",
          fullName: userData?.user_metadata?.full_name || "",
          usageToday: perMemberToday[m.user_id] || 0
        };
      })
    );

    return json({
      onTeam: true,
      role: team.role,
      seatTier: team.seatTier,
      seatsUsed: memberDetails.length,
      dailyPoolLimit: team.dailyPoolLimit,
      poolUsedToday,
      members: memberDetails
    });
  } catch (error: any) {
    return json({ error: error.message || "Could not load team info." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-account" };
```

- [ ] **Step 2: `business-invite.mts` — POST, owner only**

```ts
import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";
import { randomUUID } from "node:crypto";

function env(name: string): string {
  try {
    return (globalThis as any).Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can invite teammates." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return json({ error: "A valid email address is required." }, 400);
    }

    const membersRes = await serviceFetch(
      `/rest/v1/business_members?business_account_id=eq.${team.businessAccountId}&status=eq.active&select=id`
    );
    const members = await membersRes.json().catch(() => []);

    const pendingRes = await serviceFetch(
      `/rest/v1/business_invites?business_account_id=eq.${team.businessAccountId}&status=eq.pending&select=id`
    );
    const pending = await pendingRes.json().catch(() => []);

    const seatsTaken = (members as any[]).length + (pending as any[]).length;
    const seatCap = { 5: 5, 10: 10, 20: 20 }[team.seatTier as 5 | 10 | 20] || 5;

    if (seatsTaken >= seatCap) {
      return json({ error: `Team is full (${seatsTaken}/${seatCap} seats). Remove a member or upgrade your tier to add more.` }, 409);
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const insertRes = await serviceFetch("/rest/v1/business_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        business_account_id: team.businessAccountId,
        email,
        token,
        invited_by_user_id: user.id,
        expires_at: expiresAt
      })
    });

    if (!insertRes.ok) {
      const payload = await insertRes.json().catch(() => ({}));
      throw new Error((payload as any)?.message || "Could not create the invite.");
    }

    // Email delivery: send via whatever transactional email provider is
    // already configured for this project (check for an existing
    // RESEND_API_KEY or similar env var before assuming Resend — this repo
    // has not sent a custom transactional email before this feature, so
    // verify the provider exists rather than guessing).
    const acceptUrl = `${new URL(request.url).origin}/accept-invite?token=${token}`;
    // TODO(implementer): wire actual email send here once the provider is confirmed.

    return json({ ok: true, acceptUrl });
  } catch (error: any) {
    return json({ error: error.message || "Could not send the invite." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-invite" };
```

- [ ] **Step 3: `business-invite-accept.mts` — POST, authenticated**

```ts
import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "");

    if (!token) return json({ error: "Missing invite token." }, 400);

    const existingTeam = await getActiveTeamMembership(user.id);
    if (existingTeam) {
      return json({ error: "You're already on a team. Leave your current team (ask the owner to remove you) before joining another." }, 409);
    }

    const inviteRes = await serviceFetch(
      `/rest/v1/business_invites?token=eq.${encodeURIComponent(token)}&select=*`
    );
    const invites = await inviteRes.json().catch(() => []);
    const invite = (invites as any[])[0];

    if (!invite) return json({ error: "This invite link is invalid." }, 404);
    if (invite.status !== "pending") return json({ error: "This invite has already been used or revoked." }, 410);
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await serviceFetch(`/rest/v1/business_invites?id=eq.${invite.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "expired" })
      });
      return json({ error: "This invite has expired. Ask the team owner to send a new one." }, 410);
    }
    if (String(user.email || "").toLowerCase() !== invite.email) {
      return json({ error: "This invite was sent to a different email address." }, 403);
    }

    const memberInsert = await serviceFetch("/rest/v1/business_members", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        business_account_id: invite.business_account_id,
        user_id: user.id,
        role: "member"
      })
    });

    if (!memberInsert.ok) {
      const payload = await memberInsert.json().catch(() => ({}));
      throw new Error((payload as any)?.message || "Could not join the team.");
    }

    await serviceFetch(`/rest/v1/business_invites?id=eq.${invite.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted", accepted_at: new Date().toISOString() })
    });

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: error.message || "Could not accept the invite." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-invite-accept" };
```

- [ ] **Step 4: `business-member-remove.mts` — POST, owner only**

```ts
import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can remove teammates." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = String(body.userId || "");

    if (!targetUserId) return json({ error: "Missing userId." }, 400);
    if (targetUserId === user.id) return json({ error: "The owner cannot remove themselves this way — cancel the subscription instead." }, 400);

    const updateRes = await serviceFetch(
      `/rest/v1/business_members?business_account_id=eq.${team.businessAccountId}&user_id=eq.${encodeURIComponent(targetUserId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "removed", removed_at: new Date().toISOString() })
      }
    );

    if (!updateRes.ok) {
      const payload = await updateRes.json().catch(() => ({}));
      throw new Error((payload as any)?.message || "Could not remove the teammate.");
    }

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: error.message || "Could not remove the teammate." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-member-remove" };
```

- [ ] **Step 5: `business-activity.mts` — GET, owner only, full-content feed**

```ts
import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

export default async (request: Request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can view the team activity log." }, 403);
    }

    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 30));
    const memberFilter = url.searchParams.get("userId");

    const scanFilter = memberFilter ? `&user_id=eq.${encodeURIComponent(memberFilter)}` : "";
    const recoveryFilter = memberFilter ? `&owner_user_id=eq.${encodeURIComponent(memberFilter)}` : "";

    const [scanRes, recoveryRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/scan_history?business_account_id=eq.${team.businessAccountId}${scanFilter}` +
        "&select=id,user_id,analysis_type,verdict,score,threat_type,summary,created_at" +
        `&order=created_at.desc&limit=${limit}`
      ),
      serviceFetch(
        `/rest/v1/recovery_cases?business_account_id=eq.${team.businessAccountId}${recoveryFilter}` +
        "&select=id,owner_user_id,incident_type,risk_level,case_title,created_at" +
        `&order=created_at.desc&limit=${limit}`
      )
    ]);

    const scans = await scanRes.json().catch(() => []);
    const recoveries = await recoveryRes.json().catch(() => []);

    const feed = [
      ...(scans as any[]).map((s) => ({ type: "scan", ...s, userId: s.user_id })),
      ...(recoveries as any[]).map((r) => ({ type: "recovery", ...r, userId: r.owner_user_id }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
     .slice(0, limit);

    return json({ feed });
  } catch (error: any) {
    return json({ error: error.message || "Could not load team activity." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-activity" };
```

- [ ] **Step 6: Parse-check all five new files**

```bash
npx esbuild netlify/functions/business-account.mts --loader:.mts=ts --outfile=/dev/null
npx esbuild netlify/functions/business-invite.mts --loader:.mts=ts --outfile=/dev/null
npx esbuild netlify/functions/business-invite-accept.mts --loader:.mts=ts --outfile=/dev/null
npx esbuild netlify/functions/business-member-remove.mts --loader:.mts=ts --outfile=/dev/null
npx esbuild netlify/functions/business-activity.mts --loader:.mts=ts --outfile=/dev/null
```

- [ ] **Step 7: Resolve the email-delivery TODO before merging**

Check Netlify env vars / this project's existing connectors for a
transactional email provider (a Resend-like service was observed as an
available connected tool in this environment during planning — confirm it's
actually configured for this Netlify site, not just generically available,
before wiring `business-invite.mts` to send through it). If none is
configured, this step blocks the task — do not merge with a silent no-op
email send, since "owner invites teammate" doing nothing visible is a
broken feature, not a deferred one. Surface this explicitly rather than
merge around it.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/business-account.mts netlify/functions/business-invite.mts netlify/functions/business-invite-accept.mts netlify/functions/business-member-remove.mts netlify/functions/business-activity.mts
git commit -m "Add Business team management API endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Stripe — new seat-tier prices + checkout/webhook wiring

**Files:**
- Modify: `netlify/functions/create-checkout-session.mjs`
- Modify: `netlify/functions/stripe-webhook.mjs`
- Manual: Stripe Dashboard (new Price objects — see below)

**Interfaces:**
- Consumes: existing `getProfile`/`effectivePlan`/`verifyUser` imports
  already in `create-checkout-session.mjs`.
- Produces: `business_accounts` rows created/updated on successful team checkout.

- [ ] **Step 1: Manual — create the two new Stripe price pairs**

In the Stripe Dashboard, on the same product the existing Business prices
live on (`prod_Uw2dCrOgEyZhvj`, "Cybernetai Pro" — confirmed earlier this
session), create four new Prices, same configuration as the existing $40/mo
and $384/yr Business prices (tax-inclusive, auto-renewing):

| Tier | Interval | Amount | lookup_key |
|---|---|---|---|
| 10 seats | monthly | $80.00 USD | `cybernet_ai_business_10seat_monthly` |
| 10 seats | yearly | $768.00 USD | `cybernet_ai_business_10seat_yearly` |
| 20 seats | monthly | $160.00 USD | `cybernet_ai_business_20seat_monthly` |
| 20 seats | yearly | $1,536.00 USD | `cybernet_ai_business_20seat_yearly` |

Do this as new Price creation (not editing any existing price) — matches
how the existing 5-seat prices were created, and edits to existing sensitive
Stripe fields are blocked by this environment's safety tooling anyway.

- [ ] **Step 2: Update `create-checkout-session.mjs` to accept a `tier` param**

Replace the `targetPlan === "business"` lookup-key block (lines 107-117)
with tier-aware resolution:

```js
const seatTier = targetPlan === "business" ? (Number(body.seatTier) || 5) : null;
if (targetPlan === "business" && ![5, 10, 20].includes(seatTier)) {
  return json({ error: "Invalid seat tier. Choose 5, 10, or 20 seats, or email cybernetai.26@gmail.com for a custom plan." }, 400);
}

const tierSuffix = seatTier === 5 ? "" : `_${seatTier}seat`;
const lookupKey = targetPlan === "business"
  ? (
      cycle === "yearly"
        ? (env(`STRIPE_BUSINESS${tierSuffix.toUpperCase()}_YEARLY_LOOKUP_KEY`) || `cybernet_ai_business${tierSuffix}_yearly`)
        : (env(`STRIPE_BUSINESS${tierSuffix.toUpperCase()}_MONTHLY_LOOKUP_KEY`) || `cybernet_ai_business${tierSuffix}_monthly`)
    )
  : (
      cycle === "yearly"
        ? (env("STRIPE_PRO_YEARLY_LOOKUP_KEY") || "cybernet_ai_pro_yearly")
        : (env("STRIPE_PRO_MONTHLY_LOOKUP_KEY") || "cybernet_ai_pro_monthly")
    );
```

(5-seat keeps the existing `cybernet_ai_business_monthly`/`_yearly` keys
unchanged — `tierSuffix` is empty for tier 5.) Add `seatTier` into both
`metadata` and `subscription_data.metadata` blocks (lines 172-183) so the
webhook can read it.

- [ ] **Step 3: Update `stripe-webhook.mjs` to create/update `business_accounts` for team purchases**

Read the file's `checkout.session.completed` and
`customer.subscription.*` handlers in full first (only partially read
during planning). At the point where it currently derives
`tier = lookupKey.includes("business") ? "business" : "pro"` and writes to
`profiles`, branch: if `tier === "business"`, extract `seatTier` from the
subscription/session metadata (Step 2), compute `dailyPoolLimit` from
`{5:50, 10:90, 20:160}[seatTier]`, and upsert a `business_accounts` row
(`stripe_subscription_id` as the natural key for update-vs-insert) instead
of writing `plan: "business"` onto the purchasing user's `profiles` row.
On first creation, also insert a `business_members` row for the purchaser
with `role: "owner"`. On `customer.subscription.deleted` /
non-active-status updates, set `business_accounts.subscription_status`
accordingly (team access is gated by `getActiveTeamMembership`'s
`active`/`trialing` check, so this alone suspends the whole team).

- [ ] **Step 4: Parse-check**

```bash
node --check netlify/functions/create-checkout-session.mjs
node --check netlify/functions/stripe-webhook.mjs
```
(Plain `.mjs`, no esbuild loader needed — `node --check` is enough for a
syntax pass on these two, consistent with them being plain JS not TS.)

- [ ] **Step 5: Live-verify with a real test purchase**

Before merging, run one real Stripe Checkout test (test mode if available,
otherwise flag this explicitly to the account owner before running it live
— do not silently test with real money) for the 10-seat tier and confirm a
`business_accounts` row and an `owner` `business_members` row are created
correctly.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/create-checkout-session.mjs netlify/functions/stripe-webhook.mjs
git commit -m "Add seat-tier checkout and business_accounts webhook provisioning

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: "Manage Business" frontend UI + accept-invite page

**Files:**
- Modify: `public/index.html` (new modal markup, new pricing-card tier
  selector for the Business plan card)
- Modify: `public/script.js` (modal open/close/state logic, API calls to
  the five Task 5 endpoints, sign-in gate for `/accept-invite`)
- Modify: `public/style.css` (modal styling using existing tokens only —
  `--bg:#050a16`, `--glass`/`--glass-strong`/`--glass-border`,
  `--green:#22d3ee`/`--green-bright:#a5f0ff`, `--font-mono`/`--font-body`,
  already defined at the top of the file — no new colors introduced)

**Interfaces:**
- Consumes: `GET /api/business-account`, `POST /api/business-invite`,
  `POST /api/business-invite-accept`, `POST /api/business-member-remove`,
  `GET /api/business-activity` (Task 5); `appState.supabase.auth.signInWithPassword`/
  `signUp` (existing, used elsewhere in `script.js`, e.g. line 569/608).

- [ ] **Step 1: Read the existing modal pattern to match it**

Read the how-to video modal implementation in full (`howtoVideoModal`,
`openHowtoVideo`, the `.video-modal-*` CSS classes) — the Manage Business
modal should reuse this same overlay/close/glass-card structural pattern
rather than inventing a new one, so it looks consistent with the rest of
the site (per the user's "consistent with the existing colors" requirement).

- [ ] **Step 2: Add the modal markup to `index.html`**

A dark glass-card modal (same overlay pattern as the how-to video modal)
containing: team header (seat tier, seats used/cap, pool used-today/limit
progress bar — reuse the `.usage-bar`/progress-bar markup already used for
"Daily Quick Scans"), member roster table (name/email, role badge, usage
today, Remove button for owner), invite email input + button (disabled
with the seat-cap message when full), and an expandable activity-log list
(owner only).

- [ ] **Step 3: Wire it up in `script.js`**

- On successful Business checkout return (`?checkout=success` in the URL,
  already handled somewhere in `script.js` — find that existing handler and
  extend it) or on account load if `isTeamMember` is `true`
  (`account-status.mjs`'s new field from Task 3), fetch
  `/api/business-account` and populate the modal; auto-open it once, right
  after a successful Business checkout.
- Invite button → `POST /api/business-invite` with the entered email,
  show the returned error inline (seat cap, invalid email, etc.) or a
  success confirmation.
- Remove button per member → confirm dialog → `POST /api/business-member-remove`.
- Activity log entries → `GET /api/business-activity`, render full content
  (submitted text/summary, verdict, AI response) per the spec's "full
  content" decision — this is a deliberate design choice, not something to
  soften into metadata-only during implementation.

- [ ] **Step 4: Build the `/accept-invite` page + sign-in gate**

A new lightweight page (either a new static HTML file or a client-side
route handled within `index.html` if this repo already does path-based
client routing — check `public/*.html` and any router logic in `script.js`
before choosing). On load with `?token=...`: check `appState.supabase.auth`
session; if signed out, show the existing sign-in/sign-up form first
(reusing the exact same `signInWithPassword`/`signUp` calls already in
`script.js`); once authenticated, call `POST /api/business-invite-accept`
with the token and show the result (success → "You're on the team", or the
specific error from the endpoint — already-on-a-team, expired, wrong email, etc).

- [ ] **Step 5: Update the Business pricing card for tier selection**

The existing card (`data-monthly="40" data-yearly="384"`, per earlier
this session) needs a tier picker (5/10/20 seats) that changes the
displayed price and the `seatTier` sent to `create-checkout-session.mjs`.

- [ ] **Step 6: Manual browser verification**

Using the browser tools: sign in as a Business owner, open Manage Business,
confirm the roster/pool numbers match what `/api/business-account` returns,
send a test invite to a second test account, sign in as that second
account, open the accept-invite link, confirm sign-in gate appears if
signed out and the accept flow completes, confirm the new member shows up
in the owner's roster.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/script.js public/style.css
git commit -m "Add Manage Business UI and invite-accept flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Pricing page copy + legal page updates

**Files:**
- Modify: `public/index.html` (Business plan section copy — reverse the
  single-seat positioning from PR #4's "One verified account per
  subscription — not a shared team login" language)
- Modify: `public/terms.html`
- Modify: `public/privacy.html`
- Modify: `public/acceptable-use.html`
- Modify: `public/refunds.html`

**Interfaces:** none (content-only changes).

- [ ] **Step 1: Rewrite the Business plan pricing copy**

Replace the single-seat framing with team-plan framing. Must state plainly:
the three tiers and prices (5/$40, 10/$80, 20/$160, monthly; note yearly
pricing too), the shared daily pool per tier (50/90/160), that this is the
accountability/audit-trail differentiator (trace any action back to the
team member who did it), and "need more seats or something custom? Email
cybernetai.26@gmail.com."

- [ ] **Step 2: Terms of Service — add a Business Team Accounts section**

Must state, plainly and specifically (not vaguely): the account owner
controls team membership; members cannot remove themselves from a team —
only the owner can; what happens to a member's Business-tier access if the
subscription is cancelled or lapses (they lose Business access and revert
to their own individual plan, since their own `profiles.plan` was never
overwritten per Task 3's design).

- [ ] **Step 3: Privacy Policy — disclose owner visibility into member activity**

Must state plainly, not buried: on a Business team, the account owner can
view the full content of a member's Quick Scan, Analysis AI, and Recovery
Mode activity — the exact text/screenshot submitted and the full AI
response, not just metadata. This must appear before or during invite
acceptance in spirit (Task 7's accept-invite page should link to this
section), since a person accepting an invite is consenting to this visibility.

- [ ] **Step 4: Acceptable Use — update any single-seat/no-sharing language**

Find and revise whatever language currently discourages account sharing
(from PR #4) so it doesn't contradict the now-legitimate, paid team-seat
feature.

- [ ] **Step 5: Refunds/Cancellation — team cancellation behavior**

State what happens to all members' access when the owner cancels the
subscription (all lose Business access at end of billing period, consistent
with however individual Pro cancellation already works elsewhere on this page).

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/terms.html public/privacy.html public/acceptable-use.html public/refunds.html
git commit -m "Update pricing and legal copy for Business team accounts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Re-record the three how-to GIFs

**Files:**
- Replace: `public/howto/quick-scan.gif`, `public/howto/analysis-ai.gif`,
  `public/howto/recovery-mode.gif`
- Modify: `public/index.html` (bump `script.js`'s `?v=` cache-busting query
  — this exact mistake was made and had to be fixed twice earlier this
  session; do not repeat it a third time)

**Interfaces:** none.

- [ ] **Step 1: Record smoother captures**

Using the same `gif_creator` browser tool used previously this session, but
with deliberate pacing (pause briefly between actions rather than clicking
in rapid succession — the "laggy/choppy" complaint is almost certainly a
frame-rate/pacing artifact of how fast the actions were performed during
capture, not a tool limitation) and on-screen caption overlays explaining
each step (check whether `gif_creator`'s `showActionLabels` export option
already provides this, or whether captions need to be added to the source
page before recording).

- [ ] **Step 2: Use a confidently-classifiable Analysis AI demo message**

Per the spec's note: the previous "Not Sure" result was a legitimate
`inconclusive` verdict for an ambiguous test message, not a bug. Pick a
clearly malicious or clearly safe example for the re-recording so the demo
shows a confident, illustrative result.

- [ ] **Step 3: Bump the cache-busting version and ship**

Follow the exact same branch → parse-check → PR → merge → live-verify
pattern used for every other change this session, including re-confirming
via `fetch(..., {cache:'no-store'})` that the new `?v=` is actually live
before considering this done (per the two prior cache-busting mistakes this
session).

- [ ] **Step 4: Commit**

```bash
git add public/howto/quick-scan.gif public/howto/analysis-ai.gif public/howto/recovery-mode.gif public/index.html
git commit -m "Re-record how-to GIFs with smoother pacing and captions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** all 8 spec sections (data model, plan resolution,
  invite/accept, Manage Business UI, Stripe, pricing copy, legal, video
  re-record) map onto Tasks 1-9 above (data model split across Tasks 1-2 for
  clarity). Recovery-Mode-weighted pool consumption is explicitly listed in
  the spec as deferred (v1.1) — no task implements it; this is intentional,
  not a gap.
- **Corrected assumption:** the original plan-writing prompt assumed
  `analyze.mts`/`recovery-mode.mts`/`recovery-update.mts` import
  `netlify/lib/supabase.mjs` the way `.mjs` functions do. They don't — each
  carries its own duplicated inline copy of this logic. Task 4 was written
  to match the codebase's actual structure, not the incorrect assumption.
- **Real pre-existing bug found during planning:** `recovery-mode.mts`'s
  `consumeRecoveryCase` (line 492) already mislabels Business-plan users as
  "free" in its returned `plan` field (a pre-existing gap, unrelated to the
  team feature, that this project's earlier `analyze.mts`/`quickscan-usage.mjs`
  business-plan fix from this session never reached). Folded into Task 4
  Step 3 since that step already touches the exact same function.
- **Known open risk carried into Task 5:** the invite email-send provider is
  unconfirmed — Task 5 Step 7 makes this an explicit blocking checkpoint
  rather than a silent TODO, so the feature doesn't ship half-working.
