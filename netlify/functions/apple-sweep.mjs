// Hourly safety net for Apple subscriptions.
//
// App Store Server Notifications normally end a subscription at once. If one is
// missed, a Pro subscription still ends on time (the database reads its dates),
// but a Business team billed by Apple would stay open. This calls
// public.expire_apple_subscriptions(), which marks subscriptions past their end
// (and past any billing grace period) as expired or in billing retry and closes
// their Apple-billed teams. See supabase/migrations/20261030120000_apple_iap.sql.
//
// "@hourly" runs at minute 0. Like every Netlify scheduled function it runs only
// on the published production deploy and stops after 30 seconds. Set
// APPLE_SWEEP=off in the Netlify environment to stop it.
import { serviceFetch } from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}

export async function sweepAppleSubscriptions({ timeoutMs = 20_000 } = {}) {
  if (env("APPLE_SWEEP").toLowerCase() === "off") return { status: "disabled" };
  try {
    const response = await serviceFetch("/rest/v1/rpc/expire_apple_subscriptions", {
      method: "POST",
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      console.error("CyberNet apple-sweep failed", response.status, detail);
      reportError(`Apple subscription sweep failed (HTTP ${response.status})`, { fn: "apple-sweep", label: "Expired Apple subscriptions were not closed" });
      return { status: "failed", httpStatus: response.status };
    }
    const value = await response.json().catch(() => null);
    const expired = Number(Array.isArray(value) ? Object.values(value[0] ?? {})[0] : value);
    console.log("CyberNet apple-sweep", JSON.stringify({ expired: Number.isFinite(expired) ? expired : null }));
    return { status: "done", expired: Number.isFinite(expired) ? expired : null };
  } catch (error) {
    console.error("CyberNet apple-sweep failed", error?.message || error);
    reportError(error, { fn: "apple-sweep", label: "Expired Apple subscriptions were not closed" });
    return { status: "failed" };
  }
}

export default async () => {
  const result = await sweepAppleSubscriptions();
  return new Response(JSON.stringify(result), {
    status: result.status === "failed" ? 500 : 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
};

export const config = {
  schedule: "@hourly"
};
