// Protection for the functions that spend money (OpenAI, screenshot credits).
// Brief step 9, 18 Nov 2026: "Add rate limiting and bot protection so bots
// don't burn OpenAI costs."
//
// Three things, all on the existing consume_api_quota RPC (no migration, no new
// table, no third-party script):
//
//   1. burstGuard(): short-window limits per connection (IP) and per account.
//      They sit on top of the daily plan allowances, which stay as they were.
//      They stop a script from firing many requests a minute even with a pile
//      of free accounts. The per-connection limits are much looser than the
//      per-account ones, because a whole office (the Business audience) or a
//      mobile carrier can share one address.
//   2. allowAiCall(): one global daily ceiling on OpenAI calls, for every
//      account and every function together. It is a cost circuit breaker: when
//      it trips, Analysis AI falls back to the rule engine (the person is not
//      charged) and Recovery keeps its rule-based plan. The owner gets one alert
//      email (report-error.mjs dedupes it to one every 6 hours).
//   3. readBodyText(): reads a request body with a hard byte cap, so an
//      oversized or endless body is refused while it streams in instead of
//      being buffered first.
//
// Every quota check fails open (like screenshot-preview.mjs): if the quota
// service is down, people keep getting their results.
//
// Environment (Netlify > Site configuration > Environment variables):
//   AI_DAILY_CALL_CEILING  OpenAI calls allowed per 24 hours for the whole site.
//                          Default 2000. Whole number 1-10000 (the RPC refuses
//                          more, so bigger numbers are clamped to 10000).
//                          "off" turns the breaker off.
//   RATE_LIMITS            "off" turns the per-IP / per-account burst limits off.
//
// IP addresses are never stored: each is turned into one of 65,536 keyed-hash
// buckets (as feedback.mjs and client-error.mjs do), which also bounds how many
// rows the counters can add to api_rate_limits.

import { createHmac } from "node:crypto";
import { consumeQuota, reportError } from "./report-error.mjs";

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) ?? process.env[name] ?? "").trim();
  } catch {
    try { return String(process.env[name] || "").trim(); } catch { return ""; }
  }
}

/* ---------- limits ---------- */

// window: seconds (the RPC needs 60 or more); max: requests in that window.
export const GUARD_RULES = {
  // Per account the existing 40 per 10 minutes (check_protect_rate_limit) and
  // the daily plan allowance still apply; this adds a per-minute cap.
  analyze: {
    ip: [{ window: 60, max: 20 }, { window: 3600, max: 150 }],
    user: [{ window: 60, max: 8 }]
  },
  // Free has 1 case a day, so these only matter for scripts and many accounts.
  "recovery-mode": {
    ip: [{ window: 60, max: 6 }, { window: 3600, max: 30 }],
    user: [{ window: 60, max: 3 }]
  },
  "recovery-update": {
    ip: [{ window: 60, max: 15 }, { window: 3600, max: 120 }],
    user: [{ window: 60, max: 6 }]
  },
  // Per account it already has 6 a minute and 60 a day.
  "screenshot-preview": {
    ip: [{ window: 60, max: 20 }, { window: 3600, max: 120 }],
    user: []
  },
  // Bring-your-own-key checks (security audit Nov 2026, AI-6): a person tries
  // a key a few times at most, so these only stop a script testing a list of
  // stolen OpenAI keys through the site.
  "byok-analyze": {
    ip: [{ window: 60, max: 20 }, { window: 3600, max: 60 }],
    user: [{ window: 60, max: 5 }]
  },
  "validate-openai-key": {
    ip: [{ window: 60, max: 20 }, { window: 3600, max: 60 }],
    user: [{ window: 60, max: 5 }, { window: 3600, max: 10 }, { window: 86400, max: 30 }]
  }
};

export const AI_CEILING_DEFAULT = 2000;
export const AI_CEILING_MAX = 10000; // consume_api_quota refuses p_max_requests above this
export const AI_CEILING_KEY = "g:ai:calls:day";
const AI_CEILING_WINDOW = 86400;

// The ceiling the breaker uses, or 0 when it is switched off.
export function aiCeiling() {
  const raw = env("AI_DAILY_CALL_CEILING").toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return 0;
  if (!raw) return AI_CEILING_DEFAULT;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return AI_CEILING_DEFAULT;
  return Math.min(n, AI_CEILING_MAX);
}

/* ---------- who is calling ---------- */

// Cloudflare's published edge ranges (https://www.cloudflare.com/ips/, checked
// 18 Nov 2026). cybernetai.app is proxied by Cloudflare, so the address
// Netlify sees can be a Cloudflare edge server shared by many visitors. Only
// when the connection really comes from Cloudflare is its CF-Connecting-IP
// header (the visitor's own address) trusted; anyone else could fake it.
const CF_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14",
  "172.64.0.0/13", "131.0.72.0/22"];
const CF_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

function v4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function v6ToBigInt(ip) {
  let s = ip.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(s) || !s.includes(":")) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g, 16)), 0n);
}

