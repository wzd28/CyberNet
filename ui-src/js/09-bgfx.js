/* CyberNet UI: section background motion, "signal lines" (owner: aurora).
   Owner feedback on v4: "there's no background animation or motion graphics". The dark sections
   now carry a calm, clearly visible motion layer: ribbons of fine light lines in cyan and blue
   that slowly undulate and twist like silk, with a few bright pulses travelling along them
   (signals moving through the network). One technique everywhere, tuned per section.

   Where (markup is not touched: each layer is one aria-hidden <div class="cn-bgfx"> + <canvas>
   added once at start-up, styled in 04-bgfx.css):
   - Home: #cnThreats, #cnFlow and the closing statement (.home-quote). Each layer is the first
     child of its section, absolutely positioned at z-index -1 inside the section's own stacking
     context (the sections are isolated), so it paints over the section's ground and under its
     content. The hero is the globe's (10-hero3d.js).
   - Every other page: one shared, softer band behind the top of the page (appended to <body>,
     z-index -1 in the root context: above the ground, under everything else). Hidden on Home.
     It rests while the visitor types in a field on the page.

   Composition: each ribbon can be anchored to an element of its section (the shield in the tool
   tour and in the closing statement), so the light runs through it at every screen size. Text
   stays clean: behind the headlines and paragraphs listed as "quiet" the lines are dimmed (a
   soft destination-out pass) and pulses fade out. Anchors and quiet zones are measured in the
   ResizeObserver callback, when layout is already clean (no forced layout).

   Budget (DESIGN.md v4.1; v4.2 sharpness pass, owner: "the lines background with light passing
   looks a little off quality on the phone"):
   - 2D canvases only, no WebGL (the hero globe keeps the one WebGL context).
   - One band canvas per ribbon: each canvas covers only the strip its ribbon can reach (its
     centre line, wave, tilt, spread and the pulse glow), not the whole section. A phone section
     is 2-3 screens tall but a ribbon is about 300-370 CSS px, so the pixels drawn per frame fall
     by 3-5x, and that budget buys real sharpness instead.
   - Sharp at the screen's own density: up to 2 canvas pixels per CSS pixel on desktop (HiDPI
     laptops) and 2.5 on touch screens (a 3x phone is upscaled by 1.2x at most, never the old
     0.8x canvas stretched 3.75x, which made the hairlines soft and stepped), with a pixel cap
     per band (2.2 M desktop, 1.1 M touch). Hairlines are 1 CSS px with round joins.
   - 30 fps everywhere (touch used to run at 20 fps, which made the pulses step), paced by a
     timer so the page only renders the frames that are drawn (a plain rAF loop would run the
     whole document lifecycle at 60 or 120 fps; every frame also re-ticks the page's other
     running CSS animations). Only layers that are on screen are drawn (IntersectionObserver);
     nothing runs while none is visible, while the tab is hidden or while the phone menu sheet
     covers the page (CN.onCover). After load, while the
     browser is idle, each off-screen layer gets one static frame, so no section scrolls in
     blank.
   - Fewer lines and pulses on touch devices. If drawing gets slow on a weak device, a layer
     steps its line count and resolution down by itself (twice at most).
   - Each frame touches only canvas pixels, never the DOM, so the legacy body-wide
     MutationObservers never see it.
   - Pause motion (html.cn-still, CN.onStill) and prefers-reduced-motion: the loop stops and every
     layer rests on its current frame (a calm static frame when it was never animated). Save-Data
     gets the static frame too.
   - No pointer input: nothing follows the cursor. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN || !window.HTMLCanvasElement) return;
  var doc = document, win = window;
  var TAU = Math.PI * 2;

  var touch = !CN.finePointer();
  // 30 fps everywhere (a steady cadence; 20 made the pulses step on phones).
  var FRAME_MS = 1000 / 30;
  // Canvas density: the screen's own, up to 2 (desktop) / 2.5 (touch), capped per band canvas.
  var DPR_MAX = touch ? 2.5 : 2, MAX_PX = touch ? 1.1e6 : 2.2e6;
  // Sharp 1 CSS px hairlines; touch screens get a little more strength so the light still reads.
  var LINE_W = 1, LINE_A = touch ? 1.4 : 1.3;

  /* Presets. Ribbon geometry is in units of S, a size that follows the layer's width
     (clamp(w * .34, 250, 470) CSS px), so a phone gets the same look at its own scale:
     y       centre of the ribbon at mid-width, as a fraction of the layer's height, or the
             centre of the `anchor` element (a selector inside the section) when it is laid out
     tilt    rise across the full width (in S; negative rises to the right)
     amp     wave amplitude (S); freq: waves per 1000 CSS px; speed: wave speed (rad/s)
     width   thickness of the ribbon (S); twist: twists per 1000 CSS px; pin: a knot at mid-width
     a       line strength (0..1); n: lines on desktop (touch gets about 60%)
     Pulses: count on desktop / touch, and mode "run" (edge to edge) or "in" (from the edges to
     the centre, where they fade: signals arriving at the shield). quiet: text kept clean. */
  var PRESETS = {
    threats: {
      ribbons: [
        { y: .2, anchor: ".cn-head", tilt: -.42, amp: .2, freq: .5, speed: .24, width: .42, twist: .4, a: 1, n: 34, ph: .6 },
        { y: .86, tilt: .34, amp: .16, freq: .46, speed: -.2, width: .34, twist: .34, a: .8, n: 26, ph: 2.4 }
      ],
      pulses: [4, 2], mode: "run",
      quiet: ".cn-head > h2, .cn-head > p"
    },
    flow: {
      ribbons: [
        { y: .6, anchor: ".cn-flow-stage", tilt: -.3, amp: .2, freq: .5, speed: .22, width: .44, twist: .4, a: 1, n: 36, ph: 1.4 }
      ],
      pulses: [4, 2], mode: "run",
      quiet: ".cn-head > h2, .cn-head > p, .cn-reel-tab"
    },
    quote: {
      ribbons: [
        { y: .3, anchor: ".cn-close-shield", tilt: 0, amp: .12, freq: .62, speed: .26, width: .42, twist: .5, a: 1, n: 34, ph: 0, pin: true }
      ],
      pulses: [5, 3], mode: "in",
      quiet: "[data-cn='scrub']"
    },
    page: {
      ribbons: [
        { y: .44, tilt: -.38, amp: .16, freq: .46, speed: .2, width: .36, twist: .38, a: .7, n: 28, ph: 3.1 }
      ],
      pulses: [2, 1], mode: "run", pulseA: .7,
      quiet: ".page.active-page :is(.feature-page-header, .learn-hero, .pricing-head, .about-top) :is(h1, h2, p), .page.active-page > .cn-operator"
    }
  };

  var CYAN = "34,211,238", BLUE = "96,165,250", ICE = "230,251,255";

  /* Sprites painted once: a soft glow dot (the head of a pulse) and a soft-edged box (the
     quiet zones behind text). */
  var dot = null, box = null;
  function glowDot() {
    if (dot) return dot;
    var c = doc.createElement("canvas"), s = 96;
    c.width = c.height = s;
    var g = c.getContext("2d");
    if (!g) return null;
    var r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, "rgba(" + ICE + ",1)");
    r.addColorStop(.12, "rgba(" + ICE + ",.85)");
    r.addColorStop(.3, "rgba(" + CYAN + ",.32)");
    r.addColorStop(1, "rgba(" + CYAN + ",0)");
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
    dot = c;
    return dot;
  }
  function softBox() {
    if (box) return box;
    var c = doc.createElement("canvas"), s = 64;
    c.width = c.height = s;
    var g = c.getContext("2d");
    if (!g || !g.createImageData) return null;
    var img = g.createImageData(s, s), d = img.data;
    function ramp(i) { var u = Math.min(i + .5, s - i - .5) / (s * .32); u = Math.min(1, u); return u * u * (3 - 2 * u); }
    for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
      var o = (y * s + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 0;
      d[o + 3] = Math.round(255 * ramp(x) * ramp(y));
    }
    g.putImageData(img, 0, 0);
    box = c;
    return box;
  }

  /* ---------------------------------------------------------------- one layer ---------- */
  /* A layer: the wrapper over the section, and one band canvas per ribbon inside it. */
  function Field(host, name, opts) {
    var P = PRESETS[name];
    var wrap = doc.createElement("div");
    wrap.className = "cn-bgfx cn-bgfx--" + name;
    wrap.setAttribute("aria-hidden", "true");
    var bands = [];
    for (var i = 0; i < P.ribbons.length; i++) {
      var cv = doc.createElement("canvas");
      var ctx = cv.getContext("2d", { alpha: true });
      if (!ctx) return null;
      wrap.appendChild(cv);
      bands.push({ i: i, cv: cv, ctx: ctx, top: 0, h: 0, scale: 1, grad: null, gw: 0, shown: false });
    }
    if (opts && opts.append) host.appendChild(wrap); else host.insertBefore(wrap, host.firstChild);
    return {
      name: name, host: host, wrap: wrap, bands: bands, P: P,
      w: 0, h: 0, S: 300, on: false, drawn: false, rest: false,
      quality: 0, cost: 0, slow: 0, pulses: [], anchors: [], zones: []
    };
  }

  function lineCount(f, rb) {
    var n = rb.n;
    if (touch) n = Math.round(n * .6);
    if (f.quality > 0) n = Math.round(n * Math.pow(.72, f.quality));
    return Math.max(8, n);
  }

  function size(f, w, h) {
    if (w < 2 || h < 2) { f.w = f.h = 0; return; }
    f.w = w; f.h = h;
    f.S = Math.min(470, Math.max(250, w * .34));
    f.drawn = false;
  }
  /* How far a ribbon can reach above and below its centre line (CSS px): the tilt, the wave,
     half the spread, the shimmer of each line and the glow round a pulse head. */
  function reach(f, rb) {
    var S = f.S;
    return Math.abs(rb.tilt) * S / 2 + rb.amp * S + rb.width * S / 2 + .022 * S + 24;
  }
  /* Place and size each band canvas on its ribbon (after measure(), which finds the anchors).
     Writes only the canvases' own top/height and bitmap size, and only when they change. */
  function layoutBands(f) {
    if (!f.w) return;
    var dpr = win.devicePixelRatio || 1;
    for (var k = 0; k < f.bands.length; k++) {
      var b = f.bands[k], rb = f.P.ribbons[b.i], cy = ribbonY(f, b.i, rb), r = reach(f, rb);
      var top = Math.max(0, Math.floor(cy - r)), bot = Math.min(f.h, Math.ceil(cy + r));
      var hh = Math.max(0, bot - top);
      b.top = top; b.h = hh;
      if (hh < 2) { b.cv.style.display = "none"; continue; }
      if (b.cv.style.display) b.cv.style.display = "";
      var s = Math.min(dpr, DPR_MAX);
      if (f.quality > 0) s *= Math.pow(.85, f.quality);
      s = Math.min(s, Math.sqrt(MAX_PX / (f.w * hh)));
      var bw = Math.max(2, Math.round(f.w * s)), bh = Math.max(2, Math.round(hh * s));
      b.scale = bw / f.w;
      var st = b.cv.style, tp = top + "px", hp = hh + "px";
      if (st.top !== tp) st.top = tp;
      if (st.height !== hp) st.height = hp;
      if (b.cv.width !== bw || b.cv.height !== bh) { b.cv.width = bw; b.cv.height = bh; b.grad = null; }
      if (!b.grad || b.gw !== f.w) {
        // One horizontal gradient for every line of the band: the ribbon fades in and out at the edges.
        var g = b.ctx.createLinearGradient(0, 0, f.w, 0);
        g.addColorStop(0, "rgba(" + CYAN + ",0)");
        g.addColorStop(.12, "rgba(" + CYAN + ",.85)");
        g.addColorStop(.5, "rgba(125,211,252,1)");
        g.addColorStop(.88, "rgba(" + BLUE + ",.85)");
        g.addColorStop(1, "rgba(" + BLUE + ",0)");
        b.grad = g; b.gw = f.w;
      }
    }
    f.drawn = false;
  }

  /* Anchors and quiet zones, in the layer's CSS pixels. Called from the ResizeObserver
     callback (layout is clean there, so the rect reads cost nothing extra). */
  function measure(f) {
    var P = f.P, base = f.wrap.getBoundingClientRect(), i;
    f.anchors = [];
    for (i = 0; i < P.ribbons.length; i++) {
      var sel = P.ribbons[i].anchor, el = sel ? f.host.querySelector(sel) : null, y = null;
      if (el) {
        var r = el.getBoundingClientRect();
        if (r.height > 0) y = r.top - base.top + r.height / 2;
      }
      f.anchors.push(y);
    }
    f.zones = [];
    if (!P.quiet) return;
    var scope = f.name === "page" ? doc : f.host, list = [];
    try { list = scope.querySelectorAll(P.quiet); } catch (e) { /* :is() unsupported: no quiet zones */ }
    for (i = 0; i < list.length && f.zones.length < 6; i++) {
      var q = list[i].getBoundingClientRect();
      if (q.width < 1 || q.height < 1) continue;
      var x0 = q.left - base.left, y0 = q.top - base.top;
      if (y0 > base.height || y0 + q.height < 0) continue;
      f.zones.push({ x: x0, y: y0, w: q.width, h: q.height });
    }
  }

  function ribbonY(f, i, rb) {
    var a = f.anchors[i];
    return a != null ? a : rb.y * f.h;
  }

  /* The ribbon at x (CSS px) and time t (s): the centre line and the signed half-spread. */
  function centre(f, rb, cy, x, t) {
    var X = x / 1000, u = x / f.w, S = f.S;
    var wave = Math.sin(TAU * rb.freq * X + t * rb.speed + rb.ph) * .72 +
      Math.sin(TAU * rb.freq * 1.83 * X - t * rb.speed * .77 + rb.ph * 1.7) * .28;
    return cy + rb.tilt * S * (u - .5) + rb.amp * S * wave;
  }
  function spread(f, rb, x, t) {
    var X = x / 1000;
    if (rb.pin) {
      // A knot at mid-width (behind the shield): the ribbon narrows there and fans out.
      var d = Math.abs(x / f.w - .5) * 2;
      return rb.width * f.S * (.08 + .92 * Math.min(1, d * 1.2)) * Math.cos(TAU * rb.twist * X * .5 + t * rb.speed * .5 + rb.ph);
    }
    return rb.width * f.S * Math.cos(TAU * rb.twist * X + t * rb.speed * .6 + rb.ph * .5);
  }
  function lineY(f, q, k, x, t, c, sp) {
    return c + (q - .5) * sp + .022 * f.S * Math.sin(TAU * 1.4 * x / 1000 + t * .45 + k * .9);
  }

  var cxBuf = new Float32Array(160), spBuf = new Float32Array(160), topBuf = new Float32Array(160), botBuf = new Float32Array(160);

  function drawRibbon(f, i, t, ctx, grad) {
    var rb = f.P.ribbons[i], cy = ribbonY(f, i, rb), w = f.w, n = lineCount(f, rb);
    var step = touch ? 14 : 18, m = Math.min(150, Math.max(16, Math.ceil((w + 40) / step)));
    var dx = (w + 40) / m, j, k, x, y;
    for (j = 0; j <= m; j++) {
      x = -20 + j * dx;
      cxBuf[j] = centre(f, rb, cy, x, t);
      spBuf[j] = spread(f, rb, x, t);
    }
    ctx.strokeStyle = grad;
    ctx.fillStyle = grad;
    ctx.lineWidth = LINE_W;
    ctx.lineJoin = "round";
    for (k = 0; k < n; k++) {
      var q = k / (n - 1), e = Math.abs(q - .5) * 2;
      // The edges of the ribbon catch more light than its middle, like a fold of silk.
      ctx.globalAlpha = Math.min(1, LINE_A * rb.a * (.13 + .22 * e * e + .06 * (1 - e)));
      ctx.beginPath();
      for (j = 0; j <= m; j++) {
        x = -20 + j * dx;
        y = lineY(f, q, k, x, t, cxBuf[j], spBuf[j]);
        if (k === 0) topBuf[j] = y; else if (k === n - 1) botBuf[j] = y;
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // The silk itself: a faint fill between the outer lines (it follows every twist).
    ctx.globalAlpha = LINE_A * rb.a * .07;
    ctx.beginPath();
    for (j = 0; j <= m; j++) { x = -20 + j * dx; if (j) ctx.lineTo(x, topBuf[j]); else ctx.moveTo(x, topBuf[j]); }
    for (j = m; j >= 0; j--) ctx.lineTo(-20 + j * dx, botBuf[j]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* How much a point sits inside a quiet zone (0 outside .. 1 well inside, soft over 48px). */
  function quietAt(f, x, y) {
    var z = f.zones, best = 0;
    for (var i = 0; i < z.length; i++) {
      var r = z[i];
      var dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      var d = Math.sqrt(dx * dx + dy * dy), v = d >= 48 ? 0 : 1 - d / 48;
      if (v > best) best = v;
    }
    return best;
  }

  /* Pulses: a bright head with a fading tail that runs along one line of a ribbon. */
  function spawn(f, now, warm) {
    var P = f.P, i = (Math.random() * P.ribbons.length) | 0, rb = P.ribbons[i];
    var n = lineCount(f, rb);
    return {
      i: i, k: (Math.random() * n) | 0, n: n,
      t0: now + (warm ? -Math.random() * 3 : .3 + Math.random() * 1.8),
      dur: (P.mode === "in" ? 3.2 : 5) + Math.random() * 2.6,
      dir: Math.random() < .5 ? 1 : -1
    };
  }
  var xs = new Float32Array(16), ys = new Float32Array(16);
  /* Keep the pulse list full and replace the finished ones (once per frame, for all bands). */
  function updatePulses(f, t, still) {
    var want = f.P.pulses[touch ? 1 : 0], list = f.pulses;
    while (list.length < want) list.push(spawn(f, t, true));
    if (still) return;
    for (var i = 0; i < list.length; i++) if ((t - list[i].t0) / list[i].dur >= 1) list[i] = spawn(f, t, false);
  }
  /* The pulses that run on ribbon `ri` (drawn into that ribbon's band). */
  function drawPulses(f, t, ctx, ri) {
    var P = f.P, list = f.pulses, i, j;
    var img = glowDot(), w = f.w, inMode = P.mode === "in", pa = P.pulseA || 1;
    var tail = Math.min(touch ? 150 : 260, w * .3), N = 14;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (i = 0; i < list.length; i++) {
      var p = list[i], u = (t - p.t0) / p.dur;
      if (p.i !== ri || u >= 1 || u <= 0) continue;
      var rb = P.ribbons[p.i], cy = ribbonY(f, p.i, rb), q = Math.min(p.k, p.n - 1) / (p.n - 1);
      var hx, env;
      if (inMode) {
        // From one edge to the centre, fading out as it arrives.
        hx = p.dir > 0 ? (-.08 + .58 * u) * w : (1.08 - .58 * u) * w;
        env = Math.min(1, u * 5) * (1 - u * u);
      } else {
        hx = p.dir > 0 ? (-.15 + 1.3 * u) * w : (1.15 - 1.3 * u) * w;
        env = Math.min(1, u * 6, (1 - u) * 6);
      }
      var x0 = hx - p.dir * tail;
      for (j = 0; j <= N; j++) {
        var x = x0 + (hx - x0) * (j / N);
        xs[j] = x;
        ys[j] = lineY(f, q, p.k, x, t, centre(f, rb, cy, x, t), spread(f, rb, x, t));
      }
      env *= pa * (1 - .9 * quietAt(f, hx, ys[N]));
      if (env <= .01) continue;
      var g = ctx.createLinearGradient(xs[0], ys[0], xs[N], ys[N]);
      g.addColorStop(0, "rgba(" + CYAN + ",0)");
      g.addColorStop(.65, "rgba(" + CYAN + "," + (.4 * env).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + ICE + "," + (.95 * env).toFixed(3) + ")");
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      for (j = 1; j <= N; j++) ctx.lineTo(xs[j], ys[j]);
      ctx.globalAlpha = .3;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      if (img) {
        var r = 13 + 3 * env;
        ctx.globalAlpha = env;
        ctx.drawImage(img, hx - r, ys[N] - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function draw(f, t, still) {
    if (!f.w || !f.h) return;
    var t0 = CN.now(), i, k;
    updatePulses(f, t, still);
    var sb = f.zones.length ? softBox() : null;
    for (k = 0; k < f.bands.length; k++) {
      var b = f.bands[k], ctx = b.ctx;
      if (b.h < 2 || !b.grad) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, b.cv.width, b.cv.height);
      // Section coordinates: the band's top edge sits at b.top.
      ctx.setTransform(b.scale, 0, 0, b.scale, 0, -b.top * b.scale);
      ctx.globalCompositeOperation = "lighter";
      drawRibbon(f, b.i, t, ctx, b.grad);
      // Quiet zones: dim the lines behind the copy (soft-edged, 72% out).
      if (sb) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = .72;
        for (i = 0; i < f.zones.length; i++) {
          var z = f.zones[i], pad = 56;
          if (z.y + z.h + pad < b.top || z.y - pad > b.top + b.h) continue;
          ctx.drawImage(sb, z.x - pad, z.y - pad, z.w + pad * 2, z.h + pad * 2);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";
      drawPulses(f, t, ctx, b.i);
      if (!b.shown) { b.shown = true; b.cv.style.opacity = "1"; }
    }
    f.drawn = true;
    if (still) return;
    // Self-tuning: if a layer keeps costing more than its budget, step it down (twice at most).
    var cost = CN.now() - t0;
    f.cost = f.cost ? f.cost * .9 + cost * .1 : cost;
    if (f.cost > (touch ? 6 : 4.5) && f.quality < 2) {
      if (++f.slow > 45) { f.quality++; f.slow = 0; f.cost = 0; f.pulses.length = 0; layoutBands(f); }
    } else f.slow = 0;
  }

  /* ---------------------------------------------------------------- the scheduler --------
     A timer waits out most of the frame interval (less 8 ms of slack), then asks for one
     animation frame, so the next frame lands on the vsync at 33 ms on 60, 90 and 120 Hz
     screens: the browser renders 30 frames a second for this, not 60 or 120.
     While the page is scrolling, the lines hold their frame (no animation frames are asked
     for) and carry on from the same moment 140 ms after the last scroll event: the main thread
     stays free for the scroll itself (Lenis on desktop, scroll-linked effects everywhere), and
     a held frame is invisible while the whole page is moving. */
  var fields = [], clock = 7.5, last = 0, running = false, timer = 0, raf = 0;
  var scrolling = false, scrollT = 0;
  function onScroll() {
    scrolling = true;
    clearTimeout(scrollT);
    scrollT = setTimeout(function () { scrolling = false; }, 140);
  }
  function frozen() { return CN.reduced() || CN.saveData(); }
  function frame(now) {
    raf = 0;
    if (!running) return;
    var dt = last ? Math.min(100, now - last) : FRAME_MS;
    last = now;
    clock += dt / 1000;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.on && !f.rest) draw(f, clock, false);
    }
    timer = setTimeout(ask, Math.max(0, FRAME_MS - 8 - (CN.now() - now)));
  }
  function ask() {
    timer = 0;
    if (!running || raf) return;
    if (scrolling) { last = 0; timer = setTimeout(ask, 70); return; }   /* hold while scrolling */
    raf = win.requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true; last = 0;
    win.addEventListener("scroll", onScroll, { passive: true });
    ask();
  }
  function stop() {
    running = false;
    win.removeEventListener("scroll", onScroll);
    if (timer) { clearTimeout(timer); timer = 0; }
    if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
  }
  function update() {
    var any = false;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.on && !f.rest) any = true;
      // A layer that comes into view while motion is off gets one calm frame, then rests.
      if (f.on && !f.drawn && (frozen() || f.rest)) draw(f, clock, true);
    }
    if (any && !frozen() && !CN.hidden() && !CN.covered()) start(); else stop();
  }

  function watch(f) {
    // A GPU reset can drop a 2D canvas's pixels: redraw (the loop does it anyway while running).
    f.bands.forEach(function (b) { b.cv.addEventListener("contextrestored", function () { f.drawn = false; update(); }); });
    var ro = "ResizeObserver" in win ? new ResizeObserver(function () {
      var r = f.wrap.getBoundingClientRect();
      size(f, Math.round(r.width), Math.round(r.height));
      if (f.w) { measure(f); layoutBands(f); }
      if (f.on && (frozen() || f.rest)) draw(f, clock, true);
    }) : null;
    if (ro) {
      ro.observe(f.wrap);
      // The copy and anchors can move without the layer changing size (fonts, a page switch).
      var watchList = [];
      f.P.ribbons.forEach(function (rb) { if (rb.anchor) watchList.push(rb.anchor); });
      if (f.P.quiet) watchList.push(f.P.quiet.replace(/\.page\.active-page /g, ".page "));
      var scope = f.name === "page" ? doc : f.host;
      watchList.forEach(function (sel) {
        try { Array.prototype.forEach.call(scope.querySelectorAll(sel), function (el) { ro.observe(el); }); } catch (e) { /* old engines */ }
      });
    }
    CN.inView(f.wrap, function (vis, entry) {
      if (!ro && vis && entry && entry.boundingClientRect) {
        size(f, Math.round(entry.boundingClientRect.width), Math.round(entry.boundingClientRect.height));
        layoutBands(f);
      }
      f.on = !!vis;
      update();
    }, { margin: "60px 0px" });
  }

  function add(host, name, opts) {
    if (!host || host.__cnBgfx) return null;
    host.__cnBgfx = true;
    var f = Field(host, name, opts);
    if (!f) return null;
    fields.push(f);
    watch(f);
    return f;
  }

  CN.onReady(function () {
    var home = doc.getElementById("home");
    if (home) {
      add(doc.getElementById("cnThreats"), "threats");
      add(doc.getElementById("cnFlow"), "flow");
      add(CN.qs("#home > .home-quote"), "quote");
    }
    // The band behind the top of every other page (one layer, shown while that page is open).
    var band = doc.body ? add(doc.body, "page", { append: true }) : null;
    if (band) {
      band.wrap.style.display = "none";
      CN.onPage(function (id) {
        var show = !!id && id !== "home";
        band.wrap.style.display = show ? "" : "none";
        band.pulses.length = 0;
      });
      // While the visitor types in a field on the page, the band rests (calm, and no frames).
      var typing = function (e) {
        var t = e.target, on = e.type === "focusin" && t && t.matches && t.matches("input, textarea, select, [contenteditable='true']");
        if (band.rest !== on) { band.rest = on; update(); }
      };
      doc.addEventListener("focusin", typing);
      doc.addEventListener("focusout", typing);
    }
    CN.onStill(function () { update(); });
    /* for checks and tuning: per layer, its average draw cost (ms), quality step and bands */
    CN.bgfxStats = function () {
      return fields.map(function (f) {
        return { name: f.name, on: f.on, cost: +f.cost.toFixed(2), quality: f.quality, bands: f.bands.map(function (b) { return b.cv.width + "x" + b.cv.height; }) };
      });
    };
    CN.onMotion(function () { update(); });
    CN.onVisibility(function () { update(); });
    CN.onCover(function () { update(); });
    // Once the page has loaded and the browser is idle, give every sized layer its first frame,
    // so a section never scrolls in blank and then fades its light in (one draw per layer).
    CN.afterLoad(function () {
      for (var i = 0; i < fields.length; i++) if (fields[i].w && !fields[i].drawn) draw(fields[i], clock, true);
    });
  });
})();
