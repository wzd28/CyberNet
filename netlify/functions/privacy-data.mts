import { json, verifyUser } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { fetchWithJwtRetry, RETRY_STANDARD } from "../lib/supabase-retry.mjs";

// Privacy controls for the signed-in user: export, clear-history and
// delete-account. Every request is checked against the caller's own Supabase
// JWT (verifyUser); the service role is used only after that check, and only
// on rows that belong to that user (or to a closed team the user owns).
//
// Errors carry a machine `code` and a plain-language `error` message, so the
// Account panel can show the right next step.

// Deny by default: only these Stripe statuses mean nobody can be billed any
// more. Everything else (active, trialing, past_due, unpaid, incomplete,
// paused, or a status Stripe adds later) counts as open. stripe-webhook.mjs
// stores Stripe's status as it arrives, and an "incomplete" subscription
// becomes active when a delayed first payment goes through.
const CLOSED_SUBSCRIPTION = ["inactive", "canceled", "incomplete_expired"];
const SUPPORT_EMAIL = "support@cybernetai.app";

const MESSAGES = {
  NOT_CONFIGURED: `Privacy controls are not available right now. Please try again later, or email ${SUPPORT_EMAIL}.`,
  SUBSCRIPTION_ACTIVE:
    "You still have an active CyberNet AI plan. Cancel it in Manage Billing first. " +
    "If you have already cancelled, the plan stays active until the end of the period you paid for, " +
    "and you can delete your account after that date.",
  TEAM_ACTIVE:
    "Your CyberNet AI Business team still has an active plan. Cancel the team's plan in Manage Billing first. " +
    "Once the plan has ended, you can delete your account here and the team closes with it.",
  CONFIRMATION_REQUIRED: "Type DELETE in the box to confirm that you want to delete your account.",
  DELETE_FAILED:
    "We could not finish deleting your account, so it is still open. Please try again in a few minutes. " +
    `If this keeps happening, email ${SUPPORT_EMAIL} and we will remove it for you.`,
  PARTIAL_DELETE:
    "We could not finish deleting your account. Some of your Business team details were already removed " +
    "(your place in other teams, or a closed team you owned), but your account and sign-in still work. " +
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
// failure stops the request with a clear reason.
async function rest(path, { code, ...options } = {}) {
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

async function deleteAccount(user) {
  const uid = id(user.id);

  // Gate 1: a personal Pro plan that Stripe still bills or may still bill.
  const profile = await getProfile(user.id, "PROFILE_LOOKUP_FAILED");
  // No profile row, or no status on it, means no plan was ever started.
  const personal = String(profile?.subscription_status ?? profile?.subscriptionStatus ?? "").trim();
  if (personal && isOpen(personal)) {
    return reply("SUBSCRIPTION_ACTIVE", 409);
  }

  // Gate 2: a Business team this user owns whose plan is still open.
  const owned = await get(`business_accounts?owner_user_id=eq.${uid}&select=id,subscription_status`, "TEAM_LOOKUP_FAILED");
  const teams = Array.isArray(owned) ? owned : [];
  if (teams.some(team => isOpen(team.subscription_status))) {
    return reply("TEAM_ACTIVE", 409);
  }

  // Rows with no link to auth.users, so nothing cascades to them: the
  // checkout error log (it can hold Stripe's raw error text) and the
  // rate-limit counters whose keys end in the user id (analyze:<mode>:<uid>,
  // shot:min:<uid>, shot:day:<uid>). Done first: losing them changes nothing
  // the user would notice if a later step fails.
  await remove(`checkout_debug_log?user_id=eq.${uid}`, "CHECKOUT_LOG_CLEANUP_FAILED");
  await remove(`api_rate_limits?rate_key=like.*${uid}`, "RATE_LIMIT_CLEANUP_FAILED");

  // From here on, a failure can leave the account open with some of its team
  // links gone; the reply then says so (PARTIAL_DELETE) instead of "nothing
  // changed".
  let changed = false;
  try {
    for (const team of teams) await closeTeam(team.id, user.id, () => { changed = true; });

    // This user's own links into other teams. They reference auth.users with
    // NO ACTION and would block the auth delete. Invites other people sent to
    // this user's email belong to those teams and are left alone.
    changed = (await removeCounted(`business_members?user_id=eq.${uid}`, "MEMBERSHIP_CLEANUP_FAILED")) > 0 || changed;
    changed = (await removeCounted(`business_invites?invited_by_user_id=eq.${uid}`, "INVITE_CLEANUP_FAILED")) > 0 || changed;

    // Profile, usage, scan history, Recovery cases (with their versions and
    // tasks) cascade from the auth user. Legal-acceptance rows are kept with the
    // user link removed (ON DELETE SET NULL). Stripe keeps its billing records.
    await deleteAuthUser(user.id);
  } catch (error) {
    if (changed && error?.code) {
      throw fail(502, "PARTIAL_DELETE", MESSAGES.PARTIAL_DELETE);
    }
    throw error;
  }
  return json({ deleted: true, closedTeams: teams.length });
}

async function exportData(user) {
  const uid = id(user.id);
  const code = "EXPORT_FAILED";
  const [profile, usage, history, acceptances, recoveryCases, recoveryUsage, quickscanUsage, teamMemberships, ownedTeams, checkoutErrors, usageCounters] = await Promise.all([
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
    get(`api_rate_limits?rate_key=like.*${uid}&select=rate_key,window_started_at,request_count,updated_at`, code)
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
      usageCounters: usageCounters || []
    }
  });
}

export default async request => {
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
      return await deleteAccount(user);
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
};

export const config = { path: "/api/privacy-data" };
