/* Everywhere (#cnGlobe): a calm dotted globe. Fibonacci points masked to rough continents (front
   dots brighter, back dots very faint), one slow turn a minute, and arcs between real cities that
   draw, carry a pulse across, and fade. The soft limb is CSS (.cn-globe-box::before), so the canvas
   only draws dots and arcs. DPR is capped at 1.5, phones draw at about 30 fps, the loop runs only
   while the canvas is on screen and the tab is visible, and reduced motion or Save-Data get one
   still frame. A Pause button (.cn-globe-pause, aria-pressed) freezes it on demand. Colours come
   from the --cn-* tokens. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, win = window;
  var D2R = Math.PI / 180, TAU = Math.PI * 2;

  /* [lat, lon] */
  var CITY = {
    dubai: [25.20, 55.27], london: [51.51, -0.13], newyork: [40.71, -74.01], lagos: [6.52, 3.38],
    mumbai: [19.08, 72.88], singapore: [1.35, 103.82], saopaulo: [-23.55, -46.63], sydney: [-33.87, 151.21]
  };
  var ROUTES = [
    ["london", "dubai"], ["saopaulo", "newyork"], ["mumbai", "singapore"], ["lagos", "london"],
    ["newyork", "london"], ["dubai", "mumbai"], ["singapore", "sydney"], ["lagos", "saopaulo"]
  ];

  /* Rough continents as ellipses [lat, lon, lat radius, lon radius] with a little edge noise.
     Good enough for a dotted globe at this size; not a map. */
  var LAND = [
    [60, -105, 12, 30], [64, -152, 6, 13], [74, -95, 5, 22], [39, -98, 10, 20], [28, -82, 3, 2.5],
    [23, -103, 6, 7], [14, -88, 4, 5], [73, -41, 9, 14], [65, -18, 2, 4],
    [-3, -62, 13, 15], [-10, -44, 8, 8], [-30, -62, 12, 8], [-46, -69, 7, 4],
    [48, 5, 6, 10], [40, -4, 4, 5], [54, -2.5, 4, 3], [42, 13, 4, 3], [52, 25, 6, 15], [63, 16, 7, 8],
    [58, 45, 8, 18], [64, 100, 10, 45], [62, 135, 9, 20], [57, 160, 5, 4], [46, 70, 8, 20],
    [33, 105, 10, 18], [22, 79, 8, 9], [13, 78, 5, 4], [24, 46, 8, 9], [33, 54, 6, 10], [39, 34, 3, 7],
    [16, 102, 7, 5], [5, 102, 4, 2], [0, 101, 4, 3], [0, 114, 4, 4], [-7, 110, 1.5, 6], [-5, 141, 3, 8],
    [36, 138, 5, 3], [43, 143, 2, 2], [37, 127, 3, 2], [12, 122, 5, 2],
    [24, 12, 10, 24], [12, -5, 6, 12], [3, 22, 9, 14], [8, 44, 5, 5], [-18, 26, 12, 11],
    [-30, 24, 5, 7], [-19, 47, 6, 2.5],
    [-25, 134, 10, 17], [-14, 143, 4, 3], [-42, 147, 1.5, 2], [-42, 173, 5, 3], [-84, 0, 8, 180]
  ];
  function isLand(lat, lon) {
    var wob = Math.sin(lat * 0.31 + lon * 0.17) * 0.16 + Math.cos(lat * 0.73 - lon * 0.41) * 0.1;
    for (var i = 0; i < LAND.length; i++) {
      var L = LAND[i], dl = lon - L[1];
      if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
      var a = (lat - L[0]) / L[2], b = dl / L[3];
      if (a * a + b * b < 1 + wob) return true;
    }
    return false;
  }

  function vec(ll) {
    var la = ll[0] * D2R, lo = ll[1] * D2R;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  }

  function tokenRgb(name, fb) {
    try {
      var v = getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
      var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fb;
    } catch (e) { return fb; }
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  var TILT = 0.38, THETA0 = -22 * D2R, OMEGA = TAU / 60; /* one turn a minute */
  var PERIOD = 8, K = 48;                                 /* each arc: 8 s cycle, 48 segments */
  var T_DRAW = 1.3, T_PULSE = 1.7, T_FADE = 1.0;          /* draw, pulse across, fade */
  var NB = 14;                                            /* dot brightness buckets */

  function init(cv) {
    var ctx = cv.getContext && cv.getContext("2d");
    if (!ctx) return null;

    var DOT = tokenRgb("--cn-cyan-2", [103, 232, 249]);
    var ARC = tokenRgb("--cn-cyan", [34, 211, 238]);
    var ICE = tokenRgb("--cn-ice", [230, 251, 255]);
    var dotFill = rgba(DOT, 1);
    var coarse = !CN.finePointer();
    var still = CN.reduced() || CN.saveData();

    var ALPHA = [], RAD = [];
    for (var b = 0; b < NB; b++) { var q = b / (NB - 1); ALPHA.push(0.03 + 0.9 * q * q); RAD.push(0.42 + 0.5 * q); }

    var w = 0, h = 0, dpr = 1, R = 0, cx = 0, cy = 0, wantN = 0;
    var P = null, nPts = 0, SX = null, SY = null, SB = null, ORD = null;
    var bCnt = new Int32Array(NB), bOff = new Int32Array(NB + 1), bPos = new Int32Array(NB);
    var arcs = [], cities = [], sprite = null, spriteKey = "";
    var AX = new Float32Array(K + 1), AY = new Float32Array(K + 1), AV = new Uint8Array(K + 1);
    var sec = 0, lastT = 0;

    function buildPoints(n) {
      var golden = Math.PI * (3 - Math.sqrt(5)), out = [];
      for (var i = 0; i < n; i++) {
        var y = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - y * y), th = golden * i;
        var x = Math.sin(th) * r, z = Math.cos(th) * r;
        var land = isLand(Math.asin(y) / D2R, Math.atan2(x, z) / D2R);
        if (!land && i % 3) continue; /* a sparse third of the ocean gives the sphere its body */
        out.push(x, y, z, land ? 1 : 0);
      }
      P = new Float32Array(out);
      nPts = out.length / 4;
      SX = new Float32Array(nPts); SY = new Float32Array(nPts); SB = new Uint8Array(nPts); ORD = new Int32Array(nPts);
    }

    function buildArcs() {
      arcs = ROUTES.map(function (rt, i) {
        var a = vec(CITY[rt[0]]), z = vec(CITY[rt[1]]);
        var d = CN.clamp(a[0] * z[0] + a[1] * z[1] + a[2] * z[2], -1, 1);
        var om = Math.acos(d), so = Math.sin(om) || 1e-6, lift = 0.05 + 0.24 * om / Math.PI;
        var pts = new Float32Array((K + 1) * 3);
        for (var k = 0; k <= K; k++) {
          var u = k / K, s1 = Math.sin((1 - u) * om) / so, s2 = Math.sin(u * om) / so, m = 1 + lift * Math.sin(Math.PI * u);
          pts[k * 3] = (a[0] * s1 + z[0] * s2) * m;
          pts[k * 3 + 1] = (a[1] * s1 + z[1] * s2) * m;
          pts[k * 3 + 2] = (a[2] * s1 + z[2] * s2) * m;
        }
        return { pts: pts, end: z, off: i * PERIOD / ROUTES.length };
      });
      var seen = {};
      cities = [];
      ROUTES.forEach(function (rt) { rt.forEach(function (c) { if (!seen[c]) { seen[c] = 1; cities.push(vec(CITY[c])); } }); });
    }

    /* small soft dot for arc heads and pulses, rendered once per DPR */
    function buildSprite() {
      var key = String(dpr);
      if (key === spriteKey) return;
      spriteKey = key;
      var S = 22, e = doc.createElement("canvas");
      e.width = e.height = Math.ceil(S * dpr);
      var s = e.getContext("2d");
      if (!s) { sprite = null; return; }
      s.setTransform(dpr, 0, 0, dpr, 0, 0);
      var g = s.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, rgba(ICE, 1)); g.addColorStop(0.14, rgba(ICE, 0.95)); g.addColorStop(0.26, rgba(ARC, 0.35)); g.addColorStop(1, rgba(ARC, 0));
      s.fillStyle = g;
      s.fillRect(0, 0, S, S);
      sprite = e;
    }

    function setSize(nw, nh) {
      if (!nw || !nh) return false;
      w = nw; h = nh;
      dpr = Math.min(win.devicePixelRatio || 1, 1.5);
      var W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      R = Math.min(w, h) * 0.4; cx = w / 2; cy = h / 2;
      var want = Math.round(CN.clamp(R * R * 0.19, 2600, 11000));
      if (!P || Math.abs(want - wantN) / wantN > 0.25) { wantN = want; buildPoints(want); }
      buildSprite();
      return true;
    }

    var cT = 1, sT = 0, ct = Math.cos(TILT), st = Math.sin(TILT), px = 0, py = 0, pz = 0;
    function project(x, y, z) {
      var x1 = x * cT + z * sT, z1 = z * cT - x * sT;
      px = x1; py = y * ct - z1 * st; pz = y * st + z1 * ct;
    }

    function drawDots(c) {
      var i, n = 0, bi;
      for (bi = 0; bi < NB; bi++) bCnt[bi] = 0;
      for (i = 0; i < P.length; i += 4) {
        project(P[i], P[i + 1], P[i + 2]);
        if (P[i + 3]) bi = pz >= 0 ? Math.round((0.42 + 0.58 * pz) * (NB - 1)) : (pz > -0.55 ? 2 : 1);
        else if (pz > 0.08) bi = 1 + Math.round(pz * 1.6);
        else continue;
        SX[n] = cx + px * R; SY[n] = cy - py * R; SB[n] = bi;
        bCnt[bi]++; n++;
      }
      bOff[0] = 0;
      for (bi = 0; bi < NB; bi++) { bOff[bi + 1] = bOff[bi] + bCnt[bi]; bPos[bi] = bOff[bi]; }
      for (i = 0; i < n; i++) ORD[bPos[SB[i]]++] = i;
      /* squares this small read as dots and are far cheaper to raster than arc paths */
      c.fillStyle = dotFill;
      for (bi = 0; bi < NB; bi++) {
        if (!bCnt[bi]) continue;
        var d = RAD[bi] * 2, o = RAD[bi];
        c.globalAlpha = ALPHA[bi];
        for (var qq = bOff[bi], qe = bOff[bi + 1]; qq < qe; qq++) {
          var j = ORD[qq];
          c.fillRect(SX[j] - o, SY[j] - o, d, d);
        }
      }
      c.globalAlpha = 1;
    }

    function drawCities(c) {
      for (var i = 0; i < cities.length; i++) {
        var v = cities[i];
        project(v[0], v[1], v[2]);
        if (pz <= 0.02) continue;
        var x = cx + px * R, y = cy - py * R;
        c.globalAlpha = 0.22 * pz;
        c.strokeStyle = rgba(ARC, 1);
        c.lineWidth = 1;
        c.beginPath(); c.arc(x, y, 4, 0, TAU); c.stroke();
        c.globalAlpha = 0.45 + 0.5 * pz;
        c.fillStyle = rgba(ICE, 1);
        c.beginPath(); c.arc(x, y, 1.5, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }

    /* project one arc's samples; a sample is hidden only when it is behind the sphere's disk */
    function projectArc(arc) {
      var p = arc.pts;
      for (var k = 0; k <= K; k++) {
        project(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
        AX[k] = cx + px * R; AY[k] = cy - py * R;
        AV[k] = (pz >= 0 || px * px + py * py > 1) ? 1 : 0;
      }
    }

    function pointAt(u) {
      var f = CN.clamp(u, 0, 1) * K, k = Math.min(K - 1, Math.floor(f)), t = f - k;
      return { x: AX[k] + (AX[k + 1] - AX[k]) * t, y: AY[k] + (AY[k + 1] - AY[k]) * t, v: AV[k] && AV[k + 1] };
    }

    /* stroke the arc between u0 and u1 in a few bands, alpha easing from a0 to a1 */
    function strokeRange(c, u0, u1, a0, a1, lw) {
      if (u1 - u0 < 0.002) return;
      var bands = 4;
      c.lineWidth = lw;
      for (var bnd = 0; bnd < bands; bnd++) {
        var s0 = u0 + (u1 - u0) * bnd / bands, s1 = u0 + (u1 - u0) * (bnd + 1) / bands;
        var a = a0 + (a1 - a0) * (bnd + 0.5) / bands;
        if (a <= 0.005) continue;
        c.strokeStyle = rgba(ARC, a.toFixed(3));
        c.beginPath();
        var open = false, k0 = Math.ceil(s0 * K), k1 = Math.floor(s1 * K);
        var p0 = pointAt(s0);
        if (p0.v) { c.moveTo(p0.x, p0.y); open = true; }
        for (var k = k0; k <= k1; k++) {
          if (AV[k]) { if (open) c.lineTo(AX[k], AY[k]); else { c.moveTo(AX[k], AY[k]); open = true; } } else open = false;
        }
        var p1 = pointAt(s1);
        if (p1.v && open) c.lineTo(p1.x, p1.y);
        c.stroke();
      }
    }

    function dotAt(c, u, scale) {
      var p = pointAt(u);
      if (!p.v || !sprite) return;
      var S = 22 * scale;
      c.drawImage(sprite, p.x - S / 2, p.y - S / 2, S, S);
    }

    function drawArcs(c) {
      c.lineCap = "round";
      for (var i = 0; i < arcs.length; i++) {
        var arc = arcs[i];
        projectArc(arc);
        if (still) { strokeRange(c, 0, 1, 0.18, 0.4, 1); continue; }
        var t = (sec + PERIOD - arc.off) % PERIOD;
        if (t > T_DRAW + T_PULSE + T_FADE + 0.9) continue;
        if (t < T_DRAW) {
          var hd = smooth(t / T_DRAW);
          strokeRange(c, 0, hd, 0.06, 0.62, 1.1);
          dotAt(c, hd, 0.9);
        } else if (t < T_DRAW + T_PULSE) {
          var u = smooth((t - T_DRAW) / T_PULSE);
          strokeRange(c, 0, 1, 0.26, 0.26, 1);
          strokeRange(c, Math.max(0, u - 0.16), u, 0, 0.75, 1.4);
          dotAt(c, u, 1);
        } else if (t < T_DRAW + T_PULSE + T_FADE) {
          var f = 1 - smooth((t - T_DRAW - T_PULSE) / T_FADE);
          strokeRange(c, 0, 1, 0.26 * f, 0.26 * f, 1);
        }
        /* a quiet ring where the pulse lands */
        var rt = t - T_DRAW - T_PULSE;
        if (rt >= 0 && rt < 0.9) {
          var e = arc.end;
          project(e[0], e[1], e[2]);
          if (pz > 0) {
            var k = rt / 0.9;
            c.strokeStyle = rgba(ARC, ((1 - k) * 0.6 * pz).toFixed(3));
            c.lineWidth = 1;
            c.beginPath(); c.arc(cx + px * R, cy - py * R, 3 + k * 11, 0, TAU); c.stroke();
          }
        }
      }
    }

    function draw() {
      if (!w || !P) return;
      var th = THETA0 + (still ? 0 : OMEGA * sec);
      cT = Math.cos(th); sT = Math.sin(th);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawDots(ctx);
      drawCities(ctx);
      drawArcs(ctx);
    }

    buildArcs();

    var lp = CN.loop(function (t) {
      if (lastT && coarse && t - lastT < 30) return; /* about 30 fps on touch devices */
      var d = lastT ? Math.min(100, t - lastT) : 16;
      lastT = t;
      sec += d / 1000;
      draw();
    });

    var ro = null;
    function measure() { if (setSize(cv.clientWidth, cv.clientHeight) && !lp.running()) draw(); }
    if ("ResizeObserver" in win) {
      ro = new ResizeObserver(function (entries) {
        var r = entries[entries.length - 1].contentRect;
        if (setSize(r.width, r.height) && !lp.running()) draw();
      });
      ro.observe(cv);
    } else {
      win.addEventListener("resize", measure, { passive: true });
    }
    measure();

    /* Pause (DESIGN rule 5: anything that moves for more than 5 s has one). Pausing freezes the
       current frame; Play carries on from the same moment. Hidden when the globe is a still frame. */
    var paused = false;
    var btn = pauseButton(cv);
    function syncButton() { if (btn) btn.hidden = still; }
    function onPause() {
      paused = !paused;
      btn.setAttribute("aria-pressed", paused ? "true" : "false");
      if (paused) { lp.stop(); draw(); } else if (onScreen && !still) { lastT = 0; lp.start(); }
    }
    if (btn) { btn.addEventListener("click", onPause); syncButton(); }

    /* starts a little early so the first frame is ready when the globe scrolls in */
    var onScreen = false;
    var stopView = CN.inView(cv, function (vis) {
      onScreen = vis;
      if (still || paused) { if (vis) measure(); return; }
      if (vis) { lastT = 0; lp.start(); } else lp.stop();
    }, { margin: "80px 0px" });

    /* the reduced-motion setting can change while the page is open */
    var mq = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
    function onPref() {
      still = CN.reduced() || CN.saveData();
      syncButton();
      if (still || paused) { lp.stop(); draw(); } else if (onScreen) { lastT = 0; lp.start(); }
    }
    if (mq) { if (mq.addEventListener) mq.addEventListener("change", onPref); else if (mq.addListener) mq.addListener(onPref); }

    return {
      pause: function () { lp.stop(); },
      resume: function () { if (!still && !paused) lp.start(); },
      destroy: function () {
        lp.stop(); stopView();
        if (btn) btn.removeEventListener("click", onPause);
        if (ro) ro.disconnect();
        win.removeEventListener("resize", measure);
        if (mq) { if (mq.removeEventListener) mq.removeEventListener("change", onPref); else if (mq.removeListener) mq.removeListener(onPref); }
      }
    };
  }

  /* The globe's Pause: button.cn-globe-pause in .cn-globe-box (index.html). If the markup lacks
     it, the same button is added here, so the control only ever exists where JS can drive it. */
  function pauseButton(cv) {
    var box = cv.parentNode;
    if (!box) return null;
    var b = CN.qs(".cn-globe-pause", box);
    if (b) return b;
    b = doc.createElement("button");
    b.type = "button";
    b.className = "cn-globe-pause";
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", "Pause the globe animation");
    b.title = "Pause the globe animation";
    var icon = doc.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    b.appendChild(icon);
    box.appendChild(b);
    return b;
  }

  /* index.html has no data-cn hook on the canvas, so add it here and use the shared lazy init */
  CN.onReady(function () {
    var cv = doc.getElementById("cnGlobe");
    if (!cv || !cv.getContext) return;
    if (!cv.hasAttribute("data-cn")) cv.setAttribute("data-cn", "globe");
    CN.register("globe", init);
  });
})();
