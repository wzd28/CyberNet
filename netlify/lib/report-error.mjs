// First-party error tracking for CyberNet AI: no vendor, no new account, no
// new table. Server functions call reportError() next to their console.error;
// /api/client-error calls it for browser errors (public/cybernet-errors.js).
//
// What it does with one error:
//   1. writes one JSON line to the function log (search the Netlify function
//      logs for "cn_error" or the fingerprint);
//   2. emails an alert to support@cybernetai.app through Resend, at most once
//      per fingerprint every 6 hours and at most 20 alerts a day, of which
//      browser reports may use only 10 (anyone can send one, so they must not
//      be able to use up the alerts that server errors need). The limits use
//      the existing consume_api_quota RPC (it accepts new keys, so no
//      migration); if that is unreachable, a per-instance memory fallback and
//      Resend's idempotency key keep the limits on a best-effort basis.
//      Browser reports only use the two fixed daily keys, never a key per
//      fingerprint, so they cannot fill api_rate_limits. Their alert has a
//      fixed subject (fingerprint and a known page), a "not verified" warning
//      and every link or hostname defanged, so a made-up report cannot be
//      turned into a phishing email from the site's own address.
//
// Rules it keeps:
//   - it never throws and never makes a response wait: the alert work runs in
//     the background (context.waitUntil when the platform offers it), every
//     network call has a short timeout, and the returned promise always
//     resolves;
//   - nothing personal leaves the function: messages and stacks are scrubbed of
//     emails, tokens and keys, ids, IP addresses, long numbers and the query
//     and hash of every URL before they are logged or emailed.
//
// Browser reports that client-error.mjs marks as not worth an email (an
// injected in-app script, or a browser older than the supported minimum) pass
// meta.skipAlert: they are logged with "filter": "ignored" or
// "unsupported-browser" and never use the alert limits.
//
// Kill switch: set ERROR_ALERTS=off in the Netlify environment to stop the
// emails (the log lines stay). ERROR_ALERT_EMAIL overrides the recipient.

import { createHash } from "node:crypto";
import { serviceFetch } from "./supabase.mjs";
import { RETRY_TIGHT } from "./supabase-retry.mjs";

// Mutable on purpose so the tests can shorten the timeouts.
export const limits = {
  rpcTimeoutMs: 1500,
  mailTimeoutMs: 4000,
  fingerprintWindowSeconds: 6 * 60 * 60,
  dayWindowSeconds: 24 * 60 * 60,
  maxAlertsPerDay: 20,
  maxClientAlertsPerDay: 10,
  maxMessageChars: 500,
  maxStackChars: 2048,
  maxFrames: 6,
  memoryEntries: 300
};

const ALERT_FROM = "CyberNet AI <notifications@cybernetai.app>";
const ALERT_TO = "support@cybernetai.app";

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "");
  } catch {
    try { return String(process.env[name] || ""); } catch { return ""; }
  }
}

/* ---------- scrubbing ---------- */

