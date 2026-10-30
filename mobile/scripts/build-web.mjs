// Builds the iPhone app's web bundle, mobile/www, from the website (public/ and ui-src/).
// BUILD-PLAN §5 (docs/app-store, kept out of git).
//
//   node mobile/scripts/build-web.mjs              release bundle, then the gate (check-bundle.mjs)
//   node mobile/scripts/build-web.mjs --debug      + ios/debug.js (error panel, engine self-test); the
//                                                  gate then runs in debug mode. Never submitted.
//   --out=<dir>        write somewhere else than mobile/www (tests)
//   --skip-ui-check    do not insist that public/ui is up to date with ui-src (local experiments only)
//   --no-gate          build only (the gate still runs in CI and in `npm run check:bundle`)
//
// What it does, in order (each step fails the build loudly instead of shipping something half done):
//  1. public/ui must be current (`node scripts/build-ui.mjs --check`).
//  2. Shared web JS is copied from public/ (the sources, never public/legacy) with the build regions
//     applied: every /*@web*/ ... /*@end-web*/ region is DELETED and every /*@ios ... @end-ios*/
//     comment is UNWRAPPED (App Review 2.5.19: web-only purchase, Google sign-in and CDN code is not in
//     the app at all, not switched off at runtime). Unbalanced or nested markers, or a "*/" inside an
//     @ios region (it would end the comment early and break the WEBSITE file), fail the build. Then
//     esbuild strips comments and whitespace (no renaming, no obfuscation) and acorn re-parses it.
//     mobile/web-ios/text-overrides.json can replace copy in shared files this build does not own
//     markers for (each rule says how often it must match).
//  3. cybernet-engine.js is copied byte for byte (the app and the Share Extension run the same engine
//     as the website and the tests; no detection change ever happens here).
//  4. Vendored libraries replace every CDN: supabase-js (its SHA-384 must equal the SRI hash the website
//     pins in index.html), jsQR and the Capacitor runtime. Nothing is fetched from a CDN at runtime.
//  5. The UI layer is rebuilt for the app from ui-src without the home-page, pricing, about and
//     three.js modules (UI_EXCLUDE below), with the site's own scripts/build-ui.mjs.
//  6. index.html is transformed with parse5: every [data-web-only] element goes, every
//     <!--@ios ... @end-ios--> comment becomes markup, the head is rebuilt from an allow-list
//     (no SEO, preconnect, manifest or analytics tags), scripts and stylesheets are mapped to the
//     bundle (an unknown one fails the build so somebody decides), the iOS files and the app's
//     Content-Security-Policy are added, the Account page partial is inserted, and Learn guides get
//     their iPhone wording (mobile/web-ios/learn-overrides.json).
//  7. The legal pages (legal/terms.html, privacy.html, acceptable-use.html) are built from the
//     website's pages: site header and footer removed, a Back bar added, Terms sections 10-14 (plans,
//     pricing, payments, cancellation, refunds) replaced by one paragraph, an "iPhone app" section
//     added, and every link that would leave the legal pages turned into plain text.
//  8. Only the images and fonts the bundle actually references are copied.
//  9. cybernet-engine.js is also copied for the Share Extension when its target folder exists.
// 10. The gate runs (mobile/scripts/check-bundle.mjs) unless --no-gate.
import { readFile, writeFile, mkdir, rm, readdir, copyFile, stat, cp, mkdtemp } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, "..");
const root = path.resolve(mobile, "..");
const pub = path.join(root, "public");
const webIos = path.join(mobile, "web-ios");

const argv = process.argv.slice(2);
const args = new Set(argv);
const DEBUG = args.has("--debug");
const outArg = argv.find(a => a.startsWith("--out="));
const OUT = outArg ? path.resolve(outArg.slice(6)) : path.join(mobile, "www");
const log = (...m) => console.log("[build-web]", ...m);

class BuildError extends Error {}
function fail(message) { throw new BuildError(message); }

/* ------------------------------------------------------------------ dependencies */
// mobile/node_modules first (mobile/package.json pins them), then the repo root.
const requireFrom = [createRequire(path.join(mobile, "package.json")), createRequire(path.join(root, "package.json"))];
function resolveDep(name) {
  for (const req of requireFrom) { try { return req.resolve(name); } catch { /* next */ } }
  return null;
}
async function importDep(name) {
  const resolved = resolveDep(name);
  if (!resolved) fail(`missing dependency "${name}". Run \`npm ci\` in mobile/.`);
  return import(pathToFileURL(resolved).href);
}
function depFile(pkg, rel) {
  for (const base of [path.join(mobile, "node_modules"), path.join(root, "node_modules")]) {
    const file = path.join(base, ...pkg.split("/"), ...rel.split("/"));
    if (existsSync(file)) return file;
  }
  return null;
}
function depVersion(pkg) {
  const file = depFile(pkg, "package.json");
  return file ? JSON.parse(readFileSync(file, "utf8")).version : null;
}

/* ------------------------------------------------------------------ what goes in */
// Shared JS from public/ (sources). `regions` = the file may carry /*@web*/ and /*@ios*/ regions.
export const JS_FILES = [
  "cybernet-compat.js",
  "cybernet-errors.js",
  "config.js",
  "script.js",
  "cybernet-privacy-controls.js"
];
export const ENGINE = "cybernet-engine.js";
export const CSS_FILES = ["style.css", "cybernet-legal.css"];

