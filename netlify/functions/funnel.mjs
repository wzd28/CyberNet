// POST /api/funnel: adds 1 to an anonymous daily total for one step of the
// website's funnel (visit -> check -> sign-up), so the owner can see where
// visitors stop without cookies or analytics consent.
//
// Body (JSON, under 1 KB, any content type because navigator.sendBeacon
// sends text/plain): { "event": "<step>", "source": "<label>" }
//   event   one of EVENTS below; anything else is a 400
//   source  a short label for where the visitor first came from (utm_source,
//           or tiktok / meta / google from the click id, else direct /
//           referral). Lower-cased, cut to [a-z0-9_-], at most 40 characters;
//           empty becomes "direct".
//
// What is stored: public.funnel_daily (day, event, source, count) through the
// public.funnel_bump RPC (supabase/migrations/20261118120000_funnel_counts.sql).
// Nothing else: no IP address, no user id, no cookie, no browser detail. The
// connection address is only used, hashed, as a rate-limit bucket (one of 256
// fixed keys, like /api/client-error) and is never stored or logged as is.
//
// Website only: a request must come from this site's own origin (Origin, or
// the Referer when an old browser sends no Origin). No CORS, so the iPhone
// app (capacitor://localhost) cannot call it.
//
// Fails soft: until the migration is applied (or when Supabase is down or not
// configured) the step is simply not counted and the answer is still 204. No
// error report is sent, so a missing table never floods the alert email.
//
// Limits: 60 steps a minute per address bucket and 6000 an hour for everyone,
// through the existing consume_api_quota RPC (fails open).

import { createHmac } from "node:crypto";
import { serviceFetch } from "../lib/supabase.mjs";
import { consumeQuota } from "../lib/report-error.mjs";
import { clientAddress } from "../lib/abuse-guard.mjs";

export const EVENTS = Object.freeze([
  "land", "scan_guest", "scan_account", "signup_open", "signup_submit", "signup_confirmed", "ai_open", "checkout_open"
]);
const MAX_BODY_BYTES = 1024;
const PER_ADDRESS_PER_MINUTE = 60;
const ALL_PER_HOUR = 6000;

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "");
  } catch {
    return "";
  }
}

function reply(status, data = null) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {
      ...(data === null ? {} : { "Content-Type": "application/json; charset=utf-8" }),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

// "TikTok Ads" -> "tiktokads"; "" -> "direct".
export function cleanSource(value) {
  const s = String(typeof value === "string" ? value : "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return s || "direct";
}

// The step and source to count, or null when the body is not a known step.
export function validateFunnel(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (typeof body.event !== "string" || !EVENTS.includes(body.event)) return null;
  return { event: body.event, source: cleanSource(body.source) };
}

function hostOf(value) {
  try { return new URL(value).host.toLowerCase(); } catch { return ""; }
}

// Same-origin website requests only. Origin first; a browser that sends none
// on a same-origin POST is checked by its Referer instead.
export function fromThisSite(request) {
  const own = hostOf(request.url);
  if (!own) return false;
  const origin = request.headers.get("origin");
  if (origin) return origin !== "null" && /^https?:\/\//i.test(origin) && hostOf(origin) === own;
  const referer = request.headers.get("referer");
  return Boolean(referer) && /^https?:\/\//i.test(referer) && hostOf(referer) === own;
}

function addressKey(request, context) {
  let address = "unknown";
  try {
    // SRV-7 / INFRA-3 (security audit Nov 2026): the real visitor address
    // (cybernetai.app sits behind Cloudflare, so the connection address is a
    // shared Cloudflare edge; lib/abuse-guard.mjs clientAddress handles that).
    address = String(clientAddress(request, context) || "unknown").slice(0, 64);
  } catch { /* keep "unknown" */ }
  const pepper = env("ERROR_REPORT_SALT") || env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") || "cybernet-funnel";
  return `cn_fun:ip:${createHmac("sha256", `funnel:${pepper}`).update(address).digest("hex").slice(0, 2)}`;
}

async function readCapped(request, max) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

let warned = false; // one log line per warm instance while the table is missing

export default async function handler(request, context) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  if (!fromThisSite(request)) return reply(403, { error: "Website requests only." });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return reply(413, { error: "Too large." });

  let text;
  try { text = await readCapped(request, MAX_BODY_BYTES); } catch { return reply(400, { error: "Unreadable body." }); }
  if (text === null) return reply(413, { error: "Too large." });
  let body;
  try { body = JSON.parse(text); } catch { return reply(400, { error: "Not JSON." }); }
  const step = validateFunnel(body);
  if (!step) return reply(400, { error: "Unknown step." });

  const perAddress = await consumeQuota(addressKey(request, context), 60, PER_ADDRESS_PER_MINUTE);
  if (perAddress && !perAddress.allowed) return reply(429, { error: "Too many requests." });
  const everyone = await consumeQuota("cn_fun:all", 3600, ALL_PER_HOUR);
  if (everyone && !everyone.allowed) return reply(429, { error: "Too many requests." });

  try {
    const r = await serviceFetch("/rest/v1/rpc/funnel_bump", {
      method: "POST",
      body: JSON.stringify({ p_event: step.event, p_source: step.source }),
      signal: AbortSignal.timeout(4000)
    });
    if (!r.ok && !warned) {
      warned = true;
      console.warn(`CyberNet funnel: step not counted (HTTP ${r.status}). Has supabase/migrations/20261118120000_funnel_counts.sql been applied?`);
    }
  } catch (e) {
    if (!warned) {
      warned = true;
      console.warn("CyberNet funnel: step not counted:", e?.status === 503 ? "Supabase is not configured" : "request failed");
    }
  }
  return reply(204);
}

// For the tests.
export function resetFunnelMemory() { warned = false; }

export const config = {
  path: "/api/funnel"
};
