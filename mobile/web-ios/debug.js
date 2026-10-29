/* CyberNet AI iPhone app: DEBUG BUNDLE ONLY (node mobile/scripts/build-web.mjs --debug). Never in a build
   that can be submitted: the release gate fails if CN_DEMO_SCREEN, CN_ENGINE_SELFTEST or cn-debug-errors
   appear anywhere in the bundle (App Review 2.5.19: no hidden or dormant features).

   - An on-screen panel with the last 20 errors (tap it to hide it), fed by window errors, unhandled
     promise rejections and window.CN_reportError (cybernet-errors.js).
   - Engine self-test (BUILD-PLAN §10 "engine parity"): when the native shell sets
     window.CN_ENGINE_SELFTEST = "1" or true (or the page is opened with ?selftest=1), every case in
     ios/engine-fixtures.json runs through the bundled engine in this WebKit and the result is compared
     with the Node results. The summary is logged as one line "CN_ENGINE_SELFTEST_RESULT {json}" and
     handed to the CNDebug plugin (writeResult) when it exists.
   - Screenshot helper: window.CN_DEMO_SCREEN = "check" | "check-verdict" | "scan-verdict" | "consent" |
     "analysis" | "recovery" | "learn" | "account" (aliases "qr", "ai") fills that screen with a fictional
     example (".invalid" addresses only). The names match CN_SCREENS in mobile/scripts/screenshots.sh. */
