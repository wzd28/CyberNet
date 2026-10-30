import { json, verifyUser } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { fetchWithJwtRetry, RETRY_STANDARD } from "../lib/supabase-retry.mjs";
import { withCors } from "../lib/cors.mjs";
import { makeStripe, cancelOpenSubscriptions } from "../lib/billing-cancel.mjs";
import { revokeAppleTokens, cleanAuthorizationCode, hasAppleIdentity, appleConfig, appleSubOf } from "../lib/apple-siwa.mjs";

// Privacy controls for the signed-in user: export, clear-history and
// delete-account. Every request is checked against the caller's own Supabase
// JWT (verifyUser); the service role is used only after that check, and only
// on rows that belong to that user (or to a closed team the user owns).
//
// Errors carry a machine `code` and a plain-language `error` message, so the
// Account panel can show the right next step.
//
// Deletion is immediate (owner answer 7, 29 Oct 2026; App Review 5.1.1(v)):
// an open paid plan no longer blocks it. Every open Stripe subscription the
// account pays for (its own plan and any Business team it owns) is cancelled
// at once, with no refund or credit for unused time, before anything is
// deleted. If the plan cannot be cancelled, nothing is deleted. A Sign in with
// Apple account's tokens are revoked afterwards (lib/apple-siwa.mjs).

// Deny by default: only these Stripe statuses mean nobody can be billed any
// more. Everything else (active, trialing, past_due, unpaid, incomplete,
// paused, or a status Stripe adds later) counts as open. stripe-webhook.mjs
// stores Stripe's status as it arrives, and an "incomplete" subscription
// becomes active when a delayed first payment goes through.
const CLOSED_SUBSCRIPTION = ["inactive", "canceled", "incomplete_expired"];
const SUPPORT_EMAIL = "support@cybernetai.app";

const MESSAGES = {
  NOT_CONFIGURED: `Privacy controls are not available right now. Please try again later, or email ${SUPPORT_EMAIL}.`,
  BILLING_NOT_CONFIGURED:
    "Your account has a paid plan, and we can't cancel it automatically right now, so your account has not been deleted " +
    `and nothing was changed. Please try again later, or email ${SUPPORT_EMAIL} and we will cancel the plan and remove your account for you.`,
  SUBSCRIPTION_CANCEL_FAILED:
    "We couldn't cancel your paid plan with our payment provider, so your account has not been deleted. " +
    `Please try again in a few minutes. If this keeps happening, email ${SUPPORT_EMAIL} and we will cancel the plan and remove your account for you.`,
  // No plan was known to be open; only the check for a stray subscription
  // at Stripe failed (an outage), so the message does not talk about a plan.
  BILLING_CHECK_FAILED:
    "We couldn't confirm with our payment provider that nothing is still charging this account, so your account has not been deleted. " +
    `Please try again in a few minutes. If this keeps happening, email ${SUPPORT_EMAIL} and we will remove your account for you.`,
  TEAM_ACTIVE:
    "Your Business team's plan changed while your account was being deleted, so the deletion stopped and your account " +
    `and sign-in still work. Please press Delete again in a few minutes. If this keeps happening, email ${SUPPORT_EMAIL}.`,
  CONFIRMATION_REQUIRED: "Type DELETE in the box to confirm that you want to delete your account.",
  DELETE_FAILED:
    "We could not finish deleting your account, so it is still open. Please try again in a few minutes. " +
    `If this keeps happening, email ${SUPPORT_EMAIL} and we will remove it for you.`,
  PARTIAL_DELETE:
    "We could not finish deleting your account. Some of your Business team details were already removed " +
    "(your place in other teams, or a closed team you owned), but your account and sign-in still work. " +
    "Please press Delete again in a few minutes to finish. " +
    `If this keeps happening, email ${SUPPORT_EMAIL} and we will remove it for you.`,
  PARTIAL_DELETE_BILLING:
    "Your paid plan has been cancelled, but we could not finish deleting your account, so your account and sign-in still work. " +
    "Please press Delete again in a few minutes to finish. " +
    `If this keeps happening, email ${SUPPORT_EMAIL} and we will remove it for you.`,
  EXPORT_FAILED: "We could not prepare your data file. Please try again in a few minutes.",
  CLEAR_FAILED: "We could not clear your scan history. Please try again in a few minutes.",
  UNSUPPORTED_ACTION: "This privacy request is not supported.",
  METHOD_NOT_ALLOWED: "Method not allowed."
};

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}

