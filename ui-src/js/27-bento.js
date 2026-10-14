/* Home 4 · "Scams don't look like scams" bento (#cnThreats), plus the Example scan console's
   scroll fallback.
   - .is-armed on the bento (motion allowed only) and .is-in on each tile the first time a fifth
     of it is on screen: the photo settles, the scan line passes once and the caption rises in
     (23-threats.css). The legacy .reveal cascade runs at page load, so it cannot carry this.
   - Where CSS scroll timelines (animation-timeline: view()) are missing, the Example scan console
     still rises into place once: this module adds .is-in when it is a quarter on screen (the
     CSS for that state lives in 24-demo.css under @supports not).
   v4.1 "Midnight" removed the floating 3D sprites (the lock, cube, chip and orbs) and their
   loading and bobbing states: the stage is quieter, and nothing here loops.
   Reduced motion: nothing here animates (the CSS keeps the end states). Visibility comes from
   IntersectionObserver reports only; nothing measures layout. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  var timeline = !!(window.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));

  CN.register("bento", function (bento) {
    if (CN.reduced()) return null;
    bento.classList.add("is-armed");
    CN.qsa(".cn-tile", bento).forEach(function (tile) {
      CN.once(tile, function () { tile.classList.add("is-in"); }, { threshold: .2 });
    });
    return null;
  }, { margin: "100% 0px" });

  // Scroll-timeline fallback for the console's one-time rise (24-demo.css).
  if (!timeline) {
    CN.onReady(function () {
      CN.qsa("#cnDemo .cn-console").forEach(function (el) {
        if (CN.reduced()) { el.classList.add("is-in"); return; }
        CN.once(el, function () { el.classList.add("is-in"); }, { threshold: .25 });
      });
    });
  }
})();
