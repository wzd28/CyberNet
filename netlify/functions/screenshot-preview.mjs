import { json, verifyUser, getProfile, effectivePlan, getActiveTeamMembership, serviceFetch, isAdminUser } from "../lib/supabase.mjs";
import { withEntitlement } from "../lib/entitlement.mjs";
import { reportError } from "../lib/report-error.mjs";
import { lookup as dnsLookup } from "node:dns/promises";
// The iPhone app uses it too (owner, 11 Nov 2026): any signed-in app account gets
// a picture when it taps "Show a picture of this page" (same per-account caps).
// The website keeps it for Pro and Business accounts.
import { withCors, allowedOrigin } from "../lib/cors.mjs";
import { burstGuard, readJsonCapped } from "../lib/abuse-guard.mjs";

// Every preview spends a paid GetScreenshot credit (or the shared keyless
// Microlink allowance), so each account gets a short-burst and a daily cap.
const SHOT_PER_MINUTE = 6;
const SHOT_PER_DAY = 60;
// All app accounts together (owner, 11 Nov 2026: pictures for every signed-in app account).
const APP_SHOTS_PER_DAY = 300;
// SRV-AUTH-1 / SRV-1 / AI-3 (security audit Nov 2026): the app is recognised by
// its Origin header, which a browser cannot forge but curl can. So a Free
// account reaching the app path also has its own small daily cap, checked
// before the shared pool, and one account (or a handful) can no longer use up
// the pool for every real iPhone user. Pro and team accounts are not limited
// by the app cap or the pool (they have the preview on the website anyway).
const APP_SHOTS_PER_ACCOUNT_PER_DAY = 10;

// Fails open by default: a quota-service outage must not take previews away
// from paying users. failClosed is used for the free app path only (SRV-AUTH-16).
async function consumeQuota(key, windowSeconds, max, { failClosed = false } = {}) {
  try {
    const r = await serviceFetch("/rest/v1/rpc/consume_api_quota", {
      method: "POST",
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_max_requests: max })
    });
    if (!r.ok) {
      console.error("CyberNet screenshot quota check failed", r.status);
      reportError(`Quota check failed (HTTP ${r.status})`, { fn: "screenshot-preview", label: "Preview quota check failed" });
      return !failClosed;
    }
    const d = await r.json().catch(() => null);
    return d?.allowed !== false;
  } catch (e) {
    console.error("CyberNet screenshot quota check failed", e?.message);
    reportError(e, { fn: "screenshot-preview", label: "Preview quota check failed" });
    return !failClosed;
  }
}

// The plan check the website path makes, as a yes/no (never throws).
async function hasPaidPreviewPlan(user) {
  try {
    const profile = await getProfile(user).catch(() => ({}));
    await withEntitlement(profile, user.id).catch(() => null);
    const plan = effectivePlan(profile);
    return plan === "pro" || plan === "business" || Boolean(profile?.isTeamMember) || (await isActiveTeamMember(user.id));
  } catch {
    return false;
  }
}

// The app path's extra accounting (see APP_SHOTS_PER_ACCOUNT_PER_DAY).
async function appPreviewAllowed(user) {
  if (await hasPaidPreviewPlan(user)) return true;
  return (
    (await consumeQuota(`shot:appuser:day:${user.id}`, 86400, APP_SHOTS_PER_ACCOUNT_PER_DAY, { failClosed: true })) &&
    (await consumeQuota("shot:app:day", 86400, APP_SHOTS_PER_DAY, { failClosed: true }))
  );
}

