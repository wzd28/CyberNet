/* CyberNet AI: "Privacy & data" in the Account panel (launch checklist item 18).

   Adds a third tab next to Account Info and Saved Reports with three actions:
   - Download my data   POST /api/privacy-data {action:"export"}, saved as a JSON file
   - Clear scan history  a confirm dialog, then {action:"clear-history"}
   - Delete account      a dialog that lists what is removed and what is kept, a typed
                         DELETE confirmation, a busy state and plain copy for every refusal
                         code, then {action:"delete-account", confirmation:"DELETE"}
   After a deletion it signs out on this device, clears the cybernet* browser storage and
   goes to /?account=deleted, where a calm notice says the account has been deleted. The
   notice shows only right after a deletion on this device (a short-lived sessionStorage
   mark, and no session left), so a shared link to /?account=deleted shows nothing.

   It only injects: the tabs (cybernet-final-ui-fix.js) and the modal
   (cybernet-account-api-upgrade.js) are left as they are. The dialogs are ordinary
   .modal/.modal-card sheets, so 60-overlays.css styles them and 08-focus.js keeps focus
   inside them. Styles: ui-src/css/66-privacy.css.

   Test hook (screenshots and checks without an account; nothing is sent to the server):
     CNPrivacy.preview({ tab: true })                          the panel on the new tab
     CNPrivacy.preview({ dialog: "delete", typed: "DELETE" })   the delete dialog
     CNPrivacy.preview({ dialog: "delete", typed: "DELETE", result: "SUBSCRIPTION_ACTIVE" })
       then CNPrivacy.confirmDelete()                           a refusal as the user sees it
     CNPrivacy.preview({ dialog: "clear" }), CNPrivacy.showDeletedNotice()
   Options: result (a server code, "ok", "NETWORK" or "TIMEOUT"), delay (ms, to see the busy
   state), respond(action, body) => {status, data} for full control. */
