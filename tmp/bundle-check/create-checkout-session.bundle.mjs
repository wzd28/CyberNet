// netlify/functions/create-checkout-session.mjs
import Stripe from "stripe";

// netlify/lib/supabase-retry.mjs
var JWT_FUTURE_CODE = "PGRST303";
var RETRY_STANDARD = Object.freeze({ delaysMs: Object.freeze([400, 1200]), maxTotalMs: 6e3 });
var RETRY_TIGHT = Object.freeze({ delaysMs: Object.freeze([400]), maxTotalMs: 3e3 });
async function isJwtIssuedAtFuture(response) {
  if (!response || response.status !== 401 || typeof response.clone !== "function") return false;
  let text = "";
  try {
    text = await response.clone().text();
  } catch {
    return false;
  }
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      return body.code === JWT_FUTURE_CODE || /JWT issued at future/i.test(String(body.message || ""));
    }
  } catch {
  }
  return /JWT issued at future/i.test(text);
}
function wait(ms2, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms2);
    signal?.addEventListener?.("abort", done, { once: true });
  });
}
function describe(input, init) {
  const method = String(init?.method || "GET").toUpperCase();
  let path = "";
  try {
    path = new URL(String(input)).pathname;
  } catch {
    path = String(input).split(/[?#]/)[0];
  }
  return `${method} ${path}`;
}
function replayable(input, init) {
  if (typeof input !== "string" && !(input instanceof URL)) return false;
  const body = init?.body;
  return !(body && (typeof body.getReader === "function" || typeof body[Symbol.asyncIterator] === "function"));
}
async function fetchWithJwtRetry(input, init = {}, policy = RETRY_STANDARD) {
  policy = policy || RETRY_STANDARD;
  const delays = Array.isArray(policy.delaysMs) ? policy.delaysMs : RETRY_STANDARD.delaysMs;
  const maxTotalMs = Number.isFinite(policy.maxTotalMs) ? policy.maxTotalMs : RETRY_STANDARD.maxTotalMs;
  const send = policy.fetch || ((url, options) => globalThis.fetch(url, options));
  const sleep = policy.sleep || wait;
  const now = policy.now || Date.now;
  const log = policy.log || ((level, line) => level === "warn" ? console.warn(line) : console.log(line));
  const signal = init?.signal;
  const started = now();
  let response = await send(input, init);
  if (!delays.length || !replayable(input, init) || !await isJwtIssuedAtFuture(response)) return response;
  const what = `CyberNet Supabase: 401 ${JWT_FUTURE_CODE} "JWT issued at future" on ${describe(input, init)}${policy.label ? ` (${policy.label})` : ""}`;
  let retries = 0;
  while (retries < delays.length) {
    const delay = Math.max(0, Number(delays[retries]) || 0);
    if (signal?.aborted || now() - started + delay > maxTotalMs) break;
    await sleep(delay, signal);
    if (signal?.aborted) break;
    let next;
    try {
      next = await send(input, init);
    } catch (error) {
      log("warn", `${what}; retry ${retries + 1} could not be sent (${error?.name || "error"}), the 401 stands`);
      return response;
    }
    retries += 1;
    try {
      response.body?.cancel?.().catch?.(() => {
      });
    } catch {
    }
    response = next;
    if (!await isJwtIssuedAtFuture(response)) {
      log("info", `${what}; retry ${retries} of ${delays.length} answered HTTP ${response.status} after ${now() - started} ms`);
      return response;
    }
  }
  log("warn", retries ? `${what}; still failing after ${retries} ${retries === 1 ? "retry" : "retries"} (${now() - started} ms)` : `${what}; not retried, the time limit for this call was reached (${now() - started} ms)`);
  return response;
}

// netlify/lib/entitlements.mjs
var COLUMNS = "original_transaction_id,product_id,plan,seat_tier,billing_interval,environment,expires_at,grace_expires_at,auto_renew,status,revoked_at,business_account_id";
async function loadAppleSubscriptions(userId, serviceFetch2 = serviceFetch) {
  const response = await serviceFetch2(
    `/rest/v1/apple_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=${COLUMNS}&order=expires_at.desc&limit=20`
  );
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    const error = new Error(rows && rows.message || `Could not load Apple subscriptions (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return rows;
}
var ms = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
};
function appleEntitled(row, now = Date.now()) {
  if (!row || row.revoked_at) return false;
  if (String(row.status || "") === "revoked") return false;
  const expires = ms(row.expires_at);
  const grace = ms(row.grace_expires_at);
  return expires !== null && expires > now || grace !== null && grace > now;
}
function entitledAppleRows(rows, now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).filter((row) => appleEntitled(row, now));
}
function appleProActive(rows, now = Date.now()) {
  return entitledAppleRows(rows, now).some((row) => row.plan === "pro");
}
function stripeProfilePlan(profile) {
  const active = ["active", "trialing"].includes(String(profile?.subscription_status || ""));
  if (!active) return null;
  return profile.plan === "business" ? "business" : profile.plan === "pro" ? "pro" : null;
}
function bestApple(rows) {
  return [...rows].sort((a, b) => {
    const rank = (row) => row.plan === "business" ? 1 : 0;
    return rank(b) - rank(a) || (ms(b.expires_at) || 0) - (ms(a.expires_at) || 0);
  })[0] || null;
}
function describeBilling({ profile = {}, team = null, appleRows = [], now = Date.now() } = {}) {
  const apple = bestApple(entitledAppleRows(appleRows, now));
  const stripePlan = stripeProfilePlan(profile);
  const ownsTeam = Boolean(team && team.role === "owner");
  const stripeTeamOwner = ownsTeam && team.billingSource !== "apple";
  const stripe = Boolean(stripePlan) || stripeTeamOwner;
  const plan = team ? "business" : apple ? apple.plan : stripePlan || "free";
  let source = null;
  if (apple) source = "apple";
  else if (stripe) source = "stripe";
  else if (team) source = "team";
  const base = {
    source,
    plan,
    productId: null,
    seatTier: team?.seatTier ?? null,
    interval: null,
    renewsAt: null,
    endsAt: null,
    autoRenew: null,
    inGrace: false,
    environment: null,
    // Two subscriptions are paying for this account at once.
    alsoBilledElsewhere: Boolean(apple && stripe)
  };
  if (source === "apple") {
    const expires = ms(apple.expires_at);
    const grace = ms(apple.grace_expires_at);
    const inGrace = expires !== null && expires <= now && grace !== null && grace > now;
    const autoRenew = apple.auto_renew !== false;
    return {
      ...base,
      productId: apple.product_id,
      seatTier: apple.seat_tier ?? base.seatTier,
      interval: apple.billing_interval === "year" ? "year" : "month",
      renewsAt: autoRenew && !inGrace ? apple.expires_at : null,
      endsAt: inGrace ? apple.grace_expires_at : autoRenew ? null : apple.expires_at,
      autoRenew,
      inGrace,
      environment: apple.environment || null
    };
  }
  if (source === "stripe") {
    const interval = String(profile?.billing_interval || "").toLowerCase();
    return { ...base, interval: interval === "year" || interval === "month" ? interval : null };
  }
  return base;
}
function checkoutConflict({ profile = {}, team = null, currentPlan = "free", targetPlan = "pro", appleRows = [], now = Date.now() } = {}) {
  const rank = { free: 0, pro: 1, business: 2 };
  const heldPlan = team ? "business" : currentPlan;
  if ((rank[heldPlan] ?? 0) < (rank[targetPlan] ?? 1)) return null;
  const billing = describeBilling({ profile, team, appleRows, now });
  if (billing.source === "apple") return "Your plan is already active on this account.";
  return `CyberNet AI ${heldPlan === "business" ? "Business" : "Pro"} is already active.`;
}

// netlify/lib/supabase.mjs
function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
function requireSupabaseEnv() {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const anonKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!url || !anonKey || !serviceKey) {
    const error = new Error(
      "Supabase server environment variables are not configured."
    );
    error.status = 503;
    throw error;
  }
  return { url, anonKey, serviceKey };
}
function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}
async function verifyUser(request) {
  const token = bearerToken(request);
  if (!token) {
    const error = new Error("Sign in is required.");
    error.status = 401;
    throw error;
  }
  const { url, anonKey } = requireSupabaseEnv();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id) {
    const error = new Error(
      "Your session is invalid or has expired. Please sign in again."
    );
    error.status = 401;
    throw error;
  }
  return { user, token };
}
async function serviceFetch(path, options = {}, retry = RETRY_STANDARD) {
  const { url, serviceKey } = requireSupabaseEnv();
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...options.body ? { "Content-Type": "application/json" } : {},
    ...options.headers || {}
  };
  return fetchWithJwtRetry(`${url}${path}`, {
    ...options,
    headers
  }, retry);
}
function effectivePlan(profile = {}) {
  const active = ["active", "trialing"].includes(
    String(profile.subscription_status || "")
  );
  if (profile.plan === "business" && active) return "business";
  if (profile.plan === "pro" && active) return "pro";
  return appleProActive(profile.apple) ? "pro" : "free";
}
async function getActiveTeamMembership(userId) {
  const query = (columns) => serviceFetch(
    `/rest/v1/business_members?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=role,business_accounts(${columns})`
  );
  const teamColumns = "id,seat_tier,daily_pool_limit,recovery_pool_limit,subscription_status";
  let response = await query(`${teamColumns},billing_source`);
  if (response.status === 400) response = await query(teamColumns);
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(rows?.message || "Could not check team membership.");
  }
  const row = rows.find(
    (r) => ["active", "trialing"].includes(String(r.business_accounts?.subscription_status || ""))
  );
  if (!row) return null;
  return {
    businessAccountId: row.business_accounts.id,
    role: row.role,
    seatTier: row.business_accounts.seat_tier,
    dailyPoolLimit: row.business_accounts.daily_pool_limit,
    recoveryPoolLimit: row.business_accounts.recovery_pool_limit,
    // 'stripe' (the website) or 'apple' (In-App Purchase); older rows have none.
    billingSource: row.business_accounts.billing_source === "apple" ? "apple" : "stripe"
  };
}
async function getProfile(user) {
  const select = "id,full_name,plan,subscription_status,billing_interval,stripe_customer_id,stripe_subscription_id,created_at,updated_at";
  const applePromise = loadAppleSubscriptions(user.id).catch((error) => {
    console.warn("CyberNet apple_subscriptions unavailable", error?.message || error);
    return [];
  });
  let response = await serviceFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=${select}`
  );
  let rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(rows?.message || "Could not load the account profile.");
  }
  if (!rows[0]) {
    const metadata = user.user_metadata || {};
    const fullName = String(
      metadata.full_name || [metadata.first_name, metadata.last_name].filter(Boolean).join(" ") || user.email?.split("@")[0] || "User"
    ).slice(0, 120);
    response = await serviceFetch("/rest/v1/profiles?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        id: user.id,
        full_name: fullName,
        plan: "free",
        subscription_status: "inactive",
        billing_interval: ""
      })
    });
    rows = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(rows?.message || "Could not create the account profile.");
    }
  }
  const profile = rows[0];
  profile.apple = await applePromise;
  return profile;
}
async function updateProfile(userId, patch) {
  const response = await serviceFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...patch,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    }
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(rows?.message || "Could not update the account profile.");
  }
  return rows[0] || null;
}

