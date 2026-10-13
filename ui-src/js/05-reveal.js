/* CyberNet UI: reveals, page-switch motion and the live-dot pulse (owner: foundation).
   - Legacy .reveal is left entirely to script.js (it adds .show); this file never touches it.
   - [data-cn-reveal]: the element rises in once, when it scrolls into view.
   - [data-cn-stagger]: its children rise in one after another (70 ms apart).
     CSS lives in 01-base.css; the hidden state exists only under html.cn-js and only until
     .is-in, so content can never get stuck invisible. Reduced motion: shown at once.
     Visibility comes from the observer's first report, never from getBoundingClientRect, so
     init forces no layout (and never wakes a content-visibility:auto section early).
   - .cn-live-dot: gets .is-on while it is on screen; the CSS runs its ring twice per visit
     (02-components.css), so the pulse is finite and never runs where nobody can see it.
   - html.cn-navigated: set on the first navigation (a [data-page] click or back/forward), so the
     page-switch animation in 80-perf.css never delays the first paint of a page.
   Other modules can call CN.reveal(el) for markup they render later. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, root = doc.documentElement;

  function markNav() { root.classList.add("cn-navigated"); }
  doc.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest("[data-page]")) markNav();
  }, true);
  window.addEventListener("popstate", markNav);

  function reveal(el) {
    if (!el || el.__cnReveal) return;
    el.__cnReveal = true;
    if (el.hasAttribute("data-cn-stagger")) {
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) kids[i].style.setProperty("--cn-i", String(Math.min(i, 12)));
    }
    if (CN.reduced()) { el.classList.add("is-in", "is-done"); return; }
    // Enter when it is just inside the viewport; works for blocks taller than the screen too.
    // If the first report already finds it on screen (a tall screen, a restored scroll
    // position), it rises in right there, which reads as intended rather than as a blink.
    var stop = null, done = false;
    stop = CN.inView(el, function (vis) {
      if (!vis || done) return;
      done = true;
      el.classList.add("is-in");
      if (stop) stop();
    }, { threshold: 0.01, margin: "0px 0px -8% 0px" });
    if (done && stop) stop();
  }

  function scan(ctx) { CN.qsa("[data-cn-reveal], [data-cn-stagger]", ctx).forEach(reveal); }

  // Live dots pulse only while visible. Toggling a class on enter/leave is rare (not per
  // frame), so the legacy body-wide attribute observers stay idle.
  function liveDot(dot) {
    if (dot.__cnDot) return;
    dot.__cnDot = true;
    CN.inView(dot, function (vis) {
      if (vis && CN.reduced()) return;
      dot.classList.toggle("is-on", !!vis);
    });
  }

  CN.reveal = reveal;
  CN.onReady(function () {
    scan();
    CN.qsa(".cn-live-dot").forEach(liveDot);
  });
})();
