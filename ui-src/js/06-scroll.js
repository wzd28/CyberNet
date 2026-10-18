/* CyberNet UI: scrolling (owner: aurora). v4.7: native everywhere.
   Owner, 18 Oct: "its super not smooth at all, make it super smooth do whatever you have to do".
   v4.1 to v4.6 eased desktop wheel scrolling with Lenis (loaded from cdn.jsdelivr.net). Lenis
   moves the page from the main thread, one scrollTo per frame, so every busy frame (the globe,
   a section starting up, a long style pass) became a visible stall in the scroll itself, and it
   lagged the wheel by design. Measured on the live v4.6 site (desktop 1440 px, 4x CPU, real wheel
   input): 14.5% of frames late while scrolling Home with Lenis.
   Now the browser scrolls on its compositor thread on every device: the page follows the wheel,
   trackpad, keys and touch at once and keeps moving even while the main thread is busy. Nothing
   is downloaded for it (one third-party request fewer). Every legacy scroll call (window.scrollTo
   on a page switch, scrollIntoView, #anchors, the skip link) is the browser's own, as before.
   API kept for older checks and tools: CN.smooth() -> null, CN.smoothStats() -> { native: true }. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  CN.smooth = function () { return null; };
  CN.smoothStats = function () { return { native: true, frames: 0, late: 0, strikes: 0, slow: false }; };
})();
