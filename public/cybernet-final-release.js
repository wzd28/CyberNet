(() => {
  "use strict";

  const RELEASE_VERSION = "2026-08-06";
  const PENDING_KEY = "cybernet_pending_legal_acceptances";
  const PREVIEW_IMAGE = "ghostscan-preview.png";
  const ORIGINAL_PRIVACY_KEYS = [
    "cybernetGhostHistory",
    "cybernet_protect_cases",
    "cybernetProtectCases",
    "cybernet_scan_history"
  ];
  let client = null;
  let syncRunning = false;
  let checkoutIntercepting = false;
  let refreshQueued = false;

  const byId = id => document.getElementById(id);

  function injectStylesheet() {
    if (document.querySelector('link[href="cybernet-final-release.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "cybernet-final-release.css";
    document.head.appendChild(link);
  }

  function updatePricingHeading() {
    const heading = document.querySelector("#pricing .pricing-head h1, #pricing .section-head h1");
    if (heading && !/One platform/i.test(heading.textContent || "")) {
      heading.innerHTML = "One platform. <span>Complete protection.</span>";
    }
  }

  function replaceMisleadingPrivacyClaims() {
    const replacements = new Map([
      ["on-device, never stored or sold", "data minimised and never sold"],
      ["Your data stays on your device. We don't store, share, or sell anything.", "CyberNet minimises data, protects account information, and does not sell personal data. Submitted evidence may be processed by disclosed service providers to deliver analysis."],
      ["Your data is encrypted, secure, and never shared.", "CyberNet uses security controls and shares limited data only with disclosed providers when needed to operate the service."],
      ["Advanced AI detects and neutralizes threats in real-time.", "Advanced analysis helps identify suspicious signals and explains defensive next steps."],
      ["24/7 monitoring protects you from evolving threats.", "On-demand analysis helps you review suspicious content before taking action."],
      ["Used by individuals and organizations globally.", "Designed for individuals, students, and organisations seeking clearer cyber-risk guidance."]
    ]);

    document.querySelectorAll("#about p, #about .fetch-line span, .why-choose-item p").forEach(element => {
      const original = (element.textContent || "").trim();
      const replacement = replacements.get(original);
      if (replacement) element.textContent = replacement;
    });
  }

  function updateByokDisclosure() {
    const panel = byId("cybernetByokPanel");
    if (!panel) return;
    const description = panel.querySelector(":scope > p");
    if (description) {
      description.textContent = "Optional BYOK mode for CyberNet AI Text, Link, and Image analysis. Your OpenAI project is billed directly by OpenAI, and the key is validated through a secure Netlify Function.";
    }
    const privacy = panel.querySelector(".cybernet-byok-privacy");
    if (privacy) {
      privacy.textContent = "Stored only in this browser tab using session storage. The key is temporarily transmitted over HTTPS through CyberNet's Netlify Function to validate it and send requests to OpenAI. CyberNet does not intentionally save it to Supabase or your account. Close the tab or press Forget Key to remove it. Use a restricted project key with appropriate budgets and permissions.";
    }
  }

  function addGhostScanPreview() {
    const page = byId("ghostscan");
    if (!page || byId("cnGhostPreview")) return;

    const preview = document.createElement("section");
    preview.id = "cnGhostPreview";
    preview.className = "cn-ghost-preview reveal";
    preview.innerHTML = `
      <div class="cn-ghost-preview-copy">
        <div>
          <span class="cn-ghost-preview-badge">GHOSTSCAN · CONCEPT PREVIEW</span>
          <h1>See what suspicious pages do <span>before you trust them.</span></h1>
          <p>GhostScan is being designed to open suspicious links inside an isolated browser, capture behaviour, follow redirects, replay important moments, and turn the evidence into a clear defensive report.</p>
        </div>
        <div class="cn-ghost-preview-status">
          <strong>COMING SOON</strong>
          <small>The final interface and capabilities may change during development.</small>
        </div>
      </div>
      <div class="cn-ghost-preview-frame">
        <img src="${PREVIEW_IMAGE}" alt="Concept preview of the future CyberNet GhostScan isolated-browser investigation dashboard" loading="eager" decoding="async" />
        <div class="cn-ghost-preview-shine" aria-hidden="true"></div>
      </div>
      <div class="cn-ghost-preview-features" aria-label="Planned GhostScan capabilities">
        <span>Safe &amp; Isolated</span>
        <span>Behaviour Analysis</span>
        <span>Visual Replay</span>
        <span>Redirect Tracking</span>
        <span>Actionable Report</span>
      </div>
      <div class="cn-ghost-preview-actions">
        <button type="button" class="primary-btn" id="cnGhostPreviewSignIn">Sign in to be ready</button>
        <button type="button" class="secondary-btn" id="cnGhostPreviewPlans">View Pro plans</button>
      </div>`;

    page.insertBefore(preview, page.firstChild);

    byId("cnGhostPreviewSignIn")?.addEventListener("click", () => {
      const auth = byId("openAuth");
      if (auth) auth.click();
      else byId("authModal")?.classList.add("show");
    });
    byId("cnGhostPreviewPlans")?.addEventListener("click", () => {
      document.querySelector('[data-page="pricing"]')?.click();
    });
  }

  function getSupabaseClient() {
    if (client) return client;
    const config = window.CYBERNET_CONFIG || {};
    if (!window.supabase?.createClient || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return null;
    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function readPending() {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function writePending(records) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(records.slice(-20))); } catch {}
  }

  function queueAcceptance(record) {
    if (!record || !record.kind) return;
    const normalized = {
      kind: String(record.kind),
      version: String(record.version || RELEASE_VERSION),
      termsVersion: String(record.termsVersion || record.version || RELEASE_VERSION),
      privacyVersion: String(record.privacyVersion || record.version || RELEASE_VERSION),
      acceptableUseVersion: String(record.acceptableUseVersion || record.version || RELEASE_VERSION),
      refundVersion: String(record.refundVersion || record.version || RELEASE_VERSION),
      billingCycle: String(record.billingCycle || ""),
      acceptedAt: String(record.acceptedAt || new Date().toISOString()),
      page: String(record.page || location.href)
    };
    const pending = readPending();
    const duplicate = pending.some(item => item.kind === normalized.kind && item.acceptedAt === normalized.acceptedAt);
    if (!duplicate) pending.push(normalized);
    writePending(pending);
    syncAcceptances();
  }

  async function currentSession() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  }

  async function postJson(path, body, timeoutMs = 12000) {
    const session = await currentSession();
    if (!session?.access_token) throw new Error("Sign in is required.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status}).`), { status: response.status });
      return data;
    } finally { clearTimeout(timer); }
  }

  async function syncAcceptances() {
    if (syncRunning) return;
    syncRunning = true;
    try {
      const session = await currentSession();
      if (!session) return;
      const pending = readPending();
      const remaining = [];
      for (const record of pending) {
        try {
          await postJson("/api/legal-acceptance", record, 7000);
        } catch {
          remaining.push(record);
        }
      }
      writePending(remaining);
    } finally { syncRunning = false; }
  }

  function localDataSnapshot() {
    const local = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !/^cybernet/i.test(key) || /(api.?key|token|secret|password)/i.test(key)) continue;
        local[key] = localStorage.getItem(key);
      }
    } catch {}
    return local;
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearLocalHistory() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
      keys.filter(Boolean).forEach(key => {
        if (/^cybernet/i.test(key) && /(history|reports?|cases?|scans?)/i.test(key) && !/legal.?acceptance/i.test(key)) {
          localStorage.removeItem(key);
        }
      });
      ORIGINAL_PRIVACY_KEYS.forEach(key => localStorage.removeItem(key));
    } catch {}
  }

  function accountMessage(text, type = "") {
    const target = byId("cnPrivacyDataMessage");
    if (!target) return;
    target.textContent = text;
    target.className = `cn-privacy-message ${type}`.trim();
  }

  async function exportData() {
    accountMessage("Preparing your export…");
    try {
      const server = await postJson("/api/privacy-data", { action: "export" }, 15000);
      downloadJson(`cybernet-data-${new Date().toISOString().slice(0, 10)}.json`, {
        exportedAt: new Date().toISOString(),
        releaseVersion: RELEASE_VERSION,
        server: server.data || server,
        browserStorage: localDataSnapshot()
      });
      accountMessage("Your CyberNet data export was downloaded.", "success");
    } catch (error) {
      accountMessage(error.message || "The export could not be completed.", "error");
    }
  }

  async function clearHistory() {
    if (!confirm("Clear all CyberNet saved reports and scan history from this account and this browser? This cannot be undone.")) return;
    accountMessage("Clearing saved history…");
    try {
      await postJson("/api/privacy-data", { action: "clear-history" });
      clearLocalHistory();
      accountMessage("Saved history was cleared. Refresh Account to update the display.", "success");
      document.dispatchEvent(new CustomEvent("cybernet:history-cleared"));
    } catch (error) {
      accountMessage(error.message || "History could not be cleared.", "error");
    }
  }

  async function deleteAccount() {
    const confirmation = prompt('Type DELETE to permanently delete your CyberNet account. Cancel any active subscription first.');
    if (confirmation !== "DELETE") {
      if (confirmation !== null) accountMessage("Account deletion was not confirmed.", "error");
      return;
    }
    accountMessage("Deleting your CyberNet account…");
    try {
      await postJson("/api/privacy-data", { action: "delete-account", confirmation: "DELETE" }, 20000);
      clearLocalHistory();
      try { await getSupabaseClient()?.auth.signOut(); } catch {}
      alert("Your CyberNet account deletion request was completed. Payment and legal records may remain where required by law.");
      location.reload();
    } catch (error) {
      accountMessage(error.message || "The account could not be deleted.", "error");
    }
  }

  function selectAccountTab(name) {
    const map = {
      info: ["cnAccountInfoTab", "cybernetAccountInfoPane"],
      reports: ["cnAccountReportsTab", "cybernetAccountReportsPane"],
      privacy: ["cnAccountPrivacyTab", "cybernetAccountPrivacyPane"]
    };
    Object.entries(map).forEach(([key, [buttonId, paneId]]) => {
      const active = key === name;
      byId(buttonId)?.classList.toggle("active", active);
      byId(buttonId)?.setAttribute("aria-selected", String(active));
      const pane = byId(paneId);
      if (pane) pane.hidden = !active;
    });
  }

  function addPrivacyControls() {
    const modal = byId("accountDetailsModal");
    const card = modal?.querySelector(".cybernet-account-card");
    const tabs = card?.querySelector(".cn-account-tabs");
    const reportsPane = byId("cybernetAccountReportsPane");
    if (!modal || !card || !tabs || !reportsPane || byId("cybernetAccountPrivacyPane")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "cnAccountPrivacyTab";
    button.className = "cn-account-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.textContent = "Privacy & Data";
    tabs.appendChild(button);

    const pane = document.createElement("div");
    pane.id = "cybernetAccountPrivacyPane";
    pane.className = "cn-account-pane cn-account-privacy-pane";
    pane.hidden = true;
    pane.innerHTML = `
      <section class="cn-privacy-card">
        <span class="account-eyebrow">PRIVACY &amp; DATA CONTROLS</span>
        <h3>Control your CyberNet information.</h3>
        <p>Export available account data, clear saved reports and scan history, or permanently delete your account. Subscription cancellation is handled separately through Manage Billing.</p>
        <div class="cn-privacy-actions">
          <button type="button" class="secondary-btn" id="cnExportDataBtn">Export my data</button>
          <button type="button" class="secondary-btn" id="cnClearHistoryBtn">Clear saved history</button>
          <button type="button" class="cn-danger-btn" id="cnDeleteAccountBtn">Delete account</button>
        </div>
        <small>Payment, tax, fraud, security, and legal-acceptance records may be retained where required. Browser data on another device must be cleared on that device.</small>
        <div id="cnPrivacyDataMessage" class="cn-privacy-message" aria-live="polite"></div>
      </section>`;
    reportsPane.insertAdjacentElement("afterend", pane);

    button.addEventListener("click", () => selectAccountTab("privacy"));
    byId("cnAccountInfoTab")?.addEventListener("click", () => selectAccountTab("info"));
    byId("cnAccountReportsTab")?.addEventListener("click", () => selectAccountTab("reports"));
    byId("cnExportDataBtn")?.addEventListener("click", exportData);
    byId("cnClearHistoryBtn")?.addEventListener("click", clearHistory);
    byId("cnDeleteAccountBtn")?.addEventListener("click", deleteAccount);
  }

  function seedExistingAcceptances() {
    ["signup", "checkout"].forEach(kind => {
      try {
        const record = JSON.parse(localStorage.getItem(`cybernet_${kind}_legal_acceptance`) || "null");
        if (record) queueAcceptance(record);
      } catch {}
    });
  }

  async function interceptCheckout(event) {
    const button = event.target.closest?.("#proPlanBtn");
    if (!button || button.disabled || /current plan/i.test(button.textContent || "")) return;
    if (button.dataset.cnServerAcceptanceBypass === "true") {
      button.dataset.cnServerAcceptanceBypass = "false";
      return;
    }
    const checkbox = byId("cnCheckoutLegalConsent");
    if (!checkbox?.checked || checkoutIntercepting) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    checkoutIntercepting = true;
    try {
      const record = window.CYBERNET_LEGAL_ACCEPTANCE?.kind === "checkout"
        ? window.CYBERNET_LEGAL_ACCEPTANCE
        : {
            kind: "checkout",
            version: RELEASE_VERSION,
            termsVersion: RELEASE_VERSION,
            privacyVersion: RELEASE_VERSION,
            acceptableUseVersion: RELEASE_VERSION,
            refundVersion: RELEASE_VERSION,
            billingCycle: String(button.dataset.cycle || byId("pricingToggle")?.dataset.cycle || "monthly"),
            acceptedAt: new Date().toISOString(),
            page: location.href
          };
      queueAcceptance(record);
      await Promise.race([syncAcceptances(), new Promise(resolve => setTimeout(resolve, 2800))]);
    } finally {
      checkoutIntercepting = false;
      button.dataset.cnServerAcceptanceBypass = "true";
      button.click();
    }
  }

  function refresh() {
    updatePricingHeading();
    replaceMisleadingPrivacyClaims();
    updateByokDisclosure();
    addGhostScanPreview();
    addPrivacyControls();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function init() {
    if (document.documentElement.dataset.cybernetFinalRelease === "ready") return;
    document.documentElement.dataset.cybernetFinalRelease = "ready";
    injectStylesheet();
    refresh();

    window.addEventListener("cybernet:legal-acceptance", event => queueAcceptance(event.detail));
    document.addEventListener("click", interceptCheckout, true);

    const supabase = getSupabaseClient();
    supabase?.auth.onAuthStateChange(() => setTimeout(syncAcceptances, 0));
    seedExistingAcceptances();
    setTimeout(syncAcceptances, 1000);
    setInterval(syncAcceptances, 30000);

    const observer = new MutationObserver(queueRefresh);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
