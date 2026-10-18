/* CyberNet UI v5: the motion core, CN.motion (owner: core). Runs right after 00-core.js, so every
   later module can rely on it. Nothing here throws, and every call is safe on every tier: on
   "lite" and "still" it degrades to the documented fallback. Defensive use: var M = CN.motion;
   then M && M.fn(...). Full contract: v5 SPEC section 4. GSAP conducts, CSS moves.

   USAGE
     var M = CN.motion;
     M.tier()                  "still" (OS reduced motion or Pause motion) | "lite" (phones,
                               tablets, coarse primary pointers, < 4 cores, < 4 GB, Save-Data) |
                               "full" ((hover: hover) and (pointer: fine) desktops). The device
                               part is decided once per page view; "still" follows Pause/reduce.
     M.reduced()               CN.reduced() at call time: true = show final states, start nothing.
     M.feature("scrubs")       flags (FEATURES below, all on); localStorage "cn-fx" overrides,
                               e.g. "-scrubs" or "-lenis". Read once per page view.
     M.lenis()                 Lenis or null (CN.smooth() = M.lenis()).
     M.reveal(target, preset, opts) -> stop   one-shot entrance through CN.inView (.is-in).
                               target: Element | selector | NodeList | Array. presets: "settle"
                               (default), "fade", "rule-before",
                               "trigger", "stagger". opts: { delay, step (ms), margin, threshold }.
                               Markup equivalent: data-cn-reveal="..." / data-cn-stagger /
                               data-cn-rule (05-reveal.js, CSS in 05-motion.css).
     Line SETs: markup data-cn-lines / data-cn-lines="head" (05-reveal.js).
     M.scrub(el, cfg) -> { kill(), rebuild(), progress() }   the only scroll-linked motion:
                               cfg: { page, feature: "scrubs", start, end,
                               endTrigger, build(tl, gsap, el) -> cleanup?, onUpdate(p, self),
                               fallback() REQUIRED, final() REQUIRED }. Built only on "full"
                               while Lenis drives; otherwise fallback() (or final() when reduced).
     M.onNavigate(cb) -> off   cb(toId) at a [data-page] click (capture, before script.js swaps)
                               and on popstate.
     M.scrollTo(target, { offset, duration, immediate })   Lenis when live, else native.
     M.refresh()               ScrollTrigger.refresh() + lenis.resize(), debounced, when still.
     M.demote(reason)          Lenis goes native for the session; every scrub falls back.
     M.stats()                 { tier, vendor, lenis, demoted, reason, frames, late, strikes,
                               scrubs, features }
   SplitText is deliberately not shipped: data-cn-lines is the port. Trimmed at the finish (18 Oct;
   nothing called them): onTier, ready, gsap(), ScrollTrigger(), splitLines, replay, onPage.

   VENDOR (tier "full" only, and only while Lenis is wanted): after CN.afterLoad and
   CN.whenStill, same-origin /ui/vendor/ files are injected: gsap first, then ScrollTrigger and
   Lenis (async = false). No index.html tags, no preloads; phones request nothing. Failure (404,
   CSP, 8 s, an exception) leaves the "lite" page: nothing hidden, nothing waiting.
   Technique after React Bits (MIT + Commons Clause, (c) 2026 David Haz); re-implemented. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var win = window, doc = document, root = doc.documentElement, ch = CN._ch, err = CN._err;

  /* The integrator flips defaults here. Kill order applied at the finish (18 Oct): step 1, The
     Reading, is cut (its scrub relaid 400+ elements a frame), and the dead hero depth scrub, the
     button glares and the ShinyText pass on "protect" went with it. Left: scrubs, then lenis. */
  var FEATURES = { lenis: true, scrubs: true, exposure: true, star: true, folio: true };

  function noop() {}
  function run(f, a, b, c) { if (f) try { return f(a, b, c); } catch (e) { err("motion", e); } }
  function get(k, s) { try { return win[s || "localStorage"].getItem(k); } catch (e) { return null; } }

  /* ---------- flags: localStorage "cn-fx" = "-name,+name", read once ---------- */
  (get("cn-fx") || "").split(",").forEach(function (t) {
    t = t.trim();
    if (FEATURES.hasOwnProperty(t.slice(1)) && /^[-+]/.test(t)) FEATURES[t.slice(1)] = t[0] == "+";
  });
  function feature(n) { return FEATURES[n] === true; }

  /* ---------- tier: the device part once per page view; "still" follows Pause / reduce ---------- */
  /* "full": the PRIMARY pointer is fine with hover (a touch-screen laptop used with its mouse or
     trackpad counts: the owner's own machine is one), 4+ cores, 4+ GB, no Save-Data */
  var base, last;
  function baseTier() {
    var n = navigator.hardwareConcurrency, m = navigator.deviceMemory;
    return base || (base = CN.finePointer() && !(n < 4) && !(m < 4) && !CN.saveData() ? "full" : "lite");
  }
  /* CN.reduced() gains Pause motion in 07-aurora.js; the head snippet sets html.cn-still first */
  function reduced() { return !!(CN.reduced() || root.classList.contains("cn-still")); }
  function tier() { return reduced() ? "still" : baseTier(); }
  function retier() {
    var t = tier();
    if (t == last) return;
    last = t;
    if (t == "still") goStill();
  }
  doc.addEventListener("cn:still", retier);
  CN.onMotion(retier);

  /* ---------- vendor: same-origin, "full" only, and only while Lenis is wanted (GSAP and
     ScrollTrigger serve the scrubs, which need Lenis) ---------- */
  var vendor = "none", reason = "", G = null, ST = null, demoted = false, R = null, H = [], gaveUp = false, cur = null;
  function lenis() { return M._l || null; }
  function want() {
    return tier() == "full" && feature("lenis") && !demoted && get("cn-native-scroll") != "1" && get("cn-lenis-off", "sessionStorage") != "1";
  }
  function inject(file, cb) {
    var s = doc.createElement("script");
    s.src = "/ui/vendor/" + file;
    s.async = false;
    s.onload = function () { cb(1); };
    s.onerror = function () { cb(0); };
    doc.head.appendChild(s);
  }
  /* ScrollTrigger 3.15 registers itself as it runs and then keeps a requestAnimationFrame loop
     going for as long as it is enabled ("_rafBugFix", a Firefox repaint workaround): a standing
     60 fps main-thread loop, even at rest. While its file runs, the first request of that one
     function is dropped, so the loop never starts (every other call passes straight through);
     scrubs only run while Lenis drives, and Lenis' ticker frames cover the repaints. */
  var raf = win.requestAnimationFrame;
  function swallow(f) { return f && f.name == "_rafBugFix" ? 0 : raf.call(win, f); }
  function unswallow() { if (win.requestAnimationFrame == swallow) win.requestAnimationFrame = raf; }
  function fail(why) {
    unswallow();
    if (vendor != "loading") return;
    vendor = "failed";
    reason = why;
    H.slice().forEach(function (h) { settle(h, "fallback"); });
  }
  function load() {
    if (vendor != "none" || !want()) return;
    vendor = "loading";
    var timer = setTimeout(fail, 8000, "timeout"), n = 2;
    inject("gsap-3.15.0.min.js", function (ok) {
      if (!ok || !win.gsap) return fail("gsap");
      var one = function () { if (!--n) { clearTimeout(timer); if (vendor == "loading") win.ScrollTrigger ? setup() : fail("ScrollTrigger"); } };
      raf = win.requestAnimationFrame;
      win.requestAnimationFrame = swallow;
      inject("ScrollTrigger-3.15.0.min.js", function () { unswallow(); one(); });
      inject("lenis-1.3.26.min.js", one);
    });
  }
  function setup() {
    try {
      G = win.gsap; ST = win.ScrollTrigger;
      G.registerPlugin(ST);
      G.config({ autoSleep: 60 });
      G.defaults({ ease: "expo.out", duration: .9 });
      /* syncInterval: ScrollTrigger otherwise polls with a rAF every 250 ms; Lenis and the native
         scroll events update it, and the page must cost nothing at rest */
      ST.config({ ignoreMobileResize: true, limitCallbacks: true, syncInterval: 1e9 });
      ST.defaults({ invalidateOnRefresh: true });
    } catch (e) { err("motion", e); return fail("setup"); }
    vendor = "ready";
    var l = want() ? run(M._make, G, ST) || null : null;
    if (doc.fonts) doc.fonts.ready.then(refresh, noop);
    var main = doc.getElementById("cnMain"), t;
    /* a page switch already refreshes on enter; a resize report inside the next 600 ms is that
       same change (the new page laying out), so it is not refreshed twice */
    if (main && win.ResizeObserver) new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { if (CN.now() - entered > 600) refresh(); }, 200); }).observe(main);
    setTimeout(function () {
      if (reduced()) return;
      R = { lenis: l };
      H.slice().forEach(function (h) { if (h.s == "pending") arm(h); });
    });
  }

  /* ---------- refresh: debounced, when still ---------- */
  var refreshT;
  function refresh() {
    if (!ST) return;
    clearTimeout(refreshT);
    refreshT = setTimeout(CN.whenStill, 120, function () {
      try { ST.refresh(); if (lenis()) lenis().resize(); } catch (e) { err("motion", e); }
    });
  }

  /* ---------- pages: scrubs live only on their own page ---------- */
  var navs = ch(), entered = -1e9;
  CN.onPage(function (id) {
    var prev = cur;
    cur = id;
    H.forEach(function (h) { if (h.s == "built" && h.p && h.p != id) unbuild(h); });
    H.forEach(build);
    if (prev) {
      entered = CN.now();
      run(M._enter);
      if (ST) CN.raf(function () { CN.raf(refresh); });
    }
  });

  /* ---------- scrubs: h.s "pending" -> "ready" <-> "built", or decided: "fallback" | "final" ---------- */
  function unbuild(h) {
    if (h.x) { try { h.x.revert(); } catch (e) { err("motion", e); } h.x = h.tl = null; }
    if (h.k) { run(h.k); h.k = null; }
    if (h.s == "built") h.s = "ready";
  }
  function settle(h, how) {
    if (h.s == "final" || h.s == how) return;
    unbuild(h);
    if (h.w) { h.w(); h.w = null; }
    h.s = how;
    run(h.c[how]);
  }
  function build(h) {
    if (h.s != "ready" || !lenis() || (h.p && h.p != cur)) return;
    try {
      h.x = G.context(function () {
        var c = h.c, st = { trigger: h.el, scrub: true, invalidateOnRefresh: true };
        ["start", "end", "endTrigger"].forEach(function (k) { if (c[k]) st[k] = c[k]; });
        if (c.onUpdate) st.onUpdate = function (self) { run(c.onUpdate, self.progress, self); };
        h.tl = G.timeline({ defaults: { ease: "none" }, scrollTrigger: st });
        h.k = c.build && c.build(h.tl, G, h.el);   /* a cleanup function or nothing (run() guards it) */
      });
      h.s = "built";
      refresh();
    } catch (e) { err("motion", e); settle(h, "fallback"); }
  }
  /* ready() came: build with a live Lenis (once the element's page is showing), else fall back */
  function arm(h) {
    if (h.w) { h.w(); h.w = null; }
    if (!R || !R.lenis || !lenis()) return settle(h, "fallback");
    h.s = "ready";
    build(h);
  }
  function decide(h) {
    if (reduced()) return settle(h, "final");
    if (baseTier() != "full" || !feature("scrubs") || !feature(h.f) || !want() || vendor == "failed" || (gaveUp && !R)) return settle(h, "fallback");
    /* the first observer report decides: on screen now (or in view before ready) -> the
       one-shot, so nothing already visible ever changes under the visitor */
    var first = 1;
    h.w = CN.inView(h.el, function (vis) {
      if (h.s != "pending") return;
      if (vis) settle(h, "fallback");
      else if (first && R) arm(h);
      first = 0;
    });
  }
  function scrub(el, cfg) {
    cfg = cfg || {};
    var h = { el: el, c: cfg, f: cfg.feature || "scrubs", s: "pending" };
    if (!el || !el.closest) { h.s = "fallback"; run(cfg.fallback); }
    else {
      var pg = el.closest(".page");
      h.p = cfg.page || (pg && pg.id);
      H.push(h);
      decide(h);
    }
    return {
      kill: function () { unbuild(h); if (h.w) h.w(); h.s = "killed"; var i = H.indexOf(h); if (i >= 0) H.splice(i, 1); },
      rebuild: function () { if (h.s == "built") { unbuild(h); build(h); } },
      progress: function () { return h.tl ? h.tl.scrollTrigger.progress : h.s == "final" ? 1 : 0; }
    };
  }
  /* Pause / reduce on: Lenis goes for the page view, every scrub shows its end, numbers finish */
  function goStill() {
    run(M._kill);
    H.slice().forEach(function (h) { settle(h, "final"); });
    run(function () { if (CN.numerals) CN.numerals.finish(); });
  }
  function demote(why) {
    if (demoted) return;
    demoted = true;
    reason = String(why || "demoted");
    try { win.sessionStorage.setItem("cn-lenis-off", "1"); } catch (e) { /* private mode */ }
    run(M._kill);
    H.slice().forEach(function (h) { settle(h, "fallback"); });
  }

  /* ---------- scroll ---------- */
  /* Lenis when it drives (scroll-margin honoured), else native: smooth unless reduced. Native
     element jumps use scrollIntoView, so scroll-margin works there too (opts.offset is Lenis'). */
  function scrollTo(target, o) {
    o = o || {};
    try {
      var l = lenis(), b = o.immediate || reduced() ? "auto" : "smooth";
      if (l) { l.scrollTo(target, { offset: o.offset || 0, duration: o.duration, immediate: !!o.immediate }); run(M._kick); }
      else if (typeof target == "number") win.scrollTo({ top: target, behavior: b });
      else (typeof target == "string" ? doc.querySelector(target) : target).scrollIntoView({ block: "start", behavior: b });
    } catch (e) { err("motion", e); }
  }

  function stats() {
    var g = run(M._gov) || {};
    return {
      tier: tier(), vendor: vendor, lenis: !!lenis(), demoted: demoted, reason: reason,
      frames: g.f || 0, late: g.l || 0, strikes: g.s || 0,
      scrubs: H.filter(function (h) { return h.s == "built"; }).length,
      features: Object.assign({}, FEATURES)
    };
  }

  /* reveal lives in 05-reveal.js (M._r); until it has loaded (or if it failed) it does nothing,
     which leaves content visible */
  var M = CN.motion = {
    tier: tier, reduced: reduced, feature: feature, lenis: lenis,
    reveal: function (t, p, o) { return run(M._r, t, p, o) || noop; },
    scrub: scrub, onNavigate: navs.add,
    scrollTo: scrollTo, refresh: refresh, demote: demote, stats: stats,
    _nav: navs.fire, _want: want
  };

  CN.onReady(function () { last = tier(); });
  CN.afterLoad(function () { CN.whenStill(load); });
  function giveUp() {
    setTimeout(function () {
      gaveUp = true;
      if (!R) H.slice().forEach(function (h) { if (h.s == "pending") settle(h, "fallback"); });
    }, 6000);
  }
  if (doc.readyState == "complete") giveUp(); else win.addEventListener("load", giveUp);
})();
