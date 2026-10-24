// netlify/functions/screenshot-preview.mjs: DNS before the providers, the www
// retry, refusing error-page screenshots, the GetScreenshot circuit breaker,
// and the browser code that shows the result. No network: DNS and fetch are
// stubbed.
//   node tests/run-preview.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "RESEND_API_KEY", "GETSCREENSHOT_API_KEY", "ADMIN_EMAILS", "ERROR_ALERTS"]) delete process.env[name];

const BASE = "https://stub-project.supabase.test";
let ENV = { SUPABASE_URL: BASE, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service", ADMIN_EMAILS: "tester@example.test", ERROR_ALERTS: "off" };
globalThis.Netlify = { env: { get: (name) => ENV[name] } };

const quiet = { log: console.log, error: console.error };
let logged = [];
console.error = (...args) => logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));

// ---- stubs ----
let dnsTable = {};
let lookups = [];
const NX = () => Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });

let calls = [];
let rasterwise = () => Response.json({ screenshotImage: "https://img.rasterwise.test/shot.jpg" });
let microlink = () => Response.json({ status: "success", statusCode: 200, data: { screenshot: { url: "https://img.microlink.test/shot.png" } } });
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  calls.push({ host: url.hostname, target: url.searchParams.get("url") });
  if (url.hostname === "stub-project.supabase.test" && url.pathname === "/auth/v1/user") return Response.json({ id: "00000000-0000-4000-8000-000000000001", email: "tester@example.test" });
  if (url.hostname === "api.rasterwise.com") return rasterwise(url);
  if (url.hostname === "api.microlink.io") return microlink(url);
  if (url.hostname.startsWith("img.")) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  return new Response("unexpected", { status: 599 });
};

