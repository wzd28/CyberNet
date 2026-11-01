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
function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
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
function formatUtc(ms, seconds = false) {
  const d = new Date(ms);
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

// netlify/lib/apple-jws.mjs
import { X509Certificate, createHash as createHash2, verify as cryptoVerify } from "node:crypto";

// netlify/lib/business-seats.mjs
var SEAT_POOL_LIMITS = Object.freeze({
  5: Object.freeze({ dailyPoolLimit: 50, recoveryPoolLimit: 20 }),
  10: Object.freeze({ dailyPoolLimit: 90, recoveryPoolLimit: 36 }),
  20: Object.freeze({ dailyPoolLimit: 160, recoveryPoolLimit: 64 })
});
var SEAT_TIERS = Object.freeze([5, 10, 20]);

// netlify/lib/apple-products.mjs
var BUNDLE_ID = "app.cybernetai";
var pro = (interval) => Object.freeze({ plan: "pro", interval, seats: null, dailyPoolLimit: null, recoveryPoolLimit: null });
var business = (seats) => Object.freeze({
  plan: "business",
  interval: "month",
  seats,
  dailyPoolLimit: SEAT_POOL_LIMITS[seats].dailyPoolLimit,
  recoveryPoolLimit: SEAT_POOL_LIMITS[seats].recoveryPoolLimit
});
var PRODUCTS = Object.freeze({
  "app.cybernetai.pro.monthly": pro("month"),
  "app.cybernetai.pro.yearly": pro("year"),
  "app.cybernetai.business5.monthly": business(5),
  "app.cybernetai.business10.monthly": business(10),
  "app.cybernetai.business20.monthly": business(20)
});
var PRODUCT_IDS = Object.freeze(Object.keys(PRODUCTS));
function productFor(productId) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, productId) ? PRODUCTS[productId] : null;
}

// netlify/lib/apple-root-ca-g3.mjs
var APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";
var APPLE_ROOT_CA_G3_PLACEHOLDER = "NOT-EMBEDDED-YET: replace with the base64 DER of Apple Root CA - G3 (see the comment at the top of this file)";
var APPLE_ROOT_CA_G3_BASE64 = APPLE_ROOT_CA_G3_PLACEHOLDER;

