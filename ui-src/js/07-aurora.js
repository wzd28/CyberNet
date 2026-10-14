/* CyberNet UI: the global "Pause motion" control (owner: aurora).
   Pause motion: one switch for every loop on the site. A button with [data-cn-motion] (the footer) toggles
   html.cn-still, which is remembered in localStorage ("cn-still-2" = "1"; renamed 14 Oct so earlier pauses reset once the buttons were hidden), so a visitor who paused
   motion once keeps a still site on every page and visit.
   While paused:
   - CSS: every animation shows its end state, exactly as under prefers-reduced-motion
     (90-a11y.css), so reveals are simply there and loops stop. Hover and press transitions
     still work.
   - JS: CN.reduced() also answers true, so modules that ask it before animating (reveals,
     counters, the typewriter, the reel, the hero scene) show their finished state. CN.pause()
     is called on every module controller, and again on a module that starts later, when it
     scrolls near. The hero's own Pause button is pressed for it (and released again when motion
     comes back, if this control pressed it), exactly as a visitor would. The section
     backgrounds (09-bgfx.js) rest on their current frame.
   - Events: document gets "cn:still" (detail.still) on every change; CN.still() reads the state,
     CN.setStill(bool) sets it, CN.onStill(cb) -> off() listens.
   The class is applied as soon as this file runs (the bundle is deferred, so before the
   DOMContentLoaded work); the head snippet in index.html can apply it before first paint.
   v4.1: the aurora tone switch (html.cn-aurora-low) is gone with the aurora layers. It toggled a
   class on <html> at every light band edge while scrolling, which restyled the document. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, root = doc.documentElement, KEY = "cn-still-2";

  var still = false;
  try { still = window.localStorage.getItem(KEY) === "1"; } catch (e) { /* storage blocked */ }

  var systemReduced = CN.reduced;
  CN.reduced = function () { return still || systemReduced(); };
  CN.still = function () { return still; };

  var listeners = [];
  CN.onStill = function (cb) {
    if (typeof cb !== "function") return function () {};
    listeners.push(cb);
    return function () { var i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  };

  function label(btn) {
    var text = still ? "Play motion" : "Pause motion";
    var slot = btn.querySelector("[data-cn-motion-label]") || btn;
    if (slot.textContent !== text) slot.textContent = text;
    btn.classList.toggle("is-paused", still);
    btn.setAttribute("title", still ? "Motion is paused on this site. Play it again." : "Pause the moving background and animations on this site.");
  }
  function paint() {
    root.classList.toggle("cn-still", still);
    CN.qsa("[data-cn-motion]").forEach(label);
  }

  /* The hero has its own Pause button (20-scanbox.js). Press it for the visitor while motion is
     paused, and release it only if this control was the one that pressed it. */
  var heroByUs = false;
  function heroBridge() {
    if (systemReduced()) return;
    var btn = doc.querySelector("#heroSection .cn-stage-pause");
    if (!btn) return;
    var pressed = btn.getAttribute("aria-pressed") === "true";
    if (still && !pressed) { heroByUs = true; btn.click(); }
    else if (!still && pressed && heroByUs) { heroByUs = false; btn.click(); }
    else if (!still) heroByUs = false;
  }

  function set(v, persist) {
    v = !!v;
    if (v === still) return;
    still = v;
    if (persist !== false) {
      try { window.localStorage.setItem(KEY, still ? "1" : "0"); } catch (e) { /* storage blocked */ }
    }
    paint();
    if (still) CN.pause(); else CN.resume();
    heroBridge();
    listeners.slice().forEach(function (cb) { try { cb(still); } catch (e) { /* keep going */ } });
    try { doc.dispatchEvent(new CustomEvent("cn:still", { detail: { still: still } })); } catch (e) { /* old browsers */ }
  }
  CN.setStill = function (v) { set(v, true); };

  // Applied now, before the start-up queue runs, so nothing starts moving first.
  if (still) root.classList.add("cn-still");

  // Clicks: delegated, so a control added later (or moved by legacy code) still works.
  doc.addEventListener("click", function (e) {
    var t = e.target, btn = t && t.closest ? t.closest("[data-cn-motion]") : null;
    if (!btn) return;
    e.preventDefault();
    set(!still, true);
  });

  // Another tab changed the setting: follow it.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) set(e.newValue === "1", false);
  });

  // Modules start lazily as they come near (CN.register). While paused, pause each one again
  // shortly after it comes near, so one that started after the switch is caught too, and one
  // that resumed itself on scroll is stopped again.
  function watch(el) {
    if (el.__cnStillWatch) return;
    el.__cnStillWatch = true;
    CN.inView(el, function (vis) {
      if (!vis || !still) return;
      setTimeout(function () { if (still) CN.pause(el); }, 60);
    }, { margin: "240px 0px" });
  }

  CN.onReady(function () {
    paint();
    CN.qsa("[data-cn]").forEach(watch);
    // Behind every other module's start-up job (the queue is first in, first out).
    CN.onReady(function () {
      if (!still) return;
      CN.pause();
      heroBridge();
    });
  });
})();
