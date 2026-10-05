// Runs tests/engine-cases.mjs through the shared rules (Quick Scan) and the
// server's deterministic layer (Analysis AI before the AI). No network, no
// keys, no accounts:
//
//   node tests/run-engine.mjs            # all cases
//   node tests/run-engine.mjs --verbose  # scores and signals for every case
//
// The server layer is bundled from netlify/functions/analyze.mts with esbuild
// into .tmp/, with the Netlify runtime stubbed out.
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CASES as BASE_CASES } from "./engine-cases.mjs";
import { readdirSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");

// Extra case files live in tests/cases/*.mjs (one per area), each exporting CASES.
const CASES = [...BASE_CASES];
const casesDir = path.join(root, "tests/cases");
if (existsSync(casesDir)) {
  for (const file of readdirSync(casesDir).filter((name) => name.endsWith(".mjs")).sort()) {
    const mod = await import(pathToFileURL(path.join(casesDir, file)).href);
    for (const c of mod.CASES || []) CASES.push({ ...c, id: `${file.replace(/\.mjs$/, "")}/${c.id}` });
  }
}
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

await import(pathToFileURL(path.join(root, "public/cybernet-engine.js")).href);
const engine = globalThis.CyberNetEngine;
if (!engine) throw new Error("public/cybernet-engine.js did not register CyberNetEngine");

// Guard: every string id in PLAIN_POINTS must be one the engine can emit,
// otherwise the plain-language summary silently never mentions it. Ids are
// read from the source text: addSignal(state,"id"...), combo("id"...), group
// entries {id:"id"...} and template ids like `brand-${...}` (prefixes).
{
  const source = readFileSync(path.join(root, "public/cybernet-engine.js"), "utf8");
  const emitted = new Set();
  const prefixes = new Set();
  for (const m of source.matchAll(/addSignal\(state,"([^"]+)"/g)) emitted.add(m[1]);
  for (const m of source.matchAll(/addSignal\(state,`([^`$]*)\$\{/g)) prefixes.add(m[1]);
  for (const m of source.matchAll(/\bcombo\("([^"]+)"/g)) emitted.add(m[1]);
  for (const m of source.matchAll(/\{id:"([^"]+)"/g)) emitted.add(m[1]);
  const block = source.slice(source.indexOf("const PLAIN_POINTS=["), source.indexOf("];", source.indexOf("const PLAIN_POINTS=[")));
  const plainIds = new Set();
  for (const m of block.matchAll(/(?:ids|unless):\[([^\]]*)\]/g)) for (const s of m[1].matchAll(/"([^"]+)"/g)) plainIds.add(s[1]);
  const missing = [...plainIds].filter((id) => !emitted.has(id) && ![...prefixes].some((p) => id.startsWith(p)));
  if (!plainIds.size) throw new Error("PLAIN_POINTS not found in public/cybernet-engine.js (guard needs updating)");
  if (missing.length) throw new Error(`PLAIN_POINTS lists ids the engine never emits: ${missing.join(", ")}`);
}

// The function file reads Netlify.env at import time; give it an empty one.
globalThis.Netlify = { env: { get: () => undefined } };
mkdirSync(path.join(root, ".tmp"), { recursive: true });
const bundle = path.join(root, ".tmp/analyze.test.mjs");
const esbuild = path.join(root, "node_modules/.bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
if (!existsSync(esbuild)) throw new Error("esbuild not found; run npm install");
const build = spawnSync(esbuild, ["netlify/functions/analyze.mts", "--bundle", "--platform=node", "--format=esm", "--external:openai", `--outfile=${bundle}`, "--log-level=warning"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) throw new Error("esbuild failed");
const server = await import(pathToFileURL(bundle).href + `?t=${Date.now()}`);

// Bands come from the same shared rule the page uses for its headline, list
// tag and plain summary (CyberNetEngine.resultBand / linkNeedsCaution):
// "scam" = 32 or more, "unverified" = CAN'T CONFIRM, only for a borderline
// link (26-31 with a deception or impersonation sign on an unknown domain),
// "safe" = NOT A SCAM or LOW RISK.
const bandLocal = (result) => engine.resultBand(result);
const bandServer = (result) => engine.resultBand(result);

// The plain summary must agree with the band: its "unverified" flag is set
// exactly when the band is "unverified".
function summaryAgrees(result) {
  const plain = engine.plainSummary(result);
  const band = engine.resultBand(result);
  return plain.scam === (band === "scam") && plain.unverified === (band === "unverified");
}

let failures = 0;
const rows = [];
for (const c of CASES.filter((c) => !only || c.id.includes(only))) {
  const local = c.type === "link" ? engine.analyzeLink(c.input) : engine.analyzeText(c.input);
  const srv = c.type === "link" ? server.analyzeLinkServer(c.input) : server.analyzeTextServer(c.input);
  const gotLocal = bandLocal(local);
  const gotServer = bandServer(srv);
  const okLocal = gotLocal === c.expect;
  const okServer = gotServer === c.expect;
  // The server may be stricter than the page (its extra rules), never softer.
  const consistent = srv.score >= local.score - 1;
  const agrees = summaryAgrees(local);
  const pass = okLocal && okServer && consistent && agrees;
  if (!pass) failures++;
  rows.push({ id: c.id, expect: c.expect, local: `${gotLocal}/${local.score}`, server: `${gotServer}/${srv.score}`, ok: pass ? "ok" : `FAIL${!okLocal ? " page" : ""}${!okServer ? " server" : ""}${!consistent ? " server<page" : ""}${!agrees ? " summary" : ""}` });
  if (verbose || !pass) {
    console.log(`\n[${c.id}] expect=${c.expect}`);
    console.log(`  page   ${gotLocal.padEnd(10)} ${String(local.score).padStart(3)}  ${local.scamType}  strong=${local.strong || 0}  signals=${(local.signals || []).map((s) => s.id).join(",")}`);
    console.log(`  server ${gotServer.padEnd(10)} ${String(srv.score).padStart(3)}  ${srv.threatType}  strong=${srv.strong || 0}`);
  }
}
// Wording and Analysis AI checks on the shared rule (labelling only).
{
  const NO_TRICKS = "The address has no known scam tricks.";
  // Analysis AI's merge (public/script.js mergeAnalysis) with an AI reply of
  // the given score: the label must follow the shared rule on the merged result.
  const merged = (local, aiScore, aiVerdict) => {
    let score = Math.max(aiScore, Math.round(local.score * 0.34 + aiScore * 0.66));
    if (local.score >= 60 && local.confidence >= 65) score = Math.max(score, Math.max(55, local.score - 8));
    return { ...local, score, localScore: local.score, verdict: aiVerdict, uncertain: aiVerdict === "inconclusive" };
  };
  const checks = [];
  const check = (id, ok, detail) => { checks.push({ id, ok }); if (!ok) { failures++; console.log(`\n[wording/${id}] FAIL ${JSON.stringify(detail)}`); } };
  const lure = engine.analyzeLink("https://brand-gift-pay.com");
  const lurePlain = engine.plainSummary(lure);
  check("weak-lure-not-no-tricks", engine.resultBand(lure) === "unverified" && lure.signals.some((s) => s.id === "lure-domain") && !lurePlain.points.includes(NO_TRICKS), { score: lure.score, points: lurePlain.points });
  const plainShop = engine.plainSummary(engine.analyzeLink("https://oakandhoney-candles.com/shop/autumn"));
  check("clean-link-no-tricks", plainShop.points[0] === NO_TRICKS, plainShop.points);
  const httpSite = engine.plainSummary(engine.analyzeLink("http://cornerbakery-jlt.ae/menu"));
  check("http-only-no-tricks-plus-https-line", httpSite.points[0] === NO_TRICKS && httpSite.points.some((p) => p.includes("HTTPS")), httpSite.points);
  for (const url of ["https://noon-sale.store/", "https://rewards-uae.shop/"]) {
    const local = engine.analyzeLink(url);
    const m = merged(local, 5, "low_risk");
    const plain = engine.plainSummary(m);
    check(`ai-pulls-scam-under-line:${url}`, local.score >= 32 && m.score < 32 && engine.resultBand(m) === "unverified" && plain.unverified && !plain.points.includes(NO_TRICKS), { local: local.score, merged: m.score, band: engine.resultBand(m) });
  }
  for (const url of ["https://sunrise-bakery-dubai.com/menu", "http://cornerbakery-jlt.ae/menu", "https://portal.brightfuture-school.com/parents/login"]) {
    const local = engine.analyzeLink(url);
    const m = merged(local, 10, "inconclusive");
    check(`ai-inconclusive-stays-low-risk:${url}`, engine.resultBand(m) === "safe" && engine.plainSummary(m).lowRisk === true, { local: local.score, merged: m.score, band: engine.resultBand(m) });
  }
  console.log(`\nwording/merge checks: ${checks.filter((c) => c.ok).length}/${checks.length} pass`);
}
console.log("");
console.table(rows);
const ran = CASES.filter((c) => !only || c.id.includes(only)).length;
console.log(`${ran - failures}/${ran} cases pass`);
process.exit(failures ? 1 : 0);
