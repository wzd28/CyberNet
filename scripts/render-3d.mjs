// Renders the CyberNet 3D images to transparent WebP files in public/ui/3d/, in headless Edge:
// the hero poster from the live hero kit (public/ui/3d/hero3d-kit.js, window.CNHero3D), and
// the decorative sprites from the models defined in this file (they only exist as images).
//
//   node scripts/render-3d.mjs                 every file below
//   node scripts/render-3d.mjs --only=shield,orb
//   node scripts/render-3d.mjs --land          (re)bake the globe's land bits into the kit
//   node scripts/render-3d.mjs --out=<dir>     write somewhere else (for a review)
//   node scripts/render-3d.mjs --strip=<file.jpg> [--times=9,10,11] [--n=520] [--lite]
//                                              a filmstrip of the globe over time (review)
//   node scripts/render-3d.mjs --stage=<file.jpg> [--w=1360] [--h=780] [--mode=side|stack]
//                              [--t=9] [--lite]   the whole stage (globe and flow lines) on navy
//   node scripts/render-3d.mjs --stamp         only stamp the kit's hash into the runtime
//   --port=<n>                                 the local port (default 5390; Edge uses n+1)
//
// The kit's readable source is public/ui/3d/hero3d-kit.js. A run that renders the hero (or
// uses --land, --strip, --stage or --stamp) minifies it (esbuild, as the UI build does) to
// hero3d-kit.min.js, which both the site and this renderer load, and stamps that file's content
// hash into ui-src/js/10-hero3d.js (KIT_V), so a changed kit is never served from a stale cache.
// A sprite-only run (--only=orb,recovery,...) loads the readable kit and writes neither file.
// After editing the kit: run this (--only=hero when the scene changed, so the poster still
// matches the first live frame), then rebuild the bundle (node scripts/build-ui.mjs).
//
// Files (transparent background, ACES-like tone curve, one neutral studio):
//   hero-globe.webp 1200, hero-globe-800.webp, hero-globe-480.webp  the hero poster: the live
//     globe's frame at T0, so the canvas can crossfade over it without a jump
//   shield.webp 640, shield-320.webp   the CyberNet shield: chrome frame, smoked glass, satin lock
//   lock.webp 512    graphite padlock   chip.webp 512   graphite AI chip
//   cube.webp 512    smoked glass cube  orb.webp 512    dark glass orb with a chrome ring (Learn)
//   ring.webp 512    the old Recovery lifebuoy (white ceramic and graphite), superseded by
//                    recovery.webp: delete both once nothing references ring.webp
//   ai-globe.webp 512, ai-globe-320.webp   Analysis AI: the hero globe's dark glass (dotted
//     continents, cyan -> blue rim, faint grid) with a graphite AI chip (chrome pins, a polished
//     lid etched "AI", a cyan core light) suspended at its centre
//   recovery.webp 512, recovery-320.webp   Recovery: the shield with a chrome check, ringed by a
//     counter-clockwise restore arrow whose mint light gathers towards its head
//   All of them are neutral chrome, glass and graphite, with at most one thin accent: cyan, or
//   mint for Recovery (DESIGN.md v4.1: "chrome or glass, neutral, not candy-coloured").
//
// three.js r128 is fetched from jsDelivr once (cached in the OS temp folder) and checked
// against the SRI hash in ui-src/js/10-hero3d.js. Land: Natural Earth 1:110m (public domain) through
// world-atlas@2.0.2 (ISC), only with --land. Needs Microsoft Edge (as the screenshot tools).
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
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
const ALL = ["hero", "shield", "lock", "chip", "cube", "orb", "ring", "aiglobe", "recovery", "core"];
const REVIEW = args.land || args.stamp || args.strip || args.stage;
const ONLY = typeof args.only === "string" ? args.only.split(",").map(s => s.trim()).filter(Boolean) : (REVIEW && !args.all ? [] : ALL);
/* only a run that renders from the kit's scene (or bakes into it) minifies and stamps it; a
   sprite-only run (--only=orb,...) reads the kit source and leaves the kit files alone */
const KIT_RW = !!(REVIEW || ONLY.includes("hero"));

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
if (args.stamp && !args.land && !args.strip && !args.only && !args.stage) { await stamp(); process.exit(0); }

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

