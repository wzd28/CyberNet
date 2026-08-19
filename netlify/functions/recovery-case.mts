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

  try {
    if (caseId) {
      const caseResponse = await serviceFetch(`/rest/v1/recovery_cases?id=eq.${encodeURIComponent(caseId)}&select=*`);
      const caseRows = await caseResponse.json().catch(() => []);
      const caseRow = Array.isArray(caseRows) ? caseRows[0] : null;
      if (!caseResponse.ok || !caseRow) return json({ error: "Recovery case not found." }, 404);
      if (caseRow.owner_user_id !== user.id) return json({ error: "You do not have access to this Recovery case." }, 403);

      const versionResponse = await serviceFetch(`/rest/v1/recovery_versions?case_id=eq.${encodeURIComponent(caseId)}&select=*&order=version_number.desc&limit=1`);
      const versionRows = await versionResponse.json().catch(() => []);
      const latestVersion = Array.isArray(versionRows) ? versionRows[0] : null;

      const tasksResponse = await serviceFetch(`/rest/v1/recovery_tasks?case_id=eq.${encodeURIComponent(caseId)}&select=*&order=created_at.asc`);
      const tasks = await tasksResponse.json().catch(() => []);

      return json({
        case: caseRow,
        plan: latestVersion?.structured_plan || null,
        tasks: Array.isArray(tasks) ? tasks : [],
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
