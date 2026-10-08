/* v2 motion layer (owner: motion).
   First-visit intro, cursor-lit dot glow, card spotlight, magnetic buttons,
   smooth wheel scrolling, split headings, lazy 3D hero, mobile-menu focus
   handling, Learn lesson anchoring and the phone pricing carousel start.
   (The hero's scroll parallax is CSS scroll-driven, in 70-motion.css.)
   Rules this file keeps (see the redesign HAZARDS map):
   - The body-wide MutationObservers of final-ui-fix / legal-upgrade are
     already attached when this deferred bundle runs (readyState is
     "interactive", so both init immediately). Inside <body> this file
     therefore only makes one-time changes: it inserts its own nodes once,
     splits the [data-v2-split] headings once, adds .v2-mag once and adds
     .v2-in once per heading. Everything that changes per frame is a CSS
     custom property or inline style (legal-upgrade filters attributes to
     class/hidden/data-cycle, final-ui-fix ignores attributes) or a class on
     <html> (outside <body>).
   - No stopPropagation, no window.fetch changes, no ids/classes of the app
     are renamed or removed.
   Exposes window.CNV2 = { reducedMotion, finePointer, isPage(id), onFrame(fn),
   pointer {x,y,sx,sy,inside}, hero3d (bool once mounted),
   intro (true while the overlay is up; 'cnv2:intro-end' fires on window). */
