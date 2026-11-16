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

console.log(`signup-source: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
