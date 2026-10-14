/* Learn: keeps each lesson title button's aria-expanded in step with the legacy .expanded class
   (script.js opens and closes .rm-node cards on click; the button only makes that reachable by keyboard).
   An opened lesson spans its whole row, so a card opened from the middle of a row moves down a row,
   and a lesson closing above it (one open per module) pulls it up (the grid keeps reading order:
   40-learn.css). When the reader opened it and its top ends up outside the comfortable part of the
   screen, it is brought back into view. Deep links and search results scroll themselves (script.js),
   so only a click or key press on the card itself triggers this. */
(function () {
  "use strict";
  if (!window.CN || !("MutationObserver" in window)) return;
  var SETTLE = 540; /* the lesson panel animates its height over --cn-dur-3 (500 ms) */

  function keepInView(node) {
    var top = node.getBoundingClientRect().top;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (top < 0 || top > vh * .6) node.scrollIntoView({ block: "start", behavior: CN.reduced() ? "auto" : "smooth" });
  }

  CN.onReady(function () {
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