// netlify/lib/apple-jws.mjs
var AppleJwsError = class extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "AppleJwsError";
    this.code = code;
  }
};
var LEAF_OID = Buffer.from("2a864886f76364060b01", "hex");
var INTERMEDIATE_OID = Buffer.from("2a864886f76364060201", "hex");
var MAX_JWS_CHARS = 16 * 1024;
var FUTURE_SKEW_MS = 5 * 60 * 1e3;
var B64URL = /^[A-Za-z0-9_-]+$/;
var B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function b64urlToBuffer(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function parseJson(buffer, code = "malformed") {
  try {
    const value = JSON.parse(buffer.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new AppleJwsError(code, "The signed data could not be read.");
  }
}
function derContainsOid(der, oidContent) {
  return der.includes(Buffer.concat([Buffer.from([6, oidContent.length]), oidContent]));
}
var testRoots = null;
function embeddedRoots() {
  try {
    const der = Buffer.from(String(APPLE_ROOT_CA_G3_BASE64), "base64");
    if (der.length < 200) return null;
    if (createHash2("sha256").update(der).digest("hex") !== APPLE_ROOT_CA_G3_SHA256) return null;
    new X509Certificate(der);
    return [der];
  } catch {
    return null;
  }
}
function toDer(root) {
  if (Buffer.isBuffer(root)) return root;
  if (root instanceof Uint8Array) return Buffer.from(root);
  return new X509Certificate(root).raw;
}
function verifyJws(jws, { now = Date.now(), trustedRoots } = {}) {
  if (typeof jws !== "string" || !jws || jws.length > MAX_JWS_CHARS) throw new AppleJwsError("malformed", "The signed data is missing or too large.");
  const parts = jws.split(".");
  if (parts.length !== 3 || !parts.every((part) => B64URL.test(part))) throw new AppleJwsError("malformed", "The signed data is not a JWS.");
  const header = parseJson(b64urlToBuffer(parts[0]));
  if (header.alg !== "ES256") throw new AppleJwsError("bad_alg", "Only ES256 is accepted.");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((item) => typeof item === "string" && B64.test(item))) {
    throw new AppleJwsError("bad_chain", "The certificate chain must have exactly three certificates.");
  }
  const roots = trustedRoots ? trustedRoots.map(toDer) : testRoots || embeddedRoots();
  if (!roots || !roots.length) throw new AppleJwsError("root_not_configured", "The Apple root certificate is not set up on the server.");
  const ders = x5c.map((item) => Buffer.from(item, "base64"));
  if (!roots.some((root2) => root2.equals(ders[2]))) throw new AppleJwsError("untrusted_root", "The chain does not end in the Apple root.");
  let leaf;
  let intermediate;
  let root;
  try {
    [leaf, intermediate, root] = ders.map((der) => new X509Certificate(der));
  } catch {
    throw new AppleJwsError("bad_chain", "A certificate could not be read.");
  }
  let linked = false;
  try {
    linked = leaf.verify(intermediate.publicKey) && intermediate.verify(root.publicKey) && leaf.checkIssued(intermediate) && intermediate.checkIssued(root);
  } catch {
    linked = false;
  }
  if (!linked) throw new AppleJwsError("bad_chain", "The certificates are not linked to each other.");
  if (!intermediate.ca) throw new AppleJwsError("bad_chain", "The intermediate certificate is not a CA.");
  if (!derContainsOid(ders[0], LEAF_OID) || !derContainsOid(ders[1], INTERMEDIATE_OID)) {
    throw new AppleJwsError("not_apple_cert", "The certificates are not Apple's receipt-signing certificates.");
  }
  let key;
  try {
    key = leaf.publicKey;
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("not P-256");
  } catch {
    throw new AppleJwsError("bad_chain", "The signing key is not a P-256 key.");
  }
  const signature = b64urlToBuffer(parts[2]);
  let valid = false;
  try {
    valid = signature.length === 64 && cryptoVerify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: "ieee-p1363" }, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new AppleJwsError("bad_signature", "The signature does not match.");
  const payload = parseJson(b64urlToBuffer(parts[1]));
  const signedAt = Number(payload.signedDate);
  if (!Number.isFinite(signedAt) || signedAt <= 0) throw new AppleJwsError("no_signed_date", "The signed data has no signing date.");
  if (signedAt > now + FUTURE_SKEW_MS) throw new AppleJwsError("future_signed", "The signed data is dated in the future.");
  for (const cert of [leaf, intermediate, root]) {
    const from = Date.parse(cert.validFrom);
    const to = Date.parse(cert.validTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || signedAt < from || signedAt > to) {
      throw new AppleJwsError("cert_expired", "A certificate was not valid when the data was signed.");
    }
  }
  return { header, payload, signedAt };
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var TRANSACTION_ID = /^[0-9]{1,40}$/;
function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}
function iso(ms) {
  if (ms === void 0 || ms === null || ms === "") return null;
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0 || value > 864e13) return null;
  return new Date(value).toISOString();
}
var isEnvironment = (value) => value === "Production" || value === "Sandbox";
function decodeTransaction(jws, options = {}) {
  const { payload, signedAt } = verifyJws(jws, options);
  if (payload.bundleId !== BUNDLE_ID) return { ok: false, reason: "wrong_bundle" };
  if (!productFor(payload.productId)) return { ok: false, reason: "unknown_product" };
  if (payload.type !== "Auto-Renewable Subscription") return { ok: false, reason: "wrong_type" };
  if (payload.inAppOwnershipType !== "PURCHASED") return { ok: false, reason: "family_shared" };
  if (!isEnvironment(payload.environment)) return { ok: false, reason: "bad_environment" };
  const transactionId = String(payload.transactionId ?? "");
  const originalTransactionId = String(payload.originalTransactionId ?? "");
  const expiresDate = iso(payload.expiresDate);
  if (!TRANSACTION_ID.test(transactionId) || !TRANSACTION_ID.test(originalTransactionId) || !expiresDate) return { ok: false, reason: "malformed" };
  const token = payload.appAccountToken;
  return {
    ok: true,
    tx: {
      transactionId,
      originalTransactionId,
      productId: payload.productId,
      bundleId: payload.bundleId,
      environment: payload.environment,
      type: payload.type,
      purchaseDate: iso(payload.purchaseDate),
      originalPurchaseDate: iso(payload.originalPurchaseDate),
      expiresDate,
      revocationDate: iso(payload.revocationDate),
      revocationReason: Number.isInteger(payload.revocationReason) ? payload.revocationReason : null,
      appAccountToken: isUuid(token) ? token.toLowerCase() : null,
      // An upgrade replaces this transaction with a newer one; it carries no entitlement of its own.
      superseded: payload.isUpgraded === true,
      signedAt
    }
  };
}
function decodeRenewalInfo(jws, options = {}) {
  const { payload, signedAt } = verifyJws(jws, options);
  const originalTransactionId = String(payload.originalTransactionId ?? "");
  if (!TRANSACTION_ID.test(originalTransactionId)) return { ok: false, reason: "malformed" };
  if (payload.environment !== void 0 && !isEnvironment(payload.environment)) return { ok: false, reason: "bad_environment" };
  return {
    ok: true,
    renewal: {
      originalTransactionId,
      autoRenewProductId: typeof payload.autoRenewProductId === "string" ? payload.autoRenewProductId : null,
      // 1 = will renew, 0 = the person turned renewal off.
      autoRenew: payload.autoRenewStatus === 1 ? true : payload.autoRenewStatus === 0 ? false : null,
      gracePeriodExpiresDate: iso(payload.gracePeriodExpiresDate),
      isInBillingRetryPeriod: payload.isInBillingRetryPeriod === true,
      expirationIntent: Number.isInteger(payload.expirationIntent) ? payload.expirationIntent : null,
      renewalDate: iso(payload.renewalDate),
      signedAt
    }
  };
}
function decodeNotification(jws, options = {}) {
  const { payload, signedAt } = verifyJws(jws, options);
  const type = typeof payload.notificationType === "string" ? payload.notificationType.slice(0, 60) : "";
  const uuid = typeof payload.notificationUUID === "string" ? payload.notificationUUID.toLowerCase() : "";
  if (!type || !isUuid(uuid)) return { ok: false, reason: "malformed" };
  const data = payload.data;
  if (!data || typeof data !== "object") return { ok: false, reason: "no_data" };
  if (data.bundleId !== BUNDLE_ID) return { ok: false, reason: data.bundleId ? "wrong_bundle" : "no_data" };
  return {
    ok: true,
    notification: {
      type,
      subtype: typeof payload.subtype === "string" ? payload.subtype.slice(0, 60) : null,
      uuid,
      environment: isEnvironment(data.environment) ? data.environment : null,
      bundleId: data.bundleId,
      appAppleId: data.appAppleId === void 0 || data.appAppleId === null ? null : String(data.appAppleId),
      signedAt,
      signedTransactionInfo: typeof data.signedTransactionInfo === "string" ? data.signedTransactionInfo : null,
      signedRenewalInfo: typeof data.signedRenewalInfo === "string" ? data.signedRenewalInfo : null
    }
  };
}

