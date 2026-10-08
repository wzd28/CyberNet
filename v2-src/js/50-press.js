/* Ripple on press for the main buttons (CSS in v2-src/css/86-buttons.css).
   One delegated listener; it only sets two CSS variables and restarts a class,
   so no nodes are added and button text (rewritten by other scripts) is untouched. */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var SEL = ".primary-btn, .secondary-btn, .hero-video-btn, .v2-chip, .login-btn";
  document.addEventListener("pointerdown", function (e) {
    var b = e.target && e.target.closest && e.target.closest(SEL);
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect();
    b.style.setProperty("--v2-rx", (e.clientX - r.left) + "px");
    b.style.setProperty("--v2-ry", (e.clientY - r.top) + "px");
    b.style.setProperty("--v2-rs", Math.ceil(Math.hypot(r.width, r.height) / 8));
    if (!b.classList.contains("v2-press")) b.classList.add("v2-press");
    b.classList.remove("v2-rippling");
    void b.offsetWidth;
    b.classList.add("v2-rippling");
    clearTimeout(b._v2rip);
    b._v2rip = setTimeout(function () { b.classList.remove("v2-rippling"); }, 650);
  }, { passive: true });
})();
