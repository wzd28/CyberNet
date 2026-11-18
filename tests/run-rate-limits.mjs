// netlify/lib/abuse-guard.mjs (brief step 9, 18 Nov 2026): the per-IP and
// per-account burst limits, the global daily OpenAI ceiling, the trusted
// client address behind Cloudflare and the capped body reads.
// The handlers that use it are checked in tests/run-ios-server.mjs ("guard").
//
// No network: the quota RPC is replaced through guardDeps.consume, and
// report-error.mjs has no Supabase or Resend configuration here, so an alert
// is only logged.
//
//   node tests/run-rate-limits.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = {};
for (const name of ["AI_DAILY_CALL_CEILING", "RATE_LIMITS", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "RESEND_API_KEY", "ERROR_REPORT_SALT"]) delete process.env[name];
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
const logged = [];
console.error = (...args) => logged.push(args.map(String).join(" "));
console.warn = (...args) => logged.push(args.map(String).join(" "));

const guard = await import(pathToFileURL(path.join(root, "netlify/lib/abuse-guard.mjs")).href);
const { burstGuard, allowAiCall, aiCeiling, clientAddress, addressBucket, isCloudflareAddress, readBodyText, readJsonCapped, guardDeps, GUARD_RULES, AI_CEILING_KEY } = guard;

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  }
}

let seen = [];
let answer = () => ({ allowed: true, used: 1, resetAt: Date.now() + 60_000 });
guardDeps.consume = async (key, window, max) => {
  seen.push({ key, window, max });
  return answer(key, window, max);
};
const reqWith = (headers = {}) => new Request("https://cybernetai.app/api/analyze", { method: "POST", headers });

// ── the ceiling setting ──
for (const [value, expected] of [[undefined, 2000], ["", 2000], ["50", 50], ["1", 1], ["20000", 10000], ["10000", 10000], ["-3", 2000], ["abc", 2000], ["off", 0], ["OFF", 0], ["0", 0], ["750.9", 750]]) {
  if (value === undefined) delete ENV.AI_DAILY_CALL_CEILING; else ENV.AI_DAILY_CALL_CEILING = value;
  check(`ceiling AI_DAILY_CALL_CEILING=${value}: ${expected}`, aiCeiling() === expected, aiCeiling());
}
delete ENV.AI_DAILY_CALL_CEILING;

// The RPC refuses windows under 60 s and limits outside 1..10000: every rule must fit.
for (const [fn, rules] of Object.entries(GUARD_RULES)) {
  for (const rule of [...rules.ip, ...rules.user]) check(`rule ${fn} ${rule.window}s/${rule.max}: inside the RPC's bounds`, rule.window >= 60 && rule.window <= 2592000 && rule.max >= 1 && rule.max <= 10000);
  // per-connection limits are looser than per-account ones (offices and carriers share one address)
  const userMin = rules.user.find((r) => r.window === 60)?.max ?? 0;
  const ipMin = rules.ip.find((r) => r.window === 60)?.max ?? Infinity;
  check(`rule ${fn}: per-IP per-minute limit at least twice the per-account one`, ipMin >= userMin * 2, { ipMin, userMin });
}

// ── the client address ──
check("cloudflare v4 edge recognised", isCloudflareAddress("172.68.10.20") && isCloudflareAddress("104.16.0.1") && isCloudflareAddress("162.159.255.255"));
check("cloudflare v6 edge recognised", isCloudflareAddress("2606:4700:10::ac43:1") && isCloudflareAddress("2a06:98c7::1") && isCloudflareAddress("[2400:cb00::5]"));
check("non-cloudflare addresses refused", !isCloudflareAddress("8.8.8.8") && !isCloudflareAddress("34.120.1.1") && !isCloudflareAddress("2001:db8::1") && !isCloudflareAddress("2a06:98d0::1") && !isCloudflareAddress("") && !isCloudflareAddress("garbage") && !isCloudflareAddress("999.1.1.1"));
check("behind Cloudflare: CF-Connecting-IP is the visitor", clientAddress(reqWith({ "cf-connecting-ip": "5.6.7.8" }), { ip: "172.68.1.1" }) === "5.6.7.8");
check("direct to Netlify: a forged CF-Connecting-IP is ignored", clientAddress(reqWith({ "cf-connecting-ip": "5.6.7.8" }), { ip: "34.120.1.1" }) === "34.120.1.1");
check("no context: Netlify's connection header", clientAddress(reqWith({ "x-nf-client-connection-ip": "9.9.9.9" })) === "9.9.9.9");
check("nothing known: 'unknown'", clientAddress(reqWith()) === "unknown");
const b1 = addressBucket("5.6.7.8"), b2 = addressBucket("5.6.7.9");
check("address bucket: 4 hex characters, stable, no raw address", /^[0-9a-f]{4}$/.test(b1) && addressBucket("5.6.7.8") === b1 && b1 !== "5678", { b1, b2 });

// ── burst limits ──
seen = [];
let r = await burstGuard("analyze", { request: reqWith(), context: { ip: "203.0.113.5" }, userId: "u-1" });
check("burst: allowed = null", r === null, r);
check("burst analyze: two per-IP keys and one per-account key, right windows", seen.length === 3 && seen.filter((s) => /^g:analyze:ip(60|3600):[0-9a-f]{4}$/.test(s.key)).length === 2 && seen.some((s) => s.key === "g:analyze:u60:u-1" && s.window === 60 && s.max === GUARD_RULES.analyze.user[0].max), seen);
check("burst: no raw IP in a key", !seen.some((s) => s.key.includes("203.0.113")), seen);
seen = [];
await burstGuard("analyze", { request: reqWith(), context: { ip: "203.0.113.5" } });
check("burst without an account: only per-IP keys", seen.length === 2 && seen.every((s) => s.key.includes(":ip")), seen);