if (KIT_RW) await minify();
const kitSrc = await readFile(KIT, "utf8");
const rtSrc = await readFile(RUNTIME, "utf8");
const SRC = /THREE_SRC = "([^"]+)"/.exec(rtSrc)[1], SRI = /THREE_SRI = "([^"]+)"/.exec(rtSrc)[1];
const three = await cached("three-r128.min.js", SRC);
const digest = "sha384-" + createHash("sha384").update(three).digest("base64");
if (digest !== SRI) throw new Error(`three.js does not match the SRI in 10-hero3d.js (${digest})`);
let sharp = null;
try { sharp = (await import("sharp")).default; } catch { console.log("[3d] sharp not installed: using the browser's WebP encoder"); }
const land = args.land ? await cached("land-110m.json", "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json") : null;

// ---------------------------------------------------------------- sprite models
/* Runs in the render page (serialised with toString), never in Node. T = THREE, H = CNHero3D.
   One compact image-based "studio" material for every solid: reflection and a soft
   irradiance from a procedural neutral studio (mip level = roughness), Schlick fresnel, an
   emissive colour or map. Returns { studio(n), POSE }. */
function models(T, H) {
  var TAU = Math.PI * 2;
  function canvasEl(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h || w; return c; }
  function rng(seed) { return H.rng(seed); }

  function makeStudio(R) {
    var K = H.kit(T, R, true), lin = K.lin, cache = {};
    /* the studio: a pale grey sky, a charcoal floor, a large white key softbox, a strip light
       on the left, a cool horizon, and two faint accents (cyan right, blue left) for the
       rims. Mipmapped: the mip level stands in for roughness. */
    K.env = function () {
      if (cache.env) return cache.env;
      var w = 1024, h = 512, c = canvasEl(w, h), x = c.getContext("2d");
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#f7f8fa"); g.addColorStop(.28, "#dde2e8"); g.addColorStop(.44, "#9aa4b0");
      g.addColorStop(.52, "#454d58"); g.addColorStop(.66, "#1c2026"); g.addColorStop(1, "#0b0d10");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = "lighter";
      function blob(u, v, rx, ry, rgb, a) {
        x.save(); x.translate(u * w, v * h); x.scale(1, ry / rx);
        var r = x.createRadialGradient(0, 0, 0, 0, 0, rx);
        r.addColorStop(0, "rgba(" + rgb + "," + a + ")"); r.addColorStop(.5, "rgba(" + rgb + "," + (a * .3) + ")"); r.addColorStop(1, "rgba(" + rgb + ",0)");
        x.fillStyle = r; x.fillRect(-rx, -rx, rx * 2, rx * 2); x.restore();
      }
      blob(.74, .3, 260, 120, "255,255,255", 1);       /* key softbox, behind the viewer */
      blob(.74, .55, 220, 60, "255,255,255", .45);      /* its bounce off the floor */
      blob(.28, .3, 70, 150, "255,255,255", .55);       /* strip light */
      blob(.5, .47, 260, 26, "220,230,240", .55);       /* horizon */
      blob(.97, .46, 150, 70, "34,211,238", .38);       /* cyan accent */
      blob(.03, .46, 150, 70, "59,130,246", .34);       /* blue accent */
      var t = new T.CanvasTexture(c);
      t.wrapS = T.RepeatWrapping;
      return (cache.env = t);
    };
    var STUDIO_V = [
      "varying vec3 vN;varying vec3 vV;varying vec2 vUv;",
      "void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;vUv=uv;gl_Position=projectionMatrix*mv;}"
    ].join("\n");
    var STUDIO_F = [
      "uniform sampler2D uEnv;uniform vec3 uColor;uniform float uMetal;uniform float uRough;uniform float uEnvK;uniform vec3 uEmissive;uniform float uOpacity;uniform float uSide;uniform float uTone;",
      "#ifdef USE_EMAP",
      "uniform sampler2D uEMap;uniform vec4 uEMapT;",
      "#endif",
      "#ifdef USE_CMAP",
      "uniform sampler2D uCMap;",
      "#endif",
      "#ifdef USE_FADE",
      "uniform vec2 uFade;",
      "#endif",
      "varying vec3 vN;varying vec3 vV;varying vec2 vUv;",
      "vec3 envAt(vec3 d,float lod){d=(vec4(d,0.)*viewMatrix).xyz;vec2 q=vec2(atan(d.z,d.x)*.1591549+.5,asin(clamp(d.y,-1.,1.))*.3183099+.5);",
      "#if defined(GL_EXT_shader_texture_lod)||__VERSION__>=300",
      "return sRGBToLinear(texture2DLodEXT(uEnv,q,lod)).rgb;",
      "#else",
      "return sRGBToLinear(texture2D(uEnv,q,lod)).rgb;",
      "#endif",
      "}",
      "vec3 aces(vec3 c){c*=1.05/.6;c=mat3(.59719,.07600,.02840,.35458,.90834,.13383,.04823,.01566,.83777)*c;",
      "c=(c*(c+.0245786)-.000090537)/(c*(.983729*c+.4329510)+.238081);",
      "return clamp(mat3(1.60475,-.10208,-.00327,-.53108,1.10813,-.07276,-.07367,-.00605,1.07602)*c,0.,1.);}",
      "void main(){float fs=gl_FrontFacing?1.:-1.;if(uSide*fs<-.5)discard;",
      "vec3 n=normalize(vN)*fs;vec3 v=normalize(vV);",
      "vec3 base=uColor;",
      "#ifdef USE_CMAP",
      "base*=sRGBToLinear(texture2D(uCMap,vUv)).rgb;",
      "#endif",
      "float nv=clamp(dot(n,v),0.,1.);vec3 f0=mix(vec3(.04),base,uMetal);",
      "vec3 F=f0+(max(vec3(1.-uRough),f0)-f0)*pow(1.-nv,5.);",
      "vec3 spec=envAt(reflect(-v,n),uRough*8.5)*F*uEnvK;",
      "vec3 dif=base*(1.-uMetal)*envAt(n,7.5)*(1.-F)*1.15;",
      "vec3 em=uEmissive;",
      "#ifdef USE_EMAP",
      "em*=sRGBToLinear(texture2D(uEMap,vUv*uEMapT.xy+uEMapT.zw)).rgb;",
      "#endif",
      "vec3 col=dif+spec+em;col=mix(col,aces(col),uTone);float al=uOpacity;",
      /* fade along the u texture coordinate (a torus arc's tail): colour and alpha together */
      "#ifdef USE_FADE",
      "float fd=smoothstep(uFade.x,uFade.y,vUv.x);col*=fd;al*=fd;",
      "#endif",
      "gl_FragColor=linearToOutputTexel(vec4(col,al));}"
    ].join("\n");
    /* o: color, metal, rough, envK, emissive, ei, emap (+ emapT), map, fade ([u0, u1]: transparent
       below u0, opaque above u1), opacity, transparent, side, depthWrite, toneMapped */
    K.mat = function (o) {
      var defs = {}, e = o.emissive ? (o.emissive.isColor ? o.emissive.clone() : lin(o.emissive)) : new T.Color(0, 0, 0);
      var u = {
        uEnv: { value: K.env() }, uColor: { value: o.color && o.color.isColor ? o.color.clone() : lin(o.color || "#ffffff") },
        uMetal: { value: o.metal == null ? 0 : o.metal }, uRough: { value: o.rough == null ? .3 : o.rough },
        uEnvK: { value: o.envK == null ? 1 : o.envK }, uEmissive: { value: e.clone().multiplyScalar(o.ei == null ? 1 : o.ei) },
        uOpacity: { value: o.opacity == null ? 1 : o.opacity },
        uSide: { value: o.side === T.BackSide ? -1 : o.side === T.DoubleSide ? 0 : 1 },
        uTone: { value: o.toneMapped === false ? 0 : 1 }
      };
      if (o.emap) { defs.USE_EMAP = ""; u.uEMap = { value: o.emap }; u.uEMapT = { value: new T.Vector4().fromArray(o.emapT || [1, 1, 0, 0]) }; }
      if (o.map) { defs.USE_CMAP = ""; u.uCMap = { value: o.map }; }
      if (o.fade) { defs.USE_FADE = ""; u.uFade = { value: new T.Vector2(o.fade[0], o.fade[1]) }; }
      var m = new T.ShaderMaterial({
        uniforms: u, defines: defs, vertexShader: STUDIO_V, fragmentShader: STUDIO_F,
        transparent: !!(o.transparent || o.fade), side: T.DoubleSide, toneMapped: false,
        depthWrite: o.depthWrite == null ? !(o.transparent || o.fade) : o.depthWrite
      });
      m.extensions.shaderTextureLOD = true;
      return m;
    };
    K.flat = function (col, k, o) {
      return K.mat(Object.assign({ color: "#000000", metal: 0, rough: 1, envK: 0, emissive: col, ei: k == null ? 1 : k, toneMapped: false }, o || {}));
    };
    K.chrome = function (k, rough) { return K.mat({ color: lin("#c9d1da").lerp(lin("#ffffff"), k == null ? .5 : k), metal: 1, rough: rough == null ? .12 : rough, envK: 1.3 }); };
    K.graphite = function (rough) { return K.mat({ color: "#5a626e", metal: .85, rough: rough == null ? .3 : rough, envK: 1.15 }); };
    /* one geometry from copies of src placed by matrices */
    K.merge = function (src, mats) {
      var pos = [], nor = [], uvs = [], idx = [], off = 0, n = src.attributes.position.count;
      mats.forEach(function (m) {
        var g = src.clone().applyMatrix4(m), ix = g.index.array, i;
        for (i = 0; i < g.attributes.position.array.length; i++) { pos.push(g.attributes.position.array[i]); nor.push(g.attributes.normal.array[i]); }
        for (i = 0; i < g.attributes.uv.array.length; i++) uvs.push(g.attributes.uv.array[i]);
        for (i = 0; i < ix.length; i++) idx.push(ix[i] + off);
        off += n;
      });
      var out = new T.BufferGeometry();
      out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
      out.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
      out.setIndex(idx);
      return out;
    };
    K.cache2 = cache;
    return K;
  }

  /* shapes */
  function roundRect(w, h, r, path) {
    var s = path || new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  /* the logo: hexagon shield + lock (viewBox 0 0 24 26), 22 logo units = 2.6 world units */
  var S = 2.6 / 22;
  function P(x, y) { return [(x - 12) * S, (13 - y) * S]; }
  var HEX = [[12, 2], [21, 6], [20, 15], [12, 24], [4, 15], [3, 6]].map(function (p) { return P(p[0], p[1]); });
  function hexPath(scale, path) {
    var s = path || new T.Shape();
    HEX.forEach(function (p, i) { var px = p[0] * scale, py = p[1] * scale; if (i) s.lineTo(px, py); else s.moveTo(px, py); });
    s.closePath();
    return s;
  }
  /* a fine engraved hexagon lattice (emissive map for the smoked glass) */
  function hexTex() {
    var n = 512, c = canvasEl(n), x = c.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, n, n);
    var r = 15, w = Math.sqrt(3) * r;
    x.lineWidth = 1.4;
    for (var row = -1; row < n / (1.5 * r) + 1; row++) {
      for (var col = -1; col < n / w + 1; col++) {
        var cx = col * w + (row % 2 ? w / 2 : 0), cy = row * 1.5 * r;
        var d = Math.hypot(cx - n * .42, cy - n * .3) / (n * .7);
        x.strokeStyle = "rgba(255,255,255," + (0.42 * Math.max(0, 1 - d)).toFixed(3) + ")";
        x.beginPath();
        for (var k = 0; k < 6; k++) {
          var a = Math.PI / 6 + k * Math.PI / 3, px = cx + (r - 1.5) * Math.cos(a), py = cy + (r - 1.5) * Math.sin(a);
          if (k) x.lineTo(px, py); else x.moveTo(px, py);
        }
        x.closePath(); x.stroke();
      }
    }
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }

  /* The CyberNet shield: polished chrome frame, smoked glass face with an engraved lattice,
     a satin aluminium lock with a dark keyhole and one thin cyan line inside the frame. */
  function shield(K) {
    var g = new T.Group(), lin = K.lin;
    var frameGeo = (function () {
      var s = hexPath(1); s.holes.push(hexPath(.83, new T.Path()));
      var e = new T.ExtrudeGeometry(s, { depth: .2, bevelEnabled: true, bevelThickness: .07, bevelSize: .05, bevelSegments: 6, curveSegments: 1 });
      e.translate(0, 0, -.1); return e;
    })();
    g.add(new T.Mesh(frameGeo, K.chrome(.6, .1)));
    var inlay = (function () { var s = hexPath(.8); s.holes.push(hexPath(.785, new T.Path())); var e = new T.ShapeGeometry(s, 1); e.translate(0, 0, .022); return e; })();
    g.add(new T.Mesh(inlay, K.flat("#67e8f9", .9, { side: T.DoubleSide })));
    var face = new T.Mesh(new T.ShapeGeometry(hexPath(.83), 1), K.mat({
      color: "#0b1322", metal: .2, rough: .06, envK: 1.25, emissive: "#cfe9ff", ei: .16, emap: hexTex(), emapT: [1 / 2.4, 1 / 2.4, .5, .5],
      transparent: true, opacity: .88, side: T.DoubleSide, depthWrite: false
    }));
    face.position.z = -.03; face.renderOrder = 1; g.add(face);
    var lockG = new T.Group(); g.add(lockG);
    var body = new T.Mesh(
      (function () { var e = new T.ExtrudeGeometry(roundRect(7.4 * S, 6.2 * S, 1.2 * S), { depth: .2, bevelEnabled: true, bevelThickness: .05, bevelSize: .03, bevelSegments: 5, curveSegments: 12 }); e.center(); return e; })(),
      K.mat({ color: "#dfe4ea", metal: .9, rough: .32, envK: 1.2 })
    );
    body.position.set(0, (13 - 15.6) * S, .02); lockG.add(body);
    var shMat = K.chrome(.8, .08);
    var r0 = 2.4 * S, legLen = 2.3 * S, arcY = (13 - 10.2) * S;
    var arcM = new T.Mesh(new T.TorusGeometry(r0, .068, 16, 40, Math.PI), shMat); arcM.position.set(0, arcY, .02); lockG.add(arcM);
    [-r0, r0].forEach(function (x) { var leg = new T.Mesh(new T.CylinderGeometry(.068, .068, legLen + .06, 16), shMat); leg.position.set(x, arcY - legLen / 2, .02); lockG.add(leg); });
    var ink = K.flat("#05080e", 1, { side: T.DoubleSide });
    [1, -1].forEach(function (side) {
      var zf = .02 + side * .152;
      var hole = new T.Mesh(new T.CircleGeometry(1 * S, 28), ink); hole.position.set(0, (13 - 15.2) * S, zf); lockG.add(hole);
      var slot = new T.Mesh(new T.PlaneGeometry(.075, 1.4 * S), ink); slot.position.set(0, (13 - 16.6) * S, zf); lockG.add(slot);
    });
    return g;
  }
  /* Padlock: graphite body, a polished dark plate, a chrome shackle, a cyan hairline round the keyhole. */
  function padlock(K) {
    var g = new T.Group();
    var body = new T.Mesh(
      new T.ExtrudeGeometry(roundRect(1, .8, .2), { depth: .34, bevelEnabled: true, bevelThickness: .08, bevelSize: .07, bevelSegments: 6, curveSegments: 14 }).center(),
      K.graphite(.26)
    );
    body.position.y = -.16; g.add(body);
    var plate = new T.Mesh(new T.ShapeGeometry(roundRect(.78, .58, .12), 10), K.mat({ color: "#0c1018", metal: .5, rough: .05, envK: 1.3 }));
    plate.position.set(0, -.16, .256); g.add(plate);
    var sh = K.chrome(.8, .08);
    var arc = new T.Mesh(new T.TorusGeometry(.3, .075, 18, 44, Math.PI), sh); arc.position.y = .5; g.add(arc);
    [-.3, .3].forEach(function (x) { var leg = new T.Mesh(new T.CylinderGeometry(.075, .075, .32, 18), sh); leg.position.set(x, .34, 0); g.add(leg); });
    var ink = K.flat("#03050a", 1);
    var hole = new T.Mesh(new T.CircleGeometry(.07, 28), ink); hole.position.set(0, -.11, .262); g.add(hole);
    var slot = new T.Mesh(new T.PlaneGeometry(.046, .16), ink); slot.position.set(0, -.2, .262); g.add(slot);
    var ring = new T.Mesh(new T.RingGeometry(.155, .163, 64), K.flat("#67e8f9", 1)); ring.position.set(0, -.15, .263); g.add(ring);
    return g;
  }
  /* AI chip: a graphite package with silver pins; the die is engraved "AI" in brushed silver,
     fine silver traces and one cyan hairline round the die. */
  function chipTex() {
    var n = 512, c = canvasEl(n), x = c.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, n, n);
    x.lineCap = "round"; x.lineJoin = "round";
    var r = rng(11);
    x.lineWidth = 3;
    for (var i = 0; i < 26; i++) {
      var side = i % 4, p = 70 + r() * 372, len = 40 + r() * 60, x0, y0, x1, y1, x2, y2;
      if (side === 0) { x0 = p; y0 = 16; x1 = p; y1 = 16 + len; x2 = x1 + (r() - .5) * 50; y2 = y1 + 26; }
      else if (side === 1) { x0 = 496; y0 = p; x1 = 496 - len; y1 = p; x2 = x1 - 26; y2 = y1 + (r() - .5) * 50; }
      else if (side === 2) { x0 = p; y0 = 496; x1 = p; y1 = 496 - len; x2 = x1 + (r() - .5) * 50; y2 = y1 - 26; }
      else { x0 = 16; y0 = p; x1 = 16 + len; y1 = p; x2 = x1 + 26; y2 = y1 + (r() - .5) * 50; }
      x.strokeStyle = "rgba(200,210,222,.32)";
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.lineTo(x2, y2); x.stroke();
      x.fillStyle = "rgba(220,228,236,.45)"; x.beginPath(); x.arc(x2, y2, 6, 0, TAU); x.fill();
    }
    x.fillStyle = "#000"; x.beginPath(); x.moveTo(156, 140); x.arcTo(372, 140, 372, 372, 34); x.arcTo(372, 372, 140, 372, 34); x.arcTo(140, 372, 140, 140, 34); x.arcTo(140, 140, 372, 140, 34); x.closePath(); x.fill();
    x.strokeStyle = "rgba(103,232,249,.95)"; x.lineWidth = 3; x.stroke();
    x.strokeStyle = "rgba(235,240,246,.9)"; x.lineWidth = 22;
    x.beginPath(); x.moveTo(186, 318); x.lineTo(232, 194); x.lineTo(278, 318); x.stroke();
    x.beginPath(); x.moveTo(204, 272); x.lineTo(260, 272); x.stroke();
    x.beginPath(); x.moveTo(326, 194); x.lineTo(326, 318); x.stroke();
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function chip(K) {
    var g = new T.Group();
    var base = new T.Mesh(
      new T.ExtrudeGeometry(roundRect(1.1, 1.1, .14), { depth: .1, bevelEnabled: true, bevelThickness: .035, bevelSize: .03, bevelSegments: 5, curveSegments: 10 }).center(),
      K.graphite(.34)
    );
    g.add(base);
    var top = new T.Mesh(new T.PlaneGeometry(1.02, 1.02), K.mat({ color: "#0d1117", metal: .4, rough: .22, envK: 1, emissive: "#ffffff", ei: .55, emap: chipTex() }));
    top.position.z = .086; g.add(top);
    var pm = [], q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), one = new T.Vector3(1, 1, 1);
    for (var s = 0; s < 4; s++) {
      for (var k = 0; k < 6; k++) {
        var t = -.4 + k * .16, a = s * Math.PI / 2;
        v.set(Math.cos(a) * .62 - Math.sin(a) * t, Math.sin(a) * .62 + Math.cos(a) * t, 0);
        e.set(0, 0, a + Math.PI / 2); q.setFromEuler(e);
        pm.push(new T.Matrix4().compose(v, q, one));
      }
    }
    g.add(new T.Mesh(K.merge(new T.BoxGeometry(.075, .2, .05), pm), K.chrome(.7, .14)));
    return g;
  }
  /* Data cube: smoked glass with fine chrome edges and a small cyan-lit core. */
  function cube(K) {
    var g = new T.Group();
    var box = new T.BoxGeometry(1, 1, 1);
    var glass = { color: "#b8c6d6", metal: .35, rough: .05, envK: 1.45, transparent: true, opacity: .36, depthWrite: false };
    var back = new T.Mesh(box, K.mat(Object.assign({ side: T.BackSide }, glass))); back.renderOrder = 1; g.add(back);
    var core = new T.Mesh(new T.BoxGeometry(.34, .34, .34), K.mat({ color: "#c9d1da", metal: 1, rough: .1, envK: 1.3, emissive: "#22d3ee", ei: .08 }));
    core.rotation.set(.5, .6, .2); core.renderOrder = 2; g.add(core);
    var front = new T.Mesh(box, K.mat(Object.assign({ side: T.FrontSide }, glass))); front.renderOrder = 3; g.add(front);
    var em = [], q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), one = new T.Vector3(1, 1, 1);
    [[0, 0, 0], [0, 0, Math.PI / 2], [0, Math.PI / 2, 0]].forEach(function (rot) {
      e.set(rot[0], rot[1], rot[2]); q.setFromEuler(e);
      [[.5, .5], [.5, -.5], [-.5, .5], [-.5, -.5]].forEach(function (o) {
        if (rot[2]) v.set(o[0], 0, o[1]); else if (rot[1]) v.set(o[0], o[1], 0); else v.set(0, o[0], o[1]);
        em.push(new T.Matrix4().compose(v, q, one));
      });
    });
    var edges = new T.Mesh(K.merge(new T.BoxGeometry(1.02, .028, .028), em), K.chrome(.7, .1));
    edges.renderOrder = 4; g.add(edges);
    return g;
  }
  /* AI orb: a dark glass sphere with a slow inner swirl (deep blue to cyan, a hint of indigo)
     and a thin chrome ring. */
  function orb(K) {
    var g = new T.Group(), lin = K.lin;
    var u = { uA: { value: lin("#22d3ee") }, uB: { value: lin("#3b82f6") }, uC: { value: lin("#6366f1") }, uD: { value: lin("#060b16") }, uL: { value: new T.Vector3(-.5, .6, .62).normalize() } };
    var sph = new T.Mesh(new T.SphereGeometry(1, 96, 64), new T.ShaderMaterial({
      uniforms: u,
      vertexShader: "varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);vP=position;gl_Position=projectionMatrix*mv;}",
      fragmentShader: [
        "uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;uniform vec3 uD;uniform vec3 uL;varying vec3 vN;varying vec3 vV;varying vec3 vP;",
        "float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}",
        "float n3(vec3 p){vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.-2.*f);",
        "return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}",
        "float fbm(vec3 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}",
        "void main(){vec3 n=normalize(vN);vec3 v=normalize(vV);float nv=max(dot(n,v),0.);",
        "float sw=fbm(vP*1.4+vec3(fbm(vP*2.1),fbm(vP*2.1+4.),0.)*2.);",
        "vec3 col=uD;col=mix(col,uB*.12,smoothstep(.45,.78,sw));col=mix(col,uA*.16,smoothstep(.64,.86,sw)*smoothstep(-.5,.9,vP.y));",
        "col=mix(col,uC*.1,smoothstep(.55,.8,sw)*smoothstep(.2,-.9,vP.y)*.6);",
        "col*=.55+.45*nv;",
        "float fr=pow(1.-nv,5.);col+=mix(uA,uB,smoothstep(-.5,.5,n.x*.4-n.y*.8))*fr*.75;",
        "vec3 r=reflect(-uL,n);float rv=max(dot(r,v),0.);col+=vec3(.85,.92,1.)*(pow(rv,22.)*.12+pow(rv,300.)*.9);",
        "gl_FragColor=linearToOutputTexel(vec4(col,1.));}"
      ].join("\n")
    }));
    g.add(sph);
    var r1 = new T.Mesh(new T.TorusGeometry(1.34, .022, 16, 200), K.chrome(.7, .08));
    r1.rotation.set(1.22, .28, 0); g.add(r1);
    return g;
  }
  /* Recovery lifebuoy: white ceramic and graphite segments, a satin silver rope and wraps. */
  function ring(K) {
    var g = new T.Group();
    var c = canvasEl(512, 64), x = c.getContext("2d");
    for (var i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#eef1f5" : "#454d59"; x.fillRect(i * 64, 0, 64, 64); }
    var map = new T.CanvasTexture(c); map.encoding = T.sRGBEncoding; map.anisotropy = 8;
    g.add(new T.Mesh(new T.TorusGeometry(1, .36, 56, 180), K.mat({ color: "#ffffff", map: map, metal: .05, rough: .24, envK: .8 })));
    var rope = K.mat({ color: "#d7dde5", metal: .9, rough: .35, envK: 1.1 });
    g.add(new T.Mesh(new T.TorusGeometry(1.37, .022, 12, 220), rope));
    for (var k = 0; k < 4; k++) {
      var a = (k * 2 + 1) * Math.PI / 4;
      var w = new T.Mesh(new T.TorusGeometry(.375, .028, 12, 48), rope);
      w.position.set(Math.cos(a), Math.sin(a), 0);
      w.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(-Math.sin(a), Math.cos(a), 0));
      g.add(w);
    }
    var mint = new T.Mesh(new T.TorusGeometry(1.012, .006, 8, 240), K.flat("#5eead4", .9));
    mint.position.z = .36; g.add(mint);
    return g;
  }
  /* ---- Analysis AI: a dark glass globe (the hero globe's language) with an AI chip inside ---- */
  /* the chip's lid face (a colour map on polished metal): a near-black mirror with "AI" in
     bright silver, a fine silver hairline inside the edge */
  function lidTex() {
    var n = 512, c = canvasEl(n), x = c.getContext("2d");
    x.fillStyle = "#262b33"; x.fillRect(0, 0, n, n);
    x.strokeStyle = "#8b95a2"; x.lineWidth = 5; x.strokeRect(26, 26, n - 52, n - 52);
    x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "600 250px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    x.fillStyle = "#f4f7fa"; x.fillText("AI", n / 2, n / 2 + 16);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  /* the substrate round the lid: fine silver traces running out to the pins, and a cyan line
     where the core's light leaks round the lid */
  function substrateTex() {
    var n = 512, c = canvasEl(n), x = c.getContext("2d"), r = rng(23), i, k;
    x.fillStyle = "#000"; x.fillRect(0, 0, n, n);
    x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = 2.2;
    for (var side = 0; side < 4; side++) {
      for (k = 0; k < 8; k++) {
        var p = 86 + k * 48.6 + (r() - .5) * 6, kink = (r() - .5) * 26;
        x.save(); x.translate(n / 2, n / 2); x.rotate(side * Math.PI / 2); x.translate(-n / 2, -n / 2);
        x.strokeStyle = "rgba(205,214,226,.3)";
        x.beginPath(); x.moveTo(p, 6); x.lineTo(p, 26 + r() * 10); x.lineTo(p + kink * .5, 50); x.lineTo(p + kink * .5, 58); x.stroke();
        x.fillStyle = "rgba(225,232,240,.45)"; x.beginPath(); x.arc(p + kink * .5, 58, 3.6, 0, TAU); x.fill();
        x.restore();
      }
    }
    /* the cyan line round the lid's footprint, with the core's light seeping out under it */
    var s = 80, rr = 34;
    x.shadowColor = "rgba(34,211,238,.9)"; x.shadowBlur = 22;
    x.strokeStyle = "rgba(103,232,249,1)"; x.lineWidth = 3.5;
    x.beginPath(); x.moveTo(s + rr, s); x.arcTo(n - s, s, n - s, n - s, rr); x.arcTo(n - s, n - s, s, n - s, rr); x.arcTo(s, n - s, s, s, rr); x.arcTo(s, s, n - s, s, rr); x.closePath(); x.stroke();
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  /* graphite substrate, a satin chrome lid etched "AI", fine chrome pins (8 a side) */
  function aiChip(K) {
    var g = new T.Group(), W = .92;
    var base = new T.Mesh(
      new T.ExtrudeGeometry(roundRect(W, W, .09), { depth: .07, bevelEnabled: true, bevelThickness: .022, bevelSize: .02, bevelSegments: 4, curveSegments: 8 }).center(),
      K.graphite(.32)
    );
    g.add(base);
    var top = new T.Mesh(new T.PlaneGeometry(W - .02, W - .02), K.mat({ color: "#0c1016", metal: .45, rough: .2, envK: 1, emissive: "#ffffff", ei: .7, emap: substrateTex() }));
    top.position.z = .058; g.add(top);
    var LW = .54;
    /* the lid: polished graphite on top, chrome round its bevelled edge (extrude groups: caps, sides) */
    var lid = new T.Mesh(
      new T.ExtrudeGeometry(roundRect(LW, LW, .06), { depth: .05, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 5, curveSegments: 10 }).center(),
      [K.mat({ color: "#262b33", metal: 1, rough: .12, envK: 1.2 }), K.chrome(.7, .1)]
    );
    lid.position.z = .058 + .045; g.add(lid);
    var face = new T.Mesh(new T.PlaneGeometry(LW - .01, LW - .01), K.mat({ color: "#ffffff", metal: 1, rough: .14, envK: 1.2, map: lidTex() }));
    face.position.z = .058 + .045 + .0451; g.add(face);
    var pm = [], q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), one = new T.Vector3(1, 1, 1);
    for (var s = 0; s < 4; s++) {
      for (var k = 0; k < 8; k++) {
        var t = -.34 + k * (.68 / 7), a = s * Math.PI / 2;
        v.set(Math.cos(a) * (W / 2 + .045) - Math.sin(a) * t, Math.sin(a) * (W / 2 + .045) + Math.cos(a) * t, -.012);
        e.set(0, 0, a + Math.PI / 2); q.setFromEuler(e);
        pm.push(new T.Matrix4().compose(v, q, one));
      }
    }
    g.add(new T.Mesh(K.merge(new T.BoxGeometry(.03, .11, .022), pm), K.chrome(.35, .16)));
    return g;
  }
  /* The globe: an inner far wall (smoked navy, the grid, light pooling round the limb), the far
     side's land dots through the glass, the chip with a soft cyan core light, the near side's
     land dots (quieter in the middle so the chip reads), the front glass (clear in the middle,
     a fresnel rim, one soft window highlight) and the hero globe's thin rim light outside. */
  function aiGlobe(K) {
    var g = new T.Group(), lin = K.lin, PAL = H.PAL;
    var hero = K.globe({});   /* reused: its land dot geometry and its outer rim light */
    var tilt = new T.Group(); tilt.rotation.set(.3, 0, -.2); g.add(tilt);
    var spin = new T.Group(); spin.rotation.y = AIG.face * Math.PI / 180; tilt.add(spin);
    var GLASS_V = "varying vec3 vN;varying vec3 vV;varying vec3 vO;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;vO=position;gl_Position=projectionMatrix*mv;}";
    var GRID = [
      "float grid(vec3 o){o=normalize(o);float la=asin(clamp(o.y,-1.,1.))*3.8197186;float lo=atan(o.x,o.z)*3.8197186;",
      "float da=abs(fract(la-.5)-.5);float dl=abs(fract(lo-.5)-.5);",
      "float ga=1.-smoothstep(0.,fwidth(la)*1.2,da);float gn=(1.-smoothstep(0.,fwidth(lo)*1.2,dl))*smoothstep(.12,.4,sqrt(max(1.-o.y*o.y,0.)));",
      "return max(ga,gn);}"
    ].join("\n");
    function glass(front) {
      var u = {
        uDeep: { value: lin(PAL.deep) }, uMid: { value: lin(PAL.body) }, uA: { value: lin(PAL.cyan) }, uB: { value: lin(PAL.blue) },
        uGrid: { value: lin("#7dd3fc") }, uL: { value: new T.Vector3(-.5, .62, .6).normalize() }
      };
      var m = new T.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, side: front ? T.FrontSide : T.BackSide, premultipliedAlpha: true,
        vertexShader: GLASS_V,
        fragmentShader: [
          "uniform vec3 uDeep;uniform vec3 uMid;uniform vec3 uA;uniform vec3 uB;uniform vec3 uGrid;uniform vec3 uL;varying vec3 vN;varying vec3 vV;varying vec3 vO;",
          GRID,
          "void main(){vec3 n=normalize(vN);vec3 v=normalize(vV);float gr=grid(vO);",
          front ? [
            /* the near glass: nearly clear in the middle, a fresnel edge, the rim light, one window highlight */
            "float nv=clamp(dot(n,v),0.,1.);float fr=pow(1.-nv,3.);",
            "float k=clamp(.5+.5*(n.x*.5-n.y*.9),0.,1.);vec3 rim=mix(uA,uB,smoothstep(.15,.85,k));",
            "vec3 r=reflect(-v,n);",
            /* a softbox behind and up to the left: its reflection is a soft highlight near the upper left limb */
            "vec3 bx=normalize(vec3(-.64,.7,-.33));float h=max(dot(r,bx),0.);float win=smoothstep(.955,.995,h)*.42+pow(h,90.)*.16;",
            "float sm=.06+.8*fr;",
            "vec3 col=mix(uDeep,uMid,.6)*sm*.6+rim*(pow(1.-nv,8.)*1.15+fr*.05)+vec3(.86,.93,1.)*win+uGrid*gr*.035*smoothstep(.05,.5,nv);",
            "float a=clamp(sm+win+pow(1.-nv,8.),0.,1.);",
            "gl_FragColor=linearToOutputTexel(vec4(col,a));}"
          ].join("\n") : [
            /* the far wall from inside: n faces away from the viewer, so flip it */
            "n=-n;float nv=clamp(dot(n,v),0.,1.);",
            "float ndl=dot(-n,uL);",
            "vec3 col=mix(uDeep,uMid,smoothstep(-.9,1.,-ndl)*.75);",
            "float k=clamp(.5+.5*(-n.x*.5+n.y*.9),0.,1.);",
            /* light gathered by the glass round the inside of the limb, strongest low and right (the rim side) */
            "col+=mix(uA,uB,smoothstep(.15,.85,k))*pow(1.-nv,2.4)*.16;",
            "col+=uGrid*gr*.03*smoothstep(.05,.6,nv);",
            "gl_FragColor=linearToOutputTexel(vec4(col,.96));}"
          ].join("\n")
        ].join("\n")
      });
      m.extensions.derivatives = true;
      return m;
    }
    /* the far wall writes depth, so the outer rim light (a back-facing shell) only shows past the limb */
    var back = new T.Mesh(new T.SphereGeometry(1, 96, 64), glass(false)); back.material.depthWrite = true; back.renderOrder = 0; spin.add(back);
    /* land dots: the far side faint, the near side white to cyan, quieter where the chip is */
    var DOT_V = [
      "uniform float uSize;uniform float uScale;uniform float uMin;attribute float aR;varying float vF;varying float vR;varying vec2 vS;",
      "void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vec3 n=normalize(normalMatrix*normal);vF=dot(n,normalize(-mv.xyz));vR=aR;",
      "gl_Position=projectionMatrix*mv;vS=gl_Position.xy/gl_Position.w;gl_PointSize=max(uSize*uScale/-mv.z,uMin);}"
    ].join("\n");
    function dots(far) {
      var u = { uSize: { value: AIG.dot }, uScale: { value: 400 }, uMin: { value: 1 }, uA: { value: lin("#eef8ff") }, uB: { value: lin(PAL.cyan2) }, uHole: { value: AIG.hole } };
      var m = new T.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, depthTest: !far,
        vertexShader: DOT_V,
        fragmentShader: [
          "uniform vec3 uA;uniform vec3 uB;uniform float uHole;varying float vF;varying float vR;varying vec2 vS;",
          "void main(){vec2 q=gl_PointCoord-.5;float d=length(q);if(d>.5)discard;float a=smoothstep(.5,.12,d);",
          far
            ? "float f=-vF;a*=smoothstep(.05,.5,f)*.16;vec3 c=uB;"
            : "float f=vF;a*=smoothstep(-.02,.28,f)*(.5+.5*smoothstep(.15,.85,f));vec3 c=mix(uB,uA,smoothstep(.12,.8,f));a*=mix(1.,.3+.25*vR,1.-smoothstep(uHole*.4,uHole,length(vS)));",
          "gl_FragColor=linearToOutputTexel(vec4(c,a));}"
        ].join("\n")
      });
      var p = new T.Points(hero.dots.geometry, m);
      p.userData.u = u;
      return p;
    }
    var farDots = dots(true); farDots.renderOrder = 1; spin.add(farDots);
    /* the chip, held still at the centre (not turning with the globe), and its core light */
    var core = K.sprite(PAL.cyan, AIG.glow, 1.5, K.haze()); core.position.z = -.25; core.renderOrder = 2; g.add(core);
    var chipG = aiChip(K); chipG.rotation.set(AIG.chip[0], AIG.chip[1], AIG.chip[2]); chipG.scale.setScalar(AIG.chipS);
    chipG.traverse(function (o) { if (o.isMesh) o.renderOrder = 3; });
    g.add(chipG);
    var nearDots = dots(false); nearDots.renderOrder = 4; spin.add(nearDots);
    var front = new T.Mesh(new T.SphereGeometry(1, 96, 64), glass(true)); front.renderOrder = 5; spin.add(front);
    hero.atm.renderOrder = 6; g.add(hero.atm);
    g.userData.dots = [farDots, nearDots];
    return g;
  }
  /* the AI globe's tunables: face, the spin in degrees (28 brings longitude 28 W, the Atlantic,
     to the front, so the Americas and Europe/Africa frame the chip); dot, the land dot size;
     hole, how far out (in clip space) the near dots stay quiet round the chip; glow, the core
     light; chip, its rotation and scale */
  var AIG = { face: 28, dot: .011, hole: .5, glow: .12, chip: [-.42, .34, .1], chipS: .88 };

  /* ---- Recovery ---- */
  /* a horizontal 0..1 ramp (emissive along a torus arc: dark at the tail, mint at the head) */
  function rampTex(rgb) {
    var c = canvasEl(256, 4), x = c.getContext("2d"), gr = x.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(.45, "rgb(" + rgb.map(function (v) { return Math.round(v * .25); }).join(",") + ")");
    gr.addColorStop(.9, "rgb(" + rgb.join(",") + ")"); gr.addColorStop(1, "rgb(" + rgb.join(",") + ")");
    x.fillStyle = gr; x.fillRect(0, 0, 256, 4);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding;
    return t;
  }
  /* a counter-clockwise "restore" arrow: a polished arc whose light gathers towards the head,
     a faceted chrome arrowhead. r radius, tube, arc (radians), rot (where the tail starts) */
  function restoreArrow(K, o) {
    var g = new T.Group();
    var arc = new T.Mesh(new T.TorusGeometry(o.r, o.tube, 24, 220, o.arc), K.mat({
      color: "#dfe6ee", metal: 1, rough: .1, envK: 1.25, emissive: "#ffffff", ei: o.glow == null ? .7 : o.glow, emap: rampTex([94, 234, 212]), fade: [0, .3]
    }));
    arc.renderOrder = 6;
    g.add(arc);
    /* the core of the arc: a hairline of mint light along its front */
    var line = new T.Mesh(new T.TorusGeometry(o.r, o.tube * .22, 8, 220, o.arc), K.mat({ color: "#000000", metal: 0, rough: 1, envK: 0, emissive: "#5eead4", ei: 1.1, toneMapped: false, fade: [.15, .75] }));
    line.position.z = o.tube * .86; line.renderOrder = 7; g.add(line);
    var hs = o.head;
    var tri = new T.Shape(); tri.moveTo(0, hs); tri.lineTo(hs * .74, -hs * .5); tri.lineTo(0, -hs * .22); tri.lineTo(-hs * .74, -hs * .5); tri.closePath();
    var hg = new T.ExtrudeGeometry(tri, { depth: o.tube * 1.2, bevelEnabled: true, bevelThickness: o.tube * .55, bevelSize: o.tube * .4, bevelSegments: 6, curveSegments: 1 });
    hg.center();
    var head = new T.Mesh(hg, [K.mat({ color: "#eef3f7", metal: 1, rough: .07, envK: 1.35, emissive: "#5eead4", ei: .32 }), K.chrome(.8, .08)]);
    head.position.set(o.r * Math.cos(o.arc), o.r * Math.sin(o.arc), 0);
    head.rotation.z = o.arc;
    head.renderOrder = 6;
    g.add(head);
    g.rotation.z = o.rot;
    return g;
  }
  /* Recovery: the CyberNet shield (chrome frame, smoked glass with the engraved lattice, a mint
     hairline) with a chrome check, ringed by a counter-clockwise restore arrow whose mint light
     gathers towards the head: protection, given back. (Chosen over a coin with the same arrow,
     which read as a button, and a pulse line in a glass shield, which read as health.) */
  function recovery(K) {
    var g = new T.Group(), lin = K.lin;
    var sh = new T.Group(); sh.scale.setScalar(.78); g.add(sh);
    var frameGeo = (function () {
      var s = hexPath(1); s.holes.push(hexPath(.83, new T.Path()));
      var e = new T.ExtrudeGeometry(s, { depth: .2, bevelEnabled: true, bevelThickness: .07, bevelSize: .05, bevelSegments: 6, curveSegments: 1 });
      e.translate(0, 0, -.1); return e;
    })();
    sh.add(new T.Mesh(frameGeo, K.chrome(.6, .1)));
    var face = new T.Mesh(new T.ShapeGeometry(hexPath(.83), 1), K.mat({
      color: "#0b1322", metal: .2, rough: .06, envK: 1.25, emissive: "#cfe9ff", ei: .14, emap: hexTex(), emapT: [1 / 2.4, 1 / 2.4, .5, .5],
      transparent: true, opacity: .9, side: T.DoubleSide, depthWrite: false
    }));
    face.position.z = -.03; face.renderOrder = 1; sh.add(face);
    var inlay = (function () { var s = hexPath(.8); s.holes.push(hexPath(.787, new T.Path())); var e = new T.ShapeGeometry(s, 1); e.translate(0, 0, .022); return e; })();
    sh.add(new T.Mesh(inlay, K.flat("#5eead4", .85, { side: T.DoubleSide })));
    /* the check: a rounded chrome stroke */
    var path = new T.CurvePath();
    path.add(new T.LineCurve3(new T.Vector3(-.36, .02, .06), new T.Vector3(-.1, -.24, .06)));
    path.add(new T.LineCurve3(new T.Vector3(-.1, -.24, .06), new T.Vector3(.4, .3, .06)));
    var ck = new T.Mesh(new T.TubeGeometry(path, 64, .07, 20, false), K.mat({ color: "#e3e9f0", metal: 1, rough: .16, envK: 1.25 }));
    sh.add(ck);
    [[-.36, .02], [.4, .3], [-.1, -.24]].forEach(function (p) { var b = new T.Mesh(new T.SphereGeometry(.07, 20, 14), ck.material); b.position.set(p[0], p[1], .06); sh.add(b); });
    g.add(restoreArrow(K, { r: 1.36, tube: .055, arc: Math.PI * 1.62, rot: Math.PI * .66, head: .2 }));
    return g;
  }
  /* ---- The AI core (Home, "What CyberNet AI does", v4.2): a highly detailed processor in the
     spirit of the owner's motion reference. A dark PCB with fine traces and vias, a ring of
     ceramic capacitors, a dark anodised package with fine champagne gull-wing leads (26 a side),
     a chrome bezel round a glass window, and under it the die: compute tiles, teal routing and,
     at its heart, the CyberNet shield drawn in light (the core the globe protects). A smoked
     glass lid with a chrome rim floats just above the window. Layers (same camera, so they
     stack exactly in the page): "base" (everything but the lid), "lid" (the lid alone). The
     page adds the energy plume (canvas particles) and the scroll motion. ---- */
  function hexPts(cx, cy, s) {
    return [[12, 2], [21, 6], [20, 15], [12, 24], [4, 15], [3, 6]].map(function (p) { return [cx + (p[0] - 12) * s, cy + (p[1] - 13) * s]; });
  }
  function polyPath(x, pts) { x.beginPath(); pts.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath(); }
  function coreDieTex() {
    var n = 1024, c = canvasEl(n), x = c.getContext("2d"), r = rng(77), i, j;
    x.fillStyle = "#02050a"; x.fillRect(0, 0, n, n);
    /* compute tiles: a 14 x 14 grid of blocks, each with fine internal rows (dim slate) */
    var m = 14, pad = 46, cell = (n - pad * 2) / m;
    for (i = 0; i < m; i++) for (j = 0; j < m; j++) {
      var x0 = pad + i * cell, y0 = pad + j * cell, dc = Math.hypot(i - (m - 1) / 2, j - (m - 1) / 2) / (m / 2);
      if (dc < .42) continue; /* the core's clearing */
      var lit = r() < .12;
      x.fillStyle = lit ? "rgba(34,211,238,.2)" : "rgba(120,140,165,.12)";
      x.fillRect(x0 + 3, y0 + 3, cell - 6, cell - 6);
      x.strokeStyle = lit ? "rgba(103,232,249,.55)" : "rgba(150,170,195,.28)"; x.lineWidth = 1.4;
      x.strokeRect(x0 + 3.5, y0 + 3.5, cell - 7, cell - 7);
      x.fillStyle = lit ? "rgba(165,243,252,.45)" : "rgba(170,188,210,.22)";
      var rows = 3 + (r() * 4 | 0);
      for (var k = 0; k < rows; k++) x.fillRect(x0 + 9, y0 + 9 + k * ((cell - 18) / rows), (cell - 18) * (.4 + r() * .6), 1.6);
    }
    /* routing: teal Manhattan traces from the core out to the die edge */
    x.lineCap = "round"; x.lineJoin = "round";
    for (i = 0; i < 64; i++) {
      var a = i / 64 * TAU + r() * .05, rr = 150 + r() * 30, px = n / 2 + Math.cos(a) * rr, py = n / 2 + Math.sin(a) * rr;
      var ex = n / 2 + Math.cos(a) * (n * .47), ey = n / 2 + Math.sin(a) * (n * .47);
      x.strokeStyle = r() < .3 ? "rgba(103,232,249,.8)" : "rgba(34,211,238,.38)"; x.lineWidth = r() < .3 ? 2.2 : 1.6;
      x.beginPath(); x.moveTo(px, py);
      if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) { var mx = (px + ex) / 2; x.lineTo(mx, py); x.lineTo(mx + (ey - py) * .0, ey); x.lineTo(ex, ey); }
      else { var my = (py + ey) / 2; x.lineTo(px, my); x.lineTo(ex, my + 0); x.lineTo(ex, ey); }
      x.stroke();
    }
    /* the core: the CyberNet shield in light, with concentric outlines and a bright heart */
    var cx = n / 2, cy = n / 2 + 6;
    var halo = x.createRadialGradient(cx, cy, 0, cx, cy, 300);
    halo.addColorStop(0, "rgba(230,251,255,.85)"); halo.addColorStop(.16, "rgba(165,243,252,.5)");
    halo.addColorStop(.42, "rgba(34,211,238,.24)"); halo.addColorStop(1, "rgba(34,211,238,0)");
    x.fillStyle = halo; x.fillRect(0, 0, n, n);
    [[15, .45, 2.4], [12, .7, 3], [9.2, 1, 3.6]].forEach(function (h) {
      polyPath(x, hexPts(cx, cy, h[0])); x.strokeStyle = "rgba(165,243,252," + h[1] + ")"; x.lineWidth = h[2]; x.stroke();
    });
    polyPath(x, hexPts(cx, cy, 6.6));
    var fill = x.createRadialGradient(cx, cy - 14, 0, cx, cy, 100);
    fill.addColorStop(0, "#ffffff"); fill.addColorStop(.5, "#c9f7fe"); fill.addColorStop(1, "#5ee6f8");
    x.fillStyle = fill; x.fill();
    /* the die's sealed edge */
    x.strokeStyle = "rgba(103,232,249,.4)"; x.lineWidth = 3; x.strokeRect(22, 22, n - 44, n - 44);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function coreBoardTex() {
    var n = 1024, c = canvasEl(n), x = c.getContext("2d"), r = rng(91), i, s, k;
    x.fillStyle = "#000"; x.fillRect(0, 0, n, n);
    /* a faint dot grid */
    x.fillStyle = "rgba(150,170,195,.08)";
    for (i = 8; i < n; i += 16) for (k = 8; k < n; k += 16) x.fillRect(i, k, 1.6, 1.6);
    x.lineCap = "round"; x.lineJoin = "round";
    /* per side: the lead lands, then traces fanning out to the edge with vias */
    for (s = 0; s < 4; s++) {
      x.save(); x.translate(n / 2, n / 2); x.rotate(s * Math.PI / 2); x.translate(-n / 2, -n / 2);
      for (k = 0; k < 26; k++) {
        var u = n / 2 + (k - 12.5) * (n * .6 * .86 / 26);
        x.fillStyle = "rgba(205,215,228,.34)"; x.fillRect(u - 4, n * .105, 8, n * .07);  /* land */
        var y1 = n * .1, kink = (k - 12.5) * 4.2 + (r() - .5) * 6;
        x.strokeStyle = (k % 7 === 3) ? "rgba(103,232,249,.5)" : "rgba(170,188,210,.22)"; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(u, y1); x.lineTo(u, y1 - 22); x.lineTo(u + kink, y1 - 22 - Math.abs(kink)); x.lineTo(u + kink, 8); x.stroke();
        if (k % 3 === 1) { x.fillStyle = "rgba(220,228,238,.42)"; x.beginPath(); x.arc(u + kink, y1 - 34 - Math.abs(kink), 4.2, 0, TAU); x.fill(); x.fillStyle = "#000"; x.beginPath(); x.arc(u + kink, y1 - 34 - Math.abs(kink), 1.8, 0, TAU); x.fill(); }
      }
      /* silkscreen: corner marks */
      x.strokeStyle = "rgba(200,210,224,.3)"; x.lineWidth = 2;
      x.beginPath(); x.moveTo(n * .2, n * .24); x.lineTo(n * .2, n * .2); x.lineTo(n * .24, n * .2); x.stroke();
      x.restore();
    }
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  /* the package's top face: a fine machined border, a pin-1 dot and a small etched line of type */
  function corePkgTex() {
    var n = 1024, c = canvasEl(n), x = c.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, n, n);
    x.strokeStyle = "rgba(190,200,214,.16)"; x.lineWidth = 2; x.strokeRect(18, 18, n - 36, n - 36);
    x.fillStyle = "rgba(200,210,222,.5)"; x.beginPath(); x.arc(52, n - 52, 9, 0, TAU); x.fill();
    x.fillStyle = "rgba(190,200,214,.34)"; x.font = "500 26px 'Cascadia Mono', Consolas, 'Courier New', monospace";
    x.textBaseline = "middle"; x.fillText("CYBERNET AI  ·  CORE 01", 84, n - 52);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function coreChip(K, part) {
    var g = new T.Group(), lin = K.lin;
    var BW = 2.5, PW = 1.5, LEADS = 26;
    var boardTop = .03, pkgH = .15, pkgTop = boardTop + pkgH, winW = 1.02;
    var showBase = part !== "lid", showLid = part !== "base";
    var CORE_Z = pkgTop + .003;
    g.userData.core = new T.Vector3(0, 0, CORE_Z);
    g.userData.lidZ = pkgTop + .06;
    if (showBase) {
      /* the board */
      var board = new T.Mesh(
        new T.ExtrudeGeometry(roundRect(BW, BW, .12), { depth: .03, bevelEnabled: true, bevelThickness: .015, bevelSize: .015, bevelSegments: 3, curveSegments: 10 }),
        K.mat({ color: "#121821", metal: .55, rough: .36, envK: 1 })
      );
      board.position.z = -.015; g.add(board);
      var bface = new T.Mesh(new T.PlaneGeometry(BW - .04, BW - .04), K.mat({ color: "#0b0f15", metal: .4, rough: .3, envK: .9, emissive: "#ffffff", ei: .85, emap: coreBoardTex() }));
      bface.position.z = boardTop + .0005; g.add(bface);
      /* ceramic capacitors round the package */
      var capBody = [], capEnd = [], q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), one = new T.Vector3(1, 1, 1);
      var rc = rng(5);
      for (var sd = 0; sd < 4; sd++) {
        for (var ci = 0; ci < 9; ci++) {
          var along = -.92 + ci * .23 + (rc() - .5) * .03, out = 1.09 + (ci % 2) * .055, a0 = sd * Math.PI / 2;
          var ca = Math.cos(a0), sa = Math.sin(a0);
          v.set(ca * out - sa * along, sa * out + ca * along, boardTop + .016);
          e.set(0, 0, a0); q.setFromEuler(e);
          capBody.push(new T.Matrix4().compose(v.clone(), q.clone(), one));
          [-1, 1].forEach(function (k) {
            var w = new T.Vector3(ca * (out + k * .036), sa * (out + k * .036), 0).add(new T.Vector3(-sa * along, ca * along, boardTop + .016));
            capEnd.push(new T.Matrix4().compose(w, q.clone(), one));
          });
        }
      }
      g.add(new T.Mesh(K.merge(new T.BoxGeometry(.05, .045, .03), capBody), K.mat({ color: "#2e2b28", metal: .1, rough: .5, envK: .7 })));
      g.add(new T.Mesh(K.merge(new T.BoxGeometry(.022, .047, .033), capEnd), K.mat({ color: "#8f99a5", metal: 1, rough: .3, envK: .75 })));
      /* the package: dark anodised metal with a soft bevel */
      var pkg = new T.Mesh(
        new T.ExtrudeGeometry(roundRect(PW, PW, .07), { depth: pkgH - .05, bevelEnabled: true, bevelThickness: .025, bevelSize: .03, bevelSegments: 5, curveSegments: 10 }),
        K.mat({ color: "#2b323c", metal: .92, rough: .26, envK: 1.25 })
      );
      pkg.position.z = boardTop + .025; g.add(pkg);
      var ptop = new T.Mesh(new T.PlaneGeometry(PW - .07, PW - .07), K.mat({ color: "#2b323c", metal: .92, rough: .24, envK: 1.25, emissive: "#ffffff", ei: .6, emap: corePkgTex() }));
      ptop.position.z = pkgTop + .0006; g.add(ptop);
      /* the leads: champagne gull-wings (a shoulder out of the package, a foot on the land) */
      var sh = [], ft = [];
      for (var s2 = 0; s2 < 4; s2++) {
        for (var k2 = 0; k2 < LEADS; k2++) {
          var t2 = (k2 - (LEADS - 1) / 2) * (PW * .86 / LEADS), a2 = s2 * Math.PI / 2, c2 = Math.cos(a2), s3 = Math.sin(a2);
          e.set(0, 0, a2 + Math.PI / 2); q.setFromEuler(e);
          var shoulder = new T.Matrix4().compose(new T.Vector3(c2 * (PW / 2 + .04) - s3 * t2, s3 * (PW / 2 + .04) + c2 * t2, boardTop + .07), q.clone(), one);
          shoulder.multiply(new T.Matrix4().makeRotationX(-.0));
          sh.push(shoulder);
          ft.push(new T.Matrix4().compose(new T.Vector3(c2 * (PW / 2 + .135) - s3 * t2, s3 * (PW / 2 + .135) + c2 * t2, boardTop + .012), q.clone(), one));
        }
      }
      var gold = K.mat({ color: "#c9b48c", metal: 1, rough: .2, envK: 1.25 });
      /* shoulder: runs out and down (a sloped box); foot: flat on the board */
      var shGeo = new T.BoxGeometry(.024, .11, .012); shGeo.rotateX(.62);
      g.add(new T.Mesh(K.merge(shGeo, sh.map(function (m) { return m.clone().multiply(new T.Matrix4().makeTranslation(0, -.02, -.012)); })), gold));
      g.add(new T.Mesh(K.merge(new T.BoxGeometry(.024, .085, .01), ft), gold));
      /* the chrome bezel round the window */
      var bz = roundRect(winW + .1, winW + .1, .055); bz.holes.push(roundRect(winW, winW, .035, new T.Path()));
      var bezel = new T.Mesh(new T.ExtrudeGeometry(bz, { depth: .012, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 4, curveSegments: 10 }), K.mat({ color: "#9aa4b0", metal: 1, rough: .2, envK: .85 }));
      bezel.position.z = pkgTop - .004; g.add(bezel);
      /* the window well and the die */
      var well = new T.Mesh(new T.PlaneGeometry(winW, winW), K.mat({ color: "#03060b", metal: .5, rough: .5, envK: .35 }));
      well.position.z = pkgTop + .001; g.add(well);
      var die = new T.Mesh(new T.PlaneGeometry(.92, .92), K.mat({ color: "#05080d", metal: .5, rough: .18, envK: .7, emissive: "#ffffff", ei: 1.15, emap: coreDieTex(), toneMapped: false }));
      die.position.z = CORE_Z; g.add(die);
      /* the core's light: a soft cyan bloom and a small white heart just over the die */
      var bloom = K.sprite("#22d3ee", .5, 1.55); bloom.position.set(0, 0, CORE_Z + .03); bloom.renderOrder = 5; g.add(bloom);
      var heart = K.sprite("#e6fbff", .6, .22); heart.position.set(0, 0, CORE_Z + .04); heart.renderOrder = 6; g.add(heart);
    }
    if (showLid) {
      /* the lid: smoked glass with a chrome rim, floating just above the window */
      var lz = g.userData.lidZ;
      var glass = new T.Mesh(
        new T.ExtrudeGeometry(roundRect(1.06, 1.06, .045), { depth: .02, bevelEnabled: true, bevelThickness: .01, bevelSize: .01, bevelSegments: 3, curveSegments: 10 }),
        K.mat({ color: "#7d8fa3", metal: .2, rough: .04, envK: .55, transparent: true, opacity: .1, depthWrite: false })
      );
      glass.position.z = lz; glass.renderOrder = 8; g.add(glass);
      var rim = roundRect(1.08, 1.08, .05); rim.holes.push(roundRect(1.03, 1.03, .035, new T.Path()));
      var rimM = new T.Mesh(new T.ExtrudeGeometry(rim, { depth: .01, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 3, curveSegments: 10 }), K.mat({ color: "#b3bcc7", metal: 1, rough: .14, envK: .9 }));
      rimM.position.z = lz + .004; rimM.renderOrder = 9; g.add(rimM);
    }
    return g;
  }
  /* framing: [builder, rotation x/y/z, camera distance] (fov 24) */
  var POSE = {
    core: [coreChip, [-1.0, 0, .64], 8.6],
    shield: [shield, [.1, -.42, .04], 7.4],
    lock: [padlock, [.16, -.5, .05], 5.6],
    chip: [chip, [-.72, .1, .42], 5.4],
    cube: [cube, [.52, .72, .1], 5.4],
    orb: [orb, [0, 0, 0], 8.2],
    ring: [ring, [.42, -.36, .1], 7.6],
    aiglobe: [aiGlobe, [0, 0, 0], 5.7],
    recovery: [recovery, [.1, -.36, .04], 7.6]
  };
  return { makeStudio: makeStudio, POSE: POSE };
}

