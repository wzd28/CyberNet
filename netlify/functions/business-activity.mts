import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function memberIdentity(userId: string): Promise<{ email: string; fullName: string }> {
  const userRes = await serviceFetch(`/auth/v1/admin/users/${userId}`);
  const userData = await userRes.json().catch(() => ({}));
  return {
    email: userData?.email || "",
    fullName: userData?.user_metadata?.full_name || "",
  };
}

// One entry opened up: what the member submitted and everything that came
// back. Loaded when the owner taps an entry rather than with the list, so the
// list stays quick however long the submissions are. Every lookup is pinned to
// the owner's own team and excludes the owner's own rows.
async function scanDetail(team: any, ownerId: string, rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Unknown entry." }, 400);

  const res = await serviceFetch(
    `/rest/v1/scan_history?id=eq.${id}&business_account_id=eq.${team.businessAccountId}` +
    `&user_id=neq.${encodeURIComponent(ownerId)}` +
    "&select=id,user_id,source,analysis_type,verdict,score,threat_type,summary,submitted_content,analysis,created_at",
  );
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json({ error: "That entry is no longer available." }, 404);

  return json({
    detail: {
      type: "scan",
      id: row.id,
      source: row.source || "analysis_ai",
      analysisType: row.analysis_type,
      verdict: row.verdict,
      score: row.score,
      threatType: row.threat_type,
      summary: row.summary,
      submittedContent: row.submitted_content || "",
      analysis: row.analysis || null,
      createdAt: row.created_at,
    },
  });
}

async function recoveryDetail(team: any, ownerId: string, id: string) {
  if (!UUID.test(id)) return json({ error: "Unknown entry." }, 400);

  const caseRes = await serviceFetch(
    `/rest/v1/recovery_cases?id=eq.${id}&business_account_id=eq.${team.businessAccountId}` +
    `&owner_user_id=neq.${encodeURIComponent(ownerId)}` +
    "&select=id,incident_type,region,risk_level,urgency,confidence,status,progress_percent,current_version,case_title,submitted_description,created_at,updated_at",
  );
  const cases = await caseRes.json().catch(() => []);
  const row = Array.isArray(cases) ? cases[0] : null;
  if (!row) return json({ error: "That entry is no longer available." }, 404);

  const [versionsRes, tasksRes] = await Promise.all([
    serviceFetch(
      `/rest/v1/recovery_versions?case_id=eq.${id}` +
      "&select=version_number,change_summary,risk_level,progress_percent,created_at,structured_plan&order=version_number.asc",
    ),
    serviceFetch(
      `/rest/v1/recovery_tasks?case_id=eq.${id}&select=title,status,priority,plan_version,completed_at&order=id.asc`,
    ),
  ]);
  const versions = ((await versionsRes.json().catch(() => [])) as any[]) || [];
  const tasks = ((await tasksRes.json().catch(() => [])) as any[]) || [];
  const latest = versions.length ? versions[versions.length - 1] : null;

  return json({
    detail: {
      type: "recovery",
      id: row.id,
      caseTitle: row.case_title,
      incidentType: row.incident_type,
      region: row.region,
      riskLevel: row.risk_level,
      urgency: row.urgency,
      confidence: row.confidence,
      status: row.status,
      progressPercent: row.progress_percent,
      submittedDescription: row.submitted_description || "",
      plan: latest?.structured_plan || null,
      planVersion: latest?.version_number || row.current_version || 1,
      versions: versions.map((v) => ({
        version: v.version_number,
        changeSummary: v.change_summary,
        riskLevel: v.risk_level,
        createdAt: v.created_at,
      })),
      tasks: tasks.map((t) => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        planVersion: t.plan_version,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}

export default async (request: Request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can view the team activity log." }, 403);
    }

    const url = new URL(request.url);

    const detailKind = url.searchParams.get("detail");
    if (detailKind === "scan") return await scanDetail(team, user.id, url.searchParams.get("id") || "");
    if (detailKind === "recovery") return await recoveryDetail(team, user.id, url.searchParams.get("id") || "");

    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 30));
    const memberFilter = url.searchParams.get("userId");

    // The log is the owner's view of the team, not of themselves: the owner's
    // own scans and cases stay private and never appear here, even when the
    // owner is the member being filtered for.
    if (memberFilter === user.id) return json({ feed: [] });

    const ownerId = encodeURIComponent(user.id);
    const scanFilter = memberFilter
      ? `&user_id=eq.${encodeURIComponent(memberFilter)}`
      : `&user_id=neq.${ownerId}`;
    const recoveryFilter = memberFilter
      ? `&owner_user_id=eq.${encodeURIComponent(memberFilter)}`
      : `&owner_user_id=neq.${ownerId}`;

    const [scanRes, recoveryRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/scan_history?business_account_id=eq.${team.businessAccountId}${scanFilter}` +
        "&select=id,user_id,source,analysis_type,verdict,score,threat_type,summary,created_at," +
        "shown:analysis->shown,followUp:analysis->isFollowUp,needsDeepScan:analysis->needsDeepScan" +
        `&order=created_at.desc&limit=${limit}`
      ),
      serviceFetch(
        `/rest/v1/recovery_cases?business_account_id=eq.${team.businessAccountId}${recoveryFilter}` +
        "&select=id,owner_user_id,incident_type,risk_level,urgency,case_title,status,progress_percent,created_at" +
        `&order=created_at.desc&limit=${limit}`
      ),
    ]);

    const scans = await scanRes.json().catch(() => []);
    const recoveries = await recoveryRes.json().catch(() => []);

    const combined = [
      ...(Array.isArray(scans) ? scans : []).map((s: any) => ({
        type: "scan" as const,
        id: s.id,
        userId: s.user_id,
        source: s.source || "analysis_ai",
        analysisType: s.analysis_type,
        verdict: s.verdict,
        score: s.score,
        threatType: s.threat_type,
        summary: s.summary,
        shown: s.shown || null,
        followUp: s.followUp === true,
        needsDeepScan: s.needsDeepScan === true,
        createdAt: s.created_at,
      })),
      ...(Array.isArray(recoveries) ? recoveries : []).map((r: any) => ({
        type: "recovery" as const,
        id: r.id,
        userId: r.owner_user_id,
        incidentType: r.incident_type,
        riskLevel: r.risk_level,
        urgency: r.urgency,
        caseTitle: r.case_title,
        status: r.status,
        progressPercent: r.progress_percent,
        createdAt: r.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    // Resolve each unique member's email/name once rather than per-row.
    const uniqueUserIds = [...new Set(combined.map((row) => row.userId))];
    const userLookup: Record<string, { email: string; fullName: string }> = {};
    await Promise.all(
      uniqueUserIds.map(async (id) => {
        userLookup[id] = await memberIdentity(id);
      })
    );

    const feed = combined.map((row) => ({ ...row, member: userLookup[row.userId] || { email: "", fullName: "" } }));

    return json({ feed });
  } catch (error: any) {
    return json({ error: error.message || "Could not load team activity." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-activity" };
