/* CyberNet UI: count-up numbers (owner: aurora).
   <span data-cn-count="442" data-prefix="$" data-suffix="B">$442B</span>
   counts from 0 (or data-from) to the value once, when it comes into view (data-cn-count-dur sets
   the length in ms; 1700 by default), easing out hard so the last digits settle slowly, the way a
   mechanical counter does. While it runs the number carries .is-counting (a soft glow, 02-components.css)
   and .is-done after. Decimals follow the
   value as written ("4.5" counts with one decimal) unless data-decimals says otherwise;
   thousands get commas. The text written in the HTML is the source of truth: it is what
   crawlers, no-JS visitors and reduced-motion visitors see, and it is put back exactly at the
   end. Text is written at most every 48 ms, and only when it changes, and in place (CN.text: the
   one text node's value changes), because the body-wide MutationObservers in
   cybernet-final-ui-fix.js and cybernet-legal-upgrade.js re-run their set-up for every added node. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  var DURATION = 1700, STEP_MS = 48;
  // Exponential ease-out: fast through the big digits, a long gentle settle on the last ones.
  function ease(p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); }

  function format(v, c) {
    return c.pre + v.toLocaleString("en-US", { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec }) + c.suf;
  }

  function read(el) {
    var raw = String(el.getAttribute("data-cn-count") || "").replace(/,/g, "").trim();
    var to = parseFloat(raw);
    if (!isFinite(to)) return null;
    var dot = raw.indexOf(".");
    var dec = el.hasAttribute("data-decimals") ? parseInt(el.getAttribute("data-decimals"), 10) || 0 : (dot < 0 ? 0 : raw.length - dot - 1);
    return {
      to: to,
      from: parseFloat(el.getAttribute("data-from")) || 0,
      dec: Math.min(dec, 4),
      pre: el.getAttribute("data-prefix") || "",
      suf: el.getAttribute("data-suffix") || "",
      dur: Math.max(400, Math.min(4000, parseInt(el.getAttribute("data-cn-count-dur"), 10) || DURATION)),
      final: el.textContent
    };
  }

  // Hold the final width so the line does not reflow while the digits grow (inline only;
  // a block-level number reflows nothing). Measured with the final text in place.
  function lockWidth(el, c) {
    if (el.__cnLocked) return;
    var cs = window.getComputedStyle(el);
    if (cs.display !== "inline" && cs.display !== "inline-block") { el.__cnLocked = true; return; }
    var now = el.textContent;
    CN.text(el, c.final);
    var w = el.getBoundingClientRect().width;
    CN.text(el, now);
    if (!w) return;
    if (cs.display === "inline") el.style.display = "inline-block";
    el.style.minWidth = Math.ceil(w) + "px";
    el.__cnLocked = true;
  }
  /* The same for every number that comes near in one go: all reads first, then all writes, in
     one animation frame (numbers that come near together, like the four Home stats, used to force
     a page layout each, from inside the observer's callbacks). The text is the final one then. */
  var lockQueue = [];
  function lockSoon(el, c, then) {
    lockQueue.push({ el: el, c: c, then: then });
    if (lockQueue.length === 1) requestAnimationFrame(flushLocks);
  }
  function flushLocks() {
    var list = lockQueue;
    lockQueue = [];
    list.forEach(function (x) {
      if (x.el.__cnLocked || x.el.textContent !== x.c.final) return;
      var d = window.getComputedStyle(x.el).display;
      x.inline = d === "inline" || d === "inline-block";
      x.d = d;
      x.w = x.inline ? x.el.getBoundingClientRect().width : 0;
    });
    list.forEach(function (x) {
      if (!x.el.__cnLocked && x.d) {
        if (!x.inline) x.el.__cnLocked = true;
        else if (x.w) {
          if (x.d === "inline") x.el.style.display = "inline-block";
          x.el.style.minWidth = Math.ceil(x.w) + "px";
          x.el.__cnLocked = true;
        }
      }
      x.then();
    });
  }

  function run(el, c) {
    lockWidth(el, c);
    var start = 0, lastWrite = 0, shown = el.textContent;
    function frame(t) {
      if (!start) start = t;
      var p = Math.min(1, (t - start) / c.dur);
      if (p >= 1) {
        CN.text(el, c.final);
        el.classList.remove("is-counting");
        el.classList.add("is-done");
        return;
      }
      if (t - lastWrite >= STEP_MS) {
        var v = c.from + (c.to - c.from) * ease(p);
        var s = format(c.dec ? v : Math.round(v), c);
        if (s !== shown) { CN.text(el, s); shown = s; }
        lastWrite = t;
      }
      requestAnimationFrame(frame);
    }
    el.classList.add("is-counting");
    requestAnimationFrame(frame);
  }

  // The HTML text is the resting state. The from-value is shown only while a count is about
  // to run (the number is within 40% of a screen of the viewport) or is running. If it leaves
  // that zone before the count starts (a fast flick past it, a long task that made the
  // observer miss a short visit), the real number goes straight back, so "$0B" can never be
  // left on screen. The count starts as soon as the number is clearly inside the viewport.
  // No getBoundingClientRect at init: nothing is measured until the number is near.
  function setup(el) {
    if (el.__cnCount) return;
    el.__cnCount = true;
    var c = read(el);
    // Reduced motion or a bad value: keep the final text.
    if (!c || CN.reduced()) return;
    var primed = false, started = false, stopNear = null, stopStart = null;
    function begin() {
      if (started) return;
      started = true;
      if (stopStart) stopStart();
      if (stopNear) stopNear();
      run(el, c);
    }
    stopNear = CN.inView(el, function (near) {
      if (started) return;
      if (near && !primed) {
        primed = true;
        lockSoon(el, c, function () {
          if (!primed || started || stopStart) return;
          CN.text(el, format(c.from, c));
          stopStart = CN.inView(el, function (vis) { if (vis) begin(); }, { margin: "0px 0px -12% 0px" });
          if (started && stopStart) stopStart();
        });
      } else if (!near && primed) {
        primed = false;
        if (stopStart) { stopStart(); stopStart = null; }
        CN.text(el, c.final);
      }
    }, { margin: "40% 0px 40% 0px" });
    if (started && stopNear) stopNear();
  }

  CN.onReady(function () { CN.qsa("[data-cn-count]").forEach(setup); });
})();
