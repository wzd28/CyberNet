/* Home hero 3D runtime (canvas.cn-hero4-canvas[data-cn="hero3d"] in .cn-hero4-scene).
   The models and the scene live in /ui/3d/hero3d-kit.js (readable source; the site loads the
   minified hero3d-kit.min.js that scripts/render-3d.mjs writes) as window.CNHero3D, loaded on
   demand with three.js r128 (jsDelivr, SRI). This module decides when, and drives it.

   Rules (DESIGN.md v4):
   - img.cn-hero4-poster shows first. scripts/render-3d.mjs renders it from the kit at scene
     time T0, so the live scene starts on the poster's exact frame. The canvas fades in over it
     (.cn-hero4-scene.is-live) while that frame holds, then time, parallax and the scroll turn
     ease in: the still image comes alive.
   - Nothing loads until window load + idle + 1.2 s, and only while Home is the page shown and
     the stage is on screen (deep links never pay for it), 1.4 s after a page switch. The build
     and the shader compiles run in idle slices, so a tap is never kept waiting long.
   - Never under reduced motion, the global Pause motion (html.cn-still; CN.reduced() is true
     then) or Save-Data: the poster stays. No WebGL, a failed load, a software renderer
     (failIfMajorPerformanceCaveat), slow frames or a lost context also leave the poster.
   - DPR <= 1.5 on desktop, 1 on touch screens; about 30 fps on touch screens. A governor
     lowers the resolution, then the frame rate (and drops the sparkles), then gives up.
   - Pauses off screen, while the tab is hidden (CN.loop), while Home is not shown and while
     the hero's Pause button is pressed (20-scanbox.js dispatches "cn-hero-motion").
   - Subtle pointer parallax (fine pointers only) and a small scroll-linked turn.
   - Toggles .is-on on the stage while it is on screen: the CSS light beams run only then. */
