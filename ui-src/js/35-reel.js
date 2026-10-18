/* Home 6 · Three tools (#cnFlow): an accessible tabbed reel on a navy stage.
   Tabs follow the WAI-ARIA tabs pattern (aria-selected, roving tabindex, arrow/Home/End keys,
   inactive panels inert + aria-hidden). Auto-advance runs only while the reel is on screen and the
   tab is visible: the active tab's progress line is a CSS animation over data-interval, and its
   animationend moves to the next tab, so pausing just freezes the line. Clicking or arrowing to a
   tab stops auto-advance. The Analysis AI bubble ([data-cn-stream]) streams in word by word
   whenever its panel shows (a class per word, so a frame restyles one word, not the whole bubble).
   Each tab's one-line description is copied once into its panel as a caption (.cn-reel-cap).

   v4.1 stage: a quiet decorative scene (.cn-flow-stage, aria-hidden) is built next to the tabs:
   the chrome shield floats inside two thin tilted orbit lines (the section's motion canvas
   draws the travelling light). A tool change sets data-cn-tool on the reel (scan | ai | rec); v5
   the shield stays still through it. Its one small loop runs only while the stage is on screen,
   the tab is visible, motion is allowed and the section is not paused (data-cn-play on the
   stage). The one Pause/Play button pauses all motion in the section (the tour and the
   stage); Play also restarts a tour stopped by a tab click.
   CN.pause() / CN.resume() (the page-wide motion control) reach it through CN.register.
   Reduced motion: no auto-advance, no streaming, no loops, instant switches.
   v5 (owner: home-close): the reel SETTLEs as one block (CN.motion.reveal), and from the first
   tool change on data-cn-swap is set on it, so CSS runs the panel swap (out 180 ms exit, in 520 ms
   expo) only for real changes, never on the first show. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  var WORD_MS = 55, STREAM_DELAY = 420;

  /* Wrap words once so the stream is driven by classes on the words, not DOM text writes. */
  function wrapWords(el) {
    var parts = (el.textContent || "").trim().split(/(\s+)/), words = [];
    el.textContent = "";
    parts.forEach(function (w) {
      if (!w) return;
      if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(" ")); return; }
      var s = document.createElement("span");
      s.className = "cn-w";
      s.textContent = w;
      el.appendChild(s);
      words.push(s);
    });
    return words;
  }

  /* Pause / Play: the visible word carries the state (no aria-pressed, which announced
     "Play, pressed"). Only the first text node changes, so a visually hidden context span from
     the markup ("the tool tour") survives. */
  function setLabel(b, word) {
    var n = b.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== word) n.nodeValue = word; }
    else b.insertBefore(document.createTextNode(word), n);
    b.classList.toggle("is-paused", word === "Play");
  }

  /* The decorative stage: a soft light, a contact shadow, then a 3D layer holding a tilted orbit
     (two hairlines) and the shield. Built once, before the reel is shown, so it never shifts the
     page when it scrolls into view. */
  function buildStage(reel, list) {
    var st = CN.qs(".cn-flow-stage", reel);
    if (st) return st;
    st = document.createElement("div");
    st.className = "cn-flow-stage";
    st.setAttribute("aria-hidden", "true");
    st.innerHTML =
      '<i class="cn-fs-glow"></i><i class="cn-fs-floor"></i>' +
      '<span class="cn-fs-3d">' +
        '<span class="cn-fs-orbit"><i class="cn-fs-path"></i><i class="cn-fs-path cn-fs-path--b"></i></span>' +
        '<i class="cn-fs-shield"></i>' +
      '</span>';
    list.parentNode.insertBefore(st, list.nextSibling);
    return st;
  }

  /* Set up eagerly (not lazily like other modules): the tabbed layout replaces the stacked no-JS
     layout, so doing it on scroll-in would shift the page as it comes into view. Playback still
     waits for the reel to be on screen (CN.inView below). */
  function initReel(reel) {
    var list = CN.qs('[role="tablist"]', reel);
    var tabs = CN.qsa('[role="tab"]', reel);
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls") || ""); });
    if (!list || !tabs.length || panels.some(function (p) { return !p; })) return null;
    var btn = CN.qs("[data-cn-reel-pause]", reel);
    var interval = Math.max(2500, parseInt(reel.getAttribute("data-interval"), 10) || 6500);
    reel.style.setProperty("--cn-reel-int", interval + "ms");
    /* the tool key of each panel: cnPanelScan -> "scan", cnPanelAi -> "ai", cnPanelRec -> "rec" */
    var keys = panels.map(function (p, i) { return (p.id.replace(/^cnPanel/, "") || String(i)).toLowerCase(); });

    var idx = 0;
    tabs.forEach(function (t, i) { if (t.getAttribute("aria-selected") === "true") idx = i; });

    var stopped = CN.reduced(); // a tab was chosen by hand (or motion is reduced): no auto-advance
    var paused = false;         // Pause button, or the page-wide motion control
    var inview = false;         // the reel is properly on screen (tour)
    var stageOn = false;        // any part of the stage is on screen (ambient loops)

    var stage = buildStage(reel, list);

    /* Captions: the tab's description, shown above the miniature. The tab keeps only its name
       for assistive tech, and the caption (inside the panel) is read with the panel. */
    tabs.forEach(function (t, i) {
      var d = CN.qs("small", t), p = panels[i];
      if (!d || CN.qs(".cn-reel-cap", p)) return;
      var cap = document.createElement("p");
      cap.className = "cn-reel-cap";
      cap.textContent = (d.textContent || "").trim();
      p.insertBefore(cap, p.firstChild);
      d.setAttribute("aria-hidden", "true");
    });

    /* Streams and rings inside panels */
    var streams = panels.map(function (p) {
      var el = CN.qs("[data-cn-stream]", p);
      if (!el) return null;
      var words = wrapWords(el);
      p.style.setProperty("--cn-stream-ms", (STREAM_DELAY + words.length * WORD_MS) + "ms");
      return { el: el, words: words, n: words.length, k: words.length };
    });
    panels.forEach(function (p) {
      CN.qsa(".cn-mini-ring", p).forEach(function (ring) {
        var to = parseFloat(ring.getAttribute("stroke-dashoffset"));
        ring.style.setProperty("--cn-ring-to", String(isFinite(to) ? to : 0));
      });
    });

    // The first k words carry .is-on; while .is-streaming is on the bubble, the others are hidden.
    function setOn(s, k) {
      if (k === s.k) return;
      for (var q = 0; q < s.words.length; q++) {
        var on = q < k;
        if (s.words[q].__on !== on) { s.words[q].__on = on; s.words[q].classList.toggle("is-on", on); }
      }
      s.k = k;
    }
    function finish(s) {
      setOn(s, s.n);
      s.el.classList.remove("is-streaming");
    }
    var cur = null, st = 0;
    var streamLoop = CN.loop(function (now, dt) {
      if (!cur) { streamLoop.stop(); return; }
      st += dt;
      var w = st / WORD_MS;
      if (w >= cur.n) { var done = cur; cur = null; streamLoop.stop(); finish(done); return; }
      setOn(cur, Math.max(0, Math.ceil(w)));
    });
    function stream(s) {
      if (!s) return;
      if (CN.reduced()) { finish(s); return; }
      cur = s;
      st = -STREAM_DELAY;
      setOn(s, 0);
      s.el.classList.add("is-streaming");
      streamLoop.start();
    }

    /* Keep the active chip visible in a scrolling tab row without scrolling the page. Read in the
       next frame, after this tab change has been written (a read right here forced an extra
       layout of the page in the middle of the change). */
    var keepRaf = 0;
    function keepVisible(tab) {
      if (keepRaf) cancelAnimationFrame(keepRaf);
      keepRaf = requestAnimationFrame(function () { keepRaf = 0; keepVisibleNow(tab); });
    }
    function keepVisibleNow(tab) {
      if (list.scrollWidth <= list.clientWidth + 1) return;
      var lr = list.getBoundingClientRect(), tr = tab.getBoundingClientRect(), pad = 16, d = 0;
      if (tr.left < lr.left + pad) d = tr.left - lr.left - pad;
      else if (tr.right > lr.right - pad) d = tr.right - lr.right + pad;
      if (!d) return;
      try { list.scrollBy({ left: d, behavior: CN.reduced() ? "auto" : "smooth" }); } catch (e) { list.scrollLeft += d; }
    }

    function select(i, force) {
      i = (i + tabs.length) % tabs.length;
      var changed = i !== idx || force;
      idx = i;
      tabs.forEach(function (t, k) {
        var on = k === i;
        if (t.getAttribute("aria-selected") !== String(on)) t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (t.classList.contains("is-active") !== on) t.classList.toggle("is-active", on);
      });
      panels.forEach(function (p, k) {
        var on = k === i;
        if (p.classList.contains("is-active") !== on) p.classList.toggle("is-active", on);
        if (on) { p.removeAttribute("aria-hidden"); p.removeAttribute("inert"); }
        else { p.setAttribute("aria-hidden", "true"); p.setAttribute("inert", ""); }
      });
      /* the current tool (a data attribute: legacy observers watch "class") */
      if (reel.getAttribute("data-cn-tool") !== keys[i]) reel.setAttribute("data-cn-tool", keys[i]);
      if (changed && reel.classList.contains("is-shown")) { stream(streams[i]); reel.setAttribute("data-cn-swap", ""); }
      keepVisible(tabs[i]);
    }

    var lastLabel = null;
    function sync() {
      var still = CN.reduced();
      var auto = !stopped && !still;
      var playing = auto && !paused && inview && !document.hidden;
      var ambient = !still && !paused && stageOn && !document.hidden;
      if (reel.classList.contains("is-auto") !== auto) reel.classList.toggle("is-auto", auto);
      if (reel.classList.contains("is-playing") !== playing) reel.classList.toggle("is-playing", playing);
      if (stage.hasAttribute("data-cn-play") !== ambient) {
        if (ambient) stage.setAttribute("data-cn-play", ""); else stage.removeAttribute("data-cn-play");
      }
      if (btn) {
        var label = paused ? "Play" : "Pause";
        if (label !== lastLabel) {
          lastLabel = label;
          setLabel(btn, label);
        }
        btn.hidden = still;
      }
    }

    function choose(i, focus) {
      stopped = true;
      select(i);
      if (focus) { try { tabs[idx].focus({ preventScroll: true }); } catch (e) { tabs[idx].focus(); } }
      sync();
    }

    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { choose(i, false); });
    });
    list.addEventListener("keydown", function (e) {
      var rtl = getComputedStyle(list).direction === "rtl", step = 0, to = null;
      switch (e.key) {
        case "ArrowRight": step = rtl ? -1 : 1; break;
        case "ArrowLeft": step = rtl ? 1 : -1; break;
        case "ArrowDown": step = 1; break;
        case "ArrowUp": step = -1; break;
        case "Home": to = 0; break;
        case "End": to = tabs.length - 1; break;
        default: return;
      }
      e.preventDefault();
      choose(to === null ? idx + step : to, true);
    });

    if (btn) {
      btn.addEventListener("click", function () {
        if (!paused) paused = true;
        else {
          paused = false;
          if (stopped) { stopped = false; reel.classList.remove("is-auto"); void reel.offsetWidth; } // restart the line
        }
        sync();
      });
    }

    // The active tab's line finished: move on (only while auto-advancing).
    reel.addEventListener("animationend", function (e) {
      if (e.animationName !== "cn-reel-fill" || stopped || paused) return;
      select(idx + 1);
    });

    /* Orientation follows the layout: a column of tabs on wide screens, a row on phones. */
    function orient() {
      var vertical = tabs.length > 1 && tabs[1].offsetTop > tabs[0].offsetTop + 4;
      var v = vertical ? "vertical" : "horizontal";
      if (list.getAttribute("aria-orientation") !== v) list.setAttribute("aria-orientation", v);
    }

    if (btn) btn.removeAttribute("aria-pressed");
    if (CN.motion) CN.motion.reveal(reel);
    reel.classList.add("is-ready");
    select(idx, true);
    orient();
    sync();
    if ("ResizeObserver" in window) new ResizeObserver(orient).observe(reel);
    else window.addEventListener("resize", orient);

    CN.inView(reel, function (vis, e) {
      inview = e ? vis && e.intersectionRatio >= .25 : vis;
      if (inview && !reel.classList.contains("is-shown")) {
        reel.classList.add("is-shown");
        stream(streams[idx]);
      }
      sync();
    }, { threshold: [0, .3, .6] });
    CN.inView(stage, function (vis) { stageOn = vis; sync(); });
    CN.onVisibility(sync);
    CN.onMotion(function (still) {
      if (still) {
        stopped = true;
        if (cur) { var c = cur; cur = null; streamLoop.stop(); finish(c); }
      }
      sync();
    });

    return {
      pause: function () { paused = true; sync(); },
      resume: function () { paused = false; sync(); }
    };
  }

  /* eager: the tabbed layout (and the stage) exist before the visitor reaches the section */
  CN.register("reel", function (el) {
    try { return initReel(el); } catch (err) { if (window.console) console.error("[cn:reel]", err); return null; }
  }, { eager: true });
})();
