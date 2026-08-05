import { json, verifyUser } from "../lib/supabase.mjs";

function env(name) {
  return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
}

function serverConfig() {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw Object.assign(new Error("Server privacy controls are not configured."), { status: 503 });
  return { url, key };
}

async function rest(path, options = {}) {
  const { url, key } = serverConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(detail || "Database request failed."), { status: response.status });
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function getRows(table, userId, columns = "*") {
  return rest(`${table}?user_id=eq.${encodeURIComponent(userId)}&select=${encodeURIComponent(columns)}`, { method: "GET" });
}

async function getProfile(userId) {
  const rows = await rest(`profiles?id=eq.${encodeURIComponent(userId)}&select=*`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function removeRows(table, column, userId) {
  return rest(`${table}?${column}=eq.${encodeURIComponent(userId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

async function deleteAuthUser(userId) {
  const { url, key } = serverConfig();
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(detail || "Authentication account deletion failed."), { status: response.status });
  }
}

export default async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const { user } = await verifyUser(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "export") {
      const [profile, usage, history, acceptances] = await Promise.all([
        getProfile(user.id),
        getRows("daily_usage", user.id),
        getRows("scan_history", user.id),
        getRows("legal_acceptances", user.id)
      ]);
      return json({
        data: {
          account: { id: user.id, email: user.email || null, createdAt: user.created_at || null, metadata: user.user_metadata || {} },
          profile,
          dailyUsage: usage || [],
          savedHistory: history || [],
          legalAcceptances: acceptances || []
        }
      });
    }

    if (action === "clear-history") {
      await removeRows("scan_history", "user_id", user.id);
      return json({ cleared: true });
    }

    if (action === "delete-account") {
      if (String(body.confirmation || "") !== "DELETE") return json({ error: "Deletion confirmation is required." }, 400);
      const profile = await getProfile(user.id);
      const status = String(profile?.subscription_status || profile?.subscriptionStatus || "").toLowerCase();
      if (["active", "trialing", "past_due", "unpaid"].includes(status)) {
        return json({ error: "Cancel the active subscription through Account → Manage Billing before deleting this account." }, 409);
      }

      await removeRows("scan_history", "user_id", user.id).catch(() => null);
      await removeRows("daily_usage", "user_id", user.id).catch(() => null);
      await removeRows("profiles", "id", user.id).catch(() => null);
      await deleteAuthUser(user.id);
      return json({ deleted: true });
    }

    return json({ error: "Unsupported privacy action." }, 400);
  } catch (error) {
    return json({ error: error?.message || "Privacy request failed." }, Number(error?.status) || 500);
  }
};

export const config = { path: "/api/privacy-data" };
