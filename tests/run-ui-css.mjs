// Static checks on the UI stylesheets (ui-src/css) for bugs that only show in a browser.
//
//   node tests/run-ui-css.mjs
//
// 1. Pricing Monthly/Yearly thumb (18 Nov 2026): the legacy sheet (public/style.css) moves
//    .toggle-thumb with `transform`. A rule in ui-src that also moved it with the separate
//    `translate` property stacked on top of it, so the thumb overshot the Yearly label by a whole
//    segment. The thumb may be moved by `transform` only, and the yearly state must set it.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "ui-src", "css");
let failed = 0, passed = 0;
const check = (ok, label) => { if (ok) passed++; else { failed++; console.error(`FAIL: ${label}`); } };

let css = "";
for (const name of (await readdir(dir)).filter(f => f.endsWith(".css")).sort()) css += await readFile(path.join(dir, name), "utf8") + "\n";
css = css.replace(/\/\*[\s\S]*?\*\//g, "");

// every "selector { declarations }" block whose selector mentions the thumb (media wrappers do not matter here)
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] })).filter(r => /\.toggle-thumb(?![\w-])/.test(r.sel));
check(rules.length > 0, "found .toggle-thumb rules in ui-src/css");
for (const r of rules) {
  const decls = r.body.split(";").map(d => d.trim()).filter(Boolean);
  for (const d of decls) {
    const m = /^(translate|scale|rotate)\s*:\s*(.+)$/.exec(d);
    if (m) check(m[2].trim() === "none", `"${r.sel}" must not move the thumb with \`${m[1]}\` (use transform): ${d}`);
    if (/^transition\s*:/.test(d) && !/^transition\s*:\s*none/.test(d)) check(!/\btranslate\b/.test(d.replace(/translate[XY3d]*\(/g, "")), `"${r.sel}" must transition transform, not translate: ${d}`);
  }
}
const yearly = rules.filter(r => /\[data-cycle="yearly"\]/.test(r.sel) && /\.toggle-thumb\s*$/.test(r.sel.split(",").pop()));
check(yearly.length >= 1 && yearly.every(r => /transform\s*:\s*translateX\(-?100%\)/.test(r.body)), "the yearly state moves the thumb with transform: translateX(±100%)");

const legacy = (await readFile(path.join(root, "public", "style.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
check(!/\.toggle-thumb[^{}]*\{[^{}]*(?:^|[;{\s])translate\s*:/.test(legacy), "public/style.css does not use `translate` on the thumb");

console.log(`ui css: ${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
