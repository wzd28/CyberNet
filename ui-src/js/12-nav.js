/* Header, footer and overlay helpers (owner: chrome). Bridge rules only: this file clicks the
   existing Menu and Exit buttons exactly as a user would and never wraps or replaces legacy
   functions.
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
   - While the sheet is open on a phone or tablet it covers the whole page, so CN.setCovered(true)
     rests the hero globe, the signal lines and every CN.loop under it (00-core.js).
   - No scroll bleed behind the sheet: html.cn-menu-open sets overflow:hidden, and while the
     sheet is open (and only then) a touchmove guard stops a drag that starts on the sheet's
     ground, its top row or its bottom bar from scrolling the page underneath on browsers that
     ignore overflow on the root (older iOS). The link list itself scrolls natively.
   - The current page is mirrored into aria-current="page" on the nav links (script.js only sets
     the .active class), so the sheet's marker is also announced.
   (The footer's drifting glow and its "chrome-fx" module are gone: v4.1 chrome does not move.)
   Focus containment for the sheet and the dialogs lives in 08-focus.js (platform owner). */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  CN.onReady(function () {
    var nav = CN.qs(".navbar");
    var menuBtn = document.getElementById("mobileMenu");
    var mqSheet = window.matchMedia ? window.matchMedia("(max-width: 1023.98px)") : null;

    /* touchmove guard, attached only while the sheet is open */
    var guarding = false;
    function onTouchMove(e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var list = t.closest(".navbar.open .nav-tabs");
      if (list && list.scrollHeight > list.clientHeight + 1) return;
      if (t.closest(".modal, .cn-legal-modal, #cnConsentBar, .cn-consent")) return;
      if (e.cancelable) e.preventDefault();
    }
    function guard(on) {
      if (on === guarding) return;
      guarding = on;
      if (on) document.addEventListener("touchmove", onTouchMove, { passive: false });
      else document.removeEventListener("touchmove", onTouchMove, { passive: false });
    }

    if (nav && "MutationObserver" in window) {
      /* The sheet is opaque and covers the whole screen: the canvases and loops under it rest at
         once, and carry on just after the first frame without it (waking them reads layout,
         which must not happen inside the tap that closes the sheet and switches the page). */
      var uncoverRaf = 0;
      var cover = function (on) {
        if (!CN.setCovered) return;
        if (uncoverRaf) { CN.cancelRaf(uncoverRaf); uncoverRaf = 0; }
        if (on) { CN.setCovered(true); return; }
        if (!CN.covered()) return;
        uncoverRaf = CN.raf(function () {
          uncoverRaf = 0;
          setTimeout(function () { if (!sheetOpen()) CN.setCovered(false); }, 0);
        });
      };
      var syncOpen = function () {
        var open = nav.classList.contains("open"), sheet = open && (!mqSheet || mqSheet.matches);
        document.documentElement.classList.toggle("cn-menu-open", open);
        guard(sheet);
        cover(sheet);
      };
      syncOpen();
      new MutationObserver(syncOpen).observe(nav, { attributes: true, attributeFilter: ["class"] });
      if (mqSheet) {
        if (mqSheet.addEventListener) mqSheet.addEventListener("change", syncOpen);
        else if (mqSheet.addListener) mqSheet.addListener(syncOpen);
      }

      var tabs = CN.qs(".nav-tabs", nav);
      if (tabs) {
        var syncCurrent = function () {
          CN.qsa(".nav-link", tabs).forEach(function (a) {
            var cur = a.classList.contains("active") && a.hasAttribute("data-page");
            if (cur) { if (a.getAttribute("aria-current") !== "page") a.setAttribute("aria-current", "page"); }
            else if (a.hasAttribute("aria-current")) a.removeAttribute("aria-current");
          });
        };
        syncCurrent();
        new MutationObserver(syncCurrent).observe(tabs, { attributes: true, attributeFilter: ["class"], subtree: true });
      }
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