// netlify/lib/apple-apply.mjs
var AppleApplyError = class extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = "AppleApplyError";
    this.status = status;
  }
};
var iso2 = (ms) => Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null;
async function applyAppleTransaction({ userId, tx, renewal = null, notificationType = null, signedAtMs, serviceFetch: serviceFetch2 = serviceFetch }) {
  let response;
  try {
    response = await serviceFetch2("/rest/v1/rpc/apply_apple_subscription", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_user_id: userId,
        p_original_transaction_id: tx.originalTransactionId,
        p_latest_transaction_id: tx.transactionId,
        p_product_id: tx.productId,
        p_environment: tx.environment,
        p_purchase_date: tx.purchaseDate,
        p_expires_at: tx.expiresDate,
        p_revoked_at: tx.revocationDate,
        p_revocation_reason: tx.revocationReason,
        p_auto_renew: renewal ? renewal.autoRenew : null,
        p_grace_expires_at: renewal ? renewal.gracePeriodExpiresDate : null,
        p_signed_at: iso2(signedAtMs ?? tx.signedAt),
        p_notification_type: notificationType
      })
    });
  } catch (error) {
    throw new AppleApplyError(`apply_apple_subscription unreachable: ${error?.message || error}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AppleApplyError(`apply_apple_subscription failed (HTTP ${response.status}${payload?.code ? `, ${payload.code}` : ""})`);
  }
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row.result !== "string") throw new AppleApplyError("apply_apple_subscription returned no result");
  return { result: row.result, entitled: Boolean(row.entitled), businessAccountId: row.business_account_id || null };
}

// netlify/functions/apple-notifications.mjs
var HANDLED_TYPES = Object.freeze([
  "SUBSCRIBED",
  "DID_RENEW",
  "DID_CHANGE_RENEWAL_STATUS",
  "DID_CHANGE_RENEWAL_PREF",
  "DID_FAIL_TO_RENEW",
  "GRACE_PERIOD_EXPIRED",
  "EXPIRED",
  "REFUND",
  "REVOKE",
  "REFUND_REVERSED",
  "RENEWAL_EXTENDED",
  "OFFER_REDEEMED"
]);
var MAX_BODY_BYTES = 100 * 1024;
function env3(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}
var DatabaseError = class extends Error {
};
async function db(call, what) {
  let response;
  try {
    response = await call();
  } catch (error) {
    throw new DatabaseError(`${what} unreachable: ${error?.message || error}`);
  }
  if (!response.ok) throw new DatabaseError(`${what} failed (HTTP ${response.status})`);
  return response;
}
var iso3 = (ms) => Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null;
async function claim(notification, originalTransactionId) {
  const response = await db(() => serviceFetch("/rest/v1/apple_notifications?on_conflict=notification_uuid", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      notification_uuid: notification.uuid,
      notification_type: notification.type,
      subtype: notification.subtype,
      environment: notification.environment,
      original_transaction_id: originalTransactionId,
      signed_date: iso3(notification.signedAt),
      outcome: "error"
    })
  }), "Storing the notification");
  const inserted = await response.json().catch(() => []);
  if (Array.isArray(inserted) && inserted.length) return true;
  const existing = await db(
    () => serviceFetch(`/rest/v1/apple_notifications?notification_uuid=eq.${encodeURIComponent(notification.uuid)}&select=outcome`),
    "Reading the notification"
  );
  const rows = await existing.json().catch(() => []);
  return Array.isArray(rows) && rows[0]?.outcome === "error";
}
async function finish(notification, outcome, originalTransactionId = null) {
  try {
    await db(() => serviceFetch(`/rest/v1/apple_notifications?notification_uuid=eq.${encodeURIComponent(notification.uuid)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ outcome, ...originalTransactionId ? { original_transaction_id: originalTransactionId } : {} })
    }), "Updating the notification");
  } catch (error) {
    console.error("CyberNet apple-notifications: could not store the outcome", error.message);
  }
}
async function knownOwner(originalTransactionId) {
  const response = await db(
    () => serviceFetch(`/rest/v1/apple_subscriptions?original_transaction_id=eq.${encodeURIComponent(originalTransactionId)}&select=user_id`),
    "Looking up the subscription"
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows[0]?.user_id ? String(rows[0].user_id).toLowerCase() : null;
}
function reply(outcome, status = 200, extra = {}) {
  return json({ received: status === 200, outcome, ...extra }, status);
}
async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413);
  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "The request could not be read." }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413);
  let signedPayload = "";
  try {
    const body = JSON.parse(raw);
    signedPayload = typeof body?.signedPayload === "string" ? body.signedPayload : "";
  } catch {
    signedPayload = "";
  }
  if (!signedPayload) return json({ error: "Missing signedPayload." }, 400);
  let notification;
  let tx = null;
  let renewal = null;
  try {
    const decoded = decodeNotification(signedPayload);
    if (!decoded.ok) {
      if (decoded.reason === "malformed") return json({ error: "Malformed notification." }, 400);
      console.log(`apple-notifications: ignored (${decoded.reason})`);
      return reply("ignored");
    }
    notification = decoded.notification;
    const expectedAppId = env3("APPLE_APP_APPLE_ID");
    if (expectedAppId && notification.environment === "Production" && notification.appAppleId !== expectedAppId) {
      console.error("CyberNet apple-notifications: a Production notification carries another app id");
      reportError("Apple notification carries an unexpected app id", { fn: "apple-notifications", label: "Apple notification app id mismatch" });
      return json({ error: "Unexpected app." }, 400);
    }
    if (HANDLED_TYPES.includes(notification.type) && notification.signedTransactionInfo) {
      const decodedTx = decodeTransaction(notification.signedTransactionInfo);
      if (decodedTx.ok) tx = decodedTx.tx;
      else console.log(`apple-notifications: ${notification.type} transaction not ours (${decodedTx.reason})`);
      if (notification.signedRenewalInfo) {
        const decodedRenewal = decodeRenewalInfo(notification.signedRenewalInfo);
        if (decodedRenewal.ok) renewal = decodedRenewal.renewal;
      }
    }
  } catch (error) {
    if (error instanceof AppleJwsError) {
      if (error.code === "root_not_configured") {
        console.error("CyberNet apple-notifications: the Apple root certificate is not embedded on the server");
        reportError("Apple root certificate is not embedded; notifications cannot be verified", { fn: "apple-notifications", label: "Apple root certificate missing" });
        return json({ error: "Not available right now." }, 500);
      }
      console.warn(`apple-notifications: refused (${error.code})`);
      return json({ error: "Invalid notification." }, 400);
    }
    console.error("CyberNet apple-notifications failed while reading", error?.message || error);
    reportError(error, { fn: "apple-notifications", label: "Apple notification could not be read" });
    return json({ error: "Try again later." }, 500);
  }
  try {
    const handled = HANDLED_TYPES.includes(notification.type) && tx;
    const fresh = await claim(notification, tx?.originalTransactionId || null);
    if (!fresh) {
      console.log(`apple-notifications: ${notification.type} duplicate`);
      return reply("duplicate");
    }
    if (!handled) {
      await finish(notification, "ignored");
      console.log(`apple-notifications: ${notification.type} ignored`);
      return reply("ignored");
    }
    let applyTx = tx;
    if ((notification.type === "REFUND" || notification.type === "REVOKE") && !applyTx.revocationDate) {
      applyTx = { ...applyTx, revocationDate: iso3(notification.signedAt) };
    } else if (notification.type === "REFUND_REVERSED") {
      applyTx = { ...applyTx, revocationDate: null, revocationReason: null };
    }
    const token = applyTx.appAccountToken && isUuid(applyTx.appAccountToken) ? applyTx.appAccountToken : null;
    const userId = token || await knownOwner(applyTx.originalTransactionId);
    if (!userId) {
      await finish(notification, "unknown_user", applyTx.originalTransactionId);
      console.log(`apple-notifications: ${notification.type} ${applyTx.productId} unknown_user`);
      return reply("unknown_user");
    }
    const applied = await applyAppleTransaction({
      userId,
      tx: applyTx,
      renewal,
      notificationType: notification.type,
      signedAtMs: notification.signedAt
    });
    const outcome = applied.result === "stale" ? "stale" : applied.result === "unknown_user" ? "unknown_user" : applied.result === "wrong_account" ? "ignored" : "applied";
    await finish(notification, outcome, applyTx.originalTransactionId);
    console.log(`apple-notifications: ${notification.type}${notification.subtype ? `/${notification.subtype}` : ""} ${applyTx.productId} ${applied.result}`);
    return reply(outcome);
  } catch (error) {
    if (error instanceof DatabaseError || error instanceof AppleApplyError) {
      console.error("CyberNet apple-notifications: database step failed", error.message);
      reportError(error, { fn: "apple-notifications", label: "Apple notification could not be recorded" });
      return json({ error: "Try again later." }, 500);
    }
    console.error("CyberNet apple-notifications failed", error?.message || error);
    reportError(error, { fn: "apple-notifications", label: "Apple notification failed" });
    return json({ error: "Try again later." }, 500);
  }
}
var config = {
  path: "/api/apple-notifications"
};
export {
  HANDLED_TYPES,
  config,
  handler as default
};
