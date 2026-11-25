// The website's limit dialog (script.js showLimitDialog, owner request 25 Nov 2026): the pop-up shown
// right after a run is refused because a daily limit or a Recovery update cooldown is reached.
// Checks, without a browser:
//   - the reset maths (next 00:00 UTC, next 12:00 Asia/Dubai = 08:00 UTC, the countdown text never negative)
//   - every piece of the dialog and every call to it sits inside /*@web*/ regions, so the iPhone app
//     bundle (which deletes those regions from script.js) gets none of its upgrade wording
//   - the copy stays true (Pro = 15 AI explanations, 3 Recovery cases, updates 2 hours apart; never
//     "unlimited" AI), the actions per plan, the dialog semantics and the built copy in public/legacy
//
//   node tests/run-limit-dialog.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(root, rel), "utf8");
let failed = 0, passed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed++; return; }
  failed++; console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

const src = read("public/script.js");
const legacy = read("public/legacy/script.js");
const index = read("public/index.html");
const css = read("public/cybernet-account-api-upgrade.css");

// ── reset maths ──
const math = src.slice(src.indexOf("/*cn-limit-math*/"), src.indexOf("/*end-cn-limit-math*/"));
check("math block present", math.length > 50);
const { cnNextUtcMidnight, cnNextDubaiNoon, cnWaitText, CN_PLAN_LIMITS } =
  new Function(`${math}; return { cnNextUtcMidnight, cnNextDubaiNoon, cnWaitText, CN_PLAN_LIMITS };`)();
const T = s => Date.parse(s);
check("utc midnight", cnNextUtcMidnight(T("2026-11-25T23:59:00Z")) === T("2026-11-26T00:00:00Z"));
check("utc midnight at midnight", cnNextUtcMidnight(T("2026-11-26T00:00:00Z")) === T("2026-11-27T00:00:00Z"));
check("utc midnight month end", cnNextUtcMidnight(T("2026-11-30T12:00:00Z")) === T("2026-12-01T00:00:00Z"));
check("dubai noon before", cnNextDubaiNoon(T("2026-11-25T07:59:00Z")) === T("2026-11-25T08:00:00Z"));
check("dubai noon at", cnNextDubaiNoon(T("2026-11-25T08:00:00Z")) === T("2026-11-26T08:00:00Z"));
check("dubai noon after", cnNextDubaiNoon(T("2026-11-25T20:00:00Z")) === T("2026-11-26T08:00:00Z"));
check("wait negative", cnWaitText(-5000) === "");
check("wait zero", cnWaitText(0) === "");
check("wait seconds round up", cnWaitText(20000) === "1m");
check("wait minutes", cnWaitText(52 * 60000) === "52m");
check("wait hours", cnWaitText(2 * 3600000) === "2h");
check("wait hours minutes", cnWaitText((3 * 60 + 12) * 60000) === "3h 12m");
check("plan numbers", JSON.stringify([CN_PLAN_LIMITS.free.ai, CN_PLAN_LIMITS.pro.ai, CN_PLAN_LIMITS.business.ai, CN_PLAN_LIMITS.free.cases, CN_PLAN_LIMITS.pro.cases, CN_PLAN_LIMITS.business.cases, CN_PLAN_LIMITS.pro.gapHours]) === "[3,15,50,1,3,20,2]");

// ── web-only: the app bundle deletes /*@web*/ ... /*@end-web*/ ──
const stripped = src.replace(/\/\*@web\*\/[\s\S]*?\/\*@end-web\*\//g, "");
for (const word of ["showLimitDialog", "cnLimit", "CN_PLAN_LIMITS", "See Business plans", "limit_dialog", "cn-limit"]) {
  check(`no "${word}" outside web regions`, !stripped.includes(word));
}
const calls = src.match(/showLimitDialog\(\{kind:"(\w+)"/g) || [];
const kinds = new Set(calls.map(c => c.match(/"(\w+)"/)[1]));
for (const k of ["ai", "cases", "update", "cooldown", "quickscan"]) check(`hook for ${k}`, kinds.has(k));
check("index.html adds no dialog markup", !index.includes("cnLimitModal"));

// ── copy and actions ──
const block = src.slice(src.indexOf("/*cn-limit-math*/"), src.indexOf("window.CN_showLimitDialog"));
check("no unlimited AI promise", !/unlimited/i.test(block));
check("no exclamation marks in copy", !/"[^"]*![^"=]*"|`[^`]*![^`=]*`/.test(block.replace(/!==|!=|!\w|!\(|!\[/g, "")));
check("pro offer numbers", block.includes("Pro gives you 15 AI explanations and 3 Recovery cases a day, with Recovery updates 2 hours apart."));
check("business offer numbers", block.includes("50 AI explanations and 20 Recovery cases a day"));
check("free primary", block.includes('primary:"Upgrade to Pro",secondary:"Not now"'));
check("pro primary", block.includes('primary:"See Business plans",secondary:"Close"'));
check("business ok only", block.includes('primary:"OK",secondary:""'));
check("upgrade uses the pricing page", block.includes('switchPage("pricing")') && !block.includes("startCheckout("));
check("dialog semantics", block.includes('role="dialog"') && block.includes('aria-modal="true"') && block.includes('aria-labelledby="cnLimitTitle"'));
check("close button named Close", block.includes('aria-label="Close"'));
check("escape closes", block.includes('event.key==="Escape"'));
check("backdrop closes", block.includes("event.target===modal"));
check("focus trap", block.includes('event.key!=="Tab"'));
check("countdown ticks 30s", block.includes("setInterval(tick,30000)"));
check("timer cleared on close", block.includes("clearInterval(s.timer)"));
check("local clock", block.includes("toLocaleTimeString([]"));
check("titles", ["You've used today's AI explanations", "You've used today's Recovery cases", "You've used today's Quick Scans", "Your next Recovery update isn't ready yet"].every(t => block.includes(t)));

check("esc and tab trap listen on the document while open (focus may leave the card)", block.includes('document.addEventListener("keydown",onKey,true)') && block.includes('document.removeEventListener("keydown",s.onKey,true)') && !block.includes('modal.addEventListener("keydown"'));
check("update limit says 1 a day only for Free", /kind==="update"[^\n]*tier==="free"\?/.test(block));

// ── built copy, styles, cache-busting ──
check("legacy build has the dialog", legacy.includes("showLimitDialog") && legacy.includes("See Business plans"));
check("css has the dialog rules", css.includes("#cnLimitModal") && css.includes(".cn-limit-secondary") && css.includes("prefers-reduced-motion"));
check("css version bumped", /cybernet-account-api-upgrade\.css\?v=20261125-/.test(index));

if (failed) { console.error(`limit dialog: ${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`limit dialog: ${passed} checks passed`);
