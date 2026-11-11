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
     example (".invalid" addresses only). The names match CN_SCREENS in mobile/scripts/screenshots.sh.
     A fresh simulator is signed out, so the app opens with its sign-in card (ios.js, section 7d). Before a demo screen
     is filled the card is answered here: "Continue without an account" for the screens that work without one (check,
     check-verdict, scan-verdict, learn, account), and a fictional signed-in person for the ones that need an account
     (consent, analysis, recovery). That person's requests never leave the device (planDemoSession). A demo whose card is
     still open is reported as CN_DEMO_FAILED, never as CN_DEMO_READY.

   - CN_DEMO_READY means "this is what the screenshot will show", not "the demo call returned". The web view of a
     freshly launched simulator app can draw nothing for the first seconds: requestAnimationFrame does not tick (build
     #5's logs show ios.js's frame-driven SplashScreen.hide arriving after READY), a sheet that opens on a frame stays
     closed, a scan whose ring runs on frames never ends, and the first picture is laid out without the status bar's
     safe area (header under the clock). A capture taken then shows the blank Quick Scan page whatever the demo did
     (build #5: check-verdict, scan-verdict, learn and, with the launch shield still up, recovery). So READY is printed
     only after (1) the splash is hidden and the page draws frames with the safe area applied, (2) the demo's own
     check passes (right page, verdict card or sheet open, no card, stage or leaving page), (3) the page has been left
     alone for 1.5 s, its short animations have ended and the same check still passes after the final scroll (to the
     top; to the verdict card for check-verdict), and (4) a few more frames were drawn without the page having moved.
     A step that does not happen in time is CN_DEMO_FAILED with its reason. In a demo run the error panel stays off
     the picture; errors go to the console as CN_DEMO_ERROR lines. */
(function () {
  "use strict";
  var w = window, d = document;
  var errors = [];
  var demoRun = !!w.CN_DEMO_SCREEN;

  // CI runs (screenshots.sh, engine-parity.sh) start from a fresh simulator. Without this the first-run
  // intro would cover every demo screen and, once it is gone, Apple's tracking alert would cover the
  // next capture. This must run before ios.js does: ios.js starts as soon as it runs (a deferred script sees
  // readyState "interactive", so its onReady() does not wait) and reads the key then. build-web.mjs puts
  // debug.js ahead of ios.js in a debug bundle for that reason; cn-ios-boot.js has already defined CNNative.
  // A plain launch (no demo, no self-test) keeps the real first-run flow.
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
    if (demoRun) { console.log("CN_DEMO_ERROR " + errors[0]); return; } // a panel over a store screenshot is never wanted
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
  // Screens that ios.js refuses to a guest (Analysis AI, Recovery) need a signed-in person: a fictional one, planted
  // in script.js's account state the way a real sign-in leaves it. Its token is only a marker: every request that
  // carries it is answered here with an empty reply and never leaves the device.
  var DEMO_TOKEN = "cn-demo-session";
  var NEEDS_ACCOUNT = { consent: 1, analysis: 1, ai: 1, recovery: 1 };
  function keepOnDevice() {
    var real = w.fetch;
    w.fetch = function (input, init) {
      var h = (init && init.headers) || (input && input.headers) || {};
      var auth = typeof h.get === "function" ? h.get("Authorization") : h.Authorization || h.authorization;
      if (String(auth || "").indexOf(DEMO_TOKEN) < 0) return real.apply(this, arguments);
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var body = url.indexOf("/api/recovery-case") >= 0 ? { cases: [] }
        : url.indexOf("/api/account-status") >= 0 ? { profile: { plan: "app" }, usage: { used: 1, limit: 3, remaining: 2 }, history: [] } : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    };
  }
  function planDemoSession() {
    var A = w.CyberNetAccount, s = A && A.appState;
    if (!s) return false;
    if (s.session && s.session.access_token) return true;
    var user = { id: "demo-user", email: "alex@example.invalid", app_metadata: { provider: "email" }, user_metadata: { full_name: "Alex Example" } };
    keepOnDevice();
    s.session = { access_token: DEMO_TOKEN, user: user };
    s.user = user;
    s.profile = { plan: "free", fullName: "Alex Example", subscriptionStatus: "inactive", billingInterval: "" };
    s.usage = { used: 1, limit: 3, remaining: 2, resetDate: "" };
    s.accountUserId = user.id;
    s.accountReady = true;
    try { if (A.updateAccountUI) A.updateAccountUI(); } catch (e) { /* the screen still fills */ }
    // ios.js closes an open sign-in card on this event (signedInNow) and the Recovery list reloads
    try { w.dispatchEvent(new CustomEvent("cybernet:session", { detail: { userId: user.id } })); } catch (e) { /* ignore */ }
    return true;
  }
  // Answers the sign-in card, then waits until the card and the stage under it have left, and calls go().
  // Gives up after 8 s: the failure is then reported by the check before CN_DEMO_READY.
  function clearGate(demo, go) {
    var needs = Object.prototype.hasOwnProperty.call(NEEDS_ACCOUNT, demo);
    var t0 = Date.now();
    (function look() {
      var card = d.getElementById("cnSignIn");
      if (card) {
        if (needs) planDemoSession();
        else { var guest = card.querySelector('[data-gate="guest"]'); if (guest) guest.click(); }
      }
      if ((card || d.getElementById("cnIntroStage")) && Date.now() - t0 < 8000) { setTimeout(look, 150); return; }
      if (needs) planDemoSession();
      go();
    })();
  }

  /* ---- is the web view drawing, and is the screen final? ---- */
  var BUDGET = 22000;  // ms from the start of the demo to READY; screenshots.sh waits about 36 s for it after the launch
  var SETTLE = 1500;   // ms the finished screen is left alone before it is checked again
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  // true after n animation frames, false if they did not come within ms (a web view that is not drawing yet)
  function frames(n, ms) {
    return new Promise(function (resolve) {
      var left = n, over = false;
      var timer = setTimeout(function () { if (!over) { over = true; resolve(false); } }, ms);
      (function tick() {
        w.requestAnimationFrame(function () {
          if (over) return;
          if (--left <= 0) { over = true; clearTimeout(timer); resolve(true); } else tick();
        });
      })();
    });
  }
  var probe = null;
  // The status bar's height as the page sees it. The first picture of a new web view is laid out with 0 (header under
  // the clock); every iPhone and iPad simulator has a status bar, so a native page that still reads 0 has not been
  // laid out for the screen yet.
  function topInset() {
    if (!probe) {
      probe = d.createElement("div");
      probe.id = "cnDemoProbe";
      probe.setAttribute("style", "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)");
      d.body.appendChild(probe);
    }
    return parseFloat(w.getComputedStyle(probe).paddingTop) || 0;
  }
  function native() { try { return !!(w.CNIsNative && w.CNIsNative()); } catch (e) { return false; } }
  // The native splash covers the page until ios.js hides it (after two frames, at the latest at 3 s). A demo does not wait for that.
  function hideSplash() {
    try { var s = w.CNPlugin && w.CNPlugin("SplashScreen"); var p = s && s.hide && s.hide(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ios.js hides it too */ }
  }
  // Resolves "" when the page draws frames (and, in the app, has the safe area), else why not by `deadline`.
  function viewReady(deadline) {
    return new Promise(function (resolve) {
      (function look() {
        frames(3, 400).then(function (drawing) {
          var inset = native() ? topInset() : 1;
          if (drawing && inset > 0) { resolve(""); return; }
          if (Date.now() >= deadline) { resolve(drawing ? "the page was never laid out for the screen (safe area 0)" : "the page is not drawing frames"); return; }
          setTimeout(look, 150);
        });
      })();
    });
  }
  // Resolves "" when test() returns "", else test()'s last reason once `deadline` has passed.
  function until(test, deadline) {
    return new Promise(function (resolve) {
      (function look() {
        var why = "";
        try { why = test(); } catch (e) { why = String(e); }
        if (!why) { resolve(""); return; }
        if (Date.now() >= deadline) { resolve(why); return; }
        setTimeout(look, 150);
      })();
    });
  }
  function scrollNow(y) { // instant, whatever scroll-behavior the page sets
    var style = d.documentElement && d.documentElement.style, prev = style ? style.scrollBehavior : "";
    if (style) style.scrollBehavior = "auto";
    try { w.scrollTo(0, y); } finally { if (style) style.scrollBehavior = prev; }
  }

  /* ---- what each screen must show ---- */
  function activePage() { var p = d.querySelector(".page.active-page"); return p ? p.id : ""; }
  function pageIs(id) {
    if (d.querySelector(".page.leaving")) return "the page is still changing";
    return activePage() === id ? "" : "the " + (activePage() || "?") + " page is open, not " + id;
  }
  function signedIn() { var A = w.CyberNetAccount; try { return !!(A && A.isSignedIn && A.isSignedIn()); } catch (e) { return false; } }
  function text(el) { return String(el && (el.innerText || el.textContent) || ""); }
  // A reveal, a sheet rising or a verdict card fading in that has not finished would be caught half-drawn. Endless or long
  // animations (decoration) do not count.
  function animating() {
    if (typeof d.getAnimations !== "function") return "";
    var list = d.getAnimations();
    for (var i = 0; i < list.length; i++) {
      var a = list[i], t = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming();
      if (!t || (a.playState !== "running" && a.playState !== "pending")) continue;
      if (t.endTime === Infinity || t.endTime - (a.currentTime || 0) > 3000) continue;
      return "the page is still animating";
    }
    return "";
  }
  // Waits (at most ms) for the short animations to end. Not a check: a decoration that never ends must not fail a demo.
  function quiet(ms) { return until(animating, Date.now() + ms); }
  // nothing may cover the screen: no card, no stage, no sheet except the one the screen is about
  function covered(sheetId) {
    if (d.getElementById("cnSignIn")) return "the sign-in card is still open";
    if (d.getElementById("cnIntroStage")) return "the launch stage is still up";
    var sheets = d.querySelectorAll(".cn-ios-sheet-backdrop");
    for (var i = 0; i < sheets.length; i++) if (sheets[i].id !== sheetId) return "an unexpected sheet is open (" + (sheets[i].id || "no id") + ")";
    if (sheetId) {
      var mine = d.getElementById(sheetId);
      if (!mine || !mine.classList.contains("is-open")) return "the " + sheetId + " sheet is not open";
    }
    return "";
  }
  var EXPECT = {
    check: function () {
      var seg = d.getElementById("cnIosSegWrap");
      var box = d.getElementById("cyberTextInput");
      return covered() || pageIs("cybernet") || (seg && seg.hidden ? "the Quick Scan | Analysis AI switch is hidden" : "") || (box && box.value ? "the text box is not empty" : "");
    },
    "check-verdict": function () {
      var res = d.getElementById("cyberTextResult"), btn = d.getElementById("cyberTextBtn"), t = text(res);
      return covered() || pageIs("cybernet") || (btn && btn.disabled ? "the scan is still running" : "")
        || (!res || !res.classList.contains("result-has-danger") || !/SCAM/.test(t) || t.length < 120 ? "the SCAM verdict card is not shown" : "");
    },
    "scan-verdict": function () {
      var sheet = d.getElementById("cnQrVerdict");
      return covered("cnQrVerdict") || (!/SCAM/.test(text(sheet && sheet.querySelector(".verdict-headline-danger"))) ? "the QR sheet shows no SCAM verdict" : "");
    },
    consent: function () { return covered("cnConsentSheet") || pageIs("cybernetai") || (signedIn() ? "" : "nobody is signed in"); },
    analysis: function () {
      var seg = d.getElementById("cnIosSeg");
      return covered() || pageIs("cybernetai") || (signedIn() ? "" : "nobody is signed in") || (seg && seg.getAttribute("data-active") !== "cybernetai" ? "the Check switch is not on Analysis AI" : "")
        || (d.getElementById("chatInput") ? "" : "the Analysis AI message box is missing");
    },
    recovery: function () {
      var page = d.getElementById("recovery");
      return covered() || pageIs("recovery") || (signedIn() ? "" : "nobody is signed in") || (/recovery plan/i.test(text(page)) ? "" : "the Recovery page has no recovery plan text");
    },
    learn: function () { return covered() || pageIs("learn") || (d.querySelectorAll("#learn .rm-node").length ? "" : "the Learn guides are missing"); },
    account: function () {
      var out = d.querySelector("#account [data-ios-signed-out]");
      return covered() || pageIs("account") || (out && !out.hidden ? "" : "the Account page does not show the signed-out options");
    }
  };
  function check(demo) { return EXPECT[demo](); }
  EXPECT.qr = EXPECT["scan-verdict"];
  EXPECT.ai = EXPECT.analysis;
  // Where the page is left for the picture: the top, except that the verdict card of check-verdict (it is below the text
  // box) comes to the top, just under the status bar.
  function place(demo) {
    var y = 0;
    if (demo === "check-verdict") {
      var card = d.getElementById("cyberTextResult");
      if (card) y = Math.max(0, Math.round(card.getBoundingClientRect().top + (w.pageYOffset || 0) - (native() ? topInset() : 0) - 16));
    }
    scrollNow(y);
  }

  function fail(demo, why) { console.log("CN_DEMO_FAILED " + demo + " " + why); } // the reason is in the line screenshots.sh prints
  // hide the splash, wait for a drawing page, answer the card, fill the screen, wait for it, scroll, leave it alone, check again.
  function runDemo(demo) {
    var deadline = Date.now() + BUDGET;
    hideSplash();
    return viewReady(deadline).then(function (why) {
      if (why) return why;
      return new Promise(function (go) { clearGate(demo, go); }).then(function () {
        try { DEMO[demo](); } catch (e) { return "" + e; }
        // screenshots.sh waits for READY (simctl launch --console-pty) before it trusts the capture; a sign-in card that is still
        // open would be in the picture, so that is a failure at once, not a wait.
        return sleep(400).then(function () {
          if (d.getElementById("cnSignIn")) return "the sign-in card is still open";
          return until(function () { return check(demo); }, deadline);
        });
      }).then(function (why) {
        if (why) return why;
        place(demo);
        return sleep(SETTLE).then(function () {
          place(demo);
          return quiet(4000);
        }).then(function () {
          return check(demo) || viewReady(deadline);
        }).then(function (why2) {
          if (why2) return why2;
          return frames(3, 3000).then(function (drawing) {
            if (!drawing) return "the page stopped drawing frames";
            // nothing may have moved the page since it was placed (check-verdict is placed where its card is, so only the others are tested)
            if (demo !== "check-verdict" && (w.pageYOffset || 0) > 1) return "the page is scrolled (" + Math.round(w.pageYOffset) + " px) instead of at the top";
            return check(demo);
          });
        });
      });
    }).then(function (why) {
      if (why) fail(demo, why); else console.log("CN_DEMO_READY " + demo);
    });
  }

  // Names match CN_SCREENS in mobile/scripts/screenshots.sh (the CI passes them as CN_DEMO_SCREEN).
  var DEMO = {
    check: function () { if (w.CNIos) w.CNIos.navigate("cybernet"); },
    "check-verdict": typeAndCheck,
    "scan-verdict": function () { if (w.CNIos) w.CNIos.showQrVerdict("https://secure-account-verify.invalid/login?session=expired", "qr"); }, // scores as a SCAM (the engine's threshold is 32)
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
      runDemo(demo).catch(function (e) { fail(demo, "unexpected: " + e); });
    }, 1500);
    else if (demo) console.log("CN_DEMO_FAILED " + demo + " unknown screen");
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
