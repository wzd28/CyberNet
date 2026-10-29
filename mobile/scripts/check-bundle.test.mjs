// Tests for the iOS bundle gate and the build's region processing (BUILD-PLAN §11.2).
//
//   node mobile/scripts/check-bundle.test.mjs
//
// A small clean bundle must pass the gate; each planted problem must fail it on its own. The build-region
// parser must refuse every malformed marker, and the CSS pruning must keep everything it should keep.
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { checkBundle, wordHits } from "./check-bundle.mjs";
import { applyRegions, pruneCss, applyTextOverrides } from "./build-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++;
  else { fail++; console.log(`FAIL ${name}${detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}`}`); }
}

const CLEAN = {
  "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>CyberNet AI</title><link rel="stylesheet" href="style.css"><script src="ios/cn-ios-boot.js"></script></head>
<body><main id="cnMain"><section id="cybernet" class="page active-page"><h1>Quick Scan</h1><p>It is not antivirus software, and no scanner can promise something is 100% safe.</p>
<button data-page="cybernet">Check</button><a href="mailto:support@cybernetai.app">support@cybernetai.app</a></section></main>
<script src="script.js" defer></script><script src="ios/cn-analytics.js" defer></script></body></html>`,
  "style.css": `.a{color:red}.b::before{content:"Check"}`,
  "script.js": `const API="https://cybernetai.app/api/x";const n="Start the analysis";fetch("/api/feedback");const ex="for example https://example.com/page";`,
  "ios/cn-ios-boot.js": `window.CN_PLATFORM="ios";window.CN_API_BASE="https://cybernetai.app";`,
  "ios/cn-analytics.js": `var SRC="https://www.googletagmanager.com/gtag/js?id=G-X";function gtag(){}`,
  "legal/privacy.html": `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Privacy</title></head><body><main><p>Stripe processes payments on the website. Google Analytics only with permission.</p><a href="#iphone-app">The iPhone app</a> <a href="terms.html">Terms</a> <a href="mailto:support@cybernetai.app">Email</a></main></body></html>`,
  "legal/terms.html": `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Terms</title></head><body><main><p>The iPhone app has no paid plans and no purchases.</p></main></body></html>`
};

