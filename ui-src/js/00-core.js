/* CyberNet UI core: the shared runtime behind window.CN (owner: platform).
   Every other file is a plain IIFE module that uses these helpers. All of them are optional:
   a module can still do its own thing, but the shared versions cost one listener each.

   Starting work
   - CN.onReady(fn): fn runs once the DOM is ready, from the init queue. The queue runs its jobs
     first in, first out, in slices of about 12 ms, each slice in its own task, so module set-up
     never adds up to one long task: the browser can paint and answer a tap in between. A job
     that throws is logged and the rest still run.
   - CN.later(fn): the same queue, for a module that wants to split its own heavy set-up.
   - CN.afterLoad(fn): after window load, when the browser is idle (non-urgent heavy work).
   - CN.register(name, init, opts): init(el) for every [data-cn="name"], lazily when it comes
     within 200px of the viewport (opts.margin to change that), or from the queue at start-up
     with opts.eager (for anything that changes layout). init may return a controller
     { pause(), resume(), destroy() }; it is kept on el.__cn and used by CN.pause / CN.resume.
   - CN.mount(ctx): starts registered modules for [data-cn] markup added later inside ctx.

   Motion and visibility (one shared listener each)
   - CN.reduced(): prefers-reduced-motion (07-aurora.js adds Pause motion). CN.onMotion(cb) ->
     off(): cb(reduced) on a change of the OS setting.
   - CN.hidden(): the tab is hidden. CN.onVisibility(cb) -> off(): cb(visible) on a change.
   - CN.raf(fn) -> id, CN.cancelRaf(id) (v5): the one frame clock. fn(t) runs once in the next
     frame, t in ms on the performance.now() timebase. Every callback queued for a frame shares
     ONE native requestAnimationFrame (also once GSAP has loaded). Nothing queued = no frame cost.
   - CN.loop(fn): a frame loop { start, stop, running } on CN.raf; fn(t, dt), dt clamped to
     64 ms. Every loop is suspended while the tab is hidden or the page is covered.
   - CN.covered(): the page is hidden under a full-screen opaque layer (the phone menu sheet;
     12-nav.js calls CN.setCovered). CN.onCover(cb) -> off(): cb(covered) on a change. Anything
     that keeps drawing (canvases, timers) should rest while covered.
   - CN.setLayer(open) (08-focus.js only), CN.layerOpen(), CN.onLayer(cb) -> off(): a top layer
     (the menu sheet, any dialog, the Legal Center) is open. Lenis leaves the wheel native then.
   - CN.pause(scope) / CN.resume(scope): calls pause() / resume() on the controllers of the
     modules inside scope (an element; the whole page when omitted).
   - CN.motion (02-motion.js), CN.smooth() / CN.smoothStats() (06-scroll.js): see those files.
   The helper list in ui-src/DESIGN.md is the integrator's to update.

   Viewport and pages
   - CN.inView(el, cb, opts) -> stop(): cb(visible, entry) whenever el enters or leaves the
     viewport (opts.margin, opts.threshold). Without IntersectionObserver, cb(true) once, async.
     Watches with the same options share one observer (see pool() below); always call stop()
     when a watch is no longer needed, so the element leaves the observer.
   - CN.once(el, fn, opts) -> stop(), alias CN.onVisible: fn() the first time el is visible
     (threshold .15 unless opts.threshold).
   - CN.onPage(cb): cb(id) for the legacy page now showing ("home", "cybernet", ...), then on
     every switch.

   Scrolling (v4.7)
   - CN.scrolling(): the page scrolled in the last 160 ms, or a Lenis run is in flight (v5).
     CN.whenStill(fn): fn() now if the page
     is not scrolling, otherwise once it has been still for 160 ms. One-off shows that run on the
     main thread (the example scan, the engine diagram's run, the closing statement's words) start
     through it, so they never compete with a scroll in progress; they play once the visitor
     stops to look. One passive scroll listener for the whole page.

   Small helpers: now, saveData, finePointer, qs, qsa, clamp, lerp, easeOut, and text(el, s) for
   repeated text writes (counters): it edits the one text node in place, which the legacy
   body-wide MutationObservers ignore (a replaced text node re-runs their set-up). Adds html.cn-js,
   which enables the hidden "before" states of reveals (so nothing hides without JS). */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement, win = window;
  root.classList.add("cn-js");

  var mqReduce = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var mqFine = win.matchMedia ? win.matchMedia("(hover: hover) and (pointer: fine)") : null;

  function now() { return (win.performance && performance.now) ? performance.now() : Date.now(); }
  function reduced() { return !!(mqReduce && mqReduce.matches); }
  function saveData() { var c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))); }
  function finePointer() { return !!(mqFine && mqFine.matches); }
  function hidden() { return !!doc.hidden; }
  function qs(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  /* text(el, s): write text by changing the element's one text node in place (a characterData
     change) instead of replacing its children: the legacy body-wide observers re-run their
     whole set-up for every added node, but ignore in-place text edits. */
  function text(el, s) {
    if (!el) return;
    s = String(s);
    var n = el.firstChild;
    if (n && n === el.lastChild && n.nodeType === 3) { if (n.nodeValue !== s) n.nodeValue = s; }
    else if (el.textContent !== s) el.textContent = s;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function report(where, err) {
    try { if (win.console && console.error) console.error("[cn" + (where ? ":" + where : "") + "]", err); } catch (e) { /* no console */ }
  }

  /* ---------- shared listeners ---------- */
  function channel() {
    var list = [];
    return {
      add: function (cb) {
        if (typeof cb !== "function") return function () {};
        list.push(cb);
        return function () { var i = list.indexOf(cb); if (i >= 0) list.splice(i, 1); };
      },
      fire: function (v) { list.slice().forEach(function (cb) { try { cb(v); } catch (e) { report("listener", e); } }); }
    };
  }
  var motion = channel(), visibility = channel(), cover = channel(), layers = channel();
  /* A top layer is open (08-focus.js reports it): Lenis keeps the wheel native and settles. */
  var layer = false;
  function setLayer(v) {
    v = !!v;
    if (v === layer) return;
    layer = v;
    layers.fire(v);
  }
  /* Covered: a full-screen opaque layer (the phone menu sheet, 12-nav.js) hides the whole page,
     so nothing under it needs to move. Loops (CN.loop) suspend while covered, and canvases
     (10-hero3d.js, 09-bgfx.js) listen through CN.onCover. */
  var covered = false;
  function setCovered(v) {
    v = !!v;
    if (v === covered) return;
    covered = v;
    loops.forEach(function (l) { if (covered) l._suspend(); else l._resume(); });
    cover.fire(covered);
  }
  if (mqReduce) {
    var onReduce = function () { motion.fire(reduced()); };
    if (mqReduce.addEventListener) mqReduce.addEventListener("change", onReduce);
    else if (mqReduce.addListener) mqReduce.addListener(onReduce);
  }

  /* ---------- one frame clock ----------
     raf(fn) -> id: fn(t) once, in the next frame. Every queued callback shares one native
     requestAnimationFrame; t is the frame's rAF timestamp (performance.now() timebase). It stays
     native once GSAP has loaded (finish, 18 Oct): run on gsap.ticker, the canvases' 30 fps
     requests re-woke the ticker every other frame, so it never slept and asked for 60 frames a
     second at rest. Lenis alone uses gsap.ticker, and only during a glide (06-scroll.js). */
  var rq = [], rqId = 0, rqNative = 0;
  function nativeFrame(t) {
    rqNative = 0;
    var list = rq;
    rq = [];
    for (var i = 0; i < list.length; i++) {
      try { list[i][1](t); } catch (e) { report("raf", e); }
    }
  }
  function raf(fn) {
    if (typeof fn !== "function") return 0;
    rq.push([++rqId, fn]);
    if (!rqNative) rqNative = requestAnimationFrame(nativeFrame);
    return rqId;
  }
  function cancelRaf(id) {
    for (var i = 0; i < rq.length; i++) if (rq[i][0] === id) { rq.splice(i, 1); return; }
  }

  /* loop(fn): fn(t, dt) every frame while running. Returns {start, stop, running}. */
  var loops = [];
  function loop(fn) {
    var id = 0, last = 0, on = false, wanted = false;
    function frame(t) {
      id = 0;
      if (!on) return;
      var dt = last ? Math.max(0, Math.min(64, t - last)) : 16; last = t;
      fn(t, dt);
      if (on && !id) id = raf(frame);
    }
    function go() { on = true; last = 0; if (!id) id = raf(frame); }
    function halt() { on = false; if (id) { cancelRaf(id); id = 0; } }
    var api = {
      start: function () { wanted = true; if (on || doc.hidden || covered) return; go(); },
      stop: function () { wanted = false; halt(); },
      _suspend: halt,
      _resume: function () { if (wanted && !on && !doc.hidden && !covered) go(); },
      running: function () { return on; }
    };
    loops.push(api);
    return api;
  }
  doc.addEventListener("visibilitychange", function () {
    loops.forEach(function (l) { if (doc.hidden) l._suspend(); else l._resume(); });
    visibility.fire(!doc.hidden);
  });

  /* ---------- scrolling ---------- */
  var STILL_MS = 160, scrolledAt = -1e9, stillWaiters = [], stillTimer = 0;
  /* a Lenis run in flight (06-scroll.js) counts as scrolling too */
  function gliding() { var s = win.CN && win.CN.smooth && win.CN.smooth(); return !!(s && s.isScrolling); }
  function scrolling() { return now() - scrolledAt < STILL_MS || gliding(); }
  function flushStill() {
    stillTimer = 0;
    var left = STILL_MS - (now() - scrolledAt);
    if (left > 0 || gliding()) { stillTimer = setTimeout(flushStill, Math.max(left, 60) + 8); return; }
    var list = stillWaiters; stillWaiters = [];
    list.forEach(function (f) { try { f(); } catch (e) { report("whenStill", e); } });
  }
  function whenStill(fn) {
    if (typeof fn !== "function") return;
    if (!scrolling()) { fn(); return; }
    stillWaiters.push(fn);
    if (!stillTimer) stillTimer = setTimeout(flushStill, STILL_MS - (now() - scrolledAt) + 8);
  }
  win.addEventListener("scroll", function () { scrolledAt = now(); }, { passive: true, capture: true });

  /* ---------- init queue ---------- */
  var SLICE_MS = 12;
  var queue = [], scheduled = false;
  /* The bundle is a deferred script: it runs before DOMContentLoaded, while readyState is already
     "interactive". Wait for the event then, so module set-up starts after the legacy scripts'
     own DOMContentLoaded handlers and in tasks of its own. */
  var domReady = doc.readyState === "complete" ||
    (doc.readyState === "interactive" && !(doc.currentScript && doc.currentScript.defer));
  if (!domReady) doc.addEventListener("DOMContentLoaded", function () { domReady = true; kick(); });

  var post = (function () {
    var s = win.scheduler;
    if (s && typeof s.postTask === "function") return function (fn) { s.postTask(fn, { priority: "user-visible" }); };
    if (typeof win.MessageChannel === "function") {
      var ch = new MessageChannel(), waiting = [];
      ch.port1.onmessage = function () { var f = waiting.shift(); if (f) f(); };
      return function (fn) { waiting.push(fn); ch.port2.postMessage(0); };
    }
    return function (fn) { setTimeout(fn, 0); };
  })();
  function kick() {
    if (scheduled || !domReady || !queue.length) return;
    scheduled = true;
    post(drain);
  }
  function drain() {
    scheduled = false;
    var t0 = now();
    while (queue.length) {
      var job = queue.shift();
      try { job.fn(); } catch (err) { report(job.name, err); }
      if (now() - t0 > SLICE_MS) break;
    }
    kick();
  }
  function later(fn, name) {
    if (typeof fn !== "function") return;
    queue.push({ fn: fn, name: name || "" });
    kick();
  }
  function onReady(fn) { later(fn, "ready"); }
  function afterLoad(fn) {
    var go = function () { (win.requestIdleCallback || function (f) { return setTimeout(f, 200); })(fn, { timeout: 1500 }); };
    if (doc.readyState === "complete") go(); else win.addEventListener("load", go);
  }

  /* ---------- viewport ---------- */
  /* One shared IntersectionObserver per (margin, threshold), not one per call: the page asks for
     about a hundred watches, and every observer is worked out again on every scrolled frame.
     A pool holds each element once; a second watch on the same element with the same options
     goes to a second pool, so it still gets its own first report. Stopping a watch unobserves
     the element once nothing else in that pool needs it. */
  var pools = {};
  function pool(margin, threshold, el) {
    var key = margin + "|" + String(threshold), list = pools[key] || (pools[key] = []);
    for (var i = 0; i < list.length; i++) if (!list[i].map.has(el)) return list[i];
    var p = { map: new Map(), io: null };
    p.io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var cbs = p.map.get(e.target);
        if (!cbs) return;
        cbs.slice().forEach(function (f) {
          if (cbs.indexOf(f) < 0) return; /* stopped by an earlier callback in this batch */
          try { f(e.isIntersecting, e); } catch (err) { report("inView", err); }
        });
      });
    }, { rootMargin: margin, threshold: threshold });
    list.push(p);
    return p;
  }
  function inView(el, cb, opts) {
    opts = opts || {};
    if (!el) return function () {};
    if (!("IntersectionObserver" in win) || typeof Map !== "function") {
      /* Old in-app WebViews: treat it as visible, once, after the caller has its stop(). */
      var off = false;
      setTimeout(function () { if (!off) cb(true, null); }, 0);
      return function () { off = true; };
    }
    var p = pool(opts.margin || "0px", opts.threshold || 0, el);
    p.map.set(el, [cb]);
    p.io.observe(el);
    var stopped = false;
    return function () {
      if (stopped) return;
      stopped = true;
      var cbs = p.map.get(el);
      if (!cbs) return;
      var i = cbs.indexOf(cb);
      if (i >= 0) cbs.splice(i, 1);
      if (!cbs.length) { p.map.delete(el); p.io.unobserve(el); }
    };
  }
  function once(el, fn, opts) {
    var done = false, stop = null;
    stop = inView(el, function (vis) {
      if (!vis || done) return;
      done = true;
      if (stop) stop();
      fn();
    }, { margin: (opts && opts.margin) || "0px", threshold: (opts && opts.threshold) || .15 });
    if (done) stop();
    return function () { done = true; stop(); };
  }

  /* ---------- modules ---------- */
  var registry = {}, controllers = [];
  function boot(name, el) {
    var mod = registry[name];
    if (!mod) return;
    try {
      var ctl = mod.init(el) || null;
      el.__cn = ctl;
      if (ctl) controllers.push({ name: name, el: el, ctl: ctl });
    } catch (err) { report(name, err); }
  }
  function arm(name, el) {
    var mod = registry[name];
    if (!mod || !el || el.__cnInit) return;
    el.__cnInit = true;
    if (mod.opts.eager) { later(function () { boot(name, el); }, name); return; }
    var fired = false, stop = null;
    stop = inView(el, function (vis) {
      if (!vis || fired) return;
      fired = true;
      if (stop) stop();
      boot(name, el);
    }, { margin: mod.opts.margin || "200px 0px" });
    if (fired) stop();
  }
  function hooks(name, ctx) {
    var sel = '[data-cn="' + name + '"]', list = qsa(sel, ctx);
    if (ctx && ctx !== doc && ctx.matches && ctx.matches(sel)) list.unshift(ctx);
    return list;
  }
  function register(name, init, opts) {
    if (typeof init !== "function") return;
    registry[name] = { init: init, opts: opts || {} };
    onReady(function () { hooks(name).forEach(function (el) { arm(name, el); }); });
  }
  function mount(ctx) {
    onReady(function () {
      Object.keys(registry).forEach(function (name) { hooks(name, ctx || doc).forEach(function (el) { arm(name, el); }); });
    });
  }
  function control(scope, method) {
    controllers.forEach(function (c) {
      if (scope && scope !== doc && !(scope.contains && scope.contains(c.el))) return;
      var f = c.ctl[method];
      if (typeof f === "function") { try { f.call(c.ctl); } catch (err) { report(c.name, err); } }
    });
  }

  /* ---------- legacy pages ---------- */
  function onPage(cb) {
    var cur = null;
    function check() {
      var p = qs(".page.active-page");
      var id = p ? p.id : null;
      if (id !== cur) { cur = id; cb(id); }
    }
    onReady(function () {
      check();
      if (!("MutationObserver" in win)) return;
      qsa(".page").forEach(function (p) { new MutationObserver(check).observe(p, { attributes: true, attributeFilter: ["class"] }); });
    });
  }

  win.CN = {
    now: now, reduced: reduced, saveData: saveData, finePointer: finePointer, hidden: hidden,
    qs: qs, qsa: qsa, clamp: clamp, lerp: lerp, easeOut: easeOut, text: text,
    scrolling: scrolling, whenStill: whenStill,
    inView: inView, once: once, onVisible: once, loop: loop, raf: raf, cancelRaf: cancelRaf,
    onMotion: motion.add, onVisibility: visibility.add,
    covered: function () { return covered; }, onCover: cover.add, setCovered: setCovered,
    layerOpen: function () { return layer; }, onLayer: layers.add, setLayer: setLayer,
    register: register, mount: mount,
    pause: function (scope) { control(scope, "pause"); },
    resume: function (scope) { control(scope, "resume"); },
    onReady: onReady, later: later, afterLoad: afterLoad, onPage: onPage,
    _ch: channel, _err: report
  };
})();
