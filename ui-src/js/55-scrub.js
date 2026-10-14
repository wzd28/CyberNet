/* Closing (.home-quote): the statement and the big turning shield.
   Statement ([data-cn="scrub"]): the words brighten from a soft lilac to their line's colour as the
   block scrolls through the viewport. Not pinned. This file splits the text into word spans once
   (each sentence on its own line) and keeps the full sentence in a visually hidden copy for screen
   readers. CSS drives the brightness from --cn-scrub (0..1):
   - where animation-timeline: view() is supported, a CSS animation on the paragraph sets it;
   - otherwise this file sets it from the paragraph's position, only while it is on screen.
   Shield (.cn-close-shield > img): wrapped as .cn-cs-float > .cn-cs-spin with a few darker copies
   of the render stacked behind it, so the turn shows a solid edge instead of a paper-thin card
   (fewer copies on touch devices). The sway-and-turn loop and the light rays run only while the
   shield is on screen, the tab is visible, motion is allowed and nothing paused them: this file
   sets data-cn-play on .cn-close-shield (a data attribute: legacy observers watch "class").
   A Pause button (the hero's round control) is added to the stage; CN.pause() / CN.resume() (the
   page-wide motion control) reach it through the "scrub" controller.
   Reduced motion: every word is bright, the shield rests, no Pause button. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, win = window;

  /* keep in step with "animation-range: cover 14% cover 50%" in 28-home-more.css */
  var START = 0.14, END = 0.50;

  var cssTimeline = !!(win.CSS && CSS.supports &&
    CSS.supports("animation-timeline: view()") && CSS.supports("animation-range: cover 10% cover 50%"));

  function split(p) {
    if (p.__cnScrubSplit) return;
    var text = (p.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || p.children.length) return; /* plain text only; never rewrite markup */
    p.__cnScrubSplit = true;

    var sentences = text.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)/g) || [text];
    var sr = doc.createElement("span");
    sr.className = "cn-scrub-sr";
    sr.textContent = text;
    var vis = doc.createElement("span");
    vis.className = "cn-scrub-vis";
    vis.setAttribute("aria-hidden", "true");

    var i = 0;
    sentences.forEach(function (s, si) {
      var words = s.trim().split(" ").filter(Boolean);
      if (!words.length) return;
      var line = doc.createElement("span");
      line.className = "cn-scrub-line";
      words.forEach(function (w, wi) {
        var span = doc.createElement("span");
        span.className = "cn-w";
        span.style.setProperty("--i", i++);
        span.textContent = w;
        line.appendChild(span);
        if (wi < words.length - 1) line.appendChild(doc.createTextNode(" "));
      });
      if (si) vis.appendChild(doc.createTextNode(" "));
      vis.appendChild(line);
    });

    var frag = doc.createDocumentFragment();
    frag.appendChild(sr);
    frag.appendChild(vis);
    p.textContent = "";
    p.appendChild(frag);
    p.style.setProperty("--n", i);
  }

  /* fallback: progress from the paragraph's position (0 when its top meets the viewport bottom) */
  function track(p) {
    if (cssTimeline || CN.reduced()) return null;
    var raf = 0, on = false;
    function update() {
      raf = 0;
      var r = p.getBoundingClientRect(), vh = win.innerHeight || doc.documentElement.clientHeight || 1;
      var cover = (vh - r.top) / (vh + r.height);
      p.style.setProperty("--cn-scrub", CN.clamp((cover - START) / (END - START), 0, 1).toFixed(3));
    }
    function onScroll() { if (!raf) raf = requestAnimationFrame(update); }
    function bind(v) {
      if (v === on) return;
      on = v;
      var m = v ? "addEventListener" : "removeEventListener";
      win[m]("scroll", onScroll, { passive: true });
      win[m]("resize", onScroll, { passive: true });
      onScroll();
    }
    var stop = CN.inView(p, bind);
    return { destroy: function () { stop(); bind(false); } };
  }

  /* ---------- the closing shield ---------- */
  var DEPTH_FINE = 7, DEPTH_COARSE = 4;

  /* Build the depth stack once, at start-up (it only adds absolutely placed layers inside the
     shield's own fixed-size box, so the page never shifts). */
  function buildShield(box) {
    if (!box || box.__cnShield) return box && box.__cnShield;
    var img = CN.qs("img", box);
    if (!img) return null;
    var fl = doc.createElement("span");
    fl.className = "cn-cs-float";
    var spin = doc.createElement("span");
    spin.className = "cn-cs-spin";
    fl.appendChild(spin);
    img.parentNode.insertBefore(fl, img);
    var depth = CN.finePointer() ? DEPTH_FINE : DEPTH_COARSE;
    /* back to front: the turned-around back, the edge layers, then the original face on top */
    for (var z = depth; z >= 1; z--) {
      var c = img.cloneNode(false);
      c.removeAttribute("id");
      c.setAttribute("alt", "");
      c.className = z === depth ? "cn-cs-layer cn-cs-back" : "cn-cs-layer";
      c.style.setProperty("--z", z);
      spin.appendChild(c);
    }
    spin.appendChild(img);
    box.__cnShield = { box: box, spin: spin };
    return box.__cnShield;
  }

  /* The Pause control: the hero's round button in the stage's bottom corner. */
  function addPause(stage) {
    var b = CN.qs(".cn-close-pause", stage);
    if (b) return b;
    b = doc.createElement("button");
    b.type = "button";
    b.className = "cn-close-pause";
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", "Pause the shield animation");
    b.title = "Pause the shield animation";
    b.innerHTML = '<span aria-hidden="true"></span>';
    stage.appendChild(b);
    return b;
  }

  function closing(p) {
    var stage = p.closest ? p.closest(".home-quote") : null;
    var box = stage && CN.qs(".cn-close-shield", stage);
    if (!box || box.__cnPlay) return null;
    var built = buildShield(box);
    if (!built) return null;
    var btn = addPause(stage);
    var paused = false, on = false;
    function sync() {
      var still = CN.reduced();
      var play = !still && !paused && on && !doc.hidden;
      if (box.hasAttribute("data-cn-play") !== play) {
        if (play) box.setAttribute("data-cn-play", ""); else box.removeAttribute("data-cn-play");
      }
      btn.hidden = still;
      var pressed = paused ? "true" : "false";
      if (btn.getAttribute("aria-pressed") !== pressed) btn.setAttribute("aria-pressed", pressed);
    }
    btn.addEventListener("click", function () { paused = !paused; sync(); });
    CN.inView(box, function (vis) { on = vis; sync(); }, { margin: "80px 0px" });
    CN.onVisibility(sync);
    CN.onMotion(sync);
    box.__cnPlay = sync;
    sync();
    return {
      pause: function () { paused = true; sync(); },
      resume: function () { paused = false; sync(); }
    };
  }

  /* Split and build at start-up (they set up markup the visitor will reach); the scroll
     fallback and the shield's play gate start lazily with the "scrub" module. */
  CN.onReady(function () {
    CN.qsa('[data-cn="scrub"]').forEach(function (p) {
      split(p);
      var stage = p.closest ? p.closest(".home-quote") : null;
      if (stage && buildShield(CN.qs(".cn-close-shield", stage))) addPause(stage).hidden = CN.reduced();
    });
  });
  CN.register("scrub", function (p) {
    split(p);
    var t = track(p), c = closing(p);
    if (!t && !c) return null;
    return {
      pause: function () { if (c) c.pause(); },
      resume: function () { if (c) c.resume(); },
      destroy: function () { if (t) t.destroy(); }
    };
  });
})();