function isPrivateHost(host) {
  // new URL() keeps IPv6 brackets ("[::1]") and a trailing root dot
  // ("localhost."), which slipped past the plain comparisons below.
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (["localhost", "0.0.0.0", "::1", "::"].includes(h)) return true;
  if (h.endsWith(".localhost")) return true;
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
    // IPv6 literals (always bracketed in a URL) are refused like raw IPv4.
    if (parsed.hostname.includes(":") || parsed.hostname.startsWith("[")) return null;
    if (/^\d+\.\d+\.\d+\.\d+\.?$/.test(parsed.hostname)) {
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

// Test seams (tests/run-preview.mjs swaps these for stubs; production never
// changes them). fetch is always the global one, so tests stub globalThis.fetch.
export const previewDeps = {
  lookup: (host, options) => dnsLookup(host, options),
  // The provider's image host (SRV-10); separate so tests can stub it alone.
  imageLookup: (host, options) => dnsLookup(host, options),
  now: () => Date.now(),
  dnsTimeoutMs: 2_500
};

// An address the name resolves to that is not on the public internet: a
// public-looking name can still point at 127.0.0.1 or a private network, so the
// answer is checked as well as the name. Anything not recognised counts as
// private.
function isPrivateAddress(address) {
  const a = String(address || "").toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = a.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  const v4 = (mapped ? mapped[1] : a).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [o1, o2, o3] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    return o1 === 0 || o1 === 10 || o1 === 127 || o1 >= 224 ||
      (o1 === 169 && o2 === 254) || (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168) || (o1 === 100 && o2 >= 64 && o2 <= 127) ||
      // SRV-10: benchmarking (198.18/15), IETF protocol (192.0.0/24) and the
      // documentation ranges (192.0.2/24, 198.51.100/24, 203.0.113/24).
      (o1 === 198 && (o2 === 18 || o2 === 19)) || (o1 === 192 && o2 === 0 && (o3 === 0 || o3 === 2)) ||
      (o1 === 198 && o2 === 51 && o3 === 100) || (o1 === 203 && o2 === 0 && o3 === 113);
  }
  if (!a.includes(":")) return true;
  // SRV-10: also NAT64 (64:ff9b::/96), 6to4 (2002::/16) and documentation (2001:db8::/32).
  return a === "::" || a === "::1" || a.startsWith("::ffff:") || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a) ||
    a.startsWith("64:ff9b:") || a.startsWith("2002:") || a.startsWith("2001:db8:");
}

function dnsReason(code) {
  if (code === "ETIMEOUT" || code === "EAI_AGAIN") return "timeout";
  if (code === "EREFUSED" || code === "ECONNREFUSED") return "refused";
  return "dns";
}

// Resolves a host name with a short timeout. Never throws.
async function resolveHost(host) {
  let timer;
  try {
    const answer = await Promise.race([
      previewDeps.lookup(host, { all: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("DNS lookup timed out."), { code: "ETIMEOUT" })), previewDeps.dnsTimeoutMs);
      })
    ]);
    const addresses = (Array.isArray(answer) ? answer : [answer]).map((e) => (typeof e === "string" ? e : e?.address)).filter(Boolean);
    return addresses.length ? { ok: true, addresses } : { ok: false, reason: "dns" };
  } catch (error) {
    return { ok: false, reason: dnsReason(error?.code) };
  } finally {
    clearTimeout(timer);
  }
}

// Decides what, if anything, gets sent to a screenshot provider.
//   { kind: "ok", url, wwwFallback?, requestedHost?, shownHost? }
//   { kind: "blocked" }                  resolves to a private address
//   { kind: "unreachable", reason }      no DNS answer (dns | timeout | refused)
// A bare name with no DNS record (totalpadel.com) is retried as www.<name>,
// through the same URL and address checks as the original.
async function resolvePreviewTarget(safeUrl) {
  const url = new URL(safeUrl);
  const first = await resolveHost(url.hostname);
  if (first.ok) return first.addresses.some(isPrivateAddress) ? { kind: "blocked" } : { kind: "ok", url: safeUrl };
  if (!/^www\./i.test(url.hostname)) {
    const alt = new URL(safeUrl);
    alt.hostname = `www.${url.hostname}`;
    const wwwUrl = normalizeUrl(alt.toString());
    if (wwwUrl) {
      const shownHost = new URL(wwwUrl).hostname;
      const second = await resolveHost(shownHost);
      if (second.ok) {
        if (second.addresses.some(isPrivateAddress)) return { kind: "blocked" };
        return { kind: "ok", url: wwwUrl, wwwFallback: true, requestedHost: url.hostname, shownHost };
      }
    }
  }
  return { kind: "unreachable", reason: first.reason };
}

