/* "Soffit" animated WebGL2 gradient (getlayers.ai, free gradient, commercial licence; owner bought access,
   18 Nov 2026), vendored here: no CDN, no library. The background of the Home page's "For teams" band
   only (index.html #for-teams, [data-cn-soffit]); never the hero or Quick Scan. Web only: this file is
   loaded by a data-web-only script tag, so the iPhone app never has it.

   The fragment shader and the CONFIG keys are the prompt's, verbatim (in the shader's comments, the two
   non-ASCII characters are written "--" and "x": WebGL compilers may refuse non-ASCII source). Only CONFIG's five colours are
   changed (the prompt's own rule: recolour through CONFIG, never the shader), from purple to the brand
   palette: navy ink #060a14 background, deep blues, cyan #22d3ee, a white highlight the shader uses
   sparingly. The engine is the prompt's, adapted to a band instead of a full-screen page:
   - size and pointer come from the band's own box, not the window;
   - no WebGL2, a weak device, Save-Data, reduced motion or the site's Pause motion (html.cn-still):
     nothing is created and the band keeps its static CSS gradient (63-gate.css);
   - it starts only when the band comes within 100 px of the viewport (then at the next idle moment), and the
     frame loop really stops (no requestAnimationFrame at all) while the band is off-screen, the tab is hidden,
     the page is scrolling or the phone menu sheet covers it;
   - device pixel ratio capped at 1 (CONFIG.maxDpr), as the prompt says;
   - a lost WebGL context, a compile error or a failed first frame: the canvas is removed, the CSS
     gradient stays. Nothing is ever thrown to the page.
   Plain ES5 syntax on purpose (old Android WebViews run this file as it is). */
