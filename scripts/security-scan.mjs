#!/usr/bin/env node
// Read-only security scan (Nov 2026 hardening; run weekly). Not part of `npm test`.
//
//   npm run security:scan              all checks (offline + about 12 live GET/OPTIONS requests)
//   npm run security:scan -- --offline only npm audit and the secret scan
//   npm run security:scan -- --json    machine-readable result on the last line
//
// It never writes anything, never sends credentials, and never prints a secret value:
// a secret hit is reported as file:line plus the pattern name only.
// Exit code: 0 when nothing FAILs (WARNs are allowed), 1 otherwise.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://cybernetai.app";
const DOMAIN = "cybernetai.app";
const args = new Set(process.argv.slice(2));
const OFFLINE = args.has("--offline");
const JSON_OUT = args.has("--json");

const results = [];
const record = (area, status, message) => results.push({ area, status, message });
const pass = (a, m) => record(a, "PASS", m);
const warn = (a, m) => record(a, "WARN", m);
const fail = (a, m) => record(a, "FAIL", m);

// ---------------------------------------------------------------- npm audit
function npmAudit(label, extra = []) {
  // One fixed command string (no user input), so the shell is only used to find npm on Windows.
  const run = spawnSync(["npm", "audit", "--json", ...extra].join(" "), {
    cwd: ROOT, encoding: "utf8", shell: true, timeout: 120_000,
  });
  let data;
  try { data = JSON.parse(run.stdout || "{}"); } catch { data = null; }
  const v = data?.metadata?.vulnerabilities;
  if (!v) { warn("npm audit", `${label}: could not read npm audit output (offline registry?)`); return; }
  const text = `critical ${v.critical || 0}, high ${v.high || 0}, moderate ${v.moderate || 0}, low ${v.low || 0}`;
  if ((v.critical || 0) + (v.high || 0) > 0) fail("npm audit", `${label}: ${text}`);
  else if ((v.moderate || 0) + (v.low || 0) > 0) warn("npm audit", `${label}: ${text}`);
  else pass("npm audit", `${label}: 0 known vulnerabilities`);
}

// ------------------------------------------------------------ secret scan
const SECRET_PATTERNS = [
  ["OpenAI key", /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/],
  ["Stripe live secret/restricted key", /\b[sr]k_live_[A-Za-z0-9]{20,}/],
  ["Stripe test secret key", /\bsk_test_[A-Za-z0-9]{20,}/],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{20,}/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ["Resend API key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["GitHub token", /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|icns|pdf|mp4|mov|webm|woff2?|ttf|otf|zip|gz|cnbk|p8|car)$/i;
// Test fixtures and examples may hold fake keys: reported as WARN, not FAIL.
const SOFT_PATH = /(^|\/)(tests?|fixtures?)\/|\.example$|(^|\/)docs\//;

function jwtRole(payloadPart) {
  try { return JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")).role || ""; } catch { return ""; }
}

function secretScan() {
  let files;
  try {
    files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
  } catch { warn("secrets", "git ls-files failed; secret scan skipped"); return; }
  const tracked = new Set(files);
  for (const f of [".env", ".env.local", ".env.production"]) {
    if (tracked.has(f)) fail("secrets", `${f} is tracked by git (it must be ignored)`);
  }
  let hard = 0, soft = 0, scanned = 0;
  for (const rel of files) {
    if (SKIP_EXT.test(rel) || rel === "scripts/security-scan.mjs") continue;
    let text;
    try { text = readFileSync(path.join(ROOT, rel), "utf8"); } catch { continue; }
    if (text.length > 3_000_000 || text.includes("\u0000")) continue;
    scanned++;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const hits = [];
      for (const [name, re] of SECRET_PATTERNS) if (re.test(line)) hits.push(name);
      for (const m of line.matchAll(JWT)) if (jwtRole(m[1]) === "service_role") hits.push("Supabase service_role JWT");
      for (const name of hits) {
        const where = `${rel}:${i + 1} (${name})`; // never the value
        if (SOFT_PATH.test(rel)) { soft++; warn("secrets", `possible fixture key at ${where}; confirm it is fake`); }
        else { hard++; fail("secrets", `possible real secret at ${where}; rotate it, then remove it`); }
      }
    });
  }
  if (!hard && !soft) pass("secrets", `no secret patterns in ${scanned} tracked text files`);
}

// ---------------------------------------------------------------- online
async function get(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    return await fetch(url, { redirect: "manual", ...init, signal: ctrl.signal, headers: { "user-agent": "security-scan/1.0", ...(init.headers || {}) } });
  } finally { clearTimeout(t); }
}

