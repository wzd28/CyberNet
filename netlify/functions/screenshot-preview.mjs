import { json, verifyUser, getProfile, effectivePlan } from "../lib/supabase.mjs";

function isPrivateHost(host) {
  const h = host.toLowerCase();
  if (["localhost", "0.0.0.0", "::1"].includes(h)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const match = h.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return h.endsWith(".local") || h.endsWith(".internal");
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (isPrivateHost(parsed.hostname)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      // Raw IPs are blocked outright for the screenshot preview specifically —
      // this feature only needs to preview normal public websites, so there's
      // no legitimate reason to screenshot a bare IP address.
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let user;
  try {
    ({ user } = await verifyUser(request));
  } catch {
    return json({ error: "Please sign in to use this feature." }, 401);
  }

  const profile = await getProfile(user).catch(() => ({}));
  if (effectivePlan(profile) !== "pro") {
    return json({ error: "Link and QR previews are a Pro feature." }, 403);
  }

  const apiKey = process.env.GETSCREENSHOT_API_KEY || globalThis.Netlify?.env?.get?.("GETSCREENSHOT_API_KEY");
  if (!apiKey) {
    return json({ error: "Link previews are not configured for this deployment yet.", configured: false }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const safeUrl = normalizeUrl(body?.url);
  if (!safeUrl) {
    return json({ error: "That link can't be previewed safely." }, 400);
  }

  try {
    const endpoint = new URL("https://api.rasterwise.com/v1/get-screenshot");
    endpoint.searchParams.set("apikey", apiKey);
    endpoint.searchParams.set("url", safeUrl);
    endpoint.searchParams.set("width", "1280");
    endpoint.searchParams.set("height", "800");

    const response = await fetch(endpoint, {
      headers: { Auth: "allow" },
      signal: AbortSignal.timeout(20_000)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.screenshot) {
      throw new Error(data?.message || "Preview service returned an error.");
    }

    return json({ screenshot: data.screenshot, url: safeUrl });
  } catch (error) {
    console.error("CyberNet screenshot-preview failed", error);
    return json({ error: "Couldn't generate a preview of that link right now." }, 503);
  }
};

export const config = {
  path: "/api/screenshot-preview"
};
