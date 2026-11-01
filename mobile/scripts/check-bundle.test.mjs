// Tests for the iOS bundle gate and the build's region processing (BUILD-PLAN §11.2).
//
//   node mobile/scripts/check-bundle.test.mjs
//
// A small clean bundle must pass the gate; each planted problem must fail it on its own. The build-region
// parser must refuse every malformed marker, and the CSS pruning must keep everything it should keep.
// Since 30 Oct 2026 the app sells Free, Pro and Business with Apple In-App Purchase: plan names and upgrade buttons are
// allowed, and the gate instead refuses a second way to pay, a price typed into the page, a protection claim, a plans page
// without the text Apple requires, and a plans page that links outside the app.
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { checkBundle, wordHits, checkMetadata } from "./check-bundle.mjs";
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
<button data-page="cybernet">Check</button><a href="mailto:support@cybernetai.app">support@cybernetai.app</a></section>
<section id="pricing" class="page"><h1>Choose the plan that fits you</h1><button class="primary-btn" data-store-buy="p">Upgrade to Pro</button><span data-store-price="p"></span>
<p>Payment is charged to your Apple ID at confirmation of purchase. Your subscription renews automatically unless you cancel it at least 24 hours before the end of the current period. Manage or cancel any time in Settings &gt; your name &gt; Subscriptions.</p>
<button data-open-legal="terms">Terms of Use</button> <button data-open-legal="privacy">Privacy Policy</button> <button>Restore Purchases</button> <button>Manage subscription</button>
<a href="mailto:support@cybernetai.app">Email support</a></section></main>
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
  ["jsDelivr script tag", { "index.html": CLEAN["index.html"].replace("</head>", `<script src="https://cdn.jsdelivr.net/npm/x@1/x.js"></script></head>`) }, "remote-code"],
  ["CDN URL in JS", { "script.js": CLEAN["script.js"] + `s.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";` }, "remote-code"],
  ["unknown host in JS", { "script.js": CLEAN["script.js"] + `fetch("https://api.example-tracker.io/collect");` }, "remote-host"],
  ["Google tag outside the analytics file", { "script.js": CLEAN["script.js"] + `const g="https://www.googletagmanager.com/gtag/js";` }, "remote-code"],
  ["IPv4 literal", { "script.js": CLEAN["script.js"] + `const ip="http://10.0.0.1/";` }, "ip-literal"],
  ["file not on the allow-list", { "extra/tool.js": "1;" }, "allow-list"],
  ["web marker survived", { "script.js": CLEAN["script.js"] + `/*@web*/ var x=1; /*@end-web*/` }, "marker"],
  ["data-web-only survived", { "index.html": CLEAN["index.html"].replace("<h1>", "<h1 data-web-only>") }, "marker"],
  ['data-page="about" survived', { "index.html": CLEAN["index.html"].replace('data-page="cybernet"', 'data-page="about"') }, "marker"],
  ["web inspector on in a release bundle", { "script.js": CLEAN["script.js"] + `const c='{"webContentsDebuggingEnabled":true}';` }, "debug"],
  ["demo hook in a release bundle", { "script.js": CLEAN["script.js"] + `if(window.CN_DEMO_SCREEN){}` }, "debug"],
  ["forbidden identifier", { "script.js": CLEAN["script.js"] + `function startCheckout(){}` }, "identifier", "startCheckout"],
  ["Google sign-in call", { "script.js": CLEAN["script.js"] + `sb.auth.signInWithOAuth({provider:"google"});` }, "identifier", "signInWithOAuth"],
  // Sign in with Google is allowed in ios/ios.js only (owner, 30 Oct 2026): everywhere else it is still refused
  ["Google word in another script", { "script.js": CLEAN["script.js"] + `const t="Sign in with Google";` }, "word", "google"],
  ["Google word in the page", { "index.html": CLEAN["index.html"].replace("<h1>Quick Scan</h1>", "<h1>Quick Scan</h1><button>Continue with Google</button>") }, "word", "google"],
  ["the website's Google button in ios.js", { "ios/ios.js": `const googleAuthBtn=document.getElementById("googleAuthBtn");` }, "identifier", "googleAuthBtn"],
  ["a Google address in ios.js", { "ios/ios.js": `fetch("https://accounts.google.com/o/oauth2/v2/auth");` }, "remote-host", "accounts.google.com"],
  ["a Stripe word next to Google in ios.js", { "ios/ios.js": `const t="Pay with Stripe and Google";` }, "word", "stripe"],
  ["Stripe in app copy", { "script.js": CLEAN["script.js"] + `const t="Opening secure Stripe Checkout";` }, "word", "stripe"],
  ["Checkout in a page", { "index.html": CLEAN["index.html"].replace("<h1>Quick Scan</h1>", "<h1>Quick Scan</h1><button>Checkout</button>") }, "word", "checkout"],
  ["the billing page of the website", { "script.js": CLEAN["script.js"] + `const t="Manage Billing";` }, "word", "manage billing"],
  ["a free trial offer", { "index.html": CLEAN["index.html"].replace("<h1>Quick Scan</h1>", "<h1>Quick Scan</h1><p>Start your free trial</p>") }, "word", "free trial"],
  // prices are Apple's text from StoreKit: a price typed into a page or a script is refused
  ["a hard-coded price in store.js", { "ios/store.js": `const price="$9.99 / month";` }, "word", "$9.99"],
  ["a hard-coded yearly price in the plans page", { "index.html": CLEAN["index.html"].replace("<h1>Choose the plan that fits you</h1>", "<h1>Choose the plan that fits you</h1><p>Billed once at 95.99.</p>") }, "word", "95.99"],
  ["a Business price in the page", { "index.html": CLEAN["index.html"].replace('<span data-store-price="p"></span>', '<span data-store-price="p">$160</span>') }, "word", "$160"],
  // protection claims (App Review 2.3.1)
  ["a protection claim: top-level protection", { "index.html": CLEAN["index.html"].replace("<h1>Quick Scan</h1>", "<h1>Quick Scan</h1><p>Top-level protection for you</p>") }, "word", "top-level protection"],
  ["a protection claim: the fits-you headline", { "script.js": CLEAN["script.js"] + `const h="Choose the protection that fits you";` }, "word", "protection that fits"],
  ["the word accurate", { "script.js": CLEAN["script.js"] + `const a="Accurate AI analysis";` }, "word", "accurate"],
  // the plans page carries what Apple requires, and links nowhere (3.1.1, 3.1.2)
  ["missing Restore Purchases", { "index.html": CLEAN["index.html"].replace("Restore Purchases", "Restore") }, "iap-required", "Restore Purchases"],
  ["missing Manage subscription", { "index.html": CLEAN["index.html"].replace("Manage subscription", "Manage it") }, "iap-required", "Manage subscription"],
  ["missing Terms of Use", { "index.html": CLEAN["index.html"].replace("Terms of Use", "Terms") }, "iap-required", "Terms of Use"],
  ["missing Privacy Policy", { "index.html": CLEAN["index.html"].replace("Privacy Policy", "Privacy") }, "iap-required", "Privacy Policy"],
  ["missing the renewal sentence", { "index.html": CLEAN["index.html"].replace("cancel it at least 24 hours before the end of the current period", "cancel it before the end") }, "iap-required", "24 hours"],
  ["an external link on the plans page", { "index.html": CLEAN["index.html"].replace("</section></main>", '<a href="https://example.com/pay">Pay on the website</a></section></main>') }, "iap-external-link"],
  ["an external link in store.js", { "ios/store.js": `const url="https://example.com/buy";` }, "iap-external-link"],
  ["placeholder copy", { "index.html": CLEAN["index.html"].replace("<h1>Quick Scan</h1>", "<h1>Quick Scan</h1><p>Video coming soon.</p>") }, "word", "coming soon"],
  ["antivirus outside the allowed sentence", { "script.js": CLEAN["script.js"] + `const a="Run your antivirus now";` }, "word", "antivirus"],
  ["CSS content word", { "style.css": CLEAN["style.css"] + `.x::after{content:"Pay with Stripe"}` }, "word", "stripe"],
  ["remote CSS import", { "style.css": `@import url("https://fonts.googleapis.com/css2?family=X");` + CLEAN["style.css"] }, "remote-code"],
  ["legal page links out", { "legal/privacy.html": CLEAN["legal/privacy.html"].replace("</main>", `<a href="https://example.com/x">x</a></main>`) }, "legal-link"],
  ["legal page shows a price", { "legal/terms.html": CLEAN["legal/terms.html"].replace("</p>", " Pro costs $9.99 per month.</p>") }, "legal-word"],
  ["legal page offers a checkout", { "legal/terms.html": CLEAN["legal/terms.html"].replace("</p>", " Pay at checkout.</p>") }, "legal-word", "checkout"],
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
  const store = await gate({ "ios/store.js": `const ids=["app.cybernetai.pro.monthly"];fetch("/api/apple-verify");const t="Restore Purchases";` });
  check("ios/store.js may call the purchase endpoint and name the products (no address, no price)", store.hits.length === 0, store.hits);
  const mail = await gate({ "index.html": CLEAN["index.html"].replace("</section></main>", '<a href="mailto:support@cybernetai.app">Questions about your plan?</a></section></main>') });
  check("the plans page may carry a mailto link (support)", mail.hits.length === 0, mail.hits);

  const ex = path.join(os.tmpdir(), "cn-gate-ex.json");
  await writeFile(ex, JSON.stringify([{ file: "script.js", literal: "ChromeOS", term: "chrome", reason: "a label" }]));
  const used = await gate({ "script.js": CLEAN["script.js"] + `const os="ChromeOS";` }, { exemptionsFile: ex });
  check("an exemption covers its exact literal", used.hits.length === 0, used.hits);
  const unused = await gate({}, { exemptionsFile: ex });
  check("an unused exemption fails", has(unused, "exemption"), unused.hits);
  await writeFile(ex, JSON.stringify([{ file: "script.js", literal: "Opening secure Stripe Checkout", term: "stripe", reason: "no" }]));
  const forbidden = await gate({ "script.js": CLEAN["script.js"] + `const u="Opening secure Stripe Checkout";` }, { exemptionsFile: ex });
  check("another way to pay can never be exempted", has(forbidden, "exemption") && has(forbidden, "word", "stripe"), forbidden.hits);
  await writeFile(ex, JSON.stringify([{ file: "ios/store.js", literal: "$9.99 / month", term: "$9.99", reason: "no" }]));
  const priced = await gate({ "ios/store.js": `const p="$9.99 / month";` }, { exemptionsFile: ex });
  check("a price literal can never be exempted", has(priced, "exemption") && has(priced, "word", "$9.99"), priced.hits);
  // a Google term still cannot be exempted: the one place for it is ios/ios.js, in the gate's own code
  await writeFile(ex, JSON.stringify([{ file: "script.js", literal: "Sign in with Google", term: "google", reason: "no" }]));
  const googleEx = await gate({ "script.js": CLEAN["script.js"] + `const t="Sign in with Google";` }, { exemptionsFile: ex });
  check("a Google term can never be exempted", has(googleEx, "exemption") && has(googleEx, "word", "google"), googleEx.hits);
  await rm(ex, { force: true });

  // Sign in with Google (owner, 30 Oct 2026): ios/ios.js, the app's own layer, may use the call and the words
  const signIn = await gate({ "ios/ios.js": `async function go(sb){const r=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:"app.cybernetai://auth-callback",skipBrowserRedirect:true}});return r}const label="Sign in with Google";const callback="app.cybernetai://auth-callback";` });
  check("ios/ios.js may carry Sign in with Google (the call, the provider name, the button words, the return address)", signIn.hits.length === 0, signIn.hits);
}