// netlify/lib/report-error.mjs
import { createHash } from "node:crypto";
var limits = {
  rpcTimeoutMs: 1500,
  mailTimeoutMs: 4e3,
  fingerprintWindowSeconds: 6 * 60 * 60,
  dayWindowSeconds: 24 * 60 * 60,
  maxAlertsPerDay: 20,
  maxClientAlertsPerDay: 10,
  maxMessageChars: 500,
  maxStackChars: 2048,
  maxFrames: 6,
  memoryEntries: 300
};
var ALERT_FROM = "CyberNet AI <notifications@cybernetai.app>";
var ALERT_TO = "support@cybernetai.app";
function env2(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "");
  } catch {
    try {
      return String(process.env[name] || "");
    } catch {
      return "";
    }
  }
}
function cleanUrl(url) {
  const match = /^(.*?)((?::\d+){1,2})$/.exec(url);
  const base = match ? match[1] : url;
  const position = match ? match[2] : "";
  return base.split(/[?#]/)[0] + position;
}
var SCRUBBERS = [
  // Full URLs: keep origin + path only.
  [/\b(?:https?|wss?|file):\/\/[^\s"'<>()[\]{}`,]+/gi, (url) => cleanUrl(url)],
  [/\b(?:data|blob):[^\s"'<>()]+/gi, "<data-url>"],
  // Relative paths that still carry a query or hash.
  [/(^|[\s(@"'=])(\/[^\s?#"'<>()]*)([?#][^\s"'<>()]*)/g, (_, pre, pathPart, rest) => pre + pathPart + (/((?::\d+){1,2})$/.exec(rest) || [""])[0]],
  // key=value pairs whose value is a credential.
  [/\b(access_token|refresh_token|id_token|token|code|apikey|api_key|key|password|passwd|secret|signature|sig|session)=([^&\s"'<>]+)/gi, "$1=<redacted>"],
  // The same in JSON ("password":"...") and in "password: ..." form.
  [/("(?:password|passwd|pwd|passcode|secret|token|access_token|refresh_token|id_token|api_?key|authorization)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi, '$1"<redacted>"'],
  [/\b(password|passwd|pwd|passcode)(\s*[:=]\s*)(?!<)[^\s,;&"'<>]+/gi, "$1$2<redacted>"],
  [/[A-Z0-9._%+-]{1,64}(?:@|%40)[A-Z0-9-]{1,63}(?:\.[A-Z0-9-]{1,63}){0,8}\.[A-Z]{2,24}\b/gi, "<email>"],
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*)?/g, "<token>"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 <token>"],
  [/\b(?:sk|pk|rk)-(?:proj-|live-|test-|svcacct-)?[A-Za-z0-9_-]{8,}/g, "<secret>"],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, "<secret>"],
  [/\b(?:whsec|sb_secret|sb_publishable)_[A-Za-z0-9_-]{8,}/g, "<secret>"],
  [/\bre_(?=[A-Za-z0-9_]*\d)[A-Za-z0-9]{6,}(?:_[A-Za-z0-9]+)?/g, "<secret>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>"],
  // Stripe object ids (customer, subscription, session...). The suffix must
  // contain a digit, so snake_case words like in_progress survive.
  [/\b(?:cus|sub|si|pi|cs|in|ii|il|ch|pm|seti|evt|price|prod|txn|po|acct|card|src|tok|bpc)_(?=[A-Za-z0-9_]*\d)[A-Za-z0-9_]{6,}\b/g, "<stripe-id>"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>"],
  [/(?<![\w:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![\w:])/gi, "<ip>"],
  [/(?<![\w:])(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?(?![\w:])/gi, (m) => /[0-9a-f]{1,4}:.*[0-9a-f]/i.test(m) ? "<ip>" : m],
  // Anything long and random-looking: session ids, hashes, API keys. Only
  // runs that mix letters and digits, so long plain names survive.
  [/\b[A-Za-z0-9_-]{32,}\b/g, (m) => /\d/.test(m) && /[A-Za-z]/.test(m) ? "<token>" : m],
  // Bank account numbers (IBAN), with or without the groups of four.
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, "<iban>"],
  // Long digit runs (phone, card and account numbers), separators allowed.
  // Stack line and column numbers are never 8 digits long, so a run after
  // ":", "/", "-" or "." goes too (tel:5551234567, wa.me/15551234567, ref-...).
  [/(?<!\w)\+?\d(?:[\s().-]{0,2}\d){7,}(?!\w)/g, "<number>"],
  // 12 or more digits in a row, even inside a word (an IBAN typed in lower case).
  [/\d{12,}/g, "<number>"]
];
function scrubText(value, max = limits.maxMessageChars) {
  let text;
  try {
    text = typeof value === "string" ? value : value == null ? "" : String(value);
  } catch {
    text = "";
  }
  text = text.slice(0, Math.max(0, max) * 4 + 64);
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  for (const [pattern, replacement] of SCRUBBERS) text = text.replace(pattern, replacement);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}\u2026` : text;
}
function topFrames(stack, count = limits.maxFrames) {
  return String(stack || "").split("\n").map((line) => line.trim()).filter((line) => /^at\s/.test(line) || /@.*:\d+(?::\d+)?$/.test(line)).slice(0, count).map((line) => line.slice(0, 200));
}
function read(object, key) {
  try {
    return object?.[key];
  } catch {
    return void 0;
  }
}
function describe2(error) {
  const out = { name: "Error", message: "", stack: "", code: "", status: void 0 };
  try {
    if (typeof error === "string") {
      out.message = error;
      return out;
    }
    if (error && typeof error === "object") {
      const name = read(error, "name");
      const message = read(error, "message");
      const stack = read(error, "stack");
      const code = read(error, "code");
      const status = read(error, "status") ?? read(error, "statusCode");
      const cause = read(error, "cause");
      if (typeof name === "string" && /^[A-Za-z_$][\w$.]{0,59}$/.test(name)) out.name = name;
      out.message = typeof message === "string" ? message : "Non-error value thrown";
      const causeMessage = cause && typeof cause === "object" ? read(cause, "message") : typeof cause === "string" ? cause : "";
      if (typeof causeMessage === "string" && causeMessage && !out.message.includes(causeMessage)) out.message += ` (cause: ${causeMessage})`;
      if (typeof stack === "string") out.stack = stack;
      if ((typeof code === "string" || typeof code === "number") && /^[\w.-]{1,40}$/.test(String(code))) out.code = String(code);
      if (Number.isFinite(Number(status))) out.status = Number(status);
      return out;
    }
    out.message = error === void 0 ? "Unknown error (undefined)" : "Non-error value thrown";
  } catch {
    out.message = "Unreadable error";
  }
  return out;
}
function normalizeForFingerprint(text) {
  return String(text || "").replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 300);
}
function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}
function deployContext(context) {
  try {
    const value = context?.deploy?.context || globalThis.Netlify?.context?.deploy?.context || env2("CONTEXT");
    return /^[\w-]{1,40}$/.test(String(value || "")) ? String(value) : "";
  } catch {
    return "";
  }
}
function safeLabel(value, max) {
  return scrubText(typeof value === "string" ? value : "", max).replace(/\s+/g, " ").trim();
}
var CLIENT_FILE = /^\/(?!\/)[\w./-]{1,200}\.m?js(?::\d{1,7}){0,2}$/;
var CLIENT_UA = /^(?:(?:Edge|Opera|Samsung Internet|Chrome|Firefox|Safari|Other)(?: \d{1,4})? on (?:Windows|iOS|Android|ChromeOS|macOS|Linux|Other)|(?:CyberNet AI|Instagram|Facebook|TikTok|Snapchat|LinkedIn|WhatsApp|Google app|News app|Other) in-app \((?:iOS|Android)(?: \d{1,3})?\)|Android WebView(?: \d{1,4})? \(Android(?: \d{1,3})?\))$/;
var SKIP_ALERT = /* @__PURE__ */ new Set(["ignored", "unsupported-browser"]);
var CLIENT_VERSION = /^[\w-]{1,32}$/;
var ROUTES = /* @__PURE__ */ new Set([
  "/",
  "/quick-scan",
  "/analysis-ai",
  "/recovery",
  "/learn",
  "/pricing",
  "/about",
  "/accept-invite",
  "/privacy.html",
  "/terms.html",
  "/refunds.html",
  "/acceptable-use.html",
  "/404.html"
]);
function routeOf(page) {
  let path = String(page || "/").split(/[?#]/)[0].toLowerCase();
  if (path === "/index.html") path = "/";
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return ROUTES.has(path) ? path : "/other";
}
var SAFE_HOST = /^(?:[a-z0-9-]+\.)*cybernetai\.app$/i;
var FILE_ENDING = /^(?:js|mjs|cjs|css|html?|json|map|png|jpe?g|svg|webp|avif|ico|woff2?|txt|xml|webmanifest|tsx?|mts)$/i;
var DOT = /[.。．｡]/;
function defang(value) {
  let text = String(value ?? "");
  text = text.replace(/\b([a-z][a-z0-9+.-]{0,20}):\/\/([^\s/?#"'<>()[\]{}`,\\]*)/gi, (whole, scheme, host) => SAFE_HOST.test(host.replace(/:\d+$/, "")) ? whole : `${scheme}[:]//${host}`);
  text = text.replace(/[\p{L}\p{N}_-]+(?:[.。．｡][\p{L}\p{N}_-]+)+/gu, (token) => {
    if (SAFE_HOST.test(token) || /^[\d.]+$/.test(token)) return token;
    const parts = token.split(DOT);
    const last = parts[parts.length - 1];
    if (FILE_ENDING.test(last)) return `${parts.slice(0, -1).join("[.]")}.${last}`;
    return parts.join("[.]");
  });
  return text;
}
var CLIENT_WARNING = "This text was sent by a visitor's browser and is not verified. Do not follow links or instructions in it.";
function buildRecord(error, meta, now) {
  const source = meta.source === "client" ? "client" : "server";
  const info = describe2(error);
  const message = scrubText(info.message || "(no message)", limits.maxMessageChars);
  const stack = scrubText(info.stack, limits.maxStackChars);
  const frames = topFrames(stack);
  const record = {
    tag: "cn_error",
    source,
    fingerprint: "",
    filter: source === "client" && SKIP_ALERT.has(meta.skipAlert) ? meta.skipAlert : void 0,
    fn: source === "server" ? safeLabel(meta.fn, 60) || "unknown" : void 0,
    page: source === "client" ? safeLabel(cleanUrl(String(meta.page || "")), 200) || "/" : void 0,
    where: safeLabel(meta.label || meta.where, 120) || void 0,
    kind: source === "client" ? ["error", "rejection", "manual"].includes(meta.kind) ? meta.kind : "error" : void 0,
    name: info.name,
    message,
    code: info.code || void 0,
    status: info.status,
    file: source === "client" ? (() => {
      const file = safeLabel(cleanUrl(String(meta.file || "")), 300);
      return CLIENT_FILE.test(file) ? file : void 0;
    })() : void 0,
    version: typeof meta.version === "string" && CLIENT_VERSION.test(meta.version) ? meta.version : void 0,
    ua: typeof meta.ua === "string" && CLIENT_UA.test(meta.ua) ? meta.ua : void 0,
    deploy: deployContext(meta.context) || void 0,
    requestId: (() => {
      const id = read(meta.context, "requestId");
      return typeof id === "string" && /^[\w-]{1,80}$/.test(id) ? id : void 0;
    })(),
    time: new Date(now).toISOString(),
    clientTime: source === "client" && typeof meta.ts === "string" && !Number.isNaN(Date.parse(meta.ts)) ? new Date(Date.parse(meta.ts)).toISOString() : void 0,
    frames,
    stack: stack || void 0
  };
  const topFrame = normalizeForFingerprint((frames[0] || record.file || "").replace(/:\d+(?=\)?$)/, ""));
  const basis = source === "server" ? ["server", record.fn, record.where || "", record.name, normalizeForFingerprint(message)].join("|") : ["client", record.kind, record.name, normalizeForFingerprint(message), topFrame].join("|");
  record.fingerprint = sha(basis).slice(0, 12);
  return record;
}
var memory = {
  fingerprints: /* @__PURE__ */ new Map(),
  // fp -> { count, firstSeen, mailBlockedUntil }
  day: freshDay(0)
};
function memoryEntry(fp, now) {
  let entry = memory.fingerprints.get(fp);
  if (!entry) {
    entry = { count: 0, firstSeen: now, mailBlockedUntil: 0 };
    memory.fingerprints.set(fp, entry);
    while (memory.fingerprints.size > limits.memoryEntries) {
      memory.fingerprints.delete(memory.fingerprints.keys().next().value);
    }
  }
  entry.count += 1;
  return entry;
}
async function consumeQuota(key, windowSeconds, max) {
  try {
    const response = await serviceFetch("/rest/v1/rpc/consume_api_quota", {
      method: "POST",
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_max_requests: max }),
      signal: AbortSignal.timeout(limits.rpcTimeoutMs)
    }, RETRY_TIGHT);
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || typeof data.allowed !== "boolean") return null;
    const resetAt = Date.parse(data.reset_at);
    return { allowed: data.allowed, used: Number(data.used) || 0, resetAt: Number.isFinite(resetAt) ? resetAt : 0 };
  } catch {
    return null;
  }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function formatUtc(ms2, seconds = false) {
  const d = new Date(ms2);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ""} UTC`;
}
function countLine(count) {
  if (count.scope === "all") {
    const times = count.n >= 1e4 ? "10,000 or more times" : count.n === 1 ? "1 time" : `${count.n} times`;
    return `${times} since ${formatUtc(count.since)} (all servers)`;
  }
  if (count.scope === "client") {
    return `${count.n === 1 ? "1 time" : `${count.n} times`} on this server since ${formatUtc(count.since)} (browser errors are counted on each server separately)`;
  }
  return `${count.n === 1 ? "1 time" : `${count.n} times`} on this server since ${formatUtc(count.since)} (the shared counter was unavailable)`;
}
function buildAlertEmail(record, count) {
  const isClient = record.source === "client";
  const own = isClient ? defang : (value) => String(value ?? "");
  const route = isClient ? routeOf(record.page) : "";
  const file = isClient && record.file && CLIENT_FILE.test(record.file) ? own(record.file) : "";
  const where = isClient ? `page ${route}${file ? ` (file ${file})` : ""}` : `function ${record.fn}`;
  const deployTag = record.deploy && record.deploy !== "production" ? `[${record.deploy}] ` : "";
  const headline = own(`${record.name && !record.message.startsWith(record.name) ? `${record.name}: ` : ""}${record.message}`);
  const subject = (isClient ? `${deployTag}CyberNet AI browser error ${record.fingerprint} on ${route}` : `${deployTag}CyberNet AI server error in ${record.fn}: ${headline}`).replace(/\s+/g, " ");
  const shortSubject = subject.length > 150 ? `${subject.slice(0, 149).replace(/\s+\S*$/, "")}\u2026` : subject;
  const rows = [
    ["What happened", isClient ? `A visitor's browser hit an error${record.where ? ` (${own(record.where)})` : ""}.` : `${record.where || `The ${record.fn} function failed`}.`],
    ["Where", where],
    ["Message", headline],
    ["Count", countLine(count)],
    ["Time", formatUtc(Date.parse(record.time), true)],
    ["Fingerprint", record.fingerprint],
    ...record.code || record.status ? [["Code", [record.code, record.status].filter(Boolean).join(" / ")]] : [],
    ...record.version ? [["UI version", own(record.version)]] : [],
    ...record.ua ? [["Browser", own(record.ua)]] : [],
    ...record.deploy ? [["Deploy", record.deploy]] : [],
    ...record.requestId ? [["Request id", record.requestId]] : []
  ];
  const frames = record.frames.length ? record.frames.map(own) : ["(no stack trace was available)"];
  const next = `You get at most one email for this error every 6 hours and at most ${limits.maxAlertsPerDay} error emails a day${isClient ? ` (browser errors: at most ${limits.maxClientAlertsPerDay})` : ""}. Every occurrence is in the Netlify function logs: search for ${record.fingerprint}.`;
  const text = [
    ...isClient ? [CLIENT_WARNING, ""] : [],
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Top stack frames:",
    ...frames.map((line) => `  ${line}`),
    "",
    next,
    "Messages are scrubbed before they are sent: no emails, tokens, ids, IP addresses or query strings."
  ].join("\n");
  const cell = "padding:6px 0;vertical-align:top;font-size:13px;line-height:1.5;";
  const html = `
<div style="background:#020812;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#08152a;border:1px solid rgba(34,211,238,0.16);border-radius:14px;">
    <tr><td style="padding:24px 20px;">
      <p style="margin:0 0 6px 0;color:#22d3ee;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(deployTag)}Error alert</p>${isClient ? `
      <p style="margin:0 0 14px 0;padding:10px 12px;background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.35);border-radius:8px;color:#fde68a;font-size:13px;line-height:1.5;">${escapeHtml(CLIENT_WARNING)}</p>` : ""}
      <h1 style="margin:0 0 18px 0;color:#eaf6ff;font-size:18px;line-height:1.4;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(headline)}</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows.filter(([label]) => label !== "Message").map(([label, value]) => `<tr><td style="${cell}color:#8ea5b8;width:96px;padding-right:10px;">${escapeHtml(label)}</td><td style="${cell}color:#eaf6ff;overflow-wrap:anywhere;">${escapeHtml(value)}</td></tr>`).join("\n        ")}
      </table>
      <p style="margin:18px 0 6px 0;color:#8ea5b8;font-size:13px;">Top stack frames</p>
      <pre style="margin:0;padding:12px;background:#020812;border:1px solid rgba(34,211,238,0.12);border-radius:8px;color:#cfe3f1;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;font-family:'JetBrains Mono',Consolas,monospace;">${escapeHtml(frames.join("\n"))}</pre>
      <p style="margin:18px 0 0 0;color:#5b6b7a;font-size:12px;line-height:1.6;">${escapeHtml(next)}</p>
      <p style="margin:6px 0 0 0;color:#5b6b7a;font-size:12px;line-height:1.6;">Messages are scrubbed before they are sent: no emails, tokens, ids, IP addresses or query strings.</p>
    </td></tr>
  </table>
</div>`;
  return { subject: shortSubject, text, html };
}
async function sendAlert(record, count, apiKey) {
  try {
    const email = buildAlertEmail(record, count);
    const bucket = Math.floor(Date.now() / (limits.fingerprintWindowSeconds * 1e3));
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend drops a repeat of the same key for 24 h: a second guard
        // against two servers alerting on one error in the same window.
        "Idempotency-Key": `cn-error-${record.fingerprint}-${bucket}`
      },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: [env2("ERROR_ALERT_EMAIL") || ALERT_TO],
        subject: email.subject,
        text: email.text,
        html: email.html
      }),
      signal: AbortSignal.timeout(limits.mailTimeoutMs)
    });
    return response.ok;
  } catch {
    return false;
  }
}
function freshDay(now) {
  return { windowStart: now, sent: 0, clientSent: 0, blockedUntil: 0, clientBlockedUntil: 0 };
}
function localDayFull(now, clientOnly = false) {
  if (now - memory.day.windowStart >= limits.dayWindowSeconds * 1e3) memory.day = freshDay(now);
  return clientOnly ? memory.day.clientSent >= limits.maxClientAlertsPerDay : memory.day.sent >= limits.maxAlertsPerDay;
}
var dayEnd = (quota) => quota && quota.resetAt || memory.day.windowStart + limits.dayWindowSeconds * 1e3;
async function alertFor(record, entry, local) {
  const now = Date.now();
  const fp = record.fingerprint;
  if (env2("ERROR_ALERTS").toLowerCase() === "off") return { email: "disabled", count: null };
  const apiKey = env2("RESEND_API_KEY");
  if (!apiKey) return { email: "no_key", count: null };
  const isClient = record.source === "client";
  const [counted, fpQuota] = isClient ? [null, null] : await Promise.all([
    consumeQuota(`cn_err:n:${fp}`, limits.dayWindowSeconds, 1e4),
    local === "claim" ? consumeQuota(`cn_err:mail:${fp}`, limits.fingerprintWindowSeconds, 1) : Promise.resolve(null)
  ]);
  const count = counted ? { n: counted.used, since: (counted.resetAt || now + limits.dayWindowSeconds * 1e3) - limits.dayWindowSeconds * 1e3, scope: "all" } : { n: entry.count, since: entry.firstSeen, scope: isClient ? "client" : "instance" };
  if (local !== "claim") return { email: local, count };
  if (fpQuota && !fpQuota.allowed) {
    if (fpQuota.resetAt) entry.mailBlockedUntil = fpQuota.resetAt;
    return { email: "deduped", count };
  }
  if (isClient) {
    const clientQuota = await consumeQuota("cn_err:mail:day:client", limits.dayWindowSeconds, limits.maxClientAlertsPerDay);
    if (clientQuota ? !clientQuota.allowed : localDayFull(Date.now(), true)) {
      memory.day.clientBlockedUntil = dayEnd(clientQuota);
      return { email: "daily_cap", count };
    }
  }
  const dayQuota = await consumeQuota("cn_err:mail:day", limits.dayWindowSeconds, limits.maxAlertsPerDay);
  if (dayQuota ? !dayQuota.allowed : localDayFull(Date.now())) {
    memory.day.blockedUntil = dayEnd(dayQuota);
    return { email: "daily_cap", count };
  }
  localDayFull(Date.now());
  memory.day.sent += 1;
  if (isClient) memory.day.clientSent += 1;
  const ok = await sendAlert(record, count, apiKey);
  return { email: ok ? "sent" : "failed", count };
}
function reportError(error, meta = {}) {
  try {
    meta = meta && typeof meta === "object" ? meta : {};
    const status = Number(meta.status);
    if (Number.isFinite(status) && status >= 400 && status < 500) {
      return Promise.resolve({ skipped: "expected", status });
    }
    const now = Date.now();
    const record = buildRecord(error, meta, now);
    const entry = memoryEntry(record.fingerprint, now);
    try {
      console.error(JSON.stringify({ ...record, seenHere: entry.count }));
    } catch {
    }
    if (record.filter) return Promise.resolve({ fingerprint: record.fingerprint, logged: true, email: record.filter, record });
    let local = "claim";
    if (memory.day.blockedUntil > now || record.source === "client" && memory.day.clientBlockedUntil > now) local = "daily_cap";
    else if (entry.mailBlockedUntil > now) local = "deduped";
    else entry.mailBlockedUntil = now + limits.fingerprintWindowSeconds * 1e3;
    const work = alertFor(record, entry, local).then((result) => {
      if (result.email === "sent" || result.email === "failed") {
        try {
          console.error(JSON.stringify({ tag: "cn_error_alert", fingerprint: record.fingerprint, email: result.email }));
        } catch {
        }
      }
      return { fingerprint: record.fingerprint, logged: true, email: result.email, count: result.count, record };
    }).catch(() => ({ fingerprint: record.fingerprint, logged: true, email: "failed" }));
    try {
      const context = meta.context || globalThis.Netlify?.context;
      if (context && typeof context.waitUntil === "function") context.waitUntil(work);
    } catch {
    }
    return work;
  } catch {
    return Promise.resolve({ logged: false, email: "failed" });
  }
}

