/* CyberNet AI iPhone app: the first script on the page (BUILD-PLAN §5.5). It runs before every other
   script, so everything after it already sees the app's platform, API address and storage.

   - window.CN_PLATFORM = "ios"   iOS-only behaviour checks this (the website never sets it).
   - API calls: the website calls "/api/..." on its own origin. Inside the app the page lives at
     capacitor://localhost, so every "/api/..." fetch and beacon is sent to https://cybernetai.app with
     the X-CyberNet-Platform / X-CyberNet-App-Version headers (the server's App tier, CORS and AI consent
     depend on them) and a 30 s timeout when the caller set none (§7.11). The submitted build always
     talks to production.
   - cybernet-errors.js sends error reports with navigator.sendBeacon("/api/client-error") first. A
     relative beacon would go to capacitor://localhost, "succeed", and every report would be lost, so
     the beacon URL is rewritten too (C24).
   - Capacitor plugins are reached through the bundled Capacitor runtime (vendor/capacitor.js, loaded
     just before this file): window.CNPlugin(name) returns the plugin or null when the native side does
     not have it (a desktop preview, or a plugin not in this build). Nothing here assumes a plugin exists.
   - window.CNSecureStorage: the Supabase session lives in the iOS Keychain through the app's
     SecureSession plugin (§7.6.3); without the plugin Supabase keeps its default storage.
   - window.CNNative.trackingStatus() / requestTracking(): App Tracking Transparency through the app's
     CNTracking plugin. Google Analytics loads only when this says "authorized" (ios/cn-analytics.js). */
(function (w, d) {
  "use strict";
  var API = "https://cybernetai.app";
  var VERSION = "__CN_APP_VERSION__";
  var root = d.documentElement;

  w.CN_PLATFORM = "ios";
  w.CN_API_BASE = API;
  w.CN_APP_VERSION = VERSION;
  w.CN_JSQR_SRC = "vendor/jsQR.js";
  root.classList.add("cn-ios");
  /* Native scrolling only (no Lenis), and the visitor's own "pause motion" choice, which the website's
     head snippet used to read. */
  try { w.localStorage.setItem("cn-native-scroll", "1"); } catch (e) { /* storage blocked */ }
  try { if (w.localStorage.getItem("cn-still-2") === "1") root.classList.add("cn-still"); } catch (e) { /* ignore */ }
  /* The page reloads with ?account=deleted after an account deletion (cybernet-privacy-controls.js);
     ios.js then clears what the app kept on the device (Keychain, reminders, shared items). */
  try { if (/[?&]account=deleted(?:&|$)/.test(w.location.search)) w.CN_ACCOUNT_DELETED = true; } catch (e) { /* ignore */ }

  /* ---------- Capacitor plugins ---------- */
  var plugins = {};
  function plugin(name) {
    var C = w.Capacitor;
    if (!C) return null;
    if (Object.prototype.hasOwnProperty.call(plugins, name)) return plugins[name];
    var found = null;
    try {
      var available = typeof C.isPluginAvailable === "function" && C.isPluginAvailable(name);
      if (available) found = (C.Plugins && C.Plugins[name]) || (typeof C.registerPlugin === "function" ? C.registerPlugin(name) : null);
    } catch (e) { found = null; }
    plugins[name] = found;
    return found;
  }
  w.CNPlugin = plugin;
  w.CNIsNative = function () {
    var C = w.Capacitor;
    try { return !!(C && typeof C.isNativePlatform === "function" && C.isNativePlatform()); } catch (e) { return false; }
  };

  /* ---------- the session in the Keychain ---------- */
  var secure = plugin("SecureSession");
  if (secure) {
    w.CNSecureStorage = {
      getItem: function (key) {
        return secure.get({ key: key }).then(function (r) { return r && typeof r.value === "string" ? r.value : null; }, function () { return null; });
      },
      setItem: function (key, value) {
        return secure.set({ key: key, value: String(value) }).then(function () {}, function (e) { if (w.console) console.warn("[cn-ios] session not saved", e); });
      },
      removeItem: function (key) {
        return secure.remove({ key: key }).then(function () {}, function () {});
      }
    };
  }

  /* ---------- App Tracking Transparency ---------- */
  var STATUSES = ["authorized", "denied", "notDetermined", "restricted"];
  function statusOf(result) {
    var s = result && (result.status || result.value);
    return STATUSES.indexOf(s) >= 0 ? s : "unavailable";
  }
  w.CNNative = {
    trackingStatus: function () {
      var t = plugin("CNTracking");
      if (!t) return Promise.resolve("unavailable");
      return t.getStatus().then(statusOf, function () { return "unavailable"; });
    },
    requestTracking: function () {
      var t = plugin("CNTracking");
      if (!t) return Promise.resolve("unavailable");
      return t.request().then(statusOf, function () { return "unavailable"; });
    }
  };

  /* ---------- /api/ calls go to the production API ---------- */
  function isApi(url) { return typeof url === "string" && url.indexOf("/api/") === 0; }
  w.CN_apiUrl = function (url) { return isApi(url) ? API + url : url; };
  var nativeFetch = typeof w.fetch === "function" ? w.fetch.bind(w) : null;
  if (nativeFetch) {
    w.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && typeof input.url === "string" ? input.url : "");
      if (!isApi(url)) return nativeFetch(input, init);
      var options = {};
      var k;
      if (init) for (k in init) if (Object.prototype.hasOwnProperty.call(init, k)) options[k] = init[k];
      var headers = new Headers(options.headers || (typeof input === "object" && input ? input.headers : undefined));
      headers.set("X-CyberNet-Platform", "ios");
      headers.set("X-CyberNet-App-Version", VERSION);
      options.headers = headers;
      if (!options.method && typeof input === "object" && input && input.method) options.method = input.method;
      var timer = 0;
      if (!options.signal && typeof AbortController === "function") {
        var controller = new AbortController();
        options.signal = controller.signal;
        timer = setTimeout(function () { controller.abort(); }, 30000);
      }
      var request = nativeFetch(API + url, options);
      if (timer) request.then(function () { clearTimeout(timer); }, function () { clearTimeout(timer); });
      return request;
    };
  }
  if (navigator.sendBeacon) {
    var nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) { return nativeBeacon(isApi(url) ? API + url : url, data); };
  }
})(window, document);