function fail(status, code, message = MESSAGES[code] || MESSAGES.DELETE_FAILED) {
  return Object.assign(new Error(message), { status, code });
}

function reply(code, status, extra = {}) {
  return json({ error: MESSAGES[code] || MESSAGES.DELETE_FAILED, code, ...extra }, status);
}

function serverConfig() {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  // Same names as netlify/lib/supabase.mjs: the newer secret key is accepted too.
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!url || !key) throw fail(503, "NOT_CONFIGURED");
  return { url, key };
}

// Supabase's passing 401 PGRST303 "JWT issued at future" is retried for
// every PostgREST call here (netlify/lib/supabase-retry.mjs); nothing else is.
const RETRY = { ...RETRY_STANDARD, label: "privacy-data" };

// One PostgREST call with the service role. `code` names the step, so a
// failure stops the request with a clear reason. `optional`: a table that is
// not there yet (404, e.g. PGRST205 before its migration) reads as no rows.
async function rest(path, { code, optional = false, ...options } = {}) {
  const { url, key } = serverConfig();
  let response;
  try {
    response = await fetchWithJwtRetry(`${url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }, RETRY);
  } catch (error) {
    console.error("CyberNet privacy-data db unreachable", code, error?.message || error);
    reportError(error, { fn: "privacy-data", label: `Database unreachable (${code})` });
    throw fail(502, code);
  }
  if (!response.ok) {
    if (optional && response.status === 404) return [];
    const detail = await response.text().catch(() => "");
    console.error("CyberNet privacy-data db error", code, response.status, detail.slice(0, 500));
    // Never pass `detail` to reportError: it can echo row data.
    reportError(`Database request failed (HTTP ${response.status})`, { fn: "privacy-data", label: `Database error (${code})` });
    throw fail(502, code);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const id = value => encodeURIComponent(String(value));
const get = (path, code) => rest(path, { method: "GET", code });
const remove = (path, code) => rest(path, { method: "DELETE", code, headers: { Prefer: "return=minimal" } });
const patch = (path, body, code) =>
  rest(path, { method: "PATCH", code, headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });

async function getRows(table, userId, code, columns = "*") {
  return get(`${table}?user_id=eq.${id(userId)}&select=${encodeURIComponent(columns)}`, code);
}

async function getProfile(userId, code) {
  const rows = await get(`profiles?id=eq.${id(userId)}&select=*`, code);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function isOpen(status) {
  return !CLOSED_SUBSCRIPTION.includes(String(status ?? "").trim().toLowerCase());
}

// The PostgREST filter for "this team's plan is closed", used for the check
// before the clean-up and for the guarded DELETE, so the two always agree.
const CLOSED_FILTER = `subscription_status=in.(${CLOSED_SUBSCRIPTION.join(",")})`;

async function deleteAuthUser(userId) {
  const { url, key } = serverConfig();
  let response;
  try {
    response = await fetch(`${url}/auth/v1/admin/users/${id(userId)}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
  } catch (error) {
    console.error("CyberNet privacy-data auth unreachable", error?.message || error);
    reportError(error, { fn: "privacy-data", label: "Auth delete unreachable" });
    throw fail(502, "AUTH_DELETE_FAILED", MESSAGES.DELETE_FAILED);
  }
  // 404: the user is already gone (an earlier attempt finished), which is the goal.
  if (response.ok || response.status === 404) return;
  const detail = await response.text().catch(() => "");
  console.error("CyberNet privacy-data auth delete error", response.status, detail.slice(0, 500));
  reportError(`Auth delete failed (HTTP ${response.status})`, { fn: "privacy-data", label: "Account delete failed" });
  throw fail(502, "AUTH_DELETE_FAILED", MESSAGES.DELETE_FAILED);
}

// A closed Business team the user owns. Its rows reference business_accounts
// with NO ACTION, so they are removed (or unlinked) first, in this order:
//   0. the team is read again: it must still be this user's and closed, or
//      nothing is touched (its plan may have restarted since Gate 2);
//   1. member links, invites and the two shared-usage tables;
//   2. scan_history / recovery_cases keep their rows (they belong to each
//      member) but lose the team link;
//   3. the team row itself, only while it is still this user's and closed.
// changing() is called just before the first row is removed.
async function closeTeam(teamId, ownerId, changing = () => {}) {
  const team = id(teamId);
  const code = "TEAM_CLEANUP_FAILED";
  const current = await get(`business_accounts?id=eq.${team}&owner_user_id=eq.${id(ownerId)}&${CLOSED_FILTER}&select=id`, code);
  if (!Array.isArray(current) || !current.length) {
    const still = await get(`business_accounts?id=eq.${team}&select=id,subscription_status`, code);
    if (Array.isArray(still) && still.length) throw fail(409, "TEAM_ACTIVE");
    return; // already removed by an earlier attempt
  }
  changing();
  await remove(`business_members?business_account_id=eq.${team}`, code);
  await remove(`business_invites?business_account_id=eq.${team}`, code);
  await remove(`business_daily_usage?business_account_id=eq.${team}`, code);
  await remove(`business_recovery_usage?business_account_id=eq.${team}`, code);
  await patch(`scan_history?business_account_id=eq.${team}`, { business_account_id: null }, code);
  await patch(`recovery_cases?business_account_id=eq.${team}`, { business_account_id: null }, code);
  const removed = await rest(
    `business_accounts?id=eq.${team}&owner_user_id=eq.${id(ownerId)}&${CLOSED_FILTER}`,
    { method: "DELETE", code, headers: { Prefer: "return=representation" } }
  );
  if (Array.isArray(removed) && removed.length) return;
  // Nothing was deleted: either an earlier attempt already removed it, or the
  // team's plan became active again in the moment since step 0.
  const still = await get(`business_accounts?id=eq.${team}&select=id,subscription_status`, code);
  if (Array.isArray(still) && still.length) throw fail(409, "TEAM_ACTIVE");
}

// Deletes and reports how many rows went (Prefer: count=exact), so a failure
// later on can say whether anything had already changed.
async function removeCounted(path, code) {
  const { url, key } = serverConfig();
  let response;
  try {
    response = await fetchWithJwtRetry(`${url}/rest/v1/${path}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal, count=exact" }
    }, RETRY);
  } catch (error) {
    console.error("CyberNet privacy-data db unreachable", code, error?.message || error);
    reportError(error, { fn: "privacy-data", label: `Database unreachable (${code})` });
    throw fail(502, code);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("CyberNet privacy-data db error", code, response.status, detail.slice(0, 500));
    reportError(`Database request failed (HTTP ${response.status})`, { fn: "privacy-data", label: `Database error (${code})` });
    throw fail(502, code);
  }
  const match = /\/(\d+)\s*$/.exec(String(response.headers.get("content-range") || ""));
  // No count in the answer: assume something may have gone.
  return match ? Number(match[1]) : 1;
}

// Cancels, in Stripe, every subscription that could still bill this account:
// its own plan and the plans of the teams it owns. Runs before anything is
// deleted; if it fails, nothing is deleted. Returns the subscriptions that
// were open and are now cancelled.
async function cancelBilling(profile, teams, personalOpen) {
  const openTeams = teams.filter(team => isOpen(team.subscription_status));
  const subscriptionIds = [
    ...(personalOpen ? [profile?.stripe_subscription_id] : []),
    ...openTeams.map(team => team.stripe_subscription_id)
  ].filter(Boolean);
  const customerIds = [profile?.stripe_customer_id, ...teams.map(team => team.stripe_customer_id)].filter(Boolean);
  const secret = env("STRIPE_SECRET_KEY");
  if (!secret) {
    // Without the key nothing can be cancelled. A plan the database still
    // shows as open, with a subscription behind it, must not keep billing a
    // deleted account, so deletion stops. A paid-looking row with no
    // subscription id (test fixtures, an old row) has nothing to cancel.
    if (subscriptionIds.length) {
      reportError("STRIPE_SECRET_KEY is not set; an account with a paid plan could not be deleted", { fn: "privacy-data", label: "Billing not configured" });
      throw fail(503, "BILLING_NOT_CONFIGURED");
    }
    return [];
  }
  if (!subscriptionIds.length && !customerIds.length) return [];
  try {
    return await cancelOpenSubscriptions(makeStripe(secret), { subscriptionIds, customerIds });
  } catch (error) {
    console.error("CyberNet privacy-data Stripe cancel failed", error?.type || "", error?.code || "", error?.message || error);
    reportError(error, { fn: "privacy-data", label: "Subscription cancel on delete failed" });
    // Only the stray-subscription listing failed and no plan is known to be
    // open: say that, not "your paid plan".
    const checkOnly = error?.cnPhase === "list" && !subscriptionIds.length;
    throw fail(502, checkOnly ? "BILLING_CHECK_FAILED" : "SUBSCRIPTION_CANCEL_FAILED");
  }
}

async function deleteAccount(user, body = {}) {
  const uid = id(user.id);

  const profile = await getProfile(user.id, "PROFILE_LOOKUP_FAILED");
  // No profile row, or no status on it, means no plan was ever started.
  const personal = String(profile?.subscription_status ?? profile?.subscriptionStatus ?? "").trim();
  const personalOpen = Boolean(personal) && isOpen(personal);
  const owned = await get(
    `business_accounts?owner_user_id=eq.${uid}&select=id,subscription_status,stripe_subscription_id,stripe_customer_id`,
    "TEAM_LOOKUP_FAILED"
  );
  const teams = Array.isArray(owned) ? owned : [];

  // Step 1: billing. A paid plan no longer blocks deletion; it is cancelled
  // now, with no refund for unused time (the deletion screen says so).
  const cancelled = await cancelBilling(profile, teams, personalOpen);
  const cancelledNow = cancelled.filter(item => !item.already).length;
  const billingChanged = cancelled.length > 0;

  // From here on, a failure leaves the account open; the reply then says what
  // already changed (PARTIAL_DELETE with the billing or the team wording)
  // instead of "nothing changed".
  let changed = false;
  try {
    // Rows with no link to auth.users, so nothing cascades to them: the
    // checkout error log (it can hold Stripe's raw error text) and the
    // rate-limit counters whose keys end in the user id (analyze:<mode>:<uid>,
    // shot:min:<uid>, shot:day:<uid>). Done first: losing them changes nothing
    // the user would notice if a later step fails.
    await remove(`checkout_debug_log?user_id=eq.${uid}`, "CHECKOUT_LOG_CLEANUP_FAILED");
    await remove(`api_rate_limits?rate_key=like.*${uid}`, "RATE_LIMIT_CLEANUP_FAILED");

    // The database follows Stripe at once (the webhook says the same a moment
    // later), so the team clean-up below, which only removes closed teams,
    // can run, and no paid plan is shown if a later step fails.
    const now = new Date().toISOString();
    if (personalOpen) {
      await patch(`profiles?id=eq.${uid}`, { plan: "free", subscription_status: "canceled", updated_at: now }, "PROFILE_UPDATE_FAILED");
    }
    for (const team of teams) {
      if (!isOpen(team.subscription_status)) continue;
      await patch(`business_accounts?id=eq.${id(team.id)}&owner_user_id=eq.${uid}`, { subscription_status: "canceled", updated_at: now }, "TEAM_UPDATE_FAILED");
      changed = true;
    }

    for (const team of teams) await closeTeam(team.id, user.id, () => { changed = true; });

    // This user's own links into other teams. They reference auth.users with
    // NO ACTION and would block the auth delete. Invites other people sent to
    // this user's email belong to those teams and are left alone.
    changed = (await removeCounted(`business_members?user_id=eq.${uid}`, "MEMBERSHIP_CLEANUP_FAILED")) > 0 || changed;
    changed = (await removeCounted(`business_invites?invited_by_user_id=eq.${uid}`, "INVITE_CLEANUP_FAILED")) > 0 || changed;

    // Profile, usage, scan history, Recovery cases (with their versions and
    // tasks) and AI consents cascade from the auth user. Legal-acceptance rows
    // are kept with the user link removed (ON DELETE SET NULL). Stripe keeps
    // its billing records.
    await deleteAuthUser(user.id);
  } catch (error) {
    if (billingChanged && error?.code) throw fail(502, "PARTIAL_DELETE_BILLING");
    if (changed && error?.code) throw fail(502, "PARTIAL_DELETE", MESSAGES.PARTIAL_DELETE);
    throw error;
  }

  // Last: Sign in with Apple (TN3194). The app sends a fresh authorization
  // code with the request; a failure is logged, never fatal.
  let appleTokensRevoked = null;
  const appleCode = cleanAuthorizationCode(body?.appleAuthorizationCode);
  if (hasAppleIdentity(user)) {
    if (appleCode) {
      const apple = await revokeAppleTokens(appleCode, appleConfig(), { expectedSub: appleSubOf(user) });
      appleTokensRevoked = apple.revoked;
      if (!apple.revoked) {
        console.error("CyberNet privacy-data Apple token revocation failed", apple.reason);
        reportError(`Apple token revocation failed (${apple.reason})`, { fn: "privacy-data", label: "Apple token revocation failed" });
      }
    } else {
      appleTokensRevoked = false;
      console.error("CyberNet privacy-data Apple account deleted without an authorization code");
    }
  }

  return json({ deleted: true, closedTeams: teams.length, cancelledSubscriptions: cancelledNow, appleTokensRevoked });
}

async function exportData(user) {
  const uid = id(user.id);
  const code = "EXPORT_FAILED";
  const [profile, usage, history, acceptances, recoveryCases, recoveryUsage, quickscanUsage, teamMemberships, ownedTeams, checkoutErrors, usageCounters, feedback, aiConsents] = await Promise.all([
    getProfile(user.id, code),
    getRows("daily_usage", user.id, code),
    getRows("scan_history", user.id, code),
    getRows("legal_acceptances", user.id, code),
    get(`recovery_cases?owner_user_id=eq.${uid}&select=*`, code),
    getRows("recovery_usage", user.id, code),
    getRows("quickscan_usage", user.id, code),
    get(`business_members?user_id=eq.${uid}&select=business_account_id,role,status,joined_at,removed_at`, code),
    get(`business_accounts?owner_user_id=eq.${uid}&select=id,seat_tier,subscription_status,billing_interval,created_at`, code),
    getRows("checkout_debug_log", user.id, code),
    get(`api_rate_limits?rate_key=like.*${uid}&select=rate_key,window_started_at,request_count,updated_at`, code),
    rest(`feedback?user_id=eq.${uid}&select=created_at,category,message,email,page,status`, { method: "GET", code, optional: true }),
    rest(`ai_consents?user_id=eq.${uid}&select=consent_version,platform,provider,granted_at,withdrawn_at,user_agent`, { method: "GET", code, optional: true })
  ]);
  const caseIds = (Array.isArray(recoveryCases) ? recoveryCases : []).map(c => c.id).filter(Boolean);
  const inList = caseIds.map(encodeURIComponent).join(",");
  const [recoveryVersions, recoveryTasks] = caseIds.length
    ? await Promise.all([
        get(`recovery_versions?case_id=in.(${inList})&select=*`, code),
        get(`recovery_tasks?case_id=in.(${inList})&select=*`, code)
      ])
    : [[], []];
  return json({
    data: {
      account: { id: user.id, email: user.email || null, createdAt: user.created_at || null, metadata: user.user_metadata || {} },
      profile,
      dailyUsage: usage || [],
      savedHistory: history || [],
      legalAcceptances: acceptances || [],
      recoveryCases: recoveryCases || [],
      recoveryVersions: recoveryVersions || [],
      recoveryTasks: recoveryTasks || [],
      recoveryUsage: recoveryUsage || [],
      quickscanUsage: quickscanUsage || [],
      teamMemberships: teamMemberships || [],
      ownedTeams: ownedTeams || [],
      checkoutErrors: checkoutErrors || [],
      usageCounters: usageCounters || [],
      feedback: feedback || [],
      aiConsents: aiConsents || []
    }
  });
}

async function handler(request) {
  if (request.method !== "POST") return reply("METHOD_NOT_ALLOWED", 405);
  try {
    let user;
    try {
      ({ user } = await verifyUser(request));
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status === 401) {
        return json({ error: error?.message || "Sign in is required.", code: "AUTH_REQUIRED" }, 401);
      }
      if (status === 503) {
        reportError("Supabase auth settings are not set", { fn: "privacy-data", label: "Privacy controls not configured" });
        return reply("NOT_CONFIGURED", 503);
      }
      throw error;
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "export") return await exportData(user);

    if (action === "clear-history") {
      await remove(`scan_history?user_id=eq.${id(user.id)}`, "CLEAR_FAILED");
      return json({ cleared: true });
    }

    if (action === "delete-account") {
      if (String(body?.confirmation || "") !== "DELETE") return reply("CONFIRMATION_REQUIRED", 400);
      return await deleteAccount(user, body);
    }

    return reply("UNSUPPORTED_ACTION", 400);
  } catch (error) {
    // Errors raised by fail() carry their own code and plain message; anything
    // else is unexpected and gets a generic message (details stay in the log).
    if (!error?.code) {
      console.error("CyberNet privacy-data unexpected error", error?.message || error);
      reportError(error, { fn: "privacy-data", label: "Unexpected error" });
    } else if (error.code === "NOT_CONFIGURED") {
      reportError("A Supabase server key or URL is not set", { fn: "privacy-data", label: "Privacy controls not configured" });
    }
    const code = error?.code || "SERVER_ERROR";
    const message = error?.code ? error.message : "Something went wrong on our side. Please try again in a few minutes.";
    return json({ error: message, code }, Number(error?.status) || 500);
  }
}

// CORS for the iPhone app only (netlify/lib/cors.mjs); website requests pass
// through unchanged.
export default withCors(handler);

export const config = { path: "/api/privacy-data" };
