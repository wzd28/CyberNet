/* CyberNet AI iPhone app: the in-app legal pages (legal/*.html, built by mobile/scripts/build-web.mjs).
   Opened inside the app's legal sheet (?embedded=1: the sheet has its own Done button) or on their own,
   with a Back bar. Mail links open the Mail app; nothing on these pages leaves the app's own pages. */
(function () {
  "use strict";
  var w = window, d = document;
  var embedded = /[?&]embedded=1(?:&|$)/.test(w.location.search);
  if (embedded) d.documentElement.classList.add("cn-ios-embedded");
  d.addEventListener("click", function (e) {
    var back = e.target.closest && e.target.closest("[data-legal-back]");
    if (back) {
      e.preventDefault();
      if (w.history.length > 1) w.history.back();
      else w.location.href = "../index.html";
      return;
    }
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/^mailto:/i.test(href)) {
      e.preventDefault();
      var parent = null;
      try { parent = w.parent && w.parent !== w ? w.parent : null; } catch (err) { parent = null; }
      if (parent && typeof parent.CNOpenExternal === "function") parent.CNOpenExternal(a.href);
      else w.location.href = a.href;
      return;
    }
    if (/^[\w-]+\.html/.test(href) && embedded) {
      e.preventDefault();
      w.location.href = href.replace(/(#|$)/, "?embedded=1$1");
    }
  });
})();