// Keeps a URL's origin and path (and a stack frame's :line:col), drops the
// query string and the hash, where tokens, emails and search terms live.
function cleanUrl(url) {
  const match = /^(.*?)((?::\d+){1,2})$/.exec(url);
  const base = match ? match[1] : url;
  const position = match ? match[2] : "";
  return base.split(/[?#]/)[0] + position;
}

const SCRUBBERS = [
  // Full URLs: keep origin + path only.
  [/\b(?:https?|wss?|file):\/\/[^\s"'<>()[\]{}`,]+/gi, (url) => cleanUrl(url)],
  [/\b(?:data|blob):[^\s"'<>()]+/gi, "<data-url>"],
  // Relative paths that still carry a query or hash.
  [/(^|[\s(@"'=])(\/[^\s?#"'<>()]*)([?#][^\s"'<>()]*)/g, (_, pre, pathPart, rest) => pre + pathPart + ((/((?::\d+){1,2})$/.exec(rest) || [""])[0])],
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
  [/(?<![\w:])(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?(?![\w:])/gi, (m) => (/[0-9a-f]{1,4}:.*[0-9a-f]/i.test(m) ? "<ip>" : m)],
  // Anything long and random-looking: session ids, hashes, API keys. Only
  // runs that mix letters and digits, so long plain names survive.
  [/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (/\d/.test(m) && /[A-Za-z]/.test(m) ? "<token>" : m)],
  // Bank account numbers (IBAN), with or without the groups of four.
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g, "<iban>"],
  // Long digit runs (phone, card and account numbers), separators allowed.
  // Stack line and column numbers are never 8 digits long, so a run after
  // ":", "/", "-" or "." goes too (tel:5551234567, wa.me/15551234567, ref-...).
  [/(?<!\w)\+?\d(?:[\s().-]{0,2}\d){7,}(?!\w)/g, "<number>"],
  // 12 or more digits in a row, even inside a word (an IBAN typed in lower case).
  [/\d{12,}/g, "<number>"]
];

export function scrubText(value, max = limits.maxMessageChars) {
  let text;
  try {
    text = typeof value === "string" ? value : value == null ? "" : String(value);
  } catch {
    text = "";
  }
  // Bound the work before the regexes run.
  text = text.slice(0, Math.max(0, max) * 4 + 64);
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  for (const [pattern, replacement] of SCRUBBERS) text = text.replace(pattern, replacement);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

// The stack lines worth showing: V8 "at fn (file:line:col)" and the
// Firefox/Safari "fn@file:line:col" form.
export function topFrames(stack, count = limits.maxFrames) {
  return String(stack || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^at\s/.test(line) || /@.*:\d+(?::\d+)?$/.test(line))
    .slice(0, count)
    .map((line) => line.slice(0, 200));
}

/* ---------- describing an error ---------- */

function read(object, key) {
  try { return object?.[key]; } catch { return undefined; }
}

function describe(error) {
  const out = { name: "Error", message: "", stack: "", code: "", status: undefined };
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
    out.message = error === undefined ? "Unknown error (undefined)" : "Non-error value thrown";
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
    const value = context?.deploy?.context || globalThis.Netlify?.context?.deploy?.context || env("CONTEXT");
    return /^[\w-]{1,40}$/.test(String(value || "")) ? String(value) : "";
  } catch {
    return "";
  }
}

function safeLabel(value, max) {
  return scrubText(typeof value === "string" ? value : "", max).replace(/\s+/g, " ").trim();
}

// What a browser report may say about itself. The browser reporter
// (public/cybernet-errors.js) only ever sends these shapes, and anything else
// is dropped, because the sender cannot be trusted:
//   file  a script on this site: /script.js or /ui/cybernet-ui.js, plus :line:col
//   ua    "Chrome 141 on Android" (browserFamily() in cybernet-errors.js), or
//         one built from the User-Agent header (describeUserAgent() in
//         client-error-filters.mjs): "Instagram in-app (iOS 18)",
//         "Android WebView 69 (Android 9)"
export const CLIENT_FILE = /^\/(?!\/)[\w./-]{1,200}\.m?js(?::\d{1,7}){0,2}$/;
export const CLIENT_UA = /^(?:(?:Edge|Opera|Samsung Internet|Chrome|Firefox|Safari|Other)(?: \d{1,4})? on (?:Windows|iOS|Android|ChromeOS|macOS|Linux|Other)|(?:Instagram|Facebook|TikTok|Snapchat|LinkedIn|WhatsApp|Google app|News app|Other) in-app \((?:iOS|Android)(?: \d{1,3})?\)|Android WebView(?: \d{1,4})? \(Android(?: \d{1,3})?\))$/;
const SKIP_ALERT = new Set(["ignored", "unsupported-browser"]);
const CLIENT_VERSION = /^[\w-]{1,32}$/;

// The pages of the site, for the subject line of a browser alert. Any other
// path (a mistyped address, or a made-up one) is shown as "/other".
const ROUTES = new Set([
  "/", "/quick-scan", "/analysis-ai", "/recovery", "/learn", "/pricing", "/about", "/accept-invite",
  "/privacy.html", "/terms.html", "/refunds.html", "/acceptable-use.html", "/404.html"
]);
export function routeOf(page) {
  let path = String(page || "/").split(/[?#]/)[0].toLowerCase();
  if (path === "/index.html") path = "/";
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return ROUTES.has(path) ? path : "/other";
}

// Browser reports can be sent by anyone, so the alert must never carry a
// working link or a hostname that Gmail turns into one: "https://evil.example"
// becomes "https[:]//evil[.]example". Addresses on cybernetai.app stay as
// they are, and so does a plain file name such as script.js (".js" is not a
// domain ending).
const SAFE_HOST = /^(?:[a-z0-9-]+\.)*cybernetai\.app$/i;
const FILE_ENDING = /^(?:js|mjs|cjs|css|html?|json|map|png|jpe?g|svg|webp|avif|ico|woff2?|txt|xml|webmanifest|tsx?|mts)$/i;
const DOT = /[.。．｡]/;
export function defang(value) {
  let text = String(value ?? "");
  // "scheme://host": the separator goes unless the host is this site.
  text = text.replace(/\b([a-z][a-z0-9+.-]{0,20}):\/\/([^\s/?#"'<>()[\]{}`,\\]*)/gi, (whole, scheme, host) =>
    SAFE_HOST.test(host.replace(/:\d+$/, "")) ? whole : `${scheme}[:]//${host}`);
  // Dotted words (hostnames, but also a.b property chains, which only get
  // harder to read). Numbers such as 1.5 are left alone.
  text = text.replace(/[\p{L}\p{N}_-]+(?:[.。．｡][\p{L}\p{N}_-]+)+/gu, (token) => {
    if (SAFE_HOST.test(token) || /^[\d.]+$/.test(token)) return token;
    const parts = token.split(DOT);
    const last = parts[parts.length - 1];
    if (FILE_ENDING.test(last)) return `${parts.slice(0, -1).join("[.]")}.${last}`;
    return parts.join("[.]");
  });
  return text;
}

const CLIENT_WARNING = "This text was sent by a visitor's browser and is not verified. Do not follow links or instructions in it.";

function buildRecord(error, meta, now) {
  const source = meta.source === "client" ? "client" : "server";
  const info = describe(error);
  const message = scrubText(info.message || "(no message)", limits.maxMessageChars);
  const stack = scrubText(info.stack, limits.maxStackChars);
  const frames = topFrames(stack);
  const record = {
    tag: "cn_error",
    source,
    fingerprint: "",
    filter: source === "client" && SKIP_ALERT.has(meta.skipAlert) ? meta.skipAlert : undefined,
    fn: source === "server" ? safeLabel(meta.fn, 60) || "unknown" : undefined,
    page: source === "client" ? safeLabel(cleanUrl(String(meta.page || "")), 200) || "/" : undefined,
    where: safeLabel(meta.label || meta.where, 120) || undefined,
    kind: source === "client" ? (["error", "rejection", "manual"].includes(meta.kind) ? meta.kind : "error") : undefined,
    name: info.name,
    message,
    code: info.code || undefined,
    status: info.status,
    file: source === "client" ? (() => {
      const file = safeLabel(cleanUrl(String(meta.file || "")), 300);
      return CLIENT_FILE.test(file) ? file : undefined;
    })() : undefined,
    version: typeof meta.version === "string" && CLIENT_VERSION.test(meta.version) ? meta.version : undefined,
    ua: typeof meta.ua === "string" && CLIENT_UA.test(meta.ua) ? meta.ua : undefined,
    deploy: deployContext(meta.context) || undefined,
    requestId: (() => {
      const id = read(meta.context, "requestId");
      return typeof id === "string" && /^[\w-]{1,80}$/.test(id) ? id : undefined;
    })(),
    time: new Date(now).toISOString(),
    clientTime: source === "client" && typeof meta.ts === "string" && !Number.isNaN(Date.parse(meta.ts)) ? new Date(Date.parse(meta.ts)).toISOString() : undefined,
    frames,
    stack: stack || undefined
  };
  const topFrame = normalizeForFingerprint((frames[0] || record.file || "").replace(/:\d+(?=\)?$)/, ""));
  const basis = source === "server"
    ? ["server", record.fn, record.where || "", record.name, normalizeForFingerprint(message)].join("|")
    : ["client", record.kind, record.name, normalizeForFingerprint(message), topFrame].join("|");
  record.fingerprint = sha(basis).slice(0, 12);
  return record;
}

/* ---------- per-instance memory ---------- */

const memory = {
  fingerprints: new Map(), // fp -> { count, firstSeen, mailBlockedUntil }
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

// For the tests: forget everything this instance remembers.
export function resetErrorMemory() {
  memory.fingerprints.clear();
  memory.day = freshDay(0);
}

/* ---------- durable limits (existing RPC, no migration) ---------- */

// One call to public.consume_api_quota. Returns null when the service cannot
// answer (no configuration, timeout, error), so callers can fall back.
export async function consumeQuota(key, windowSeconds, max) {
  try {
    const response = await serviceFetch("/rest/v1/rpc/consume_api_quota", {
      method: "POST",
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_max_requests: max }),
      signal: AbortSignal.timeout(limits.rpcTimeoutMs)
    }, RETRY_TIGHT); // time-boxed: at most one PGRST303 retry, inside the same timeout
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || typeof data.allowed !== "boolean") return null;
    const resetAt = Date.parse(data.reset_at);
    return { allowed: data.allowed, used: Number(data.used) || 0, resetAt: Number.isFinite(resetAt) ? resetAt : 0 };
  } catch {
    return null;
  }
}

/* ---------- the alert email ---------- */

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
    const times = count.n >= 10000 ? "10,000 or more times" : count.n === 1 ? "1 time" : `${count.n} times`;
    return `${times} since ${formatUtc(count.since)} (all servers)`;
  }
  if (count.scope === "client") {
    return `${count.n === 1 ? "1 time" : `${count.n} times`} on this server since ${formatUtc(count.since)} (browser errors are counted on each server separately)`;
  }
  return `${count.n === 1 ? "1 time" : `${count.n} times`} on this server since ${formatUtc(count.since)} (the shared counter was unavailable)`;
}

export function buildAlertEmail(record, count) {
  const isClient = record.source === "client";
  // Everything a browser sent is defanged (see defang above); the subject
  // carries no browser text at all, only the fingerprint and a known page.
  const own = isClient ? defang : (value) => String(value ?? "");
  const route = isClient ? routeOf(record.page) : "";
  const file = isClient && record.file && CLIENT_FILE.test(record.file) ? own(record.file) : "";
  const where = isClient ? `page ${route}${file ? ` (file ${file})` : ""}` : `function ${record.fn}`;
  const deployTag = record.deploy && record.deploy !== "production" ? `[${record.deploy}] ` : "";
  const headline = own(`${record.name && !record.message.startsWith(record.name) ? `${record.name}: ` : ""}${record.message}`);
  const subject = (isClient
    ? `${deployTag}CyberNet AI browser error ${record.fingerprint} on ${route}`
    : `${deployTag}CyberNet AI server error in ${record.fn}: ${headline}`)
    .replace(/\s+/g, " ");
  // Long subjects are cut at a word, not mid-word.
  const shortSubject = subject.length > 150 ? `${subject.slice(0, 149).replace(/\s+\S*$/, "")}…` : subject;

  const rows = [
    ["What happened", isClient
      ? `A visitor's browser hit an error${record.where ? ` (${own(record.where)})` : ""}.`
      : `${record.where || `The ${record.fn} function failed`}.`],
    ["Where", where],
    ["Message", headline],
    ["Count", countLine(count)],
    ["Time", formatUtc(Date.parse(record.time), true)],
    ["Fingerprint", record.fingerprint],
    ...(record.code || record.status ? [["Code", [record.code, record.status].filter(Boolean).join(" / ")]] : []),
    ...(record.version ? [["UI version", own(record.version)]] : []),
    ...(record.ua ? [["Browser", own(record.ua)]] : []),
    ...(record.deploy ? [["Deploy", record.deploy]] : []),
    ...(record.requestId ? [["Request id", record.requestId]] : [])
  ];
  const frames = record.frames.length ? record.frames.map(own) : ["(no stack trace was available)"];
  const next = `You get at most one email for this error every 6 hours and at most ${limits.maxAlertsPerDay} error emails a day${isClient ? ` (browser errors: at most ${limits.maxClientAlertsPerDay})` : ""}. Every occurrence is in the Netlify function logs: search for ${record.fingerprint}.`;

  const text = [
    ...(isClient ? [CLIENT_WARNING, ""] : []),
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
    const bucket = Math.floor(Date.now() / (limits.fingerprintWindowSeconds * 1000));
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
        to: [env("ERROR_ALERT_EMAIL") || ALERT_TO],
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

/* ---------- the alert decision ---------- */

// This instance's own count of alerts in the current 24 hours. It only
// decides when the shared counter cannot answer.
function freshDay(now) {
  return { windowStart: now, sent: 0, clientSent: 0, blockedUntil: 0, clientBlockedUntil: 0 };
}
function localDayFull(now, clientOnly = false) {
  if (now - memory.day.windowStart >= limits.dayWindowSeconds * 1000) memory.day = freshDay(now);
  return clientOnly ? memory.day.clientSent >= limits.maxClientAlertsPerDay : memory.day.sent >= limits.maxAlertsPerDay;
}
const dayEnd = (quota) => (quota && quota.resetAt) || memory.day.windowStart + limits.dayWindowSeconds * 1000;

// local is what this instance decided synchronously: "claim" (no alert for
// this error here in the last 6 hours, slot now taken), "deduped" or "daily_cap".
async function alertFor(record, entry, local) {
  const now = Date.now();
  const fp = record.fingerprint;
  if (env("ERROR_ALERTS").toLowerCase() === "off") return { email: "disabled", count: null };
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) return { email: "no_key", count: null };

  const isClient = record.source === "client";
  // Server errors: the shared counter runs for every occurrence (the email
  // reports it); the fingerprint check only when this instance has not
  // already alerted. Browser reports never get rows of their own: anyone can
  // send them with any message, and every new fingerprint would leave two
  // permanent rows in api_rate_limits. They are counted and deduplicated in
  // this instance's memory, with Resend's idempotency key (fingerprint + 6-hour
  // window) stopping a second instance from sending the same alert.
  const [counted, fpQuota] = isClient
    ? [null, null]
    : await Promise.all([
      consumeQuota(`cn_err:n:${fp}`, limits.dayWindowSeconds, 10000),
      local === "claim" ? consumeQuota(`cn_err:mail:${fp}`, limits.fingerprintWindowSeconds, 1) : Promise.resolve(null)
    ]);
  const count = counted
    ? { n: counted.used, since: (counted.resetAt || now + limits.dayWindowSeconds * 1000) - limits.dayWindowSeconds * 1000, scope: "all" }
    : { n: entry.count, since: entry.firstSeen, scope: isClient ? "client" : "instance" };

  if (local !== "claim") return { email: local, count };

  if (fpQuota && !fpQuota.allowed) {
    // The shared window decides when this error may alert again.
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

/**
 * Records one error. Safe to call anywhere: it never throws, and the returned
 * promise always resolves (callers normally do not await it).
 *
 *   reportError(error, { fn: "analyze", label: "AI analysis failed", context })
 *
 * meta.fn       server function name            meta.label  what was being done
 * meta.context  the Netlify context (waitUntil)  meta.status skip when 400-499 (expected)
 * Browser reports (from /api/client-error) pass source "client" with page,
 * file, kind, version, ua and ts, plus skipAlert ("ignored" or
 * "unsupported-browser") to log without emailing.
 */
export function reportError(error, meta = {}) {
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
    } catch { /* logging must not break the caller */ }
    // Logged only: no alert, and no alert limit is used.
    if (record.filter) return Promise.resolve({ fingerprint: record.fingerprint, logged: true, email: record.filter, record });

    // Claim the alert slot synchronously, so two reports of the same error in
    // this instance cannot both email.
    let local = "claim";
    if (memory.day.blockedUntil > now || (record.source === "client" && memory.day.clientBlockedUntil > now)) local = "daily_cap";
    else if (entry.mailBlockedUntil > now) local = "deduped";
    else entry.mailBlockedUntil = now + limits.fingerprintWindowSeconds * 1000;

    const work = alertFor(record, entry, local)
      .then((result) => {
        if (result.email === "sent" || result.email === "failed") {
          try {
            console.error(JSON.stringify({ tag: "cn_error_alert", fingerprint: record.fingerprint, email: result.email }));
          } catch { /* ignore */ }
        }
        return { fingerprint: record.fingerprint, logged: true, email: result.email, count: result.count, record };
      })
      .catch(() => ({ fingerprint: record.fingerprint, logged: true, email: "failed" }));

    try {
      const context = meta.context || globalThis.Netlify?.context;
      if (context && typeof context.waitUntil === "function") context.waitUntil(work);
    } catch { /* no waitUntil: the promise still runs */ }

    return work;
  } catch {
    return Promise.resolve({ logged: false, email: "failed" });
  }
}
