// Feedback form: validation, storage and the notification email.
//
// The database row (public.feedback, supabase/migrations/*_feedback.sql) is
// the source of truth. The email to support@ is only a heads-up: if Resend
// fails, the feedback is still saved and shows in the admin inbox
// (Account > Feedback inbox, served by netlify/functions/feedback-admin.mjs).

import { serviceFetch } from "./supabase.mjs";
import { defang } from "./report-error.mjs";

export const CATEGORIES = Object.freeze({
  bug: "Something is broken or wrong",
  feature: "Feature request",
  billing: "Billing or plan question",
  other: "Question or other feedback"
});
export const STATUSES = Object.freeze(["new", "read", "replied"]);

export const MAX_MESSAGE_CHARS = 5000;
export const MAX_BODY_BYTES = 16 * 1024;

export const limits = {
  mailTimeoutMs: 4000,
  maxMailsPerDay: 20 // Resend's free plan sends 100 emails a day for everything
};

const MAIL_FROM = "CyberNet AI <notifications@cybernetai.app>";
const MAIL_TO = "support@cybernetai.app";
const EMAIL = /^[^\s@<>()[\]\\,;:"\u0000-\u001f\u007f]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const UI_VERSION = /^[\w.-]{1,32}$/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

// Postgres text refuses U+0000 and lone surrogates (22P05). A refused insert
// must not be something a visitor can cause, so both are cleaned out first.
function cleanText(value) {
  return value.replace(/\u0000/g, "").replace(LONE_SURROGATE, "�");
}

export function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "");
  } catch {
    try { return String(process.env[name] || ""); } catch { return ""; }
  }
}

// "Chrome 141 on Windows" from the request's own User-Agent header (the same
// families as public/cybernet-errors.js). The full string is never kept.
export function uaSummary(ua) {
  ua = String(ua || "").slice(0, 512);
  if (!ua) return null;
  let m;
  // The iPhone app's web view (capacitor.config appendUserAgent).
  if ((m = /\bCyberNetAI-iOS\/(\d{1,4}(?:\.\d{1,4}){0,3})/.exec(ua))) return `CyberNet AI app ${m[1]} on iOS`.slice(0, 60);
  let b = "Other";
  if ((m = /Edg(?:e|A|iOS)?\/(\d+)/.exec(ua))) b = `Edge ${m[1]}`;
  else if ((m = /OPR\/(\d+)/.exec(ua))) b = `Opera ${m[1]}`;
  else if ((m = /SamsungBrowser\/(\d+)/.exec(ua))) b = `Samsung Internet ${m[1]}`;
  else if ((m = /(?:CriOS|Chrome)\/(\d+)/.exec(ua))) b = `Chrome ${m[1]}`;
  else if ((m = /(?:FxiOS|Firefox)\/(\d+)/.exec(ua))) b = `Firefox ${m[1]}`;
  else if ((m = /Version\/(\d+).*Safari/.exec(ua))) b = `Safari ${m[1]}`;
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android"
    : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  return `${b} on ${os}`.slice(0, 60);
}

// "Report a problem with this result" in the iPhone app (BUILD-PLAN §7.9)
// sends { kind, resultId, comment?, platform: "ios", appVersion }. The
// feedback table has no columns for these, so they become the first line of
// the stored message, and the app version goes in ui_version ("ios-1.0.0").
// The user's scanned content is never attached; only what they type.
export const RESULT_KINDS = Object.freeze({
  quick_scan: "Quick Scan",
  qr: "QR scan",
  share: "Share sheet check",
  analysis_ai: "Analysis AI",
  recovery: "Recovery plan"
});
const RESULT_ID = /^[\w.:-]{1,64}$/;
const APP_VERSION = /^\d{1,4}(?:\.\d{1,4}){0,3}$/;

function resultReport(body) {
  const kind = typeof body.kind === "string" && Object.hasOwn(RESULT_KINDS, body.kind) ? body.kind : "";
  if (!kind) return null;
  const resultId = typeof body.resultId === "string" && RESULT_ID.test(body.resultId) ? body.resultId : "";
  return { kind, resultId };
}

