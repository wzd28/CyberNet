// Unit tests for public/cybernet-onboarding.js (the first-run welcome): when it shows, and what
// the plan step says. The file is loaded in a sandbox with a minimal window stub; its pure
// helpers are reached through window.CNOnboarding._test. The card itself (focus, Esc, layout)
// is checked in a real browser, not here.
//   node tests/run-onboarding.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "public", "cybernet-onboarding.js"), "utf8");

function load(href = "https://cybernetai.app/", navName = href) {
  const listeners = {};
  const window = {
    location: new URL(href),
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    localStorage: { getItem: () => null, setItem: () => {} }
  };
  const sandbox = {
    window,
    document: { documentElement: { classList: { contains: () => false } } },
    performance: { getEntriesByType: () => [{ name: navName }] },
    URL, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, console
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "cybernet-onboarding.js" });
  return { api: window.CNOnboarding, listeners };
}

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}\n  expected ${e}\n  got      ${a}`);
}

const { api, listeners } = load();
const T = api._test;

check("hook is exposed", typeof api.open, "function");
check("listens for the session event", (listeners["cybernet:session"] || []).length, 1);

/* ---------- decide ---------- */
const confirmed = { id: "u1", email_confirmed_at: "2026-10-18T08:00:00Z", user_metadata: {} };
const base = { user: confirmed, flag: false, invitePage: false, pendingInvite: false, recovery: false, checkout: false, blocked: false, typing: false };
const d = over => T.decide({ ...base, ...over });
check("new confirmed user sees it", d({}), "show");
check("signed out", d({ user: null }), "signed-out");
check("onboarded on the account", d({ user: { ...confirmed, user_metadata: { onboarded: true } } }), "done-account");
check("onboarded: only true counts", d({ user: { ...confirmed, user_metadata: { onboarded: "yes" } } }), "show");
check("flag in this browser", d({ flag: true }), "done-browser");
check("email not confirmed", d({ user: { id: "u2", user_metadata: {} } }), "unconfirmed");
check("confirmed_at also counts", d({ user: { id: "u3", confirmed_at: "2026-10-18T08:00:00Z" } }), "show");
check("accept-invite page", d({ invitePage: true }), "invite");
check("saved team invite waiting", d({ pendingInvite: true }), "invite");
check("password recovery", d({ recovery: true }), "recovery");
check("checkout return", d({ checkout: true }), "checkout");
check("another dialog or the cookie bar open: wait", d({ blocked: true }), "wait");
check("typing in a field: leave them alone", d({ typing: true }), "busy");
check("blocked wins over typing (a dialog with a focused field)", d({ blocked: true, typing: true }), "wait");
check("account flag wins over a skip reason", d({ user: { ...confirmed, user_metadata: { onboarded: true } }, checkout: true }), "done-account");
// Existing accounts (created more than 7 days ago) never see the welcome.
const NOW = Date.parse("2026-10-18T12:00:00Z");
check("account created 8 days ago: existing", d({ user: { ...confirmed, created_at: "2026-10-10T12:00:00Z" }, now: NOW }), "existing");
check("account created today: shows", d({ user: { ...confirmed, created_at: "2026-10-18T08:00:00Z" }, now: NOW }), "show");
check("account created 6 days ago: shows", d({ user: { ...confirmed, created_at: "2026-10-12T13:00:00Z" }, now: NOW }), "show");
check("no created_at: treated as new", d({ now: NOW }), "show");
check("existing wins over unconfirmed", d({ user: { id: "u9", created_at: "2026-01-01T00:00:00Z" }, now: NOW }), "existing");
// Only on Home, and never right after a sign-in that a tool started.
check("on another page: away (waits for Home)", d({ away: true }), "away");
check("sign-in started from a tool: task", d({ task: true }), "task");
check("task wins over waiting", d({ task: true, blocked: true }), "task");
check("a dialog open on another page: wait", d({ away: true, blocked: true }), "wait");

/* ---------- readStart: the address the page was opened with ---------- */
check("plain home", T.readStart(["https://cybernetai.app/"]), { checkout: false, recovery: false, confirmed: false });
check("checkout success", T.readStart(["https://cybernetai.app/?checkout=success"]).checkout, true);
check("checkout cancelled", T.readStart(["https://cybernetai.app/pricing?checkout=cancelled"]).checkout, true);
check("reset link", T.readStart(["https://cybernetai.app/?reset=1"]).recovery, true);
check("recovery hash", T.readStart(["https://cybernetai.app/#access_token=x&type=recovery"]).recovery, true);
check("confirmation hash", T.readStart(["https://cybernetai.app/#access_token=x&type=signup"]).confirmed, true);
check("any of the addresses counts", T.readStart(["https://cybernetai.app/", "https://cybernetai.app/?checkout=success"]).checkout, true);
check("bad address ignored", T.readStart(["::::", null]).checkout, false);
// script.js strips ?checkout= before this file runs; the navigation entry still has it
check("loaded after the URL was cleaned", load("https://cybernetai.app/", "https://cybernetai.app/?checkout=success").api.state.start.checkout, true);

/* ---------- parseCard: the plan cards on the Pricing page ---------- */
const freeCard = T.parseCard([
  "5 Quick Scans per day",
  "3 AI analyses per day, shared across Text, Link, and Image",
  "Accurate AI-powered threat detection",
  "1 Recovery case per day, 1 update/day",
  "No saved scan history"
]);
check("free card", freeCard, { quickScans: 5, analyses: 3, recovery: 1 });
const proCard = T.parseCard([
  "Everything in CyberNet AI Free",
  "Unlimited Quick Scans",
  "15 AI analyses per day",
  "3 Recovery cases per day, with a reminder email if a case sits idle for a day"
]);
check("pro card: unlimited Quick Scans", proCard.quickScans === Infinity, true);
check("pro card: numbers", [proCard.analyses, proCard.recovery], [15, 3]);
check("card with no numbers", T.parseCard(["Shared daily pool: 50 analyses/day on 5 seats"]), {});

/* ---------- liveLimit ---------- */
check("limit 3", T.liveLimit({ limit: 3 }), 3);
check("limit 0 is unknown", T.liveLimit({ limit: 0 }), null);
check("missing is unknown", T.liveLimit(undefined), null);
check("admin-size limit is unlimited", T.liveLimit({ limit: 999999 }) === Infinity, true);

/* ---------- planSummary ---------- */
const cards = { free: freeCard, pro: proCard, business: {} };
const card = plan => cards[plan];
const reset = "2026-10-19T00:00:00.000Z";
const free = {
  accountReady: true, accountStatusError: false, user: { id: "u1" },
  profile: { plan: "free" },
  usage: { used: 0, limit: 3, remaining: 3, resetDate: reset },
  quickScanUsage: { used: 0, limit: 0 }, recoveryUsage: { used: 0, limit: 0 }
};
const s1 = T.planSummary(free, card);
check("free: plan", s1.plan, "free");
check("free: values from the server, then the card", s1.items.map(i => i.value), [3, 5, 1]);
check("free: labels", s1.items.map(i => i.label), ["AI analyses a day", "Quick Scans a day", "Recovery case a day"]);
check("free: a reset time is given", s1.reset.length > 0, true);

// The server is the source of truth: a different live number wins over the card.
const s2 = T.planSummary({ ...free, usage: { ...free.usage, limit: 4 }, quickScanUsage: { limit: 7 } }, card);
check("live numbers win over the card", s2.items.map(i => i.value), [4, 7, 1]);

// script.js falls back to 5 when the status call fails; that must never be shown.
const s3 = T.planSummary({ ...free, accountStatusError: true, usage: { used: 0, limit: 5, remaining: 5 } }, card);
check("failed status call: no plan, no numbers", [s3.plan, s3.items.length, s3.reset], ["", 0, ""]);
check("status not loaded yet: nothing", T.planSummary({ ...free, accountReady: false }, card).items.length, 0);
check("no state at all", T.planSummary(null, card).plan, "");

const pro = { ...free, profile: { plan: "pro" }, usage: { used: 2, limit: 15, remaining: 13, resetDate: reset } };
const s4 = T.planSummary(pro, card);
check("pro: values", s4.items.map(i => i.value === Infinity ? "Unlimited" : i.value), [15, "Unlimited", 3]);
check("pro: unlimited label has no 'a day'", s4.items[1].label, "Quick Scans");

const biz = { ...free, profile: { plan: "business" }, usage: { used: 0, limit: 90, remaining: 90, resetDate: reset }, quickScanUsage: { limit: 90 }, recoveryUsage: { limit: 36 } };
const s5 = T.planSummary(biz, card);
check("business: one shared pool plus Recovery", s5.items.map(i => i.value), [90, 36]);
check("business: labels", s5.items.map(i => i.label), ["Analyses a day for your team", "Recovery cases a day for your team"]);
check("business without a live Recovery number", T.planSummary({ ...biz, recoveryUsage: { limit: 0 } }, card).items.length, 1);

const admin = { ...free, profile: { plan: "business" }, usage: { used: 0, limit: 999999, remaining: 999999, resetDate: null } };
const s6 = T.planSummary(admin, card);
check("admin: unlimited, no reset time", [s6.items[0].value === Infinity, s6.reset], [true, ""]);

check("unknown plan name reads as free", T.planSummary({ ...free, profile: { plan: "guest" } }, card).plan, "free");

console.log(`onboarding: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