// ---------------------------------------------------------------- the render page
const PAGE = String.raw`<!doctype html><html><head><meta charset="utf-8"><title>render-3d</title>
<style>html,body{margin:0;background:transparent}</style></head><body>
<script src="/three.min.js"></script><script src="/kit.js"></script><script src="/models.js"></script>
<script>
"use strict";
var T = window.THREE, H = window.CNHero3D, M = window.__models(T, H);
function canvas(n, h) { var c = document.createElement("canvas"); c.width = n; c.height = h || n; return c; }
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
function sprite(name, n, part, meta) {
  var cv = canvas(n);
  var R = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  R.setClearColor(0x000000, 0); R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.NoToneMapping; R.debug.checkShaderErrors = true;
  R.setPixelRatio(1); R.setSize(n, n, false);
  var K = M.makeStudio(R), p = M.POSE[name], scene = new T.Scene();
  var obj = p[0](K, part); obj.rotation.set(p[1][0], p[1][1], p[1][2]);
  if (meta && obj.userData.core) {
    /* where the core lands in the image (0..1 from the top left), for the page's energy plume */
    var cam0 = new T.PerspectiveCamera(24, 1, .1, 60); cam0.position.set(0, 0, p[2]); cam0.lookAt(0, 0, 0); cam0.updateMatrixWorld();
    obj.updateMatrixWorld(true);
    var c = obj.userData.core.clone().applyMatrix4(obj.matrixWorld).project(cam0);
    var l = new T.Vector3(0, 0, obj.userData.lidZ).applyMatrix4(obj.matrixWorld).project(cam0);
    meta.core = [+((c.x + 1) / 2).toFixed(4), +((1 - c.y) / 2).toFixed(4)];
    meta.lid = [+((l.x + 1) / 2).toFixed(4), +((1 - l.y) / 2).toFixed(4)];
    /* the chip's own x and y axes at the core (0.5 world units each), projected: the page draws
       its scan rings flat on the chip with these */
    [["u", 0.5, 0], ["v", 0, 0.5]].forEach(function (a) {
      var q = obj.userData.core.clone().add(new T.Vector3(a[1], a[2], 0)).applyMatrix4(obj.matrixWorld).project(cam0);
      meta[a[0]] = [+(((q.x + 1) / 2) - meta.core[0]).toFixed(4), +(((1 - q.y) / 2) - meta.core[1]).toFixed(4)];
    });
  }
  /* point sprites (the AI globe's land dots) are sized in pixels: scale them to this canvas */
  (obj.userData.dots || []).forEach(function (d) { d.userData.u.uScale.value = n / (2 * Math.tan(12 * Math.PI / 180)); d.userData.u.uMin.value = n / 640; });
  scene.add(obj);
  var cam = new T.PerspectiveCamera(24, 1, .1, 60); cam.position.set(0, 0, p[2]); cam.lookAt(0, 0, 0);
  R.render(scene, cam);
  return cv;
}

window.__render = function (name) {
  var out = [];
  if (name === "hero") {
    var cv = canvas(2400);
    var G = H.scene(T, cv, { snapshot: true, debug: true });
    G.size(1200, 1200, 2);
    G.layout({ s: 1200, sx: 0, sy: 0, mode: "side" });
    G.seek(H.T0);
    G.draw();
    out.push(["hero-globe.webp", webp(scaled(cv, 1200), .8)]);
    out.push(["hero-globe-800.webp", webp(scaled(cv, 800), .8)]);
    out.push(["hero-globe-480.webp", webp(scaled(cv, 480), .8)]);
    G.dispose();
    return out;
  }
  if (name === "core") {
    /* two layers from one camera (base, lid), 1200 and 720 wide, rendered at 2x and scaled */
    var meta = {}, base = sprite("core", 2400, "base", meta), lid = sprite("core", 2400, "lid");
    window.__coreMeta = meta;
    out.push(["core-chip.webp", webp(scaled(base, 1200), .86)]);
    out.push(["core-chip-720.webp", webp(scaled(base, 720), .86)]);
    out.push(["core-lid.webp", webp(scaled(lid, 1200), .86)]);
    out.push(["core-lid-720.webp", webp(scaled(lid, 720), .86)]);
    if (window.__preview) { var pv = canvas(1200), px = pv.getContext("2d"); px.fillStyle = "#060a14"; px.fillRect(0, 0, 1200, 1200); px.drawImage(scaled(base, 1200), 0, 0); px.drawImage(scaled(lid, 1200), 0, 0); window.__corePreview = pv.toDataURL("image/jpeg", .92); }
    return out;
  }
  var size = name === "shield" ? 640 : 512;
  var file = { aiglobe: "ai-globe", recovery: "recovery" }[name] || name;
  var src = sprite(name, size * 2);
  out.push([file + ".webp", webp(scaled(src, size), .9)]);
  if (name === "shield" || name === "aiglobe" || name === "recovery") out.push([file + "-320.webp", webp(scaled(src, 320), .9)]);
  return out;
};

/* land bits: rasterise the Natural Earth land polygons (equirectangular), then sample one
   bit per point of the kit's latitude-row lattice */
window.__land = async function () {
  var topo = await (await fetch("/land.json")).json();
  var tf = topo.transform;
  var arcs = topo.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { x += p[0]; y += p[1]; return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]; }); });
  function ringPts(ids) { var pts = []; ids.forEach(function (id) { var a = id < 0 ? arcs[~id].slice().reverse() : arcs[id]; a.forEach(function (p, i) { if (i || !pts.length) pts.push(p); }); }); return pts; }
  var W = 4096, Hh = 2048, c = canvas(W, Hh), x = c.getContext("2d"); x.fillStyle = "#fff";
  topo.objects.land.geometries.forEach(function (g) {
    var polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
    polys.forEach(function (poly) {
      x.beginPath();
      poly.forEach(function (r) { ringPts(r).forEach(function (p, i) { var px = (p[0] + 180) / 360 * W, py = (90 - p[1]) / 180 * Hh; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.closePath(); });
      x.fill("evenodd");
    });
  });
  var img = x.getImageData(0, 0, W, Hh).data, L = H.lattice(H.LAT_STEP), N = L.length / 2, bytes = new Uint8Array(Math.ceil(N / 8)), count = 0;
  for (var i = 0; i < N; i++) {
    var lat = L[i * 2], lon = L[i * 2 + 1];
    var px = Math.min(W - 1, Math.floor((lon + 180) / 360 * W)), py = Math.min(Hh - 1, Math.floor((90 - lat) / 180 * Hh));
    if (img[(py * W + px) * 4 + 3] > 127) { bytes[i >> 3] |= 1 << (i & 7); count++; }
  }
  var bin = ""; for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
  var prev = canvas(720, 360); prev.getContext("2d").drawImage(c, 0, 0, 720, 360);
  return { b64: btoa(bin), count: count, n: N, preview: prev.toDataURL("image/png") };
};
/* a filmstrip of the globe at several times, for review (navy behind it) */
window.__strip = function (times, n, lite) {
  n = n || 600;
  var cv = canvas(n), G = H.scene(T, cv, { snapshot: true, debug: true, lite: !!lite }), out = canvas(n * times.length, n);
  var x = out.getContext("2d");
  x.fillStyle = "#060a14"; x.fillRect(0, 0, out.width, n);
  G.size(n, n, 1); G.layout({ s: n, sx: 0, sy: 0, mode: "side" }); G.seek(H.T0);
  var t = H.T0;
  times.forEach(function (tt, i) { while (t < tt - 1e-6) { var d = Math.min(1 / 30, tt - t); G.frame(d); t += d; } G.draw(); x.drawImage(cv, i * n, 0); });
  G.dispose();
  return out.toDataURL("image/jpeg", .9);
};
/* the whole stage (globe and the flow lines) on the navy ground, for review */
window.__stage = function (w, h, mode, tt, lite) {
  var cv = canvas(w, h), G = H.scene(T, cv, { snapshot: true, debug: true, lite: !!lite, flow: true }), out = canvas(w, h);
  G.size(w, h, 1);
  var s = mode === "stack" ? Math.min(w * 1.12, 640) : Math.max(520, Math.min(w * .58, 820));
  var sx = mode === "stack" ? (w - s) / 2 : w - s * .9, sy = mode === "stack" ? -s * .075 : (h - s) / 2;
  G.layout({ s: s, sx: sx, sy: sy, mode: mode, qx: mode === "stack" ? 16 : w * .05, qy: mode === "stack" ? s * .7 : h * .25, qw: mode === "stack" ? w - 32 : w * .42, qh: h * .5 });
  G.seek(H.T0);
  var t = H.T0; while (t < tt - 1e-6) { var d = Math.min(1 / 30, tt - t); G.frame(d); t += d; }
  G.draw();
  var x = out.getContext("2d");
  var g = x.createRadialGradient(sx + s / 2, sy + s / 2, 0, sx + s / 2, sy + s / 2, Math.max(w, h));
  g.addColorStop(0, "#0b1526"); g.addColorStop(.5, "#070d19"); g.addColorStop(1, "#05080f");
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.drawImage(cv, 0, 0);
  G.dispose();
  return out.toDataURL("image/jpeg", .92);
};
window.__ready = true;
</script></body></html>`;

