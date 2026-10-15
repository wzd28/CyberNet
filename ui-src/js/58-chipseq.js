/* Home's AI chip (#cnCore .cn-chipseq; CSS in 28-chipseq.css, frames from
   scripts/render-chipseq.mjs). Owner, 15 Oct 2026: "much more realistic chip ... make it like the
   video I sent".

   A photoreal processor assembles as the section scrolls through the screen, Apple style: the
   exposed die, a brief glassy crystal sweep while the brushed heat-spreader lid comes down and
   settles, then the finished chip turns slowly to a new angle. It is a pre-rendered sequence of
   N transparent WebP frames (data-cn-seq-n) drawn to one canvas and scrubbed by the scroll.

   Markup (public/index.html, inside .cn-core-visual):
     .cn-chipseq[data-cn="chipseq"][data-cn-seq="/ui/3d/chipseq/"][data-cn-seq-n][data-cn-seq-v]
       > span.cn-chipseq-pool, picture.cn-chipseq-poster (the last frame), canvas.cn-chipseq-canvas
   - The poster (the assembled chip) is what shows first, without script, under reduced motion,
     under Pause motion and with Save-Data; no frame is fetched then.
   - Frames load only once the section is within about a screen of view: the frame the scroll
     needs first, then coarse to fine (every 16th, 8th, 4th, 2nd, the rest), four at a time,
     low priority. Phones (narrower than 480px, as the poster's <picture>) get the 560px set,
     larger screens the 1000px set (the canvas bitmap matches the set: no scaling per draw).
   - Scroll: progress runs while the box's middle travels from 90% of the screen's height to
     25%, so the lid comes down while the whole chip is in view (desktop too, where the box is
     tall) and the turn ends as the box reaches the top of the screen. Where
     the box sits is read in a ResizeObserver callback (layout is clean there), so a scroll
     frame reads nothing but scrollY. The handler is bound only while the box is near the screen.
   - The drawn frame follows the scroll with a short ease (about 90 ms) and, while moving, blends
     the two nearest frames (premultiplied 'lighter' crossfade), so it stays smooth between
     frames; at rest it shows one whole frame. The canvas is redrawn only when the frame or the
     blend step changes, and the loop stops at rest.
   - The pool of cyan light under the chip (span.cn-chipseq-pool, CSS) grows with the progress
     (an opacity write on that one leaf).
   - State lives in a data attribute (data-cn-on on .cn-chipseq: the canvas shows), never in a
     class: legacy body-wide observers react to class changes.
   - Controller: { pause, resume, destroy } (CN.pause / Pause motion: the still poster). */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var win = window, doc = document;
  var C0 = .9, C1 = .25, EASE_MS = 90, STEPS = 24, CONC = 4;

  function scrollY() { return win.pageYOffset || doc.documentElement.scrollTop || 0; }
  function viewH() { return win.innerHeight || doc.documentElement.clientHeight || 800; }
  function pad3(i) { return (i < 10 ? "00" : i < 100 ? "0" : "") + i; }
  function sstep(a, b, v) { var t = CN.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  function Seq(host) {
    var canvas = CN.qs("canvas.cn-chipseq-canvas", host);
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d", { alpha: true }) : null;
    if (!ctx) return null;
    var pool = CN.qs(".cn-chipseq-pool", host);
    var base = host.getAttribute("data-cn-seq") || "/ui/3d/chipseq/";
    var n = Math.max(2, parseInt(host.getAttribute("data-cn-seq-n"), 10) || 60);
    var ver = host.getAttribute("data-cn-seq-v") || "";
    var mqWide = win.matchMedia ? win.matchMedia("(min-width: 480px)") : null;

    var set = "", frames = [], queue = [], inflight = 0, gen = 0;
    var paused = false, near = false, dead = false, on = false, bound = false;
    var lay = { top: 0, h: 0, ok: false };
    var target = n - 1, cur = n - 1, raf = 0, last = 0, drawn = "", poolOp = -1;

    function still() { return paused || CN.reduced() || CN.saveData(); }

    /* ---------------------------------------------------------------- frames */
    /* frames are ImageBitmaps where the browser has them (decoded once, off the main thread, so a
       scroll frame never pays for a decode; measured on a 4x slowed phone: about half the late
       frames of drawing the <img>), otherwise decoded <img>s */
    function release() {
      frames.forEach(function (f) { if (f && f.close) { try { f.close(); } catch (e) { /* already closed */ } } });
    }
    function pickSet() {
      var s = mqWide && !mqWide.matches ? "m" : "d";
      if (s === set) return;
      set = s; gen++;
      release();
      frames = new Array(n); queue.length = 0; drawn = "";
      var w = s === "m" ? 560 : 1000, h = s === "m" ? 448 : 800;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      host.removeAttribute("data-cn-on");
      on = false;
    }
    function url(i) { return base + set + "/" + pad3(i) + ".webp" + (ver ? "?v=" + encodeURIComponent(ver) : ""); }
    /* the frame the scroll needs now, the last one (the poster: usually cached), then coarse to fine */
    function plan(first) {
      var order = [], seen = {};
      function add(i) { i = CN.clamp(Math.round(i), 0, n - 1); if (!seen[i]) { seen[i] = 1; order.push(i); } }
      add(first); add(n - 1);
      [16, 8, 4, 2, 1].forEach(function (step) { for (var i = 0; i < n; i += step) add(i); });
      queue = order.filter(function (i) { return !frames[i]; });
    }
    function pump() {
      while (inflight < CONC && queue.length && near && !still() && !dead) {
        var i = queue.shift();
        if (frames[i]) continue;
        load(i, gen);
      }
    }
    function load(i, g) {
      inflight++;
      var img = new Image();
      img.decoding = "async";
      try { img.fetchPriority = "low"; } catch (e) { /* older engines */ }
      var done = false;
      function fin(ok, src) {
        if (done) return;
        done = true; inflight--;
        if (g === gen && ok && !dead && !frames[i]) {
          frames[i] = src;
          /* a frame near the one we show: redraw (it may sharpen the blend) */
          if (Math.abs(i - cur) <= 1.5 || !on) kick();
        } else if (src && src.close) src.close();
        pump();
      }
      function decoded() {
        if (img.decode) img.decode().then(function () { fin(true, img); }, function () { fin(true, img); });
        else fin(true, img);
      }
      img.onload = function () {
        if (win.createImageBitmap) win.createImageBitmap(img).then(function (bm) { fin(true, bm); }, decoded);
        else decoded();
      };
      img.onerror = function () { fin(false, null); };
      img.src = url(i);
    }

    /* ---------------------------------------------------------------- drawing */
    function nearestLoaded(f) {
      var i0 = Math.round(f);
      for (var d = 0; d < n; d++) {
        if (frames[i0 - d]) return i0 - d;
        if (frames[i0 + d]) return i0 + d;
      }
      return -1;
    }
    /* moving: blend the two nearest frames; at rest: one frame (a blend of a fast-moving part,
       the lid coming down, would show it twice) */
    function draw(rest) {
      var i0 = Math.floor(cur), fr = cur - i0, a = frames[i0], b = frames[i0 + 1];
      var key, ia, ib = -1, k = 0;
      if (rest) ia = frames[Math.round(cur)] ? Math.round(cur) : nearestLoaded(cur);
      else if (a && b && fr > 1 / STEPS) { ia = i0; ib = i0 + 1; k = Math.round(fr * STEPS) / STEPS; if (k >= 1) { ia = ib; ib = -1; k = 0; } }
      else { ia = a && fr < .5 ? i0 : b && fr >= .5 ? i0 + 1 : nearestLoaded(cur); }
      if (ia < 0) return false;
      key = set + ia + ":" + ib + ":" + k;
      if (key === drawn) return true;
      drawn = key;
      var W = canvas.width, H = canvas.height;
      ctx.globalCompositeOperation = "copy";
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(frames[ia], 0, 0, W, H);
      if (ib >= 0 && k > 0) {
        /* premultiplied linear blend: (1 - k) A + k B */
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k;
        ctx.drawImage(frames[ib], 0, 0, W, H);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (!on) { on = true; host.setAttribute("data-cn-on", ""); }
      return true;
    }
    function setPool(p) {
      if (!pool) return;
      var v = Math.round((.45 + .55 * sstep(.5, 1, p)) * 50) / 50;
      if (v !== poolOp) { poolOp = v; pool.style.opacity = String(v); }
    }

    /* ---------------------------------------------------------------- scroll */
    function readLayout() {
      var r = host.getBoundingClientRect();
      lay.top = r.top + scrollY(); lay.h = r.height; lay.ok = r.height > 0;
    }
    function progress() {
      if (!lay.ok) return 1;
      var vh = viewH(), mid = lay.top - scrollY() + lay.h / 2;
      return CN.clamp((vh * C0 - mid) / Math.max(1, vh * (C0 - C1)), 0, 1);
    }
    function frame(t) {
      raf = 0;
      if (dead || still()) return;
      var dt = last ? Math.min(64, t - last) : 16;
      last = t;
      var a = 1 - Math.exp(-dt / EASE_MS);
      cur += (target - cur) * a;
      if (Math.abs(target - cur) < .02) cur = target;
      draw(cur === target);
      if (cur !== target) raf = win.requestAnimationFrame(frame);
      else last = 0;
    }
    function kick() { if (!raf && !dead && !still()) { last = 0; raf = win.requestAnimationFrame(frame); } }
    function onScroll() {
      var p = progress();
      target = p * (n - 1);
      setPool(p);
      if (target !== cur || !on) kick();
    }
    function bind(want) {
      if (want === bound) return;
      bound = want;
      var m = want ? "addEventListener" : "removeEventListener";
      win[m]("scroll", onScroll, { passive: true });
      win[m]("resize", onScroll, { passive: true });
    }

    /* ---------------------------------------------------------------- state */
    function sync() {
      if (dead) return;
      if (still()) {
        bind(false);
        if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
        if (on) { on = false; host.removeAttribute("data-cn-on"); }
        drawn = "";
        if (pool) { pool.style.opacity = ""; poolOp = -1; }
        return;
      }
      pickSet();
      bind(near);
      if (near) {
        var p = progress();
        target = p * (n - 1);
        /* first sight: start at the frame the scroll asks for (no slide from the poster) */
        if (!on) cur = target;
        setPool(p);
        plan(target);
        pump();
        kick();
      }
    }
    var ro = "ResizeObserver" in win ? new ResizeObserver(function () { readLayout(); if (bound) onScroll(); }) : null;
    if (ro) { ro.observe(host); ro.observe(doc.body); }
    else { readLayout(); win.addEventListener("load", readLayout); }
    var stopView = CN.inView(host, function (vis) { near = !!vis; sync(); }, { margin: "100% 0px" });
    var offs = [CN.onMotion(sync), CN.onStill ? CN.onStill(sync) : null];
    if (mqWide) {
      var mqf = function () { if (!still()) sync(); };
      if (mqWide.addEventListener) mqWide.addEventListener("change", mqf); else if (mqWide.addListener) mqWide.addListener(mqf);
    }
    canvas.addEventListener("contextrestored", function () { drawn = ""; kick(); });
    sync();

    return {
      pause: function () { paused = true; sync(); },
      resume: function () { paused = false; sync(); },
      destroy: function () {
        dead = true; bind(false);
        if (raf) win.cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        if (stopView) stopView();
        offs.forEach(function (off) { if (typeof off === "function") off(); });
        release(); frames = [];
        host.removeAttribute("data-cn-on");
      }
    };
  }

  /* armed when the box is within a screen of view (CN.register's margin); nothing runs before */
  CN.register("chipseq", Seq, { margin: "100% 0px" });
})();
