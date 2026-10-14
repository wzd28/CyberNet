// Renders the CyberNet 3D kit to transparent WebP files in public/ui/3d/, using the same
// models as the live hero (public/ui/3d/hero3d-kit.js, window.CNHero3D) in headless Edge.
//
//   node scripts/render-3d.mjs                 every file below
//   node scripts/render-3d.mjs --only=shield,orb
//   node scripts/render-3d.mjs --land          (re)bake the globe's land bits into the kit
//   node scripts/render-3d.mjs --out=<dir>     write somewhere else (for a review)
//   node scripts/render-3d.mjs --strip=<file.jpg> [--times=9,10,11] [--n=520] [--lite]
//                                              a filmstrip of the hero over time (review)
//   node scripts/render-3d.mjs --stamp         only stamp the kit's hash into the runtime
//
// The kit's readable source is public/ui/3d/hero3d-kit.js. Every run minifies it (esbuild,
// as the UI build does) to hero3d-kit.min.js, which both the site and this renderer load,
// and stamps that file's content hash into ui-src/js/10-hero3d.js (KIT_V), so a changed kit
// is never served from a stale cache. After editing the kit: run this (--only=hero when the
// scene changed, so the poster still matches the first live frame), then rebuild the bundle
// (node scripts/build-ui.mjs).
//
// Files (transparent background, one studio light set, ACES tone mapping):
//   hero-globe.webp 1200, hero-globe-800.webp, hero-globe-480.webp  the hero poster: the live
//     scene's frame at T0, so the canvas can crossfade over it without a jump
//   shield.webp 640, shield-320.webp   the CyberNet shield (cyan)
//   lock.webp 512    padlock           chip.webp 512   AI chip
//   cube.webp 512    data cube         orb.webp 512    AI orb
//   ring.webp 512    Recovery lifebuoy
//
// three.js r128 is fetched from jsDelivr once (cached in the OS temp folder) and checked
// against the SRI hash in ui-src/js/10-hero3d.js. Land: Natural Earth 1:110m (public domain) through
// world-atlas@2.0.2 (ISC), only with --land. Needs Microsoft Edge (as the screenshot tools).
import http from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KIT = path.join(REPO, "public", "ui", "3d", "hero3d-kit.js");
const KIT_MIN = path.join(REPO, "public", "ui", "3d", "hero3d-kit.min.js");
const RUNTIME = path.join(REPO, "ui-src", "js", "10-hero3d.js");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = path.resolve(REPO, typeof args.out === "string" ? args.out : "public/ui/3d");
const CACHE = path.join(os.tmpdir(), "cn-render-3d");
const PORT = Number(args.port) || 5390, DBG = PORT + 1;
const ALL = ["hero", "shield", "lock", "chip", "cube", "orb", "ring"];
const ONLY = typeof args.only === "string" ? args.only.split(",").map(s => s.trim()).filter(Boolean) : ((args.land || args.stamp) && !args.all ? [] : ALL);

/* minify the kit (falls back to a plain copy without esbuild), then its hash -> KIT_V */
async function minify() {
  const src = await readFile(KIT, "utf8");
  let out = src;
  try {
    const esbuild = await import("esbuild");
    out = (await esbuild.transform(src, { loader: "js", minify: true, target: "es2019", legalComments: "none", logLevel: "silent" })).code;
  } catch { console.log("[kit] esbuild not available: hero3d-kit.min.js is an unminified copy"); }
  const prev = existsSync(KIT_MIN) ? await readFile(KIT_MIN, "utf8") : "";
  if (prev !== out) await writeFile(KIT_MIN, out);
}
async function stamp() {
  await minify();
  const kit = await readFile(KIT_MIN);
  const v = createHash("sha1").update(kit).digest("hex").slice(0, 10);
  const rt = await readFile(RUNTIME, "utf8");
  const next = rt.replace(/var KIT_V = "[^"]*";/, `var KIT_V = "${v}";`);
  if (next === rt && !rt.includes(`var KIT_V = "${v}";`)) throw new Error("KIT_V line not found in 10-hero3d.js");
  if (next !== rt) await writeFile(RUNTIME, next);
  console.log(`[kit] hero3d-kit.min.js ${(kit.length / 1024).toFixed(1)} KB, KIT_V ${v}${next !== rt ? " (stamped)" : ""}`);
}
if (args.stamp && !args.land && !args.strip && !args.only) { await stamp(); process.exit(0); }

