// Builds the iPhone app's web bundle into a temporary folder and checks what the gate does not:
// the app's structure (first screen, Account page, script order, CSP), the legal pages, and that the
// engine and supabase-js are exactly the website's files.
//
//   node mobile/tests/run-bundle.mjs
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, "..");
const root = path.resolve(mobile, "..");
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`FAIL ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ""}`); } };

const out = await mkdtemp(path.join(os.tmpdir(), "cn-ios-bundle-"));
try {
  const r = spawnSync(process.execPath, [path.join(mobile, "scripts", "build-web.mjs"), `--out=${out}`], { cwd: root, encoding: "utf8" });
  check("build-web.mjs builds and the gate passes", r.status === 0, (r.stderr || r.stdout).trim().split("\n").slice(-8).join("\n"));
  if (r.status === 0) {
    const read = rel => readFile(path.join(out, ...rel.split("/")), "utf8");
    const html = await read("index.html");
    const pub = rel => readFile(path.join(root, "public", rel));

    // first screen and pages
    check("Check (Quick Scan) is the first screen", /<section id="cybernet" class="page active-page"/.test(html));
    check("no Home, Pricing or About page", !/id="home"|id="pricing"|id="about"/.test(html));
    check("the Account page is in the page", /<section id="account" class="page cn-ios-account"/.test(html));
    check("no sign-in gate", !/cnGateStage|cn-gate-stage|html\.cn-gate|classList\.add\("cn-gate"\)/.test(html));
    check("no Google sign-in markup", !/googleAuth/.test(html));
    check("no build markers left", !/data-web-only|@ios|@end-ios|\/\*@web/.test(html));
    check("no HTML comments", !/<!--/.test(html));

    // head: Capacitor and the boot script before anything else runs; CSP; title
    const scripts = [...html.matchAll(/<script(?: [^>]*)?src="([^"]+)"/g)].map(m => m[1]);
    check("Capacitor runtime and boot script come first", scripts[0] === "vendor/capacitor.js" && scripts[1] === "ios/cn-ios-boot.js", scripts.join(", "));
    check("ios.js after script.js and the privacy controls", scripts.indexOf("ios/ios.js") > scripts.indexOf("script.js") && scripts.indexOf("ios/ios.js") > scripts.indexOf("cybernet-privacy-controls.js"), scripts.join(", "));
    check("analytics module is the last script", scripts[scripts.length - 1] === "ios/cn-analytics.js", scripts.join(", "));
    check("no remote script tags", scripts.every(s => !/^(https?:)?\/\//.test(s)), scripts.join(", "));
    check("web-only scripts are not loaded", !scripts.some(s => /consent|business-team|account-api-upgrade|onboarding|legal-upgrade|final-ui-fix|howto|admin-feedback/.test(s)), scripts.join(", "));
    check("CSP meta present", /<meta http-equiv="Content-Security-Policy" content="default-src 'self' capacitor:\/\/localhost;/.test(html));
    check("title is CyberNet AI", /<title>CyberNet AI<\/title>/.test(html));
    check("no SEO / manifest / preconnect tags", !/og:|twitter:|rel="manifest"|rel="preconnect"|ld\+json|canonical/.test(html));

    // the same engine and the same supabase-js as the website
    check("engine is byte-identical to public/cybernet-engine.js", Buffer.compare(await readFile(path.join(out, "cybernet-engine.js")), await pub("cybernet-engine.js")) === 0);
    const sri = /@supabase\/supabase-js@[\d.]+\/dist\/umd\/supabase\.js"[^>]*integrity="([^"]+)"/.exec(await readFile(path.join(root, "public", "index.html"), "utf8"))?.[1];
    const sha = "sha384-" + createHash("sha384").update(await readFile(path.join(out, "vendor", "supabase.js"))).digest("base64");
    check("vendored supabase-js matches the website's SRI hash", sri && sri === sha, `${sri} vs ${sha}`);

    // iOS behaviour compiled in
    const script = await read("script.js");
    check("planTier is the App tier", /function planTier\(\)\{const plan=appState\.profile\?\.plan;return plan\?"app":"app"\}/.test(script), script.match(/function planTier\(\)\{[^}]*\}/)?.[0]);
    check("Quick Scan has no server quota", /async function checkQuickScanQuota\(\)\{return\{allowed:true\}\}/.test(script));
    check("sessions live in the Keychain adapter", /storage:window\.CNSecureStorage\|\|void 0/.test(script) || /storage:window\.CNSecureStorage\|\|undefined/.test(script));
    check("email links land on the app pages", script.includes("https://cybernetai.app/app/confirmed.html") && script.includes("https://cybernetai.app/app/reset.html"));
    check("jsQR comes from the bundle", script.includes('"vendor/jsQR.js"') && !script.includes("cdn.jsdelivr"));
    check("the app opens on Check", /else\{switchPage\("cybernet",\{skipUrlUpdate:true\}\)\}/.test(script));

    // Behaviour of the compiled app code, run in isolation: each function is cut out of www/script.js with
    // acorn and called with stubs (no DOM, no network).
    const acorn = createRequire(path.join(mobile, "package.json"))("acorn");
    const ast = acorn.parse(script, { ecmaVersion: "latest", sourceType: "script" });
    const find = (test, node = ast) => {
      if (!node || typeof node.type !== "string") return null;
      if (test(node)) return node;
      for (const value of Object.values(node)) {
        for (const child of Array.isArray(value) ? value : [value]) {
          const hit = child && typeof child === "object" ? find(test, child) : null;
          if (hit) return hit;
        }
      }
      return null;
    };
    const src = node => (node ? script.slice(node.start, node.end) : "");
    const fnNamed = name => find(n => n.type === "FunctionDeclaration" && n.id?.name === name);
    const constNamed = name => find(n => n.type === "VariableDeclaration" && n.declarations.some(d => d.id?.name === name));

    // Guideline 5.1.1: a name may be asked for only if giving it is optional (owner: website keeps it).
    let fieldProblem = null;
    try { fieldProblem = new Function("newPasswordEl", [constNamed("EMAIL_PATTERN"), constNamed("MIN_PASSWORD"), constNamed("FIELD_RULES"), fnNamed("fieldProblem")].map(src).join(";\n") + ";\nreturn fieldProblem;")(null); } catch (error) { check("sign-up validator can be run", false, error.message); }
    if (fieldProblem) {
      check("sign-up: empty first and last name pass the app's checks", fieldProblem({ id: "signupFirstName", value: "" }) === "" && fieldProblem({ id: "signupLastName", value: "   " }) === "");
      check("sign-up: email and password are still checked", fieldProblem({ id: "signupEmail", value: "" }) !== "" && fieldProblem({ id: "signupPassword", value: "short" }) !== "" && fieldProblem({ id: "signupPassword", value: "long enough" }) === "");
    }
    const metadata = find(n => n.type === "Property" && n.key?.name === "data" && n.value?.type === "ObjectExpression" && /full_name/.test(src(n.value)));
    let names = null;
    try { names = new Function("fullName", "first", "last", `return (${src(metadata?.value)});`); } catch (error) { check("sign-up metadata can be run", false, error.message); }
    if (names) {
      check("sign-up with no name sends no name fields to signUp", JSON.stringify(names("", "", "")) === "{}");
      check("sign-up with a name still sends it", JSON.stringify(names("Ana Lima", "Ana", "Lima")) === JSON.stringify({ full_name: "Ana Lima", first_name: "Ana", last_name: "Lima" }));
    }
    const nameInputs = [...html.matchAll(/<input [^>]*id="signup(First|Last)Name"[^>]*>/g)].map(m => m[0]);
    check("sign-up name inputs are not required and say optional", nameInputs.length === 2 && nameInputs.every(i => !/\brequired\b/.test(i)) && /<label for="signupFirstName">First name \(optional\)<\/label>/.test(html) && /<label for="signupLastName">Last name \(optional\)<\/label>/.test(html), nameInputs);

    // Quick Scan, Scan QR and Share stay on the iPhone, also for team members; AI results still go to the
    // team owner's log (owner answer 8).
    let sent = [];
    let reportTeamActivity = null;
    try { reportTeamActivity = new Function("isSignedIn", "isLoggedTeamMember", "authHeaders", "fetch", `${src(fnNamed("reportTeamActivity"))}\nreturn reportTeamActivity;`)(() => true, () => true, h => h, (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return Promise.resolve(); }); } catch (error) { check("reportTeamActivity can be run", false, error.message); }
    if (reportTeamActivity) {
      reportTeamActivity({ kind: "quick_scan", scanType: "text", content: "parcel-redeliver-help.invalid/pay" });
      reportTeamActivity({ kind: "quick_scan", scanType: "image", content: "" });
      check("team member: Quick Scan is never sent to /api/team-activity", sent.length === 0, sent);
      reportTeamActivity({ kind: "analysis_shown", logId: "log-1" });
      check("team member: the AI result is still reported (owner answer 8)", sent.length === 1 && sent[0].url === "/api/team-activity" && sent[0].body.kind === "analysis_shown", sent);
    }

    // Risk D2: a low score is never presented as a certainty in the app.
    let getDanger = null;
    try { getDanger = new Function("window", `${src(fnNamed("getDanger"))}\nreturn getDanger;`)({ CyberNetEngine: { linkNeedsCaution: () => false } }); } catch (error) { check("getDanger can be run", false, error.message); }
    if (getDanger) check("a low-scoring text reads LOW RISK", getDanger(4, { kind: "text" }).headline === "LOW RISK" && getDanger(40, { kind: "text" }).headline === "SCAM");
    const iosJs = await read("ios/ios.js");
    check("no NOT A SCAM headline anywhere in the app", !/NOT A SCAM|Not A Scam/.test(script + iosJs + html));

    // Copy rules on app screens: no protection claim on the sign-in sheet, no website plan names in the
    // deletion dialog, and the Recovery disclaimer (risk D3).
    check("sign-in sheet: no protection claim", !/designed for protection/.test(script + html) && /<p id="authModalIntro">Sign in to get AI explanations and Recovery plans\./.test(html));
    const privacyControls = await read("cybernet-privacy-controls.js");
    check("deletion dialog names no website plan", !/\bBusiness\b/.test(privacyControls), (privacyControls.match(/[^.]*\bBusiness\b[^.]*/) || [])[0]);
    check("Recovery shows the guidance / emergency line", /id="cnRecoveryNote">CyberNet AI gives guidance, not legal or financial advice\. If you feel unsafe, contact your local emergency services\./.test(html));
    check("consent sheet tells team members about the owner's log", /You are a member of a team:<\/strong> your AI explanations and Recovery activity also appear in your team owner/.test(iosJs));
    check("Account team note does not mention Quick Scan", /id="cnAcctTeam"[^>]*>[^<]*AI explanations and Recovery activity/.test(html) && !/id="cnAcctTeam"[^>]*>[^<]*Quick Scan/.test(html));

    // The Share Extension's engine bridge (engine.html) gives the same headline as the app for every engine
    // test case (CI's parity run covers the app's WebKit only; this covers the extension's label rules).
    {
      const vm = await import("node:vm");
      const fixtures = JSON.parse(await readFile(path.join(mobile, "tests", "engine-fixtures.json"), "utf8"));
      const bridgeHtml = await readFile(path.join(mobile, "native", "ShareExtension", "engine.html"), "utf8");
      const bridge = [...bridgeHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
      // The extension runs the engine in WebKit, which has WHATWG URL like Node; the vm gets Node's.
      const ctx = vm.createContext({ console, URL, URLSearchParams, TextEncoder, TextDecoder, Intl });
      ctx.window = ctx;
      vm.runInContext(await readFile(path.join(root, "public", "cybernet-engine.js"), "utf8"), ctx);
      vm.runInContext(bridge, ctx);
      const bands = { SCAM: "scam", "CAN'T CONFIRM": "unverified", "LOW RISK": "safe" };
      const diffs = [];
      for (const c of fixtures.cases) {
        const out = JSON.parse(ctx.cnRun(c.type === "link" ? "url" : "text", c.type === "link" ? { url: c.input } : { text: c.input }));
        if (out.headline !== c.headline || out.band !== bands[c.headline]) diffs.push(`${c.id}: extension ${out.band}/${out.headline}, app ${c.headline}`);
      }
      check(`Share Extension labels match the app for all ${fixtures.cases.length} engine cases`, fixtures.cases.length > 500 && diffs.length === 0, diffs.slice(0, 5).join("; "));
      const qr = JSON.parse(ctx.cnRun("image", { qr: "https://parcel-redeliver-help.invalid/pay" }));
      check("Share Extension: the review QR sample reads SCAM", qr.headline === "SCAM", qr);
    }

    // legal pages
    for (const page of ["terms", "privacy", "acceptable-use"]) check(`legal/${page}.html exists`, existsSync(path.join(out, "legal", `${page}.html`)));
    const terms = await read("legal/terms.html");
    const privacy = await read("legal/privacy.html");
    check("Terms: plans/pricing/payments/cancellation/refunds replaced", !/id="(subscriptions|payments|cancellation|refunds)"/.test(terms) && /no paid plans and no purchases/.test(terms));
    check("Terms and Privacy carry the iPhone app section", /id="iphone-app"/.test(terms) && /id="iphone-app"/.test(privacy));
    check("Privacy names the operator", /Marks Events FZ LLE/.test(privacy) && /support@cybernetai\.app/.test(privacy));
    check("Privacy explains analytics only after Allow", /App Tracking Transparency/.test(privacy) && /Google Analytics/.test(privacy));
    check("legal pages have the Back bar and no site header", /cn-ios-legal-bar/.test(terms) && !/cn-legal-page-top/.test(terms));
    check("no cookie-settings button in the app", !/data-cn-consent-open/.test(privacy + html));
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
console.log(`ios bundle: ${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
