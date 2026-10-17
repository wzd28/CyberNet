/* Focus management for the phone menu sheet and the dialogs (owner: platform).
   Observe-only bridge: legacy scripts keep opening and closing their layers by toggling classes
   (header.navbar.open, .modal.show, .cn-legal-modal.show, including the dialogs the add-on
   scripts inject later). This file watches those classes and handles focus around them, the way
   a careful user would. It never wraps or replaces a legacy function.

   While a layer is open:
   - The rest of the page is inert, so Tab, screen-reader browsing and stray clicks stay inside
     it. Only elements this file made inert are released again. Above the menu sheet the cookie
     bar stays usable (it sits on top of the sheet); under a dialog it is covered and inert.
   - Tab and Shift+Tab wrap from the last control to the first one and back.
   - A dialog gets focus when it opens, unless its own script already moved focus into it. The
     menu sheet keeps focus on its Menu/Close button, which lives inside the header with it.
   - Escape: the dialogs and the sheet (12-nav.js) close themselves. If the top layer is still
     open just after Escape, this file clicks its own close button, exactly as a user would.
   - When a layer closes and focus was lost on the way (on <body> or inside the closed layer),
     focus returns to the control that opened it, or else to the layer underneath.
   Layers stack: the Legal Center over the sign-in dialog, the sign-in dialog opened from the
   sheet. Only the top layer is live; closing it hands focus back to the one below.
   Timing (v4.4): a class change is handled right after the next frame (schedule()), so the
   layer appears first and the page-wide restyle that inert causes never delays that frame. Tab,
   Escape and focusin handle it at once (they call refresh()). */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN || !("MutationObserver" in window)) return;
  var doc = document, win = window;

  var HAS_INERT = typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;
  var DIALOGS = ".modal, .cn-legal-modal";
  var CONSENT = "#cnConsentBar, .cn-consent";
  var CLOSERS = ".close-modal, #closeHowtoVideo, .video-exit-btn, .cn-legal-close, [data-close], [data-dismiss]";
  var FOCUSABLE = "a[href], area[href], button, input, select, textarea, iframe, summary, audio[controls], video[controls], [contenteditable], [tabindex]";
  var SKIP_TAGS = /^(SCRIPT|STYLE|LINK|META|TEMPLATE|NOSCRIPT)$/;
  var mqSheet = win.matchMedia ? win.matchMedia("(max-width: 1023.98px)") : null;

  var nav = null, menuBtn = null;
  var dialogs = [];   /* every dialog root seen so far */
  var stack = [];     /* open layers, bottom to top: { el, kind, box, opener, below } */
  var marked = [];    /* elements this file made inert */
  var mo = null;

  /* ---------- small helpers ---------- */
  function shown(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    var cs = win.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }
  function focusable(el) {
    if (!el || !el.isConnected || el.disabled || el.tabIndex < 0) return false;
    if (el.closest && el.closest("[inert]")) return false;
    return shown(el);
  }
  function focus(el) {
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { return false; } }
    return doc.activeElement === el;
  }
  function lost(a) { return !a || a === doc.body || a === doc.documentElement || !shown(a); }
  function top() { return stack[stack.length - 1] || null; }

  /* ---------- layers ---------- */
  function sheetOpen() {
    return !!(nav && nav.classList.contains("open") && (!mqSheet || mqSheet.matches));
  }
  function dialogOpen(el) {
    return el.isConnected && el.classList.contains("show") && shown(el);
  }
  function isOpen(layer) { return layer.kind === "sheet" ? sheetOpen() : dialogOpen(layer.el); }
  /* The parts of the page that stay live while this layer is on top, in document order. */
  function scope(layer) {
    if (layer.kind !== "sheet") return [layer.el];
    var list = [layer.el];
    CN.qsa(CONSENT).forEach(function (c) { if (shown(c) && !layer.el.contains(c)) list.push(c); });
    return list.sort(function (x, y) { return x.compareDocumentPosition(y) & 4 ? -1 : 1; });
  }
  function inScope(layer, el) {
    return scope(layer).some(function (s) { return s.contains(el); });
  }
  function tabbables(layer) {
    var out = [];
    scope(layer).forEach(function (s) {
      CN.qsa(FOCUSABLE, s).forEach(function (el) {
        if (el.getAttribute("contenteditable") === "false") return;
        if (focusable(el)) out.push(el);
      });
    });
    return out;
  }
  function zIndex(el) { var z = parseInt(win.getComputedStyle(el).zIndex, 10); return isFinite(z) ? z : 0; }

  /* Everything outside the top layer's scope becomes inert: the siblings of each ancestor on the
     way from the layer up to <body>. */
  function applyInert() {
    var want = [], t = top();
    if (t && HAS_INERT) {
      var keep = scope(t).filter(function (k) { return doc.body.contains(k); });
      var path = [];
      keep.forEach(function (k) {
        for (var n = k; n && n !== doc.body; n = n.parentElement) if (path.indexOf(n) < 0) path.push(n);
      });
      if (keep.length) (function walk(parent) {
        for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
          if (path.indexOf(c) >= 0) { if (keep.indexOf(c) < 0) walk(c); continue; }
          if (!SKIP_TAGS.test(c.tagName)) want.push(c);
        }
      })(doc.body);
    }
    marked = marked.filter(function (el) {
      if (want.indexOf(el) >= 0) return true;
      el.removeAttribute("inert");
      return false;
    });
    want.forEach(function (el) {
      if (el.hasAttribute("inert")) return; /* already inert (ours, or someone else's) */
      el.setAttribute("inert", "");
      marked.push(el);
    });
  }

  function opened(layer) {
    if (layer.kind === "sheet") return;
    /* Legacy moves focus to the first field in a requestAnimationFrame; look after it. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (top() !== layer || !isOpen(layer)) return;
        var a = doc.activeElement;
        if (a && !lost(a) && inScope(layer, a)) return;
        var first = tabbables(layer)[0];
        if (first) { focus(first); return; }
        var box = layer.box;
        if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
        focus(box);
      });
    });
  }

  function closed(layer, wasTop) {
    if (!wasTop) return; /* a layer above it owns focus */
    var a = doc.activeElement;
    if (!lost(a) && !layer.el.contains(a)) return; /* focus already went somewhere sensible */
    var under = top();
    var tries = [layer.opener];
    for (var b = layer.below; b; b = b.below) tries.push(b.opener);
    for (var i = 0; i < tries.length; i++) {
      var el = tries[i];
      if (!focusable(el)) continue;
      if (under && !inScope(under, el)) continue;
      if (focus(el)) return;
    }
    if (under) { var first = tabbables(under)[0]; if (first) focus(first); }
  }

  /* Class changes are handled just after the next frame, not inside the tap that made them:
     the sheet or dialog paints first, then the rest of the page goes inert and focus moves
     (both restyle the whole page, which used to hold that first frame back). The element that
     had focus when the layer opened is remembered at once, so focus still returns to it.
     Keys (Tab, Escape) and focus checks call refresh() directly, so containment is exact. */
  var pending = false, openerHint = null;
  function schedule() {
    if (!openerHint) openerHint = doc.activeElement;
    if (pending) return;
    pending = true;
    var done = false;
    var run = function () { if (done) return; done = true; if (pending) refresh(); };
    requestAnimationFrame(function () { setTimeout(run, 0); });
    setTimeout(run, 150); /* a hidden tab runs no frames */
  }

  function refresh() {
    pending = false;
    var hint = openerHint;
    openerHint = null;
    var wasTop = top(), gone = [], fresh = [];
    for (var i = stack.length - 1; i >= 0; i--) {
      if (!isOpen(stack[i])) gone.push(stack.splice(i, 1)[0]);
    }
    var candidates = [];
    if (sheetOpen()) candidates.push({ el: nav, kind: "sheet" });
    dialogs.forEach(function (d) { if (dialogOpen(d)) candidates.push({ el: d, kind: "dialog" }); });
    candidates.forEach(function (c) {
      if (stack.some(function (l) { return l.el === c.el; })) return;
      fresh.push(c);
    });
    if (!gone.length && !fresh.length) return;
    fresh.sort(function (x, y) { return zIndex(x.el) - zIndex(y.el); });
    fresh.forEach(function (c) {
      /* the control that had focus when the layer opened (legacy may have moved focus into the
         dialog since) */
      var a = hint && hint.isConnected && !c.el.contains(hint) ? hint : doc.activeElement;
      var layer = {
        el: c.el,
        kind: c.kind,
        box: c.kind === "sheet" ? c.el : (c.el.querySelector('[role="dialog"]') || c.el),
        opener: c.kind === "sheet" ? menuBtn : (a && !lost(a) && !c.el.contains(a) ? a : null),
        below: top()
      };
      stack.push(layer);
    });
    applyInert();
    gone.forEach(function (l) { closed(l, l === wasTop); });
    stack.forEach(function (l) { if (fresh.some(function (c) { return c.el === l.el; })) opened(l); });
  }

  /* ---------- watching ---------- */
  function watch(el) {
    if (!el || el.__cnFocusWatch) return;
    el.__cnFocusWatch = true;
    mo.observe(el, { attributes: true, attributeFilter: el === nav ? ["class"] : ["class", "style", "hidden"] });
  }
  function adopt(root) {
    if (!root || root.nodeType !== 1) return false;
    var found = false;
    var list = root.matches && root.matches(DIALOGS) ? [root] : [];
    list = list.concat(CN.qsa(DIALOGS, root));
    list.forEach(function (d) {
      if (dialogs.indexOf(d) >= 0) return;
      dialogs.push(d);
      watch(d);
      found = true;
    });
    return found;
  }

  /* ---------- keys ---------- */
  function onTab(e) {
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
    refresh();
    var t = top();
    if (!t) return;
    var list = tabbables(t);
    if (!list.length) { e.preventDefault(); return; }
    var a = doc.activeElement, i = list.indexOf(a), n = list.length, next = null;
    if (i >= 0) {
      /* Inside one dialog the browser's own order is right (radio groups, positive tabindex);
         only the ends wrap. The sheet spans the header and the cookie bar, which are not next
         to each other in the page, so it steps through its own list. */
      var edge = e.shiftKey ? i === 0 : i === n - 1;
      if (!edge && scope(t).length < 2) return;
      next = list[(i + (e.shiftKey ? n - 1 : 1)) % n];
    } else if (a && !lost(a) && inScope(t, a)) {
      /* on something inside that is not in the Tab order (a container): step from its position */
      var after = list.filter(function (el) { return a.compareDocumentPosition(el) & 4; });
      var before = list.filter(function (el) { return a.compareDocumentPosition(el) & 2; });
      next = e.shiftKey ? (before[before.length - 1] || list[list.length - 1]) : (after[0] || list[0]);
    } else {
      next = e.shiftKey ? list[list.length - 1] : list[0];
    }
    e.preventDefault();
    focus(next);
  }

  /* Window capture: runs before every legacy Escape handler, so this is the layer the key was
     meant for. Those handlers run during this same event; look again once it is over. */
  function onEscape(e) {
    if ((e.key !== "Escape" && e.key !== "Esc") || e.isComposing) return;
    refresh();
    var t = top();
    if (!t) return;
    setTimeout(function () {
      if (e.defaultPrevented) return;
      refresh();
      if (top() !== t || !isOpen(t)) return;
      var btn = t.kind === "sheet" ? menuBtn : CN.qsa(CLOSERS, t.el).filter(shown)[0];
      if (btn) btn.click();
    }, 0);
  }

  function onFocusIn(e) {
    var t = top();
    if (!t || !e.target || inScope(t, e.target)) return;
    refresh();
    t = top();
    if (!t || inScope(t, e.target)) return;
    var first = tabbables(t)[0];
    if (first) focus(first);
  }

  CN.onReady(function () {
    nav = CN.qs("header.navbar") || CN.qs(".navbar");
    menuBtn = doc.getElementById("mobileMenu");
    mo = new MutationObserver(schedule);
    watch(nav);
    adopt(doc.body);
    /* the add-on scripts append their dialogs to <body> later */
    new MutationObserver(function (records) {
      var found = false;
      records.forEach(function (r) {
        for (var i = 0; i < r.addedNodes.length; i++) if (adopt(r.addedNodes[i])) found = true;
      });
      if (found) schedule();
    }).observe(doc.body, { childList: true });
    if (mqSheet) {
      if (mqSheet.addEventListener) mqSheet.addEventListener("change", schedule);
      else if (mqSheet.addListener) mqSheet.addListener(schedule);
    }
    doc.addEventListener("keydown", onTab, true);
    win.addEventListener("keydown", onEscape, true);
    if (!HAS_INERT) doc.addEventListener("focusin", onFocusIn, true);
    refresh();
  });
})();
