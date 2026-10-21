// POST /api/feedback: the site's feedback form (public/script.js).
//
// Validates the JSON body (netlify/lib/feedback.mjs), rejects the honeypot,
// rate-limits, then inserts one row into public.feedback with the service
// role. The notification email to support@ is sent after the row is saved and
// can fail without losing anything. If the database cannot take the row, the
// email becomes the copy (202); if both fail the answer is 503 and the browser
// falls back to the Netlify Forms submission it used before.
//
// Limits: 3 a minute per address in each warm instance, then through the
// existing consume_api_quota RPC: 6 an hour per address (one of 4096 hashed
// keys, cn_fb:ip:000 to fff), 6 an hour per signed-in account, 100 an hour
// for everyone, and at most 20 notification emails a day (Resend's free plan
// sends 100 a day for the whole site). The quota checks fail open, like the
// other ones. A signed-in sender is recognised from the verified Supabase
// token; an invalid token is ignored and the feedback is kept as anonymous.

import { createHmac } from "node:crypto";
import { verifyUser, bearerToken } from "../lib/supabase.mjs";
import { consumeQuota } from "../lib/report-error.mjs";
import {
  env, validateFeedback, uaSummary, storeFeedback, notifyFeedback,
  limits as feedbackLimits, MAX_BODY_BYTES
} from "../lib/feedback.mjs";

const PER_ADDRESS_PER_MINUTE = 3;
const PER_ADDRESS_PER_HOUR = 6;
const PER_USER_PER_HOUR = 6;
const ALL_PER_HOUR = 100;

function reply(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function addressBucket(request, context) {
  let address = "unknown";
  try {
    address = String(
      context?.ip ||
      request.headers.get("x-nf-client-connection-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    ).slice(0, 64);
  } catch { /* keep "unknown" */ }
  const pepper = env("ERROR_REPORT_SALT") || env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") || "cybernet-feedback";
  return createHmac("sha256", pepper).update(`feedback:${address}`).digest("hex").slice(0, 24);
}

const recent = new Map(); // bucket -> { windowStart, count }
function withinMemoryLimit(bucket, now = Date.now()) {
  const current = recent.get(bucket);
  if (!current || now - current.windowStart >= 60_000) {
    recent.set(bucket, { windowStart: now, count: 1 });
    if (recent.size > 2000) recent.delete(recent.keys().next().value);
    return true;
  }
  current.count += 1;
  return current.count <= PER_ADDRESS_PER_MINUTE;
}

// For the tests.
export function resetFeedbackMemory() {
  recent.clear();
}

const blocked = (quota) => Boolean(quota && !quota.allowed);
const tooMany = () => reply(429, { error: "Too many messages from this connection. Try again later, or email support@cybernetai.app." });

export default async (request, context) => {
  if (request.method !== "POST") {
    return reply(405, { error: "Send feedback with POST." }, { Allow: "POST" });
  }

  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return reply(413, { error: "The message is too long." });
  }
  let text;
  try {
    text = await request.text();
  } catch {
    return reply(400, { error: "The feedback could not be read." });
  }
  if (text.length > MAX_BODY_BYTES) return reply(413, { error: "The message is too long." });

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: "The feedback could not be read." });
  }

  const result = validateFeedback(body);
  if (result.error) return reply(400, { error: result.error });
  const row = result.row;

  const bucket = addressBucket(request, context);
  if (!withinMemoryLimit(bucket)) return tooMany();

  // Who sent it: only a token Supabase itself accepts counts.
  let user = null;
  if (bearerToken(request)) {
    try {
      ({ user } = await verifyUser(request));
    } catch {
      user = null;
    }
  }

  if (blocked(await consumeQuota(`cn_fb:ip:${bucket.slice(0, 3)}`, 3600, PER_ADDRESS_PER_HOUR))) return tooMany();
  if (user && blocked(await consumeQuota(`cn_fb:user:${user.id}`, 3600, PER_USER_PER_HOUR))) return tooMany();
  if (blocked(await consumeQuota("cn_fb:all", 3600, ALL_PER_HOUR))) {
    return reply(429, { error: "We are receiving a lot of messages right now. Try again later, or email support@cybernetai.app." });
  }

  row.user_id = user?.id || null;
  if (!row.email && user?.email) row.email = String(user.email).slice(0, 254);
  row.user_agent_summary = uaSummary(request.headers.get("user-agent"));

  const stored = await storeFeedback(row);

  if (!stored) {
    // The database did not take it: the email is now the only copy, so wait for it.
    const emailed = await notifyFeedback(row, null);
    if (emailed) return reply(202, { ok: true, stored: false });
    return reply(503, { error: "Your message could not be saved right now." });
  }

  // Saved. The heads-up email is optional and capped per day.
  const mail = (async () => {
    const quota = await consumeQuota("cn_fb:mail:day", 86_400, feedbackLimits.maxMailsPerDay);
    if (blocked(quota)) return false;
    return notifyFeedback(row, stored);
  })().catch(() => false);
  if (typeof context?.waitUntil === "function") context.waitUntil(mail);
  else await mail;

  return reply(201, { ok: true, id: stored.id });
};

export const config = {
  path: "/api/feedback"
};
