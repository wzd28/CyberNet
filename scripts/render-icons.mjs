#!/usr/bin/env node
// Renders every raster copy of the CyberNet AI mark from scripts/brand/mark.mjs, in headless Edge
// (the same Skia renderer the site's inline SVGs use), each at its own pixel size at DPR 1: nothing
// is downscaled from a big master, so the small icons keep a crisp, closed outline.
//
//   node scripts/render-icons.mjs              every file below, into public/
//   node scripts/render-icons.mjs --out=<dir>  write somewhere else (for a review)
//   node scripts/render-icons.mjs --tokens     print the CSS mask tokens (--cn-mark-sm, --cn-mark-xs)
//                                              for ui-src/css/00-tokens.css, and stop
//   --port=<n>                                 Edge's debugging port (default 5395)
//
// Files (sizes, weights and placements; "top" and "height" are the drawn mark, stroke included, in px;
// the mark is always centred left to right on a pixel boundary, so it renders symmetrically):
//   favicon-16x16.png       16   transparent  micro     height 15, top .875 (the top point lands on a
//                                                       whole pixel row: fully lit)
//   favicon-32x32.png       32   transparent  small     height 30, top 1
//   favicon.ico             16/32/48, the same 16 and 32 renders plus 48 (small, height 42, top 3), each
//                           on an opaque #060A14 square (the old .ico was opaque too); PNG frames
//   favicon-192x192.png     192  transparent  standard  height 154, top 19
//   favicon-512x512.png     512  transparent  standard  height 400, top 56 (favicon.png is the same file)
//   apple-touch-icon.png    180  transparent  standard  height 144, top 18 (iOS fills it black)
//   cybernetshield.png      96   transparent  small     height 78, top 9: both Supabase emails show it
//                                                       at 32 px, so it is drawn as 3x of the site's
//                                                       26 px small mark (top on whole rows at 1, 2, 3x)
//   cybernet-shield.png     512  transparent  standard  height 466, top 23
//   cybernet-mark.svg       the standard mark as a file (viewBox 0 0 24 26)
//   With sharp installed (it comes with netlify-cli), the two old artworks get the new mark in place
//   of the old one, everything else in them untouched:
//   cybernet-logo.png       the round badge: the mark area (inside the black disc) is cleared to
//                           black and the mark drawn there, height 194, top 89, centred at x 256,
//                           in the badge's own cyan #66F6FC (its "AI") with its soft glow
//   cybernetlogo.png        the wordmark: the mark area is cleared and the mark drawn there,
//                           height 568, top 1, centred at x 537.5, in its own cyan #00EBFE (its "AI")
//   Without sharp those two are skipped (with a note) and the PNGs are written as Edge encodes them.
//
// public/og-image.jpg is drawn by scripts/og-image/render.html, which loads /public/cybernet-mark.svg.
// After changing the mark: run this, then bump ?v= on the icon links in public/*.html and the icon
// URLs in public/site.webmanifest.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markSvg, markExtent, markMaskUri } from "./brand/mark.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v === undefined ? true : v]; }));

if (args.tokens) {
  console.log(`  --cn-mark-sm: ${markMaskUri("small")};`);
  console.log(`  --cn-mark-xs: ${markMaskUri("micro")};`);
  process.exit(0);
}

const OUT = path.resolve(ROOT, typeof args.out === "string" ? args.out : "public");
const DBG = Number(args.port) || 5395;
const GROUND = "#060A14";

/** Place the mark: canvas w x h, drawn height `height` px with its top at `top`, centred at `cx`. */
function place(weight, w, h, height, top, cx = w / 2) {
  const e = markExtent(weight), s = height / (e.b - e.t);
  return { w, h, s, x: cx - 12 * s, y: top - e.t * s };
}
const ICONS = [
  { file: "favicon-16x16.png", weight: "micro", box: place("micro", 16, 16, 15, .875) },
  { file: "favicon-32x32.png", weight: "small", box: place("small", 32, 32, 30, 1) },
  { file: "favicon-192x192.png", weight: "standard", box: place("standard", 192, 192, 154, 19) },
  { file: "favicon-512x512.png", also: ["favicon.png"], weight: "standard", box: place("standard", 512, 512, 400, 56) },
  { file: "apple-touch-icon.png", weight: "standard", box: place("standard", 180, 180, 144, 18) },
  { file: "cybernetshield.png", weight: "small", box: place("small", 96, 96, 78, 9) },
  { file: "cybernet-shield.png", weight: "standard", box: place("standard", 512, 512, 466, 23) },
];
const ICO = [
  { size: 16, weight: "micro", box: place("micro", 16, 16, 15, .875) },
  { size: 32, weight: "small", box: place("small", 32, 32, 30, 1) },
  { size: 48, weight: "small", box: place("small", 48, 48, 42, 3) },
];
// the old artworks: the area to clear (x, y, w, h), what to clear it to, and where the mark goes. Each
// keeps its own cyan, the one its "AI" letters are drawn in, so an image never shows two cyans; the
// badge also keeps its soft glow (measured on the old badge: about 9% at 2 px out, 1% at 8 px).
const ARTWORK = [
  { file: "cybernet-logo.png", clear: [160, 75, 192, 218], fill: { r: 0, g: 0, b: 0, alpha: 1 }, mark: { height: 194, top: 89, cx: 256 },
    color: "#66F6FC", glow: { color: "#00F6FC", blur: 5, opacity: 0.26 } },
  { file: "cybernetlogo.png", clear: [290, 0, 496, 575], fill: { r: 0, g: 0, b: 0, alpha: 0 }, mark: { height: 568, top: 1, cx: 537.5 },
    color: "#00EBFE" },
];

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { console.log("[icons] sharp not installed: PNGs are written as Edge encodes them; the two old artworks are skipped"); }

