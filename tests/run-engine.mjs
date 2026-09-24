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

const SCAM = engine.SCAM_THRESHOLD;
function bandLocal(result) {
  if (result.score >= SCAM) return "scam";
  if (result.kind === "link" && !result.officialBrand) return "unverified";
  return "safe";
}
function bandServer(result) {
  if (result.score >= SCAM) return "scam";
  if (result.kind === "link" && !result.officialBrand) return "unverified";
  return "safe";
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
  if (!okLocal || !okServer || !consistent) failures++;
  rows.push({ id: c.id, expect: c.expect, local: `${gotLocal}/${local.score}`, server: `${gotServer}/${srv.score}`, ok: okLocal && okServer && consistent ? "ok" : `FAIL${!okLocal ? " page" : ""}${!okServer ? " server" : ""}${!consistent ? " server<page" : ""}` });
  if (verbose || !(okLocal && okServer && consistent)) {
    console.log(`\n[${c.id}] expect=${c.expect}`);
    console.log(`  page   ${gotLocal.padEnd(10)} ${String(local.score).padStart(3)}  ${local.scamType}  strong=${local.strong || 0}  signals=${(local.signals || []).map((s) => s.id).join(",")}`);
    console.log(`  server ${gotServer.padEnd(10)} ${String(srv.score).padStart(3)}  ${srv.threatType}  strong=${srv.strong || 0}`);
  }
}
console.log("");
console.table(rows);
const ran = CASES.filter((c) => !only || c.id.includes(only)).length;
console.log(`${ran - failures}/${ran} cases pass`);
process.exit(failures ? 1 : 0);