/* ---------- words ---------- */
{
  const r = await gate({ "script.js": CLEAN["script.js"] + `const s=profile.subscriptionStatus;` });
  check("an identifier such as subscriptionStatus is not a word hit", r.hits.length === 0, r.hits);
  const plans = await gate({ "script.js": CLEAN["script.js"] + `const t="Upgrade to Pro. Business plan: unlock the full timeline. Manage subscription. Pricing. Per month. Free plan. View Pro options.";const n=1;fetch("/api/public-stats");const b='<button data-upgrade-now>Upgrade</button>';` });
  check("plan names, upgrade buttons and the plans vocabulary are allowed (the app sells with In-App Purchase)", plans.hits.length === 0, plans.hits);
  const names = await gate({ "script.js": CLEAN["script.js"] + `const c="CyberNet AI Pro";const d="PRO";const e="Business";` });
  check("the words Pro, PRO and Business are allowed", names.hits.length === 0, names.hits);
}
check("allowed sentence: not antivirus", wordHits("It is not antivirus software, and no scanner can promise something is 100% safe.").length === 0, wordHits("It is not antivirus software, and no scanner can promise something is 100% safe."));
check("capacitor origin is allowed", wordHits("capacitor://localhost").length === 0);
check("localhost with a port is not", wordHits("http://localhost:8888").includes("localhost:"));
check("Pro is an ordinary word again; protect your accounts is fine", wordHits("protect your accounts").length === 0 && wordHits("Go Pro").length === 0 && wordHits("Upgrade to Pro").length === 0);
check("price literals are refused, in any form the plans could take", ["$9.99", "95.90", "95.99", "$7.99", "$40", "$80", "$160", "$384", "$768", "1,536"].every(p => wordHits(`Only ${p} a month`).includes(p)), wordHits("Only $40 a month"));
check("a price that is only text from StoreKit passes (no literal in the file)", wordHits("Billed once a year at the price from the store, about a twelfth of it each month.").length === 0);
check("Google words are allowed for ios/ios.js alone", wordHits("Sign in with Google", { file: "ios/ios.js" }).length === 0 && wordHits("signInWithOAuth", { file: "ios/ios.js" }).length === 0 && wordHits("Sign in with Google").includes("google") && wordHits("Sign in with Google", { file: "script.js" }).includes("google") && wordHits("Sign in with Google", { file: "ios/cn-ios-boot.js" }).includes("google") && wordHits("Stripe with Google", { file: "ios/ios.js" }).includes("stripe"));

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

