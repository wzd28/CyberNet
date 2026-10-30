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
    // The website's sign-in gate (its stage, its head snippet) is not in the app's page. Since 30 Oct 2026 the app has its own gate: a sign-in card that ios.js builds (tested below).
    check("the website's sign-in gate (cnGateStage, html.cn-gate) is not in the page; the app's own card is built by ios.js", !/cnGateStage|cn-gate-stage|html\.cn-gate|classList\.add\("cn-gate"\)/.test(html));
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
      check("Check switch: one short hint per segment, and each segment is described by its own (the markup starts from the signed-in text; the guest text is tested below)", tabs.every(t => attr(t, "aria-describedby") === hints[attr(t, "data-seg-page")]?.id) && hints.cybernet?.text === "Checks on your iPhone. No account, no AI." && hints.cybernetai?.text === "AI explains it in detail.", hints);
      // The hint says Analysis AI needs an account: sending a message asks for sign-in first.
      check("Analysis AI: sending really requires sign-in (the guest hint, Sign in to use Analysis AI., is true)", /function sendChatMessage\(\)\{if\(!isSignedIn\(\)\)\{openAuthModal\("signup"\);return\}/.test(script));
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
        // 30 Oct 2026 (review): a skip also adds is-pitch, so the pitch is there behind the card (is-end already stops its entry animation); before, the band between the wordmark and the card stayed empty
        check("Intro stage: skipping finishes every move at once (the pitch included, so the card never stands over an empty band) and goes straight to the steps", /if\(skipped\)node\.classList\.add\("is-end","is-glide","is-pitch","is-quick"\);go\(\)/.test(mount) && /\.cn-ix:is\(\.is-end,\.is-calm\):is\([^)]*\.cn-ix-line,\.cn-ix-rule,\.cn-ix-kicker/.test(css), mount.slice(0, 200));

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
        // 30 Oct 2026 (review): the pitch no longer follows a screen-height guess (min-height: 760px was written for the 3-step sheet; the card is about 100 px taller and hid the kicker on 375 x 812). ios.js fitPitch() measures the sheet and sets has-room (all of the pitch) or has-lines (the two lines only).
        check("Intro stage CSS: the pitch steps aside when a sheet rises over the stage, and stays (all of it, or only its two lines) when fitPitch() found room for it; no screen-height guess", /(?:^|\})\.cn-ix\.is-steps\.cn-ix-pitch\{opacity:0;transform:translateY\(-8px\)\}/.test(css) && /\.cn-ix\.is-steps:is\(\.has-lines,\.has-room\)\.cn-ix-pitch\{opacity:1;transform:none\}/.test(css) && /\.cn-ix\.is-steps\.has-lines:not\(\.has-room\):is\(\.cn-ix-rule,\.cn-ix-kicker\)\{opacity:0\}/.test(css) && /\.cn-ix-rule,\.cn-ix-kicker\{transition:opacity/.test(css) && !/@media\(min-height:760px\)/.test(css));
        check("Intro stage CSS: the steps rise slowly over the bright stage", /\.cn-ios-sheet-backdrop\.cn-ix-over\.is-open\{background:(rgba\(2,6,14,0\)|#02060e00|#0000)\}/.test(css) && /\.cn-ios-sheet-backdrop\.cn-ix-over\.is-open \.cn-ios-sheet\{transition-duration:\.6s/.test(cssSpaced) && /overStage\)riseOverStage\(panel\)/.test(fnText("introSheet")) && /^functionriseOverStage\(panel\)\{panel\.parentNode\.classList\.add\("cn-ix-over"\);fitPitch\(panel\)\}/.test(fnText("riseOverStage")));

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
        // Changed 30 Oct 2026: a returning user's launch screen now waits for the session check (prepareGate, section 7d), because a signed-out person gets the short gate and nothing may flash first. The wait is the Keychain read: milliseconds, 1.2 s at most.
        check("Launch: a returning user's launch screen hides as soon as the session check has answered (1.2 s at most, usually milliseconds); no gate for someone signed in", /^asyncfunctionprepareGate\(\)\{if\(awaitsessionKnown\(\)!==false\)return;/.test(fnText("prepareGate")) && /constprepared=\(first\?prepareIntro\(\):prepareGate\(\)\)/.test(startText) && /prepared\.then\(hideSplash\)/.test(startText) && /requestAnimationFrame\(\(\)=>requestAnimationFrame\(\(\)=>P\("SplashScreen"\)/.test(startText) && /later\(\(\)=>P\("SplashScreen"\)\?\.hide\(\)\.catch\(\(\)=>\{\}\),3e3\)/.test(startText) && /^asyncfunctionprepareIntro\(\)\{if\(store\.get\(INTRO_KEY\)\)return;/.test(fnText("prepareIntro")), startText.slice(0, 300));
        check("Launch: with a link or a shared item the steps come as a plain sheet, and a replay always gets the motion", /if\(target\)\{introPlain=true;return\}/.test(fnText("prepareIntro")) && /if\(force\|\|!introPlain\)/.test(fnText("showIntro")) && /introSheet\(!!stage\)/.test(fnText("showIntro")));
        check("Launch: after the intro (or the short gate) the app goes on as before (tracking prompt, then the shared-item sheet)", squash(iosJs).includes("awaitprepared;if(first)awaitshowIntro();elseawaitshowGate();awaitstartTracking(true);checkInbox()"));
        check("Launch: the intro key is unchanged", /INTRO_KEY\s*=\s*"cn-ios-intro-1"/.test(iosJs));
        let steps = null;
        try { steps = new Function(`${iosSrc(declOf("INTRO"))};\nreturn INTRO;`)(); } catch (error) { check("INTRO can be run", false, error.message); }
        check("Launch: the steps say what they said (3 steps, same titles)", steps?.map(s => s.title).join("|") === "Check a text or link|Scan a QR code before you open it|Share to CyberNet AI" && /^Paste a message or a link into Check\./.test(steps[0].text), steps?.map(s => s.title));
        check("Launch: the key is stored once the steps are closed and the stage has left", /\.then\(value=>\{store\.set\(INTRO_KEY,String\(Date\.now\(\)\)\);returnvalue\}\)/.test(fnText("showIntro")) && /finally\{if\(stage\)awaitstage\.leave\(\)\}/.test(fnText("showIntro")));
        check("Launch: Show the welcome tips again replays it (showIntro(true))", /data-ios-action="intro"/.test(await read("index.html")) && /action==="intro"\)showIntro\(true\)/.test(squash(iosJs)));
        check("Native tab bar: hidden under the stage, given back when it has left (also if the steps never came)", /if\(nativeTabs\)\{tabsHidden=true;nativeTabs\.setHidden\(\{hidden:true\}\)/.test(mount) && /showTabs=\(\)=>\{if\(tabsHidden\)\{tabsHidden=false;nativeTabs\?\.setHidden\(\{hidden:false\}\)/.test(mount) && /leave\(\)\{end\(true\);returnnewPromise\(resolve=>\{node\.classList\.add\("is-out"\);later\(\(\)=>\{node\.remove\(\);showTabs\(\);refocus\(\);resolve\(\)\}/.test(mount));
        // Focus: the sheet can only hand focus back to the stage's own Skip (which is gone by then), so the stage
        // remembers what had focus before it (the Account row on a replay) and gives it back when it leaves.
        check("Intro stage: what had focus before it gets focus back when it leaves (a replay returns to the Account row)", mount.indexOf("constback=d.activeElement") > -1 && mount.indexOf("constback=d.activeElement") < mount.indexOf('$(".cn-ix-skip",node)).focus') && /constrefocus=\(\)=>\{try\{if\(back\?\.isConnected&&back!==d\.body\)back\.focus\(\{preventScroll:true\}\)\}catch/.test(mount), mount.slice(0, 400));
        check("Intro stage: it is inert and hidden from VoiceOver when the steps (the dialog now) take over", /toSteps\(\)\{node\.classList\.add\("is-steps"\);node\.setAttribute\("aria-hidden","true"\);node\.inert=true/.test(mount));
        check("Intro stage: no inline script and no remote file in its markup (the gate checks the rest)", !/<script/.test(ix.introStageHtml()) && !/https?:\/\//.test(ix.introStageHtml()));
      }
    }

    // Owner, 30 Oct 2026: "the app must open like the website: motion intro, then a sign-in card". Apple guideline 5.1.1(v) forbids
    // forcing a sign-in for features that are not account-based, so the card has a small "Continue without an account" that
    // unlocks Quick Scan, QR, Share results and Learn; Analysis AI and Recovery need an account. The card's markup and the pure
    // functions are cut out of the built ios.js with acorn and run with their own data; the flows are run with stubs.
    {
      const iosAst = acorn.parse(iosJs, { ecmaVersion: "latest", sourceType: "script" });
      const iosSrc = node => (node ? iosJs.slice(node.start, node.end) : "");
      const squash = text => String(text).replace(/\s+/g, "");
      const declOf = name => find(n => n.type === "VariableDeclaration" && n.declarations.some(d => d.id?.name === name), iosAst);
      const fnOf = name => find(n => n.type === "FunctionDeclaration" && n.id?.name === name, iosAst);
      const fnText = name => squash(iosSrc(fnOf(name)));
      const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      // run(["names of declarations or functions"], ["stub parameters"], "expression to return", ...stubs)
      const run = (names, params, ret, ...stubs) => new Function(...params, `${names.map(n => iosSrc(declOf(n) || fnOf(n))).join(";\n")};\nreturn ${ret};`)(...stubs);
      const never = () => new Promise(() => {});
      const P5 = await import(pathToFileURL(createRequire(path.join(mobile, "package.json")).resolve("parse5")).href);
      const parse = markup => { const all = []; (function walk(n) { for (const c of n.childNodes || []) { if (c.tagName) all.push(c); walk(c); } })(P5.parseFragment(markup)); return all; };
      const attr = (n, name) => n.attrs.find(a => a.name === name)?.value;
      const textOf = n => (n.childNodes || []).map(c => c.value ?? textOf(c)).join("");
      const css = squash(await read("ios/ios.css"));
      const rule = sel => (css.match(new RegExp(`(?:^|[};])${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`)) || [])[1] || "";
      const claimWords = /protect|antivirus|real-?time|\bblocks?\b|monitor|accurate|100%|99%/i; // REJECTION-RISKS B2 (guideline 2.3.1(a))
      const { wordHits } = await import(pathToFileURL(path.join(mobile, "scripts", "check-bundle.mjs")).href);

      // ---- the card: Sign in with Apple first and as large as the others, then Google (30 Oct 2026), email and Create account, then the guest link
      let card = null;
      try { card = run(["GATE_LEAD", "GUEST_LABEL", "GUEST_NOTE", "ACCOUNT_LEADS", "APPLE_LOGO", "GOOGLE_LOGO", "SIGNIN_MSG", "signInChoicesHtml", "signInCardHtml"], ["esc"], "{ GATE_LEAD, GUEST_LABEL, GUEST_NOTE, ACCOUNT_LEADS, signInChoicesHtml, signInCardHtml }", esc); } catch (error) { check("Sign-in card: its markup can be run", false, error.message); }
      let pages = null;
      try { pages = run(["ACCOUNT_PAGES"], [], "ACCOUNT_PAGES"); } catch (error) { check("ACCOUNT_PAGES can be run", false, error.message); }
      if (card) {
        const launch = parse(card.signInCardHtml({ title: "Sign in to CyberNet AI", launch: true, lead: card.GATE_LEAD }));
        const guest = parse(card.signInCardHtml({ title: "Sign in to use Analysis AI", launch: false, lead: card.ACCOUNT_LEADS.cybernetai }));
        const buttons = all => all.filter(n => n.tagName === "button");
        const choices = all => all.filter(n => attr(n, "data-signin"));
        const apple = choices(launch)[0];
        check("Sign-in card: Sign in with Apple is the first button, first in focus order and the card's autofocus", choices(launch).map(n => attr(n, "data-signin")).join("|") === "apple|google|email|create" && buttons(launch)[0] === apple && attr(apple, "id") === "cnGateApple" && attr(apple, "data-autofocus") !== undefined && textOf(apple).trim() === "Sign in with Apple", buttons(launch).map(textOf));
        check("Sign-in card: Sign in with Google, Sign in with email and Create account follow, all real buttons", choices(launch).map(n => textOf(n).trim()).join("|") === "Sign in with Apple|Sign in with Google|Sign in with email|Create account" && choices(launch).every(n => n.tagName === "button" && attr(n, "type") === "button"));
        check("Sign-in card: the heading and the approved sign-in line", launch.find(n => n.tagName === "h2" && attr(n, "id") === "cnSignInTitle") && textOf(launch.find(n => n.tagName === "h2")) === "Sign in to CyberNet AI" && textOf(launch.find(n => /gate-lead/.test(attr(n, "class") || ""))) === card.GATE_LEAD && html.includes(`<p id="authModalIntro">${card.GATE_LEAD}`), card.GATE_LEAD);
        const guestLink = launch.find(n => attr(n, "data-gate") === "guest");
        const note = launch.find(n => /gate-note/.test(attr(n, "class") || ""));
        check("Sign-in card: under it a small text link Continue without an account, and the one-line note", guestLink?.tagName === "button" && /\bcn-ios-link-btn\b/.test(attr(guestLink, "class")) && textOf(guestLink) === "Continue without an account" && textOf(note) === "Quick Scan, QR, Share and Learn work without one." && buttons(launch).indexOf(guestLink) > buttons(launch).indexOf(choices(launch)[3]), [textOf(guestLink || {}), textOf(note || {})]);
        check("Sign-in card: a guest's card (Analysis AI, Recovery) has Not now instead, and no guest link", !guest.some(n => attr(n, "data-gate") === "guest") && textOf(guest.find(n => attr(n, "data-gate") === "cancel")) === "Not now" && textOf(guest.find(n => n.tagName === "h2")) === "Sign in to use Analysis AI");
        check("Sign-in card: the page names are Analysis AI and Recovery, and the card is titled with them", pages && Object.keys(pages).join("|") === "cybernetai|recovery" && pages.cybernetai === "Analysis AI" && pages.recovery === "Recovery" && /Signintouse\$\{ACCOUNT_PAGES\[page\]\}/.test(fnText("signInCard")), pages);
        check("Sign-in card: a new Apple or Google account agrees to the Terms and Privacy Policy through the note under the buttons", launch.filter(n => /^(terms|privacy)$/.test(attr(n, "data-open-legal") || "")).length === 2 && /By continuing with Apple or Google you agree to the/.test(textOf(launch.find(n => /apple-note/.test(attr(n, "class") || "")))));
        check("Sign-in card: a message line (role alert, hidden until used) for errors and the offline note", launch.some(n => attr(n, "data-signin-msg") !== undefined && attr(n, "role") === "alert" && attr(n, "hidden") !== undefined));
        // 30 Oct 2026 (review): the card sits on the screen's bottom edge and grows upward, so a message line under the buttons pushed them up under the finger that had just tapped one. On the card the line is above the buttons (only the heading moves); on the Account tab, where the page grows downward, it stays under them.
        const order = nodes => nodes.filter(n => attr(n, "data-signin-msg") !== undefined || attr(n, "data-signin") === "apple").map(n => (attr(n, "data-signin-msg") !== undefined ? "msg" : "apple")).join("|");
        const acct = parse(card.signInChoicesHtml("cnAcct"));
        check("Sign-in card: the message line is above the buttons on the card (so they stay where the finger is) and under them on the Account tab; one line each", order(launch) === "msg|apple" && order(guest) === "msg|apple" && order(acct) === "apple|msg", [order(launch), order(guest), order(acct)]);
        const leads = pages ? Object.keys(pages).map(k => card.ACCOUNT_LEADS[k]) : [];
        check("Sign-in card: a guest's card says what its page does instead of repeating its heading; the launch card keeps the approved line", leads.length === 2 && leads.every(l => l && !/^Sign in/i.test(l)) && textOf(guest.find(n => /gate-lead/.test(attr(n, "class") || ""))) === card.ACCOUNT_LEADS.cybernetai && /constlead=\(?page&&ACCOUNT_LEADS\[page\]\)?\|\|GATE_LEAD/.test(fnText("signInCard")), leads);
        check("Sign-in card: no inline script and no remote file in the markup", !launch.some(n => n.tagName === "script" || /^https?:/.test(attr(n, "src") || attr(n, "href") || "")));
        // wording: App Review 2.3.1(a) (REJECTION-RISKS B2); the gate's own word list runs over every string the card and the hints show
        const strings = [card.GATE_LEAD, card.GUEST_LABEL, card.GUEST_NOTE, "Sign in to CyberNet AI", "Sign in to use Analysis AI", "Sign in to use Recovery", "Not now", ...launch.concat(guest).map(n => n.childNodes.filter(c => c.nodeName === "#text").map(c => c.value).join(" ")),
          ...Object.values(card.ACCOUNT_LEADS), ...run(["INTRO"], [], "INTRO.flatMap(s => [s.text, s.guest || ''])"),
          ...run(["OFFLINE_GATE", "OFFLINE_SIGNIN"], [], "[OFFLINE_GATE, OFFLINE_SIGNIN]"), ...run(["AI_GREETING"], [], "[AI_GREETING]"), ...run(["CHECK_MODES"], [], "CHECK_MODES.flatMap(m => [m.hint, m.guestHint || ''])")].filter(Boolean);
        check("Sign-in card: no protection claim and no word the gate refuses, in the card, the hints, the offline notes or the Analysis AI greeting", strings.every(s => !claimWords.test(s) && wordHits(s, { file: "ios/ios.js" }).length === 0), strings.filter(s => claimWords.test(s) || wordHits(s, { file: "ios/ios.js" }).length)); // worded as ios.js is gated: Sign in with Google is the one Google term allowed, and only in this file
      }
      check("Sign in with Apple: the native call exists once (scopes email, fullName); the sign-in dialog, the card and the Account block all go through signInWithApple()", (squash(iosJs).match(/apple\.signIn\(\{scopes:\["email","fullName"\]/g) || []).length === 1 && /signInWithApple\(b,\{view:"login",say\}\)/.test(fnText("wireSignIn")) && squash(iosJs).includes('signInWithApple($("#cnAppleBtn"))') && /asyncfunctionsignInWithApple\(button,\{view=\$\("#authModal"\)\?\.dataset\.authView\|\|"login",say=authMessage\}=\{\}\)/.test(fnText("signInWithApple")));
      check("Sign in with Apple: the card and the Account block say \"login\", so a leftover Create Account view in the dialog never blocks them", /view:"login"/.test(fnText("wireSignIn")) && !/legalError\(\)/.test(fnText("wireSignIn")));

      // ---- who sees what at launch
      const gate = run(["launchGate"], [], "launchGate");
      check("Launch: signed out on a first launch gets the card after the motion; on a later launch the short gate", gate(true, false, false) === "first" && gate(false, false, false) === "short");
      check("Launch: signed in, or no answer from the session check in time: no gate, on either launch", gate(true, true, false) === "none" && gate(false, true, false) === "none" && gate(true, null, false) === "none" && gate(false, null, false) === "none");
      check("Launch: opened by a link or a shared item: no gate, so the shared item is handled and a guest may use it", gate(true, false, true) === "none" && gate(false, false, true) === "none");
      check("Launch: sign out (the page reloads) and a deleted account (storage cleared, page reloads) come back as a later launch, signed out: the short gate", gate(false, false, false) === "short");
      const pcJs = await read("cybernet-privacy-controls.js");
      check("Launch: sign out reloads the app, and neither it nor the account clean-up forgets the intro (so it is the short gate, never the first-launch motion again)", /w\.location\.replace\("index\.html"\)/.test(fnText("signOut")) && !/INTRO_KEY/.test(fnText("signOut") + fnText("nativeCleanupAfterDeletion")) && !/store\.del\(INTRO_KEY\)/.test(squash(iosJs)) && /if\(\/\^cybernet\/i\.test\(key\)\)/.test(pcJs) && /INTRO_KEY\s*=\s*"cn-ios-intro-1"/.test(iosJs));

      const accountReady = run(["accountReady"], ["account"], "accountReady", (() => { const t0 = Date.now(); return () => (Date.now() - t0 > 40 ? {} : undefined); })());
      check("Launch: it waits for script.js to build the account (window.CyberNetAccount comes after this file first runs), and gives up after the time it was given", (await accountReady(1000)) === true && (await run(["accountReady"], ["account"], "accountReady", () => undefined)(60)) === false);
      const mkKnown = (stubs, ms) => run(["SESSION_WAIT", "sessionKnown"], ["accountReady", "signedIn", "supabase"], "sessionKnown", async () => true, stubs.signedIn || (() => false), () => ({ auth: stubs.auth }))(ms);
      const session = value => ({ getSession: async () => ({ data: { session: value } }) });
      check("Launch: the session check says true for a saved session (the client's own check, which reads the Keychain), false for none, and null when it cannot tell", (await mkKnown({ signedIn: () => true })) === true && (await mkKnown({ auth: session({ access_token: "t" }) })) === true && (await mkKnown({ auth: session(null) })) === false && (await mkKnown({ auth: { getSession: async () => { throw new Error("no"); } } })) === null && (await mkKnown({ auth: undefined })) === null);
      check("Launch: a session check that never answers is capped (1.2 s by default) and counts as no answer: the app opens, the gate is not a wall", (await mkKnown({ auth: { getSession: never } }, 60)) === null && /constSESSION_WAIT=1200/.test(squash(iosJs)));

      const realGate = gate;
      const mkPrepare = ({ session: s, target, mount }) => {
        const calls = { mounted: [], reported: [] };
        const stage = { stage: true };
        const api = run(["gateStage", "gateWanted", "prepareGate"], ["sessionKnown", "launchTarget", "launchGate", "mountStage", "report"], "{ prepareGate, state: () => ({ gateStage, gateWanted }) }",
          async () => s, target, realGate, (...a) => { calls.mounted.push(a); if (mount === "throw") throw new Error("no stage"); return stage; }, (e, where) => calls.reported.push(where));
        return { api, calls, stage };
      };
      {
        const out = {};
        for (const [name, args] of Object.entries({ signedIn: { session: true, target: async () => false }, unknown: { session: null, target: async () => false }, link: { session: false, target: async () => true }, plain: { session: false, target: async () => false }, broken: { session: false, target: async () => false, mount: "throw" } })) {
          const t = mkPrepare(args);
          await t.api.prepareGate();
          out[name] = { mounted: t.calls.mounted, reported: t.calls.reported, ...t.api.state() };
        }
        check("Short gate: nothing is put up for someone who is signed in or whose session check did not answer", out.signedIn.mounted.length === 0 && !out.signedIn.gateWanted && out.unknown.mounted.length === 0 && !out.unknown.gateWanted, out);
        check("Short gate: nothing is put up when a link or a shared item opened the app", out.link.mounted.length === 0 && !out.link.gateWanted, out.link);
        check("Short gate: signed out and nothing else opened the app: the short stage goes up under the launch screen (no fade-in, short: true)", out.plain.mounted.length === 1 && out.plain.mounted[0][0] === false && out.plain.mounted[0][1]?.short === true && out.plain.gateWanted && out.plain.gateStage?.stage === true, out.plain);
        check("Short gate: if the stage cannot be built the card still comes (over the app) and the error is reported", out.broken.gateWanted && out.broken.gateStage === null && out.broken.reported.join() === "gate stage", out.broken);
        const slow = mkPrepare({ session: false, target: never });
        const started = Date.now();
        await slow.api.prepareGate();
        check("Short gate: a link or shared-item check that never answers holds the launch for 450 ms at most, then the gate goes up", Date.now() - started >= 400 && Date.now() - started < 900 && slow.api.state().gateWanted, Date.now() - started);
      }
      {
        const log = [];
        const stage = { ready: Promise.resolve(), toSteps: () => log.push("toSteps"), leave: () => { log.push("leave"); return Promise.resolve(); } };
        const mk = () => run(["gateStage", "gateWanted", "showGate"], ["signInCard"], "{ showGate, set: (w, s) => { gateWanted = w; gateStage = s; } }", async opts => { log.push(`card ${JSON.stringify(opts)}`); return "guest"; });
        const a = mk();
        await a.showGate();
        a.set(true, stage);
        await a.showGate();
        a.set(true, null);
        await a.showGate();
        check("Short gate: the card rises over the stage once its beats are over (steps aside, card, stage leaves); with no stage the card comes over the app; with no gate nothing happens", log.join(" | ") === 'toSteps | card {"launch":true,"overStage":true} | leave | card {"launch":true,"overStage":false}', log);
      }
      check("Short gate: it is the first thing a later launch does (before the launch screen hides) and the launch goes on to the tracking prompt and the shared item as before", /constfirst=!store\.get\(INTRO_KEY\);constprepared=\(first\?prepareIntro\(\):prepareGate\(\)\)\.catch\(/.test(fnText("start")) && /prepared\.then\(hideSplash\)/.test(fnText("start")) && /awaitprepared;if\(first\)awaitshowIntro\(\);elseawaitshowGate\(\);awaitstartTracking\(true\);checkInbox\(\)/.test(fnText("start")));
      {
        const t = run(["IXS"], [], "IXS");
        check("Short gate timing: the beats come in order and the card is up in 1.0 to 1.5 s (about 1.4 s with its 0.6 s rise); reduced motion fades the end frame in for about 0.45 s", t.glide < t.pitch && t.pitch < t.card && t.card + 600 >= 1000 && t.card + 600 <= 1500 && t.calm >= 300 && t.calm <= 600, t);
        check("Short gate timing: the pitch rises only once the wordmark has glided past it (the 0.55 s glide clears the pitch's place by about 0.45 s)", t.pitch - t.glide >= 400 && /transition-duration:\.55s/.test(css) && /\.cn-ix\.is-short:is\(\.cn-ix-lockup,\.cn-ix-mark,\.cn-ix-word\)\{transition-duration:\.55s/.test(css), t);
        const mount = fnText("mountStage");
        check("Short gate: mountStage(fade, { short }) has no typing, no Skip focus, and under reduced motion only the calm hold", /functionmountStage\(fadeIn,\{short=false\}=\{\}\)/.test(mount) && /if\(short\)node\.classList\.add\("is-short"\)/.test(mount) && /if\(short\)\{constbeats=calm\?\[\[IXS\.calm,\(\)=>end\(false\)\]\]:\[\[IXS\.glide,\(\)=>node\.classList\.add\("is-glide"\)\],\[IXS\.pitch,\(\)=>node\.classList\.add\("is-pitch"\)\],\[IXS\.card,\(\)=>end\(false\)\]\];beats\.forEach\(\(\[ms,fn\]\)=>wait\(fn,ms\)\)\}elseif\(calm\)wait\(\(\)=>end\(false\),IX\.calm\)/.test(mount) && /\(short\?node:\$\("\.cn-ix-skip",node\)\)\.focus/.test(mount), mount.slice(0, 200));
        check("Short gate CSS: the finished mark is already there (nothing drawn, typed or scanned), the wordmark fades in on the glide, the quote and Skip are not shown", /\.cn-ix\.is-short:is\(\.cn-ix-base,\.cn-ix-trace,\.cn-ix-lock,\.cn-ix-scan,\.cn-ix-wordspan\)\{animation:none\}/.test(css) && /\.cn-ix\.is-short:is\(\.cn-ix-quote,\.cn-ix-skip\)\{display:none\}/.test(css) && /opacity:0/.test(rule(".cn-ix.is-short.cn-ix-word")) && /opacity:1/.test(rule(".cn-ix.is-short.is-glide.cn-ix-word")), rule(".cn-ix.is-short.cn-ix-word"));
        check("Short gate CSS: it adds no keyframes and no filter or blur (only the stage's own moves), and reduced motion and Pause motion still still every part of it", !/@keyframes[^{]*short/.test(css) && !/\.is-short[^{]*\{[^}]*(filter|blur)/.test(css) && /@media\(prefers-reduced-motion:reduce\)\{\.cn-ix\*,\.cn-ix\*:before,\.cn-ix\*:after\{animation:none!important;transition:none!important\}/.test(css) && /html\.cn-still\.cn-ix\*,html\.cn-still\.cn-ix\*:before,html\.cn-still\.cn-ix\*:after\{animation:none!important;transition:none!important\}/.test(css));
      }
      const showIntroText = fnText("showIntro");
      check("First launch: after the motion the card comes (the stage steps aside first), then, whichever way it was answered, the three steps; the intro key is stored after both", showIntroText.indexOf("stage?.toSteps()") > 0 && showIntroText.indexOf("stage?.toSteps()") < showIntroText.indexOf('awaitgate==="first")awaitsignInCard({launch:true,overStage:!!stage})') && showIntroText.indexOf('awaitgate==="first")') < showIntroText.indexOf("returnawaitintroSheet(!!stage)") && /\.then\(value=>\{store\.set\(INTRO_KEY,String\(Date\.now\(\)\)\);returnvalue\}\)/.test(showIntroText), showIntroText.slice(0, 300));
      check("First launch: the answer is asked for at once (the motion lasts 6.7 s), a replay of the welcome tips never meets the card, and a link or shared item (introPlain) skips it", /constgate=force\?Promise\.resolve\("none"\):sessionKnown\(\)\.then\(session=>launchGate\(true,session,introPlain\)\)/.test(showIntroText) && /if\(target\)\{introPlain=true;return\}/.test(fnText("prepareIntro")));
      check("Share and links: the shared-item sheet waits while the launch card is open (the launch ends with checkInbox), so the two never stack", /if\(!inbox\|\|inboxBusy\|\|gateOpen\|\|\$\("#cnInboxSheet"\)\)return/.test(fnText("checkInbox")) && /gateOpen=launch/.test(fnText("signInCard")) && /gateOpen=false/.test(fnText("signInCard")));

      // ---- guest mode: Analysis AI and Recovery ask for an account first, before anything is typed
      {
        const needs = signed => run(["ACCOUNT_PAGES", "needsAccount"], ["signedIn"], "needsAccount", () => signed);
        const g = needs(false), m = needs(true);
        check("Guest: Analysis AI and Recovery need an account; Check, Learn, Account and the QR scanner do not; nobody signed in is asked (and prototype names are not pages)", g("cybernetai") && g("recovery") && !g("cybernet") && !g("learn") && !g("account") && !g("scan") && !g("constructor") && !g("toString") && !m("cybernetai") && !m("recovery"));
        check("Guest: the Analysis AI segment asks before the thumb or the focus moves, and a cancelled card leaves the switch on Quick Scan", (() => { const t = fnText("pickCheckMode"); return t.indexOf("if(needsAccount(page)){requireAccount(page);return}") > 0 && t.indexOf("if(needsAccount(page))") < t.indexOf(".focus(") && t.indexOf("if(needsAccount(page))") < t.indexOf("paintCheckSwitch(") && t.indexOf("if(needsAccount(page))") < t.indexOf("tick()"); })());
        check("Guest: navigate() asks too (the Recovery tab, the native tab bar, a reminder, a shared item), before it clears or starts anything", /^functionnavigate\(page\)\{if\(needsAccount\(page\)\)\{requireAccount\(page\);return\}modeWanted=null;/.test(fnText("navigate")));
        check("Guest: the website's own in-page buttons (they switch pages directly) are caught when the page changes: the card, and Cancel goes back to where they came from", /if\(needsAccount\(now\)\)requireAccount\(now,null,needsAccount\(from\)\?"cybernet":from\)/.test(fnText("watchPages")) && /constfrom=last;last=now;syncTabs\(\)/.test(fnText("watchPages")));
        check("Guest: a session that ends while a page that needs an account is open (an expired refresh) gets the card, then Check", /elseif\(needsAccount\(activePage\(\)\)\)requireAccount\(activePage\(\),null,"cybernet"\)/.test(squash(iosJs)));
        check("Guest: Get an AI explanation (QR result, shared item) asks for the account first and puts the item in once they are in; the old pending-item listener is gone", /if\(requireAccount\("cybernetai",\(\)=>askAi\(text,file\)\)\)return/.test(fnText("askAi")) && !/pendingAi/.test(iosJs) && !/Sign in to get an AI explanation/.test(iosJs));
        // requireAccount() and arrive(), run with stubs
        const mkAsk = (signed, answer) => {
          const log = [];
          const api = run(["cardOpen", "requireAccount", "arrive"], ["signedIn", "syncTabs", "signInCard", "navigate", "pickCheckMode", "later", "$", "report"], "{ requireAccount, arrive, hold: v => { cardOpen = v; } }",
            () => signed, () => log.push("syncTabs"), opts => { log.push(`card ${opts.page}`); return Promise.resolve(answer); }, p => log.push(`navigate ${p}`), p => log.push(`pick ${p}`), fn => fn(), () => ({ focus: () => log.push("focus chatInput") }), () => {});
          return { api, log };
        };
        const flush = () => new Promise(resolve => setTimeout(resolve, 10));
        const inn = mkAsk(true, "signed-in");
        const r1 = inn.api.requireAccount("cybernetai");
        const guest = mkAsk(false, "signed-in");
        const r2 = guest.api.requireAccount("cybernetai");
        await flush();
        const cancelled = mkAsk(false, "cancel");
        const r3 = cancelled.api.requireAccount("recovery");
        await flush();
        const back = mkAsk(false, "cancel");
        back.api.requireAccount("recovery", null, "cybernet");
        await flush();
        const item = mkAsk(false, "signed-in"), items = [];
        item.api.requireAccount("cybernetai", () => items.push("then"));
        await flush();
        const twice = mkAsk(false, "signed-in");
        twice.api.hold(Promise.resolve());
        const r4 = twice.api.requireAccount("cybernetai");
        const recov = mkAsk(false, "signed-in");
        recov.api.requireAccount("recovery");
        await flush();
        check("Guest: a signed-in person is never asked (requireAccount returns false and opens nothing)", r1 === false && inn.log.length === 0);
        check("Guest: a guest tapping Analysis AI gets the card at once (the tab highlight is put back first), and signing in opens Analysis AI with its message box focused", r2 === true && guest.log.join(" | ") === "syncTabs | card cybernetai | pick cybernetai | focus chatInput", guest.log);
        check("Guest: signing in from the Recovery tab's card opens Recovery", recov.log.join(" | ") === "syncTabs | card recovery | navigate recovery", recov.log);
        check("Guest: cancelling the card leaves them where they were (nothing navigates); from the safety net it goes back", r3 === true && cancelled.log.join(" | ") === "syncTabs | card recovery" && back.log.join(" | ") === "syncTabs | card recovery | navigate cybernet", [cancelled.log, back.log]);
        check("Guest: what they asked for after sign-in can be something else (the shared item); and a second tap while the card is open opens nothing more", items.join() === "then" && !item.log.some(l => /^(pick|navigate)/.test(l)) && r4 === true && twice.log.length === 0, [item.log, twice.log]);
      }

      // ---- the switch's hints
      {
        const modes = run(["CHECK_MODES"], [], "CHECK_MODES");
        const hintOf = run(["hintOf"], [], "hintOf");
        check("Switch hint: Quick Scan keeps its hint; Analysis AI reads \"AI explains it in detail.\" for a signed-in person and \"Sign in to use Analysis AI.\" for a guest (no \"Sign in required\" anywhere)", hintOf(modes[0], false) === "Checks on your iPhone. No account, no AI." && hintOf(modes[0], true) === "Checks on your iPhone. No account, no AI." && hintOf(modes[1], true) === "AI explains it in detail." && hintOf(modes[1], false) === "Sign in to use Analysis AI." && !/Sign in required/.test(iosJs), modes);
        const node = attrs => ({ attrs, hidden: true, textContent: "", getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v; }, tabIndex: 0 });
        const paint = (member, page) => {
          const buttons = [node({ "data-seg-page": "cybernet" }), node({ "data-seg-page": "cybernetai" })];
          const spans = [node({ "data-seg-hint": "cybernet" }), node({ "data-seg-hint": "cybernetai" })];
          const seg = { dataset: {}, parentNode: {} };
          run(["CHECK_MODES", "hintOf", "paintCheckSwitch"], ["$", "$$", "signedIn"], "paintCheckSwitch", () => seg, (sel, scope) => (scope === seg ? buttons : spans), () => member)(page);
          return spans.map(s => `${s.hidden ? "hidden" : "shown"}:${s.textContent}`).join(" / ");
        };
        check("Switch hint: a guest on Quick Scan reads both on one line (which part needs an account); a signed-in person only the open page's; the text follows the account", paint(false, "cybernet") === "shown:Checks on your iPhone. No account, no AI. / shown:Sign in to use Analysis AI." && paint(true, "cybernet") === "shown:Checks on your iPhone. No account, no AI. / hidden:AI explains it in detail." && paint(true, "cybernetai") === "hidden:Checks on your iPhone. No account, no AI. / shown:AI explains it in detail.", [paint(false, "cybernet"), paint(true, "cybernet"), paint(true, "cybernetai")]);
        check("Switch hint: the hint follows the account (the session event and Supabase's own sign-in event repaint the switch)", /syncCheckSwitch\(activePage\(\)\)/.test(fnText("bindAccount")) && /syncCheckSwitch\(activePage\(\)\);if\(session\?\.access_token\)signedInNow\(\)/.test(fnText("watchSignIn")));
      }

      // ---- Analysis AI for a signed-in person: no sign-in prompt anywhere on the page
      {
        const tidy = (texts) => {
          const nodes = { bubble: { textContent: texts[0] }, status: { textContent: texts[1] }, saved: { textContent: texts[2] } };
          run(["AI_GREETING", "tidyAnalysisAi"], ["$"], "tidyAnalysisAi", sel => (/chat-bubble-inner/.test(sel) ? nodes.bubble : /aiApiStatus/.test(sel) ? nodes.status : /proHistoryList/.test(sel) ? nodes.saved : null))();
          return Object.values(nodes).map(n => n.textContent);
        };
        const before = ["Sign in, then paste or drop anything suspicious below: a message, a link or a screenshot.", "Sign in to use Analysis AI.", "Sign in to see your saved explanations."];
        const after = tidy(before);
        check("Analysis AI (signed in): the page's own sign-in lines (greeting, status, saved list) are rewritten at start, so none asks for a sign-in; text script.js already wrote is left alone", after.every(t => !/sign in/i.test(t)) && after[0].startsWith("Paste or drop anything suspicious below") && tidy(["Hello", "4 of 5 left", "Nothing yet"]).join("|") === "Hello|4 of 5 left|Nothing yet" && before.every(t => /^Sign in/.test(t)) && /<div class="chat-bubble-inner">Sign in, then paste or drop/.test(html), after);
        check("Analysis AI (signed in): the AI consent sheet is unchanged: the fetch layer still asks before the first send, the notice version is the same, and Not now still sends nothing", /AI_ENDPOINT\.test\(url\)/.test(iosJs) && /if\(!awaitconsent\.ensure\(\)\)returnconsentDeclined\(\)/.test(squash(iosJs)) && /AI_CONSENT_VERSION="2026-11-ios-1"/.test(squash(iosJs)) && /code:"AI_CONSENT_REQUIRED"/.test(squash(iosJs)));
        check("Analysis AI (signed in): sending a message from the page itself still needs an account (the guest hint is true; the card comes first so a guest never types into it)", /function sendChatMessage\(\)\{if\(!isSignedIn\(\)\)\{openAuthModal\("signup"\);return\}/.test(script));
      }

      // ---- the card as a modal: focus, Escape, inert background, native tab bar, the email forms above it
      {
        const t = fnText("signInCard");
        check("Card modal: it is a sheet (role dialog, aria-modal, named after its title), sticky: only its own choices, Escape or a sign-in close it", /label:title/.test(t) && /sticky:true/.test(t) && /sheet\(\{id:"cnSignIn"/.test(t) && /finish\(value\)|constfinish=value=>/.test(t));
        check("Card modal: Escape never traps: the launch card's guest way out, a guest's card Cancel; it waits while the email form or a legal page is open above, and for the Escape that just closed the form", /finish\(launch\?"guest":"cancel"\)/.test(t) && /\$\("#authModal\.show"\)\|\|\$\("#cnLegalSheet"\)\|\|performance\.now\(\)-authClosedAt<150/.test(t) && /e\.stopImmediatePropagation\(\)/.test(t) && /watchAuthModal\(\);/.test(fnText("start")));
        check("Card modal: the page behind is inert while it is up and handed back before the sheet returns focus; the native tab bar steps aside and returns", t.indexOf("inertBehind(true)") > 0 && t.indexOf("inertBehind(false)") > 0 && t.indexOf("inertBehind(false)") < t.indexOf("done(value)") && t.indexOf("holdBar(true)") > 0 && t.indexOf("holdBar(false)") < t.indexOf("done(value)"));
        const behind = run(["BEHIND"], [], "BEHIND");
        check("Card modal: the inert list covers the page, the header, the Check switch, the web tab bar and the skip link (the email form and the toast are not in it)", ["#cnMain", ".navbar", "#cnIosSegWrap", "#cnIosTabbar", ".cn-skip"].every(s => behind.includes(s)) && !behind.includes("#authModal"), behind);
        check("Card modal: the keyboard coming down never gives the native tab bar back over the card or the stage", /setHidden\(\{hidden:barByCard\|\|!!\$\("#cnIntroStage"\)\}\)/.test(squash(iosJs)));
        const z = sel => Number(new RegExp(`${sel.replace(/[.]/g, "\\.")}\\{[^}]*z-index:(\\d+)`).exec(css)?.[1]);
        const authZ = Number(/html\.cn-ios\.cn-ios-gated#authModal\{z-index:(\d+)/.exec(css)?.[1]);
        check("Card CSS: the email form (#authModal, the website's rule is an id at 1600) opens above the card (2000) and below the in-app legal pages (2100)", authZ > z(".cn-ios-sheet-backdrop") && authZ < z(".cn-ios-legal-sheet"), [authZ, z(".cn-ios-sheet-backdrop"), z(".cn-ios-legal-sheet")]);
        const choicesRule = (css.match(/\.cn-signin-choices>:is\(\.cn-ios-apple-btn,\.cn-ios-google-btn,\.primary-btn,\.secondary-btn\)\{([^}]*)\}/) || [])[1] || "";
        check("Card CSS: the four choices share one rule: full width and at least 48 pt tall, Apple's button included (so it is never smaller than the others)", /width:100%/.test(choicesRule) && /min-height:50px/.test(choicesRule), choicesRule);
        check("Card CSS: the legal links get a 44 pt touch area (a pseudo-element reaching 14 px above and below a 17 px line, so the sentence keeps its line gap) and the guest link keeps the 44 pt link button", /\.cn-legal-link-btn:after\{[^}]*content:""[^}]*inset:-14px-6px/.test(css) && /\.cn-ios-link-btn\{[^}]*min-height:44px/.test(css), css.match(/cn-legal-link-btn:after\{[^}]*\}/)?.[0]);
        check("Card CSS: Pause motion stills the sheets as reduced motion does", /html\.cn-still\.cn-ios-sheet,html\.cn-still\.cn-ios-sheet-backdrop,html\.cn-still\.cn-ios-legal-sheet\{transition:none!important\}/.test(css));
      }

      // ---- the four choices: Apple, Google, email, Create account; offline; errors
      {
        const mkWire = ({ offline, appleOk = true, googleOk = true }) => {
          const log = [];
          const line = { hidden: true, textContent: "", dataset: {} };
          let handler = null;
          const scope = { addEventListener: (type, fn) => { if (type === "click") handler = fn; }, contains: () => true };
          run(["OFFLINE_GATE", "OFFLINE_SIGNIN", "wireSignIn"], ["$", "offline", "account", "signInWithApple", "signInWithGoogle", "signedInNow", "report"], "wireSignIn",
            () => line, offline, () => ({ openAuthModal: mode => log.push(`modal ${mode}`) }), async (b, o) => { log.push(`apple ${o.view}`); return appleOk; }, async () => { log.push("google"); return googleOk; }, () => log.push("signedInNow"), () => {})(scope, { launch: true });
          const tap = async what => { await handler({ target: { closest: () => ({ getAttribute: () => what }) } }); };
          return { log, line, tap };
        };
        const on = mkWire({ offline: false });
        await on.tap("apple");
        await on.tap("google");
        await on.tap("email");
        await on.tap("create");
        const off = mkWire({ offline: true });
        const shownAtOpen = off.line.textContent;
        await off.tap("apple");
        const afterApple = off.line.textContent;
        await off.tap("google");
        const afterGoogle = off.line.textContent;
        await off.tap("email");
        const failed = mkWire({ offline: false, appleOk: false });
        await failed.tap("apple");
        const failedGoogle = mkWire({ offline: false, googleOk: false });
        await failedGoogle.tap("google");
        // Changed 30 Oct 2026: Sign in with Google joined the card (Apple, Google, email, Create account), wired the same way as Apple
        check("Choices: Apple and Google each run their one sign-in and, once it succeeds, tell the card; email and Create account open the existing email forms (login and signup)", on.log.join(" | ") === "apple login | signedInNow | google | signedInNow | modal login | modal signup", on.log);
        check("Choices: offline, the card says so when it opens and when Apple or Google is tapped (their sheets are not opened), the email forms still open with their own messages, and a failed Apple or Google sign-in does not tell the card", shownAtOpen === run(["OFFLINE_GATE"], [], "OFFLINE_GATE") && afterApple === shownAtOpen && afterGoogle === shownAtOpen && off.log.join(" | ") === "modal login" && failed.log.join(" | ") === "apple login" && failedGoogle.log.join(" | ") === "google", [shownAtOpen, afterApple, afterGoogle, off.log, failed.log, failedGoogle.log]);
        const gateText = run(["OFFLINE_GATE", "OFFLINE_SIGNIN"], [], "[OFFLINE_GATE, OFFLINE_SIGNIN]");
        // 30 Oct 2026 (review): the launch card's link "Continue without an account" is right under the note, so the note no longer repeats it
        check("Choices: the offline notes: the launch card's note is short (its guest link sits right under it), the other cards name what still works", gateText[0] === "You're offline. Connect to the internet to sign in." && !/continue without/i.test(gateText[0]) && gateText[1] === "You're offline. Connect to the internet to sign in. Quick Scan, QR and Learn still work.");
        check("Offline: Continue without an account needs no network (the card's handler only resolves the card), and only the Apple and Google sign-ins check the connection", !/offline|fetch|navigator\.onLine/.test(fnText("signInCard")) && (fnText("wireSignIn").match(/if\(offline\)\{say\(offlineText,"info"\);return\}/g) || []).length === 2);
        check("Choices: nothing is a dead end: an unexpected problem shows \"Something went wrong\" on the card's own message line", /catch\(error\)\{report\(error,`signin\$\{what\}`\);say\("Somethingwentwrong\.Pleasetryagain\."\)\}/.test(fnText("wireSignIn")));
        check("Choices: a failed Apple sign-in says so, with the email way out, on the line it came from (the existing words); a cancelled one says nothing", squash(iosJs).includes(squash(`say("Sign in with Apple didn't finish. Please try again, or use your email and password.")`)) && /if\(\/cancel\|1001\/i\.test\(text\)\)say\("",""\)/.test(fnText("signInWithApple")));
      }

      // ---- Sign in with Google (owner, 30 Oct 2026): the system's secure sign-in sheet (CNWebAuth), PKCE, a quiet cancel.
      // signInWithGoogle() is cut out of the built ios.js and run against the REAL vendored supabase-js (the bundle's
      // vendor/supabase.js) with a fake network and a fake sheet, so the sign-in address, the PKCE exchange and the
      // hand-over to the app's own client are the library's own behaviour, not a guess. (The real Google flow, and the
      // Swift plugin's compile, can only be tried on a device or in CI.)
      {
        const vmMod = await import("node:vm");
        const supaCode = await read("vendor/supabase.js");
        const HOST = "https://ndtcxippbufqzwcxkyjd.supabase.co";
        const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const granted = { access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", exp })}.sig`, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "refresh-1", user: { id: "u1", aud: "authenticated", email: "ana@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
        const reply = (status, body) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        const CODE = "fake-auth-code"; // stands in for the sign-in code: it must never reach an error report
        const quiet = { log() {}, warn() {}, error() {}, debug() {}, info() {} };
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const challengeOf = verifier => createHash("sha256").update(verifier).digest("base64url");
        const GOOGLE_NAMES = ["GOOGLE_CALLBACK", "GOOGLE_SCHEME", "GOOGLE_UNAVAILABLE", "GOOGLE_FAILED", "googleReturn", "googleBusy", "googleClient", "signInWithGoogle"];
        const [FAILED, UNAVAILABLE] = run(["GOOGLE_FAILED", "GOOGLE_UNAVAILABLE"], [], "[GOOGLE_FAILED, GOOGLE_UNAVAILABLE]");
        const attempt = async ({ back, sheet, network = reply(200, granted), config, withPlugin = true, withMain = true, twice = false, again = false }) => {
          const requests = [], said = [], sets = [], toasts = [], reports = [], starts = [], warns = [];
          let created = 0;
          const listened = []; // what the library asks the page to listen to (a browser has a window and a document; supabase-js behaves differently without them)
          const ctx = vmMod.createContext({ window: { addEventListener: type => listened.push(type), removeEventListener() {} }, document: { visibilityState: "visible" }, console: { ...quiet, warn: text => warns.push(String(text)) }, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval, atob, btoa, AbortController, Headers, Request, Response, queueMicrotask, WebSocket: class {},
            fetch: async (url, init) => { requests.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return network(); } });
          vmMod.runInContext(supaCode, ctx);
          const web = withPlugin ? { start: async opts => { starts.push(opts); return sheet ? sheet(opts) : { url: back }; } } : null;
          const main = withMain ? { auth: { setSession: async s => { sets.push(s); return { data: {}, error: null }; } } } : null;
          const fn = run(GOOGLE_NAMES, ["P", "supabase", "w", "authMessage", "rememberLoginAcceptance", "report", "$", "toast"], "signInWithGoogle",
            n => (n === "CNWebAuth" ? web : null), () => main, { CYBERNET_CONFIG: config || { SUPABASE_URL: HOST, SUPABASE_ANON_KEY: "publishable-key-for-the-harness" }, supabase: { createClient: (...args) => { created++; return ctx.supabase.createClient(...args); } } },
            () => {}, () => {}, (error, where) => reports.push({ error, where }), () => null, text => toasts.push(text));
          const button = { value: false, history: [], set disabled(v) { this.value = v; this.history.push(v); }, get disabled() { return this.value; } };
          const say = (text, tone) => said.push([text, tone]);
          const results = again ? [await fn(button, { say }), await fn(button, { say })] : await Promise.all(Array.from({ length: twice ? 2 : 1 }, () => fn(button, { say })));
          return { results, requests, said, sets, toasts, reports, starts, button, created, warns, listened };
        };
        const exchanges = r => r.requests.filter(q => /\/auth\/v1\/token\?grant_type=pkce$/.test(q.url));
        const quietEnd = r => r.results[0] === false && r.said.every(([text]) => text === "") && r.sets.length === 0 && r.reports.length === 0 && r.toasts.length === 0 && r.button.history.join() === "true,false";
        const failedEnd = r => r.results[0] === false && r.said.at(-1)?.[0] === FAILED && r.sets.length === 0 && r.button.history.join() === "true,false";
        const callback = "app.cybernetai://auth-callback";

        // a code comes back: PKCE
        const good = await attempt({ back: `${callback}?code=${CODE}` });
        const u = good.starts[0] && new URL(good.starts[0].url);
        check("Google: the sheet gets this project's sign-in address for Google with the exact return address app.cybernetai://auth-callback and a PKCE S256 challenge, and only the scheme app.cybernetai",
          good.starts.length === 1 && u.protocol === "https:" && u.host === "ndtcxippbufqzwcxkyjd.supabase.co" && u.pathname === "/auth/v1/authorize" && u.searchParams.get("provider") === "google" && u.searchParams.get("redirect_to") === callback && u.searchParams.get("code_challenge_method") === "s256" && !!u.searchParams.get("code_challenge") && !u.searchParams.has("skip_http_redirect") && good.starts[0].callbackScheme === "app.cybernetai", good.starts);
        const ex = exchanges(good)[0];
        check("Google: the code is traded once, at /token?grant_type=pkce, with the verifier whose S256 is the challenge that went out; the app's own client then takes the session (both tokens); nothing else is called (no sign-out)",
          exchanges(good).length === 1 && ex.body.auth_code === CODE && ex.body.code_verifier?.length >= 43 && challengeOf(ex.body.code_verifier) === u.searchParams.get("code_challenge") && good.requests.length === 1 && good.sets.length === 1 && good.sets[0].access_token === granted.access_token && good.sets[0].refresh_token === "refresh-1", [good.requests, good.sets]);
        check("Google: success is like Apple's: true, \"You're signed in.\" on the line, the toast, the button back", good.results[0] === true && good.said.at(-1)?.join("|") === "You're signed in.|success" && good.toasts.join() === "You're signed in with Google." && good.button.history.join() === "true,false", [good.said, good.toasts, good.button.history]);

        // a second sign-in in the same page (after a cancel or a sign-out): the one extra client is reused. supabase-js never
        // lets go of a client (a visibilitychange listener stays on the page) and warns about a second one under the same storage key
        const second = await attempt({ back: `${callback}?code=${CODE}`, again: true });
        const secondEx = exchanges(second), secondChallenges = second.starts.map(s => new URL(s.url).searchParams.get("code_challenge"));
        check("Google: a second sign-in in the same page reuses the one extra client (made once, no 'Multiple GoTrueClient instances' warning), and each trade uses the verifier of its own sheet",
          second.created === 1 && second.warns.length === 0 && good.listened.includes("visibilitychange") && second.listened.length === good.listened.length && second.results.join() === "true,true" && second.starts.length === 2 && secondEx.length === 2 && second.sets.length === 2 && secondChallenges[0] !== secondChallenges[1] && secondEx.every((q, i) => challengeOf(q.body.code_verifier) === secondChallenges[i]), [second.created, second.warns, second.listened, second.results]);
        check("Google: one sign-in makes exactly one extra client", good.created === 1 && good.warns.length === 0, [good.created, good.warns]);

        // cancel, refusal and errors
        const cancelled = await attempt({ sheet: async () => { throw Object.assign(new Error("Sign in was cancelled."), { code: "CANCELED" }); } });
        check("Google: closing the sheet (CANCELED) is quiet: nothing is shown, reported or called, and the button comes back", quietEnd(cancelled) && cancelled.requests.length === 0, [cancelled.said, cancelled.reports]);
        const denied = await attempt({ back: `${callback}?error=access_denied&error_code=access_denied&error_description=${encodeURIComponent("Access denied")}` });
        check("Google: saying no on Google's page (access_denied) is quiet too, and nothing is traded", quietEnd(denied) && denied.requests.length === 0, [denied.said, denied.reports]);
        const refusedByServer = await attempt({ back: `${callback}?error=server_error&error_description=${encodeURIComponent(`Unable to exchange external code: ${CODE}`)}` });
        check("Google: any other error in the return says it did not finish (with the email way out), is reported without its text, and signs nobody in", failedEnd(refusedByServer) && refusedByServer.requests.length === 0 && refusedByServer.reports.length === 1 && !String(refusedByServer.reports[0].error.message).includes(CODE), [refusedByServer.said, refusedByServer.reports.map(r => r.error.message)]);
        const refusedExchange = await attempt({ back: `${callback}?code=${CODE}`, network: reply(400, { code: 400, error_code: "validation_failed", msg: `bad code ${CODE}` }) });
        check("Google: a code Supabase refuses says it did not finish, is reported by name only (the provider's text can carry the code), and signs nobody in", failedEnd(refusedExchange) && exchanges(refusedExchange).length === 1 && refusedExchange.reports.length === 1 && !String(refusedExchange.reports[0].error.message).includes(CODE), [refusedExchange.said, refusedExchange.reports.map(r => r.error.message)]);
        const tokens = await attempt({ back: `${callback}#access_token=AT&refresh_token=RT&token_type=bearer` });
        check("Google: tokens in the return address (the implicit form) are taken with setSession, no code trade", tokens.results[0] === true && exchanges(tokens).length === 0 && tokens.sets.length === 1 && tokens.sets[0].access_token === "AT" && tokens.sets[0].refresh_token === "RT", tokens.sets);
        const wrong = await Promise.all([`https://evil.example/auth-callback?code=${CODE}`, `app.cybernetai://elsewhere?code=${CODE}`, callback, "not a url"].map(back => attempt({ back })));
        check("Google: a return to any other address, or with neither a code nor tokens, signs nobody in and trades nothing", wrong.every(r => failedEnd(r) && exchanges(r).length === 0), wrong.map(r => r.said));
        const doubled = await attempt({ back: `${callback}?code=${CODE}`, sheet: async () => { await sleep(40); return { url: `${callback}?code=${CODE}` }; }, twice: true });
        check("Google: a double tap opens one sheet and signs in once", doubled.starts.length === 1 && doubled.sets.length === 1 && doubled.results.slice().sort().join() === "false,true", [doubled.starts.length, doubled.results]);
        const missing = await Promise.all([attempt({ back: callback, withPlugin: false }), attempt({ back: callback, withMain: false }), attempt({ back: callback, config: { SUPABASE_URL: HOST } })]);
        check("Google: without the plugin (a desktop preview), the app's Supabase client or the public config it says so and does nothing else", missing.every(r => r.results[0] === false && r.said.at(-1)?.[0] === UNAVAILABLE && r.starts.length === 0 && r.requests.length === 0), missing.map(r => r.said));

        // the source: the plugin's name, the two clients, no secret
        const googleText = fnText("signInWithGoogle");
        check("Google: the sheet is the CNWebAuth plugin; the extra client is PKCE and in memory only and never signs out; the app's own client keeps the default flow (the password-reset page reads tokens, never a PKCE code)",
          squash(iosJs).includes('P("CNWebAuth")') && /web\.start\(\{url:signInUrl\.toString\(\),callbackScheme:GOOGLE_SCHEME\}\)/.test(googleText) && /flowType:"pkce",persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/.test(googleText) && /oauth\.auth\.signInWithOAuth\(\{provider:"google",options:\{redirectTo:GOOGLE_CALLBACK,skipBrowserRedirect:true\}\}\)/.test(googleText) && !/signOut/.test(googleText) && !/flowType/.test(script) && /flowType: "implicit"/.test(await readFile(path.join(root, "public", "app", "reset.js"), "utf8")));
        const [cbValue, schemeValue] = run(["GOOGLE_CALLBACK", "GOOGLE_SCHEME"], [], "[GOOGLE_CALLBACK, GOOGLE_SCHEME]");
        check("Google: the return address is exactly app.cybernetai://auth-callback, with the scheme app.cybernetai (what Supabase's redirect list must contain)", cbValue === "app.cybernetai://auth-callback" && schemeValue === "app.cybernetai" && cbValue.startsWith(`${schemeValue}://`));
        check("Google: no key or secret in ios.js (the public config is read at run time), and no Google address", !/sb_(?:publishable|secret)_|eyJ[\w-]{10,}|service_role|accounts\.google|googleapis/i.test(iosJs) && /w\.CYBERNET_CONFIG/.test(googleText));
        check("Google: a new Google account agrees through the same note as Apple, kept by one shared helper (Apple's behaviour is unchanged)", /rememberLoginAcceptance\(\)/.test(googleText) && /elserememberLoginAcceptance\(\)/.test(fnText("signInWithApple")));
        const remember = existing => { const stored = []; run(["rememberLoginAcceptance"], ["readAcceptance", "LEGAL", "ACCEPTANCE_MAX_AGE", "storeAcceptance"], "rememberLoginAcceptance", () => existing, { version: "v1", privacy: "p1" }, 30 * 24 * 3600e3, email => stored.push(email))(); return stored.length; };
        const current = { version: "v1", privacyVersion: "p1", acceptedAt: new Date().toISOString(), attempts: 0 };
        check("Google and Apple: the acceptance record is kept while an unsent current one exists, and renewed when there is none, it was sent, it is stale or it is for an older text", remember(null) === 1 && remember(current) === 0 && remember({ ...current, serverRecorded: true }) === 1 && remember({ ...current, version: "v0" }) === 1 && remember({ ...current, attempts: 3 }) === 1 && remember({ ...current, acceptedAt: new Date(Date.now() - 40 * 24 * 3600e3).toISOString() }) === 1);

        // the buttons: the Account block, Google's mark and colours, Apple stays the stronger button
        const launchNodes = card ? parse(card.signInCardHtml({ title: "Sign in to CyberNet AI", launch: true, lead: card.GATE_LEAD })) : [];
        const acctChoices = card ? parse(card.signInChoicesHtml("cnAcct")).filter(n => attr(n, "data-signin")) : [];
        check("Account (guest): the same four choices in the same order as the card (Apple, Google, email, Create account)", acctChoices.map(n => attr(n, "data-signin")).join("|") === "apple|google|email|create" && attr(acctChoices[1], "id") === "cnAcctGoogle" && acctChoices.every(n => n.tagName === "button" && attr(n, "type") === "button"));
        const googleButton = launchNodes.find(n => attr(n, "data-signin") === "google");
        const markPaths = (function paths(node, out = []) { for (const c of node?.childNodes || []) { if (c.tagName === "path") out.push(attr(c, "fill")); paths(c, out); } return out; })(googleButton);
        check("Google button: Google's four-colour G as an inline SVG (hidden from VoiceOver, no remote file) and the words Sign in with Google; only Apple's button takes the card's focus",
          markPaths.join("|") === "#EA4335|#4285F4|#FBBC05|#34A853" && googleButton.childNodes.some(c => c.tagName === "svg" && attr(c, "aria-hidden") === "true") && textOf(googleButton).trim() === "Sign in with Google" && launchNodes.filter(n => attr(n, "data-autofocus") !== undefined).length === 1, markPaths);
        const googleRule = rule(".cn-ios-google-btn"), appleRule = rule(".cn-ios-apple-btn");
        check("Google button CSS: Google's dark-theme button (#131314, 1 px #8e918f outline, #e3e3e3 text, pill shape like Apple's), while Apple's stays the solid white one (guideline 4.8: Apple is never the weaker choice)",
          /background:#131314/.test(googleRule) && /border:1pxsolid#8e918f/.test(googleRule) && /color:#e3e3e3/.test(googleRule) && /border-radius:999px/.test(googleRule) && /background:#fff/.test(appleRule) && /color:#000/.test(appleRule), [googleRule, appleRule]);
        check("Sign-in card CSS: the four choices are 8 px apart and 14 px under the lead, so the card stays under 500 px on a 390 x 844 iPhone and the first launch's pitch keeps its two lines (measured 464 px plus the 34 px home-indicator area; see fitPitch)", /\.cn-signin-choices\{display:grid;gap:8px;margin:14px00\}/.test(css), rule(".cn-signin-choices"));
        const privacyPage = await read("legal/privacy.html");
        check("Privacy (iPhone section): it describes Sign in with Google and no longer says the app has no Google sign-in", /<h3>Sign in with Google<\/h3>/.test(privacyPage) && !/no Google sign-in/i.test(privacyPage));

        // native side (Swift cannot be compiled here; CI builds it): one plugin, registered, locked to the project's host and the app's scheme, no Info.plist URL type, no entitlement
        const pluginsDir = path.join(mobile, "native", "App", "Plugins");
        const swiftFiles = (await import("node:fs")).readdirSync(pluginsDir).filter(n => n.endsWith(".swift"));
        const swift = Object.fromEntries(await Promise.all(swiftFiles.map(async n => [n, await readFile(path.join(pluginsDir, n), "utf8")])));
        const mainController = await readFile(path.join(mobile, "native", "App", "MainViewController.swift"), "utf8");
        const web = swift["WebAuthPlugin.swift"] || "";
        const classes = Object.values(swift).map(t => /@objc\((\w+)\)\s*public final class (\w+): CAPPlugin, CAPBridgedPlugin/.exec(t));
        check("Native plugins: every plugin file declares its class once under its own name and is registered in MainViewController, and the JS names are unique", classes.every((m, i) => m && m[1] === m[2] && new RegExp(`identifier = "${m[2]}"`).test(Object.values(swift)[i]) && mainController.includes(`bridge?.registerPluginInstance(${m[2]}())`)) && new Set(Object.values(swift).map(t => /jsName = "(\w+)"/.exec(t)?.[1])).size === swiftFiles.length, swiftFiles);
        const configHost = new URL(/SUPABASE_URL:\s*"([^"]+)"/.exec(await readFile(path.join(root, "public", "config.js"), "utf8"))?.[1] || "https://invalid.invalid").host;
        check("WebAuthPlugin: JS name CNWebAuth with start(), the system sheet shared with Safari (not ephemeral), CANCELED for a closed sheet, and only https on the project's Supabase host with the scheme app.cybernetai",
          /jsName = "CNWebAuth"/.test(web) && /CAPPluginMethod\(name: "start", returnType: CAPPluginReturnPromise\)/.test(web) && /ASWebAuthenticationSession\(url: url, callbackURLScheme: callbackScheme\)/.test(web) && /prefersEphemeralWebBrowserSession = false/.test(web) && /\.canceledLogin/.test(web) && /"CANCELED"/.test(web) && web.includes(`allowedHost = "${configHost}"`) && /allowedScheme = "app\.cybernetai"/.test(web) && /scheme\?\.lowercased\(\) == "https"/.test(web) && schemeValue === "app.cybernetai", configHost);
        const infoPlist = await readFile(path.join(mobile, "ios", "App", "App", "Info.plist"), "utf8");
        check("Native: no Info.plist URL type, no associated domains, no push and no new permission text for the sheet (the Codemagic release check allows only the camera and tracking texts)", !/CFBundleURLTypes/.test(infoPlist) && !/associated-domains|aps-environment/.test(await readFile(path.join(mobile, "native", "App", "App.entitlements"), "utf8")) && [...infoPlist.matchAll(/NS\w+UsageDescription/g)].map(m => m[0]).sort().join() === "NSCameraUsageDescription,NSUserTrackingUsageDescription");
        check("WebAuthPlugin: no key or secret", !/sb_(?:publishable|secret)_|eyJ[\w-]{10,}|service_role|apikey/i.test(web));
      }

      // ---- review of 30 Oct 2026: the sticky pitch, the message line, the legal links, a reminder at cold start, the Account tab, the tips, the demo runs
      {
        // fitPitch(): the pitch stays above a sheet that rises over the stage as far as it fits (all of it, only its two lines, or none)
        const mkFit = $ => run(["PITCH_GAP", "fitPitch"], ["$"], "fitPitch", $);
        const fit = (vh, sheetH) => {
          const set = {};
          const stage = { classList: { toggle: (c, on) => { set[c] = !!on; } } };
          const pitch = { offsetTop: 242, offsetHeight: 142 }; // 390 x 844: the pitch runs from 242 to 384, its second line ends at 331.2
          const second = { offsetTop: 44.6, offsetHeight: 44.6 };
          mkFit(sel => ({ "#cnIntroStage": stage, ".cn-ix-pitch": pitch, ".cn-ix-line-2": second })[sel] || null)({ offsetHeight: sheetH, parentNode: { clientHeight: vh } });
          return `${set["has-room"] ? "room" : "-"}/${set["has-lines"] ? "lines" : "-"}`;
        };
        const fits = [fit(844, 446), fit(812, 469), fit(844, 498), fit(667, 465), fit(844, 600)];
        check("Pitch: it stays whole above a sheet with 10 px of air (the card on 390 x 844), only its two lines when the sheet would cover the rule and the kicker (375 x 812, or a message line on 390 x 844), and steps aside when it would reach the lines (the offline card on 375 x 667)", fits.join(" ") === "room/lines -/lines -/lines -/- -/-", fits);
        let quiet = true;
        try { mkFit(() => null)({ offsetHeight: 400, parentNode: { clientHeight: 800 } }); } catch { quiet = false; }
        check("Pitch: with no stage behind the sheet (a guest's card over the app) fitPitch does nothing", quiet);
        check("Pitch: the card and the steps both rise through riseOverStage, and a message that changes the card's height measures again", /overStage\)riseOverStage\(panel\)/.test(fnText("signInCard")) && /wireSignIn\(panel,\{launch,onSay:overStage\?\(\)=>fitPitch\(panel\):null\}\)/.test(fnText("signInCard")) && /line\.hidden=!text;onSay\?\.\(\)/.test(fnText("wireSignIn")));

        // the legal links' touch areas stop at their neighbours
        check("Sign-in card CSS: the legal links' 44 pt touch areas reach 14 px past the text, and the note's margins above and below are 14 px, so they never take a tap from Create account or the guest link", /\.cn-signin-choices\+\.cn-ios-apple-note\{margin:14px00\}/.test(css) && /\.cn-ios-apple-note\.cn-legal-link-btn:after\{content:"";position:absolute;inset:-14px-6px\}/.test(css) && /\.cn-ios-gate-foot\{[^}]*margin-top:14px\}/.test(css), rule(".cn-ios-gate-foot"));

        // a Recovery reminder that starts the app waits for the session before it can show the card
        const mkReminder = async ({ needs, known, signedAfter }) => {
          const log = [];
          let polls = 0;
          const open = run(["openRecoveryFromReminder"], ["needsAccount", "sessionKnown", "signedIn", "navigate"], "openRecoveryFromReminder",
            () => needs, async ms => { log.push(`known ${ms}`); return known; }, () => ++polls > signedAfter, p => log.push(`navigate ${p} after ${polls} polls`));
          await open();
          return log.join(" | ");
        };
        const cold = await mkReminder({ needs: true, known: true, signedAfter: 2 });
        const coldGuest = await mkReminder({ needs: true, known: false, signedAfter: 99 });
        const coldIn = await mkReminder({ needs: false, known: true, signedAfter: 0 });
        check("Reminder at cold start: a saved session is waited for (the card never flashes for someone signed in); a guest goes straight to the card; someone already signed in goes straight to Recovery", cold === "known 600 | navigate recovery after 3 polls" && coldGuest === "known 600 | navigate recovery after 0 polls" && coldIn === "navigate recovery after 0 polls", [cold, coldGuest, coldIn]);
        check("Reminder at cold start: the notification listener uses it (not navigate() at once), and the wait is 1.5 s at most", /addListener\("localNotificationActionPerformed",ev=>\{if\(ev\?\.notification\?\.extra\?\.open==="recovery"\)openRecoveryFromReminder\(\)/.test(fnText("start")) && !/open==="recovery"\)navigate\("recovery"\)/.test(squash(iosJs)) && /i<30&&!signedIn\(\)/.test(fnText("openRecoveryFromReminder")) && /setTimeout\(resolve,50\)/.test(fnText("openRecoveryFromReminder")));

        // the Account tab: Recovery reminders belong to Recovery, so a guest does not see them
        const reminders = /<h2 class="cn-ios-group-title"([^>]*)>Notifications<\/h2>\s*<div class="cn-ios-group"([^>]*)>\s*<div class="cn-ios-row cn-ios-switch-row">\s*<label for="cnReminderSwitch">/.exec(html);
        check("Account (guest): the Notifications group (Recovery reminders and the test reminder) is for a signed-in person only, heading and group both", !!reminders && /data-ios-signed-in/.test(reminders[1]) && /hidden/.test(reminders[1]) && /data-ios-signed-in/.test(reminders[2]) && /hidden/.test(reminders[2]), reminders?.slice(1));

        // the steps: 'No account needed.' is for a guest
        const intro = run(["INTRO"], [], "INTRO");
        check("Steps: \"No account needed.\" is said only to someone who is not signed in (after the sign-in card it would read oddly); the other steps are the same for everyone", intro[0].guest === " No account needed." && !/No account needed/.test(intro[0].text) && intro.slice(1).every(s => !s.guest) && /INTRO\[step\]\.text\+\(signedIn\(\)\?"":INTRO\[step\]\.guest\|\|""\)/.test(squash(iosJs)), intro[0]);

        // the Debug bundle and its demo runs (the CI's screenshots): a fresh simulator is signed out, so the app opens with the card
        const buildSrc = await readFile(path.join(mobile, "scripts", "build-web.mjs"), "utf8");
        check("Demo runs: build-web puts debug.js ahead of ios.js in a debug bundle (ios.js starts when it runs, so debug.js must have set the first-run key by then)", /const tail = \[\.\.\.\(DEBUG \? \["ios\/debug\.js"\] : \[\]\), \.\.\.IOS_TAIL_SCRIPTS\]/.test(buildSrc));
        const dbgOut = await mkdtemp(path.join(os.tmpdir(), "cn-ios-debug-"));
        try {
          const rd = spawnSync(process.execPath, [path.join(mobile, "scripts", "build-web.mjs"), "--debug", `--out=${dbgOut}`], { cwd: root, encoding: "utf8" });
          const dbgHtml = rd.status === 0 ? await readFile(path.join(dbgOut, "index.html"), "utf8") : "";
          const dbgScripts = [...dbgHtml.matchAll(/<script(?: [^>]*)?src="([^"]+)"/g)].map(m => m[1]);
          check("Demo runs: in the built debug bundle the order is the boot script, script.js, debug.js, ios.js; a release bundle has no debug.js", rd.status === 0 && dbgScripts[1] === "ios/cn-ios-boot.js" && dbgScripts.indexOf("ios/debug.js") > dbgScripts.indexOf("script.js") && dbgScripts.indexOf("ios/debug.js") < dbgScripts.indexOf("ios/ios.js") && !scripts.includes("ios/debug.js"), [rd.status, dbgScripts.join(", ")]);
        } finally { await rm(dbgOut, { recursive: true, force: true }); }

        const dbgSrc = await readFile(path.join(mobile, "web-ios", "debug.js"), "utf8");
        // debug.js is run with a fake page and a virtual clock; `stuck` is a card that does not close
        const demoRun = async (demo, { stuck = false, probeFetch = false } = {}) => {
          const log = [], lines = [], realCalls = [];
          let now = 0, cardUp = true;
          const queue = [];
          const setT = (fn, ms) => { queue.push({ at: now + ms, fn }); return queue.length; };
          const account = { appState: {}, updateAccountUI: () => log.push("updateAccountUI") };
          const guestBtn = { click: () => { log.push("guest link"); if (!stuck) cardUp = false; } };
          const card = { querySelector: s => (/data-gate="guest"/.test(s) ? guestBtn : null) };
          const win = {
            CN_DEMO_SCREEN: demo, CyberNetAccount: account, CNNative: {}, CN_reportError: () => {}, localStorage: { setItem: (k, v) => log.push(`storage ${k}=${v}`) },
            CNIos: { navigate: p => log.push(`navigate ${p}`), askConsent: () => log.push("askConsent"), showQrVerdict: () => log.push("qr verdict") },
            addEventListener: () => {}, fetch: async (...a) => { realCalls.push(a[0]); return { real: true }; },
            dispatchEvent: e => { log.push(`event ${e.type} ${e.detail?.userId}`); if (e.detail?.userId) cardUp = false; return true; }
          };
          const doc = { readyState: "complete", body: null, addEventListener: () => {}, getElementById: id => (id === "cnSignIn" && cardUp ? card : null) };
          const FakeDate = function () { return { toISOString: () => "2026-10-30T12:00:00.000Z" }; };
          FakeDate.now = () => now;
          class FakeEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
          new Function("window", "document", "console", "setTimeout", "navigator", "location", "Date", "CustomEvent", "Event", "Response", dbgSrc)(win, doc, { log: (...a) => lines.push(a.join(" ")) }, setT, {}, { search: "" }, FakeDate, FakeEvent, FakeEvent, Response);
          for (let guard = 0; queue.length && guard < 500; guard++) {
            queue.sort((a, b) => a.at - b.at);
            const next = queue.shift();
            now = next.at;
            next.fn();
          }
          let probe = null;
          if (probeFetch) {
            const own = await win.fetch("/api/recovery-case", { headers: { Authorization: "Bearer cn-demo-session" } });
            const other = await win.fetch("/api/something", { headers: { Authorization: "Bearer another" } });
            probe = { ownStatus: own.status, ownBody: await own.json(), otherReal: other.real === true, realCalls: realCalls.slice() };
          }
          return { log, lines, session: account.appState.session, user: account.appState.user, probe };
        };
        const dCheck = await demoRun("check");
        const dRec = await demoRun("recovery", { probeFetch: true });
        const dConsent = await demoRun("consent");
        const dStuck = await demoRun("check", { stuck: true });
        check("Demo runs: a screen that works without an account taps Continue without an account, then fills the screen and reports ready; nobody is signed in", dCheck.log.includes("guest link") && dCheck.log.indexOf("guest link") < dCheck.log.indexOf("navigate cybernet") && !dCheck.session && dCheck.lines.join("|") === "CN_DEMO_READY check", [dCheck.log, dCheck.lines]);
        check("Demo runs: the screens that need an account (Recovery, consent) plant a fictional signed-in person (an .invalid address); the card closes on the session event before the screen is filled", dRec.session?.access_token === "cn-demo-session" && /@[a-z.]*\.invalid$/.test(dRec.user?.email || "") && !dRec.log.includes("guest link") && dRec.log.indexOf("event cybernet:session demo-user") > -1 && dRec.log.indexOf("event cybernet:session demo-user") < dRec.log.indexOf("navigate recovery") && dRec.lines.join("|") === "CN_DEMO_READY recovery" && dConsent.log.includes("navigate cybernetai") && dConsent.log.includes("askConsent") && dConsent.session?.access_token === "cn-demo-session", [dRec.log, dRec.lines, dConsent.log]);
        check("Demo runs: the fictional person's requests are answered on the device (an empty case list) and never reach the network; every other request goes on as before", dRec.probe?.ownStatus === 200 && Array.isArray(dRec.probe.ownBody.cases) && dRec.probe.ownBody.cases.length === 0 && dRec.probe.otherReal && dRec.probe.realCalls.join() === "/api/something", dRec.probe);
        check("Demo runs: a sign-in card that will not close is reported as CN_DEMO_FAILED after 8 s, never as CN_DEMO_READY", dStuck.lines.length === 1 && /^CN_DEMO_FAILED check the sign-in card is still open$/.test(dStuck.lines[0]) && dStuck.log.includes("navigate cybernet"), [dStuck.lines, dStuck.log]);
        check("Demo runs: the first-run key is set before any demo (a later launch), and the tracking prompt is answered", /setItem\("cn-ios-intro-1", "demo"\)/.test(dbgSrc) && dCheck.log.includes("storage cn-ios-intro-1=demo"));
      }

      // ---- the Account tab for a guest matches the card
      check("Account (guest): the same three ways in as the card (Apple first), under the same lead, wired by the same function; the old two buttons are gone", /<div class="cn-ios-group" data-ios-signed-out(?:="")?>\s*<p class="cn-ios-group-lead">Sign in to get AI explanations, keep your saved explanations and use Recovery\./.test(html) && /<div id="cnAcctSignIn"><\/div>/.test(html) && !/data-ios-action="(sign-in|create)"/.test(html + iosJs) && /entry\.innerHTML=signInChoicesHtml\("cnAcct"\);wireSignIn\(entry\)/.test(fnText("bindAccount")));
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
    // the sign-in card links here: the Terms and the Privacy Policy must not say the app has Sign in with Apple only (30 Oct 2026)
    check("Terms: the sign-in clause names Sign in with Google in the iPhone app and what Google shares, and no longer says Google is on the website only", /Sign in with Google/.test(terms) && /Google confirms who you are and shares your name, email address, and profile picture/.test(terms) && !/Continue with Google on the website, or with Sign in with Apple in the iPhone app\./.test(terms));
    check("Privacy: the iPhone section and the list of other companies name Sign in with Google next to Apple's", /<p><strong>Sign in with Google\.<\/strong>/.test(privacy) && /Sign in with Google in the iPhone app;/.test(privacy));
    check("Privacy explains analytics only after Allow", /App Tracking Transparency/.test(privacy) && /Google Analytics/.test(privacy));
    check("legal pages have the Back bar and no site header", /cn-ios-legal-bar/.test(terms) && !/cn-legal-page-top/.test(terms));
    check("no cookie-settings button in the app", !/data-cn-consent-open/.test(privacy + html));
  }
} finally {
  await rm(out, { recursive: true, force: true });
}
console.log(`ios bundle: ${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
