import { json, verifyUser, getProfile, effectivePlan, getActiveTeamMembership } from "../lib/supabase.mjs";

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
  const plan = effectivePlan(profile);
  const onTeam = plan === "business" || Boolean(profile?.isTeamMember) || (await isActiveTeamMember(user.id));
  if (plan !== "pro" && !onTeam) {
    return json({ error: "Link and QR previews are a Pro feature." }, 403);
  }

  const apiKey = process.env.GETSCREENSHOT_API_KEY || globalThis.Netlify?.env?.get?.("GETSCREENSHOT_API_KEY");

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

  // Two providers: Rasterwise when a key is configured, otherwise Microlink's
  // keyless tier (a small daily allowance - enough to start, and the place to
  // add a key once previews are popular). Either way the page is rendered by
  // the provider, never by the visitor's browser, so a hostile page is looked
  // at from a distance.
  const providers = [];
  if (apiKey) providers.push(() => rasterwiseScreenshot(apiKey, safeUrl));
  providers.push(() => microlinkScreenshot(safeUrl));

  for (const provider of providers) {
    try {
      const screenshot = await provider();
      if (screenshot) return json({ screenshot, url: safeUrl });
    } catch (error) {
      console.error("CyberNet screenshot-preview provider failed", error);
    }
  }
  return json({ error: "Couldn't generate a preview of that link right now." }, 503);
};

async function isActiveTeamMember(userId) {
  try {
    return Boolean(await getActiveTeamMembership(userId));
  } catch {
    return false;
  }
}

async function rasterwiseScreenshot(apiKey, safeUrl) {
  const endpoint = new URL("https://api.rasterwise.com/v1/get-screenshot");
  endpoint.searchParams.set("apikey", apiKey);
  endpoint.searchParams.set("url", safeUrl);
  endpoint.searchParams.set("width", "1280");
  endpoint.searchParams.set("height", "800");
  const response = await fetch(endpoint, { headers: { Auth: "allow" }, signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.screenshot) throw new Error(data?.message || "Rasterwise returned an error.");
  return data.screenshot;
}

// Microlink returns a hosted image URL; the bytes are fetched here and handed
// to the page as a data URL, because the page's Content-Security-Policy only
// allows images from the site itself and inline data.
async function microlinkScreenshot(safeUrl) {
  const endpoint = new URL("https://api.microlink.io/");
  endpoint.searchParams.set("url", safeUrl);
  endpoint.searchParams.set("screenshot", "true");
  endpoint.searchParams.set("meta", "false");
  endpoint.searchParams.set("viewport.width", "1280");
  endpoint.searchParams.set("viewport.height", "800");
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(22_000) });
  const data = await response.json().catch(() => ({}));
  const imageUrl = data?.data?.screenshot?.url;
  if (!response.ok || data?.status !== "success" || !imageUrl) throw new Error(data?.message || data?.code || "Microlink returned an error.");

  const image = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  if (!image.ok) throw new Error(`Screenshot download failed (${image.status}).`);
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length > 2_500_000) throw new Error("Screenshot too large to inline.");
  const type = image.headers.get("content-type") || "image/jpeg";
  return `data:${type};base64,${bytes.toString("base64")}`;
}

export const config = {
  path: "/api/screenshot-preview"
};
