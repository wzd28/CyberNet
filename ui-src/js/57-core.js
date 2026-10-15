/* Home "What CyberNet AI does" (#cnCore): the AI core's energy plume, the chip's scroll motion
   where view timelines are missing, and the manifesto that lights up word by word (owner:
   aurora, v4.2; CSS in 27-core.css, the chip from scripts/render-3d.mjs --only=core).

   Manifesto (p[data-cn="manifesto"]): split into word spans at start-up (the markup it needs
   exists before the visitor gets there; inline spans change no layout). Each word lights from
   slate (#6e7a8c, 4.6:1) to white in reading order as the paragraph scrolls up, and dims again
   on the way back; bold words light to pure white.
   - Where view timelines exist (Chrome, Edge, Safari 26), CSS does it all: the paragraph is a
     named view timeline and each word runs its own colour animation over its own slice of it
     (--cn-a / --cn-b, written once here at start-up). No script runs while scrolling.
   - Elsewhere, while the paragraph is near the screen, each scroll frame maps its position to a
     progress and writes the colour of only the few words whose shade changed (a leaf write,
     quantised to 16 steps). Positions come from a ResizeObserver read, so a scroll frame needs
     nothing but scrollY.
   Reduced motion and Pause motion: every word is lit (CSS), nothing is written.

   Plume (canvas.cn-core-plume over the top of the chip): crystalline cyan shards and fine
   sparks rise from the core, a soft column of light stands over it, and every few seconds a
   scan ring in the shape of the CyberNet shield spreads flat across the chip (drawn in the
   chip's own plane with the axes render-3d.mjs measured). Its energy grows as the section
   comes fully into view (an IntersectionObserver ratio, eased per frame). 30 fps from a timer (the page only renders the frames that are drawn), only while
   the chip is on screen and the tab is visible; DPR up to 2 (2.5 on phones) with a pixel cap.
   Reduced motion, Pause motion and Save-Data: one still frame. Nothing follows the pointer.

   Chip: CSS runs its drift and the lid's lift on view timelines. Where those are missing, this
   file writes the same transforms from the scroll position (rig and lid only, while near the
   screen). The idle float runs only while on screen (data-cn-play on .cn-core-visual; a data
   attribute, because legacy observers watch "class"). */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, win = window, TAU = Math.PI * 2;
  var cssTimeline = !!(win.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));
  /* the words' colour runs on a named view timeline (27-core.css) */
  var cssWords = cssTimeline && CSS.supports("view-timeline: --cn-man block") && CSS.supports("animation-range: cover 10% cover 50%");

  /* from render-3d.mjs (core position and the chip's axes, as fractions of the image) */
  var CORE = [0.5, 0.4574], AX_U = [0.1078, -0.0421], AX_V = [-0.0795, -0.0561];
  /* the plume canvas covers this part of the image (27-core.css: inset 0 18% 36%) */
  var BOX = { x: 0.18, y: 0, w: 0.64, h: 0.64 };

  function still() { return CN.reduced() || CN.saveData(); }
  /* The words' scroll window, in "cover" percent of the paragraph's view timeline: from its top
     at about 86% of the screen until its middle reaches about 45%, so the last word is lit
     while the whole paragraph is still on screen (phones: 225 px tall on 844; desktops: 400 on
     900). Each word owns a slice 3.5 words wide. */
  var COVER0 = 10, COVER1 = 54, WIN = 3.5;

  /* ------------------------------------------------------------------ manifesto */
  var DIM = [110, 122, 140], LIT = [245, 247, 250], WHITE = [255, 255, 255], STEPS = 16;
  function shades(to) {
    var out = [];
    for (var i = 0; i <= STEPS; i++) {
      var t = i / STEPS;
      out.push("rgb(" + Math.round(DIM[0] + (to[0] - DIM[0]) * t) + "," + Math.round(DIM[1] + (to[1] - DIM[1]) * t) + "," + Math.round(DIM[2] + (to[2] - DIM[2]) * t) + ")");
    }
    return out;
  }
  var SH_N = shades(LIT), SH_B = shades(WHITE);

  function splitWords(p) {
    if (p.__cnWords) return p.__cnWords;
    var words = [];
    function walk(node, bold) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (k) {
        if (k.nodeType === 3) {
          var parts = k.nodeValue.split(/(\s+)/), frag = doc.createDocumentFragment();
          parts.forEach(function (s) {
            if (!s) return;
            if (/^\s+$/.test(s)) { frag.appendChild(doc.createTextNode(s)); return; }
            var w = doc.createElement("span");
            w.className = "cn-mw";
            w.textContent = s;
            frag.appendChild(w);
            words.push({ el: w, b: bold, lv: -1 });
          });
          node.replaceChild(frag, k);
        } else if (k.nodeType === 1) walk(k, bold || /^(B|STRONG)$/.test(k.nodeName));
      });
    }
    walk(p, false);
    p.__cnWords = words;
    /* each word's slice of the scroll (static: written once) */
    var n = words.length;
    words.forEach(function (w, i) {
      var a = COVER0 + (COVER1 - COVER0) * i / (n + WIN), b = COVER0 + (COVER1 - COVER0) * (i + WIN) / (n + WIN);
      w.el.style.setProperty("--cn-a", a.toFixed(2) + "%");
      w.el.style.setProperty("--cn-b", b.toFixed(2) + "%");
    });
    if (cssWords) p.classList.add("is-timeline");
    return words;
  }
  function paint(words, prog) {
    var n = words.length, W = 3.5, x = prog * (n + W);
    for (var i = 0; i < n; i++) {
      var t = (x - i) / W, w = words[i];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var lv = Math.round(t * STEPS);
      if (lv === w.lv) continue;
      w.lv = lv;
      w.el.style.color = (w.b ? SH_B : SH_N)[lv];
    }
  }

  /* ------------------------------------------------------------------ the section */
  function Core(section) {
    var p = CN.qs('[data-cn="manifesto"]', section);
    var visual = CN.qs(".cn-core-visual", section);
    var rig = visual && CN.qs(".cn-core-rig", visual);
    var lid = visual && CN.qs(".cn-core-lid", visual);
    var words = p ? splitWords(p) : [];
    var api = {};
    var raf = 0, near = false, nearNow = false;
    /* the scroll handler exists only where CSS cannot do the work */
    var needScroll = !cssWords || !cssTimeline;
    /* Where the paragraph and the visual sit in the document (CSS px), read only in a
       ResizeObserver callback, when layout is clean. A scroll frame then needs nothing but
       scrollY, so scrolling never forces a style or layout pass from here. */
    var lay = { pTop: 0, pH: 0, vTop: 0, vH: 0 };
    function readLayout() {
      var sy = win.pageYOffset || doc.documentElement.scrollTop || 0;
      if (p) { var r = p.getBoundingClientRect(); lay.pTop = r.top + sy; lay.pH = r.height; }
      if (visual) { var v = visual.getBoundingClientRect(); lay.vTop = v.top + sy; lay.vH = v.height; }
    }
    if (!needScroll) { /* CSS does it all */ }
    else if ("ResizeObserver" in win) {
      var ro = new ResizeObserver(function () { readLayout(); if (near) onScroll(); });
      ro.observe(section);
      ro.observe(doc.body);   /* anything above that changes height moves the section */
    } else { readLayout(); win.addEventListener("load", readLayout); }

    function measure() {
      raf = 0;
      var vh = win.innerHeight || doc.documentElement.clientHeight || 800;
      var sy = win.pageYOffset || doc.documentElement.scrollTop || 0;
      if (!cssWords && p && words.length && !CN.reduced()) {
        /* the same window as the CSS (COVER0 .. COVER1 percent of the paragraph's pass) */
        var c = (vh - (lay.pTop - sy)) / Math.max(1, vh + lay.pH) * 100;
        paint(words, CN.clamp((c - COVER0) / (COVER1 - COVER0), 0, 1));
      }
      if (!cssTimeline && rig && !CN.reduced()) {
        var btop = lay.vTop - sy;
        var u = CN.clamp((vh - btop) / (vh + lay.vH), 0, 1);
        rig.style.transform = "translate3d(0," + (8 - 14 * u).toFixed(2) + "%,0) rotate(" + (-3.5 + 6 * u).toFixed(2) + "deg) scale(" + (.93 + .1 * u).toFixed(4) + ")";
        if (lid) lid.style.transform = "translate3d(0," + (-5.5 * CN.clamp((u - .22) / .4, 0, 1)).toFixed(2) + "%,0)";
      }
    }
    function onScroll() { if (!raf) raf = win.requestAnimationFrame(measure); }
    function bind(on) {
      if (on === near) return;
      near = on;
      var m = on ? "addEventListener" : "removeEventListener";
      win[m]("scroll", onScroll, { passive: true });
      win[m]("resize", onScroll, { passive: true });
      if (on) onScroll();
    }
    function sync() {
      if (CN.reduced()) {
        bind(false);
        /* lit and at rest (CSS lights the words; drop any written transforms) */
        if (!cssWords) paint(words, 1);
        if (!cssTimeline && rig) { rig.style.transform = ""; if (lid) lid.style.transform = ""; }
        return;
      }
      words.forEach(function (w) { w.lv = -1; });
      if (nearNow && needScroll) bind(true);
    }
    if (needScroll) CN.inView(section, function (vis) { nearNow = !!vis; if (!CN.reduced()) bind(nearNow); }, { margin: "25% 0px" });
    CN.onMotion(sync);
    if (CN.onStill) CN.onStill(sync);
    sync();
    return api;
  }

  /* ------------------------------------------------------------------ the plume */
  var sprites = null;
  function makeSprites() {
    if (sprites) return sprites;
    function cv(w, h) { var c = doc.createElement("canvas"); c.width = w; c.height = h; return c; }
    /* a crystal shard: a tall diamond with a bright facet and a deeper one */
    var shard = cv(32, 96), g = shard.getContext("2d");
    if (!g) return null;
    var lg = g.createLinearGradient(0, 0, 0, 96);
    lg.addColorStop(0, "rgba(230,251,255,.95)"); lg.addColorStop(.55, "rgba(165,243,252,.8)"); lg.addColorStop(1, "rgba(34,211,238,.15)");
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(16, 0); g.lineTo(16, 96); g.lineTo(3, 50); g.closePath(); g.fill();
    var rg = g.createLinearGradient(0, 0, 0, 96);
    rg.addColorStop(0, "rgba(103,232,249,.75)"); rg.addColorStop(.6, "rgba(34,211,238,.5)"); rg.addColorStop(1, "rgba(14,116,144,.08)");
    g.fillStyle = rg;
    g.beginPath(); g.moveTo(16, 0); g.lineTo(29, 46); g.lineTo(16, 96); g.closePath(); g.fill();
    /* a spark */
    var dot = cv(32, 32), d = dot.getContext("2d"), r = d.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.2, "rgba(207,250,254,.8)"); r.addColorStop(.5, "rgba(34,211,238,.22)"); r.addColorStop(1, "rgba(34,211,238,0)");
    d.fillStyle = r; d.fillRect(0, 0, 32, 32);
    /* the column of light */
    var col = cv(64, 256), c = col.getContext("2d");
    c.save(); c.translate(32, 256); c.scale(1, 8);
    var cr = c.createRadialGradient(0, 0, 0, 0, 0, 32);
    cr.addColorStop(0, "rgba(207,250,254,.9)"); cr.addColorStop(.35, "rgba(34,211,238,.38)"); cr.addColorStop(1, "rgba(34,211,238,0)");
    c.fillStyle = cr; c.fillRect(-32, -32, 64, 32);
    c.restore();
    sprites = { shard: shard, dot: dot, col: col };
    return sprites;
  }
  var HEX = [[0, -11], [9, -7], [8, 2], [0, 11], [-8, 2], [-9, -7]];

  function Plume(canvas, visual, core) {
    var ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;
    var touch = !CN.finePointer();
    var FRAME_MS = 1000 / 30, MAX_PX = touch ? 1.0e6 : 1.6e6, DPR_MAX = touch ? 2.5 : 2;
    var w = 0, h = 0, s = 1, img = 0, parts = [], clock = 0, last = 0, on = false, paused = false, drawn = false;
    var timer = 0, raf = 0, running = false, nextRing = 0.6, rings = [], energy = .55, goal = .55, rnd = Math.random;
    var SH = touch ? 24 : 40, SP = touch ? 22 : 34, CR = touch ? 12 : 18;

    function size() {
      /* layout size (the rig's scroll transform must not change the bitmap) */
      var cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (cw < 2 || ch < 2) { w = h = 0; return; }
      var d = Math.min(win.devicePixelRatio || 1, DPR_MAX);
      d = Math.min(d, Math.sqrt(MAX_PX / (cw * ch)));
      var bw = Math.round(cw * d), bh = Math.round(ch * d);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      w = cw; h = ch; s = bw / cw;
      img = w / BOX.w;          /* the image's size in CSS px */
    }
    function corePt() { return [(CORE[0] - BOX.x) * img, (CORE[1] - BOX.y) * img]; }
    /* kinds: 0 a shard rising, 1 a spark, 2 a crystal of the cluster that grows over the core */
    function spawn(kind, warm) {
      var c = corePt(), k = img / 600;
      var a = rnd() * TAU, rr = Math.sqrt(rnd()), cl = kind === 2;
      return {
        kind: kind,
        x: c[0] + Math.cos(a) * rr * (cl ? 24 : 34) * k, y: c[1] + Math.sin(a) * rr * (cl ? 8 : 12) * k - 4 * k,
        vx: (rnd() - .5) * (cl ? 4 : 10) * k, vy: -(kind === 1 ? 46 + rnd() * 70 : cl ? 5 + rnd() * 12 : 24 + rnd() * 40) * k,
        sw: rnd() * TAU, sf: .6 + rnd() * 1.2, sa: (kind === 1 ? 6 : cl ? 2 : 10) * k * rnd(),
        size: (kind === 1 ? 2.2 + rnd() * 3.4 : cl ? 12 + rnd() * 15 : 5 + rnd() * 9) * k, rot: (rnd() - .5) * (cl ? .7 : .5),
        age: warm ? rnd() * 3.2 : 0, life: kind === 1 ? 1.6 + rnd() * 1.8 : cl ? 2.6 + rnd() * 1.8 : 2.2 + rnd() * 2
      };
    }
    function seed() {
      parts.length = 0;
      for (var q = 0; q < CR; q++) parts.push(spawn(2, true));
      for (var i = 0; i < SH; i++) parts.push(spawn(0, true));
      for (var j = 0; j < SP; j++) parts.push(spawn(1, true));
      /* warm the positions so the first frame already shows a plume */
      parts.forEach(function (p) { var t = p.age; p.x += p.vx * t; p.y += p.vy * t; });
    }
    function step(dt) {
      energy += (goal - energy) * Math.min(1, dt * 1.6);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts[i] = spawn(p.kind, false); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt * (.75 + energy * .5);
      }
      for (var r = rings.length - 1; r >= 0; r--) { rings[r] += dt / 2.4; if (rings[r] >= 1) rings.splice(r, 1); }
      nextRing -= dt;
      if (nextRing <= 0) { rings.push(0); nextRing = 2.2 + rnd() * 1.4; }
    }
    function draw() {
      if (!w) return;
      var S = makeSprites();
      if (!S) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      var c = corePt(), k = img / 600, e = energy;
      /* the column of light over the core */
      var flick = .85 + .15 * Math.sin(clock * 2.3) * Math.sin(clock * 1.7 + 1);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.globalAlpha = (.4 + .35 * e) * flick;
      var cw = 150 * k, chh = Math.min(300 * k * (.8 + .35 * e), c[1] + 8 * k);
      ctx.drawImage(S.col, c[0] - cw / 2, c[1] - chh + 10 * k, cw, chh);
      /* scan rings: the shield's outline spreading flat across the chip */
      for (var r = 0; r < rings.length; r++) {
        var q = rings[r], sc = (.12 + q * 1.15) / 11, al = (1 - q) * (1 - q) * .75 * (.6 + .4 * e);
        var ux = AX_U[0] * img * 2 * sc, uy = AX_U[1] * img * 2 * sc, vx = AX_V[0] * img * 2 * sc, vy = AX_V[1] * img * 2 * sc;
        ctx.setTransform(ux * s, uy * s, vx * s, vy * s, c[0] * s, c[1] * s);
        ctx.globalAlpha = al;
        ctx.strokeStyle = "rgba(103,232,249,1)";
        ctx.lineWidth = 1.3 / Math.max(.001, Math.hypot(ux, uy));
        ctx.beginPath();
        for (var hI = 0; hI < HEX.length; hI++) { if (hI) ctx.lineTo(HEX[hI][0], HEX[hI][1]); else ctx.moveTo(HEX[hI][0], HEX[hI][1]); }
        ctx.closePath(); ctx.stroke();
      }
      /* shards and sparks */
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], u = p.age / p.life;
        /* fade out well before the top edge of the canvas */
        var a = Math.min(1, u * 6) * (1 - u) * (1 - u * .4) * CN.clamp(p.y / (c[1] * .5), 0, 1);
        if (a <= .01) continue;
        var x = p.x + Math.sin(clock * p.sf + p.sw) * p.sa, y = p.y;
        if (p.kind === 1) {
          var ds = p.size * (1.6 - u * .8);
          ctx.setTransform(s, 0, 0, s, 0, 0);
          ctx.globalAlpha = a * (.55 + .45 * e);
          ctx.drawImage(S.dot, x - ds, y - ds, ds * 2, ds * 2);
        } else {
          var cl = p.kind === 2, sz = p.size * (cl ? .7 + .3 * Math.min(1, u * 3) : 1 - u * .55), cs = Math.cos(p.rot + Math.sin(clock * .7 + p.sw) * .15), sn = Math.sin(p.rot + Math.sin(clock * .7 + p.sw) * .15);
          ctx.setTransform(cs * s, sn * s, -sn * s, cs * s, x * s, y * s);
          ctx.globalAlpha = a * (.5 + .5 * e) * (cl ? .62 : 1);
          if (cl) ctx.drawImage(S.shard, -sz * .42, -sz, sz * .84, sz * 2);
          else ctx.drawImage(S.shard, -sz / 3, -sz, sz * 2 / 3, sz * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!drawn) { drawn = true; canvas.classList.add("is-on"); }
    }
    /* 30 fps: a timer waits out most of the gap, then one animation frame */
    function frame(t) {
      raf = 0;
      if (!running) return;
      var dt = last ? Math.min(100, t - last) / 1000 : FRAME_MS / 1000;
      last = t; clock += dt;
      step(dt); draw();
      timer = setTimeout(ask, Math.max(0, FRAME_MS - 8 - (CN.now() - t)));
    }
    function ask() { timer = 0; if (running && !raf) raf = win.requestAnimationFrame(frame); }
    function start() { if (running) return; running = true; last = 0; ask(); }
    function stop() { running = false; if (timer) clearTimeout(timer); if (raf) win.cancelAnimationFrame(raf); timer = raf = 0; }
    function update() {
      var move = on && !paused && !still() && !CN.hidden();
      if (visual.hasAttribute("data-cn-play") !== move) {
        if (move) visual.setAttribute("data-cn-play", ""); else visual.removeAttribute("data-cn-play");
      }
      if (move) start();
      else {
        stop();
        if (on && !drawn) draw();   /* a still frame */
      }
    }
    var ro = "ResizeObserver" in win ? new ResizeObserver(function () { size(); if (!parts.length) seed(); if (!running) draw(); }) : null;
    if (ro) ro.observe(canvas); else { size(); win.addEventListener("resize", function () { size(); }, { passive: true }); }
    if (!ro) seed();
    CN.inView(visual, function (vis) { on = !!vis; update(); }, { margin: "40px 0px" });
    /* energy follows how much of the chip is in view (no layout reads: the observer's ratio) */
    if ("IntersectionObserver" in win) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { goal = .4 + .6 * Math.min(1, e.intersectionRatio * 1.25); }); },
        { threshold: [0, .2, .4, .6, .8, 1] }).observe(visual);
    }
    CN.onVisibility(update);
    CN.onMotion(update);
    if (CN.onStill) CN.onStill(update);
    canvas.addEventListener("contextrestored", function () { drawn = false; draw(); });
    return {
      pause: function () { paused = true; update(); },
      resume: function () { paused = false; update(); },
      destroy: function () { stop(); if (ro) ro.disconnect(); }
    };
  }

  /* Build the words at start-up (markup the visitor will reach), start the motion lazily. */
  var cores = [];
  CN.onReady(function () {
    CN.qsa("#home > .cn-core").forEach(function (sec) { sec.__cnCore = Core(sec); cores.push(sec.__cnCore); });
  });
  CN.register("core", function (visual) {
    var sec = visual.closest ? visual.closest(".cn-core") : null;
    var canvas = CN.qs("canvas.cn-core-plume", visual);
    if (!canvas) return null;
    return Plume(canvas, visual, sec && sec.__cnCore);
  });
})();
