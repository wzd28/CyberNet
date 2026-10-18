/* CyberNet UI v5: CN.numerals, rolling numerals (owner: home-story; v5 SPEC 4.3; CSS in
   51-numerals.css), and the [data-cn-count] markup hook. Technique after React Bits (MIT +
   Commons Clause, (c) 2026 David Haz); re-implemented (Counter / CountUp).

   CN.numerals.mount(el, { zero })   builds el's odometer once, at idle and when the page is
       still (DOM insertion never happens mid-scroll): el keeps its real text in a visually hidden
       span.cn-num-sr (CN.text writes it), and an aria-hidden twin span.cn-num-od holds the static
       glyphs ("$", ",", "B") as text plus one span.cn-num-c per digit. Each column holds ONE strip
       span.cn-num-s whose text is "0" to "9" twice (three times for the ones column, for its two
       extra turns), white-space: pre at a 1.1em pitch; a hidden "0" (::before) sets the column's
       width from the font. About two elements per digit. zero: the columns start at 0 (a tally
       is about to run), else at el's own value. ASCII digits only; any other text stays text.
   CN.numerals.set(el, value, { duration, delay, stagger })   value: the exact text (a number is
       written as String(n)). Rolls only the columns whose digit
       changed, always forward, 60 ms apart left to right; 1100 ms the first time (ones +2 turns,
       tens +1), 600 ms after. duration 0 snaps (per-frame use). Fewer digits than columns pads
       with hidden leading zeros. Not mounted (or reduced motion): writes the text (CN.text).
   CN.numerals.finish(el?)   the final value at once (Pause motion calls it for all).
   The strip moves with a transform transition on the compositor; the per-column duration and
   delay are custom properties on the strip itself (a leaf), so a frame restyles two nodes.

   [data-cn-count] (markup, unchanged): <span data-cn-count="442" data-prefix="$" data-suffix="B">
   $442B</span>. The HTML text is the resting truth (crawlers, no JS, reduced motion). Integers:
   the odometer is built at zero when the number comes within 40% of a screen, and tallies once
   it is clearly on screen (300 ms after, so its tile's rule draws first); leaving before that
   puts the real value straight back. Decimals keep a text count-up (48 ms CN.text throttle).
   data-from, data-decimals and data-cn-count-dur work as before. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, M = CN.motion, ALL = [];
  var TEN = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9";
  var idle = window.requestIdleCallback ? function (f) { requestIdleCallback(f, { timeout: 600 }); } : function (f) { setTimeout(f, 80); };
  function still() { return M ? M.reduced() : CN.reduced(); }
  function span(c, t) { var s = doc.createElement("span"); s.className = c; if (t) s.textContent = t; return s; }
  function shape(t) { return t.replace(/\d/g, "0"); }
  function digits(t) { return t.match(/\d/g) || []; }
  function state(el) { return el.__cnNum || (el.__cnNum = { el: el, t: el.textContent }); }
  /* one custom property on one strip, written only when it changes */
  function put(c, k, v) { if (c[k] !== v) { c[k] = v; c.s.style.setProperty(k, v); } }
  function pos(c, n, dur, dl) { c.n = n; put(c, "--cn-nd", dur + "ms"); put(c, "--cn-ndl", dl + "ms"); put(c, "--n", String(n)); }

  function build(st, zero) {
    var el = st.el, t = st.t, od = span("cn-num-od"), sr = span("cn-num-sr"), cols = [], n = digits(t).length;
    od.setAttribute("aria-hidden", "true");
    t.split(/(\d)/).forEach(function (p) {
      if (!p) return;
      if (!/\d/.test(p)) return od.appendChild(doc.createTextNode(p));
      var c = { e: span("cn-num-c"), s: span("cn-num-s", TEN + "\n" + TEN + (cols.length == n - 1 ? "\n" + TEN : "")) };
      c.s.__cnCol = c;
      c.e.appendChild(c.s);
      od.appendChild(c.e);
      cols.push(c);
      pos(c, zero ? 0 : +p, 0, 0);
    });
    sr.textContent = t;
    el.textContent = "";
    el.appendChild(sr);
    el.appendChild(od);
    st.cols = cols; st.sr = sr; st.sh = shape(t); st.go = 0;
    /* after a roll, a column past 9 snaps back a turn (the same digit), ready to roll forward */
    od.addEventListener("transitionend", function (e) { var c = e.target.__cnCol; if (c && c.n > 9) pos(c, c.n % 10, 0, 0); });
    if (ALL.indexOf(st) < 0) ALL.push(st);
  }

  /* phones and tablets (finish, 18 Oct; SPEC kill order, phone step 3): no odometer DOM, the
     text counts instead (set() writes the text; [data-cn-count] runs the text count-up) */
  function mount(el, o) {
    if (!el || still() || !CN.finePointer()) return;
    var st = state(el);
    if (st.cols || st.q || !/\d/.test(st.t)) return;   /* \d is ASCII only: other digit systems stay text */
    st.q = 1;
    idle(function () {
      CN.whenStill(function () {
        st.q = 0;
        if (still() || !el.isConnected) return;
        build(st, o && o.zero);
        /* a set() that came before the build: roll two frames on, once the columns are styled */
        var a = st.v;
        st.v = null;
        if (a) CN.raf(function () { CN.raf(function () { set(el, a[0], a[1]); }); });
      });
    });
  }

  function set(el, v, o) {
    if (!el) return;
    o = o || {};
    var st = state(el), t = String(v);
    st.t = t;
    if (!st.cols) {
      if (st.q) st.v = [t, o];
      else CN.text(el, t);
      return;
    }
    CN.text(st.sr, t);
    var ds = digits(t), z = st.cols.length - ds.length, k = 0;
    if (z > 0) {
      var pad = t.replace(/\d/, function (d) { return new Array(z + 1).join("0") + d; });
      if (shape(pad) == st.sh) ds = digits(pad); else z = -1;
    } else if (shape(t) != st.sh) z = -1;
    if (z < 0) return build(st);   /* a new shape (999 -> 1,000): rebuilt at the value */
    var dur = still() ? 0 : o.duration != null ? o.duration : st.go ? 600 : 1100, last = ds.length - 1;
    /* a tally from zero: the ones column turns twice more, the tens once */
    var tally = dur && st.cols.every(function (c) { return !c.n; });
    if (dur) st.go = 1;
    st.cols.forEach(function (c, i) {
      var d = +ds[i], cur = c.n % 10, np = dur ? c.n - cur + d + (d < cur ? 10 : 0) : d, lz = i < z;
      if (lz != !!c.z) { c.z = lz; c.e.toggleAttribute("data-z", lz); }
      if (tally) np += i == last ? 20 : i == last - 1 ? 10 : 0;
      if (np != c.n) pos(c, np, dur, dur ? (o.delay || 0) + k++ * (o.stagger != null ? o.stagger : 60) : 0);
    });
  }

  function finish(el) {
    (el ? [state(el)] : ALL).forEach(function (st) {
      st.v = null;
      if (!st.cols) return;
      var ds = digits(st.t), z = st.cols.length - ds.length;
      st.cols.forEach(function (c, i) { pos(c, i < z ? 0 : +ds[i - Math.max(0, z)] || 0, 0, 0); });
      st.go = 1;
    });
  }

  CN.numerals = { mount: mount, set: set, finish: finish };

  /* ---------- [data-cn-count] ---------- */
  function count(el, c) {
    var t0 = 0, last = 0, lp = CN.loop(function (t) {
      t0 = t0 || t;
      var p = Math.min(1, (t - t0) / c.dur);
      if (p >= 1) { lp.stop(); return CN.text(el, c.fin); }
      if (t - last < 48) return;
      last = t;
      CN.text(el, c.pre + (c.from + (c.to - c.from) * (1 - Math.pow(2, -10 * p))).toLocaleString("en-US", { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec }) + c.suf);
    });
    lp.start();
  }
  function hook(el) {
    var raw = String(el.getAttribute("data-cn-count") || "").replace(/,/g, "").trim(), to = parseFloat(raw);
    if (!isFinite(to) || still() || el.__cnCount) return;
    el.__cnCount = 1;
    var dot = raw.indexOf("."), c = {
      to: to, fin: el.textContent, from: parseFloat(el.getAttribute("data-from")) || 0,
      dec: Math.min(4, el.hasAttribute("data-decimals") ? parseInt(el.getAttribute("data-decimals"), 10) || 0 : dot < 0 ? 0 : raw.length - dot - 1),
      pre: el.getAttribute("data-prefix") || "", suf: el.getAttribute("data-suffix") || "",
      dur: Math.max(400, Math.min(4000, parseInt(el.getAttribute("data-cn-count-dur"), 10) || 1100))
    };
    var near = 0, done = 0, stopIn = null;
    function begin(vis) {
      if (!vis || done) return;
      done = 1;
      stopNear(); if (stopIn) stopIn();
      if (still()) return set(el, c.fin, { duration: 0 });
      if (c.dec || !CN.finePointer()) return count(el, c);
      /* not built yet (a jump straight here): the real value stays, nothing rolls under the eye */
      set(el, c.fin, state(el).cols ? { duration: c.dur, delay: 300 } : { duration: 0 });
    }
    var stopNear = CN.inView(el, function (v) {
      if (done) return;
      if (v && !near) {
        near = 1;
        if (!c.dec) mount(el, { zero: 1 });
        stopIn = CN.inView(el, begin, { margin: "0px 0px -12% 0px" });
      } else if (!v && near) {
        /* gone again before it started: the real value, and no tally later */
        done = 1;
        stopNear(); if (stopIn) stopIn();
        set(el, c.fin, { duration: 0 });
      }
    }, { margin: "40% 0px 40% 0px" });
  }
  CN.onReady(function () { CN.qsa("[data-cn-count]").forEach(hook); });
})();