// GetScreenshot answers 401/402/403 when the account is unpaid or the key is
// refused; every preview then lost seconds on it before the fallback. After
// one such answer it is skipped for 30 minutes on this instance.
const BREAKER_MS = 30 * 60_000;
const breaker = { until: 0 };
export function resetPreviewBreaker() {
  breaker.until = 0;
}
function getScreenshotPaused() {
  return previewDeps.now() < breaker.until;
}
function tripGetScreenshotBreaker(status) {
  const wasPaused = getScreenshotPaused();
  breaker.until = previewDeps.now() + BREAKER_MS;
  if (!wasPaused) console.error(`CyberNet screenshot-preview: GetScreenshot answered ${status}; skipping it for 30 minutes (Microlink only). Renew the GetScreenshot plan or remove GETSCREENSHOT_API_KEY.`);
}

// A provider rendered the page but the site itself did not load: no answer at
// all (Microlink's statusCode null, which is a picture of the browser's own
// "This site can't be reached" page) or an HTTP error.
function targetFailure(status) {
  const error = new Error(status == null ? "The site did not load." : `The site answered ${status}.`);
  error.target = true;
  error.reason = status == null ? "load" : "http";
  error.status = status == null ? null : status;
  return error;
}

// Everything after the request checks: DNS, then the providers. Exported for
// tests/run-preview.mjs.
//   { kind: "shot", screenshot, provider, url, wwwFallback?, requestedHost?, shownHost? }
//   { kind: "unreachable", reason, status?, url }
//   { kind: "blocked" } | { kind: "failed" }
export async function buildPreview(safeUrl, { apiKey, deadline = previewDeps.now() + 25_000 } = {}) {
  const target = await resolvePreviewTarget(safeUrl);
  if (target.kind === "blocked") return target;
  if (target.kind === "unreachable") return { ...target, url: safeUrl };
  const remaining = () => Math.max(1_000, deadline - previewDeps.now());
  const shotUrl = target.url;

  const attempt = (name, run) =>
    run().then((screenshot) => {
      if (!screenshot) throw new Error("Provider returned no image.");
      return { screenshot, provider: name };
    }).catch((error) => {
      console.error("CyberNet screenshot-preview provider failed", { provider: name, message: error?.message });
      throw error;
    });

  try {
    let result;
    if (!apiKey || getScreenshotPaused()) {
      result = await attempt("microlink", () => microlinkScreenshot(shotUrl, remaining));
    } else {
      const primary = attempt("getscreenshot", () => rasterwiseScreenshot(apiKey, shotUrl, remaining));
      const fallback = new Promise((resolve, reject) => {
        let started = false;
        const start = () => {
          if (started) return;
          started = true;
          attempt("microlink", () => microlinkScreenshot(shotUrl, remaining)).then(resolve, reject);
        };
        const headStart = setTimeout(start, 9_000);
        primary.then(() => clearTimeout(headStart), () => { clearTimeout(headStart); start(); });
      });
      result = await Promise.any([primary, fallback]);
    }
    const www = target.wwwFallback ? { wwwFallback: true, requestedHost: target.requestedHost, shownHost: target.shownHost } : {};
    return { kind: "shot", screenshot: result.screenshot, provider: result.provider, url: shotUrl, ...www };
  } catch (error) {
    const errors = error instanceof AggregateError ? error.errors : [error];
    const failed = errors.find((e) => e?.target);
    if (failed) return { kind: "unreachable", reason: failed.reason, status: failed.status, url: shotUrl };
    return { kind: "failed" };
  }
}

