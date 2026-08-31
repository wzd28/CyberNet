import { json, verifyUser, serviceFetch, isAdminUser } from "../lib/supabase.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let user;
  try {
    ({ user } = await verifyUser(request));
  } catch (error) {
    return json({ error: "Please sign in to use Quick Scan." }, 401);
  }

  if (isAdminUser(user)) {
    return json({ allowed: true, used: 0, limit: 999999, plan: "business" });
  }

  try {
    const response = await serviceFetch("/rest/v1/rpc/consume_quickscan", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_user_id: user.id })
    });

    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(payload?.message || "Could not reserve a Quick Scan request.");
    }

    const row = Array.isArray(payload) ? payload[0] : payload;
    const limit = Number(row?.daily_limit) || 5;
    const used = Number(row?.used) || 0;
    const allowed = Boolean(row?.allowed);
    const plan = row?.plan === "pro" ? "pro" : "free";

    if (!allowed) {
      return json({
        error: "Daily Quick Scan limit reached. Upgrade to Pro for unlimited scans.",
        code: "daily_limit_reached",
        used,
        limit,
        plan
      }, 429);
    }

    return json({ allowed: true, used, limit, plan });
  } catch (error) {
    console.error("CyberNet quickscan-usage failed", error);
    return json({ error: "Could not check Quick Scan usage right now. Please try again." }, 503);
  }
};

export const config = {
  path: "/api/quickscan-usage"
};
