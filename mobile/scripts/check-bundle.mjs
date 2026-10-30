// The gate for the iPhone app's web bundle (BUILD-PLAN §5.4). It fails when mobile/www contains anything
// App Review must not find: purchase or plan calls to action, Google sign-in, other platforms, remote code,
// IP literals, placeholder copy, build markers that should have been processed, or debug hooks.
//
//   node mobile/scripts/check-bundle.mjs                 check mobile/www as a release bundle
//   node mobile/scripts/check-bundle.mjs --debug         a --debug bundle (allows ios/debug.js and its hooks)
//   node mobile/scripts/check-bundle.mjs --dir=<path>    check another folder (tests)
//   node mobile/scripts/check-bundle.mjs --metadata=<file.md>   run the word list over App Store text (§1-§9)
//
// What is scanned: every JS file is tokenised with acorn and each string and template literal is checked
// (identifiers are not word-checked, so a data field such as subscriptionStatus is fine, but the names in
// FORBIDDEN_IDENTIFIERS must not exist at all). HTML is parsed with parse5: text nodes and attribute values
// are checked, and inline scripts are tokenised like JS files. CSS is checked for remote url()/@import and
// for words in `content:` values. cybernet-engine.js is exempt from the word list (detection data names
// brands and is never a call to action; owner rule: no detection changes) and so are the vendored
// libraries, but both are still checked for remote code and IP literals. The legal pages use a shorter
// list: a privacy policy must name its processors, but nothing there may sell, price or link out.
//
// Exceptions live only in mobile/scripts/gate-exemptions.json: each one is a file, the exact string
// literal and the term it contains, with a reason. An exemption may not cover a purchase, plan, Google or
// CDN term, and an exemption that no longer matches anything fails the gate (the list stays honest).
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, "..");
const root = path.resolve(mobile, "..");

export const WORDS = [
  "stripe", "checkout", "customer-portal", "create-checkout-session", "manage billing", "billing portal",
  "upgrade", "unlock", "pricing", 'switchpage("pricing")', "data-upgrade-now", "view pro", "pro feature",
  "pro plan", "business plan", "per month", "/month", "per year", "$9.99", "95.90", "$40", "subscription",
  "free trial", "google", "signinwithoauth", "android", "play store", "chrome", "install app", "pwa", "byok",
  "openai key", "api key", "investigation", "screenshot-preview", "public-stats", "three@", "jsdelivr", "unpkg",
  "googletagmanager", "gtag", "coming soon", "lorem", "todo", "tbd", "localhost:", "accurate", "protects your",
  "real-time protection", "99%", "antivirus", "100% safe", "cn_demo_screen", "cn_engine_selftest",
  'webcontentsdebuggingenabled":true',
  // plan names: the app has one tier for every account (BUILD-PLAN §8.2, §11.4 step 9)
  "cybernet ai free", "free plan", "analysis ai free", "team plan"
];
// The only places a listed word may appear: these exact phrases are removed before matching.
export const ALLOWED_PHRASES = [
  /\bnot antivirus software\b/gi,
  /no scanner can promise something is 100% safe/gi,
  /capacitor:\/\/localhost/gi
];
// Legal pages: they name Stripe, Google and OpenAI as processors of the WEBSITE, which a privacy policy
// must do, but nothing in them may price, sell or send the reader anywhere else.
export const LEGAL_WORDS = ["$", "per month", "/month", "per year", "9.99", "95.90", "upgrade", "pricing", "checkout", "free trial", "unlock", "coming soon", "lorem", "todo", "tbd"];
export const FORBIDDEN_IDENTIFIERS = ["startCheckout", "openBillingPortal", "showPricingNotice", "initPricingToggle", "signInWithOAuth", "googleAuthBtn", "byokAnalyze"];
// Terms no exemption may ever cover.
const NEVER_EXEMPT = ["stripe", "checkout", "customer-portal", "create-checkout-session", "manage billing", "billing portal", "upgrade", "pricing", "data-upgrade-now", "view pro", "pro plan", "business plan", "per month", "/month", "per year", "$9.99", "95.90", "$40", "subscription", "free trial", "google", "signinwithoauth", "jsdelivr", "unpkg", "three@", "googletagmanager", "gtag", "Pro"];
const DEBUG_MARKERS = ["CN_DEMO_SCREEN", "CN_ENGINE_SELFTEST", "cn-debug-errors"];

