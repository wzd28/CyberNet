function env(name) {
  try {
    return globalThis.Netlify?.env?.get?.(name) || process.env[name] || "";
  } catch {
    return process.env[name] || "";
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function requireSupabaseEnv() {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const anonKey =
    env("SUPABASE_ANON_KEY") ||
    env("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey =
    env("SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_SECRET_KEY");

  if (!url || !anonKey || !serviceKey) {
    const error = new Error(
      "Supabase server environment variables are not configured."
    );
    error.status = 503;
    throw error;
  }

  return { url, anonKey, serviceKey };
}

export function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
}

export async function verifyUser(request) {
  const token = bearerToken(request);

  if (!token) {
    const error = new Error("Sign in is required.");
    error.status = 401;
    throw error;
  }

  const { url, anonKey } = requireSupabaseEnv();

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    }
  });

  const user = await response.json().catch(() => ({}));

  if (!response.ok || !user?.id) {
    const error = new Error(
      "Your session is invalid or has expired. Please sign in again."
    );
    error.status = 401;
    throw error;
  }

  return { user, token };
}

export async function serviceFetch(path, options = {}) {
  const { url, serviceKey } = requireSupabaseEnv();

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  return fetch(`${url}${path}`, {
    ...options,
    headers
  });
}

export function effectivePlan(profile = {}) {
  const active = ["active", "trialing"].includes(
    String(profile.subscription_status || "")
  );

  if (profile.plan === "business" && active) return "business";
  return profile.plan === "pro" && active ? "pro" : "free";
}

export function dailyLimit(profile = {}) {
  const plan = effectivePlan(profile);
  if (plan === "business") return 100;
  return plan === "pro" ? 15 : 3;
}

export async function getProfile(user) {
  const select =
    "id,full_name,plan,subscription_status,billing_interval," +
    "stripe_customer_id,stripe_subscription_id,created_at,updated_at";

  let response = await serviceFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=${select}`
  );

  let rows = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(rows?.message || "Could not load the account profile.");
  }

  if (!rows[0]) {
    const metadata = user.user_metadata || {};
    const fullName = String(
      metadata.full_name ||
      [metadata.first_name, metadata.last_name].filter(Boolean).join(" ") ||
      user.email?.split("@")[0] ||
      "User"
    ).slice(0, 120);

    response = await serviceFetch("/rest/v1/profiles?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        id: user.id,
        full_name: fullName,
        plan: "free",
        subscription_status: "inactive",
        billing_interval: ""
      })
    });

    rows = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(rows?.message || "Could not create the account profile.");
    }
  }

  return rows[0];
}

function nextUtcReset() {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString();
}

export async function getUsage(userId, profile) {
  const date = new Date().toISOString().slice(0, 10);

  const response = await serviceFetch(
    `/rest/v1/daily_usage?user_id=eq.${encodeURIComponent(userId)}` +
    `&usage_date=eq.${date}&select=analysis_count`
  );

  const rows = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(rows?.message || "Could not load daily usage.");
  }

  const used = Number(rows[0]?.analysis_count) || 0;
  const limit = dailyLimit(profile);

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetDate: nextUtcReset()
  };
}

export async function consumeAnalysis(userId) {
  const response = await serviceFetch("/rest/v1/rpc/consume_analysis", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_user_id: userId })
  });

  const payload = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(
      payload?.message || "Could not reserve an analysis request."
    );
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  const limit = Number(row?.daily_limit) || 5;
  const used = Number(row?.used) || 0;

  return {
    allowed: Boolean(row?.allowed),
    used,
    limit,
    remaining: Math.max(0, limit - used),
    plan: row?.plan === "pro" ? "pro" : "free",
    resetDate: nextUtcReset()
  };
}

export async function refundAnalysis(userId) {
  await serviceFetch("/rest/v1/rpc/refund_analysis", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId })
  }).catch(() => null);
}

export async function saveHistory(userId, dataOrType, maybeAnalysis) {
  const data = typeof dataOrType === "string"
    ? {
        analysisType: dataOrType,
        verdict: maybeAnalysis?.verdict,
        score: maybeAnalysis?.score,
        threatType: maybeAnalysis?.threatType,
        summary: maybeAnalysis?.summary
      }
    : (dataOrType || {});

  const response = await serviceFetch("/rest/v1/scan_history", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      analysis_type: String(data.analysisType || "text").slice(0, 20),
      verdict: String(data.verdict || "inconclusive").slice(0, 30),
      score: Math.max(0, Math.min(100, Number(data.score) || 0)),
      threat_type: String(
        data.threatType || "Security analysis"
      ).slice(0, 160),
      summary: String(data.summary || "").slice(0, 2000)
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || "Could not save scan history.");
  }
}

export async function getHistory(userId, limit = 8) {
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 8));

  const response = await serviceFetch(
    `/rest/v1/scan_history?user_id=eq.${encodeURIComponent(userId)}` +
    "&select=id,analysis_type,verdict,score,threat_type,summary,created_at" +
    `&order=created_at.desc&limit=${safeLimit}`
  );

  const rows = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(rows?.message || "Could not load scan history.");
  }

  return rows;
}

export async function updateProfile(userId, patch) {
  const response = await serviceFetch(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString()
      })
    }
  );

  const rows = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(rows?.message || "Could not update the account profile.");
  }

  return rows[0] || null;
}

export async function getProfileByStripeCustomer(customerId) {
  if (!customerId) return null;

  const response = await serviceFetch(
    `/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}` +
    "&select=*"
  );

  const rows = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(rows?.message || "Could not locate the Stripe customer.");
  }

  return rows[0] || null;
}
