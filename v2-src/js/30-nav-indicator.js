/* Keeps the white nav pill under the active link.
   script.js measures #navIndicator only on load, resize and page switches, so a
   late webfont swap or the injected Account link can leave it offset. Re-running
   its own resize handler after those moments realigns it without touching script.js. */
(function () {
  "use strict";
  var tabs = document.querySelector(".nav-tabs");
  if (!tabs || !document.getElementById("navIndicator")) return;
  var pending = 0;
  function realign() {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      window.dispatchEvent(new Event("resize"));
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(realign);
  window.addEventListener("load", function () { setTimeout(realign, 600); });
  new MutationObserver(realign).observe(tabs, { childList: true });
})();
