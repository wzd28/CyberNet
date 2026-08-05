(() => {
  "use strict";

  const LOGO_URL = "cybernet-logo.png";
  const SHIELD_URL = "cybernet-shield.png";
  const FIX_ID = "cybernetFinalUiFixStyles";
  const REPORTS_TAB_ID = "cybernetAccountReportsTab";
  const INFO_TAB_ID = "cybernetAccountInfoTab";

  const CP1252_TO_BYTE = new Map([
    ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85],
    ["†", 0x86], ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a],
    ["‹", 0x8b], ["Œ", 0x8c], ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92],
    ["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96], ["—", 0x97],
    ["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b], ["œ", 0x9c],
    ["ž", 0x9e], ["Ÿ", 0x9f]
  ]);

  const BAD_TEXT_PATTERN = /(?:Ã.|Â.|â.|ð.|ï¿½|�)/;
  let observerQueued = false;

  function injectStyles() {
    if (document.getElementById(FIX_ID)) return;

    const style = document.createElement("style");
    style.id = FIX_ID;
    style.textContent = `
      .cn-brand-logo{
        display:block;
        width:42px;
        height:42px;
        flex:0 0 42px;
        object-fit:contain;
        border-radius:50%;
        filter:drop-shadow(0 0 12px rgba(34,211,238,.34));
      }

      .brand .cn-brand-logo{
        width:38px;
        height:38px;
        flex-basis:38px;
      }

      .auth-logo .cn-brand-logo,
      .cn-modal-mark .cn-brand-logo{
        width:76px;
        height:76px;
        margin:0 auto;
      }

      .ghost-side-brand .cn-brand-logo{
        width:42px;
        height:42px;
      }

      .cn-account-title-row{
        display:flex;
        align-items:center;
        gap:14px;
        margin:5px 0 8px;
      }

      .cn-account-title-row .cn-brand-logo{
        width:58px;
        height:58px;
        flex-basis:58px;
      }

      .cn-account-title-row h2{
        margin:0!important;
      }

      .hero-shield .cn-hero-shield-image{
        display:block;
        width:100%;
        height:100%;
        object-fit:contain;
        filter:
          drop-shadow(0 0 11px rgba(65,231,245,.72))
          drop-shadow(0 0 28px rgba(34,211,238,.34));
        animation:cnShieldBreathe 3.6s ease-in-out infinite;
      }

      @keyframes cnShieldBreathe{
        0%,100%{transform:scale(.985);filter:drop-shadow(0 0 10px rgba(65,231,245,.6)) drop-shadow(0 0 24px rgba(34,211,238,.28))}
        50%{transform:scale(1.025);filter:drop-shadow(0 0 15px rgba(65,231,245,.86)) drop-shadow(0 0 38px rgba(34,211,238,.43))}
      }

      .cn-safe-icon{
        display:block;
        width:25px;
        height:25px;
        color:currentColor;
      }

      .cn-account-tabs{
        display:flex;
        gap:8px;
        margin:4px 0 18px;
        padding:5px;
        border:1px solid var(--glass-border,rgba(56,189,248,.16));
        border-radius:14px;
        background:rgba(2,9,18,.42);
      }

      .cn-account-tab{
        flex:1 1 0;
        min-height:44px;
        border:0;
        border-radius:10px;
        padding:10px 14px;
        background:transparent;
        color:var(--muted,#7d93ad);
        font-family:var(--font-mono,monospace);
        font-size:11px;
        font-weight:800;
        letter-spacing:.045em;
        cursor:pointer;
        transition:background .2s ease,color .2s ease,box-shadow .2s ease;
      }

      .cn-account-tab.active{
        color:#eafcff;
        background:linear-gradient(135deg,rgba(34,211,238,.18),rgba(59,130,246,.1));
        box-shadow:inset 0 0 0 1px rgba(34,211,238,.25),0 0 22px rgba(34,211,238,.08);
      }

      .cn-account-pane[hidden]{display:none!important}

      .cn-account-reports-pane{
        display:grid;
        gap:18px;
      }

      .cn-account-report-section{
        border:1px solid var(--glass-border,rgba(56,189,248,.16));
        border-radius:17px;
        padding:18px;
        background:rgba(2,9,18,.38);
      }

      .cn-account-report-heading{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        margin-bottom:14px;
      }

      .cn-account-report-heading h3{
        margin:3px 0 4px;
        color:var(--text,#eaf3fb);
        font-size:18px;
      }

      .cn-account-report-heading p{
        margin:0;
        color:var(--muted,#7d93ad);
        font-size:11px;
        line-height:1.6;
      }

      .cn-account-report-heading span{
        flex:0 0 auto;
        border:1px solid rgba(34,211,238,.25);
        border-radius:999px;
        padding:6px 9px;
        color:var(--green-bright,#a5f0ff);
        background:rgba(34,211,238,.075);
        font-family:var(--font-mono,monospace);
        font-size:9px;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.06em;
      }

      #accountDetailsModal .cybernet-account-card{
        width:min(1120px,calc(100vw - 28px));
      }

      #accountDetailsModal .pro-history-card{
        margin:0;
      }

      #accountDetailsModal [data-protect-pane="saved"]{
        display:block!important;
        opacity:1!important;
        visibility:visible!important;
        transform:none!important;
      }

      #accountDetailsModal .protect-investigation-intro{
        margin-bottom:14px;
      }

      #accountDetailsModal .protect-saved-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
      }

      #accountDetailsModal .protect-saved-case{
        border:1px solid var(--glass-border,rgba(56,189,248,.16));
        border-radius:15px;
        padding:15px;
        background:rgba(8,18,33,.58);
        display:grid;
        gap:9px;
      }

      #accountDetailsModal .protect-saved-case h3{font-size:14px;margin:0;color:var(--text,#eaf3fb);overflow-wrap:anywhere}
      #accountDetailsModal .protect-saved-case p{color:var(--muted,#7d93ad);font-size:11px;line-height:1.55;margin:0}
      #accountDetailsModal .protect-saved-meta{display:flex;gap:6px;flex-wrap:wrap}
      #accountDetailsModal .protect-saved-case small{color:var(--soft,#425873);font-family:var(--font-mono,monospace);font-size:9px}
      #accountDetailsModal .protect-saved-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:3px}
      #accountDetailsModal .protect-no-cases{grid-column:1/-1;border:1px dashed var(--glass-border,rgba(56,189,248,.16));border-radius:15px;padding:35px;text-align:center;color:var(--muted,#7d93ad);font-size:12px;line-height:1.7}
      #accountDetailsModal .protect-primary,
      #accountDetailsModal .protect-secondary,
      #accountDetailsModal .protect-danger-btn{
        min-height:38px;
        border-radius:10px;
        padding:9px 13px;
        font-family:var(--font-mono,monospace);
        font-size:10px;
        font-weight:800;
        cursor:pointer;
      }
      #accountDetailsModal .protect-primary{border:1px solid rgba(34,211,238,.45);background:linear-gradient(135deg,#22d3ee,#3b82f6);color:#03101b}
      #accountDetailsModal .protect-secondary{border:1px solid var(--glass-border,rgba(56,189,248,.18));background:rgba(255,255,255,.035);color:var(--text,#eaf3fb)}
      #accountDetailsModal .protect-danger-btn{border:1px solid rgba(255,107,107,.28);background:rgba(255,107,107,.07);color:#ff9a9a}
      #accountDetailsModal .protect-badge{display:inline-flex;border-radius:999px;padding:5px 8px;border:1px solid var(--glass-border,rgba(56,189,248,.18));font-family:var(--font-mono,monospace);font-size:8px;text-transform:uppercase;color:var(--muted,#7d93ad)}
      #accountDetailsModal .protect-badge.malicious,
      #accountDetailsModal .protect-badge.critical,
      #accountDetailsModal .protect-badge.high{border-color:rgba(255,107,107,.3);color:#ff9a9a;background:rgba(255,107,107,.06)}
      #accountDetailsModal .protect-badge.suspicious,
      #accountDetailsModal .protect-badge.medium{border-color:rgba(255,207,107,.3);color:#ffcf6b;background:rgba(255,207,107,.06)}
      #accountDetailsModal .protect-badge.low_risk,
      #accountDetailsModal .protect-badge.low{border-color:rgba(52,211,153,.3);color:#6ee7b7;background:rgba(52,211,153,.06)}

      @media(max-width:900px){
        .mobile-menu{
          display:inline-flex!important;
          align-items:center;
          justify-content:center;
          min-width:86px;
          min-height:42px;
          padding:9px 14px!important;
          border:1px solid rgba(34,211,238,.34)!important;
          border-radius:12px!important;
          background:linear-gradient(135deg,rgba(34,211,238,.16),rgba(59,130,246,.08))!important;
          color:#dffaff!important;
          font-family:var(--font-mono,monospace)!important;
          font-size:12px!important;
          font-weight:900!important;
          letter-spacing:.05em!important;
          line-height:1!important;
          text-transform:uppercase;
          box-shadow:0 0 18px rgba(34,211,238,.1),inset 0 0 0 1px rgba(255,255,255,.02);
          cursor:pointer;
        }

        .navbar.open .mobile-menu{
          background:rgba(255,107,107,.08)!important;
          border-color:rgba(255,107,107,.28)!important;
          color:#ffb5b5!important;
        }
      }

      @media(max-width:720px){
        #accountDetailsModal .cybernet-account-card{padding:20px 14px}
        .cn-account-title-row .cn-brand-logo{width:48px;height:48px;flex-basis:48px}
        .cn-account-tabs{position:sticky;top:-20px;z-index:3;background:rgba(4,13,25,.96)}
        #accountDetailsModal .protect-saved-grid{grid-template-columns:1fr}
        .cn-account-report-section{padding:14px}
        .cn-account-report-heading{display:block}
        .cn-account-report-heading span{display:inline-flex;margin-top:9px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUtf8Meta() {
    let meta = document.querySelector('meta[charset]');
    if (!meta) {
      meta = document.createElement("meta");
      document.head.prepend(meta);
    }
    meta.setAttribute("charset", "UTF-8");
  }

  function ensureFavicon() {
    let icon = document.querySelector('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.type = "image/png";
    icon.href = LOGO_URL;
  }

  function cp1252Bytes(value) {
    const bytes = [];
    for (const char of value) {
      const code = char.codePointAt(0);
      if (code <= 0xff) {
        bytes.push(code);
      } else if (CP1252_TO_BYTE.has(char)) {
        bytes.push(CP1252_TO_BYTE.get(char));
      } else {
        return null;
      }
    }
    return new Uint8Array(bytes);
  }

  function badTextScore(value) {
    const matches = String(value).match(/(?:Ã|Â|â|ð|ï¿½|�)/g);
    return matches ? matches.length : 0;
  }

  function decodeMojibakeOnce(value) {
    if (!BAD_TEXT_PATTERN.test(value)) return value;
    const bytes = cp1252Bytes(value);
    if (!bytes) return value;

    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return badTextScore(decoded) < badTextScore(value) ? decoded : value;
    } catch {
      return value;
    }
  }

  function repairString(value) {
    let current = String(value ?? "");
    for (let pass = 0; pass < 2; pass += 1) {
      const next = decodeMojibakeOnce(current);
      if (next === current) break;
      current = next;
    }
    return current;
  }

  function shouldSkipTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "PRE", "CODE"].includes(parent.tagName);
  }

  function repairTextNode(node) {
    if (shouldSkipTextNode(node)) return;
    const repaired = repairString(node.nodeValue || "");
    if (repaired !== node.nodeValue) node.nodeValue = repaired;
  }

  function repairElementAttributes(element) {
    if (!(element instanceof Element)) return;
    ["title", "aria-label", "placeholder"].forEach((name) => {
      if (!element.hasAttribute(name)) return;
      const original = element.getAttribute(name) || "";
      const repaired = repairString(original);
      if (repaired !== original) element.setAttribute(name, repaired);
    });
  }

  function repairSubtree(root = document.body) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      repairTextNode(root);
      return;
    }

    if (root instanceof Element) repairElementAttributes(root);

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    );

    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) repairTextNode(node);
      else repairElementAttributes(node);
      node = walker.nextNode();
    }
  }

  function createLogoImage(className = "cn-brand-logo") {
    const image = document.createElement("img");
    image.src = LOGO_URL;
    image.alt = "CyberNet AI logo";
    image.className = className;
    image.decoding = "async";
    return image;
  }

  function replaceBrandMark(element) {
    if (!element || element.dataset.cnLogoApplied === "true") return;
    element.dataset.cnLogoApplied = "true";
    element.textContent = "";
    element.appendChild(createLogoImage());
  }

  function applyBrandLogos() {
    document.querySelectorAll(".brand-mark, .cn-modal-mark").forEach((element) => {
      const text = (element.textContent || "").trim();
      if (text.includes(">_") || element.classList.contains("cn-modal-mark") || element.closest(".auth-logo,.brand,.ghost-side-brand")) {
        replaceBrandMark(element);
      }
    });
  }

  function applyHeroShield() {
    const heroShield = document.querySelector(".hero-shield");
    if (!heroShield || heroShield.dataset.cnShieldApplied === "true") return;

    heroShield.dataset.cnShieldApplied = "true";
    heroShield.querySelector("svg")?.remove();

    const image = document.createElement("img");
    image.src = SHIELD_URL;
    image.alt = "CyberNet AI shield and lock";
    image.className = "cn-hero-shield-image";
    image.decoding = "async";
    heroShield.appendChild(image);
  }

  function safeIconSvg(kind) {
    const common = 'class="cn-safe-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"';
    if (kind === "threat") {
      return `<svg ${common}><path d="M12 3 22 20H2L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1" fill="currentColor"/></svg>`;
    }
    if (kind === "secure") {
      return `<svg ${common}><path d="M12 2.8 20 6v5.8c0 4.7-3.1 7.7-8 9.4-4.9-1.7-8-4.7-8-9.4V6l8-3.2Z" stroke="currentColor" stroke-width="1.7"/><path d="m8.4 12.2 2.2 2.2 5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    return `<svg ${common}><path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 7v5l3.2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function replaceStatusIcons() {
    const mappings = [
      [".badge-threat .badge-icon", "threat"],
      [".badge-secure .badge-icon", "secure"],
      [".badge-scan .badge-icon", "scan"]
    ];

    mappings.forEach(([selector, kind]) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (element.dataset.cnSafeIcon === kind) return;
        element.dataset.cnSafeIcon = kind;
        element.innerHTML = safeIconSvg(kind);
      });
    });
  }

  function syncMobileMenuLabel() {
    const button = document.getElementById("mobileMenu") || document.querySelector(".mobile-menu");
    const navbar = document.querySelector(".navbar");
    if (!button) return;

    const open = Boolean(navbar?.classList.contains("open"));
    const label = open ? "Close" : "Menu";
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    button.setAttribute("aria-expanded", String(open));
  }

  function setupMobileMenu() {
    const button = document.getElementById("mobileMenu") || document.querySelector(".mobile-menu");
    if (!button || button.dataset.cnMenuFixed === "true") return;

    button.dataset.cnMenuFixed = "true";
    syncMobileMenuLabel();
    button.addEventListener("click", () => requestAnimationFrame(syncMobileMenuLabel));

    document.querySelectorAll(".nav-tabs .nav-link").forEach((link) => {
      link.addEventListener("click", () => requestAnimationFrame(syncMobileMenuLabel));
    });

    const navbar = document.querySelector(".navbar");
    if (navbar) {
      new MutationObserver(syncMobileMenuLabel).observe(navbar, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
  }

  function accountSetTab(tabName) {
    const infoButton = document.getElementById(INFO_TAB_ID);
    const reportsButton = document.getElementById(REPORTS_TAB_ID);
    const infoPane = document.getElementById("cybernetAccountInfoPane");
    const reportsPane = document.getElementById("cybernetAccountReportsPane");
    const reportsActive = tabName === "reports";

    infoButton?.classList.toggle("active", !reportsActive);
    reportsButton?.classList.toggle("active", reportsActive);
    infoButton?.setAttribute("aria-selected", String(!reportsActive));
    reportsButton?.setAttribute("aria-selected", String(reportsActive));
    if (infoPane) infoPane.hidden = reportsActive;
    if (reportsPane) reportsPane.hidden = !reportsActive;
  }

  function addAccountTitleLogo(head) {
    const title = document.getElementById("cybernetAccountTitle");
    if (!title || title.closest(".cn-account-title-row")) return;

    const row = document.createElement("div");
    row.className = "cn-account-title-row";
    title.replaceWith(row);
    row.append(createLogoImage(), title);

    const description = head.querySelector("p");
    if (description) {
      description.textContent = "Your identity, subscription, daily usage, saved reports, and billing controls in one secure place.";
    }
  }

  function createReportSection(title, description, badgeText) {
    const section = document.createElement("section");
    section.className = "cn-account-report-section";
    const heading = document.createElement("div");
    heading.className = "cn-account-report-heading";
    heading.innerHTML = `<div><h3>${title}</h3><p>${description}</p></div><span>${badgeText}</span>`;
    section.appendChild(heading);
    return section;
  }

  function hideProtectSavedTab() {
    const candidates = document.querySelectorAll(
      '#cybernet [data-protect-mode="saved"], #cybernet button, #cybernet [role="tab"]'
    );

    candidates.forEach((element) => {
      const normalized = (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (element.getAttribute("data-protect-mode") === "saved" || normalized === "saved reports") {
        element.remove();
      }
    });
  }

  function moveReportsIntoAccount(reportsPane) {
    const aiHistory = document.getElementById("proHistoryCard");
    if (aiHistory && !aiHistory.closest("#cybernetAccountReportsPane")) {
      const section = createReportSection(
        "AI Scan History",
        "Your completed CyberNet AI analyses appear here when your plan includes saved history.",
        "Account history"
      );
      section.appendChild(aiHistory);
      reportsPane.appendChild(section);
    }

    const protectSaved = document.querySelector('#cybernet [data-protect-pane="saved"]');
    if (protectSaved && !protectSaved.closest("#cybernetAccountReportsPane")) {
      const section = createReportSection(
        "Investigation Reports",
        "Open, review, or delete the cases saved by CyberNet Protect on this browser.",
        "Saved reports"
      );
      section.appendChild(protectSaved);
      reportsPane.appendChild(section);
    }

    if (!reportsPane.querySelector(".cn-account-report-section")) {
      const empty = createReportSection(
        "Saved Reports",
        "Your saved CyberNet reports and scan history will appear here.",
        "Account"
      );
      const message = document.createElement("p");
      message.className = "protect-no-cases";
      message.textContent = "No saved reports are available yet.";
      empty.appendChild(message);
      reportsPane.appendChild(empty);
    }

    hideProtectSavedTab();
  }

  function setupAccountReports() {
    const modal = document.getElementById("accountDetailsModal");
    const card = modal?.querySelector(".cybernet-account-card");
    const head = card?.querySelector(".cybernet-account-head");
    const grid = card?.querySelector(".cybernet-account-grid");
    const actions = card?.querySelector(".cybernet-account-actions");
    const message = document.getElementById("accountDetailsMessage");

    if (!modal || !card || !head || !grid || !actions || !message) return false;

    addAccountTitleLogo(head);

    let tabs = card.querySelector(".cn-account-tabs");
    let infoPane = document.getElementById("cybernetAccountInfoPane");
    let reportsPane = document.getElementById("cybernetAccountReportsPane");

    if (!tabs) {
      tabs = document.createElement("div");
      tabs.className = "cn-account-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.innerHTML = `
        <button type="button" id="${INFO_TAB_ID}" class="cn-account-tab active" role="tab" aria-selected="true">Account Info</button>
        <button type="button" id="${REPORTS_TAB_ID}" class="cn-account-tab" role="tab" aria-selected="false">Saved Reports</button>
      `;
      head.insertAdjacentElement("afterend", tabs);

      infoPane = document.createElement("div");
      infoPane.id = "cybernetAccountInfoPane";
      infoPane.className = "cn-account-pane";
      tabs.insertAdjacentElement("afterend", infoPane);
      infoPane.append(grid, actions, message);

      reportsPane = document.createElement("div");
      reportsPane.id = "cybernetAccountReportsPane";
      reportsPane.className = "cn-account-pane cn-account-reports-pane";
      reportsPane.hidden = true;
      infoPane.insertAdjacentElement("afterend", reportsPane);

      document.getElementById(INFO_TAB_ID)?.addEventListener("click", () => accountSetTab("info"));
      document.getElementById(REPORTS_TAB_ID)?.addEventListener("click", () => accountSetTab("reports"));

      document.getElementById("accountNavBtn")?.addEventListener("click", () => accountSetTab("info"));
    }

    moveReportsIntoAccount(reportsPane);

    if (modal.dataset.cnReportOpenHandler !== "true") {
      modal.dataset.cnReportOpenHandler = "true";
      modal.addEventListener("click", (event) => {
        const openButton = event.target.closest?.("[data-open-case]");
        if (!openButton) return;

        setTimeout(() => {
          modal.classList.remove("show", "open");
          modal.setAttribute("aria-hidden", "true");
          const protectNav = document.querySelector('.nav-link[data-page="cybernet"]');
          protectNav?.click();
        }, 0);
      });
    }

    return true;
  }

  function refreshDynamicUi() {
    repairSubtree(document.body);
    applyBrandLogos();
    applyHeroShield();
    replaceStatusIcons();
    setupMobileMenu();
    setupAccountReports();
  }

  function queueRefresh() {
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      refreshDynamicUi();
    });
  }

  function observeDynamicChanges() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          if (BAD_TEXT_PATTERN.test(mutation.target.nodeValue || "")) {
            queueRefresh();
            return;
          }
        }

        if (mutation.addedNodes.length) {
          queueRefresh();
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function init() {
    if (document.documentElement.dataset.cybernetFinalUiFix === "ready") return;
    document.documentElement.dataset.cybernetFinalUiFix = "ready";

    ensureUtf8Meta();
    ensureFavicon();
    injectStyles();
    refreshDynamicUi();
    observeDynamicChanges();

    // Late-created upgrade panels are retried briefly without requiring a page refresh.
    let retries = 0;
    const retryTimer = setInterval(() => {
      retries += 1;
      refreshDynamicUi();
      if (retries >= 12 || document.getElementById("cybernetAccountReportsPane")) {
        clearInterval(retryTimer);
      }
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
