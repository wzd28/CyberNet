/* Home 2 \u00B7 Live band. Real numbers only.
   The legacy script (initLiveHeroCounters) fetches /api/public-stats once ~650 ms after load and counts
   #liveScansCount / #liveThreatsCount / #liveRecoveriesCount up. This module waits for that fill and
   reads the settled numbers (no second request at load), then draws the funnel bars and the
   threats-per-100-scans ring and marks the section .is-live (the eyebrow then reads "Live").
   Each part plays when it is itself on screen: the totals count up from zero if they were filled
   while off screen (if the visitor already watched the legacy count, they are left alone), the
   gradient bars grow when the bars are seen, and the ring fills when the ring card is seen.
   The ring's gradient stroke (#cnRingGrad) is added to its SVG once, at boot.
   While the section is on screen and the tab is visible it polls /api/public-stats every 60 s (at
   most 10 times per page view) and updates the numbers with a short count.
   Honesty: threats are counted only in saved Pro and Business analyses, while scans count every
   Quick Scan and analysis, so the ring is a rate per 100 scans, not a share of scans, and the
   funnel rows show counts, not percentages. If the API fails nothing is invented: the section
   gets .is-down (no "Live" claim, no empty charts), the counters keep their dash and the legacy
   note explains it. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  var POLL_MS = 60000, MAX_POLLS = 10, LEGACY_WAIT_MS = 6500;
  var IDS = ["liveScansCount", "liveThreatsCount", "liveRecoveriesCount"];
  var KEYS = ["scans", "threats", "recoveries"];
  var OK_NOTE = "Straight from CyberNet AI\u2019s database. Nothing here is estimated.";
  var booted = false;

  // The note's markup text ("Loading..."), read before the legacy fill can replace it. If this
  // module boots after the legacy fill has already failed, a changed note with dashed counters
  // tells it so, and it checks the API itself at once instead of waiting out LEGACY_WAIT_MS.
  var initialNote = null;
  CN.onReady(function () { var n = document.getElementById("heroStatsNote"); if (n) initialNote = n.textContent; });

  function fmt(opts) {
    try { return new Intl.NumberFormat(undefined, opts); } catch (e) { return { format: function (n) { return String(n); } }; }
  }
  var nf = fmt();
  var nf1 = fmt({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var tf;
  try { tf = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { tf = null; }

  function clock(d) {
    if (tf) return tf.format(d);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  /* "18,342" / "18.342" / "\u0661\u0668\u066C\u0663\u0664\u0662" -> 18342; "\u2014" -> null */
  function parseCount(text) {
    var t = String(text || "")
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); })
      .replace(/\D/g, "");
    return t ? parseInt(t, 10) : null;
  }

  function valid(n) { return typeof n === "number" && isFinite(n) && n >= 0; }

  /* The ring stroke is a cyan -> blue gradient. The SVG ships without <defs>, so one
     <linearGradient id="cnRingGrad"> is added once (the CSS falls back to solid teal without it). */
  function addRingGradient(circle) {
    var svg = circle && circle.ownerSVGElement;
    if (!svg || document.getElementById("cnRingGrad")) return;
    var NS = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(NS, "defs");
    var g = document.createElementNS(NS, "linearGradient");
    g.setAttribute("id", "cnRingGrad");
    // The circle is drawn rotated -90deg, so in its own box the stroke starts at the right edge and
    // runs clockwise through the bottom. A diagonal from top-right to bottom-left therefore starts
    // the visible arc in cyan and turns to the supporting blue (the brand gradient, cyan -> blue).
    g.setAttribute("x1", "1"); g.setAttribute("y1", "0"); g.setAttribute("x2", "0"); g.setAttribute("y2", "1");
    [[".2", "#22d3ee"], [".9", "#3b82f6"]].forEach(function (st) {
      var stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", st[0]);
      stop.setAttribute("stop-color", st[1]);
      g.appendChild(stop);
    });
    defs.appendChild(g);
    svg.insertBefore(defs, svg.firstChild);
  }

  function boot(hook) {
    if (booted) return null;
    var sec = hook.closest ? hook.closest(".cn-live") : null;
    if (!sec) return null;
    booted = true;

    var counters = IDS.map(function (id) { return document.getElementById(id); });
    var note = document.getElementById("heroStatsNote");
    var timeEl = CN.qs("[data-cn-live-time]", sec);
    var rows = KEYS.map(function (k) { return CN.qs('.cn-funnel-row[data-key="' + k + '"]', sec); });
    var ringVal = CN.qs(".cn-ring-val", sec);
    var ringNum = CN.qs("[data-cn-ring-num]", sec);
    var liveLabel = CN.qs("[data-cn-live-label]", sec);

    var statsPanel = CN.qs(".hero-stats-panel", sec);
    var funnel = CN.qs(".cn-funnel", sec);
    var ringCard = CN.qs(".cn-ring-card", sec);
    addRingGradient(ringVal);

    var data = null, painted = null, ready = false;
    // barsShown / ringShown: that part has been on screen. numsSeen: the totals were on screen
    // (before or after data); numsPlayed: their count-up has run (or was not needed).
    var barsShown = false, ringShown = false, numsSeen = false, numsPlayed = false;
    var polls = 0, lastAt = 0, timer = 0, busy = false, inview = false, active = false;
    var ringAt = null;

    /* ---- painting ---- */
    function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

    /* Up: real numbers arrived, the eyebrow may say "Live". Down: no data could be read, so the
       section drops the claim and the empty charts (22-live.css), keeping the dashes and the note. */
    function state(up) {
      sec.classList.toggle("is-live", up);
      sec.classList.toggle("is-down", !up);
      setText(liveLabel, up ? "Live" : "Offline");
    }
    function fail() { if (!data) state(false); }

    function countTo(el, from, to, ms, format) {
      if (!el) return;
      if (CN.reduced() || from === to || !valid(from)) { setText(el, format(to)); return; }
      var t0 = CN.now(), lastWrite = 0;
      (function step() {
        var now = CN.now(), k = CN.clamp((now - t0) / ms, 0, 1);
        if (k >= 1) { setText(el, format(to)); return; }
        // Throttled writes keep DOM text churn low (body-wide observers watch text changes).
        if (now - lastWrite > 45) { lastWrite = now; setText(el, format(from + (to - from) * CN.easeOut(k))); }
        requestAnimationFrame(step);
      })();
    }

    function paint(withCount) {
      if (!data) return;
      state(true);
      if (withCount) {
        counters.forEach(function (el, i) {
          var to = data[KEYS[i]], from = el ? parseCount(el.textContent) : null;
          if (from !== to) countTo(el, from === null ? 0 : from, to, 800, function (v) { return nf.format(Math.round(v)); });
        });
      }
      // Numbers that arrived while the totals were off screen count up once, when they are seen.
      if (!numsSeen) numsPlayed = false; else numsPlayed = true;
      paintBars();
      paintRing();
      painted = data;
    }

    function playNumbers() {
      if (numsPlayed || !data) return;
      numsPlayed = true;
      if (CN.reduced()) return;
      counters.forEach(function (el, i) {
        countTo(el, 0, data[KEYS[i]], 1400, function (v) { return nf.format(Math.round(v)); });
      });
    }

    function paintBars() {
      if (!data || !barsShown) return; // the bars grow the first time they are on screen
      // Bar lengths are counts on one shared scale: the largest of the three is full width.
      // Recovery cases are not a subset of scans (there can be more of them), so the scale is the
      // maximum, never scans, and the labels show counts, never a percentage.
      var top = Math.max(data.scans, data.threats, data.recoveries);
      rows.forEach(function (row, i) {
        if (!row) return;
        var v = CN.clamp(top > 0 ? data[KEYS[i]] / top : 0, 0, 1);
        var bar = row.querySelector("b");
        // A non-zero share keeps a sliver of bar so it never reads as zero; the label carries the exact value.
        if (bar) bar.style.setProperty("--v", (v > 0 ? Math.max(v, .012) : 0).toFixed(4));
        setText(row.querySelector("em"), top > 0 ? nf.format(data[KEYS[i]]) : "\u2014");
      });
    }

    function paintRing() {
      if (!data || !ringShown) return;
      var s = data.scans;
      if (s > 0) {
        var pct = CN.clamp(data.threats / s, 0, 1);
        if (ringVal) ringVal.style.strokeDashoffset = String(100 - pct * 100);
        var from = ringAt === null ? 0 : ringAt;
        ringAt = pct;
        // Threats flagged per 100 scans, one decimal ("22.5"); the label carries the unit.
        countTo(ringNum, from, pct, 1400, function (v) { return nf1.format(v * 100); });
      } else {
        if (ringVal) ringVal.style.strokeDashoffset = "100";
        setText(ringNum, "\u2014");
      }
    }

    function adopt(next, withCount) {
      var same = data && painted && KEYS.every(function (k) { return data[k] === next[k]; });
      data = next;
      setText(timeEl, "Updated " + clock(new Date()));
      // One note that matches the lead (the legacy success text said "updated continuously").
      setText(note, OK_NOTE);
      if (!same || !painted) paint(withCount);
    }

    /* ---- network ---- */
    function fetchStats() {
      if (!window.fetch) return Promise.reject(new Error("no fetch"));
      var ctrl = window.AbortController ? new AbortController() : null;
      var kill = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : 0;
      return window.fetch("/api/public-stats", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (d) {
            clearTimeout(kill);
            if (!res.ok || !d || !d.live) throw new Error("unavailable");
            var next = { scans: Number(d.totalScans), threats: Number(d.threatsFound), recoveries: Number(d.recoveryCases) };
            if (!KEYS.every(function (k) { return valid(next[k]); })) throw new Error("bad data");
            return next;
          });
        }, function (err) { clearTimeout(kill); throw err; });
    }

    function poll() {
      timer = 0;
      if (!active || busy || polls >= MAX_POLLS) return;
      polls++;
      busy = true;
      fetchStats().then(function (next) { adopt(next, true); }, function () { /* keep the last real numbers */ })
        .then(function () { busy = false; lastAt = Date.now(); ready = true; schedule(); });
    }

    function schedule() {
      clearTimeout(timer); timer = 0;
      if (!ready || !active || busy || polls >= MAX_POLLS) return;
      timer = setTimeout(poll, Math.max(0, POLL_MS - (Date.now() - lastAt)));
    }

    function sync() {
      var a = inview && !document.hidden;
      if (a === active) return;
      active = a;
      if (active) schedule(); else { clearTimeout(timer); timer = 0; }
    }

    /* ---- first numbers: wait for the legacy fill, then read its settled text ---- */
    function readCounters() {
      var vals = counters.map(function (el) { return el ? parseCount(el.textContent) : null; });
      return vals.every(function (v) { return v !== null; }) ? { scans: vals[0], threats: vals[1], recoveries: vals[2] } : null;
    }

    var mo = null, waitTimer = 0, settleTimer = 0, failTimer = 0, noteChanged = false;
    function stopWaiting() {
      if (mo) { mo.disconnect(); mo = null; }
      clearTimeout(waitTimer); clearTimeout(settleTimer); clearTimeout(failTimer);
    }
    function finishInit(next) {
      stopWaiting();
      ready = true;
      lastAt = Date.now();
      if (next) adopt(next, false);
      schedule();
    }
    function settle(prev) {
      // The legacy count-up runs 1.6 s; adopt once two reads in a row agree.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () {
        var cur = readCounters();
        if (!cur) return check();
        if (prev && KEYS.every(function (k) { return prev[k] === cur[k]; })) finishInit(cur);
        else settle(cur);
      }, 300);
    }
    function check() {
      if (readCounters()) {
        clearTimeout(failTimer); failTimer = 0;
        // The legacy count has started, so the data is real: swap its note now, not after the count.
        setText(note, OK_NOTE);
        settle(null);
        return;
      }
      // Counters still show the dash. On success the legacy note changes one frame before the
      // count starts, so only call it a failure if the dash is still there a moment later.
      if (noteChanged && !failTimer) {
        failTimer = setTimeout(function () {
          failTimer = 0;
          if (readCounters()) settle(null);
          else { fail(); finishInit(null); }
        }, 600);
      }
    }
    function ownFetch() {
      stopWaiting();
      busy = true; polls++;
      fetchStats().then(function (next) { adopt(next, true); }, fail)
        .then(function () { busy = false; ready = true; lastAt = Date.now(); schedule(); });
    }

    var legacyDone = note && initialNote !== null && note.textContent !== initialNote;
    if (readCounters()) settle(null);
    else if (legacyDone || CN.now() > LEGACY_WAIT_MS) ownFetch();
    else {
      if ("MutationObserver" in window) {
        mo = new MutationObserver(function (list) {
          list.forEach(function (m) { if (note && note.contains(m.target)) noteChanged = true; });
          check();
        });
        counters.concat(note).forEach(function (el) { if (el) mo.observe(el, { childList: true, characterData: true, subtree: true }); });
      }
      waitTimer = setTimeout(function () { if (readCounters()) settle(null); else ownFetch(); }, Math.max(1500, LEGACY_WAIT_MS - CN.now()));
    }

    /* ---- visibility: each part plays when it is itself on screen ---- */
    // Totals: like 50-counters.js, the real numbers are the resting state. They switch to 0 only
    // when the panel is about to scroll in (within 40% of a screen), count once it is clearly on
    // screen, and go straight back to the real values if the visitor turns away first.
    var primed = false;
    function setFinal() { counters.forEach(function (el, i) { setText(el, nf.format(data[KEYS[i]])); }); }
    var stopNear = CN.inView(statsPanel || sec, function (near) {
      if (numsPlayed || numsSeen || !data || !painted || CN.reduced()) return;
      if (near && !primed) { primed = true; counters.forEach(function (el) { setText(el, nf.format(0)); }); }
      else if (!near && primed) { primed = false; setFinal(); }
    }, { margin: "40% 0px 40% 0px" });
    CN.once(statsPanel || sec, function () {
      if (data && !numsPlayed && painted) playNumbers();
      numsSeen = true;
      if (!data) numsPlayed = true; // the legacy count (or the dash) was on screen: no replay
      stopNear();
    }, { threshold: .3 });
    CN.once(funnel || sec, function () { barsShown = true; paintBars(); }, { threshold: .5 });
    CN.once(ringCard || sec, function () { ringShown = true; paintRing(); }, { threshold: .4 });
    CN.inView(sec, function (vis) { inview = vis; sync(); });
    document.addEventListener("visibilitychange", sync);

    return {
      pause: function () { inview = false; sync(); },
      resume: function () { inview = true; sync(); }
    };
  }

  CN.register("funnel", boot);
  CN.register("threat-ring", boot);
})();
