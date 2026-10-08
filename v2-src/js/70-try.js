/* "Try" buttons in the home paste box. Each one runs a real Quick Scan on an
   example (a scam text, a scam link, or a QR code image), so it uses one of the
   visitor's daily Quick Scans like any other scan. The scan itself is done by the
   existing Quick Scan buttons and handlers in script.js; guests get the normal
   sign-up prompt. The example addresses use the reserved .invalid domain, so they
   can never open a real website. */
(function () {
  "use strict";
  var EXAMPLES = {
    text: "Your parcel is on hold. Pay the $1.99 redelivery fee today to avoid return: parcel-redeliver-help.invalid/pay",
    link: "https://secure-acct-verify.invalid/login",
    qr: "/v2/example-qr.png"
  };
  var busy = false;

  function openQuickScan() {
    var nav = document.querySelector('.nav-tabs .nav-link[data-page="cybernet"]');
    if (nav) nav.click();
  }
  function selectTab(name) {
    var tab = document.querySelector('.detect-tab[data-tab="' + name + '"]');
    if (tab && !tab.classList.contains("active")) tab.click();
  }
  function fill(input, value) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function runText(kind) {
    var isLink = kind === "link";
    selectTab(isLink ? "link" : "text");
    var input = document.getElementById(isLink ? "cyberLinkInput" : "cyberTextInput");
    var btn = document.getElementById(isLink ? "cyberLinkBtn" : "cyberTextBtn");
    if (!input || !btn) return;
    fill(input, EXAMPLES[kind]);
    btn.click();
  }
  function runQr() {
    selectTab("image");
    var input = document.getElementById("cyberImageInput");
    if (!input) return;
    fetch(EXAMPLES.qr).then(function (r) { return r.blob(); }).then(function (blob) {
      var file = new File([blob], "example-scam-qr.png", { type: "image/png" });
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }).catch(function () {});
  }

  document.addEventListener("click", function (e) {
    var chip = e.target && e.target.closest && e.target.closest(".v2-chip[data-v2-try]");
    if (!chip || busy) return;
    var kind = chip.getAttribute("data-v2-try");
    if (!EXAMPLES[kind]) return;
    busy = true;
    var box = document.getElementById("v2ScanInput");
    if (box && kind !== "qr") box.value = EXAMPLES[kind];
    openQuickScan();
    // script.js swaps pages after a 300 ms fade; run once Quick Scan is on screen.
    setTimeout(function () {
      if (kind === "qr") runQr(); else runText(kind);
      var page = document.getElementById("cybernet");
      if (page && page.scrollIntoView) page.scrollIntoView({ block: "start" });
      busy = false;
    }, 480);
  });
})();
