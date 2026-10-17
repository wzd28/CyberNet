/* CyberNet AI: the #cnCore energy plume (owner: aurora). The v4.2 look, restored in v4.4.
   Hand-written and served as is (it is not part of the ui-src bundles). After a change, bump
   PLUME_SRC's ?v= in ui-src/js/57-core.js and rebuild.

   Crystalline cyan shards and fine sparks rise from the chip's core, a soft column of light
   stands over it, and every few seconds a scan ring in the shape of the CyberNet shield spreads
   flat across the chip (drawn in the chip's own plane with the axes render-3d.mjs measured).

   One source, two places it can run:
   - In a dedicated Worker (the normal case): 57-core.js starts `new Worker(this file)`, the
     worker answers { t: "ready", ok } once it knows it can draw into an OffscreenCanvas, and only
     then does 57-core.js hand it the page's canvas (transferControlToOffscreen). Every frame is
     drawn and committed off the main thread, so the plume costs the page nothing per frame.
   - On the page, as a classic script (the fallback where a worker cannot draw): it defines
     self.CNPlumeEngine(canvas, touch, onDrawn) with the same methods.
   57-core.js decides when the plume plays (on screen, tab visible, motion allowed, page not
   covered by the phone menu) and measures the canvas; this file only draws.

   Engine methods (and the worker messages that call them):
     size(cw, ch, dpr)  { t: "size", cw, ch, dpr }  CSS size of the canvas and devicePixelRatio
     play(on)           { t: "play", v }             30 fps while on; stops on false
     still()            { t: "still" }               one frame if nothing was drawn yet
     goal(v)            { t: "goal", v }             energy target (.4 .. 1, how much is in view)
     destroy()          { t: "stop" }
   The worker posts { t: "drawn" } after its first frame (57-core.js then fades the canvas in). */
