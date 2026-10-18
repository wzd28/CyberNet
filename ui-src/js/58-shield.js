/* Home #cnCore: the shield story, scrubbed by the scroll (v4.6 "Holo-vault", 17 Oct 2026; markup and
   rest look in 28-shield.css, which tells the story).
   - Start-up, whatever the motion setting: the lattice, glints, dial ticks and sparks are drawn.
   - The CSS rest state is the END of the story; Web Animations lay the story over it: ONE
     animation per element and property (transform, opacity, stroke-dashoffset) on one 0..1
     progress (span.cn-sh-mark: 0 at the screen's bottom edge, 1 past its top), each windowed to
     its own first..last stop, so a scrolled frame costs only the parts that move. Parts that
     appear mid-story rest at opacity .002 (pre-warmed); shut doors are transform: none.
   - ViewTimeline: no script per frame. Elsewhere (or ?fallback): the same animations, paused,
     set from one rAF per scrolled frame while the section is near.
   - The link's swap, its ring and the verdict are timed from measured positions; a new stage
     width or card layout (a resize, the web font) rebuilds the story.
   - Reduced motion, Pause motion, no Element.animate: all cancelled, the CSS end state shows. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var win = window, doc = document, M = Math;
  var FORCE_FB = /[?&]fallback\b/.test((win.location && win.location.search) || "");
  var HAS_VT = !FORCE_FB && typeof win.ViewTimeline === "function" &&
    typeof win.Animation === "function" && "rangeStart" in win.Animation.prototype;

  var IO = "cubic-bezier(.65,0,.35,1)", OUT = "cubic-bezier(.22,1,.36,1)", IN = "cubic-bezier(.6,0,.9,.4)",
      SPARK = "cubic-bezier(.12,.75,.3,1)", LIN = "linear";
  var E = .002;              /* invisible, but drawn (pre-warmed) */

  /* ---------- geometry (viewBox 0 0 360 440) ---------- */
  var OUTLINE = [[180, 0], [360, 80], [340, 260], [180, 440], [20, 260], [0, 80]];
  function len(x, y) { return M.sqrt(x * x + y * y); }
  var S1 = len(180, 80), S2 = len(20, 180), S3 = len(160, 180), HALF = S1 + S2 + S3;   /* 618.92 */
  function r2(n) { return M.round(n * 100) / 100; }
  function inset(poly, d) {
    var n = poly.length, lines = [], out = [], i;
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n], nx = -(b[1] - a[1]), ny = b[0] - a[0], L = len(nx, ny);
      nx /= L; ny /= L;
      if ((180 - (a[0] + b[0]) / 2) * nx + (220 - (a[1] + b[1]) / 2) * ny < 0) { nx = -nx; ny = -ny; }
      lines.push([a[0] + nx * d, a[1] + ny * d, b[0] + nx * d, b[1] + ny * d]);
    }
    for (i = 0; i < n; i++) {
      var p = lines[(i - 1 + n) % n], q = lines[i];
      var d1x = p[2] - p[0], d1y = p[3] - p[1], d2x = q[2] - q[0], d2y = q[3] - q[1];
      var t = ((q[0] - p[0]) * d2y - (q[1] - p[1]) * d2x) / (d1x * d2y - d1y * d2x);
      out.push([p[0] + d1x * t, p[1] + d1y * t]);
    }
    return out;
  }
  function inside(poly, x, y) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  /* seeded random (mulberry32): the same glints and sparks on every visit */
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = M.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + M.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  /* pointy-top hex cells (R 7.6), one M..Z subpath each: doors inside the outline inset by 24
     (left x <= 178, right x >= 182, none over the lock), the cavity inside it inset by 22 */
  function lattice() {
    var R = 7.6, W = R * M.sqrt(3), P24 = inset(OUTLINE, 24), P22 = inset(OUTLINE, 22);
    var ux = [], uy = [], k, g = { l: [], r: [], c: [], tl: [], tr: [], tc: [] };
    for (k = 0; k < 6; k++) { var an = M.PI / 180 * (60 * k - 90); ux.push(R * M.cos(an)); uy.push(R * M.sin(an)); }
    var mid = M.round(360 / W / 2), vx = [], vy = [];
    for (var row = -2; row < 440 / (R * 1.5) + 2; row++) {
      for (var col = -2; col < 360 / W + 2; col++) {
        var cx = 180 + (col - mid) * W + (row & 1 ? W / 2 : 0), cy = 6 + row * R * 1.5;
        var ok = true, door = true, lo = 1e9, hi = -1e9;
        for (k = 0; k < 6; k++) {
          vx[k] = r2(cx + ux[k]); vy[k] = r2(cy + uy[k]);
          var x = cx + ux[k], y = cy + uy[k];
          if (ok && !inside(P22, x, y)) ok = false;
          if (door && !inside(P24, x, y)) door = false;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
        if (!ok) continue;
        var d = "M" + vx[0] + " " + vy[0];
        for (k = 1; k < 6; k++) d += "L" + vx[k] + " " + vy[k];
        d += "Z";
        g.c.push(d); g.tc.push(vx[0] + " " + vy[0]);
        if (!door || M.pow((cx - 180) / 60, 2) + M.pow((cy - 214) / 72, 2) <= 1) continue;
        if (hi <= 178) { g.l.push(d); g.tl.push(vx[0] + " " + vy[0]); }
        else if (lo >= 182) { g.r.push(d); g.tr.push(vx[0] + " " + vy[0]); }
      }
    }
    return g;
  }
  /* glints: n distinct cell tops, as round-capped dots */
  function glints(tops, n, seed) {
    var R = rng(seed), seen = {}, out = [], want = M.min(n, tops.length);
    while (out.length < want) {
      var p = tops[M.floor(R() * tops.length)];
      if (!seen[p]) { seen[p] = 1; out.push("M" + p + "h0"); }
    }
    return out.join("");
  }
  /* sparks: rays out of the lock, one subpath each (the dash restarts per subpath) */
  function rays(n, seed, r0a, r0b, la, lb) {
    var R = rng(seed), d = "";
    for (var k = 0; k < n; k++) {
      var ang = (k / n * 360 + (R() - .5) * 12) * M.PI / 180, r0 = r0a + R() * (r0b - r0a), l = la + R() * (lb - la);
      var c = M.cos(ang), s = M.sin(ang) * 1.08;
      d += "M" + r2(180 + c * r0) + " " + r2(228 + s * r0) + "L" + r2(180 + c * (r0 + l)) + " " + r2(228 + s * (r0 + l));
    }
    return d;
  }
  /* the dial: ticks every 3 degrees, major every 15 (none at 0 and 180: the index ticks) */
  function ticks() {
    var minor = "", major = "";
    for (var a = 0; a < 360; a += 3) {
      if (a === 0 || a === 180) continue;
      var t = a * M.PI / 180, c = M.cos(t), s = M.sin(t), maj = a % 15 === 0, r1 = maj ? 189 : 194;
      var seg = "M" + r2(c * r1) + " " + r2(s * r1) + "L" + r2(c * 198.5) + " " + r2(s * 198.5);
      if (maj) major += seg; else minor += seg;
    }
    return [minor, major];
  }
  function draw(fig) {
    function set(sel, d) { var el = CN.qs(sel, fig); if (el) el.setAttribute("d", d); }
    var g = lattice(), t = ticks();
    set("#cnShHexL", g.l.join("")); set("#cnShHexR", g.r.join("")); set("#cnShHexC", g.c.join(""));
    set(".cn-sh-gl-l", glints(g.tl, 9, 7)); set(".cn-sh-gl-r", glints(g.tr, 9, 11)); set(".cn-sh-gl-c", glints(g.tc, 22, 5));
    set(".cn-sh-ticks", t[0]); set(".cn-sh-ticks-maj", t[1]);
    set(".cn-sh-s-line", rays(32, 3, 46, 60, 40, 92)); set(".cn-sh-s-dot", rays(20, 9, 44, 58, 60, 112));
  }

  /* ---------- the story ---------- */
  /* The beats. The whole shield is on screen from .27 to .73 (1440x900) and .21 to .79 (390x844):
     the ignite plays as it arrives, every later beat with it on screen. */
  var B = {
    ignite: [.125, .133],    /* a point of light flares at the apex */
    trace: [.13, .232],      /* splits, runs down both sides, drawing the lit edge */
    charge: [.13, .235],     /* the door lattice charges */
    tip: [.226, .25],        /* the lights meet at the tip */
    unlock: [.235, .262],    /* the shackle lifts */
    lockOut: [.252, .284],   /* the lock steps back */
    slab: [.266, .338],      /* the doors fan open: slab (80 deg), lattice (78), frame (76) */
    holo: [.274, .35],
    frame: [.284, .362],
    cardIn: [.268, .278],
    focus: [.352, .366],     /* the brackets lock on */
    scan: [.366, .455],      /* the scan plane, top to bottom (linear) */
    focusOut: [.462, .472],
    cFrame: [.50, .562],     /* closing: frame first, slab last */
    cHolo: [.51, .574],
    cSlab: [.52, .586],
    cardOut: [.579, .585],   /* the doors a hairline from shut */
    lockIn: [.562, .59],
    zip: [.574, .597],       /* the seam zips from both tips */
    click: [.59, .603],      /* the shackle snaps down */
    solid: [.602, .607],     /* the bright lock with its check */
    burst: [.603, .642], shock: [.603, .655], race: [.603, .633],
    edge: [.603, .633, .70], /* up, then settles at .4 */
    msg: [.588, .628], spec: [.634, .705]
  };
  var SCAN_H = .24, F0 = .03, F1 = .975;   /* scan box height; its edge's first and last y */
  function pAt(f) { return B.scan[0] + (f - F0) / (F1 - F0) * (B.scan[1] - B.scan[0]); }
  function distAtY(y) {
    if (y <= 80) return y / 80 * S1;
    if (y <= 260) return S1 + (y - 80) / 180 * S2;
    return S1 + S2 + (y - 260) / 180 * S3;
  }
  function P(deg) { return "perspective(1300px) rotateY(" + deg + "deg)"; }
  function ty(v) { return "translate3d(0," + r2(v) + "%,0)"; }

  /* [selector or element, property, [[progress, value, easing to the next stop], ...]] */
  function story(m, fig) {
    var T = "transform", O = "opacity", D = "strokeDashoffset", Z = ty(0), list = [];
    function add(sel, prop, stops) { list.push([sel, prop, stops]); }
    var s0 = B.scan[0], s1 = B.scan[1];

    /* 1. ignite and trace */
    var ig = B.ignite[0], at = "translate(0px,0px) ", tip = "translate(0px," + m.h.toFixed(1) + "px) ";
    add(".cn-sh-flare", O, [[ig, E, OUT], [B.ignite[1], 1], [.16, 1, IO], [.19, E], [B.tip[0], E, OUT], [.232, 1], [.24, 1, IO], [B.tip[1], E]]);
    add(".cn-sh-flare", T, [[ig, at + "scale(.2)", OUT], [B.ignite[1], at + "scale(1)"], [.19, at + "scale(.55)"],
                            [.22, tip + "scale(.3)", OUT], [.232, tip + "scale(1.1)"], [B.tip[1], tip + "scale(.6)"]]);
    add(".cn-sh-trace", O, [[ig, E], [ig + .001, 1], [.245, 1], [.25, E]]);
    add(".cn-sh-t-flare", D, [[.127, 46, OUT], [.165, -102]]);
    /* the comets ride in step with the edge being drawn, then run off the tip */
    [[".cn-sh-t-tail", 150], [".cn-sh-t-body", 66], [".cn-sh-t-head", 24]].forEach(function (c) {
      add(c[0], D, [[B.trace[0], c[1] + 3, IO], [B.trace[1], c[1] - HALF, LIN], [B.trace[1] + .012, -HALF - 3]]);
    });
    add(".cn-sh-edge path", D, [[B.trace[0], 619, IO], [B.trace[1], 0]]);
    /* the doors' own edge waits dim until the light has drawn it, so the drawing reads */
    add(".cn-sh-frame", O, [[B.trace[0], .3], [.21, .3, IO], [.245, 1]]);
    add(".cn-sh-edge", O, [[B.trace[0] - .001, E], [B.trace[0], 1], [.236, 1, IO], [.262, E],
                           [B.edge[0], E, IO], [B.edge[1], 1, IO], [B.edge[2], .4]]);
    add(".cn-sh-holo", O, [[B.charge[0], .06, IO], [B.charge[1], .62], [B.holo[0], .62, IO], [B.holo[1], .22],
                           [B.cHolo[0], .22, IO], [B.cHolo[1], .55], [B.solid[0], .55, OUT], [.609, 1, IO], [.68, .4]]);

    /* 2. the lock steps back, the doors fan open */
    var UP = ty(-15);
    add(".cn-sh-shackle", T, [[B.unlock[0], Z, OUT], [B.unlock[1], UP], [B.click[0], UP, IN], [B.click[1], Z]]);
    add(".cn-sh-lock", O, [[B.lockOut[0], 1, IO], [B.lockOut[1], E], [B.lockIn[0], E, OUT], [B.lockIn[1], 1]]);
    add(".cn-sh-lock", T, [[B.lockOut[0], "scale(1)", IO], [B.lockOut[1], "scale(.9)"], [B.lockIn[0], "scale(.9)", OUT], [B.lockIn[1], "scale(1)"]]);
    [["slab", 80, B.slab, B.cSlab], ["holo", 78, B.holo, B.cHolo], ["frame", 76, B.frame, B.cFrame]].forEach(function (s) {
      [["is-l", 1], ["is-r", -1]].forEach(function (side) {
        var deg = s[1] * side[1], o = s[2], c = s[3];
        add(".cn-sh-" + s[0] + "." + side[0], T, [[o[0] - .001, "none"], [o[0], P(0), IO], [o[1], P(deg)],
                                                  [c[0], P(deg), IO], [c[1], P(0)], [c[1] + .001, "none"]]);
      });
    });
    add(".cn-sh-dial", T, [[0, "rotate(-150deg)"], [.36, "rotate(-58deg)", IO], [.50, "rotate(-58deg)", IO], [B.click[1], "rotate(0deg)"], [B.click[1] + .001, "none"]]);
    add(".cn-sh-marks", O, [[B.zip[1], .3, OUT], [B.click[1], 1, IO], [.68, .9]]);

    /* 3. inside: the card, the lock-on, the scan, the lattice lit behind it */
    add(".cn-sh-curtain", O, [[B.slab[0], E], [B.cardIn[0], 1], [B.cSlab[1], 1], [B.cSlab[1] + .001, E]]);
    add(".cn-sh-curtain", T, [[s0 - .001, ty(-100)], [s0, ty((F0 - 1) * 100)], [s1, ty((F1 - 1) * 100)], [s1 + .001, Z]]);
    add(".cn-sh-curtain-in", T, [[s0 - .001, ty(100)], [s0, ty((1 - F0) * 100)], [s1, ty((1 - F1) * 100)], [s1 + .001, Z]]);
    add(".cn-sh-card", O, [[B.cardIn[0], E], [B.cardIn[1], 1], [B.cardOut[0], 1], [B.cardOut[1], E]]);
    add(".cn-sh-card", T, [[B.slab[0], ty(4) + " scale(.94)", OUT], [B.frame[1], Z + " scale(1)"],
                           [B.cFrame[0], Z + " scale(1)", IO], [B.cSlab[1], ty(1.5) + " scale(.96)"]]);
    add(".cn-sh-focus", O, [[B.focus[0], E], [B.focus[0] + .004, .85], [B.focusOut[0], .85, IO], [B.focusOut[1], E]]);
    add(".cn-sh-focus", T, [[B.focus[0], "scale(1.12,1.18)", OUT], [B.focus[1], "scale(1)"], [B.focusOut[0], "scale(1)", IN], [B.focusOut[1], "scale(1.06)"]]);
    add(".cn-sh-scan", T, [[s0, ty((F0 / SCAN_H - 1) * 100)], [s1, ty((F1 / SCAN_H - 1) * 100)]]);
    add(".cn-sh-scan", O, [[s0, E], [s0 + .006, 1], [s1 - .007, 1], [s1, E]]);
    add(".cn-sh-emit", O, [[s0, E], [s0 + .006, 1], [s1 - .01, 1], [s1, E]]);
    [[".cn-sh-e-core", 3], [".cn-sh-e-halo", 8]].forEach(function (e) {
      add(e[0], D, [F0 * 440, 80, 260, F1 * 440].map(function (y) { return [pAt(y / 440), r2(e[1] - distAtY(y))]; }));
    });
    /* the link turns coral as the scan crosses it; the ring; then the verdict */
    var pL = m.pLink, V0 = m.V0;
    add(".cn-sh-ok", O, [[pL, 1], [pL + .004, 0]]);
    add(".cn-sh-bad", O, [[pL, 0], [pL + .004, 1]]);
    add(".cn-sh-ring rect", D, [[pL + .006, 101, IO], [pL + .02, 0]]);
    add(".cn-sh-wait", O, [[V0, 1], [V0 + .004, 0]]);
    add(".cn-sh-res", O, [[V0 + .002, E], [V0 + .006, 1]]);
    add(".cn-sh-pill.is-scam", T, [[V0 + .002, ty(-35) + " scale(1.12)", OUT], [V0 + .009, Z + " scale(1)"]]);
    add(".cn-sh-impact", O, [[V0 + .0085, E], [V0 + .009, .9, OUT], [V0 + .024, E]]);
    add(".cn-sh-impact", T, [[V0 + .0085, "scale(.667)"], [V0 + .009, "scale(.68)", OUT], [V0 + .024, "scale(1)"]]);
    add(".cn-sh-why", O, [[V0 + .006, E, OUT], [V0 + .014, 1]]);
    add(".cn-sh-why", T, [[V0 + .006, ty(18), OUT], [V0 + .014, Z]]);

    /* 4. the click */
    add(".cn-sh-body", O, [[B.solid[0], 1], [B.solid[1] - .001, 0]]);
    add(".cn-sh-solid", O, [[B.solid[0], 0], [B.solid[1], 1]]);
    add(".cn-sh-solid", T, [[B.solid[0], "scale(.94)", OUT], [B.solid[1] + .02, "scale(1)"]]);
    add(".cn-sh-zip", O, [[B.zip[0], E], [B.zip[0] + .003, 1], [B.solid[1], 1, IO], [.65, E]]);
    add(".cn-sh-zip path", D, [[B.zip[0], 160, IO], [B.zip[1], 0]]);
    add(".cn-sh-flash", O, [[B.solid[0], E], [B.solid[0] + .0015, 1, OUT], [.632, E]]);
    add(".cn-sh-sparks", O, [[B.burst[0], E], [B.burst[0] + .0015, 1], [.619, 1, IO], [B.burst[1], E]]);
    add(".cn-sh-s-line", D, [[B.burst[0], 10, SPARK], [B.burst[1], -104]]);
    add(".cn-sh-s-dot", D, [[B.burst[0], 0, SPARK], [B.burst[1], -120]]);
    add(".cn-sh-shock", O, [[B.shock[0], E], [B.shock[0] + .002, .95, OUT], [B.shock[1], E]]);
    add(".cn-sh-shock", T, [[B.shock[0], "scale(.862)", OUT], [B.shock[1], "scale(1)"]]);
    add(".cn-sh-race", O, [[B.race[0], E], [B.race[0] + .002, 1], [B.race[1], 1, IO], [.645, E]]);
    add(".cn-sh-r-core", D, [[B.race[0], 30, IO], [B.race[1], r2(-HALF)]]);
    add(".cn-sh-r-halo", D, [[B.race[0], 44, IO], [B.race[1], r2(-HALF)]]);

    /* 5. the message, word by word; the specular sweep */
    CN.qsa(".cn-sh-lit .cn-sh-w", fig).forEach(function (w, i) {
      var a = B.msg[0] + i * .0055;
      add(w, O, [[a, E], [a + .012, 1]]);
    });
    add(".cn-sh-spec", T, [[B.spec[0], "translate3d(-110%,0,0)", IO], [B.spec[1], "translate3d(180%,0,0)"]]);
    add(".cn-sh-spec", O, [[B.spec[0] - .001, E], [B.spec[0], 1], [B.spec[1], 1], [B.spec[1] + .001, E]]);
    return list;
  }

  /* stops -> keyframes over their own window [s, e] */
  function track(prop, stops) {
    var s = stops[0][0], e = stops[stops.length - 1][0];
    if (e - s < .0005) e = s + .0005;
    var kf = stops.map(function (st, i) {
      var k = { offset: i === 0 ? 0 : i === stops.length - 1 ? 1 : CN.clamp((st[0] - s) / (e - s), 0, 1), easing: st[2] || LIN };
      k[prop] = String(st[1]);
      return k;
    });
    return { kf: kf, s: s, e: e };
  }
  function pct(v) { return "cover " + (v * 100).toFixed(3) + "%"; }
  function scrollY() { return win.pageYOffset || doc.documentElement.scrollTop || 0; }

  function Shield(fig) {
    var stage = CN.qs(".cn-sh-stage", fig), mark = CN.qs(".cn-sh-mark", fig);
    if (!stage || !mark) return null;
    draw(fig);
    if (typeof fig.animate !== "function") return null;
    var card = CN.qs(".cn-sh-card", fig), link = CN.qs(".cn-sh-link", fig), verdict = CN.qs(".cn-sh-verdict", fig), focus = CN.qs(".cn-sh-focus", fig);
    var anims = [], wins = [], vt = false, paused = false, built = "", rsT = 0, ro = null;
    var near = false, bound = false, raf = 0, top = 0, vh = 0, lastP = -1, measured = false, stale = false;

    /* where the card's parts are (transform-free: offsets, not client rects) */
    function off(el) {
      var x = 0, y = 0, w = el.offsetWidth, h = el.offsetHeight;
      while (el && el !== stage) {
        var op = el.offsetParent, b = op && op !== stage;
        x += el.offsetLeft + (b ? op.clientLeft : 0); y += el.offsetTop + (b ? op.clientTop : 0); el = op;
      }
      return [x, y, w, h];
    }
    function layoutKey() { return [stage.offsetWidth, off(link), off(verdict), off(card)].join(); }
    function measure() {
      var w = stage.offsetWidth || 1, h = stage.offsetHeight || 1, l = off(link), v = off(verdict), c = off(card), st = focus.style;
      /* the brackets go round the card's box */
      ["x", "y", "w", "h"].forEach(function (k, i) { st.setProperty("--cn-sh-f" + k, r2(c[i] / (i % 2 ? h : w) * 100) + "%"); });
      return { h: h, pLink: pAt((l[1] + l[3] / 2) / h), V0: pAt((v[1] + v[3] / 2) / h) + .002 };
    }

    function build() {
      if (anims.length) return;
      built = layoutKey();
      var m = measure(), tl = null;
      if (HAS_VT) { try { tl = new win.ViewTimeline({ subject: mark, axis: "block" }); } catch (e) { tl = null; } }
      story(m, fig).forEach(function (a) {
        var els = typeof a[0] === "string" ? CN.qsa(a[0], fig) : [a[0]], t = track(a[1], a[2]);
        els.forEach(function (el) {
          var anim = null;
          try {
            anim = tl ? el.animate(t.kf, { timeline: tl, fill: "both", rangeStart: pct(t.s), rangeEnd: pct(t.e) })
                      : el.animate(t.kf, { delay: t.s * 1000, duration: (t.e - t.s) * 1000, endDelay: (1 - t.e) * 1000, fill: "both" });
          } catch (e) { anim = null; }
          if (!anim) return;
          if (!tl) anim.pause();
          anims.push(anim); wins.push(t);
        });
      });
      vt = !!tl;
      if (!vt && anims.length) fig.setAttribute("data-sh-scrub", "");
      lastP = -1;
      bind();
    }
    function clear() {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* gone */ } });
      anims = []; wins = [];
      fig.removeAttribute("data-sh-scrub");
      bind();
    }
    function sync() { if (paused || CN.reduced()) clear(); else build(); }
    function rebuild() { if (anims.length && layoutKey() !== built) { clear(); sync(); } }

    /* fallback: progress from the cached position of the mark */
    function read() {
      var r = mark.getBoundingClientRect();
      top = r.top + scrollY();
      vh = win.innerHeight || doc.documentElement.clientHeight || 800;
      measured = true; stale = false;
    }
    function seek() {
      raf = 0;
      if (stale) read();
      if (!anims.length || !measured) return;
      var p = CN.clamp((scrollY() + vh - top) / (vh + 1), 0, 1);
      p = M.round(p * 2000) / 2000;
      if (p === lastP) return;
      var q = lastP;
      lastP = p;
      for (var i = 0; i < anims.length; i++) {
        var w = wins[i];
        /* before (or past) its own window on both frames: nothing changes */
        if (q >= 0 && ((p < w.s && q < w.s) || (p > w.e && q > w.e))) continue;
        anims[i].currentTime = p * 1000;
      }
    }
    function onScroll() { if (!raf && bound) raf = win.requestAnimationFrame(seek); }
    function onResize() { stale = true; onScroll(); }
    function bind() {
      var want = near && anims.length > 0 && !vt;
      if (want !== bound) {
        bound = want;
        var f = want ? "addEventListener" : "removeEventListener";
        win[f]("scroll", onScroll, { passive: true });
        win[f]("resize", onResize, { passive: true });
        if (ro) { if (want) ro.observe(doc.body); else ro.unobserve(doc.body); }
        if (!want && raf) { win.cancelAnimationFrame(raf); raf = 0; }
      }
      if (want) { if (!ro) stale = true; else read(); lastP = -1; onScroll(); }
    }
    /* the stage (rebuild on a new size) and, while scrubbing, the page (it moves the section) */
    if ("ResizeObserver" in win) {
      ro = new ResizeObserver(function () {
        if (bound) { read(); lastP = -1; onScroll(); }
        later();
      });
      ro.observe(stage);
    }
    /* the web font changes the card's lines: re-time the story once it is in */
    function later() { clearTimeout(rsT); rsT = setTimeout(rebuild, 140); }
    if (doc.fonts) {
      if (doc.fonts.ready) doc.fonts.ready.then(later);
      if (doc.fonts.addEventListener) doc.fonts.addEventListener("loadingdone", later);
    }

    var offs = [CN.onMotion(sync), CN.onStill ? CN.onStill(sync) : null,
                CN.inView(fig, function (vis) { near = !!vis; bind(); }, { margin: "25% 0px" })];
    sync();
    return {
      pause: function () { paused = true; sync(); },
      resume: function () { paused = false; sync(); },
      destroy: function () {
        paused = true; near = false;
        clear();
        clearTimeout(rsT);
        if (ro) { ro.disconnect(); ro = null; }
        if (doc.fonts && doc.fonts.removeEventListener) doc.fonts.removeEventListener("loadingdone", later);
        offs.forEach(function (off) { if (typeof off === "function") off(); });
      }
    };
  }

  CN.register("shield", Shield, { eager: true });
})();