// ---------------------------------------------------------------- serve + drive Edge
const MODELS_JS = `window.__models = ${models.toString()};`;
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  try {
    if (p === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    if (p === "/three.min.js") { res.setHeader("Content-Type", "text/javascript"); res.end(three); return; }
    if (p === "/kit.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(KIT_RW ? KIT_MIN : KIT)); return; }
    if (p === "/models.js") { res.setHeader("Content-Type", "text/javascript"); res.end(MODELS_JS); return; }
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
  else if (m.method === "Runtime.consoleAPICalled" && /error|warn/.test(m.params.type)) logs.push(`[console.${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 600));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const jpg = async (file, url) => { await writeFile(path.resolve(file), Buffer.from(url.split(",")[1], "base64")); };

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 100; i++) { await sleep(150); try { if (await evaluate("window.__ready === true")) break; } catch {} }
  if (!(await evaluate("window.__ready === true"))) throw new Error("render page did not start: " + logs.join(" | "));
  await mkdir(OUT, { recursive: true });
  if (sharp) await evaluate("window.__png = true");

  if (args.land) {
    const r = await evaluate("window.__land()");
    let next = kitSrc.replace(/var LAND = "[^"]*";/, `var LAND = "${r.b64}";`).replace(/var N_LAND = \d+;/, `var N_LAND = ${r.n};`);
    if (!next.includes(r.b64)) throw new Error("LAND line not found in hero3d-kit.js");
    if (next !== kitSrc) await writeFile(KIT, next);
    await minify();
    await writeFile(path.join(CACHE, "land-preview.png"), Buffer.from(r.preview.split(",")[1], "base64"));
    console.log(`[land] ${r.count} land points of ${r.n}, ${r.b64.length} chars -> public/ui/3d/hero3d-kit.js (preview: ${path.join(CACHE, "land-preview.png")})`);
    await evaluate("location.reload()").catch(() => {});
    await sleep(400);
    for (let i = 0; i < 100; i++) { await sleep(150); try { if (await evaluate("window.__ready === true")) break; } catch {} }
  }
  if (typeof args.strip === "string") {
    const times = String(args.times || "9,9.5,10,10.5,11,12").split(",").map(Number);
    await jpg(args.strip, await evaluate(`window.__strip(${JSON.stringify(times)}, ${Number(args.n) || 520}, ${args.lite ? "true" : "false"})`));
    console.log("[strip]", args.strip, times.join(" "));
  }
  if (typeof args.stage === "string") {
    const w = Number(args.w) || 1360, h = Number(args.h) || 780, t = Number(args.t) || 9;
    await jpg(args.stage, await evaluate(`window.__stage(${w}, ${h}, ${JSON.stringify(args.mode === "stack" ? "stack" : "side")}, ${t}, ${args.lite ? "true" : "false"})`));
    console.log("[stage]", args.stage, `${w}x${h}`, args.mode || "side", "t=" + t);
  }
  if (typeof args.preview === "string") await evaluate("window.__preview = true");
  for (const name of ONLY) {
    const files = await evaluate(`window.__render(${JSON.stringify(name)})`);
    if (name === "core") {
      console.log("[3d] core position in the image (x, y from the top left):", JSON.stringify(await evaluate("window.__coreMeta")));
      if (typeof args.preview === "string") await jpg(args.preview, await evaluate("window.__corePreview"));
    }
    for (const [file, [url, q]] of files) {
      let buf = Buffer.from(url.split(",")[1], "base64");
      if (sharp) buf = await sharp(buf).webp({ quality: Math.round(q * 100), alphaQuality: name === "hero" ? 80 : 85, effort: 6, smartSubsample: true }).toBuffer();
      else if (!url.startsWith("data:image/webp")) throw new Error(`${file}: the browser did not encode WebP`);
      await writeFile(path.join(OUT, file), buf);
      console.log(`[3d] ${file}  ${(buf.length / 1024).toFixed(1)} KB`);
    }
  }
  if (logs.length) console.log(logs.join("\n"));
  if (KIT_RW) await stamp();
} finally { try { ws.close(); } catch {} cleanup(); }