// ---------------------------------------------------------------- drive Edge
const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!exe) throw new Error("Microsoft Edge (or Chrome) not found");
const profile = path.join(os.tmpdir(), `cn-icons-${process.pid}`);
const child = spawn(exe, ["--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--hide-scrollbars", "--force-color-profile=srgb", "--window-size=1200,1000", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanup = () => {
  try { child.kill(); } catch {}
  if (process.platform === "win32") try { spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*cn-icons-${process.pid}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }); } catch {}
};
let target;
for (let i = 0; i < 200 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(t => t.type === "page"); } catch {} if (!target) await sleep(200); }
if (!target) { cleanup(); throw new Error("Edge did not start"); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

/** One SVG drawn at (0, 0) at DPR 1 on a transparent page, captured at exactly w x h. */
async function render(svg, w, h) {
  await evaluate(`(async () => { document.body.innerHTML = ${JSON.stringify(svg)}; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return 1; })()`);
  const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: true, fromSurface: true });
  return Buffer.from(r.data, "base64");
}
const tidy = async buf => (sharp ? sharp(buf).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer() : buf);

/** favicon.ico with PNG frames (every browser since IE 11 and Windows Vista reads them). */
function ico(frames) {
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach(({ size, png }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o); head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3); head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...frames.map(f => f.png)]);
}

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send("Page.navigate", { url: "data:text/html,<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body></body></html>" });
  await sleep(300);
  await mkdir(OUT, { recursive: true });

  for (const icon of ICONS) {
    const buf = await tidy(await render(markSvg(icon.weight, { box: icon.box }), icon.box.w, icon.box.h));
    for (const f of [icon.file, ...(icon.also || [])]) { await writeFile(path.join(OUT, f), buf); console.log(`[icons] ${f.padEnd(22)} ${icon.box.w}x${icon.box.h}  ${icon.weight.padEnd(8)}  ${(buf.length / 1024).toFixed(1)} KB`); }
  }

  const frames = [];
  for (const f of ICO) frames.push({ size: f.size, png: await tidy(await render(markSvg(f.weight, { box: f.box, bg: GROUND }), f.size, f.size)) });
  const icoBuf = ico(frames);
  await writeFile(path.join(OUT, "favicon.ico"), icoBuf);
  console.log(`[icons] favicon.ico            ${ICO.map(f => f.size).join("/")} on ${GROUND}  ${(icoBuf.length / 1024).toFixed(1)} KB`);

  await writeFile(path.join(OUT, "cybernet-mark.svg"), markSvg("standard") + "\n");
  console.log("[icons] cybernet-mark.svg      standard, viewBox 0 0 24 26");

  if (sharp) {
    for (const a of ARTWORK) {
      const src = path.join(ROOT, "public", a.file);
      const meta = await sharp(src).metadata();
      const [cx0, cy0, cw, ch] = a.clear;
      const box = place("standard", cw, ch, a.mark.height, a.mark.top - cy0, a.mark.cx - cx0);
      const mark = await sharp(await render(markSvg("standard", { box, color: a.color, glow: a.glow }), cw, ch)).ensureAlpha().raw().toBuffer();
      // Pixel by pixel, so nothing outside the area changes by even one level: inside it, the old mark
      // is replaced by the fill and the new mark is laid over that (straight-alpha "over").
      const { data: px, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const fill = [a.fill.r, a.fill.g, a.fill.b, Math.round(a.fill.alpha * 255)];
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const o = ((cy0 + y) * info.width + cx0 + x) * 4, m = (y * cw + x) * 4;
        const sa = mark[m + 3] / 255, da = fill[3] / 255, oa = sa + da * (1 - sa);
        for (let c = 0; c < 3; c++) px[o + c] = oa ? Math.round((mark[m + c] * sa + fill[c] * da * (1 - sa)) / oa) : 0;
        px[o + 3] = Math.round(oa * 255);
      }
      const out = await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
      await writeFile(path.join(OUT, a.file), out);
      console.log(`[icons] ${a.file.padEnd(22)} ${meta.width}x${meta.height}  mark area ${cw}x${ch} at ${cx0},${cy0}  ${(out.length / 1024).toFixed(1)} KB`);
    }
  }
} finally { try { ws.close(); } catch {} cleanup(); }