// Files that may exist in the bundle at all.
export const ALLOWED_FILES = [
  /^index\.html$/, /^offline\.html$/, /^legal\/(terms|privacy|acceptable-use)\.html$/,
  /^(style|cybernet-legal)\.css$/,
  /^(config|cybernet-engine|cybernet-errors|cybernet-compat|script|cybernet-privacy-controls)\.js$/,
  /^ios\/(cn-ios-boot|ios|cn-analytics|legal-page)\.js$/, /^ios\/ios\.css$/,
  /^vendor\/(supabase|jsQR|capacitor)\.js$/,
  /^ui\/cybernet-ui\.(css|js)$/, /^ui\/cybernet-ui-legal\.css$/,
  /^ui\/fonts\/[\w.-]+\.woff2$/, /^ui\/fonts\/OFL\.txt$/,
  /^ui\/(img|3d)\/[\w.-]+\.(png|webp|svg|jpe?g)$/, /^ui\/[\w.-]+\.(png|webp|svg|jpe?g)$/,
  /^[\w.-]+\.(png|ico|svg|webp)$/
];
const DEBUG_FILES = [/^ios\/debug\.js$/, /^ios\/engine-fixtures\.json$/];
const ENGINE = "cybernet-engine.js";
const VENDOR = /^vendor\//;
const ANALYTICS = "ios/cn-analytics.js";
// Hosts a string literal may name. Google Analytics only in ios/cn-analytics.js (loaded after the App
// Tracking Transparency answer is "authorized"; owner, 29 Oct 2026).
const HOSTS = ["cybernetai.app", "ndtcxippbufqzwcxkyjd.supabase.co", "www.w3.org"];
const ANALYTICS_HOSTS = ["www.googletagmanager.com"];
const ANALYTICS_WORDS = ["google", "googletagmanager", "gtag"];
const CDN = /(jsdelivr|unpkg|cdnjs|ajax\.googleapis|gstatic|googletagmanager|cloudflareinsights|cdn\.)/i;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const SVG_GEOMETRY = new Set(["d", "points", "viewbox", "transform", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "offset", "stroke-dasharray", "stroke-dashoffset", "pathlength", "stop-opacity"]);

const requireFrom = [createRequire(path.join(mobile, "package.json")), createRequire(path.join(root, "package.json"))];
async function importDep(name) {
  for (const req of requireFrom) {
    try { return await import(pathToFileURL(req.resolve(name)).href); } catch { /* next */ }
  }
  throw new Error(`missing dependency "${name}": run \`npm ci\` in mobile/`);
}

function wordRegex(word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(/^[a-z]/i.test(word) ? `(?<![a-z])${esc}` : esc, "i");
}
const WORD_RES = WORDS.map(w => [w, wordRegex(w)]);
const LEGAL_RES = LEGAL_WORDS.map(w => [w, wordRegex(w)]);
const PRO = /\b(?:Pro|PRO)\b/;

const DEBUG_WORDS = ["cn_demo_screen", "cn_engine_selftest"];
export function wordHits(text, { file = "", legal = false, debug = false } = {}) {
  let t = String(text);
  for (const re of ALLOWED_PHRASES) t = t.replace(re, " ");
  const out = [];
  for (const [w, re] of legal ? LEGAL_RES : WORD_RES) {
    if (!re.test(t)) continue;
    if (file === ANALYTICS && ANALYTICS_WORDS.includes(w)) continue;
    if (debug && file === "ios/debug.js" && DEBUG_WORDS.includes(w)) continue;
    out.push(w);
  }
  if (!legal && PRO.test(t)) out.push("Pro");
  return out;
}

