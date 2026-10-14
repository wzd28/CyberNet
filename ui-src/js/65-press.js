/* CyberNet UI: press feedback and pressed state (owner: aurora).
   1. The press itself is CSS (scale .98 on :active, 01-base.css). iOS Safari only applies
      :active while a touchstart listener exists somewhere on the page, so this registers one
      passive no-op listener. Nothing is added to buttons and nothing follows the pointer.
   2. Segmented controls say which option is selected (WCAG 4.1.2). Legacy marks the chosen
      option with a class only (.active / .is-active), so screen readers heard five plain
      buttons. This mirrors that class into aria-pressed (aria-selected where the button is a
      role="tab"), observe-only: legacy code keeps switching the classes and never sees us.
      Groups get a name. Controls injected later (Legal Center, how-to) are picked up after
      the click that opens them. */
(function () {
  "use strict";
  document.addEventListener("touchstart", function () {}, { passive: true });

  var CN = window.CN;
  if (!CN || !("MutationObserver" in window)) return;

  var MAP = [
    [".detect-tabs .detect-tab", "active"],
    ["#pricingToggle .toggle-option", "active"],
    [".cn-seat-option", "is-active"],
    [".video-modal-tab", "active"],
    [".cn-legal-tab", "active"],
    [".auth-tabs .auth-tab", "active"],
    [".recovery-timeline-tabs .recovery-timeline-tab", "active"]
  ];
  var GROUPS = [
    [".detect-tabs", "What to scan"],
    ["#pricingToggle", "Billing period"],
    [".cn-seat-options", "Team size"],
    [".video-modal-tabs", "Choose a guide"],
    [".auth-tabs", "Sign in or create an account"],
    [".recovery-timeline-tabs", "Recovery timeline"]
  ];

  function bind(el, cls) {
    if (el.__cnPress) return;
    el.__cnPress = true;
    var attr = el.getAttribute("role") === "tab" ? "aria-selected" : "aria-pressed";
    var sync = function () {
      var v = el.classList.contains(cls) ? "true" : "false";
      if (el.getAttribute(attr) !== v) el.setAttribute(attr, v);
    };
    sync();
    new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["class"] });
  }

  function scan() {
    MAP.forEach(function (m) { CN.qsa(m[0]).forEach(function (el) { bind(el, m[1]); }); });
    GROUPS.forEach(function (g) {
      CN.qsa(g[0]).forEach(function (el) {
        if (el.hasAttribute("role")) return;
        el.setAttribute("role", "group");
        if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) el.setAttribute("aria-label", g[1]);
      });
    });
  }

  var queued = 0;
  CN.onReady(scan);
  document.addEventListener("click", function () {
    if (queued) return;
    queued = setTimeout(function () { queued = 0; scan(); }, 0);
  }, true);
})();
