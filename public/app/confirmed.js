/* Sign-up confirmation page for the iPhone app (public/app/confirmed.html).
   ES5 on purpose (old Android WebViews may open emails too).
   Supabase sends the person here after the link is checked. A good link adds
   sign-in tokens to the address (#access_token=...); a bad or used link adds
   #error=...&error_code=otp_expired. The page never uses the tokens: it only
   removes them from the address bar and history, and shows the right message. */
(function () {
  "use strict";
  function params(text) {
    var out = {};
    String(text || "").replace(/^[#?]/, "").split("&").forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf("=");
      var key = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, " "));
      var value = i < 0 ? "" : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
      out[key] = value;
    });
    return out;
  }
  var hash = params(window.location.hash);
  var query = params(window.location.search);
  var failed = Boolean(hash.error || hash.error_code || query.error || query.error_code);
  if (window.location.hash || window.location.search) {
    try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* keep going */ }
  }
  if (failed) {
    var ok = document.getElementById("cnConfirmedOk");
    var bad = document.getElementById("cnConfirmedError");
    if (ok) ok.hidden = true;
    if (bad) bad.hidden = false;
    document.title = "Link didn't work | CyberNet AI";
  }
})();
