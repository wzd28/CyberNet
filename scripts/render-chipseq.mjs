// Renders Home's AI chip assembly (#cnCore) as an image sequence for the scroll-scrubbed canvas
// in ui-src/js/58-chipseq.js, in headless Edge with three.js r128 (the same pinned build and SRI
// as scripts/render-3d.mjs).
//
//   node scripts/render-chipseq.mjs                    every frame -> public/ui/3d/chipseq/
//   node scripts/render-chipseq.mjs --only=0,30,59     a few frames (review)
//   node scripts/render-chipseq.mjs --sheet=<f.jpg>    also a contact sheet on the page ground
//   node scripts/render-chipseq.mjs --preview=<dir>    also each frame as JPEG on the page ground
//   --out=<dir>     write somewhere else (review)      --frames=<n>  frame count (default 60)
//   --keep=<dir>    also keep each frame's lossless master (PNG, supersampled)
//   --bounds        print where the tray lands over the timeline (framing), no frames unless --only
//   --ss=<k>        supersampling of the render (default 2.4; 1 is a quick draft)
//   --qd=<q> --qm=<q>  WebP quality, desktop / phone (default 58 / 52)
//   --port=<n>      local port (default 7311; Edge's debug port is n+1)
//
// The object (owner's reference video, 15 Oct 2026): a photoreal processor at a 3/4 angle on the
// near-black page. A gunmetal brushed-steel tray with chamfered corners, a raised rim, side slots,
// two columns of copper spring contacts, black SMD parts, rows of pads and two cool light strips;
// inside it, an exposed die area with radiating blue-green traces and a copper die. While the
// sequence plays, a brief glassy cyan crystal sweep crosses the chip as the polished heat-spreader
// lid (concentric radial brushing, chamfered edges, engraved "CyberNet AI" and the shield mark)
// comes down out of the dark and settles; then the finished chip turns slowly to a new angle. The
// soft cyan light pooled beneath it is painted by the page (28-chipseq.css), not baked in: a
// faint baked glow bands once WebP quantises its alpha (--pool bakes it in, for review only).
//
// Look: PBR (MeshPhysicalMaterial; procedural colour, roughness, metalness and bump maps), a PMREM
// studio built here (dark room, softboxes and strips), one shadowing key light (PCF soft), ACES
// tone curve, anisotropic radial brushing on the lid (a multi-tap reflection along the radius),
// cut-glass crystals (fresnel alpha), supersampling plus MSAA, and a bloom pass that only the
// light strips, the traces and the sweep feed. Every frame is transparent (the page ground shows
// through), its top 16% fades to nothing (the chip itself stays below it, so the lid emerges
// from the dark rather than from a hard edge) and its sides and bottom fade over the last few
// percent (nothing can end in a hard line).
//
// Files: d/000.webp .. d/059.webp (1000 x 800) and m/000.webp .. m/059.webp (560 x 448); the
// last frame is the assembled, turned chip: the page's poster. Faint pixels are smoothed before
// encoding (smoothFaint), which keeps the set near 2 MB (desktop) and 0.8 MB (phone).
// Changing the frame count: update data-cn-seq-n on .cn-chipseq in public/index.html and the
// poster's file name (the last frame), and bump data-cn-seq-v and the poster's ?v= so caches
// refresh. Needs Microsoft Edge (as the screenshot tools).
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(REPO, "ui-src", "js", "10-hero3d.js");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = path.resolve(REPO, typeof args.out === "string" ? args.out : "public/ui/3d/chipseq");
const CACHE = path.join(os.tmpdir(), "cn-render-3d");
const PORT = Number(args.port) || 7311, DBG = PORT + 1;
const N = Number(args.frames) || 60;
const SS = Number(args.ss) || 2.4;
const QD = Number(args.qd) || 58, QM = Number(args.qm) || 52, AQD = Number(args.aqd) || 90, AQM = Number(args.aqm) || 85;
const W = 1000, H = 800, WM = 560, HM = 448;
const ONLY = typeof args.only === "string" ? args.only.split(",").map(Number).filter(n => n >= 0 && n < N) : [...Array(N).keys()];
const GROUND = { r: 6, g: 10, b: 20 };   /* the page ground #060A14, for previews only */

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
const rtSrc = await readFile(RUNTIME, "utf8");
const SRC = /THREE_SRC = "([^"]+)"/.exec(rtSrc)[1], SRI = /THREE_SRI = "([^"]+)"/.exec(rtSrc)[1];
const three = await cached("three-r128.min.js", SRC);
const digest = "sha384-" + createHash("sha384").update(three).digest("base64");
if (digest !== SRI) throw new Error(`three.js does not match the SRI in 10-hero3d.js (${digest})`);
const sharp = (await import("sharp")).default;

// ---------------------------------------------------------------- the scene (runs in the page)
/* Serialised with toString and run in the render page, never in Node. T = THREE.
   Returns { frame(i, n) -> data URL (PNG, the composited frame at the supersampled size) }. */
function chipScene(T, cfg) {
  var TAU = Math.PI * 2, PI = Math.PI;
  var SW = Math.round(cfg.w * cfg.ss), SH = Math.round(cfg.h * cfg.ss);
  var GW = Math.round(cfg.w * .75), GH = Math.round(cfg.h * .75);   /* the glow pass, downscaled */

  /* ---------- helpers ---------- */
  function el(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h || w; return c; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function lin(hex) { return new T.Color(hex).convertSRGBToLinear(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function ease(t) { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function tex(c, srgb, rep) {
    var t = new T.CanvasTexture(c);
    t.anisotropy = R.capabilities.getMaxAnisotropy();
    if (srgb) t.encoding = T.sRGBEncoding;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  }
  /* a rectangle with chamfered corners, x0..x1 by y0..y1 (shape space) */
  function oct(x0, x1, y0, y1, c, p) {
    var s = p || new T.Shape();
    s.moveTo(x0 + c, y0); s.lineTo(x1 - c, y0); s.lineTo(x1, y0 + c); s.lineTo(x1, y1 - c);
    s.lineTo(x1 - c, y1); s.lineTo(x0 + c, y1); s.lineTo(x0, y1 - c); s.lineTo(x0, y0 + c); s.lineTo(x0 + c, y0);
    return s;
  }
  function sq(a, c, p) { return oct(-a, a, -a, a, c, p); }
  /* extruded upwards: the shape's x stays x, its y becomes -z, the depth goes up from y0 */
  function ext(shape, depth, bevel, segs, y0) {
    var g = new T.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: bevel > 0 ? -bevel : 0, bevelSegments: segs || 3, curveSegments: 4 });
    g.rotateX(-PI / 2);
    g.translate(0, (y0 || 0) + bevel, 0);
    return g;
  }
  function flat(shape) { var g = new T.ShapeGeometry(shape, 4); g.rotateX(-PI / 2); return g; }
  function mesh(g, m, o) {
    var x = new T.Mesh(g, m);
    o = o || {};
    x.castShadow = o.cast !== false; x.receiveShadow = o.receive !== false;
    if (o.glow) x.userData.glow = o.glow;
    if (o.glowOnly) x.userData.glowOnly = true;
    return x;
  }

  /* ---------- renderer ---------- */
  var cv = el(SW, SH);
  var R = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  R.setPixelRatio(1); R.setSize(SW, SH, false);
  R.outputEncoding = T.sRGBEncoding;
  R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = cfg.exposure || 1.42;
  R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
  R.debug.checkShaderErrors = true;

  /* ---------- the studio (a RoomEnvironment-like light box, prefiltered with PMREM) ---------- */
  function studio() {
    var env = new T.Scene();
    var room = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: new T.Color(.022, .03, .046), side: T.BackSide }));
    room.scale.set(34, 20, 34); room.position.y = 5; env.add(room);
    function panel(w, h, pos, look, rgb, k) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k), side: T.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]); m.lookAt(look[0], look[1], look[2]); env.add(m);
    }
    panel(10, 6, [-1.5, 11, 3], [0, 0, 0], [1, 1, 1], 2.6);               /* the big top softbox */
    panel(1.6, 10, [-12, 5, 4], [0, 1, 0], [.94, .97, 1], 4.2);           /* a tall strip, left */
    panel(1.4, 9, [12, 4.5, -5], [0, 1, 0], [.45, .72, 1], 3.2);          /* a cool rim strip, right back */
    panel(14, 1.3, [0, 3.5, -14], [0, 2, 0], [.35, .62, 1], 2.4);         /* a blue strip behind */
    panel(4, 4, [9, 8, 10], [0, 0, 0], [1, .98, .95], 1.6);               /* a warm-white kicker, front right */
    panel(16, 1, [0, 1.5, 15], [0, 1, 0], [.6, .75, .9], .9);             /* a low strip in front (edges) */
    panel(9, 9, [0, -7, 1], [0, 0, 0], [.05, .45, .55], .55);             /* a cyan bounce from below */
    var pm = new T.PMREMGenerator(R);
    var rt = pm.fromScene(env, .03);
    pm.dispose();
    return rt.texture;
  }
  var ENV = studio();

  /* ---------- procedural textures ---------- */
  /* brushed steel: fine streaks along u (roughness in G, a faint bump), tiles */
  function brushed(seed) {
    var n = 1024, c = el(n), x = c.getContext("2d"), r = rng(seed);
    x.fillStyle = "rgb(150,150,150)"; x.fillRect(0, 0, n, n);
    for (var i = 0; i < 2600; i++) {
      var y = r() * n, l = 80 + r() * 700, x0 = r() * n, v = 110 + r() * 90 | 0;
      x.strokeStyle = "rgba(" + v + "," + v + "," + v + "," + (.15 + r() * .32).toFixed(2) + ")";
      x.lineWidth = .6 + r() * 1.4;
      x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + l, y + (r() - .5) * 1.5); x.stroke();
      if (x0 + l > n) { x.beginPath(); x.moveTo(x0 - n, y); x.lineTo(x0 + l - n, y); x.stroke(); }
    }
    return c;
  }
  var brushC = brushed(11), brushT = tex(brushC, false, true); brushT.repeat.set(2.2, 2.2);
  var brushT2 = tex(brushC, false, true); brushT2.repeat.set(1.2, 6); brushT2.rotation = PI / 2;

  /* anodised floor of the tray (maps the tray's -2..2 square): speckle, ambient occlusion
     along the rim and the socket, a few printed marks */
  function floorTex() {
    var n = 2048, c = el(n), x = c.getContext("2d"), r = rng(5), k = n / 4;
    function X(u) { return (u + 2) * k; } function Y(v) { return (2 - v) * k; }   /* shape y up */
    x.fillStyle = "#46505c"; x.fillRect(0, 0, n, n);
    var id = x.getImageData(0, 0, n, n), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var e = (r() - .5) * 6; d[i] += e; d[i + 1] += e; d[i + 2] += e + 1; }
    x.putImageData(id, 0, 0);
    /* AO: under the rim (outer edge of the floor) */
    function aoRect(x0, x1, y0, y1, w, a) {
      x.save(); x.filter = "blur(" + (w * k).toFixed(1) + "px)";
      x.strokeStyle = "rgba(0,0,0," + a + ")"; x.lineWidth = w * k * 1.2;
      x.beginPath(); x.rect(X(x0), Y(y1), (x1 - x0) * k, (y1 - y0) * k); x.stroke(); x.restore();
    }
    aoRect(-1.82, 1.82, -1.82, 1.82, .09, .85);
    aoRect(-1.32, 1.52, -1.52, 1.52, .07, .9);
    /* printed marks: tiny legends by the pad rows */
    x.fillStyle = "rgba(190,200,212,.38)"; x.font = "600 " + Math.round(k * .055) + "px Segoe UI, Arial";
    x.fillText("CN-01", X(1.48), Y(-1.74)); x.fillText("A1", X(-1.2), Y(-1.42));
    x.fillText("SIG", X(1.6), Y(1.26)); x.fillText("PWR", X(1.6), Y(-.08));
    x.strokeStyle = "rgba(190,200,212,.28)"; x.lineWidth = k * .006;
    x.strokeRect(X(-1.23), Y(-1.55), k * .12, k * .12);
    return c;
  }

  /* the socket body's top: dark satin with a soft AO round the die frame */
  function socketTex() {
    var n = 1024, c = el(n), x = c.getContext("2d"), r = rng(9), k = n / 2.84;   /* x -1.3..1.54 */
    x.fillStyle = "#262c35"; x.fillRect(0, 0, n, n);
    var id = x.getImageData(0, 0, n, n), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var e = (r() - .5) * 4; d[i] += e; d[i + 1] += e; d[i + 2] += e; }
    x.putImageData(id, 0, 0);
    x.save(); x.filter = "blur(" + (k * .05).toFixed(1) + "px)"; x.strokeStyle = "rgba(0,0,0,.9)"; x.lineWidth = k * .1;
    var cx = (DIE.x + 1.3) * k, cy = (1.42 - DIE.z) * k, hs = 1.15 * k;
    x.strokeRect(cx - hs, cy - hs, hs * 2, hs * 2); x.restore();
    return c;
  }

  /* the die area: deep teal laminate in four quadrants (a dark cross between them), fine
     blue-green traces radiating from the copper die to pads at the edge, bond pads and vias;
     colour, glow, and roughness (G) / metalness (B) */
  function substrateTex() {
    var n = 2048, cC = el(n), cE = el(n), cM = el(n);
    var xc = cC.getContext("2d"), xe = cE.getContext("2d"), xm = cM.getContext("2d"), r = rng(21);
    var cx = n / 2, cy = n / 2, die = n * .112, edge = n * .455;
    var bg = xc.createRadialGradient(cx, cy, die, cx, cy, n * .7);
    bg.addColorStop(0, "#123f45"); bg.addColorStop(.6, "#0d2e35"); bg.addColorStop(1, "#0a2129");
    xc.fillStyle = bg; xc.fillRect(0, 0, n, n);
    var id = xc.getImageData(0, 0, n, n), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var e = (r() - .5) * 5; d[i] += e * .5; d[i + 1] += e; d[i + 2] += e; }
    xc.putImageData(id, 0, 0);
    xe.fillStyle = "#000"; xe.fillRect(0, 0, n, n);
    xm.fillStyle = "rgb(0,150,40)"; xm.fillRect(0, 0, n, n);           /* rough .59, metal .16 */
    function stroke(pts, w, col, glow, rough) {
      [[xc, col, w], [xe, glow, w], [xm, "rgb(0," + rough + ",235)", w]].forEach(function (L) {
        var x = L[0]; x.strokeStyle = L[1]; x.lineWidth = L[2]; x.lineJoin = "round"; x.lineCap = "round";
        x.beginPath(); pts.forEach(function (p, j) { if (j) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.stroke();
      });
    }
    function pad(px, py, s, col, glow) {
      xc.fillStyle = col; xc.fillRect(px - s, py - s, s * 2, s * 2);
      xe.fillStyle = glow; xe.fillRect(px - s, py - s, s * 2, s * 2);
      xm.fillStyle = "rgb(0,60,240)"; xm.fillRect(px - s, py - s, s * 2, s * 2);
    }
    /* per side of the die: substrate fan-out routing, as on a real package. Each trace leaves
       its bump square-on, runs out, turns 45 degrees to fan sideways, then turns square again
       and runs to its via by the edge (octilinear, round joins). The outer traces turn first and
       run diagonal longest, so a layer never crosses itself; traces come in bundles with a gap
       between them, one heavier trace per bundle. A finer inner layer (seen dimmer, through the
       solder mask) is routed with a different stagger, so it crosses under the top layer the
       way inner layers do. None crosses a quadrant line. */
    var sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    function route(s, f, g, endK, spread) {
      var tx = -s[1], ty = s[0];
      var s0 = f * die * .9, endD = edge * endK, T = f * endD * spread;
      var D = Math.abs(T - s0), avail = endD * .97 - die * 1.1;
      var xb = die * 1.1 + Math.max(0, avail - D) * g;
      function P(dd, tt) { return [cx + s[0] * dd + tx * tt, cy + s[1] * dd + ty * tt]; }
      return [P(die * 1.03, s0), P(xb, s0), P(xb + D, T), P(endD, T)];
    }
    sides.forEach(function (s) {
      /* the inner layer: fine, dim, a later turn */
      var CI = 132;
      for (var k = 0; k < CI; k++) {
        var f = (k + .5) / CI * 2 - 1;
        if (Math.abs(f) < .07 || k % 11 === 5) continue;
        var pts = route(s, f, .82, .9 + r() * .06, .78);
        var lit = r();
        stroke(pts, 1.3 + r() * .9, "rgba(" + (40 + 30 * lit | 0) + "," + (122 + 40 * lit | 0) + "," + (132 + 36 * lit | 0) + ",.62)", "rgba(16,96,122,.3)", 80);
      }
      /* the top layer: bundles of seven, one heavier trace each, a via at the end */
      var CT = 64;
      for (var k2 = 0; k2 < CT; k2++) {
        var f2 = (k2 + .5) / CT * 2 - 1;
        if (Math.abs(f2) < .06 || k2 % 8 === 7) continue;
        var heavy = k2 % 8 === 3, endK = .93 + (k2 % 2) * .035;
        var pts2 = route(s, f2, .42, endK, .84);
        var lit2 = r(), w2 = heavy ? 5.6 + r() * 1.4 : 2.3 + r() * 1.5;
        stroke(pts2, w2,
          "rgba(" + (92 + 60 * lit2 | 0) + "," + (196 + 42 * lit2 | 0) + "," + (204 + 36 * lit2 | 0) + ",.95)",
          "rgba(" + (28 + 40 * lit2 | 0) + "," + (166 + 60 * lit2 | 0) + "," + (198 + 50 * lit2 | 0) + "," + (.42 + .4 * lit2).toFixed(2) + ")", 45);
        var e2 = pts2[3], vr = heavy ? 9 : 6.2;
        xc.fillStyle = "rgba(196,236,232,.92)"; xc.beginPath(); xc.arc(e2[0], e2[1], vr, 0, TAU); xc.fill();
        xc.fillStyle = "rgba(8,30,36,.9)"; xc.beginPath(); xc.arc(e2[0], e2[1], vr * .42, 0, TAU); xc.fill();
        xe.fillStyle = "rgba(90,220,240,.6)"; xe.beginPath(); xe.arc(e2[0], e2[1], vr, 0, TAU); xe.fill();
        xm.fillStyle = "rgb(0,60,240)"; xm.beginPath(); xm.arc(e2[0], e2[1], vr, 0, TAU); xm.fill();
      }
    });
    /* via fields in each quadrant's outer corner (between the two sides' fans) */
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
      for (var a = 0; a < 4; a++) for (var b2 = 0; b2 < 4 - a; b2++) {
        var vx = cx + q[0] * (edge * .935 - a * n * .0135), vy = cy + q[1] * (edge * .935 - b2 * n * .0135);
        if (r() < .15) continue;
        xc.fillStyle = "rgba(150,205,205,.55)"; xc.beginPath(); xc.arc(vx, vy, 4.2, 0, TAU); xc.fill();
        xc.fillStyle = "rgba(6,22,28,.9)"; xc.beginPath(); xc.arc(vx, vy, 1.8, 0, TAU); xc.fill();
      }
    });
    /* the quadrant dividers: a dark cross with fine lit edges */
    [xc, xe].forEach(function (x, j) {
      x.fillStyle = j ? "#000" : "#061014";
      x.fillRect(cx - n * .009, 0, n * .018, n); x.fillRect(0, cy - n * .009, n, n * .018);
    });
    xc.fillStyle = "rgba(140,200,205,.4)";
    xc.fillRect(cx - n * .009 - 2, 0, 2, n); xc.fillRect(cx + n * .009, 0, 2, n);
    xc.fillRect(0, cy - n * .009 - 2, n, 2); xc.fillRect(0, cy + n * .009, n, 2);
    /* bond pads round the die and a seal ring */
    for (var b = 0; b < 4; b++) {
      var s2 = sides[b], tx2 = -s2[1], ty2 = s2[0];
      for (var m = 0; m < 24; m++) {
        var f3 = (m + .5) / 24 * 2 - 1, px = cx + s2[0] * die * 1.02 + tx2 * f3 * die * .92, py = cy + s2[1] * die * 1.02 + ty2 * f3 * die * .92;
        pad(px, py, 3.4, "rgba(225,195,150,.95)", "rgba(40,90,90,.3)");
      }
    }
    xc.strokeStyle = "rgba(170,210,215,.5)"; xc.lineWidth = 3; xc.strokeRect(n * .025, n * .025, n * .95, n * .95);
    xc.strokeStyle = "rgba(0,0,0,.75)"; xc.lineWidth = 14; xc.strokeRect(n * .008, n * .008, n * .984, n * .984);
    return { c: tex(cC, true), e: tex(cE, true), m: tex(cM, false) };
  }

  /* the copper die: a die shot (functional blocks of differing tone, fine cell rows inside
     them, a bright seal ring), never a tiled grid */
  function dieTex() {
    var n = 1024, c = el(n), x = c.getContext("2d"), r = rng(3);
    x.fillStyle = "#c98f6e"; x.fillRect(0, 0, n, n);
    /* blocks: a 2 x 2 of cores, a cache band through the middle, small I/O blocks round it */
    var blocks = [[60, 60, 420, 400], [544, 60, 420, 400], [60, 564, 420, 400], [544, 564, 420, 400], [60, 474, 904, 76]];
    for (var e = 0; e < 18; e++) {
      var side = e % 4, k = (e >> 2) / 5;
      blocks.push(side === 0 ? [60 + k * 860, 18, 120, 30] : side === 1 ? [60 + k * 860, n - 48, 120, 30] : side === 2 ? [18, 60 + k * 860, 30, 120] : [n - 48, 60 + k * 860, 30, 120]);
    }
    blocks.forEach(function (b, bi) {
      var v = r();
      x.fillStyle = bi === 4 ? "rgba(255,214,180,.22)" : "rgba(" + (v < .5 ? "110,54,36" : "255,215,185") + "," + (.08 + r() * .1).toFixed(2) + ")";
      x.fillRect(b[0], b[1], b[2], b[3]);
      /* cell rows */
      var horiz = b[2] >= b[3], step = 5 + (r() * 4 | 0);
      x.strokeStyle = "rgba(" + (r() < .5 ? "90,40,25" : "255,230,205") + ",.16)"; x.lineWidth = 1.5;
      x.beginPath();
      if (horiz) for (var yy = b[1] + step; yy < b[1] + b[3]; yy += step) { x.moveTo(b[0], yy); x.lineTo(b[0] + b[2], yy); }
      else for (var xx = b[0] + step; xx < b[0] + b[2]; xx += step) { x.moveTo(xx, b[1]); x.lineTo(xx, b[1] + b[3]); }
      x.stroke();
      /* sub-blocks inside the cores */
      if (bi < 4) for (var s = 0; s < 6; s++) {
        var w = 60 + r() * 140, h = 50 + r() * 120;
        x.fillStyle = "rgba(" + (r() < .5 ? "100,48,30" : "255,225,195") + "," + (.07 + r() * .1).toFixed(2) + ")";
        x.fillRect(b[0] + r() * (b[2] - w), b[1] + r() * (b[3] - h), w, h);
      }
      x.strokeStyle = "rgba(80,36,22,.35)"; x.lineWidth = 2; x.strokeRect(b[0], b[1], b[2], b[3]);
    });
    x.strokeStyle = "rgba(255,232,212,.6)"; x.lineWidth = 8; x.strokeRect(5, 5, n - 10, n - 10);
    return tex(c, true);
  }

  /* the lid's top: the engraving (colour, roughness in G, bump), for a cap of half size `hs` */
  function lidTex(hs) {
    var n = 2048, cC = el(n), cR = el(n), cB = el(n);
    var xc = cC.getContext("2d"), xr = cR.getContext("2d"), xb = cB.getContext("2d");
    xc.fillStyle = "#ffffff"; xc.fillRect(0, 0, n, n);
    xr.fillStyle = "rgb(0,105,0)"; xr.fillRect(0, 0, n, n);                 /* .41 x the material's */
    xb.fillStyle = "#ffffff"; xb.fillRect(0, 0, n, n);
    function art(x, mode) {
      /* the shield mark: hexagon shield with a padlock, as in the site's logo */
      var s = n * .0042, ox = n / 2 - 30 * s, oy = n * .30;
      x.save(); x.translate(ox, oy); x.scale(s, s);
      x.lineJoin = "round"; x.lineCap = "round";
      x.beginPath(); x.moveTo(30, 4); x.lineTo(54, 16); x.lineTo(50, 46); x.lineTo(30, 63); x.lineTo(10, 46); x.lineTo(6, 16); x.closePath();
      x.lineWidth = 3.4; x.stroke();
      x.beginPath(); x.moveTo(22, 36); x.lineTo(22, 30); x.bezierCurveTo(22, 24.5, 25.5, 21, 30, 21); x.bezierCurveTo(34.5, 21, 38, 24.5, 38, 30); x.lineTo(38, 36);
      x.lineWidth = 3.2; x.stroke();
      x.beginPath(); x.rect(19, 35, 22, 16); x.fill();
      x.restore();
      x.font = "600 " + Math.round(n * .074) + "px 'Segoe UI Semibold', 'Segoe UI', Arial, sans-serif";
      x.textAlign = "center"; x.textBaseline = "middle";
      if ("letterSpacing" in x) x.letterSpacing = Math.round(n * .006) + "px";
      x.fillText("CyberNet AI", n / 2, n * .62);
    }
    xc.fillStyle = xc.strokeStyle = "rgb(125,130,138)"; art(xc);
    xr.fillStyle = xr.strokeStyle = "rgb(0,235,0)"; art(xr);
    xb.save(); xb.filter = "blur(2.5px)"; xb.fillStyle = xb.strokeStyle = "#000"; art(xb); xb.restore();
    var tc = tex(cC, true), tr = tex(cR, false), tb = tex(cB, false);
    [tc, tr, tb].forEach(function (t) { t.repeat.set(1 / (2 * hs), 1 / (2 * hs)); t.offset.set(.5, .5); });
    return { c: tc, r: tr, b: tb };
  }

  /* radial light: a soft spot for the pool and the sweep's light sheet */
  function radialC(n, stops) {
    var c = el(n), x = c.getContext("2d"), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0, 0, n, n); return c;
  }
  function sheetC() {
    var c = el(512, 256), x = c.getContext("2d");
    var g = x.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.18, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.globalCompositeOperation = "destination-in";
    var h = x.createLinearGradient(0, 0, 512, 0);
    h.addColorStop(0, "rgba(0,0,0,0)"); h.addColorStop(.2, "rgba(0,0,0,1)"); h.addColorStop(.8, "rgba(0,0,0,1)"); h.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = h; x.fillRect(0, 0, 512, 256);
    return c;
  }

  /* ---------- materials ---------- */
  function phys(o) {
    var m = new T.MeshPhysicalMaterial({
      color: lin(o.color || "#808080"), metalness: o.metal == null ? 1 : o.metal, roughness: o.rough == null ? .3 : o.rough,
      envMap: ENV, envMapIntensity: o.env == null ? 1 : o.env,
      clearcoat: o.cc || 0, clearcoatRoughness: o.ccr == null ? .1 : o.ccr
    });
    if (o.map) m.map = o.map;
    if (o.rmap) m.roughnessMap = o.rmap;
    if (o.mmap) m.metalnessMap = o.mmap;
    if (o.bump) { m.bumpMap = o.bump; m.bumpScale = o.bumpScale || .002; }
    if (o.emissive) { m.emissive = lin(o.emissive); m.emissiveIntensity = o.ei == null ? 1 : o.ei; }
    if (o.emap) m.emissiveMap = o.emap;
    if (o.flat) m.flatShading = true;
    return m;
  }
  function glowMat(hex, k, o) {
    o = o || {};
    var c = lin(hex).multiplyScalar(k == null ? 1 : k);
    var m = new T.MeshBasicMaterial({ color: c, toneMapped: false, map: o.map || null, transparent: !!o.add, blending: o.add ? T.AdditiveBlending : T.NormalBlending, depthWrite: !o.add, side: o.side || T.FrontSide });
    return m;
  }
  var BLACK = new T.MeshBasicMaterial({ color: 0x000000 });

  var M = {
    gun: phys({ color: "#99a2ad", rough: .33, rmap: brushT, bump: brushT, bumpScale: .0012, env: 1.05, cc: .25, ccr: .35 }),
    gunSide: phys({ color: "#6c7580", rough: .32, rmap: brushT2, env: 1.1 }),
    rim: phys({ color: "#b9c2cc", rough: .18, rmap: brushT, env: 1.25, cc: .4, ccr: .15 }),
    floor: phys({ color: "#ffffff", metal: .6, rough: .5, env: 1.0, cc: .3, ccr: .3 }),
    socket: phys({ color: "#ffffff", metal: .55, rough: .38, env: 1.1, cc: .35, ccr: .22 }),
    socketEdge: phys({ color: "#97a1ac", rough: .2, env: 1.25 }),
    epoxy: phys({ color: "#0c0d10", metal: .05, rough: .32, cc: .8, ccr: .12, env: 1 }),
    tin: phys({ color: "#c3cad2", rough: .28, env: 1.1 }),
    copper: phys({ color: "#cf8a86", rough: .32, env: 1.2, cc: .35, ccr: .2 }),
    gold: phys({ color: "#e2b260", rough: .26, env: 1.1 }),
    padDark: phys({ color: "#0d1014", metal: .3, rough: .45 }),
    padRing: phys({ color: "#101419", metal: .3, rough: .5, env: .7 }),
    padBall: phys({ color: "#8f99a5", rough: .3, env: 1.15 }),
    slot: phys({ color: "#07090c", metal: .2, rough: .7, env: .5 }),
    frame: phys({ color: "#8e98a3", rough: .26, rmap: brushT, env: 1.2, cc: .3, ccr: .2 }),
    die: phys({ color: "#ffffff", rough: .3, env: 1.7, cc: 1, ccr: .06 }),
    lidSide: phys({ color: "#cfd5dc", rough: .14, env: 1.3, cc: .6, ccr: .06 }),
    stripHousing: phys({ color: "#0a0d12", metal: .4, rough: .5 })
  };
  M.floor.map = tex(floorTex(), true);
  M.floor.map.repeat.set(.25, .25); M.floor.map.offset.set(.5, .5);
  var DIE = { x: .14, z: .02, hs: 1.05 };
  M.socket.map = tex(socketTex(), true);
  M.socket.map.repeat.set(1 / 2.84, 1 / 2.94); M.socket.map.offset.set(1.3 / 2.84, 1.52 / 2.94);
  M.die.map = dieTex();

  /* ---------- the chip ---------- */
  var chip = new T.Group();       /* turns as a whole */
  var A = 2.0, CH = .44, TH = .38;  /* tray half size, chamfer, thickness */

  /* the tray plate: brushed gunmetal, the side walls with their own grain */
  var plate = mesh(ext(sq(A, CH), TH - .04, .02, 2, -TH), [M.gun, M.gunSide]);
  chip.add(plate);
  /* the raised outer rim with a polished chamfer */
  var rimS = sq(A - .005, CH); rimS.holes.push(sq(A - .2, CH * .82, new T.Path()));
  chip.add(mesh(ext(rimS, .055, .022, 3, 0), [M.rim, M.rim]));
  /* the floor inside the rim */
  chip.add(mesh(flat(sq(A - .19, CH * .82)), M.floor, { cast: false }));
  /* side slots: long dark vents in the left and front walls */
  function slot(len, along, side) {
    var g = new T.BoxGeometry(along === "z" ? .02 : len, .1, along === "z" ? len : .02);
    var s = mesh(g, M.slot, { cast: false });
    if (along === "z") s.position.set(side * (A + .004), -TH * .52, -.1); else s.position.set(-.1, -TH * .52, side * (A + .004));
    return s;
  }
  chip.add(slot(2.3, "z", -1)); chip.add(slot(2.3, "x", 1));
  /* a mounting tab under the front-left wall */
  var tab = mesh(new T.BoxGeometry(.06, .34, .7), M.gunSide); tab.position.set(-A + .03, -TH - .15, 1.05); chip.add(tab);

  /* the socket body: a raised dark platform with a bright edge */
  var SX0 = -1.3, SX1 = 1.54, SZ0 = -1.52, SZ1 = 1.42;
  var sockShape = oct(SX0, SX1, -SZ1, -SZ0, .18);   /* shape y = -z */
  chip.add(mesh(ext(sockShape, .045, .012, 2, 0), [M.socket, M.socketEdge]));
  var SY = .069;                     /* the platform's top */

  /* the light strips: in slots along the back and the right of the channel */
  var stripMat = phys({ color: "#000000", metal: 0, rough: .3, emissive: "#3b8dff", ei: 1.6, env: .4 });
  var stripMat2 = phys({ color: "#000000", metal: 0, rough: .3, emissive: "#34c3f2", ei: 1.5, env: .4 });
  var strips = [];
  function strip(x, z, lx, lz, mat, gl) {
    var hsg = mesh(new T.BoxGeometry(lx + .05, .03, lz + .05), M.stripHousing, { cast: false }); hsg.position.set(x, .012, z); chip.add(hsg);
    var s = mesh(new T.BoxGeometry(lx, .03, lz), mat, { cast: false, glow: gl }); s.position.set(x, .024, z); chip.add(s); strips.push(s);
    return s;
  }
  var stripGlow = glowMat("#3b8dff", 2.4), stripGlow2 = glowMat("#34c3f2", 2.2);
  strip(.15, -1.665, 2.2, .05, stripMat, stripGlow);
  strip(1.665, -.62, .05, 1.35, stripMat2, stripGlow2);

  /* copper spring contacts: two columns of flat zigzags in the left channel */
  function zig(xc0, z0, z1, amp, period, phase) {
    var pts = [], steps = Math.round((z1 - z0) / period * 2);
    for (var i = 0; i <= steps; i++) pts.push(new T.Vector3(xc0 + (i % 2 ? amp : -amp) * (phase ? -1 : 1), .028 + (i % 2 ? .022 : 0), z0 + (z1 - z0) * i / steps));
    var curve = new T.CatmullRomCurve3(pts, false, "centripetal", .1);
    return new T.TubeGeometry(curve, steps * 12, .017, 8, false);
  }
  chip.add(mesh(zig(-1.69, -1.4, 1.4, .06, .078, 0), M.copper));
  chip.add(mesh(zig(-1.52, -1.4, 1.4, .06, .078, 1), M.copper));
  /* the contacts' seat */
  var seat = mesh(new T.BoxGeometry(.4, .012, 2.9), M.padDark, { cast: false }); seat.position.set(-1.6, .006, 0); chip.add(seat);

  /* SMD parts: epoxy blocks with tinned ends */
  function smd(x, z, lx, lz, h, rotY) {
    var g = new T.Group();
    var body = mesh(new T.BoxGeometry(lx * .74, h, lz), M.epoxy); body.position.y = h / 2; g.add(body);
    [-1, 1].forEach(function (s) { var e = mesh(new T.BoxGeometry(lx * .13, h * .92, lz * .96), M.tin); e.position.set(s * lx * .43, h * .46, 0); g.add(e); });
    g.position.set(x, SY, z); g.rotation.y = rotY || 0; chip.add(g);
    return g;
  }
  smd(-1.19, -.78, .44, .15, .085, PI / 2); smd(-1.19, 0, .44, .15, .085, PI / 2); smd(-1.19, .78, .44, .15, .085, PI / 2);
  smd(-.55, 1.26, .36, .12, .06); smd(.15, 1.26, .36, .12, .06); smd(.85, 1.26, .36, .12, .06);
  smd(1.32, -1.3, .22, .1, .05); smd(-1.12, -1.32, .22, .1, .05, PI / 2);

  /* pads: two rows along the front channel, one along the right, as dark wells in tin rings */
  var padG = new T.SphereGeometry(.034, 20, 10, 0, TAU, 0, PI / 2), ringG = new T.CylinderGeometry(.043, .043, .006, 24);
  padG.scale(1, .45, 1);
  var padList = [];
  for (var i = 0; i < 25; i++) { padList.push([-1.12 + i * .108, 1.6]); padList.push([-1.07 + i * .108, 1.73]); }
  for (var j = 0; j < 10; j++) padList.push([1.67, .3 + j * .12]);
  var padI = new T.InstancedMesh(padG, M.padBall, padList.length), ringI = new T.InstancedMesh(ringG, M.padRing, padList.length);
  var mtx = new T.Matrix4();
  padList.forEach(function (p, k) {
    mtx.makeTranslation(p[0], .005, p[1]); padI.setMatrixAt(k, mtx);
    mtx.makeTranslation(p[0], .003, p[1]); ringI.setMatrixAt(k, mtx);
  });
  padI.receiveShadow = ringI.receiveShadow = true; padI.castShadow = true;
  chip.add(padI); chip.add(ringI);
  /* screws in the floor's corners */
  [[-1.62, -1.62], [1.62, -1.62], [-1.62, 1.62], [1.62, 1.62]].forEach(function (p) {
    var hd = mesh(new T.CylinderGeometry(.075, .082, .03, 32), M.frame); hd.position.set(p[0], .015, p[1]); chip.add(hd);
    var sl = mesh(new T.BoxGeometry(.1, .012, .018), M.slot, { cast: false }); sl.position.set(p[0], .031, p[1]); sl.rotation.y = .6; chip.add(sl);
  });

  /* the die area: substrate, retention frame with corner clips, small capacitors, the copper die */
  var ST = substrateTex();
  var subMat = phys({ color: "#ffffff", metal: 1, rough: 1, map: ST.c, rmap: ST.m, mmap: ST.m, emissive: "#ffffff", ei: .14, emap: ST.e, env: 1.15, cc: .7, ccr: .12 });
  var subGlow = glowMat("#ffffff", .2, { map: ST.e });
  var sub = mesh(new T.PlaneGeometry(DIE.hs * 2, DIE.hs * 2).rotateX(-PI / 2), subMat, { cast: false, glow: subGlow });
  sub.position.set(DIE.x, SY + .006, DIE.z); chip.add(sub);
  var frS = sq(DIE.hs + .085, .06); frS.holes.push(sq(DIE.hs + .005, .02, new T.Path()));
  var retFrame = mesh(ext(frS, .03, .012, 2, SY), M.frame); retFrame.position.set(DIE.x, 0, DIE.z); chip.add(retFrame);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
    var k = mesh(new T.BoxGeometry(.16, .07, .16), M.frame); k.position.set(DIE.x + c[0] * (DIE.hs + .04), SY + .035, DIE.z + c[1] * (DIE.hs + .04)); chip.add(k);
  });
  var capR = rng(77);
  for (var q = 0; q < 4; q++) for (var qq = 0; qq < 5; qq++) {
    var ang = q * PI / 2 + PI / 4, rr = .36 + qq * .075;
    var cx = DIE.x + Math.cos(ang) * rr * 1.2 + (capR() - .5) * .04, cz = DIE.z + Math.sin(ang) * rr * 1.2 + (capR() - .5) * .04;
    var cap = mesh(new T.BoxGeometry(.05, .022, .028), M.gold); cap.position.set(cx, SY + .017, cz); cap.rotation.y = ang; chip.add(cap);
  }
  var dieG = new T.Group();
  var dieBody = mesh(new T.BoxGeometry(.44, .05, .44), [M.die, M.die, M.die, M.die, M.die, M.die]);
  dieBody.position.y = .025; dieG.add(dieBody);
  var under = mesh(new T.BoxGeometry(.5, .012, .5), M.padDark); under.position.y = -.002; dieG.add(under);
  dieG.position.set(DIE.x, SY + .006, DIE.z); chip.add(dieG);

  /* ---------- the lid (integrated heat spreader) ---------- */
  var lid = new T.Group();
  var LH = 1.2, LB = 1.1;           /* flange half size, body half size (it covers the die frame) */
  var LT = lidTex(LB);
  var lidTop = phys({ color: "#d5dade", rough: .6, rmap: LT.r, map: LT.c, bump: LT.b, bumpScale: .006, env: 1.35, cc: .55, ccr: .1 });
  lidTop.onBeforeCompile = function (sh) {
    sh.uniforms.uAniso = { value: .62 };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjP; varying vec3 vBx; varying vec3 vBz;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjP = position; vBx = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0)); vBz = normalize(mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0));");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjP; varying vec3 vBx; varying vec3 vBz; uniform float uAniso;\nfloat cnH(float n) { return fract(sin(n) * 43758.5453); }")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nfloat cnR = length(vObjP.xz); float cnRing = cnH(floor(cnR * 1400.0)) * .35 + cnH(floor(cnR * 260.0)) * .65;\nroughnessFactor = clamp(roughnessFactor * (.88 + .24 * cnRing), .04, 1.0);")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= .955 + .045 * cnH(floor(length(vObjP.xz) * 260.0));")
      .replace("#include <lights_fragment_maps>", T.ShaderChunk.lights_fragment_maps.replace(
        "radiance += getLightProbeIndirectRadiance( geometry.viewDir, geometry.normal, material.specularRoughness, maxMipLevel );",
        "vec2 cnD = vObjP.xz / max(length(vObjP.xz), 1e-4); vec3 cnRad = normalize(cnD.x * vBx + cnD.y * vBz); cnRad = normalize(cnRad - geometry.normal * dot(cnRad, geometry.normal));\n" +
        "vec3 cnAcc = vec3(0.0); for (int k = 0; k < 17; k++) { float s = (float(k) / 16.0 - .5) * 2.0; vec3 n2 = normalize(geometry.normal + cnRad * s * uAniso); cnAcc += getLightProbeIndirectRadiance( geometry.viewDir, n2, material.specularRoughness, maxMipLevel ); }\nradiance += cnAcc / 17.0;"))
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.directSpecular *= .2;");
  };
  var flange = oct(-LH, LH, -LH, LH, .14);
  lid.add(mesh(ext(flange, .03, .012, 2, 0), [M.lidSide, M.lidSide]));
  /* notches in the flange's front edge */
  [-.6, 0, .6].forEach(function (x) { var nt = mesh(new T.BoxGeometry(.2, .03, .06), M.slot, { cast: false }); nt.position.set(x, .03, LH - .02); lid.add(nt); });
  var body = mesh(ext(sq(LB, .12), .13, .04, 4, .054), [lidTop, M.lidSide]);
  lid.add(body);
  lid.position.set(DIE.x, SY + .075, DIE.z);
  chip.add(lid);
  var lidMats = [lidTop, M.lidSide];

  /* ---------- the crystal sweep ----------
     clusters of clear, pale-ice crystals that grow out of the chip as the front passes and
     melt away behind it: glassy (clearcoat, a strong studio reflection, faint cyan within) */
  var NC = 1250, cr = rng(4242), crys = [];
  var crysMat = phys({ color: "#e9fdff", metal: 0, rough: .02, env: 4.2, cc: 1, ccr: .02, emissive: "#22d3ee", ei: .1, flat: true });
  crysMat.transparent = true; crysMat.opacity = 1; crysMat.depthWrite = false;
  /* cut glass: faces turned to the eye stay nearly clear, the oblique facets and edges catch
     the studio (fresnel alpha) */
  crysMat.onBeforeCompile = function (sh) {
    sh.fragmentShader = sh.fragmentShader.replace("gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
      "float cnF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);\n" +
      "gl_FragColor = vec4( outgoingLight * (.55 + .9 * cnF), clamp(.1 + .95 * cnF, 0.0, 1.0) );");
  };
  var crysGlow = glowMat("#38e3ff", .3, { add: true });
  var crysI = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), crysMat, NC);
  crysI.userData.glow = crysGlow; crysI.castShadow = false; crysI.receiveShadow = false; crysI.frustumCulled = false;
  var SWEEP = new T.Vector3(1, 0, .42).normalize();
  var clusters = [];
  for (var cl = 0; cl < 120; cl++) clusters.push([(cr() * 2 - 1) * 1.85, (cr() * 2 - 1) * 1.85, .6 + cr() * .8]);
  for (var c = 0; c < NC; c++) {
    var C0 = clusters[c % clusters.length], rad = Math.pow(cr(), 1.6) * .28, an = cr() * TAU;
    var x0 = C0[0] + Math.cos(an) * rad, z0 = C0[1] + Math.sin(an) * rad;
    var big = Math.pow(cr(), 2.2) * C0[2];
    crys.push({
      x: x0, z: z0, p: x0 * SWEEP.x + z0 * SWEEP.z + (cr() - .5) * .3,
      s: .017 + big * .072, e: 1.3 + cr() * 1.6, h: .02 + Math.pow(cr(), 2.4) * .55 * (1 - rad * 2),
      rx: (cr() - .5) * .9, ry: cr() * TAU, rz: (cr() - .5) * .9, spin: (cr() - .5) * .8, lag: cr() * .22
    });
  }
  chip.add(crysI);
  /* the sweep's light: a point light that travels with the front, and a light sheet (glow only) */
  var sweepLight = new T.PointLight(lin("#3fe3ff"), 0, 2.4, 2);
  chip.add(sweepLight);
  var sheet = mesh(new T.PlaneGeometry(4.8, .9), glowMat("#3fe3ff", 1.3, { add: true, map: tex(sheetC()), side: T.DoubleSide }), { cast: false, receive: false, glowOnly: true });
  chip.add(sheet);

  /* ---------- the light pooled beneath (glow only, world space) ---------- */
  var poolMat = glowMat("#22d3ee", 1, { add: true, map: tex(radialC(512, [[0, "rgba(255,255,255,1)"], [.3, "rgba(255,255,255,.5)"], [.65, "rgba(255,255,255,.12)"], [1, "rgba(255,255,255,0)"]])) });
  var pool = mesh(new T.PlaneGeometry(5.4, 4.2).rotateX(-PI / 2), poolMat, { cast: false, receive: false, glowOnly: true });
  pool.position.set(.1, -.7, .5);

  var scene = new T.Scene();
  scene.add(chip);
  /* the page paints the pool itself (a CSS radial light under the canvas, 28-chipseq.css): a
     faint glow baked into the frames costs bytes and bands once WebP quantises its alpha.
     --pool bakes it in (review only) */
  if (cfg.pool) scene.add(pool);

  /* ---------- lights ---------- */
  var key = new T.DirectionalLight(lin("#f4f8ff"), 1.5);
  key.position.set(-3.6, 8.5, 4.2); key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  var sc = key.shadow.camera; sc.left = -3.4; sc.right = 3.4; sc.top = 3.4; sc.bottom = -3.4; sc.near = 1; sc.far = 20;
  key.shadow.bias = -.00035; key.shadow.normalBias = .012; key.shadow.radius = 3;
  scene.add(key); scene.add(key.target);
  var fill = new T.DirectionalLight(lin("#9fd2ff"), .35); fill.position.set(6, 3, -4); scene.add(fill);
  var hemi = new T.HemisphereLight(lin("#b8d8ff"), lin("#061018"), .12); scene.add(hemi);

  /* ---------- camera ---------- */
  var cam = new T.PerspectiveCamera(cfg.fov || 19.5, SW / SH, .5, 60);
  var CAM = cfg.cam || { az: -18, el: 34, d: 13.1, ty: .03, tx: .08, roll: 0 };
  function placeCam() {
    var az = CAM.az * PI / 180, el2 = CAM.el * PI / 180;
    cam.position.set(Math.sin(az) * Math.cos(el2) * CAM.d + CAM.tx, Math.sin(el2) * CAM.d + CAM.ty, Math.cos(az) * Math.cos(el2) * CAM.d);
    cam.up.set(0, 1, 0);
    cam.lookAt(CAM.tx, CAM.ty, 0);
    if (CAM.roll) cam.rotateZ(CAM.roll * PI / 180);
    cam.updateMatrixWorld();
  }
  placeCam();

  /* ---------- the timeline ---------- */
  var POSE0 = cfg.pose0 || { yaw: 0, tilt: 0, x: 0, y: 0, z: 0 }, POSE1 = cfg.pose1 || { yaw: -16, tilt: 14, x: 0, y: .1, z: 0 };
  var tmpM = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpE = new T.Euler(), tmpS = new T.Vector3(), tmpP = new T.Vector3();
  function setTime(t) {
    /* the turn (t .6 .. 1), with a slow drift before it */
    var turn = ease((t - .58) / .42), drift = t * 3.2;
    var yaw = POSE0.yaw + drift + (POSE1.yaw - POSE0.yaw) * turn;
    var tilt = POSE0.tilt + (POSE1.tilt - POSE0.tilt) * turn;
    chip.rotation.set(tilt * PI / 180, yaw * PI / 180, 0, "YXZ");
    chip.position.set(POSE0.x + (POSE1.x - POSE0.x) * turn, POSE0.y + (POSE1.y - POSE0.y) * turn, POSE0.z + (POSE1.z - POSE0.z) * turn);
    /* the copper die settles into its seat (t 0 .. .14) */
    var dd = easeOut(t / .14);
    dieG.position.y = SY + .006 + (1 - dd) * .55;
    dieG.rotation.y = (1 - dd) * .5;
    /* the strips power up, then stay on */
    var pw = .35 + .65 * sstep(0, .2, t);
    strips[0].material.emissiveIntensity = 1.6 * pw; strips[1].material.emissiveIntensity = 1.5 * pw;
    stripGlow.color.copy(lin("#3b8dff").multiplyScalar(2.4 * pw)); stripGlow2.color.copy(lin("#34c3f2").multiplyScalar(2.2 * pw));
    /* the sweep (t .16 .. .52): the front crosses the chip along SWEEP */
    var sw = (t - .16) / .36, front = -2.9 + sw * 6.0, live = sw > -.05 && sw < 1.15;
    var WAVE = 1.25;
    for (var k = 0; k < NC; k++) {
      var C = crys[k], u = (front - C.p) / WAVE - C.lag;
      var on = u > 0 && u < 1 && live;
      if (!on) { tmpS.set(0, 0, 0); tmpP.set(C.x, 0, C.z); tmpE.set(0, 0, 0); }
      else {
        var grow = Math.pow(Math.sin(PI * Math.pow(u, .45)), .8), rise = Math.pow(u, .9);
        var s = C.s * grow;
        tmpS.set(s * .5, s * C.e * .5, s * .5);
        tmpP.set(C.x, .085 + C.h * (.35 + .65 * rise) + s * C.e * .22, C.z);
        tmpE.set(C.rx, C.ry + C.spin * u, C.rz);
      }
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP, tmpQ, tmpS);
      crysI.setMatrixAt(k, tmpM);
    }
    crysI.instanceMatrix.needsUpdate = true;
    var amp = live ? Math.sin(PI * clamp(sw, 0, 1)) : 0;
    crysGlow.color.copy(lin("#74e6ff").multiplyScalar(.2 * amp + .02));
    sweepLight.intensity = 1.8 * amp;
    sweepLight.position.set(SWEEP.x * (front - .25), .45, SWEEP.z * (front - .25));
    sheet.visible = false;
    sheet.position.set(SWEEP.x * (front + .1), .38, SWEEP.z * (front + .1));
    sheet.rotation.set(0, Math.atan2(-SWEEP.z, SWEEP.x) + PI / 2, 0);
    sheet.material.color.copy(lin("#3fe3ff").multiplyScalar(.75 * amp));
    /* the traces brighten as the front passes, then rest */
    var trace = .5 + .5 * amp;
    subMat.emissiveIntensity = .1 + .18 * amp; subGlow.color.setScalar(.06 + .2 * amp);
    /* the lid comes down out of the dark (t .2 .. .54), with a soft settle */
    var ld = (t - .2) / .34;
    var drop = ease(ld), settle = ld > .82 ? Math.sin((ld - .82) / .18 * PI) * .012 : 0;
    lid.position.y = SY + .075 + (1 - drop) * 4.4 + settle;
    lid.rotation.set((1 - drop) * -.22, (1 - drop) * -.3, (1 - drop) * -.05);
    lid.visible = ld > -.02;
    /* the pool of light beneath: faint, then fuller on the finished chip */
    poolMat.color.copy(lin("#22d3ee").multiplyScalar(.1 + .2 * sstep(.45, 1, t)));
    pool.position.set(.1 + chip.position.x, -.7 + chip.position.y * .5, .5 + chip.position.z);
  }

  /* ---------- the two passes and the composite ---------- */
  var meshes = [];
  scene.traverse(function (o) { if (o.isMesh) meshes.push(o); });
  function glowPass(on) {
    meshes.forEach(function (m) {
      if (on) {
        m.userData.mat = m.material;
        m.material = m.userData.glow || (m.userData.glowOnly ? m.material : BLACK);
        if (m.userData.glowOnly) m.visible = m.userData.vis !== false;
      } else {
        m.material = m.userData.mat || m.material;
        if (m.userData.glowOnly) { m.userData.vis = m.visible; m.visible = false; }
      }
    });
  }
  /* glow-only meshes start hidden (they show in the glow pass only) */
  meshes.forEach(function (m) { if (m.userData.glowOnly) { m.userData.vis = true; m.visible = false; } });

  var gCv = el(GW, GH), gX = gCv.getContext("2d");
  var bCv = el(GW, GH), bX = bCv.getContext("2d");
  var out = el(SW, SH), oX = out.getContext("2d");
  function frame(i, n) {
    var t = n > 1 ? i / (n - 1) : 1;
    setTime(t);
    /* sheet visibility is decided in setTime: remember it for the glow pass */
    sheet.userData.vis = sheet.visible; sheet.visible = false;
    pool.userData.vis = true;
    /* 1. glow: emissive parts on black, everything else an occluding black */
    var shadowWas = R.shadowMap.enabled;
    R.shadowMap.enabled = false;
    glowPass(true);
    R.setClearColor(0x000000, 1);
    R.render(scene, cam);
    gX.globalCompositeOperation = "copy"; gX.filter = "none";
    gX.drawImage(cv, 0, 0, GW, GH);
    glowPass(false);
    R.shadowMap.enabled = shadowWas;
    /* blur it at three radii and add them up (the bloom) */
    bX.globalCompositeOperation = "copy"; bX.filter = "blur(" + (GW * .004).toFixed(2) + "px)"; bX.globalAlpha = .9; bX.drawImage(gCv, 0, 0);
    bX.globalCompositeOperation = "lighter";
    bX.filter = "blur(" + (GW * .014).toFixed(2) + "px)"; bX.globalAlpha = .75; bX.drawImage(gCv, 0, 0);
    bX.filter = "blur(" + (GW * .045).toFixed(2) + "px)"; bX.globalAlpha = .7; bX.drawImage(gCv, 0, 0);
    bX.filter = "none"; bX.globalAlpha = 1;
    /* light on a transparent ground: alpha = the brightest channel (premultiplied light) */
    var id = bX.getImageData(0, 0, GW, GH), d = id.data;
    for (var p = 0; p < d.length; p += 4) {
      var mx = Math.max(d[p], d[p + 1], d[p + 2]);
      if (mx < 2) { d[p] = d[p + 1] = d[p + 2] = d[p + 3] = 0; continue; }
      d[p] = Math.min(255, d[p] * 255 / mx); d[p + 1] = Math.min(255, d[p + 1] * 255 / mx); d[p + 2] = Math.min(255, d[p + 2] * 255 / mx); d[p + 3] = mx;
    }
    bX.putImageData(id, 0, 0);
    /* 2. beauty, transparent */
    R.setClearColor(0x000000, 0);
    R.render(scene, cam);
    oX.globalCompositeOperation = "copy"; oX.drawImage(cv, 0, 0);
    oX.globalCompositeOperation = "lighter"; oX.drawImage(bCv, 0, 0, SW, SH);
    /* 3. the top fades to nothing (the lid comes out of the dark, never out of an edge) */
    oX.globalCompositeOperation = "destination-in";
    var g = oX.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.05, "rgba(0,0,0,.03)"); g.addColorStop(.16, "rgba(0,0,0,1)"); g.addColorStop(.95, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    oX.fillStyle = g; oX.fillRect(0, 0, SW, SH);
    var gx = oX.createLinearGradient(0, 0, SW, 0);
    gx.addColorStop(0, "rgba(0,0,0,0)"); gx.addColorStop(.035, "rgba(0,0,0,1)"); gx.addColorStop(.965, "rgba(0,0,0,1)"); gx.addColorStop(1, "rgba(0,0,0,0)");
    oX.fillStyle = gx; oX.fillRect(0, 0, SW, SH);
    oX.globalCompositeOperation = "source-over";
    return out.toDataURL("image/png");
  }
  /* where the tray lands on the image over the timeline (pixels of the output size): framing */
  function bounds(ts) {
    var v = new T.Vector3(), pos = plate.geometry.attributes.position, outB = [];
    ts.forEach(function (t) {
      setTime(t); chip.updateMatrixWorld(true);
      var b = [1e9, 1e9, -1e9, -1e9];
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(plate.matrixWorld).project(cam);
        var px = (v.x + 1) / 2 * cfg.w, py = (1 - v.y) / 2 * cfg.h;
        b[0] = Math.min(b[0], px); b[1] = Math.min(b[1], py); b[2] = Math.max(b[2], px); b[3] = Math.max(b[3], py);
      }
      outB.push({ t: t, x0: Math.round(b[0]), y0: Math.round(b[1]), x1: Math.round(b[2]), y1: Math.round(b[3]) });
    });
    return outB;
  }
  return { frame: frame, bounds: bounds, info: function () { var gl = R.getContext(), dbg = gl.getExtension("WEBGL_debug_renderer_info"); return { gl2: R.capabilities.isWebGL2, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?", maxTex: R.capabilities.maxTextureSize, samples: R.capabilities.maxSamples, aniso: R.capabilities.getMaxAnisotropy(), size: [SW, SH] }; } };
}

// ---------------------------------------------------------------- the render page
const PAGE = String.raw`<!doctype html><html><head><meta charset="utf-8"><title>render-chipseq</title>
<style>html,body{margin:0;background:transparent}</style></head><body>
<script src="/three.min.js"></script><script src="/scene.js"></script>
<script>"use strict"; window.__ready = true;</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  try {
    if (p === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    if (p === "/three.min.js") { res.setHeader("Content-Type", "text/javascript"); res.end(three); return; }
    if (p === "/scene.js") { res.setHeader("Content-Type", "text/javascript"); res.end(`window.__chipScene = ${chipScene.toString()};`); return; }
    res.statusCode = 404; res.end("not found");
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const exe = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!exe) throw new Error("Microsoft Edge not found");
const profile = path.join(CACHE, `chipseq-profile-${process.pid}`);
const child = spawn(exe, ["--headless=new", `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--window-size=800,800", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanup = () => {
  try { child.kill(); } catch {}
  try { spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*chipseq-profile-${process.pid}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }); } catch {}
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
  else if (m.method === "Runtime.consoleAPICalled" && /error|warn/.test(m.params.type)) logs.push(`[console.${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 900));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text) + " " + logs.join(" | ")); return r.result.value; };

const pad3 = n => String(n).padStart(3, "0");
/* Faint pixels (the glow's soft edges, antialiased rims) carry 8-bit premultiplied colour that
   turns to noise once un-premultiplied, and that noise costs WebP bytes for nothing. Below
   alpha 96 the colour fades towards a premultiplied 7 x 7 box average (the same light, smooth). */
function smoothFaint(buf, w, h) {
  const n = w * h, P = new Float32Array(n * 4), Tm = new Float32Array(n * 4), B = new Float32Array(n * 4), r = 3;
  for (let i = 0; i < n; i++) { const a = buf[i * 4 + 3] / 255; P[i * 4] = buf[i * 4] * a; P[i * 4 + 1] = buf[i * 4 + 1] * a; P[i * 4 + 2] = buf[i * 4 + 2] * a; P[i * 4 + 3] = a; }
  for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += P[(y * w + Math.min(w - 1, Math.max(0, x))) * 4 + c];
    for (let x = 0; x < w; x++) { Tm[(y * w + x) * 4 + c] = s; s += P[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - P[(y * w + Math.max(0, x - r)) * 4 + c]; }
  }
  for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += Tm[(Math.min(h - 1, Math.max(0, y)) * w + x) * 4 + c];
    for (let y = 0; y < h; y++) { B[(y * w + x) * 4 + c] = s; s += Tm[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - Tm[(Math.max(0, y - r) * w + x) * 4 + c]; }
  }
  const out = Buffer.from(buf);
  for (let i = 0; i < n; i++) {
    const a = buf[i * 4 + 3];
    if (a >= 96) continue;
    const ab = B[i * 4 + 3];
    if (a === 0 || ab <= 1e-6) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 0; continue; }
    const k = a / 96;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(B[i * 4 + c] / ab * (1 - k) + buf[i * 4 + c] * k);
  }
  return out;
}
async function encode(png, w, h, q, aq) {
  const { data } = await sharp(png).resize(w, h, { kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  return sharp(smoothFaint(data, w, h), { raw: { width: w, height: h, channels: 4 } }).webp({ quality: q, alphaQuality: aq, effort: 6, smartSubsample: true }).toBuffer();
}
try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 100; i++) { await sleep(150); try { if (await evaluate("window.__ready === true")) break; } catch {} }
  const cfg = { w: W, h: H, ss: SS, exposure: args.exposure ? Number(args.exposure) : undefined, cam: args.cam ? JSON.parse(args.cam) : undefined, pose0: args.pose0 ? JSON.parse(args.pose0) : undefined, pose1: args.pose1 ? JSON.parse(args.pose1) : undefined, fov: args.fov ? Number(args.fov) : undefined, pool: !!args.pool };
  const t0 = Date.now();
  const info = await evaluate(`(window.__S = window.__chipScene(THREE, ${JSON.stringify(cfg)}), window.__S.info())`);
  console.log("[chipseq] scene ready in", ((Date.now() - t0) / 1000).toFixed(1) + "s", JSON.stringify(info));
  if (logs.length) console.log(logs.join("\n"));
  if (args.bounds) {
    /* framing: where the tray lands over the timeline, then stop (unless frames were asked for) */
    const b = await evaluate(`window.__S.bounds([0, .3, .55, .62, .7, .78, .86, .93, 1])`);
    b.forEach(r => console.log(`[bounds] t=${r.t}  x ${r.x0}..${r.x1}  y ${r.y0}..${r.y1}  (w ${r.x1 - r.x0}, h ${r.y1 - r.y0})`));
    if (!args.only) ONLY.length = 0;
  }
  await mkdir(path.join(OUT, "d"), { recursive: true }); await mkdir(path.join(OUT, "m"), { recursive: true });
  if (typeof args.preview === "string") await mkdir(path.resolve(args.preview), { recursive: true });
  let totD = 0, totM = 0;
  const thumbs = [];
  for (const i of ONLY) {
    const t1 = Date.now();
    const url = await evaluate(`window.__S.frame(${i}, ${N})`);
    const png = Buffer.from(url.split(",")[1], "base64");
    if (typeof args.keep === "string") { await mkdir(path.resolve(args.keep), { recursive: true }); await writeFile(path.join(path.resolve(args.keep), pad3(i) + ".png"), png); }
    const d = await encode(png, W, H, QD, AQD);
    const m = await encode(png, WM, HM, QM, AQM);
    await writeFile(path.join(OUT, "d", pad3(i) + ".webp"), d);
    await writeFile(path.join(OUT, "m", pad3(i) + ".webp"), m);
    totD += d.length; totM += m.length;
    if (typeof args.preview === "string" || typeof args.sheet === "string") {
      const flat = await sharp(d).flatten({ background: GROUND }).jpeg({ quality: 90 }).toBuffer();
      if (typeof args.preview === "string") await writeFile(path.join(path.resolve(args.preview), pad3(i) + ".jpg"), flat);
      thumbs.push({ i, flat });
    }
    console.log(`[chipseq] ${pad3(i)}  ${(d.length / 1024).toFixed(1)} KB / ${(m.length / 1024).toFixed(1)} KB  ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  }
  console.log(`[chipseq] ${ONLY.length} frames: desktop ${(totD / 1048576).toFixed(2)} MB, phone ${(totM / 1048576).toFixed(2)} MB`);
  if (typeof args.sheet === "string" && thumbs.length) {
    const cols = Math.min(4, thumbs.length), tw = 500, th = 400, rows = Math.ceil(thumbs.length / cols);
    const comps = await Promise.all(thumbs.map(async (tb, k) => ({ input: await sharp(tb.flat).resize(tw, th).toBuffer(), left: (k % cols) * tw, top: Math.floor(k / cols) * th })));
    await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: GROUND } }).composite(comps).jpeg({ quality: 88 }).toFile(path.resolve(args.sheet));
    console.log("[chipseq] sheet", path.resolve(args.sheet));
  }
  if (logs.length) console.log(logs.join("\n"));
} finally { try { ws.close(); } catch {} cleanup(); }
