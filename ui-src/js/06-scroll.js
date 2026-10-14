/* CyberNet UI: smooth scrolling on desktop (owner: aurora). v4.1 "Midnight".
   Owner feedback: "not smooth when you scroll; it needs to be smoother and faster".
   - Desktop only: a fine pointer with hover, motion allowed (no prefers-reduced-motion and no
     "Pause motion"), no Save-Data. Phones and tablets keep native scrolling, which is already
     inertial and runs on the compositor thread.
   - Lenis 1.3.26 (MIT) from cdn.jsdelivr.net (the CSP allows it), pinned and checked with
     Subresource Integrity, loaded after window load when the browser is idle, so it never
     competes with the hero or the scan box. If it fails to load, scrolling stays native.
   - Lenis only eases the browser's own scroll position (no transformed wrapper), so position:
     sticky, IntersectionObserver, scroll timelines and every legacy scroll call keep working:
     window.scrollTo on an SPA page switch, scrollIntoView (Learn, the scan box hand-off),
     #anchors (the closing CTA) and the skip link. Lenis follows native scrolls whenever it is not
     itself animating; a click, a key press or a native jump during an inertia run stops the run
     first, so a page switch or an anchor always lands where the legacy code sent it.
   - Never inside an overlay or a nested scroller: wheel events over the auth / feedback / video /
     account modals, the Legal Center, the cookie bar or the open menu sheet, and over any element
     that can scroll itself (the Analysis AI chat, text areas, lesson panels), are left to the
     browser (Lenis "prevent" plus its nested-scroll check).
   - No idle cost: the animation frame loop runs only while a wheel run is in flight, then stops.
   - It steps aside on slow machines: Lenis moves the page from the main thread, so it is only as
     smooth as that thread. Machines with fewer than 4 cores never load it, and if more than a
     quarter of the frames come late (over 25 ms) in two windows of 90 Lenis frames in a row,
     it is removed for the rest of the session (sessionStorage "cn-native-scroll-auto") and the
     browser's own compositor-threaded scrolling takes over.
   - Off switches: localStorage "cn-native-scroll" = "1", or the global Pause motion (turning it
     on destroys Lenis; turning it off brings it back).
   CSS: 80-perf.css (html.lenis.lenis-smooth turns the legacy smooth scroll-behavior off while
   Lenis drives). API: CN.smooth() -> the Lenis instance or null. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var win = window, doc = document, root = doc.documentElement;

  var SRC = "https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.min.js";
  var SRI = "sha384-jqpi9VmOdhyLoLURgjCn7EpnG9BbnHW57ibIZoeaIU+erWDH3k8fQQg0xH2ySjnw";

  var lenis = null, loading = false, failed = false, raf = 0, idle = 0;
  var last = 0, frames = 0, late = 0, strikes = 0, slow = false;

  function optedOut() {
    try {
      if (win.sessionStorage && sessionStorage.getItem("cn-native-scroll-auto") === "1") return true;
      return !!(win.localStorage && localStorage.getItem("cn-native-scroll") === "1");
    } catch (e) { return false; }
  }
  function weak() {
    var n = navigator.hardwareConcurrency;
    return slow || (typeof n === "number" && n > 0 && n < 4);
  }
  function wanted() {
    return CN.finePointer() && !CN.reduced() && !CN.saveData() && !weak() && !optedOut();
  }
  /* Frame pacing during Lenis runs, in windows of 90 frames: two late windows in a row (more
     than a quarter of the frames over 25 ms) and native scrolling is the smoother choice on this
     machine. One bad window is forgiven, so a start-up hitch (the hero compiling its shaders)
     never switches it off. */
  function pace(t) {
    if (last) {
      var dt = t - last;
      if (dt < 200) { frames++; if (dt > 25) late++; }
    }
    last = t;
    if (frames < 90) return true;
    strikes = late / frames > .25 ? strikes + 1 : 0;
    frames = late = 0;
    if (strikes < 2) return true;
    slow = true;
    try { if (win.sessionStorage) sessionStorage.setItem("cn-native-scroll-auto", "1"); } catch (e) { /* private mode */ }
    stop();
    return false;
  }

  /* Overlays and the menu sheet: the browser handles every wheel inside them. */
  function overlay(node) {
    if (root.classList.contains("cn-menu-open")) return true;
    var c = node.classList;
    if (!c) return false;
    return c.contains("modal") || c.contains("cn-legal-modal") || c.contains("cn-consent") ||
      node.id === "cnConsentBar" || node.getAttribute("aria-modal") === "true" ||
      node.hasAttribute("data-lenis-prevent");
  }

  function frame(t) {
    raf = 0;
    if (!lenis) return;
    // Someone else moved the page during an inertia run (a page switch, an anchor, focus):
    // drop the run so Lenis adopts the new position instead of pulling the page back.
    if (lenis.isScrolling === "smooth" && Math.abs((win.pageYOffset || root.scrollTop || 0) - lenis.animatedScroll) > 2.5) {
      settle();
      return;
    }
    lenis.raf(t);
    if (lenis.isScrolling === "smooth") {
      idle = 0;
      if (!pace(t)) return;
    } else if (++idle > 2) { last = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    idle = 0;
    if (lenis && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  /* Stop an inertia run in place (Lenis resets its target to the real position). */
  function settle() {
    if (!lenis || lenis.isScrolling !== "smooth") return;
    try { lenis.stop(); lenis.start(); } catch (e) { /* keep native */ }
  }

  function start() {
    if (lenis || !win.Lenis) return;
    try {
      lenis = new win.Lenis({
        autoRaf: false,
        smoothWheel: true,
        syncTouch: false,
        lerp: 0.12,
        wheelMultiplier: 1,
        anchors: false,
        autoResize: true,
        allowNestedScroll: true,
        prevent: overlay
      });
    } catch (err) {
      lenis = null;
      failed = true;
      if (win.console) console.error("[cn:scroll]", err);
      return;
    }
    win.addEventListener("wheel", kick, { passive: true });
    doc.addEventListener("pointerdown", settle, true);
    doc.addEventListener("click", settle, true);
    doc.addEventListener("keydown", settle, true);
    win.addEventListener("popstate", settle);
  }
  function stop() {
    if (!lenis) return;
    win.removeEventListener("wheel", kick);
    doc.removeEventListener("pointerdown", settle, true);
    doc.removeEventListener("click", settle, true);
    doc.removeEventListener("keydown", settle, true);
    win.removeEventListener("popstate", settle);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    try { lenis.destroy(); } catch (e) { /* already gone */ }
    lenis = null;
  }

  function load() {
    if (win.Lenis) { start(); return; }
    if (loading || failed) return;
    loading = true;
    var s = doc.createElement("script");
    s.src = SRC;
    s.integrity = SRI;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = function () { loading = false; if (wanted()) start(); };
    s.onerror = function () { loading = false; failed = true; };
    doc.head.appendChild(s);
  }

  function sync() {
    if (wanted()) load();
    else stop();
  }

  CN.smooth = function () { return lenis; };
  CN.smoothStats = function () { return { frames: frames, late: late, strikes: strikes, slow: slow }; };
  CN.afterLoad(function () {
    sync();
    CN.onMotion(sync);
    if (typeof CN.onStill === "function") CN.onStill(sync);
    try {
      var mq = win.matchMedia("(hover: hover) and (pointer: fine)");
      if (mq.addEventListener) mq.addEventListener("change", sync);
      else if (mq.addListener) mq.addListener(sync);
    } catch (e) { /* old browsers: decided once */ }
  });
})();
