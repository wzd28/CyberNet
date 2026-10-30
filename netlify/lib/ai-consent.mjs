// AI consent for the iPhone app (App Review 5.1.2(i); BUILD-PLAN §7.4, §8.4).
//
// Before the app sends a message, link, screenshot or Recovery description to
// the server for an AI explanation, the person must have allowed it on the
// consent sheet, which names OpenAI. The answer is stored on the server in
// public.ai_consents (supabase/migrations/20261029120000_ios_app_1_0.sql);
// the app only caches it for display.
//
// AI_CONSENT_VERSION identifies the wording on the sheet. Changing the wording
// means a new version here AND in the app, and everyone is asked again
// (has_ai_consent only accepts an open consent for exactly this version).
//
// Fail closed: if the consent cannot be checked (database down, migration not
// applied yet), the content is not forwarded.

import { serviceFetch as defaultServiceFetch } from "./supabase.mjs";

export const AI_CONSENT_VERSION = "2026-11-ios-1";
export const AI_CONSENT_PROVIDER = "openai";

export const AI_CONSENT_MESSAGES = Object.freeze({
  required: "Allow AI analysis first. Your content is sent to OpenAI only after you allow it.",
  unavailable: "We couldn't check your AI analysis setting just now, so nothing was sent. Please try again in a minute."
});

export function platformOf(isIos) {
  return isIos ? "ios" : "web";
}

// `serviceFetch` is the calling function's own (path, init) helper, so each
// function keeps its timeouts and PGRST303 retry policy.
async function rpc(serviceFetch = defaultServiceFetch, name, args) {
  const response = await serviceFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(args)
  });
  const text = await response.text().catch(() => "");
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(`AI consent ${name} failed (HTTP ${response.status})`);
    error.status = 503;
    error.code = "AI_CONSENT_CHECK_FAILED";
    throw error;
  }
  return payload;
}

export async function hasAiConsent(serviceFetch, userId, platform = "ios", version = AI_CONSENT_VERSION) {
  const payload = await rpc(serviceFetch, "has_ai_consent", { p_user_id: userId, p_version: version, p_platform: platform });
  const value = Array.isArray(payload) ? payload[0] : payload;
  if (value && typeof value === "object") return Object.values(value)[0] === true;
  return value === true;
}

export async function grantAiConsent(serviceFetch, userId, platform = "ios", userAgent = "") {
  const payload = await rpc(serviceFetch, "grant_ai_consent", {
    p_user_id: userId,
    p_version: AI_CONSENT_VERSION,
    p_platform: platform,
    p_user_agent: String(userAgent || "").slice(0, 500) || null
  });
  const row = Array.isArray(payload) ? payload[0] : payload;
  return { version: row?.consent_version || AI_CONSENT_VERSION, grantedAt: row?.granted_at || null };
}

export async function withdrawAiConsent(serviceFetch, userId, platform = "ios") {
  const payload = await rpc(serviceFetch, "withdraw_ai_consent", { p_user_id: userId, p_platform: platform });
  return Number(Array.isArray(payload) ? payload[0] : payload) || 0;
}

// The body every AI function returns with HTTP 428 when consent is missing.
export function consentRequiredBody() {
  return {
    error: AI_CONSENT_MESSAGES.required,
    code: "AI_CONSENT_REQUIRED",
    version: AI_CONSENT_VERSION,
    provider: AI_CONSENT_PROVIDER
  };
}

export function consentUnavailableBody() {
  return { error: AI_CONSENT_MESSAGES.unavailable, code: "AI_CONSENT_CHECK_FAILED" };
}

// One call for the AI functions: null when the request may go ahead,
// otherwise { status, body } to return before any quota is used or any
// content leaves the server.
export async function aiConsentGate(serviceFetch, userId) {
  try {
    if (await hasAiConsent(serviceFetch, userId, "ios")) return null;
    return { status: 428, body: consentRequiredBody() };
  } catch (error) {
    console.error("CyberNet AI consent check failed", error?.message || error);
    return { status: 503, body: consentUnavailableBody() };
  }
}