export default withCors(async (request, context) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let user;
  try {
    ({ user } = await verifyUser(request));
  } catch {
    return json({ error: "Please sign in to use this feature." }, 401);
  }

  // Admin-allowlist accounts have Business access (as account-status reports).
  const isAdmin = isAdminUser(user);
  // The app is recognised by its capacitor://localhost Origin, which a web page cannot set (the
  // X-CyberNet-Platform header alone could be added by any website visitor).
  const fromApp = Boolean(allowedOrigin(request));
  if (!isAdmin && !fromApp) {
    const profile = await getProfile(user).catch(() => ({}));
    // Stripe plan OR paid-up Apple Pro (lib/entitlement.mjs; profile rule before the 1.1 migration).
    await withEntitlement(profile, user.id).catch(() => null);
    const plan = effectivePlan(profile);
    const onTeam = plan === "business" || Boolean(profile?.isTeamMember) || (await isActiveTeamMember(user.id));
    if (plan !== "pro" && !onTeam) {
      return json({ error: "Link and QR previews are a Pro feature." }, 403);
    }
  }

  const apiKey = process.env.GETSCREENSHOT_API_KEY || globalThis.Netlify?.env?.get?.("GETSCREENSHOT_API_KEY");

  // The body is one link: anything over 16 KB is refused while it streams in.
  const read = await readJsonCapped(request, 16_000);
  if (!read.ok) return json({ error: read.status === 413 ? "Request is too large." : "Invalid request." }, read.status === 413 ? 413 : 400);
  const body = read.body;

  const safeUrl = normalizeUrl(body?.url);
  if (!safeUrl) {
    return json({ error: "That link can't be previewed safely." }, 400);
  }

  // Per-connection limits (lib/abuse-guard.mjs) on top of the per-account ones below.
  if (!isAdmin) {
    const burst = await burstGuard("screenshot-preview", { request, context });
    if (burst) return json(burst.body, burst.status);
  }

  if (!isAdmin) {
    const allowed =
      (await consumeQuota(`shot:min:${user.id}`, 60, SHOT_PER_MINUTE)) &&
      (await consumeQuota(`shot:day:${user.id}`, 86400, SHOT_PER_DAY)) &&
      // app accounts are free to make: a per-account app cap, then one shared daily
      // ceiling for all free app pictures (shot:app:day), bound the credits they can spend
      (!fromApp || (await appPreviewAllowed(user)));
    if (!allowed) {
      return json({ error: "Preview limit reached. Please try again later.", code: "rate_limited" }, 429);
    }
  }

  // Two providers: Rasterwise when a key is configured, otherwise Microlink's
  // keyless tier (a small daily allowance - enough to start, and the place to
  // add a key once previews are popular). Either way the page is rendered by
  // the provider, never by the visitor's browser, so a hostile page is looked
  // at from a distance.
  // The whole request has to finish inside the platform's response budget.
  // GetScreenshot goes first and usually answers in about seven seconds; if it
  // has not answered after nine (a heavy page) or it fails outright, the
  // keyless fallback starts alongside it and whichever finishes first wins.
  // Running them one after the other left slow pages with no picture at all.
  // Before either is asked, the name is looked up: a name with no DNS record
  // is not sent to a provider at all (it used to come back as a picture of the
  // browser's "This site can't be reached" page).
  const outcome = await buildPreview(safeUrl, { apiKey, deadline: previewDeps.now() + 25_000 });
  if (outcome.kind === "blocked") {
    return json({ error: "That link can't be previewed safely." }, 400);
  }
  if (outcome.kind === "unreachable") {
    return json({ unreachable: true, reason: outcome.reason, status: outcome.status ?? null, url: outcome.url });
  }
  if (outcome.kind !== "shot") {
    return json({ error: "Couldn't generate a preview of that link right now." }, 503);
  }
  const www = outcome.wwwFallback ? { wwwFallback: true, requestedHost: outcome.requestedHost, shownHost: outcome.shownHost } : {};
  return json({ screenshot: outcome.screenshot, url: outcome.url, provider: outcome.provider, ...www });
});

async function isActiveTeamMember(userId) {
  try {
    return Boolean(await getActiveTeamMembership(userId));
  } catch {
    return false;
  }
}

// GetScreenshot (by Rasterwise). Its response carries the picture's address in
// `screenshotImage`; this used to read `screenshot`, which does not exist, so
// every call looked like a failure and the paid plan was never actually used.
async function rasterwiseScreenshot(apiKey, safeUrl, remaining) {
  const endpoint = new URL("https://api.rasterwise.com/v1/get-screenshot");
  endpoint.searchParams.set("apikey", apiKey);
  endpoint.searchParams.set("url", safeUrl);
  endpoint.searchParams.set("width", "1280");
  endpoint.searchParams.set("height", "800");
  endpoint.searchParams.set("format", "jpeg");
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(Math.min(20_000, remaining())) });
  if ([401, 402, 403].includes(response.status)) tripGetScreenshotBreaker(response.status);
  const data = await response.json().catch(() => ({}));
  const imageUrl = data?.screenshotImage || data?.screenshot;
  if (!response.ok || data?.status === "error" || !imageUrl) {
    throw new Error(data?.message || `GetScreenshot returned ${response.status}.`);
  }
  return imageToDataUrl(imageUrl, remaining);
}