// How each <script src> / stylesheet of public/index.html maps into the bundle. Keys are the path with
// the leading "/", "legacy/" and "?v=" removed. null = deliberately not in the app (reason given).
// A script or stylesheet that is in neither list fails the build: someone must decide.
export const SCRIPT_MAP = {
  "cybernet-compat.js": "cybernet-compat.js",
  "cybernet-errors.js": "cybernet-errors.js",
  "config.js": "config.js",
  "cybernet-engine.js": "cybernet-engine.js",
  "script.js": "script.js",
  "cybernet-privacy-controls.js": "cybernet-privacy-controls.js",
  "ui/cybernet-ui.js": "ui/cybernet-ui.js",
  "cybernet-consent.js": null,            // Google Analytics cookie bar: the app has its own, ATT-gated (ios/cn-analytics.js)
  "cybernet-account-api-upgrade.js": null, // web Account modal: plans, billing, BYOK (ios.js has the Account screen)
  "cybernet-howto.js": null,               // home-page how-to player; its openers are web-only
  "cybernet-business-team.js": null,       // Business purchase and management (B14)
  "cybernet-final-ui-fix.js": null,        // web Account modal tabs, mojibake repair, web mobile menu
  "cybernet-legal-upgrade.js": null,       // web Legal Center + checkout consent; ios.js has the app's legal layer
  "cybernet-onboarding.js": null,          // plan cards and ?checkout= returns; ios.js has the first-run intro
  "cybernet-admin-feedback.js": null       // admin tool for the website
};
export const STYLE_MAP = {
  "style.css": "style.css",
  "cybernet-legal.css": "cybernet-legal.css",
  "ui/cybernet-ui.css": "ui/cybernet-ui.css",
  "cybernet-account-api-upgrade.css": null,
  "cybernet-howto.css": null,
  "cybernet-business-team.css": null,
  "cybernet-consent.css": null
};
// The UI layer for the app: ui-src without these (home page, live stats, demo, reel, about, pricing,
// sign-in gate, three.js globe, background canvases).
export const UI_EXCLUDE = {
  js: ["10-hero3d.js", "25-live.js", "30-demo.js", "35-reel.js", "09-bgfx.js", "65-press.js"],
  css: ["20-hero.css", "22-live.css", "24-demo.css", "45-about.css", "50-pricing.css", "23-threats.css",
        "26-flow.css", "28-home-more.css", "63-gate.css", "04-bgfx.css"]
};
// iOS-only files (mobile/web-ios -> www/ios). Order of the scripts = order in the page.
export const IOS_HEAD_SCRIPTS = ["vendor/capacitor.js", "ios/cn-ios-boot.js"]; // classic, before everything
export const IOS_TAIL_SCRIPTS = ["ios/ios.js", "ios/cn-analytics.js"];          // deferred, after script.js
const IOS_JS = ["cn-ios-boot.js", "ios.js", "cn-analytics.js", "legal-page.js"];
const IOS_DEBUG_JS = ["debug.js"];

export const API_ORIGIN = "https://cybernetai.app";
export const SUPABASE_ORIGIN = "https://ndtcxippbufqzwcxkyjd.supabase.co";
// Google Analytics: loaded ONLY by ios/cn-analytics.js and only after App Tracking Transparency says
// "authorized" (owner, 29 Oct 2026). The CSP must still name it, since a meta CSP cannot be widened later.
const GA_SCRIPT_ORIGIN = "https://www.googletagmanager.com";
const GA_CONNECT = ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"];
export const CSP = [
  "default-src 'self' capacitor://localhost",
  `connect-src 'self' capacitor://localhost blob: data: ${API_ORIGIN} ${SUPABASE_ORIGIN} ${GA_CONNECT.join(" ")}`,
  "img-src 'self' capacitor://localhost data: blob: https://*.google-analytics.com https://www.googletagmanager.com",
  `script-src 'self' capacitor://localhost 'unsafe-inline' ${GA_SCRIPT_ORIGIN}`,
  "style-src 'self' capacitor://localhost 'unsafe-inline'",
  "font-src 'self' capacitor://localhost data:",
  "media-src 'self' capacitor://localhost blob:",
  "frame-src 'self' capacitor://localhost", // the in-app legal pages (ios.js openLegal)
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'"
].join("; ");

/* ------------------------------------------------------------------ build regions */
const MARKER = /\/\*@web\*\/|\/\*@end-web\*\/|\/\*@ios(?=\s)|@end-ios\*\//g;
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

// Deletes /*@web*/ ... /*@end-web*/ and unwraps /*@ios ... @end-ios*/. Throws on any malformed region.
export function applyRegions(src, label = "source") {
  let out = "", i = 0, state = null, openedAt = 0;
  const count = { web: 0, ios: 0 };
  for (const m of src.matchAll(MARKER)) {
    const tok = m[0], at = m.index;
    const where = `${label}:${lineAt(src, at)}`;
    if (tok === "/*@web*/" || tok === "/*@ios") {
      if (state) fail(`${where}: ${tok} opened inside an @${state} region (line ${lineAt(src, openedAt)}); regions cannot nest.`);
      out += src.slice(i, at);
      state = tok === "/*@web*/" ? "web" : "ios";
      openedAt = at;
      i = at + tok.length;
    } else if (tok === "/*@end-web*/") {
      if (state !== "web") fail(`${where}: /*@end-web*/ without an open /*@web*/.`);
      state = null; i = at + tok.length; count.web++;
    } else {
      if (state !== "ios") fail(`${where}: @end-ios*/ without an open /*@ios.`);
      const body = src.slice(i, at);
      if (body.includes("*/")) fail(`${label}:${lineAt(src, openedAt)}: an @ios region contains "*/", which ends the comment early and breaks the website file.`);
      out += body;
      state = null; i = at + tok.length; count.ios++;
    }
  }
  if (state) fail(`${label}:${lineAt(src, openedAt)}: the @${state} region is never closed.`);
  out += src.slice(i);
  return { code: out, count };
}

