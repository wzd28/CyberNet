/* CyberNet AI iPhone app: the app layer on top of the website's scripts (BUILD-PLAN §6.6, §7).
   Loaded last (deferred, after script.js and cybernet-privacy-controls.js). Only the app loads it.

   Sections:
     1  helpers                 8  legal pages (in-app) and the sign-up acceptance record
     2  navigation / tab bar    9  Sign in with Apple
     3  Account screen         10  QR scanner and its verdict sheet
     4  AI consent sheet       11  items shared from other apps (Share Extension hand-off)
     5  fetch layer             12  Recovery reminders (local notifications)
     6  downloads              13  offline, "Report a problem", haptics, small iOS touches
     7  first-run intro         14  App Tracking Transparency and analytics, app lifecycle

   Native plugins are optional at every step (window.CNPlugin returns null when one is missing), so the
   bundle also runs in a desktop browser for development, where the web tab bar replaces the native one. */
(function () {
  "use strict";
  const w = window, d = document, root = d.documentElement;
  if (w.CN_PLATFORM !== "ios" || w.CNIos) return;

  /* ================================================================ 1. helpers */
  const P = name => (typeof w.CNPlugin === "function" ? w.CNPlugin(name) : null);
  const VERSION = w.CN_APP_VERSION || "__CN_APP_VERSION__";
  const LEGAL = Object.freeze({ version: "__CN_LEGAL_VERSION__", privacy: "__CN_PRIVACY_VERSION__", effective: "__CN_LEGAL_EFFECTIVE__" });
  const AI_CONSENT_VERSION = "2026-11-ios-1"; // netlify/lib/ai-consent.mjs AI_CONSENT_VERSION: a new sheet text needs a new version
  const SUPPORT = "support@cybernetai.app";
  const OPERATOR = "Marks Events FZ LLE";
  const account = () => w.CyberNetAccount || null;
  const state = () => account()?.appState || null;
  const signedIn = () => { try { return !!account()?.isSignedIn?.(); } catch { return false; } };
  const supabase = () => state()?.supabase || null;
  const authHeaders = (extra = {}) => (account()?.authHeaders ? account().authHeaders(extra) : extra);
  const $ = (sel, scope = d) => scope.querySelector(sel);
  const $$ = (sel, scope = d) => [...scope.querySelectorAll(sel)];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return w.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { w.localStorage.setItem(k, v); } catch { /* storage blocked */ } },
    del(k) { try { w.localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const report = (error, where) => { try { w.CN_reportError?.(error, `ios ${where}`); } catch { /* ignore */ } };
  const later = (fn, ms = 0) => setTimeout(() => { try { fn(); } catch (error) { report(error, "later"); } }, ms);
  const onReady = fn => (d.readyState === "loading" ? d.addEventListener("DOMContentLoaded", fn, { once: true }) : fn());
  function el(html) { const t = d.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function toast(text, tone = "") {
    let box = $("#cnIosToast");
    if (!box) {
      box = el('<div id="cnIosToast" class="cn-ios-toast" role="status" aria-live="polite"></div>');
      d.body.appendChild(box);
    }
    box.textContent = text;
    box.className = `cn-ios-toast is-shown ${tone}`.trim();
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { box.className = "cn-ios-toast"; }, 3600);
  }

  // A bottom sheet (dialog). resolve(value) closes it. Escape / the backdrop resolve(null) unless sticky.
  function sheet({ id, label, html, sticky = false, onOpen }) {
    return new Promise(resolve => {
      $(`#${id}`)?.remove();
      const back = d.activeElement;
      const node = el(`<div class="cn-ios-sheet-backdrop" id="${id}"><div class="cn-ios-sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</div></div>`);
      const panel = node.firstElementChild;
      const done = value => {
        d.removeEventListener("keydown", onKey, true);
        node.classList.remove("is-open");
        later(() => node.remove(), 220);
        try { back?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
        resolve(value);
      };
      const onKey = e => {
        if ((e.key === "Escape" || e.key === "Esc") && !sticky) { e.stopImmediatePropagation(); done(null); }
        if (e.key === "Tab") {
          const f = $$('button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])', panel).filter(x => x.offsetParent !== null);
          if (!f.length) return;
          if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      };
      node.addEventListener("click", e => {
        if (e.target === node && !sticky) done(null);
        const b = e.target.closest?.("[data-sheet-value]");
        if (b && node.contains(b)) done(b.getAttribute("data-sheet-value"));
      });
      d.addEventListener("keydown", onKey, true);
      d.body.appendChild(node);
      requestAnimationFrame(() => {
        node.classList.add("is-open");
        const first = panel.querySelector("[data-autofocus]") || panel;
        try { first.focus({ preventScroll: true }); } catch { first.focus(); }
      });
      onOpen?.(panel, done);
    });
  }

  async function openExternal(url) {
    const launcher = P("AppLauncher");
    try {
      if (launcher) { await launcher.openUrl({ url }); return; }
    } catch (error) { report(error, "openUrl"); }
    w.open(url, "_blank", "noopener");
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied."); return; } catch { /* fall back */ }
    const area = el("<textarea readonly></textarea>");
    area.value = text; d.body.appendChild(area); area.select();
    try { d.execCommand("copy"); toast("Copied."); } catch { toast("Copying is not available here."); }
    area.remove();
  }

  function haptic(type) {
    const h = P("Haptics");
    if (!h) return;
    h.notification({ type }).catch(() => {});
  }

  /* ================================================================ 2. navigation / tab bar */
  // Native UITabBar (CNTabBar plugin, BUILD-PLAN §6.6) or, without it, a web tab bar with the same tabs.
  const TABS = [
    { id: "check", page: "cybernet", label: "Check", icon: '<path d="M12 2.8 20 6v5.8c0 4.7-3.1 7.7-8 9.4-4.9-1.7-8-4.7-8-9.4V6l8-3.2Z"/><path d="m8.6 12 2.3 2.3 4.6-4.7"/>' },
    { id: "scan", page: null, label: "Scan QR", icon: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13v3"/>' },
    { id: "recovery", page: "recovery", label: "Recovery", icon: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/>' },
    { id: "learn", page: "learn", label: "Learn", icon: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>' },
    { id: "account", page: "account", label: "Account", icon: '<circle cx="12" cy="9" r="3.6"/><path d="M5.5 19.2c1.3-3 3.7-4.4 6.5-4.4s5.2 1.4 6.5 4.4"/><circle cx="12" cy="12" r="9"/>' }
  ];
  const PAGE_TAB = { cybernet: "check", cybernetai: "check", recovery: "recovery", learn: "learn", account: "account" };
  const PAGE_NAMES = { cybernet: "Check", cybernetai: "Analysis AI", recovery: "Recovery", learn: "Learn", account: "Account" };
  const nativeTabs = P("CNTabBar");

  function navigate(page) {
    if (w.CyberNetNav?.switchPage) { w.CyberNetNav.switchPage(page); return; }
    $(`.nav-tabs .nav-link[data-page="${page}"]`)?.click();
  }
  function goTab(id) {
    const tab = TABS.find(t => t.id === id);
    if (!tab) return;
    if (id === "scan") { startQrScan(); return; }
    navigate(tab.page);
  }
  function activePage() { return $(".page.active-page")?.id || "cybernet"; }

  function buildWebTabbar() {
    if (nativeTabs || $("#cnIosTabbar")) return;
    root.classList.add("cn-web-tabs");
    const bar = el(`<nav id="cnIosTabbar" class="cn-ios-tabbar" aria-label="Main">${TABS.map(t => `
      <button type="button" class="cn-ios-tab" data-ios-tab="${t.id}" aria-label="${esc(t.label)}">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>
        <span>${esc(t.label)}</span>
      </button>`).join("")}</nav>`);
    bar.addEventListener("click", e => {
      const b = e.target.closest("[data-ios-tab]");
      if (b) goTab(b.getAttribute("data-ios-tab"));
    });
    d.body.appendChild(bar);
  }
  function syncTabs() {
    const page = activePage();
    const tab = PAGE_TAB[page] || "check";
    $$("#cnIosTabbar [data-ios-tab]").forEach(b => {
      const on = b.getAttribute("data-ios-tab") === tab;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    nativeTabs?.select({ tab }).catch(() => {});
    if (w.CNAnalytics?.page) w.CNAnalytics.page(page, PAGE_NAMES[page] || page);
  }
  function watchPages() {
    let last = activePage();
    const mo = new MutationObserver(() => {
      const now = activePage();
      if (now === last) return;
      last = now;
      syncTabs();
      if (now === "account") renderAccount();
      if (now === "recovery") later(addReminderButton, 400);
    });
    $$(".page").forEach(p => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
    syncTabs();
  }
  // Native tab taps: bridge.triggerWindowJSEvent("cnTab", {"tab":"check"}) (Capacitor copies the data
  // onto the event), and the bar's overlap with the page for the bottom padding.
  w.addEventListener("cnTab", e => goTab(e.tab || e.detail?.tab));
  w.addEventListener("cnTabBarMetrics", e => setTabbarInset(Number(e.height ?? e.detail?.height)));
  function setTabbarInset(px) { if (Number.isFinite(px) && px >= 0) root.style.setProperty("--cn-native-tabbar-h", `${px}px`); }
  if (nativeTabs) {
    root.classList.add("cn-native-tabs");
    nativeTabs.getMetrics?.().then(m => setTabbarInset(Number(m?.height)), () => {});
  }

  /* ================================================================ 3. Account screen */
  // Markup: mobile/web-ios/partials/account.html (inserted into <main> at build time).
  function userEmailLabel(user) {
    const email = String(user?.email || "");
    if (/@privaterelay\.appleid\.com$/i.test(email)) return "Apple ID (hidden email)";
    return email || "Signed in";
  }
  function isAppleUser(user) {
    const providers = user?.app_metadata?.providers || [user?.app_metadata?.provider];
    return (providers || []).includes("apple") || (user?.identities || []).some(i => i?.provider === "apple");
  }
  // A member (not the owner) of a team joined on the website: their AI explanations and Recovery activity
  // also go to the team owner's activity log (owner answer 8). Checks on the iPhone never do.
  function isTeamMember() {
    const s = state();
    return Boolean(s?.profile?.isTeamMember) && s?.profile?.teamRole !== "owner";
  }
  function renderAccount() {
    const page = $("#account");
    if (!page) return;
    const s = state();
    const inNow = signedIn();
    $$("[data-ios-signed-in]", page).forEach(n => { n.hidden = !inNow; });
    $$("[data-ios-signed-out]", page).forEach(n => { n.hidden = inNow; });
    if (inNow) {
      const user = s?.user || {};
      const name = String(s?.profile?.fullName || user?.user_metadata?.full_name || "").trim();
      $("#cnAcctName").textContent = name || "Your account";
      $("#cnAcctEmail").textContent = userEmailLabel(user);
      const u = s?.usage || {};
      const limit = Number(u.limit) || 0;
      const used = Number(u.used) || 0;
      $("#cnAcctAi").textContent = limit ? `${Math.max(0, limit - used)} of ${limit} left` : "—";
      const r = s?.recoveryUsage || {};
      $("#cnAcctRec").textContent = Number(r.limit) ? `${Math.max(0, Number(r.limit) - (Number(r.used) || 0))} of ${Number(r.limit)} left` : "—";
      $("#cnAcctTeam").hidden = !isTeamMember();
      refreshConsentSwitch();
    }
    refreshReminderSwitch();
    refreshTrackingRow();
  }

  function bindAccount() {
    const page = $("#account");
    if (!page) return;
    page.addEventListener("click", async e => {
      const t = e.target.closest?.("[data-ios-action]");
      if (!t) return;
      const action = t.getAttribute("data-ios-action");
      try {
        if (action === "sign-in") account()?.openAuthModal?.("login");
        else if (action === "create") account()?.openAuthModal?.("signup");
        else if (action === "sign-out") await signOut();
        else if (action === "export") w.CNPrivacy?.exportData?.();
        else if (action === "clear") w.CNPrivacy?.openClear?.();
        else if (action === "delete") w.CNPrivacy?.openDelete?.();
        else if (action === "support") account()?.openFeedbackModal?.();
        else if (action === "copy-support") copyText(SUPPORT);
        else if (action === "legal") openLegal(t.getAttribute("data-doc") || "privacy");
        else if (action === "intro") showIntro(true);
        else if (action === "test-reminder") testReminder();
        else if (action === "tracking-settings") openExternal("app-settings:");
      } catch (error) { report(error, `account ${action}`); toast("Something went wrong. Please try again."); }
    });
    $("#cnAiConsentSwitch")?.addEventListener("change", e => toggleConsent(e.target));
    $("#cnReminderSwitch")?.addEventListener("change", e => toggleReminders(e.target));
    $$("[data-ios-version]").forEach(n => { n.textContent = VERSION; });
    let lastUser = null;
    w.addEventListener("cybernet:session", e => {
      const user = e.detail?.userId || null;
      if (user !== consent.userId) consent.forget();
      renderAccount();
      if (user) later(flushAcceptance, 50);
      else if (lastUser) later(cancelReminders, 0); // signed out on this device: the reminders go too
      lastUser = user;
    });
    w.addEventListener("cybernet:account-ui", () => { if (activePage() === "account") renderAccount(); });
  }

  async function signOut() {
    await cancelReminders();
    try { await supabase()?.auth.signOut(); } catch (error) { report(error, "signOut"); }
    try { await P("Preferences")?.clear(); } catch { /* ignore */ }
    w.location.replace("index.html");
  }

  /* ================================================================ 4. AI consent sheet */
  // Shown before the first text, link, screenshot or Recovery case is sent for an AI explanation
  // (App Review 5.1.2(i)). The server is the source of truth (/api/ai-consent); nothing is sent before Allow.
  const consent = {
    userId: null,
    granted: null,
    forget() { this.userId = null; this.granted = null; },
    async read(force = false) {
      const uid = state()?.user?.id || null;
      if (!uid) return false;
      if (!force && this.userId === uid && this.granted !== null) return this.granted;
      const res = await fetch("/api/ai-consent", { headers: authHeaders({ Accept: "application/json" }), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || "AI analysis settings are not available right now."), { status: res.status });
      this.userId = uid;
      this.granted = Boolean(data.granted) && (!data.version || data.version === AI_CONSENT_VERSION);
      return this.granted;
    },
    async grant() {
      const res = await fetch("/api/ai-consent", { method: "POST", headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify({ version: AI_CONSENT_VERSION }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "AI_CONSENT_VERSION_MISMATCH") throw new Error("This version of CyberNet AI shows an older AI notice. Update the app from the App Store, then try again.");
        throw new Error(data.error || "Your choice could not be saved. Please try again.");
      }
      this.userId = state()?.user?.id || null;
      this.granted = true;
      store.set("cn-ios-ai-consent", "granted");
      return true;
    },
    async withdraw() {
      const res = await fetch("/api/ai-consent", { method: "DELETE", headers: authHeaders({ Accept: "application/json" }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || "Your choice could not be saved. Please try again."); }
      this.granted = false;
      store.set("cn-ios-ai-consent", "withdrawn");
    },
    // true when AI analysis may be used now; shows the sheet if needed
    async ensure() {
      if (!signedIn()) return true; // the server answers 401 and the page asks the visitor to sign in
      let granted = false;
      try { granted = await this.read(); }
      catch (error) { if (error.status === 401) return true; throw error; }
      if (granted) return true;
      return askConsent();
    }
  };
  let consentOpen = null;
  function askConsent() {
    if (consentOpen) return consentOpen;
    consentOpen = sheet({
      id: "cnConsentSheet",
      label: "Allow AI analysis?",
      sticky: true,
      html: `
        <h2 class="cn-ios-sheet-title">Allow AI analysis?</h2>
        <div class="cn-ios-sheet-body">
          <p>To explain a message, link, screenshot or Recovery case, CyberNet AI sends it from your iPhone to our server, which passes it to <strong>OpenAI</strong>, a third-party AI provider, to write the explanation.</p>
          <p>It is sent only when you send it yourself: Send in Analysis AI, or Start and Update in Recovery. OpenAI processes it under its API terms and does not use it to train its models. Remove passwords, one-time codes and card numbers first.</p>
          ${isTeamMember() ? "<p><strong>You are a member of a team:</strong> your AI explanations and Recovery activity also appear in your team owner&rsquo;s activity log.</p>" : ""}
          <p>Quick Scan, QR scanning and the Share sheet work on your iPhone and do not use AI.</p>
          <p>You can turn this off any time in Account, under Privacy &amp; data.</p>
          <p class="cn-ios-sheet-error" role="alert" hidden></p>
        </div>
        <div class="cn-ios-sheet-actions">
          <button type="button" class="primary-btn full" data-consent="allow" data-autofocus>Allow</button>
          <button type="button" class="secondary-btn full" data-sheet-value="no">Not now</button>
          <button type="button" class="cn-ios-link-btn" data-consent="policy">How your data is used</button>
        </div>`,
      onOpen(panel, done) {
        panel.addEventListener("click", async e => {
          const b = e.target.closest("[data-consent]");
          if (!b) return;
          if (b.getAttribute("data-consent") === "policy") { openLegal("privacy", "iphone-app"); return; }
          const error = panel.querySelector(".cn-ios-sheet-error");
          b.disabled = true;
          error.hidden = true;
          try { await consent.grant(); done("yes"); }
          catch (err) { error.textContent = err.message; error.hidden = false; b.disabled = false; }
        });
      }
    }).then(value => { consentOpen = null; renderAccount(); return value === "yes"; });
    return consentOpen;
  }
  async function refreshConsentSwitch() {
    const box = $("#cnAiConsentSwitch");
    if (!box || !signedIn()) return;
    try { box.checked = await consent.read(); box.disabled = false; }
    catch { box.disabled = true; }
  }
  async function toggleConsent(box) {
    box.disabled = true;
    try {
      if (box.checked) box.checked = await askConsent();
      else { await consent.withdraw(); toast("AI analysis is off. Nothing will be sent for an explanation."); }
    } catch (error) { toast(error.message || "Your choice could not be saved."); box.checked = !box.checked; }
    box.disabled = false;
  }

  /* ================================================================ 5. fetch layer */
  // Wraps the boot layer: asks for AI consent BEFORE an AI request leaves the phone, adds the Sign in
  // with Apple code to an account deletion (token revocation, §8.5), and remembers the current Recovery
  // case for reminders.
  const AI_ENDPOINT = /^\/api\/(analyze|recovery-mode|recovery-update)(?:[?#]|$)/;
  const appFetch = w.fetch;
  let lastCaseId = "";
  function freshSignal(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }
  function consentDeclined() {
    return new Response(JSON.stringify({
      code: "AI_CONSENT_REQUIRED",
      error: "Nothing was sent: AI analysis is off. Try again and choose Allow for an AI explanation, or use Quick Scan, which checks on your iPhone without AI."
    }), { status: 428, headers: { "Content-Type": "application/json" } });
  }
  w.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    if (method === "POST" && AI_ENDPOINT.test(url)) {
      let asked = false;
      try {
        if (!(consent.granted === true && consent.userId === state()?.user?.id)) {
          asked = true;
          if (!(await consent.ensure())) return consentDeclined();
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message || "AI analysis settings are not available right now. Please try again." }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
      // the sheet may have been open longer than the caller's own timeout
      let options = asked ? { ...(init || {}), signal: freshSignal(40000) } : init;
      noteCase(url, options);
      let res = await appFetch(input, options);
      if (res.status === 428) {
        consent.forget();
        if (await askConsent()) { options = { ...(init || {}), signal: freshSignal(40000) }; res = await appFetch(input, options); }
      }
      if (/recovery-mode/.test(url) && res.ok) res.clone().json().then(j => { if (j?.caseId) lastCaseId = String(j.caseId); }).catch(() => {});
      return res;
    }
    if (method === "GET" && /^\/api\/account-status(?:[?#]|$)/.test(url)) {
      // script.js keeps appState.recoveryUsage as { used, limit } but only fills it from Recovery replies.
      // The app's account-status (App tier) sends today's Recovery counts too, so copy them before
      // script.js reads the reply; the Account screen and the Recovery meter then show them at once.
      const res = await appFetch(input, init);
      if (res.ok) {
        try {
          const r = (await res.clone().json())?.recoveryUsage;
          const s = state();
          if (s && r && Number(r.casesLimit) > 0) s.recoveryUsage = { used: Number(r.casesUsed) || 0, limit: Number(r.casesLimit) };
        } catch { /* not JSON: script.js reports it */ }
      }
      return res;
    }
    if (method === "POST" && /^\/api\/privacy-data(?:[?#]|$)/.test(url)) init = await withAppleCode(init);
    if (/^\/api\/recovery-case\?/.test(url)) { const m = /[?&]caseId=([^&#]+)/.exec(url); if (m) lastCaseId = decodeURIComponent(m[1]); }
    return appFetch(input, init);
  };
  function noteCase(url, options) {
    if (!/recovery-update/.test(url) || typeof options?.body !== "string") return;
    try { const id = JSON.parse(options.body)?.caseId; if (id) lastCaseId = String(id); } catch { /* ignore */ }
  }
  async function withAppleCode(init) {
    let body;
    try { body = JSON.parse(init?.body || "{}"); } catch { return init; }
    if (body?.action !== "delete-account" || !isAppleUser(state()?.user)) return init;
    const apple = P("AppleSignIn");
    if (!apple) return init;
    toast("Confirm with Apple so Sign in with Apple is disconnected too.");
    try {
      const res = await apple.signIn({ scopes: [] });
      const code = res?.authorizationCode || res?.response?.authorizationCode || "";
      if (code) body.appleAuthorizationCode = code;
    } catch (error) { report(error, "apple code for deletion"); /* deletion goes ahead; revocation is best effort */ }
    return { ...init, body: JSON.stringify(body) };
  }

  /* ================================================================ 6. downloads */
  // The website saves reports and the data export with <a download> on a blob: URL, which a web view
  // ignores (B6). In the app the file is written to the cache folder and the share sheet offers
  // "Save to Files", Mail, AirDrop and so on.
  const nativeAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const href = this.getAttribute("href") || "";
    if (this.hasAttribute("download") && /^(blob:|data:)/.test(href)) {
      const name = (this.getAttribute("download") || "cybernet-ai-file").replace(/[^\w.-]+/g, "-").slice(0, 80);
      const blobFetch = fetch(href).then(r => r.blob()); // starts now: the page revokes the URL a second later
      shareFile(blobFetch, name);
      return;
    }
    return nativeAnchorClick.call(this);
  };
  async function shareFile(blobPromise, filename) {
    const fs = P("Filesystem"), share = P("Share");
    try {
      const blob = await blobPromise;
      if (!fs || !share) { toast("Saving files works in the CyberNet AI app."); return; }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const written = await fs.writeFile({ path: filename, data, directory: "CACHE", recursive: true });
      await share.share({ title: filename, url: written.uri, dialogTitle: "Save or share" });
    } catch (error) {
      if (/cancel/i.test(String(error?.message || error))) return;
      report(error, "shareFile");
      toast("The file could not be saved. Please try again.");
    }
  }

  /* ================================================================ 7. first-run intro */
  const INTRO_KEY = "cn-ios-intro-1";
  const INTRO = [
    { title: "Check a text or link", text: "Paste a message or a link into Check. CyberNet AI reads it on your iPhone and shows the warning signs. No account needed." },
    { title: "Scan a QR code before you open it", text: "Scan QR shows where a code really goes. Nothing opens until you choose." },
    { title: "Share to CyberNet AI", text: "In Safari, Mail or Photos, tap Share and choose CyberNet AI. If you don't see it, scroll the app row to More and turn on CyberNet AI. For a text message, copy it and paste it into Check." }
  ];
  function showIntro(force = false) {
    if (!force && store.get(INTRO_KEY)) return Promise.resolve(false);
    let step = 0;
    return sheet({
      id: "cnIntro",
      label: "Welcome to CyberNet AI",
      sticky: true,
      html: `<div class="cn-ios-intro">
          <p class="cn-ios-intro-step" aria-live="polite"></p>
          <h2 class="cn-ios-sheet-title" id="cnIntroTitle"></h2>
          <p class="cn-ios-intro-text"></p>
          <div class="cn-ios-intro-dots" aria-hidden="true">${INTRO.map(() => "<i></i>").join("")}</div>
        </div>
        <div class="cn-ios-sheet-actions cn-ios-intro-actions">
          <button type="button" class="primary-btn full" data-intro="next" data-autofocus>Next</button>
          <button type="button" class="cn-ios-link-btn" data-sheet-value="skip">Skip</button>
        </div>`,
      onOpen(panel, done) {
        const paint = () => {
          panel.querySelector(".cn-ios-intro-step").textContent = `${step + 1} of ${INTRO.length}`;
          panel.querySelector("#cnIntroTitle").textContent = INTRO[step].title;
          panel.querySelector(".cn-ios-intro-text").textContent = INTRO[step].text;
          panel.querySelectorAll(".cn-ios-intro-dots i").forEach((dot, i) => dot.classList.toggle("is-on", i === step));
          panel.querySelector('[data-intro="next"]').textContent = step === INTRO.length - 1 ? "Get started" : "Next";
        };
        paint();
        panel.addEventListener("click", e => {
          if (!e.target.closest('[data-intro="next"]')) return;
          if (step < INTRO.length - 1) { step++; paint(); } else done("done");
        });
      }
    }).then(value => { store.set(INTRO_KEY, String(Date.now())); return value; });
  }

  /* ================================================================ 8. legal pages and the sign-up acceptance */
  const LEGAL_FILES = { terms: "terms", privacy: "privacy", acceptable: "acceptable-use", "acceptable-use": "acceptable-use" };
  function openLegal(doc = "privacy", hash = "") {
    const file = LEGAL_FILES[doc] || "privacy";
    $("#cnLegalSheet")?.remove();
    const back = d.activeElement;
    const node = el(`<div class="cn-ios-legal-sheet" id="cnLegalSheet" role="dialog" aria-modal="true" aria-label="Legal">
        <div class="cn-ios-legal-head">
          <button type="button" class="cn-ios-link-btn" data-legal-close>Done</button>
        </div>
        <iframe class="cn-ios-legal-frame" title="Legal document" src="legal/${file}.html?embedded=1${hash ? `#${encodeURIComponent(hash)}` : ""}"></iframe>
      </div>`);
    const close = () => { node.classList.remove("is-open"); later(() => node.remove(), 220); d.removeEventListener("keydown", onKey, true); try { back?.focus?.({ preventScroll: true }); } catch { /* ignore */ } };
    const onKey = e => { if (e.key === "Escape" || e.key === "Esc") { e.stopImmediatePropagation(); close(); } };
    node.querySelector("[data-legal-close]").addEventListener("click", close);
    d.addEventListener("keydown", onKey, true);
    d.body.appendChild(node);
    requestAnimationFrame(() => { node.classList.add("is-open"); node.querySelector("[data-legal-close]").focus({ preventScroll: true }); });
  }
  w.CNOpenLegal = openLegal;
  w.CNOpenExternal = openExternal;
  d.addEventListener("click", e => {
    const opener = e.target.closest?.("[data-open-legal]");
    if (opener) { e.preventDefault(); e.stopPropagation(); openLegal(opener.getAttribute("data-open-legal") || "terms"); }
  }, true);

  // Sign-up acceptance (the website's cybernet-legal-upgrade.js is not in the app): the same checkbox,
  // the same record, sent to /api/legal-acceptance once the account is signed in.
  const ACCEPTANCE_KEY = "cybernet_signup_legal_acceptance";
  const ACCEPTANCE_MAX_AGE = 30 * 24 * 3600 * 1000;
  const readAcceptance = () => { try { return JSON.parse(store.get(ACCEPTANCE_KEY) || "null"); } catch { return null; } };
  function storeAcceptance(email) {
    const record = {
      kind: "signup", version: LEGAL.version, termsVersion: LEGAL.version, privacyVersion: LEGAL.privacy,
      acceptableUseVersion: LEGAL.version, refundVersion: LEGAL.version, billingCycle: "", effectiveDate: LEGAL.effective,
      acceptedAt: new Date().toISOString(), page: "ios-app", email: email || "", platform: "ios"
    };
    store.set(ACCEPTANCE_KEY, JSON.stringify(record));
    return record;
  }
  function matchesUser(record, user) {
    const acceptedAt = Date.parse(record.acceptedAt || ""), createdAt = Date.parse(user?.created_at || "");
    if (!Number.isFinite(acceptedAt) || !Number.isFinite(createdAt)) return false;
    if (createdAt < acceptedAt - 3600e3) return false;
    if (record.email) return String(user.email || "").trim().toLowerCase() === record.email;
    return createdAt <= acceptedAt + 3600e3;
  }
  let flushing = false;
  async function flushAcceptance() {
    const s = state();
    const token = s?.session?.access_token;
    const record = readAcceptance();
    if (flushing || !token || !record || record.kind !== "signup" || record.serverRecorded || (Number(record.attempts) || 0) >= 3) return;
    const at = Date.parse(record.acceptedAt || "");
    if (!Number.isFinite(at) || Date.now() - at > ACCEPTANCE_MAX_AGE || !matchesUser(record, s.session.user)) return;
    flushing = true;
    try {
      record.attempts = (Number(record.attempts) || 0) + 1;
      store.set(ACCEPTANCE_KEY, JSON.stringify(record));
      const res = await fetch("/api/legal-acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: "signup", version: record.version, termsVersion: record.termsVersion, privacyVersion: record.privacyVersion, acceptableUseVersion: record.acceptableUseVersion, refundVersion: record.refundVersion, page: "ios-app" }),
        keepalive: true
      });
      if (res.ok) { record.serverRecorded = true; store.set(ACCEPTANCE_KEY, JSON.stringify(record)); }
    } catch { /* kept for the next sign-in */ }
    finally { flushing = false; }
  }
  function setupSignupConsent() {
    const form = $("#authSignupForm"), button = $("#signupBtn");
    if (!form || !button || $("#cnSignupLegalBox")) return;
    const box = el(`<section class="cn-signup-legal" id="cnSignupLegalBox">
        <div class="cn-signup-legal-row">
          <input type="checkbox" id="cnSignupLegalConsent" aria-describedby="cnSignupLegalRequired">
          <label for="cnSignupLegalConsent">I have read and agree to the <strong>Terms of Service</strong>, <strong>Privacy Policy</strong> and <strong>Acceptable Use Policy</strong>. I understand that CyberNet AI gives automated security information that may contain mistakes.</label>
        </div>
        <div class="cn-legal-inline-actions">
          <button type="button" class="cn-legal-link-btn" data-open-legal="terms">Terms</button>
          <button type="button" class="cn-legal-link-btn" data-open-legal="privacy">Privacy</button>
          <button type="button" class="cn-legal-link-btn" data-open-legal="acceptable">Acceptable Use</button>
        </div>
        <small class="cn-legal-required" id="cnSignupLegalRequired">Required to create an account · Version ${esc(LEGAL.version)}</small>
      </section>`);
    const message = $("#authMessage");
    if (message && message.parentElement === form) form.insertBefore(box, message); else button.insertAdjacentElement("beforebegin", box);
    const check = $("#cnSignupLegalConsent");
    check.addEventListener("change", () => {
      box.classList.remove("cn-legal-error");
      if (check.checked) storeAcceptance(String($("#signupEmail")?.value || "").trim().toLowerCase());
    });
  }
  function legalAccepted() { return !!$("#cnSignupLegalConsent")?.checked; }
  function legalError() {
    const m = $("#authMessage");
    if (m) { m.textContent = "Please accept the Terms of Service, Privacy Policy and Acceptable Use Policy to create an account."; m.className = "auth-message error"; }
    const box = $("#cnSignupLegalBox");
    box?.classList.remove("cn-legal-error");
    requestAnimationFrame(() => box?.classList.add("cn-legal-error"));
    box?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  d.addEventListener("click", e => {
    if (!e.target.closest?.("#signupBtn")) return;
    if (!legalAccepted()) { e.preventDefault(); e.stopImmediatePropagation(); legalError(); return; }
    storeAcceptance(String($("#signupEmail")?.value || "").trim().toLowerCase());
  }, true);

  /* ================================================================ 9. Sign in with Apple */
  const APPLE_LOGO = '<svg viewBox="0 0 17 20" width="15" height="18" aria-hidden="true" fill="currentColor"><path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM11.6 3.1c.7-.9 1.2-2 1.1-3.1-1 0-2.2.7-2.9 1.6-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.8-1.5z"/></svg>';
  function setupApple() {
    if (!P("AppleSignIn")) return;
    const modal = $("#authModal .modal-card");
    const tabs = $("#authModal .auth-tabs");
    if (!modal || !tabs || $("#cnAppleWrap")) return;
    const wrap = el(`<div class="cn-ios-apple" id="cnAppleWrap">
        <button type="button" class="cn-ios-apple-btn" id="cnAppleBtn">${APPLE_LOGO}<span>Continue with Apple</span></button>
        <p class="cn-ios-apple-note" id="cnAppleNote">By continuing with Apple you agree to the <button type="button" class="cn-legal-link-btn" data-open-legal="terms">Terms of Service</button> and the <button type="button" class="cn-legal-link-btn" data-open-legal="privacy">Privacy Policy</button>.</p>
        <div class="auth-divider"><span>or use your email</span></div>
      </div>`);
    tabs.insertAdjacentElement("afterend", wrap);
    $("#cnAppleBtn").addEventListener("click", () => signInWithApple($("#cnAppleBtn")));
    const sync = () => {
      const view = $("#authModal")?.dataset.authView || "login";
      wrap.hidden = !(view === "login" || view === "signup");
      $("#cnAppleNote").hidden = view === "signup";
    };
    new MutationObserver(sync).observe($("#authModal"), { attributes: true, attributeFilter: ["data-auth-view", "class"] });
    sync();
  }
  function authMessage(text, tone = "error") {
    const m = $("#authMessage");
    if (m) { m.textContent = text; m.className = `auth-message ${tone}`; }
  }
  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    if (w.crypto?.subtle?.digest) {
      const buf = await w.crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    }
    return sha256Fallback(bytes);
  }
  // Plain SHA-256, only used if WebCrypto is unavailable in this web view.
  function sha256Fallback(bytes) {
    const K = [], H = [];
    const isPrime = n => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    const frac = x => ((x - Math.floor(x)) * 4294967296) | 0;
    for (let n = 2, i = 0; i < 64; n++) if (isPrime(n)) { if (i < 8) H[i] = frac(Math.pow(n, 1 / 2)); K[i++] = frac(Math.pow(n, 1 / 3)); }
    const l = bytes.length, words = [];
    const padded = new Uint8Array(((l + 9 + 63) >> 6) << 6);
    padded.set(bytes); padded[l] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, l * 8);
    dv.setUint32(padded.length - 8, Math.floor(l / 536870912));
    const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < padded.length; o += 64) {
      for (let i = 0; i < 16; i++) words[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rot(words[i - 15], 7) ^ rot(words[i - 15], 18) ^ (words[i - 15] >>> 3);
        const s1 = rot(words[i - 2], 17) ^ rot(words[i - 2], 19) ^ (words[i - 2] >>> 10);
        words[i] = (words[i - 16] + s0 + words[i - 7] + s1) | 0;
      }
      let [a, b, c, e, f, g, h, k] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (k + (rot(f, 6) ^ rot(f, 11) ^ rot(f, 25)) + ((f & g) ^ (~f & h)) + K[i] + words[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        k = h; h = g; g = f; f = (e + t1) | 0; e = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      // note: e/f naming follows the loop above (a b c e | f g h k = a..h)
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + e) | 0;
      H[4] = (H[4] + f) | 0; H[5] = (H[5] + g) | 0; H[6] = (H[6] + h) | 0; H[7] = (H[7] + k) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }
  function randomNonce() {
    const b = new Uint8Array(32);
    w.crypto.getRandomValues(b);
    return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  async function signInWithApple(button) {
    const apple = P("AppleSignIn"), sb = supabase();
    if (!apple || !sb) { authMessage("Sign in with Apple is not available right now. Please use your email and password."); return; }
    const view = $("#authModal")?.dataset.authView || "login";
    if (view === "signup" && !legalAccepted()) { legalError(); return; }
    if (view === "signup") storeAcceptance("");
    else {
      // A new Apple account agrees through the note under the button; the record has no email, so it is
      // only sent if the account turns out to be new (created around now). Keep an unsent current one.
      const existing = readAcceptance();
      const keep = existing && !existing.serverRecorded && existing.version === LEGAL.version && existing.privacyVersion === LEGAL.privacy && (Number(existing.attempts) || 0) < 3 && Date.now() - Date.parse(existing.acceptedAt || "") <= ACCEPTANCE_MAX_AGE;
      if (!keep) storeAcceptance("");
    }
    button.disabled = true;
    authMessage("", "");
    try {
      const raw = randomNonce();
      const res = await apple.signIn({ scopes: ["email", "fullName"], nonce: await sha256Hex(raw) });
      const token = res?.idToken || res?.identityToken || res?.response?.identityToken;
      if (!token) throw new Error("Apple did not return a sign-in token.");
      const { error } = await sb.auth.signInWithIdToken({ provider: "apple", token, nonce: raw });
      if (error) throw error;
      const given = res?.givenName || res?.response?.givenName || "", family = res?.familyName || res?.response?.familyName || "";
      if (given || family) await sb.auth.updateUser({ data: { full_name: `${given} ${family}`.trim(), first_name: given, last_name: family } }).catch(() => {});
      authMessage("You're signed in.", "success");
      $("#closeAuth")?.click();
      toast("You're signed in with Apple.");
    } catch (error) {
      const text = String(error?.message || error?.code || "");
      if (/cancel|1001/i.test(text)) authMessage("", "");
      else { report(error, "apple sign-in"); authMessage("Sign in with Apple didn't finish. Please try again, or use your email and password."); }
    } finally { button.disabled = false; }
  }

  /* ================================================================ 10. QR scanner */
  async function startQrScan() {
    const scanner = P("CapacitorBarcodeScanner");
    if (!scanner) { showCameraHelp("The camera scanner is part of the CyberNet AI app. You can choose a photo of a QR code instead."); return; }
    try {
      const result = await scanner.scanBarcode({
        hint: 0, scanInstructions: "Point at a QR code. Nothing opens until you choose.", scanButton: false, scanText: " ",
        cameraDirection: 1, scanOrientation: 1, cancelButtonAccessibilityLabel: "Cancel"
      });
      const value = String(result?.ScanResult || "").trim();
      if (value) showQrVerdict(value, "qr");
    } catch (error) {
      const text = `${error?.code || ""} ${error?.message || ""}`;
      if (/0006\b|cancel/i.test(text)) return;
      if (/0007\b|camera access|permission/i.test(text)) { showCameraHelp("CyberNet AI doesn't have access to the camera. You can allow it in Settings, or choose a photo of the QR code instead.", true); return; }
      report(error, "qr scan");
      showCameraHelp("The scanner couldn't start. You can choose a photo of the QR code instead.");
    }
  }
  function showCameraHelp(text, settings = false) {
    sheet({
      id: "cnCameraHelp",
      label: "Scan a QR code",
      html: `<h2 class="cn-ios-sheet-title">Scan a QR code</h2>
        <div class="cn-ios-sheet-body"><p>${esc(text)}</p></div>
        <div class="cn-ios-sheet-actions">
          <button type="button" class="primary-btn full" data-sheet-value="photo" data-autofocus>Choose a photo of a QR code</button>
          ${settings ? '<button type="button" class="secondary-btn full" data-sheet-value="settings">Open Settings</button>' : ""}
          <button type="button" class="cn-ios-link-btn" data-sheet-value="close">Close</button>
        </div>`
    }).then(choice => {
      if (choice === "settings") openExternal("app-settings:");
      if (choice === "photo") {
        navigate("cybernet");
        $('.detect-tab[data-tab="image"]')?.click();
        later(() => $("#cyberImageInput")?.click(), 350);
      }
    });
  }
  function verdictOf(result) {
    const E = w.CyberNetEngine;
    const score = Number(result?.score) || 0;
    if (score >= (E?.SCAM_THRESHOLD ?? 32)) return { headline: "SCAM", tone: "danger", haptic: "ERROR" };
    if (result?.kind === "link" && !result.officialBrand) return E?.linkNeedsCaution?.(result) ? { headline: "CAN'T CONFIRM", tone: "uncertain", haptic: "WARNING" } : { headline: "LOW RISK", tone: "safe", haptic: "SUCCESS" };
    return { headline: "LOW RISK", tone: "safe", haptic: "SUCCESS" }; // never "NOT A SCAM" in the app (risk D2)
  }
  function linkParts(value) {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
      if (!/^https?:$/.test(url.protocol)) return null;
      return { href: url.href, host: url.hostname, rest: url.href.slice(url.href.indexOf(url.hostname) + url.hostname.length) , scheme: url.protocol + "//" };
    } catch { return null; }
  }
  function showQrVerdict(value, kind = "qr", opts = {}) {
    const E = w.CyberNetEngine;
    if (!E) { toast("The checker could not load. Please restart the app."); return; }
    let analysed;
    try { analysed = E.analyzeQr(value); } catch (error) { report(error, "analyzeQr"); toast("This code could not be checked."); return; }
    const result = analysed.result || { score: 0, reasons: ["The code holds plain text."], advice: [] };
    const v = verdictOf(result);
    const plain = E.plainSummary ? E.plainSummary(result, { fallbackText: "" }) : { lead: "", points: (result.reasons || []).slice(0, 3), action: "" };
    const link = analysed.kind === "url" ? linkParts(value) : null;
    const target = link ? `<p class="cn-ios-qr-target"><span>${esc(link.scheme)}</span><strong>${esc(link.host)}</strong><span>${esc(link.rest)}</span></p>` : `<pre class="cn-ios-qr-raw">${esc(value.slice(0, 600))}</pre>`;
    haptic(v.haptic);
    sheet({
      id: "cnQrVerdict",
      label: "QR code result",
      html: `<p class="cn-ios-sheet-kicker">${kind === "share" ? "Shared item" : "QR code"} · ${esc(analysed.kind === "url" ? "Web link" : "Content")}</p>
        <div class="verdict-headline verdict-headline-${v.tone}"><span class="verdict-headline-text">${v.headline}</span></div>
        <div class="cn-ios-sheet-body">
          ${target}
          ${plain.lead ? `<p class="plain-lead">${esc(plain.lead)}</p>` : ""}
          <ul class="plain-points">${(plain.points || []).slice(0, 3).map(p => `<li>${esc(p)}</li>`).join("")}</ul>
          ${plain.action ? `<p class="plain-action"><strong>What to do:</strong> ${esc(plain.action)}</p>` : ""}
          <p class="cn-ios-disclaimer-small">It is not antivirus software, and no scanner can promise something is 100% safe.</p>
        </div>
        <div class="cn-ios-sheet-actions">
          ${link ? `<button type="button" class="${v.tone === "safe" ? "primary-btn" : "secondary-btn"} full" data-qr="open">Open in Safari</button>` : ""}
          <button type="button" class="secondary-btn full" data-qr="copy">Copy</button>
          ${kind === "qr" ? '<button type="button" class="secondary-btn full" data-qr="again">Scan another</button>' : ""}
          <button type="button" class="secondary-btn full" data-qr="ai">Get an AI explanation</button>
          <button type="button" class="cn-ios-link-btn" data-qr="report">Report a problem with this result</button>
          <button type="button" class="cn-ios-link-btn" data-sheet-value="close" data-autofocus>Close</button>
        </div>`,
      onOpen(panel, done) {
        panel.addEventListener("click", async e => {
          const b = e.target.closest("[data-qr]");
          if (!b) return;
          const what = b.getAttribute("data-qr");
          if (what === "copy") copyText(value);
          if (what === "open" && link) {
            if (v.tone !== "safe") {
              const ok = await confirmSheet("Open a risky link?", `CyberNet AI found warning signs for ${link.host}. Open it in Safari only if you are sure who sent it.`, "Open in Safari", "Don't open");
              if (!ok) return;
            }
            done("open"); openExternal(link.href);
          }
          if (what === "again") { done("again"); later(startQrScan, 250); }
          if (what === "ai") { done("ai"); askAi(link ? link.href : value); }
          if (what === "report") reportProblem(kind, "");
        });
      }
    });
  }
  function confirmSheet(title, text, yes, no) {
    return sheet({
      id: "cnConfirm",
      label: title,
      html: `<h2 class="cn-ios-sheet-title">${esc(title)}</h2><div class="cn-ios-sheet-body"><p>${esc(text)}</p></div>
        <div class="cn-ios-sheet-actions"><button type="button" class="secondary-btn full" data-sheet-value="yes">${esc(yes)}</button>
        <button type="button" class="primary-btn full" data-sheet-value="no" data-autofocus>${esc(no)}</button></div>`
    }).then(v => v === "yes");
  }
  // Put something into Analysis AI; the person still taps Send (and sees the consent sheet first).
  function askAi(text, file) {
    if (!signedIn()) { toast("Sign in to get an AI explanation."); account()?.openAuthModal?.("login"); pendingAi = { text, file }; return; }
    navigate("cybernetai");
    later(() => {
      if (file) {
        const input = $("#aiImageInput");
        if (input && typeof DataTransfer === "function") {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      const box = $("#chatInput");
      if (box && text) { box.value = text; box.dispatchEvent(new Event("input", { bubbles: true })); }
      box?.focus();
      toast("Check what will be sent, then tap Send.");
    }, 380);
  }
  let pendingAi = null;
  w.addEventListener("cybernet:session", e => { if (e.detail?.userId && pendingAi) { const p = pendingAi; pendingAi = null; later(() => askAi(p.text, p.file), 500); } });

  /* ================================================================ 11. shared items (Share Extension) */
  // SharedInbox plugin: read() -> { items: [{ id, kind: "text"|"url"|"image", text?, url?, imageDataUrl?,
  // createdAt, localVerdict? }] } (newest last), remove({ id }), clear(). The extension already showed
  // the on-device verdict; here the person may ask for an AI explanation.
  let inboxBusy = false;
  async function checkInbox() {
    const inbox = P("SharedInbox");
    if (!inbox || inboxBusy || $("#cnInboxSheet")) return;
    inboxBusy = true;
    try {
      const { items = [] } = (await inbox.read()) || {};
      const fresh = items.filter(i => Date.now() - Date.parse(i.createdAt || 0) < 24 * 3600e3);
      for (const stale of items.filter(i => !fresh.includes(i))) inbox.remove({ id: stale.id }).catch(() => {});
      const item = fresh[fresh.length - 1];
      if (!item) return;
      const preview = item.kind === "image"
        ? `<img class="cn-ios-inbox-thumb" alt="The shared picture" src="${esc(item.imageDataUrl || "")}">`
        : `<p class="cn-ios-inbox-text">${esc(String(item.url || item.text || "").slice(0, 280))}</p>`;
      const verdict = item.localVerdict?.headline ? `<p class="cn-ios-sheet-kicker">On-device check: ${esc(item.localVerdict.headline)}</p>` : "";
      const choice = await sheet({
        id: "cnInboxSheet",
        label: "You shared something",
        html: `<h2 class="cn-ios-sheet-title">You shared something. Get an AI explanation?</h2>
          <div class="cn-ios-sheet-body">${verdict}${preview}<p>For an AI explanation it is sent to our server and to OpenAI, and only after you allow AI analysis.</p></div>
          <div class="cn-ios-sheet-actions">
            <button type="button" class="primary-btn full" data-sheet-value="ai" data-autofocus>Get an AI explanation</button>
            ${item.kind !== "image" ? '<button type="button" class="secondary-btn full" data-sheet-value="check">Show the full check</button>' : ""}
            <button type="button" class="cn-ios-link-btn" data-sheet-value="no">Not now</button>
          </div>`
      });
      await inbox.remove({ id: item.id }).catch(() => {});
      if (choice === "ai") {
        if (item.kind === "image" && item.imageDataUrl) {
          const blob = await (await fetch(item.imageDataUrl)).blob();
          askAi("", new File([blob], "shared-image.jpg", { type: blob.type || "image/jpeg" }));
        } else askAi(String(item.url || item.text || ""));
      } else if (choice === "check") {
        if (item.kind === "url") showQrVerdict(String(item.url), "share");
        else { navigate("cybernet"); later(() => { const t = $("#cyberTextInput"); if (t) { t.value = String(item.text || "").slice(0, 5000); t.dispatchEvent(new Event("input", { bubbles: true })); $("#cyberTextBtn")?.click(); } }, 380); }
      }
    } catch (error) { report(error, "inbox"); }
    finally { inboxBusy = false; }
  }

  /* ================================================================ 12. Recovery reminders */
  // Local notifications only: nothing leaves the phone, no case details in the text (C5).
  const REMINDER_DAYS = [1, 3, 7];
  const reminderIds = caseId => {
    let h = 0;
    for (const ch of String(caseId || "case")) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const base = 1000 + (Math.abs(h) % 90000) * 10;
    return REMINDER_DAYS.map((_, i) => base + i);
  };
  async function notificationsAllowed(ask) {
    const ln = P("LocalNotifications");
    if (!ln) return false;
    let p = await ln.checkPermissions().catch(() => ({}));
    if (p.display !== "granted" && ask) p = await ln.requestPermissions().catch(() => ({}));
    return p.display === "granted";
  }
  async function scheduleReminders() {
    const ln = P("LocalNotifications");
    if (!ln) { toast("Reminders work in the CyberNet AI app."); return false; }
    const ok = await sheet({
      id: "cnReminderAsk",
      label: "Recovery reminders",
      html: `<h2 class="cn-ios-sheet-title">Remind you to check your plan?</h2>
        <div class="cn-ios-sheet-body"><p>CyberNet AI will remind you in 1, 3 and 7 days, at 6 PM. The reminders stay on this iPhone and never include details of your case.</p></div>
        <div class="cn-ios-sheet-actions"><button type="button" class="primary-btn full" data-sheet-value="yes" data-autofocus>Turn on reminders</button>
        <button type="button" class="cn-ios-link-btn" data-sheet-value="no">Not now</button></div>`
    });
    if (ok !== "yes") return false;
    if (!(await notificationsAllowed(true))) { toast("Notifications are off for CyberNet AI. You can turn them on in Settings."); return false; }
    await cancelReminders();
    const ids = reminderIds(lastCaseId);
    const notifications = REMINDER_DAYS.map((days, i) => {
      const at = new Date();
      at.setDate(at.getDate() + days);
      at.setHours(18, 0, 0, 0);
      return { id: ids[i], title: "CyberNet AI", body: "Time to check your recovery plan.", schedule: { at, allowWhileIdle: true }, extra: { open: "recovery" } };
    });
    await ln.schedule({ notifications });
    store.set("cn-ios-reminders", JSON.stringify(ids));
    toast("Reminders are on.");
    refreshReminderSwitch();
    return true;
  }
  async function cancelReminders() {
    const ln = P("LocalNotifications");
    store.del("cn-ios-reminders");
    if (!ln) return;
    try {
      const { notifications = [] } = await ln.getPending();
      if (notifications.length) await ln.cancel({ notifications: notifications.map(n => ({ id: n.id })) });
    } catch (error) { report(error, "cancel reminders"); }
  }
  async function testReminder() {
    const ln = P("LocalNotifications");
    if (!ln) { toast("Reminders work in the CyberNet AI app."); return; }
    if (!(await notificationsAllowed(true))) { toast("Notifications are off for CyberNet AI. You can turn them on in Settings."); return; }
    await ln.schedule({ notifications: [{ id: 999, title: "CyberNet AI", body: "Time to check your recovery plan.", schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, extra: { open: "recovery" } }] });
    toast("A test reminder arrives in about 5 seconds. You can leave the app to see it.");
  }
  async function refreshReminderSwitch() {
    const sw = $("#cnReminderSwitch");
    if (!sw) return;
    const ln = P("LocalNotifications");
    if (!ln) { sw.checked = false; sw.disabled = true; return; }
    try { const { notifications = [] } = await ln.getPending(); sw.checked = notifications.some(n => n.id !== 999); } catch { sw.checked = false; }
  }
  async function toggleReminders(sw) {
    sw.disabled = true;
    if (sw.checked) sw.checked = await scheduleReminders().catch(() => false);
    else { await cancelReminders(); toast("Reminders are off."); }
    sw.disabled = false;
  }
  function addReminderButton() {
    const dash = $("#recoveryDashboard") || $("#recoveryDownloadBtn")?.parentElement;
    if (!dash || $("#cnRemindBtn") || !P("LocalNotifications")) return;
    const btn = el('<button type="button" class="secondary-btn full cn-ios-remind" id="cnRemindBtn">Remind me to check my plan</button>');
    btn.addEventListener("click", () => scheduleReminders().catch(error => report(error, "reminders")));
    const anchor = $("#recoveryDownloadBtn");
    if (anchor) anchor.insertAdjacentElement("beforebegin", btn); else dash.appendChild(btn);
  }

  /* ================================================================ 13. offline, Report a problem, haptics */
  let offline = false;
  const AI_BUTTONS = ["#chatSendBtn", "#recoveryStartBtn", "#recoveryUpdateBtn"];
  function setOffline(off) {
    if (off === offline) return;
    offline = off;
    let bar = $("#cnOfflineBar");
    if (off && !bar) { bar = el('<div id="cnOfflineBar" class="cn-ios-offline" role="status">You\'re offline. Quick Scan, QR and Learn still work.</div>'); d.body.appendChild(bar); }
    if (bar) bar.hidden = !off;
    for (const sel of AI_BUTTONS) {
      const b = $(sel);
      if (!b) continue;
      if (off && !b.disabled) { b.disabled = true; b.dataset.cnOffline = "1"; b.title = "You're offline. AI explanations and Recovery need the internet."; }
      if (!off && b.dataset.cnOffline) { b.disabled = false; delete b.dataset.cnOffline; b.removeAttribute("title"); }
    }
  }
  function watchNetwork() {
    const net = P("Network");
    if (net) {
      net.getStatus().then(s => setOffline(!s.connected), () => {});
      net.addListener("networkStatusChange", s => setOffline(!s.connected));
    } else {
      setOffline(navigator.onLine === false);
      w.addEventListener("online", () => setOffline(false));
      w.addEventListener("offline", () => setOffline(true));
    }
  }

  // "Report a problem with this result" under every result (D1); the content itself is not attached.
  const RESULT_AREAS = [
    { sel: "#cyberTextResult", kind: "quick_scan" }, { sel: "#cyberLinkResult", kind: "quick_scan" }, { sel: "#cyberImageResult", kind: "quick_scan" },
    { sel: "#chatMessages", kind: "analysis_ai" }, { sel: "#recoveryDashboard", kind: "recovery" }
  ];
  function decorateResults() {
    for (const area of RESULT_AREAS) {
      const box = $(area.sel);
      if (!box) continue;
      const reports = area.kind === "analysis_ai" ? $$(".chat-bubble-ai .diagnostic-report", box) : area.kind === "recovery" ? (box.hidden ? [] : [box]) : $$(".scan-report, .diagnostic-report", box);
      for (const r of reports) {
        if (r.dataset.cnReported) continue;
        r.dataset.cnReported = "1";
        const host = area.kind === "analysis_ai" ? r.closest(".chat-bubble-inner") || r : r;
        const b = el('<button type="button" class="cn-ios-link-btn cn-ios-report-btn">Report a problem with this result</button>');
        b.addEventListener("click", () => reportProblem(area.kind, area.kind === "recovery" ? lastCaseId : ""));
        host.appendChild(b);
        const tone = /result-has-danger|verdict-headline-danger/.test(box.className + r.innerHTML.slice(0, 400)) ? "ERROR" : /uncertain/.test(box.className + r.innerHTML.slice(0, 400)) ? "WARNING" : "SUCCESS";
        if (area.kind !== "recovery") haptic(tone);
      }
    }
  }
  function reportProblem(kind, resultId) {
    sheet({
      id: "cnReportSheet",
      label: "Report a problem with this result",
      html: `<h2 class="cn-ios-sheet-title">Report a problem with this result</h2>
        <div class="cn-ios-sheet-body">
          <label for="cnReportText">What looks wrong? (optional)</label>
          <textarea id="cnReportText" maxlength="1500" rows="4" placeholder="For example: this is a real message from my bank."></textarea>
          <p class="cn-ios-note">The message or link you checked is not attached. Never include passwords, codes or card numbers.</p>
          <p class="cn-ios-sheet-error" role="alert" hidden></p>
        </div>
        <div class="cn-ios-sheet-actions"><button type="button" class="primary-btn full" data-report="send" data-autofocus>Send report</button>
        <button type="button" class="cn-ios-link-btn" data-sheet-value="close">Cancel</button></div>`,
      onOpen(panel, done) {
        panel.addEventListener("click", async e => {
          const b = e.target.closest('[data-report="send"]');
          if (!b) return;
          b.disabled = true;
          const error = panel.querySelector(".cn-ios-sheet-error");
          try {
            const res = await fetch("/api/feedback", {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
              body: JSON.stringify({ kind, resultId: resultId || undefined, comment: panel.querySelector("#cnReportText").value, category: "bug", platform: "ios", appVersion: VERSION, page: `/${activePage()}`, bot_field: "" })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Email ${SUPPORT} instead.`);
            done("sent");
            toast("Thank you. Your report reached CyberNet support.");
          } catch (err) { error.textContent = err.message || "The report could not be sent."; error.hidden = false; b.disabled = false; }
        });
      }
    });
  }

  // The "not antivirus" line on the Check screen (B2), and press feedback / tab states that the
  // website's 65-press.js gives (not in the app's UI build).
  function addCheckDisclaimer() {
    const head = $("#cybernet .feature-page-header");
    if (!head || $("#cnIosDisclaimer")) return;
    head.appendChild(el('<p class="cn-ios-disclaimer" id="cnIosDisclaimer">CyberNet AI helps you judge suspicious messages, links and QR codes. It is not antivirus software, and no scanner can promise something is 100% safe.</p>'));
  }
  function pressStates() {
    d.addEventListener("touchstart", () => {}, { passive: true });
    const groups = [[".detect-tabs", ".detect-tab", "What to scan"], [".auth-tabs", ".auth-tab", "Sign in or create an account"], [".recovery-timeline-tabs", ".recovery-timeline-tab", "Recovery timeline"]];
    for (const [g, item, name] of groups) {
      const group = $(g);
      if (!group) continue;
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", name);
      const sync = () => $$(item, group).forEach(b => b.setAttribute("aria-pressed", String(b.classList.contains("active"))));
      new MutationObserver(sync).observe(group, { attributes: true, subtree: true, attributeFilter: ["class"] });
      sync();
    }
  }
  // Larger Text: follow the iPhone's text size (Dynamic Type), within limits the layout can take.
  function dynamicType() {
    const probe = el('<span aria-hidden="true" style="position:absolute;visibility:hidden;font:-apple-system-body">x</span>');
    d.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    if (Number.isFinite(px) && px > 0) root.style.fontSize = `${Math.min(22, Math.max(16, px * (16 / 17)))}px`;
  }

  /* ================================================================ 14. tracking, analytics, lifecycle */
  async function startTracking(askIfNeeded) {
    let status = await w.CNNative?.trackingStatus?.() || "unavailable";
    if (status === "notDetermined" && askIfNeeded) status = await w.CNNative.requestTracking();
    store.set("cn-ios-tracking", status);
    if (status === "authorized") w.CNAnalytics?.start?.();
    else w.CNAnalytics?.stop?.();
    refreshTrackingRow();
    return status;
  }
  function refreshTrackingRow() {
    const out = $("#cnTrackingState");
    if (!out) return;
    const status = store.get("cn-ios-tracking") || "unavailable";
    out.textContent = status === "authorized" ? "Shared" : status === "unavailable" ? "Not available" : "Not shared";
  }
  async function nativeCleanupAfterDeletion() {
    await cancelReminders();
    try { await P("SharedInbox")?.clear(); } catch { /* ignore */ }
    try { await P("Preferences")?.clear(); } catch { /* ignore */ }
    try { await P("SecureSession")?.clear?.(); } catch { /* ignore */ }
    store.del(ACCEPTANCE_KEY);
  }

  function start() {
    try {
      buildWebTabbar();
      watchPages();
      bindAccount();
      renderAccount();
      setupSignupConsent();
      setupApple();
      addCheckDisclaimer();
      pressStates();
      dynamicType();
      watchNetwork();
      new MutationObserver(() => { clearTimeout(start.dt); start.dt = setTimeout(decorateResults, 120); }).observe($("#cnMain") || d.body, { childList: true, subtree: true });
      if (w.CN_ACCOUNT_DELETED) nativeCleanupAfterDeletion();
      later(addReminderButton, 800);
      // external links open in Safari, never inside the app (D10)
      d.addEventListener("click", e => {
        const a = e.target.closest?.("a[href]");
        if (!a || e.defaultPrevented) return;
        const href = a.getAttribute("href") || "";
        if (/^(https?:|mailto:|tel:|sms:)/i.test(href)) { e.preventDefault(); openExternal(a.href); }
      });
      const ln = P("LocalNotifications");
      ln?.addListener("localNotificationActionPerformed", ev => { if (ev?.notification?.extra?.open === "recovery") navigate("recovery"); });
      const app = P("App");
      app?.addListener("appStateChange", ({ isActive }) => {
        const auth = supabase()?.auth;
        try { if (isActive) auth?.startAutoRefresh?.(); else auth?.stopAutoRefresh?.(); } catch { /* ignore */ }
        if (isActive) { later(checkInbox, 300); startTracking(false); dynamicType(); }
      });
      const kb = P("Keyboard");
      kb?.addListener("keyboardWillShow", () => { root.classList.add("cn-kb-open"); nativeTabs?.setHidden({ hidden: true }).catch(() => {}); });
      kb?.addListener("keyboardWillHide", () => { root.classList.remove("cn-kb-open"); nativeTabs?.setHidden({ hidden: false }).catch(() => {}); });
      P("StatusBar")?.setStyle({ style: "DARK" }).catch(() => {});
      requestAnimationFrame(() => requestAnimationFrame(() => P("SplashScreen")?.hide().catch(() => {})));
      later(() => P("SplashScreen")?.hide().catch(() => {}), 3000);
      later(async () => {
        const first = !store.get(INTRO_KEY);
        if (first) await showIntro();
        await startTracking(true);
        checkInbox();
      }, 600);
    } catch (error) { report(error, "start"); }
  }

  w.CNIos = Object.freeze({ version: VERSION, openLegal, startQrScan, showQrVerdict, askConsent, showIntro, checkInbox, reportProblem, navigate });
  onReady(start);
})();
