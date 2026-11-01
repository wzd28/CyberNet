// Daily clean-up of public.api_rate_limits, the counters behind
// consume_api_quota (analysis limits, link previews, error reports...).
//
// The database has no clean-up of its own (no pg_cron, and consume_api_quota
// only ever adds or updates rows), so without this the table only grows. The
// Privacy Policy says rate-limit logs are normally kept for up to 90 days, so
// every row that has not been touched for 90 days is deleted. No counter
// window is longer than 30 days (consume_api_quota refuses longer ones), so a
// deleted row could never have blocked anyone again.
//
// The same run also deletes rows of public.apple_notifications (App Store Server
// Notifications already processed, kept only for idempotency and audit) that are
// older than 90 days. That table arrived with the Apple In-App Purchase
// migration; before it is applied the second DELETE answers 404 and is skipped.
//
// "@daily" runs at 00:00 UTC. Like every Netlify scheduled function it runs
// only on the published production deploy and stops after 30 seconds. One
// DELETE through the service-role REST API, using the updated_at index. Set
// RATE_LIMIT_CLEANUP=off in the Netlify environment to stop it.
import { serviceFetch } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";

export const KEEP_DAYS = 90;

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}

// "0-41/42" or "*/42" -> 42
function deletedCount(response) {
  const match = /\/(\d+)\s*$/.exec(String(response.headers.get("content-range") || ""));
  return match ? Number(match[1]) : null;
}

// Notifications older than the cutoff. Never changes the main result: a failure
// is logged and reported, and a missing table is simply skipped.
async function cleanupAppleNotifications(cutoff, timeoutMs) {
  try {
    const response = await serviceFetch(`/rest/v1/apple_notifications?received_at=lt.${encodeURIComponent(cutoff)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal, count=exact" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (response.status === 404) return { status: "skipped" };
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      console.error("CyberNet apple_notifications cleanup failed", response.status, detail);
      reportError(`Apple notifications cleanup failed (HTTP ${response.status})`, { fn: "rate-limit-cleanup", label: "Old Apple notification rows were not deleted" });
      return { status: "failed", httpStatus: response.status };
    }
    return { status: "done", deleted: deletedCount(response) };
  } catch (error) {
    console.error("CyberNet apple_notifications cleanup failed", error?.message || error);
    reportError(error, { fn: "rate-limit-cleanup", label: "Old Apple notification rows were not deleted" });
    return { status: "failed" };
  }
}

export async function cleanupRateLimits({ now = Date.now(), timeoutMs = 20_000 } = {}) {
  if (env("RATE_LIMIT_CLEANUP").toLowerCase() === "off") return { status: "disabled" };
  const cutoff = new Date(now - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const response = await serviceFetch(`/rest/v1/api_rate_limits?updated_at=lt.${encodeURIComponent(cutoff)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal, count=exact" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      console.error("CyberNet rate-limit cleanup failed", response.status, detail);
      reportError(`Rate-limit cleanup failed (HTTP ${response.status})`, { fn: "rate-limit-cleanup", label: "Old rate-limit rows were not deleted" });
      return { status: "failed", httpStatus: response.status, cutoff };
    }
    const deleted = deletedCount(response);
    const appleNotifications = await cleanupAppleNotifications(cutoff, timeoutMs);
    console.log("CyberNet rate-limit cleanup", JSON.stringify({ cutoff, deleted, appleNotifications: appleNotifications.deleted ?? appleNotifications.status }));
    return { status: "done", deleted, cutoff, appleNotifications };
  } catch (error) {
    console.error("CyberNet rate-limit cleanup failed", error?.message || error);
    reportError(error, { fn: "rate-limit-cleanup", label: "Old rate-limit rows were not deleted" });
    return { status: "failed", cutoff };
  }
}

export default async () => {
  const result = await cleanupRateLimits();
  return new Response(JSON.stringify(result), {
    status: result.status === "failed" ? 500 : 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
};

export const config = {
  schedule: "@daily"
};
