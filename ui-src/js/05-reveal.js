/* CyberNet UI: scroll reveals, page-switch motion and the live-dot pulse (owner: aurora).
   - [data-cn-reveal]: the element rises in once, out of a soft blur (wide screens), when it
     scrolls into view. Variants: "fade", "scale", "clip" (01-base.css); "off" opts out.
   - [data-cn-stagger]: its children rise in one after another (70 ms apart).
   - Home: legacy .reveal is a page-load cascade (script.js adds .show to every reveal of the
     page at once), so below the hero nothing was revealed on scroll. At start-up this module
     tags the section heads, the support box and the limits note (TAG below) with
     data-cn-reveal, so they rise in as you read. Blocks with their own scroll-linked motion
     (the Live cards, the photo tiles, the console, the reel stage, the Rules sheet, the closing
     statement) are left to their partials. Legacy .show is never touched: the tag only adds a
     second, scroll-based gate on top (the block is visible once it has .is-in; the legacy
     transition has long finished by then). Owners can key one-off effects to .is-in, or opt a
     block in with data-cn-reveal in the markup.
     CSS lives in 01-base.css; the hidden state exists only under html.cn-js and only until
     .is-in, so content can never get stuck invisible. Reduced motion (and the global Pause
     motion, which CN.reduced() includes, 07-aurora.js): shown at once.
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
    if (el.getAttribute("data-cn-reveal") === "off") return;
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

  // Home: the section heads and the closing blocks become scroll reveals (see the header).
  var TAG = "#home > :is(.cn-live, .cn-threats, .cn-demo, .cn-flow) > .cn-head.reveal, " +
    "#home > .support-box.reveal, #home > .home-limits-note.reveal";
  function tagHome() {
    var list;
    try { list = CN.qsa(TAG); } catch (e) { return; } // :is() missing: keep the legacy cascade
    list.forEach(function (el) {
      if (el.hasAttribute("data-cn-reveal") || el.hasAttribute("data-cn-stagger")) return;
      el.setAttribute("data-cn-reveal", "");
    });
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
    tagHome();
    scan();
    CN.qsa(".cn-live-dot").forEach(liveDot);
  });
})();
