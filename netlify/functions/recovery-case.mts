declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

function env(name: string): string {
  return (Netlify.env.get(name) || "").trim();
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function serviceConfig() {
  return {
    url: env("SUPABASE_URL").replace(/\/$/, ""),
    publicKey: env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"),
    serviceKey: env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY"),
  };
}

async function verifySupabaseUser(request: Request): Promise<{ id: string } | null> {
  const authorization = request.headers.get("authorization") || "";
  const { url, publicKey } = serviceConfig();
  if (!authorization.startsWith("Bearer ") || !url || !publicKey) return null;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: publicKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { id?: string };
    return data.id ? { id: data.id } : null;
  } catch {
    return null;
  }
}

async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) throw new Error("Supabase server configuration is incomplete.");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  return fetch(`${url}${path}`, { ...init, headers, signal: init.signal || AbortSignal.timeout(7_000) });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const user = await verifySupabaseUser(request);
  if (!user) return json({ error: "Sign in to view Recovery cases.", code: "sign_in_required" }, 401);

  const url = new URL(request.url);
  const caseId = url.searchParams.get("caseId");
  // The page's AI-plan poll passes the version it already shows. While the
  // case still points at that version, only the case row is read and returned.
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam !== null && /^\d{1,6}$/.test(sinceParam) ? Number(sinceParam) : null;

  try {
    if (caseId) {
      const loadCaseRow = async () => {
        const caseResponse = await serviceFetch(`/rest/v1/recovery_cases?id=eq.${encodeURIComponent(caseId)}&select=*`);
        const caseRows = await caseResponse.json().catch(() => []);
        return caseResponse.ok && Array.isArray(caseRows) ? caseRows[0] || null : null;
      };
      const loadLatestVersion = async () => {
        const versionResponse = await serviceFetch(`/rest/v1/recovery_versions?case_id=eq.${encodeURIComponent(caseId)}&select=*&order=version_number.desc&limit=1`);
        const versionRows = await versionResponse.json().catch(() => []);
        return Array.isArray(versionRows) ? versionRows[0] || null : null;
      };
      const loadTasks = async () => {
        const tasksResponse = await serviceFetch(`/rest/v1/recovery_tasks?case_id=eq.${encodeURIComponent(caseId)}&select=*&order=created_at.asc`);
        const tasks = await tasksResponse.json().catch(() => []);
        return Array.isArray(tasks) ? tasks : [];
      };

      // A poll reads the case first: the writers store the new version before
      // they move the case's current_version, so once the case has moved, the
      // version read after it is guaranteed to find the new plan. A plain load
      // reads all three at once; nothing is returned before the owner check.
      let caseRow: any;
      let latestVersion: any = null;
      let tasks: any[] = [];
      if (since !== null) {
        caseRow = await loadCaseRow();
      } else {
        [caseRow, latestVersion, tasks] = await Promise.all([loadCaseRow(), loadLatestVersion(), loadTasks()]);
      }
      if (!caseRow) return json({ error: "Recovery case not found." }, 404);
      if (caseRow.owner_user_id !== user.id) return json({ error: "You do not have access to this Recovery case." }, 403);

      if (since !== null) {
        if ((Number(caseRow.current_version) || 0) <= since) {
          return json({ case: caseRow, plan: null, tasks: [], unchanged: true });
        }
        [latestVersion, tasks] = await Promise.all([loadLatestVersion(), loadTasks()]);
      }

      return json({
        case: caseRow,
        plan: latestVersion?.structured_plan || null,
        planVersion: Number(latestVersion?.version_number) || null,
        tasks,
      });
    }

    const listResponse = await serviceFetch(`/rest/v1/recovery_cases?owner_user_id=eq.${encodeURIComponent(user.id)}&select=id,incident_type,region,risk_level,urgency,status,progress_percent,case_title,created_at,updated_at,resolved_at&order=updated_at.desc&limit=25`);
    const rows = await listResponse.json().catch(() => []);
    return json({ cases: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    console.error("CyberNet Recovery case fetch failed", error);
    return json({ error: "Could not load Recovery cases right now." }, 503);
  }
}

export const config = {
  path: "/api/recovery-case",
  method: ["GET"],
};
