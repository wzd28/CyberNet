/* Statement (.home-quote [data-cn="scrub"]): the words brighten from --cn-text-3 to --cn-text as the
   block scrolls through the viewport. Not pinned. This file splits the text into word spans once
   (each sentence on its own line) and keeps the full sentence in a visually hidden copy for screen
   readers. CSS drives the brightness from --cn-scrub (0..1):
   - where animation-timeline: view() is supported, a CSS animation on the paragraph sets it;
   - otherwise this file sets it from the paragraph's position, only while it is on screen.
   Reduced motion: CSS shows every word bright.
   The Workspace ticker's marquee gate, Pause and list semantics live at the end of this file. */
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

  CN.onReady(function () { CN.qsa('[data-cn="scrub"]').forEach(split); });
  CN.register("scrub", function (p) { split(p); return track(p); });

  /* Workspace ticker (#wowTicker), the block just above the statement.
     - The 40s marquee runs only while it is on screen and its Pause (label.cn-ticker-pause >
       checkbox) is off: this sets --cn-ticker-play on #wowTicker, which the CSS reads. A custom
       property instead of a class or :has(), so no legacy class observer or large restyle fires.
     - Screen readers get one list of the scam types: legacy script.js doubles the items for the
       seamless loop, so every repeat is aria-hidden (re-checked whenever the items are rebuilt). */
  function ticker(t) {
    var track = CN.qs(".ticker-track", t);
    if (!track) return;
    var wrap = t.parentNode;
    var cb = wrap ? CN.qs(".cn-ticker-pause input", wrap) : null;
    var onScreen = false;
    function sync() {
      t.style.setProperty("--cn-ticker-play", onScreen && !(cb && cb.checked) ? "running" : "paused");
    }
    CN.inView(t, function (v) { onScreen = v; sync(); });
    if (cb) cb.addEventListener("change", sync);

    track.setAttribute("role", "list");
    if (!track.hasAttribute("aria-label")) track.setAttribute("aria-label", "Scam types CyberNet AI checks for");
    function mark() {
      var seen = {};
      CN.qsa(".ticker-item", track).forEach(function (it) {
        var k = (it.textContent || "").replace(/\s+/g, " ").trim();
        if (it.getAttribute("role") !== "listitem") it.setAttribute("role", "listitem");
        if (seen[k]) { if (it.getAttribute("aria-hidden") !== "true") it.setAttribute("aria-hidden", "true"); }
        else { seen[k] = 1; if (it.hasAttribute("aria-hidden")) it.removeAttribute("aria-hidden"); }
      });
    }
    mark();
    if ("MutationObserver" in win) new MutationObserver(mark).observe(track, { childList: true });
  }

  CN.onReady(function () {
    var t = doc.getElementById("wowTicker");
    if (t) ticker(t);
  });
})();