// Providers hand back a hosted image address; the bytes are fetched here and
// given to the page as a data URL, because the page's Content-Security-Policy
// only allows images from the site itself and inline data.
// SRV-10 (security audit Nov 2026): the image address comes from the
// provider's JSON, so it is treated as untrusted: https only, a host that does
// not resolve to a private address, no redirects, a hard 2.5 MB cap while it
// streams in, and only ordinary picture types in the data URL. The provider's
// CDN hosts are not pinned (they are not known and may change).
const MAX_SCREENSHOT_BYTES = 2_500_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
async function imageToDataUrl(imageUrl, remaining) {
  let parsed;
  try {
    parsed = new URL(String(imageUrl));
  } catch {
    throw new Error("Screenshot address is not valid.");
  }
  if (parsed.protocol !== "https:" || isPrivateHost(parsed.hostname)) throw new Error("Screenshot address refused.");
  const resolved = await resolveImageHost(parsed.hostname);
  if (resolved.some(isPrivateAddress)) throw new Error("Screenshot address refused.");
  const image = await fetch(parsed.href, { redirect: "error", signal: AbortSignal.timeout(Math.min(10_000, remaining())) });
  if (!image.ok) throw new Error(`Screenshot download failed (${image.status}).`);
  if (Number(image.headers.get("content-length") || 0) > MAX_SCREENSHOT_BYTES) throw new Error("Screenshot too large to inline.");
  const declared = String(image.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
  const type = IMAGE_TYPES.has(declared) ? declared : declared === "image/jpg" ? "image/jpeg" : "";
  if (!type) throw new Error("Screenshot is not a picture.");
  const chunks = [];
  let total = 0;
  if (image.body) {
    const reader = image.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SCREENSHOT_BYTES) {
        reader.cancel().catch(() => {});
        throw new Error("Screenshot too large to inline.");
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  }
  const bytes = Buffer.concat(chunks);
  return `data:${type};base64,${bytes.toString("base64")}`;
}

// The image host's addresses; [] when it cannot be resolved (the fetch then
// fails on its own). Never throws.
async function resolveImageHost(host) {
  const h = String(host || "").replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return [h];
  let timer;
  try {
    const answer = await Promise.race([
      previewDeps.imageLookup(h, { all: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), previewDeps.dnsTimeoutMs); })
    ]);
    return (Array.isArray(answer) ? answer : [answer]).map((e) => (typeof e === "string" ? e : e?.address)).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Keyless fallback, used when GetScreenshot is not configured, refuses a URL
// (it blocks link shorteners, for one) or is paused by the breaker above.
async function microlinkScreenshot(safeUrl, remaining) {
  const endpoint = new URL("https://api.microlink.io/");
  endpoint.searchParams.set("url", safeUrl);
  endpoint.searchParams.set("screenshot", "true");
  endpoint.searchParams.set("meta", "false");
  endpoint.searchParams.set("viewport.width", "1280");
  endpoint.searchParams.set("viewport.height", "800");
  endpoint.searchParams.set("viewport.deviceScaleFactor", "1");
  endpoint.searchParams.set("screenshot.type", "jpeg");
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(Math.min(18_000, remaining())) });
  const data = await response.json().catch(() => ({}));
  const imageUrl = data?.data?.screenshot?.url;
  if (!response.ok || data?.status !== "success" || !imageUrl) throw new Error(data?.message || data?.code || "Microlink returned an error.");
  // statusCode is the site's own answer when Microlink reports it; 400 and up is an
  // error page. Since 30 Oct 2026 Microlink answers null even for pages that loaded
  // fine, so null no longer means "did not load" (no-such-address is caught by the
  // DNS check before any provider is called).
  const status = typeof data.statusCode === "number" ? data.statusCode : null;
  if (status !== null && status >= 400) throw targetFailure(status);
  return imageToDataUrl(imageUrl, remaining);
}

export const config = {
  path: "/api/screenshot-preview"
};