// allow404: /app/ has no index page (the app pages are /app/reset.html and /app/confirmed.html),
// so its 404 page is still checked for headers, because error pages need them too.
async function headerCheck(url, { allow404 = false } = {}) {
  const area = `headers ${new URL(url).pathname}`;
  let res;
  try { res = await get(url); } catch (e) { fail(area, `request failed: ${e.name}`); return; }
  if (res.status === 404 && allow404) warn(area, "404 (no index page here); checking the headers of the 404 answer");
  else if (res.status >= 400) { fail(area, `status ${res.status}`); return; }
  const h = (n) => res.headers.get(n) || "";
  const hsts = h("strict-transport-security");
  const maxAge = Number((/max-age=(\d+)/i.exec(hsts) || [])[1] || 0);
  if (!hsts) fail(area, "Strict-Transport-Security missing");
  else if (maxAge < 15552000) warn(area, `HSTS max-age ${maxAge} is under 180 days`);
  else pass(area, `HSTS max-age ${maxAge}${/includesubdomains/i.test(hsts) ? " +includeSubDomains" : " (no includeSubDomains: owner step, WEB-5)"}`);

  const csp = h("content-security-policy");
  if (!csp) fail(area, "Content-Security-Policy missing");
  else {
    const scriptSrc = (/script-src([^;]*)/i.exec(csp) || [])[1] || "";
    if (/frame-ancestors\s+'none'|frame-ancestors\s+'self'/i.test(csp) || /deny|sameorigin/i.test(h("x-frame-options"))) pass(area, "framing blocked");
    else fail(area, "no frame-ancestors / X-Frame-Options");
    if (/\bhttps:\/\/cdn\.jsdelivr\.net(\s|;|$)/.test(scriptSrc)) warn(area, "script-src allows the whole cdn.jsdelivr.net host (WEB-1)");
    if (/'unsafe-inline'/.test(scriptSrc)) warn(area, "script-src still has 'unsafe-inline' (known, WEB-1)");
    if (/object-src\s+'none'/.test(csp)) pass(area, "object-src 'none'"); else warn(area, "object-src 'none' missing");
  }
  if (/nosniff/i.test(h("x-content-type-options"))) pass(area, "X-Content-Type-Options nosniff"); else fail(area, "X-Content-Type-Options nosniff missing");
  if (h("referrer-policy")) pass(area, `Referrer-Policy ${h("referrer-policy")}`); else warn(area, "Referrer-Policy missing");
  if (h("permissions-policy")) pass(area, "Permissions-Policy present"); else warn(area, "Permissions-Policy missing");
  if (h("cross-origin-opener-policy")) pass(area, `COOP ${h("cross-origin-opener-policy")}`); else warn(area, "Cross-Origin-Opener-Policy missing (added on the hardening branch; WARN until deployed)");
  if (/\d/.test(h("x-powered-by"))) warn(area, "X-Powered-By reveals a version");
}