answer = (key) => (key.includes(":ip60:") ? { allowed: false, used: 21, resetAt: Date.now() + 30_000 } : { allowed: true, used: 1, resetAt: 0 });
r = await burstGuard("analyze", { request: reqWith(), context: { ip: "203.0.113.5" }, userId: "u-1" });
check("burst over the IP limit: 429 rate_limited with a retry time", r?.status === 429 && r.body.code === "rate_limited" && /connection/.test(r.body.error) && r.retryAfterSeconds >= 1 && r.retryAfterSeconds <= 30, r);
check("burst over the limit: logged without the address", logged.some((l) => l.includes("cn_rate_limited") && l.includes('"scope":"ip"')) && !logged.some((l) => l.includes("203.0.113")));
answer = (key) => (key.includes(":u60:") ? { allowed: false, used: 9, resetAt: 0 } : { allowed: true, used: 1, resetAt: 0 });
r = await burstGuard("analyze", { request: reqWith(), context: { ip: "203.0.113.5" }, userId: "u-1" });
check("burst over the account limit: 429 with the account wording", r?.status === 429 && /short time/.test(r.body.error) && r.retryAfterSeconds === 60, r);

answer = () => null;
check("burst: quota service unavailable = fail open", (await burstGuard("analyze", { request: reqWith(), context: {}, userId: "u-1" })) === null);
answer = () => { throw new Error("boom"); };
check("burst: quota call throwing = fail open", (await burstGuard("analyze", { request: reqWith(), context: {}, userId: "u-1" })) === null);
answer = () => ({ allowed: false, used: 99, resetAt: 0 });
check("burst: unknown function name = no limit", (await burstGuard("nope", { request: reqWith(), context: {}, userId: "u-1" })) === null);
ENV.RATE_LIMITS = "off";
seen = [];
check("burst: RATE_LIMITS=off = no limit and no quota call", (await burstGuard("analyze", { request: reqWith(), context: {}, userId: "u-1" })) === null && seen.length === 0);
delete ENV.RATE_LIMITS;

// ── the AI ceiling ──
seen = [];
answer = () => ({ allowed: true, used: 5, resetAt: 0 });
check("ceiling: under it = true", (await allowAiCall("analyze")) === true);
check("ceiling: one shared key, 24 h window, default 2000", seen.length === 1 && seen[0].key === AI_CEILING_KEY && seen[0].window === 86400 && seen[0].max === 2000, seen);
ENV.AI_DAILY_CALL_CEILING = "99999";
seen = [];
await allowAiCall("analyze");
check("ceiling: a value over 10000 is clamped (the RPC would refuse it and the breaker would never trip)", seen[0]?.max === 10000, seen);
ENV.AI_DAILY_CALL_CEILING = "10";
logged.length = 0;
answer = () => ({ allowed: true, used: 8, resetAt: 0 });
check("ceiling: at 80% still allowed", (await allowAiCall("analyze")) === true);
await allowAiCall.lastReport;
check("ceiling: 80% warning logged for the owner", logged.some((l) => l.includes("80% used")), logged);
logged.length = 0;
answer = () => ({ allowed: false, used: 10, resetAt: Date.now() + 3600_000 });
check("ceiling: reached = false", (await allowAiCall("recovery-plan")) === false);
const report = await allowAiCall.lastReport;
check("ceiling: tripped is logged (cn_ai_ceiling) and reported once with a fixed message", logged.some((l) => l.includes("cn_ai_ceiling") && l.includes("recovery-plan")) && /AI call ceiling reached \(10 calls in 24 hours\)/.test(report?.record?.message || ""), { logged, report: report?.record?.message });
answer = () => null;
check("ceiling: quota service unavailable = fail open", (await allowAiCall("analyze")) === true);
answer = () => { throw new Error("boom"); };
check("ceiling: quota call throwing = fail open", (await allowAiCall("analyze")) === true);
ENV.AI_DAILY_CALL_CEILING = "off";
seen = [];
answer = () => ({ allowed: false, used: 1, resetAt: 0 });
check("ceiling: off = always true, nothing counted", (await allowAiCall("analyze")) === true && seen.length === 0);
delete ENV.AI_DAILY_CALL_CEILING;

// ── capped body reads ──
const stream = (bytes, chunk = 64 * 1024) => new ReadableStream({
  start(c) { let left = bytes; while (left > 0) { const n = Math.min(chunk, left); c.enqueue(new Uint8Array(n).fill(120)); left -= n; } c.close(); }
});
const post = (body, headers = {}) => new Request("https://cybernetai.app/api/x", { method: "POST", headers, body, duplex: "half" });
r = await readBodyText(post("{}", { "content-length": "999999" }), 1000);
check("body: declared length over the cap = 413 without reading", r.ok === false && r.status === 413);
r = await readBodyText(post(stream(5000)), 1000);
check("body: streamed past the cap with no length = 413", r.ok === false && r.status === 413);
r = await readBodyText(post(stream(1000)), 1000);
check("body: exactly the cap = read", r.ok === true && r.text.length === 1000);
r = await readJsonCapped(post(JSON.stringify({ a: "é" })), 1000);
check("body: JSON read back intact (UTF-8)", r.ok === true && r.body.a === "é", r);
r = await readJsonCapped(post("not json"), 1000);
check("body: bad JSON = 400", r.ok === false && r.status === 400);
r = await readJsonCapped(new Request("https://cybernetai.app/api/x", { method: "POST" }), 1000);
check("body: empty = 400 (as request.json() did)", r.ok === false && r.status === 400);

console.log(`rate limits: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