(() => {
  "use strict";
  if (window.CNPrivacy) return;

  const API = "/api/privacy-data";
  const SUPPORT = "support@cybernetai.app";
  const IDS = {
    tab: "cnAccountPrivacyTab",
    pane: "cybernetAccountPrivacyPane",
    message: "cnPrivacyMessage",
    infoTab: "cybernetAccountInfoTab",
    reportsTab: "cybernetAccountReportsTab",
    infoPane: "cybernetAccountInfoPane",
    reportsPane: "cybernetAccountReportsPane",
    del: "cnDeleteAccountModal",
    clear: "cnClearHistoryModal",
    notice: "cnAccountDeletedNotice"
  };

  const byId = id => document.getElementById(id);
  let preview = null;

  /* ---------- copy ---------- */
  const COMMON = {
    AUTH_REQUIRED: "Your sign-in has expired. Close this window, sign in again, then try once more.",
    NETWORK: "We could not reach CyberNet AI. Check your internet connection and try again.",
    TIMEOUT: "This is taking longer than usual. Check your internet connection and try again.",
    NOT_CONFIGURED: `This is not available right now. Please try again later, or email ${SUPPORT}.`,
    SERVER: "Something went wrong on our side. Please try again in a few minutes.",
    CLEAR_FAILED: "Please try again in a few minutes."
  };
  const EXPORT_FAILED_TEXT = "We could not prepare your data file.";
  const DELETE_COPY = {
    SUBSCRIPTION_ACTIVE: {
      tone: "warn",
      title: "Cancel your plan first",
      text: "You still have an active CyberNet AI plan, so your account cannot be deleted yet. Cancel the plan in Manage Billing. If you have already cancelled, the plan stays active until the end of the period you paid for, and you can delete your account after that date.",
      billing: true
    },
    TEAM_ACTIVE: {
      tone: "warn",
      title: "Cancel your Business plan first",
      text: "Your Business team still has an active plan. Cancel the team's plan in Manage Billing. Once the plan has ended, you can delete your account here, and the team closes with it.",
      billing: true
    },
    CONFIRMATION_REQUIRED: { tone: "error", text: "Type DELETE in the box to confirm." },
    AUTH_REQUIRED: { tone: "error", title: "Please sign in again", text: COMMON.AUTH_REQUIRED },
    NETWORK: { tone: "error", title: "No connection", text: `${COMMON.NETWORK} Your account has not been deleted.` },
    TIMEOUT: {
      tone: "error",
      title: "We could not confirm the result",
      text: "This took longer than usual. Refresh the page and try to sign in. If you can still sign in, your account was not deleted and you can try again."
    },
    NOT_CONFIGURED: { tone: "error", title: "Not available right now", text: `Account deletion is not available right now. Please try again later, or email ${SUPPORT}.` },
    PARTIAL_DELETE: {
      tone: "warn",
      title: "Your account is not fully deleted yet",
      text: `We could not finish. Some of your Business team details were already removed (your place in other teams, or a closed team you owned), but your account and sign-in still work. Press Delete my account again in a few minutes to finish. If this keeps happening, email ${SUPPORT} and we will remove it for you.`
    },
    DEFAULT: {
      tone: "error",
      title: "Your account is still open",
      text: `We could not finish deleting your account. Please try again in a few minutes. If this keeps happening, email ${SUPPORT} and we will remove it for you.`
    }
  };

  /* ---------- session and requests ---------- */
  function client() {
    return window.CyberNetAccount?.appState?.supabase || null;
  }

  async function accessToken() {
    const supabase = client();
    if (!supabase?.auth?.getSession) return "";
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || "";
    } catch {
      return "";
    }
  }

  // Resolves to { status, data }; status 0 means the request never got an answer.
  async function send(action, extra = {}, timeoutMs = 20000) {
    const body = { action, ...extra };
    if (preview) return preview.respond(action, body);
    const token = await accessToken();
    if (!token) return { status: 401, data: { code: "AUTH_REQUIRED" } };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data: data || {} };
    } catch (error) {
      return { status: 0, data: { code: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK" } };
    } finally {
      clearTimeout(timer);
    }
  }

  function codeOf(result) {
    const code = String(result?.data?.code || "");
    if (code) return code;
    if (result?.status === 401) return "AUTH_REQUIRED";
    if (result?.status === 503) return "NOT_CONFIGURED";
    return "SERVER";
  }

  // Plain copy for export and clear-history failures.
  function commonText(result) {
    const code = codeOf(result);
    if (COMMON[code]) return COMMON[code];
    return result?.data?.error || COMMON.SERVER;
  }

  /* ---------- browser storage ---------- */
  function storageKeys(store) {
    const keys = [];
    try {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key) keys.push(key);
      }
    } catch { /* storage blocked */ }
    return keys;
  }

  function localSnapshot() {
    const out = {};
    storageKeys(window.localStorage).forEach(key => {
      if (!/^cybernet/i.test(key) || /(api.?key|token|secret|password)/i.test(key)) return;
      try { out[key] = localStorage.getItem(key); } catch { /* ignore */ }
    });
    return out;
  }

  function clearLocalHistory() {
    storageKeys(window.localStorage).forEach(key => {
      if (/^cybernet/i.test(key) && /(history|reports?|cases?|scans?)/i.test(key) && !/legal.?acceptance/i.test(key)) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      }
    });
  }

  function clearAllCyberNetStorage() {
    [window.localStorage, window.sessionStorage].forEach(store => {
      storageKeys(store).forEach(key => {
        if (/^cybernet/i.test(key)) {
          try { store.removeItem(key); } catch { /* ignore */ }
        }
      });
    });
  }

  async function signOutHere() {
    try {
      await client()?.auth?.signOut?.({ scope: "local" });
    } catch { /* the server session is already gone */ }
    // If the library could not clear its stored session, remove it here.
    storageKeys(window.localStorage).forEach(key => {
      if (/^sb-.+-auth-token/.test(key)) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      }
    });
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------- small UI helpers ---------- */
  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.label) button.dataset.label = button.textContent.trim();
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
      button.append(document.createTextNode(` ${label}`));
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.dataset.label) button.textContent = button.dataset.label;
    }
  }

  function paneMessage(text = "", tone = "") {
    const target = byId(IDS.message);
    if (!target) return;
    target.textContent = text;
    target.className = `cn-privacy-message ${tone}`.trim();
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ---------- the tab and its pane ---------- */
  const PANE_HTML = `
    <div class="cn-privacy-intro">
      <h3 id="cnPrivacyHeading">Privacy &amp; data</h3>
      <p>Download a copy of your data, clear your scan history or delete your account. Cancelling a paid plan is separate: use Manage Billing on the Account Info tab.</p>
    </div>
    <ul class="cn-privacy-list" aria-labelledby="cnPrivacyHeading">
      <li class="cn-privacy-row">
        <div class="cn-privacy-copy">
          <h4>Download a copy of your data</h4>
          <p>One file with your account details, saved scan history, Recovery cases and usage. It is saved to this device.</p>
        </div>
        <button type="button" class="secondary-btn cn-privacy-action" id="cnPrivacyExportBtn">Download my data</button>
      </li>
      <li class="cn-privacy-row">
        <div class="cn-privacy-copy">
          <h4>Clear your scan history</h4>
          <p>Removes the scan history saved in your account and the reports saved in this browser. Your account stays open.</p>
        </div>
        <button type="button" class="secondary-btn cn-privacy-action" id="cnPrivacyClearBtn" aria-haspopup="dialog">Clear scan history</button>
      </li>
      <li class="cn-privacy-row cn-privacy-row--danger">
        <div class="cn-privacy-copy">
          <h4>Delete your account</h4>
          <p>Permanently removes your account and everything saved in it. This cannot be undone.</p>
        </div>
        <button type="button" class="cn-privacy-danger cn-privacy-action" id="cnPrivacyDeleteBtn" aria-haspopup="dialog">Delete account</button>
      </li>
    </ul>
    <p class="cn-privacy-foot">How we handle your data is explained in our <button type="button" class="cn-privacy-link" data-open-legal="privacy">Privacy Policy</button>.</p>
    <div id="${IDS.message}" class="cn-privacy-message" role="status" aria-live="polite"></div>`;

  function setPrivacyTab(active) {
    const tab = byId(IDS.tab);
    const pane = byId(IDS.pane);
    if (!tab || !pane) return;
    if (active) {
      [IDS.infoTab, IDS.reportsTab].forEach(id => {
        const other = byId(id);
        other?.classList.remove("active");
        other?.setAttribute("aria-selected", "false");
      });
      [IDS.infoPane, IDS.reportsPane].forEach(id => {
        const other = byId(id);
        if (other) other.hidden = true;
      });
    }
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    pane.hidden = !active;
  }

  function mount() {
    const modal = byId("accountDetailsModal");
    const tabs = modal?.querySelector(".cn-account-tabs");
    const reportsPane = byId(IDS.reportsPane);
    if (!modal || !tabs || !reportsPane) return false;
    if (byId(IDS.pane)) return true;

    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = IDS.tab;
    tab.className = "cn-account-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-controls", IDS.pane);
    tab.innerHTML = "Privacy &amp;&nbsp;data";
    tabs.appendChild(tab);

    const pane = document.createElement("div");
    pane.id = IDS.pane;
    pane.className = "cn-account-pane cn-privacy-pane";
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-labelledby", IDS.tab);
    pane.hidden = true;
    pane.innerHTML = PANE_HTML;
    reportsPane.insertAdjacentElement("afterend", pane);

    tab.addEventListener("click", () => setPrivacyTab(true));

    // The other two tabs, and "Account" in the nav, show their own pane through
    // cybernet-final-ui-fix.js. Whenever one of those panes is shown, step aside.
    const watcher = new MutationObserver(() => {
      if (pane.hidden) return;
      const infoShown = byId(IDS.infoPane) && !byId(IDS.infoPane).hidden;
      const reportsShown = byId(IDS.reportsPane) && !byId(IDS.reportsPane).hidden;
      if (infoShown || reportsShown) setPrivacyTab(false);
    });
    [IDS.infoPane, IDS.reportsPane].forEach(id => {
      const el = byId(id);
      if (el) watcher.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    });

    // Arrow keys, Home and End move between the tabs (each tab stays in the Tab order too).
    if (tabs.dataset.cnPrivacyKeys !== "true") {
      tabs.dataset.cnPrivacyKeys = "true";
      tabs.addEventListener("keydown", event => {
        const list = [...tabs.querySelectorAll(".cn-account-tab")];
        const index = list.indexOf(document.activeElement);
        if (index < 0) return;
        let next = -1;
        if (event.key === "ArrowRight") next = (index + 1) % list.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + list.length) % list.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = list.length - 1;
        if (next < 0) return;
        event.preventDefault();
        list[next].focus();
        list[next].click();
      });
    }

    byId("cnPrivacyExportBtn")?.addEventListener("click", event => exportData(event.currentTarget));
    byId("cnPrivacyClearBtn")?.addEventListener("click", event => openClear(event.currentTarget));
    byId("cnPrivacyDeleteBtn")?.addEventListener("click", event => openDelete(event.currentTarget));
    return true;
  }

  /* ---------- dialogs ---------- */
  const openDialogs = new Set();

  function makeDialog(id, titleId, describedBy, inner) {
    let modal = byId(id);
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = id;
    modal.className = "modal cn-privacy-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-card cn-privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${describedBy}">
        <button type="button" class="close-modal" data-privacy-close aria-label="Close">&times;</button>
        ${inner}
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
      if (event.target === modal) closeDialog(modal);
      if (event.target.closest?.("[data-privacy-close], [data-privacy-cancel]")) closeDialog(modal);
    });
    return modal;
  }

  function openDialog(modal, opener) {
    modal._cnOpener = opener || document.activeElement;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    openDialogs.add(modal);
    requestAnimationFrame(() => {
      const first = modal.querySelector("[data-autofocus]") || modal.querySelector(".modal-card button:not(.close-modal), .modal-card input");
      try { first?.focus({ preventScroll: true }); } catch { first?.focus(); }
    });
  }

  function closeDialog(modal, { force = false } = {}) {
    if (!modal || (!force && modal.dataset.busy === "true")) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    openDialogs.delete(modal);
    const back = modal._cnOpener;
    if (back?.isConnected) {
      try { back.focus({ preventScroll: true }); } catch { back.focus(); }
    }
  }

  function setDialogBusy(modal, busy) {
    modal.dataset.busy = busy ? "true" : "false";
    modal.querySelector(".modal-card")?.setAttribute("aria-busy", String(busy));
    modal.querySelectorAll("[data-privacy-close], [data-privacy-cancel]").forEach(button => {
      button.disabled = busy;
    });
  }

  // The Legal Center opened from inside the Account panel ("Privacy Policy" on this tab):
  // remember the button, and give focus back to it when the Legal Center closes, however
  // it closes (Escape, the close button, Done or a click outside).
  let legalOpener = null;
  let legalWatch = null;
  function watchLegalClose() {
    const legal = byId("cnLegalModal");
    if (!legal || legalWatch) return;
    legalWatch = new MutationObserver(() => {
      if (legal.classList.contains("show") || !legalOpener) return;
      const back = legalOpener;
      legalOpener = null;
      // ui-src/js/08-focus.js keeps the Account panel inert until a frame after the Legal
      // Center closes, so this tries again for up to a second.
      const started = Date.now();
      (function attempt() {
        if (!back.isConnected || !byId("accountDetailsModal")?.classList.contains("show")) return;
        if (!back.closest("[inert]")) {
          try { back.focus({ preventScroll: true }); } catch { back.focus(); }
          if (document.activeElement === back) return;
        }
        if (Date.now() - started < 1000) setTimeout(attempt, 40);
      })();
    });
    legalWatch.observe(legal, { attributes: true, attributeFilter: ["class"] });
  }
  document.addEventListener("click", event => {
    const opener = event.target.closest?.("#accountDetailsModal [data-open-legal]");
    if (!opener) return;
    legalOpener = opener;
    setTimeout(watchLegalClose, 0);
  }, true);

  // Escape closes the top privacy dialog (never while it is working), and stops there:
  // the Account panel underneath has its own Escape handler on document.
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" && event.key !== "Esc") return;
    // The Legal Center on top of the Account panel: one Escape closes only the Legal
    // Center (the Account panel's own handler would close both at once).
    if (document.querySelector("#cnLegalModal.show") && byId("accountDetailsModal")?.classList.contains("show")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!legalOpener) legalOpener = byId(IDS.pane)?.querySelector("[data-open-legal]") || null;
      watchLegalClose();
      byId("cnLegalClose")?.click();
      return;
    }
    const open = [...openDialogs].filter(modal => modal.classList.contains("show"));
    if (!open.length) return;
    event.preventDefault();
    event.stopPropagation();
    closeDialog(open[open.length - 1]);
  }, true);

  function showAlert(modal, copy, fallbackText) {
    const box = modal.querySelector(".cn-privacy-alert");
    if (!box) return;
    box.className = `cn-privacy-alert is-${copy?.tone || "error"}`;
    box.textContent = "";
    if (!copy) return;
    if (copy.title) {
      const title = document.createElement("strong");
      title.textContent = copy.title;
      box.appendChild(title);
    }
    const text = document.createElement("p");
    text.textContent = copy.text || fallbackText || "";
    box.appendChild(text);
    if (copy.billing) {
      const billing = document.createElement("button");
      billing.type = "button";
      billing.className = "secondary-btn cn-privacy-billing";
      billing.textContent = "Open Manage Billing";
      billing.addEventListener("click", () => openBilling(modal));
      box.appendChild(billing);
    }
  }

  function clearAlert(modal) {
    const box = modal.querySelector(".cn-privacy-alert");
    if (box) {
      box.textContent = "";
      box.className = "cn-privacy-alert";
    }
  }

  // From a refusal: close the dialog and take the user to Manage Billing on Account Info.
  function openBilling(modal) {
    closeDialog(modal, { force: true });
    byId(IDS.infoTab)?.click();
    const manage = byId("accountManageBillingBtn");
    if (manage && !manage.hidden && !preview) {
      manage.focus();
      manage.click();
      return;
    }
    (manage && !manage.hidden ? manage : byId(IDS.infoTab))?.focus();
  }

  /* ---------- clear scan history ---------- */
  function clearDialog() {
    const modal = makeDialog(IDS.clear, "cnClearTitle", "cnClearLead", `
      <span class="account-eyebrow">Scan history</span>
      <h2 id="cnClearTitle">Clear your scan history?</h2>
      <div id="cnClearLead" class="cn-privacy-lead">
        <p>This removes the scan history saved in your account and the reports saved in this browser. Your account, your plan and your Recovery cases stay as they are.</p>
        <p>If you are on a Business team, your past scans also leave the team's activity log. This cannot be undone.</p>
      </div>
      <div class="cn-privacy-alert" aria-live="assertive"></div>
      <div class="cn-privacy-actions">
        <button type="button" class="secondary-btn" data-privacy-cancel data-autofocus>Keep my history</button>
        <button type="button" class="cn-privacy-danger" data-privacy-confirm>Clear scan history</button>
      </div>`);
    if (modal.dataset.cnReady !== "true") {
      modal.dataset.cnReady = "true";
      modal.querySelector("[data-privacy-confirm]")?.addEventListener("click", () => confirmClear());
    }
    return modal;
  }

  function openClear(opener) {
    const modal = clearDialog();
    clearAlert(modal);
    openDialog(modal, opener || byId("cnPrivacyClearBtn"));
  }

  async function confirmClear() {
    const modal = clearDialog();
    if (modal.dataset.busy === "true") return;
    const button = modal.querySelector("[data-privacy-confirm]");
    clearAlert(modal);
    setDialogBusy(modal, true);
    setBusy(button, true, "Clearing…");
    const result = await send("clear-history", {}, 15000);
    setBusy(button, false);
    setDialogBusy(modal, false);
    if (result.status === 200 && result.data?.cleared) {
      if (!preview) clearLocalHistory();
      closeDialog(modal, { force: true });
      paneMessage("Your scan history has been cleared.", "success");
      document.dispatchEvent(new CustomEvent("cybernet:history-cleared"));
      if (!preview) window.CyberNetAccount?.refreshAccountStatus?.()?.catch?.(() => {});
      return;
    }
    showAlert(modal, { tone: "error", title: "Your history was not cleared", text: commonText(result) });
  }

  /* ---------- download my data ---------- */
  async function exportData(button) {
    if (button?.disabled) return;
    setBusy(button, true, "Preparing…");
    paneMessage("Preparing your data file…");
    const result = await send("export", {}, 25000);
    setBusy(button, false);
    if (result.status !== 200 || !result.data?.data) {
      // The server's own EXPORT_FAILED message already starts with the same sentence.
      const detail = commonText(result);
      paneMessage(detail.startsWith(EXPORT_FAILED_TEXT) ? detail : `${EXPORT_FAILED_TEXT} ${detail}`, "error");
      return;
    }
    const filename = `cybernet-ai-data-${new Date().toISOString().slice(0, 10)}.json`;
    if (!preview) {
      downloadJson(filename, {
        exportedAt: new Date().toISOString(),
        service: "CyberNet AI (cybernetai.app)",
        account: result.data.data,
        browserStorage: localSnapshot()
      });
    }
    paneMessage(`Your data file has been downloaded. It is called ${filename}.`, "success");
  }

  /* ---------- delete account ---------- */
  const DELETE_HTML = `
    <span class="account-eyebrow">Delete account</span>
    <h2 id="cnDeleteTitle">Delete your CyberNet AI account?</h2>
    <p id="cnDeleteLead" class="cn-privacy-lead">This permanently removes your account. It cannot be undone.</p>
    <div class="cn-privacy-split">
      <section class="cn-privacy-box cn-privacy-box--removed" aria-labelledby="cnDeleteRemovedTitle">
        <h3 id="cnDeleteRemovedTitle">What we delete</h3>
        <ul>
          <li>Your account, sign-in and profile</li>
          <li>Saved reports and scan history</li>
          <li>Recovery cases and their plans</li>
          <li>Your settings and email preferences</li>
          <li>Your place in any Business team. A team you own closes; its members keep their own accounts.</li>
        </ul>
      </section>
      <section class="cn-privacy-box cn-privacy-box--kept" aria-labelledby="cnDeleteKeptTitle">
        <h3 id="cnDeleteKeptTitle">What we keep</h3>
        <ul>
          <li>Billing records, such as invoices and payments, that Stripe must keep by law</li>
          <li>A record that you accepted our terms, no longer linked to you</li>
        </ul>
      </section>
    </div>
    <p class="cn-privacy-note">Paying for Pro or Business? Cancel your plan in Manage Billing first. Anything saved in this browser is cleared too.</p>
    <form class="cn-privacy-confirm" novalidate>
      <label for="cnDeleteConfirmInput">Type <strong>DELETE</strong> to confirm</label>
      <input type="text" id="cnDeleteConfirmInput" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-describedby="cnDeleteHint" data-autofocus />
      <p class="cn-privacy-hint" id="cnDeleteHint">In capital letters, as shown.</p>
      <div class="cn-privacy-alert" aria-live="assertive"></div>
      <div class="cn-privacy-actions">
        <button type="button" class="secondary-btn" data-privacy-cancel>Keep my account</button>
        <button type="submit" class="cn-privacy-danger cn-privacy-danger--solid" id="cnDeleteConfirmBtn" aria-disabled="true">Delete my account</button>
      </div>
    </form>`;

  function deleteDialog() {
    const modal = makeDialog(IDS.del, "cnDeleteTitle", "cnDeleteLead", DELETE_HTML);
    if (modal.dataset.cnReady === "true") return modal;
    modal.dataset.cnReady = "true";
    const input = modal.querySelector("#cnDeleteConfirmInput");
    const form = modal.querySelector("form");
    input?.addEventListener("input", () => syncConfirm(modal));
    form?.addEventListener("submit", event => {
      event.preventDefault();
      confirmDelete();
    });
    return modal;
  }

  function typedOk(modal) {
    return String(modal.querySelector("#cnDeleteConfirmInput")?.value || "").trim() === "DELETE";
  }

  function syncConfirm(modal) {
    const input = modal.querySelector("#cnDeleteConfirmInput");
    const button = modal.querySelector("#cnDeleteConfirmBtn");
    const hint = modal.querySelector("#cnDeleteHint");
    const value = String(input?.value || "").trim();
    const ok = value === "DELETE";
    button?.setAttribute("aria-disabled", String(!ok));
    input?.removeAttribute("aria-invalid");
    if (hint) {
      hint.textContent = ok
        ? "Typed correctly."
        : value && value.toUpperCase() === "DELETE"
          ? "Use capital letters: DELETE"
          : "In capital letters, as shown.";
      hint.classList.toggle("is-ok", ok);
    }
    const alert = modal.querySelector(".cn-privacy-alert");
    if (ok && alert?.classList.contains("is-confirm")) clearAlert(modal);
  }

  function openDelete(opener) {
    const modal = deleteDialog();
    const input = modal.querySelector("#cnDeleteConfirmInput");
    if (input) {
      input.value = "";
      input.readOnly = false;
    }
    clearAlert(modal);
    syncConfirm(modal);
    openDialog(modal, opener || byId("cnPrivacyDeleteBtn"));
  }

  async function confirmDelete() {
    const modal = deleteDialog();
    if (modal.dataset.busy === "true") return;
    const input = modal.querySelector("#cnDeleteConfirmInput");
    const button = modal.querySelector("#cnDeleteConfirmBtn");

    if (!typedOk(modal)) {
      showAlert(modal, DELETE_COPY.CONFIRMATION_REQUIRED);
      modal.querySelector(".cn-privacy-alert")?.classList.add("is-confirm");
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
      return;
    }

    clearAlert(modal);
    setDialogBusy(modal, true);
    if (input) input.readOnly = true;
    setBusy(button, true, "Deleting…");

    const result = await send("delete-account", { confirmation: "DELETE" }, 30000);

    if (result.status === 200 && result.data?.deleted) {
      setBusy(button, true, "Signing you out…");
      if (preview) {
        setBusy(button, false);
        setDialogBusy(modal, false);
        closeDialog(modal, { force: true });
        showDeletedNotice();
        return;
      }
      clearAllCyberNetStorage();
      await signOutHere();
      // The one-time mark that lets the next page show the "deleted" notice (it does not
      // start with "cybernet", so the clean-up above leaves it).
      try { sessionStorage.setItem(DELETED_MARK, String(Date.now())); } catch { /* the notice is skipped */ }
      window.location.replace("/?account=deleted");
      return;
    }

    setBusy(button, false);
    setDialogBusy(modal, false);
    if (input) input.readOnly = false;
    const code = codeOf(result);
    const copy = DELETE_COPY[code] || (result.status === 0 ? DELETE_COPY.NETWORK : DELETE_COPY.DEFAULT);
    showAlert(modal, copy);
    // Keep focus in the dialog, on the first thing the user can act on.
    (modal.querySelector(".cn-privacy-billing") || modal.querySelector("[data-privacy-cancel]"))?.focus();
  }

  /* ---------- after a deletion: /?account=deleted ---------- */
  function showDeletedNotice() {
    if (byId(IDS.notice)) return;
    const notice = document.createElement("section");
    notice.id = IDS.notice;
    notice.className = "cn-privacy-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-labelledby", "cnDeletedTitle");
    notice.innerHTML = `
      <span class="cn-privacy-notice-mark" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10.5l3.2 3.2L15 7"/></svg>
      </span>
      <div class="cn-privacy-notice-copy">
        <h2 id="cnDeletedTitle">Your account has been deleted</h2>
        <p>Your CyberNet AI account and everything saved in it have been removed, and you are signed out on this device. Billing records that Stripe must keep by law were not deleted. You can still use Quick Scan without an account.</p>
      </div>
      <button type="button" class="secondary-btn cn-privacy-notice-close">Close</button>`;
    notice.querySelector(".cn-privacy-notice-close")?.addEventListener("click", () => notice.remove());
    document.body.appendChild(notice);
  }

  // Shown only right after a deletion on this device: anyone can open a link to
  // /?account=deleted, and on an anti-scam site a real-looking "your account was deleted"
  // message would be a ready-made lure.
  const DELETED_MARK = "cn_account_deleted";
  const DELETED_MARK_MAX_AGE_MS = 2 * 60 * 1000;

  function hasStoredSession() {
    return storageKeys(window.localStorage).some(key => /^sb-.+-auth-token/.test(key));
  }

  function takeDeletedMark() {
    let mark = null;
    try {
      mark = sessionStorage.getItem(DELETED_MARK);
      sessionStorage.removeItem(DELETED_MARK);
    } catch { return false; }
    const at = Number(mark);
    return Number.isFinite(at) && at > 0 && Date.now() - at >= 0 && Date.now() - at < DELETED_MARK_MAX_AGE_MS;
  }

  function handleDeletedLanding() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    if (params.get("account") !== "deleted") return;
    params.delete("account");
    const query = params.toString();
    try {
      history.replaceState(history.state, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    } catch { /* keep the URL */ }
    if (takeDeletedMark() && !hasStoredSession()) showDeletedNotice();
  }

  /* ---------- test hook ---------- */
  function previewResponder(options) {
    const result = String(options.result || "ok");
    return async (action, body) => {
      if (options.delay) await wait(Number(options.delay) || 0);
      if (typeof options.respond === "function") return options.respond(action, body);
      if (result === "NETWORK" || result === "TIMEOUT") return { status: 0, data: { code: result } };
      if (result !== "ok") {
        const status = { SUBSCRIPTION_ACTIVE: 409, TEAM_ACTIVE: 409, AUTH_REQUIRED: 401, NOT_CONFIGURED: 503, CONFIRMATION_REQUIRED: 400 }[result] || 502;
        return { status, data: { code: result, error: "Preview refusal." } };
      }
      if (action === "export") return { status: 200, data: { data: { account: { id: "preview", email: "preview@example.com" } } } };
      if (action === "clear-history") return { status: 200, data: { cleared: true } };
      if (action === "delete-account") return { status: 200, data: { deleted: true, closedTeams: 0 } };
      return { status: 400, data: { code: "UNSUPPORTED_ACTION" } };
    };
  }

  function openAccountForPreview() {
    const modal = byId("accountDetailsModal");
    if (!modal) return false;
    const fill = (id, text) => { const el = byId(id); if (el) el.textContent = text; };
    fill("accountDetailName", "Preview user");
    fill("accountDetailEmail", "preview@example.com");
    fill("accountDetailPlan", "Free");
    fill("accountDetailPlanBadge", "Free");
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    return true;
  }

  window.CNPrivacy = Object.freeze({
    version: "2026-10-18",
    mounted: () => Boolean(byId(IDS.pane)),
    // Renders the panel with a fake signed-in state. Nothing reaches the server.
    preview(options = {}) {
      preview = { respond: previewResponder(options) };
      mount();
      if (options.tab !== false) {
        openAccountForPreview();
        setPrivacyTab(true);
      }
      if (options.dialog === "delete") {
        openDelete(byId("cnPrivacyDeleteBtn"));
        const input = byId("cnDeleteConfirmInput");
        if (input && options.typed) {
          input.value = String(options.typed);
          syncConfirm(byId(IDS.del));
        }
      }
      if (options.dialog === "clear") openClear(byId("cnPrivacyClearBtn"));
      return true;
    },
    endPreview() {
      preview = null;
    },
    openDelete: () => openDelete(byId("cnPrivacyDeleteBtn")),
    openClear: () => openClear(byId("cnPrivacyClearBtn")),
    confirmDelete: () => confirmDelete(),
    confirmClear: () => confirmClear(),
    exportData: () => exportData(byId("cnPrivacyExportBtn")),
    showDeletedNotice
  });

  /* ---------- start ---------- */
  function start() {
    handleDeletedLanding();
    if (mount()) return;
    // The modal and its tabs are built by earlier scripts; wait for them briefly.
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