(function (G) {
  "use strict";
  var TAU = Math.PI * 2;
  /* from render-3d.mjs (core position and the chip's axes, as fractions of the image) */
  var CORE = [0.5, 0.4574], AX_U = [0.1078, -0.0421], AX_V = [-0.0795, -0.0561];
  /* the plume canvas covers this part of the image (27-core.css: inset 0 18% 36%) */
  var BOX = { x: 0.18, y: 0, w: 0.64, h: 0.64 };
  var HEX = [[0, -11], [9, -7], [8, 2], [0, 11], [-8, 2], [-9, -7]];
  var RINGS = 3;                           /* a ring lives 2.4 s and one starts every 2.2-3.6 s */
  var FRAME_MS = 1000 / 30, DPR_MAX = 2;
  var hasDoc = typeof document !== "undefined" && !!document.createElement;

  function now() { return (G.performance && G.performance.now) ? G.performance.now() : Date.now(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function surface(w, h) {
    if (hasDoc) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
    return new OffscreenCanvas(w, h);
  }

  var sprites = null;
  function makeSprites() {
    if (sprites) return sprites;
    /* a crystal shard: a tall diamond with a bright facet and a deeper one */
    var shard = surface(32, 96), g = shard.getContext("2d");
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
    var dot = surface(32, 32), d = dot.getContext("2d"), r = d.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.2, "rgba(207,250,254,.8)"); r.addColorStop(.5, "rgba(34,211,238,.22)"); r.addColorStop(1, "rgba(34,211,238,0)");
    d.fillStyle = r; d.fillRect(0, 0, 32, 32);
    /* the column of light */
    var col = surface(64, 256), c = col.getContext("2d");
    c.save(); c.translate(32, 256); c.scale(1, 8);
    var cr = c.createRadialGradient(0, 0, 0, 0, 0, 32);
    cr.addColorStop(0, "rgba(207,250,254,.9)"); cr.addColorStop(.35, "rgba(34,211,238,.38)"); cr.addColorStop(1, "rgba(34,211,238,0)");
    c.fillStyle = cr; c.fillRect(-32, -32, 64, 32);
    c.restore();
    sprites = { shard: shard, dot: dot, col: col };
    return sprites;
  }

  /* canvas: an HTMLCanvasElement (page) or an OffscreenCanvas (worker). touch: a coarse pointer
     (fewer particles and a smaller pixel cap). onDrawn: called once, after the first frame. */
  function Engine(canvas, touch, onDrawn) {
    var ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return null;
    /* 2 device pixels per CSS pixel are plenty for soft light (phones at 3x drew 2.25x the
       pixels for no visible gain); the cap bounds a very large canvas */
    var MAX_PX = touch ? 1.0e6 : 1.6e6;
    var w = 0, h = 0, s = 1, img = 0, cx = 0, cy = 0, k = 1;
    var parts = [], clock = 0, last = 0, drawn = false;
    var timer = 0, raf = 0, rafIsTimer = false, running = false, nextRing = 0.6, energy = .55, goal = .55, rnd = Math.random;
    var rings = [], ri;
    for (ri = 0; ri < RINGS; ri++) rings.push(-1);       /* -1: a free slot, else 0..1 progress */
    var SH = touch ? 24 : 40, SP = touch ? 22 : 34, CR = touch ? 12 : 18;

    function size(cw, ch, dpr) {
      /* layout size (the rig's scroll transform must not change the bitmap) */
      if (!(cw >= 2 && ch >= 2)) { w = h = 0; return; }
      var d = Math.min(dpr || 1, DPR_MAX);
      d = Math.min(d, Math.sqrt(MAX_PX / (cw * ch)));
      var bw = Math.round(cw * d), bh = Math.round(ch * d);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      w = cw; h = ch; s = bw / cw;
      img = w / BOX.w;          /* the image's size in CSS px */
      cx = (CORE[0] - BOX.x) * img; cy = (CORE[1] - BOX.y) * img; k = img / 600;
    }
    /* (Re)starts particle p in place: kinds 0 a shard rising, 1 a spark, 2 a crystal of the
       cluster that grows over the core. The pool is reused, so a frame allocates nothing. */
    function spawn(p, kind, warm) {
      var a = rnd() * TAU, rr = Math.sqrt(rnd()), cl = kind === 2;
      p.kind = kind;
      p.x = cx + Math.cos(a) * rr * (cl ? 24 : 34) * k;
      p.y = cy + Math.sin(a) * rr * (cl ? 8 : 12) * k - 4 * k;
      p.vx = (rnd() - .5) * (cl ? 4 : 10) * k;
      p.vy = -(kind === 1 ? 46 + rnd() * 70 : cl ? 5 + rnd() * 12 : 24 + rnd() * 40) * k;
      p.sw = rnd() * TAU; p.sf = .6 + rnd() * 1.2; p.sa = (kind === 1 ? 6 : cl ? 2 : 10) * k * rnd();
      p.size = (kind === 1 ? 2.2 + rnd() * 3.4 : cl ? 12 + rnd() * 15 : 5 + rnd() * 9) * k;
      p.rot = (rnd() - .5) * (cl ? .7 : .5);
      p.age = warm ? rnd() * 3.2 : 0;
      p.life = kind === 1 ? 1.6 + rnd() * 1.8 : cl ? 2.6 + rnd() * 1.8 : 2.2 + rnd() * 2;
      return p;
    }
    function blank() { return { kind: 0, x: 0, y: 0, vx: 0, vy: 0, sw: 0, sf: 0, sa: 0, size: 0, rot: 0, age: 0, life: 1 }; }
    function seed() {
      if (!parts.length) {
        for (var q = 0; q < CR + SH + SP; q++) parts.push(blank());
      }
      for (var i = 0; i < parts.length; i++) {
        var p = spawn(parts[i], i < CR ? 2 : i < CR + SH ? 0 : 1, true);
        /* warm the positions so the first frame already shows a plume */
        p.x += p.vx * p.age; p.y += p.vy * p.age;
      }
    }
    function step(dt) {
      energy += (goal - energy) * Math.min(1, dt * 1.6);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { spawn(p, p.kind, false); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt * (.75 + energy * .5);
      }
      for (var r = 0; r < RINGS; r++) {
        if (rings[r] < 0) continue;
        rings[r] += dt / 2.4;
        if (rings[r] >= 1) rings[r] = -1;
      }
      nextRing -= dt;
      if (nextRing <= 0) {
        for (r = 0; r < RINGS; r++) if (rings[r] < 0) { rings[r] = 0; break; }
        nextRing = 2.2 + rnd() * 1.4;
      }
    }
    function draw() {
      if (!w) return;
      var S = makeSprites();
      if (!S) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      var e = energy;
      /* the column of light over the core */
      var flick = .85 + .15 * Math.sin(clock * 2.3) * Math.sin(clock * 1.7 + 1);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.globalAlpha = (.4 + .35 * e) * flick;
      var cw = 150 * k, chh = Math.min(300 * k * (.8 + .35 * e), cy + 8 * k);
      ctx.drawImage(S.col, cx - cw / 2, cy - chh + 10 * k, cw, chh);
      /* scan rings: the shield's outline spreading flat across the chip (additive light, so
         the slots' order does not matter) */
      ctx.strokeStyle = "rgba(103,232,249,1)";
      for (var r = 0; r < RINGS; r++) {
        var q = rings[r];
        if (q < 0) continue;
        var sc = (.12 + q * 1.15) / 11, al = (1 - q) * (1 - q) * .75 * (.6 + .4 * e);
        var ux = AX_U[0] * img * 2 * sc, uy = AX_U[1] * img * 2 * sc, vx = AX_V[0] * img * 2 * sc, vy = AX_V[1] * img * 2 * sc;
        ctx.setTransform(ux * s, uy * s, vx * s, vy * s, cx * s, cy * s);
        ctx.globalAlpha = al;
        ctx.lineWidth = 1.3 / Math.max(.001, Math.sqrt(ux * ux + uy * uy));
        ctx.beginPath();
        for (var hI = 0; hI < HEX.length; hI++) { if (hI) ctx.lineTo(HEX[hI][0], HEX[hI][1]); else ctx.moveTo(HEX[hI][0], HEX[hI][1]); }
        ctx.closePath(); ctx.stroke();
      }
      /* shards and sparks */
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], u = p.age / p.life;
        /* fade out well before the top edge of the canvas */
        var a = Math.min(1, u * 6) * (1 - u) * (1 - u * .4) * clamp(p.y / (cy * .5), 0, 1);
        if (a <= .01) continue;
        var x = p.x + Math.sin(clock * p.sf + p.sw) * p.sa, y = p.y;
        if (p.kind === 1) {
          var ds = p.size * (1.6 - u * .8);
          ctx.setTransform(s, 0, 0, s, 0, 0);
          ctx.globalAlpha = a * (.55 + .45 * e);
          ctx.drawImage(S.dot, x - ds, y - ds, ds * 2, ds * 2);
        } else {
          var cl = p.kind === 2, sz = p.size * (cl ? .7 + .3 * Math.min(1, u * 3) : 1 - u * .55);
          var ang = p.rot + Math.sin(clock * .7 + p.sw) * .15, cs = Math.cos(ang), sn = Math.sin(ang);
          ctx.setTransform(cs * s, sn * s, -sn * s, cs * s, x * s, y * s);
          ctx.globalAlpha = a * (.5 + .5 * e) * (cl ? .62 : 1);
          if (cl) ctx.drawImage(S.shard, -sz * .42, -sz, sz * .84, sz * 2);
          else ctx.drawImage(S.shard, -sz / 3, -sz, sz * 2 / 3, sz * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!drawn) { drawn = true; if (onDrawn) onDrawn(); }
    }
    /* 30 fps: a timer waits out most of the gap, then one animation frame (a worker without
       requestAnimationFrame uses a short timer instead) */
    function frame(t) {
      raf = 0;
      if (!running) return;
      var dt = last ? Math.min(100, t - last) / 1000 : FRAME_MS / 1000;
      last = t; clock += dt;
      step(dt); draw();
      timer = G.setTimeout(ask, Math.max(0, FRAME_MS - 8 - (now() - t)));
    }
    function ask() {
      timer = 0;
      if (!running || raf) return;
      if (typeof G.requestAnimationFrame === "function") { rafIsTimer = false; raf = G.requestAnimationFrame(frame); }
      else { rafIsTimer = true; raf = G.setTimeout(function () { frame(now()); }, 8); }
    }
    function start() { if (running) return; running = true; last = 0; ask(); }
    function stop() {
      running = false;
      if (timer) G.clearTimeout(timer);
      if (raf) { if (rafIsTimer) G.clearTimeout(raf); else G.cancelAnimationFrame(raf); }
      timer = raf = 0;
    }
    if (canvas.addEventListener) canvas.addEventListener("contextrestored", function () { drawn = false; draw(); });
    return {
      size: function (cw, ch, dpr) { size(cw, ch, dpr); if (!parts.length && w) seed(); if (!running) draw(); },
      play: function (v) { if (v) start(); else stop(); },
      still: function () { if (!drawn) draw(); },
      goal: function (v) { if (typeof v === "number" && isFinite(v)) goal = v; },
      destroy: stop
    };
  }

  if (hasDoc) { G.CNPlumeEngine = Engine; return; }

  /* ---- worker ---- */
  var engine = null, pending = [];
  function canDraw() {
    try { return typeof OffscreenCanvas === "function" && !!new OffscreenCanvas(1, 1).getContext("2d"); } catch (e) { return false; }
  }
  function run(m) {
    if (!engine) return;
    if (m.t === "size") engine.size(m.cw, m.ch, m.dpr);
    else if (m.t === "play") engine.play(!!m.v);
    else if (m.t === "still") engine.still();
    else if (m.t === "goal") engine.goal(m.v);
    else if (m.t === "stop") engine.destroy();
  }
  G.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.t === "init") {
      engine = m.canvas ? Engine(m.canvas, !!m.touch, function () { G.postMessage({ t: "drawn" }); }) : null;
      pending.forEach(run); pending = [];
      return;
    }
    if (engine) run(m); else pending.push(m);
  };
  G.postMessage({ t: "ready", ok: canDraw() });
})(self);
