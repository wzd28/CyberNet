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

   HOOK 2 - subtle glow behind a 3D object: [data-cn-glow]
     <figure class="my-visual" data-cn-glow>                         <- light at the box's centre
       <img src="/ui/3d/recovery-320.webp" alt="" width="320" height="320">
     </figure>
     <div class="my-visual" data-cn-glow="50 42">...</div>          <- light centred at x% y%
     <div class="my-visual" data-cn-glow="50 42" data-cn-glow-motes="off">...</div>   <- no motes
     <div class="my-visual" data-cn-glow style="--cn-gl-k:.7; --cn-gl-scale:.8">...</div>
   - A very faint cyan light behind the object. It breathes slowly (11 s) while a second, softer
     light drifts around it (29 s), and four tiny motes at the object's edges rise a few dozen
     pixels and fade (14 to 19 s each). Nothing flame-like: no column, no shards, no sparks, no
     flicker.
   - Pure CSS on the compositor (transform and opacity only, no canvas, no script per frame).
     This file only adds the layer as the host's FIRST child, when the host first comes within
     300px of the screen: <cn-glow class="cn-glow" aria-hidden="true"> holding <cn-gl> lights
     (custom element names, so no "span" or "i" rule in page CSS can restyle them), with no
     pointer events. It sets data-cn-play on cn-glow while the host is on screen, the tab is
     visible and motion is allowed. Everywhere else the light holds its frame.
   - Each light is a small disc inside the host whose soft box-shadow reaches a little past the
     host's edges, so it shows round an object that fills its box. A box-shadow is ink overflow
     and never counts towards the page's scroll width, so the glow cannot make a phone pan
     sideways. Its px sizes follow the host's shorter side (--cn-gl-s on cn-glow, written from a
     ResizeObserver only when it changes), so a wide card gets a light the size of its height.
   - The host must be a container (not an <img>). It becomes position:relative (unless it is
     already positioned) and isolation:isolate, so the light sits under the host's content and
     above the host's own background. Do not put it on a [data-cn-stagger] parent: the layer would
     count as a child (likewise, page rules such as "> :first-child" on the host see the layer).
   - Tuning (custom properties on the host or any ancestor): --cn-gl-scale (the light's size
     against the host's shorter side, default 1; lower it for an object that sits small in a
     big box), --cn-gl-k (strength 0..1, default 1; the default is already faint), --cn-gl-rgb
     (default "34, 211, 238", cyan) and --cn-gl-rise (how far the motes rise, default 44px).
   - Reduced motion and Pause motion: a still, faint light with the motes at rest. Forced colours
     and print: none.
   - For markup rendered later, call CN.glow(el) (el itself, or every [data-cn-glow] inside it).
     It returns a controller { pause(), resume(), destroy() }, also kept on el.__cnGlow, so a
     page's own Pause button can drive it.

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

  /* ------------------------------------------------------------------ the subtle glow */
  /* The layer: two lights and up to four motes, all animated by 27-core.css (section 6b). */
  var MOTES = 4;
  var VOID = /^(IMG|INPUT|TEXTAREA|SELECT|CANVAS|VIDEO|AUDIO|IFRAME|SVG|BR|HR|PICTURE|SOURCE|OBJECT|EMBED)$/;
  function glowAt(host) {
    var v = (host.getAttribute("data-cn-glow") || "").trim().split(/[\s,]+/);
    var x = parseFloat(v[0]), y = parseFloat(v[1]);
    return [isFinite(x) ? CN.clamp(x, 0, 100) : null, isFinite(y) ? CN.clamp(y, 0, 100) : null];
  }
  function buildGlow(host) {
    var el = doc.createElement("cn-glow"), at = glowAt(host);
    el.className = "cn-glow";
    el.setAttribute("aria-hidden", "true");
    if (at[0] !== null) el.style.setProperty("--cn-gl-x", at[0] + "%");
    if (at[1] !== null) el.style.setProperty("--cn-gl-y", at[1] + "%");
    var html = '<cn-gl class="cn-glow-light"></cn-gl><cn-gl class="cn-glow-drift"></cn-gl>';
    if ((host.getAttribute("data-cn-glow-motes") || "").toLowerCase() !== "off") {
      for (var i = 0; i < MOTES; i++) html += '<cn-gl class="cn-glow-mote"></cn-gl>';
    }
    el.innerHTML = html;
    host.insertBefore(el, host.firstChild);
    return el;
  }
  /* Arm a [data-cn-glow] host: the layer is added when the host first comes within 300px of the
     screen (an absolutely positioned leaf, so nothing in flow moves); from then on one observer
     says whether it is on screen. The controller exists at once, so pause() before then is
     remembered. */
  function glowHook(host) {
    if (!host || host.nodeType !== 1) return null;
    if (host.__cnGlow) return host.__cnGlow;
    var layer = null, on = false, paused = false, gone = false, stopArm = null, stopView = null, offs = [], ro = null, lastS = 0;
    function update() {
      if (!layer || gone) return;
      var play = on && !paused && !CN.reduced() && !CN.hidden();
      if (layer.hasAttribute("data-cn-play") !== play) {
        if (play) layer.setAttribute("data-cn-play", ""); else layer.removeAttribute("data-cn-play");
      }
    }
    var ctl = {
      pause: function () { paused = true; update(); },
      resume: function () { paused = false; update(); },
      destroy: function () {
        gone = true;
        if (stopArm) stopArm();
        if (stopView) stopView();
        if (ro) ro.disconnect();
        offs.forEach(function (off) { if (typeof off === "function") off(); });
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        layer = null; host.__cnGlow = null;
      }
    };
    host.__cnGlow = ctl;
    if (VOID.test(host.nodeName.toUpperCase())) return ctl;
    var fired = false;
    stopArm = CN.inView(host, function (vis) {
      if (!vis || fired || gone) return;
      fired = true;
      if (stopArm) stopArm();
      try { layer = buildGlow(host); } catch (err) { layer = null; return; }
      /* the lights' px sizes follow the host's shorter side (written only when it changes), so a
         wide card gets a light the size of its height, not a disc across its whole width */
      var setS = function (w, h) {
        var v = Math.round(h > 0 ? Math.min(w, h) : w);
        if (v > 0 && v !== lastS && layer) { lastS = v; layer.style.setProperty("--cn-gl-s", v + "px"); }
      };
      if ("ResizeObserver" in win) {
        ro = new ResizeObserver(function (es) { var r = es[es.length - 1].contentRect; setS(r.width, r.height); });
        ro.observe(layer);
      } else setS(layer.offsetWidth, layer.offsetHeight);
      stopView = CN.inView(host, function (v) { on = !!v; update(); }, { margin: "40px 0px" });
      offs = [CN.onVisibility(update), CN.onMotion(update), CN.onStill ? CN.onStill(update) : null];
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
  /* #cnCore: the lead and the manifesto (HOOK 1); nothing else moves in the section. */
  function Core(section) {
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
