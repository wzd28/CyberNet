/* CyberNet UI: reveals, line SETs, the folio turn and page-switch motion (owner: core). v4.1,
   line reveals v4.2/v4.3, v5 presets + folio. Public API: CN.motion.reveal
   (02-motion.js delegates reveal here), CN.reveal(el) and CN.lines(el) for markup rendered later.

   PRESETS (CSS: 05-motion.css; markup may carry the same attributes)
     settle      data-cn-reveal=""        fade + rise (--cn-rise) over --cn-t-settle
     fade        data-cn-reveal="fade"    600 ms
     rule-before data-cn-rule + data-cn-reveal="trigger": the host's ::before hairline draws
                 (individual "scale" property, origin --cn-rule-o, default 0 50%)
     trigger     data-cn-reveal="trigger" .is-in only (owners key children or pseudos on it)
     stagger     data-cn-stagger          children settle --cn-st (default --cn-st-item) apart,
                 capped at 6
   opts: { delay -> --cn-d, step -> --cn-st, margin, threshold }.
   Rules: the first observer report decides. On screen then -> .is-in + .is-done at once, never
   hidden (JS-tagged elements are not even armed until that report says off screen). Reduced
   motion / Pause -> .is-in + .is-done. Entering view ({ threshold .01, margin "0px 0px -8% 0px" })
   -> .is-in. Failsafe: 2.5 s after the first visible report, and 1 s after each scroll stop,
   anything armed and on screen without .is-in gets it. When its own entrance has finished an
   element gets .is-done, so a page shown again (display: none -> block) never replays it.
   Visibility always comes from IntersectionObserver, never from getBoundingClientRect.

   LINES (React Bits SplitText, our port): [data-cn-lines] / [data-cn-lines="head"].
   Each word becomes cn-lm.cn-lm > cn-lm-i.cn-lm-i (custom element names, so no "h1 span" rule
   reaches them; spaces stay text, so wrapping, copy and screen readers are unchanged). The line
   of each word is read from offsetTop at idle and written as --cn-ln. A heading on screen at the
   first report is never split; typewriter titles are skipped; reduced = not split. "head": the
   parent's other children settle 180 ms after (lists stagger; corner labels draw their rule).
   Word stagger (#cnCore lead): +30 ms per word, capped at 8. CSS: 29-lines.css.

   ALSO
   - Auto-tags at start-up (each only if its first report says off screen): rule-before on
     .cn-edlabel (not --dot / --plain), on .cn-eyebrow without a live dot and on the support box
     label; settle on the support boxes, fade on the limits note.
   - The folio turn (flag "folio"): <cn-folio> draws a 1px cyan rule across the top during
     script.js's 300 ms page swap (data-turn="out", then "in"); data attributes, never classes
     (the legacy body observers watch class). Nothing else replays on a switch (the masthead
     replay was cut at the finish, 18 Oct: a page shows at once).
   - html.cn-navigated on the first [data-page] click or back/forward (80-perf.css page swap), and
     CN.motion.onNavigate (fired here, capture phase, before script.js swaps pages).
   - .cn-live-dot gets .is-on while on screen (its ring runs twice per visit). */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var M = CN.motion || null, doc = document, root = doc.documentElement, win = window;
  function noop() {}
  function still() { return !!(M ? M.reduced() : CN.reduced()); }
  function setVar(el, k, v) { el.style.setProperty(k, v); }

  /* ---------- navigation: html.cn-navigated, and CN.motion.onNavigate before the swap ---------- */
  var PATHS = { "quick-scan": "cybernet", "analysis-ai": "cybernetai" };
  function navTo(to) {
    root.classList.add("cn-navigated");
    var p = doc.querySelector(".page.active-page");
    if (M && to && (!p || p.id != to) && doc.getElementById(to)) M._nav(to);
  }
  doc.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-page]");
    if (b) navTo(b.getAttribute("data-page"));
  }, true);
  win.addEventListener("popstate", function () {
    var p = location.pathname.replace(/^\/+|\/+$/g, "");
    navTo(PATHS[p] || p || "home");
  });

  /* ---------- reveals ---------- */
  var IO = { threshold: .01, margin: "0px 0px -8% 0px" };
  var pend = []; /* armed and not in yet: the failsafe's list */
  function tag(el, preset, o) {
    if (!preset) return; /* markup: the attributes are there already */
    if (preset == "stagger") el.setAttribute("data-cn-stagger", "");
    else {
      if (preset == "rule-before") { el.setAttribute("data-cn-rule", ""); preset = "trigger"; }
      el.setAttribute("data-cn-reveal", preset == "settle" ? "" : preset);
    }
    if (o.delay != null) setVar(el, "--cn-d", o.delay + "ms");
    if (o.step != null) setVar(el, "--cn-st", o.step + "ms");
  }
  function show(el, done) {
    el.classList.add("is-in");
    if (done) el.classList.add("is-done");
    var i = pend.indexOf(el);
    if (i >= 0) pend.splice(i, 1);
    if (el.__cnVis) el.__cnVis();
    clearTimeout(el.__cnFs);
  }
  /* off screen at the first report: arm the hidden state, and watch (margin 0) for the failsafe */
  function arm(el) {
    if (el.hasAttribute("data-cn-stagger")) for (var i = 0, k = el.children; i < k.length; i++) setVar(k[i], "--cn-i", Math.min(i, 6));
    pend.push(el);
    el.__cnVis = CN.inView(el, function (vis) {
      el.__cnOn = vis;
      if (vis && !el.__cnFs) el.__cnFs = setTimeout(rescue, 2500, el);
    });
  }
  function rescue(el) { if (el.__cnOn && !el.classList.contains("is-in")) show(el); }
  var scrollT;
  win.addEventListener("scroll", function () {
    if (!pend.length) return;
    clearTimeout(scrollT);
    scrollT = setTimeout(function () { pend.slice().forEach(rescue); }, 1000);
  }, { passive: true });
  /* keyboard focus never lands on a control that is still hidden: an armed ancestor (a reveal or
     a stagger list) shows at once, final (finish, 18 Oct) */
  doc.addEventListener("focusin", function (e) {
    for (var n = e.target; pend.length && n && n.nodeType == 1; n = n.parentNode) if (pend.indexOf(n) >= 0) { show(n, 1); if (n.__cnReveal) n.__cnReveal(); }
  }, true);

  function revealOne(el, preset, o) {
    if (el.__cnReveal) return el.__cnReveal;
    if (el.getAttribute("data-cn-reveal") == "off") return noop;
    if (still()) { tag(el, preset, o); show(el, 1); return (el.__cnReveal = noop); }
    var first = 1, done = 0, stop = CN.inView(el, function (vis) {
      if (done) return;
      if (first) {
        first = 0;
        tag(el, preset, o);
        if (vis || still()) { done = 1; stop(); show(el, 1); } else arm(el);
      } else if (vis) { done = 1; stop(); show(el); }
    }, o.margin || o.threshold != null ? { margin: o.margin || IO.margin, threshold: o.threshold != null ? o.threshold : IO.threshold } : IO);
    return (el.__cnReveal = function () { done = 1; stop(); });
  }
  function reveal(target, preset, o) {
    var els = [];
    try { els = typeof target == "string" ? CN.qsa(target) : target.nodeType == 1 ? [target] : Array.prototype.slice.call(target); } catch (e) { /* nothing */ }
    var stops = els.filter(function (n) { return n && n.nodeType == 1; }).map(function (el) { return revealOne(el, preset || "settle", o || {}); });
    return function () { stops.forEach(function (s) { s(); }); };
  }
  /* its own entrance is over: .is-done, so a page shown again (display none -> block) never
     replays it */
  doc.addEventListener("animationend", function (e) {
    var t = e.target, p = t.parentNode;
    if (!/^cn-(rise|fade|scale)$/.test(e.animationName)) return;
    if (t.hasAttribute("data-cn-reveal")) t.classList.add("is-done");
    else if (!t.nextElementSibling && p && p.hasAttribute && p.hasAttribute("data-cn-stagger")) p.classList.add("is-done");
  });

  /* Home: section heads, the support boxes and the limits note settle as you read; blocks with
     their own motion are left to their partials (legacy .show is never touched). */
  var TAG = "#home > :is(.cn-live, .cn-threats, .cn-demo, .cn-flow) > .cn-head.reveal, .page > .support-box";
  /* headings that SET line by line (their head's other children follow) */
  /* v5 added Live, the example scan and Wow; phones keep v4.7's three (finish, 18 Oct; SPEC
     kill order, phone step 2: each split heading is a set of running transitions on a phone) */
  var LINES = "#home > :is(.cn-threats, .cn-flow, .why-choose) > .cn-head > h2",
    LINES_WIDE = ", #home > .cn-live > .cn-head > h2, #home > .cn-demo .cn-demo-copy > h2, #home > .wow-section .wow-header > h2";
  var TYPEWRITER = ":is(#cybernet, #cybernetai, #recovery) > .feature-page-header h1";
  var RULES = ".cn-edlabel:not(.cn-edlabel--dot, .cn-edlabel--plain), .cn-eyebrow, .support-box .account-eyebrow";
  function ruleHost(k) { try { return k.matches(RULES) && !k.querySelector(".cn-live-dot"); } catch (e) { return false; } }
  function typewriter(h) { try { return h.matches(TYPEWRITER); } catch (e) { return true; } }

  /* ---------- lines ---------- */
  var SKIP = /^(BR|SVG|IMG|PICTURE|VIDEO|CANVAS|MATH|SCRIPT|STYLE|TEMPLATE|TEXTAREA|INPUT|SELECT|BUTTON|CN-LM|CN-LM-I)$/;
  function splitLines(h) {
    if (h.__cnLines) return h.__cnLines;
    var masks = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (k) {
        if (k.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          k.nodeValue.split(/([ \t\n\r]+)/).forEach(function (s) {
            if (!s) return;
            if (/^[ \t\n\r]+$/.test(s)) { frag.appendChild(doc.createTextNode(s)); return; }
            var o = doc.createElement("cn-lm"), i = doc.createElement("cn-lm-i");
            o.className = "cn-lm"; i.className = "cn-lm-i";
            i.textContent = s;
            o.appendChild(i); frag.appendChild(o); masks.push(o);
          });
          node.replaceChild(frag, k);
        } else if (k.nodeType === 1 && !SKIP.test(k.nodeName.toUpperCase())) walk(k);
      });
    })(h);
    if (!masks.length) return null;
    h.__cnLines = masks;
    h.classList.add("cn-lines");
    return masks;
  }
  /* The line of each word, from offsetTop, read only while the browser is idle (layout is clean
     then): when the heading comes within a screen and a bit, and again after a resize. */
  var idle = win.requestIdleCallback ? function (f) { win.requestIdleCallback(f, { timeout: 400 }); } : function (f) { setTimeout(f, 60); };
  function measureLines(h) {
    var masks = h.__cnLines, top = null, ln = -1;
    if (!masks || h.offsetWidth === 0) return;
    for (var i = 0; i < masks.length; i++) {
      var t = masks[i].offsetTop;
      if (top === null || t > top + 4) { top = t; ln++; }
      var v = String(Math.min(ln, 6)), inner = masks[i].firstChild;
      if (inner.__cnLn !== v) { inner.__cnLn = v; setVar(inner, "--cn-ln", v); }
    }
    h.__cnLnW = h.offsetWidth;
  }
  var armedLines = [], resizeT;
  win.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(idle, 250, function () { armedLines.forEach(function (h) { if (!h.classList.contains("is-in")) measureLines(h); }); });
  }, { passive: true });
  function lineReveal(h) {
    if (!h.__cnLines || h.__cnLineArmed) return;
    h.__cnLineArmed = true;
    if (still()) { h.classList.add("is-in"); return; }
    armedLines.push(h);
    var prepped = 0, prep = CN.inView(h, function (vis) {
      if (!vis || prepped) return;
      prepped = 1;
      prep();
      idle(function () { measureLines(h); });
    }, { margin: "120% 0px" });
    var done = 0, stop = CN.inView(h, function (vis) {
      if (!vis || done) return;
      done = 1;
      stop();
      if (h.__cnLnW) h.classList.add("is-in");
      /* not measured yet (a jump straight to it, or its page just opened) */
      else CN.raf(function () { measureLines(h); h.classList.add("is-in"); });
    }, IO);
  }
  /* The first observer report decides: on screen -> left as it is; off screen or on a hidden
     page -> split now (new nodes, so the hidden state applies with no transition) and armed. */
  function linesHook(h, o) {
    if (!h || h.nodeType !== 1 || h.__cnLinesHook || h.__cnLines) return;
    h.__cnLinesHook = true;
    o = o || {};
    if (typewriter(h) || still()) return;
    var first = 1, stop = CN.inView(h, function (vis) {
      if (!first) return;
      first = 0;
      stop();
      if (vis || still() || !splitLines(h)) return;
      if (o.step) setVar(h, "--cn-lines-step", o.step + "ms");
      if (o.stagger == "word" || h.matches("#cnCore .cn-core-lead")) h.__cnLines.forEach(function (m, i) { setVar(m.firstChild, "--cn-wi", Math.min(i, 8)); });
      if (o.head || h.getAttribute("data-cn-lines") == "head") headFollows(h);
      lineReveal(h);
    });
  }
  /* "head": the heading's siblings follow 180 ms after it, each only if its own first report
     finds it off screen. Corner labels draw their rule instead (auto-tag); lists stagger. */
  function headFollows(h) {
    Array.prototype.forEach.call(h.parentNode.children, function (k) {
      if (k == h || k.__cnReveal || k.hasAttribute("data-cn-reveal") || k.hasAttribute("data-cn-stagger") || k.hasAttribute("data-cn-lines") || ruleHost(k) || /^(SCRIPT|STYLE|TEMPLATE|CANVAS)$/.test(k.nodeName)) return;
      revealOne(k, /^(OL|UL)$/.test(k.nodeName) ? "stagger" : "settle", { delay: 180 });
    });
  }
  /* ---------- the folio turn ---------- */
  var folio = null, turnT;
  function endTurn() { if (folio) folio.removeAttribute("data-turn"); }
  function onNav() {
    if (!folio || still()) return;
    folio.setAttribute("data-turn", "out");
    clearTimeout(turnT);
    turnT = setTimeout(endTurn, 1200); /* no page change came */
  }
  function onEnter() {
    if (!folio || folio.getAttribute("data-turn") != "out") return;
    clearTimeout(turnT);
    folio.setAttribute("data-turn", "in");
    turnT = setTimeout(endTurn, 320);
  }

  CN.reveal = function (el) { if (el) revealOne(el, null, {}); };
  CN.lines = function (el) {
    if (el) (el.hasAttribute && el.hasAttribute("data-cn-lines") ? [el] : CN.qsa("[data-cn-lines]", el)).forEach(function (h) { linesHook(h); });
  };
  if (M) {
    M._r = reveal;
    M.onNavigate(onNav);
    CN.onPage(onEnter);
  }

  CN.onReady(function () {
    try {
      CN.qsa(LINES + (CN.finePointer() ? LINES_WIDE : "")).forEach(function (h) { h.parentNode.__cnLineHead = true; linesHook(h, { head: 1 }); });
      CN.qsa(TAG).forEach(function (el) { if (!el.__cnLineHead) revealOne(el, "settle", {}); });
      CN.qsa("#home > .home-limits-note").forEach(function (el) { revealOne(el, "fade", {}); });
      CN.qsa(RULES).forEach(function (el) { if (ruleHost(el)) revealOne(el, "rule-before", {}); });
    } catch (e) { /* :is() / :not() lists missing: keep the legacy cascade */ }
    CN.qsa("[data-cn-reveal], [data-cn-stagger]").forEach(function (el) { revealOne(el, null, {}); });
    /* live dots pulse only while on screen */
    CN.qsa(".cn-live-dot").forEach(function (dot) {
      CN.inView(dot, function (vis) { if (!vis || !still()) dot.classList.toggle("is-on", !!vis); });
    });
    CN.qsa("[data-cn-lines]").forEach(function (h) { linesHook(h); });
    if (M && M.feature("folio")) {
      folio = doc.createElement("cn-folio");
      folio.setAttribute("aria-hidden", "true");
      doc.body.appendChild(folio);
    }
  });
})();