export function isCloudflareAddress(address) {
  const ip = String(address || "").trim().replace(/^\[|\]$/g, "");
  const v4 = v4ToInt(ip.replace(/^::ffff:/i, ""));
  if (v4 !== null) {
    return CF_V4.some((cidr) => {
      const [base, bits] = cidr.split("/");
      const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
      return ((v4 & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
    });
  }
  const v6 = v6ToBigInt(ip);
  if (v6 === null) return false;
  return CF_V6.some((cidr) => {
    const [base, bits] = cidr.split("/");
    const shift = 128n - BigInt(bits);
    return (v6 >> shift) === (v6ToBigInt(base) >> shift);
  });
}

// Only the custom domain sits behind Cloudflare. A request to the
// *.netlify.app hosts reaches Netlify directly, so there a CF-Connecting-IP
// header (which anyone relaying through Cloudflare could choose) is not
// trusted (security audit Nov 2026, SRV-8).
function viaCustomDomain(request) {
  try {
    const host = new URL(request.url).hostname.toLowerCase();
    let own = "cybernetai.app";
    try {
      const configured = env("SITE_URL");
      if (configured) own = new URL(configured).hostname.toLowerCase();
    } catch { /* keep the default */ }
    return host === own || host === `www.${own}`;
  } catch {
    return false;
  }
}

// The caller's address as well as it can be known.
export function clientAddress(request, context) {
  let direct = "";
  try {
    direct = String(context?.ip || request.headers.get("x-nf-client-connection-ip") || "").trim();
  } catch { /* keep "" */ }
  try {
    // SRV-8 (security audit Nov 2026): CF-Connecting-IP is only believed on
    // the custom domain, which is the only host Cloudflare proxies to us. On
    // the *.netlify.app hosts a request relayed through Cloudflare egress (for
    // example someone's Worker) could choose that header, so there the
    // connection address is used.
    const cf = String(request.headers.get("cf-connecting-ip") || "").trim();
    if (cf && direct && isCloudflareAddress(direct) && viaCustomDomain(request)) return cf.slice(0, 64);
  } catch { /* fall through */ }
  if (direct) return direct.slice(0, 64);
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded.slice(0, 64);
  } catch { /* fall through */ }
  return "unknown";
}

// One of 65,536 buckets; the raw address is never stored.
export function addressBucket(address) {
  const pepper = env("ERROR_REPORT_SALT") || env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") || "cybernet-guard";
  return createHmac("sha256", pepper).update(`guard:${address}`).digest("hex").slice(0, 4);
}

/* ---------- 1. burst limits ---------- */

// Test seam: tests swap `consume` for a stub. Production never changes it.
export const guardDeps = { consume: (key, window, max) => consumeQuota(key, window, max) };

// null when the request may go on, otherwise { status: 429, body } to return.
// A null quota answer (service down, timeout) counts as allowed.
export async function burstGuard(fn, { request, context, userId } = {}) {
  try {
    if (env("RATE_LIMITS").toLowerCase() === "off") return null;
    const rules = GUARD_RULES[fn];
    if (!rules) return null;
    const checks = [];
    const bucket = addressBucket(clientAddress(request, context));
    for (const rule of rules.ip || []) checks.push({ scope: "ip", rule, key: `g:${fn}:ip${rule.window}:${bucket}` });
    if (userId) for (const rule of rules.user || []) checks.push({ scope: "user", rule, key: `g:${fn}:u${rule.window}:${userId}` });
    const answers = await Promise.all(checks.map((c) => Promise.resolve().then(() => guardDeps.consume(c.key, c.rule.window, c.rule.max)).catch(() => null)));
    const hit = checks.find((_, i) => answers[i] && answers[i].allowed === false);
    if (!hit) return null;
    const answer = answers[checks.indexOf(hit)];
    const retryAfterSeconds = answer.resetAt ? Math.max(1, Math.ceil((answer.resetAt - Date.now()) / 1000)) : hit.rule.window;
    try {
      console.warn(JSON.stringify({ tag: "cn_rate_limited", fn, scope: hit.scope, window: hit.rule.window, max: hit.rule.max }));
    } catch { /* ignore */ }
    return {
      status: 429,
      retryAfterSeconds,
      body: {
        error: hit.scope === "ip"
          ? "Too many requests from this connection. Please wait a minute and try again."
          : "Too many requests in a short time. Please wait a minute and try again.",
        code: "rate_limited",
        retryAfterSeconds
      }
    };
  } catch {
    return null;
  }
}

/* ---------- 1b. per-account AI limits (security pass, Nov 2026) ---------- */

// AI-2: a per-account daily count of OpenAI calls that a refund never lowers.
// The daily plan allowance is refunded whenever no AI answer came back, so on
// its own it does not bound how many (billed) calls one account can cause.
// The numbers sit far above any plan's daily allowance (Free 3-5, Pro 15, the
// App Review account's raised 50), so
// a real person never meets them; team pools are shared, hence the higher
// paid number. Fails open, like every quota here.
export const USER_AI_CALLS_PER_DAY = Object.freeze({ free: 60, paid: 400 });

// true when this account may make one more OpenAI call today (and counts it).
export async function allowUserAiCall(userId, { paid = false } = {}) {
  if (!userId) return true;
  try {
    const max = paid ? USER_AI_CALLS_PER_DAY.paid : USER_AI_CALLS_PER_DAY.free;
    const answer = await guardDeps.consume(`g:aicalls:day:${userId}`, 86400, max);
    return !(answer && answer.allowed === false);
  } catch {
    return true;
  }
}

// AI-2: refunds for a call OpenAI did answer (and bill), but whose answer was
// unusable (cut off, refused, unparseable, timed out), are capped per account
// per day. Real outages (no answer at all) are refunded as before.
export const BILLED_REFUNDS_PER_DAY = 3;
export async function allowBilledRefund(userId) {
  if (!userId) return true;
  try {
    const answer = await guardDeps.consume(`g:refund:day:${userId}`, 86400, BILLED_REFUNDS_PER_DAY);
    return !(answer && answer.allowed === false);
  } catch {
    return true;
  }
}

/* ---------- 2. the global daily OpenAI ceiling ---------- */

// SRV-5: Free and App-tier callers also share a sub-ceiling (this share of the
// whole ceiling), checked first, so a farm of free accounts cannot use up the
// AI answers paying customers rely on. The global key stays the hard bound.
export const FREE_CEILING_SHARE = 0.65;
export const AI_FREE_CEILING_KEY = "g:ai:calls:day:free";

// true when an OpenAI call may be made now. Counts the call when it allows it.
// allowAiCall.lastReport holds the newest alert promise, so a background
// function (no waitUntil) can await it before it ends.
// options.freeTier (or free, the website lane's name): the caller is on Free or
// the App tier (see SRV-5 above).
export async function allowAiCall(fn, context, { freeTier = false, free = false } = {}) {
  const ceiling = aiCeiling();
  if (!ceiling) return true;
  if (freeTier || free) {
    const freeCeiling = Math.max(1, Math.floor(ceiling * FREE_CEILING_SHARE));
    let freeAnswer = null;
    try {
      freeAnswer = await guardDeps.consume(AI_FREE_CEILING_KEY, AI_CEILING_WINDOW, freeCeiling);
    } catch {
      freeAnswer = null;
    }
    if (freeAnswer && freeAnswer.allowed === false) {
      try {
        console.error(JSON.stringify({ tag: "cn_ai_free_ceiling", fn, ceiling: freeCeiling }));
      } catch { /* ignore */ }
      allowAiCall.lastReport = reportError(new Error(`Free-tier AI call ceiling reached (${freeCeiling} calls in 24 hours)`), {
        fn, label: "Free-tier AI answers paused (paid plans unaffected)", context
      });
      return false;
    }
  }
  let answer = null;
  try {
    answer = await guardDeps.consume(AI_CEILING_KEY, AI_CEILING_WINDOW, ceiling);
  } catch {
    answer = null;
  }
  if (!answer) return true; // fail open
  const warnAt = Math.floor(ceiling * 0.8);
  if (answer.allowed && warnAt >= 1 && answer.used === warnAt) {
    // Once per window: the counter passes this number exactly once.
    allowAiCall.lastReport = reportError(new Error(`AI call ceiling 80% used (${warnAt} of ${ceiling} in 24 hours)`), {
      fn, label: "AI spending warning: 80% of the daily ceiling", context
    });
  }
  if (answer.allowed) return true;
  try {
    console.error(JSON.stringify({ tag: "cn_ai_ceiling", fn, ceiling, resetAt: answer.resetAt || null }));
  } catch { /* ignore */ }
  // Fixed message, so report-error.mjs sends at most one alert per 6 hours.
  const reported = reportError(new Error(`AI call ceiling reached (${ceiling} calls in 24 hours)`), {
    fn, label: "AI cost circuit breaker tripped: AI answers paused, rule engine only", context
  });
  allowAiCall.lastReport = reported;
  return false;
}

/* ---------- 3. capped body reads ---------- */

// { ok: true, text } or { ok: false, status: 413 }. Refuses at once when the
// declared Content-Length is over the cap, and stops reading as soon as the
// streamed bytes pass it (a body with no Content-Length, or a false one).
export async function readBodyText(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }
  return { ok: true, text: Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))).toString("utf8") };
}

// readBodyText + JSON.parse. { ok: true, body } or { ok: false, status }.
export async function readJsonCapped(request, maxBytes) {
  const read = await readBodyText(request, maxBytes);
  if (!read.ok) return read;
  try {
    return { ok: true, body: JSON.parse(read.text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

// For small JSON bodies (security audit Nov 2026, SRV-11): the parsed object,
// {} for an empty or unreadable body (what request.json().catch(() => ({}))
// gave before), or null when the body is over the cap, which the caller
// answers with 413.
export async function smallJsonBody(request, maxBytes = 16_000) {
  const read = await readJsonCapped(request, maxBytes);
  if (!read.ok) return read.status === 413 ? null : {};
  return read.body && typeof read.body === "object" ? read.body : {};
}
