/*
  CyberNet AI — analytics cookie choice
  Google Analytics (GA4) runs only after the visitor presses Accept. Until then,
  and after Decline, no Google script is loaded, no request goes to Google and no
  _ga cookie is set. The choice is kept in localStorage and can be changed from
  the "Cookie settings" control in the footer or on the Privacy Policy page.
*/
(() => {
  "use strict";

  const MEASUREMENT_ID = "G-HF72PVV8D6";
  const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  const STORAGE_KEY = "cybernet_analytics_consent";
  const STORAGE_VERSION = 1;
  const BAR_ID = "cnConsentBar";
  const PARENT_DOMAIN = "cybernetai.app";

  // The only query parameters Google ever sees: campaign tags and ad click IDs.
  // Everything else is dropped because some CyberNet URLs carry secrets
  // (/accept-invite?token=..., ?code=... from sign-in, ?reset=1), and the #hash
  // is never sent because Supabase puts access tokens there after sign-in.
  const KEPT_PARAMS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid"
  ];

  let pageChoice = null;
  let gaLoaded = false;
  let returnFocusTo = null;

  /* ─── Stored choice ─── */

  function readStoredChoice() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (saved && saved.v === STORAGE_VERSION && (saved.choice === "granted" || saved.choice === "denied")) {
        return saved.choice;
      }
    } catch {
      // Storage blocked or the value is not JSON: treat as no choice yet.
    }
    return null;
  }

  function currentChoice() {
    return pageChoice || readStoredChoice();
  }

  function saveChoice(choice) {
    pageChoice = choice;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: Date.now(), v: STORAGE_VERSION }));
    } catch {
      // Storage unavailable: the choice holds for this page only and the bar
      // comes back on the next visit.
    }
  }

  /* ─── Address sanitising ─── */

  function sanitiseUrl(url) {
    const kept = new URLSearchParams();
    KEPT_PARAMS.forEach(name => {
      url.searchParams.getAll(name).forEach(value => kept.append(name, value));
    });
    const query = kept.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
  }

  function sanitisedLocation() {
    try {
      return sanitiseUrl(new URL(window.location.href));
    } catch {
      return `${window.location.origin}${window.location.pathname}`;
    }
  }

  function sanitisedReferrer() {
    const referrer = document.referrer || "";
    if (!referrer) return "";
    try {
      const url = new URL(referrer);
      if (url.origin === window.location.origin) return sanitiseUrl(url);
      return `${url.origin}${url.pathname}`;
    } catch {
      return "";
    }
  }

  /* ─── Google Analytics ─── */

  function gtag() {
    window.dataLayer.push(arguments);
  }

  function loadAnalytics() {
    window[`ga-disable-${MEASUREMENT_ID}`] = false;

    if (gaLoaded) {
      if (typeof window.gtag === "function") window.gtag("consent", "update", { analytics_storage: "granted" });
      return;
    }
    gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") window.gtag = gtag;

    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });

    if (!document.querySelector(`script[src="${GTAG_SRC}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.src = GTAG_SRC;
      document.head.appendChild(script);
    }

    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      page_location: sanitisedLocation(),
      page_referrer: sanitisedReferrer(),
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  }

  function cookieDomains() {
    const host = window.location.hostname;
    const domains = new Set();
    if (!host || /^[\d.]+$/.test(host) || host.includes(":")) return domains;

    const labels = host.split(".");
    for (let i = 0; i < labels.length - 1; i += 1) {
      const domain = labels.slice(i).join(".");
      domains.add(domain);
      domains.add(`.${domain}`);
    }
    if (host === PARENT_DOMAIN || host.endsWith(`.${PARENT_DOMAIN}`)) {
      domains.add(PARENT_DOMAIN);
      domains.add(`.${PARENT_DOMAIN}`);
    }
    return domains;
  }

  function deleteAnalyticsCookies() {
    const names = document.cookie
      .split(";")
      .map(part => part.split("=")[0].trim())
      .filter(name => name === "_ga" || name.startsWith("_ga_"));
    if (!names.length) return;

    const expired = "=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    const domains = cookieDomains();
    names.forEach(name => {
      document.cookie = `${name}${expired}`;
      domains.forEach(domain => {
        document.cookie = `${name}${expired}; domain=${domain}`;
      });
    });
  }

  function stopAnalytics() {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "denied" });
    }
    // Google's documented switch: gtag.js sends nothing for this ID while set.
    if (gaLoaded) window[`ga-disable-${MEASUREMENT_ID}`] = true;
    deleteAnalyticsCookies();
  }

  /* ─── The bar ─── */

  function buildBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement("section");
    bar.id = BAR_ID;
    bar.className = "cn-consent";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookie choice");
    bar.hidden = true;
    bar.innerHTML = `
      <div class="cn-consent-copy">
        <p class="cn-consent-title">Allow analytics cookies?</p>
        <p class="cn-consent-text">CyberNet AI uses Google Analytics to count visits and see which pages help people. Nothing you scan or type is sent to Google. <a href="/privacy.html#browser">Privacy Policy</a></p>
        <p class="cn-consent-current" id="cnConsentCurrent" hidden></p>
      </div>
      <div class="cn-consent-actions">
        <button type="button" class="cn-consent-btn" data-cn-consent-choice="denied">Decline</button>
        <button type="button" class="cn-consent-btn" data-cn-consent-choice="granted">Accept</button>
      </div>
    `;

    bar.addEventListener("click", event => {
      const button = event.target.closest?.("[data-cn-consent-choice]");
      if (button) choose(button.dataset.cnConsentChoice);
    });

    document.body.insertBefore(bar, document.body.firstChild);
    return bar;
  }

  function reserveSpace(bar) {
    const root = document.documentElement;
    if (!bar || bar.hidden) {
      root.classList.remove("cn-consent-visible");
      root.style.removeProperty("--cn-consent-space");
      return;
    }
    root.classList.add("cn-consent-visible");
    root.style.setProperty("--cn-consent-space", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  }

  function showBar({ focus = false } = {}) {
    const bar = buildBar();
    const choice = currentChoice();

    bar.querySelectorAll("[data-cn-consent-choice]").forEach(button => {
      if (choice) button.setAttribute("aria-pressed", String(button.dataset.cnConsentChoice === choice));
      else button.removeAttribute("aria-pressed");
    });

    const current = bar.querySelector("#cnConsentCurrent");
    if (current) {
      current.hidden = !choice;
      current.textContent = choice === "granted"
        ? "Current choice: analytics allowed."
        : choice === "denied" ? "Current choice: analytics declined." : "";
    }

    bar.hidden = false;
    reserveSpace(bar);

    if (focus) {
      const target = bar.querySelector(`[data-cn-consent-choice="${choice || "denied"}"]`);
      target?.focus({ preventScroll: true });
    }
  }

  function hideBar() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    const hadFocus = bar.contains(document.activeElement);
    bar.hidden = true;
    reserveSpace(bar);
    if (hadFocus && returnFocusTo && document.contains(returnFocusTo)) {
      returnFocusTo.focus({ preventScroll: true });
    }
    returnFocusTo = null;
  }

  function choose(choice) {
    if (choice !== "granted" && choice !== "denied") return;
    saveChoice(choice);

    if (choice === "granted") loadAnalytics();
    else stopAnalytics();

    hideBar();
  }

  function open() {
    const active = document.activeElement;
    returnFocusTo = active && active !== document.body ? active : null;
    showBar({ focus: true });
  }

  /* ─── Start ─── */

  function start() {
    if (document.documentElement.dataset.cybernetConsent === "ready") return;
    document.documentElement.dataset.cybernetConsent = "ready";

    const choice = currentChoice();
    if (choice === "granted") loadAnalytics();
    else if (choice === "denied") deleteAnalyticsCookies();
    else showBar();

    document.addEventListener("click", event => {
      const opener = event.target.closest?.("[data-cn-consent-open]");
      if (!opener) return;
      event.preventDefault();
      open();
    });

    window.addEventListener("resize", () => {
      const bar = document.getElementById(BAR_ID);
      if (bar && !bar.hidden) reserveSpace(bar);
    });
  }

  window.CyberNetConsent = Object.freeze({
    open,
    choice: () => currentChoice()
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
