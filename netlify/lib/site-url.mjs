// The site's own address for links that leave the site: invite emails and the
// Stripe success, cancel and return pages (security audit Nov 2026, SRV-12 /
// SRV-AUTH-18). These used to come from the request's own origin, so a
// request through cybernet-ai.netlify.app or a deploy preview produced emails
// and Stripe redirects on that host.
//
//   SITE_URL   optional override (for example https://cybernetai.app).
//
// The request's origin is still used when it is the site itself (apex or
// www), a deploy preview or branch deploy ("<name>--<site>.netlify.app", so
// testing on a preview keeps working) or a local `netlify dev` host.
const DEFAULT_SITE_URL = "https://cybernetai.app";

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}

export function siteUrl() {
  const raw = env("SITE_URL");
  try {
    if (raw) {
      const u = new URL(raw);
      if (u.protocol === "https:") return u.origin;
    }
  } catch { /* fall through */ }
  return DEFAULT_SITE_URL;
}

export function linkOrigin(request) {
  const base = siteUrl();
  let origin = "";
  let host = "";
  try {
    const u = new URL(request.url);
    origin = u.origin;
    host = u.hostname.toLowerCase();
  } catch {
    return base;
  }
  const baseHost = new URL(base).hostname.toLowerCase();
  if (host === baseHost || host === `www.${baseHost}`) return origin;
  if (/^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(host) && origin.startsWith("https://")) return origin;
  if (host === "localhost" || host === "127.0.0.1") return origin;
  return base;
}
