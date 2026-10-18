/* Home "What CyberNet AI does" (#cnCore) and two motion hooks any page can use (owner: aurora;
   v4.2, reusable from v4.3; CSS in 27-core.css).

   v4.7 (18 Oct): the owner: "remove the shield design entirely and just keep the text in the
   middle" and "make it super smooth". The shield story (58-shield.js, 28-shield.css) is gone;
   #cnCore is a centred lead and the manifesto. The manifesto now lights by line on the
   compositor, once, instead of word by word on the main thread (HOOK 1).

   HOOK 1 - lit manifesto: data-cn="manifesto"
     <p class="cn-manifesto" data-cn="manifesto">We read the message <b>before you act</b>, then
       explain it in <b>plain words</b>.</p>
   - Any paragraph on any page. class="cn-manifesto" adds the big light editorial type; leave it
     off to keep your own type. The lines rest at half strength and light up once, in reading
     order (110 ms apart), when about a third of the paragraph is on screen. Keep it to 2 to 4
     sentences.
   - How (v4.7): when the paragraph first comes within a screen of the viewport, in an idle
     moment, this file wraps each word in span.cn-mw, reads where the lines break (one
     offsetTop read per word, in one layout) and groups the words into one block span per
     rendered line (span.cn-ml; a <b>/<strong> run that crosses a line is split into one copy
     per line). The line boxes are the same as before, so nothing moves. The paragraph gets
     .is-dim (lines at opacity .5) unless it is already on screen, and data-cn-lit when it is:
     27-core.css then runs one opacity transition per line (--cn-i, the line's index, sets its
     delay). An opacity transition runs on the compositor; nothing follows the scroll (v4.7
     rule: no scroll-timeline animations, they are serviced on the main thread every scrolled
     frame in this Chromium).
   - The lines are read again only when the paragraph's width changes (a ResizeObserver) or a
     web font finishes loading, in an idle callback; if the breaks are the same, nothing in the
     DOM changes.
   - Fully lit, with nothing dimmed: reduced motion and Pause motion (CSS), no script, print,
     forced colours, and a paragraph that holds anything but text and simple inline wrappers
     (b, strong, em, i, span, small, mark with text only and no id), such as a link.
   - Dark ink on a light band is detected from the computed colour (class is-ink) and rests a
     little stronger, so unlit lines stay at 4.5:1 or more.
   - For markup rendered later, call CN.manifesto(p).
   - v5 LIGHT (desktop with Lenis, flag "scrubs"): once its lines are grouped, the paragraph
     becomes a CN.motion.scrub from "top 80%" to "bottom 50%": each line goes from .5 (.6 on
     ink) and .12em low to 1 and in place, .6 of a line apart, power1.out, both ways (.is-scrub
     turns the CSS transitions off while GSAP writes the lines). A regroup rebuilds it. Its
     fallback is the v4.7 one-shot above, unchanged; its final state is data-cn-lit. Phones,
     tablets, -scrubs / -lenis, a demotion or a blocked vendor all get the one-shot.

   #cnCore v5 (TEXT ONLY, forever: no picture, canvas, 3D or object). The label's 28px hairline
   draws (rule-before, 700 ms expo), its words follow at +120 ms (-4px to 0), "Rules first. Then
   AI." fades in at +200 ms; the lead SETs word by word (05-reveal.js); the end
   tag's dot grows and its words fade at +120 ms. 27-core.css keys these on .is-in. The two
   labels' words are wrapped once at start-up (span.cn-core-t), so the text moves apart from
   its mark. Reduced motion and Pause: everything final.

   HOOK 2 - still glow behind a 3D object: [data-cn-glow]
     <figure class="my-visual" data-cn-glow>                         <- light at the box's centre
     <div class="my-visual" data-cn-glow="50 42">...</div>          <- light centred at x% y%
     <div class="my-visual" data-cn-glow style="--cn-gl-k:.7; --cn-gl-scale:.8">...</div>
   - A very faint, still cyan light behind the object (a soft light and a fainter second one).
     v4.7 stopped their breathing, drift and motes (80-perf.css section 8); v5 deletes them, so
     data-cn-glow-motes is ignored and nothing in the layer animates or plays.
   - This file adds the layer as the host's FIRST child, when the host first comes within 300px
     of the screen: <cn-glow class="cn-glow" aria-hidden="true"> holding two <cn-gl> lights
     (custom element names, so no page rule can restyle them), with no pointer events. Each light
     is a small disc whose soft box-shadow reaches a little past the host (ink overflow: never
     scroll width). Its px sizes follow the host's shorter side (--cn-gl-s on cn-glow, written
     from a ResizeObserver only when it changes).
   - The host must be a container (not an <img>). It becomes position:relative (unless it is
     already positioned) and isolation:isolate. Tuning: --cn-gl-scale (size, 1), --cn-gl-k
     (strength, 1), --cn-gl-rgb ("34, 211, 238"). Forced colours and print: none.
   - For markup rendered later, call CN.glow(el). It returns { pause(), resume(), destroy() } (the
     first two are kept for old callers and do nothing now), also on el.__cnGlow.

   HOOK 3 (CSS only): the editorial corner label .cn-edlabel lives in 27-core.css. HOOK 4: the
   line-by-line heading reveal [data-cn-lines] lives in 05-reveal.js and 29-lines.css. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, win = window;
  /* inline wrappers a line may split into one copy per line (text only, no id) */
  var WRAP = /^(B|STRONG|EM|I|SPAN|SMALL|MARK)$/;
  var idle = win.requestIdleCallback
    ? function (f) { win.requestIdleCallback(f, { timeout: 300 }); }
    : function (f) { setTimeout(f, 50); };

  /* ------------------------------------------------------------------ manifesto */
  /* The words, each with its inline wrapper (or null) and whether a space comes before it.
     null when the paragraph holds anything a split could break (a link, a line break, an image,
     nested wrappers, an id): that paragraph just stays lit. */
  function tokens(p) {
    var out = [], sp = false, ok = true;
    function text(s, wrap) {
      s.split(/(\s+)/).forEach(function (t) {
        if (!t) return;
        if (/^\s+$/.test(t)) { sp = true; return; }
        out.push({ t: t, w: wrap, sp: sp && out.length > 0 });
        sp = false;
      });
    }
    Array.prototype.forEach.call(p.childNodes, function (k) {
      if (!ok) return;
      if (k.nodeType === 3) text(k.nodeValue, null);
      else if (k.nodeType === 1) {
        if (!WRAP.test(k.nodeName.toUpperCase()) || k.id || k.children.length) { ok = false; return; }
        text(k.textContent, k);
      }
    });
    return ok && out.length ? out : null;
  }

  /* Lay the words out as lines: lineOf[i] is word i's line. A wrapper run is cloned per line
     (spaces inside a run stay inside it); the space before a line's first word goes at the end
     of the line before, so the words still flow apart while .is-measure makes the lines inline. */
  function lay(m, lineOf) {
    var frag = doc.createDocumentFragment(), lines = [], line = null, grp = null, cur = -1;
    m.toks.forEach(function (tk, i) {
      if (lineOf[i] !== cur) {
        if (line && tk.sp) line.appendChild(doc.createTextNode(" "));
        cur = lineOf[i];
        line = doc.createElement("span");
        line.className = "cn-ml";
        frag.appendChild(line);
        lines.push(line);
        grp = null;
      } else if (tk.sp) (grp && tk.w === grp.__cnW ? grp : line).appendChild(doc.createTextNode(" "));
      if (tk.w) {
        if (!grp || grp.__cnW !== tk.w) {
          grp = tk.w.cloneNode(false);
          grp.__cnW = tk.w;
          line.appendChild(grp);
        }
        grp.appendChild(m.words[i]);
      } else {
        grp = null;
        line.appendChild(m.words[i]);
      }
    });
    /* each line's place in the light-up order (its transition delay) */
    lines.forEach(function (el, j) { if (j) el.style.setProperty("--cn-i", j); });
    var p = m.p;
    while (p.firstChild) p.removeChild(p.firstChild);
    p.appendChild(frag);
    m.lineOf = lineOf;
  }

  function isInk(p) {
    var c = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(win.getComputedStyle(p).color || "");
    return !!c && (0.2126 * c[1] + 0.7152 * c[2] + 0.0722 * c[3]) < 110;
  }

  /* Where do the lines break? Words flow freely (.is-measure), one batch of offsetTop reads
     (one layout), then back. Only called from an idle callback, when layout is clean. A first
     call also splits the words; later calls change the DOM only if a break moved. */
  function measure(m) {
    m.queued = false;
    var p = m.p;
    if (!p.isConnected || !p.offsetWidth) return;      /* its page is hidden: the ResizeObserver calls again */
    var first = !m.words;
    if (first) {
      m.words = m.toks.map(function (tk) {
        var s = doc.createElement("span");
        s.className = "cn-mw";
        s.textContent = tk.t;
        return s;
      });
      if (isInk(p)) p.classList.add("is-ink");
    }
    p.classList.add("is-measure");
    if (first) lay(m, m.toks.map(function () { return 0; }));   /* one inline line: the same flow as the text */
    var lineOf = [], top = null, ln = -1, same = !first;
    for (var i = 0; i < m.words.length; i++) {
      var t = m.words[i].offsetTop;
      if (top === null || t > top + 2) { top = t; ln++; }
      lineOf.push(ln);
      if (same && m.lineOf[i] !== ln) same = false;
    }
    p.classList.remove("is-measure");
    if (!same) lay(m, lineOf);
    /* rest dim only if the visitor has not reached it yet (no lit -> dim -> lit flash) */
    if (first && !m.seen) p.classList.add("is-dim");
    if (first) scrub(m);
    else if (!same && m.h) m.h.rebuild();
  }
  /* v5 LIGHT: the lines follow the scroll while Lenis drives (desktop); else the one-shot. Home's
     manifesto only (finish, 18 Oct): the inner pages keep the one-shot, because their scrubs kept
     ScrollTrigger busy on every glide frame and put Quick Scan over the 2% dropped-frame gate. */
  function scrub(m) {
    var M = CN.motion, p = m.p;
    if (!M || !p.closest("#home")) return;
    m.h = M.scrub(p, {
      start: "top 80%", end: "bottom 50%",
      build: function (tl) {
        var lo = p.classList.contains("is-ink") ? .6 : .5;
        p.classList.add("is-scrub");
        CN.qsa(".cn-ml", p).forEach(function (l, i) {
          tl.fromTo(l, { opacity: lo, y: "0.12em" }, { opacity: 1, y: 0, ease: "power1.out", duration: 1 }, i * .6);
        });
        return function () { p.classList.remove("is-scrub"); };
      },
      fallback: function () { /* the v4.7 one-shot: .is-dim at the split, data-cn-lit at a third */ },
      final: function () { p.setAttribute("data-cn-lit", ""); }
    });
  }
  function queue(m) {
    if (m.queued) return;
    m.queued = true;
    idle(function () { measure(m); });
  }

  var mans = [], mRO = null, fontsBound = false;
  function Manifesto(p) {
    if (!p || p.nodeType !== 1) return null;
    if (p.__cnMan) return p.__cnMan;
    var m = { p: p, toks: null, words: null, lineOf: null, roW: -1, armed: false, queued: false, seen: false };
    p.__cnMan = m;
    m.toks = tokens(p);
    if (!m.toks) return m;                           /* stays lit; nothing to do */
    mans.push(m);
    /* the first split waits until the paragraph comes within a screen (its page may be hidden) */
    var stop = null, done = false;
    stop = CN.inView(p, function (vis) {
      if (!vis || done) return;
      done = true;
      if (stop) stop();
      m.armed = true;
      queue(m);
    }, { margin: "100% 0px" });
    if (done && stop) stop();
    /* lit once, when about a third of it is on screen */
    var stopLit = null, lit = false;
    stopLit = CN.inView(p, function (vis) {
      if (!vis || lit) return;
      lit = true;
      if (stopLit) stopLit();
      m.seen = true;
      p.setAttribute("data-cn-lit", "");
    }, { threshold: .35 });
    if (lit && stopLit) stopLit();
    /* a new width (rotation, resize, its page shown again) may move the breaks */
    if ("ResizeObserver" in win) {
      if (!mRO) mRO = new ResizeObserver(function (es) {
        es.forEach(function (e) {
          var mm = e.target.__cnMan, w = Math.round(e.contentRect.width);
          if (!mm || w === mm.roW) return;
          mm.roW = w;
          if (mm.armed && w > 0) queue(mm);
        });
      });
      mRO.observe(p);
    }
    /* a web font that lands after the split changes the words' widths */
    if (!fontsBound && doc.fonts && doc.fonts.addEventListener) {
      fontsBound = true;
      doc.fonts.addEventListener("loadingdone", function () {
        mans.forEach(function (mm) { if (mm.words) queue(mm); });
      });
    }
    return m;
  }

  /* ------------------------------------------------------------------ the still glow */
  /* The layer: two still lights (27-core.css section 6b). Nothing in it animates (v4.7 stopped
     the breathing, drift and motes; v5 deleted them), so it needs no play state. */
  var VOID = /^(IMG|INPUT|TEXTAREA|SELECT|CANVAS|VIDEO|AUDIO|IFRAME|SVG|BR|HR|PICTURE|SOURCE|OBJECT|EMBED)$/;
  function noop() {}
  function glowHook(host) {
    if (!host || host.nodeType !== 1) return null;
    if (host.__cnGlow) return host.__cnGlow;
    var layer = null, gone = false, stopArm = null, ro = null, lastS = 0;
    var ctl = host.__cnGlow = {
      pause: noop, resume: noop,
      destroy: function () {
        gone = true;
        if (stopArm) stopArm();
        if (ro) ro.disconnect();
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        layer = null; host.__cnGlow = null;
      }
    };
    if (VOID.test(host.nodeName.toUpperCase())) return ctl;
    var fired = false;
    stopArm = CN.inView(host, function (vis) {
      if (!vis || fired || gone) return;
      fired = true;
      if (stopArm) stopArm();
      var v = (host.getAttribute("data-cn-glow") || "").trim().split(/[\s,]+/), x = parseFloat(v[0]), y = parseFloat(v[1]);
      layer = doc.createElement("cn-glow");
      layer.className = "cn-glow";
      layer.setAttribute("aria-hidden", "true");
      if (isFinite(x)) layer.style.setProperty("--cn-gl-x", CN.clamp(x, 0, 100) + "%");
      if (isFinite(y)) layer.style.setProperty("--cn-gl-y", CN.clamp(y, 0, 100) + "%");
      layer.innerHTML = '<cn-gl class="cn-glow-light"></cn-gl><cn-gl class="cn-glow-drift"></cn-gl>';
      host.insertBefore(layer, host.firstChild);
      /* the lights' px sizes follow the host's shorter side (written only when it changes) */
      var setS = function (w, h) {
        var s = Math.round(h > 0 ? Math.min(w, h) : w);
        if (s > 0 && s !== lastS && layer) { lastS = s; layer.style.setProperty("--cn-gl-s", s + "px"); }
      };
      if ("ResizeObserver" in win) {
        ro = new ResizeObserver(function (es) { var r = es[es.length - 1].contentRect; setS(r.width, r.height); });
        ro.observe(layer);
      } else setS(layer.offsetWidth, layer.offsetHeight);
    }, { margin: "300px 0px" });
    if (fired && stopArm) stopArm();
    return ctl;
  }
  var GLOW = "[data-cn-glow]";
  function glow(el) {
    if (!el) return null;
    if (el.matches && el.matches(GLOW)) return glowHook(el);
    CN.qsa(GLOW, el).forEach(glowHook);
    return null;
  }

  /* ------------------------------------------------------------------ the section */
  /* #cnCore (text only): RULE the label, fade the corner tag, SET the lead (05-reveal.js), one
     light pass on "protect" (desktop), the manifesto (HOOK 1), then the end tag. */
  function words(el) {
    if (!el) return;
    var s = doc.createElement("span");
    s.className = "cn-core-t";
    while (el.firstChild) s.appendChild(el.firstChild);
    el.appendChild(s);
  }
  function Core(section) {
    var M = CN.motion, lab = CN.qs(".cn-core-label", section), end = CN.qs(".cn-core-tag--end", section);
    words(lab);
    words(end);
    if (M) {
      M.reveal(lab, "rule-before");
      M.reveal(end, "trigger");
    }
    var p = CN.qs('[data-cn="manifesto"]', section);
    if (p) Manifesto(p);
    return {};
  }

  /* Read the manifestos' words at start-up (no layout read; the lines are split later, near the
     screen and in an idle moment); the glow starts lazily, near the screen. */
  CN.manifesto = Manifesto;
  CN.glow = glow;
  CN.onReady(function () {
    CN.qsa("#home > .cn-core").forEach(function (sec) { sec.__cnCore = Core(sec); });
    CN.qsa('[data-cn="manifesto"]').forEach(Manifesto);
    CN.qsa(GLOW).forEach(glowHook);
  });
})();
