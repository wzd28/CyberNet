import { json, verifyUser } from "../lib/supabase.mjs";
import { smallJsonBody } from "../lib/abuse-guard.mjs";
import { publicErrorBody } from "../lib/public-error.mjs";
import { reportError, consumeQuota } from "../lib/report-error.mjs";
import { fetchWithJwtRetry, RETRY_STANDARD } from "../lib/supabase-retry.mjs";
import { withCors } from "../lib/cors.mjs";

// Default only: the page sends its own versions (public/cybernet-legal-upgrade.js LEGAL_VERSION).
const CURRENT_VERSION = "2026-10-29";
const ALLOWED_TYPES = new Set(["signup", "checkout", "reaccept"]);

function env(name) {
  return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

// SRV-17: a document version is a date (2026-10-29). The page and the app send
// their own (terms and privacy can differ), so a real one is kept; any other
// label falls back to the server's current version.
function version(value) {
  const v = clean(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : CURRENT_VERSION;
}

// SRV-AUTH-13 / SRV-17: at most 20 recorded acceptances per account per hour
// (a real person records one or two). Over that, the answer is still a
// success, so nothing on the page or in the app breaks; fails open.
const ACCEPTANCES_PER_HOUR = 20;

async function insertAcceptance(payload) {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!url || !serviceKey) throw Object.assign(new Error("Server privacy storage is not configured."), { status: 503 });

  // Retries only Supabase's passing 401 PGRST303 (netlify/lib/supabase-retry.mjs).
  const response = await fetchWithJwtRetry(`${url}/rest/v1/legal_acceptances`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  }, { ...RETRY_STANDARD, label: "legal-acceptance" });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("CyberNet legal-acceptance db error", response.status, detail.slice(0, 500));
    // Never pass `detail` to reportError: it can echo row data.
    reportError(`Legal acceptance insert failed (HTTP ${response.status})`, { fn: "legal-acceptance", label: "Acceptance not recorded" });
    throw Object.assign(new Error("Legal acceptance could not be recorded."), { status: 500 });
  }
}

async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const { user } = await verifyUser(request);
    // SRV-11: a small JSON body, capped while it streams in.
    const body: any = await smallJsonBody(request, 16_000);
    if (body === null) return json({ error: "Request is too large." }, 413);
    const acceptanceType = clean(body.kind, 30).toLowerCase();
    if (!ALLOWED_TYPES.has(acceptanceType)) return json({ error: "Unsupported acceptance type." }, 400);

    const record = {
      user_id: user.id,
      acceptance_type: acceptanceType,
      terms_version: version(body.termsVersion || body.version),
      privacy_version: version(body.privacyVersion || body.version),
      acceptable_use_version: version(body.acceptableUseVersion || body.version),
      refund_version: version(body.refundVersion || body.version),
      billing_cycle: ["monthly", "yearly"].includes(clean(body.billingCycle, 20).toLowerCase()) ? clean(body.billingCycle, 20).toLowerCase() : null,
      accepted_at: new Date().toISOString(),
      page_url: clean(body.page, 1000),
      user_agent: clean(request.headers.get("user-agent"), 500)
    };

    const quota = await consumeQuota(`legal:${user.id}`, 3600, ACCEPTANCES_PER_HOUR).catch(() => null);
    if (quota && quota.allowed === false) return json({ recorded: true, version: CURRENT_VERSION });

    await insertAcceptance(record);
    return json({ recorded: true, version: CURRENT_VERSION });
  } catch (error) {
    // The insert failure above is already reported and 4xx answers (signed out,
    // bad request) are expected. A 503 means a server key is missing, which is
    // exactly why acceptances would stop being recorded, so it is reported.
    if (!error?.status || error.status === 503) {
      reportError(error, { fn: "legal-acceptance", label: error?.status === 503 ? "Acceptance storage not configured" : "Acceptance not recorded" });
    }
    const failure = publicErrorBody(error, "Legal acceptance could not be recorded.");
    return json(failure.body, failure.status);
  }
}

// CORS for the iPhone app only (netlify/lib/cors.mjs); website requests pass
// through unchanged.
export default withCors(handler);

export const config = { path: "/api/legal-acceptance" };
