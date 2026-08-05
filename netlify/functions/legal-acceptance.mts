import { json, verifyUser } from "../lib/supabase.mjs";

const CURRENT_VERSION = "2026-08-06";
const ALLOWED_TYPES = new Set(["signup", "checkout", "reaccept"]);

function env(name) {
  return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

async function insertAcceptance(payload) {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw Object.assign(new Error("Server privacy storage is not configured."), { status: 503 });

  const response = await fetch(`${url}/rest/v1/legal_acceptances`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(detail || "Legal acceptance could not be recorded."), { status: 500 });
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
    return json({ error: error?.message || "Legal acceptance could not be recorded." }, Number(error?.status) || 500);
  }
};

export const config = { path: "/api/legal-acceptance" };
