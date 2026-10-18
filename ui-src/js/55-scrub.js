/* Closing (.home-quote), v5 "Last Light" (owner: home-close). Technique after React Bits
   (MIT + Commons Clause, (c) 2026 David Haz); re-implemented.
   Statement ([data-cn="scrub"]): split once into word spans, one line per sentence, with a visually
   hidden full copy for screen readers; --i is the word's index in its sentence.
   - Sentence 1 SETs on every motion tier: its words rise out of the line's mask (data-cn-set, once
     a quarter of the statement is on screen).
   - Sentence 2 LIGHTs once, at 40% visible and still (data-cn-lit: compositor opacity transitions,
     45 ms apart), on every tier. The SPEC's desktop scrubs here (this word scrub, and the shield's
     depth scrub) were built and measured: with either one, desktop Home dropped 34 to 42% of frames
     (smooth.mjs, 4x CPU) against about 19% without, the extra time inside ScrollTrigger's scroll
     handler, so neither is used.
   - The CTA row (.cn-close, data-cn-cta = arm | in | done) settles as the one-shot's last word
     starts, and at the latest 2.5 s after the row is on screen. The
     closing CTA then runs its one star lap (CSS); "done" keeps a re-shown page from replaying it.
   Hidden "before" states are armed only when the statement's first report finds it off screen.
   Shield (.cn-close-shield; the filtered img itself never moves): a one-shot rise as it enters
   (reveal "trigger", 28-home-more.css).
   A Pause button (shown only while focused) stays on the stage for keyboard users; CN.pause() /
   CN.resume() reach it through the "scrub" controller.
   Reduced motion / Pause motion: everything final (CSS), nothing starts. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document;

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

    p.__cnW = [];
    sentences.forEach(function (s, si) {
      var words = s.trim().split(" ").filter(Boolean), list = [];
      if (!words.length) return;
      var line = doc.createElement("span");
      line.className = "cn-scrub-line";
      words.forEach(function (w, wi) {
        var span = doc.createElement("span");
        span.className = "cn-w";
        span.style.setProperty("--i", wi);
        span.textContent = w;
        line.appendChild(span);
        list.push(span);
        if (wi < words.length - 1) line.appendChild(doc.createTextNode(" "));
      });
      if (si) vis.appendChild(doc.createTextNode(" "));
      vis.appendChild(line);
      p.__cnW.push(list);
    });

    var frag = doc.createDocumentFragment();
    frag.appendChild(sr);
    frag.appendChild(vis);
    p.textContent = "";
    p.appendChild(frag);
  }

  /* Wrap the emblem once, at start-up (an absolutely placed wrapper inside the shield's own
     fixed-size box, so the page never shifts). */
  function buildShield(box) {
    var img = box && !box.__cnShield && CN.qs("img", box);
    if (!img) return;
    var fl = doc.createElement("span");
    fl.className = "cn-cs-float";
    img.parentNode.insertBefore(fl, img);
    fl.appendChild(img);
    box.__cnShield = 1;
  }

  /* The Pause control: the hero's round button in the stage's bottom corner. */
  function addPause(stage) {
    var b = CN.qs(".cn-close-pause", stage);
    if (b) return b;
    b = doc.createElement("button");
    b.type = "button";
    b.className = "cn-close-pause";
    b.setAttribute("aria-label", "Pause the shield animation");
    b.title = "Pause the shield animation";
    b.innerHTML = '<span aria-hidden="true"></span>';
    b.hidden = CN.reduced();
    stage.appendChild(b);
    pressed(b, false);
    b.addEventListener("click", function () { pressed(b, b.getAttribute("aria-pressed") != "true"); });
    CN.onMotion(function (still) { b.hidden = still; });
    return b;
  }
  function pressed(b, on) { b.setAttribute("aria-pressed", on ? "true" : "false"); }

  function closing(p) {
    var M = CN.motion, stage = p.closest(".home-quote"), row = CN.qs(".cn-close", stage), box = CN.qs(".cn-close-shield", stage);
    var w2 = p.__cnW[1] || [];
    function at(el, k, v) { if (el) el.setAttribute(k, v || ""); }
    function settle() {
      if (!row || row.getAttribute("data-cn-cta") != "arm") return;
      at(row, "data-cn-cta", "in");
      setTimeout(at, 3800, row, "data-cn-cta", "done");
    }
    function oneShot() {
      CN.once(p, function () {
        CN.whenStill(function () { at(p, "data-cn-lit"); setTimeout(settle, Math.max(w2.length - 1, 0) * 45); });
      }, { threshold: .4 });
    }
    /* the first report decides: off screen -> arm the hidden states; on screen -> leave it */
    var stop = CN.inView(p, function (vis) {
      stop();
      if (vis || CN.reduced()) return;
      at(p, "data-cn-arm");
      at(row, "data-cn-cta", "arm");
      CN.once(p, function () { at(p, "data-cn-set"); }, { threshold: .25 });
      if (row) CN.once(row, function () { setTimeout(settle, 2500); });
    });
    oneShot();
    if (M && M.feature("star")) at(row, "data-cn-star");
    if (M && box) M.reveal(box, "trigger");
  }

  /* Split, wrap and arm at start-up (everything is far below the fold then). */
  CN.onReady(function () {
    CN.qsa('[data-cn="scrub"]').forEach(function (p) {
      var stage = p.closest(".home-quote");
      split(p);
      if (!stage || !p.__cnW) return;
      buildShield(CN.qs(".cn-close-shield", stage));
      addPause(stage);
      try { closing(p); } catch (e) { if (window.console) console.error("[cn:scrub]", e); }
    });
  });
  CN.register("scrub", function (p) {
    var stage = p.closest(".home-quote"), b = stage && CN.qs(".cn-close-pause", stage);
    return b ? {
      pause: function () { pressed(b, true); },
      resume: function () { pressed(b, false); }
    } : null;
  });
})();
