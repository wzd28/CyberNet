/* Home hero scan box (#cnScanBox) and the headline sweep.
   a) Hand-off: "Start Scanning" (or Enter) with text opens Quick Scan, picks
      the Text or Link tab, fills the field and presses the existing Analyze
      button, exactly as a visitor would. Guests get the normal sign-up prompt.
   b) Try chips (.cn-chip[data-cn-try]): run a real Quick Scan on an example
      (a scam text, a scam link, or the example QR image). The addresses use
      the reserved .invalid domain, so they can never open a real website.
   c) The textarea grows with its text, from two rows up to five.
   d) Placeholder typer: types and deletes the examples in
      data-cn-placeholders. It stops (and shows the static placeholder) while
      the box is focused, filled, off-screen, the tab is hidden, the phone menu
      sheet covers the page, or motion is reduced. v4.7: it holds its text while
      the page scrolls (and goes on 400 ms after), and writes two characters
      per step when typing and four when deleting (the same speed, about half
      the placeholder writes: each one restyles the field).
   e) The one cyan sweep across "seconds", 600ms after load, once (1.6 s, 20-hero.css). On the
      first Home view of a session (html.cn-intro, set by the head snippet in index.html) the
      v5 Exposure plays it from CSS at 760 ms instead, so it is not started here.
   h) v5 Exposure (20-hero.css): html.cn-intro is removed 2.6 s after start (when the page is
      still) or at the first page switch, whichever comes first. Hidden SPA pages restart their
      CSS animations when shown again, so a return to Home never replays it.
   f) An optional Pause button (.cn-stage-pause) stops the hero's motion.
   g) On Home, the skip link (.cn-skip) lands in the scan box; on every other
      page it keeps its normal jump to <main id="cnMain">.
   Nothing here wraps or replaces a legacy function; it only clicks existing
   buttons and fills existing inputs. */
