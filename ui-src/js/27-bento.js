/* Home 4 · "Scams don't look like scams" bento (#cnThreats), plus the Example scan console's
   one-time rise.
   - v5: each tile is a CN.motion.reveal "trigger" (05-reveal.js): it SETTLEs the first time it
     enters (a fifth of it on screen), in reading order (--cn-d per row, 23-threats.css); its
     photo settles from 1.06 (desktop), the scan line passes once, the caption rises at +200 ms,
     the QR rows lift and the lookalike's strike draws, and the $442B rule draws before its
     odometer tallies (50-counters.js). A tile on screen at the first report never animates.
   - The Example scan console rises into place once, when a quarter of it is on screen
     (data-cn-rise, 24-demo.css; a data attribute, since 30-demo.js owns the console's classes).
     On screen at the first report: left as it is.
   v4.1 "Midnight" removed the floating 3D sprites; nothing here loops. Reduced motion and Pause:
   the end states (CSS). Visibility comes from IntersectionObserver reports only. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  CN.onReady(function () {
    var M = CN.motion;
    if (M) M.reveal("#cnThreats .cn-tile", "trigger", { threshold: .2 });
    /* the scan line has passed: .is-done, so Home shown again never replays it */
    CN.qsa("#cnThreats .cn-bento").forEach(function (b) {
      b.addEventListener("animationend", function (e) { if (e.animationName == "cn-tile-scan") e.target.classList.add("is-done"); });
    });
    CN.qsa("#cnDemo .cn-console").forEach(function (el) {
      if (M ? M.reduced() : CN.reduced()) return;
      var first = 1, stop = CN.inView(el, function (vis) {
        if (first) {
          first = 0;
          if (vis) return stop();
          return el.setAttribute("data-cn-rise", "");
        }
        if (vis) { stop(); el.setAttribute("data-cn-rise", "in"); }
      }, { threshold: .25 });
    });
  });
})();
