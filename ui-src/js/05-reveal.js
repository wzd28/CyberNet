/* CyberNet UI: scroll reveals, page-switch motion and the live-dot pulse (owner: aurora). v4.1.
   - [data-cn-reveal]: the element fades and rises in once when it scrolls into view (opacity
     and translate only; v4.1 dropped the blur). Variants: "fade", "scale", "clip" (01-base.css);
     "off" opts out.
   - [data-cn-stagger]: its children rise in one after another (70 ms apart).
   - Home: legacy .reveal is a page-load cascade (script.js adds .show to every reveal of the
     page at once), so below the hero nothing was revealed on scroll. At start-up this module
     tags the section heads, the support box and the limits note (TAG below) with
     data-cn-reveal, so they rise in as you read. Blocks with their own scroll-linked motion
     (the Live cards, the photo tiles, the console, the reel stage, the Rules sheet, the closing
     statement) are left to their partials. Legacy .show is never touched: the tag only adds a
     second, scroll-based gate on top (the block is visible once it has .is-in; the legacy
     transition has long finished by then). Owners can key one-off effects to .is-in, or opt a
     block in with data-cn-reveal in the markup.
     CSS lives in 01-base.css; the hidden state exists only under html.cn-js and only until
     .is-in, so content can never get stuck invisible. Reduced motion (and the global Pause
     motion, which CN.reduced() includes, 07-aurora.js): shown at once.
     Visibility comes from the observer's first report, never from getBoundingClientRect, so
     init forces no layout (and never wakes a content-visibility:auto section early).
   - .cn-live-dot: gets .is-on while it is on screen; the CSS runs its ring twice per visit
     (02-components.css), so the pulse is finite and never runs where nobody can see it.
   - html.cn-navigated: set on the first navigation (a [data-page] click or back/forward), so the
     page-switch animation in 80-perf.css never delays the first paint of a page.
   - Line-by-line mask reveals (v4.2, the owner's motion reference): the big Home headings listed
     in LINES slide up out of an invisible mask, one line after another, the first time they
     scroll into view; the head's eyebrow and lead fade up just after. The words are wrapped once
     at start-up (span.cn-lm > span.cn-lm-i; spaces stay plain text, so line breaks, copy and
     screen readers are unchanged). The line of each word is read from offsetTop in the
     observer's callback, when layout is fresh, and written as --cn-ln on the inner span (an
     inline style, not a class). CSS: 29-lines.css (transform and opacity only). Reduced motion
     and Pause motion: shown at once.
   Other modules can call CN.reveal(el) for markup they render later. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, root = doc.documentElement;

  function markNav() { root.classList.add("cn-navigated"); }
  doc.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.closest && t.closest("[data-page]")) markNav();
  }, true);
  window.addEventListener("popstate", markNav);

  function reveal(el) {
    if (!el || el.__cnReveal) return;
    if (el.getAttribute("data-cn-reveal") === "off") return;
    el.__cnReveal = true;
    if (el.hasAttribute("data-cn-stagger")) {
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) kids[i].style.setProperty("--cn-i", String(Math.min(i, 12)));
    }
    if (CN.reduced()) { el.classList.add("is-in", "is-done"); return; }
    // Enter when it is just inside the viewport; works for blocks taller than the screen too.
    // If the first report already finds it on screen (a tall screen, a restored scroll
    // position), it rises in right there, which reads as intended rather than as a blink.
    var stop = null, done = false;
    stop = CN.inView(el, function (vis) {
      if (!vis || done) return;
      done = true;
      el.classList.add("is-in");
      if (stop) stop();
    }, { threshold: 0.01, margin: "0px 0px -8% 0px" });
    if (done && stop) stop();
  }

  // Home: the section heads and the closing blocks become scroll reveals (see the header).
  var TAG = "#home > :is(.cn-live, .cn-threats, .cn-demo, .cn-flow) > .cn-head.reveal, " +
    "#home > .support-box.reveal, #home > .home-limits-note.reveal";
  // Headings that reveal line by line (their head's other children fade up after them).
  var LINES = "#home > :is(.cn-threats, .cn-flow, .why-choose) > .cn-head > h2";
  function tagHome() {
    var list, lines = [];
    try { list = CN.qsa(TAG); lines = CN.qsa(LINES); } catch (e) { return; } // :is() missing: keep the legacy cascade
    lines.forEach(function (h) {
      if (!splitLines(h)) return;
      var head = h.parentNode;
      head.__cnLineHead = true;
      Array.prototype.forEach.call(head.children, function (k) {
        if (k === h || k.hasAttribute("data-cn-reveal")) return;
        k.setAttribute("data-cn-reveal", "");
        k.style.setProperty("--cn-d", "260ms");
      });
    });
    list.forEach(function (el) {
      if (el.__cnLineHead || el.hasAttribute("data-cn-reveal") || el.hasAttribute("data-cn-stagger")) return;
      el.setAttribute("data-cn-reveal", "");
    });
  }

  /* Wrap each word of a heading in a mask (once). Returns the masks, or null. */
  function splitLines(h) {
    if (h.__cnLines) return h.__cnLines;
    var masks = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (k) {
        if (k.nodeType === 3) {
          var parts = k.nodeValue.split(/([ \t\n\r]+)/), frag = doc.createDocumentFragment();
          parts.forEach(function (s) {
            if (!s) return;
            if (/^[ \t\n\r]+$/.test(s)) { frag.appendChild(doc.createTextNode(s)); return; }
            var o = doc.createElement("span"), i = doc.createElement("span");
            o.className = "cn-lm"; i.className = "cn-lm-i";
            i.textContent = s;
            o.appendChild(i); frag.appendChild(o); masks.push(o);
          });
          node.replaceChild(frag, k);
        } else if (k.nodeType === 1 && k.nodeName !== "BR") walk(k);
      });
    })(h);
    if (!masks.length) return null;
    h.__cnLines = masks;
    h.classList.add("cn-lines");
    return masks;
  }
  /* Reveal a split heading line by line the first time it scrolls into view. */
  /* The line of each word, from offsetTop. Read only while the browser is idle (layout is clean
     then, so the read costs nothing): when the heading comes within a screen and a bit, and
     again after a resize. Never inside a scroll frame or an observer batch, where an earlier
     callback may have dirtied the style and the read would force a full recalc. */
  var idle = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 400 }); } : function (f) { setTimeout(f, 60); };
  function measureLines(h) {
    var masks = h.__cnLines, top = null, ln = -1;
    if (!masks || h.offsetWidth === 0) return;
    for (var i = 0; i < masks.length; i++) {
      var t = masks[i].offsetTop;
      if (top === null || t > top + 4) { top = t; ln++; }
      var v = String(Math.min(ln, 6)), inner = masks[i].firstChild;
      if (inner.__cnLn !== v) { inner.__cnLn = v; inner.style.setProperty("--cn-ln", v); }
    }
    h.__cnLnW = h.offsetWidth;
  }
  var armed = [], resizeT = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { idle(function () { armed.forEach(function (h) { if (!h.classList.contains("is-in")) measureLines(h); }); }); }, 250);
  }, { passive: true });
  function lineReveal(h) {
    var masks = h.__cnLines;
    if (!masks || h.__cnLineArmed) return;
    h.__cnLineArmed = true;
    if (CN.reduced()) { h.classList.add("is-in"); return; }
    armed.push(h);
    var prep = null, prepped = false;
    prep = CN.inView(h, function (vis) {
      if (!vis || prepped) return;
      prepped = true;
      if (prep) prep();
      idle(function () { measureLines(h); });
    }, { margin: "120% 0px" });
    if (prepped && prep) prep();
    var stop = null, done = false;
    stop = CN.inView(h, function (vis) {
      if (!vis || done) return;
      done = true;
      if (stop) stop();
      if (h.__cnLnW) { h.classList.add("is-in"); return; }
      /* not measured yet (a jump straight to it): measure in the next frame, then reveal */
      window.requestAnimationFrame(function () { measureLines(h); h.classList.add("is-in"); });
    }, { threshold: 0.01, margin: "0px 0px -8% 0px" });
    if (done && stop) stop();
  }

  function scan(ctx) { CN.qsa("[data-cn-reveal], [data-cn-stagger]", ctx).forEach(reveal); }

  // Live dots pulse only while visible. Toggling a class on enter/leave is rare (not per
  // frame), so the legacy body-wide attribute observers stay idle.
  function liveDot(dot) {
    if (dot.__cnDot) return;
    dot.__cnDot = true;
    CN.inView(dot, function (vis) {
      if (vis && CN.reduced()) return;
      dot.classList.toggle("is-on", !!vis);
    });
  }

  CN.reveal = reveal;
  CN.onReady(function () {
    tagHome();
    CN.qsa("h2.cn-lines").forEach(lineReveal);
    scan();
    CN.qsa(".cn-live-dot").forEach(liveDot);
  });
})();
