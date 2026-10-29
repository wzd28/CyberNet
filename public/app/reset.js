/* Password reset page for the iPhone app (public/app/reset.html).
   ES5 on purpose (no arrow functions, let/const, template strings or async).

   The reset email's link goes through Supabase, which checks it and sends the
   person here with a short-lived recovery session in the address
   (#access_token=...&type=recovery; supabase-js reads it on start). An expired
   or used link arrives as #error=...&error_code=otp_expired. A link built from
   a token_hash (?token_hash=...&type=recovery) is verified here as well.

   The session lives only in this page's memory: nothing is stored in the
   browser, the address is cleaned at once, and the page signs out after the
   password is saved. The app itself signs in again with the new password. */
(function () {
  "use strict";

  var MIN = 8;
  var MAX = 72;

  function byId(id) { return document.getElementById(id); }
  function params(text) {
    var out = {};
    String(text || "").replace(/^[#?]/, "").split("&").forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf("=");
      var key = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, " "));
      out[key] = i < 0 ? "" : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
    });
    return out;
  }

  var views = ["cnResetChecking", "cnResetFormView", "cnResetDone", "cnResetFailed"];
  function show(view) {
    views.forEach(function (name) {
      var el = byId(name);
      if (el) el.hidden = name !== view;
    });
  }
  function failed(text) {
    if (text) {
      var p = byId("cnResetFailedText");
      if (p) p.textContent = text;
    }
    show("cnResetFailed");
  }
  function status(text, kind) {
    var el = byId("cnResetStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "cn-app-status" + (kind ? " is-" + kind : "");
  }

  // Plain-language messages for what Supabase can answer to updateUser.
  function friendly(error) {
    var code = String((error && error.code) || "").toLowerCase();
    var text = String((error && error.message) || "").toLowerCase();
    if (code === "same_password" || text.indexOf("different from the old password") >= 0) return "That's the password you use now. Choose a different one.";
    if (text.indexOf("longer than 72") >= 0) return "Use 72 characters or fewer.";
    if (code === "weak_password" || text.indexOf("password should") >= 0 || text.indexOf("weak") >= 0 || text.indexOf("pwned") >= 0) {
      if (/known to be weak|pwned|leak|easy to guess/.test(text)) return "That password has shown up in data leaks, so it's easy to guess. Choose a different one.";
      return "Use a stronger password with at least 8 characters.";
    }
    if (code === "session_not_found" || code === "session_expired" || text.indexOf("session") >= 0 || text.indexOf("jwt") >= 0) return "This reset link has expired. Go back to the app and ask for a new one.";
    if (text.indexOf("rate limit") >= 0) return "Too many tries in a short time. Please wait a few minutes, then try again.";
    return "We couldn't save your new password. Check your connection and try again.";
  }

  var hash = params(window.location.hash);
  var query = params(window.location.search);
  var linkError = hash.error || hash.error_code || query.error || query.error_code;
  var hasLink = Boolean(hash.access_token || query.token_hash || query.code);

  var cfg = window.CYBERNET_CONFIG || {};
  var lib = window.supabase;

  function cleanAddress() {
    if (!window.location.hash && !window.location.search) return;
    try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* keep going */ }
  }

  if (linkError) {
    cleanAddress();
    failed();
    return;
  }
  if (!hasLink) {
    failed("This page only works from the password-reset link in your email. Go back to the CyberNet AI app, choose Forgot your password? and ask for a new link.");
    return;
  }
  if (!lib || typeof lib.createClient !== "function" || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    failed("We couldn't load this page. Check your connection, then open the link in your email again.");
    return;
  }

  var client = lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true, flowType: "implicit" }
  });

  function ready(session) {
    cleanAddress();
    if (!session || !session.user) {
      failed();
      return;
    }
    var username = byId("cnResetUsername");
    if (username) username.value = String(session.user.email || "");
    show("cnResetFormView");
    var field = byId("cnResetPassword");
    if (field) field.focus();
  }

  var start;
  if (query.token_hash) {
    start = client.auth.verifyOtp({ token_hash: query.token_hash, type: "recovery" }).then(function (result) {
      if (result.error) throw result.error;
      return result.data && result.data.session;
    });
  } else if (query.code) {
    // A PKCE code can only be exchanged by the browser that asked for the
    // reset, which was the app, not this page. Try, and explain if it fails.
    start = client.auth.exchangeCodeForSession(query.code).then(function (result) {
      if (result.error) throw result.error;
      return result.data && result.data.session;
    });
  } else {
    // #access_token=...: supabase-js reads it while it starts.
    start = client.auth.getSession().then(function (result) {
      if (result.error) throw result.error;
      return result.data && result.data.session;
    });
  }
  start.then(ready, function () {
    cleanAddress();
    failed();
  });

  var form = byId("cnResetForm");
  var saving = false;
  if (form) form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (saving) return;
    var password = (byId("cnResetPassword") || {}).value || "";
    var confirm = (byId("cnResetConfirm") || {}).value || "";
    if (password.length < MIN) { status("Use at least 8 characters.", "error"); return; }
    if (password.length > MAX) { status("Use 72 characters or fewer.", "error"); return; }
    if (password !== confirm) { status("The two passwords don't match.", "error"); return; }
    saving = true;
    var button = byId("cnResetSave");
    if (button) { button.disabled = true; button.textContent = "Saving…"; }
    status("");
    client.auth.updateUser({ password: password }).then(function (result) {
      if (result.error) throw result.error;
      show("cnResetDone");
      // The page's own session is not needed any more.
      return client.auth.signOut({ scope: "local" }).catch(function () { return null; });
    }).catch(function (error) {
      status(friendly(error), "error");
    }).then(function () {
      saving = false;
      if (button) { button.disabled = false; button.textContent = "Save"; }
    });
  });
})();