(function () {
  "use strict";
  var win = window, doc = document, root = doc.documentElement;
  if (!root.classList.contains("v2") || win.CNV2 && win.CNV2.__motion) return;

  /* ---------- helpers ---------- */
  function mq(q) {
    try { return win.matchMedia(q); } catch (e) { return { matches: false }; }
  }
  function onMq(m, fn) {
    if (!m || !m.addEventListener) { if (m && m.addListener) m.addListener(fn); return; }
    m.addEventListener("change", fn);
  }
  var mqReduce = mq("(prefers-reduced-motion: reduce)");
  var mqFine = mq("(hover: hover) and (pointer: fine)");
  var mqDesk = mq("(min-width: 1024px)");
  var mqMenu = mq("(max-width: 1060px)"); // legacy shows #mobileMenu (and the sheet) only up to 1060px
  function reduced() { return !!mqReduce.matches; }
  function fine() { return !!mqFine.matches; }
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var saveData = !!(conn && conn.saveData);
  var store = {
    get: function (k) { try { return win.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { win.localStorage.setItem(k, v); } catch (e) {} }
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function isPage(id) {
    var el = doc.getElementById(id);
    return !!(el && el.classList.contains("active-page"));
  }
  function spring(o, target, dt, k, c) {
    var n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (var i = 0; i < n; i++) { var a = -k * (o.x - target) - c * o.v; o.v += a * h; o.x += o.v * h; }
    return o.x;
  }
  function modalOpen() {
    return !!doc.querySelector(".modal.show, .cn-legal-modal.show");
  }

  /* ---------- shared frame loop: runs only while a callback asks for more ---------- */
  var frameFns = [], frameRaf = 0, frameLast = 0;
  function tick(now) {
    frameRaf = 0;
    var dt = Math.min(0.05, Math.max(0.001, (now - frameLast) / 1000));
    frameLast = now;
    var list = frameFns.slice();
    for (var i = 0; i < list.length; i++) {
      var keep = false;
      try { keep = list[i](dt, now); } catch (e) { keep = false; }
      if (keep !== true) {
        var at = frameFns.indexOf(list[i]);
        if (at > -1) frameFns.splice(at, 1);
      }
    }
    if (frameFns.length) frameRaf = requestAnimationFrame(tick);
  }
  /* fn(dt, now) returns true to keep running next frame, anything else stops it. */
  function onFrame(fn) {
    if (typeof fn !== "function") return;
    if (frameFns.indexOf(fn) < 0) frameFns.push(fn);
    if (!frameRaf) { frameLast = performance.now(); frameRaf = requestAnimationFrame(tick); }
  }

  var api = win.CNV2 = win.CNV2 || {};
  api.__motion = true;
  api.intro = false;
  api.isPage = isPage;
  api.onFrame = onFrame;
  try {
    Object.defineProperty(api, "reducedMotion", { get: reduced, configurable: true, enumerable: true });
    Object.defineProperty(api, "finePointer", { get: fine, configurable: true, enumerable: true });
  } catch (e) { api.reducedMotion = reduced(); api.finePointer = fine(); }

  var body = doc.body;
  if (!body) return;

  /* ---------- 1. first-visit intro ----------
     The page must never show the hero, then the splash, then the hero again.
     - Preferred: an inline <head> script decides before the first paint and
       adds html.v2-intro-pending (same tests as introWanted: path "/", no
       hash, no app query, no reduced motion, no cn-v2-intro key). 70-motion.css
       then paints a plain cover from the first frame (it lifts itself after
       ~1.7 s if this script never runs). This script swaps the cover for the
       animated intro, or just lifts it when the bundle arrives late.
     - Without that class (no head script), the intro only plays if nothing
       has been painted yet; otherwise it is skipped (the key is not set, so
       a later, faster visit plays it). */
  var INTRO_LATE = 900; // ms after navigation start; a later bundle skips the splash
  function painted() {
    try { return performance.getEntriesByType("paint").length > 0; } catch (e) { return false; }
  }
  function liftCover(fade) {
    if (!root.classList.contains("v2-intro-pending")) return;
    if (!fade || reduced()) { root.classList.remove("v2-intro-pending", "v2-intro-lift"); return; }
    root.classList.add("v2-intro-lift"); // 70-motion.css: short fade-out of the cover
    setTimeout(function () { root.classList.remove("v2-intro-pending", "v2-intro-lift"); }, 340);
  }
  function introWanted() {
    var search = location.search || "";
    if (reduced()) return false; // reduced motion always wins, even over ?v2intro=1
    if (/[?&]v2intro=0(&|$)/.test(search)) return false;
    if (/[?&]v2intro=1(&|$)/.test(search)) return true;
    if (location.pathname !== "/") return false;
    // Any hash is a deep link on this SPA (lesson links /#learn-..., auth
    // tokens): the visitor came for that content, not for a splash.
    if (location.hash && location.hash.length > 1) return false;
    // Only on a clean landing: any app query (auth, reset, invite, checkout...) skips it.
    var params = search.replace(/^\?/, "").split("&").filter(Boolean);
    for (var i = 0; i < params.length; i++) {
      var key = params[i].split("=")[0].toLowerCase();
      if (!/^(utm_[a-z_]+|gclid|fbclid|msclkid|ref|v2intro)$/.test(key)) return false;
    }
    if (store.get("cn-v2-intro")) return false;
    if (doc.visibilityState === "hidden") return false;
    if (modalOpen()) return false;
    // This script is deferred (it runs after the CDN scripts).
    if (performance.now() > INTRO_LATE) return false;
    if (!root.classList.contains("v2-intro-pending") && painted()) return false;
    return true;
  }

  function runIntro() {
    var el = doc.createElement("div");
    el.className = "v2-intro";
    el.id = "v2Intro";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<div class="v2-intro-in">' +
        '<svg class="v2-intro-mark" viewBox="0 0 110 122" fill="none" focusable="false">' +
          '<defs><linearGradient id="v2IntroGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5f3fc"/></linearGradient></defs>' +
          '<path class="v2-intro-shield" d="M55 6 99 25 95 70 55 114 15 70 11 25Z" pathLength="1" stroke="url(#v2IntroGrad)" stroke-width="3" stroke-linejoin="round"/>' +
          '<g class="v2-intro-shackle"><path d="M43 62V51a12 12 0 0 1 24 0v11" stroke="#effdff" stroke-width="5" stroke-linecap="round"/></g>' +
          '<g class="v2-intro-body"><rect x="35" y="60" width="40" height="31" rx="7" fill="#effdff"/><circle cx="55" cy="73" r="4" fill="#0a1214"/><rect x="53.4" y="74" width="3.2" height="8" rx="1.6" fill="#0a1214"/></g>' +
        "</svg>" +
        '<div class="v2-intro-word">CYBERNET <b>AI</b></div>' +
      "</div>" +
      '<div class="v2-intro-flash"></div>';
    body.appendChild(el);
    root.classList.add("v2-intro-on");
    store.set("cn-v2-intro", "1");
    api.intro = true;
    // The overlay fades in over the pre-paint cover (both are the navy
    // ground), then the cover goes away underneath it.
    var coverTimer = root.classList.contains("v2-intro-pending") ? setTimeout(function () { liftCover(false); }, 160) : 0;

    var done = false, timer = 0;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(coverTimer);
      liftCover(false);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (t) { win.removeEventListener(t, skip, true); });
      if (el.parentNode) el.parentNode.removeChild(el);
      root.classList.remove("v2-intro-on");
      api.intro = false;
      try { win.dispatchEvent(new CustomEvent("cnv2:intro-end")); } catch (e) {}
    }
    function skip() {
      if (done) return;
      clearTimeout(timer);
      clearTimeout(coverTimer);
      liftCover(true);
      // Fade out from wherever the overlay is now (it may already be fading).
      var o = parseFloat(getComputedStyle(el).opacity);
      if (!(o >= 0)) o = 1;
      el.style.pointerEvents = "none";
      el.style.animation = "none";
      el.style.opacity = "0";
      if (el.animate) {
        try { el.animate([{ opacity: o }, { opacity: 0 }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch (e) {}
      }
      timer = setTimeout(finish, 240);
    }
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (t) { win.addEventListener(t, skip, { capture: true, passive: true }); });
    timer = setTimeout(finish, 1500);
  }
  if (introWanted()) runIntro();
  else liftCover(true);

  /* ---------- shared pointer state (read-only for other partials: CNV2.pointer) ---------- */
  var P = { x: -999, y: -999, sx: -999, sy: -999, inside: false, seen: false };
  api.pointer = P;

  /* ---------- 2. cursor-lit dot grid + glow ---------- */
  var glow = doc.createElement("div");
  glow.className = "v2-glow";
  glow.id = "v2Glow";
  glow.setAttribute("aria-hidden", "true");
  body.appendChild(glow);

  function syncPointerClass() {
    root.classList.toggle("v2-pointer", fine() && !reduced());
    if (!fine() || reduced()) { root.classList.remove("v2-pointer-in"); P.inside = false; }
  }
  syncPointerClass();
  onMq(mqFine, syncPointerClass);
  onMq(mqReduce, syncPointerClass);

  var glowLast = { x: NaN, y: NaN };
  function glowFrame(dt) {
    var k = 1 - Math.exp(-dt * 14);
    P.sx += (P.x - P.sx) * k;
    P.sy += (P.y - P.sy) * k;
    var settled = Math.abs(P.x - P.sx) < 0.3 && Math.abs(P.y - P.sy) < 0.3;
    if (settled) { P.sx = P.x; P.sy = P.y; }
    var rx = Math.round(P.sx * 10) / 10, ry = Math.round(P.sy * 10) / 10;
    if (rx !== glowLast.x || ry !== glowLast.y) {
      // Written on the glow layer itself: a custom property on <html> restyles
      // the whole document (measured 12-100 ms per write here), on #v2Glow ~0.05 ms.
      glow.style.setProperty("--v2-mx", rx + "px");
      glow.style.setProperty("--v2-my", ry + "px");
      glowLast.x = rx; glowLast.y = ry;
    }
    return !settled;
  }

  /* ---------- 3. card spotlight (one overlay; cards only get custom properties) ---------- */
  var spotEl = doc.createElement("div");
  spotEl.className = "v2-spot";
  spotEl.id = "v2Spot";
  spotEl.setAttribute("aria-hidden", "true");
  body.appendChild(spotEl);
  var spot = { card: null, hit: null, shown: false };
  var SKIP_TAGS = { BUTTON: 1, A: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1 };

  function spotCardFor(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    el = el && el.closest ? el.closest(".glass") : null;
    while (el) {
      if (!SKIP_TAGS[el.tagName] && !el.classList.contains("navbar") && !el.closest(".modal, .cn-legal-modal, .navbar")) {
        var w = el.offsetWidth, h = el.offsetHeight;
        if (w >= 160 && h >= 80) return el;
      }
      el = el.parentElement ? el.parentElement.closest(".glass") : null;
    }
    return null;
  }
  function hideSpot() {
    if (spot.card) spot.card.style.setProperty("--v2-spot-o", "0");
    spot.card = null;
    if (spot.shown) { spotEl.style.opacity = "0"; spot.shown = false; }
  }
  function spotFrame() {
    var card = P.inside && !reduced() ? spot.hit : null;
    if (!card || !card.isConnected) { hideSpot(); return false; }
    var r = card.getBoundingClientRect();
    if (!r.width || !r.height) { hideSpot(); return false; }
    if (card !== spot.card) {
      if (spot.card) spot.card.style.setProperty("--v2-spot-o", "0");
      spot.card = card;
      spotEl.style.borderRadius = getComputedStyle(card).borderRadius;
    }
    var x = Math.round(P.x - r.left) + "px", y = Math.round(P.y - r.top) + "px";
    card.style.setProperty("--v2-spot-x", x);
    card.style.setProperty("--v2-spot-y", y);
    card.style.setProperty("--v2-spot-o", "1");
    spotEl.style.setProperty("--v2-spot-x", x);
    spotEl.style.setProperty("--v2-spot-y", y);
    spotEl.style.width = r.width + "px";
    spotEl.style.height = r.height + "px";
    spotEl.style.transform = "translate3d(" + r.left + "px," + r.top + "px,0)";
    if (!spot.shown) { spotEl.style.opacity = "1"; spot.shown = true; }
    return false;
  }

  /* ---------- 4. magnetic buttons ---------- */
  var MAG_SEL = ".primary-btn.big, .hero-buttons .secondary-btn, header.navbar #openAuth, .price-card .primary-btn, .support-box-actions > a, .support-box-actions > button";
  var mags = [];
  // Magnetic pull is off at the owner's request (2026-10-08): buttons react to hover
  // and press instead (v2-src/css/86-buttons.css, v2-src/js/50-press.js).
  function magEnabled() { return false; }
  if (magEnabled()) {
    var magEls = doc.querySelectorAll(MAG_SEL);
    for (var mi = 0; mi < magEls.length; mi++) {
      magEls[mi].classList.add("v2-mag");
      mags.push({ el: magEls[mi], x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, wx: 0, wy: 0 });
    }
  }
  function magFrame(dt) {
    if (!mags.length) return false;
    var on = P.inside && magEnabled(), active = false, i, m;
    var rects = [];
    for (i = 0; i < mags.length; i++) rects.push(mags[i].x.x || mags[i].y.x || on ? mags[i].el.getBoundingClientRect() : null);
    for (i = 0; i < mags.length; i++) {
      m = mags[i];
      var r = rects[i], tx = 0, ty = 0;
      if (on && r && r.width) {
        var cx = r.left + r.width / 2 - m.x.x, cy = r.top + r.height / 2 - m.y.x;
        var dx = P.x - cx, dy = P.y - cy;
        if (Math.abs(dx) < r.width / 2 + 26 && Math.abs(dy) < r.height / 2 + 22) {
          tx = clamp(dx * 0.22, -18, 18);
          ty = clamp(dy * 0.3, -12, 12);
        }
      }
      spring(m.x, tx, dt, 220, 20);
      spring(m.y, ty, dt, 220, 20);
      var moving = Math.abs(m.x.x - tx) > 0.05 || Math.abs(m.y.x - ty) > 0.05 || Math.abs(m.x.v) > 0.05 || Math.abs(m.y.v) > 0.05;
      if (!moving) { m.x.x = tx; m.y.x = ty; m.x.v = m.y.v = 0; }
      if (moving) active = true;
      var wx = Math.round(m.x.x * 100) / 100, wy = Math.round(m.y.x * 100) / 100;
      if (wx !== m.wx || wy !== m.wy) {
        m.el.style.setProperty("--v2-mag-x", wx + "px");
        m.el.style.setProperty("--v2-mag-y", wy + "px");
        m.wx = wx; m.wy = wy;
      }
    }
    return active;
  }

  /* ---------- pointer events ---------- */
  win.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || !fine() || reduced()) return;
    P.x = e.clientX; P.y = e.clientY;
    if (!P.seen) { P.seen = true; P.sx = P.x; P.sy = P.y; }
    if (!P.inside) { P.inside = true; root.classList.add("v2-pointer-in"); }
    spot.hit = spotCardFor(e.target);
    onFrame(glowFrame);
    onFrame(spotFrame);
    if (mags.length) onFrame(magFrame);
  }, { passive: true });
  function pointerOut() {
    if (!P.inside) return;
    P.inside = false;
    root.classList.remove("v2-pointer-in");
    spot.hit = null;
    onFrame(spotFrame);
    if (mags.length) onFrame(magFrame);
  }
  doc.addEventListener("mouseout", function (e) { if (!e.relatedTarget) pointerOut(); }, { passive: true });
  win.addEventListener("blur", pointerOut);
  // Cards move under a resting cursor while scrolling: re-hit-test once per frame.
  var hitQueued = false;
  function rehit() {
    hitQueued = false;
    if (!P.inside) return false;
    spot.hit = spotCardFor(doc.elementFromPoint(P.x, P.y));
    spotFrame();
    if (mags.length) onFrame(magFrame);
    return false;
  }
  win.addEventListener("scroll", function () {
    if (P.inside && !hitQueued) { hitQueued = true; onFrame(rehit); }
  }, { passive: true, capture: true });

  /* ---------- 5. smooth wheel scrolling (desktop mouse only) ----------
     Its wheel/scroll/input listeners are attached only while smooth scrolling
     is on, so phones, tablets and reduced motion pay nothing per scroll. */
  var SM = { cur: 0, target: 0, lastSet: -1, docH: 0, animating: false, on: false };
  function smoothOk() { return fine() && !reduced(); }
  function maxScroll() { return Math.max(0, root.scrollHeight - win.innerHeight); }
  function setScroll(y) {
    try { win.scrollTo({ top: y, left: win.scrollX, behavior: "instant" }); }
    catch (e) { root.style.scrollBehavior = "auto"; win.scrollTo(win.scrollX, y); root.style.scrollBehavior = ""; }
    SM.lastSet = win.scrollY;
  }
  function smStop() {
    SM.animating = false;
    SM.cur = SM.target = win.scrollY;
  }
  function scrollLocked() {
    var nav = doc.querySelector(".navbar");
    if (nav && nav.classList.contains("open") && mqMenu.matches) return true;
    if (modalOpen()) return true;
    if (body.style.overflow === "hidden" || root.style.overflow === "hidden") return true;
    var cs = getComputedStyle(root);
    if (cs.overflowY === "hidden" || getComputedStyle(body).overflowY === "hidden") return true;
    return false;
  }
  function innerCanScroll(node, dy) {
    for (var el = node && node.nodeType === 1 ? node : node && node.parentElement; el && el !== body && el !== root; el = el.parentElement) {
      if (el.tagName === "SELECT" || el.isContentEditable && el.scrollHeight > el.clientHeight) return true;
      if (el.tagName === "INPUT" && /^(number|range)$/i.test(el.type)) return true;
      var sh = el.scrollHeight, ch = el.clientHeight;
      if (sh > ch + 1) {
        var oy = getComputedStyle(el).overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "overlay") {
          if (dy > 0 ? Math.ceil(el.scrollTop + ch) < sh - 1 : el.scrollTop > 0.5) return true;
        }
      }
    }
    return false;
  }
  function smFrame(dt) {
    if (!SM.animating) return false;
    var max = maxScroll();
    SM.target = clamp(SM.target, 0, max);
    var d = SM.target - SM.cur;
    if (Math.abs(d) < 0.5) {
      SM.cur = SM.target;
      setScroll(SM.cur);
      SM.docH = root.scrollHeight;
      SM.animating = false;
      return false;
    }
    SM.cur += d * (1 - Math.exp(-dt * 9));
    setScroll(SM.cur);
    SM.docH = root.scrollHeight;
    return true;
  }
  function smWheel(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (!smoothOk() || root.classList.contains("v2-intro-on")) return;
    var dy = e.deltaY, dx = e.deltaX;
    if (!dy || Math.abs(dx) > Math.abs(dy)) return;
    // Trackpads already scroll with their own momentum; smoothing them again feels laggy.
    // Mouse wheels send whole steps of about 100px, trackpads small or fractional deltas.
    if (e.deltaMode === 0 && (Math.abs(dy) < 50 || dy % 1 !== 0)) { if (SM.animating) smStop(); return; }
    if (scrollLocked()) { if (SM.animating) smStop(); return; }
    if (innerCanScroll(e.target, dy)) { if (SM.animating) smStop(); return; }
    if (e.deltaMode === 1) dy *= 33;
    else if (e.deltaMode === 2) dy *= win.innerHeight * 0.9;
    if (!SM.animating) { SM.cur = SM.target = win.scrollY; SM.lastSet = SM.cur; SM.docH = root.scrollHeight; }
    var max = maxScroll();
    var next = clamp(SM.target + dy, 0, max);
    if (next === SM.target && !SM.animating) return; // at an edge: leave the event alone
    e.preventDefault();
    SM.target = next;
    if (!SM.animating) { SM.animating = true; onFrame(smFrame); }
  }
  function smScroll() {
    // Idle: nothing to sync (a glide re-reads scrollY when it starts).
    if (!SM.animating) return;
    var y = win.scrollY;
    if (Math.abs(y - SM.lastSet) <= 2) return;
    var h = root.scrollHeight;
    if (h !== SM.docH && Math.abs(y - SM.lastSet) < win.innerHeight * 0.5) {
      // Layout above the viewport changed (scroll anchoring): carry the glide over.
      var delta = y - SM.lastSet;
      SM.cur += delta; SM.target += delta; SM.lastSet = y; SM.docH = h;
      return;
    }
    smStop(); // keyboard, scrollbar, scrollTo, anchors, scrollIntoView: the page wins
  }
  function smInterrupt() { if (SM.animating) smStop(); }
  var SM_STOP_EVENTS = ["keydown", "pointerdown", "touchstart"];
  function syncSmooth() {
    var on = smoothOk();
    root.classList.toggle("v2-smooth", on);
    if (on === SM.on) return;
    SM.on = on;
    var add = on ? "addEventListener" : "removeEventListener";
    win[add]("wheel", smWheel, { passive: false });
    win[add]("scroll", smScroll, { passive: true });
    SM_STOP_EVENTS.forEach(function (t) { win[add](t, smInterrupt, { capture: true, passive: true }); });
    win[add]("popstate", smInterrupt);
    if (!on) SM.animating = false; // a running glide stops on its next frame
  }
  syncSmooth();
  onMq(mqFine, syncSmooth);
  onMq(mqReduce, syncSmooth);

  /* ---------- 6. split headings ---------- */
  /* Only plain text with simple inline wrappers is split: a wrapper carrying
     an id, a data-* hook or an event target would be flattened away. */
  function splittable(h) {
    var els = h.getElementsByTagName("*");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!/^(SPAN|EM|STRONG|B|I|BR)$/.test(el.tagName) || el.id) return false;
      for (var a = 0; a < el.attributes.length; a++) {
        if (el.attributes[a].name !== "class") return false;
      }
    }
    return true;
  }
  function splitHeading(h) {
    if (h.getAttribute("data-v2-split-done") || !splittable(h)) return false;
    var label = (h.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) return false;
    var frag = doc.createDocumentFragment(), n = 0;
    function walk(node, cls) {
      var kids = Array.prototype.slice.call(node.childNodes);
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.nodeType === 3) {
          var parts = k.nodeValue.split(/(\s+)/);
          for (var j = 0; j < parts.length; j++) {
            var part = parts[j];
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(" ")); continue; }
            var w = doc.createElement("span");
            w.className = "v2-w";
            var inner = doc.createElement("span");
            if (cls) inner.className = cls;
            inner.style.setProperty("--i", String(n++));
            inner.textContent = part;
            w.appendChild(inner);
            frag.appendChild(w);
          }
        } else if (k.nodeType === 1) {
          if (k.tagName === "BR") { frag.appendChild(doc.createElement("br")); continue; }
          var c = (k.getAttribute("class") || "").trim();
          walk(k, [cls, c].filter(Boolean).join(" "));
        }
      }
    }
    walk(h, "");
    h.setAttribute("aria-label", label);
    h.setAttribute("data-v2-split-done", "1");
    h.textContent = "";
    h.appendChild(frag);
    return true;
  }
  var splitEls = reduced() ? [] : Array.prototype.filter.call(doc.querySelectorAll("[data-v2-split]"), splitHeading);
  if (splitEls.length) {
    if ("IntersectionObserver" in win) {
      var splitIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("v2-in");
          splitIo.unobserve(en.target);
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0 });
      splitEls.forEach(function (h) { splitIo.observe(h); });
    } else {
      splitEls.forEach(function (h) { h.classList.add("v2-in"); });
    }
    root.classList.add("v2-split-ready");
  }

  /* ---------- 7. 3D hero (desktop only, after load + idle) ---------- */
  function heroStage() { return doc.querySelector("#home .v2-hero-stage"); }
  function want3d() {
    if (!heroStage() || !mqDesk.matches || !fine() || reduced() || saveData) return false;
    var mem = navigator.deviceMemory;
    if (typeof mem === "number" && mem < 4) return false;
    return true;
  }
  var hero3dStarted = false;
  function mount3d() {
    if (hero3dStarted || !want3d()) return;
    hero3dStarted = true;
    function go() {
      var stage = heroStage();
      if (stage && win.CNV2Hero3D) win.CNV2Hero3D.mount(stage).then(function (ok) { api.hero3d = !!ok; });
    }
    if (win.CNV2Hero3D) { go(); return; }
    var s = doc.createElement("script");
    s.src = "/v2/shield3d.js?v=20261008-2";
    s.async = true;
    s.onload = go;
    s.onerror = function () { api.hero3d = false; };
    doc.head.appendChild(s);
  }
  function schedule3d() {
    if (!want3d()) return;
    setTimeout(function () {
      var idle = win.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
      idle(function () {
        if (isPage("home")) { mount3d(); return; }
        var home = doc.getElementById("home");
        if (!home || !("MutationObserver" in win)) return;
        var mo = new MutationObserver(function () {
          if (!home.classList.contains("active-page")) return;
          mo.disconnect();
          setTimeout(mount3d, 600);
        });
        mo.observe(home, { attributes: true, attributeFilter: ["class"] });
      }, { timeout: 2500 });
    }, 1200);
  }
  if (doc.readyState === "complete") schedule3d();
  else win.addEventListener("load", schedule3d, { once: true });

  /* ---------- 8. hero scroll parallax ----------
     No JS: the giant word and the horizon glow follow the scroll position
     through CSS scroll-driven animations (70-motion.css, section 8). The old
     per-frame --v2-hero-p write restyled the whole hero subtree and repainted
     the horizon shadows on every scroll frame, and ignored reduced motion. */

  /* ---------- 9. mobile menu: scroll lock, focus, Escape, inert page ----------
     While the full-screen sheet is open, the page behind it (main, footer,
     the cookie bar under the sheet) is inert, so Tab, screen readers and
     switch access stay inside the sheet; Tab also wraps inside it. Modals
     (sign in, feedback, video, account...) sit outside <main>, so a modal
     opened from the sheet still works. Only applied at the menu breakpoint:
     .open can survive a resize to desktop, where the sheet is not shown. */
  var navbar = doc.querySelector(".navbar");
  var menuBtn = doc.getElementById("mobileMenu");
  if (navbar && menuBtn && "MutationObserver" in win) {
    var menuWasOpen = navbar.classList.contains("open");
    var inertEls = [];
    // The inert attribute is not watched by the add-on observers
    // (final-ui-fix ignores attributes; legal-upgrade filters class/hidden/data-cycle).
    var syncInert = function () {
      var want = navbar.classList.contains("open") && mqMenu.matches;
      if (want === (inertEls.length > 0)) return;
      if (want) {
        ["main", "footer", "#cnConsentBar"].forEach(function (sel) {
          var el = doc.querySelector(sel);
          if (el && !el.hasAttribute("inert") && !el.contains(navbar)) { el.setAttribute("inert", ""); inertEls.push(el); }
        });
      } else {
        inertEls.forEach(function (el) { el.removeAttribute("inert"); });
        inertEls = [];
      }
    };
    var menuFocusables = function () {
      var all = navbar.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      var out = [];
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.tabIndex < 0 || !el.getClientRects().length || getComputedStyle(el).visibility === "hidden") continue;
        out.push(el);
      }
      return out;
    };
    var syncMenu = function () {
      var open = navbar.classList.contains("open");
      if (menuBtn.getAttribute("aria-expanded") !== String(open)) menuBtn.setAttribute("aria-expanded", String(open));
      syncInert();
      if (open === menuWasOpen) return;
      menuWasOpen = open;
      root.classList.toggle("v2-menu-open", open);
      if (open) {
        if (SM.animating) smStop();
        var links = navbar.querySelectorAll(".nav-tabs .nav-link");
        for (var i = 0; i < links.length; i++) {
          if (links[i].offsetParent !== null) { try { links[i].focus({ preventScroll: true }); } catch (e) { links[i].focus(); } break; }
        }
      } else {
        var a = doc.activeElement;
        if ((!a || a === body || navbar.contains(a)) && menuBtn.offsetParent !== null) {
          try { menuBtn.focus({ preventScroll: true }); } catch (e) { menuBtn.focus(); }
        }
      }
    };
    new MutationObserver(syncMenu).observe(navbar, { attributes: true, attributeFilter: ["class"] });
    onMq(mqMenu, syncInert);
    doc.addEventListener("keydown", function (e) {
      if (!navbar.classList.contains("open") || !mqMenu.matches || modalOpen()) return;
      if (e.key === "Escape" || e.key === "Esc") { menuBtn.click(); return; }
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      // Keep Tab inside the sheet: wrap from the last control to the first and back.
      var f = menuFocusables();
      if (!f.length) return;
      var a = doc.activeElement, first = f[0], last = f[f.length - 1], to = null;
      if (!navbar.contains(a)) to = e.shiftKey ? last : first;
      else if (e.shiftKey && a === first) to = last;
      else if (!e.shiftKey && a === last) to = first;
      if (to) { e.preventDefault(); to.focus(); }
    });
    if (menuWasOpen) { root.classList.add("v2-menu-open"); syncInert(); }
  }

  /* ---------- 10. Learn: the tapped lesson card stays where it was ----------
     script.js collapses the module's open lesson when another one is tapped.
     If the open one is above, everything below it moves up while it collapses
     (0.5 s) and the tapped card slid off the top of the screen (phone: from
     400 px to -900 px), landing the reader past the start of the new lesson.
     This only scrolls; the click itself is untouched. It reads the card's
     position in the capture phase, before script.js toggles the classes, then
     scrolls by however far the card moves, every frame until the collapse is
     over (or the reader scrolls). A card whose header was under the bar or
     above the screen is brought to just below the bar. */
  var learnHold = null;
  doc.addEventListener("click", function (e) {
    var t = e.target, node = t && t.closest ? t.closest("#learn .rm-node") : null;
    if (!node) return;
    var bar = doc.querySelector("header.navbar");
    var minTop = (bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 70) + 12;
    var target = Math.max(node.getBoundingClientRect().top, minTop);
    if (learnHold) learnHold();
    var t0 = performance.now(), moved = t0, stopped = false;
    var userEvents = ["wheel", "touchstart", "keydown"];
    function stop() {
      if (stopped) return;
      stopped = true;
      learnHold = null;
      userEvents.forEach(function (n) { win.removeEventListener(n, stop, true); });
    }
    userEvents.forEach(function (n) { win.addEventListener(n, stop, { capture: true, passive: true }); });
    learnHold = stop;
    onFrame(function (dt, now) {
      if (stopped) return false;
      if (!node.isConnected || !isPage("learn")) { stop(); return false; }
      var d = node.getBoundingClientRect().top - target;
      if (Math.abs(d) >= 1) { setScroll(win.scrollY + d); moved = now; }
      if ((now - t0 > 650 && now - moved > 120) || now - t0 > 2000) { stop(); return false; }
      return true;
    });
  }, true);

  /* ---------- 11. Pricing (phone): the plan carousel opens on Pro ----------
     50-pricing.css centres Pro with scroll-initial-target, which only Chromium
     supports. In Safari (every iPhone) and Firefox the row would open on Free
     with the swipe cue pointing at nothing. Each time the row is displayed
     again (page switch: display:none resets its scroll), Pro is centred once.
     Only scrollLeft is set; no class is toggled, so the add-on observers stay
     quiet. A row already scrolled (business-team.js, the consent box) is left. */
  (function () {
    var grid = doc.querySelector("#pricing .pricing-grid-three");
    var pro = grid && grid.querySelector(".pro-price-card");
    if (!grid || !pro || !("IntersectionObserver" in win)) return;
    try { if (win.CSS && CSS.supports && CSS.supports("scroll-initial-target", "nearest")) return; } catch (e) {}
    var mqPhone = mq("(max-width: 700px)"), armed = true;
    new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      if (!en.boundingClientRect.width) { armed = true; return; } // hidden page: next showing is a fresh row
      if (!en.isIntersecting || !armed) return;
      armed = false;
      if (!mqPhone.matches || grid.scrollLeft > 1) return;
      var g = grid.getBoundingClientRect(), p = pro.getBoundingClientRect();
      var x = Math.round(p.left - g.left + grid.scrollLeft - (grid.clientWidth - p.width) / 2);
      if (x <= 0) return;
      try { grid.scrollTo({ left: x, behavior: "instant" }); } catch (err) { grid.scrollLeft = x; }
    }).observe(grid);
  })();
})();
