/* Typewriter titles: when Quick Scan, Analysis AI or Recovery is opened (first load of
   /quick-scan, /analysis-ai, /recovery, or any page switch), its H1 types itself out at
   28 ms per character with a caret in the page's identity colour (--cn-id: cyan, iris or
   mint; see 32-typewriter.css) that blinks and fades about 1.2 s after the last
   character.

   The H1 is never rewritten. Its real text stays in the DOM, in the accessibility tree and
   in flow (so the final width and height are reserved and nothing shifts). The script
   measures where each real character is drawn (Range rects, so kerning, wrapping and
   balance are exactly the real title's) and reveals the title with a clip-path made of
   one rectangle per line, growing one character per step. The caret is the H1's ::after,
   placed with custom properties. Per step it writes only inline style (clip-path and
   three custom properties), which the legacy MutationObservers do not watch; the class
   is toggled once at the start and once at the end.
   Reduced motion: nothing plays; the title is simply there. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN || !document.createRange) return;

  var PAGES = ["cybernet", "cybernetai", "recovery"];
  var STEP = 28;    /* ms per character (owner request) */
  var LEAD = 160;   /* pages fade in over 500 ms; start once the title is readable */
  var HOLD = 1200;  /* caret blinks, then fades (cn-tw-caret in 32-typewriter.css) */
  var SPACE = /\s/;
  var cur = null;   /* { h, t0, shown, total, done, end } while a title is typing */

  function titleOf(id) { return CN.qs("#" + id + " > .feature-page-header h1"); }
  function r1(v) { return Math.round(v * 2) / 2; }

  /* One entry per visible character (or null for a word gap, which still takes a step).
     Boxes are in the H1's own border-box pixels, corrected for any transform scale. */
  function measure(h) {
    var hr = h.getBoundingClientRect();
    if (!hr.width || !h.offsetWidth) return null;
    var sx = hr.width / h.offsetWidth, sy = hr.height / (h.offsetHeight || 1);
    var walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT, null, false);
    var range = document.createRange();
    var steps = [], lines = [], gap = false, node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue, i = 0;
      while (i < text.length) {
        var c = text.charCodeAt(i), len = (c >= 0xd800 && c <= 0xdbff) ? 2 : 1;
        var ch = text.substr(i, len);
        if (SPACE.test(ch)) {
          if (steps.length && !gap) { steps.push(null); gap = true; }
          i += len; continue;
        }
        range.setStart(node, i); range.setEnd(node, i + len); i += len;
        var r = range.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        var b = { l: (r.left - hr.left) / sx, r: (r.right - hr.left) / sx, t: (r.top - hr.top) / sy, b: (r.bottom - hr.top) / sy };
        var line = lines[lines.length - 1];
        if (!line || b.t > line.t + (line.b - line.t) * .5) {
          line = { l: b.l, r: b.r, t: b.t, b: b.b, text: "" };
          lines.push(line);
        } else {
          line.l = Math.min(line.l, b.l); line.r = Math.max(line.r, b.r);
          line.t = Math.min(line.t, b.t); line.b = Math.max(line.b, b.b);
        }
        line.text += ch;
        b.line = lines.length - 1;
        steps.push(b);
        gap = false;
      }
    }
    if (steps.length && steps[steps.length - 1] === null) steps.pop();
    var cs = getComputedStyle(h), em = parseFloat(cs.fontSize) || 32;
    splitLines(lines, cs, em);
    return {
      steps: steps, lines: lines,
      rtl: cs.direction === "rtl",
      em: em,
      bx: h.clientLeft || 0, by: h.clientTop || 0
    };
  }

  /* Tight headings make one line's box overlap the next line's ascenders. Give every line
     its own band (.top/.bot): split each pair halfway between the upper line's lowest ink
     and the lower line's highest ink, from the font's real metrics (canvas measureText). */
  var ctx = null;
  function splitLines(lines, cs, em) {
    var metrics = null;
    try {
      ctx = ctx || document.createElement("canvas").getContext("2d");
      ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      metrics = lines.map(function (L) { return ctx.measureText(L.text); });
    } catch (e) { metrics = null; }
    lines.forEach(function (L, i) {
      var m = metrics && metrics[i], fa = m && m.fontBoundingBoxAscent, fd = m && m.fontBoundingBoxDescent;
      var h = L.b - L.t;
      if (fa > 0 && fd >= 0) {
        L.base = L.t + h * fa / (fa + fd);
        L.inkTop = L.base - (m.actualBoundingBoxAscent || fa);
        L.inkBot = L.base + (m.actualBoundingBoxDescent || 0);
      } else {
        L.base = L.t + h * .78;
        L.inkTop = L.t + h * .1;
        L.inkBot = L.base + h * .16;
      }
    });
    lines.forEach(function (L, i) {
      var prev = lines[i - 1], next = lines[i + 1];
      L.top = prev ? prev.bot : Math.min(L.t, L.inkTop) - .12 * em;
      L.bot = next ? (L.inkBot + next.inkTop) / 2 : Math.max(L.b, L.inkBot) + .12 * em;
    });
  }

  /* Reveal the first `shown` steps: whole lines before the typing line, the typing line up
     to the newest character, and the caret just after it. */
  function render(s) {
    var m = measure(s.h);
    if (!m || !m.lines.length) return;
    var last = null;
    for (var k = Math.min(s.shown, m.steps.length) - 1; k >= 0 && !last; k--) last = m.steps[k];
    var pad = .12 * m.em, cw = Math.max(2, .05 * m.em), gapX = .05 * m.em;
    var li = last ? last.line : 0, line = m.lines[li], d = "";
    for (var i = 0; i < li; i++) {
      var L = m.lines[i];
      d += "M" + r1(L.l - pad) + " " + r1(L.top) + "H" + r1(L.r + pad) + "V" + r1(L.bot) + "H" + r1(L.l - pad) + "Z";
    }
    var cx;
    if (last) {
      var from = m.rtl ? last.l : line.l - pad, to = m.rtl ? line.r + pad : last.r;
      d += "M" + r1(from) + " " + r1(line.top) + "H" + r1(to) + "V" + r1(line.bot) + "H" + r1(from) + "Z";
      cx = m.rtl ? last.l - gapX - cw : last.r + gapX;
    } else {
      cx = m.rtl ? line.r + gapX : line.l - gapX - cw;
    }
    var cy = line.base - .8 * m.em, ch = .94 * m.em;
    d += "M" + r1(cx - 1) + " " + r1(cy - 1) + "H" + r1(cx + cw + 1) + "V" + r1(cy + ch + 1) + "H" + r1(cx - 1) + "Z";
    var st = s.h.style;
    st.setProperty("--cn-tw-x", r1(cx - m.bx) + "px");
    st.setProperty("--cn-tw-y", r1(cy - m.by) + "px");
    st.setProperty("--cn-tw-w", r1(cw) + "px");
    st.setProperty("--cn-tw-h", r1(ch) + "px");
    if (!s.done) st.clipPath = "path('" + d + "')";
    s.total = m.steps.length;
  }

  function clear(h) {
    if (!h) return;
    h.classList.remove("cn-tw-on", "cn-tw-done");
    ["clip-path", "--cn-tw-x", "--cn-tw-y", "--cn-tw-w", "--cn-tw-h"].forEach(function (p) { h.style.removeProperty(p); });
  }

  var ticker = CN.loop(function (t) {
    var s = cur;
    if (!s) { ticker.stop(); return; }
    var shown = Math.max(0, Math.floor((t - s.t0 - LEAD) / STEP) + 1);
    if (shown !== s.shown) { s.shown = shown; render(s); }
    if (!s.done && s.total && s.shown >= s.total) {
      /* Fully typed: drop the clip, let the caret blink and fade, then tidy up. */
      s.done = true;
      s.h.style.removeProperty("clip-path");
      s.h.classList.add("cn-tw-done");
      s.end = t + HOLD + 60;
    }
    if (s.done && t >= s.end) stop();
  });

  function stop() {
    if (!cur) return;
    clear(cur.h);
    cur = null;
    ticker.stop();
  }

  function play(h) {
    stop();
    if (!h || CN.reduced()) return;
    var probe = measure(h);
    if (!probe || !probe.steps.length) return;
    cur = { h: h, t0: CN.now(), shown: -1, total: probe.steps.length, done: false, end: 0 };
    h.classList.add("cn-tw-on");
    render(cur);
    ticker.start();
  }

  CN.onPage(function (id) {
    if (cur && (!id || cur.h !== titleOf(id))) stop();
    if (PAGES.indexOf(id) >= 0) play(titleOf(id));
  });
})();
