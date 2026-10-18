/* CyberNet UI v5: smooth wheel scrolling on desktop, Lenis 1.3.26 (MIT, (c) darkroom.engineering)
   on the GSAP ticker (owner: core). v4.7 removed Lenis because, done naively, it made 14.5% of
   desktop Home frames late. It comes back here only where it cannot hurt:
   - Built by 02-motion.js after load + idle, only on tier "full" (a fine primary pointer with hover,
     4+ cores, 4+ GB, no Save-Data), flag "lenis", motion allowed, and not opted out
     (localStorage cn-native-scroll=1, or sessionStorage cn-lenis-off=1 after a demotion).
     Phones and tablets (coarse primary pointers) keep the browser's compositor scrolling: Lenis
     attaches non-passive touch listeners even with syncTouch off, so it is never built there.
   - One frame clock: Lenis is driven from gsap.ticker (no autoRaf), and only during a run. A
     passive wheel listener and our own scrollTo calls attach the tick; it removes itself after 8
     ticks without a smooth run, so the page has no frame loop at rest. ScrollTrigger is updated
     from Lenis' scroll event. lagSmoothing(0) only while Lenis lives.
   - Never on Quick Scan or Analysis AI (native wheel there; measured, finish 18 Oct).
   - Never inside a layer or a nested scroller: while the menu sheet, a dialog or the Legal
     Center is open (CN.layerOpen, 08-focus.js), or over PREVENT, the wheel stays native (and a
     run in flight settles first). A textarea counts only when it can scroll itself.
   - Settle on intent: pointerdown, keydown, a page switch (CN.motion.onNavigate) and a layer
     opening stop an inertia run where it is (stop() + start() in one task; never left stopped),
     so script.js's scrollTo(0, 0) on a page switch never fights a glide.
   - Anchors: a mouse click on a[href="#cnScanInput"] or a Learn module chip glides there through
     CN.motion.scrollTo (scroll-margin honoured) and focus moves to the target as the jump would
     move it. Keyboard activation and the skip link stay native.
   - <html> is not restyled during scroll: Lenis' run-state classes are not written (see _make).
   - Governor: windows of 90 smooth frames; a frame is late over 25 ms; a window over 25% late is
     a strike. Two strikes in a row, or one window over 45%, demote: Lenis is destroyed, its
     classes are stripped the next frame, sessionStorage cn-lenis-off=1, every scrub falls back (CN.motion.demote).
   - Pause motion or reduced motion: destroyed for the rest of the page view (never re-created).
   CSS: 80-perf.css section 7. API: CN.smooth() -> Lenis | null, CN.smoothStats() ->
   CN.motion.stats(). */
