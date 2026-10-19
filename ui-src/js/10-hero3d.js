/* Home hero 3D runtime (canvas.cn-hero4-canvas[data-cn="hero3d"] in .cn-hero4-scene).
   The scene lives in /ui/3d/hero3d-kit.js (readable source; the site loads the minified
   hero3d-kit.min.js that scripts/render-3d.mjs writes) as window.CNHero3D, loaded on demand
   with three.js r128 (jsDelivr, SRI). This module decides when, and drives it.

   Rules (DESIGN.md v4.1 "Midnight"):
   - One canvas, one WebGL context, covering the whole stage: the dark glass globe (drawn
     exactly inside the poster image's square, through a camera view offset) and the calm
     motion layer behind the copy (hairline light lines flowing into the globe).
   - img.cn-hero4-poster shows first. scripts/render-3d.mjs renders it from the kit at scene
     time T0, so the live globe starts on the poster's exact frame. The canvas fades in over
     it (.cn-hero4-scene.is-live) while that frame holds, then time and the scroll tilt ease
     in: the still image comes alive, and the light lines appear.
   - Nothing loads until window load + idle + START_MS, and only while Home is the page shown
     and the stage is on screen (deep links never pay for it), 1.4 s after a page switch. The
     build and the shader compiles run in idle slices, so a tap is never kept waiting long.
   - Never under reduced motion, the global Pause motion (html.cn-still; CN.reduced() is true
     then) or Save-Data: the poster stays. No WebGL, a failed load, a software renderer
     (failIfMajorPerformanceCaveat), slow frames or a lost context also leave the poster.
   - v4.7 (owner: "make it super smooth"): DPR <= 1.5 on desktop and 1 on touch screens, with a
     pixel cap (2 M desktop, 0.6 M touch), about 30 fps everywhere (a slow spin reads the same
     at 30 as at 60, and every frame not drawn is main-thread time back for the scroll). A
     governor lowers the resolution, then the frame rate (and drops the extras), then gives up.
   - Low-end phones keep the poster: a touch screen with deviceMemory <= 4 GB or <= 4 cores
     never loads three.js (the poster is the scene's own frame, so the hero looks the same, only
     still). Save-Data keeps it too.
   - Stops completely off screen (no timer, no frame), while the tab is hidden, while Home is not shown, while the phone
     menu sheet covers it (CN.onCover) and while the hero's Pause button is pressed
     (20-scanbox.js dispatches "cn-hero-motion").
   - v5: every frame is asked for through CN.raf (the one frame clock, 00-core.js), which runs on
     the gsap.ticker once the desktop motion core has loaded; the 30 fps timer pacing, the DPR and
     pixel caps and every pause above are unchanged. Under Lenis the scroll hold still applies:
     CN.scrolling() is true while a Lenis run is in flight.
   - Desktop (fine pointer): drag the globe to turn it (it coasts, then eases back to its slow
     spin). No pointer parallax: nothing follows the cursor. Touch screens keep native
     scrolling.
   - A gentle scroll-linked tilt as the hero scrolls away (eased). v4.7: the frame holds while
     the page is scrolling (CN.scrolling) and the globe carries on 160 ms after it stops.
   - Toggles .is-on on the stage while it is on screen (CSS hook). */
