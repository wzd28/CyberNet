import { json, serviceFetch } from "../lib/supabase.mjs";

// Simple in-memory cache so a burst of homepage visits doesn't hammer the
// database with the same aggregate query. Cold-starts reset this, which is
// fine since the query itself is cheap.
let cache = { value: null, expires: 0 };
const CACHE_MS = 60_000;

export default async (request) => {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (cache.value && cache.expires > Date.now()) {
    return json(cache.value);
  }

  try {
    const response = await serviceFetch("/rest/v1/rpc/get_platform_stats", {
      method: "POST",
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Supabase returned ${response.status}`);
    }

    const rows = await response.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : rows;

    const value = {
      totalScans: Number(row?.total_scans) || 0,
      threatsFound: Number(row?.threats_found) || 0,
      recoveryCases: Number(row?.recovery_cases) || 0,
      live: true
    };

    cache = { value, expires: Date.now() + CACHE_MS };
    return json(value);
  } catch (error) {
    console.error("CyberNet public stats fetch failed", error);
    // Fail honestly: tell the frontend live data is unavailable rather than
    // returning a plausible-looking but fabricated number.
    return json({ live: false, error: "Live stats are temporarily unavailable." }, 503);
  }
};

export const config = {
  path: "/api/public-stats"
};