// Fallback copy changes for shared files whose markers belong to another area (mobile/web-ios/text-overrides.json):
// { "<file>": [ { "find": "text" | "pattern": "regex", "flags": "g", "replace": "...", "min": 1, "max": 1, "why": "..." } ] }
export function applyTextOverrides(code, file, rules = []) {
  for (const rule of rules) {
    const re = rule.pattern ? new RegExp(rule.pattern, rule.flags || "g") : new RegExp(rule.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const hits = (code.match(re) || []).length;
    const min = rule.min ?? 1, max = rule.max ?? Infinity;
    if (hits < min || hits > max) fail(`text-overrides.json: ${file}: "${rule.find || rule.pattern}" matched ${hits} time(s), expected ${min}..${max}. (${rule.why || "no reason given"}) Update the rule or add build markers to the file.`);
    code = code.replace(re, rule.replace);
  }
  return code;
}

/* ------------------------------------------------------------------ small fs helpers */
async function write(rel, data) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return file;
}
const readText = file => readFile(file, "utf8");
const readJson = async file => JSON.parse(await readText(file));
const sha384 = buf => "sha384-" + createHash("sha384").update(buf).digest("base64");

/* ------------------------------------------------------------------ JS */
let esbuild, acorn;
async function minifyJs(code, label) {
  let out;
  try {
    out = (await esbuild.transform(code, { loader: "js", minifyWhitespace: true, legalComments: "none", charset: "utf8", target: "safari16" })).code;
  } catch (error) { fail(`${label}: esbuild could not read the file: ${error.message}`); }
  try { acorn.parse(out, { ecmaVersion: 2022, sourceType: "script" }); }
  catch (error) { fail(`${label}: the iOS output does not parse (${error.message}).`); }
  return out;
}
async function minifyCss(code, label) {
  try { return (await esbuild.transform(code, { loader: "css", minify: true, legalComments: "none", charset: "utf8", logLevel: "silent" })).code; }
  catch (error) { fail(`${label}: esbuild could not read the CSS: ${error.message}`); }
}

/* ------------------------------------------------------------------ parse5 helpers */
let P5;
const isEl = n => n && typeof n.tagName === "string";
function* walk(node) {
  yield node;
  for (const child of [...(node.childNodes || [])]) yield* walk(child);
  if (node.content) yield* walk(node.content);
}
const attrOf = (n, name) => n.attrs?.find(a => a.name === name)?.value;
const hasAttr = (n, name) => !!n.attrs?.some(a => a.name === name);
function setAttr(n, name, value) {
  const a = n.attrs.find(x => x.name === name);
  if (a) a.value = value; else n.attrs.push({ name, value });
}
function removeAttr(n, name) { n.attrs = n.attrs.filter(a => a.name !== name); }
function detach(n) {
  const parent = n.parentNode;
  if (!parent) return;
  parent.childNodes.splice(parent.childNodes.indexOf(n), 1);
  n.parentNode = null;
}
function insertAt(parent, index, nodes) {
  for (const n of nodes) n.parentNode = parent;
  parent.childNodes.splice(index, 0, ...nodes);
}
function appendNodes(parent, nodes) { insertAt(parent, parent.childNodes.length, nodes); }
function replaceNode(old, nodes) {
  const parent = old.parentNode;
  const i = parent.childNodes.indexOf(old);
  parent.childNodes.splice(i, 1);
  old.parentNode = null;
  insertAt(parent, i, nodes);
}
function fragment(html, contextTag = "body") {
  const frag = P5.parseFragment(html);
  return [...frag.childNodes];
}
const byId = (doc, id) => { for (const n of walk(doc)) if (isEl(n) && attrOf(n, "id") === id) return n; return null; };
const findAll = (doc, test) => { const out = []; for (const n of walk(doc)) if (isEl(n) && test(n)) out.push(n); return out; };
const first = (doc, test) => findAll(doc, test)[0] || null;
const hasClass = (n, cls) => (attrOf(n, "class") || "").split(/\s+/).includes(cls);
const textOf = n => n.nodeName === "#text" ? n.value : (n.childNodes || []).map(textOf).join("");
function setText(n, text) {
  n.childNodes = [];
  appendNodes(n, [{ nodeName: "#text", value: text, parentNode: n }]);
}
const outer = n => P5.serializeOuter(n);
const elt = (html) => { const nodes = fragment(html).filter(isEl); if (nodes.length !== 1) fail(`internal: expected one element in ${html}`); return nodes[0]; };

// HTML comments carry website notes only; the app ships none.
function stripComments(doc) { for (const n of [...walk(doc)]) if (n.nodeName === "#comment" && n.parentNode) detach(n); }

// Removes every [data-web-only] element and unwraps every <!--@ios ... @end-ios--> comment.
export function applyHtmlRegions(doc, label) {
  let removed = 0, unwrapped = 0;
  for (const n of [...walk(doc)]) {
    if (isEl(n) && hasAttr(n, "data-web-only") && n.parentNode) { detach(n); removed++; }
  }
  for (const n of [...walk(doc)]) {
    if (n.nodeName !== "#comment" || !n.parentNode) continue;
    const data = n.data.trim();
    if (!data.startsWith("@ios") && !data.endsWith("@end-ios")) continue;
    const m = /^@ios\s([\s\S]*?)\s*@end-ios$/.exec(data);
    if (!m) fail(`${label}: malformed <!--@ios ... @end-ios--> comment: ${data.slice(0, 80)}`);
    replaceNode(n, fragment(m[1]));
    unwrapped++;
  }
  return { removed, unwrapped };
}

function normaliseLocal(url) {
  return String(url || "").trim().replace(/^\.?\//, "").replace(/[?#].*$/, "").replace(/^legacy\//, "");
}
const isRemote = url => /^(https?:)?\/\//i.test(String(url || "").trim());

/* ------------------------------------------------------------------ steps */
async function checkUiCurrent() {
  if (args.has("--skip-ui-check")) { log("skipping the public/ui freshness check (--skip-ui-check)"); return; }
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "build-ui.mjs"), "--check"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) fail(`public/ui is out of date with ui-src. Run \`node scripts/build-ui.mjs\` first.\n${(r.stderr || r.stdout || "").trim()}`);
}