// netlify/lib/cors.mjs
var APP_ORIGIN = "capacitor://localhost";
var ALLOWED = /* @__PURE__ */ new Set([APP_ORIGIN]);
var CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-CyberNet-Platform, X-CyberNet-App-Version",
  "Access-Control-Max-Age": "600"
});
function allowedOrigin(request) {
  const origin = request?.headers?.get?.("origin") || "";
  return ALLOWED.has(origin) ? origin : "";
}
function isIOS(request) {
  const headers = request?.headers;
  if (!headers?.get) return false;
  return String(headers.get("x-cybernet-platform") || "").trim().toLowerCase() === "ios" || Boolean(allowedOrigin(request));
}
var NOT_IN_APP_MESSAGE = "This isn't available in the CyberNet AI app.";
function webOnly(handler) {
  return async function webOnlyWrapped(request, context) {
    if (isIOS(request)) {
      return new Response(JSON.stringify({ error: NOT_IN_APP_MESSAGE, code: "NOT_AVAILABLE_IN_APP" }), {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
      });
    }
    return handler(request, context);
  };
}

// netlify/functions/create-checkout-session.mjs
function env3(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}
async function getOrCreateCustomer(stripe, user, profile) {
  let customerId = profile.stripe_customer_id || "";
  if (customerId) {
    try {
      const customer2 = await stripe.customers.retrieve(customerId);
      if (customer2 && !customer2.deleted) {
        return customerId;
      }
    } catch (error) {
      if (error?.code !== "resource_missing") throw error;
    }
  }
  const customer = await stripe.customers.create({
    email: user.email || void 0,
    name: profile.full_name || user.user_metadata?.full_name || void 0,
    metadata: {
      supabase_user_id: user.id
    }
  });
  customerId = customer.id;
  await updateProfile(user.id, {
    stripe_customer_id: customerId
  });
  return customerId;
}
var create_checkout_session_default = webOnly(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  let debugUserId = null;
  let debugLookupKey = null;
  let debugCycle = null;
  let debugTargetPlan = null;
  try {
    const secret = env3("STRIPE_SECRET_KEY");
    if (!secret) {
      return json(
        {
          error: "Stripe is not configured. Add STRIPE_SECRET_KEY in Netlify."
        },
        503
      );
    }
    const { user } = await verifyUser(request);
    debugUserId = user.id;
    const profile = await getProfile(user);
    const currentPlan = effectivePlan(profile);
    const body = await request.json().catch(() => ({}));
    const cycle = body.cycle === "yearly" ? "yearly" : "monthly";
    const targetPlan = body.plan === "business" ? "business" : "pro";
    debugCycle = cycle;
    debugTargetPlan = targetPlan;
    const team = await getActiveTeamMembership(user.id).catch(() => null);
    const conflict = checkoutConflict({ profile, team, currentPlan, targetPlan, appleRows: profile.apple });
    if (conflict) return json({ error: conflict }, 409);
    const seatTier = targetPlan === "business" ? Number(body.seatTier) || 5 : null;
    if (targetPlan === "business" && ![5, 10, 20].includes(seatTier)) {
      return json(
        { error: "Invalid seat tier. Choose 5, 10, or 20 seats, or email support@cybernetai.app for a custom plan." },
        400
      );
    }
    const tierSuffix = seatTier && seatTier !== 5 ? `_${seatTier}seat` : "";
    const lookupKey = targetPlan === "business" ? cycle === "yearly" ? env3(`STRIPE_BUSINESS${tierSuffix.toUpperCase()}_YEARLY_LOOKUP_KEY`) || `cybernet_ai_business${tierSuffix}_yearly` : env3(`STRIPE_BUSINESS${tierSuffix.toUpperCase()}_MONTHLY_LOOKUP_KEY`) || `cybernet_ai_business${tierSuffix}_monthly` : cycle === "yearly" ? env3("STRIPE_PRO_YEARLY_LOOKUP_KEY") || "cybernet_ai_pro_yearly" : env3("STRIPE_PRO_MONTHLY_LOOKUP_KEY") || "cybernet_ai_pro_monthly";
    debugLookupKey = lookupKey;
    const stripe = new Stripe(secret);
    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
      expand: ["data.product"]
    });
    const price = prices.data[0];
    if (!price) {
      return json(
        {
          error: `Stripe price '${lookupKey}' was not found. Check the ${cycle} lookup key in Stripe.`
        },
        503
      );
    }
    if (price.type !== "recurring") {
      return json(
        { error: "The selected Stripe price is not recurring." },
        503
      );
    }
    const customerId = await getOrCreateCustomer(
      stripe,
      user,
      profile
    );
    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: price.id,
          quantity: 1
        }
      ],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      client_reference_id: user.id,
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      // Stripe shows the Stripe account's business name on this page. This adds
      // the trading relationship underneath it, so the customer can see that the
      // CyberNet AI they signed up for and the entity taking the payment are the
      // same business — which is also what stops the charge looking unfamiliar
      // on a bank statement later.
      custom_text: {
        submit: {
          message: "CyberNet AI is operated under Marks Events FZ LLE."
        }
      },
      metadata: {
        supabase_user_id: user.id,
        cycle,
        plan: targetPlan,
        ...seatTier ? { seat_tier: String(seatTier) } : {}
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          cycle,
          plan: targetPlan,
          ...seatTier ? { seat_tier: String(seatTier) } : {}
        }
      }
    });
    if (!session.url) {
      return json(
        { error: "Stripe did not return a Checkout URL." },
        500
      );
    }
    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout error", error);
    reportError(error, { fn: "create-checkout-session", label: "Checkout session failed", status: error?.status });
    try {
      await serviceFetch("/rest/v1/checkout_debug_log", {
        method: "POST",
        body: JSON.stringify({
          user_id: debugUserId,
          lookup_key: debugLookupKey,
          cycle: debugCycle,
          target_plan: debugTargetPlan,
          error_type: error.type || error.name || null,
          error_code: error.code || null,
          error_message: error.message || null,
          error_raw: error.raw ? JSON.stringify(error.raw) : null
        })
      });
    } catch (logError) {
      console.error("Failed to write checkout debug log", logError);
      reportError(logError, { fn: "create-checkout-session", label: "Checkout debug log write failed" });
    }
    return json(
      {
        error: error.message || "Could not create Stripe Checkout."
      },
      Number(error.statusCode || error.status) || 500
    );
  }
});
var config = {
  path: "/api/create-checkout-session"
};
export {
  config,
  create_checkout_session_default as default
};
