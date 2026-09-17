import { json, verifyUser, getActiveTeamMembership, serviceFetch } from "../lib/supabase.mjs";
import { redactForTeamLog } from "../lib/team-log.mjs";

// Quick Scan runs entirely in the visitor's browser, so the server never sees
// it and it used to be missing from the team owner's activity log. A team
// member's browser now reports each Quick Scan here once it has finished, and
// reports the final figures an Analysis AI result was shown with (the page
// blends the AI's read with its own on-device check, so the number on screen
// can differ from the AI's own).
//
// Only non-owner members of an active Business team are logged. Everyone else
// gets `{ logged: false }` and nothing is stored: individual accounts keep no
// submitted content, and the owner's own activity stays private.

const MAX_CONTENT_CHARS = 10_000;
const DAILY_QUICK_SCAN_LOG_CAP = 400;
const SCAN_TYPES = new Set(["text", "link", "image"]);

const clean = (value: unknown, max: number) =>
  String(value ?? "").replace(/\u0000/g, "").slice(0, max);

const cleanList = (value: unknown, maxItems: number, maxLength: number): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map((item) => clean(item, maxLength).trim()).filter(Boolean))].slice(0, maxItems)
    : [];

const clampScore = (value: unknown) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

// Same bands the page uses for its risk tags, so the log and the member's
// screen describe a score the same way.
function verdictForScore(score: number): string {
  if (score >= 60) return "malicious";
  if (score >= 32) return "suspicious";
  return "low_risk";
}

async function quickScansLoggedToday(userId: string): Promise<number> {
  const startOfDayUtc = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const response = await serviceFetch(
    `/rest/v1/scan_history?user_id=eq.${encodeURIComponent(userId)}` +
    `&source=eq.quick_scan&created_at=gte.${startOfDayUtc}&select=id&limit=1`,
    { headers: { Prefer: "count=exact" } },
  );
  const total = Number(String(response.headers.get("content-range") || "").split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function logQuickScan(userId: string, businessAccountId: string, body: any) {
  const scanType = clean(body?.scanType, 20);
  if (!SCAN_TYPES.has(scanType)) return json({ error: "Unknown scan type." }, 400);

  if ((await quickScansLoggedToday(userId)) >= DAILY_QUICK_SCAN_LOG_CAP) {
    return json({ logged: false, reason: "daily_log_cap" });
  }

  const result = body?.result || {};
  const needsDeepScan = result?.needsDeepScan === true;
  const score = clampScore(result?.score);
  const reasons = cleanList(result?.reasons, 14, 500);
  const advice = cleanList(result?.advice, 12, 500);
  const counterEvidence = cleanList(result?.counterEvidence, 10, 500);
  const content = redactForTeamLog(body?.content, MAX_CONTENT_CHARS).trim();

  const links = (Array.isArray(result?.links) ? result.links : []).slice(0, 4).map((link: any) => ({
    url: clean(link?.url, 600),
    score: clampScore(link?.score),
    label: clean(link?.label, 120),
  })).filter((link: any) => link.url);

  const qrData = redactForTeamLog(body?.qr?.data, 1_200).trim();
  const qr = qrData ? { kind: clean(body?.qr?.kind, 20), data: qrData } : null;

  const summary = needsDeepScan
    ? "Quick Scan could not read this picture (it had no QR code), so it gave no verdict and pointed the member to Analysis AI."
    : reasons.length
      ? reasons.slice(0, 2).join(" ")
      : "The on-device check found no warning signs.";

  const response = await serviceFetch("/rest/v1/scan_history", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      business_account_id: businessAccountId,
      source: "quick_scan",
      analysis_type: scanType,
      verdict: needsDeepScan ? "inconclusive" : verdictForScore(score),
      score: needsDeepScan ? 0 : score,
      threat_type: clean(result?.scamType, 160) || "Quick Scan",
      summary: summary.slice(0, 2000),
      submitted_content: content || (qr ? qr.data : null),
      analysis: {
        confidence: clampScore(result?.confidence),
        evidence: reasons,
        counterEvidence,
        limitations: [],
        actions: advice,
        links,
        qr,
        hadImage: scanType === "image",
        fileName: scanType === "image" ? clean(body?.fileName, 160) : "",
        needsDeepScan,
        aiUsed: false,
        engine: "Quick Scan (on-device check)",
      },
    }),
  });

  if (!response.ok) {
    console.warn("CyberNet team quick-scan log failed", response.status);
    return json({ logged: false }, 502);
  }
  return json({ logged: true });
}

// The figures the member actually saw for an Analysis AI result. Attached to
// the row the analysis itself created, and only within a short window of it.
async function attachShownResult(userId: string, businessAccountId: string, body: any) {
  const logId = Number(body?.logId);
  if (!Number.isInteger(logId) || logId <= 0) return json({ error: "Missing log id." }, 400);

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const rowRes = await serviceFetch(
    `/rest/v1/scan_history?id=eq.${logId}&user_id=eq.${encodeURIComponent(userId)}` +
    `&business_account_id=eq.${businessAccountId}&source=eq.analysis_ai` +
    `&created_at=gte.${since}&select=id,analysis`,
  );
  const rows = await rowRes.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json({ logged: false });

  const shown = {
    score: clampScore(body?.shown?.score),
    label: clean(body?.shown?.label, 40),
    threatType: clean(body?.shown?.threatType, 160),
  };

  const patch = await serviceFetch(`/rest/v1/scan_history?id=eq.${logId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ analysis: { ...(row.analysis || {}), shown } }),
  });
  return json({ logged: patch.ok });
}

export default async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user } = await verifyUser(request);
    const team = await getActiveTeamMembership(user.id);
    if (!team || team.role === "owner") return json({ logged: false });

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 60_000) return json({ error: "Request too large." }, 413);

    const body = await request.json().catch(() => ({}));
    if (body?.kind === "quick_scan") return await logQuickScan(user.id, team.businessAccountId, body);
    if (body?.kind === "analysis_shown") return await attachShownResult(user.id, team.businessAccountId, body);
    return json({ error: "Unknown activity kind." }, 400);
  } catch (error: any) {
    return json({ error: error.message || "Could not record team activity." }, Number(error.status) || 500);
  }
};

export const config = { path: "/api/team-activity" };
