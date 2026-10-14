/* v2 HOME (#home): hero paste box hand-off to Quick Scan, the example scan
   (#v2Watch), the dotted globe (#v2Globe) and the $442B count-up.
   Self-contained IIFE. It only reads the page and writes inline styles /
   custom properties / canvas pixels; no existing handler is replaced.
   All loops run only while their section is on screen (IntersectionObserver,
   which also reports "not intersecting" while #home is not the active page). */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var home = doc.getElementById("home");
  if (!home || !root.classList.contains("v2")) return;

  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(mqReduce && mqReduce.matches); }
  var hasIO = "IntersectionObserver" in window;
  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  function clamp(v, a, b) { if (a === undefined) { a = 0; b = 1; } return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(p, a, b) { return clamp((p - a) / (b - a)); }
  var E = {
    out3: function (t) { return 1 - Math.pow(1 - t, 3); },
    io3: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    back: function (t) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };
  function homeActive() { return home.classList.contains("active-page"); }
  function dprOf() { return Math.min(window.devicePixelRatio || 1, 2); }

  /* Write a style value only when it changed (keeps the DOM quiet). */
  function setS(el, prop, val) {
    if (!el) return;
    var c = el._v2c || (el._v2c = {});
    if (c[prop] === val) return;
    c[prop] = val;
    if (prop.charAt(0) === "-") el.style.setProperty(prop, val); else el.style[prop] = val;
  }
  /* Edit the existing text node in place (a characterData mutation) rather
     than replacing it (a childList mutation): the add-on body observers in
     cybernet-final-ui-fix.js / cybernet-legal-upgrade.js wake on childList
     changes, and the count-ups write a new number every frame. */
  function setText(el, val) {
    if (!el) return;
    val = String(val);
    if (el._v2t === val) return;
    el._v2t = val;
    var t = el.firstChild;
    if (t && t.nodeType === 3 && !t.nextSibling) { if (t.data !== val) t.data = val; }
    else if (el.textContent !== val) el.textContent = val;
  }

  /* Viewport width without the scrollbar, for the full-bleed hero. Read only
     from ResizeObserver (after layout), never synchronously at start-up; the
     CSS fallback var(--v2-home-vw,100vw) covers the first paint. */
  (function trackViewport() {
    var last = -1;
    function apply(w) {
      if (!w || w === last) return;
      last = w;
      /* no classic scrollbar (phones, overlay scrollbars): 100vw is already
         right, so skip the write (it restyles all of #home) */
      if (!home.style.getPropertyValue("--v2-home-vw") && Math.abs(w - (window.innerWidth || w)) < 0.5) return;
      home.style.setProperty("--v2-home-vw", w + "px");
    }
    if ("ResizeObserver" in window) {
      try {
        new ResizeObserver(function (entries) {
          var e = entries[entries.length - 1], b = e.contentBoxSize;
          b = b && (b[0] || b);
          apply((b && b.inlineSize) || e.contentRect.width);
        }).observe(root);
        return;
      } catch (err) { /* fall through to the resize event */ }
    }
    function read() { apply(root.clientWidth || window.innerWidth); }
    requestAnimationFrame(read);
    window.addEventListener("resize", read, { passive: true });
  })();

  /* Run once when the browser is idle (one-off, cheap work only). */
  function idle(fn, timeout) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: timeout || 2500 });
    else setTimeout(fn, 60);
  }

  /* Observe an element; cb(isVisible, entry). Falls back to "always visible". */
  function watchVisible(el, cb, margin) {
    if (!el) return;
    if (!hasIO) { cb(true, null); return; }
    var io = new IntersectionObserver(function (entries) {
      var e = entries[entries.length - 1];
      cb(e.isIntersecting, e);
    }, { rootMargin: margin || "0px", threshold: 0 });
    io.observe(el);
  }
  /* The first frame of a below-the-fold section is drawn when it comes
     within one viewport (not at load), so it never pops in blank. */
  var NEAR = "100% 0px";

  /* ======================================================================
     a) Hero paste box
     ====================================================================== */
  (function pasteBox() {
    var box = doc.getElementById("v2ScanBox");
    var input = doc.getElementById("v2ScanInput");
    if (!box || !input) return;
    var startBtn = box.querySelector('[data-page="cybernet"]');
    var EX = {
      parcel: "Your parcel is on hold. Pay the $1.99 redelivery fee today to avoid return: parcel-redeliver-help.com",
      bank: "ALERT: Your bank account is locked. Verify now at secure-acct-verify.help or it will be closed in 2 hours.",
      normal: "Meeting moved to 3pm, see you in room 4. Sam"
    };
    var typing = null;

    function stopTyping(finish) {
      if (!typing) return;
      if (typing.raf) cancelAnimationFrame(typing.raf);
      if (finish) input.value = typing.text;
      typing = null;
    }

    function typeText(text) {
      stopTyping(false);
      if (reduced()) { input.value = text; return; }
      var t = { text: text, t0: now(), n: -1, raf: 0 };
      typing = t;
      input.value = "";
      function step() {
        if (typing !== t) return;
        var n = Math.min(text.length, Math.floor((now() - t.t0) / 1000 * 85));
        if (n !== t.n) { t.n = n; input.value = text.slice(0, n); }
        if (n >= text.length) { typing = null; return; }
        t.raf = requestAnimationFrame(step);
      }
      t.raf = requestAnimationFrame(step);
    }

    var chips = box.querySelectorAll(".v2-chip[data-v2-example]");
    Array.prototype.forEach.call(chips, function (chip) {
      chip.addEventListener("click", function () {
        var text = EX[chip.getAttribute("data-v2-example")];
        if (text) typeText(text);
      });
    });

    /* A real keystroke or paste cancels the typing effect. */
    input.addEventListener("input", function (e) { if (e.isTrusted) stopTyping(false); });

    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing || e.keyCode === 229) return;
      if (!startBtn) return;
      e.preventDefault();
      startBtn.click();
    });

    var URL_RE = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?::\d{2,5})?(?:[\/?#]\S*)?$/i;
    function isLink(text) { return !/\s/.test(text) && URL_RE.test(text); }

    function fillQuickScan(text) {
      var link = isLink(text);
      var field = doc.getElementById(link ? "cyberLinkInput" : "cyberTextInput");
      if (!field) return;
      var tab = doc.querySelector('.detect-tab[data-tab="' + (link ? "link" : "text") + '"]');
      if (tab && !tab.classList.contains("active")) tab.click();
      field.value = text;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      var btn = doc.getElementById(link ? "cyberLinkBtn" : "cyberTextBtn");
      if (btn) setTimeout(function () { if (!btn.disabled) btn.click(); }, 180);
    }

    /* Wait for the existing page switch (300 ms leave + swap) to land on Quick Scan. */
    function handOff(text) {
      var t0 = now();
      (function poll() {
        var page = doc.getElementById("cybernet");
        var waited = now() - t0;
        if (page && page.classList.contains("active-page") && waited >= 420) { fillQuickScan(text); return; }
        if (waited > 3000) return;
        setTimeout(poll, 60);
      })();
    }

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        if (typing) stopTyping(true);
        var text = (input.value || "").trim();
        if (text) handOff(text);
      });
    }
  })();

  /* ======================================================================
     b) Example scan (#v2Watch)
     ====================================================================== */
  (function exampleScan() {
    var watch = doc.getElementById("v2Watch");
    if (!watch) return;
    var stage = watch.querySelector(".v2-watch-stage");
    var cc = doc.getElementById("v2Cc");
    var bubble = doc.getElementById("v2Bubble");
    var kvRows = watch.querySelectorAll("#v2Kv > div");
    var steps = watch.querySelectorAll(".v2-step");
    var gVal = doc.getElementById("v2GaugeVal");
    var gKnob = doc.getElementById("v2GaugeKnob");
    var gNum = doc.getElementById("v2GaugeNum");
    var stamp = doc.getElementById("v2Stamp");
    var sigLis = watch.querySelectorAll("#v2Sig li");
    var bar = doc.getElementById("v2CcBar");
    var statusText = doc.getElementById("v2CcStatusText");
    var foot = doc.getElementById("v2CcFoot");
    var map = doc.getElementById("v2CcMap");
    var mctx = map && map.getContext ? map.getContext("2d") : null;
    var mqPin = window.matchMedia ? window.matchMedia("(min-width: 901px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)") : null;

    /* Build the typed bubble once: an sr-only copy + aria-hidden character spans. */
    var chars = [], marks = [], caret = null, msgLen = 0;
    (function buildBubble() {
      if (!bubble) return;
      var raw = bubble.getAttribute("data-v2-msg");
      if (!raw) return;
      var parts = raw.split("|");
      var plain = parts.join("");
      var frag = doc.createDocumentFragment();
      var sr = doc.createElement("span");
      sr.className = "v2-sr";
      sr.textContent = plain;
      frag.appendChild(sr);
      var vis = doc.createElement("span");
      vis.setAttribute("aria-hidden", "true");
      var idx = 0;
      parts.forEach(function (part, i) {
        if (!part) return;
        var host = vis;
        if (i % 2 === 1) {
          host = doc.createElement("span");
          host.className = "v2-mark" + (/^[^\s]+\.[a-z]{2,}$/i.test(part) ? " v2-lnk" : "");
          vis.appendChild(host);
          marks.push(host);
        }
        for (var k = 0; k < part.length; k++) {
          var s = doc.createElement("span");
          s.className = "v2-ch";
          s.textContent = part.charAt(k);
          host.appendChild(s);
          chars.push(s);
          idx++;
        }
      });
      msgLen = idx;
      frag.appendChild(vis);
      caret = doc.createElement("i");
      caret.className = "v2-caret";
      caret.setAttribute("aria-hidden", "true");
      frag.appendChild(caret);
      bubble.textContent = "";
      bubble.appendChild(frag);
    })();

    var NODES = [
      { id: "Text", x: 0.1, y: 0.55 }, { id: "Pressure", x: 0.38, y: 0.25 }, { id: "Payment", x: 0.38, y: 0.55 }, { id: "Link", x: 0.38, y: 0.85 },
      { id: "Rules", x: 0.66, y: 0.38 }, { id: "AI", x: 0.66, y: 0.74 }, { id: "Verdict", x: 0.9, y: 0.55 }
    ];
    var EDGES = [[0, 1, 0.28], [0, 2, 0.3], [0, 3, 0.32], [1, 4, 0.44], [2, 4, 0.46], [3, 4, 0.48], [1, 5, 0.5], [2, 5, 0.52], [3, 5, 0.54], [4, 6, 0.64], [5, 6, 0.66]];
    var STAGE_T = ["Reading", "Checking the link", "Rules + AI", "Done"];
    var BOUNDS = [[0, 0.2], [0.2, 0.42], [0.42, 0.64], [0.64, 0.86]];
    function stageOf(p) { return p < 0.2 ? 0 : p < 0.42 ? 1 : p < 0.64 ? 2 : 3; }

    var lastP = -1, lastN = -1, lastNum = -1, lastStage = -1, lastDone = null, lastCaretOn = null;

    /* Typed characters: only the spans whose state changes are touched (one
       per typed character), instead of one property on the bubble that
       restyles every span. All start visible to match the final-state markup.
       (Inline style is not watched by the add-on MutationObservers.) */
    var shownN = msgLen;
    function showChars(n) {
      var k;
      if (n === shownN) return;
      if (n > shownN) { for (k = shownN; k < n; k++) chars[k].style.opacity = ""; }
      else { for (k = n; k < shownN; k++) chars[k].style.opacity = "0"; }
      shownN = n;
    }

    /* Caret positions are measured once, in a read-only pass at the start of
       a frame (before any write), and re-measured after a resize or a font
       swap. placeCaret then only writes a transform. */
    var charL = null, charR = null, charY = null;
    function measureChars() {
      var L = [], R = [], Y = [];
      for (var i = 0; i < chars.length; i++) {
        var s = chars[i];
        var l = s.offsetLeft;
        L.push(l); R.push(l + s.offsetWidth); Y.push(s.offsetTop + (s.offsetHeight - 17) / 2);
      }
      charL = L; charR = R; charY = Y;
    }
    function placeCaret(n) {
      if (!caret || !charL || !chars.length) return;
      var i = Math.max(0, Math.min(chars.length - 1, n - 1));
      var x = n === 0 ? charL[0] : charR[i];
      setS(caret, "transform", "translate(" + Math.round(x + 1) + "px," + Math.round(charY[i]) + "px)");
    }
    if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener("loadingdone", function () { charL = null; lastN = -1; lastP = -1; });

    /* Map size comes from a ResizeObserver (delivered after layout), so
       render() never reads layout after writing styles. */
    var mapW = 0, mapH = 0, mapRO = false;
    var lastMapP = -1, lastMapW = 0, lastMapH = 0;
    function drawMapNow(p, t) { lastMapP = p; lastMapW = mapW; lastMapH = mapH; drawMap(p, t); }
    if (map && "ResizeObserver" in window) {
      try {
        new ResizeObserver(function (entries) {
          var r = entries[entries.length - 1].contentRect;
          if (r.width === mapW && r.height === mapH) return;
          mapW = r.width; mapH = r.height;
          /* a still frame (finished autoplay, reduced motion) is redrawn here;
             a running loop picks the new size up on its next frame */
          if (!raf && lastP >= 0 && homeActive()) drawMapNow(lastP, now());
        }).observe(map);
        mapRO = true;
      } catch (e) { mapRO = false; }
    }

    function render(p, t) {
      if (!mapRO && map) { mapW = map.clientWidth; mapH = map.clientHeight; }
      var changed = Math.abs(p - lastP) > 1e-4;
      if (changed) {
        lastP = p;
        /* typing */
        var n = Math.floor(seg(p, 0.02, 0.17) * msgLen);
        if (n !== lastN) { lastN = n; showChars(n); if (p < 0.17) placeCaret(n); }
        marks.forEach(function (m, i) { setS(m, "--h", seg(p, 0.2 + i * 0.045, 0.26 + i * 0.045).toFixed(3)); });
        Array.prototype.forEach.call(kvRows, function (row, i) {
          var k = E.out3(seg(p, 0.3 + i * 0.06, 0.36 + i * 0.06));
          setS(row, "opacity", k.toFixed(3));
          setS(row, "transform", k >= 1 ? "" : "translateY(" + ((1 - k) * 8).toFixed(2) + "px)");
        });
        /* steps */
        var st = stageOf(p);
        Array.prototype.forEach.call(steps, function (el, i) {
          setS(el, "--a", i === st ? "1" : i < st ? ".45" : "0");
          /* the bar reads --s as scaleY (column) or scaleX (row layout) in CSS */
          setS(el, "--s", seg(p, BOUNDS[i][0], BOUNDS[i][1]).toFixed(3));
        });
        /* gauge */
        var v = 86 * E.out3(seg(p, 0.62, 0.82));
        if (gVal) {
          setS(gVal, "strokeDashoffset", (100 - v).toFixed(2));
          /* at 0 the dash pattern leaves a zero-length dash whose round cap
             shows as a red dot at the far end of the arc */
          setS(gVal, "opacity", v < 0.5 ? "0" : "1");
        }
        if (gKnob) {
          var kx = (100 - 78 * Math.cos(Math.PI * v / 100)).toFixed(1), ky = (100 - 78 * Math.sin(Math.PI * v / 100)).toFixed(1);
          if (gKnob._v2x !== kx) { gKnob._v2x = kx; gKnob.setAttribute("cx", kx); }
          if (gKnob._v2y !== ky) { gKnob._v2y = ky; gKnob.setAttribute("cy", ky); }
        }
        var num = Math.round(v);
        if (num !== lastNum) { lastNum = num; setText(gNum, num); }
        var sk = seg(p, 0.82, 0.9);
        if (stamp) {
          setS(stamp, "opacity", sk > 0 ? "1" : "0");
          setS(stamp, "transform", "scale(" + lerp(1.7, 1, E.back(sk)).toFixed(3) + ") rotate(" + lerp(-14, -4, E.out3(sk)).toFixed(2) + "deg)");
        }
        Array.prototype.forEach.call(sigLis, function (li, i) {
          var k = E.out3(seg(p, 0.7 + i * 0.05, 0.76 + i * 0.05));
          setS(li, "opacity", k.toFixed(3));
          setS(li, "transform", k >= 1 ? "" : "translateX(" + ((1 - k) * 12).toFixed(2) + "px)");
        });
        if (bar) setS(bar, "transform", "scaleX(" + seg(p, 0, 0.86).toFixed(4) + ")");
        if (st !== lastStage) {
          lastStage = st;
          setText(statusText, STAGE_T[st]);
          setText(foot, st === 3 ? "Done · Don't pay. Delete the text." : "Step " + (st + 1) + " of 4 · " + STAGE_T[st]);
        }
        var done = p >= 0.82;
        if (done !== lastDone && cc) { lastDone = done; if (done) cc.setAttribute("data-v2-done", ""); else cc.removeAttribute("data-v2-done"); }
      }
      /* blinking caret while typing */
      var on = p < 0.17 && p > 0.001 ? (Math.floor(t / 1000 * 2.2) % 2 ? 0.25 : 1) : 0;
      if (on !== lastCaretOn && caret) { lastCaretOn = on; setS(caret, "opacity", String(on)); }
      /* the map only needs a fresh frame when p moved, it resized, or pulses are running */
      var pulsing = p > 0.36 && p < 0.97 && !reduced();
      if (p !== lastMapP || pulsing || mapW !== lastMapW || mapH !== lastMapH) drawMapNow(p, t);
    }

    function drawMap(p, t) {
      if (!mctx) return;
      var w = mapW, h = mapH;
      if (!w || !h) return;
      var dpr = dprOf();
      if (map.width !== Math.round(w * dpr) || map.height !== Math.round(h * dpr)) { map.width = Math.round(w * dpr); map.height = Math.round(h * dpr); }
      var c = mctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      var top = 34, padB = 26;
      function P(nd) { return [16 + nd.x * (w - 32), top + nd.y * (h - top - padB)]; }
      c.strokeStyle = "rgba(255,255,255,.035)"; c.lineWidth = 1;
      c.beginPath();
      for (var gx = 0.5; gx < w; gx += 22) { c.moveTo(gx, 0); c.lineTo(gx, h); }
      for (var gy = 0.5; gy < h; gy += 22) { c.moveTo(0, gy); c.lineTo(w, gy); }
      c.stroke();
      var nodeOn = [seg(p, 0.02, 0.12), 0, 0, 0, 0, 0, 0];
      var sec = t / 1000;
      EDGES.forEach(function (ed, i) {
        var a = P(NODES[ed[0]]), b = P(NODES[ed[1]]), s = ed[2];
        var e = E.io3(seg(p, s, s + 0.08));
        c.strokeStyle = "rgba(255,255,255,.08)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        if (e > 0) {
          var g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
          g.addColorStop(0, "rgba(34,211,238,.9)");
          g.addColorStop(1, ed[1] === 6 && p > 0.8 ? "rgba(255,92,122,.9)" : "rgba(165,243,252,.9)");
          c.strokeStyle = g; c.lineWidth = 1.6; c.shadowColor = "rgba(100,223,243,.8)"; c.shadowBlur = 8;
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], e), lerp(a[1], b[1], e)); c.stroke();
          c.shadowBlur = 0;
          if (e >= 1 && p < 0.97 && !reduced()) {
            c.fillStyle = "rgba(230,252,255,.95)";
            for (var k = 0; k < 2; k++) {
              var u = (sec * 0.55 + i * 0.19 + k * 0.5) % 1;
              c.beginPath(); c.arc(lerp(a[0], b[0], u), lerp(a[1], b[1], u), 1.8, 0, 7); c.fill();
            }
          }
          nodeOn[ed[1]] = Math.max(nodeOn[ed[1]], seg(p, s + 0.06, s + 0.1));
        }
      });
      c.font = "500 10px 'Geist Mono', ui-monospace, monospace";
      c.textAlign = "center";
      NODES.forEach(function (nd, i) {
        var q = P(nd), x = q[0], y = q[1], on = nodeOn[i];
        var verdict = i === 6 && p > 0.8;
        var R = i === 6 ? 15 : 12;
        if (on > 0) {
          var gl = c.createRadialGradient(x, y, 0, x, y, R * 2.6);
          gl.addColorStop(0, verdict ? "rgba(255,92,122," + (0.45 * on) + ")" : "rgba(34,211,238," + (0.4 * on) + ")");
          gl.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = gl; c.beginPath(); c.arc(x, y, R * 2.6, 0, 7); c.fill();
        }
        c.fillStyle = verdict ? "rgba(255,92,122,.22)" : "rgba(" + (lerp(6, 8, on) | 0) + "," + (lerp(20, 70, on) | 0) + "," + (lerp(26, 84, on) | 0) + ",.9)";
        c.strokeStyle = verdict ? "rgba(255,140,160,.95)" : "rgba(" + (lerp(255, 34, on) | 0) + "," + (lerp(255, 211, on) | 0) + "," + (lerp(255, 238, on) | 0) + "," + (0.18 + 0.7 * on) + ")";
        c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill(); c.stroke();
        c.fillStyle = verdict ? "#ffc2cc" : "rgba(239,253,255," + (0.5 + 0.5 * on) + ")";
        c.beginPath(); c.arc(x, y, 3 + on * 1.2, 0, 7); c.fill();
        c.fillStyle = "rgba(239,253,255," + (0.45 + 0.5 * on) + ")";
        c.fillText((verdict ? "SCAM" : nd.id).toUpperCase(), x, y + R + 14);
      });
    }

    /* ---- driver ---- */
    var visible = false, raf = 0, autoT0 = null, autoDone = false;
    function pinned() { return !!(mqPin && mqPin.matches); }

    function progress(t) {
      var r = watch.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      if (pinned()) return clamp(-r.top / Math.max(1, r.height - vh) * 1.08);
      if (autoDone) return 1;
      if (autoT0 === null) {
        if (r.top < vh * 0.62 && r.bottom > vh * 0.2) autoT0 = t; else return 0;
      }
      var p = clamp((t - autoT0) / 6200);
      if (p >= 1) autoDone = true;
      return p;
    }

    /* One frame: reads first (section rect, then caret metrics if they are
       needed and stale), then writes. */
    function frame(t) {
      var p = progress(t);
      if (caret && !charL && p < 0.17) measureChars();
      render(p, t);
    }
    function loop() {
      raf = 0;
      if (!visible || doc.hidden || !homeActive()) return;
      frame(now());
      /* autoplay that has finished is static: stop until a resize or mode change */
      if (!pinned() && autoDone) return;
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf) raf = requestAnimationFrame(loop); }

    function renderFinal() { lastP = -1; lastMapP = -1; render(1, 0); }

    if (reduced()) {
      /* final state only, drawn a viewport ahead; the map's ResizeObserver
         redraws it after a resize */
      watchVisible(watch, function (v) { if (v && homeActive()) renderFinal(); }, NEAR);
      if (!mapRO) window.addEventListener("resize", function () { if (homeActive()) renderFinal(); }, { passive: true });
    } else {
      /* first frame a viewport ahead (so it is already at its start state when
         it scrolls in), then the loop only while it is actually on screen */
      watchVisible(watch, function (v) {
        if (!v || raf || !homeActive()) return;
        requestAnimationFrame(function () { if (!raf && homeActive()) frame(now()); });
      }, NEAR);
      watchVisible(watch, function (v) { visible = v; if (v) start(); }, "80px 0px");
      doc.addEventListener("visibilitychange", function () { if (!doc.hidden && visible) start(); });
      if (mqPin && mqPin.addEventListener) mqPin.addEventListener("change", function () { lastP = -1; if (visible) start(); });
    }
    if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener("change", function () { if (reduced()) { autoDone = true; renderFinal(); } });
    window.addEventListener("resize", function () { charL = null; lastN = -1; lastP = -1; lastMapP = -1; if (visible && !reduced()) start(); }, { passive: true });
  })();

  /* ======================================================================
     c) Dotted globe (#v2Globe)
     ====================================================================== */
  (function globe() {
    var cv = doc.getElementById("v2Globe");
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d");
    if (!ctx) return;
    var D2R = Math.PI / 180;
    var LAND = [[48, -100, 17, 27], [60, -112, 10, 26], [64, -152, 7, 14], [35, -95, 11, 17], [22, -102, 8, 8], [13, -86, 5, 6], [-6, -62, 14, 15], [-24, -58, 11, 9], [-40, -67, 10, 5], [73, -40, 8, 15], [50, 10, 9, 17], [61, 18, 8, 13], [40, -4, 4, 6], [54, -3, 4, 3], [43, 13, 3, 4], [10, 16, 15, 22], [-12, 26, 13, 13], [-28, 24, 7, 9], [27, 12, 7, 24], [24, 46, 8, 10], [33, 54, 6, 10], [56, 92, 13, 46], [42, 86, 10, 30], [31, 106, 10, 15], [20, 78, 9, 7], [16, 102, 7, 6], [0, 112, 5, 13], [-4, 138, 4, 9], [37, 138, 4, 4], [66, 140, 8, 26], [-25, 134, 9, 17], [-42, 173, 4, 2], [64, -18, 2, 4], [7, -6, 6, 8], [-19, 47, 6, 3]];
    function isLand(lat, lon) {
      var wob = Math.sin(lat * 0.31 + lon * 0.17) * 0.18 + Math.cos(lat * 0.73 - lon * 0.41) * 0.12;
      for (var i = 0; i < LAND.length; i++) {
        var L = LAND[i], dl = lon - L[1];
        if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
        if (Math.pow((lat - L[0]) / L[2], 2) + Math.pow(dl / L[3], 2) < 1 + wob) return true;
      }
      return false;
    }
    var GP = null, ARCS = null;
    function vec(ll) { var lat = ll[0], lon = ll[1]; return [Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)]; }
    function build() {
      GP = [];
      var N = window.innerWidth < 820 ? 5200 : 9000, golden = Math.PI * (3 - Math.sqrt(5));
      for (var i = 0; i < N; i++) {
        var y = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
        var x = Math.cos(th) * rr, z = Math.sin(th) * rr;
        var lat = Math.asin(y) / D2R, lon = Math.atan2(x, z) / D2R;
        var land = isLand(lat, lon);
        if (!land && i % 4) continue;
        GP.push(x, y, z, land ? 1 : 0);
      }
      var CITY = { dxb: [25.2, 55.3], lon: [51.5, -0.1], nyc: [40.7, -74], lag: [6.5, 3.4], bom: [19.1, 72.9], sin: [1.35, 103.8], syd: [-33.9, 151.2], sao: [-23.5, -46.6], tyo: [35.7, 139.7], lax: [34, -118.2], nbo: [-1.3, 36.8], ber: [52.5, 13.4] };
      ARCS = [["lon", "dxb"], ["nyc", "lon"], ["lag", "lon"], ["bom", "dxb"], ["sin", "syd"], ["sao", "nyc"], ["tyo", "lax"], ["nbo", "dxb"], ["ber", "nyc"], ["dxb", "sin"], ["lax", "nyc"], ["lon", "lag"]].map(function (ab, i) {
        return { a: vec(CITY[ab[0]]), b: vec(CITY[ab[1]]), off: i * 0.53 };
      });
    }
    function slerp(a, b, u) {
      var d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1), om = Math.acos(d), so = Math.sin(om) || 1e-6;
      var s1 = Math.sin((1 - u) * om) / so, s2 = Math.sin(u * om) / so, lift = 1 + Math.sin(Math.PI * u) * om * 0.16;
      return [(a[0] * s1 + b[0] * s2) * lift, (a[1] * s1 + b[1] * s2) * lift, (a[2] * s1 + b[2] * s2) * lift];
    }
    var PAL = [];
    for (var pi = 0; pi < 12; pi++) { var tt = pi / 11; PAL.push("rgb(" + (lerp(34, 165, tt) | 0) + "," + (lerp(211, 243, tt) | 0) + "," + (lerp(238, 252, tt) | 0) + ")"); }

    /* Dots are drawn in buckets (12 land colours x 8 alpha levels + 4 ocean
       levels): one fillStyle/globalAlpha change per bucket instead of per dot. */
    var NA = 8, NB = 12 * NA + 4, B_FILL = [], B_ALPHA = [];
    for (var bi = 0; bi < 12; bi++) for (var ai = 0; ai < NA; ai++) { B_FILL.push(PAL[bi]); B_ALPHA.push(ai / (NA - 1)); }
    for (var oi = 0; oi < 4; oi++) { B_FILL.push("rgb(120,227,245)"); B_ALPHA.push((oi + 0.5) * 0.025); }
    var bCnt = new Int32Array(NB), bOff = new Int32Array(NB + 1), bPos = new Int32Array(NB);
    var dX = null, dY = null, dS = null, dB = null, dOrd = null;

    /* Layout is cached, never read inside draw(): canvas size from a
       ResizeObserver, its page position from the observers, scroll from the
       scroll event, viewport height from resize. */
    var cw = 0, ch = 0, cMid = 0, curY = 0, vh = 1, sizeRO = false;
    /* only called from observer callbacks, where layout is already clean */
    function readPos(rect) {
      curY = window.pageYOffset || 0;
      vh = window.innerHeight || 1;
      cMid = rect.top + curY + rect.height / 2;
    }

    /* Static layers (rim light + sphere under the dots, glowing rim over them)
       and the arc-head glow are pre-rendered once per size, so no shadowBlur
       or gradient is built per frame. */
    var layerKey = "", under = null, over = null, headSprite = null, HS = 40;
    function offCanvas(wpx, hpx) { var e = doc.createElement("canvas"); e.width = wpx; e.height = hpx; return e; }
    function buildLayers(w, h, dpr) {
      var key = w + "x" + h + "@" + dpr;
      if (key === layerKey) return;
      layerKey = key;
      var W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.335, g;
      under = offCanvas(W, H); over = offCanvas(W, H);
      var u = under.getContext("2d"), o = over.getContext("2d");
      if (!u || !o) { under = over = null; return; }
      u.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* outer rim light: fades to zero at 1.46R, inside the canvas (R = .335 of the short side) */
      g = u.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.46);
      g.addColorStop(0, "rgba(87,220,242,.34)"); g.addColorStop(1, "rgba(87,220,242,0)");
      u.fillStyle = g; u.beginPath(); u.arc(cx, cy, R * 1.46, 0, 7); u.fill();
      g = u.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      g.addColorStop(0, "#122124"); g.addColorStop(0.7, "#070e0f"); g.addColorStop(1, "#030607");
      u.fillStyle = g; u.beginPath(); u.arc(cx, cy, R, 0, 7); u.fill();
      o.setTransform(dpr, 0, 0, dpr, 0, 0);
      o.beginPath(); o.arc(cx, cy, R, 0, 7);
      g = o.createLinearGradient(cx - R, cy - R, cx + R * 0.6, cy + R);
      g.addColorStop(0, "rgba(194,249,255,.95)"); g.addColorStop(0.45, "rgba(107,224,244,.3)"); g.addColorStop(1, "rgba(107,224,244,.04)");
      o.strokeStyle = g; o.lineWidth = 1.6; o.shadowColor = "rgba(45,212,191,.9)"; o.shadowBlur = 22; o.stroke();
      headSprite = offCanvas(Math.round(HS * dpr), Math.round(HS * dpr));
      var s = headSprite.getContext("2d");
      if (s) {
        s.setTransform(dpr, 0, 0, dpr, 0, 0);
        s.fillStyle = "#fff"; s.shadowColor = "rgba(122,227,245,1)"; s.shadowBlur = 12;
        s.beginPath(); s.arc(HS / 2, HS / 2, 2.2, 0, 7); s.fill();
      } else headSprite = null;
    }

    var mqLow = window.matchMedia ? window.matchMedia("(pointer: coarse), (max-width: 819px)") : null;
    function lowPower() { return !!(mqLow && mqLow.matches); }

    function draw(sec) {
      if (!sizeRO) { cw = cv.clientWidth; ch = cv.clientHeight; }
      var w = cw, h = ch;
      if (!w || !h) return;
      if (!GP) build();
      var dpr = dprOf();
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      buildLayers(w, h, dpr);
      var c = ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.globalAlpha = 1;
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.335;
      var rot = -0.35 + sec * 0.03 + (cMid - curY - vh / 2) / vh * 0.5, tilt = 0.36;
      var cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
      function proj(v) {
        var x = v[0] * cr + v[2] * sr, z0 = -v[0] * sr + v[2] * cr;
        return [cx + x * R, cy - (v[1] * ct - z0 * st) * R, v[1] * st + z0 * ct];
      }
      if (under) c.drawImage(under, 0, 0, w, h);

      /* dots: project + bucket, then draw bucket by bucket */
      var nPts = GP.length / 4, n = 0, i, b;
      if (!dX || dX.length < nPts) { dX = new Float32Array(nPts); dY = new Float32Array(nPts); dS = new Float32Array(nPts); dB = new Uint8Array(nPts); dOrd = new Int32Array(nPts); }
      for (b = 0; b < NB; b++) bCnt[b] = 0;
      for (i = 0; i < GP.length; i += 4) {
        var px = GP[i], py = GP[i + 1], pz = GP[i + 2], land = GP[i + 3];
        var x = px * cr + pz * sr, z0 = -px * sr + pz * cr;
        var z = py * st + z0 * ct;
        if (z < -0.05) continue;
        var a = land ? 0.25 + 0.75 * z : 0.1 * z;
        if (a <= 0.01) continue;
        var s;
        if (land) {
          var tq = clamp(x * 0.5 + 0.5);
          b = ((tq * 11) | 0) * NA + Math.round((a > 1 ? 1 : a) * (NA - 1));
          s = 1.3 + z * 0.7;
        } else { b = 12 * NA + Math.min(3, (a / 0.025) | 0); s = 0.8; }
        dX[n] = cx + x * R - s / 2; dY[n] = cy - (py * ct - z0 * st) * R - s / 2; dS[n] = s; dB[n] = b;
        bCnt[b]++; n++;
      }
      bOff[0] = 0;
      for (b = 0; b < NB; b++) { bOff[b + 1] = bOff[b] + bCnt[b]; bPos[b] = bOff[b]; }
      for (i = 0; i < n; i++) dOrd[bPos[dB[i]]++] = i;
      for (b = 0; b < NB; b++) {
        if (!bCnt[b]) continue;
        c.fillStyle = B_FILL[b]; c.globalAlpha = B_ALPHA[b];
        for (var q = bOff[b], qe = bOff[b + 1]; q < qe; q++) { var j = dOrd[q]; c.fillRect(dX[j], dY[j], dS[j], dS[j]); }
      }
      c.globalAlpha = 1;
      if (over) c.drawImage(over, 0, 0, w, h);

      /* arcs: one gradient per trail, stroked in 3 width bands (thin tail,
         thick head) instead of one stroke per segment */
      var stepsN = lowPower() ? 24 : 36, band = stepsN / 3;
      ARCS.forEach(function (arc) {
        var cyc = ((sec + arc.off) % 3.6) / 2.6;
        if (cyc > 1.25) return;
        var head = clamp(cyc), tail = clamp(cyc - 0.35), k;
        if (head - tail > 0.004) {
          var pts = [];
          for (k = 0; k <= stepsN; k++) pts.push(proj(slerp(arc.a, arc.b, lerp(tail, head, k / stepsN))));
          var p0 = pts[0], p1 = pts[stepsN];
          if (Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]) > 0.5) {
            var gr = c.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
            gr.addColorStop(0, "rgba(113,225,244,0)"); gr.addColorStop(0.5, "rgba(194,249,255,.475)"); gr.addColorStop(1, "rgba(200,249,255,.95)");
            c.strokeStyle = gr;
            for (var bd = 0; bd < 3; bd++) {
              c.lineWidth = 0.6 + 1.4 * ((bd + 0.5) / 3);
              c.beginPath();
              var open = false;
              for (k = bd * band; k <= (bd + 1) * band; k++) {
                var pt = pts[k];
                if (pt[2] > 0) { if (open) c.lineTo(pt[0], pt[1]); else { c.moveTo(pt[0], pt[1]); open = true; } }
                else open = false;
              }
              c.stroke();
            }
          }
        }
        var hq = proj(slerp(arc.a, arc.b, head));
        if (hq[2] > 0 && cyc < 1 && headSprite) c.drawImage(headSprite, hq[0] - HS / 2, hq[1] - HS / 2, HS, HS);
        if (cyc >= 1) {
          var kk = (cyc - 1) / 0.25, e = proj(arc.b);
          if (e[2] > 0) { c.strokeStyle = "rgba(34,211,238," + ((1 - kk) * 0.9).toFixed(3) + ")"; c.lineWidth = 1.4; c.beginPath(); c.arc(e[0], e[1], 3 + kk * 14, 0, 7); c.stroke(); }
        }
      });
    }

    var visible = false, raf = 0, t0 = now(), lastDraw = -1e9;
    function still() { return reduced() ? 1.4 : (now() - t0) / 1000; }
    function loop() {
      raf = 0;
      if (!visible || doc.hidden || !homeActive()) return;
      raf = requestAnimationFrame(loop);
      var tn = now();
      /* phones / touch tablets: about 30 fps is plenty for a slow spin */
      if (lowPower() && tn - lastDraw < 28) return;
      lastDraw = tn;
      draw((tn - t0) / 1000);
    }
    function start() { if (!raf) raf = requestAnimationFrame(loop); }

    if ("ResizeObserver" in window) {
      try {
        new ResizeObserver(function (entries) {
          var r = entries[entries.length - 1].contentRect;
          if (r.width === cw && r.height === ch) return;
          cw = r.width; ch = r.height;
          if (cw && ch) readPos(cv.getBoundingClientRect()); /* layout is clean inside the callback */
          if (!raf && GP && cw && ch && homeActive()) draw(still());
        }).observe(cv);
        sizeRO = true;
      } catch (e) { sizeRO = false; }
    }
    window.addEventListener("scroll", function () { if (visible) curY = window.pageYOffset || 0; }, { passive: true });
    window.addEventListener("resize", function () { vh = window.innerHeight || 1; if (!sizeRO && reduced() && homeActive()) draw(1.4); }, { passive: true });

    /* first frame one viewport ahead; the sphere is built in idle time first */
    watchVisible(cv, function (v, e) {
      if (!v || !homeActive()) return;
      if (e) readPos(e.boundingClientRect);
      function first() { if (!raf && homeActive()) requestAnimationFrame(function () { if (!raf) draw(still()); }); }
      if (GP) first(); else idle(function () { if (!GP) build(); first(); }, 300);
    }, NEAR);
    if (!reduced()) {
      watchVisible(cv, function (v, e) { visible = v; if (v) { if (e) readPos(e.boundingClientRect); start(); } }, "60px 0px");
      doc.addEventListener("visibilitychange", function () { if (!doc.hidden && visible) start(); });
    }
  })();

  /* ======================================================================
     d) $442B count-up, once, when it scrolls into view
     ====================================================================== */
  (function statCount() {
    var el = doc.getElementById("v2StatNum");
    if (!el || reduced() || !hasIO) return;
    var m = /^(\D*)(\d+)(\D*)$/.exec((el.textContent || "").trim());
    var target = parseInt(el.getAttribute("data-v2-target"), 10);
    if (!m || !target) return;
    var pre = m[1], post = m[3], finalText = el.textContent;
    var done = false;
    var io = new IntersectionObserver(function (entries) {
      var e = entries[entries.length - 1];
      if (done || !e.isIntersecting) return;
      done = true;
      io.disconnect();
      var t0 = now(), last = -1;
      setText(el, pre + "0" + post);
      (function tick() {
        var k = E.outExpo(clamp((now() - t0 - 200) / 1600));
        var v = Math.round(target * k);
        if (v !== last) { last = v; setText(el, pre + v + post); }
        if (k < 1) requestAnimationFrame(tick); else setText(el, finalText);
      })();
    }, { threshold: 0.6 });
    io.observe(el);
  })();

  /* ======================================================================
     e) Cursor spotlight on the why-choose cards (fine pointers only)
     ====================================================================== */
  (function spotlight() {
    var grid = home.querySelector(".why-choose-grid");
    if (!grid || reduced() || !window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var cur = null, pend = null, raf = 0;
    function flush() {
      raf = 0;
      if (!pend) return;
      var it = pend.item, r = it.getBoundingClientRect();
      it.style.setProperty("--v2-home-sx", Math.round(pend.x - r.left) + "px");
      it.style.setProperty("--v2-home-sy", Math.round(pend.y - r.top) + "px");
      if (cur !== it) { if (cur) cur.style.setProperty("--v2-home-so", "0"); cur = it; it.style.setProperty("--v2-home-so", "1"); }
      pend = null;
    }
    grid.addEventListener("pointermove", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      var it = e.target && e.target.closest ? e.target.closest(".why-choose-item") : null;
      if (!it) { if (cur) { cur.style.setProperty("--v2-home-so", "0"); cur = null; } return; }
      pend = { item: it, x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(flush);
    }, { passive: true });
    grid.addEventListener("pointerleave", function () { pend = null; if (cur) { cur.style.setProperty("--v2-home-so", "0"); cur = null; } });
  })();
})();
