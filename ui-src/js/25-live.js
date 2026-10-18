/* Home 2 \u00B7 Live band. Real numbers only.
   The legacy script (initLiveHeroCounters) fetches /api/public-stats once ~650 ms after load and counts
   #liveScansCount / #liveThreatsCount / #liveRecoveriesCount up. This module waits for that fill and
   reads the settled numbers (no second request at load), then draws the funnel bars and marks the
   section .is-live (the eyebrow then reads "Live").
   Each part plays when it is itself on screen: the totals count up from zero if they were filled
   while off screen (if the visitor already watched the legacy count, they are left alone) and the
   gradient bars grow when the bars are seen.
   While the section is on screen and the tab is visible it polls /api/public-stats every 60 s (at
   most 10 times per page view) and updates the numbers with a short count.
   v5: the totals are rolling numerals (CN.numerals, 50-counters.js), mounted only after the legacy
   fill has settled and real data is in (.is-live). Near the screen they are built at zero; once
   the card is a third on screen they TALLY (1100 ms expo, 60 ms per column); each 60 s poll then
   rolls only the digits that changed (700 ms). If the visitor already watched the legacy count,
   nothing replays. The two cards SETTLE as each enters (the glance card 80 ms behind), the
   hairlines over the numbers RULE (22-live.css) and "Updated hh:mm" fades in after each change.
   Honesty: the funnel rows show counts on one shared scale, never percentages. If the API fails
   nothing is invented: the section gets .is-down (no "Live" claim, no empty bars), the counters
   keep their dash and the legacy note explains it. (The threats-per-100-scans ring was removed on
   the owner's request, 15 Oct 2026.) */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;

  var POLL_MS = 60000, MAX_POLLS = 10, LEGACY_WAIT_MS = 6500;
  var IDS = ["liveScansCount", "liveThreatsCount", "liveRecoveriesCount"];
  var KEYS = ["scans", "threats", "recoveries"];
  // The second sentence keeps the caveat the removed ring card carried (Quick Scans and free
  // results are never saved, so they can never be counted as flagged).
  var OK_NOTE = "Straight from CyberNet AI\u2019s database. Nothing here is estimated. Threats flagged counts saved Pro and Business analyses only.";
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

  function boot(hook) {
    if (booted) return null;
    var sec = hook.closest ? hook.closest(".cn-live") : null;
    if (!sec) return null;
    booted = true;

    var counters = IDS.map(function (id) { return document.getElementById(id); });
    var note = document.getElementById("heroStatsNote");
    var timeEl = CN.qs("[data-cn-live-time]", sec);
    var rows = KEYS.map(function (k) { return CN.qs('.cn-funnel-row[data-key="' + k + '"]', sec); });
    var liveLabel = CN.qs("[data-cn-live-label]", sec);

    var statsPanel = CN.qs(".hero-stats-panel", sec);
    var funnel = CN.qs(".cn-funnel", sec);

    var data = null, painted = null, ready = false;
    // barsShown: the bars have been on screen. The tally: near / seen follow the totals card;
    // primed: its odometer is built at zero; played: the tally has run (or will not).
    var barsShown = false, near = false, seen = false, primed = false, played = false;
    var polls = 0, lastAt = 0, timer = 0, busy = false, inview = false, active = false;

    /* ---- painting ---- */
    function setText(el, text) { CN.text(el, text); } /* in place: the legacy observers ignore it */

    /* Up: real numbers arrived, the eyebrow may say "Live". Down: no data could be read, so the
       section drops the claim and the empty bars (22-live.css), keeping the dashes and the note. */
    function state(up) {
      sec.classList.toggle("is-live", up);
      sec.classList.toggle("is-down", !up);
      setText(liveLabel, up ? "Live" : "Offline");
    }
    function fail() { if (!data) state(false); }

    /* the odometer (50-counters.js loads after this file, so it is looked up at call time) */
    function num(el, i, o) { var v = nf.format(data[KEYS[i]]); if (CN.numerals) CN.numerals.set(el, v, o); else setText(el, v); }

    function paint(withCount) {
      if (!data) return;
      state(true);
      if (withCount) counters.forEach(function (el, i) { num(el, i, { duration: 700 }); });
      // Numbers that arrived while the totals were off screen count up once, when they are seen.
      paintBars();
      painted = data;
      tally();
    }

    /* The TALLY, once, after the legacy fill has settled and real data is in: built at zero when
       the card is about to scroll in, rolled once it is a third on screen; back to the real values
       if the visitor turns away first. Real numbers already on screen are left alone. */
    function tally() {
      if (played || !data || !painted || CN.reduced() || !CN.numerals) return;
      if (!primed) {
        if (seen) { played = true; return; }
        if (near) { primed = true; counters.forEach(function (el) { CN.numerals.mount(el, { zero: 1 }); }); }
        return;
      }
      if (seen || !near) {
        played = true;
        counters.forEach(function (el, i) { num(el, i, { duration: seen ? 1100 : 0 }); });
      }
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
      // v4.7: the bars grow once, by transform (22-live.css), in the same frame as their widths.
      if (funnel && !funnel.classList.contains("is-grown")) funnel.classList.add("is-grown");
    }

    function adopt(next, withCount) {
      var same = data && painted && KEYS.every(function (k) { return data[k] === next[k]; });
      data = next;
      var was = timeEl ? timeEl.textContent : "";
      setText(timeEl, "Updated " + clock(new Date()));
      /* the time cross-fades in after it changes (opacity only) */
      if (timeEl && timeEl.animate && timeEl.textContent !== was && !CN.reduced()) try { timeEl.animate({ opacity: [0, 1] }, { duration: 160, easing: "ease-out" }); } catch (e) { /* old engine */ }
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
    // Totals: like 50-counters.js, the real numbers are the resting state. The odometer is built at
    // zero only when the panel is about to scroll in (within 40% of a screen), tallies once it is
    // clearly on screen, and goes straight back to the real values if the visitor turns away first.
    CN.inView(statsPanel || sec, function (v) { near = v; tally(); }, { margin: "40% 0px 40% 0px" });
    /* the roll starts as the numbers themselves come into view, so zeros never wait on screen */
    CN.once(CN.qs(".hero-live-stats", sec) || statsPanel || sec, function () { seen = true; tally(); }, { threshold: .01 });
    CN.once(funnel || sec, function () { barsShown = true; paintBars(); }, { threshold: .5 });
    CN.inView(sec, function (vis) { inview = vis; sync(); });
    document.addEventListener("visibilitychange", sync);

    return {
      pause: function () { inview = false; sync(); },
      resume: function () { inview = true; sync(); }
    };
  }

  /* booted two screens early, so the legacy fill has settled before the visitor arrives */
  CN.register("funnel", boot, { margin: "200% 0px" });

  /* the two cards SETTLE as each enters, the glance card 80 ms behind the totals */
  CN.onReady(function () {
    var M = CN.motion;
    if (!M) return;
    M.reveal("#home > .cn-live .hero-stats-panel", "settle");
    M.reveal("#home > .cn-live .hero-why-panel", "settle", { delay: 80 });
  });
})();
