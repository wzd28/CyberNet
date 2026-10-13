/* Header and overlay helpers (owner: chrome). Bridge rules only: this file clicks the existing
   Menu and Exit buttons exactly as a user would and never wraps or replaces legacy functions.
   - Escape closes the phone/tablet menu sheet (script.js has no Escape handler for it). It
     listens on window in the capture phase, so while a dialog is open the dialog's own Escape
     handlers run instead and the sheet stays as it is.
   - Opening Sign in or Account from the sheet closes the sheet first, so the dialog never
     returns to a menu left open underneath it.
   - The how-to walkthrough is now a sheet over a scrim: a click on the scrim closes it like
     its Exit button (the other modals already close on a scrim click).
   - The Legal Center viewer (built once by cybernet-legal-upgrade.js) holds a whole legal
     document, so it is not a live region: aria-live is removed before it first opens, and
     screen readers are not made to read a full document on every tab switch.
   - html.cn-menu-open mirrors .navbar.open (a MutationObserver on the nav's class), so the
     scroll lock in 10-nav.css needs no root-anchored :has() (DESIGN.md, Performance). The
     class sits on <html>, outside the body-wide legacy observers.
   Focus containment for the sheet and the dialogs lives in 08-focus.js (platform owner). */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  CN.onReady(function () {
    var nav = CN.qs(".navbar");
    var menuBtn = document.getElementById("mobileMenu");
    var mqSheet = window.matchMedia ? window.matchMedia("(max-width: 1023.98px)") : null;

    if (nav && "MutationObserver" in window) {
      var syncOpen = function () {
        document.documentElement.classList.toggle("cn-menu-open", nav.classList.contains("open"));
      };
      syncOpen();
      new MutationObserver(syncOpen).observe(nav, { attributes: true, attributeFilter: ["class"] });
    }

    function sheetOpen() {
      return !!(nav && menuBtn && nav.classList.contains("open") && (!mqSheet || mqSheet.matches));
    }

    if (nav && menuBtn) {
      window.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !sheetOpen()) return;
        if (CN.qs(".modal.show, .cn-legal-modal.show")) return;
        menuBtn.click();
        try { menuBtn.focus({ preventScroll: true }); } catch (err) { menuBtn.focus(); }
      }, true);

      document.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.closest || !sheetOpen()) return;
        if (t.closest("#openAuth, #accountNavBtn")) menuBtn.click();
      });
    }

    function quietLegalViewer() {
      var v = document.getElementById("cnLegalViewer");
      if (!v) return false;
      v.removeAttribute("aria-live");
      return true;
    }
    if (!quietLegalViewer()) {
      CN.afterLoad(quietLegalViewer);
      document.addEventListener("click", function onFirstClick() {
        if (quietLegalViewer()) document.removeEventListener("click", onFirstClick, true);
      }, true);
    }

    var howto = document.getElementById("howtoVideoModal");
    var exit = document.getElementById("closeHowtoVideo");
    if (howto && exit) {
      howto.addEventListener("click", function (e) {
        if (e.target === howto && howto.classList.contains("show")) exit.click();
      });
    }
  });
})();
