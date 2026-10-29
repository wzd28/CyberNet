// Engine parity fixtures for the iPhone app (BUILD-PLAN §10, §11.2).
//
//   node mobile/tests/make-engine-fixtures.mjs           write mobile/tests/engine-fixtures.json
//   node mobile/tests/make-engine-fixtures.mjs --check   exit 1 if the file is out of date with the engine
//                                                        or the cases (run it after any engine change)
//
// Every case in tests/engine-cases.mjs and tests/cases/*.mjs runs through public/cybernet-engine.js in
// Node, and the result is recorded: score, band (scam / unverified / safe, the engine's own resultBand)
// and the headline the app shows. CI runs the same cases in the simulator's WebKit (the engine the app
// and the Share Extension use, through the debug bundle's self-test) and compares with this file: Node
// and WebKit both implement WHATWG URL, so every label must match exactly. Detection rules are never
// changed here; this only records what they do.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const OUT = path.join(here, "engine-fixtures.json");
const CHECK = process.argv.includes("--check");

const { CASES: BASE } = await import(pathToFileURL(path.join(root, "tests", "engine-cases.mjs")).href);
const cases = [...BASE];
const dir = path.join(root, "tests", "cases");
if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter(f => f.endsWith(".mjs")).sort()) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    for (const c of mod.CASES || []) cases.push({ ...c, id: `${file.replace(/\.mjs$/, "")}/${c.id}` });
  }
}

await import(pathToFileURL(path.join(root, "public", "cybernet-engine.js")).href);
const E = globalThis.CyberNetEngine;
if (!E) throw new Error("public/cybernet-engine.js did not register CyberNetEngine");

// The headline rule the app and the website show (script.js getDanger, ios.js verdictOf).
export function headline(result) {
  const score = Number(result?.score) || 0;
  if (score >= E.SCAM_THRESHOLD) return "SCAM";
  if (result?.kind === "link" && !result.officialBrand) return E.linkNeedsCaution(result) ? "CAN'T CONFIRM" : "LOW RISK";
  return "NOT A SCAM";
}

const fixtures = cases.map(c => {
  const r = c.type === "link" ? E.analyzeLink(c.input) : E.analyzeText(c.input);
  return { id: c.id, type: c.type, input: c.input, score: r.score, band: E.resultBand(r), headline: headline(r) };
});
const json = JSON.stringify({
  engineVersion: E.VERSION,
  generatedBy: "mobile/tests/make-engine-fixtures.mjs",
  note: "Node results of public/cybernet-engine.js for every engine test case; the simulator's WebKit must give the same band and headline.",
  count: fixtures.length,
  cases: fixtures
}, null, 1) + "\n";

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== json) {
    console.error("[engine-fixtures] mobile/tests/engine-fixtures.json is out of date. Run: node mobile/tests/make-engine-fixtures.mjs");
    process.exit(1);
  }
  console.log(`[engine-fixtures] up to date (${fixtures.length} cases, engine ${E.VERSION}).`);
} else {
  writeFileSync(OUT, json);
  console.log(`[engine-fixtures] wrote ${fixtures.length} cases (engine ${E.VERSION}) to mobile/tests/engine-fixtures.json`);
}