async function corsCheck() {
  const area = "CORS /api/account-status";
  const url = `${SITE}/api/account-status`;
  const evil = "https://evil.example";
  try {
    const pre = await get(url, { method: "OPTIONS", headers: { origin: evil, "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    const acao = pre.headers.get("access-control-allow-origin") || "";
    if (acao === evil || acao === "*") fail(area, `preflight allows an untrusted origin (${acao})`);
    else pass(area, `preflight from an evil origin not allowed (status ${pre.status})`);

    const res = await get(url, { headers: { origin: evil } });
    const acao2 = res.headers.get("access-control-allow-origin") || "";
    if (acao2 === evil || (acao2 === "*" && /true/i.test(res.headers.get("access-control-allow-credentials") || ""))) fail(area, `GET reflects an untrusted origin (${acao2})`);
    else pass(area, `GET from an evil origin not reflected (status ${res.status})`);
    if (res.status !== 401 && res.status !== 403) warn(area, `signed-out GET answered ${res.status}, expected 401`);

    // The iPhone app must keep working (rule 7).
    const app = await get(url, { method: "OPTIONS", headers: { origin: "capacitor://localhost", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    const acao3 = app.headers.get("access-control-allow-origin") || "";
    if (acao3 === "capacitor://localhost") pass(area, "iPhone app origin still allowed");
    else fail(area, `iPhone app origin capacitor://localhost NOT allowed (got "${acao3}", status ${app.status}); the app would break`);
  } catch (e) { fail(area, `request failed: ${e.name}`); }
}

async function dns(name, type) {
  const res = await get(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}&do=1`, { headers: { accept: "application/dns-json" } });
  return res.json();
}
const txt = (d) => (d.Answer || []).filter((a) => a.type === 16).map((a) => a.data.replace(/^"|"$/g, "").replace(/"\s*"/g, ""));

async function dnsCheck() {
  const area = "DNS / email";
  try {
    const root = await dns(DOMAIN, "TXT");
    const spf = txt(root).filter((t) => /^v=spf1/i.test(t));
    if (spf.length !== 1) fail(area, `expected exactly one SPF record, found ${spf.length}`);
    else if (/[-~]all\b/.test(spf[0])) (/-all\b/.test(spf[0]) ? pass : warn)(area, `SPF ends with ${(/[-~?+]all/.exec(spf[0]) || [""])[0]}${/~all/.test(spf[0]) ? " (soft fail; -all after DMARC reports are clean, INFRA-4)" : ""}`);
    else fail(area, "SPF has no ~all/-all");
    if (root.AD) pass(area, "DNSSEC validated"); else warn(area, "DNSSEC not validated (owner step, INFRA-7)");

    const dm = txt(await dns(`_dmarc.${DOMAIN}`, "TXT")).find((t) => /^v=DMARC1/i.test(t));
    if (!dm) fail(area, "no DMARC record");
    else {
      const p = ((/;\s*p=(\w+)/i.exec(dm) || [])[1] || "").toLowerCase();
      if (p === "reject" || p === "quarantine") pass(area, `DMARC p=${p}`);
      else warn(area, `DMARC p=${p || "?"}: mail can be spoofed (owner step, INFRA-4)`);
      if (!/rua=/i.test(dm)) warn(area, "DMARC has no rua= reporting address");
    }
    const caa = (await dns(DOMAIN, "CAA")).Answer || [];
    if (caa.some((a) => a.type === 257)) pass(area, "CAA record present"); else warn(area, "no CAA record (owner step, INFRA-7)");
  } catch (e) { fail(area, `DNS lookup failed: ${e.name}`); }
}

// ------------------------------------------------------------------ main
npmAudit("all packages");
npmAudit("production only", ["--omit=dev"]);
secretScan();
if (!OFFLINE) {
  await headerCheck(`${SITE}/`);
  await headerCheck(`${SITE}/app/`, { allow404: true });
  await headerCheck(`${SITE}/app/reset.html`);
  await corsCheck();
  await dnsCheck();
}

const counts = { PASS: 0, WARN: 0, FAIL: 0 };
for (const r of results) {
  counts[r.status]++;
  if (!JSON_OUT) console.log(`${r.status.padEnd(4)}  [${r.area}] ${r.message}`);
}
const summary = `\nSecurity scan: ${counts.FAIL} FAIL, ${counts.WARN} WARN, ${counts.PASS} PASS${OFFLINE ? " (offline)" : ""}`;
if (JSON_OUT) console.log(JSON.stringify({ counts, results }));
else console.log(summary);
process.exitCode = counts.FAIL ? 1 : 0;
