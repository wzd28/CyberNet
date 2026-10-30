// /api/feedback-admin: the feedback inbox for the people in ADMIN_EMAILS
// (public/cybernet-admin-feedback.js, Account > Feedback inbox).
//
//   GET   ?status=new|read|replied|all&limit=1..100&before=<created_at>
//         newest first; `total` is the number of rows for that filter.
//   PATCH { id, status: "new"|"read"|"replied" }
//         sets handled_at to now (or clears it when set back to "new").
//
// The gate is here, on the server: the caller's Supabase access token is
// checked with Supabase itself (verifyUser calls /auth/v1/user), and the email
// Supabase returns must be in the ADMIN_EMAILS environment variable
// (isAdminUser, the same check account-status and the quota bypasses use)
// and confirmed. Nothing the browser sends (appState.isAdmin, a header, a
// field) is trusted. The table is read with the service role.

import { verifyUser, isAdminUser, serviceFetch } from "../lib/supabase.mjs";
import { STATUSES } from "../lib/feedback.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";

const COLUMNS = "id,created_at,user_id,email,category,message,page,ui_version,user_agent_summary,status,handled_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// A missing table (migration not applied yet) gets a clear answer.
async function databaseError(response) {
  const detail = await response.json().catch(() => ({}));
  if (response.status === 404 || detail?.code === "PGRST205" || detail?.code === "42P01") {
    return reply(503, { error: "The feedback table does not exist yet. Apply supabase/migrations/20261021120000_feedback.sql in the Supabase SQL editor." });
  }
  console.error(JSON.stringify({ tag: "cn_feedback", event: "admin_db_failed", status: response.status, code: detail?.code || null }));
  return reply(502, { error: "The feedback inbox could not be loaded." });
}

export default webOnly(async (request) => {
  if (request.method !== "GET" && request.method !== "PATCH") {
    return reply(405, { error: "Method not allowed." }, { Allow: "GET, PATCH" });
  }

  let user;
  try {
    ({ user } = await verifyUser(request));
  } catch (error) {
    return reply(error?.status === 503 ? 503 : 401, { error: error?.status === 503 ? "The server is not configured." : "Sign in is required." });
  }
  if (!isAdminUser(user) || !user.email_confirmed_at) {
    return reply(403, { error: "This inbox is only for CyberNet admins." });
  }

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "new";
      if (status !== "all" && !STATUSES.includes(status)) return reply(400, { error: "Unknown status filter." });
      const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const before = url.searchParams.get("before") || "";
      if (before && !Number.isFinite(Date.parse(before))) return reply(400, { error: "Unknown cursor." });

      const filters =
        (status !== "all" ? `&status=eq.${status}` : "") +
        (before ? `&created_at=lt.${encodeURIComponent(new Date(before).toISOString())}` : "");

      const response = await serviceFetch(
        `/rest/v1/feedback?select=${COLUMNS}&order=created_at.desc,id.desc&limit=${limit}${filters}`,
        { headers: { Prefer: "count=exact" } }
      );
      if (!response.ok) return databaseError(response);
      const items = await response.json().catch(() => []);
      const range = response.headers.get("content-range") || "";
      const total = Number(range.split("/")[1]);
      return reply(200, {
        items: Array.isArray(items) ? items : [],
        total: Number.isFinite(total) ? total : null,
        status
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return reply(400, { error: "Send JSON: { id, status }." });
    }
    const id = String(body?.id || "");
    const status = String(body?.status || "");
    if (!UUID.test(id)) return reply(400, { error: "Unknown feedback id." });
    if (!STATUSES.includes(status)) return reply(400, { error: "Status must be new, read or replied." });

    const response = await serviceFetch(`/rest/v1/feedback?id=eq.${id}&select=${COLUMNS}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, handled_at: status === "new" ? null : new Date().toISOString() })
    });
    if (!response.ok) return databaseError(response);
    const rows = await response.json().catch(() => []);
    if (!Array.isArray(rows) || !rows[0]) return reply(404, { error: "That feedback was not found." });
    return reply(200, { item: rows[0] });
  } catch (error) {
    console.error(JSON.stringify({ tag: "cn_feedback", event: "admin_failed", detail: String(error?.message || error).slice(0, 200) }));
    return reply(error?.status === 503 ? 503 : 500, { error: "The feedback inbox could not be loaded." });
  }
});

export const config = {
  path: "/api/feedback-admin"
};
