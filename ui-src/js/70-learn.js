/* Learn: keeps each lesson title button's aria-expanded in step with the legacy .expanded class
   (script.js opens and closes .rm-node cards on click; the button only makes that reachable by keyboard).
   An opened lesson spans its whole row, so a card opened from the middle of a row moves down a row,
   and a lesson closing above it (one open per module) pulls it up (the grid keeps reading order:
   40-learn.css). When the reader opened it and its top ends up outside the comfortable part of the
   screen, it is brought back into view. Deep links and search results scroll themselves (script.js),
   so only a click or key press on the card itself triggers this; the jump goes through
   CN.motion.scrollTo (Lenis when it drives, else native, instant under reduced motion).
   v5 entrances for the inner pages (owner: pages), armed once at onReady through CN.motion.reveal
   (one-shot, IntersectionObserver; on screen at the first report = shown at once, never hidden;
   reduced / Pause = final): each Learn module's lesson cards settle 50 ms apart, Quick Scan's
   example rows 70 ms apart, and About's stats row, story rows and "At a glance" lines are
   triggers whose hairlines draw and whose text settles (45-about.css keys on .is-in). */
(function () {
  "use strict";
  var CN = window.CN, M = CN && CN.motion;
  if (!CN || !("MutationObserver" in window)) return;
  var SETTLE = 540; /* the lesson panel animates its height over --cn-dur-3 (500 ms) */

  function keepInView(node) {
    var top = node.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * .6) M && M.scrollTo(node);
  }

  CN.onReady(function () {
    if (M) {
      M.reveal("#learn .rm-nodes", "stagger", { step: 50 });
      M.reveal("#cybernet .scan-list", "stagger");
      M.reveal("#about .about-stats-row, #about .about-block, #about .fetch-body", "trigger");
    }
    var last = null; /* { node, at, settle } for the most recent click on a card */
    CN.qsa("#learn .rm-node").forEach(function (node) {
      var btn = node.querySelector(".cn-lesson-toggle");
      var open = node.classList.contains("expanded");
      /* capture: recorded before script.js swaps the classes in its own click handler */
      node.addEventListener("click", function () {
        var group = node.parentNode, above = false;
        if (group) CN.qsa(".rm-node.expanded", group).forEach(function (n) {
          if (n !== node && (n.compareDocumentPosition(node) & 4)) above = true;
        });
        last = { node: node, at: Date.now(), settle: above && !CN.reduced() };
      }, true);
      var sync = function () {
        var now = node.classList.contains("expanded");
        if (btn) btn.setAttribute("aria-expanded", now ? "true" : "false");
        if (now && !open && last && last.node === node && Date.now() - last.at < 800) {
          if (last.settle) setTimeout(function () { if (node.classList.contains("expanded")) keepInView(node); }, SETTLE);
          else keepInView(node);
        }
        open = now;
      };
      if (btn) sync();
      new MutationObserver(sync).observe(node, { attributes: true, attributeFilter: ["class"] });
    });
  });
})();