const mod = await import("../netlify/functions/screenshot-preview.mjs");
let clock = Date.parse("2026-10-24T10:00:00Z");
mod.previewDeps.now = () => clock;
mod.previewDeps.dnsTimeoutMs = 40;
mod.previewDeps.lookup = async (host) => {
  lookups.push(host);
  const entry = dnsTable[host];
  if (entry === "hang") return new Promise(() => {});
  if (entry instanceof Error) throw entry;
  if (!entry) throw NX();
  return entry.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  quiet.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
}
function reset({ dns = {}, key = "" } = {}) {
  dnsTable = dns;
  lookups = [];
  calls = [];
  logged = [];
  ENV = { ...ENV, GETSCREENSHOT_API_KEY: key };
  rasterwise = () => Response.json({ screenshotImage: "https://img.rasterwise.test/shot.jpg" });
  microlink = () => Response.json({ status: "success", statusCode: 200, data: { screenshot: { url: "https://img.microlink.test/shot.png" } } });
}
const providerCalls = () => calls.filter((c) => c.host === "api.rasterwise.com" || c.host === "api.microlink.io");
async function post(url) {
  const res = await mod.default(new Request("https://cybernetai.app/api/screenshot-preview", { method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" }, body: JSON.stringify({ url }) }));
  return { status: res.status, body: await res.json() };
}
const PUBLIC = ["93.184.216.34"];

// 1. totalpadel.com: no record for the bare name, www resolves.
{
  reset({ dns: { "www.totalpadel.com": PUBLIC } });
  const { status, body } = await post("totalpadel.com");
  check("www retry: 200 with a screenshot", status === 200 && /^data:image\/png;base64,/.test(body.screenshot || ""), { status, body });
  check("www retry: previews www.totalpadel.com", body.url === "https://www.totalpadel.com/" && providerCalls().every((c) => c.target === "https://www.totalpadel.com/"), { url: body.url, calls });
  check("www retry: flag + both host names for the note", body.wwwFallback === true && body.requestedHost === "totalpadel.com" && body.shownHost === "www.totalpadel.com", body);
  check("www retry: bare name looked up first", lookups[0] === "totalpadel.com" && lookups[1] === "www.totalpadel.com", lookups);
}
{
  reset({ dns: { "example.com": PUBLIC, "www.example.com": PUBLIC } });
  const { body } = await post("https://example.com/path?q=1");
  check("resolving name: previewed as given, no flag", body.url === "https://example.com/path?q=1" && !body.wwwFallback && lookups.length === 1, { body, lookups });
}
{
  reset({ dns: { "www.nowhere.example": PUBLIC } });
  const { body } = await post("https://www.nowhere-else.example/");
  check("a www name is not retried with www.www", body.unreachable === true && lookups.length === 1, { body, lookups });
}

// 2. Neither resolves: unreachable, and no provider is asked.
{
  reset({ key: "stub-key" });
  const { status, body } = await post("totalpadel-nothing.com");
  check("no DNS: 200 unreachable, reason dns", status === 200 && body.unreachable === true && body.reason === "dns" && !body.screenshot, { status, body });
  check("no DNS: no provider called (quota saved)", providerCalls().length === 0, calls);
  check("no DNS: original address reported", body.url === "https://totalpadel-nothing.com/", body.url);
}
{
  reset({ dns: { "slow.example": "hang", "www.slow.example": "hang" } });
  const t = Date.now();
  const { body } = await post("slow.example");
  check("DNS timeout: unreachable, reason timeout, quick", body.unreachable === true && body.reason === "timeout" && Date.now() - t < 2_000 && providerCalls().length === 0, body);
}
{
  reset({ dns: { "refused.example": Object.assign(new Error("queryA EREFUSED"), { code: "EREFUSED" }) } });
  const { body } = await post("refused.example");
  check("DNS refused: reason refused", body.unreachable === true && body.reason === "refused", body);
}

// 3. A provider screenshot of an error page is not shown.
{
  reset({ dns: { "down.example": PUBLIC } });
  microlink = () => Response.json({ status: "success", statusCode: null, data: { screenshot: { url: "https://img.microlink.test/chrome-error.png" } } });
  const { status, body } = await post("down.example");
  check("statusCode null: no screenshot, unreachable (load)", status === 200 && !body.screenshot && body.unreachable === true && body.reason === "load", { status, body });
  check("statusCode null: error-page image never downloaded", !calls.some((c) => c.host.startsWith("img.")), calls);
}
{
  reset({ dns: { "gone.example": PUBLIC } });
  microlink = () => Response.json({ status: "success", statusCode: 404, data: { screenshot: { url: "https://img.microlink.test/404.png" } } });
  const { body } = await post("gone.example");
  check("statusCode 404: unreachable (http 404)", !body.screenshot && body.unreachable === true && body.reason === "http" && body.status === 404, body);
}
{
  reset({ dns: { "plain.example": PUBLIC } });
  microlink = () => Response.json({ status: "success", data: { screenshot: { url: "https://img.microlink.test/x.png" } } });
  const { body } = await post("plain.example");
  check("statusCode missing: treated like null", !body.screenshot && body.unreachable === true, body);
}
{
  reset({ dns: { "busy.example": PUBLIC } });
  microlink = () => Response.json({ status: "fail", code: "ERATELIMIT" }, { status: 429 });
  const { status, body } = await post("busy.example");
  check("provider failure (not the site): 503 as before", status === 503 && !body.unreachable && /Couldn't generate a preview/.test(body.error || ""), { status, body });
}

// 4. GetScreenshot 401/402/403 trips the breaker for 30 minutes.
for (const code of [403, 401, 402]) {
  mod.resetPreviewBreaker();
  reset({ dns: { "shop.example": PUBLIC }, key: "stub-key" });
  rasterwise = () => Response.json({ status: "error", message: "Forbidden" }, { status: code });
  const first = await post("shop.example");
  const tripLogs = () => logged.filter((l) => /GetScreenshot answered \d+; skipping it for 30 minutes/.test(l)).length;
  check(`breaker ${code}: first preview still served by Microlink`, first.status === 200 && first.body.provider === "microlink" && first.body.screenshot, first);
  check(`breaker ${code}: GetScreenshot asked once`, calls.filter((c) => c.host === "api.rasterwise.com").length === 1, calls);
  check(`breaker ${code}: logged once`, tripLogs() === 1, logged);
  calls = [];
  clock += 29 * 60_000;
  const second = await post("shop.example");
  check(`breaker ${code}: within 30 min GetScreenshot skipped`, second.body.provider === "microlink" && !calls.some((c) => c.host === "api.rasterwise.com"), calls);
  check(`breaker ${code}: no second log line`, tripLogs() === 1, logged);
  calls = [];
  clock += 2 * 60_000;
  rasterwise = () => Response.json({ screenshotImage: "https://img.rasterwise.test/shot.jpg" });
  const third = await post("shop.example");
  check(`breaker ${code}: after 30 min GetScreenshot is tried again`, third.body.provider === "getscreenshot" && calls.some((c) => c.host === "api.rasterwise.com"), { body: third.body, calls });
}
{
  mod.resetPreviewBreaker();
  reset({ dns: { "shop.example": PUBLIC }, key: "stub-key" });
  rasterwise = () => Response.json({ status: "error", message: "boom" }, { status: 500 });
  await post("shop.example");
  calls = [];
  await post("shop.example");
  check("a 500 does not trip the breaker", calls.some((c) => c.host === "api.rasterwise.com") && !logged.some((l) => /skipping it for 30 minutes/.test(l)), { calls, logged });
}
{
  mod.resetPreviewBreaker();
  reset({ dns: { "shop.example": PUBLIC }, key: "stub-key" });
  const { body } = await post("shop.example");
  check("healthy GetScreenshot still goes first", body.provider === "getscreenshot" && !calls.some((c) => c.host === "api.microlink.io"), { body, calls });
}

// 5. SSRF: the www variant and every DNS answer are checked.
for (const [label, addr] of [["10.x", "10.0.0.5"], ["127.x", "127.0.0.1"], ["192.168.x", "192.168.1.20"], ["172.16.x", "172.16.4.4"], ["169.254 metadata", "169.254.169.254"], ["CGNAT", "100.64.0.1"], ["::1", "::1"], ["fd00::", "fd00::1"], ["fe80::", "fe80::1"], ["mapped 127", "::ffff:127.0.0.1"]]) {
  reset({ dns: { "www.sneaky.example": [addr] }, key: "stub-key" });
  const { status, body } = await post("sneaky.example");
  check(`SSRF www variant -> ${label}: refused, no provider`, status === 400 && body.error === "That link can't be previewed safely." && providerCalls().length === 0, { status, body, calls });
}
{
  reset({ dns: { "rebind.example": ["93.184.216.34", "10.1.2.3"] } });
  const { status } = await post("rebind.example");
  check("SSRF: a name with any private answer is refused", status === 400 && providerCalls().length === 0, { status, calls });
}
for (const bad of ["http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://intranet.local/", "http://10.0.0.1/", "ftp://example.com/", "http://metadata.internal/"]) {
  reset();
  const { status } = await post(bad);
  check(`SSRF: ${bad} still refused before DNS`, status === 400 && lookups.length === 0 && providerCalls().length === 0, { status, lookups });
}

// 6. The browser side: public/script.js loadScreenshotPreview.
{
  const source = readFileSync(path.join(root, "public/script.js"), "utf8");
  const start = source.indexOf("async function loadScreenshotPreview(container,url){");
  const end = source.indexOf("\n  }\n", start) + 4;
  check("script.js: loadScreenshotPreview found", start > 0 && end > start);
  const factory = new Function("fetch", "authHeaders", "escapeHTML", `${source.slice(start, end)}\nreturn loadScreenshotPreview;`);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const run = async (status, payload) => {
    const box = { innerHTML: "loading", removed: false, remove() { this.removed = true; } };
    const load = factory(async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }), (h) => h, esc);
    await load(box, "https://totalpadel.com/");
    return box;
  };
  const MESSAGE = "We couldn't load this website.";
  const DETAIL = "The address may not exist or the site may be down. Double-check the spelling — scam links often use addresses that look almost right.";
  const down = await run(200, { unreachable: true, reason: "dns", url: "https://totalpadel.com/" });
  check("UI unreachable: calm message, no image", !down.removed && down.innerHTML.includes(MESSAGE) && down.innerHTML.includes(DETAIL) && !/<img/.test(down.innerHTML), down.innerHTML);
  const www = await run(200, { screenshot: "data:image/png;base64,AAAA", url: "https://www.totalpadel.com/", wwwFallback: true, requestedHost: "totalpadel.com", shownHost: "www.totalpadel.com" });
  check("UI www fallback: image + small note", /<img/.test(www.innerHTML) && www.innerHTML.includes("Showing www.totalpadel.com: totalpadel.com on its own doesn't load."), www.innerHTML);
  const plain = await run(200, { screenshot: "data:image/png;base64,AAAA", url: "https://example.com/" });
  check("UI normal preview: no www note, no unreachable text", /<img/.test(plain.innerHTML) && !plain.innerHTML.includes("on its own") && !plain.innerHTML.includes(MESSAGE), plain.innerHTML);
  const hostile = await run(200, { screenshot: "data:image/png;base64,AAAA", wwwFallback: true, requestedHost: "<b>x", shownHost: "www.<b>x" });
  check("UI www note escapes host names", !hostile.innerHTML.includes("<b>x") && hostile.innerHTML.includes("&lt;b&gt;x"), hostile.innerHTML);
  check("UI provider error: slot removed as before", (await run(503, { error: "x" })).removed === true);
  check("UI unreachable needs a 200", (await run(429, { unreachable: true })).removed === true);
  check("UI: verdict code does not read the preview result", !/unreachable/.test(source.slice(0, start)) && !/unreachable/.test(source.slice(end)), "unreachable used outside loadScreenshotPreview");
  const html = readFileSync(path.join(root, "public/index.html"), "utf8");
  check("index.html loads script.js with a bumped ?v=", /\/script\.js\?v=20261024-\d+"/.test(html), html.match(/\/script\.js\?v=[^"]+/)?.[0]);
}

{
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  check("npm test runs this file", /node tests\/run-preview\.mjs/.test(pkg.scripts?.test || ""), pkg.scripts?.test);
}

console.error = quiet.error;
console.log(`preview: ${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
