// The Apple In-App Purchase part of tests/run-ios-migration.mjs (supabase/migrations/20261030120000_apple_iap.sql),
// run in the same PGlite database after schema.sql and both migrations are loaded. Not a runner on its own.
import path from "node:path";
import { pathToFileURL } from "node:url";

const GOLDEN = {
  // What the four usage functions answered BEFORE plan_of existed, for an account with no Apple subscription.
  free: { analysis: [3, "free"], quickscan: [5, "free"], recoveryCase: [1, "free"], recoveryUpdate: [1, "free", 21600] },
  pro: { analysis: [15, "pro"], quickscan: [100000, "pro"], recoveryCase: [3, "pro"], recoveryUpdate: [999, "pro", 7200] },
  business: { analysis: [50, "business"], quickscan: [100, "business"], recoveryCase: [20, "business"], recoveryUpdate: [999, "business", 3600] }
};

export async function runApple({ db, q, one, check, read, root, appleMigration }) {
  const uid = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const iso = (ms) => new Date(Date.now() + ms).toISOString();
  const DAY = 86_400_000;
  const mkUser = async (n, email = `apple${n}@example.com`) => {
    await db.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [uid(n), email]);
    await db.query("insert into public.profiles (id, plan, subscription_status) values ($1, 'free', 'inactive') on conflict (id) do nothing", [uid(n)]);
    return uid(n);
  };
  const apply = (o) => one(
    "select * from public.apply_apple_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [o.user, o.otid, o.tid || `${o.otid}9`, o.product || "app.cybernetai.pro.monthly", o.env || "Sandbox", o.purchase ?? iso(-60_000), o.expires ?? iso(30 * DAY),
      o.revoked ?? null, o.reason ?? null, o.auto ?? null, o.grace ?? null, o.signed ?? iso(0), o.type ?? null]
  );
  const row = (otid) => one("select * from public.apple_subscriptions where original_transaction_id = $1", [otid]);
  const team = (id) => one("select * from public.business_accounts where id = $1", [id]);
  const members = async (teamId) => q("select user_id, role, status from public.business_members where business_account_id = $1 order by joined_at", [teamId]);
  const planOf = async (user) => (await one("select public.plan_of($1) as p", [user])).p;
  const ms = (value) => new Date(value).getTime();

  // ── the verify queries from the migration's footer ──
  {
    const v1 = await q(`select 'table' as kind, to_regclass('public.apple_subscriptions')::text as name
      union all select 'table', to_regclass('public.apple_notifications')::text
      union all
      select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('plan_of','apply_apple_subscription','expire_apple_subscriptions')`);
    check("apple verify query 1: 5 rows (2 tables + 3 functions)", v1.length === 5 && v1.filter((r) => r.kind === "table").every((r) => r.name), v1);
    const v2 = await q(`select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'business_accounts' and column_name in ('billing_source','apple_original_transaction_id')`);
    check("apple verify query 2: the two business_accounts columns", v2.length === 2, v2);
    const v3 = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('consume_analysis','consume_recovery_case','consume_recovery_update','consume_quickscan')
        and pg_get_functiondef(p.oid) like '%plan_of%'`);
    check("apple verify query 3: the four usage functions call plan_of", v3.length === 4, v3);
    check("apple: each new function exists exactly once (the migration is idempotent)", (await q("select proname, count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('plan_of','apply_apple_subscription','expire_apple_subscriptions','consume_analysis','consume_quickscan') group by 1")).every((r) => r.n === 1));
  }

  // ── the four usage functions: unchanged for an account with no Apple subscription (golden) ──
  const usage = async (user) => {
    const analysis = await one("select * from public.consume_analysis($1)", [user]);
    const quickscan = await one("select * from public.consume_quickscan($1)", [user]);
    const recoveryCase = await one("select * from public.consume_recovery_case($1)", [user]);
    const u1 = await one("select * from public.consume_recovery_update($1)", [user]);
    const u2 = await one("select * from public.consume_recovery_update($1)", [user]);
    return {
      analysis: [Number(analysis.daily_limit), analysis.plan],
      quickscan: [Number(quickscan.daily_limit), quickscan.plan],
      recoveryCase: [Number(recoveryCase.daily_limit), recoveryCase.plan],
      recoveryUpdate: [Number(u1.daily_limit), u1.plan, Math.round(Number(u2.cooldown_seconds_remaining) / 10) * 10],
      firstUpdateAllowed: u1.allowed
    };
  };
  const goldenOf = (g) => ({ ...g, firstUpdateAllowed: true });
  const FREE = await mkUser(1);
  const STRIPE_PRO = await mkUser(2);
  const STRIPE_BUSINESS = await mkUser(3);
  const CANCELED = await mkUser(4);
  const NO_PROFILE = uid(5);
  await db.query("insert into auth.users (id, email) values ($1, 'noprofile@example.com')", [NO_PROFILE]);
  await db.query("update public.profiles set plan = 'pro', subscription_status = 'active' where id = $1", [STRIPE_PRO]);
  await db.query("update public.profiles set plan = 'business', subscription_status = 'active' where id = $1", [STRIPE_BUSINESS]);
  await db.query("update public.profiles set plan = 'pro', subscription_status = 'canceled' where id = $1", [CANCELED]);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const free = await usage(FREE);
  check("golden: a free account is exactly as before (3 / 5 / 1 / 1 with a 6 h cooldown)", same(free, goldenOf(GOLDEN.free)), free);
  const pro = await usage(STRIPE_PRO);
  check("golden: a Stripe Pro account is exactly as before (15 / unlimited / 3 / no cap with 2 h)", same(pro, goldenOf(GOLDEN.pro)), pro);
  const business = await usage(STRIPE_BUSINESS);
  check("golden: a legacy business profile is exactly as before (50 / 100 / 20 / no cap with 1 h)", same(business, goldenOf(GOLDEN.business)), business);
  const canceled = await usage(CANCELED);
  check("golden: a cancelled Pro profile counts as free", same(canceled, goldenOf(GOLDEN.free)), canceled);
  const none = await usage(NO_PROFILE);
  check("golden: an account with no profile row counts as free", same(none, goldenOf(GOLDEN.free)), none);
  check("plan_of: free / Stripe Pro / legacy business / cancelled / no profile / unknown id",
    (await planOf(FREE)) === "free" && (await planOf(STRIPE_PRO)) === "pro" && (await planOf(STRIPE_BUSINESS)) === "business" && (await planOf(CANCELED)) === "free" && (await planOf(NO_PROFILE)) === "free" && (await planOf(uid(999))) === "free");

  // ── plan_of and the usage functions for Apple Pro: the same limits as Pro bought on the website ──
  const APPLE_PRO = await mkUser(10);
  let r = await apply({ user: APPLE_PRO, otid: "3000000000000010", expires: iso(30 * DAY), auto: true, type: "SUBSCRIBED" });
  check("apply: a new Pro purchase is applied and entitled, with no team", r.result === "applied" && r.entitled === true && r.business_account_id === null, r);
  let stored = await row("3000000000000010");
  check("apply: the row holds product, plan, interval, environment, status and dates", stored.user_id === APPLE_PRO && stored.product_id === "app.cybernetai.pro.monthly" && stored.plan === "pro" && stored.seat_tier === null && stored.billing_interval === "month" && stored.environment === "Sandbox" && stored.status === "active" && stored.auto_renew === true && stored.revoked_at === null && stored.grace_expires_at === null && stored.latest_transaction_id === "30000000000000109" && stored.last_notification_type === "SUBSCRIBED" && ms(stored.expires_at) > Date.now(), stored);
  check("plan_of: an Apple Pro subscription makes the account Pro", (await planOf(APPLE_PRO)) === "pro");
  const appleUsage = await usage(APPLE_PRO);
  check("golden: Apple Pro gets exactly the limits Stripe Pro gets (15 / unlimited / 3 / no cap with 2 h)", same(appleUsage, goldenOf(GOLDEN.pro)), appleUsage);
  check("apply: the profile row is not touched by an Apple purchase", (await one("select plan, subscription_status from public.profiles where id = $1", [APPLE_PRO])).plan === "free");

  // PLAN_LIMITS (what account-status displays) equals what the database enforces
  {
    const { PLAN_LIMITS } = await import(pathToFileURL(path.join(root, "netlify/lib/plans.mjs")).href);
    const asLimits = (g) => ({ analysesPerDay: g.analysis[0], quickScansPerDay: g.quickscan[0], recoveryCasesPerDay: g.recoveryCase[0], recoveryUpdatesPerDay: g.recoveryUpdate[0], recoveryUpdateCooldownSeconds: g.recoveryUpdate[2] });
    check("plans.mjs equals what the database enforces for Free", same(asLimits(free), { ...PLAN_LIMITS.free }), { db: asLimits(free), js: PLAN_LIMITS.free });
    check("plans.mjs equals what the database enforces for Pro bought on the website", same(asLimits(pro), { ...PLAN_LIMITS.pro }), { db: asLimits(pro), js: PLAN_LIMITS.pro });
    check("plans.mjs equals what the database enforces for Pro bought in the app", same(asLimits(appleUsage), { ...PLAN_LIMITS.pro }), { db: asLimits(appleUsage), js: PLAN_LIMITS.pro });
    check("plans.mjs: Business updates are uncapped with a 1 h cooldown, as the database says", PLAN_LIMITS.business.recoveryUpdatesPerDay === GOLDEN.business.recoveryUpdate[0] && PLAN_LIMITS.business.recoveryUpdateCooldownSeconds === GOLDEN.business.recoveryUpdate[2]);
  }

  // ── restore: the same transaction again ──
  {
    const before = await row("3000000000000010");
    r = await apply({ user: APPLE_PRO, otid: "3000000000000010", expires: before.expires_at.toISOString(), signed: iso(1000) });
    const count = Number((await one("select count(*)::int as n from public.apple_subscriptions where original_transaction_id = '3000000000000010'")).n);
    check("restore: the same transaction twice is applied twice, one row, same entitlement", r.result === "applied" && r.entitled === true && count === 1);
    check("restore: a sync from the app without renewal info keeps the stored auto-renew choice", (await row("3000000000000010")).auto_renew === true);
    // Out of order and older data cannot change today's entitlement.
    r = await apply({ user: APPLE_PRO, otid: "3000000000000010", expires: iso(2 * DAY), purchase: iso(-35 * DAY), signed: iso(5000) });
    check("stale: a transaction for an earlier period (older purchase date) is ignored", r.result === "stale" && r.entitled === true && ms((await row("3000000000000010")).expires_at) === ms(before.expires_at));
    r = await apply({ user: APPLE_PRO, otid: "3000000000000010", expires: before.expires_at.toISOString(), signed: iso(-3600_000), revoked: iso(-1000) });
    check("stale: a revocation signed before the stored data is ignored", r.result === "stale" && (await planOf(APPLE_PRO)) === "pro" && (await row("3000000000000010")).revoked_at === null);
  }

  // ── wrong account, deleted account, unknown product ──
  {
    const OTHER = await mkUser(11);
    r = await apply({ user: OTHER, otid: "3000000000000010" });
    check("wrong_account: another account cannot take over a subscription", r.result === "wrong_account" && r.entitled === false && (await row("3000000000000010")).user_id === APPLE_PRO && (await planOf(OTHER)) === "free", r);
    r = await apply({ user: uid(998), otid: "3000000000000998" });
    check("unknown_user: no row is written for an account that does not exist", r.result === "unknown_user" && !(await row("3000000000000998")), r);
    let message = "";
    try { await apply({ user: OTHER, otid: "3000000000000997", product: "app.cybernetai.business50.monthly" }); } catch (error) { message = error.message; }
    check("unknown product: the database refuses it", /Unknown Apple product/.test(message) && !(await row("3000000000000997")), message);
  }

  // ── end of a subscription: expiry, grace, billing retry, refund ──
  {
    const U = await mkUser(12);
    const otid = "3000000000000012";
    await apply({ user: U, otid, expires: iso(10 * DAY), auto: true, signed: iso(-5000) });
    r = await apply({ user: U, otid, expires: iso(-1000), auto: false, type: "EXPIRED", signed: iso(-4000) });
    stored = await row(otid);
    check("expiry: past the end with renewal off -> expired, no longer Pro", r.result === "stale" || (r.entitled === false && stored.status === "expired" && (await planOf(U)) === "free"), { r, stored });
  }
  {
    // (the previous block is "stale" because the new expiry is earlier than the stored one; expiry is shown by the stored end date)
    const U = await mkUser(13);
    const otid = "3000000000000013";
    r = await apply({ user: U, otid, expires: iso(-1000), auto: false, type: "EXPIRED" });
    stored = await row(otid);
    check("expiry: a subscription that is already over is stored as expired and gives nothing", r.result === "applied" && r.entitled === false && stored.status === "expired" && (await planOf(U)) === "free", { r, stored });
    r = await apply({ user: U, otid, expires: iso(30 * DAY), auto: true, type: "DID_RENEW", signed: iso(2000) });
    check("renewal after expiry: Pro again", r.entitled === true && (await row(otid)).status === "active" && (await planOf(U)) === "pro", r);
  }
  {
    const U = await mkUser(14);
    const otid = "3000000000000014";
    r = await apply({ user: U, otid, expires: iso(-3600_000), grace: iso(5 * DAY), auto: true, type: "DID_FAIL_TO_RENEW" });
    stored = await row(otid);
    check("grace: past the end but inside the billing grace period is still Pro", r.entitled === true && stored.status === "grace" && ms(stored.grace_expires_at) > Date.now() && (await planOf(U)) === "pro", { r, stored });
    r = await apply({ user: U, otid, expires: stored.expires_at.toISOString(), auto: true, signed: iso(1000) });
    check("grace: a sync from the app without renewal info does not end the grace period", r.entitled === true && (await row(otid)).status === "grace" && (await planOf(U)) === "pro");
    r = await apply({ user: U, otid, expires: stored.expires_at.toISOString(), grace: null, auto: true, type: "GRACE_PERIOD_EXPIRED", signed: iso(2000) });
    stored = await row(otid);
    check("grace expired: billing retry, no longer Pro", r.entitled === false && stored.status === "billing_retry" && stored.grace_expires_at === null && (await planOf(U)) === "free", { r, stored });
  }
  {
    const U = await mkUser(15);
    const otid = "3000000000000015";
    await apply({ user: U, otid, expires: iso(20 * DAY), auto: true, signed: iso(-9000) });
    r = await apply({ user: U, otid, expires: iso(20 * DAY), auto: true, revoked: iso(-500), reason: 1, type: "REFUND", signed: iso(-8000) });
    stored = await row(otid);
    check("refund: revoked at once, even though the paid period has not ended", r.entitled === false && stored.status === "revoked" && stored.revoked_at !== null && stored.revocation_reason === 1 && (await planOf(U)) === "free", { r, stored });
    r = await apply({ user: U, otid, expires: iso(20 * DAY), auto: true, type: "REFUND_REVERSED", signed: iso(-7000) });
    stored = await row(otid);
    check("refund reversed: Pro again, the revocation cleared", r.entitled === true && stored.status === "active" && stored.revoked_at === null && stored.revocation_reason === null && (await planOf(U)) === "pro", { r, stored });
  }

  // ── an upgrade whose new period ends sooner than the old one (Pro yearly -> Business monthly) ──
  {
    const U = await mkUser(16);
    const otid = "3000000000000016";
    await apply({ user: U, otid, product: "app.cybernetai.pro.yearly", expires: iso(300 * DAY), purchase: iso(-65 * DAY), auto: true, signed: iso(-9000) });
    r = await apply({ user: U, otid, product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), purchase: iso(-1000), auto: true, type: "DID_CHANGE_RENEWAL_PREF", signed: iso(-8000) });
    stored = await row(otid);
    check("upgrade: Pro yearly to Business monthly is applied although it ends sooner (judged by purchase date)", r.result === "applied" && r.entitled === true && r.business_account_id && stored.plan === "business" && stored.product_id === "app.cybernetai.business5.monthly" && ms(stored.expires_at) < Date.now() + 31 * DAY, { r, stored });
    check("upgrade: the person is Business through the new team, not Pro any more", (await planOf(U)) === "free" && (await team(r.business_account_id)).owner_user_id === U);
  }

  // ── Business: the team, the pools, the seat changes ──
  const OWNER = await mkUser(20);
  const BIZ = "3000000000000020";
  let teamId;
  {
    r = await apply({ user: OWNER, otid: BIZ, product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true, type: "SUBSCRIBED", signed: iso(-9000) });
    teamId = r.business_account_id;
    const t = await team(teamId);
    check("business: a Business 5 purchase creates the team", r.result === "applied" && r.entitled === true && teamId && t.owner_user_id === OWNER && t.seat_tier === 5 && t.daily_pool_limit === 50 && t.recovery_pool_limit === 20 && t.billing_source === "apple" && t.billing_interval === "month" && t.apple_original_transaction_id === BIZ && t.subscription_status === "active" && t.stripe_subscription_id === null, { r, t });
    const m = await members(teamId);
    check("business: the owner is the team's active owner member", m.length === 1 && m[0].user_id === OWNER && m[0].role === "owner" && m[0].status === "active", m);
    stored = await row(BIZ);
    check("business: the Apple row records seats and links to the team", stored.plan === "business" && stored.seat_tier === 5 && stored.business_account_id === teamId, stored);
    check("business: the team's shared pools answer 50 and 20", Number((await one("select * from public.consume_analysis_business($1)", [teamId])).daily_limit) === 50 && Number((await one("select * from public.consume_recovery_case_business($1)", [teamId])).daily_limit) === 20);
    check("business: plan_of is about the person, the team gives Business (so the owner's own plan stays free)", (await planOf(OWNER)) === "free");
    check("business: the team shows up as the owner's active membership (what getActiveTeamMembership reads)", (await q(`select m.role, a.billing_source from public.business_members m join public.business_accounts a on a.id = m.business_account_id
      where m.user_id = $1 and m.status = 'active' and a.subscription_status in ('active','trialing')`, [OWNER])).length === 1);

    // seat changes keep the same team and the same single owner membership
    const { SEAT_POOL_LIMITS } = await import(pathToFileURL(path.join(root, "netlify/lib/business-seats.mjs")).href);
    let tick = 0;
    for (const [product, seats, daily, recovery] of [["app.cybernetai.business10.monthly", 10, 90, 36], ["app.cybernetai.business20.monthly", 20, 160, 64], ["app.cybernetai.business5.monthly", 5, 50, 20]]) {
      r = await apply({ user: OWNER, otid: BIZ, product, expires: iso(30 * DAY), auto: true, type: "DID_CHANGE_RENEWAL_PREF", signed: iso(1000 * ++tick) });
      const u = await team(teamId);
      check(`business: change to ${seats} seats -> same team, pools ${daily} / ${recovery}`, r.result === "applied" && r.business_account_id === teamId && u.seat_tier === seats && u.daily_pool_limit === daily && u.recovery_pool_limit === recovery && (await members(teamId)).length === 1 && Number((await q("select count(*)::int as n from public.business_accounts where owner_user_id = $1", [OWNER]))[0].n) === 1 && SEAT_POOL_LIMITS[seats].dailyPoolLimit === daily && SEAT_POOL_LIMITS[seats].recoveryPoolLimit === recovery, { r, u });
    }
  }

  // ── the sweep ──
  {
    await db.query("update public.apple_subscriptions set expires_at = now() - interval '2 hours', auto_renew = false where original_transaction_id = $1", [BIZ]);
    const swept = await one("select public.expire_apple_subscriptions() as n");
    stored = await row(BIZ);
    check("sweep: an ended, non-renewing Business subscription is expired and its team closed", Number(swept.n) >= 1 && stored.status === "expired" && (await team(teamId)).subscription_status === "canceled", { swept, stored });
    check("sweep: a closed team no longer counts as the owner's membership", (await q(`select 1 from public.business_members m join public.business_accounts a on a.id = m.business_account_id
      where m.user_id = $1 and m.status = 'active' and a.subscription_status in ('active','trialing')`, [OWNER])).length === 0);
    check("sweep: running it again changes nothing", Number((await one("select public.expire_apple_subscriptions() as n")).n) === 0);
    r = await apply({ user: OWNER, otid: BIZ, product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true, type: "DID_RENEW", signed: iso(5000) });
    check("renewal after the sweep: the same team opens again with its owner", r.entitled === true && r.business_account_id === teamId && (await team(teamId)).subscription_status === "active" && (await members(teamId)).length === 1, r);

    await db.query("update public.apple_subscriptions set expires_at = now() - interval '2 hours', auto_renew = true where original_transaction_id = $1", [BIZ]);
    await one("select public.expire_apple_subscriptions() as n");
    check("sweep: an ended subscription that is still set to renew goes to billing retry, its team to past_due", (await row(BIZ)).status === "billing_retry" && (await team(teamId)).subscription_status === "past_due");
    await db.query("update public.apple_subscriptions set expires_at = now() - interval '61 days' where original_transaction_id = $1", [BIZ]);
    await one("select public.expire_apple_subscriptions() as n");
    check("sweep: 60 days in billing retry is expired and the team canceled", (await row(BIZ)).status === "expired" && (await team(teamId)).subscription_status === "canceled");
    await db.query("update public.apple_subscriptions set expires_at = now() + interval '9 days', auto_renew = true, status = 'active' where original_transaction_id = $1", [BIZ]);
    await db.query("update public.business_accounts set subscription_status = 'active' where id = $1", [teamId]);
    const grace = await mkUser(21);
    await apply({ user: grace, otid: "3000000000000021", expires: iso(-3600_000), grace: iso(2 * DAY), auto: true, type: "DID_FAIL_TO_RENEW" });
    const before = Number((await one("select public.expire_apple_subscriptions() as n")).n);
    check("sweep: a subscription inside its grace period is left alone", before === 0 && (await row("3000000000000021")).status === "grace");
  }

  // ── a Business subscription that changes to Pro closes the team ──
  {
    const U = await mkUser(22);
    const otid = "3000000000000022";
    r = await apply({ user: U, otid, product: "app.cybernetai.business10.monthly", expires: iso(10 * DAY), auto: true, signed: iso(-9000) });
    const id = r.business_account_id;
    r = await apply({ user: U, otid, product: "app.cybernetai.pro.yearly", expires: iso(365 * DAY), auto: true, type: "DID_CHANGE_RENEWAL_PREF", signed: iso(-8000) });
    check("business -> pro on the same subscription: Pro now, the attached team is closed and unlinked", r.result === "applied" && r.entitled === true && r.business_account_id === null && (await team(id)).subscription_status === "canceled" && (await row(otid)).business_account_id === null && (await row(otid)).plan === "pro" && (await row(otid)).billing_interval === "year" && (await planOf(U)) === "pro", { r, t: await team(id) });
  }

  // ── a Business team that Stripe bills ──
  {
    const STRIPE_OWNER = await mkUser(23);
    const stripeTeam = (await one(`insert into public.business_accounts (owner_user_id, seat_tier, daily_pool_limit, recovery_pool_limit, stripe_customer_id, stripe_subscription_id, subscription_status, billing_interval)
      values ($1, 10, 90, 36, 'cus_x', 'sub_x', 'active', 'month') returning id`, [STRIPE_OWNER])).id;
    await db.query("insert into public.business_members (business_account_id, user_id, role) values ($1, $2, 'owner')", [stripeTeam, STRIPE_OWNER]);
    r = await apply({ user: STRIPE_OWNER, otid: "3000000000000023", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true });
    const t = await team(stripeTeam);
    check("conflict_web_plan: an active Stripe team is left exactly as it was", r.result === "conflict_web_plan" && r.business_account_id === null && t.billing_source === "stripe" && t.seat_tier === 10 && t.daily_pool_limit === 90 && t.stripe_subscription_id === "sub_x" && t.subscription_status === "active" && t.apple_original_transaction_id === null, { r, t });
    check("conflict_web_plan: the Apple purchase is still stored (paid) and unlinked", (await row("3000000000000023")).user_id === STRIPE_OWNER && (await row("3000000000000023")).business_account_id === null);
    await db.query("update public.business_accounts set subscription_status = 'past_due' where id = $1", [stripeTeam]);
    r = await apply({ user: STRIPE_OWNER, otid: "3000000000000023", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true, signed: iso(1000) });
    check("conflict_web_plan: a Stripe team still being retried (past_due) is not taken over either", r.result === "conflict_web_plan" && (await team(stripeTeam)).billing_source === "stripe");
    await db.query("update public.business_accounts set subscription_status = 'canceled' where id = $1", [stripeTeam]);
    r = await apply({ user: STRIPE_OWNER, otid: "3000000000000023", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true, signed: iso(2000) });
    const taken = await team(stripeTeam);
    check("takeover: a closed Stripe team becomes the Apple-billed team (same row, Stripe ids dropped)", r.result === "applied" && r.business_account_id === stripeTeam && taken.billing_source === "apple" && taken.seat_tier === 5 && taken.daily_pool_limit === 50 && taken.stripe_subscription_id === null && taken.stripe_customer_id === null && taken.subscription_status === "active" && taken.apple_original_transaction_id === "3000000000000023", { r, taken });
    check("takeover: the owner membership was already there and is not duplicated", (await members(stripeTeam)).length === 1);
  }

  // ── an older Apple chain cannot disturb a team that a newer chain pays ──
  {
    const U = await mkUser(24);
    r = await apply({ user: U, otid: "3000000000000024", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true });
    const id = r.business_account_id;
    r = await apply({ user: U, otid: "3000000000000025", product: "app.cybernetai.business5.monthly", expires: iso(-5 * DAY), auto: false, type: "EXPIRED" });
    const t = await team(id);
    check("old chain: an expired earlier subscription leaves the team that a newer one pays untouched", r.entitled === false && t.subscription_status === "active" && t.apple_original_transaction_id === "3000000000000024", { r, t });
  }

  // ── belonging to someone else's team ──
  {
    const HOST = await mkUser(30);
    const GUEST = await mkUser(31);
    const hostTeam = (await apply({ user: HOST, otid: "3000000000000030", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true })).business_account_id;
    await db.query("insert into public.business_members (business_account_id, user_id, role) values ($1, $2, 'member')", [hostTeam, GUEST]);
    r = await apply({ user: GUEST, otid: "3000000000000031", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true });
    check("in_other_team: a member of another team keeps the paid subscription but gets no second team", r.result === "in_other_team" && r.entitled === true && r.business_account_id === null && Number((await q("select count(*)::int as n from public.business_accounts where owner_user_id = $1", [GUEST]))[0].n) === 0 && (await row("3000000000000031")).user_id === GUEST && (await row("3000000000000031")).business_account_id === null, r);
    check("in_other_team: they are still just a member of the host's team", (await members(hostTeam)).filter((m) => m.status === "active").length === 2);
    await db.query("update public.business_members set status = 'removed', removed_at = now() where business_account_id = $1 and user_id = $2", [hostTeam, GUEST]);
    r = await apply({ user: GUEST, otid: "3000000000000031", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true, signed: iso(3000) });
    check("in_other_team: after leaving, a Restore attaches their own team", r.result === "applied" && r.business_account_id && (await team(r.business_account_id)).owner_user_id === GUEST && (await members(r.business_account_id)).some((m) => m.user_id === GUEST && m.role === "owner" && m.status === "active"), r);
  }

  // ── a removed owner membership comes back with a new entitled period ──
  {
    const U = await mkUser(32);
    const id = (await apply({ user: U, otid: "3000000000000032", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true })).business_account_id;
    await db.query("update public.business_members set status = 'removed', removed_at = now() where business_account_id = $1 and user_id = $2", [id, U]);
    r = await apply({ user: U, otid: "3000000000000032", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true, signed: iso(2000) });
    check("owner membership: re-activated on the existing row, not duplicated", r.business_account_id === id && (await members(id)).length === 1 && (await members(id))[0].status === "active", await members(id));
  }

  // ── account deletion ──
  {
    const U = await mkUser(33);
    const id = (await apply({ user: U, otid: "3000000000000033", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true })).business_account_id;
    // what netlify/functions/privacy-data.mts does: close and remove the team, then the auth user
    await db.query("update public.business_accounts set subscription_status = 'canceled' where id = $1", [id]);
    await db.query("delete from public.business_members where business_account_id = $1", [id]);
    await db.query("delete from public.business_accounts where id = $1", [id]);
    check("deletion: removing the team does not need the Apple row removed first (set null)", (await row("3000000000000033")).business_account_id === null);
    await db.query("delete from public.profiles where id = $1", [U]);
    await db.query("delete from auth.users where id = $1", [U]);
    check("deletion: Apple subscriptions go with the auth user", !(await row("3000000000000033")));
    r = await apply({ user: U, otid: "3000000000000033", product: "app.cybernetai.business5.monthly", expires: iso(30 * DAY), auto: true });
    check("deletion: a later notification for the deleted account is unknown_user, nothing stored", r.result === "unknown_user" && !(await row("3000000000000033")), r);
  }

  // ── constraints ──
  {
    const U = await mkUser(34);
    const bad = async (sql, params) => { try { await db.query(sql, params); return "inserted"; } catch (error) { return error.code || error.message; } };
    const base = (over) => ["3000000000000034", U, over.product || "app.cybernetai.pro.monthly", over.plan || "pro", over.seat ?? null, over.interval || "month", over.env || "Production", iso(DAY)];
    const sql = "insert into public.apple_subscriptions (original_transaction_id, user_id, product_id, plan, seat_tier, billing_interval, environment, expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8)";
    check("constraints: a product outside the catalog is refused", (await bad(sql, base({ product: "app.cybernetai.enterprise" }))) === "23514");
    check("constraints: business without seats is refused", (await bad(sql, base({ plan: "business", product: "app.cybernetai.business5.monthly" }))) === "23514");
    check("constraints: pro with seats is refused", (await bad(sql, base({ seat: 5 }))) === "23514");
    check("constraints: seats other than 5, 10, 20 are refused", (await bad(sql, base({ plan: "business", seat: 7, product: "app.cybernetai.business5.monthly" }))) === "23514");
    check("constraints: an unknown environment is refused", (await bad(sql, base({ env: "Xcode" }))) === "23514");
    check("constraints: an unknown billing interval is refused", (await bad(sql, base({ interval: "week" }))) === "23514");
    check("constraints: a status outside the list is refused", (await bad("update public.apple_subscriptions set status = 'paused' where original_transaction_id = '3000000000000010'", [])) === "23514");
    check("constraints: billing_source must be stripe or apple", (await bad("update public.business_accounts set billing_source = 'paypal' where id = $1", [teamId])) === "23514");
    const spare = (await one("insert into public.business_accounts (owner_user_id, seat_tier, daily_pool_limit, recovery_pool_limit) values ($1, 5, 50, 20) returning id", [U])).id;
    check("constraints: one team per Apple subscription (unique apple_original_transaction_id)", (await bad("update public.business_accounts set apple_original_transaction_id = $2 where id = $1", [spare, BIZ])) === "23505");
    check("constraints: a new team row defaults to billing_source stripe with no Apple id", (await one("select billing_source, apple_original_transaction_id from public.business_accounts where id = $1", [spare])).billing_source === "stripe");
    check("constraints: apple_notifications outcome must be one of the planned values", (await bad("insert into public.apple_notifications (notification_uuid, notification_type, outcome) values ('7d6f5f3e-0c3b-4f64-9d0e-2f6a1d9c8b11', 'DID_RENEW', 'maybe')", [])) === "23514");
    check("constraints: apple_notifications keeps a notification id only once and defaults to outcome 'error'", (await bad("insert into public.apple_notifications (notification_uuid, notification_type) values ('7d6f5f3e-0c3b-4f64-9d0e-2f6a1d9c8b12', 'DID_RENEW')", [])) === "inserted"
      && (await bad("insert into public.apple_notifications (notification_uuid, notification_type) values ('7d6f5f3e-0c3b-4f64-9d0e-2f6a1d9c8b12', 'DID_RENEW')", [])) === "23505"
      && (await one("select outcome from public.apple_notifications where notification_uuid = '7d6f5f3e-0c3b-4f64-9d0e-2f6a1d9c8b12'")).outcome === "error");
  }

  // ── grants, RLS, definer, search_path ──
  {
    const FUNCTIONS = [
      "public.plan_of(uuid)",
      "public.apply_apple_subscription(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, timestamptz, timestamptz, text)",
      "public.expire_apple_subscriptions()",
      "public.consume_analysis(uuid)", "public.consume_quickscan(uuid)", "public.consume_recovery_case(uuid)", "public.consume_recovery_update(uuid)"
    ];
    for (const fn of FUNCTIONS) {
      const g = await one(`select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authed, has_function_privilege('service_role', $1, 'execute') as service`, [fn]);
      check(`grants: only service_role may run ${fn.split("(")[0]}`, g.anon === false && g.authed === false && g.service === true, g);
    }
    for (const table of ["public.apple_subscriptions", "public.apple_notifications"]) {
      const g = await one(`select
        has_table_privilege('anon', $1, 'select') as anon_select, has_table_privilege('authenticated', $1, 'select') as authed_select,
        has_table_privilege('authenticated', $1, 'insert') as authed_insert, has_table_privilege('authenticated', $1, 'update') as authed_update, has_table_privilege('authenticated', $1, 'delete') as authed_delete,
        has_table_privilege('service_role', $1, 'select') as s_select, has_table_privilege('service_role', $1, 'insert') as s_insert,
        has_table_privilege('service_role', $1, 'update') as s_update, has_table_privilege('service_role', $1, 'delete') as s_delete,
        has_table_privilege('service_role', $1, 'truncate') as s_truncate`, [table]);
      check(`grants: ${table} is service_role only (select, insert, update, delete; no truncate)`, !g.anon_select && !g.authed_select && !g.authed_insert && !g.authed_update && !g.authed_delete && g.s_select && g.s_insert && g.s_update && g.s_delete && !g.s_truncate, g);
      const rls = await one("select relrowsecurity as on from pg_class where oid = $1::regclass", [table]);
      const policies = await q("select policyname from pg_policies where schemaname = 'public' and tablename = $1", [table.replace("public.", "")]);
      check(`rls: on for ${table}, with no policies (the browser never reads it)`, rls.on === true && policies.length === 0, { rls, policies });
    }
    const defs = await q(`select p.proname, p.prosecdef, p.proconfig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('plan_of','apply_apple_subscription','expire_apple_subscriptions')`);
    check("functions: security definer with search_path = public, pg_temp", defs.length === 3 && defs.every((f) => f.prosecdef === true && (f.proconfig || []).some((c) => /^search_path=public, pg_temp$/.test(c))), defs);
    const idx = await q("select indexname from pg_indexes where schemaname = 'public' and tablename in ('apple_subscriptions','apple_notifications') order by 1");
    check("indexes: user, expiry and received_at lookups exist", ["apple_notifications_received_idx", "apple_subscriptions_expires_idx", "apple_subscriptions_user_idx"].every((n) => idx.some((i) => i.indexname === n)), idx);
  }

  // ── the migration's own text ──
  {
    const text = appleMigration;
    const create = text.indexOf("create table if not exists public.apple_subscriptions");
    const rls = text.indexOf("alter table public.apple_subscriptions enable row level security");
    const grant = text.indexOf("grant select, insert, update, delete on table public.apple_subscriptions to service_role");
    check("migration text: CREATE TABLE, then ENABLE ROW LEVEL SECURITY, then the grants (CLAUDE.md order)", create > 0 && rls > create && grant > rls);
    check("migration text: begin / commit, verify query and rollback block, who applies it", /^begin;$/m.test(text) && /^commit;$/m.test(text) && /Verify/.test(text) && /Roll back/.test(text) && /WHO APPLIES IT/.test(text) && /SAFE TO RE-RUN/.test(text));
    check("migration text: no secret, key or JWS in the repo", !/eyJ|BEGIN (PRIVATE|CERTIFICATE)|sk_live|sk_test/.test(text));
  }

  // ═════════ the Netlify functions against this database ═════════
  await bridgeSection({ db, q, one, check, root, uid, iso, mkUser, planOf, DAY });
}

// A small PostgREST-shaped stand-in over PGlite: just the requests apple-verify.mjs,
// apple-notifications.mjs and netlify/lib/supabase.mjs make.
async function bridgeSection({ db, q, one, check: baseCheck, root, uid, iso, mkUser, planOf, DAY }) {
  process.env.NODE_ENV = "test";
  const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const helper = await imp("tests/apple-jws-helper.mjs");
  const jws = await imp("netlify/lib/apple-jws.mjs");
  const verifyFn = (await imp("netlify/functions/apple-verify.mjs")).default;
  const notifyFn = (await imp("netlify/functions/apple-notifications.mjs")).default;
  const chain = helper.makeChain();
  jws.setTrustedRootsForTests([chain.rootDer]);

  const SUPABASE = "https://stub-project.supabase.test";
  globalThis.Netlify = { env: { get: (name) => ({ SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", ERROR_ALERTS: "off" })[name] } };
  const savedFetch = globalThis.fetch;
  const savedConsole = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  // check() prints failures with console.log, which is silenced while the functions run.
  const check = (...args) => { const quiet = console.log; console.log = savedConsole.log; try { baseCheck(...args); } finally { console.log = quiet; } };

  const U1 = await mkUser(50), U2 = await mkUser(51);
  const tokens = { "b-1": { id: U1, email: "apple50@example.com" }, "b-2": { id: U2, email: "apple51@example.com" } };
  const json = (data, status = 200) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const COLS = new Set(["original_transaction_id", "product_id", "plan", "seat_tier", "billing_interval", "environment", "expires_at", "grace_expires_at", "auto_renew", "status", "revoked_at", "business_account_id", "user_id"]);

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    const auth = headers.get("authorization") || "";
    const target = decodeURIComponent(url.pathname + url.search);
    let body;
    try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = undefined; }
    if (url.origin !== SUPABASE) throw new Error(`unexpected fetch ${url}`);
    if (url.pathname === "/auth/v1/user") {
      const user = tokens[auth.replace(/^Bearer /, "")];
      return user ? json(user) : json({ msg: "invalid JWT" }, 401);
    }
    if (auth !== "Bearer stub-service") return json({ message: "service key required" }, 401);
    const param = (name) => url.searchParams.get(name)?.replace(/^eq\./, "");

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      const keys = Object.keys(body || {});
      try {
        const meta = await one("select p.proretset from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1", [fn]);
        if (!meta) return json({ message: `no function ${fn}` }, 404);
        const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
        const rows = (await db.query(`select * from ${call}`, keys.map((k) => body[k]))).rows;
        if (meta.proretset) return json(rows);
        const value = rows[0] ? Object.values(rows[0])[0] : null;
        return json(value);
      } catch (error) {
        return json({ message: error.message, code: error.code }, 400);
      }
    }
    if (url.pathname === "/rest/v1/profiles" && method === "GET") {
      const rows = (await db.query("select id, full_name, plan, subscription_status, billing_interval, stripe_customer_id, stripe_subscription_id, created_at, updated_at from public.profiles where id = $1", [param("id")])).rows;
      return json(rows);
    }
    if (url.pathname === "/rest/v1/apple_subscriptions" && method === "GET") {
      const cols = (url.searchParams.get("select") || "user_id").split(",").filter((c) => COLS.has(c));
      if (param("original_transaction_id")) return json((await db.query(`select ${cols.join(",")} from public.apple_subscriptions where original_transaction_id = $1`, [param("original_transaction_id")])).rows);
      return json((await db.query(`select ${cols.join(",")} from public.apple_subscriptions where user_id = $1 order by expires_at desc limit 20`, [param("user_id")])).rows);
    }
    if (url.pathname === "/rest/v1/business_members" && method === "GET") {
      const rows = (await db.query(`select m.role, a.id, a.seat_tier, a.daily_pool_limit, a.recovery_pool_limit, a.subscription_status, a.billing_source
        from public.business_members m join public.business_accounts a on a.id = m.business_account_id where m.user_id = $1 and m.status = 'active'`, [param("user_id")])).rows;
      return json(rows.map((r) => ({ role: r.role, business_accounts: { id: r.id, seat_tier: r.seat_tier, daily_pool_limit: r.daily_pool_limit, recovery_pool_limit: r.recovery_pool_limit, subscription_status: r.subscription_status, billing_source: r.billing_source } })));
    }
    if (url.pathname === "/rest/v1/apple_notifications") {
      if (method === "POST") {
        const rows = (await db.query(`insert into public.apple_notifications (notification_uuid, notification_type, subtype, environment, original_transaction_id, signed_date, outcome)
          values ($1,$2,$3,$4,$5,$6,$7) on conflict (notification_uuid) do nothing returning *`, [body.notification_uuid, body.notification_type, body.subtype, body.environment, body.original_transaction_id, body.signed_date, body.outcome])).rows;
        return json(rows, 201);
      }
      if (method === "GET") return json((await db.query("select outcome from public.apple_notifications where notification_uuid = $1", [param("notification_uuid")])).rows);
      if (method === "PATCH") {
        await db.query("update public.apple_notifications set outcome = $2, original_transaction_id = coalesce($3, original_transaction_id) where notification_uuid = $1", [param("notification_uuid"), body.outcome, body.original_transaction_id ?? null]);
        return new Response(null, { status: 204 });
      }
    }
    return json([]);
  };

  const SITE = "https://cybernetai.app";
  const post = (fn, pathname, token, body) => fn(new Request(`${SITE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CyberNet-Platform": "ios", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  }), { ip: "203.0.113.9", requestId: "req" }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));
  const verify = (token, transactions, reason = "purchase") => post(verifyFn, "/api/apple-verify", token, { reason, transactions });
  const jwsFor = (userId, over) => helper.signJws(chain, helper.transactionPayload({ appAccountToken: userId, ...over }));

  try {
    // Pro monthly, bought in the app
    const FIXED = Date.now();
    let res = await verify("b-1", [{ jws: jwsFor(U1, { __now: FIXED, originalTransactionId: "4000000000000001", transactionId: "4000000000000011" }) }]);
    check("end to end: a Pro purchase through /api/apple-verify is applied by the real SQL function", res.status === 200 && res.data.results[0].status === "applied" && res.data.plan === "pro" && res.data.billing.source === "apple" && res.data.billing.productId === "app.cybernetai.pro.monthly" && res.data.billing.autoRenew === true && res.data.billing.alsoBilledElsewhere === false, res);
    const limits = await one("select * from public.consume_analysis($1)", [U1]);
    check("end to end: the same person then has Pro's 15 AI analyses a day", Number(limits.daily_limit) === 15 && limits.plan === "pro", limits);
    // restore twice
    const again = await verify("b-1", [{ jws: jwsFor(U1, { __now: FIXED, originalTransactionId: "4000000000000001", transactionId: "4000000000000011" }) }], "restore");
    const rows = await q("select count(*)::int as n from public.apple_subscriptions where user_id = $1", [U1]);
    check("end to end: restoring the same purchase is idempotent (one row, same answer)", again.status === 200 && JSON.stringify(again.data.billing) === JSON.stringify(res.data.billing) && Number(rows[0].n) === 1, again);
    // another account cannot claim it, even with a valid signature
    res = await verify("b-2", [{ jws: jwsFor(U1, { originalTransactionId: "4000000000000001", transactionId: "4000000000000011" }) }], "restore");
    check("end to end: another signed-in account cannot use someone else's purchase", res.data.results[0].status === "wrong_account" && (await planOf(U2)) === "free", res);
    // a stolen token claim: the transaction names U2 but the JWS reuses U1's subscription id
    res = await verify("b-2", [{ jws: jwsFor(U2, { originalTransactionId: "4000000000000001", transactionId: "4000000000000012" }) }], "restore");
    check("end to end: naming yourself in the token does not take over someone else's subscription (database says wrong_account)", res.data.results[0].status === "wrong_account" && (await planOf(U2)) === "free", res);

    // Business 10 seats
    res = await verify("b-2", [{ jws: jwsFor(U2, { originalTransactionId: "4000000000000002", transactionId: "4000000000000021", productId: "app.cybernetai.business10.monthly" }) }]);
    const t = await one("select * from public.business_accounts where owner_user_id = $1", [U2]);
    check("end to end: a Business 10 purchase creates the team and the reply says Business with 10 seats", res.status === 200 && res.data.plan === "business" && res.data.billing.source === "apple" && res.data.billing.seatTier === 10 && t.daily_pool_limit === 90 && t.recovery_pool_limit === 36 && t.billing_source === "apple", { res: res.data, t });

    // notifications: auto-renew switched off, then expiry
    const nowMs = Date.now();
    const sendNote = (type, txOver, renewal, subtype) => post(notifyFn, "/api/apple-notifications", "", { signedPayload: helper.signJws(chain, helper.notificationPayload({ type, subtype, uuid: crypto.randomUUID(), chain, tx: helper.transactionPayload({ appAccountToken: U1, originalTransactionId: "4000000000000001", transactionId: "4000000000000013", signedDate: nowMs + 5000, ...txOver }), renewal: renewal && helper.renewalPayload({ originalTransactionId: "4000000000000001", signedDate: nowMs + 5000, ...renewal }), signedDate: nowMs + 5000 })) });
    let n = await sendNote("DID_CHANGE_RENEWAL_STATUS", {}, { autoRenewStatus: 0 }, "AUTO_RENEW_DISABLED");
    const afterOff = await one("select auto_renew, status from public.apple_subscriptions where original_transaction_id = '4000000000000001'");
    check("end to end: a DID_CHANGE_RENEWAL_STATUS notification switches auto-renew off in the database", n.status === 200 && n.data.outcome === "applied" && afterOff.auto_renew === false && afterOff.status === "active", { n, afterOff });
    const stats = await one("select outcome from public.apple_notifications order by received_at desc limit 1");
    check("end to end: the notification is stored with its outcome", stats.outcome === "applied", stats);
    // the period really ends: the stored end moves into the past, and Apple's EXPIRED carries that same end date
    const endedAt = nowMs - 5000;
    await db.query("update public.apple_subscriptions set expires_at = $2 where original_transaction_id = $1", ["4000000000000001", new Date(endedAt).toISOString()]);
    n = await sendNote("EXPIRED", { expiresDate: endedAt, signedDate: nowMs + 9000 }, { autoRenewStatus: 0, signedDate: nowMs + 9000 }, "VOLUNTARY");
    const expired = await one("select status from public.apple_subscriptions where original_transaction_id = '4000000000000001'");
    check("end to end: an EXPIRED notification ends Pro", n.status === 200 && n.data.outcome === "applied" && (await planOf(U1)) === "free" && expired.status === "expired", { n, expired });
    // a refund of the Business subscription closes the team
    const refund = await post(notifyFn, "/api/apple-notifications", "", { signedPayload: helper.signJws(chain, helper.notificationPayload({ type: "REFUND", uuid: crypto.randomUUID(), chain, tx: helper.transactionPayload({ appAccountToken: U2, originalTransactionId: "4000000000000002", transactionId: "4000000000000022", productId: "app.cybernetai.business10.monthly", revocationDate: nowMs + 11000, revocationReason: 0, signedDate: nowMs + 11000 }), signedDate: nowMs + 11000 })) });
    const closed = await one("select subscription_status from public.business_accounts where owner_user_id = $1", [U2]);
    check("end to end: a REFUND notification closes the Business team", refund.status === 200 && closed.subscription_status === "canceled", { refund, closed });
    // deleted account
    const GONE = uid(60);
    const orphan = await post(notifyFn, "/api/apple-notifications", "", { signedPayload: helper.signJws(chain, helper.notificationPayload({ type: "DID_RENEW", uuid: crypto.randomUUID(), chain, tx: helper.transactionPayload({ appAccountToken: GONE, originalTransactionId: "4000000000000099", transactionId: "4000000000000098" }), signedDate: nowMs })) });
    check("end to end: a notification for a deleted account is 200 unknown_user and stores no subscription", orphan.status === 200 && orphan.data.outcome === "unknown_user" && Number((await one("select count(*)::int as n from public.apple_subscriptions where original_transaction_id = '4000000000000099'")).n) === 0, orphan);
  } finally {
    jws.setTrustedRootsForTests(null);
    globalThis.fetch = savedFetch;
    Object.assign(console, savedConsole);
  }
}