/* ---------- App Store text (--metadata) ---------- */
{
  const dir = await mkdtemp(path.join(os.tmpdir(), "cn-meta-test-"));
  const md = async body => { const file = path.join(dir, "m.md"); await writeFile(file, body); return checkMetadata(file); };
  const F = "```";
  const clean = await md(`## 2. Texts\n${F}\nCheck a text or a link. It is not antivirus software.\n${F}\n## 8. Notes\n${F}\nIf the person taps Allow on the tracking prompt, the app loads Google Analytics.\n${F}\n`);
  check("metadata: clean copy passes; the review notes may name Google Analytics", clean.length === 0, clean);
  const desc = await md(`## 2. Texts\n${F}\nUsage is counted with Google Analytics.\n${F}\n`);
  check("metadata: Google outside the review notes fails", desc.some(h => h.term === "google"), desc);
  const google = await md(`## 8. Notes\n${F}\nSign in with Google is not offered.\n${F}\n`);
  check("metadata: any other Google wording in the review notes fails", google.some(h => h.term === "google"), google);
  const track = await md(`## 2. Texts\n${F}\nNo ads, no tracking.\n${F}\n`);
  check("metadata: 'no tracking' fails (the app tracks after Allow)", track.some(h => h.term === "tracking"), track);
  const outside = await md(`## 8. Notes\nGuidance outside a fenced block may mention Stripe pricing.\n`);
  check("metadata: only the fenced copy is checked", outside.length === 0, outside);
  await rm(dir, { recursive: true, force: true });
}

