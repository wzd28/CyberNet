// Regression tests for the November 2026 security audit, web, infrastructure and
// supply chain lane: the production-only guard on paid endpoints (INFRA-1), the
// netlify.app host redirect (INFRA-2), headers and CSP (WEB-1 / WEB-5 / INFRA-6),
// self-hosted jsQR (WEB-2 / INFRA-5 / SUP-2), the Netlify Forms fallback removal
// (INFRA-9), the invite token's lifetime and export (WEB-6), recovery class
// allow-lists (WEB-7), billing redirect hosts (WEB-8), dead v2 files (WEB-9) and
// the dev-dependency tree (SUP-1 / SUP-8). No network.
//
//   node tests/run-security-web.mjs
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
delete process.env.CN_ALLOW_PREVIEW_PAID;
let envOverride = {};
globalThis.Netlify = { env: { get: (name) => envOverride[name] } };

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `\n     ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  }
}

/* ---------- INFRA-1: paid endpoints answer only on production ---------- */
{
  const { productionOnly, deployContext } = await import(pathToFileURL(path.join(root, "netlify/lib/deploy-guard.mjs")).href);
  const inner = async () => new Response("ran", { status: 200 });
  const guarded = productionOnly(inner);
  const req = new Request("https://cybernetai.app/api/analyze", { method: "POST" });
  const run = async (context) => { const r = await guarded(req, context); return [r.status, await r.text()]; };

  for (const [label, context] of [["no context (tests)", undefined], ["empty context", {}], ["no deploy field", { ip: "1.2.3.4" }], ["production", { deploy: { context: "production" } }], ["netlify dev", { deploy: { context: "dev" } }], ["odd value", { deploy: { context: 42 } }]]) {
    const [status, body] = await run(context);
    check(`guard: ${label} goes through`, status === 200 && body === "ran", [status, body]);
  }
  for (const value of ["deploy-preview", "branch-deploy"]) {
    const [status, body] = await run({ deploy: { context: value } });
    check(`guard: ${value} answers 404 without running the handler`, status === 404 && body.includes("Not found") && !body.includes("ran"), [status, body]);
  }
  envOverride = { CN_ALLOW_PREVIEW_PAID: "1" };
  check("guard: CN_ALLOW_PREVIEW_PAID=1 lets a preview through", (await run({ deploy: { context: "deploy-preview" } }))[0] === 200);
  envOverride = { CN_ALLOW_PREVIEW_PAID: "true" };
  check("guard: only the exact value 1 opens it", (await run({ deploy: { context: "branch-deploy" } }))[0] === 404);
  envOverride = {};
  check("guard: deployContext never throws on a hostile object", deployContext({ get deploy() { throw new Error("x"); } }) === "");

  const paid = ["analyze.mts", "byok-analyze.mts", "screenshot-preview.mjs", "recovery-mode.mts", "recovery-update.mts", "recovery-plan-background.mts", "validate-openai-key.mts", "create-checkout-session.mjs", "customer-portal.mjs"];
  for (const f of paid) {
    const s = read(`netlify/functions/${f}`);
    check(`guard: ${f} imports the guard`, /import \{ productionOnly \} from "\.\.\/lib\/deploy-guard\.mjs";/.test(s));
    check(`guard: ${f} default export is wrapped`, /export default productionOnly\(/.test(s) && (s.match(/^export default /gm) || []).length === 1);
  }
  // The guarded default export still runs for the tests' context-less calls.
  const background = (await import(pathToFileURL(path.join(root, "netlify/functions/recovery-plan-background.mts")).href)).default;
  const preview = await background(new Request("https://x--cybernet-ai.netlify.app/api/recovery-plan-background", { method: "POST", body: "{}" }), { deploy: { context: "deploy-preview" } });
  check("guard: background job refuses a preview before reading anything", preview.status === 404);
}

/* ---------- netlify.toml: INFRA-2 redirects, WEB-1/5 and INFRA-6 headers ---------- */
const toml = read("netlify.toml");
{
  const rules = [...toml.matchAll(/\[\[redirects\]\]\s+from = "([^"]+)"\s+to = "([^"]+)"\s+status = (\d+)(\s+force = true)?/g)].map(m => ({ from: m[1], to: m[2], status: Number(m[3]), force: Boolean(m[4]) }));
  const at = (from) => rules.findIndex(r => r.from === from);
  for (const host of ["cybernet-ai.netlify.app", "main--cybernet-ai.netlify.app"]) {
    const page = rules[at(`https://${host}/*`)];
    check(`redirect: ${host} pages go to the real domain (301, forced)`, page && page.to === "https://cybernetai.app/:splat" && page.status === 301 && page.force, page);
    const api = at(`https://${host}/api/*`);
    check(`redirect: ${host} API keeps answering (rewrite listed before the page rule)`, api >= 0 && api < at(`https://${host}/*`) && rules[api].status === 200 && rules[api].to === "/.netlify/functions/:splat");
    check(`redirect: ${host} rules come before the generic /api/* rule`, at(`https://${host}/*`) < at("/api/*"));
  }
  check("redirect: no rule catches deploy previews", !rules.some(r => /\*--|--\*|:\w+--/.test(r.from)));

  const header = (name) => (new RegExp(`^\\s*${name} = "([^"]*)"`, "m").exec(toml) || [])[1] || "";
  const csp = header("Content-Security-Policy");
  const scriptSrc = (/script-src ([^;]+)/.exec(csp) || [])[1] || "";
  const sources = scriptSrc.trim().split(/\s+/);
  check("csp: jsDelivr is not allowed as a whole host", !sources.includes("https://cdn.jsdelivr.net") && !sources.includes("https://cdn.jsdelivr.net/"), scriptSrc);
  check("csp: still self, Cloudflare Insights and GTM", sources.includes("'self'") && sources.includes("https://static.cloudflareinsights.com") && sources.includes("https://www.googletagmanager.com"));
  // Every jsDelivr script the site loads is listed exactly (a version bump must update the CSP too).
  const files = ["public/index.html", "public/app/reset.html", "public/privacy.html", "public/terms.html", "public/support.html", "public/refunds.html", "public/acceptable-use.html", "public/404.html", "public/black-friday-scam-checklist.html", "public/scam-text-checker.html", "public/parcel-delivery-scam-text.html", "public/toll-fine-scam-text.html", "public/qr-code-scam.html", "public/is-this-link-safe.html", "ui-src/js/10-hero3d.js", "public/ui/cybernet-ui.js", "public/script.js", "public/legacy/script.js"].filter(f => existsSync(path.join(root, f)));
  const used = new Set();
  for (const f of files) for (const m of read(f).matchAll(/https:\/\/cdn\.jsdelivr\.net\/(?:npm|gh)\/[^"'\s)`]+/g)) used.add(m[0]);
  check("csp: the site loads exactly the two expected jsDelivr files", used.size === 2, [...used]);
  for (const url of used) check(`csp: lists ${url}`, sources.includes(url), scriptSrc);
  for (const s of sources.filter(s => s.startsWith("https://cdn.jsdelivr.net"))) check(`csp: ${s} is a file the site really loads`, used.has(s));
  check("csp: the comment no longer claims jsdelivr serves jsQR", !/jsdelivr serves jsQR/.test(toml));
  check("csp: frame-ancestors / object-src / base-uri kept", /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp));

  check("headers: COOP same-origin-allow-popups", header("Cross-Origin-Opener-Policy") === "same-origin-allow-popups");
  const pp = header("Permissions-Policy");
  for (const f of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()", "serial=()", "bluetooth=()", "browsing-topics=()"]) check(`headers: Permissions-Policy ${f}`, pp.split(/,\s*/).includes(f), pp);
  check("headers: no site-wide CORP (email images)", !/^\s*Cross-Origin-Resource-Policy =/m.test(toml));
  check("headers: X-Frame-Options and nosniff kept", header("X-Frame-Options") === "DENY" && header("X-Content-Type-Options") === "nosniff");
}

/* ---------- jsQR self-hosted (WEB-2 / INFRA-5 / SUP-2) ---------- */
{
  const JSQR_SHA384 = "b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx";
  const file = path.join(root, "public/ui/vendor/jsQR-1.4.0.js");
  check("jsqr: vendored file exists", existsSync(file));
  if (existsSync(file)) check("jsqr: vendored file is byte-identical to jsqr@1.4.0", createHash("sha384").update(readFileSync(file)).digest("base64") === JSQR_SHA384);
  for (const f of ["public/script.js", "public/legacy/script.js"]) {
    const s = read(f);
    check(`jsqr: ${f} no longer loads it from jsDelivr`, !/jsdelivr\.net\/npm\/jsqr/i.test(s));
    check(`jsqr: ${f} web branch uses the vendored file`, /\/\*@web\*\/"\/ui\/vendor\/jsQR-1\.4\.0\.js"\/\*@end-web\*\//.test(s) || /"\/ui\/vendor\/jsQR-1\.4\.0\.js"/.test(s));
  }
  check("jsqr: the iOS branch is unchanged", /\/\*@ios "vendor\/jsQR\.js" @end-ios\*\//.test(read("public/script.js")));
  check("jsqr: NOTICE lists it", /jsQR-1\.4\.0\.js[\s\S]*Apache/.test(read("public/ui/vendor/NOTICE.txt")));
}

/* ---------- INFRA-9: no Netlify Forms fallback ---------- */
{
  const html = read("public/index.html");
  const form = (/<form id="feedbackForm"[^>]*>/.exec(html) || [""])[0];
  check("forms: feedback form is not a Netlify form", form && !/data-netlify|netlify-honeypot/.test(form), form);
  check("forms: no page declares a Netlify form", !/data-netlify=/.test(html));
  check("forms: the honeypot input the API reads is kept", /name="bot-field"/.test(html));
  for (const f of ["public/script.js", "public/legacy/script.js"]) {
    const s = read(f);
    check(`forms: ${f} has no POST to / fallback`, !/fetch\(\s*["']\/["']\s*,/.test(s));
  }
  check("forms: a failed /api/feedback still shows the email-support message", /if\(!saved\)throw new Error\("Feedback endpoint unavailable"\);/.test(read("public/script.js")) && /could not be sent\. Email \$\{SUPPORT_EMAIL\} directly/.test(read("public/script.js")));
}

/* ---------- WEB-6: invite token lifetime and data export ---------- */
{
  const team = read("public/cybernet-business-team.js");
  check("invite: saved token kept 24 hours at most", /const PENDING_INVITE_MAX_AGE = 24 \* 60 \* 60 \* 1000;/.test(team));
  check("invite: forgotten after a successful accept", /forgetInvite\(\);\s*setInviteMessage\("You're on the team/.test(team));
  const privacy = read("public/cybernet-privacy-controls.js");
  const rx = /if \(!\/\^cybernet\/i\.test\(key\) \|\| \/(\([^)]*\))\/i\.test\(key\)\) return;/.exec(privacy);
  check("export: exclusion regex found", Boolean(rx));
  if (rx) {
    const excluded = new RegExp(rx[1], "i");
    check("export: the pending invite is left out", excluded.test("cybernet_pending_invite"));
    check("export: API keys and tokens still left out", ["cybernet_api_key", "cybernet_token", "cybernet_secret_x"].every(k => excluded.test(k)));
    check("export: ordinary settings still exported", !excluded.test("cybernet_history") && !excluded.test("cybernet_theme"));
  }
}

/* ---------- WEB-7 and WEB-8: small client allow-lists ---------- */
{
  const s = read("public/script.js");
  const fn = (name) => (new RegExp(`function ${name}\\([^)]*\\)\\{return \`[^\`]*\`\\}`).exec(s) || [""])[0];
  const ctx = vm.createContext({});
  vm.runInContext(`${fn("riskClass")}\n${fn("priorityClass")}\nthis.riskClass=riskClass;this.priorityClass=priorityClass;`, ctx);
  check("recovery: known priorities kept", ["critical", "high", "normal"].every(p => ctx.priorityClass(p) === `recovery-priority-${p}`));
  check("recovery: unknown or hostile priority falls back", ctx.priorityClass(`"><img src=x onerror=alert(1)>`) === "recovery-priority-normal" && ctx.priorityClass(undefined) === "recovery-priority-normal");
  check("recovery: known risks kept", ["low", "medium", "high", "critical"].every(p => ctx.riskClass(p) === `recovery-risk-${p}`));
  check("recovery: unknown or hostile risk falls back", ctx.riskClass(`x" onmouseover="alert(1)`) === "recovery-risk-medium" && ctx.riskClass("") === "recovery-risk-medium");

  const start = s.indexOf("  function isBillingUrl(value){");
  const end = s.indexOf("  window.cnIsBillingUrl=isBillingUrl;", start);
  check("billing: helper found", start > 0 && end > start);
  const bctx = vm.createContext({ URL, window: { location: { origin: "https://cybernetai.app" } } });
  vm.runInContext(`${s.slice(start, end)}\nthis.isBillingUrl=isBillingUrl;`, bctx);
  const ok = ["https://checkout.stripe.com/c/pay/cs_test_a1#fid", "https://billing.stripe.com/p/session/test_x", "https://cybernetai.app/?checkout=success", "/pricing", "https://pay.cybernetai.app/c/pay/cs_x"];
  const bad = ["javascript:alert(1)", "http://checkout.stripe.com/x", "https://evil.example/stripe.com", "https://checkout.stripe.com.evil.example/", "https://evilcybernetai.app/", "data:text/html,hi", "", null, "//evil.example/x"];
  for (const u of ok) check(`billing: allows ${u}`, bctx.isBillingUrl(u) === true);
  for (const u of bad) check(`billing: refuses ${u}`, bctx.isBillingUrl(u) === false);
  check("billing: checkout uses it", /if\(!data\.url\|\|!isBillingUrl\(data\.url\)\)throw/.test(s));
  check("billing: portal (script.js) uses it", /if\(!isBillingUrl\(data\.url\)\)throw new Error\("Billing portal unavailable\."\);\s*window\.location\.assign\(data\.url\);/.test(s));
  check("billing: account panel portal uses it", /window\.cnIsBillingUrl\(data\.url\)/.test(read("public/cybernet-account-api-upgrade.js")));
  check("billing: helper sits inside the web-only block (no Stripe text in the iOS build)", s.lastIndexOf("/*@web*/", start) > s.lastIndexOf("/*@end-web*/", start));
}

/* ---------- WEB-9 / SUP-1 / SUP-8: repository hygiene ---------- */
{
  for (const f of ["public/v2", "public/favicon-code.txt", "scripts/build-v2.mjs", "v2-src", "deno.lock"]) check(`removed: ${f}`, !existsSync(path.join(root, f)));
  const pkg = JSON.parse(read("package.json"));
  check("deps: netlify-cli is not a dependency", !pkg.devDependencies?.["netlify-cli"] && !pkg.dependencies?.["netlify-cli"]);
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(all)) check(`deps: ${name} is pinned exactly`, /^\d+\.\d+\.\d+$/.test(version), version);
  check("deps: dev/deploy scripts use a pinned netlify-cli", /netlify-cli@\d+\.\d+\.\d+ dev/.test(pkg.scripts.dev) && /netlify-cli@\d+\.\d+\.\d+ deploy/.test(pkg.scripts.deploy));
  const lock = JSON.parse(read("package-lock.json"));
  check("deps: lockfile has no netlify-cli tree", !Object.keys(lock.packages).some(k => /node_modules\/netlify-cli$/.test(k)) && Object.keys(lock.packages).length < 100, Object.keys(lock.packages).length);
  const ignore = read(".gitignore");
  check("gitignore: every .env file except the example", /^\.env$/m.test(ignore) && /^\.env\.\*$/m.test(ignore) && /^!\.env\.example$/m.test(ignore));
}

console.log(`security web: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