(function () {
  "use strict";
  var w = window, d = document;
  var errors = [];

  // CI runs (screenshots.sh, engine-parity.sh) start from a fresh simulator. Without this the first-run
  // intro sheet would cover every demo screen and, once it is gone, Apple's tracking alert would cover the
  // next capture. This runs before ios.js's start() timer (600 ms) reads either: deferred scripts all run
  // before DOMContentLoaded, and cn-ios-boot.js has already defined CNNative. A plain launch (no demo,
  // no self-test) keeps the real first-run flow.
  if (w.CN_DEMO_SCREEN || w.CN_ENGINE_SELFTEST) {
    try { w.localStorage.setItem("cn-ios-intro-1", "demo"); } catch (e) { /* storage blocked */ }
    if (w.CNNative) w.CNNative.requestTracking = function () { return Promise.resolve("denied"); };
  }
  function panel() {
    var box = d.getElementById("cn-debug-errors");
    if (!box) {
      box = d.createElement("div");
      box.id = "cn-debug-errors";
      box.setAttribute("style", "position:fixed;left:6px;right:6px;top:calc(env(safe-area-inset-top,0px) + 40px);z-index:99999;max-height:40vh;overflow:auto;background:rgba(80,0,0,.92);color:#fff;font:12px/1.4 ui-monospace,monospace;padding:8px;border-radius:8px;white-space:pre-wrap");
      box.addEventListener("click", function () { box.hidden = true; });
      d.body.appendChild(box);
    }
    box.hidden = false;
    box.textContent = "DEBUG BUILD - last errors (tap to hide)\n\n" + errors.join("\n\n");
  }
  function add(text) {
    errors.unshift(new Date().toISOString().slice(11, 19) + " " + String(text).slice(0, 600));
    errors.length = Math.min(errors.length, 20);
    if (d.body) panel();
  }
  w.addEventListener("error", function (e) { add((e.message || "error") + " @ " + (e.filename || "") + ":" + (e.lineno || "")); });
  w.addEventListener("unhandledrejection", function (e) { add("unhandled rejection: " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
  var report = w.CN_reportError;
  w.CN_reportError = function (err, where) {
    add((where || "report") + ": " + (err && (err.stack || err.message) || err));
    if (typeof report === "function") return report.apply(this, arguments);
  };

  function headline(E, r) {
    var score = Number(r && r.score) || 0;
    if (score >= E.SCAM_THRESHOLD) return "SCAM";
    if (r && r.kind === "link" && !r.officialBrand) return E.linkNeedsCaution(r) ? "CAN'T CONFIRM" : "LOW RISK";
    return "LOW RISK";
  }
  function selfTest() {
    var E = w.CyberNetEngine;
    if (!E) { console.log("CN_ENGINE_SELFTEST_RESULT " + JSON.stringify({ ok: false, error: "engine not loaded" })); return; }
    fetch("ios/engine-fixtures.json").then(function (r) { return r.json(); }).then(function (fx) {
      var diffs = [];
      fx.cases.forEach(function (c) {
        var r = c.type === "link" ? E.analyzeLink(c.input) : E.analyzeText(c.input);
        var band = E.resultBand(r), head = headline(E, r);
        if (band !== c.band || head !== c.headline) diffs.push({ id: c.id, node: c.band + "/" + c.headline + "/" + c.score, webkit: band + "/" + head + "/" + r.score });
      });
      var summary = { ok: diffs.length === 0, engineVersion: E.VERSION, fixtureVersion: fx.engineVersion, cases: fx.cases.length, diffCount: diffs.length, diffs: diffs, userAgent: navigator.userAgent };
      w.CN_ENGINE_SELFTEST_RESULT = summary;
      // Capacitor cuts a console line at about 4,000 characters, so the logged copy keeps 10 differences.
      var line = { ok: summary.ok, engineVersion: summary.engineVersion, fixtureVersion: summary.fixtureVersion, cases: summary.cases, diffCount: diffs.length, diffs: diffs.slice(0, 10), userAgent: summary.userAgent };
      console.log("CN_ENGINE_SELFTEST_RESULT " + JSON.stringify(line));
      var dbg = w.CNPlugin && w.CNPlugin("CNDebug");
      if (dbg && dbg.writeResult) dbg.writeResult({ name: "engine-selftest.json", json: JSON.stringify(summary) }).catch(function () {});
      if (diffs.length) add("ENGINE PARITY: " + diffs.length + " difference(s), first: " + JSON.stringify(diffs[0]));
    }).catch(function (e) { add("self-test failed: " + e); });
  }

  function typeAndCheck() {
    var t = d.getElementById("cyberTextInput");
    if (t) { t.value = "Your parcel is on hold. Pay the 2.99 customs fee within 24 hours to release it: https://parcel-redelivery.invalid/pay"; t.dispatchEvent(new Event("input", { bubbles: true })); }
    var b = d.getElementById("cyberTextBtn"); if (b) b.click();
  }
  // Names match CN_SCREENS in mobile/scripts/screenshots.sh (the CI passes them as CN_DEMO_SCREEN).
  var DEMO = {
    check: function () { if (w.CNIos) w.CNIos.navigate("cybernet"); },
    "check-verdict": typeAndCheck,
    "scan-verdict": function () { if (w.CNIos) w.CNIos.showQrVerdict("https://bank-login-verify.invalid/secure", "qr"); },
    consent: function () { if (w.CNIos) { w.CNIos.navigate("cybernetai"); w.CNIos.askConsent(); } },
    analysis: function () { if (w.CNIos) w.CNIos.navigate("cybernetai"); },
    recovery: function () { if (w.CNIos) w.CNIos.navigate("recovery"); },
    learn: function () { if (w.CNIos) w.CNIos.navigate("learn"); },
    account: function () { if (w.CNIos) w.CNIos.navigate("account"); }
  };
  DEMO.qr = DEMO["scan-verdict"];
  DEMO.ai = DEMO.analysis;
  // The native shell hands launch values over as strings ("1", "true"); ?selftest=1 works in a browser.
  function on(value) { return value === true || value === 1 || /^(1|true|yes)$/i.test(String(value || "")); }
  function start() {
    if (on(w.CN_ENGINE_SELFTEST) || /[?&]selftest=1/.test(location.search)) setTimeout(selfTest, 800);
    var demo = w.CN_DEMO_SCREEN || (/[?&]demo=([\w-]+)/.exec(location.search) || [])[1];
    if (demo && Object.prototype.hasOwnProperty.call(DEMO, demo)) setTimeout(function () {
      try { DEMO[demo](); } catch (e) { add("demo " + demo + ": " + e); console.log("CN_DEMO_FAILED " + demo + " " + e); return; }
      // screenshots.sh waits for this line (simctl launch --console-pty) before it trusts the capture.
      setTimeout(function () { console.log("CN_DEMO_READY " + demo); }, 400);
    }, 1500);
    else if (demo) console.log("CN_DEMO_FAILED " + demo + " unknown screen");
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