/* ---------- CSS pruning ---------- */
{
  const css = `a{color:red}html.cn #home .x{color:blue}#pricing .p,.keep{margin:0}#about .q,.keep2{margin:0}@media (min-width:1px){#about h1{x:1}.y{z:2}}@keyframes k{0%{opacity:0}}.page:not(#about){display:block}.c::before{content:"}{"}.recovery-pro-upsell{x:1}`;
  const out = pruneCss(css);
  check("css: plain rule kept", out.includes("a{color:red}"), out);
  check("css: #home and #pricing rules are kept (the app has both pages)", out.includes("#home .x{color:blue}") && out.includes("#pricing .p,.keep{margin:0}"), out);
  check("css: the Recovery Pro offer is kept (it is in the app)", out.includes(".recovery-pro-upsell{x:1}"), out);
  check("css: #about rule dropped, selector list keeps the rest", out.includes(".keep2{margin:0}") && !out.includes("#about .q"), out);
  check("css: media keeps its other rules", out.includes("@media (min-width:1px){.y{z:2}}") && !out.includes("#about h1"), out);
  check("css: keyframes untouched", out.includes("@keyframes k{0%{opacity:0}}"), out);
  check("css: :not() untouched", out.includes(".page:not(#about){display:block}"), out);
  check("css: braces in strings survive", out.includes('.c::before{content:"}{"}'), out);
}

console.log(`gate tests: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
void here;