(function () {
  "use strict";
  var win = window, doc = document, CN = win.CN;
  if (!CN) return;

  var EXAMPLES = {
    text: "Your parcel is on hold. Pay the $1.99 redelivery fee today to avoid return: parcel-redeliver-help.invalid/pay",
    link: "https://secure-acct-verify.invalid/login",
    qr: "/ui/example-qr.png"
  };
  var TYPE_MS = 70, TYPE_N = 2, HOLD_MS = 1600, DELETE_MS = 40, DELETE_N = 4, GAP_MS = 380, FIRST_MS = 1400, RESUME_MS = 1200;
  var SCROLL_HOLD_MS = 400;
  var URL_RE = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?::\d{2,5})?(?:[\/?#]\S*)?$/i;

  function byId(id) { return doc.getElementById(id); }
  function isLink(text) { return !/\s/.test(text) && URL_RE.test(text); }

  /* ---- Quick Scan bridge (clicks and fills only) ---- */
  function selectTab(name) {
    var tab = doc.querySelector('.detect-tab[data-tab="' + name + '"]');
    if (tab && !tab.classList.contains("active")) tab.click();
  }
  function fill(field, value) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  /* Run fn once Quick Scan is the active page and its swap has settled
     (script.js: 300 ms leave, then the page swap and a reveal pass). */
  function whenQuickScan(fn) {
    var t0 = CN.now();
    (function poll() {
      var page = byId("cybernet");
      var waited = CN.now() - t0;
      if (page && page.classList.contains("active-page") && waited >= 380) { fn(); return; }
      if (waited > 4000) return;
      setTimeout(poll, 60);
    })();
  }
  function scanText(text, kind) {
    var link = kind ? kind === "link" : isLink(text);
    selectTab(link ? "link" : "text");
    var field = byId(link ? "cyberLinkInput" : "cyberTextInput");
    var btn = byId(link ? "cyberLinkBtn" : "cyberTextBtn");
    if (!field) return;
    fill(field, text);
    if (btn) setTimeout(function () { if (!btn.disabled) btn.click(); }, 180);
  }
  function scanImage(blobPromise) {
    selectTab("image");
    var field = byId("cyberImageInput");
    if (!field || !blobPromise) return;
    blobPromise.then(function (blob) {
      if (!blob) return;
      try {
        var dt = new DataTransfer();
        dt.items.add(new File([blob], "example-scam-qr.png", { type: blob.type || "image/png" }));
        field.files = dt.files;
      } catch (e) { return; }
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  function openQuickScan(fallbackBtn) {
    var nav = doc.querySelector('.nav-tabs .nav-link[data-page="cybernet"]');
    if (nav) nav.click(); else if (fallbackBtn) fallbackBtn.click();
  }

  var root = doc.documentElement, intro = root.classList.contains("cn-intro");

  CN.onReady(function () {
    var M = CN.motion;
    /* ---- h) Exposure ends ---- */
    if (intro) {
      var endIntro = function () { root.classList.remove("cn-intro"); };
      setTimeout(function () { CN.whenStill(endIntro); }, 2600);
      if (M) M.onNavigate(endIntro);
    }
    var box = byId("cnScanBox"), input = byId("cnScanInput");
    if (!box || !input) return;
    var startBtn = box.querySelector('.hero-buttons [data-page="cybernet"]');
    var busy = false, handing = false, motionPaused = false;

    /* ---- c) auto-grow, two to five rows ---- */
    function resize() {
      input.style.height = "";
      if (!input.value) { input.style.overflowY = ""; return; }
      var cs = win.getComputedStyle(input);
      var max = parseFloat(cs.maxHeight);
      var need = input.scrollHeight + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      if (need <= input.offsetHeight) return;
      if (!isFinite(max) || max <= 0) max = need;
      input.style.height = Math.min(need, max) + "px";
      input.style.overflowY = need > max ? "auto" : "";
    }
    input.addEventListener("input", resize);
    win.addEventListener("resize", function () { if (input.value) resize(); }, { passive: true });

    /* ---- a) Enter submits (Shift+Enter keeps a new line) ---- */
    if (!input.hasAttribute("enterkeyhint")) input.setAttribute("enterkeyhint", "go");
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.altKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (!input.value.trim() || !startBtn) return;
      startBtn.click();
    });
    if (startBtn) {
      startBtn.addEventListener("click", function () {
        var text = (input.value || "").trim();
        if (!text || handing || busy) return;
        handing = true;
        whenQuickScan(function () { handing = false; scanText(text); });
        setTimeout(function () { handing = false; }, 4200);
      });
    }

    /* ---- g) skip link: on Home it goes straight to the scan box ---- */
    var skip = doc.querySelector(".cn-skip");
    if (skip) {
      skip.addEventListener("click", function (e) {
        var home = byId("home");
        if (!home || !home.classList.contains("active-page")) return;
        e.preventDefault();
        try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); }
        input.scrollIntoView({ block: "center", behavior: CN.reduced() ? "auto" : "smooth" });
      });
    }

    /* ---- b) Try chips ---- */
    box.addEventListener("click", function (e) {
      var chip = e.target && e.target.closest ? e.target.closest(".cn-chip[data-cn-try]") : null;
      if (!chip || busy) return;
      var kind = chip.getAttribute("data-cn-try");
      if (!EXAMPLES.hasOwnProperty(kind)) return;
      busy = true;
      var blob = null;
      if (kind === "qr") {
        blob = win.fetch ? fetch(EXAMPLES.qr, { credentials: "same-origin" })
          .then(function (r) { return r.ok ? r.blob() : null; })
          .catch(function () { return null; }) : null;
      } else {
        typer.halt();
        input.value = EXAMPLES[kind];
        resize();
      }
      openQuickScan(startBtn);
      whenQuickScan(function () {
        busy = false;
        if (kind === "qr") scanImage(blob); else scanText(EXAMPLES[kind], kind);
      });
      setTimeout(function () { busy = false; }, 4200);
    });

    /* ---- d) placeholder typer ---- */
    var typer = (function () {
      var phrases = (input.getAttribute("data-cn-placeholders") || "").split("|")
        .map(function (s) { return s.trim(); }).filter(Boolean);
      var base = input.getAttribute("placeholder") || "";
      var shown = base, idx = 0, mode = "hold", timer = 0;
      var started = false, visible = false, focused = false, scrolledAt = -1e9;

      function allowed() {
        return started && visible && !focused && !motionPaused && doc.activeElement !== input && !doc.hidden &&
          !CN.covered() && !input.value && !CN.reduced() && phrases.length > 0;
      }
      function show(s) { shown = s; input.setAttribute("placeholder", s); }
      function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
      function halt() {
        clearTimeout(timer); timer = 0;
        if (shown !== base) show(base);
        mode = "hold";
      }
      function tick() {
        timer = 0;
        if (!allowed()) { halt(); return; }
        var since = CN.now() - scrolledAt;
        if (since < SCROLL_HOLD_MS) { schedule(SCROLL_HOLD_MS - since + 16); return; }   /* hold while scrolling */
        if (mode === "hold") { mode = "erase"; schedule(DELETE_MS); return; }
        if (mode === "erase") {
          if (shown.length) { show(shown.slice(0, Math.max(0, shown.length - DELETE_N))); schedule(DELETE_MS); }
          else { mode = "type"; schedule(GAP_MS); }
          return;
        }
        var target = phrases[idx];
        if (shown.length < target.length) { show(target.slice(0, shown.length + TYPE_N)); schedule(TYPE_MS); }
        else { idx = (idx + 1) % phrases.length; mode = "hold"; schedule(HOLD_MS); }
      }
      function kick(delay) {
        if (!allowed() || timer) return;
        mode = "hold";
        schedule(delay);
      }
      function sync() { if (allowed()) kick(RESUME_MS); else halt(); }

      if (phrases.length && !CN.reduced()) {
        input.addEventListener("focus", function () { focused = true; halt(); });
        input.addEventListener("blur", function () { focused = false; sync(); });
        input.addEventListener("input", function () { if (input.value) halt(); });
        doc.addEventListener("visibilitychange", sync);
        CN.onCover(sync);
        CN.inView(box, function (vis) { visible = vis; sync(); });
        win.addEventListener("scroll", function () { scrolledAt = CN.now(); }, { passive: true });
        CN.afterLoad(function () {
          started = true;
          focused = doc.activeElement === input;
          kick(FIRST_MS);
        });
      }
      return { halt: halt, sync: sync };
    })();

    /* ---- f) pause the hero's motion (.cn-stage-pause, aria-pressed) ----
       Stops the signal field (10-shader.js listens for "cn-hero-motion" on the
       stage) and the placeholder typer; .is-paused on the stage is the CSS hook. */
    var stage = box.closest ? box.closest(".cn-stage") : null;
    var pauseBtn = stage ? stage.querySelector(".cn-stage-pause") : null;

    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        motionPaused = !motionPaused;
        pauseBtn.setAttribute("aria-pressed", motionPaused ? "true" : "false");
        stage.classList.toggle("is-paused", motionPaused);
        try { stage.dispatchEvent(new CustomEvent("cn-hero-motion", { detail: { paused: motionPaused } })); } catch (e) { /* old browsers: CSS still pauses */ }
        if (motionPaused) typer.halt(); else typer.sync();
      });
    }

    /* ---- e) the headline sweep, once ---- */
    /* Deep links (/pricing ...) load with Home active but hidden (html.cn-deep)
       and then switch away, so the sweep waits until Home is really shown. */
    var word = doc.querySelector("#heroSection .hero-title .cn-sweep");
    if (word && !CN.reduced() && !intro) {
      var home = byId("home"), loaded = doc.readyState === "complete", played = false, armed = false;
      var homeShown = function () {
        return !!home && home.classList.contains("active-page") && !home.classList.contains("leaving") &&
          !root.classList.contains("cn-deep");
      };
      var play = function () {
        if (CN.reduced() || motionPaused) return;
        if (!homeShown()) { played = false; return; }
        var clear = function () { word.classList.remove("is-playing"); };
        word.addEventListener("animationend", clear, { once: true });
        setTimeout(clear, 3400);
        word.classList.add("is-playing");
      };
      var arm = function () {
        if (played || armed || !loaded) return;
        armed = true;
        CN.once(word, function () {
          armed = false;
          if (!homeShown()) return;
          played = true;
          setTimeout(play, 600);
        }, { threshold: .5 });
      };
      if (!loaded) win.addEventListener("load", function () { loaded = true; arm(); }, { once: true });
      CN.onPage(function (id) { if (id === "home") arm(); });
    }
  });
})();