(function () {
  "use strict";
  var CN = window.CN, M = CN && CN.motion;
  if (!CN) return;
  CN.smooth = function () { return (M && M._l) || null; };
  CN.smoothStats = function () { return M ? M.stats() : { native: true }; };
  if (!M) return;
  var win = window, doc = document, root = doc.documentElement;

  /* Every element that scrolls itself (audit of overflow auto/scroll in ui-src/css and the legacy
     sheets, 18 Oct): the dialogs and every card or panel inside them (account, team, video,
     feedback), the Legal Center and its viewer, the cookie bar, the open menu sheet, the Analysis
     AI chat, the Pro history list, the plan comparison table, selects; a textarea counts while
     it can scroll itself (the hero scan box usually cannot, so the page still glides over it).
     MARK gets data-lenis-prevent (so Lenis' CSS contains its overscroll) only on the layers: a
     scroller that does not overflow still swallows the wheel under overscroll-behavior: contain
     in Chromium (the Analysis AI chat holding only its welcome does exactly that), so page-level
     scrollers are never marked; PREVENT already leaves the wheel native over them. */
  var PREVENT = ".modal, .modal-card, .cn-legal-modal, #cnConsentBar, .cn-consent, header.navbar.open, select, " +
    "[data-lenis-prevent], #chatMessages, .pro-history-list, .comparison-table-shell";
  var MARK = ".modal-card, .cn-legal-modal";
  var ANCHORS = 'a[href="#cnScanInput"], #learn a.cn-chip[href^="#cn-module"]';

  var L = null, G, dead, on, idle = 0, last = 0, fr = 0, lt = 0, tf = 0, tl = 0, sk = 0, tool = 0;

  function smooth() { return L && L.isScrolling == "smooth"; }
  /* stop an inertia run where it is (Lenis resets its target to the real position) */
  function settle() { if (smooth()) { L.stop(); L.start(); } }
  function prevent(n) {
    var p = tool || CN.layerOpen() || (n.tagName == "TEXTAREA" ? n.scrollHeight > n.clientHeight : n.matches(PREVENT));
    if (p) settle();
    return p;
  }
  /* gsap.ticker listener (time, delta, frame, v): v is the rAF timestamp; v === 2 is the
     synchronous tick GSAP runs inside ticker.add() when it wakes, which is not a frame.
     The governor samples smooth frames only; a single bad window is forgiven. */
  function tick(time, delta, frame, v) {
    if (v === 2 || v === true || !L) return;
    var t = v > 2 ? v : time * 1000;
    L.raf(t);
    if (!smooth()) { last = 0; if (++idle >= 8) off(); return; }
    idle = 0;
    if (last && t - last < 200) { fr++; if (t - last > 25) lt++; }
    last = t;
    if (fr < 90) return;
    var r = lt / fr;
    tf += fr; tl += lt; fr = lt = 0;
    sk = r > .25 ? sk + 1 : 0;
    if (sk > 1 || r > .45) M.demote(r > .45 ? "late window" : "two late windows");
  }
  function kick() {
    idle = 0;
    if (on || !L) return;
    on = 1;
    last = 0;
    L.time = 0; /* the first frame of a run advances by 0, not by the time spent idle */
    G.ticker.add(tick);
  }
  function off() { if (on) { on = 0; G.ticker.remove(tick); } }
  function anchor(e) {
    var a = L && !e.defaultPrevented && !e.button && e.detail && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) &&
      e.target.closest && e.target.closest(ANCHORS);
    var t = a && doc.getElementById(a.getAttribute("href").slice(1));
    /* the glide replaces the jump; focus still moves to the target the way the jump moves it */
    if (t) { e.preventDefault(); M.scrollTo(t); t.focus({ preventScroll: true }); }
  }
  var EV = [[win, "wheel", function () { tool || kick(); }, { passive: true }], [doc, "pointerdown", settle, true], [doc, "keydown", settle, true], [doc, "click", anchor, false]];
  function listen(add) { EV.forEach(function (x) { x[0][add ? "addEventListener" : "removeEventListener"](x[1], x[2], x[3]); }); }

  /* 02-motion.js calls these */
  M._make = function (gsap, ST) {
    if (dead || L || !win.Lenis || !M._want()) return null;
    G = gsap;
    try {
      L = new win.Lenis({
        autoRaf: false, lerp: .12, smoothWheel: true, syncTouch: false, wheelMultiplier: 1,
        anchors: false, autoResize: true, overscroll: true, allowNestedScroll: false, prevent: prevent
      });
      L.on("scroll", ST.update);
      /* Lenis rewrites <html>'s class list (lenis-scrolling, lenis-smooth, lenis-stopped) at the
         start and end of every run and on every stop/start: each rewrite restyles <html> and
         <body> against the whole stylesheet (7 to 9 ms a time at 4x CPU, in the frame that starts
         or ends a glide). "lenis", added as it was built, stays; the state classes are not
         written (we never leave it stopped, and the site has no iframes to shield). */
      L.updateClassName = function () {};
    } catch (e) {
      CN._err("scroll", e);
      try { if (L) L.destroy(); } catch (x) { /* gone */ }
      return (L = null);
    }
    G.ticker.lagSmoothing(0);
    CN.qsa(MARK).forEach(function (el) { el.setAttribute("data-lenis-prevent", ""); });
    listen(1);
    return (M._l = L);
  };
  /* Pause / reduce (for the rest of the page view) and demotion */
  M._kill = function () {
    dead = 1;
    if (!L) return;
    off();
    listen(0);
    try { L.destroy(); } catch (e) { /* gone */ }
    L = M._l = null;
    G.ticker.lagSmoothing(500, 33);
    CN.raf(function () {
      root.classList.remove("lenis", "lenis-smooth", "lenis-scrolling", "lenis-stopped");
    });
  };
  M._kick = kick;
  M._gov = function () { return { f: tf + fr, l: tl + lt, s: sk }; };
  /* a page became active: script.js has already jumped to the top */
  M._enter = function () {
    if (!L) return;
    L.resize();
    if (win.pageYOffset) L.scrollTo(0, { immediate: true, force: true });
  };
  M.onNavigate(settle);
  /* Quick Scan and Analysis AI are short working pages: the wheel stays native there (finish,
     18 Oct: under Lenis they measured 1.5 to 3.1% dropped frames, native 0.5). Recovery measured
     the other way round (Lenis 0.5 to 0.8%, native 1.9 to 3.6%), so it keeps the glide. */
  CN.onPage(function (id) { tool = /^cybernet(ai)?$/.test(id); });
  CN.onLayer(function (open) { if (open) settle(); });
})();