async function cached(name, url) {
  await mkdir(CACHE, { recursive: true });
  const f = path.join(CACHE, name);
  if (existsSync(f)) return readFile(f);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(f, buf);
  return buf;
}

await minify();
const kitSrc = await readFile(KIT, "utf8");
const rtSrc = await readFile(RUNTIME, "utf8");
const SRC = /THREE_SRC = "([^"]+)"/.exec(rtSrc)[1], SRI = /THREE_SRI = "([^"]+)"/.exec(rtSrc)[1];
const three = await cached("three-r128.min.js", SRC);
const digest = "sha384-" + createHash("sha384").update(three).digest("base64");
if (digest !== SRI) throw new Error(`three.js does not match the SRI in 10-hero3d.js (${digest})`);
let sharp = null;
try { sharp = (await import("sharp")).default; } catch { console.log("[3d] sharp not installed: using the browser's WebP encoder"); }
const land = args.land ? await cached("land-110m.json", "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json") : null;

// ---------------------------------------------------------------- the render page
const PAGE = String.raw`<!doctype html><html><head><meta charset="utf-8"><title>render-3d</title>
<style>html,body{margin:0;background:transparent}</style></head><body>
<script src="/three.min.js"></script><script src="/kit.js"></script>
<script>
"use strict";
var T = window.THREE, H = window.CNHero3D;
function canvas(n) { var c = document.createElement("canvas"); c.width = c.height = n; return c; }
/* downscale by halving steps, then the last step, for clean edges */
function scaled(src, n) {
  var cur = src;
  while (cur.width / 2 >= n * 1.0001 && cur.width / 2 >= n) { var h = canvas(cur.width / 2); var x = h.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(cur, 0, 0, h.width, h.height); cur = h; }
  if (cur.width !== n) { var c = canvas(n); var y = c.getContext("2d"); y.imageSmoothingQuality = "high"; y.drawImage(cur, 0, 0, n, n); cur = c; }
  return cur;
}
/* PNG out (lossless): Node encodes the WebP with sharp when it is installed (smaller), else
   the browser's own WebP encoder is used (see "q", the quality for either path) */
function webp(c, q) { return window.__png ? [c.toDataURL("image/png"), q] : [c.toDataURL("image/webp", q), q]; }
function studio(n) {
  var cv = canvas(n);
  var R = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  R.setClearColor(0x000000, 0); R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.NoToneMapping; R.debug.checkShaderErrors = true;
  R.setPixelRatio(1); R.setSize(n, n, false);
  var K = H.kit(T, R, true);
  return { cv: cv, R: R, K: K, scene: new T.Scene() };
}

/* models that only exist as sprites */
function orb(K) {
  var g = new T.Group(), lin = K.lin, P = H.PAL;
  var u = { uA: { value: lin(P.cyan) }, uB: { value: lin(P.violet) }, uC: { value: lin(P.magenta) }, uD: { value: lin("#1b0b56") }, uL: { value: new T.Vector3(-.5, .6, .62).normalize() } };
  var sph = new T.Mesh(new T.SphereGeometry(1, 96, 64), new T.ShaderMaterial({
    uniforms: u,
    vertexShader: "varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);vP=position;gl_Position=projectionMatrix*mv;}",
    fragmentShader: [
      "uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;uniform vec3 uD;uniform vec3 uL;varying vec3 vN;varying vec3 vV;varying vec3 vP;",
      "float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}",
      "float n3(vec3 p){vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.-2.*f);",
      "return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}",
      "float fbm(vec3 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}",
      "void main(){vec3 n=normalize(vN);vec3 v=normalize(vV);",
      "float sw=fbm(vP*1.5+vec3(fbm(vP*2.2),fbm(vP*2.2+4.),0.)*2.2);",
      "vec3 col=mix(uD,uB,smoothstep(.3,.7,sw));",
      "col=mix(col,uA,smoothstep(.55,.82,sw)*smoothstep(-.4,.9,vP.y+vP.x*.3));",
      "col=mix(col,uC,smoothstep(.5,.8,sw)*smoothstep(.3,-.9,vP.y)*.9);",
      "float ndl=max(dot(n,uL),0.);col*=.75+.75*ndl;col+=uB*.12;",
      "float fr=pow(1.-max(dot(n,v),0.),2.4);col+=mix(uA,uC,smoothstep(-.6,.6,n.x*.5-n.y*.8))*fr*1.5;",
      "vec3 r=reflect(-uL,n);col+=vec3(1.)*pow(max(dot(r,v),0.),70.)*.85;",
      "gl_FragColor=linearToOutputTexel(vec4(col,1.));}"
    ].join("\n")
  }));
  g.add(sph);
  var r1 = new T.Mesh(new T.TorusGeometry(1.34, .016, 12, 160), K.flat(P.cyan2, 1.3));
  r1.rotation.set(1.25, .25, 0); g.add(r1);
  var r2 = new T.Mesh(new T.TorusGeometry(1.52, .009, 12, 160), K.flat(P.lilac, 1, { transparent: true, opacity: .8 }));
  r2.rotation.set(1.38, -.35, 0); g.add(r2);
  var gl = K.sprite(P.violet, .55, 4.2); gl.position.z = -1.2; g.add(gl);
  return g;
}
function ring(K) {
  var g = new T.Group(), lin = K.lin, P = H.PAL;
  var c = K.canvas(512, 64), x = c.getContext("2d");
  for (var i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#ffffff" : "#2ee6c5"; x.fillRect(i * 64, 0, 64, 64); }
  var map = K.tex(c); map.anisotropy = 8;
  var tor = new T.Mesh(new T.TorusGeometry(1, .36, 48, 160), K.mat({ color: "#ffffff", map: map, metal: 0, rough: .3, envK: .55, emissive: "#ffffff", ei: .32, emap: map }));
  g.add(tor);
  var rope = new T.Mesh(new T.TorusGeometry(1.37, .024, 10, 200), K.mat({ color: "#ede9fe", metal: .1, rough: .55, envK: .8 }));
  g.add(rope);
  var wrapM = K.mat({ color: "#ede9fe", metal: .1, rough: .5, envK: .8 });
  for (var k = 0; k < 4; k++) {
    var a = (k * 2 + 1) * Math.PI / 4;
    var w = new T.Mesh(new T.TorusGeometry(.375, .03, 10, 40), wrapM);
    w.position.set(Math.cos(a), Math.sin(a), 0);
    w.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(-Math.sin(a), Math.cos(a), 0));
    g.add(w);
  }
  var gl = K.sprite(P.mint, .3, 4); gl.position.z = -1.4; g.add(gl);
  return g;
}

/* framing: [builder, rotation x/y/z, camera distance] (fov 24) */
var POSE = {
  shield: [function (K) { return K.shield({ tint: H.PAL.cyan, lock: H.PAL.cyan }).group; }, [.1, -.42, .04], 7.4],
  lock: [function (K) { return K.padlock().group; }, [.16, -.5, .05], 5.6],
  chip: [function (K) { return K.chip().group; }, [-.72, .1, .42], 5.4],
  cube: [function (K) { return K.cube().group; }, [.52, .72, .1], 5.4],
  orb: [orb, [0, 0, 0], 8.2],
  ring: [ring, [.42, -.36, .1], 7.6]
};
function sprite(name, n) {
  var ss = 2, st = studio(n * ss), p = POSE[name];
  var obj = p[0](st.K); obj.rotation.set(p[1][0], p[1][1], p[1][2]);
  st.scene.add(obj);
  var cam = new T.PerspectiveCamera(24, 1, .1, 60); cam.position.set(0, 0, p[2]); cam.lookAt(0, 0, 0);
  st.R.render(st.scene, cam);
  return st.cv;
}

window.__render = function (name) {
  var out = [];
  if (name === "hero") {
    var cv = canvas(2400);
    var G = H.scene(T, cv, { snapshot: true, debug: true });
    G.size(1200, 1200, 2);
    G.seek(H.T0);
    G.draw();
    out.push(["hero-globe.webp", webp(scaled(cv, 1200), .72)]);
    out.push(["hero-globe-800.webp", webp(scaled(cv, 800), .72)]);
    out.push(["hero-globe-480.webp", webp(scaled(cv, 480), .72)]);
    G.dispose();
    return out;
  }
  var size = name === "shield" ? 640 : 512;
  var src = sprite(name, size);
  out.push([name + ".webp", webp(scaled(src, size), .9)]);
  if (name === "shield") out.push(["shield-320.webp", webp(scaled(src, 320), .9)]);
  return out;
};

/* land bits: rasterise the Natural Earth land polygons (equirectangular), then sample one
   bit per Fibonacci point in the same lattice the globe uses */
window.__land = async function () {
  var topo = await (await fetch("/land.json")).json();
  var tf = topo.transform;
  var arcs = topo.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; }); });
  function ringPts(ids) { var pts = []; ids.forEach(function (id) { var a = id < 0 ? arcs[~id].slice().reverse() : arcs[id]; a.forEach(function (p, i) { if (i || !pts.length) pts.push(p); }); }); return pts; }
  var W = 4096, Hh = 2048, c = canvas(W); c.height = Hh; var x = c.getContext("2d"); x.fillStyle = "#fff";
  topo.objects.land.geometries.forEach(function (g) {
    var polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
    polys.forEach(function (poly) {
      x.beginPath();
      poly.forEach(function (r) { ringPts(r).forEach(function (p, i) { var px = (p[0] + 180) / 360 * W, py = (90 - p[1]) / 180 * Hh; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.closePath(); });
      x.fill("evenodd");
    });
  });
  var img = x.getImageData(0, 0, W, Hh).data, N = H.N_LAND, bytes = new Uint8Array(Math.ceil(N / 8)), count = 0;
  for (var i = 0; i < N; i++) {
    var p = H.fib(i, N), lat = Math.asin(p[1]) * 180 / Math.PI, lon = Math.atan2(p[0], p[2]) * 180 / Math.PI;
    var px = Math.min(W - 1, Math.floor((lon + 180) / 360 * W)), py = Math.min(Hh - 1, Math.floor((90 - lat) / 180 * Hh));
    if (img[(py * W + px) * 4 + 3] > 127) { bytes[i >> 3] |= 1 << (i & 7); count++; }
  }
  var bin = ""; for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
  var prev = canvas(720); prev.height = 360; prev.getContext("2d").drawImage(c, 0, 0, 720, 360);
  return { b64: btoa(bin), count: count, preview: prev.toDataURL("image/png") };
};
/* a filmstrip of the hero at several times, for review */
window.__strip = function (times, n, lite) {
  n = n || 600;
  var cv = canvas(n), G = H.scene(T, cv, { snapshot: true, debug: true, lite: !!lite }), out = canvas(n * times.length);
  out.height = n; var x = out.getContext("2d");
  x.fillStyle = "#2b0f6e"; x.fillRect(0, 0, out.width, n);
  G.size(n, n, 1); G.seek(H.T0);
  var t = H.T0;
  times.forEach(function (tt, i) { while (t < tt - 1e-6) { var d = Math.min(1 / 30, tt - t); G.frame(d); t += d; } G.draw(); x.drawImage(cv, i * n, 0); });
  G.dispose();
  return out.toDataURL("image/jpeg", .85);
};
window.__ready = true;
</script></body></html>`;

// ---------------------------------------------------------------- serve + drive Edge
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  try {
    if (p === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    if (p === "/three.min.js") { res.setHeader("Content-Type", "text/javascript"); res.end(three); return; }
    if (p === "/kit.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(KIT_MIN)); return; }
    if (p === "/land.json" && land) { res.setHeader("Content-Type", "application/json"); res.end(land); return; }
    res.statusCode = 404; res.end("not found");
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!exe) throw new Error("Microsoft Edge not found");
const profile = path.join(CACHE, `profile-${process.pid}`);
const child = spawn(exe, ["--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--ignore-gpu-blocklist", "--window-size=800,800", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanup = () => {
  try { child.kill(); } catch {}
  try { spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*profile-${process.pid}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }); } catch {}
  server.close();
};
let target;
for (let i = 0; i < 200 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(t => t.type === "page"); } catch {} if (!target) await sleep(200); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map(); const logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
  else if (m.method === "Runtime.exceptionThrown") logs.push("[exception] " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  else if (m.method === "Runtime.consoleAPICalled" && /error|warn/.test(m.params.type)) logs.push(`[console.${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 400));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 100; i++) { await sleep(150); try { if (await evaluate("window.__ready === true")) break; } catch {} }
  if (!(await evaluate("window.__ready === true"))) throw new Error("render page did not start: " + logs.join(" | "));
  await mkdir(OUT, { recursive: true });
  if (sharp) await evaluate("window.__png = true");

  if (args.land) {
    const r = await evaluate("window.__land()");
    const next = kitSrc.replace(/var LAND = "[^"]*";/, `var LAND = "${r.b64}";`);
    if (next === kitSrc && !kitSrc.includes(r.b64)) throw new Error("LAND line not found in hero3d-kit.js");
    await writeFile(KIT, next);
    await minify();
    await writeFile(path.join(CACHE, "land-preview.png"), Buffer.from(r.preview.split(",")[1], "base64"));
    console.log(`[land] ${r.count} land points of ${16000}, ${r.b64.length} chars -> public/ui/3d/hero3d-kit.js (preview: ${path.join(CACHE, "land-preview.png")})`);
    await evaluate("location.reload()").catch(() => {});
    await sleep(400);
    for (let i = 0; i < 100; i++) { await sleep(150); try { if (await evaluate("window.__ready === true")) break; } catch {} }
  }
  if (typeof args.strip === "string") {
    const times = String(args.times || "9,9.5,10,10.5,11,12").split(",").map(Number);
    const url = await evaluate(`window.__strip(${JSON.stringify(times)}, ${Number(args.n) || 520}, ${args.lite ? "true" : "false"})`);
    await writeFile(path.resolve(args.strip), Buffer.from(url.split(",")[1], "base64"));
    console.log("[strip]", args.strip, times.join(" "));
    ONLY.length = 0;
  }
  for (const name of ONLY) {
    const files = await evaluate(`window.__render(${JSON.stringify(name)})`);
    for (const [file, [url, q]] of files) {
      let buf = Buffer.from(url.split(",")[1], "base64");
      if (sharp) buf = await sharp(buf).webp({ quality: Math.round(q * 100), alphaQuality: name === "hero" ? 70 : 82, effort: 6, smartSubsample: true }).toBuffer();
      else if (!url.startsWith("data:image/webp")) throw new Error(`${file}: the browser did not encode WebP`);
      await writeFile(path.join(OUT, file), buf);
      console.log(`[3d] ${file}  ${(buf.length / 1024).toFixed(1)} KB`);
    }
  }
  if (logs.length) console.log(logs.join("\n"));
  await stamp();
} finally { try { ws.close(); } catch {} cleanup(); }