// Shapes a submitted body into a row. Returns { error } or { row, honeypot }.
export function validateFeedback(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "The feedback could not be read." };
  if (typeof body.bot_field === "string" && body.bot_field.trim()) return { honeypot: true, error: "The feedback could not be sent." };

  const report = resultReport(body);
  const typed = typeof body.message === "string" ? body.message : typeof body.comment === "string" ? body.comment : "";
  let message = cleanText(typed).replace(/\r\n?/g, "\n").trim();
  if (report) {
    // A result report may come without a comment; the header line says what it is about.
    const header = `[Result report] ${RESULT_KINDS[report.kind]}${report.resultId ? `, result ${report.resultId}` : ""}`;
    if (message.length > MAX_MESSAGE_CHARS - header.length - 2) return { error: `Keep the message under ${MAX_MESSAGE_CHARS - header.length - 2} characters.` };
    message = message ? `${header}\n\n${message}` : `${header}\n\n(no comment)`;
  }
  if (!message) return { error: "Write a message before sending." };
  if (message.length > MAX_MESSAGE_CHARS) return { error: `Keep the message under ${MAX_MESSAGE_CHARS} characters.` };

  const category = Object.hasOwn(CATEGORIES, body.category) ? body.category : report ? "bug" : "other";

  let email = typeof body.email === "string" ? body.email.trim() : "";
  if (email && (email.length > 254 || !EMAIL.test(email) || cleanText(email) !== email)) return { error: "Enter a valid contact email, or leave it empty." };

  // The path only: a query or hash can carry tokens.
  let page = typeof body.page === "string" ? body.page.slice(0, 400).split(/[?#]/)[0] : "";
  if (!/^\/(?!\/)[\w./%~-]{0,199}$/.test(page)) page = "";

  let uiVersion = typeof body.uiVersion === "string" && UI_VERSION.test(body.uiVersion) ? body.uiVersion : "";
  if (body.platform === "ios" && typeof body.appVersion === "string" && APP_VERSION.test(body.appVersion)) uiVersion = `ios-${body.appVersion}`;

  return {
    row: {
      email: email || null,
      category,
      message,
      page: page || null,
      ui_version: uiVersion || null
    }
  };
}

// Inserts one row with the service role. Returns the stored row or null.
export async function storeFeedback(row) {
  try {
    const response = await serviceFetch("/rest/v1/feedback?select=id,created_at", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
    if (!response.ok) {
      // The error code only: PostgREST's "details" can hold the whole row
      // ("Failing row contains (...)"), which is the visitor's email and message.
      let code = null;
      try { code = String(JSON.parse(await response.text())?.code || "").slice(0, 16) || null; } catch { /* no code */ }
      console.error(JSON.stringify({ tag: "cn_feedback", event: "store_failed", status: response.status, code }));
      return null;
    }
    const rows = await response.json().catch(() => []);
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  } catch (error) {
    console.error(JSON.stringify({ tag: "cn_feedback", event: "store_failed", detail: String(error?.message || error).slice(0, 300) }));
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// The subject carries no visitor text; links in the message are defanged so a
// made-up submission cannot become a phishing email from the site's address.
export function buildFeedbackEmail(row, stored) {
  const ref = stored?.id ? String(stored.id).slice(0, 8) : "not saved";
  const subject = `New feedback: ${CATEGORIES[row.category] || "Other"} (${ref})`;
  const rows = [
    ["Category", CATEGORIES[row.category] || row.category],
    ["From", row.email ? defang(row.email) : "(no email given)"],
    ["Signed in", row.user_id ? "yes" : "no"],
    ["Page", row.page ? defang(row.page) : "(unknown)"],
    ["Browser", row.user_agent_summary || "(unknown)"],
    ["UI version", row.ui_version || "(unknown)"],
    ["Saved", stored?.id ? `yes, id ${stored.id}` : "NO: the database did not accept it; this email is the only copy"]
  ];
  const message = defang(row.message);
  const footer = "Sent by a visitor through the feedback form; not verified. Links are defanged. Reply to this email to answer them (when they gave an email). Every message is in Account > Feedback inbox on cybernetai.app.";
  const text = [...rows.map(([k, v]) => `${k}: ${v}`), "", "Message:", message, "", footer].join("\n");
  const cell = "padding:5px 0;vertical-align:top;font-size:13px;line-height:1.5;";
  const html = `
<div style="background:#020812;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#08152a;border:1px solid rgba(34,211,238,0.16);border-radius:14px;">
    <tr><td style="padding:24px 20px;">
      <p style="margin:0 0 14px 0;color:#22d3ee;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">New feedback</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows.map(([k, v]) => `<tr><td style="${cell}color:#8ea5b8;width:96px;padding-right:10px;">${escapeHtml(k)}</td><td style="${cell}color:#eaf6ff;overflow-wrap:anywhere;">${escapeHtml(v)}</td></tr>`).join("\n        ")}
      </table>
      <pre style="margin:16px 0 0 0;padding:12px;background:#020812;border:1px solid rgba(34,211,238,0.12);border-radius:8px;color:#eaf6ff;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;font-family:inherit;">${escapeHtml(message)}</pre>
      <p style="margin:16px 0 0 0;color:#5b6b7a;font-size:12px;line-height:1.6;">${escapeHtml(footer)}</p>
    </td></tr>
  </table>
</div>`;
  return { subject, text, html };
}

// Never throws. Returns true when Resend accepted the email.
export async function notifyFeedback(row, stored) {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) return false;
  try {
    const email = buildFeedbackEmail(row, stored);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(stored?.id ? { "Idempotency-Key": `cn-feedback-${stored.id}` } : {})
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [env("FEEDBACK_ALERT_EMAIL") || MAIL_TO],
        ...(row.email ? { reply_to: row.email } : {}),
        subject: email.subject,
        text: email.text,
        html: email.html
      }),
      signal: AbortSignal.timeout(limits.mailTimeoutMs)
    });
    if (!response.ok) console.error(JSON.stringify({ tag: "cn_feedback", event: "mail_failed", status: response.status, id: stored?.id || null }));
    return response.ok;
  } catch (error) {
    console.error(JSON.stringify({ tag: "cn_feedback", event: "mail_failed", detail: String(error?.message || error).slice(0, 200), id: stored?.id || null }));
    return false;
  }
}