(function () {
  "use strict";
  var win = window, doc = document, CN = win.CN;
  if (!CN) return;
  var THREE_SRC = "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";
  var THREE_SRI = "sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";
  var KIT_V = "d536fa8c5c";  /* hash of /ui/3d/hero3d-kit.min.js, stamped by scripts/render-3d.mjs */
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
  var MAX_PX_FINE = 2000000, MAX_PX_COARSE = 600000;
  var FRAME_MS = 33;          /* ~30 fps everywhere */
  var LINK_WAIT_MS = 400, LINK_GIVEUP_MS = 10000;
  var HOLD_MS = 450, RAMP_MS = 1100;  /* the poster frame holds, then time eases in */
  /* after load + idle: let the page's own start-up finish first (longer on phones) */
  var START_FINE = 500, START_COARSE = 1200;

  /* no test context (one live WebGL context at a time): if the real one cannot be created,
     the renderer throws, fail() keeps the poster */
  function hasWebGL() { return !!(win.WebGLRenderingContext && doc.createElement("canvas").getContext); }
  /* a low-end phone: the poster is the hero there (deviceMemory is Chromium-only; cores everywhere) */
  function lowEnd() {
    if (CN.finePointer()) return false;
    var mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
    return (typeof mem === "number" && mem > 0 && mem <= 4) || (typeof cores === "number" && cores > 0 && cores <= 4);
  }
  var idle = win.requestIdleCallback ? function (f) { win.requestIdleCallback(f, { timeout: 1200 }); } : function (f) { setTimeout(f, 150); };
  /* idle slices for the build and the shader compiles, so a tap is never kept waiting long */
  function idleTask(f) {
    if (win.requestIdleCallback) win.requestIdleCallback(f, { timeout: 2000 });
    else setTimeout(function () { f(null); }, 60);
  }
  /* The frame loop, paced to rate() ms. At full rate it is a plain rAF chain. At a lower rate a
     timer waits out the gap and then asks for one animation frame, so the page only runs its
     rendering steps for the frames that are drawn (a rAF chain that skips frames still runs
     the whole document lifecycle 60 times a second). rAF never fires in a hidden tab, so the
     loop rests there by itself. fn(t, dt) */
  function pacedLoop(fn, rate) {
    var on = false, raf = 0, timer = 0, last = 0;
    function tick(t) {
      raf = 0;
      if (!on) return;
      var dt = last ? Math.min(100, t - last) : 16;
      last = t;
      fn(t, dt);
      next();
    }
    function next() {
      if (!on) return;
      var ms = rate();
      if (!ms) { raf = CN.raf(tick); return; }
      timer = setTimeout(function () { timer = 0; if (on) raf = CN.raf(tick); }, Math.max(0, ms - (CN.now() - last) - 7));
    }
    return {
      start: function () { if (on) return; on = true; last = 0; raf = CN.raf(tick); },
      stop: function () { on = false; if (raf) CN.cancelRaf(raf); if (timer) clearTimeout(timer); raf = timer = 0; },
      running: function () { return on; }
    };
  }

  CN.register("hero3d", function (canvas) {
    var box = canvas.parentNode, stage = box && box.closest ? box.closest(".cn-stage") : null;
    var poster = box ? box.querySelector(".cn-hero4-poster") : null;
    var copy = stage ? stage.querySelector(".hero-content") : null;
    var home = doc.getElementById("home"), root = doc.documentElement;
    var coarse = !CN.finePointer();
    var G = null, state = "idle"; /* idle | loading | ready | dead */
    var visible = false, held = false, loaded = false, queued = false, deepTimer = 0, pageSeen = false, switchedAt = -1e9;
    var frameMs = FRAME_MS, dirty = true, stageH = 600;
    var slow = { n: 0, sum: 0, warm: 0, last: 0, level: 0 };
    var ro = null, offs = [], liveAt = 0;
    var disc = null;            /* the globe on screen: centre and radius, CSS px in the canvas */
    var drag = null, spinV = 0; /* the drag; the turn's inertia (rad/s) */
    var loop = pacedLoop(frame, function () { return frameMs; });

    held = !!(stage && stage.classList.contains("is-paused"));
    if (stage) {
      stage.addEventListener("cn-hero-motion", function (e) {
        held = !!(e.detail && e.detail.paused);
        if (held) { endDrag(); pause(); } else play();
      });
    }
    offs.push(CN.inView(stage || box, function (vis) {
      visible = vis;
      if (stage) stage.classList.toggle("is-on", !!vis);
      if (!vis) { endDrag(); pause(); return; }
      if (state === "ready") play(); else maybe();
    }));

    function homeShown() {
      return !!home && home.classList.contains("active-page") && !home.classList.contains("leaving") &&
        !root.classList.contains("cn-deep") && canvas.clientWidth > 0;
    }
    function allowed() { return !CN.reduced() && !CN.saveData() && !lowEnd(); }
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
            dirty = true;
            if (!size()) { fail(new Error("no size")); return; }
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
          if (!ready && waited < LINK_GIVEUP_MS) { CN.raf(wait); return; }
        } else if (waited < LINK_WAIT_MS) { setTimeout(wait, LINK_WAIT_MS - waited); return; }
        firstFrame();
      })();
    }
    function firstFrame() {
      var gl = G.R.getContext();
      var ok = G.programs().every(function (p) { return gl.getProgramParameter(p, gl.LINK_STATUS); });
      if (!ok) { fail(new Error("shader link failed")); return; }
      try { G.draw(); } catch (e) { fail(e); return; }
      state = "ready";
      if ("ResizeObserver" in win) {
        ro = new ResizeObserver(function () { dirty = true; });
        ro.observe(canvas);
        if (poster) ro.observe(poster);
      } else win.addEventListener("resize", function () { dirty = true; }, { passive: true });
      if (!coarse && stage) dragSetup();
      /* v5 Exposure (html.cn-intro, the first Home view of a session): the live globe crossfades
         over its poster no earlier than 1.4 s after the page started, once the veil has lifted.
         The head snippet's font hold (html.cn-intro-hold, up to 700 ms) starts the veil later, so
         the crossfade moves by the time it held (window.CN_introDelay), or by the cap while it
         still holds. */
      var live = function () { if (state === "ready" && allowed()) { box.classList.add("is-live"); liveAt = CN.now(); } };
      var introWait = function () {
        if (!root.classList.contains("cn-intro")) return 0;
        var held = root.classList.contains("cn-intro-hold") ? 700 : (+win.CN_introDelay || 0);
        return 1400 + held - CN.now();
      };
      CN.raf(function () { setTimeout(live, introWait()); });
      play();
    }
    function fail(err) {
      if (state === "dead") return;
      state = "dead";
      pause();
      endDrag();
      box.classList.remove("is-live");
      if (G) { G.dispose(); G = null; }
      if (err && win.console && console.warn) console.warn("[cn] hero 3D off, poster kept:", err.message || err);
    }
    function onLost(e) { e.preventDefault(); fail(new Error("context lost")); }

    /* The canvas covers the stage. The globe goes where the poster is (its square, CSS px
       inside the canvas); the light lines run quieter behind the copy. Layout is read here
       only: once at start and after a resize. */
    function size() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h || !poster) return false;
      var cr = canvas.getBoundingClientRect(), pr = poster.getBoundingClientRect();
      if (!pr.width) return false;
      var cap = coarse ? MAX_PX_COARSE : MAX_PX_FINE;
      var d = Math.min(win.devicePixelRatio || 1, coarse ? DPR_COARSE : DPR_FINE) * (slow.level > 0 ? .75 : 1);
      if (w * h * d * d > cap) d = Math.sqrt(cap / (w * h));
      G.size(w, h, d);
      var L = { s: pr.width, sx: pr.left - cr.left, sy: pr.top - cr.top, mode: "side" };
      if (stage && win.getComputedStyle(stage).flexDirection === "column") L.mode = "stack";
      if (copy) {
        var qr = copy.getBoundingClientRect();
        L.qx = qr.left - cr.left; L.qy = qr.top - cr.top; L.qw = qr.width; L.qh = qr.height;
      }
      G.layout(L);
      disc = { x: L.sx + L.s / 2, y: L.sy + L.s / 2, r: L.s * win.CNHero3D.FILL / 2 };
      stageH = (stage && stage.offsetHeight) || h;
      dirty = false;
      return true;
    }

    /* ---- drag to turn the globe (fine pointers only) ---- */
    function onDisc(e) {
      if (!disc) return false;
      var cr = canvas.getBoundingClientRect(), dx = e.clientX - cr.left - disc.x, dy = e.clientY - cr.top - disc.y;
      return dx * dx + dy * dy <= disc.r * disc.r * 1.04;
    }
    /* only on the stage's own surface, never through the copy, the scan box or the Pause button */
    function free(e) { return e.target === stage || e.target === box || e.target === canvas; }
    function canDrag() { return state === "ready" && !held && visible && allowed(); }
    function endDrag() {
      if (!drag) return;
      var id = drag.id;
      drag = null;
      try { if (stage.hasPointerCapture && stage.hasPointerCapture(id)) stage.releasePointerCapture(id); } catch (e) { /* gone */ }
      stage.style.cursor = "";
    }
    function dragSetup() {
      var hover = false;
      function down(e) {
        if (e.pointerType !== "mouse" || e.button !== 0 || drag || !canDrag() || !free(e) || !onDisc(e)) return;
        e.preventDefault();
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: CN.now() };
        spinV = 0;
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
        stage.style.cursor = "grabbing";
      }
      function move(e) {
        if (e.pointerType !== "mouse") return;
        if (drag) {
          if (e.pointerId !== drag.id || !G || !disc) return;
          var now = CN.now(), dt = Math.max(8, now - drag.t) / 1000;
          var dyaw = (e.clientX - drag.x) / disc.r, dp = (e.clientY - drag.y) / disc.r;
          G.yaw += dyaw;
          G.pitch = clamp(G.pitch + dp * .6, -.45, .45);
          spinV = spinV * .5 + (dyaw / dt) * .5;
          drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
          return;
        }
        var on = canDrag() && free(e) && onDisc(e);
        if (on !== hover) { hover = on; stage.style.cursor = on ? "grab" : ""; }
      }
      function up(e) {
        if (!drag || e.pointerId !== drag.id) return;
        if (CN.now() - drag.t > 120) spinV = 0;   /* held still before letting go */
        spinV = clamp(spinV, -3, 3);
        endDrag();
        hover = false;
      }
      function leave() { if (!drag && hover) { hover = false; stage.style.cursor = ""; } }
      stage.addEventListener("pointerdown", down);
      stage.addEventListener("pointermove", move, { passive: true });
      stage.addEventListener("pointerup", up);
      stage.addEventListener("pointercancel", up);
      stage.addEventListener("lostpointercapture", up);
      stage.addEventListener("pointerleave", leave);
      offs.push(function () {
        stage.removeEventListener("pointerdown", down);
        stage.removeEventListener("pointermove", move);
        stage.removeEventListener("pointerup", up);
        stage.removeEventListener("pointercancel", up);
        stage.removeEventListener("lostpointercapture", up);
        stage.removeEventListener("pointerleave", leave);
      });
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
      if (slow.level === 2) { frameMs = Math.max(frameMs, 33); G.setExtras(false); return; } /* 30 fps, fewer extras */
      if (slow.level === 3 && frameMs < 48) { frameMs = 48; return; }  /* 20 fps */
      fail(new Error("too slow"));
    }

    var tilt = 0;
    function frame(now, dt) {
      if (state !== "ready") return;
      /* v4.7: hold the frame while the page scrolls (the compositor moves the page; a held globe
         is invisible while everything moves) and carry on once it is still */
      if (!drag && CN.scrolling()) { pause(); CN.whenStill(play); return; }
      var stepMs = Math.min(dt, 100);
      if (slow.last) watch(now - slow.last);
      slow.last = now;
      if (dirty && !size()) return;
      /* the poster's frame holds while the canvas fades in over it (no ghosting), then time
         and the scroll tilt ease in: the still image comes alive */
      var since = liveAt ? now - liveAt : 0, ramp = smooth((since - HOLD_MS) / RAMP_MS), s = stepMs / 1000;
      if (!drag) {
        /* after a drag the turn coasts to a stop and the tilt settles back */
        G.yaw += spinV * s;
        spinV *= Math.exp(-s * 2.4);
        if (Math.abs(spinV) < .002) spinV = 0;
        G.pitch *= Math.exp(-s * 2.2);
      }
      var sy = win.pageYOffset || root.scrollTop || 0;
      /* eased, so the tilt glides to the new scroll position after a held stretch */
      tilt += (clamp(sy / Math.max(1, stageH), 0, 1) * ramp - tilt) * (1 - Math.exp(-stepMs / 160));
      G.scroll = tilt;
      try { G.frame(s * ramp); } catch (e) { fail(e); }
    }
    function play() {
      if (state !== "ready" || held || !visible || !allowed() || !homeShown() || CN.covered() || CN.hidden()) return;
      slow.last = 0;
      loop.start();
    }
    function pause() { loop.stop(); slow.last = 0; }

    /* the phone menu sheet covers the stage: rest under it, carry on when it closes */
    offs.push(CN.onCover(function (on) {
      if (on) { endDrag(); pause(); }
      else if (state === "ready") play();
    }));
    offs.push(CN.onVisibility(function (vis) {
      if (!vis) { endDrag(); pause(); }
      else if (state === "ready") play();
    }));
    offs.push(CN.onMotion(function (reduced) {
      if (reduced) { endDrag(); pause(); box.classList.remove("is-live"); return; }
      if (state === "ready") { box.classList.add("is-live"); play(); } else maybe();
    }));
    CN.onPage(function (id) {
      if (pageSeen) switchedAt = CN.now();
      pageSeen = true;
      if (id === "home") { if (state === "ready") play(); else maybe(); }
      else { endDrag(); pause(); }
    });
    CN.afterLoad(function () { setTimeout(function () { loaded = true; maybe(); }, coarse ? START_COARSE : START_FINE); });

    return {
      pause: function () { endDrag(); pause(); },
      resume: function () { if (state === "ready") play(); else maybe(); },
      destroy: function () {
        state = "dead";
        pause();
        endDrag();
        clearTimeout(deepTimer);
        offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
        if (ro) ro.disconnect();
        if (G) { G.dispose(); G = null; }
        box.classList.remove("is-live");
      }
    };
  });
})();
