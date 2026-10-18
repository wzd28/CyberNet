/* Home 3 \u00B7 Example scan console (#cnDemo). An illustration of a Quick Scan, clearly labelled
   "Example \u00B7 not a real scan". One run is about 7 s. v4.7 (owner: "make it super smooth"): it
   runs once, the first time the console is on screen, then rests on the result; the section's
   button then reads Play and runs it again. It draws at about 30 fps (it used to loop at 60 fps
   for as long as it was on screen, which kept a phone's main thread nearly full). Every per-frame write is an attribute change on the one element that
   uses it (a custom property on the arc, the score, the progress bar, the active highlight, or a
   class on the character being typed), so a frame restyles a handful of nodes, never the whole
   console. Attribute changes are invisible to the legacy body-wide observers (childList and
   characterData only). Without JS, or with reduced motion, the finished state shows.
   The global "Pause motion" control (html.cn-still, 03-aurora.css) also holds the loop, as do
   CN.pause() and a hidden tab; the section's own Pause button stays the visitor's control. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  // Timeline (ms). Steps on the left light up in sync with the console.
  var T = {
    type0: 300, type1: 2500,   // the message types in
    hl0: 2600, hl1: 3600,      // pressure and payment phrases highlight one by one
    link0: 3700, link1: 4250,  // then the link
    arc0: 4400, arc1: 5750,    // the meter fills while the score counts
    verdict: 5800, reasons: 6000, done: 6800,
    run: 7000, cycle: 10000, fadeIn: 260, fadeOut: 420
  };
  var STEPS = [[0, 3600], [3600, 4350], [4350, 5800], [5800, 6800]];
  // Quick Scan is rules only, so the third stage is "Scoring" (no AI cross-check), and the status
  // reads "Verdict" as soon as the badge shows, so it never lags the steps.
  var STATUS = [[0, "Reading"], [3600, "Checking link"], [4350, "Scoring"], [5800, "Verdict"], [6800, "Done"]];

  function seg(t, a, b) { return CN.clamp((t - a) / (b - a), 0, 1); }

  /* Rebuild the bubble once: a screen-reader copy of the full text, plus a visual copy made of
     per-character spans (revealed by .is-on) with the "|"-marked phrases wrapped in <mark>. */
  function buildBubble(p) {
    if (p.__cnBubble) return p.__cnBubble;
    var raw = p.getAttribute("data-cn-msg") || p.textContent || "";
    var parts = raw.split("|");
    var sr = document.createElement("span");
    sr.className = "cn-demo-sr";
    sr.textContent = parts.join("");
    var vis = document.createElement("span");
    vis.className = "cn-type";
    vis.setAttribute("aria-hidden", "true");
    var i = 0, k = 0;
    parts.forEach(function (text, n) {
      if (!text) return;
      var host = vis;
      if (n % 2 === 1) {
        host = document.createElement("mark");
        host.className = "cn-hl";
        k++;
        vis.appendChild(host);
      }
      Array.from(text).forEach(function (ch) {
        var s = document.createElement("span");
        s.className = "cn-c";
        i++;
        s.textContent = ch;
        host.appendChild(s);
      });
    });
    var frag = document.createDocumentFragment();
    frag.appendChild(sr);
    frag.appendChild(vis);
    p.textContent = "";
    p.appendChild(frag);
    p.__cnBubble = { chars: i, marks: k };
    return p.__cnBubble;
  }
  /* v4.7: the character spans are built while the browser is idle after load (the text looks
     the same until the console starts), not when the console scrolls near: building ~330 nodes
     mid-scroll cost a long frame and woke the legacy body-wide observers. */
  CN.afterLoad(function () { CN.qsa('[data-cn="demo"] [data-cn-msg]').forEach(buildBubble); });

  /* Pause / Play: the visible word carries the state, so the button is not also a pressed
     toggle (that announced "Play, pressed"). Only the first text node is swapped, which keeps a
     visually hidden context span ("the example scan") from the markup. The button is wired at
     start-up, so it answers at once even before the console (a lazy module) has started. */
  var btnState = { paused: false, sync: null };
  function label(b, word) {
    var n = b.firstChild;
    if (n && n.nodeType === 3) { if (n.nodeValue !== word) n.nodeValue = word; }
    else b.insertBefore(document.createTextNode(word), n);
    b.classList.toggle("is-paused", word === "Play");
  }
  CN.onReady(function () {
    var btn = CN.qs("#cnDemo [data-cn-demo-toggle]") || CN.qs("[data-cn-demo-toggle]");
    if (!btn) return;
    btn.removeAttribute("aria-pressed");
    label(btn, "Pause");
    if (CN.reduced()) btn.hidden = true;
    btn.addEventListener("click", function () {
      btnState.paused = !btnState.paused;
      label(btn, btnState.paused ? "Play" : "Pause");
      if (btnState.sync) btnState.sync();
    });
  });

  CN.register("demo", function (fig) {
    var sec = fig.closest(".cn-demo") || fig.parentNode;
    var btn = CN.qs("[data-cn-demo-toggle]", sec);
    var bubble = CN.qs("[data-cn-msg]", fig);
    var statusText = CN.qs("[data-cn-status-text]", fig);
    var scoreEl = CN.qs("[data-cn-score]", fig);
    var steps = CN.qsa(".cn-step", sec);
    var score = CN.clamp(parseInt(scoreEl ? scoreEl.textContent : "", 10) || 80, 0, 100);
    var info = bubble ? buildBubble(bubble) : { chars: 0, marks: 0 };

    // The elements each value drives. A custom property set on a parent restyles every descendant
    // (about 400 nodes here), so each value goes on the element that reads it.
    var chars = bubble ? CN.qsa(".cn-c", bubble) : [];
    var marks = CN.qsa(".cn-hl", fig);
    var arcEl = CN.qs(".cn-arc-val", fig);
    var progEl = CN.qs("[data-cn-progress]", fig) || CN.qs(".cn-progress i", fig);
    var fadeEls = CN.qsa(".cn-console-grid, .cn-console-foot", fig);
    var lastOn = -1, lastCaret = -1;

    var vars = {}, flags = {}, stepState = [];
    function setVar(el, name, value) {
      if (!el) return;
      var key = el.__cnKey + name;
      if (vars[key] === value) return;
      vars[key] = value;
      el.style.setProperty(name, value);
    }
    function flag(name, on) {
      if (flags[name] === on) return;
      flags[name] = on;
      fig.classList.toggle(name, on);
    }
    // Step progress goes on each step's bar, not the <li>: the <li> carries a CSS counter, and
    // restyling it every frame forces a counter update and a layout pass.
    var stepBars = steps.map(function (li) { return CN.qs(".cn-step-bar", li); });
    stepBars.forEach(function (bar, n) { if (bar) bar.__cnKey = "s" + n; });
    marks.forEach(function (m, n) { m.__cnKey = "m" + n; });
    fadeEls.forEach(function (el, n) { el.__cnKey = "f" + n; });
    if (arcEl) arcEl.__cnKey = "a";
    if (scoreEl) scoreEl.__cnKey = "n";
    if (progEl) progEl.__cnKey = "p";

    // Typing: characters up to n get .is-on (CSS fades each in); the caret sits on the newest one.
    function typeTo(n, caretOn) {
      if (n !== lastOn) {
        for (var q = 0; q < chars.length; q++) {
          var on = q < n;
          if (chars[q].__on !== on) { chars[q].__on = on; chars[q].classList.toggle("is-on", on); }
        }
        lastOn = n;
      }
      var ci = caretOn && n > 0 ? Math.min(n, chars.length) - 1 : -1;
      if (ci !== lastCaret) {
        if (lastCaret >= 0 && chars[lastCaret]) chars[lastCaret].classList.remove("is-caret");
        if (ci >= 0) chars[ci].classList.add("is-caret");
        lastCaret = ci;
      }
    }

    function render(t) {
      var lastMark = Math.max(0, info.marks - 1);
      var typed = seg(t, T.type0, T.type1) * info.chars;
      var h = seg(t, T.hl0, T.hl1) * lastMark + (info.marks ? seg(t, T.link0, T.link1) : 0);
      var arc = score * CN.easeOut(seg(t, T.arc0, T.arc1));
      var fade = CN.clamp(t < T.fadeIn ? t / T.fadeIn : t > T.cycle - T.fadeOut ? (T.cycle - t) / T.fadeOut : 1, 0, 1).toFixed(3);

      typeTo(Math.ceil(typed - 1e-6), t >= T.type0 && t < T.type1 + 250);
      // Each phrase's underline sweeps in turn; only the phrase in progress changes per frame.
      marks.forEach(function (m, k) { setVar(m, "--cn-hp", CN.clamp(h - k, 0, 1).toFixed(3)); });
      setVar(arcEl, "--cn-arc", arc.toFixed(2));
      setVar(scoreEl, "--cn-score", String(Math.round(arc)));
      setVar(progEl, "--cn-prog", seg(t, 0, T.done).toFixed(4));
      fadeEls.forEach(function (el) { setVar(el, "--cn-fade", fade); });

      flag("is-running", t < T.done);
      flag("is-verdict", t >= T.verdict);
      flag("is-reasons", t >= T.reasons);
      flag("is-done", t >= T.done);

      var label = STATUS[0][1];
      STATUS.forEach(function (s) { if (t >= s[0]) label = s[1]; });
      CN.text(statusText, label);

      steps.forEach(function (li, n) {
        var span = STEPS[n] || STEPS[STEPS.length - 1];
        var state = t < span[0] ? 0 : t < span[1] ? 1 : 2;
        setVar(stepBars[n], "--p", seg(t, span[0], span[1]).toFixed(3));
        if (stepState[n] !== state) {
          stepState[n] = state;
          li.classList.toggle("is-active", state === 1);
          li.classList.toggle("is-done", state === 2);
        }
      });
    }

    // Jump without transitions (loop restart, first frame), so nothing visibly rewinds.
    function snap(t) {
      fig.classList.add("is-snap");
      if (sec) sec.classList.add("is-snap");
      render(t);
      void fig.offsetWidth;
      fig.classList.remove("is-snap");
      if (sec) sec.classList.remove("is-snap");
    }

    var t = 0, paused = false, visible = false, finished = false, acc = 0;
    var lp = CN.loop(function (now, dt) {
      t += dt;
      if (t >= T.run) { t = T.run; render(T.run); finish(); return; }
      acc += dt;
      if (acc < 30) return;   /* about 30 fps: half the restyles, the same look */
      acc = 0;
      render(t);
    });
    /* one run is done: rest on the result; the button offers Play (a fresh run) */
    function finish() {
      finished = true;
      lp.stop();
      btnState.paused = true;
      paused = true;
      if (btn) label(btn, "Play");
      fig.classList.toggle("is-paused", true);
    }

    var root = document.documentElement;
    function still() { return CN.reduced(); }
    function held() { return root.classList.contains("cn-still"); }
    function sync() {
      if (finished && !paused && !still() && !held()) { finished = false; t = 0; acc = 0; snap(0); }
      var go = visible && !paused && !finished && !still() && !held();
      // a run starts once the page is still (CN.whenStill), never in the middle of a scroll
      if (go && !lp.running() && CN.scrolling()) { CN.whenStill(sync); go = false; }
      if (go) lp.start(); else lp.stop();
      // The status blink and the waiting skeletons are CSS loops: freeze them whenever the JS
      // timeline is not running (off screen, paused, reduced motion), not only on a user Pause.
      fig.classList.toggle("is-paused", !go);
    }
    function applyMotionPref() {
      if (still()) {
        lp.stop();
        t = T.run;
        snap(T.run);
        if (btn) btn.hidden = true;
      } else {
        if (btn) btn.hidden = false;
        if (t >= T.run && !visible) { t = 0; snap(0); }
        sync();
      }
    }

    // The Pause button is wired at start-up (below); from here on it also drives this timeline.
    btnState.sync = function () { paused = btnState.paused; sync(); };
    paused = btnState.paused;

    fig.classList.add("is-ready");
    if (still()) applyMotionPref(); else snap(0);

    CN.inView(fig, function (vis, e) {
      visible = e ? vis && e.intersectionRatio >= .28 : vis;
      sync();
    }, { threshold: [0, .3, .6] });

    // Follow the global pause (a class on <html>; attribute changes only, so this stays quiet).
    if ("MutationObserver" in window) {
      var wasHeld = held();
      new MutationObserver(function () {
        var h = held();
        if (h !== wasHeld) { wasHeld = h; sync(); }
      }).observe(root, { attributes: true, attributeFilter: ["class"] });
    }

    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", applyMotionPref);
      else if (mq.addListener) mq.addListener(applyMotionPref);
    }

    return {
      pause: function () { lp.stop(); },
      resume: sync,
      destroy: function () { lp.stop(); }
    };
  });
})();