(function () {
  "use strict";
  var win = window, doc = document, CN = win.CN;
  if (!CN) return;
  var THREE_SRC = "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";
  var THREE_SRI = "sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";
  var KIT_V = "bac5fc4b3e";  /* hash of /ui/3d/hero3d-kit.min.js, stamped by scripts/render-3d.mjs */
  var KIT_SRC = "/ui/3d/hero3d-kit.min.js?v=" + KIT_V;

  /* ---------------------------------------------------------------- loading */
  function loadScript(src, sri, ready) {
    if (ready()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = doc.createElement("script");
      s.src = src; s.async = true;
      if (sri) { s.crossOrigin = "anonymous"; s.integrity = sri; }
      s.onload = function () { if (ready()) resolve(); else reject(new Error(src + " did not load")); };
      s.onerror = function () { reject(new Error(src + " failed to load")); };
      doc.head.appendChild(s);
    });
  }
  var loadP = null;
  function loadAll() {
    if (!loadP) {
      loadP = Promise.all([
        loadScript(THREE_SRC, THREE_SRI, function () { return !!(win.THREE && win.THREE.WebGLRenderer); }),
        loadScript(KIT_SRC, null, function () { return !!win.CNHero3D; })
      ]).then(function () { return win.THREE; });
      loadP.catch(function () { loadP = null; });
    }
    return loadP;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  /* ============================================================== runtime */
  var SETTLE_MS = 1400;       /* after Home is opened from another page */
  var DPR_FINE = 1.5, DPR_COARSE = 1;
  var MAX_PX = 1800000;
  var FRAME_COARSE = 33;      /* ~30 fps on touch screens */
  var LINK_WAIT_MS = 400, LINK_GIVEUP_MS = 10000;

  /* no test context (one live WebGL context at a time): if the real one cannot be created,
     the renderer throws, fail() keeps the poster */
  function hasWebGL() { return !!(win.WebGLRenderingContext && doc.createElement("canvas").getContext); }
  var START_MS = 1200;        /* after load + idle: let the page's own start-up finish first */
  var idle = win.requestIdleCallback ? function (f) { win.requestIdleCallback(f, { timeout: 1500 }); } : function (f) { setTimeout(f, 150); };
  /* idle slices for the build and the shader compiles, so a tap is never kept waiting long */
  function idleTask(f) {
    if (win.requestIdleCallback) win.requestIdleCallback(f, { timeout: 2000 });
    else setTimeout(function () { f(null); }, 60);
  }

  CN.register("hero3d", function (canvas) {
    var box = canvas.parentNode, stage = box && box.closest ? box.closest(".cn-stage") : null;
    var home = doc.getElementById("home"), root = doc.documentElement;
    var coarse = !CN.finePointer();
    var G = null, state = "idle"; /* idle | loading | ready | dead */
    var visible = false, held = false, loaded = false, queued = false, deepTimer = 0, pageSeen = false, switchedAt = -1e9;
    var acc = 0, frameMs = coarse ? FRAME_COARSE : 0, dpr = 1, dirty = true, stageH = 600;
    var slow = { n: 0, sum: 0, warm: 0, last: 0, level: 0 };
    var ptr = { x: 0, y: 0, tx: 0, ty: 0 }, ro = null, offs = [], liveAt = 0;
    var loop = CN.loop(frame);

    held = !!(stage && stage.classList.contains("is-paused"));
    if (stage) {
      stage.addEventListener("cn-hero-motion", function (e) {
        held = !!(e.detail && e.detail.paused);
        if (held) pause(); else play();
      });
    }
    offs.push(CN.inView(stage || box, function (vis) {
      visible = vis;
      if (stage) stage.classList.toggle("is-on", !!vis);
      if (!vis) { pause(); return; }
      if (state === "ready") play(); else maybe();
    }));

    function homeShown() {
      return !!home && home.classList.contains("active-page") && !home.classList.contains("leaving") &&
        !root.classList.contains("cn-deep") && canvas.clientWidth > 0;
    }
    function allowed() { return !CN.reduced() && !CN.saveData(); }
    function maybe() {
      if (state !== "idle" || queued || !loaded || !visible || !allowed()) return;
      if (!homeShown()) {
        if (root.classList.contains("cn-deep") && !deepTimer) deepTimer = setTimeout(function () { deepTimer = 0; maybe(); }, 4300);
        return;
      }
      queued = true;
      setTimeout(function () {
        idle(function () {
          queued = false;
          if (state === "idle" && visible && homeShown() && allowed()) begin();
        });
      }, Math.max(0, SETTLE_MS - (CN.now() - switchedAt)));
    }

    function begin() {
      if (!hasWebGL()) { state = "dead"; return; }
      state = "loading";
      loadAll().then(function (T) {
        if (state !== "loading") return;
        idleTask(function () {
          if (state !== "loading") return;
          try {
            G = win.CNHero3D.scene(T, canvas, { lite: coarse });
          } catch (e) { fail(e); return; }
          canvas.addEventListener("webglcontextlost", onLost, false);
          idleTask(function () {
            if (state !== "loading") return;
            dirty = true; size();
            G.seek(win.CNHero3D.T0);
            idleTask(compileSteps);
          });
        });
      }).catch(fail);
    }
    /* compile in idle slices (one mesh at least, more while the slice lasts), then wait for
       the GPU to finish linking */
    function compileSteps(deadline) {
      if (state !== "loading") return;
      var done = false, budget = deadline && deadline.timeRemaining ? Math.max(4, deadline.timeRemaining() - 2) : 8;
      try { done = G.compileStep(budget); } catch (e) { fail(e); return; }
      if (!done) { idleTask(compileSteps); return; }
      var gl = G.R.getContext(), ext = null, t0 = CN.now();
      try { ext = gl.getExtension("KHR_parallel_shader_compile"); } catch (e) { ext = null; }
      (function wait() {
        if (state !== "loading") return;
        var waited = CN.now() - t0;
        if (ext) {
          var ready = G.programs().every(function (p) { return gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR); });
          if (!ready && waited < LINK_GIVEUP_MS) { requestAnimationFrame(wait); return; }
        } else if (waited < LINK_WAIT_MS) { setTimeout(wait, LINK_WAIT_MS - waited); return; }
        firstFrame();
      })();
    }
    function firstFrame() {
      var ok = G.programs().every(function (p) { return G.R.getContext().getProgramParameter(p, G.R.getContext().LINK_STATUS); });
      if (!ok) { fail(new Error("shader link failed")); return; }
      try { G.draw(); } catch (e) { fail(e); return; }
      state = "ready";
      if ("ResizeObserver" in win) { ro = new ResizeObserver(function () { dirty = true; }); ro.observe(canvas); }
      else win.addEventListener("resize", function () { dirty = true; }, { passive: true });
      if (!coarse) {
        var onMove = function (e) {
          if (e.pointerType && e.pointerType !== "mouse") return;
          ptr.tx = clamp((e.clientX / Math.max(1, win.innerWidth) - .5) * 2, -1, 1);
          ptr.ty = clamp((e.clientY / Math.max(1, win.innerHeight) - .5) * 2, -1, 1);
        };
        win.addEventListener("pointermove", onMove, { passive: true });
        offs.push(function () { win.removeEventListener("pointermove", onMove); });
      }
      requestAnimationFrame(function () {
        if (state === "ready" && allowed()) { box.classList.add("is-live"); liveAt = CN.now(); }
      });
      play();
    }
    function fail(err) {
      if (state === "dead") return;
      state = "dead";
      pause();
      box.classList.remove("is-live");
      if (G) { G.dispose(); G = null; }
      if (err && win.console && console.warn) console.warn("[cn] hero 3D off, poster kept:", err.message || err);
    }
    function onLost(e) { e.preventDefault(); fail(new Error("context lost")); }

    function size() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      var d = Math.min(win.devicePixelRatio || 1, coarse ? DPR_COARSE : DPR_FINE) * (slow.level > 0 ? .75 : 1);
      if (w * h * d * d > MAX_PX) d = Math.sqrt(MAX_PX / (w * h));
      dpr = d;
      G.size(w, h, d);
      stageH = (stage && stage.offsetHeight) || h;
      dirty = false;
      return true;
    }

    /* governor: average the gap between drawn frames; step down, then give up */
    function watch(gap) {
      if (gap > 400) return;
      if (slow.warm < 40) { slow.warm += 1; return; }
      slow.n += 1; slow.sum += gap;
      if (slow.n < 50) return;
      var avg = slow.sum / slow.n, budget = Math.max(frameMs, 16.7) * 1.45;
      slow.n = slow.sum = 0;
      if (avg < budget) return;
      slow.level += 1; slow.warm = 20;
      if (slow.level === 1) { dirty = true; return; }                  /* lower resolution */
      if (slow.level === 2) { frameMs = Math.max(frameMs, 33); G.setExtras(false); return; } /* 30 fps, fewer objects */
      if (slow.level === 3 && frameMs < 48) { frameMs = 48; return; }  /* 20 fps */
      fail(new Error("too slow"));
    }

    function frame(now, dt) {
      if (state !== "ready") return;
      acc += dt;
      if (frameMs && acc < frameMs - 2) return;
      var stepMs = Math.min(acc, 100); acc = 0;
      if (slow.last) watch(now - slow.last);
      slow.last = now;
      if (dirty && !size()) return;
      /* the poster's frame holds while the canvas fades in over it (no ghosting), then time,
         parallax and the scroll turn ease in: the still image comes alive */
      var since = liveAt ? now - liveAt : 0, ramp = smooth((since - 1000) / 1400);
      var k = 1 - Math.exp(-stepMs / 1000 * 4);
      ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;
      G.px = ptr.x * ramp; G.py = ptr.y * ramp;
      var sy = win.pageYOffset || root.scrollTop || 0;
      G.scroll = clamp(sy / Math.max(1, stageH), 0, 1) * ramp;
      try { G.frame(stepMs / 1000 * ramp); } catch (e) { fail(e); }
    }
    function play() {
      if (state !== "ready" || held || !visible || !allowed() || !homeShown()) return;
      acc = frameMs; slow.last = 0;
      loop.start();
    }
    function pause() { loop.stop(); slow.last = 0; }

    offs.push(CN.onMotion(function (reduced) {
      if (reduced) { pause(); box.classList.remove("is-live"); return; }
      if (state === "ready") { box.classList.add("is-live"); play(); } else maybe();
    }));
    CN.onPage(function (id) {
      if (pageSeen) switchedAt = CN.now();
      pageSeen = true;
      if (id === "home") { if (state === "ready") play(); else maybe(); }
      else pause();
    });
    CN.afterLoad(function () { setTimeout(function () { loaded = true; maybe(); }, START_MS); });

    return {
      pause: pause,
      resume: function () { if (state === "ready") play(); else maybe(); },
      destroy: function () {
        state = "dead";
        pause();
        clearTimeout(deepTimer);
        offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
        if (ro) ro.disconnect();
        if (G) { G.dispose(); G = null; }
        box.classList.remove("is-live");
      }
    };
  });
})();