function hostsIn(text) {
  return [...String(text).matchAll(/\bhttps?:\/\/([^/\s"'`)<>?#:;,]+)/gi)].map(m => m[1].toLowerCase());
}
function hostAllowed(host, file) {
  // reserved names (RFC 2606/6761): examples only, never contacted
  if (/\.invalid$/.test(host) || /^(www\.)?example\.(com|org|net)$/.test(host)) return true;
  const list = file === ANALYTICS ? [...HOSTS, ...ANALYTICS_HOSTS] : HOSTS;
  return list.some(h => host === h || host.endsWith("." + h) && h !== "www.w3.org");
}

/* ------------------------------------------------------------------ the check */
export async function checkBundle({ dir = path.join(mobile, "www"), debug = false, exemptionsFile = path.join(here, "gate-exemptions.json") } = {}) {
  const acorn = await importDep("acorn");
  const P5 = await importDep("parse5");
  const exemptions = existsSync(exemptionsFile) ? JSON.parse(await readFile(exemptionsFile, "utf8")) : [];
  const used = new Set();
  const hits = [];
  const valid = e => e && e.file && e.term && typeof e.literal === "string" && e.reason && !NEVER_EXEMPT.some(w => w.toLowerCase() === String(e.term).toLowerCase());
  const add = (hit) => {
    const ex = exemptions.findIndex(e => valid(e) && e.file === hit.file && e.term === hit.term && e.literal === hit.literal);
    if (ex >= 0) { used.add(ex); return; }
    hits.push(hit);
  };
  for (const [i, e] of exemptions.entries()) {
    if (!e.file || !e.term || typeof e.literal !== "string" || !e.reason) hits.push({ file: "gate-exemptions.json", line: i + 1, rule: "exemption", term: "", detail: "every exemption needs file, literal, term and reason" });
    if (NEVER_EXEMPT.some(w => w.toLowerCase() === String(e.term).toLowerCase())) hits.push({ file: "gate-exemptions.json", line: i + 1, rule: "exemption", term: e.term, detail: `"${e.term}" is a purchase, plan, Google or CDN term and may never be exempted` });
  }
  if (!existsSync(dir)) return { hits: [{ file: dir, line: 0, rule: "missing", term: "", detail: "the bundle folder does not exist (run build-web.mjs)" }], files: 0 };

  const files = await listFiles(dir);
  const present = new Set(files);
  for (const rel of files) {
    const allowed = ALLOWED_FILES.some(re => re.test(rel)) || (debug && DEBUG_FILES.some(re => re.test(rel)));
    if (!allowed) add({ file: rel, line: 0, rule: "allow-list", term: "", literal: "", detail: "file is not on the bundle allow-list" });
  }

  for (const rel of files) {
    const full = path.join(dir, ...rel.split("/"));
    if (!/\.(js|html|css|json|txt)$/.test(rel)) continue;
    const text = await readFile(full, "utf8");
    const legal = rel.startsWith("legal/");
    const engine = rel === ENGINE;
    const vendor = VENDOR.test(rel);
    // markers that the build should have processed, and release-only checks (raw text, every file)
    for (const [needle, label] of [["/*@web*/", "web marker"], ["/*@end-web*/", "web marker"], ["/*@ios", "ios marker"], ["@end-ios*/", "ios marker"], ["data-web-only", "data-web-only"], ["<!--@ios", "ios marker"]]) {
      const at = text.indexOf(needle);
      if (at >= 0 && !vendor) add({ file: rel, line: lineAt(text, at), rule: "marker", term: needle, literal: "", detail: `${label} survived the build` });
    }
    if (!debug) {
      for (const needle of DEBUG_MARKERS) {
        const at = text.indexOf(needle);
        if (at >= 0) add({ file: rel, line: lineAt(text, at), rule: "debug", term: needle, literal: "", detail: "debug hook in a release bundle" });
      }
      if (/webContentsDebuggingEnabled"?\s*:\s*true/i.test(text)) add({ file: rel, line: 0, rule: "debug", term: "webContentsDebuggingEnabled", literal: "", detail: "web inspector enabled in a release bundle" });
    }
    if (rel.endsWith(".js")) checkJs(text, rel, { engine, vendor });
    else if (rel.endsWith(".html")) checkHtml(text, rel, { legal });
    else if (rel.endsWith(".css")) checkCss(text, rel);
  }

  for (const [i, e] of exemptions.entries()) {
    if (!used.has(i) && valid(e)) hits.push({ file: "gate-exemptions.json", line: i + 1, rule: "exemption", term: e.term, detail: `unused exemption for ${e.file}: "${String(e.literal).slice(0, 60)}"; remove it` });
  }
  return { hits, files: files.length };

  /* ---------- JS ---------- */
  function checkJs(code, rel, { engine, vendor }, offsetLine = 0) {
    let tokens;
    try { tokens = [...acorn.tokenizer(code, { ecmaVersion: "latest", locations: true, allowHashBang: true })]; }
    catch (error) { add({ file: rel, line: offsetLine, rule: "parse", term: "", literal: "", detail: `does not tokenise: ${error.message}` }); return; }
    for (let k = 0; k < tokens.length; k++) {
      const tok = tokens[k];
      const line = offsetLine + tok.loc.start.line;
      const label = tok.type.label;
      if (label === "name" && !engine && !vendor && FORBIDDEN_IDENTIFIERS.includes(tok.value)) add({ file: rel, line, rule: "identifier", term: tok.value, literal: tok.value, detail: `identifier ${tok.value} must not exist in the app` });
      if (label === "import" && tokens[k + 1]?.type.label === "(" && !vendor) add({ file: rel, line, rule: "remote-code", term: "import()", literal: "", detail: "dynamic import()" });
      if (label !== "string" && label !== "template") continue;
      const value = String(tok.value ?? "");
      if (!value) continue;
      // remote code: a URL to a script/stylesheet or a CDN, anywhere
      for (const m of value.matchAll(/\bhttps?:\/\/[^\s"'`<>)]+/gi)) {
        const url = m[0];
        const host = hostsIn(url)[0] || "";
        const looksLikeCode = /\.(m?js|css)(\?|#|$)/i.test(url) || CDN.test(url);
        if (looksLikeCode && !(rel === ANALYTICS && host === "www.googletagmanager.com")) add({ file: rel, line, rule: "remote-code", term: host, literal: value, detail: `loads code from ${url.slice(0, 100)}` });
        else if (!engine && !vendor && !hostAllowed(host, rel)) add({ file: rel, line, rule: "remote-host", term: host, literal: value, detail: `names ${host}, which the app does not talk to` });
      }
      for (const m of value.matchAll(IPV4)) add({ file: rel, line, rule: "ip-literal", term: m[0], literal: value, detail: `IP literal ${m[0]} (App Review uses IPv6-only networks)` });
      if (engine || vendor) continue;
      for (const w of wordHits(value, { file: rel, debug })) add({ file: rel, line, rule: "word", term: w, literal: value, detail: `"${w}" in ${JSON.stringify(value.length > 140 ? value.slice(0, 140) + "…" : value)}` });
    }
  }

  /* ---------- HTML ---------- */
  function checkHtml(html, rel, { legal }) {
    const doc = P5.parse(html, { sourceCodeLocationInfo: true });
    const dirOf = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
    for (const n of walk(doc)) {
      const line = n.sourceCodeLocation?.startLine || 0;
      if (n.nodeName === "#comment") continue;
      if (n.nodeName === "#text") {
        const parent = n.parentNode?.tagName;
        if (parent === "script" || parent === "style") continue;
        textChecks(n.value, rel, line, legal);
        continue;
      }
      if (typeof n.tagName !== "string") continue;
      const tag = n.tagName;
      const attrs = Object.fromEntries((n.attrs || []).map(a => [a.name, a.value]));
      if (tag === "script") {
        if (attrs.src && /^(https?:)?\/\//i.test(attrs.src)) add({ file: rel, line, rule: "remote-code", term: attrs.src, literal: attrs.src, detail: `<script src="${attrs.src}">` });
        if (!attrs.src && (!attrs.type || /javascript|module/.test(attrs.type))) {
          const code = (n.childNodes || []).map(c => c.value || "").join("");
          checkJs(code, rel, { engine: false, vendor: false }, line - 1);
        }
      }
      if (tag === "style") checkCss((n.childNodes || []).map(c => c.value || "").join(""), rel, line - 1);
      if (["link", "iframe", "embed", "object", "frame", "img", "source", "audio", "video"].includes(tag)) {
        const url = attrs.href || attrs.src || attrs.data || "";
        const rels = String(attrs.rel || "").toLowerCase();
        const codeLink = tag !== "link" || /stylesheet|preload|modulepreload|prefetch|import|manifest|icon/.test(rels);
        if (codeLink && /^(https?:)?\/\//i.test(url)) add({ file: rel, line, rule: "remote-code", term: url, literal: url, detail: `<${tag}> loads ${url}` });
      }
      if ("data-web-only" in attrs) add({ file: rel, line, rule: "marker", term: "data-web-only", literal: "", detail: "a data-web-only element survived" });
      if (/^(pricing|about)$/.test(attrs["data-page"] || "")) add({ file: rel, line, rule: "marker", term: `data-page="${attrs["data-page"]}"`, literal: "", detail: "a link to a web-only page survived" });
      // local references must exist in the bundle
      for (const key of ["src", "href"]) {
        const v = attrs[key];
        if (!v || /^(https?:|\/\/|#|mailto:|tel:|data:|blob:|javascript:|capacitor:)/i.test(v)) continue;
        if (tag === "a" && key === "href" && !/\.\w+([?#]|$)/.test(v)) continue;
        const target = path.posix.normalize(path.posix.join(dirOf, v.replace(/[?#].*$/, "").replace(/^\//, "")));
        if (!present.has(target)) add({ file: rel, line, rule: "missing-file", term: v, literal: v, detail: `<${tag} ${key}="${v}"> points to a file that is not in the bundle` });
      }
      if (legal && tag === "a") {
        const href = attrs.href || "";
        if (!/^#/.test(href) && !/^mailto:support@cybernetai\.app(\?|$)/i.test(href) && !/^(terms|privacy|acceptable-use)\.html(#[\w-]*)?$/.test(href) && !/^\.\.\/index\.html$/.test(href)) add({ file: rel, line, rule: "legal-link", term: href, literal: href, detail: `legal pages may only link to #anchors, support@cybernetai.app or each other (found ${href})` });
      }
      for (const [name, value] of Object.entries(attrs)) {
        if (!legal) for (const w of wordHits(name, { file: rel })) add({ file: rel, line, rule: "word", term: w, literal: name, detail: `attribute name ${name}` });
        if (SVG_GEOMETRY.has(name.toLowerCase()) || name === "style" || name === "srcset" || name === "integrity") continue;
        if (tag === "meta" && /content-security-policy/i.test(attrs["http-equiv"] || "") && name === "content") {
          for (const host of hostsIn(value)) if (!hostAllowed(host, ANALYTICS) && !/(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$/.test(host) && !host.startsWith("*.")) add({ file: rel, line, rule: "csp", term: host, literal: value, detail: `CSP names ${host}` });
          continue;
        }
        if (name === "href" || name === "src") {
          for (const m of String(value).matchAll(IPV4)) add({ file: rel, line, rule: "ip-literal", term: m[0], literal: value, detail: `IP literal in ${name}` });
          if (!legal) for (const w of wordHits(value, { file: rel })) add({ file: rel, line, rule: "word", term: w, literal: value, detail: `"${w}" in ${name}="${value.slice(0, 100)}"` });
          continue;
        }
        textChecks(value, rel, line, legal, `${name}=`);
      }
    }
  }

  function textChecks(value, rel, line, legal, prefix = "") {
    const text = String(value);
    if (!text.trim()) return;
    for (const m of text.matchAll(IPV4)) add({ file: rel, line, rule: "ip-literal", term: m[0], literal: text.trim(), detail: `IP literal ${m[0]}` });
    for (const w of wordHits(text, { file: rel, legal })) add({ file: rel, line, rule: legal ? "legal-word" : "word", term: w, literal: text.trim(), detail: `"${w}" in ${prefix}${JSON.stringify(text.trim().slice(0, 140))}` });
  }

  /* ---------- CSS ---------- */
  function checkCss(css, rel, offsetLine = 0) {
    for (const m of css.matchAll(/url\(\s*["']?\s*((?:https?:)?\/\/[^"')]+)/gi)) add({ file: rel, line: offsetLine + lineAt(css, m.index), rule: "remote-code", term: m[1], literal: m[1], detail: `CSS loads ${m[1]}` });
    for (const m of css.matchAll(/@import\s+(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s;]+)/gi)) add({ file: rel, line: offsetLine + lineAt(css, m.index), rule: "remote-code", term: m[1], literal: m[1], detail: `CSS @import ${m[1]}` });
    for (const m of css.matchAll(/content\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
      for (const w of wordHits(m[2], { file: rel })) add({ file: rel, line: offsetLine + lineAt(css, m.index), rule: "word", term: w, literal: m[2], detail: `"${w}" in CSS content` });
    }
    for (const m of css.matchAll(IPV4)) add({ file: rel, line: offsetLine + lineAt(css, m.index), rule: "ip-literal", term: m[0], literal: m[0], detail: `IP literal ${m[0]} in CSS` });
  }
}

/* ------------------------------------------------------------------ App Store text */
export async function checkMetadata(file) {
  const text = await readFile(file, "utf8");
  const hits = [];
  let section = 0, fenced = false;
  // Only the copy that is pasted into App Store Connect: the fenced text blocks of sections 1-9 (the
  // guidance around them names guidelines, prices and products on purpose). URLs are not copy.
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^```/.test(line.trim())) { fenced = !fenced; return; }
    const h = !fenced && /^#{1,3}\s*(?:§\s*)?(\d+)[.)]?\s/.exec(line);
    if (h) section = Number(h[1]);
    if (!fenced || section < 1 || section > 9) return;
    let copy = line.replace(/\bhttps?:\/\/\S+/g, " ");
    // The notes for App Review (section 8) must say plainly that the app loads Google Analytics after
    // the tracking prompt's Allow; that exact product name is the only Google term allowed there.
    if (section === 8) copy = copy.replace(/\bGoogle Analytics\b/g, " ");
    for (const w of wordHits(copy)) hits.push({ file: path.basename(file), line: i + 1, rule: "metadata", term: w, detail: line.trim().slice(0, 140) });
    // the app tracks (Google Analytics, only after App Tracking Transparency "Allow"; owner, 29 Oct 2026)
    if (/\bno tracking\b|\bnot used to track\b|\bdoes not track\b/i.test(copy)) hits.push({ file: path.basename(file), line: i + 1, rule: "metadata", term: "tracking", detail: `says the app does not track, but it uses Google Analytics after ATT Allow: ${line.trim().slice(0, 100)}` });
  });
  return hits;
}

/* ------------------------------------------------------------------ helpers */
function* walk(node) {
  yield node;
  for (const child of node.childNodes || []) yield* walk(child);
  if (node.content) yield* walk(node.content);
}
function lineAt(text, index) { return text.slice(0, index).split("\n").length; }
async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

export function printHits(hits) {
  const byRule = {};
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  [${h.rule}${h.term ? ` ${h.term}` : ""}]  ${h.detail}`);
    byRule[h.rule] = (byRule[h.rule] || 0) + 1;
  }
  console.error(`  ${hits.length} hit(s): ${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(", ")}`);
}

/* ------------------------------------------------------------------ CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const dirArg = argv.find(a => a.startsWith("--dir="));
  const metaArg = argv.find(a => a.startsWith("--metadata="));
  (async () => {
    if (metaArg) {
      const hits = await checkMetadata(path.resolve(metaArg.slice(11)));
      if (hits.length) { console.error("[check-bundle] App Store text has forbidden words:"); printHits(hits); process.exit(1); }
      console.log("[check-bundle] App Store text passed.");
      return;
    }
    const dir = dirArg ? path.resolve(dirArg.slice(6)) : path.join(mobile, "www");
    const { hits, files } = await checkBundle({ dir, debug: argv.includes("--debug") });
    if (hits.length) { console.error(`[check-bundle] FAILED for ${path.relative(root, dir) || dir}:`); printHits(hits); process.exit(1); }
    console.log(`[check-bundle] passed: ${files} files in ${path.relative(root, dir) || dir}${argv.includes("--debug") ? " (debug bundle)" : ""}.`);
  })().catch(error => { console.error(`[check-bundle] ${error.stack || error}`); process.exit(1); });
}
