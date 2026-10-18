/* Closing (.home-quote): the statement and the chrome shield emblem.
   Statement ([data-cn="scrub"]): the words brighten from slate to their line's colour. This file
   splits the text into word spans once (each sentence on its own line) and keeps the full
   sentence in a visually hidden copy for screen readers. v4.7 (owner: "make it super smooth"):
   the words light up once, in reading order, when 40% of the statement is on screen (this file
   sets data-cn-lit; 28-home-more.css runs a colour transition per word). They no longer follow
   the scroll: that was a scroll-timeline custom property that restyled every word on every
   scrolled frame.
   Shield (.cn-close-shield > img): wrapped once in .cn-cs-float (v4.7: it rests; the float loop
   is gone). data-cn-play is still set on .cn-close-shield while it is on screen, the tab is
   visible, motion is allowed and nothing paused it (a data attribute: legacy observers watch
   "class"), so a later look can hang motion on it.
   A Pause button (the hero's round control) is added to the stage; CN.pause() / CN.resume() (the
   page-wide motion control) reach it through the "scrub" controller.
   Reduced motion: every word is bright, the shield rests, no Pause button. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, win = window;

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

  /* the words light up once, when the statement is well on screen (reduced motion and Pause
     motion: CSS shows them lit) */
  function light(p) {
    if (p.hasAttribute("data-cn-lit")) return null;
    var stop = CN.once(p, function () { CN.whenStill(function () { p.setAttribute("data-cn-lit", ""); }); }, { threshold: .4 });
    return { destroy: stop };
  }

  /* ---------- the closing shield ---------- */
  /* Wrap the emblem once, at start-up (an absolutely placed wrapper inside the shield's own
     fixed-size box, so the page never shifts). */
  function buildShield(box) {
    if (!box || box.__cnShield) return box && box.__cnShield;
    var img = CN.qs("img", box);
    if (!img) return null;
    var fl = doc.createElement("span");
    fl.className = "cn-cs-float";
    img.parentNode.insertBefore(fl, img);
    fl.appendChild(img);
    box.__cnShield = { box: box, float: fl };
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
    var t = light(p), c = closing(p);
    if (!t && !c) return null;
    return {
      pause: function () { if (c) c.pause(); },
      resume: function () { if (c) c.resume(); },
      destroy: function () { if (t) t.destroy(); }
    };
  });
})();
