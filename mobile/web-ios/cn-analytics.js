/* CyberNet AI iPhone app: Google Analytics, only with App Tracking Transparency permission
   (owner decision, 29 Oct 2026; App Review 5.1.2 and the ATT rules).

   - Nothing here runs on its own. ios.js calls CNAnalytics.start() only when
     CNNative.trackingStatus() is "authorized" (the person tapped "Allow" on the iOS tracking prompt),
     and CNAnalytics.stop() for every other answer, including a later change in iPhone Settings.
   - Before start(): no Google script, no request to Google, no identifier. If the person never allows
     tracking, Google Analytics is never loaded at all.
   - The Share Extension never loads this file (it has no web page of its own).
   - What is sent: screen views (Check, Analysis AI, Recovery, Learn, Account) with an app-only address
     (https://cybernetai.app/ios/<screen>), never the text, links or pictures a person checks, and no
     account id or email. Google signals and ad personalisation stay off.
   - The app's web view cannot keep Google's _ga cookie, so the client id is a random value kept in this
     app's storage while tracking is allowed, and deleted by stop().
   - The privacy manifest (PrivacyInfo.xcprivacy) declares tracking and these domains, so iOS itself
     blocks them while the person has not allowed tracking. */
(function () {
  "use strict";
  var w = window, d = document;
  if (w.CN_PLATFORM !== "ios" || w.CNAnalytics) return;

  var MEASUREMENT_ID = "G-HF72PVV8D6";
  var SRC = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
  var CLIENT_KEY = "cn-ios-ga-client";
  var running = false, loaded = false, lastPage = "";

  function clientId() {
    var id = null;
    try { id = w.localStorage.getItem(CLIENT_KEY); } catch (e) { /* storage blocked */ }
    if (!id || !/^\d+\.\d+$/.test(id)) {
      var a = new Uint32Array(1);
      w.crypto.getRandomValues(a);
      id = a[0] + "." + Math.floor(Date.now() / 1000);
      try { w.localStorage.setItem(CLIENT_KEY, id); } catch (e) { /* ignore */ }
    }
    return id;
  }
  function gtag() { w.dataLayer.push(arguments); }
  function address(page) { return "https://cybernetai.app/ios/" + encodeURIComponent(page || "check"); }

  function start() {
    if (running) return;
    running = true;
    w["ga-disable-" + MEASUREMENT_ID] = false;
    w.dataLayer = w.dataLayer || [];
    if (typeof w.gtag !== "function") w.gtag = gtag;
    w.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    w.gtag("js", new Date());
    w.gtag("config", MEASUREMENT_ID, {
      client_storage: "none",
      client_id: clientId(),
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      app_version: w.CN_APP_VERSION || "",
      platform: "ios"
    });
    if (!loaded) {
      loaded = true;
      var s = d.createElement("script");
      s.async = true;
      s.src = SRC;
      d.head.appendChild(s);
    }
    var active = d.querySelector(".page.active-page");
    page(active ? active.id : "cybernet", "", true);
  }

  function page(id, title, force) {
    if (!running || (!force && id === lastPage)) return;
    lastPage = id;
    w.gtag("event", "page_view", { page_location: address(id), page_title: title || id, page_referrer: "" });
  }

  function stop() {
    w["ga-disable-" + MEASUREMENT_ID] = true;
    if (running && typeof w.gtag === "function") w.gtag("consent", "update", { analytics_storage: "denied" });
    running = false;
    try { w.localStorage.removeItem(CLIENT_KEY); } catch (e) { /* ignore */ }
  }

  w.CNAnalytics = { start: start, stop: stop, page: page, running: function () { return running; } };
})();