(function (win, doc) {
  "use strict";
  var CONFIG = {
    "bgColor": "#060a14",
    "colorA": "#0a1d3f",
    "colorB": "#0f4c8a",
    "colorC": "#22d3ee",
    "colorD": "#ffffff",
    "scale": 0.2,
    "speed": 0.33,
    "tilt": -1.3,
    "rock": 0.11,
    "horizon": -0.52,
    "breathe": 0.09,
    "spread": 1.3,
    "curve": 2.6,
    "direct": 0.72,
    "bounce": 0.06,
    "bounceCurve": 1.7,
    "spillCentre": 0.04,
    "spillWidth": 0.2,
    "spillFloor": 0.16,
    "amount": 0.22,
    "warp": 1.1,
    "warpScale": 0.72,
    "flow": 0.15,
    "roughness": 0.52,
    "lacunarity": 2.05,
    "motes": 0.03,
    "moteScale": 7,
    "ambient": 0.04,
    "contrast": 1.6,
    "midpoint": 0.57,
    "sink": 0.26,
    "glow": 0.34,
    "grain": 0,
    "grainAnim": 0,
    "dither": 1.2,
    "vignette": 0.44,
    "steer": 0.22,
    "lift": 0.2,
    "sweep": 0.3,
    "cursor": 1,
    "parallax": 0.002,
    "maxDpr": 1
  };

  var VERT = "#version 300 es\n" +
    "void main() {\n" +
    "  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n" +
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n" +
    "}";

  /* The fragment shader from the prompt, verbatim. */
  var FRAG = [
    "#version 300 es",
    "precision highp float;",
    "out vec4 fragColor;",
    "",
    "uniform vec2  iResolution;",
    "uniform float iTime;",
    "uniform vec2  iMouse;          // aspect-corrected units, same space as uv",
    "uniform float uScale;          // zoom of the whole picture -- uv and the pointer together",
    "",
    "uniform vec3  uBg, uColorA, uColorB, uColorC, uColorD;",
    "uniform float uSpeed, uTilt, uRock, uHorizon, uBreathe, uSpread, uCurve, uDirect;",
    "uniform float uBounce, uBounceCurve;",
    "uniform float uSpillCentre, uSpillWidth, uSpillFloor;",
    "uniform float uAmount, uWarp, uWarpScale, uFlow, uRoughness, uLacunarity, uMotes, uMoteScale;",
    "uniform float uAmbient, uContrast, uMidpoint, uSink, uGlow;",
    "uniform float uGrain, uDither, uVignette;",
    "uniform float uSteer, uLift, uSweep, uParallax;",
    "",
    "#define OCTAVES 4",
    "",
    "vec2 hash2(vec2 p) {",
    "  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));",
    "  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);",
    "}",
    "",
    "float snoise(vec2 p) {",
    "  const float K1 = 0.366025404, K2 = 0.211324865;",
    "  vec2 i = floor(p + (p.x + p.y) * K1);",
    "  vec2 a = p - i + (i.x + i.y) * K2;",
    "  float m = step(a.y, a.x);",
    "  vec2 o = vec2(m, 1.0 - m);",
    "  vec2 b = a - o + K2;",
    "  vec2 c = a - 1.0 + 2.0 * K2;",
    "  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);",
    "  vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));",
    "  return dot(n, vec3(70.0));",
    "}",
    "",
    "float fbm(vec2 p) {",
    "  float v = 0.0, amp = 0.5;",
    "  for (int i = 0; i < OCTAVES; i++) {",
    "    v += amp * snoise(p);",
    "    p *= uLacunarity;",
    "    amp *= uRoughness;",
    "  }",
    "  return v;",
    "}",
    "",
    "vec3 ramp4(float t) {",
    "  vec3 c = mix(uColorA, uColorB, smoothstep(0.00, 0.36, t));",
    "  c = mix(c, uColorC, smoothstep(0.32, 0.70, t));",
    "  c = mix(c, uColorD, smoothstep(0.66, 1.00, t));",
    "  return c;",
    "}",
    "",
    "float triDither(vec2 fc) {",
    "  float a = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);",
    "  float b = fract(sin(dot(fc + 17.0, vec2(12.9898, 78.233))) * 43758.5453);",
    "  return (a + b - 1.0) / 255.0;",
    "}",
    "",
    "",
    "// ---- house grain. ONE look across the collection: an integer hash (no sin() streaks),",
    "// triangular so it reads as film rather than static, weighted into the midtones so it",
    "// never crusts a black or a white. Static by default; uGrainAnim re-seeds it 24x/s.",
    "uniform float uGrainAnim;",
    "float houseGrain(vec2 fc) {",
    "  uvec2 q = uvec2(fc) * uvec2(1597334677u, 3812015801u)",
    "          + uint(floor(iTime * 24.0 * uGrainAnim)) * 2654435769u;",
    "  uint n = q.x ^ q.y; n = n * 1664525u + 1013904223u; n ^= n >> 16u; n *= 2246822519u; n ^= n >> 13u;",
    "  float a = float(n & 0xffffu) / 65535.0;",
    "  n *= 3266489917u; n ^= n >> 16u;",
    "  float b = float(n & 0xffffu) / 65535.0;",
    "  return a + b - 1.0;",
    "}",
    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;",
    "  uv *= uScale;                             // scale: zoom of the whole picture",
    "  vec2 iM = iMouse * uScale;                // the pointer, in the same zoomed space",
    "  float t = iTime * uSpeed;",
    "",
    "  vec2 p = uv - iM * uParallax;",
    "",
    "  // THE LIGHT HAS A DIRECTION and the picture is that direction, not a pattern. Everything",
    "  // below is a function of ONE number: how far along the light axis this pixel is. The noise",
    "  // is only allowed to perturb that number, which is the difference between a lit surface",
    "  // and a noise field with a nice palette on it.",
    "  float tilt = uTilt + sin(t * 0.13) * uRock + iM.x * uSteer;",
    "  vec2 dir = vec2(cos(tilt), sin(tilt));",
    "  float axis = dot(p, dir);",
    "  float across = dot(p, vec2(-dir.y, dir.x));",
    "",
    "  // the air the light crosses, as a domain-warped field. Held to uAmount: past about a third",
    "  // it stops perturbing the light and starts being the subject, and the direction dissolves.",
    "  vec2 q = vec2(fbm(p * uWarpScale + vec2(0.0, t * uFlow)),",
    "                fbm(p * uWarpScale + vec2(5.2, 1.3) - t * uFlow * 0.7));",
    "  float air = fbm(p + uWarp * q + vec2(t * 0.12, -t * 0.09)) * 0.5 + 0.5;",
    "",
    "  float horizon = uHorizon + sin(t * 0.09 + 2.1) * uBreathe - iM.y * uLift;",
    "  float alt = clamp(0.5 + (axis - horizon) * uSpread + (air - 0.5) * uAmount, 0.0, 1.0);",
    "",
    "  // THE OPENING IS NOT INFINITELY WIDE. A band across the light axis -- never a disc -- so the",
    "  // brightest part of the frame sits off to one side and the composition has a long empty end.",
    "  float ac = (across - uSpillCentre - iM.x * uSweep) / max(0.05, uSpillWidth);",
    "  float spill = mix(uSpillFloor, 1.0, exp(-ac * ac));",
    "",
    "  float direct = pow(alt, max(0.05, uCurve)) * uDirect * spill;",
    "",
    "  // THE BOUNCE. Light that has already been in the shade and come back out of it: it falls off",
    "  // the OTHER way, so the deep end lifts off the floor instead of dying to a flat black. This",
    "  // is the whole reason a shadow can be a subject rather than an absence.",
    "  float bounce = uBounce * pow(1.0 - alt, max(0.05, uBounceCurve));",
    "",
    "  float f = uAmbient + direct + bounce;",
    "  f += uMotes * snoise(p * uMoteScale + vec2(-t * 0.5, t * 0.35)) * 0.5 * alt;",
    "",
    "  f = clamp((f - uMidpoint) * uContrast + 0.5, 0.0, 1.0);",
    "",
    "  vec3 col = ramp4(f);",
    "  col += uColorD * uGlow * pow(f, 4.0);",
    "  col = mix(uBg, col, smoothstep(0.0, max(0.01, uSink), f) * 0.90 + 0.10);",
    "",
    "  col *= 1.0 - uVignette * dot(uv, uv);",
    "  { float hgL = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);",
    "    col += houseGrain(gl_FragCoord.xy) * uGrain * mix(1.0, 4.0 * hgL * (1.0 - hgL), 0.6); }",
    "  col += triDither(gl_FragCoord.xy) * uDither;",
    "",
    "  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  function hexToVec3(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* The site's own gates (ui-src/js/00-core.js window.CN, and the same low-end rule as 10-hero3d.js weak()) */
  function weak() {
    var mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
    return (typeof mem === "number" && mem > 0 && mem <= 4) || (typeof cores === "number" && cores > 0 && cores <= 4);
  }
  function allowed() {
    var CN = win.CN, root = doc.documentElement;
    if (root.classList.contains("cn-still")) return false;
    if (CN && CN.reduced ? CN.reduced() : !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches)) return false;
    if (CN && CN.saveData && CN.saveData()) return false;
    if (weak()) return false;
    return typeof win.WebGL2RenderingContext === "function";
  }

  function start(band) {
    var canvas = doc.createElement("canvas");
    canvas.className = "cn-soffit-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var gl = null;
    try { gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
    if (!gl) return;

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
      return sh;
    }
    var program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link");
    } catch (e) {
      if (win.console && console.warn) console.warn("CyberNet: the band gradient is off (" + (e && e.message ? String(e.message).slice(0, 120) : "WebGL") + ")");
      return;
    }
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());

    var LOC = {};
    function loc(n) { return n in LOC ? LOC[n] : (LOC[n] = gl.getUniformLocation(program, n)); }
    function u1f(n, v) { gl.uniform1f(loc(n), v); }
    function u2f(n, x, y) { gl.uniform2f(loc(n), x, y); }
    function u3c(n, hex) { var c = hexToVec3(hex); gl.uniform3f(loc(n), c[0], c[1], c[2]); }

    var dpr = 1, bw = 1, bh = 1;
    function resize() {
      var r = band.getBoundingClientRect();
      bw = Math.max(1, r.width); bh = Math.max(1, r.height);
      dpr = Math.min(win.devicePixelRatio || 1, CONFIG.maxDpr);
      var w = Math.max(1, Math.round(bw * dpr)), h = Math.max(1, Math.round(bh * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(program);
      u2f("iResolution", w, h);
    }
    function applyConfig() {
      gl.useProgram(program);
      u3c("uBg", CONFIG.bgColor);
      u3c("uColorA", CONFIG.colorA);
      u3c("uColorB", CONFIG.colorB);
      u3c("uColorC", CONFIG.colorC);
      u3c("uColorD", CONFIG.colorD);
      u1f("uScale", CONFIG.scale);
      u1f("uSpeed", CONFIG.speed);
      u1f("uTilt", CONFIG.tilt);
      u1f("uRock", CONFIG.rock);
      u1f("uHorizon", CONFIG.horizon);
      u1f("uBreathe", CONFIG.breathe);
      u1f("uSpread", CONFIG.spread);
      u1f("uCurve", CONFIG.curve);
      u1f("uDirect", CONFIG.direct);
      u1f("uBounce", CONFIG.bounce);
      u1f("uBounceCurve", CONFIG.bounceCurve);
      u1f("uSpillCentre", CONFIG.spillCentre);
      u1f("uSpillWidth", CONFIG.spillWidth);
      u1f("uSpillFloor", CONFIG.spillFloor);
      u1f("uAmount", CONFIG.amount);
      u1f("uWarp", CONFIG.warp);
      u1f("uWarpScale", CONFIG.warpScale);
      u1f("uFlow", CONFIG.flow);
      u1f("uRoughness", CONFIG.roughness);
      u1f("uLacunarity", CONFIG.lacunarity);
      u1f("uMotes", CONFIG.motes);
      u1f("uMoteScale", CONFIG.moteScale);
      u1f("uAmbient", CONFIG.ambient);
      u1f("uContrast", CONFIG.contrast);
      u1f("uMidpoint", CONFIG.midpoint);
      u1f("uSink", CONFIG.sink);
      u1f("uGlow", CONFIG.glow);
      u1f("uGrain", CONFIG.grain);
      u1f("uGrainAnim", CONFIG.grainAnim);
      u1f("uDither", CONFIG.dither);
      u1f("uVignette", CONFIG.vignette);
      u1f("uSteer", CONFIG.steer);
      u1f("uLift", CONFIG.lift);
      u1f("uSweep", CONFIG.sweep);
      u1f("uParallax", CONFIG.parallax);
      resize();
    }

    /* Pointer: the prompt's two-stage lerp, in the band's own aspect-corrected units */
    var mouse = { x: 0, y: 0, ax: 0, ay: 0, tx: 0, ty: 0 };
    function aim(e) {
      var r = band.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var a = r.width / r.height;
      var px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      mouse.tx = (px - 0.5) * a;
      mouse.ty = 0.5 - py;
    }
    band.addEventListener("pointermove", aim, { passive: true });
    band.addEventListener("pointerdown", aim, { passive: true });

    var resizeQueued = false;
    function onResize() {
      if (resizeQueued) return;
      resizeQueued = true;
      win.requestAnimationFrame(function () { resizeQueued = false; resize(); });
    }
    win.addEventListener("resize", onResize, { passive: true });

    var visible = false, raf = 0, prevT = 0, clock = 0, dead = false, waitingStill = false;
    var C = win.CN || null;
    /* like the hero globe: hold the frame while the page scrolls or the phone menu sheet covers the page,
       and carry on when it is still / uncovered (whenStill and onCover call run() again) */
    function held() { return !!(C && ((C.covered && C.covered()) || (C.scrolling && C.scrolling()))); }
    function frame(now) {
      raf = 0;
      if (dead || !visible || doc.hidden) { prevT = 0; return; }
      if (held()) {
        prevT = 0;
        if (C.scrolling && C.scrolling() && C.whenStill && !waitingStill) {
          waitingStill = true;
          C.whenStill(function () { waitingStill = false; run(); });
        }
        return;
      }
      raf = win.requestAnimationFrame(frame);
      var raw = prevT ? now - prevT : 16.7;
      prevT = now;
      var ms = raw > 50 ? 50 : raw < 4.167 ? 4.167 : raw;
      var s = ms > 36.7 ? 2.2 : ms * 0.06;
      clock += ms * 0.001;
      var kLead = 0.105 * s, kBody = 0.043 * s;
      mouse.ax += (mouse.tx - mouse.ax) * kLead;
      mouse.ay += (mouse.ty - mouse.ay) * kLead;
      mouse.x += (mouse.ax - mouse.x) * kBody;
      mouse.y += (mouse.ay - mouse.y) * kBody;
      u1f("iTime", clock);
      if (mouse.rest === undefined) mouse.rest = { x: mouse.tx, y: mouse.ty };
      if (!CONFIG.cursor) { mouse.tx = mouse.rest.x; mouse.ty = mouse.rest.y; }
      u2f("iMouse", mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    /* resize on every (re)start: the window may have changed while Home was hidden (a rotation, a resize) */
    function run() { if (!raf && !dead && visible && !doc.hidden) { resize(); prevT = 0; raf = win.requestAnimationFrame(frame); } }
    function stop() { if (raf) { win.cancelAnimationFrame(raf); raf = 0; } }

    function fail() {
      dead = true; stop();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      band.classList.remove("is-live");
    }
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); fail(); });

    band.insertBefore(canvas, band.firstChild);
    try {
      applyConfig();
      gl.drawArrays(gl.TRIANGLES, 0, 3); // one draw before the reveal, so it never fades onto a blank canvas
      if (gl.getError() !== gl.NO_ERROR) throw new Error("draw");
    } catch (e) { fail(); return; }
    band.classList.add("is-live");

    if ("IntersectionObserver" in win) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) run(); else stop(); }, { threshold: 0 }).observe(band);
    } else { visible = true; run(); }
    doc.addEventListener("visibilitychange", function () { if (doc.hidden) stop(); else run(); });
    if (C && C.onCover) C.onCover(function (on) { if (on) stop(); else run(); });
    /* Pause motion (07-aurora.js) or the OS setting turning on later: the last frame stays, the loop stops */
    if (win.CN && win.CN.onMotion) win.CN.onMotion(function (reduced) { if (reduced) { dead = true; stop(); } });
    if (win.MutationObserver) new MutationObserver(function () { if (doc.documentElement.classList.contains("cn-still")) { dead = true; stop(); } })
      .observe(doc.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    var band = doc.querySelector("[data-cn-soffit]");
    if (!band || !allowed()) return;
    if (!("IntersectionObserver" in win)) { start(band); return; }
    /* within 100 px of the viewport, and then when the browser is idle: on a desktop the band sits just
       under the fold, so this keeps its context, compile and first draw away from the hero globe's start */
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      if (win.requestIdleCallback) win.requestIdleCallback(function () { start(band); }, { timeout: 1200 });
      else setTimeout(function () { start(band); }, 200);
    }, { rootMargin: "100px 0px" });
    io.observe(band);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})(window, document);