async function bundle(changes = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cn-gate-test-"));
  const files = { ...CLEAN, ...changes };
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue;
    const file = path.join(dir, ...rel.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return dir;
}
const NO_EXEMPTIONS = path.join(os.tmpdir(), "cn-gate-no-exemptions.json");
await writeFile(NO_EXEMPTIONS, "[]");
async function gate(changes, opts = {}) {
  const dir = await bundle(changes);
  try { return await checkBundle({ dir, exemptionsFile: opts.exemptionsFile || NO_EXEMPTIONS, debug: !!opts.debug }); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
const has = (result, rule, term) => result.hits.some(h => h.rule === rule && (term === undefined || String(h.term).toLowerCase().includes(String(term).toLowerCase())));

/* ---------- the clean bundle passes ---------- */
{
  const r = await gate({});
  check("clean bundle passes", r.hits.length === 0, r.hits);
}

/* ---------- planted problems ---------- */
const PLANTED = [
  ["upgrade button (data-upgrade-now)", { "index.html": CLEAN["index.html"].replace("</section>", `<button class="report-download-btn" data-upgrade-now>Upgrade</button></section>`) }, "word", "data-upgrade-now"],
  ['switchPage("pricing") in a string', { "script.js": CLEAN["script.js"] + `const s='switchPage("pricing")';` }, "word", "pricing"],
  ["a Pro word", { "script.js": CLEAN["script.js"] + `const p="Analysis AI Pro";` }, "word", "Pro"],
  ["PRO badge in HTML", { "index.html": CLEAN["index.html"].replace("<h1>Quick Scan</h1>", "<h1>Quick Scan</h1><span>PRO</span>") }, "word", "Pro"],
  ["jsDelivr script tag", { "index.html": CLEAN["index.html"].replace("</head>", `<script src="https://cdn.jsdelivr.net/npm/x@1/x.js"></script></head>`) }, "remote-code"],
  ["CDN URL in JS", { "script.js": CLEAN["script.js"] + `s.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";` }, "remote-code"],
  ["unknown host in JS", { "script.js": CLEAN["script.js"] + `fetch("https://api.example-tracker.io/collect");` }, "remote-host"],
  ["Google tag outside the analytics file", { "script.js": CLEAN["script.js"] + `const g="https://www.googletagmanager.com/gtag/js";` }, "remote-code"],
  ["IPv4 literal", { "script.js": CLEAN["script.js"] + `const ip="http://10.0.0.1/";` }, "ip-literal"],
  ["file not on the allow-list", { "extra/tool.js": "1;" }, "allow-list"],
  ["web marker survived", { "script.js": CLEAN["script.js"] + `/*@web*/ var x=1; /*@end-web*/` }, "marker"],
  ["data-web-only survived", { "index.html": CLEAN["index.html"].replace("<h1>", "<h1 data-web-only>") }, "marker"],
  ['data-page="pricing" survived', { "index.html": CLEAN["index.html"].replace('data-page="cybernet"', 'data-page="pricing"') }, "marker"],
  ["web inspector on in a release bundle", { "script.js": CLEAN["script.js"] + `const c='{"webContentsDebuggingEnabled":true}';` }, "debug"],
  ["demo hook in a release bundle", { "script.js": CLEAN["script.js"] + `if(window.CN_DEMO_SCREEN){}` }, "debug"],
  ["forbidden identifier", { "script.js": CLEAN["script.js"] + `function startCheckout(){}` }, "identifier", "startCheckout"],
  ["Google sign-in call", { "script.js": CLEAN["script.js"] + `sb.auth.signInWithOAuth({provider:"google"});` }, "identifier", "signInWithOAuth"],
  ["Stripe in app copy", { "script.js": CLEAN["script.js"] + `const t="Opening secure Stripe Checkout";` }, "word", "stripe"],
  ["placeholder copy", { "index.html": CLEAN["index.html"].replace("<h1>Quick Scan</h1>", "<h1>Quick Scan</h1><p>Video coming soon.</p>") }, "word", "coming soon"],
  ["antivirus outside the allowed sentence", { "script.js": CLEAN["script.js"] + `const a="Run your antivirus now";` }, "word", "antivirus"],
  ["CSS content word", { "style.css": CLEAN["style.css"] + `.x::after{content:"Upgrade to Pro"}` }, "word", "upgrade"],
  ["remote CSS import", { "style.css": `@import url("https://fonts.googleapis.com/css2?family=X");` + CLEAN["style.css"] }, "remote-code"],
  ["legal page links out", { "legal/privacy.html": CLEAN["legal/privacy.html"].replace("</main>", `<a href="https://example.com/x">x</a></main>`) }, "legal-link"],
  ["legal page shows a price", { "legal/terms.html": CLEAN["legal/terms.html"].replace("</p>", " Pro costs $9.99 per month.</p>") }, "legal-word"],
  ["missing local file", { "index.html": CLEAN["index.html"].replace("</head>", `<link rel="stylesheet" href="nothere.css"></head>`) }, "missing-file"]
];
for (const [name, changes, rule, term] of PLANTED) {
  const r = await gate(changes);
  check(`planted: ${name}`, has(r, rule, term), r.hits.map(h => `${h.rule}:${h.term}`));
}

/* ---------- debug mode, analytics and exemptions ---------- */
{
  const r = await gate({ "ios/debug.js": `if(window.CN_DEMO_SCREEN){}` }, { debug: true });
  check("debug bundle may carry ios/debug.js", r.hits.length === 0, r.hits);
  const rel = await gate({ "ios/debug.js": `if(window.CN_DEMO_SCREEN){}` });
  check("release bundle refuses ios/debug.js", has(rel, "allow-list") && has(rel, "debug"), rel.hits.map(h => h.rule));
  const ga = await gate({});
  check("the analytics file may name its own script", !ga.hits.some(h => h.file === "ios/cn-analytics.js"), ga.hits);

  const ex = path.join(os.tmpdir(), "cn-gate-ex.json");
  await writeFile(ex, JSON.stringify([{ file: "script.js", literal: "ChromeOS", term: "chrome", reason: "a label" }]));
  const used = await gate({ "script.js": CLEAN["script.js"] + `const os="ChromeOS";` }, { exemptionsFile: ex });
  check("an exemption covers its exact literal", used.hits.length === 0, used.hits);
  const unused = await gate({}, { exemptionsFile: ex });
  check("an unused exemption fails", has(unused, "exemption"), unused.hits);
  await writeFile(ex, JSON.stringify([{ file: "script.js", literal: "Upgrade to Pro", term: "upgrade", reason: "no" }]));
  const forbidden = await gate({ "script.js": CLEAN["script.js"] + `const u="Upgrade to Pro";` }, { exemptionsFile: ex });
  check("a purchase term can never be exempted", has(forbidden, "exemption") && has(forbidden, "word", "upgrade"), forbidden.hits);
  await rm(ex, { force: true });
}

/* ---------- words ---------- */
{
  const r = await gate({ "script.js": CLEAN["script.js"] + `const s=profile.subscriptionStatus;` });
  check("an identifier such as subscriptionStatus is not a word hit", r.hits.length === 0, r.hits);
}
check("allowed sentence: not antivirus", wordHits("It is not antivirus software, and no scanner can promise something is 100% safe.").length === 0, wordHits("It is not antivirus software, and no scanner can promise something is 100% safe."));
check("capacitor origin is allowed", wordHits("capacitor://localhost").length === 0);
check("localhost with a port is not", wordHits("http://localhost:8888").includes("localhost:"));
check("Pro is case-sensitive", wordHits("protect your accounts").length === 0 && wordHits("Go Pro").includes("Pro"));

/* ---------- build regions ---------- */
{
  const ok = applyRegions(`a();/*@web*/b();/*@end-web*/c();/*@ios d(); @end-ios*/e();`);
  check("regions: web removed, ios unwrapped", ok.code === "a();c(); d(); e();" && ok.count.web === 1 && ok.count.ios === 1, ok);
  const throws = (src, re) => { try { applyRegions(src, "t"); return false; } catch (e) { return re.test(e.message); } };
  check("regions: unbalanced @web", throws(`/*@web*/ x();`, /never closed/));
  check("regions: stray @end-web", throws(`x();/*@end-web*/`, /without an open/));
  check("regions: nested", throws(`/*@web*/ /*@ios y(); @end-ios*/ /*@end-web*/`, /cannot nest/));
  check('regions: "*/" inside @ios', throws(`/*@ios a=/*x*/1; @end-ios*/`, /ends the comment early|without an open/));
  check("regions: stray @end-ios", throws(`x(); @end-ios*/`, /without an open/));
}

/* ---------- text overrides ---------- */
{
  check("override replaces", applyTextOverrides("say Stripe", "f", [{ find: "Stripe", replace: "our payment provider" }]) === "say our payment provider");
  let threw = false;
  try { applyTextOverrides("nothing", "f", [{ find: "Stripe", replace: "x", min: 1 }]); } catch { threw = true; }
  check("override that no longer matches fails", threw);
}

/* ---------- CSS pruning ---------- */
{
  const css = `a{color:red}html.cn #home .x{color:blue}#pricing .p,.keep{margin:0}@media (min-width:1px){#about h1{x:1}.y{z:2}}@keyframes k{0%{opacity:0}}.page:not(#home){display:block}.c::before{content:"}{"}`;
  const out = pruneCss(css);
  check("css: plain rule kept", out.includes("a{color:red}"), out);
  check("css: #home rule dropped", !out.includes("#home .x"), out);
  check("css: selector list keeps the rest", out.includes(".keep{margin:0}") && !out.includes("#pricing"), out);
  check("css: media keeps its other rules", out.includes("@media (min-width:1px){.y{z:2}}") && !out.includes("#about"), out);
  check("css: keyframes untouched", out.includes("@keyframes k{0%{opacity:0}}"), out);
  check("css: :not() untouched", out.includes(".page:not(#home){display:block}"), out);
  check("css: braces in strings survive", out.includes('.c::before{content:"}{"}'), out);
}

console.log(`gate tests: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
void here;
