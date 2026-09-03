import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";

export default async (request: Request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);

    if (!team || team.role !== "owner") {
      return json({ error: "Only the team owner can view the team activity log." }, 403);
    }

    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 30));
    const memberFilter = url.searchParams.get("userId");

    const scanFilter = memberFilter ? `&user_id=eq.${encodeURIComponent(memberFilter)}` : "";
    const recoveryFilter = memberFilter ? `&owner_user_id=eq.${encodeURIComponent(memberFilter)}` : "";

    const [scanRes, recoveryRes] = await Promise.all([
      serviceFetch(
        `/rest/v1/scan_history?business_account_id=eq.${team.businessAccountId}${scanFilter}` +
        "&select=id,user_id,analysis_type,verdict,score,threat_type,summary,created_at" +
        `&order=created_at.desc&limit=${limit}`
      ),
      serviceFetch(
        `/rest/v1/recovery_cases?business_account_id=eq.${team.businessAccountId}${recoveryFilter}` +
        "&select=id,owner_user_id,incident_type,risk_level,urgency,case_title,status,created_at" +
        `&order=created_at.desc&limit=${limit}`
      ),
    ]);

    const scans = await scanRes.json().catch(() => []);
    const recoveries = await recoveryRes.json().catch(() => []);

    const combined = [
      ...(scans as any[]).map((s) => ({
        type: "scan" as const,
        id: s.id,
        userId: s.user_id,
        analysisType: s.analysis_type,
        verdict: s.verdict,
        score: s.score,
        threatType: s.threat_type,
        summary: s.summary,
        createdAt: s.created_at,
      })),
      ...(recoveries as any[]).map((r) => ({
        type: "recovery" as const,
        id: r.id,
        userId: r.owner_user_id,
        incidentType: r.incident_type,
        riskLevel: r.risk_level,
        urgency: r.urgency,
        caseTitle: r.case_title,
        status: r.status,
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
        const userRes = await serviceFetch(`/auth/v1/admin/users/${id}`);
        const userData = await userRes.json().catch(() => ({}));
        userLookup[id] = {
          email: userData?.email || "",
          fullName: userData?.user_metadata?.full_name || "",
        };
      })
    );

    const feed = combined.map((row) => ({ ...row, member: userLookup[row.userId] || { email: "", fullName: "" } }));

    return json({ feed });
  } catch (error: any) {
    return json({ error: error.message || "Could not load team activity." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/business-activity" };
