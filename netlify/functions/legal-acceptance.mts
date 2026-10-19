import { json, verifyUser } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
import { fetchWithJwtRetry, RETRY_STANDARD } from "../lib/supabase-retry.mjs";

const CURRENT_VERSION = "2026-09-04";
const ALLOWED_TYPES = new Set(["signup", "checkout", "reaccept"]);

function env(name) {
  return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

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

export default async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const { user } = await verifyUser(request);
    const body = await request.json().catch(() => ({}));
    const acceptanceType = clean(body.kind, 30).toLowerCase();
    if (!ALLOWED_TYPES.has(acceptanceType)) return json({ error: "Unsupported acceptance type." }, 400);

    const record = {
      user_id: user.id,
      acceptance_type: acceptanceType,
      terms_version: clean(body.termsVersion || body.version || CURRENT_VERSION, 40),
      privacy_version: clean(body.privacyVersion || body.version || CURRENT_VERSION, 40),
      acceptable_use_version: clean(body.acceptableUseVersion || body.version || CURRENT_VERSION, 40),
      refund_version: clean(body.refundVersion || body.version || CURRENT_VERSION, 40),
      billing_cycle: ["monthly", "yearly"].includes(clean(body.billingCycle, 20).toLowerCase()) ? clean(body.billingCycle, 20).toLowerCase() : null,
      accepted_at: new Date().toISOString(),
      page_url: clean(body.page, 1000),
      user_agent: clean(request.headers.get("user-agent"), 500)
    };

    await insertAcceptance(record);
    return json({ recorded: true, version: CURRENT_VERSION });
  } catch (error) {
    // The insert failure above is already reported and 4xx answers (signed out,
    // bad request) are expected. A 503 means a server key is missing, which is
    // exactly why acceptances would stop being recorded, so it is reported.
    if (!error?.status || error.status === 503) {
      reportError(error, { fn: "legal-acceptance", label: error?.status === 503 ? "Acceptance storage not configured" : "Acceptance not recorded" });
    }
    return json({ error: error?.message || "Legal acceptance could not be recorded." }, Number(error?.status) || 500);
  }
};

export const config = { path: "/api/legal-acceptance" };
