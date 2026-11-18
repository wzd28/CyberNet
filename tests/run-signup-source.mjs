// Sign-up source (cn-src): the head snippet in public/index.html (#cnSrcCapture) that keeps the
// first-touch source, and how public/script.js hands it to Supabase (email sign-up options.data and
// the one-time updateUser after a first Google sign-in). The snippet runs in a vm sandbox with a
// stub location, referrer and localStorage; script.js is checked by its source text.
//   node tests/run-signup-source.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(root, "public", "index.html"), "utf8");
const script = readFileSync(path.join(root, "public", "script.js"), "utf8");
const m = html.match(/<script data-web-only id="cnSrcCapture">([\s\S]*?)<\/script>/);

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}\n  expected ${e}\n  got      ${a}`);
}
if (!m) { console.log("FAIL #cnSrcCapture snippet not found in public/index.html"); process.exit(1); }
const snippet = m[1];

function run(href, { referrer = "", stored = {}, blocked = false } = {}) {
  const data = { ...stored };
  const localStorage = {
    getItem: k => { if (blocked) throw new Error("blocked"); return k in data ? data[k] : null; },
    setItem: (k, v) => { if (blocked) throw new Error("blocked"); data[k] = String(v); }
  };
  const sandbox = { window: { localStorage }, location: new URL(href), document: { referrer }, URL, URLSearchParams, Date, String, JSON };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox);
  return data["cn-src"] ? JSON.parse(data["cn-src"]) : null;
}
const today = new Date().toISOString().slice(0, 10);

check("TikTok ad", run("https://cybernetai.app/?utm_source=tiktok&utm_medium=paid&utm_campaign=bf2026&ttclid=abc123"),
  { s: "tiktok", m: "paid", c: "bf2026", k: "ttclid", r: "", d: today });
check("click id only, external referrer", run("https://cybernetai.app/?fbclid=xyz", { referrer: "https://l.facebook.com/l.php?u=x" }),
  { s: "", m: "", c: "", k: "fbclid", r: "l.facebook.com", d: today });
check("gclid", run("https://cybernetai.app/pricing?gclid=1").k, "gclid");
check("direct visit still kept", run("https://cybernetai.app/"), { s: "", m: "", c: "", k: "", r: "", d: today });
check("own-site referrer dropped", run("https://cybernetai.app/?utm_source=x", { referrer: "https://cybernetai.app/learn" }).r, "");
check("values trimmed to 60", run("https://cybernetai.app/?utm_source=" + encodeURIComponent("  " + "a".repeat(90) + " ")).s, "a".repeat(60));
check("empty click id ignored", run("https://cybernetai.app/?ttclid=&gclid=2").k, "gclid");
const first = JSON.stringify({ s: "tiktok", m: "", c: "", k: "ttclid", r: "", d: "2026-11-01" });
check("first touch never overwritten", run("https://cybernetai.app/?utm_source=google&gclid=9", { stored: { "cn-src": first } }),
  JSON.parse(first));
check("only the six fields", Object.keys(run("https://cybernetai.app/?utm_source=a&utm_term=t&utm_content=c&email=x@y.z")), ["s", "m", "c", "k", "r", "d"]);
check("click id value never stored", JSON.stringify(run("https://cybernetai.app/?ttclid=SECRETVALUE")).includes("SECRETVALUE"), false);
let threw = false;
try { check("blocked storage keeps nothing", run("https://cybernetai.app/?utm_source=a", { blocked: true }), null); } catch { threw = true; }
check("blocked storage does not throw", threw, false);

// script.js: the source reaches Supabase in both sign-up paths, web build only.
check("email sign-up passes signup_source", /data:\{full_name:fullName,first_name:first,last_name:last\/\*@web\*\/,\.\.\.\(signupSource\(\)\?\{signup_source:signupSource\(\)\}:\{\}\)\/\*@end-web\*\/\}/.test(script), true);
check("Google path: updateUser with signup_source", /updateUser\(\{data:\{signup_source:source\}\}\)/.test(script), true);
check("Google path: only accounts under 15 minutes", script.includes("age<15*60*1000"), true);
check("Google path: skipped when already set", script.includes("if(meta.signup_source)return;"), true);
check("Google path: runs from syncSession", /appState\.user=session\?\.user\|\|null;\n\/\*@web\*\/\s+try\{tagNewGoogleAccount\(appState\.user\)\}catch\{\}\/\*@end-web\*\//.test(script), true);

// The helper itself, loaded alone with a stub supabase client.
const helper = script.match(/\/\*@web\*\/  function signupSource\(\)\{[\s\S]*?\/\*@end-web\*\//);
check("helper block found", Boolean(helper), true);
if (helper) {
  const calls = [];
  const box = { localStorage: { getItem: () => JSON.stringify({ s: "tiktok", m: "paid", c: "x".repeat(80), k: "ttclid", r: "", d: "2026-11-17", extra: "no" }) },
    appState: { supabase: { auth: { updateUser: arg => { calls.push(arg); return Promise.resolve({}); } } } }, Date, JSON, String };
  vm.createContext(box);
  vm.runInContext(helper[0] + "\nthis.signupSource=signupSource;this.tag=tagNewGoogleAccount;", box);
  const src = box.signupSource();
  check("helper keeps the six fields, 60 chars", [Object.keys(src), src.c.length], [["s", "m", "c", "k", "r", "d"], 60]);
  const now = Date.now();
  box.tag({ created_at: new Date(now - 20 * 60 * 1000).toISOString(), user_metadata: {} });
  check("old account not tagged", calls.length, 0);
  box.tag({ created_at: new Date(now - 60 * 1000).toISOString(), user_metadata: { signup_source: { s: "a" } } });
  check("already tagged not re-tagged", calls.length, 0);
  box.tag({ created_at: new Date(now - 60 * 1000).toISOString(), user_metadata: {} });
  check("new Google account tagged once", calls.length, 1);
  check("tag payload", calls[0]?.data?.signup_source?.s, "tiktok");
  box.tag({ created_at: new Date(now - 60 * 1000).toISOString(), user_metadata: {} });
  check("never twice in one page", calls.length, 1);
}

// Try-first landing (17 Nov 2026): the gate head snippet (#cnGateHead) lets a signed-out visitor who
// arrives with ?try=1 or from an ad skip the sign-in wall straight into guest Quick Scan.
const gm = html.match(/<script data-web-only id="cnGateHead">([\s\S]*?)<\/script>/);
check("#cnGateHead snippet found", Boolean(gm), true);
if (gm) {
  const SB = "sb-ndtcxippbufqzwcxkyjd-auth-token";
  function gate(href, stored = {}) {
    const data = { ...stored }, cls = new Set();
    const store = o => ({ getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
    const win = {};
    const box = {
      window: win, localStorage: store(data), sessionStorage: store({}), location: new URL(href),
      document: { documentElement: { classList: { add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)), contains: c => cls.has(c) } }, addEventListener() {}, fonts: null },
      matchMedia: () => ({ matches: false }), requestAnimationFrame() {}, performance: { now: () => 0 }, setTimeout, clearTimeout, URLSearchParams, Number, String
    };
    vm.createContext(box);
    vm.runInContext(gm[1], box);
    return { wall: cls.has("cn-gate"), land: Boolean(win.CN_tryLand), guest: data["cn-guest"] === "1", deep: cls.has("cn-deep"), intro: cls.has("cn-intro") };
  }
  const W = "https://cybernetai.app";
  // No sign-in wall (18 Nov 2026): never html.cn-gate; every signed-out visitor is a guest from the first frame.
  check("no parameter: no wall, guest, Home with its intro", gate(W + "/"), { wall: false, land: false, guest: true, deep: false, intro: true });
  check("?try=1 lands on Quick Scan, no wall", gate(W + "/?try=1"), { wall: false, land: true, guest: true, deep: true, intro: false });
  check("checklist button link", gate(W + "/?try=1&utm_source=checklist&utm_medium=web&utm_campaign=bf2026").land, true);
  for (const p of ["utm_source=tiktok", "ttclid=abc", "fbclid=abc", "gclid=abc"]) check("ad param " + p, gate(W + "/?" + p), { wall: false, land: true, guest: true, deep: true, intro: false });
  check("empty ttclid: Home, no landing", gate(W + "/?ttclid="), { wall: false, land: false, guest: true, deep: false, intro: true });
  check("?try=0: Home", gate(W + "/?try=0").land, false);
  check("utm_medium alone: Home", gate(W + "/?utm_medium=paid").land, false);
  check("2 scans used: still lands", gate(W + "/?try=1", { "cn-guest-scans": "2" }).land, true);
  check("3 scans used: Home, no wall", gate(W + "/?utm_source=tiktok", { "cn-guest-scans": "3" }), { wall: false, land: false, guest: true, deep: false, intro: true });
  check("3 scans used, already a guest: no wall", gate(W + "/?try=1", { "cn-guest": "1", "cn-guest-scans": "3" }).wall, false);
  check("signed in: no wall, no landing, not a guest", gate(W + "/?try=1", { [SB]: "{}" }), { wall: false, land: false, guest: false, deep: false, intro: true });
  check("deep link /pricing: keeps its page", gate(W + "/pricing?utm_source=tiktok"), { wall: false, land: false, guest: true, deep: true, intro: false });
  check("deep link /quick-scan: no wall", gate(W + "/quick-scan"), { wall: false, land: false, guest: true, deep: true, intro: false });
  check("deep link /learn: no wall, no landing", gate(W + "/learn?gclid=1"), { wall: false, land: false, guest: true, deep: true, intro: false });
  check("/accept-invite: no wall, no landing", gate(W + "/accept-invite?utm_source=x&token_hash=t"), { wall: false, land: false, guest: true, deep: false, intro: false });
  for (const cb of ["/?try=1#access_token=a", "/?utm_source=x&code=abc", "/?try=1&type=recovery", "/?try=1&token_hash=t", "/?try=1&error_description=x"])
    check("auth callback: no landing " + cb, gate(W + cb), { wall: false, land: false, guest: true, deep: false, intro: true });
  check("the snippet never sets the wall class", /classList\.add\("cn-gate"\)/.test(gm[1]), false);
}
check("script.js: / with CN_tryLand opens Quick Scan", /\/\*@web\*\/else if\(window\.CN_tryLand\)\{tryFirstLanding\(\)\}\/\*@end-web\*\//.test(script), true);
// The gate controller in #authModal never locks the page any more.
const ctl = html.match(/function lock\(\) \{([\s\S]*?)\n      \}/);
check("gate controller: lock() returns first", Boolean(ctl) && /^\s*\/\*[\s\S]*?\*\/\s*return;/.test(ctl[1]), true);
check("script.js: tryFirstLanding switches to cybernet", /function tryFirstLanding\(\)\{\s*switchPage\("cybernet",\{skipUrlUpdate:true\}\)/.test(script), true);

// Sign-up by code (18 Nov 2026): web only, outside the sign-up form, verifyOtp with the email type.
const codeRegion = script.match(/\/\*@web\*\/  \/\* Sign-up by code[\s\S]*?\/\*@end-web\*\//);
check("code step is one web region", Boolean(codeRegion), true);
check("code step: verifyOtp({email, token, type:\"email\"})", Boolean(codeRegion) && codeRegion[0].includes('verifyOtp({email:codeEmail,token,type:"email"})'), true);
check("code step: no verifyOtp outside the web region", (script.match(/await appState\.supabase\.auth\.verifyOtp\(/g) || []).length, 1);
check("code step: shown after a sign-up without a session", /showCodeStep\(email\);\/\*@end-web\*\//.test(script), true);
const box = html.match(/<div data-web-only id="authCodeBox"[\s\S]*?<\/div>\s*<\/div>/);
check("#authCodeBox is data-web-only", Boolean(box), true);
check("#authCodeBox is not inside #authSignupForm", html.indexOf('id="authCodeBox"') > html.indexOf("</form>", html.indexOf('id="authSignupForm"')), true);
check("code field: one-time-code, numeric", Boolean(box) && /autocomplete="one-time-code"/.test(box[0]) && /inputmode="numeric"/.test(box[0]), true);
// In-app browsers put email first (18 Nov 2026). Generic Android WebViews ("; wv)", the ad network's landing
// views) count too, since Google refuses sign-in there; ordinary Chrome on Android and iPhone Safari do not.
const inApp = script.match(/const inAppBrowser=(\/.*?\/i)\.test\(navigator\.userAgent/);
check("in-app regex found", Boolean(inApp), true);
if (inApp) {
  const re = vm.runInNewContext(inApp[1]);
  const ua = {
    "Android WebView (ad landing)": ["Mozilla/5.0 (Linux; Android 9; SM-J600F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/69.0.3497.100 Mobile Safari/537.36", true],
    "TikTok Android": ["Mozilla/5.0 (Linux; Android 12; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.5481.153 Mobile Safari/537.36 trill_310404 BytedanceWebview/d8a21c6", true],
    "Instagram iPhone": ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0", true],
    "Chrome Android": ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", false],
    "Safari iPhone": ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", false],
    "Chrome desktop": ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", false]
  };
  for (const [name, [s, want]] of Object.entries(ua)) check("in-app: " + name, re.test(s), want);
}
console.log(`signup-source: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