async function buildSharedJs(overrides) {
  const counts = {};
  for (const name of JS_FILES) {
    const src = await readText(path.join(pub, name));
    // The website file must still parse with its markers in place (they are plain comments there).
    try { acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" }); }
    catch (error) { fail(`public/${name} does not parse as it stands (${error.message}).`); }
    const { code, count } = applyRegions(src, `public/${name}`);
    counts[name] = count;
    const changed = applyTextOverrides(code, name, overrides[name]);
    await write(name, await minifyJs(changed, `www/${name}`));
  }
  // The engine, byte for byte.
  await copyFile(path.join(pub, ENGINE), path.join(OUT, ENGINE));
  return counts;
}

async function buildVendor(indexHtml) {
  const supabase = depFile("@supabase/supabase-js", "dist/umd/supabase.js");
  const jsqr = depFile("jsqr", "dist/jsQR.js");
  const capacitor = depFile("@capacitor/core", "dist/capacitor.js");
  if (!supabase) fail("vendor: @supabase/supabase-js is not installed (mobile/package.json pins it). Run `npm ci` in mobile/.");
  if (!jsqr) fail("vendor: jsqr is not installed. Run `npm ci` in mobile/.");
  if (!capacitor) fail("vendor: @capacitor/core is not installed. Run `npm ci` in mobile/.");
  const supaBuf = await readFile(supabase);
  // The website pins supabase-js by version and SRI hash; the app must ship the very same file.
  const tag = /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([\d.]+)\/dist\/umd\/supabase\.js"[^>]*integrity="([^"]+)"/.exec(indexHtml);
  if (!tag) fail("vendor: could not find the supabase-js <script> (version + integrity) in public/index.html.");
  const installed = depVersion("@supabase/supabase-js");
  if (installed !== tag[1]) fail(`vendor: the website loads supabase-js ${tag[1]} but mobile/node_modules has ${installed}. Pin the same version in mobile/package.json.`);
  if (sha384(supaBuf) !== tag[2]) fail(`vendor: supabase-js ${installed} does not match the SRI hash in public/index.html.`);
  await write("vendor/supabase.js", supaBuf);
  await write("vendor/jsQR.js", await readFile(jsqr));
  await write("vendor/capacitor.js", await readFile(capacitor));
  return { supabase: installed, jsqr: depVersion("jsqr"), capacitor: depVersion("@capacitor/core") };
}

// CSS rules that only style markup the app does not have (web-only pages and elements) are dropped from the
// app's UI stylesheet. A selector list loses only its matching selectors; a selector that uses :not() is
// never touched. Robust to markup changes: a rule kept by mistake costs bytes, never layout.
export const WEB_ONLY_SELECTORS = [/#home\b/, /#pricing\b/, /#about\b/, /#cnGate/, /\.cn-gate\b/, /\.cn-gate-/, /\.cn-intro\b/,
  /\.recovery-pro-upsell/, /\.recovery-locked-note/, /#cnConsentBar/, /\.cn-consent/, /\.cn-cookie/, /\.google-auth/, /#googleAuth/];
export function pruneCss(css, patterns = WEB_ONLY_SELECTORS) {
  const isQuote = c => c === '"' || c === "'";
  function matchBrace(from) {
    let depth = 0, str = null;
    for (let k = from; k < css.length; k++) {
      const c = css[k];
      if (str) { if (c === "\\") { k++; continue; } if (c === str) str = null; continue; }
      if (isQuote(c)) { str = c; continue; }
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return k;
    }
    fail("CSS pruning: unbalanced braces in the UI stylesheet.");
  }
  function splitList(prelude) {
    const parts = [];
    let depth = 0, str = null, cur = "";
    for (const c of prelude) {
      if (str) { cur += c; if (c === str) str = null; continue; }
      if (isQuote(c)) { str = c; cur += c; continue; }
      if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") depth--;
      if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
      cur += c;
    }
    parts.push(cur);
    return parts;
  }
  const webOnly = sel => !/:not\(/.test(sel) && patterns.some(p => p.test(sel));
  function block(i, nested) {
    let out = "";
    while (i < css.length) {
      if (css[i] === "}") { if (nested) return { text: out, i: i + 1 }; i++; continue; }
      let j = i, str = null, paren = 0;
      for (; j < css.length; j++) {
        const c = css[j];
        if (str) { if (c === "\\") { j++; continue; } if (c === str) str = null; continue; }
        if (isQuote(c)) { str = c; continue; }
        if (c === "(") paren++; else if (c === ")") paren--;
        else if (paren === 0 && (c === "{" || c === ";" || c === "}")) break;
      }
      const prelude = css.slice(i, j);
      if (j >= css.length) { out += prelude; i = j; break; }
      if (css[j] === ";") { out += prelude + ";"; i = j + 1; continue; }
      if (css[j] === "}") { out += prelude; i = j; continue; }
      const end = matchBrace(j);
      const at = prelude.trim();
      if (/^@(media|supports|container|layer)\b/.test(at)) {
        const inner = block(j + 1, true);
        if (inner.text.trim()) out += prelude + "{" + inner.text + "}";
        i = end + 1;
      } else if (at.startsWith("@")) {
        out += css.slice(i, end + 1);
        i = end + 1;
      } else {
        const keep = splitList(prelude).filter(sel => !webOnly(sel));
        if (keep.length) out += keep.join(",") + css.slice(j, end + 1);
        i = end + 1;
      }
    }
    return { text: out, i };
  }
  return block(0, false).text;
}

async function buildUi() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cn-ios-ui-"));
  try {
    await cp(path.join(root, "ui-src"), tmp, { recursive: true });
    for (const [dir, list] of Object.entries(UI_EXCLUDE)) {
      for (const f of list) {
        const file = path.join(tmp, dir, f);
        if (existsSync(file)) await rm(file);
      }
    }
    const outDir = path.join(OUT, "ui");
    const r = spawnSync(process.execPath, [path.join(root, "scripts", "build-ui.mjs"), `--src=${tmp}`, `--out=${outDir}`], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) fail(`UI build failed:\n${(r.stderr || r.stdout || "").trim()}`);
    const cssFile = path.join(outDir, "cybernet-ui.css");
    const before = await readText(cssFile);
    const pruned = pruneCss(before);
    try { await esbuild.transform(pruned, { loader: "css", minify: true, logLevel: "silent" }); }
    catch (error) { fail(`CSS pruning produced CSS esbuild cannot read: ${error.message}`); }
    await writeFile(cssFile, pruned);
    log(`UI CSS ${(before.length / 1024).toFixed(0)} KB -> ${(pruned.length / 1024).toFixed(0)} KB (web-only selectors removed)`);
    // The standalone-page bundle is only used by the legal pages; keep both.
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function buildIosFiles(appVersion) {
  for (const name of [...IOS_JS, ...(DEBUG ? IOS_DEBUG_JS : [])]) {
    let code = await readText(path.join(webIos, name));
    code = code.replaceAll("__CN_APP_VERSION__", appVersion);
    await write(`ios/${name}`, await minifyJs(code, `www/ios/${name}`));
  }
  await write("ios/ios.css", await minifyCss(await readText(path.join(webIos, "ios.css")), "www/ios/ios.css"));
  for (const name of CSS_FILES) await write(name, await minifyCss(await readText(path.join(pub, name)), `www/${name}`));
  // The page the native shell shows if the bundle itself cannot load (BUILD-PLAN §7.11).
  await write("offline.html", await readText(path.join(webIos, "offline.html")));
  // debug bundles: the engine parity fixtures for ios/debug.js's self-test
  if (DEBUG) await write("ios/engine-fixtures.json", await readFile(path.join(mobile, "tests", "engine-fixtures.json")));
}

// Versions the legal layer records with a sign-up acceptance: always the website's current ones.
async function legalVersions() {
  const src = await readText(path.join(pub, "cybernet-legal-upgrade.js"));
  const pick = name => {
    const m = new RegExp(`const ${name} = "([^"]+)";`).exec(src);
    if (!m) fail(`legal: could not read ${name} from public/cybernet-legal-upgrade.js (the app records the same versions).`);
    return m[1];
  };
  return { legal: pick("LEGAL_VERSION"), privacy: pick("PRIVACY_VERSION"), effective: pick("EFFECTIVE_DATE") };
}

/* ------------------------------------------------------------------ index.html */
async function buildIndex(source, versions, appVersion) {
  const doc = P5.parse(source);
  const html = first(doc, n => n.tagName === "html");
  const head = first(doc, n => n.tagName === "head");
  const body = first(doc, n => n.tagName === "body");
  if (!html || !head || !body) fail("index.html: no html/head/body.");

  // Inline scripts may carry JS regions too.
  for (const n of findAll(doc, n => n.tagName === "script" && !hasAttr(n, "src"))) {
    const t = n.childNodes[0];
    if (t && t.nodeName === "#text") t.value = applyRegions(t.value, "index.html inline script").code;
  }
  const regions = applyHtmlRegions(doc, "public/index.html");
  if (!regions.removed) fail("index.html: no [data-web-only] element found; the website markers are missing.");
  stripComments(doc);
  // the website's cookie-settings controls belong to its cookie bar, which the app does not have
  for (const n of findAll(doc, n => hasAttr(n, "data-cn-consent-open"))) detach(n);

  // ---- head: rebuilt from an allow-list
  const kept = [];
  for (const n of [...head.childNodes]) {
    if (!isEl(n)) continue;
    const tag = n.tagName;
    if (tag === "meta" && (hasAttr(n, "charset") || ["viewport", "theme-color"].includes(attrOf(n, "name")))) kept.push(n);
    else if (tag === "title") { setText(n, "CyberNet AI"); kept.push(n); }
    else if (tag === "style") kept.push(n);
    else if (tag === "script" && !hasAttr(n, "src") && !attrOf(n, "type")) kept.push(n);
    else if (tag === "script" && hasAttr(n, "src")) { if (mapScript(n)) kept.push(n); }
    else if (tag === "link" && /\bstylesheet\b/.test(attrOf(n, "rel") || "")) { if (mapStyle(n)) kept.push(n); }
    // everything else (description, Open Graph, canonical, robots, ld+json, preconnect, preload, icons,
    // manifest, site verification) has no use inside the app
  }
  head.childNodes = [];
  const charset = kept.filter(n => n.tagName === "meta" && hasAttr(n, "charset"));
  const rest = kept.filter(n => !charset.includes(n));
  const csp = elt(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
  const extraMeta = fragment(`<meta name="format-detection" content="telephone=no, email=no, address=no"><meta name="color-scheme" content="dark">`).filter(isEl);
  const boot = IOS_HEAD_SCRIPTS.map(src => elt(`<script src="${src}"></script>`));
  const styles = rest.filter(n => n.tagName === "link");
  const lastStyle = styles[styles.length - 1];
  const iosCss = elt(`<link rel="stylesheet" href="ios/ios.css">`);
  appendNodes(head, [...charset, csp, ...extraMeta, ...boot]);
  for (const n of rest) {
    appendNodes(head, [n]);
    if (n === lastStyle) appendNodes(head, [iosCss]);
  }
  if (!lastStyle) appendNodes(head, [iosCss]);
  setAttr(html, "class", ((attrOf(html, "class") || "") + " cn-ios").trim());

  // ---- body scripts
  for (const n of findAll(body, n => n.tagName === "script" && hasAttr(n, "src"))) {
    if (!mapScript(n)) detach(n);
  }
  const lastScript = findAll(body, n => n.tagName === "script" && hasAttr(n, "src")).pop();
  const tail = [...IOS_TAIL_SCRIPTS, ...(DEBUG ? ["ios/debug.js"] : [])].map(src => elt(`<script src="${src}" defer></script>`));
  if (lastScript) insertAt(lastScript.parentNode, lastScript.parentNode.childNodes.indexOf(lastScript) + 1, tail);
  else appendNodes(body, tail);

  // ---- pages: Home is web-only, so Check (Quick Scan) is the first screen; the Account page is the app's
  const home = byId(doc, "home");
  if (home) fail("index.html: #home survived; mark it data-web-only.");
  const check = byId(doc, "cybernet");
  if (!check) fail("index.html: #cybernet (Quick Scan) is missing.");
  setAttr(check, "class", ((attrOf(check, "class") || "").replace(/\bactive-page\b/g, "") + " active-page").replace(/\s+/g, " ").trim());
  for (const n of findAll(doc, n => attrOf(n, "data-page") === "home")) setAttr(n, "data-page", "cybernet");
  for (const n of findAll(doc, n => hasClass(n, "nav-link"))) {
    const cls = (attrOf(n, "class") || "").split(/\s+/).filter(c => c && c !== "active");
    if (attrOf(n, "data-page") === "cybernet") cls.push("active");
    setAttr(n, "class", cls.join(" "));
  }
  const main = byId(doc, "cnMain");
  if (!main) fail("index.html: <main id=\"cnMain\"> is missing.");
  const accountPartial = (await readText(path.join(webIos, "partials", "account.html")))
    .replaceAll("__CN_APP_VERSION__", appVersion);
  appendNodes(main, fragment(accountPartial).filter(n => n.nodeName !== "#comment"));
  // The nav needs a button for the Account page so script.js wires it like the others (hidden: the tab
  // bar is the app's navigation).
  const nav = first(doc, n => n.tagName === "nav" && hasClass(n, "nav-tabs"));
  if (nav) appendNodes(nav, fragment(`<button class="nav-link" data-page="account" type="button" hidden>Account</button>`));

  // ---- Learn guides with iPhone wording
  const learn = await readJson(path.join(webIos, "learn-overrides.json"));
  for (const [id, rules] of Object.entries(learn)) {
    if (id.startsWith("_")) continue;
    const node = byId(doc, id);
    if (!node) fail(`learn-overrides.json: no element with id "${id}" in index.html.`);
    let markup = outer(node);
    for (const rule of rules) {
      const count = markup.split(rule.find).length - 1;
      if (!count) fail(`learn-overrides.json: "${rule.find}" not found in #${id}. The guide changed: update the override.`);
      markup = markup.split(rule.find).join(rule.replace);
    }
    replaceNode(node, fragment(markup));
  }

  // ---- local links and asset paths (Capacitor serves www/ at the root; relative is clearer)
  rewriteLocalUrls(doc);

  // ---- self-checks (the gate repeats them)
  for (const n of walk(doc)) {
    if (!isEl(n)) continue;
    if (hasAttr(n, "data-web-only")) fail("index.html: a data-web-only element survived.");
    const page = attrOf(n, "data-page");
    if (page && !byId(doc, page)) fail(`index.html: data-page="${page}" points to a page that is not in the app (${outer(n).slice(0, 120)}).`);
  }
  return P5.serialize(doc);

  function mapScript(n) {
    const src = attrOf(n, "src");
    if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/.test(src)) {
      setAttr(n, "src", "vendor/supabase.js");
      removeAttr(n, "integrity"); removeAttr(n, "crossorigin"); // checked at build time instead (local file)
      return true;
    }
    if (isRemote(src)) fail(`index.html: remote script ${src} has no vendored copy in the app. Vendor it or mark it data-web-only.`);
    const key = normaliseLocal(src);
    if (!(key in SCRIPT_MAP)) fail(`index.html: script "${src}" is not in SCRIPT_MAP (mobile/scripts/build-web.mjs). Decide whether the app needs it.`);
    if (!SCRIPT_MAP[key]) return false;
    setAttr(n, "src", SCRIPT_MAP[key]);
    return true;
  }
  function mapStyle(n) {
    const href = attrOf(n, "href");
    if (isRemote(href)) fail(`index.html: remote stylesheet ${href}.`);
    const key = normaliseLocal(href);
    if (!(key in STYLE_MAP)) fail(`index.html: stylesheet "${href}" is not in STYLE_MAP (mobile/scripts/build-web.mjs).`);
    if (!STYLE_MAP[key]) return false;
    setAttr(n, "href", STYLE_MAP[key]);
    removeAttr(n, "id");
    return true;
  }
}

const LEGAL_PAGES = { "terms.html": "legal/terms.html", "privacy.html": "legal/privacy.html", "acceptable-use.html": "legal/acceptable-use.html" };
function rewriteLocalUrls(doc, fromLegal = false) {
  for (const n of walk(doc)) {
    if (!isEl(n)) continue;
    for (const name of ["src", "href", "poster"]) {
      const value = attrOf(n, name);
      if (!value || isRemote(value) || /^(#|mailto:|tel:|data:|blob:|javascript:)/i.test(value)) continue;
      const [pathPart, hash = ""] = value.split("#");
      const key = normaliseLocal(pathPart);
      if (n.tagName === "a" && name === "href") {
        if (key === "" || key === "index.html") { setAttr(n, "href", fromLegal ? "../index.html" : "#"); continue; }
        if (LEGAL_PAGES[key]) { setAttr(n, "href", (fromLegal ? key : LEGAL_PAGES[key]) + (hash ? `#${hash}` : "")); continue; }
        // a website page the app does not have (refunds, support, ...): keep the words, drop the link
        unwrapLink(n);
        continue;
      }
      setAttr(n, name, (fromLegal ? "../" : "") + key);
    }
    const srcset = attrOf(n, "srcset");
    if (srcset) setAttr(n, "srcset", srcset.split(",").map(part => {
      const [u, d] = part.trim().split(/\s+/);
      return isRemote(u) ? part.trim() : `${fromLegal ? "../" : ""}${normaliseLocal(u)}${d ? " " + d : ""}`;
    }).join(", "));
  }
}
function unwrapLink(a) {
  const span = elt(`<span class="cn-ios-unlinked"></span>`);
  span.childNodes = a.childNodes; for (const c of span.childNodes) c.parentNode = span;
  replaceNode(a, [span]);
}

/* ------------------------------------------------------------------ legal pages */
const TERMS_REMOVED = ["plans", "subscriptions", "payments", "cancellation", "refunds"];
async function buildLegal(versions) {
  const partials = path.join(webIos, "legal");
  const bar = await readText(path.join(partials, "bar.html"));
  const textRules = await readJson(path.join(partials, "text-overrides.json"));
  for (const [file, out] of Object.entries(LEGAL_PAGES)) {
    const doc = P5.parse(await readText(path.join(pub, file)));
    const head = first(doc, n => n.tagName === "head");
    const body = first(doc, n => n.tagName === "body");
    const shell = first(doc, n => n.tagName === "main");
    if (!head || !body || !shell) fail(`legal: public/${file} has no head, body or main.`);
    const title = textOf(first(head, n => n.tagName === "title") || { nodeName: "#text", value: "CyberNet AI" }).replace(/\s*\|.*$/, "").trim() || "CyberNet AI";
    // the site's top bar and footer (links to the website) go; the app's Back bar comes in
    for (const n of findAll(shell, n => (n.tagName === "header" && hasClass(n, "cn-legal-page-top")) || (n.tagName === "footer" && hasClass(n, "cn-legal-page-footer")))) detach(n);
    for (const n of findAll(doc, n => n.tagName === "script")) detach(n);
    if (file === "terms.html") {
      const content = first(shell, n => hasClass(n, "cn-legal-content"));
      const sections = TERMS_REMOVED.map(id => byId(doc, id));
      if (sections.some(s => !s)) fail(`legal: terms.html no longer has sections #${TERMS_REMOVED.join(", #")}; update TERMS_REMOVED in build-web.mjs.`);
      const replacement = fragment(await readText(path.join(partials, "terms-no-purchases.html")));
      replaceNode(sections[0], replacement);
      for (const s of sections.slice(1)) detach(s);
      if (!content) fail("legal: terms.html has no .cn-legal-content.");
    }
    const iphone = path.join(partials, file.replace(".html", "-iphone.html"));
    if (existsSync(iphone)) {
      const content = first(shell, n => hasClass(n, "cn-legal-content"));
      const contact = byId(doc, "contact");
      const nodes = fragment((await readText(iphone)).replaceAll("__CN_LEGAL_VERSION__", versions.legal));
      if (contact && contact.parentNode) insertAt(contact.parentNode, contact.parentNode.childNodes.indexOf(contact), nodes);
      else if (content) appendNodes(content, nodes);
      else fail(`legal: nowhere to put the iPhone app section in ${file}.`);
    }
    stripComments(doc);
    for (const n of findAll(doc, n => hasAttr(n, "data-cn-consent-open"))) { const p = n.parentNode; detach(n); if (p && p.tagName === "p" && !textOf(p).trim()) detach(p); }
    // the table of contents follows the sections
    const toc = first(doc, n => n.tagName === "aside" && hasClass(n, "cn-legal-toc"));
    if (toc) {
      for (const a of findAll(toc, n => n.tagName === "a")) {
        const id = (attrOf(a, "href") || "").replace(/^#/, "");
        if (id && !byId(doc, id)) { const next = a.nextSibling; detach(a); if (next && next.nodeName === "#text" && !next.value.trim()) detach(next); }
      }
      const plans = file === "terms.html" ? first(toc, n => n.tagName === "a" && attrOf(n, "href") === "#plans") : null;
      if (plans) setText(plans, "10–14. Plans, payments and billing");
      if (byId(doc, "iphone-app")) appendNodes(toc, fragment('<a href="#iphone-app">The iPhone app</a>'));
    }
    // links: only #anchors, the support mailbox and the other legal pages survive
    for (const a of findAll(doc, n => n.tagName === "a")) {
      const href = attrOf(a, "href") || "";
      if (/^#/.test(href) || /^mailto:support@cybernetai\.app(\?|$)/i.test(href)) continue;
      const key = normaliseLocal(href.split("#")[0]);
      if (LEGAL_PAGES[key]) { setAttr(a, "href", key + (href.includes("#") ? "#" + href.split("#")[1] : "")); removeAttr(a, "target"); continue; }
      unwrapLink(a);
    }
    rewriteLocalUrls(doc, true); // the page's own images and links, before the app's head and bar go in
    // the new head
    head.childNodes = [];
    appendNodes(head, fragment(`<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><meta name="format-detection" content="telephone=no, email=no, address=no"><meta name="color-scheme" content="dark"><title>${title} | CyberNet AI</title><link rel="stylesheet" href="../cybernet-legal.css"><link rel="stylesheet" href="../ui/cybernet-ui-legal.css"><link rel="stylesheet" href="../ios/ios.css"><script src="../ios/legal-page.js" defer></script>`).filter(isEl));
    const html = first(doc, n => n.tagName === "html");
    setAttr(html, "class", ((attrOf(html, "class") || "") + " cn-ios cn-ios-legal").trim());
    insertAt(body, 0, fragment(bar));
    let markup = P5.serialize(doc);
    markup = applyTextOverrides(markup, `legal/${file}`, textRules[file] || []);
    await write(out, markup);
  }
}

/* ------------------------------------------------------------------ assets actually used */
const ASSET_EXT = /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i;
async function copyReferencedAssets() {
  const refs = new Set();
  const addRef = (raw, fromDir = "") => {
    if (!raw || isRemote(raw) || /^(data:|blob:|#|mailto:|about:)/i.test(raw)) return;
    const clean = raw.replace(/[?#].*$/, "");
    if (!ASSET_EXT.test(clean)) return;
    const rel = clean.startsWith("/") ? clean.slice(1) : path.posix.normalize(path.posix.join(fromDir, clean));
    refs.add(rel.replace(/^\.\//, ""));
  };
  const files = await listFiles(OUT);
  for (const rel of files) {
    const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
    if (/\.(html)$/.test(rel)) {
      const doc = P5.parse(await readText(path.join(OUT, rel)));
      for (const n of walk(doc)) {
        if (!isEl(n)) continue;
        for (const name of ["src", "href", "poster"]) addRef(attrOf(n, name), dir);
        const srcset = attrOf(n, "srcset");
        if (srcset) for (const part of srcset.split(",")) addRef(part.trim().split(/\s+/)[0], dir);
        const style = attrOf(n, "style");
        if (style) for (const m of style.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) addRef(m[1], dir);
      }
      for (const m of (await readText(path.join(OUT, rel))).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) addRef(m[1], dir);
    } else if (/\.css$/.test(rel)) {
      for (const m of (await readText(path.join(OUT, rel))).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) addRef(m[1], dir);
    } else if (/\.js$/.test(rel) && !rel.startsWith("vendor/") && rel !== ENGINE) {
      const code = await readText(path.join(OUT, rel));
      for (const tok of acorn.tokenizer(code, { ecmaVersion: "latest" })) {
        if (tok.type.label === "string" || tok.type.label === "template") {
          const v = String(tok.value);
          for (const m of v.matchAll(/(?:^|["'\s(=])(\/?[\w./-]+\.(?:png|jpe?g|webp|gif|svg|ico|woff2?))(?=$|[?"'\s)#])/gi)) addRef(m[1], "");
        }
      }
    }
  }
  const copied = [];
  for (const rel of [...refs].sort()) {
    if (rel.includes("..")) continue;
    const src = path.join(pub, ...rel.split("/"));
    if (!existsSync(src)) continue; // generated or optional; the gate checks for missing local references
    const dest = path.join(OUT, ...rel.split("/"));
    if (existsSync(dest)) continue;
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(src, dest);
    copied.push(rel);
  }
  // The font licence travels with the fonts.
  if (copied.some(f => f.startsWith("ui/fonts/")) && existsSync(path.join(pub, "ui", "fonts", "OFL.txt"))) {
    await copyFile(path.join(pub, "ui", "fonts", "OFL.txt"), path.join(OUT, "ui", "fonts", "OFL.txt"));
  }
  return copied;
}

export async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/* ------------------------------------------------------------------ main */
async function main() {
  const started = Date.now();
  // Never clean anything but an output folder inside mobile/ (or one passed with --out).
  if (!outArg && path.relative(mobile, OUT).startsWith("..")) fail(`refusing to clean ${OUT}`);
  acorn = await importDep("acorn");
  esbuild = await importDep("esbuild");
  P5 = await importDep("parse5");

  await checkUiCurrent();
  const appVersion = JSON.parse(await readText(path.join(mobile, "package.json"))).version;
  if (!/^\d+\.\d+\.\d+$/.test(appVersion)) fail(`mobile/package.json version "${appVersion}" is not x.y.z.`);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const indexSource = await readText(path.join(pub, "index.html"));
  const overrides = await readJson(path.join(webIos, "text-overrides.json"));
  const versions = await legalVersions();

  const counts = await buildSharedJs(overrides);
  const vendor = await buildVendor(indexSource);
  await buildUi();
  await buildIosFiles(appVersion);
  // ios.js needs the legal versions the website records (they live in a file the app does not ship).
  {
    const file = path.join(OUT, "ios", "ios.js");
    let code = await readText(file);
    for (const [k, v] of Object.entries({ __CN_LEGAL_VERSION__: versions.legal, __CN_PRIVACY_VERSION__: versions.privacy, __CN_LEGAL_EFFECTIVE__: versions.effective })) {
      if (!code.includes(k)) fail(`ios.js: placeholder ${k} is missing.`);
      code = code.replaceAll(k, v);
    }
    await writeFile(file, code);
  }
  await write("index.html", await buildIndex(indexSource, versions, appVersion));
  await buildLegal(versions);
  const assets = await copyReferencedAssets();

  // The Share Extension runs the same engine file (BUILD-PLAN §7.3). Its folder is created by the native
  // project script; copy only when it exists (the copy is git-ignored).
  const extDir = path.join(mobile, "ios", "App", "ShareExtension");
  if (!outArg && existsSync(extDir)) {
    const engineDir = path.join(extDir, "Resources", "engine");
    await mkdir(engineDir, { recursive: true });
    await copyFile(path.join(pub, ENGINE), path.join(engineDir, ENGINE));
    log("copied cybernet-engine.js for the Share Extension");
  }

  const regionSummary = Object.entries(counts).filter(([, c]) => c.web || c.ios).map(([f, c]) => `${f} ${c.web} web/${c.ios} ios`).join(", ");
  log(`regions: ${regionSummary || "none"}`);
  log(`vendored: supabase-js ${vendor.supabase}, jsQR ${vendor.jsqr}, Capacitor ${vendor.capacitor}`);
  log(`assets copied: ${assets.length}`);
  log(`app version ${appVersion}${DEBUG ? " (DEBUG bundle: never submit)" : ""}; legal ${versions.legal}, privacy ${versions.privacy}`);

  if (!args.has("--no-gate")) {
    const { checkBundle, printHits } = await import(pathToFileURL(path.join(here, "check-bundle.mjs")).href);
    const result = await checkBundle({ dir: OUT, debug: DEBUG });
    if (result.hits.length) {
      printHits(result.hits);
      fail(`the gate found ${result.hits.length} problem(s) in ${path.relative(root, OUT) || OUT}.`);
    }
    log(`gate passed (${result.files} files checked)`);
  }
  log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s -> ${path.relative(root, OUT) || OUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[build-web] FAILED: ${error instanceof BuildError ? error.message : error.stack || error}`);
    process.exit(1);
  });
}
