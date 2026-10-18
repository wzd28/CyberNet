/* Home "What CyberNet AI does" (#cnCore) and two motion hooks any page can use (owner: aurora;
   v4.2, reusable from v4.3; CSS in 27-core.css).

   v4.5 (17 Oct): the owner turned the chip down for good ("i hate this picture make it a shield
   that does something when your scrolling ..."). The chip rig, its scroll motion and the plume
   (the worker renderer and /ui/3d/core-plume.js) are gone; the section's visual is now the
   shield story in 58-shield.js and 28-shield.css. This file builds the section's manifesto and
   the two hooks below, unchanged since v4.3.

   HOOK 1 - scroll-lit manifesto: data-cn="manifesto"
     <p class="cn-manifesto" data-cn="manifesto">We read the message <b>before you act</b>, then
       explain it in <b>plain words</b>.</p>
   - Any paragraph on any page. class="cn-manifesto" adds the big light editorial type; leave it
     off to keep your own type. The words light from slate to white in reading order as the
     paragraph scrolls up, and dim again on the way back. Words inside <b>/<strong> light to pure
     white. Keep it to 2 to 4 sentences, so the last word is lit while the paragraph is still on
     screen.
   - Words are wrapped once at start-up (span.cn-mw; inline spans, so the layout does not change).
   - Where view timelines exist (Chrome, Edge, Safari 26), CSS does all the work on a named view
     timeline (--cn-a / --cn-b per word, written once here), with no script while scrolling.
     Elsewhere one shared scroll handler, bound only while a manifesto is near the screen, writes
     the colour of only the words whose shade changed (a leaf write in 16 steps). Positions come
     from a ResizeObserver read, so a scroll frame needs nothing but scrollY.
   - Colours (inherited custom properties; set them on the paragraph or any ancestor):
     --cn-mw-dim (unlit, default #6e7a8c, 4.6:1 on the midnight ground), --cn-mw-lit (default
     var(--cn-text)) and --cn-mw-bold (default #fff). Light bands (.cn-light,
     [data-cn-tone="light"]) get a light set automatically.
   - Reduced motion, Pause motion and no script: every word is lit (CSS) and nothing is written.
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
  var cssTimeline = !!(win.CSS && CSS.supports && CSS.supports("animation-timeline: view()"));
  /* the words' colour runs on a named view timeline (27-core.css) */
  var cssWords = cssTimeline && CSS.supports("view-timeline: --cn-man block") && CSS.supports("animation-range: cover 10% cover 50%");

  function scrollY() { return win.pageYOffset || doc.documentElement.scrollTop || 0; }
  function viewH() { return win.innerHeight || doc.documentElement.clientHeight || 800; }
  /* The words' scroll window, in "cover" percent of the paragraph's view timeline: from its top
     at about 86% of the screen until its middle reaches about 45%, so the last word is lit
     while the whole paragraph is still on screen (phones: 225 px tall on 844; desktops: 400 on
     900). Each word owns a slice 3.5 words wide. */
  var COVER0 = 10, COVER1 = 54, WIN = 3.5;

  /* ------------------------------------------------------------------ manifesto */
  var DEF_DIM = [110, 122, 140], DEF_LIT = [245, 247, 250], DEF_BOLD = [255, 255, 255], STEPS = 16;
  function shades(from, to) {
    var out = [];
    for (var i = 0; i <= STEPS; i++) {
      var t = i / STEPS;
      out.push("rgb(" + Math.round(from[0] + (to[0] - from[0]) * t) + "," + Math.round(from[1] + (to[1] - from[1]) * t) + "," + Math.round(from[2] + (to[2] - from[2]) * t) + ")");
    }
    return out;
  }
  /* any CSS colour -> [r, g, b] (a 2d context normalises it), or def */
  var probe = null;
  function rgbOf(v, def) {
    v = (v || "").trim();
    if (!v) return def;
    if (probe === null) { var c = doc.createElement("canvas"); probe = (c.getContext && c.getContext("2d")) || false; }
    if (!probe) return def;
    probe.fillStyle = "#010203";
    probe.fillStyle = v;
    var s = String(probe.fillStyle), m = /^#([0-9a-f]{6})$/i.exec(s);
    if (s === "#010203") return def;
    if (m) { var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(s);
    return m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])] : def;
  }
  /* the fallback's two ramps, from the same custom properties the CSS uses (read once) */
  function palette(p) {
    var cs = win.getComputedStyle(p);
    var dim = rgbOf(cs.getPropertyValue("--cn-mw-dim"), DEF_DIM);
    var lit = rgbOf((cs.getPropertyValue("--cn-mw-lit") || "").trim() || cs.getPropertyValue("--cn-text"), DEF_LIT);
    var bold = rgbOf(cs.getPropertyValue("--cn-mw-bold"), DEF_BOLD);
    return { n: shades(dim, lit), b: shades(dim, bold) };
  }

  function splitWords(p) {
    if (p.__cnWords) return p.__cnWords;
    var words = [];
    function walk(node, bold) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (k) {
        if (k.nodeType === 3) {
          var parts = k.nodeValue.split(/(\s+)/), frag = doc.createDocumentFragment();
          parts.forEach(function (s) {
            if (!s) return;
            if (/^\s+$/.test(s)) { frag.appendChild(doc.createTextNode(s)); return; }
            var w = doc.createElement("span");
            w.className = "cn-mw";
            w.textContent = s;
            frag.appendChild(w);
            words.push({ el: w, b: bold, lv: -1 });
          });
          node.replaceChild(frag, k);
        } else if (k.nodeType === 1 && !/^(BR|SVG|IMG|SCRIPT|STYLE|TEMPLATE)$/.test(k.nodeName.toUpperCase())) walk(k, bold || /^(B|STRONG)$/.test(k.nodeName));
      });
    }
    walk(p, false);
    p.__cnWords = words;
    /* each word's slice of the scroll (static: written once) */
    var n = words.length;
    words.forEach(function (w, i) {
      var a = COVER0 + (COVER1 - COVER0) * i / (n + WIN), b = COVER0 + (COVER1 - COVER0) * (i + WIN) / (n + WIN);
      w.el.style.setProperty("--cn-a", a.toFixed(2) + "%");
      w.el.style.setProperty("--cn-b", b.toFixed(2) + "%");
    });
    if (cssWords) p.classList.add("is-timeline");
    return words;
  }
  function paint(m, prog) {
    var words = m.words, n = words.length, x = prog * (n + WIN);
    if (!m.pal) m.pal = palette(m.p);
    for (var i = 0; i < n; i++) {
      var t = (x - i) / WIN, w = words[i];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var lv = Math.round(t * STEPS);
      if (lv === w.lv) continue;
      w.lv = lv;
      w.el.style.color = (w.b ? m.pal.b : m.pal.n)[lv];
    }
  }

  /* The fallback (no named view timelines): one scroll handler for every manifesto, bound only
     while one of them is near the screen. Where each paragraph sits in the document (CSS px) is
     read only in a ResizeObserver callback, when layout is clean, so a scroll frame needs nothing
     but scrollY and never forces a style or layout pass from here. */
  var mans = [], mRaf = 0, mBound = false, mRO = null;
  function readM(m) {
    var r = m.p.getBoundingClientRect();
    m.top = r.top + scrollY(); m.h = r.height;
    if (!m.pal && r.height) m.pal = palette(m.p);   /* style is clean here too: read the colours once */
  }
  function mPaint() {
    mRaf = 0;
    if (CN.reduced()) return;
    var vh = viewH(), sy = scrollY();
    mans.forEach(function (m) {
      if (!m.near) return;
      /* the same window as the CSS (COVER0 .. COVER1 percent of the paragraph's pass) */
      var c = (vh - (m.top - sy)) / Math.max(1, vh + m.h) * 100;
      paint(m, CN.clamp((c - COVER0) / (COVER1 - COVER0), 0, 1));
    });
  }
  function mFrame() { if (!mRaf && mBound) mRaf = win.requestAnimationFrame(mPaint); }
  function mBind() {
    var want = !CN.reduced() && mans.some(function (m) { return m.near; });
    if (want !== mBound) {
      mBound = want;
      var f = want ? "addEventListener" : "removeEventListener";
      win[f]("scroll", mFrame, { passive: true });
      win[f]("resize", mFrame, { passive: true });
    }
    if (want) mFrame();
  }
  function mSync() {
    var red = CN.reduced();
    mans.forEach(function (m) {
      if (red) paint(m, 1);          /* lit (CSS lights the words too) */
      else m.words.forEach(function (w) { w.lv = -1; });
    });
    mBind();
  }
  function Manifesto(p) {
    if (!p || p.nodeType !== 1) return null;
    if (p.__cnMan) return p.__cnMan;
    var m = { p: p, words: splitWords(p), top: 0, h: 0, near: false, pal: null };
    p.__cnMan = m;
    if (!m.words.length || cssWords) return m;     /* CSS does it all */
    if (!mans.length) { CN.onMotion(mSync); if (CN.onStill) CN.onStill(mSync); }
    mans.push(m);
    if ("ResizeObserver" in win) {
      if (!mRO) {
        mRO = new ResizeObserver(function () { mans.forEach(readM); mFrame(); });
        mRO.observe(doc.body);   /* anything above that changes height moves the paragraph */
      }
      mRO.observe(p);
    } else { readM(m); win.addEventListener("load", function () { readM(m); }); }
    CN.inView(p, function (vis) { m.near = !!vis; mBind(); }, { margin: "25% 0px" });
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
  /* #cnCore: the manifesto (HOOK 1). The shield story beside it is 58-shield.js. */
  function Core(section) {
    var p = CN.qs('[data-cn="manifesto"]', section);
    if (p) Manifesto(p);
    return {};
  }

  /* Build the words at start-up (markup the visitor will reach); the glow starts lazily, near
     the screen. */
  CN.manifesto = Manifesto;
  CN.glow = glow;
  CN.onReady(function () {
    CN.qsa("#home > .cn-core").forEach(function (sec) { sec.__cnCore = Core(sec); });
    CN.qsa('[data-cn="manifesto"]').forEach(Manifesto);
    CN.qsa(GLOW).forEach(glowHook);
  });
})();
