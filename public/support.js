/* Support page form (public/support.html): posts to /api/feedback, the same
   endpoint as the website's feedback form and the app's "Report a problem".
   ES5 on purpose (old Android WebViews). Without JavaScript the page still
   shows the support email. */
(function () {
  "use strict";
  var form = document.getElementById("cnSupportForm");
  if (!form) return;
  var email = document.getElementById("cnSupportEmail");
  var topic = document.getElementById("cnSupportTopic");
  var message = document.getElementById("cnSupportMessage");
  var trap = document.getElementById("cnSupportWebsite");
  var button = document.getElementById("cnSupportSend");
  var status = document.getElementById("cnSupportStatus");
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var FALLBACK = "It didn't send. Please email support@cybernetai.app instead.";

  function show(text, kind) {
    status.textContent = text;
    status.className = "cn-app-status" + (kind ? " is-" + kind : "");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = String(message.value || "").replace(/^\s+|\s+$/g, "");
    var address = String(email.value || "").replace(/^\s+|\s+$/g, "");
    if (!text) { show("Write a message before sending.", "error"); message.focus(); return; }
    if (address && !EMAIL.test(address)) { show("Enter a valid email, or leave it empty.", "error"); email.focus(); return; }
    if (!window.fetch) { show(FALLBACK, "error"); return; }

    button.disabled = true;
    show("Sending...", "");
    window.fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        category: topic.value,
        message: text,
        email: address || undefined,
        page: "/support",
        bot_field: trap ? trap.value : ""
      })
    }).then(function (response) {
      return response.json().then(function (data) { return { ok: response.ok, data: data || {} }; }, function () { return { ok: response.ok, data: {} }; });
    }).then(function (result) {
      if (!result.ok) throw new Error(result.data.error || FALLBACK);
      form.reset();
      show(address ? "Thank you. Your message reached CyberNet support, and we'll reply by email." : "Thank you. Your message reached CyberNet support.", "ok");
    }).then(null, function (error) {
      show((error && error.message) || FALLBACK, "error");
    }).then(function () {
      button.disabled = false;
    });
  });
})();
