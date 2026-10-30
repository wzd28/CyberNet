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
import { fileURLToPath, pathToFileURL } from "node:url";
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

    // Owner, 30 Oct 2026: first and last name are required at email sign-up in the app, as on the
    // website (Sign in with Apple takes the name Apple shares and never asks again).
    let fieldProblem = null;
    try { fieldProblem = new Function("newPasswordEl", [constNamed("EMAIL_PATTERN"), constNamed("MIN_PASSWORD"), constNamed("FIELD_RULES"), fnNamed("fieldProblem")].map(src).join(";\n") + ";\nreturn fieldProblem;")(null); } catch (error) { check("sign-up validator can be run", false, error.message); }
    if (fieldProblem) {
      check("sign-up: an empty first or last name is refused", fieldProblem({ id: "signupFirstName", value: "" }) !== "" && fieldProblem({ id: "signupLastName", value: "" }) !== "" && fieldProblem({ id: "signupFirstName", value: "Ana" }) === "");
      check("sign-up: email and password are still checked", fieldProblem({ id: "signupEmail", value: "" }) !== "" && fieldProblem({ id: "signupPassword", value: "short" }) !== "" && fieldProblem({ id: "signupPassword", value: "long enough" }) === "");
    }
    const metadata = find(n => n.type === "Property" && n.key?.name === "data" && n.value?.type === "ObjectExpression" && /full_name/.test(src(n.value)));
    let names = null;
    try { names = new Function("fullName", "first", "last", `return (${src(metadata?.value)});`); } catch (error) { check("sign-up metadata can be run", false, error.message); }
    if (names) {
      check("sign-up sends the name", JSON.stringify(names("Ana Lima", "Ana", "Lima")) === JSON.stringify({ full_name: "Ana Lima", first_name: "Ana", last_name: "Lima" }));
    }
    const nameInputs = [...html.matchAll(/<input [^>]*id="signup(First|Last)Name"[^>]*>/g)].map(m => m[0]);
    check("sign-up name inputs are in the app and required", nameInputs.length === 2 && nameInputs.every(i => /\brequired\b/.test(i)) && /<label for="signupFirstName">First name<\/label>/.test(html) && /<label for="signupLastName">Last name<\/label>/.test(html), nameInputs);

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

    // Owner, TestFlight build 1: the Check tab offers both Quick Scan and Analysis AI. A segmented control
    // (ios.js section 2) switches the two pages. The markup is cut out of ios.js with acorn and rendered
    // with its own data, then parsed, so this checks what the app really builds.
    {
      const iosAst = acorn.parse(iosJs, { ecmaVersion: "latest", sourceType: "script" });
      const iosSrc = node => (node ? iosJs.slice(node.start, node.end) : "");
      const modesDecl = find(n => n.type === "VariableDeclaration" && n.declarations.some(d => d.id?.name === "CHECK_MODES"), iosAst);
      const tabMap = find(n => n.type === "VariableDeclaration" && n.declarations.some(d => d.id?.name === "PAGE_TAB"), iosAst);
      const markup = find(n => n.type === "TemplateLiteral" && /cn-ios-seg-wrap/.test(iosSrc(n)), iosAst);
      const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      let modes = null, pageTab = null, built = "";
      try { modes = new Function(`${iosSrc(modesDecl)}\nreturn CHECK_MODES;`)(); } catch (error) { check("Check switch: CHECK_MODES can be run", false, error.message); }
      try { pageTab = new Function(`${iosSrc(tabMap)}\nreturn PAGE_TAB;`)(); } catch (error) { check("Check switch: PAGE_TAB can be run", false, error.message); }
      try { built = new Function("CHECK_MODES", "esc", `return ${iosSrc(markup)};`)(modes, esc); } catch (error) { check("Check switch: the markup can be rendered", false, error.message); }
      const P5 = await import(pathToFileURL(createRequire(path.join(mobile, "package.json")).resolve("parse5")).href);
      const frag = P5.parseFragment(built);
      const all = [];
      (function walk(n) { for (const c of n.childNodes || []) { if (c.tagName) all.push(c); walk(c); } })(frag);
      const attr = (n, name) => n.attrs.find(a => a.name === name)?.value;
      const textOf = n => (n.childNodes || []).map(c => c.value ?? textOf(c)).join("");
      const tablist = all.filter(n => attr(n, "role") === "tablist");
      const tabs = all.filter(n => attr(n, "role") === "tab");
      check("Check switch: one tablist with a label for VoiceOver", tablist.length === 1 && !!attr(tablist[0], "aria-label"), built.slice(0, 200));
      check("Check switch: both segments are there, in order: Quick Scan, Analysis AI", tabs.map(textOf).join("|") === "Quick Scan|Analysis AI" && tabs.every(t => t.tagName === "button" && attr(t, "type") === "button"), tabs.map(textOf));
      check("Check switch: segments carry aria-selected and a roving tabindex", tabs.every(t => attr(t, "aria-selected") !== undefined && attr(t, "tabindex") !== undefined));
      check("Check switch: segments point at the Quick Scan and Analysis AI pages", tabs.map(t => attr(t, "aria-controls")).join("|") === "cybernet|cybernetai" && tabs.map(t => attr(t, "data-seg-page")).join("|") === "cybernet|cybernetai");
      check("Check switch: both pages exist in the app's page", /<section id="cybernet" class="page/.test(html) && /<section id="cybernetai" class="page/.test(html));
      check("Check switch: both pages belong to the Check tab", pageTab?.cybernet === "check" && pageTab?.cybernetai === "check", pageTab);
      const hints = Object.fromEntries(all.filter(n => attr(n, "data-seg-hint")).map(n => [attr(n, "data-seg-hint"), { id: attr(n, "id"), text: textOf(n) }]));
      check("Check switch: one short hint per segment, and each segment is described by its own", tabs.every(t => attr(t, "aria-describedby") === hints[attr(t, "data-seg-page")]?.id) && hints.cybernet?.text === "Checks on your iPhone. No account, no AI." && hints.cybernetai?.text === "AI explains it in detail. Sign in required.", hints);
      // The hint says Analysis AI needs an account: sending a message asks for sign-in first.
      check("Analysis AI: sending really requires sign-in (the switch's hint is true)", /function sendChatMessage\(\)\{if\(!isSignedIn\(\)\)\{openAuthModal\("signup"\);return\}/.test(script));
      // Wiring: tabs call navigate(); syncTabs() repaints the switch after any navigation; arrow keys work.
      // (The bundle's ios.js and ios.css are minified, so these compare without whitespace.)
      const squash = text => String(text).replace(/\s+/g, "");
      const fnBody = name => squash(iosSrc(find(n => n.type === "FunctionDeclaration" && n.id?.name === name, iosAst)));
      check("Check switch: a tap navigates with navigate()", /navigate\(page\)/.test(fnBody("openCheckPage")) && /openCheckPage\(page,0\)/.test(fnBody("pickCheckMode")));
      check("Check switch: syncTabs() repaints it, so every navigation is reflected", /syncCheckSwitch\(page\)/.test(fnBody("syncTabs")) && /paintCheckSwitch\(/.test(fnBody("syncCheckSwitch")));
      check("Check switch: it is built at start, before the pages are watched", /buildCheckSwitch\(\);watchPages\(\)/.test(squash(iosJs)));
      check("Check switch: arrow, Home and End keys move the selection", ["ArrowLeft", "ArrowRight", "Home", "End"].every(k => fnBody("buildCheckSwitch").includes(k)));
      check("Check switch: the haptic tick is guarded when the plugin is missing", /functiontick\(\)\{try\{P\("Haptics"\)\?\.impact\(/.test(squash(iosJs)));
      // Styles: pill track, sliding thumb, 44 pt segments, no motion when reduced, no duplicate web link.
      const iosCss = squash(await read("ios/ios.css"));
      const rule = sel => (iosCss.match(new RegExp(`(?:^|[};])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`)) || [])[1] || "";
      check("Check switch CSS: pill track and a thumb that slides", /border-radius:999px/.test(rule(".cn-ios-seg")) && /transition:transform/.test(rule(".cn-ios-seg-thumb")) && /\.cn-ios-seg\[data-active=["']?cybernetai["']?\]\.cn-ios-seg-thumb\{transform:translateX?\(100%\)/.test(iosCss), rule(".cn-ios-seg-thumb"));
      check("Check switch CSS: segments are at least 44 pt tall", /min-height:44px/.test(rule(".cn-ios-seg-btn")), rule(".cn-ios-seg-btn"));
      check("Check switch CSS: no transition under reduced motion", /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.cn-ios-seg-thumb[^}]*transition:none/.test(iosCss));
      check("Check switch CSS: the website's 'try the other tool' link is hidden in the app", /:is\(#cybernet,#cybernetai\)>\.feature-page-header>\.feature-crosslink\{display:none!important\}/.test(iosCss));
      // Analysis AI's header gives the switch's room back, so its message box stays on the first screen (390 x 844:
      // box bottom at y 754, the native tab bar starts near 761).
      const aiRule = tail => (iosCss.match(new RegExp(`\\.cn-ios-seg-wrap:not\\(\\[hidden\\]\\)~#cnMain>#cybernetai${tail.replace(/\s+/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`)) || [])[1] || "";
      check("Check switch CSS: Analysis AI's page padding and header spacing are tightened under the switch", /padding-block-start:(\d|1[0-2])px/.test(aiRule("")) && /margin-bottom:(\d|1[0-4])px/.test(aiRule(".feature-page-header")) && /margin-bottom:(\d|1[0-2])px/.test(aiRule(".cn-edrow")) && /margin-bottom:\d{1,2}px/.test(aiRule(".feature-page-header h1")) && /margin-top:(\d|1[0-6])px/.test(aiRule(".usage-meter-card")), [aiRule(""), aiRule(".feature-page-header"), aiRule(".cn-edrow"), aiRule(".usage-meter-card")]);
      // The Check tab behaves like a native tab: tapping it again keeps the open page (and scrolls to the top);
      // coming from another tab returns to the Check page that was open last. goTab() is run with stubs.
      {
        const decl = find(n => n.type === "VariableDeclaration" && n.declarations.some(d => d.id?.name === "lastCheckPage"), iosAst);
        let gt = null;
        try {
          gt = new Function("TABS", "navigate", "startQrScan", "activePage", "isCheckPage", "scrollToTop", `${iosSrc(decl)}\n${iosSrc(find(n => n.type === "FunctionDeclaration" && n.id?.name === "goTab", iosAst))}\nreturn { goTab, remember: page => { lastCheckPage = page; } };`);
        } catch (error) { check("goTab can be run", false, error.message); }
        if (gt) {
          const tabs = [{ id: "check", page: "cybernet" }, { id: "scan", page: null }, { id: "recovery", page: "recovery" }, { id: "learn", page: "learn" }];
          const run = (current, last, tab) => {
            const log = [];
            const { goTab, remember } = gt(tabs, p => log.push(`navigate:${p}`), () => log.push("qr"), () => current, p => p === "cybernet" || p === "cybernetai", () => log.push("top"));
            if (last) remember(last);
            goTab(tab);
            return log.join(",");
          };
          check("Check tab: tapped again on Analysis AI it stays there and scrolls to the top (it does not jump to Quick Scan)", run("cybernetai", null, "check") === "top" && run("cybernet", null, "check") === "top");
          check("Check tab: from another tab it returns to the Check page that was open last (Quick Scan by default)", run("learn", "cybernetai", "check") === "navigate:cybernetai" && run("account", null, "check") === "navigate:cybernet" && run("recovery", "cybernet", "check") === "navigate:cybernet");
          check("Check tab: the other tabs and Scan QR work as before", run("cybernetai", null, "recovery") === "navigate:recovery" && run("cybernet", null, "learn") === "navigate:learn" && run("cybernet", null, "scan") === "qr");
        }
        check("Check tab: the open Check page is remembered whenever the tabs are synced, and the scroll respects reduced motion", /if\(isCheckPage\(page\)\)lastCheckPage=page/.test(fnBody("syncTabs")) && /w\.scrollTo\(\{top:0,behavior:motionOff\(\)\?"auto":"smooth"\}\)/.test(fnBody("scrollToTop")), fnBody("scrollToTop"));
      }
    }

    // Owner, TestFlight build 1: "just need a onboarding motion screen like the website". ios.js section 7a puts up
    // a stage on a first launch (the website gate's draw, wordmark, typed line and pitch) before the three steps.
    // Its markup and its pure functions are cut out of the built ios.js with acorn and run with their own data.
    {
      const iosAst = acorn.parse(iosJs, { ecmaVersion: "latest", sourceType: "script" });
      const iosSrc = node => (node ? iosJs.slice(node.start, node.end) : "");
      const squash = text => String(text).replace(/\s+/g, "");
      const declOf = name => find(n => n.type === "VariableDeclaration" && n.declarations.some(d => d.id?.name === name), iosAst);
      const fnOf = name => find(n => n.type === "FunctionDeclaration" && n.id?.name === name, iosAst);
      const fnText = name => squash(iosSrc(fnOf(name)));
      const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      let ix = null;
      try {
        ix = new Function("esc", [declOf("IX_SHIELD"), declOf("IX_QUOTE"), declOf("IX_PITCH"), declOf("IX"), fnOf("typingDelays"), fnOf("ixTimes"), fnOf("introStageHtml")].map(iosSrc).join(";\n") + ";\nreturn { IX_SHIELD, IX_QUOTE, IX_PITCH, IX, typingDelays, ixTimes, introStageHtml };")(esc);
      } catch (error) { check("Intro stage: its markup and timing can be run", false, error.message); }
      const iosCssRaw = await read("ios/ios.css");
      const cssSpaced = iosCssRaw.replace(/\s+/g, " ");
      const css = squash(iosCssRaw);
      const rule = sel => (css.match(new RegExp(`(?:^|[};])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`)) || [])[1] || "";
      if (ix) {
        const P5 = await import(pathToFileURL(createRequire(path.join(mobile, "package.json")).resolve("parse5")).href);
        const frag = P5.parseFragment(ix.introStageHtml());
        const all = [];
        (function walk(n) { for (const c of n.childNodes || []) { if (c.tagName) all.push(c); walk(c); } })(frag);
        const attr = (n, name) => n.attrs.find(a => a.name === name)?.value;
        const hasClass = (n, c) => (attr(n, "class") || "").split(/\s+/).includes(c);
        const byClass = c => all.filter(n => hasClass(n, c));
        const textOf = n => (n.childNodes || []).map(c => c.value ?? textOf(c)).join("");
        const stage = all.find(n => attr(n, "id") === "cnIntroStage");
        const mountRaw = iosSrc(fnOf("mountStage"));
        const mount = squash(mountRaw);

        // the stage: a labelled dialog; the typed and drawn parts are decorative; VoiceOver gets the pitch once
        check("Intro stage: one modal dialog named Welcome to CyberNet AI", stage && attr(stage, "role") === "dialog" && attr(stage, "aria-modal") === "true" && attr(stage, "aria-label") === "Welcome to CyberNet AI", stage?.attrs);
        check("Intro stage: the drawn, typed and pitch parts are hidden from VoiceOver, which reads one line", byClass("cn-ix-lockup").concat(byClass("cn-ix-pitch")).every(n => attr(n, "aria-hidden") === "true") && textOf(byClass("cn-ix-sr")[0] || stage) === "CyberNet AI. Stay secure. All in one place. Check, scan and recover.", textOf(byClass("cn-ix-sr")[0] || stage));
        // Skip: a real button, visible text, and the stage itself is the tap target
        const skip = byClass("cn-ix-skip");
        check("Intro stage: a visible Skip button", skip.length === 1 && skip[0].tagName === "button" && attr(skip[0], "type") === "button" && textOf(skip[0]).trim() === "Skip intro", skip.map(textOf));
        check("Intro stage CSS: Skip is at least 44 x 44 pt and sits inside the safe area", /min-width:44px/.test(rule(".cn-ix-skip")) && /min-height:44px/.test(rule(".cn-ix-skip")) && /top:calc\(env\(safe-area-inset-top,0px\)\+6px\)/.test(rule(".cn-ix-skip")) && /env\(safe-area-inset-right/.test(rule(".cn-ix-skip")), rule(".cn-ix-skip"));
        check("Intro stage: a tap anywhere, Escape, Return and Space skip it (the tap is not passed on to the steps)", /node\.addEventListener\("click",\(\) ?=> ?end\(true\)\)/.test(mountRaw) && mountRaw.replace(/ /g, "").includes('e.key==="Escape"||e.key==="Enter"||e.key===""') && /stopImmediatePropagation\(\)/.test(mountRaw), mount.slice(0, 200));
        check("Intro stage: skipping finishes every move at once and goes straight to the steps", /if\(skipped\)node\.classList\.add\("is-end","is-glide","is-quick"\);go\(\)/.test(mount));

        // the website's pitch, with a kicker in the app's own words: it says what the app does and makes no protection claim
        check("Intro stage: the pitch is Stay secure. / All in one place., kicker Check, scan and recover", byClass("cn-ix-line").map(textOf).join("|") === "Stay secure.|All in one place." && textOf(byClass("cn-ix-kicker")[0]) === "Check, scan and recover" && /\.cn-ix-kicker\{[^}]*text-transform:uppercase/.test(css), byClass("cn-ix-line").map(textOf));
        const claimWords = /protect|antivirus|real-?time|\bblocks?\b|monitor|accurate|100%|99%/i; // REJECTION-RISKS B2 (guideline 2.3.1(a))
        check("Intro stage: no protection claim on its first screen (words App Review flags)", !claimWords.test([...ix.IX_PITCH.lines, ix.IX_PITCH.kicker].join(" ")) && !claimWords.test(textOf(byClass("cn-ix-sr")[0] || stage)), ix.IX_PITCH);
        check("Intro stage: the typed line is the website's, every character in its own span, none for spaces", ix.IX_QUOTE.join(" ") === "That message looks real. That\u2019s the point." && byClass("cn-ix-c").map(textOf).join("") === ix.IX_QUOTE.join("").replace(/ /g, "") && byClass("cn-ix-c").length === ix.typingDelays(ix.IX_QUOTE).length, byClass("cn-ix-c").length);
        check("Intro stage: the wordmark is CyberNet AI, letter by letter", byClass("cn-ix-word").length === 1 && textOf(byClass("cn-ix-word")[0]) === "CyberNetAI" && all.filter(n => n.tagName === "span" && /^--i:\d+$/.test(attr(n, "style") || "")).length === 10);

        // the mark is the launch screen's shield: same geometry, colours, size and place, so the hand-over has no jump
        const icon = await readFile(path.join(mobile, "native", "brand", "app-icon.svg"), "utf8");
        const splash = await readFile(path.join(mobile, "native", "brand", "splash.svg"), "utf8");
        const segs = d => d.split(/(?=[MCLAZ])/).map(s => s.trim()).filter(s => s && !/^[MZ]/.test(s));
        const cyclic = (a, b) => a.length === b.length && a.some((_, i) => a.map((__, k) => a[(i + k) % a.length]).join("|") === b.join("|"));
        const iconShield = /<path d="(M512 176[^"]+)"/.exec(icon)?.[1] || "";
        check("Intro stage: the shield outline is the app icon's shield, drawn from the bottom point", cyclic(segs(iconShield), segs(ix.IX_SHIELD)) && /^M512 856 /.test(ix.IX_SHIELD) && /Z$/.test(ix.IX_SHIELD), ix.IX_SHIELD);
        const lockParts = ['d="M436 486 L436 428 A76 76 0 0 1 588 428 L588 486"', 'x="384" y="472" width="256" height="196" rx="34"', 'cx="512" cy="550" r="27"', 'd="M498 560 L526 560 L534 620 L490 620 Z"'];
        check("Intro stage: the lock is the launch screen's lock", lockParts.every(p => icon.includes(p) && splash.includes(p) && ix.introStageHtml().includes(p)));
        check("Intro stage: the launch screen's colours (#060a14 ground, #67e8f9 to #22d3ee mark, 48-unit outline)", ix.introStageHtml().includes('stop-color="#67e8f9"') && ix.introStageHtml().includes('stop-color="#22d3ee"') && /background:#060a14/.test(rule(".cn-ix")) && /fill="#060a14"/.test(splash) && /stroke-width="48"/.test(ix.introStageHtml()));
        // splash.svg: a 2732 square with the 1024-unit mark at scale .62, centred on (512, 516); shown aspect-fill, so one
        // unit is max(width, height) * .62 / 2732 px, which is what the stage's --ix-u says. Its viewBox is the shield's box.
        const vb = /viewBox="(\d+) (\d+) (\d+) (\d+)"/.exec(ix.introStageHtml()).slice(1).map(Number);
        check("Intro stage: same size and place as the launch screen's shield", /width="2732"/.test(splash) && /scale\(0\.62\) translate\(-512 -516\)/.test(splash) && vb[0] + vb[2] / 2 === 512 && vb[1] + vb[3] / 2 === 516 && /--ix-u:calc\(max\(100vw,100vh\)\*\.62\/2732\)/.test(rule(".cn-ix")) && /--ix-mw:calc\(var\(--ix-u\)\*584\)/.test(rule(".cn-ix")) && vb[2] === 584 && /--ix-mh:calc\(var\(--ix-u\)\*732\)/.test(rule(".cn-ix")) && vb[3] === 732, vb);
        check("Intro stage CSS: the first frame is the launch screen (no entry fade on a first launch, only on a replay)", /\.cn-ix\.is-fade\{animation:cn-ix-in/.test(css) && !/\.cn-ix\{[^}]*animation:/.test(css) && /node\.classList\.add\("is-fade"\)/.test(mount) && /fadeIn/.test(mount) && /mountStage\(true\)/.test(fnText("showIntro")) && /mountStage\(false\)/.test(fnText("prepareIntro")));

        // timing: one move at a time, steady typing, 5 to 7 s before the steps, a calm hold when motion is off
        const t = ix.ixTimes(), delays = ix.typingDelays(ix.IX_QUOTE);
        check("Intro timing: the beats come in order", t.type < t.typed && t.typed < t.read && t.read < t.glide && t.glide < t.pitch && t.pitch < t.steps, t);
        check("Intro timing: the steps come 5 to 7 s in (about 6.7 s)", t.steps >= 5000 && t.steps <= 7000, t);
        check("Intro timing: typing is steady, never faster than one character in 30 ms, and takes 1.2 to 2.5 s", Math.min(...delays) >= 30 && t.typed - t.type < 2500 && t.typed - t.type > 1200, delays);
        check("Intro timing: the typing starts after the draw (1.9 s) has landed", t.type >= 1900, t.type);
        check("Intro timing: reduced motion shows the end frame for 2 to 3 s, then the steps", ix.IX.calm >= 2000 && ix.IX.calm <= 3000, ix.IX.calm);
        check("Intro timing: the quote is held 0.3 s or more before it leaves, and the pitch (1.45 s to land) stays 0.6 s or more before the steps", ix.IX.hold >= 300 && ix.IX.show - 1450 >= 600, ix.IX);
        // The wordmark glides up through the place where the pitch sits. On the tallest iPhone screen it has cleared
        // the pitch 0.73 s into the 1 s glide (cubic-bezier(.65,0,.35,1)); the pitch must not start rising before that.
        check("Intro timing: the pitch rises only after the wordmark has glided past it (no two texts over each other)", t.pitch - t.glide >= 740 && t.pitch - t.glide <= 1000 && /constglide=read\+IX\.glide,pitch=glide\+IX\.pitch/.test(squash(iosSrc(fnOf("ixTimes")))), t);

        // reduced motion and Pause motion: no drawing, typing or sliding; the same final layout, faded in
        let off = null;
        try { off = new Function("root", "w", `${iosSrc(declOf("motionOff"))};\nreturn motionOff;`); } catch (error) { check("motionOff can be run", false, error.message); }
        if (off) {
          const still = off({ classList: { contains: c => c === "cn-still" } }, {});
          const reduce = off({ classList: { contains: () => false } }, { matchMedia: q => ({ matches: /reduce/.test(q) }) });
          const normal = off({ classList: { contains: () => false } }, { matchMedia: () => ({ matches: false }) });
          const bare = off({ classList: { contains: () => false } }, {});
          check("Reduced motion: prefers-reduced-motion and the app's Pause motion both switch the motion off", still() === true && reduce() === true && normal() === false && bare() === false);
        }
        check("Reduced motion: the stage opens on its end frame (no typing, only the hold), then shows the steps", /constcalm=motionOff\(\)/.test(mount) && /if\(calm\)node\.classList\.add\("is-calm","is-glide","is-pitch"\)/.test(mount) && /if\(calm\)wait\(\(\)=>end\(false\),IX\.calm\)/.test(mount) && /typeNext/.test(mount.split("if(calm)wait")[1] || "") && !/typeNext/.test(mount.split("if(calm)wait")[0]), mount.slice(0, 300));
        check("Reduced motion CSS: every entry animation and transition is off, in the media query and under Pause motion", /@media\(prefers-reduced-motion:reduce\)\{\.cn-ix\*,\.cn-ix\*:before,\.cn-ix\*:after\{animation:none!important;transition:none!important\}/.test(css) && /html\.cn-still\.cn-ix\*,html\.cn-still\.cn-ix\*:before,html\.cn-still\.cn-ix\*:after\{animation:none!important;transition:none!important\}/.test(css));
        check("Reduced motion CSS: the end frame fades in (a cover of the stage's own colour fades out) and the layout is the final one", /\.cn-ix\.is-calm:after\{[^}]*animation:cn-ix-uncover/.test(css) && /@keyframescn-ix-uncover\{to\{opacity:0\}\}/.test(css) && /\.cn-ix\.is-glide \.cn-ix-lockup\{transform:translateY/.test(cssSpaced) && /\.cn-ix:is\(\.is-end,\.is-calm\):is\(/.test(css));

        // smooth on an iPhone: only transform, opacity and stroke-dashoffset move; no filter or blur
        const frames = [...css.matchAll(/@keyframes(cn-ix-[\w-]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
        const animated = new Set();
        for (const f of frames) for (const decl of f[2].matchAll(/(?:^|[{;])([\w-]+):/g)) if (decl[1] !== "animation-timing-function") animated.add(decl[1]);
        check("Intro stage CSS: it has its keyframes", frames.length >= 12, frames.map(f => f[1]));
        check("Intro stage CSS: only transform, opacity and stroke-dashoffset are animated", [...animated].every(p => ["transform", "opacity", "stroke-dashoffset"].includes(p)), [...animated]);
        const stageRules = [...css.matchAll(/(?:^|[};])([^{}@]*\.cn-ix[^{}]*)\{([^}]*)\}/g)];
        check("Intro stage CSS: no filter and no backdrop blur anywhere in it", stageRules.length > 20 && stageRules.every(r => !/(^|[;{])(-webkit-)?(backdrop-)?filter:|blur\(/.test(r[2])), stageRules.length);
        check("Intro stage CSS: transitions only move transform and opacity (and the Skip tap colour)", stageRules.every(r => [...r[2].matchAll(/(?:^|;)transition:([^;]*)/g)].every(m => m[1].split(",").every(part => /^(none|transform|opacity|background-color)/.test(part)))), stageRules.map(r => r[2].match(/transition:[^;]*/)?.[0]).filter(Boolean));
        const zOf = sel => Number(/z-index:(\d+)/.exec(rule(sel))?.[1]);
        check("Intro stage CSS: the stage sits above the tab bar and the page but under the steps (z-index)", zOf(".cn-ix") > 900 && zOf(".cn-ix") < zOf(".cn-ios-sheet-backdrop"), [zOf(".cn-ix"), zOf(".cn-ios-sheet-backdrop")]);
        check("Intro stage CSS: the status bar is cleared (the mark glides to env(safe-area-inset-top) + 22px)", /--ix-top:calc\(env\(safe-area-inset-top,0px\)\+22px\)/.test(rule(".cn-ix")));
        check("Intro stage CSS: the pitch stays above the steps on a tall screen, and fades away on a short one", /(?:^|\})\.cn-ix\.is-steps\.cn-ix-pitch\{opacity:0;transform:translateY\(-8px\)\}/.test(css) && /@media\(min-height:760px\)\{\.cn-ix\.is-steps\.cn-ix-pitch\{opacity:1;transform:none\}\}/.test(css));
        check("Intro stage CSS: the steps rise slowly over the bright stage", /\.cn-ios-sheet-backdrop\.cn-ix-over\.is-open\{background:(rgba\(2,6,14,0\)|#02060e00|#0000)\}/.test(css) && /\.cn-ios-sheet-backdrop\.cn-ix-over\.is-open \.cn-ios-sheet\{transition-duration:\.6s/.test(cssSpaced) && /overStage\)panel\.parentNode\.classList\.add\("cn-ix-over"\)/.test(fnText("introSheet")));

        // first launch, returning users, links and shared items
        const lt = new Function("P", `${iosSrc(fnOf("launchTarget"))};\nreturn launchTarget;`);
        const hours = h => new Date(Date.now() - h * 3600e3).toISOString();
        const plug = o => name => o[name] || null;
        const never = () => new Promise(() => {});
        const timeout = (promise, ms = 200) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve("timeout"), ms))]);
        check("Launch: a link that opened the app skips the motion", (await lt(plug({ App: { getLaunchUrl: async () => ({ url: "https://cybernetai.app/x" }) } }))()) === true);
        check("Launch: a fresh shared item skips the motion, a day-old one does not", (await lt(plug({ SharedInbox: { read: async () => ({ items: [{ createdAt: hours(1) }] }) } }))()) === true && (await lt(plug({ SharedInbox: { read: async () => ({ items: [{ createdAt: hours(30) }] }) } }))()) === false);
        check("Launch: nothing opened the app, or no plugins at all (a desktop preview): the motion plays", (await lt(plug({ App: { getLaunchUrl: async () => undefined }, SharedInbox: { read: async () => ({ items: [] }) } }))()) === false && (await lt(plug({}))()) === false && (await lt(plug({ App: { getLaunchUrl: async () => { throw new Error("no"); } } }))()) === false);
        check("Launch: a plugin that never answers hides nothing (a shared item still counts) and the wait is capped at 450 ms", (await timeout(lt(plug({ App: { getLaunchUrl: never }, SharedInbox: { read: async () => ({ items: [{ createdAt: hours(1) }] }) } }))())) === true && (await timeout(lt(plug({ App: { getLaunchUrl: never } }))(), 80)) === "timeout" && /Promise\.race\(\[launchTarget\(\),newPromise\(resolve=>setTimeout\(\(\)=>resolve\(false\),450\)\)\]\)/.test(fnText("prepareIntro")));
        const startText = fnText("start");
        check("Launch: a returning user is not delayed (nothing is awaited, the launch screen hides as before)", /^asyncfunctionprepareIntro\(\)\{if\(store\.get\(INTRO_KEY\)\)return;/.test(fnText("prepareIntro")) && /if\(store\.get\(INTRO_KEY\)\)hideSplash\(\);elseprepared\.then\(hideSplash\)/.test(startText) && /requestAnimationFrame\(\(\)=>requestAnimationFrame\(\(\)=>P\("SplashScreen"\)/.test(startText) && /later\(\(\)=>P\("SplashScreen"\)\?\.hide\(\)\.catch\(\(\)=>\{\}\),3e3\)/.test(startText), startText.slice(0, 300));
        check("Launch: with a link or a shared item the steps come as a plain sheet, and a replay always gets the motion", /if\(target\)\{introPlain=true;return\}/.test(fnText("prepareIntro")) && /if\(force\|\|!introPlain\)/.test(fnText("showIntro")) && /introSheet\(!!stage\)/.test(fnText("showIntro")));
        check("Launch: after the intro the app goes on as before (tracking prompt, then the shared-item sheet)", squash(iosJs).includes("awaitprepared;if(first)awaitshowIntro();awaitstartTracking(true);checkInbox()"));
        check("Launch: the intro key is unchanged", /INTRO_KEY\s*=\s*"cn-ios-intro-1"/.test(iosJs));
        let steps = null;
        try { steps = new Function(`${iosSrc(declOf("INTRO"))};\nreturn INTRO;`)(); } catch (error) { check("INTRO can be run", false, error.message); }
        check("Launch: the steps say what they said (3 steps, same titles)", steps?.map(s => s.title).join("|") === "Check a text or link|Scan a QR code before you open it|Share to CyberNet AI" && /^Paste a message or a link into Check\./.test(steps[0].text), steps?.map(s => s.title));
        check("Launch: the key is stored once the steps are closed and the stage has left", /\.then\(value=>\{store\.set\(INTRO_KEY,String\(Date\.now\(\)\)\);returnvalue\}\)/.test(fnText("showIntro")) && /finally\{if\(stage\)awaitstage\.leave\(\)\}/.test(fnText("showIntro")));
        check("Launch: Show the welcome tips again replays it (showIntro(true))", /data-ios-action="intro"/.test(await read("index.html")) && /action==="intro"\)showIntro\(true\)/.test(squash(iosJs)));
        check("Native tab bar: hidden under the stage, given back when it has left (also if the steps never came)", /if\(nativeTabs\)\{tabsHidden=true;nativeTabs\.setHidden\(\{hidden:true\}\)/.test(mount) && /showTabs=\(\)=>\{if\(tabsHidden\)\{tabsHidden=false;nativeTabs\?\.setHidden\(\{hidden:false\}\)/.test(mount) && /leave\(\)\{end\(true\);returnnewPromise\(resolve=>\{node\.classList\.add\("is-out"\);later\(\(\)=>\{node\.remove\(\);showTabs\(\);refocus\(\);resolve\(\)\}/.test(mount));
        // Focus: the sheet can only hand focus back to the stage's own Skip (which is gone by then), so the stage
        // remembers what had focus before it (the Account row on a replay) and gives it back when it leaves.
        check("Intro stage: what had focus before it gets focus back when it leaves (a replay returns to the Account row)", mount.indexOf("constback=d.activeElement") > -1 && mount.indexOf("constback=d.activeElement") < mount.indexOf('$(".cn-ix-skip",node).focus') && /constrefocus=\(\)=>\{try\{if\(back\?\.isConnected&&back!==d\.body\)back\.focus\(\{preventScroll:true\}\)\}catch/.test(mount), mount.slice(0, 400));
        check("Intro stage: it is inert and hidden from VoiceOver when the steps (the dialog now) take over", /toSteps\(\)\{node\.classList\.add\("is-steps"\);node\.setAttribute\("aria-hidden","true"\);node\.inert=true/.test(mount));
        check("Intro stage: no inline script and no remote file in its markup (the gate checks the rest)", !/<script/.test(ix.introStageHtml()) && !/https?:\/\//.test(ix.introStageHtml()));
      }
    }

    // Copy rules on app screens: no protection claim on the sign-in sheet, no website plan names in the
    // deletion dialog, and the Recovery disclaimer (risk D3).
    // (ios.js is scanned too: the first-run intro once carried the phrase on the app's very first screen.)
    check("sign-in sheet: no protection claim", !/designed for protection/i.test(script + html + iosJs) && /<p id="authModalIntro">Sign in to get AI explanations and Recovery plans\./.test(html));
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
