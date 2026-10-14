/* Home 4 · "Scams don't look like scams" bento (#cnThreats) and the scroll fallbacks for the
   light panels around it.
   - .is-near on the stage (and on the Live and Example scan panels) once it is within about a
     screen: only then do the decorative 3D sprites (CSS backgrounds in 22/23/24) load, so they
     never compete with the hero.
   - .is-armed on the bento (motion allowed only) and .is-in on each tile the first time a fifth
     of it is on screen: the photo focuses, the scan beam passes and the hairline sweeps once
     (23-threats.css). The legacy .reveal cascade runs at page load, so it cannot carry this.
   - .is-on while the stage is on screen: the lock above the headline bobs for two short cycles
     (a finite CSS animation that restarts on each visit), then rests. .is-paused freezes it
     (CN.pause through the controller below, or a hidden tab); the global "Pause motion"
     (html.cn-still) is handled in the CSS.
   - Where CSS scroll timelines (animation-timeline: view()) are missing, the Example scan console
     still rises into place once: this module adds .is-in when it is a quarter on screen (the
     CSS for that state lives in 24-demo.css under @supports not). Photos simply stay still there.
   Reduced motion: nothing here animates (the CSS keeps the end states). Visibility comes from
   IntersectionObserver reports only; nothing measures layout. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  var timeline = !!(window.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));

  CN.register("bento", function (bento) {
    var sec = bento.closest(".cn-threats") || bento.parentNode;
    if (!sec) return null;
    var paused = false;

    sec.classList.add("is-near");

    // Each tile comes into focus on its own visit (23-threats.css). The legacy .reveal cascade
    // fires at page load, so it cannot carry this. .is-armed enables the waiting state only when
    // motion is allowed; every tile gets .is-in the first time a fifth of it is on screen.
    if (!CN.reduced()) {
      bento.classList.add("is-armed");
      CN.qsa(".cn-tile", bento).forEach(function (tile) {
        CN.once(tile, function () { tile.classList.add("is-in"); }, { threshold: .2 });
      });
    }

    CN.inView(sec, function (vis) {
      // Toggling the class restarts the short bob on every new visit.
      sec.classList.toggle("is-on", !!vis && !CN.reduced());
    }, { threshold: .12 });

    function pause() { paused = true; sec.classList.add("is-paused"); }
    function resume() { paused = false; sec.classList.remove("is-paused"); }
    CN.onVisibility(function (visible) { sec.classList.toggle("is-paused", paused || !visible); });

    return { pause: pause, resume: resume, destroy: pause };
  }, { margin: "100% 0px" });

  // The light panels' sprites (the Live orb, the Example scan shield) load once the panel is
  // about a screen away.
  CN.onReady(function () {
    CN.qsa("#home > .cn-live, #home > .cn-demo").forEach(function (sec) {
      var stop = CN.inView(sec, function (near) {
        if (!near) return;
        sec.classList.add("is-near");
        stop();
      }, { margin: "100% 0px" });
    });
  });

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
