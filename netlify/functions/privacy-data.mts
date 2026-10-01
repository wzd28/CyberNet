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
    console.error("CyberNet privacy-data db error", response.status, detail.slice(0, 500));
    throw Object.assign(new Error("Database request failed."), { status: response.status >= 500 ? 502 : 500 });
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
    console.error("CyberNet privacy-data auth delete error", response.status, detail.slice(0, 500));
    throw Object.assign(new Error("Account deletion failed. Please contact support."), { status: response.status >= 500 ? 502 : 500 });
  }
}

export default async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const { user } = await verifyUser(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "export") {
      const uid = encodeURIComponent(user.id);
      const [profile, usage, history, acceptances, recoveryCases, recoveryUsage, quickscanUsage, teamMemberships] = await Promise.all([
        getProfile(user.id),
        getRows("daily_usage", user.id),
        getRows("scan_history", user.id),
        getRows("legal_acceptances", user.id),
        rest(`recovery_cases?owner_user_id=eq.${uid}&select=*`, { method: "GET" }),
        getRows("recovery_usage", user.id),
        getRows("quickscan_usage", user.id),
        rest(`business_members?user_id=eq.${uid}&select=business_account_id,role,status,joined_at,removed_at`, { method: "GET" })
      ]);
      const caseIds = (Array.isArray(recoveryCases) ? recoveryCases : []).map((c) => c.id).filter(Boolean);
      const inList = caseIds.map(encodeURIComponent).join(",");
      const [recoveryVersions, recoveryTasks] = caseIds.length
        ? await Promise.all([
            rest(`recovery_versions?case_id=in.(${inList})&select=*`, { method: "GET" }),
            rest(`recovery_tasks?case_id=in.(${inList})&select=*`, { method: "GET" })
          ])
        : [[], []];
      return json({
        data: {
          account: { id: user.id, email: user.email || null, createdAt: user.created_at || null, metadata: user.user_metadata || {} },
          profile,
          dailyUsage: usage || [],
          savedHistory: history || [],
          legalAcceptances: acceptances || [],
          recoveryCases: recoveryCases || [],
          recoveryVersions: recoveryVersions || [],
          recoveryTasks: recoveryTasks || [],
          recoveryUsage: recoveryUsage || [],
          quickscanUsage: quickscanUsage || [],
          teamMemberships: teamMemberships || []
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

      // A team owner's account anchors the team (its members, usage and logs
      // reference it), so it cannot be removed from here.
      const owned = await rest(`business_accounts?owner_user_id=eq.${encodeURIComponent(user.id)}&select=id,subscription_status`, { method: "GET" });
      if (Array.isArray(owned) && owned.length) {
        return json({ error: "This account owns a CyberNet Business team. Cancel the Business subscription in Manage Billing and contact support to close the team before deleting this account." }, 409);
      }

      // Team rows reference auth.users without ON DELETE CASCADE and would
      // block the auth delete. Everything else (profile, usage, history,
      // recovery cases) cascades from the auth user, so it is the only data
      // delete and a failure leaves no half-deleted account.
      await rest(`business_members?user_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await rest(`business_invites?invited_by_user_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      if (user.email) {
        await rest(`business_invites?email=eq.${encodeURIComponent(String(user.email).toLowerCase())}&status=eq.pending`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => null);
      }
      await deleteAuthUser(user.id);
      return json({ deleted: true });
    }

    return json({ error: "Unsupported privacy action." }, 400);
  } catch (error) {
    return json({ error: error?.message || "Privacy request failed." }, Number(error?.status) || 500);
  }
};

export const config = { path: "/api/privacy-data" };
