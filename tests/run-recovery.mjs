// Recovery Mode's deterministic layer: the incident classifier, the instant
// (fallback) plan and the plan sanitizers. No network, no keys, no accounts:
//
//   node tests/run-recovery.mjs
//
// netlify/functions/recovery-mode.mts and recovery-update.mts are bundled with
// esbuild into .tmp/ (the OpenAI SDK stays external and is never called), with
// the Netlify runtime stubbed out, the same way tests/run-engine.mjs does it.
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RECOVERY_CASES } from "./recovery-cases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
globalThis.Netlify = { env: { get: () => undefined } };
mkdirSync(path.join(root, ".tmp"), { recursive: true });
const esbuild = path.join(root, "node_modules/.bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
if (!existsSync(esbuild)) throw new Error("esbuild not found; run npm install");

async function bundle(entry, name) {
  const out = path.join(root, ".tmp", name);
  const build = spawnSync(esbuild, [entry, "--bundle", "--platform=node", "--format=esm", "--external:openai", `--outfile=${out}`, "--log-level=warning"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (build.status !== 0) throw new Error(`esbuild failed for ${entry}`);
  return import(pathToFileURL(out).href + `?t=${Date.now()}`);
}

const mode = await bundle("netlify/functions/recovery-mode.mts", "recovery-mode.test.mjs");
const update = await bundle("netlify/functions/recovery-update.mts", "recovery-update.test.mjs");

const RISK = ["low", "medium", "high", "critical"];
const URGENCY = ["soon", "today", "immediate"];
let failures = 0;
let checks = 0;
function check(id, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`\n[${id}] FAIL ${JSON.stringify(detail)}`);
  }
}

const allActions = (plan) => [
  ...(plan.immediateActions || []),
  ...Object.values(plan.timeline || {}).flat(),
];

// ── Classifier: category and minimum risk/urgency per description ──
const rows = [];
for (const c of RECOVERY_CASES) {
  const got = mode.classifyIncident(c.description, c.quickAnswers || {}, c.incidentType || "");
  const okCategory = !c.category || got.incidentCategory === c.category;
  const okRisk = !c.minRisk || RISK.indexOf(got.riskFloor) >= RISK.indexOf(c.minRisk);
  const okMaxRisk = !c.maxRisk || RISK.indexOf(got.riskFloor) <= RISK.indexOf(c.maxRisk);
  const okUrgency = !c.minUrgency || URGENCY.indexOf(got.urgencyFloor) >= URGENCY.indexOf(c.minUrgency);
  const okMoney = c.money === undefined || Boolean(got.moneyInvolved) === c.money;
  const ok = okCategory && okRisk && okMaxRisk && okUrgency && okMoney;
  rows.push({ id: c.id, category: got.incidentCategory, risk: got.riskFloor, urgency: got.urgencyFloor, money: Boolean(got.moneyInvolved), ok: ok ? "ok" : "FAIL" });
  check(`classify/${c.id}`, ok, { expect: { category: c.category, minRisk: c.minRisk, maxRisk: c.maxRisk, minUrgency: c.minUrgency, money: c.money }, got });
}

// ── Instant plan (sanitizePlan with no AI result) ──
for (const c of RECOVERY_CASES) {
  const classifier = mode.classifyIncident(c.description, c.quickAnswers || {}, c.incidentType || "");
  const plan = mode.sanitizePlan(null, classifier, c.region || "");
  const actions = allActions(plan);
  const titles = actions.map((a) => a.title.trim().toLowerCase());
  check(`fallback-no-duplicates/${c.id}`, new Set(titles).size === titles.length, titles);
  check(`fallback-ids-unique/${c.id}`, new Set(actions.map((a) => a.id)).size === actions.length, actions.map((a) => a.id));
  check(`fallback-at-floor/${c.id}`, plan.riskLevel === classifier.riskFloor && plan.urgency === classifier.urgencyFloor, { plan: [plan.riskLevel, plan.urgency], floor: [classifier.riskFloor, classifier.urgencyFloor] });
  const bankFirst = /bank|card issuer/i.test(plan.immediateActions[0]?.title || "");
  check(`fallback-bank-step/${c.id}`, Boolean(classifier.moneyInvolved) === bankFirst, { money: classifier.moneyInvolved, first: plan.immediateActions[0]?.title });
  check(`fallback-size/${c.id}`, plan.immediateActions.length <= 3 && actions.length <= 3 + 4 * 2, actions.length);
}

// ── An AI plan below the floor is raised to it; list caps hold ──
{
  const classifier = mode.classifyIncident("I gave the OTP to a caller and they took 3000 AED from my account", { sharedOtp: true, sentMoney: true });
  const many = Array.from({ length: 9 }, (_, i) => ({ title: `Step ${i}`, instruction: "x", why: "y", verification: "z", priority: "high", estimatedMinutes: 5 }));
  const plan = mode.sanitizePlan({ riskLevel: "low", urgency: "soon", immediateActions: many, first10Minutes: many, firstHour: many, first24Hours: many, next7Days: many }, classifier, "UAE");
  check("ai-plan-raised-to-floor", RISK.indexOf(plan.riskLevel) >= RISK.indexOf(classifier.riskFloor) && URGENCY.indexOf(plan.urgency) >= URGENCY.indexOf(classifier.urgencyFloor), { plan: [plan.riskLevel, plan.urgency], floor: [classifier.riskFloor, classifier.urgencyFloor] });
  check("ai-plan-caps", plan.immediateActions.length === 3 && Object.values(plan.timeline).every((list) => list.length <= 2), Object.values(plan.timeline).map((l) => l.length));
  check("ai-plan-uae-resources", plan.reportingResources.every((r) => r.country === "United Arab Emirates"), plan.reportingResources.map((r) => r.country));
}

// ── Update sanitizer keeps the same plan-size caps as the start path ──
{
  const many = Array.from({ length: 9 }, (_, i) => ({ title: `Step ${i}`, instruction: "x", why: "y", verification: "z", priority: "normal", estimatedMinutes: 5 }));
  const previous = { incidentType: "Phishing", riskLevel: "high", urgency: "today", confidence: 60, immediateActions: [], reportingResources: [] };
  const updated = update.sanitizeUpdate({ riskLevel: "medium", urgency: "today", immediateActions: many, first10Minutes: many, firstHour: many, first24Hours: many, next7Days: many, whatWeKnow: many.map((a) => a.title), resolutionAssessment: "monitoring" }, previous);
  check("update-caps", updated.immediateActions.length <= 3 && Object.values(updated.timeline).every((list) => list.length <= 2) && updated.whatWeKnow.length <= 4, { immediate: updated.immediateActions.length, timeline: Object.values(updated.timeline).map((l) => l.length), whatWeKnow: updated.whatWeKnow.length });
  const kept = update.sanitizeUpdate(null, previous);
  check("update-no-ai-keeps-plan", kept.riskLevel === "high" && kept.resolutionAssessment === "active", kept);
}

// ── Model routing is shared by the start and update paths ──
check("model-routing-shared", ["critical", "high", "medium", "low"].every((risk) => mode.modelForRiskFloor(risk) === update.modelForRiskFloor(risk)), ["critical", "high", "medium", "low"].map((risk) => [mode.modelForRiskFloor(risk), update.modelForRiskFloor(risk)]));

console.table(rows);
console.log(`${checks - failures}/${checks} recovery checks pass`);
process.exit(failures ? 1 : 0);
