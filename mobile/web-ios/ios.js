/* CyberNet AI iPhone app: the app layer on top of the website's scripts (BUILD-PLAN §6.6, §7).
   Loaded last (deferred, after script.js and cybernet-privacy-controls.js). Only the app loads it.

   Sections:
     1  helpers                 8  legal pages (in-app) and the sign-up acceptance record
     2  tab bar, Check switch   9  Sign in with Apple and Google
        and guest mode         10  QR scanner and its verdict sheet
     3  Account screen         11  items shared from other apps (Share Extension hand-off)
     4  AI consent sheet       12  Recovery reminders (local notifications)
     5  fetch layer            13  offline, "Report a problem", haptics, small iOS touches
     6  downloads              14  App Tracking Transparency and analytics, app lifecycle
     7  first-run intro, the sign-in card and what each launch shows

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

  // A bottom sheet (dialog). resolve(value) closes it. Escape / the backdrop / the Close button at the top right resolve(null)
  // unless sticky. 1.1 (design item 6): an iOS grabber on top and a 44 pt Close button in the header corner; sheets stack, and
  // only the top one answers Escape and Tab (bug 10: Escape used to close the sheet underneath first).
  const sheetStack = [];
  const CLOSE_X = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  // Accessibility (VoiceOver, 1.1.1): while any sheet is open the page behind it is inert and hidden from VoiceOver
  // (inertBehind, one hold per sheet), and so is every sheet under the top one; both are handed back when it closes.
  function syncSheets() {
    sheetStack.forEach((n, i) => {
      const under = i !== sheetStack.length - 1;
      n.inert = under;
      if (under) n.setAttribute("aria-hidden", "true"); else n.removeAttribute("aria-hidden");
    });
    // the native tab bar stays on screen over a sheet, but VoiceOver must not swipe out of the sheet onto it
    const vo = sheetStack.length > 0;
    if (vo !== tabsVoHidden) { tabsVoHidden = vo; try { nativeTabs?.setAccessibilityHidden?.({ hidden: vo })?.catch?.(() => {}); } catch { /* older shell */ } }
  }
  let tabsVoHidden = false;
  function sheet({ id, label, html, sticky = false, onOpen }) {
    return new Promise(resolve => {
      const old = $(`#${id}`);
      if (old?.cnClose) old.cnClose(null); // the same sheet again: the old one is closed properly (its hold and its promise)
      old?.remove();
      const back = d.activeElement;
      // a sticky sheet (the launch card, a step that must be answered) has neither: it cannot be dismissed
      const chrome = sticky ? "" : `<div class="cn-ios-sheet-grab" aria-hidden="true"></div><button type="button" class="cn-ios-sheet-x" data-sheet-dismiss aria-label="Close">${CLOSE_X}</button>`;
      const node = el(`<div class="cn-ios-sheet-backdrop" id="${id}"><div class="cn-ios-sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${chrome}${html}</div></div>`);
      const panel = node.firstElementChild;
      sheetStack.push(node);
      syncSheets();
      inertBehind(true);
      let closed = false;
      const done = value => {
        if (closed) return; // once: a second call must not hand back another sheet's hold
        closed = true;
        node.cnClose = null;
        const at = sheetStack.indexOf(node);
        if (at >= 0) sheetStack.splice(at, 1);
        syncSheets();
        inertBehind(false); // before focus goes back: what had it is reachable again
        d.removeEventListener("keydown", onKey, true);
        node.classList.remove("is-open");
        node.setAttribute("aria-hidden", "true");
        node.inert = true;
        later(() => node.remove(), 220);
        // back to what had focus, or (gone, hidden, or nothing had it) the open sheet underneath or the page's heading
        try {
          const under = sheetStack[sheetStack.length - 1];
          if (back && back !== d.body && back.isConnected) back.focus({ preventScroll: true });
          else if (under) under.firstElementChild.focus({ preventScroll: true });
          else focusBack(null);
        } catch { /* ignore */ }
        resolve(value);
      };
      node.cnClose = done;
      const onKey = e => {
        if (sheetStack[sheetStack.length - 1] !== node) return; // a sheet above this one answers first
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
        if (e.target.closest?.("[data-sheet-dismiss]") && !sticky) { done(null); return; }
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

  // APP-3 (security audit Nov 2026): only web, mail, phone and SMS links and
  // the app's own Settings page leave the app; any other scheme (shortcuts:,
  // itms-services:, another app's scheme) is refused, so a crafted link or an
  // injected call to window.CNOpenExternal cannot launch another app.
  const EXTERNAL_SCHEMES = new Set(["https:", "http:", "mailto:", "tel:", "sms:"]);
  function externalAllowed(url) {
    const value = String(url || "").trim();
    if (value === "app-settings:") return true;
    try { return EXTERNAL_SCHEMES.has(new URL(value).protocol.toLowerCase()); } catch { return false; }
  }
  async function openExternal(url) {
    if (!externalAllowed(url)) { report(new Error("Refused to open a link with an unsupported scheme"), "openExternal"); return; }
    const launcher = P("AppLauncher");
    try {
      if (launcher) { await launcher.openUrl({ url }); return; }
    } catch (error) { report(error, "openUrl"); }
    w.open(url, "_blank", "noopener");
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied."); haptic("SUCCESS"); return; } catch { /* fall back */ }
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
  // A light tick when a selection changes (the Check switch); like haptic(), a no-op without the plugin.
  function tick() {
    try { P("Haptics")?.impact({ style: "LIGHT" })?.catch?.(() => {}); } catch { /* ignore */ }
  }

  /* ================================================================ 2. navigation / tab bar */
  // Native UITabBar (CNTabBar plugin, BUILD-PLAN §6.6) or, without it, a web tab bar with the same tabs.
  const TABS = [
    { id: "home", page: "home", label: "Home", icon: '<path d="M4 10.8 12 4l8 6.8V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>' },
    { id: "check", page: "cybernet", label: "Check", icon: '<path d="M12 2.8 20 6v5.8c0 4.7-3.1 7.7-8 9.4-4.9-1.7-8-4.7-8-9.4V6l8-3.2Z"/><path d="m8.6 12 2.3 2.3 4.6-4.7"/>' },
    { id: "scan", page: null, label: "Scan QR", icon: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13v3"/>' },
    { id: "recovery", page: "recovery", label: "Recovery", icon: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/>' },
    { id: "learn", page: "learn", label: "Learn", icon: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>' },
    { id: "account", page: "account", label: "Account", icon: '<circle cx="12" cy="9" r="3.6"/><path d="M5.5 19.2c1.3-3 3.7-4.4 6.5-4.4s5.2 1.4 6.5 4.4"/><circle cx="12" cy="12" r="9"/>' }
  ];
  const PAGE_TAB = { home: "home", cybernet: "check", cybernetai: "check", recovery: "recovery", learn: "learn", account: "account" };
  const PAGE_NAMES = { home: "Home", cybernet: "Check", cybernetai: "Analysis AI", recovery: "Recovery", learn: "Learn", account: "Account" };
  const nativeTabs = P("CNTabBar");

  let modeWanted = null; // the Check switch's pending tap (see openCheckPage)
  let lastCheckPage = "cybernet"; // which of the Check tab's two pages was open last (syncTabs)
  let lastPageViewed = "";        // the page syncTabs() last counted for analytics

  // Guest mode (owner, 30 Oct 2026): Quick Scan, QR, Share results and Learn work without an account
  // (App Review 5.1.1(v)); these pages need one. A guest who asks for either gets the sign-in card at once,
  // before anything is typed (section 7c); cancelling leaves them where they were.
  const ACCOUNT_PAGES = { cybernetai: "Analysis AI", recovery: "Recovery" };
  const needsAccount = page => Object.prototype.hasOwnProperty.call(ACCOUNT_PAGES, page) && !signedIn();
  // Called once the card ended in a sign-in: opens the page that was asked for (Analysis AI with its message box focused).
  function arrive(page) {
    if (page === "cybernetai") {
      pickCheckMode(page);
      later(() => { try { $("#chatInput")?.focus({ preventScroll: true }); } catch { /* ignore */ } }, 450);
    } else navigate(page);
  }
  // true when the card was opened (the caller stops); false when the person is signed in (the caller goes on).
  // `then` replaces arrive() when something else should happen after sign-in (a shared item for Analysis AI);
  // `from` is where to go back to if the page had already changed when the guest was noticed.
  function requireAccount(page, then = null, from = "") {
    if (signedIn()) return false;
    if (cardOpen) return true;
    syncTabs(); // the native bar already highlights the tab that was tapped: put the highlight back where the page is
    signInCard({ page }).then(choice => {
      if (choice === "signed-in") { if (then) then(); else arrive(page); }
      else if (from) navigate(from);
    }).catch(error => report(error, "sign-in card"));
    return true;
  }

  // A reminder that starts the app asks for Recovery before script.js has recorded the Keychain session, when signedIn() is
  // still false for a signed-in person. The session is asked first so the card opens only for a guest: for someone signed
  // in, the page opens as soon as script.js has recorded the session (a few milliseconds; 1.5 s at most).
  async function openRecoveryFromReminder() {
    if (needsAccount("recovery") && (await sessionKnown(600)) === true) {
      for (let i = 0; i < 30 && !signedIn(); i++) await new Promise(resolve => setTimeout(resolve, 50));
    }
    navigate("recovery");
  }

  function navigate(page) {
    if (needsAccount(page)) { requireAccount(page); return; }
    modeWanted = null; // any other navigation overrides a pending switch tap
    if (w.CyberNetNav?.switchPage) { w.CyberNetNav.switchPage(page); return; }
    $(`.nav-tabs .nav-link[data-page="${page}"]`)?.click();
  }
  function scrollToTop() { w.scrollTo({ top: 0, behavior: motionOff() ? "auto" : "smooth" }); }
  // Tab bar (owner, 21 Nov 2026): every tab opens at its top, at once (ios.css turns the website's smooth scrolling off,
  // so the page swap never glides). Tapping the open tab again scrolls it to the top. tabScroll is kept for diagnostics only.
  const tabScroll = {};
  let tabReturn = null; // { tab, until }: the tab tap whose page swap should open that tab at its top
  function rememberScroll() { tabScroll[PAGE_TAB[activePage()] || "check"] = w.scrollY || 0; }
  function restoreScroll(page) {
    const tab = PAGE_TAB[page];
    if (!tabReturn || tabReturn.tab !== tab || Date.now() > tabReturn.until) { tabReturn = null; return; }
    tabReturn = null;
    // Owner, 21 Nov 2026: "whenever you click home, it takes you to the top of the homepage; check, the top of check".
    // A tab always opens at its top (the website's pages share one scroll, so without this a tab opened where the
    // last page was left).
    w.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => w.scrollTo({ top: 0, behavior: "auto" }));
  }
  function goTab(id) {
    const tab = TABS.find(t => t.id === id);
    if (!tab) return;
    if (id === "scan") { openScan(); return; }
    const here = PAGE_TAB[activePage()];
    if (here === id) { scrollToTop(); return; } // the open tab again: to the top (Check keeps Quick Scan or Analysis AI)
    rememberScroll();
    tabReturn = { tab: id, until: Date.now() + 1500 };
    if (id === "check") { navigate(lastCheckPage); return; } // back to the page the Check tab was left on
    navigate(tab.page);
  }
  // 1.1 bug 8: the website's in-page buttons (data-page) switch pages directly, so a guest saw Analysis AI or Recovery
  // behind the sign-in card and was sent back on "Not now". A guest's tap on one is caught before script.js sees it:
  // the card comes first and the page stays where it is, as with the tab bar.
  function guardAccountLinks() {
    d.addEventListener("click", e => {
      const b = e.target.closest?.("[data-page]");
      if (!b || b.closest("#cnIosTabbar, #cnIosSeg")) return;
      const page = b.getAttribute("data-page");
      if (!needsAccount(page)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      requireAccount(page);
    }, true);
  }
  function activePage() { return $(".page.active-page")?.id || "cybernet"; }
  // Focus goes back to `node` when it is still on screen and reachable, else to the open page's heading (so VoiceOver and
  // the keyboard never land on the page's body after a sheet or the guide closes).
  function focusBack(node) {
    try {
      const ok = n => n && n.isConnected && !n.closest("[inert]") && n.offsetParent !== null;
      if (ok(node)) { node.focus({ preventScroll: true }); if (d.activeElement === node) return; }
      if (d.activeElement && d.activeElement !== d.body && ok(d.activeElement)) return;
      const page = $(".page.active-page");
      const head = page && $("h1, h2", page);
      if (!ok(head)) return;
      if (!head.hasAttribute("tabindex")) head.setAttribute("tabindex", "-1");
      head.focus({ preventScroll: true });
    } catch { /* ignore */ }
  }

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
    if (isCheckPage(page)) lastCheckPage = page;
    d.documentElement.classList.toggle("cn-ios-on-home", page === "home"); // the social links show on Home only
    $$("#cnIosTabbar [data-ios-tab]").forEach(b => {
      const on = b.getAttribute("data-ios-tab") === tab;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    nativeTabs?.select({ tab }).catch(() => {});
    syncCheckSwitch(page);
    // a page view is counted when the page changes: syncTabs() is also called to put the highlight back (QR scanner, sign-in card)
    if (w.CNAnalytics?.page && page !== lastPageViewed) { lastPageViewed = page; w.CNAnalytics.page(page, PAGE_NAMES[page] || page); }
  }
  function watchPages() {
    let last = activePage();
    const mo = new MutationObserver(() => {
      const now = activePage();
      if (now === last) return;
      const from = last;
      last = now;
      syncTabs();
      restoreScroll(now);
      // Safety net: the tab bar and the Check switch ask before they navigate, but the website's own in-page
      // buttons (data-page) switch pages directly. A guest who lands on a page that needs an account gets the
      // card; cancelling goes back to where they came from.
      if (needsAccount(now)) requireAccount(now, null, needsAccount(from) ? "cybernet" : from);
      if (now === "account") renderAccount();
      if (now === "recovery") later(addReminderButton, 400);
      // the ratings prompt: never after Recovery; Home, Learn and Account are calm moments
      if (now === "recovery" || from === "recovery") reviewMoment.recoveryAt = Date.now();
      else if (REVIEW_CALM_PAGES.includes(now)) later(() => maybeAskReview(now), 700);
    });
    $$(".page").forEach(p => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
    syncTabs();
  }

  // The Check tab holds two pages: Quick Scan ("cybernet", on the iPhone) and Analysis AI ("cybernetai").
  // A segmented control (UISegmentedControl look) switches between them. It sits above the pages, not
  // inside them, so its thumb slides while the page below swaps; syncTabs() repaints it after every
  // navigation (tab bar, share hand-off, deep link), so it always shows the page that is open.
  // Analysis AI needs an account: a guest tapping its segment gets the sign-in card (requireAccount), so the
  // guest's hint says so; a signed-in person only reads what it does.
  const CHECK_MODES = [
    { page: "cybernet", label: "Quick Scan", hint: "Checks on your iPhone. No account, no AI." },
    { page: "cybernetai", label: "Analysis AI", hint: "AI explains it in detail.", guestHint: "Sign in to use Analysis AI." }
  ];
  const hintOf = (mode, member) => (!member && mode.guestHint) || mode.hint;
  const isCheckPage = page => CHECK_MODES.some(m => m.page === page);
  function buildCheckSwitch() {
    const main = $("#cnMain");
    if (!main || $("#cnIosSeg")) return;
    const wrap = el(`<div class="cn-ios-seg-wrap" id="cnIosSegWrap" hidden>
      <div class="cn-ios-seg" id="cnIosSeg" role="tablist" aria-label="Check mode" data-active="${CHECK_MODES[0].page}">
        <span class="cn-ios-seg-thumb" aria-hidden="true"></span>${CHECK_MODES.map((m, i) => `
        <button type="button" role="tab" class="cn-ios-seg-btn" id="cnIosSegTab${i}" data-seg-page="${m.page}" aria-selected="false" aria-controls="${m.page}" aria-describedby="cnIosSegHint${i}" tabindex="-1">${esc(m.label)}</button>`).join("")}
      </div>
      <p class="cn-ios-seg-hint">${CHECK_MODES.map((m, i) => `<span id="cnIosSegHint${i}" data-seg-hint="${m.page}" hidden>${esc(m.hint)}</span>`).join(" ")}</p>
    </div>`);
    CHECK_MODES.forEach((m, i) => {
      const panel = $(`#${m.page}`);
      panel?.setAttribute("role", "tabpanel");
      panel?.setAttribute("aria-labelledby", `cnIosSegTab${i}`);
    });
    const seg = $("#cnIosSeg", wrap);
    wrap.addEventListener("click", e => {
      const b = e.target.closest?.("[data-seg-page]");
      if (b) pickCheckMode(b.getAttribute("data-seg-page"));
    });
    // arrow keys move the selection (and focus) like a native segmented control; Home / End jump to the ends
    seg.addEventListener("keydown", e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const at = CHECK_MODES.findIndex(m => m.page === seg.dataset.active);
      const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: CHECK_MODES.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      pickCheckMode(CHECK_MODES[(to + CHECK_MODES.length) % CHECK_MODES.length].page, true);
    });
    main.before(wrap);
  }
  function paintCheckSwitch(page) {
    const seg = $("#cnIosSeg");
    if (!seg) return;
    seg.dataset.active = page;
    $$("[data-seg-page]", seg).forEach(b => {
      const on = b.getAttribute("data-seg-page") === page;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    // The hint of the open page shows. A guest also reads, on the same line, which part needs an account.
    const member = signedIn();
    $$("[data-seg-hint]", seg.parentNode).forEach(s => {
      const mode = CHECK_MODES.find(m => m.page === s.getAttribute("data-seg-hint"));
      if (!mode) return;
      s.textContent = hintOf(mode, member);
      s.hidden = !(mode.page === page || (!member && mode.guestHint));
    });
  }
  // Called from syncTabs(): shown on both Check pages, hidden on every other tab.
  function syncCheckSwitch(page) {
    const wrap = $("#cnIosSegWrap");
    if (!wrap) return;
    const on = isCheckPage(page);
    wrap.hidden = !on;
    if (on) paintCheckSwitch(modeWanted && isCheckPage(modeWanted) ? modeWanted : page); // a tap in flight keeps the thumb where it was sent
  }
  function pickCheckMode(page, focusTab = false) {
    const seg = $("#cnIosSeg");
    if (!seg || !isCheckPage(page)) return;
    if (needsAccount(page)) { requireAccount(page); return; } // a guest: the card first, before the thumb or the focus moves
    if (focusTab) $(`[data-seg-page="${page}"]`, seg)?.focus({ preventScroll: true });
    if (seg.dataset.active === page && activePage() === page) return;
    if (seg.dataset.active !== page) tick();
    paintCheckSwitch(page); // the thumb moves at once; the page follows in switchPage's 300 ms swap
    openCheckPage(page, 0);
  }
  function openCheckPage(page, tries) {
    if (activePage() !== page) navigate(page);
    modeWanted = page; // after navigate(), which clears it
    // switchPage() ignores a request made while the previous swap is still running (a quick second tap):
    // ask again once it has settled, then show whichever page really is open.
    later(() => {
      if (modeWanted !== page) return;
      if (activePage() !== page && tries < 2) { openCheckPage(page, tries + 1); return; }
      modeWanted = null;
      syncCheckSwitch(activePage());
    }, 380);
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
  // Apple's hidden-email relays: Sign in with Apple's (privaterelay.appleid.com) and iCloud's Hide My Email (private.icloud.com)
  const APPLE_RELAY = /@(?:privaterelay\.appleid|private\.icloud)\.com$/i;
  function userEmailLabel(user) {
    const email = String(user?.email || "").trim();
    if (APPLE_RELAY.test(email)) return "Apple ID (hidden email)";
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
  // App 1.1.1 (Sign in with Apple name): the profile is created before the app has Apple's name, so the saved name can be only a
  // fallback ("", "User" or the email's first part, which for Hide My Email is a random code). Then the account's own name
  // (user_metadata full_name, name, or first + last) is shown instead; the server repairs the saved one on the next account-status
  // call (netlify/lib/supabase.mjs betterProfileName, same rules). A name the person set is always shown as it is. "" = no name anywhere.
  function accountName(saved, user) {
    const tidy = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const meta = user?.user_metadata || {};
    const real = tidy(meta.full_name || meta.name || [meta.first_name, meta.last_name].filter(Boolean).join(" "));
    const now = tidy(saved);
    const local = String(user?.email || "").split("@")[0].trim().toLowerCase();
    const isFallback = value => !value || value.toLowerCase() === "user" || (!!local && value.toLowerCase() === local);
    if (!isFallback(now)) return now;
    return isFallback(real) ? "" : real;
  }
  // After a name was saved to the account: the in-flight account-status request may have left before the save, so it is awaited
  // and a fresh one follows; that one lets the server repair the profile name, then the Account tab is drawn again.
  async function refreshAccountName(updatedUser) {
    const s = state();
    if (s && updatedUser?.id && updatedUser.id === s.user?.id) s.user = updatedUser;
    const refresh = account()?.refreshAccountStatus;
    if (typeof refresh === "function") {
      try { await refresh(); } catch { /* the second call reports */ }
      try { await refresh(); } catch (error) { report(error, "account name refresh"); }
    }
    renderAccount();
  }
  const NAME_MAX = 60;
  function showNameSheet() {
    return sheet({
      id: "cnNameSheet",
      label: "Add your name",
      html: `<h2 class="cn-ios-sheet-title">Add your name</h2>
        <div class="cn-ios-sheet-body">
          <p>It is shown on your account, here and on the website.</p>
          <label for="cnNameFirst">First name</label>
          <input type="text" id="cnNameFirst" autocomplete="given-name" autocapitalize="words" maxlength="${NAME_MAX}" data-autofocus>
          <label for="cnNameLast">Last name</label>
          <input type="text" id="cnNameLast" autocomplete="family-name" autocapitalize="words" maxlength="${NAME_MAX}">
          <p class="cn-ios-sheet-error" role="alert" hidden></p>
        </div>
        <div class="cn-ios-sheet-actions"><button type="button" class="primary-btn full" data-name="save">Save</button>
        <button type="button" class="cn-ios-link-btn" data-sheet-value="close">Cancel</button></div>`,
      onOpen(panel, done) {
        const error = panel.querySelector(".cn-ios-sheet-error");
        const say = text => { error.textContent = text; error.hidden = !text; };
        panel.addEventListener("click", async e => {
          const b = e.target.closest('[data-name="save"]');
          if (!b || b.disabled) return;
          const first = panel.querySelector("#cnNameFirst").value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
          const last = panel.querySelector("#cnNameLast").value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
          if (!first && !last) { say("Type your first name, your last name or both."); return; }
          if (offline) { say("You're offline. Connect to the internet to save your name."); return; }
          const sb = supabase();
          if (!sb) { say("Your name can't be saved right now. Please try again."); return; }
          b.disabled = true;
          say("");
          try {
            const { data, error: failed } = await sb.auth.updateUser({ data: { full_name: `${first} ${last}`.trim(), first_name: first, last_name: last } });
            if (failed) throw failed;
            done("saved");
            toast("Your name is saved.");
            refreshAccountName(data?.user).catch(err => report(err, "account name refresh"));
          } catch (err) {
            report(err, "save name");
            say(err instanceof TypeError ? "You're offline. Connect to the internet to save your name." : "Your name couldn't be saved. Please try again.");
            b.disabled = false;
          }
        });
      }
    });
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
      const name = accountName(s?.profile?.fullName, user);
      $("#cnAcctName").textContent = name || "Your account";
      const addName = $("#cnAcctAddName");
      if (addName) addName.hidden = !!name || !s?.accountReady; // only once the account has answered, so it never flashes
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

  // Account > Help: the Share sheet entry for CyberNet AI is off until the person turns it on (the welcome tips say so too).
  function showShareHelp() {
    sheet({
      id: "cnShareHelp",
      label: "Turn on Share to CyberNet AI",
      html: `<h2 class="cn-ios-sheet-title">Turn on Share to CyberNet AI</h2>
        <div class="cn-ios-sheet-body">
          <ol class="cn-ios-steps">
            <li>In Safari, Mail, Photos or another app, tap Share.</li>
            <li>Scroll the row of apps to the end and tap More.</li>
            <li>Turn on CyberNet AI.</li>
          </ol>
          <p>For a text message, copy it and paste it into Check.</p>
        </div>
        <div class="cn-ios-sheet-actions"><button type="button" class="primary-btn full" data-sheet-value="done" data-autofocus>Done</button></div>`
    });
  }

  function bindAccount() {
    const page = $("#account");
    if (!page) return;
    page.addEventListener("click", async e => {
      const t = e.target.closest?.("[data-ios-action]");
      if (!t) return;
      const action = t.getAttribute("data-ios-action");
      try {
        if (action === "sign-out") await signOut();
        else if (action === "export") w.CNPrivacy?.exportData?.();
        else if (action === "clear") w.CNPrivacy?.openClear?.();
        else if (action === "delete") w.CNPrivacy?.openDelete?.();
        else if (action === "support") account()?.openFeedbackModal?.();
        else if (action === "copy-support") copyText(SUPPORT);
        else if (action === "legal") openLegal(t.getAttribute("data-doc") || "privacy");
        else if (action === "intro") showIntro(true);
        else if (action === "share-help") showShareHelp();
        else if (action === "test-reminder") testReminder();
        else if (action === "tracking-settings") openExternal("app-settings:");
        else if (action === "rate") rateApp();
        else if (action === "add-name") showNameSheet();
      } catch (error) { report(error, `account ${action}`); toast("Something went wrong. Please try again."); }
    });
    $("#cnAiConsentSwitch")?.addEventListener("change", e => toggleConsent(e.target));
    $("#cnReminderSwitch")?.addEventListener("change", e => toggleReminders(e.target));
    $$("[data-ios-version]").forEach(n => { n.textContent = VERSION; });
    // A guest sees the same three ways in as on the sign-in card (section 7c).
    const entry = $("#cnAcctSignIn");
    if (entry) { entry.innerHTML = signInChoicesHtml("cnAcct"); wireSignIn(entry); }
    let lastUser = null;
    w.addEventListener("cybernet:session", e => {
      const user = e.detail?.userId || null;
      if (user !== consent.userId) consent.forget();
      renderAccount();
      syncCheckSwitch(activePage()); // the Analysis AI hint follows the account
      if (user) signedInNow();
      // the session ended while a page that needs an account was open (an expired refresh token): the card, then Check
      else if (needsAccount(activePage())) requireAccount(activePage(), null, "cybernet");
      if (user) later(flushAcceptance, 50);
      else if (lastUser) later(cancelReminders, 0); // signed out on this device: the reminders go too
      if (user) store.del(GUEST_KEY); // an account is signed in: there is no guest choice left to remember (a later sign-out meets the short gate again)
      lastUser = user;
    });
    w.addEventListener("cybernet:account-ui", () => { if (activePage() === "account") renderAccount(); });
  }

  // APP-6 (security audit Nov 2026): signing out always ends the session on
  // this iPhone, even offline (supabase-js keeps the stored session when the
  // logout request fails, so the local scope is used then), and also clears the
  // Keychain copy and anything shared into the app, so the next person to sign
  // in on this phone is not offered the previous person's items.
  async function signOut() {
    await cancelReminders();
    const sb = supabase();
    try {
      const result = await sb?.auth.signOut();
      if (result?.error) {
        try { await sb.auth.signOut({ scope: "local" }); } catch (error) { report(error, "signOutLocal"); }
      }
    } catch (error) {
      report(error, "signOut");
      try { await sb?.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
    }
    try { await P("SecureSession")?.clear?.(); } catch { /* ignore */ }
    try { await P("SharedInbox")?.clear?.(); } catch { /* ignore */ }
    try { await P("Preferences")?.clear(); } catch { /* ignore */ }
    try { store.del(ACCEPTANCE_KEY); } catch { /* ignore */ }
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
      const trigger = d.activeElement; // 1.1.1: focus goes back here after the daily limit sheet
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
      if (res.status === 429) noteLimitReply(url, res, trigger);
      return res;
    }
    if (method === "GET" && /^\/api\/account-status(?:[?#]|$)/.test(url)) {
      // script.js keeps appState.recoveryUsage as { used, limit } but only fills it from Recovery replies.
      // The app's account-status (App tier) sends today's Recovery counts too, so copy them before
      // script.js reads the reply; the Account screen and the Recovery meter then show them at once.
      const res = await appFetch(input, init);
      if (res.ok) {
        try {
          const data = await res.clone().json();
          const r = data?.recoveryUsage;
          const s = state();
          if (s && r && Number(r.casesLimit) > 0) s.recoveryUsage = { used: Number(r.casesUsed) || 0, limit: Number(r.casesLimit) };
          /*@iap*/
          // App 1.1 (in-app purchase builds): script.js keeps a fixed list of profile fields, so the app plan and the billing
          // facts are copied here for ios/store.js. They name the account they belong to (billing.appAccountToken = the user id),
          // and store.js uses them only while that account is the one signed in.
          if (s) {
            const p = data?.profile || {};
            s.cnBilling = { uid: String(p.billing?.appAccountToken || s.user?.id || "").toLowerCase(), appPlan: p.appPlan === "pro" ? "pro" : "free", billing: p.billing || null, at: Date.now() };
          }
          /*@end-iap*/
        } catch { /* not JSON: script.js reports it */ }
      }
      return res;
    }
    if (method === "POST" && /^\/api\/privacy-data(?:[?#]|$)/.test(url)) {
      const next = await withAppleCode(init);
      if (next !== init) next.signal = freshSignal(30000); // the 30 s limit starts after Apple's sheet, however long it took
      init = next;
      const res = await appFetch(input, init);
      await noteAppleLeftover(init, res);
      return res;
    }
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
      // APP-4 (security audit Nov 2026): a nonce here too, like sign-in, so no
      // call of the native plugin produces an ID token without replay binding
      // (only the authorization code is used for the revocation).
      const res = await apple.signIn({ scopes: [], nonce: await sha256Hex(randomNonce()) });
      const code = res?.authorizationCode || res?.response?.authorizationCode || "";
      if (code) body.appleAuthorizationCode = code;
    } catch (error) { report(error, "apple code for deletion"); /* deletion goes ahead; revocation is best effort */ }
    return { ...init, body: JSON.stringify(body) };
  }
  // After a deletion the server says whether Apple took the app's access back (appleTokensRevoked: true, false, or null for an
  // account without Sign in with Apple). On false the person has one step left in Settings. The page reloads at once after a
  // deletion, so the notice is carried over in storage and shown once the launch is over (appleLeftoverDue, showAppleLeftover).
  const APPLE_LEFT_KEY = "cn-ios-apple-leftover";
  const APPLE_LEFT_TEXT = "To finish, open Settings, tap your name, then Sign in with Apple. Choose CyberNet AI and tap Delete (on older iOS: Stop Using Apple Account).";
  async function noteAppleLeftover(init, res) {
    try {
      if (!res.ok || JSON.parse(init?.body || "{}")?.action !== "delete-account") return;
      if ((await res.clone().json())?.appleTokensRevoked === false) store.set(APPLE_LEFT_KEY, String(Date.now()));
    } catch { /* the deletion itself is never held up by this */ }
  }
  // Read once at start, whatever the answer (the mark never outlives a launch): true only on the launch that follows a deletion.
  function appleLeftoverDue() {
    const at = Number(store.get(APPLE_LEFT_KEY));
    store.del(APPLE_LEFT_KEY);
    const age = Date.now() - at;
    return !!w.CN_ACCOUNT_DELETED && Number.isFinite(age) && age >= 0 && age < 10 * 60e3;
  }
  function showAppleLeftover() {
    return sheet({
      id: "cnAppleLeftover",
      label: "Finish disconnecting Apple",
      html: `<h2 class="cn-ios-sheet-title">Finish disconnecting Apple</h2>
        <div class="cn-ios-sheet-body"><p>${esc(APPLE_LEFT_TEXT)}</p></div>
        <div class="cn-ios-sheet-actions"><button type="button" class="primary-btn full" data-sheet-value="ok" data-autofocus>OK</button></div>`
    });
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
  // APP-9 (security audit Nov 2026): one plain file name (no folders, no
  // "..", so nothing is written outside Caches), and the temporary copy is
  // deleted once the share sheet closes (saved, shared or cancelled). Saving
  // to Files copies the file before share() resolves.
  function safeFileName(name) {
    const base = String(name || "").split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "").slice(0, 120);
    return base || "cybernet-export";
  }
  async function shareFile(blobPromise, filename) {
    const fs = P("Filesystem"), share = P("Share");
    const path = safeFileName(filename);
    let written = null;
    try {
      const blob = await blobPromise;
      if (!fs || !share) { toast("Saving files works in the CyberNet AI app."); return; }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      written = await fs.writeFile({ path, data, directory: "CACHE", recursive: true });
      await share.share({ title: path, url: written.uri, dialogTitle: "Save or share" });
    } catch (error) {
      if (/cancel/i.test(String(error?.message || error))) return;
      report(error, "shareFile");
      toast("The file could not be saved. Please try again.");
    } finally {
      if (written && fs) {
        try { await fs.deleteFile({ path, directory: "CACHE" }); } catch { /* already gone */ }
      }
    }
  }

  /* ================================================================ 7. first-run intro and sign-in gate */
  // Four parts. 7a: the motion intro on a first launch (and when "Show the welcome tips again" replays it):
  // the website's sign-in gate in the app's words, one move at a time. 7b: the three steps, a bottom sheet
  // that rises over the same stage. 7c: the sign-in card, the website's gate card in the app: Sign in with
  // Apple, email, Create account, and a small "Continue without an account". 7d: what each launch shows.
  //
  // Owner, 30 Oct 2026: the app opens like the website, with the motion and then a sign-in card, so people
  // sign in before they use it. Apple guideline 5.1.1(v) forbids forcing a sign-in for features that are not
  // account-based, so the card always has the guest way out, and that way out unlocks exactly the on-device
  // features (Quick Scan, QR, Share results, Learn). Analysis AI and Recovery need an account.
  const INTRO_KEY = "cn-ios-intro-1";
  // Guideline 5.1.1(v): someone who chose "Continue without an account" is not asked again at every launch. The time of the choice
  // is kept, and for 7 days the short gate is skipped (7d). Signing in clears it. Analysis AI and Recovery still ask first, and
  // Account still has the sign-in choices.
  const GUEST_KEY = "cn-ios-guest-1";
  const GUEST_MEMORY = 7 * 24 * 3600e3;
  function guestRemembered() {
    const age = Date.now() - Number(store.get(GUEST_KEY)); // no key: Number(null) is 0, an age of 56 years
    return Number.isFinite(age) && age >= 0 && age < GUEST_MEMORY;
  }
  // 1.1 onboarding (owner, 21 Nov 2026: "proper instructions and logo"): a welcome page with the app's mark, one page per
  // feature with a small picture and numbered steps, then what an account adds. INTRO is the feature pages (a test runs it
  // on its own, so it stays a plain literal); the pictures are in INTRO_ART, keyed by id.
  const INTRO = [
    // `guest` is added for someone who is not signed in: it would read oddly right after the sign-in card
    { id: "check", title: "Check a text or link", text: "CyberNet AI reads it on your iPhone and shows the warning signs.", guest: " No account needed.",
      steps: ["Copy the message or link.", "Open Check and paste it into the box.", "Tap Start the analysis."] },
    { id: "qr", title: "Scan a QR code before you open it", text: "See where a code really goes. Nothing opens until you choose.",
      steps: ["Tap Scan QR in the tab bar.", "Point the camera at the code, or choose a photo of it.", "Read where it goes, then decide."] },
    { id: "share", title: "Share to CyberNet AI", text: "Send a page, a link or a photo from the app you're in.",
      steps: ["In Safari or Photos, tap Share.", "Choose CyberNet AI.", "Don't see it? Scroll the row to More and turn on CyberNet AI."],
      tip: "For a text message, copy it and paste it into Check." }
  ];
  const INTRO_WELCOME = { title: "Welcome to CyberNet AI", text: "Spot the warning signs of a scam in messages, links and QR codes, before you tap." };
  const INTRO_ACCOUNT = {
    title: "Analysis AI and Recovery",
    text: "Analysis AI explains the warning signs in plain words. Recovery gives you a plan, step by step, if something already went wrong.",
    guest: "Both need a CyberNet AI account. You can sign in from Account at any time.",
    member: "You're signed in, so both are ready."
  };

  /* ---- 7a. the motion intro ---- */
  // The website's sign-in gate intro, the same markup, the same rules and the same clock (owner, 10 Nov 2026: "the loading
  // screen identical to the website"): public/index.html #cnGateStage, ui-src/css/63-gate.css, mobile/web-ios/ios.css (.cn-ix).
  // The launch screen (native/brand/splash.svg) is the plain ground, like the website's first frame, so it hands over without
  // a jump. Then the shield draws itself, the padlock arrives open, CyberNet AI rises letter by letter, the shackle shuts with
  // one firm tap (the haptic, at the moment it seats), "Stay protected. All in one place." rises word by word, is read and
  // fades, the mark and wordmark glide up and smaller, and the sheet (the card, or the steps) rises over the stage. A later
  // launch is short: signed out, the mark at rest and the card within half a second; signed in (or a guest's recent choice),
  // the mark fades in and the stage opens onto the app. A skip, reduced motion and Pause motion show the end frame.
  // The mark: the website's shield and padlock (index.html, the stage's first child), the shackle shut at rest.
  const IX_MARK = "<svg viewBox=\"0 0 24 26\" fill=\"none\"><path class=\"cn-gate-shield\" pathLength=\"1\" d=\"M12 24 L4 15 L3 6 L12 2 L21 6 L20 15 Z\" stroke=\"#22D3EE\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><g class=\"cn-gate-lock\"><path class=\"cn-gate-shackle\" d=\"M9.6 12.5v-2.3a2.4 2.4 0 0 1 4.8 0v2.3\" stroke=\"#22D3EE\" stroke-width=\"1.3\" stroke-linecap=\"round\"/><path class=\"cn-gate-body\" d=\"M9.5 12.5H14.5A1.2 1.2 0 0 1 15.7 13.7V17.5A1.2 1.2 0 0 1 14.5 18.7H9.5A1.2 1.2 0 0 1 8.3 17.5V13.7A1.2 1.2 0 0 1 9.5 12.5ZM11.5 16.066A1 1 0 1 1 12.5 16.066V17.3A.5 .5 0 0 1 11.5 17.3Z\" fill=\"#22D3EE\" fill-rule=\"evenodd\"/></g></svg>";
  const IX_PITCH = { lines: ["Stay protected.", "All in one place."] };
  // Beats in ms from the stage's first frame (63-gate.css runs the shield, the lock and the letters on the same clock; the
  // website's controller has these numbers: 2650 said, 2100 read, 650 leaving, GLIDE 1200, the card at GLIDE - 350).
  const IX = {
    click: 2380,   // the shackle seats (the body gives at 2.33 s, the light flares at 2.38 s): one firm tap
    said: 2650,    // the quote rises, word by word
    read: 2100,    // how long it is read before it fades up and away
    leaving: 650,  // the fade, then the glide
    glide: 1200,   // the mark and wordmark glide up and smaller (--cn-gate-glide)
    quick: 420,    // the short gate: the card rises after this
    open: 900,     // a later launch that goes straight to the app: the mark fades in (0.4 s), is held, then the stage opens
    steps: 2650 + 2100 + 650 + 1200 - 350, // the sheet rises as the glide eases out (said + read + leaving + glide - 350)
    calm: 1100     // reduced motion: how long the end frame is shown
  };
  // prefers-reduced-motion, or the visitor's own "pause motion" choice (cn-ios-boot.js sets html.cn-still)
  const motionOff = () => root.classList.contains("cn-still") || !!w.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // The website's stage, word for word (a test compares it with public/index.html), minus its typed nudge line.
  function introStageHtml() {
    const letters = (text, from) => [...text].map((c, i) => `<span style="--i:${from + i}">${c}</span>`).join("");
    let n = 0;
    const quote = IX_PITCH.lines.map((line, i) => `<span class="cn-gate-ql${i ? " cn-gate-ql-2" : ""}">${line.split(" ").map(word => `<span class="cn-gate-qw" style="--w:${n++}">${esc(word)}</span>`).join(" ")}</span>`).join(" ");
    return `<div class="cn-ix" id="cnIntroStage" role="dialog" aria-modal="true" aria-label="Welcome to CyberNet AI" tabindex="-1">
      <i class="cn-ix-bg" aria-hidden="true"></i><i class="cn-ix-sweep" aria-hidden="true"></i>
      <div class="cn-gate-stage" aria-hidden="true">
        <div class="cn-gate-brand">
          <span class="cn-gate-mark">${IX_MARK}<i class="cn-gate-scan"></i></span>
          <span class="cn-gate-word">${letters("Cyber", 0)}<b>${letters("Net", 5)}</b><small>${letters("AI", 8)}</small></span>
        </div>
        <p class="cn-gate-quote">${quote}</p>
      </div>
      <p class="cn-ix-sr">${esc(`CyberNet AI. ${IX_PITCH.lines.join(" ")}`)}</p>
    </div>`;
  }

  // The website controller's FLIP: measure, change the layout, measure again, then glide from the old box to the new one.
  function flip(node, mutate) {
    const a = node.getBoundingClientRect();
    mutate();
    const b = node.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2), s = b.width ? a.width / b.width : 1;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) return;
    node.style.transition = "none";
    node.style.transform = `translate(${dx}px,${dy}px) scale(${s})`;
    node.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => { node.style.transition = ""; node.style.transform = ""; }));
  }

  // Puts the stage up and starts its clock. Returns { ready, toSteps, leave }: ready resolves when the
  // beats are over or skipped (a tap anywhere, the Skip button, Escape / Return / Space); toSteps() hands the
  // screen to the steps; leave() dissolves the stage (open: opens it onto the app) and gives the native tab bar back.
  // short: the short gate (7d), the mark at rest, no Skip button. open: a later launch that goes straight to the app (7d).
  function mountStage(fadeIn, { short = false, open = false } = {}) {
    $("#cnIntroStage")?.remove();
    const calm = motionOff();
    const node = el(introStageHtml());
    const brand = $(".cn-gate-brand", node);
    // the end frame: the lock shut, the words said, the mark glided up (unless it opens onto the app); no animation runs
    // without .is-run, so every part shows its rest value
    if (calm) node.classList.add("is-calm", "is-said", ...(open ? [] : ["is-glide"]));
    else if (short) node.classList.add("is-quick", "is-said", "is-glide");
    else if (open) node.classList.add("is-said");
    else node.classList.add("is-run");
    if (short || open) node.classList.add("is-short"); // no Skip button: it would be gone before it could be used (a tap anywhere still finishes it)
    if (open) node.classList.add("is-app");
    if (fadeIn) node.classList.add("is-fade");
    let timers = [], over = false, tabsHidden = false;
    let go;
    const ready = new Promise(resolve => { go = resolve; });
    const wait = (fn, ms) => { timers.push(later(fn, ms)); };
    const showTabs = () => { if (tabsHidden) { tabsHidden = false; nativeTabs?.setHidden({ hidden: false }).catch(() => {}); } };
    // what had focus before the stage took it (the Account row, on a replay): the sheet can only hand focus back to the stage's Skip
    const back = d.activeElement;
    const refocus = () => { try { if (back?.isConnected && back !== d.body) back.focus({ preventScroll: true }); } catch { /* ignore */ } };
    const onKey = e => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); end(true); } };
    const end = skipped => {
      if (over) return;
      over = true;
      timers.forEach(clearTimeout);
      timers = [];
      d.removeEventListener("keydown", onKey, true);
      // every move finishes at once: without .is-run each part shows its rest value, the end frame, and the mark is up
      node.classList.remove("is-run", "is-leaving");
      if (skipped) node.classList.add("is-end", "is-said", ...(open ? [] : ["is-glide"]));
      else if (!open) node.classList.add("is-glide");
      go();
    };
    node.addEventListener("click", () => end(true)); // the whole stage is the target; the tap is used up, never passed on to the steps
    d.addEventListener("keydown", onKey, true);
    // the bar is a native view above the page: hide it so the stage is the whole screen (leave() gives it back)
    if (nativeTabs) { tabsHidden = true; nativeTabs.setHidden({ hidden: true }).catch(() => {}); }
    d.body.appendChild(node);
    try { d.fonts?.load?.('700 34px "JetBrains Mono"'); d.fonts?.load?.('700 44px "Mona Sans"'); } catch { /* the fallback faces are fine */ }
    // owner, 11 Nov 2026: no Skip intro button; the stage itself takes focus (a tap anywhere still finishes it)
    try { node.focus({ preventScroll: true }); } catch { /* ignore */ }

    if (calm) wait(() => end(false), IX.calm);
    else if (short) wait(() => end(false), IX.quick);
    else if (open) wait(() => end(false), IX.open);
    else {
      wait(() => { try { P("Haptics")?.impact({ style: "MEDIUM" })?.catch?.(() => {}); } catch { /* ignore */ } }, IX.click);
      wait(() => node.classList.add("is-said"), IX.said); // "Stay protected. All in one place." rises, word by word
      wait(() => node.classList.add("is-leaving"), IX.said + IX.read); // it has been read: it fades up and away
      wait(() => flip(brand, () => { node.classList.add("is-glide"); node.classList.remove("is-leaving"); }), IX.said + IX.read + IX.leaving); // the mark glides up
      wait(() => end(false), IX.steps); // the sheet rises as the glide eases out
    }
    return {
      ready,
      toSteps() {
        node.classList.add("is-steps"); // Skip steps aside; the sheet is the dialog now
        node.setAttribute("aria-hidden", "true");
        node.inert = true;
      },
      leave() {
        end(true); // a no-op once over; makes sure no timer outlives the stage
        return new Promise(resolve => {
          // onto the app: the mark comes forward as the stage fades, and the page comes up under it (ios.css html.cn-ix-opening)
          const opening = open && !calm;
          if (opening) { root.classList.add("cn-ix-opening"); later(showTabs, 300); }
          node.classList.add("is-out");
          later(() => { node.remove(); showTabs(); refocus(); root.classList.remove("cn-ix-opening"); resolve(); }, calm ? 220 : opening ? 650 : 520);
        });
      }
    };
  }

  // A sheet that rises over the stage (the card, the steps) takes the bright stage's colour instead of dimming it; the mark
  // rests above it.
  function riseOverStage(panel) {
    panel.parentNode.classList.add("cn-ix-over");
  }

  // Did something already bring the person here: a link that opened the app, or an item shared to it
  // (section 11)? Then they are not here to watch an introduction: the steps come as a plain sheet, as before.
  function launchTarget() {
    const link = async () => (await P("App")?.getLaunchUrl?.())?.url;
    const shared = async () => {
      const { items = [] } = (await P("SharedInbox")?.read?.()) || {};
      return items.some(i => Date.now() - Date.parse(i.createdAt || 0) < 24 * 3600e3);
    };
    // both are asked at once, and a yes from either settles it: one plugin that never answers hides nothing
    return new Promise(resolve => {
      let left = 2;
      const settle = yes => { if (yes) resolve(true); else if (--left === 0) resolve(false); };
      for (const ask of [link, shared]) ask().then(settle, () => settle(false));
    });
  }
  let introStage = null;   // the stage prepareIntro() put up under the launch screen
  let introPlain = false;  // first launch with a link or a shared item: no motion
  let introRun = null;
  // Called at start on a first launch (a later launch goes to prepareGate, 7d). The stage goes up before the
  // launch screen hides (start() waits for this, 450 ms at most), so the stage's first frame is the launch screen.
  async function prepareIntro() {
    if (store.get(INTRO_KEY)) return;
    const target = await Promise.race([launchTarget(), new Promise(resolve => setTimeout(() => resolve(false), 450))]);
    if (target) { introPlain = true; return; }
    try { introStage = mountStage(false); } catch (error) { report(error, "intro stage"); introPlain = true; }
  }

  /* ---- 7b. the welcome pages ---- */
  // A tall sheet with pages side by side: swipe (native scroll snap) or Back / Next, Skip at the top right, Return / Escape /
  // the arrow keys on a Mac. Only the page in view can be reached by VoiceOver and Tab (the others are inert); a polite line
  // says "2 of 5" and the title when the page changes. The pictures are decoration (aria-hidden): the steps say the same.
  // The app icon, drawn (AppIcon-512@2x.png: the cyan shield and padlock on navy), so it is sharp at any size
  const INTRO_ICON = '<svg class="cn-onb-icon" viewBox="0 0 1024 1024" aria-hidden="true"><defs><radialGradient id="cnOnbBg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#0f2a3a"/><stop offset="1" stop-color="#060b14"/></radialGradient><linearGradient id="cnOnbFg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ee9fb"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="1024" height="1024" rx="228" fill="url(#cnOnbBg)"/><path d="M512 176c88 56 176 82 268 90v254c0 170-118 280-268 350-150-70-268-180-268-350V266c92-8 180-34 268-90Z" fill="none" stroke="url(#cnOnbFg)" stroke-width="48" stroke-linejoin="round"/><path d="M436 472v-44a76 76 0 0 1 152 0v44" fill="none" stroke="url(#cnOnbFg)" stroke-width="40"/><rect x="384" y="472" width="256" height="196" rx="32" fill="url(#cnOnbFg)"/><path d="M512 523a27 27 0 0 1 15 49l7 48h-44l7-48a27 27 0 0 1 15-49Z" fill="#060b14"/></svg>';
  const INTRO_ART = {
    welcome: `<div class="cn-onb-art cn-onb-art-welcome"><i class="cn-onb-halo"></i>${INTRO_ICON}</div>`,
    check: `<div class="cn-onb-art"><div class="cn-onb-card">
        <div class="cn-onb-card-head"><span class="cn-onb-seg is-on">Quick Scan</span><span class="cn-onb-seg">Analysis AI</span></div>
        <div class="cn-onb-msg">Your parcel is on hold. Pay the fee today: <b>parcel-redelivery.invalid/pay</b></div>
        <div class="cn-onb-card-foot"><span class="cn-onb-run">Start the analysis</span><span class="cn-onb-verdict cn-onb-pop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>SCAM</span></div>
      </div></div>`,
    qr: `<div class="cn-onb-art"><div class="cn-onb-finder">
        <i class="cn-onb-corner"></i><i class="cn-onb-corner"></i><i class="cn-onb-corner"></i><i class="cn-onb-corner"></i>
        <svg class="cn-onb-qr" viewBox="0 0 21 21" aria-hidden="true"><path d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zM16 2v3h3V2zM0 14h7v7H0zM2 16v3h3v-3z" fill-rule="evenodd"/><path d="M9 0h2v2H9zM9 3h1v3H9zM11 4h2v2h-2zM8 8h3v1H8zM12 8h1v3h-1zM14 9h3v1h-3zM18 8h3v2h-3zM9 10h2v2H9zM0 9h2v2H0zM3 8h2v1H3zM4 10h3v1H4zM14 11h2v2h-2zM17 11h1v3h-1zM19 12h2v1h-2zM8 13h2v2H8zM11 14h3v1h-3zM9 16h1v3H9zM11 17h2v1h-2zM12 19h3v2h-3zM15 15h2v2h-2zM18 15h3v1h-3zM19 17h2v4h-2zM16 18h2v1h-2zM8 20h2v1H8z"/></svg>
        <i class="cn-onb-beam"></i>
      </div><div class="cn-onb-link cn-onb-pop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg><span>account-verify.invalid</span><em>Not opened</em></div></div>`,
    share: `<div class="cn-onb-art"><div class="cn-onb-share">
        <span class="cn-onb-grab"></span>
        <span class="cn-onb-share-head">Share</span>
        <div class="cn-onb-apps">
          <span class="cn-onb-app is-us cn-onb-pop">${INTRO_ICON}<b>CyberNet AI</b></span>
          <span class="cn-onb-app is-more"><i><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg></i><b>More</b></span>
        </div>
      </div></div>`,
    account: `<div class="cn-onb-art cn-onb-art-duo">
        <div class="cn-onb-tile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z"/><path d="M8 10h8M8 13h5"/></svg><b>Analysis AI</b></div>
        <div class="cn-onb-tile cn-onb-pop"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/></svg><b>Recovery</b></div>
      </div>`
  };
  // The pages in order, worded for whoever is looking (a guest hears "No account needed." and what an account adds)
  function introPages(member) {
    return [
      { id: "welcome", title: INTRO_WELCOME.title, text: INTRO_WELCOME.text, steps: [] },
      ...INTRO.map(p => ({ ...p, text: p.text + (member ? "" : p.guest || "") })),
      { id: "account", title: INTRO_ACCOUNT.title, text: INTRO_ACCOUNT.text, steps: [], tip: member ? INTRO_ACCOUNT.member : INTRO_ACCOUNT.guest }
    ];
  }
  function introPageHtml(page, i, count) {
    const steps = page.steps.length ? `<ol class="cn-onb-steps">${page.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>` : "";
    const tip = page.tip ? `<p class="cn-onb-tip">${esc(page.tip)}</p>` : "";
    return `<section class="cn-onb-page cn-onb-page-${page.id}" role="group" aria-label="${i + 1} of ${count}: ${esc(page.title)}" data-onb-page="${i}">
        ${INTRO_ART[page.id] || ""}
        <div class="cn-onb-copy">
          <h2 class="cn-onb-title"${i === 0 ? ' id="cnIntroTitle"' : ""}>${esc(page.title)}</h2>
          <p class="cn-onb-lead">${esc(page.text)}</p>
          ${steps}${tip}
        </div>
      </section>`;
  }
  function introSheet(overStage) {
    const pages = introPages(signedIn());
    const last = pages.length - 1;
    let step = 0;
    return sheet({
      id: "cnIntro",
      label: "Welcome to CyberNet AI",
      sticky: true,
      html: `<div class="cn-onb">
          <div class="cn-onb-top">
            <button type="button" class="cn-ios-link-btn cn-onb-back" data-intro="back">Back</button>
            <button type="button" class="cn-ios-link-btn cn-onb-skip" data-sheet-value="skip">Skip</button>
          </div>
          <p class="cn-ix-sr" aria-live="polite" data-onb-say></p>
          <div class="cn-onb-track" data-onb-track>${pages.map((p, i) => introPageHtml(p, i, pages.length)).join("")}</div>
          <div class="cn-onb-foot">
            <div class="cn-onb-dots" aria-hidden="true">${pages.map(() => "<i></i>").join("")}</div>
            <div class="cn-onb-buttons">
              <button type="button" class="primary-btn cn-onb-next" data-intro="next" data-autofocus>Next</button>
            </div>
          </div>
        </div>`,
      onOpen(panel, done) {
        if (overStage) riseOverStage(panel); // rises slowly over the bright stage instead of dimming it
        panel.classList.add("cn-onb-sheet");
        const track = panel.querySelector("[data-onb-track]");
        const els = [...panel.querySelectorAll(".cn-onb-page")];
        const back = panel.querySelector('[data-intro="back"]'), next = panel.querySelector('[data-intro="next"]');
        const skip = panel.querySelector(".cn-onb-skip");
        const paint = (say = false) => {
          els.forEach((page, i) => {
            const here = i === step;
            page.inert = !here;
            page.toggleAttribute("aria-hidden", !here);
            page.classList.toggle("is-here", here);
          });
          panel.querySelectorAll(".cn-onb-dots i").forEach((dot, i) => dot.classList.toggle("is-on", i === step));
          next.textContent = step === last ? "Get started" : "Next";
          if ((step === 0 && d.activeElement === back) || (step === last && d.activeElement === skip)) next.focus({ preventScroll: true });
          back.hidden = step === 0;
          // on the last page Get started does what Skip does: Skip is hidden, and keeps its room so the row does not move
          skip.classList.toggle("is-gone", step === last);
          skip.inert = step === last;
          if (say) panel.querySelector("[data-onb-say]").textContent = `${step + 1} of ${pages.length}. ${pages[step].title}`;
        };
        const go = to => {
          step = Math.max(0, Math.min(last, to));
          track.scrollTo({ left: step * track.clientWidth, behavior: motionOff() ? "auto" : "smooth" });
          paint(true);
        };
        // a swipe: the page is the one the track settles on (no scrollend on iOS 16, so every scroll is read)
        let settle = 0, resizer = null;
        track.addEventListener("scroll", () => {
          clearTimeout(settle);
          settle = setTimeout(() => {
            const at = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
            if (at !== step && at >= 0 && at <= last) { step = at; paint(true); }
          }, 90);
        }, { passive: true });
        // a Mac window that is resized keeps the same page in view
        try { resizer = new ResizeObserver(() => { track.scrollLeft = step * track.clientWidth; }); resizer.observe(track); } catch { /* ignore */ }
        panel.addEventListener("click", e => {
          if (e.target.closest('[data-intro="back"]')) go(step - 1);
          else if (e.target.closest('[data-intro="next"]')) { if (step < last) go(step + 1); else finish("done"); }
        });
        // On the document (capture), not the panel: on a Mac a click on the dimmed area takes focus out of the sheet, and the keys
        // must still work. Only while this sheet is the top one; removed when it closes.
        const onKeys = e => {
          if (!sheetStack.includes(panel.parentNode)) { d.removeEventListener("keydown", onKeys, true); return; } // closed by Skip
          if (sheetStack[sheetStack.length - 1] !== panel.parentNode) return;
          if (e.key === "ArrowRight") { e.preventDefault(); go(step + 1); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); go(step - 1); }
          else if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); finish("skip"); } // a Mac keyboard: Escape is Skip
        };
        const finish = value => { d.removeEventListener("keydown", onKeys, true); try { resizer?.disconnect(); } catch { /* ignore */ } done(value); };
        d.addEventListener("keydown", onKeys, true);
        paint();
      }
    });
  }

  function showIntro(force = false) {
    if (introRun) return introRun;
    if (!force && store.get(INTRO_KEY)) return Promise.resolve(false);
    let stage = null;
    if (force || !introPlain) {
      try { stage = force ? mountStage(true) : introStage || mountStage(false); } catch (error) { report(error, "intro stage"); }
    }
    introStage = null;
    // Asked now, answered long before the motion ends (a replay from Account never meets the card)
    const gate = force ? Promise.resolve("none") : sessionKnown().then(session => launchGate(true, session, introPlain));
    introRun = (async () => {
      try {
        if (stage) await stage.ready; // the motion plays; the card or the steps come when it ends or is skipped
        stage?.toSteps();
        if ((await gate) === "first") await signInCard({ launch: true, overStage: !!stage }); // either answer goes on to the steps
        return await introSheet(!!stage);
      } finally {
        if (stage) await stage.leave();
        later(() => focusBack(null), 60); // the steps' opener (the stage, the card) is gone
      }
    })().then(value => { store.set(INTRO_KEY, String(Date.now())); return value; });
    const clear = () => { introRun = null; };
    introRun.then(clear, clear);
    return introRun;
  }

  /* ---- 7c. the sign-in card ---- */
  // One card for every place that asks for an account: the launch gate, a guest who taps Analysis AI or
  // Recovery, and (as a block) the Account tab. Sign in with Apple comes first and is as large as the others
  // (App Review 4.8); Sign in with Google follows it (owner, 30 Oct 2026). "Sign in with email" and "Create
  // account" open the email forms in the sign-in dialog (#authModal), which keeps its own rules: first and last
  // name, the legal consent box, password reset and email confirmation. The Apple button runs signInWithApple()
  // and the Google button signInWithGoogle() (both in section 9, the only places that call their plugins).
  const GATE_LEAD = "Sign in to get AI explanations and Recovery plans."; // the sign-in dialog's approved line
  const DELETED_LEAD = "Your account and everything saved in it have been removed, and you are signed out. You can create a new account or continue without one.";
  const GUEST_LABEL = "Continue without an account";
  const GUEST_NOTE = "Quick Scan, QR, Share and Learn work without one.";
  // a guest's card (Analysis AI, Recovery) names what the page does instead of repeating its heading
  const ACCOUNT_LEADS = { cybernetai: "Analysis AI explains the warning signs in plain words.", recovery: "Recovery gives you a plan, step by step." };
  // offline: signing in needs the internet, the guest way does not (the launch card's link is under the note; the others are already guests)
  const OFFLINE_GATE = "You're offline. Connect to the internet to sign in."; // the guest link sits right under it
  const OFFLINE_SIGNIN = "You're offline. Connect to the internet to sign in. Quick Scan, QR and Learn still work.";

  const SIGNIN_MSG = '<p class="cn-signin-msg" role="alert" data-signin-msg hidden></p>';
  // msg: the message line after the note. The card puts it above the buttons instead (signInCardHtml): the card is
  // anchored to the screen's bottom edge and grows upward, so a line added under the buttons would push them up
  // under the finger that has just tapped one; above them, only the heading moves.
  function signInChoicesHtml(prefix, { msg = true } = {}) {
    return `<div class="cn-signin-choices">
        <button type="button" class="cn-ios-apple-btn" id="${prefix}Apple" data-signin="apple" data-autofocus>${APPLE_LOGO}<span>Sign in with Apple</span></button>
        <button type="button" class="cn-ios-google-btn" id="${prefix}Google" data-signin="google">${GOOGLE_LOGO}<span>Sign in with Google</span></button>
        <button type="button" class="primary-btn full" data-signin="email">Sign in with email</button>
        <button type="button" class="secondary-btn full" data-signin="create">Create account</button>
      </div>
      <p class="cn-ios-apple-note">By continuing with Apple or Google you agree to the <button type="button" class="cn-legal-link-btn" data-open-legal="terms">Terms of Service</button> and the <button type="button" class="cn-legal-link-btn" data-open-legal="privacy">Privacy Policy</button>.</p>
      ${msg ? SIGNIN_MSG : ""}`;
  }
  // launch: the gate (the guest way out is the link under the card); otherwise a guest's card, which simply closes
  function signInCardHtml({ title, launch, lead }) {
    // a guest's card can be dismissed ("Not now"), so it has the same grabber and X as every other sheet (the X is a
    // [data-gate] choice, so finish() runs); the launch gate keeps only its choices and the guest link (5.1.1(v))
    const chrome = launch ? "" : `<div class="cn-ios-sheet-grab" aria-hidden="true"></div><button type="button" class="cn-ios-sheet-x" data-gate="cancel" aria-label="Close">${CLOSE_X}</button>`;
    return `${chrome}<div class="cn-ios-gate">
        <h2 class="cn-ios-sheet-title" id="cnSignInTitle">${esc(title)}</h2>
        <p class="cn-ios-gate-lead">${esc(lead)}</p>
        ${SIGNIN_MSG}
        ${signInChoicesHtml("cnGate", { msg: false })}
        <div class="cn-ios-gate-foot">${launch
          ? `<button type="button" class="cn-ios-link-btn" data-gate="guest">${esc(GUEST_LABEL)}</button><p class="cn-ios-gate-note">${esc(GUEST_NOTE)}</p>`
          : '<button type="button" class="cn-ios-link-btn" data-gate="cancel">Not now</button>'}</div>
      </div>`;
  }
  // Wires the four choices inside `scope` (the card, or the Account block). Errors and the offline note go
  // to the scope's own message line: the sign-in dialog's message line is not on screen behind the card.
  function wireSignIn(scope, { launch = false, onSay = null } = {}) {
    const offlineText = launch ? OFFLINE_GATE : OFFLINE_SIGNIN;
    const line = $("[data-signin-msg]", scope);
    const say = (text, tone = "error") => {
      if (!line) return;
      line.textContent = text || "";
      line.dataset.tone = tone;
      line.hidden = !text;
      onSay?.();
    };
    scope.addEventListener("click", async e => {
      const b = e.target.closest?.("[data-signin]");
      if (!b || !scope.contains(b)) return;
      const what = b.getAttribute("data-signin");
      say("");
      try {
        if (what === "apple") {
          if (offline) { say(offlineText, "info"); return; } // Apple's sheet would open and the sign-in could not finish
          if (await signInWithApple(b, { view: "login", say })) signedInNow();
        } else if (what === "google") {
          if (offline) { say(offlineText, "info"); return; } // the sheet would open and the sign-in could not finish
          if (await signInWithGoogle(b, { say })) signedInNow();
        } else account()?.openAuthModal?.(what === "create" ? "signup" : "login"); // offline, the form answers with its own message
      } catch (error) { report(error, `sign in ${what}`); say("Something went wrong. Please try again."); }
    });
    if (offline) say(offlineText, "info");
  }

  // Who is waiting for a sign-in: the open card. signedInNow() is called when Apple or Google finishes, when Supabase
  // reports a sign-in and when script.js has recorded the session; the waiters run once, and only once
  // signedIn() is true (script.js records the session in a timer of its own).
  const signInWaiters = new Set();
  function whenSignedIn(fn) { signInWaiters.add(fn); return () => signInWaiters.delete(fn); }
  function signedInNow(tries = 0) {
    if (!signInWaiters.size) return;
    if (!signedIn()) { if (tries < 20) later(() => signedInNow(tries + 1), 50); return; }
    for (const fn of [...signInWaiters]) {
      signInWaiters.delete(fn);
      try { fn(); } catch (error) { report(error, "signed in"); }
    }
  }
  function watchSignIn() {
    try {
      supabase()?.auth.onAuthStateChange?.((event, session) => {
        // a timer: the client waits for its listeners, and script.js records the session in one of its own
        later(() => { syncCheckSwitch(activePage()); if (session?.access_token) signedInNow(); }, 30);
      });
    } catch (error) { report(error, "watch sign-in"); }
  }

  // The card is a modal: the page behind it is inert (and hidden from VoiceOver) until a choice is made, and the
  // native tab bar steps aside (it would cover the card's foot). The email forms open above the card
  // (ios.css: html.cn-ios-gated #authModal).
  const BEHIND = ["#cnMain", ".navbar", "#cnIosSegWrap", "#cnIosTabbar", ".cn-skip"];
  let behindHolds = 0;
  function inertBehind(on) {
    behindHolds = Math.max(0, behindHolds + (on ? 1 : -1));
    const held = behindHolds > 0;
    for (const sel of BEHIND) $$(sel).forEach(n => {
      n.inert = held;
      if (held && !n.hasAttribute("aria-hidden")) { n.setAttribute("aria-hidden", "true"); n.dataset.cnHid = "1"; }
      else if (!held && n.dataset.cnHid) { n.removeAttribute("aria-hidden"); delete n.dataset.cnHid; }
    });
  }
  let barByCard = false;
  function holdBar(on) {
    barByCard = on;
    if (!nativeTabs) return;
    if (on) nativeTabs.setHidden({ hidden: true }).catch(() => {});
    else if (!$("#cnIntroStage")) nativeTabs.setHidden({ hidden: false }).catch(() => {}); // under the stage, the stage gives it back
  }
  // One Escape closes the email form (script.js) and must not also answer the card beneath it
  let authClosedAt = -1e9;
  function watchAuthModal() {
    const modal = $("#authModal");
    if (!modal) return;
    let shown = modal.classList.contains("show");
    new MutationObserver(() => {
      const now = modal.classList.contains("show");
      if (shown && !now) authClosedAt = performance.now();
      shown = now;
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  let cardOpen = null;   // the open card's promise: only one at a time
  let gateOpen = false;  // the launch card is up: a shared item waits until it is answered (launch ends with checkInbox)
  // Resolves "signed-in", "guest" (the launch card's link, or Escape on it) or "cancel" (a guest's card).
  // launch: the gate (sticky: only its choices close it). overStage: it rises over the motion stage.
  // title / lead: a caller's own reason line (store.js: why buying needs an account, 1.1 decision D3).
  function signInCard({ page = null, launch = false, overStage = false, title: askTitle = "", lead: askLead = "" } = {}) {
    if (cardOpen) return cardOpen;
    // the first launch card after a deletion confirms it (the website's notice would sit under the card)
    const deleted = launch && !!w.CN_ACCOUNT_DELETED && !root.classList.contains("cn-deleted-told");
    if (deleted) root.classList.add("cn-deleted-told");
    const title = deleted ? "Your account has been deleted" : askTitle || (page ? `Sign in to use ${ACCOUNT_PAGES[page]}` : "Sign in to CyberNet AI");
    const lead = deleted ? DELETED_LEAD : askLead || (page && ACCOUNT_LEADS[page]) || GATE_LEAD;
    cardOpen = sheet({
      id: "cnSignIn",
      label: title,
      sticky: true, // closed only through finish() below
      html: signInCardHtml({ title, launch, lead }),
      onOpen(panel, done) {
        const node = panel.parentNode;
        let off = () => {}, closed = false;
        const finish = value => {
          if (closed) return;
          closed = true;
          d.removeEventListener("keydown", onKey, true);
          off();
          gateOpen = false;
          if (launch && value === "guest") store.set(GUEST_KEY, String(Date.now())); // 5.1.1(v): remembered for a week
          root.classList.remove("cn-ios-gated");
          inertBehind(false); // before done(): the sheet hands focus back to what had it
          holdBar(false);
          done(value);
        };
        // Escape never traps: on the launch card it is the guest way out, on a guest's card it is Cancel.
        // It does nothing while the email form or a legal page is open above (they close first).
        const onKey = e => {
          if (e.key !== "Escape" && e.key !== "Esc") return;
          if ($("#authModal.show") || $("#cnLegalSheet") || performance.now() - authClosedAt < 150) return;
          e.stopImmediatePropagation();
          finish(launch ? "guest" : "cancel");
        };
        d.addEventListener("keydown", onKey, true);
        if (overStage) riseOverStage(panel); // rises slowly over the bright stage, as the steps do
        gateOpen = launch;
        root.classList.add("cn-ios-gated");
        inertBehind(true);
        holdBar(true);
        node.addEventListener("click", e => { if (e.target === node && !launch) finish("cancel"); });
        panel.addEventListener("click", e => {
          const b = e.target.closest("[data-gate]");
          if (b) finish(b.getAttribute("data-gate"));
        });
        wireSignIn(panel, { launch });
        off = whenSignedIn(() => finish("signed-in"));
      }
    }).then(value => { cardOpen = null; return value; });
    return cardOpen;
  }

  /* ---- 7d. what each launch shows ---- */
  // The decision, in one place (owner, 30 Oct 2026):
  //   signed in .......................................... the lock shuts and the stage opens onto Check, no gate (the first
  //                                                          launch plays the intro and the steps instead)
  //   no answer from the session check in time ........... the same: the app is usable, and the gate is not a wall
  //   opened by a link or a shared item .................. no gate; a guest may handle what was shared
  //   signed out, first launch ........................... the motion, then the card, then the three steps
  //   signed out, a later launch (sign out and a deleted account come back here too) ... the short gate, unless the person chose
  //                                                                                       "Continue without an account" in the last 7 days
  //                                                                                       (then the stage opens onto Check)
  // Where the person lands is Check (Quick Scan) in every case, including right after signing in on the card. Someone who
  // is signed in reaches the Analysis AI message box through the Quick Scan | Analysis AI switch with no prompt, or straight
  // away when a guest asked for Analysis AI and then signed in (arrive). Opening on Analysis AI at launch is a decision
  // for the owner (review of 30 Oct 2026); it would change the launch of every signed-in person.
  function launchGate(first, session, direct) {
    if (session !== false || direct) return "none";
    return first ? "first" : "short";
  }
  // script.js builds the account (window.CyberNetAccount) when the page's DOMContentLoaded fires, which is after this
  // deferred file first runs: at start() there is no account yet, so the launch waits for it (a few milliseconds).
  function accountReady(ms) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const look = () => { if (account() || Date.now() - t0 >= ms) resolve(!!account()); else setTimeout(look, 15); };
      look();
    });
  }
  // true: a session is saved; false: there is none; null: no answer in time. The Supabase client reads the
  // Keychain (and refreshes an expired token) before it answers, so nothing flashes for someone who is signed in.
  const SESSION_WAIT = 1200;
  function sessionKnown(ms = SESSION_WAIT) {
    const answer = (async () => {
      await accountReady(ms);
      if (signedIn()) return true;
      const auth = supabase()?.auth;
      if (!auth?.getSession) return null;
      try { return !!(await auth.getSession()).data?.session?.access_token; } catch { return null; }
    })();
    return Promise.race([answer, new Promise(resolve => setTimeout(() => resolve(null), ms))]);
  }
  let gateStage = null;    // the short gate's stage, put up under the launch screen
  let gateWanted = false;
  let openStage = null;    // a later launch that goes straight to the app: the lock shuts and the stage opens onto Check
  // Called at start on a later launch. A link or a shared item opened the app: nothing to show, the launch screen hides
  // onto it. Signed out (and no guest choice in the last 7 days): the short gate's stage. Everyone else (signed in, a
  // guest's recent choice, no answer in time): the stage that opens onto the app (owner, 1 Nov 2026). Either stage goes
  // up before the launch screen hides, so its first frame is the launch screen.
  async function prepareGate() {
    const guest = guestRemembered(); // chose "Continue without an account" in the last 7 days: no card
    const [session, direct] = await Promise.all([
      guest ? null : sessionKnown(),
      Promise.race([launchTarget(), new Promise(resolve => setTimeout(() => resolve(false), 450))])
    ]);
    if (direct) return;
    if (!guest && launchGate(false, session, false) === "short") {
      gateWanted = true;
      try { gateStage = mountStage(false, { short: true }); } catch (error) { report(error, "gate stage"); } // without a stage the card comes over the app
      return;
    }
    try { openStage = mountStage(false, { open: true }); } catch (error) { report(error, "launch stage"); }
  }
  async function showGate() {
    if (openStage) {
      const stage = openStage;
      openStage = null;
      try { await stage.ready; } finally { await stage.leave(); }
      return;
    }
    if (!gateWanted) return;
    gateWanted = false;
    const stage = gateStage;
    gateStage = null;
    try {
      if (stage) { await stage.ready; stage.toSteps(); }
      await signInCard({ launch: true, overStage: !!stage });
    } finally {
      if (stage) await stage.leave();
    }
  }

  /* ================================================================ 8. legal pages and the sign-up acceptance */
  const LEGAL_FILES = { terms: "terms", privacy: "privacy", acceptable: "acceptable-use", "acceptable-use": "acceptable-use" };
  // 1.1 design item 6: the legal sheet names its document in the header (it only had "Done")
  const LEGAL_TITLES = { terms: "Terms of Service", privacy: "Privacy Policy", "acceptable-use": "Acceptable Use Policy" };
  function openLegal(doc = "privacy", hash = "") {
    const file = LEGAL_FILES[doc] || "privacy";
    const old = $("#cnLegalSheet");
    if (old) { old.cnClose?.(); old.remove(); }
    const back = d.activeElement;
    const title = LEGAL_TITLES[file] || "Legal";
    const node = el(`<div class="cn-ios-legal-sheet" id="cnLegalSheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="cn-ios-legal-head">
          <h2 class="cn-ios-legal-title">${esc(title)}</h2>
          <button type="button" class="cn-ios-sheet-x cn-ios-head-x" data-legal-close aria-label="Close">${CLOSE_X}</button>
        </div>
        <iframe class="cn-ios-legal-frame" title="Legal document" src="legal/${file}.html?embedded=1${hash ? `#${encodeURIComponent(hash)}` : ""}"></iframe>
      </div>`);
    // Part of the sheet stack (review fix): opened over the paywall, only the legal sheet answers Escape and Tab.
    sheetStack.push(node);
    syncSheets();
    inertBehind(true);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      const at = sheetStack.indexOf(node);
      if (at >= 0) sheetStack.splice(at, 1);
      syncSheets();
      inertBehind(false);
      node.classList.remove("is-open"); later(() => node.remove(), 220); d.removeEventListener("keydown", onKey, true);
      try { back?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
    };
    node.cnClose = close;
    const onKey = e => {
      if (sheetStack[sheetStack.length - 1] !== node) return;
      if (e.key === "Escape" || e.key === "Esc") { e.stopImmediatePropagation(); close(); }
      if (e.key === "Tab") {
        const f = $$("button, iframe", node);
        if (!f.length) return;
        if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
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

  /* ================================================================ 9. Sign in with Apple and Google */
  // The Apple logo (Simple Icons "apple", 24-unit grid, cropped to the glyph: 19.6 x 24, so its proportions are Apple's). It is 22 px tall beside
  // the 21 px title, as the logo and the title sit in Apple's own buttons (HIG: the title is about 43% of the button's height, 21 px on the 50 pt button).
  const APPLE_LOGO = '<svg viewBox="2.2 0 19.6 24" width="18" height="22" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';
  // Google's standard four-colour "G" (Google sign-in branding): never recoloured, so the button around it is Google's neutral dark one
  const GOOGLE_LOGO = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  function setupApple() {
    if (!P("AppleSignIn")) return;
    const modal = $("#authModal .modal-card");
    const tabs = $("#authModal .auth-tabs");
    if (!modal || !tabs || $("#cnAppleWrap")) return;
    const wrap = el(`<div class="cn-ios-apple" id="cnAppleWrap">
        <button type="button" class="cn-ios-apple-btn" id="cnAppleBtn">${APPLE_LOGO}<span>Sign in with Apple</span></button>
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
  // A new Apple or Google account agrees through the note under the buttons; the record has no email, so it is
  // only sent if the account turns out to be new (created around now). Keep an unsent current one.
  function rememberLoginAcceptance() {
    const existing = readAcceptance();
    const keep = existing && !existing.serverRecorded && existing.version === LEGAL.version && existing.privacyVersion === LEGAL.privacy && (Number(existing.attempts) || 0) < 3 && Date.now() - Date.parse(existing.acceptedAt || "") <= ACCEPTANCE_MAX_AGE;
    if (!keep) storeAcceptance("");
  }
  // Called from the sign-in dialog (its own view and message line) and from the sign-in card and the Account
  // block (view "login", their own message line). true once Supabase has the session.
  // App 1.1.1: one sign-in at a time. A second tap (or a second button) while one is running returns quietly (false) without
  // touching its button or message line; the native plugin's own IN_PROGRESS answer is just as quiet (no message, no report).
  let appleSignInBusy = false;
  async function signInWithApple(button, { view = $("#authModal")?.dataset.authView || "login", say = authMessage } = {}) {
    if (appleSignInBusy) return false;
    appleSignInBusy = true;
    try {
    const apple = P("AppleSignIn"), sb = supabase();
    if (!apple || !sb) { say("Sign in with Apple is not available right now. Please use your email and password."); return false; }
    if (view === "signup" && !legalAccepted()) { legalError(); return false; }
    if (view === "signup") storeAcceptance("");
    else rememberLoginAcceptance();
    button.disabled = true;
    say("", "");
    try {
      const raw = randomNonce();
      const res = await apple.signIn({ scopes: ["email", "fullName"], nonce: await sha256Hex(raw) });
      const token = res?.idToken || res?.identityToken || res?.response?.identityToken;
      if (!token) throw new Error("Apple did not return a sign-in token.");
      const { error } = await sb.auth.signInWithIdToken({ provider: "apple", token, nonce: raw });
      if (error) throw error;
      const given = res?.givenName || res?.response?.givenName || "", family = res?.familyName || res?.response?.familyName || "";
      if (given || family) {
        // Apple shares the name only on the first sign-in: it goes into the account, then the account is asked again so the
        // server repairs the profile's fallback name (in the background: the sign-in itself is finished)
        const named = await sb.auth.updateUser({ data: { full_name: `${given} ${family}`.trim(), first_name: given, last_name: family } }).catch(() => null);
        if (named && !named.error) refreshAccountName(named.data?.user).catch(err => report(err, "account name refresh"));
      }
      say("You're signed in.", "success");
      $("#closeAuth")?.click();
      toast("You're signed in with Apple.");
      return true;
    } catch (error) {
      const text = String(error?.message || error?.code || "");
      // The plugin answers CANCELED for a closed sheet (also Apple's "unknown" error after the sheet was shown); the message is the fallback.
      // IN_PROGRESS: Apple's sheet is already open (a sign-in from before this page's guard): nothing to say or report.
      if (error?.code === "CANCELED" || /cancel|1001/i.test(text)) say("", "");
      else if (error?.code === "IN_PROGRESS") { /* quiet */ }
      else {
        // a real failure goes to the error report with Apple's own code (error.data: nativeDomain, nativeCode)
        const native = error?.data && error.data.nativeCode !== undefined ? ` (${error.data.nativeDomain || "Apple"} ${error.data.nativeCode})` : "";
        report(native ? new Error(text + native) : error, "apple sign-in");
        say("Sign in with Apple didn't finish. Please try again, or use your email and password."); }
      return false;
    } finally { button.disabled = false; }
    } finally { appleSignInBusy = false; }
  }

  // ---- Sign in with Google (owner, 30 Oct 2026) ----
  // Google refuses to sign anyone in inside an embedded web view, so the page never opens Google itself: the
  // system's secure sign-in sheet does (CNWebAuth, ASWebAuthenticationSession; WebAuthPlugin.swift opens only this
  // project's Supabase address and comes back only to GOOGLE_SCHEME). The sheet returns the address
  // app.cybernetai://auth-callback?code=...; the app trades the code for the session (PKCE).
  // A client of its own does that, and the app's own client stays as it is. That one uses supabase-js's default
  // (implicit) flow on purpose: the password-reset page (public/app/reset.js) can read tokens in the address, but
  // never a PKCE code, so changing its flowType would break the reset emails. The extra client keeps its session
  // in memory only (the PKCE secret never leaves the web view, so a code that leaks cannot be used) and the app's
  // client takes the session over with setSession. The extra client is made once, on the first tap, and reused:
  // supabase-js never lets go of a client (it listens to the page's visibility for as long as the page lives), and
  // a second one under the same storage key logs a "Multiple GoTrueClient instances" warning. It cannot refresh
  // (autoRefreshToken is off), so its copy of the session just sits idle until the page reloads; it never presents
  // the old refresh token. Never call signOut on it: that would end the session the app's client now holds.
  const GOOGLE_CALLBACK = "app.cybernetai://auth-callback"; // must be in Supabase's redirect allow-list (Authentication > URL Configuration)
  const GOOGLE_SCHEME = "app.cybernetai";                   // the only scheme WebAuthPlugin.swift accepts
  const GOOGLE_UNAVAILABLE = "Sign in with Google is not available right now. Please use your email and password.";
  const GOOGLE_FAILED = "Sign in with Google didn't finish. Please try again, or use your email and password.";
  // What the sheet came back with: a code (PKCE), tokens in the #hash (the implicit form, if Supabase answers that
  // way) or an error in either place. Only the app's own return address counts.
  function googleReturn(address) {
    let url;
    try { url = new URL(String(address)); } catch { return { error: "bad_return" }; }
    if (url.protocol !== `${GOOGLE_SCHEME}:` || url.host !== "auth-callback") return { error: "bad_return" };
    const query = url.searchParams, hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const pick = key => hash.get(key) || query.get(key) || "";
    // APP-5 (security audit Nov 2026): only the PKCE code is taken. Tokens in the
    // return address (the implicit form) are never needed with flowType "pkce",
    // and taking them would let a crafted callback sign the person into someone
    // else's account (login CSRF).
    return { code: query.get("code") || "", error: pick("error") };
  }
  let googleBusy = false; // a sheet is up, or its answer is being taken: another tap starts nothing
  let googleClient = null; // the extra PKCE client, made on the first tap
  // Called from the sign-in card and the Account block (their own message line). true once the app's Supabase
  // client has the session; false when it was cancelled (quietly) or did not finish (a message on the line).
  async function signInWithGoogle(button, { say = authMessage } = {}) {
    const web = P("CNWebAuth"), sb = supabase(), cfg = w.CYBERNET_CONFIG || {};
    if (!web || !sb || typeof w.supabase?.createClient !== "function" || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) { say(GOOGLE_UNAVAILABLE); return false; }
    if (googleBusy) return false;
    googleBusy = true;
    button.disabled = true;
    say("", "");
    try {
      rememberLoginAcceptance();
      const oauth = googleClient ||= w.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "cn-google-oauth" }
      });
      const { data, error } = await oauth.auth.signInWithOAuth({ provider: "google", options: { redirectTo: GOOGLE_CALLBACK, skipBrowserRedirect: true } });
      if (error || !data?.url) throw error || new Error("Supabase gave no sign-in address.");
      // supabase-js 2.117.2 does not add skip_http_redirect; it is for a caller that fetches the address itself, and the sheet needs the redirect
      const signInUrl = new URL(data.url);
      signInUrl.searchParams.delete("skip_http_redirect");
      const back = googleReturn((await web.start({ url: signInUrl.toString(), callbackScheme: GOOGLE_SCHEME }))?.url);
      if (back.error === "access_denied") { say("", ""); return false; } // the person said no on Google's or Supabase's page
      if (back.error) throw new Error(`Google sign-in came back with ${back.error}.`);
      let tokens = null;
      if (back.code) {
        const res = await oauth.auth.exchangeCodeForSession(back.code, data.flowId ? { flowId: data.flowId } : undefined);
        if (res.error) throw res.error;
        tokens = res.data?.session;
      }
      if (!tokens?.access_token || !tokens?.refresh_token) throw new Error("Google sign-in came back without a session.");
      const { error: setError } = await sb.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
      if (setError) throw setError;
      say("You're signed in.", "success");
      $("#closeAuth")?.click();
      toast("You're signed in with Google.");
      return true;
    } catch (error) {
      if (error?.code === "CANCELED" || /cancel/i.test(String(error?.message || ""))) say("", "");
      // reported by name and code only: a provider error can carry the sign-in code in its text
      else { report(new Error(`google sign-in ${error?.name || "Error"} ${error?.code || error?.status || ""}`.trim()), "google sign-in"); say(GOOGLE_FAILED); }
      return false;
    } finally { googleBusy = false; button.disabled = false; }
  }

  /* ================================================================ 10. QR scanner */
  // The scanner is not a page: when it closes (cancelled, failed, or its result sheet closed) syncTabs() puts the tab bar's highlight
  // back on the page that is open, where the native bar would otherwise stay on Scan QR.
  // Scan QR (Accessibility, 1.1.1): the tab and the guide open a small sheet first, with "Scan with the camera" and
  // "Choose a photo of a QR code" side by side, so a VoiceOver user (for whom aiming a camera is hard) always has the photo
  // way in, not only after the camera fails. No camera (no scanner plugin, or a Mac): startQrScan shows the photo help.
  const SCAN_HINT = "Point the camera at a QR code. Or choose a photo instead.";
  function openScan() {
    if (!P("CapacitorBarcodeScanner") || pointerOnly()) { startQrScan(); return; }
    showCameraHelp(SCAN_HINT, false, true);
  }
  async function startQrScan() {
    const scanner = P("CapacitorBarcodeScanner");
    if (!scanner) { showCameraHelp("The camera scanner is part of the CyberNet AI app. You can choose a photo of a QR code instead."); return; }
    // On a Mac (the iPhone app on Apple silicon) there is no rear camera and no touch screen: the photo picker comes first,
    // with no error (owner, 21 Nov 2026: "make it a MacBook app as well").
    if (pointerOnly()) { showCameraHelp("Choose a photo or a screenshot of the QR code, and CyberNet AI checks it."); return; }
    try {
      const result = await scanner.scanBarcode({
        hint: 0, scanInstructions: "Point at a QR code. Nothing opens until you choose.", scanButton: false, scanText: " ",
        cameraDirection: 1, scanOrientation: 1, cancelButtonAccessibilityLabel: "Cancel"
      });
      const value = String(result?.ScanResult || "").trim();
      if (value) showQrVerdict(value, "qr"); // its sheet puts the tab bar back when it is closed
      else syncTabs();
    } catch (error) {
      const text = `${error?.code || ""} ${error?.message || ""}`;
      if (/0006\b|cancel/i.test(text)) { syncTabs(); return; } // the native bar is still on Scan QR: back to the page that is open
      if (/0007\b|camera access|permission/i.test(text)) { showCameraHelp("CyberNet AI doesn't have access to the camera. You can allow it in Settings, or choose a photo of the QR code instead.", true); return; }
      // a Mac whose web view still reports touch points lands here when it has no rear camera: a quiet fallback, no error report
      let macLike = false;
      try { macLike = w.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch { /* ignore */ }
      if (!macLike) report(error, "qr scan");
      showCameraHelp("The camera isn't available right now. Choose a photo or a screenshot of the QR code instead.");
    }
  }
  // No touch screen and a fine pointer that hovers: the app is running on a Mac. Both must hold, so an iPhone or an iPad
  // with a trackpad (which still has touch points) never takes the Mac path.
  function pointerOnly() {
    try { return navigator.maxTouchPoints === 0 && w.matchMedia("(hover: hover) and (pointer: fine)").matches; } catch { return false; }
  }
  function showCameraHelp(text, settings = false, camera = false) {
    sheet({
      id: "cnCameraHelp",
      label: "Scan a QR code",
      html: `<h2 class="cn-ios-sheet-title" id="cnScanTitle">Scan a QR code</h2>
        <div class="cn-ios-sheet-body"><p id="cnScanHint">${esc(text)}</p></div>
        <div class="cn-ios-sheet-actions">
          ${camera ? '<button type="button" class="primary-btn full" data-sheet-value="camera" data-autofocus aria-describedby="cnScanHint">Scan with the camera</button>' : ""}
          <button type="button" class="${camera ? "secondary-btn" : "primary-btn"} full" data-sheet-value="photo"${camera ? "" : " data-autofocus"}>Choose a photo of a QR code</button>
          ${settings ? '<button type="button" class="secondary-btn full" data-sheet-value="settings">Open Settings</button>' : ""}
        </div>`,
      // 1.1 bug 9: WebKit opens a file picker only inside the tap itself, so the picker opens here, in the tap; the photo then
      // goes to Quick Scan's Image tab as if it had been chosen there.
      onOpen(panel) {
        panel.setAttribute("aria-labelledby", "cnScanTitle");
        panel.setAttribute("aria-describedby", "cnScanHint");
        panel.removeAttribute("aria-label");
        panel.querySelector('[data-sheet-value="photo"]')?.addEventListener("click", () => pickQrPhoto(), true);
      }
    }).then(choice => {
      if (choice === "camera") { later(startQrScan, 240); return; } // the sheet is gone first; the tab bar stays on Scan QR
      syncTabs();
      if (choice === "settings") openExternal("app-settings:");
    });
  }
  function pickQrPhoto() {
    const picker = el('<input type="file" accept="image/*" hidden>');
    d.body.appendChild(picker);
    picker.addEventListener("change", () => {
      const file = picker.files?.[0];
      picker.remove();
      if (!file) return;
      navigate("cybernet");
      later(() => {
        $('.detect-tab[data-tab="image"]')?.click();
        const field = $("#cyberImageInput");
        if (!field) return;
        try { const dt = new DataTransfer(); dt.items.add(file); field.files = dt.files; } catch (error) { report(error, "qr photo"); return; }
        resultFocusWanted = { box: "#cyberImageResult", until: Date.now() + 20000 };
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }, 380);
    }, { once: true });
    picker.click();
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
  // A Wi-Fi, contact or payment code is not a message or a link: the engine has no signals to put into plain words for it, so
  // plainSummary() would say "We didn't find the usual signs of a scam" over a code that joins a network or asks for money. For
  // these the engine's own reasons and advice are what the sheet shows (the engine's words, unchanged: no detection change).
  const QR_OWN_WORDS = ["wifi", "contact", "payment"];
  function qrSummary(kind, result, plain) {
    if (!QR_OWN_WORDS.includes(kind)) return plain;
    const reasons = (Array.isArray(result?.reasons) ? result.reasons : []).filter(Boolean).slice(0, 3);
    const advice = (Array.isArray(result?.advice) ? result.advice : []).filter(Boolean).slice(0, 2);
    if (!reasons.length) return plain;
    return { lead: String(result.scamType || ""), points: reasons, action: advice.join(" ") };
  }
  function showQrVerdict(value, kind = "qr", opts = {}) {
    const E = w.CyberNetEngine;
    if (!E) { toast("The checker could not load. Please restart the app."); syncTabs(); return; }
    let analysed;
    try { analysed = E.analyzeQr(value); } catch (error) { report(error, "analyzeQr"); toast("This code could not be checked."); syncTabs(); return; }
    const result = analysed.result || { score: 0, reasons: ["The code holds plain text."], advice: [] };
    const v = verdictOf(result);
    const plain = qrSummary(analysed.kind, result, E.plainSummary ? E.plainSummary(result, { fallbackText: "" }) : { lead: "", points: (result.reasons || []).slice(0, 3), action: "" });
    const link = analysed.kind === "url" ? linkParts(value) : null;
    const target = link ? `<p class="cn-ios-qr-target"><span>${esc(link.scheme)}</span><strong>${esc(link.host)}</strong><span>${esc(link.rest)}</span></p>` : `<pre class="cn-ios-qr-raw">${esc(value.slice(0, 600))}</pre>`;
    haptic(v.haptic);
    noteFinishedCheck();
    sheet({
      id: "cnQrVerdict",
      label: `QR code result: ${v.headline}`,
      html: `<p class="cn-ios-sheet-kicker">${kind === "share" ? "Shared item" : "QR code"} · ${esc(analysed.kind === "url" ? "Web link" : "Content")}</p>
        <div class="verdict-headline verdict-headline-${v.tone}" role="heading" aria-level="2" tabindex="-1" data-autofocus><span class="verdict-headline-text">${v.headline}</span></div>
        <div class="cn-ios-sheet-body">
          ${target}
          ${link && signedIn() ? `<div class="cn-ios-shot" data-qr-shot><button type="button" class="secondary-btn full" data-qr="shot">Show a picture of this page</button><p class="cn-ios-note">Sends only this web address to our preview service, which opens the page away from your iPhone.</p></div>` : ""}
          ${plain.lead ? `<p class="plain-lead">${esc(plain.lead)}</p>` : ""}
          <ul class="plain-points">${(plain.points || []).slice(0, 3).map(p => `<li>${esc(p)}</li>`).join("")}</ul>
          ${plain.action ? `<p class="plain-action"><strong>What to do:</strong> ${esc(plain.action)}</p>` : ""}
          <p class="cn-ios-disclaimer-small">${/100% safe/i.test(plain.action || "") ? "It is not antivirus software." : "It is not antivirus software, and no scanner can promise something is 100% safe."}</p>
        </div>
        <div class="cn-ios-sheet-actions cn-ios-qr-actions">
          <button type="button" class="primary-btn full" data-qr="ai">Get an AI explanation</button>
          ${kind === "qr" ? '<button type="button" class="secondary-btn full" data-qr="again">Scan another</button>' : ""}
          <div class="cn-ios-quiet-row">
            <button type="button" class="cn-ios-link-btn" data-qr="copy">Copy</button>
            ${link ? `<button type="button" class="cn-ios-link-btn${v.tone === "safe" ? "" : " cn-ios-danger-link"}" data-qr="open">Open in Safari</button>` : ""}
          </div>
          <button type="button" class="cn-ios-link-btn cn-ios-report-link" data-qr="report">Report a problem with this result</button>
        </div>`,
      onOpen(panel, done) {
        panel.addEventListener("click", async e => {
          const b = e.target.closest("[data-qr]");
          if (!b) return;
          const what = b.getAttribute("data-qr");
          if (what === "copy") copyText(value);
          if (what === "shot" && link) loadPagePicture(panel.querySelector("[data-qr-shot]"), link.href);
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
    }).then(value => {
      syncTabs();
      // closing a LOW RISK verdict is a calm moment for the ratings prompt (not Open in Safari, Scan another or the AI explanation)
      if (value === null && v.tone === "safe") later(() => maybeAskReview("qr"), 400);
    });
  }
  // The picture of a page (owner, 11 Nov 2026): only when a signed-in person taps for it. Only the web address goes to
  // CyberNet AI's server, whose preview service (GetScreenshot, or Microlink) opens the page; the image comes back as data:.
  async function loadPagePicture(box, url) {
    if (!box) return;
    box.innerHTML = '<div class="screenshot-loading"><span class="btn-spinner"></span> Loading a picture of this page…</div>';
    let msg = "Couldn't show a picture of this page right now. Please try again later.";
    try {
      const token = state()?.session?.access_token;
      const res = await w.fetch("/api/screenshot-preview", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ url }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.unreachable) msg = "We couldn't open this page to show a picture of it. This doesn't change the result above.";
      else if (res.ok && typeof data.screenshot === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(data.screenshot)) {
        box.innerHTML = `<img class="cn-ios-shot-img" alt="Picture of the page" src="${esc(data.screenshot)}"><p class="cn-ios-note">A picture shows what the page looks like right now. It doesn't prove the page is safe.</p>`;
        return;
      } else if (data && typeof data.error === "string") msg = data.error;
    } catch (error) { report(error, "pagePicture"); }
    box.innerHTML = `<p class="cn-ios-note" role="status">${esc(msg)}</p>`;
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
    if (requireAccount("cybernetai", () => askAi(text, file))) return; // a guest: the card first; the item is put in once they are in
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

  /* ================================================================ 11. shared items (Share Extension) */
  // SharedInbox plugin: read() -> { items: [{ id, kind: "text"|"url"|"image", text?, url?, imageDataUrl?,
  // createdAt, localVerdict? }] } (newest last), remove({ id }), clear(). The extension already showed
  // the on-device verdict; here the person may ask for an AI explanation.
  let inboxBusy = false;
  async function checkInbox() {
    const inbox = P("SharedInbox");
    if (!inbox || inboxBusy || gateOpen || $("#cnInboxSheet")) return; // while the launch card is up, launch ends with checkInbox()
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
        else { navigate("cybernet"); later(() => { $('.detect-tab[data-tab="text"]')?.click(); const t = $("#cyberTextInput"); if (t) { t.value = String(item.text || "").slice(0, 5000); t.dispatchEvent(new Event("input", { bubbles: true })); $("#cyberTextBtn")?.click(); later(() => $("#cyberTextResult")?.scrollIntoView({ block: "start", behavior: "smooth" }), 650); } }, 380); }
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
    root.classList.toggle("cn-ios-is-offline", off);
    // an open report sheet follows the connection (bug 4)
    const send = $('#cnReportSheet [data-report="send"]'), line = $("#cnReportSheet .cn-ios-sheet-error");
    if (send) send.disabled = off;
    if (line && off) { line.textContent = REPORT_OFFLINE; line.hidden = false; }
    if (line && !off && line.textContent === REPORT_OFFLINE) line.hidden = true;
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
  // VoiceOver (1.1.1): a finished check is read out, wherever VoiceOver is. One polite line on the body (never inside a
  // sheet or the page, which can be inert): the verdict and its first line for Quick Scan, the answer for Analysis AI, a
  // short line for a Recovery plan, and the website's warnings (a wrong file type, no QR code found) as they are.
  let resultFocusWanted = null; // { box, until }: a photo of a QR code was chosen; VoiceOver is taken to its result
  function announce(text) {
    const line = String(text || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!line) return;
    let box = $("#cnIosSay");
    if (!box) { box = el('<div id="cnIosSay" class="cn-ix-sr" role="status" aria-live="polite" aria-atomic="true"></div>'); d.body.appendChild(box); }
    box.textContent = "";
    clearTimeout(announce.t);
    announce.t = setTimeout(() => { box.textContent = line; }, 80); // emptied first, so the same words twice are read twice
  }
  const textIn = (node, sel) => (node && sel ? node.querySelector(sel) : node)?.textContent?.replace(/\s+/g, " ").trim() || "";
  function resultLine(box) {
    if (!box || box.querySelector(".scanning-placeholder, .diagnostic-progress, .btn-spinner")) return ""; // still working
    const head = textIn(box, ".verdict-headline-text") || textIn(box, ".verdict-headline");
    if (head) {
      const lead = textIn(box, ".plain-lead") || textIn(box, ".scam-type-tag");
      return `Result: ${head}.${lead ? ` ${lead}` : ""}`;
    }
    const warn = textIn(box, ".warning");
    if (warn) return warn;
    const all = textIn(box);
    return /will appear here\.?$/.test(all) ? "" : all.slice(0, 220);
  }
  function focusResult(box) {
    const head = box.querySelector(".verdict-headline") || box;
    if (!head.hasAttribute("tabindex")) head.setAttribute("tabindex", "-1");
    scrollToResult(box);
    try { head.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  function watchAnnouncements() {
    const said = new WeakMap();
    for (const sel of ["#cyberTextResult", "#cyberLinkResult", "#cyberImageResult"]) {
      const box = $(sel);
      if (!box) continue;
      let t = 0;
      new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => {
          const line = resultLine(box);
          if (!line) { said.delete(box); return; } // cleared or still working: the next result is read even if it is the same
          if (said.get(box) === line) return;
          said.set(box, line);
          announce(line);
          if (resultFocusWanted?.box === sel && Date.now() < resultFocusWanted.until) { resultFocusWanted = null; later(() => focusResult(box), 120); }
        }, 250);
      }).observe(box, { childList: true, subtree: true, characterData: true });
    }
    const chat = $("#chatMessages");
    if (chat) {
      // the greeting (and anything already there) is never read as an answer: only a reply after the person's own message is
      $$(".chat-bubble-ai", chat).forEach(b => { b.dataset.cnSaid = "done"; });
      let t = 0;
      new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => {
          const bubbles = $$(".chat-bubble-ai", chat);
          const last = bubbles[bubbles.length - 1];
          if (!last || last.dataset.cnSaid === "done") return;
          const asked = $$(".chat-bubble-user", chat).pop();
          if (!asked || !(asked.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
          if (last.querySelector(".diagnostic-progress")) {
            if (!last.dataset.cnSaid) { last.dataset.cnSaid = "busy"; announce("Analysis AI is checking it."); }
            return;
          }
          const head = textIn(last, ".verdict-headline-text") || textIn(last, ".verdict-headline") || textIn(last, ".diagnostic-followup-head");
          const line = head ? `Analysis AI answered: ${head}.` : textIn(last, ".warning") || textIn(last, ".chat-bubble-inner").slice(0, 220);
          if (!line) return;
          last.dataset.cnSaid = "done";
          announce(line);
        }, 300);
      }).observe(chat, { childList: true, subtree: true });
    }
    const plan = $("#recoveryDashboard");
    if (plan) {
      let was = !plan.hidden;
      new MutationObserver(() => {
        const now = !plan.hidden;
        if (now && !was) announce("Your Recovery plan is ready. Start with the first step.");
        was = now;
      }).observe(plan, { attributes: true, attributeFilter: ["hidden"] });
    }
  }
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
        if (area.kind === "quick_scan") addNewCheckX(box);
        const tone = /result-has-danger|verdict-headline-danger/.test(box.className + r.innerHTML.slice(0, 400)) ? "ERROR" : /uncertain/.test(box.className + r.innerHTML.slice(0, 400)) ? "WARNING" : "SUCCESS";
        if (area.kind !== "recovery") { haptic(tone); noteFinishedCheck(); } // a finished check for the ratings prompt (never Recovery)
      }
    }
  }
  // Owner, 21 Nov 2026 (the close X): a Quick Scan verdict fills the screen once it is scrolled into view, so it gets the
  // same round X at its top right. It clears the result and the text or link that was checked and puts the person back at
  // the box, ready for a new check (an image stays chosen: the photo picker is one tap away).
  const RESULT_INPUT = { cyberTextResult: "cyberTextInput", cyberLinkResult: "cyberLinkInput", cyberImageResult: "" };
  const RESULT_EMPTY = { cyberTextResult: "Your text scam result will appear here.", cyberLinkResult: "Your link scam result will appear here.", cyberImageResult: "Your image scam result will appear here." };
  function addNewCheckX(box) {
    if (!(box.id in RESULT_INPUT) || $(":scope > .cn-ios-result-x", box)) return;
    const x = el(`<button type="button" class="cn-ios-sheet-x cn-ios-result-x" aria-label="Close this result and start a new check">${CLOSE_X}</button>`);
    x.addEventListener("click", () => {
      const calm = !/result-has-danger|verdict-headline-danger|uncertain/.test(box.className + box.innerHTML.slice(0, 600)); // a LOW RISK result
      const field = RESULT_INPUT[box.id] ? $(`#${RESULT_INPUT[box.id]}`) : null;
      box.className = "result-box";
      box.textContent = RESULT_EMPTY[box.id];
      if (field) { field.value = ""; field.dispatchEvent(new Event("input", { bubbles: true })); }
      const panel = box.closest(".detect-main") || box;
      const top = w.scrollY + panel.getBoundingClientRect().top - (($(".navbar")?.getBoundingClientRect().bottom) || 0) - 12;
      w.scrollTo({ top: Math.max(0, top), behavior: motionOff() ? "auto" : "smooth" });
      try { (field || panel.querySelector("button, input"))?.focus({ preventScroll: true }); } catch { /* ignore */ }
      if (calm) later(() => maybeAskReview("close"), 400);
    });
    box.prepend(x);
  }
  // 1.1 bug 4: what the report sheet says when it cannot reach CyberNet AI (instead of the web view's "Load failed")
  const REPORT_OFFLINE = `You're offline, so the report can't be sent. Try again when you're connected, or email ${SUPPORT}.`;
  function reportProblem(kind, resultId) {
    sheet({
      id: "cnReportSheet",
      label: "Report a problem with this result",
      html: `<h2 class="cn-ios-sheet-title">Report a problem with this result</h2>
        <div class="cn-ios-sheet-body">
          <label for="cnReportText">What looks wrong? (optional)</label>
          <textarea id="cnReportText" maxlength="1500" rows="4" placeholder="For example: this is a real message from my bank."></textarea>
          <p class="cn-ios-note">The message or link you checked is not attached. Never include passwords, codes or card numbers.</p>
          <p class="cn-ios-sheet-error" role="alert"${offline ? "" : " hidden"}>${offline ? esc(REPORT_OFFLINE) : ""}</p>
        </div>
        <div class="cn-ios-sheet-actions"><button type="button" class="primary-btn full" data-report="send" data-autofocus${offline ? " disabled" : ""}>Send report</button>
        <button type="button" class="cn-ios-link-btn" data-sheet-value="close">Cancel</button></div>`,
      onOpen(panel, done) {
        panel.addEventListener("click", async e => {
          const b = e.target.closest('[data-report="send"]');
          if (!b) return;
          b.disabled = true;
          const error = panel.querySelector(".cn-ios-sheet-error");
          if (offline) { error.textContent = REPORT_OFFLINE; error.hidden = false; return; }
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
          } catch (err) {
            // a network failure is a TypeError ("Load failed" in WebKit, "Failed to fetch" elsewhere): never show the raw text
            const net = err instanceof TypeError || offline;
            error.textContent = net ? REPORT_OFFLINE : (err.message || `The report could not be sent. Email ${SUPPORT} instead.`);
            error.hidden = false;
            b.disabled = !!offline;
          }
        });
      }
    });
  }

  // ---- App Store ratings prompt (app 1.1.1). iOS's own rating prompt (CNReview, ReviewPromptPlugin.swift) is asked for once the
  // person has finished three checks (a Quick Scan text, link or image verdict, a QR or shared-item verdict, or an Analysis AI
  // answer; Recovery never counts). It is never asked for over a verdict: only at a calm moment, which is closing a LOW RISK
  // result, or arriving on Home, Learn or Account. So a SCAM verdict is never followed by the prompt; the next calm moment is.
  // Never while Recovery is open or within 10 minutes of leaving it, never over a sheet, the sign-in card or the intro, and at
  // most once every 60 days (iOS also limits it to three times a year). The counters stay on this iPhone (localStorage, not the
  // Preferences that sign-out clears, so the 60 days survive a sign-out). The Account tab's "Rate CyberNet AI" row is always there.
  const REVIEW_KEY = "cn-review-1";
  const REVIEW_AFTER = 3;
  const REVIEW_GAP_MS = 60 * 24 * 60 * 60 * 1000;
  const REVIEW_AFTER_RECOVERY_MS = 10 * 60 * 1000;
  const REVIEW_CALM_PAGES = ["home", "learn", "account"];
  const APP_REVIEW_URL = "https://apps.apple.com/app/id6828596086?action=write-review";
  const reviewMoment = { recoveryAt: 0 };
  function reviewRead() {
    try {
      const v = JSON.parse(store.get(REVIEW_KEY) || "{}") || {};
      return { checks: Math.max(0, Math.floor(Number(v.checks) || 0)), askedAt: Math.max(0, Number(v.askedAt) || 0) };
    } catch { return { checks: 0, askedAt: 0 }; }
  }
  function reviewDue(s, now) {
    return s.checks >= REVIEW_AFTER && (!s.askedAt || now - s.askedAt >= REVIEW_GAP_MS);
  }
  // A finished check (never Recovery). Counting only: the prompt waits for a calm moment.
  function noteFinishedCheck() {
    const s = reviewRead();
    s.checks = Math.min(s.checks + 1, 1000);
    store.set(REVIEW_KEY, JSON.stringify(s));
  }
  // A calm moment: ask if three checks are done, 60 days have passed and nothing else is on the screen. true when it asked.
  function maybeAskReview(where, now = Date.now()) {
    const review = P("CNReview");
    if (!review) return false;
    const s = reviewRead();
    if (!reviewDue(s, now)) return false;
    if (activePage() === "recovery" || (reviewMoment.recoveryAt && now - reviewMoment.recoveryAt < REVIEW_AFTER_RECOVERY_MS)) return false;
    if (sheetStack.length || cardOpen || $("#cnIntroStage") || offline) return false;
    // the stamp is written first, so a prompt that fails (or a page that reloads) never asks again within the 60 days
    store.set(REVIEW_KEY, JSON.stringify({ checks: 0, askedAt: now }));
    try { Promise.resolve(review.requestReview()).catch(error => report(error, `review ${where}`)); } catch (error) { report(error, `review ${where}`); }
    return true;
  }
  function rateApp() { openExternal(APP_REVIEW_URL); }

  // Analysis AI's page opens with the website's "Sign in, then paste ..." lines. In the app a guest never sees the
  // page (the sign-in card comes first) and a signed-in person is already in, so none of it may ask for a sign-in;
  // script.js writes the real state over the two status lines as soon as the account answers.
  const AI_GREETING = "Paste anything suspicious below: a message, a link or a screenshot. Analysis AI works out what it is looking at and explains it in plain language.";
  function tidyAnalysisAi() {
    const bubble = $("#chatMessages .chat-bubble-ai .chat-bubble-inner");
    if (bubble && /^Sign in/.test(bubble.textContent.trim())) bubble.textContent = AI_GREETING;
    const status = $("#aiApiStatus");
    if (status && /^Sign in/.test(status.textContent.trim())) status.textContent = "Checking your daily AI analyses.";
    const saved = $("#proHistoryList > p");
    if (saved && /^Sign in/.test(saved.textContent.trim())) saved.textContent = "Your saved explanations appear here.";
  }

  // 1.1 design item 12: empty and loading states. Analysis AI offers three example prompts until the first message (a tap
  // only fills the box; nothing is sent until Send); Recovery says plainly when there is no case yet; a count that is still
  // loading ("—" or "— / —") shows a quiet bar instead of dashes; Recovery's reset time is the iPhone's local time.
  const AI_PROMPTS = ["Is this parcel text real?", "Check a link someone sent me", "Someone says they're from my bank"];
  function emptyStates() {
    const bubble = $("#chatMessages .chat-bubble-ai");
    if (bubble && !$("#cnIosPrompts")) {
      const row = el(`<div class="cn-ios-prompts" id="cnIosPrompts" role="group" aria-label="Example questions">${AI_PROMPTS.map(p => `<button type="button" class="cn-chip" data-ios-prompt>${esc(p)}</button>`).join("")}</div>`);
      row.addEventListener("click", e => {
        const b = e.target.closest("[data-ios-prompt]");
        const input = $("#chatInput");
        if (!b || !input) return;
        input.value = b.textContent;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        try { input.focus({ preventScroll: true }); } catch { input.focus(); }
        tick();
      });
      bubble.after(row);
      const messages = $("#chatMessages");
      const sync = () => { row.hidden = $$(".chat-bubble", messages).length > 1; };
      new MutationObserver(sync).observe(messages, { childList: true });
      sync();
    }
    const dash = $("#recoveryDashboard");
    const head = $("#recovery .feature-page-header");
    if (dash && head && !$("#cnIosNoCase")) {
      const note = el('<p class="cn-ios-empty" id="cnIosNoCase">No cases yet. Describe what happened below, and Recovery gives you a plan, step by step.</p>');
      head.appendChild(note);
      const sync = () => { note.hidden = !dash.hidden; };
      new MutationObserver(sync).observe(dash, { attributes: true, attributeFilter: ["hidden"] });
      sync();
    }
    const reset = $("#recoveryUsageCaseReset");
    if (reset && /GST/.test(reset.textContent)) {
      // the server's day starts at 12:00 in the UAE (UTC+4), which is 08:00 UTC
      let at = "";
      try { at = new Date(Date.UTC(2026, 0, 1, 8, 0)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { /* keep the words */ }
      reset.textContent = at ? `Resets every day at ${at}` : "Resets every day at noon, UAE time";
    }
    const counts = ["#cnAcctAi", "#cnAcctRec", "#recoveryUsageCaseText", "#aiUsageText", "#analysisAiHeaderUsageText"].map(s => $(s)).filter(Boolean);
    const paint = n => n.classList.toggle("cn-ios-loading", /^[—–-]\s*(\/\s*[—–-])?$/.test(n.textContent.trim()));
    for (const n of counts) {
      new MutationObserver(() => paint(n)).observe(n, { childList: true, characterData: true, subtree: true });
      paint(n);
    }
  }
  // The "not antivirus" line on the Check screen (B2), and press feedback / tab states that the
  // website's 65-press.js gives (not in the app's UI build).
  function addCheckDisclaimer() {
    const head = $("#cybernet .feature-page-header");
    if (!head || $("#cnIosDisclaimer")) return;
    head.appendChild(el('<p class="cn-ios-disclaimer" id="cnIosDisclaimer">CyberNet AI helps you judge suspicious messages, links and QR codes. It is not antivirus software, and no scanner can promise something is 100% safe.</p>'));
  }
  // 1.1 bug 3: Home's "Try" chips and "Start scanning" open Check and run the scan, but the verdict is drawn far below the
  // fold. Once it has painted, the verdict is scrolled up under the bar and the Check switch (at once under Reduce Motion).
  const SCAN_RESULTS = ["#cyberTextResult", "#cyberLinkResult", "#cyberImageResult"];
  function scrollToResult(box) {
    const bar = $(".navbar")?.getBoundingClientRect().bottom || 0;
    const seg = $("#cnIosSegWrap");
    const top = Math.max(bar, seg && !seg.hidden ? seg.getBoundingClientRect().bottom : 0);
    const y = w.scrollY + box.getBoundingClientRect().top - Math.max(0, top) - 12;
    w.scrollTo({ top: Math.max(0, y), behavior: motionOff() ? "auto" : "smooth" });
  }
  function followHomeScans() {
    d.addEventListener("click", e => {
      if (!e.target.closest?.("#cnScanBox [data-cn-try], #cnScanBox .hero-buttons button")) return;
      const boxes = SCAN_RESULTS.map(s => $(s)).filter(Boolean);
      const before = new Map(boxes.map(b => [b, b.innerHTML]));
      const t0 = Date.now();
      const mo = new MutationObserver(() => {
        const box = boxes.find(b => b.innerHTML !== before.get(b) && b.offsetParent !== null && b.querySelector(".scan-report, .diagnostic-report, .verdict-headline"));
        if (box) { mo.disconnect(); later(() => scrollToResult(box), 80); }
        else if (Date.now() - t0 > 6000) mo.disconnect();
      });
      boxes.forEach(b => mo.observe(b, { childList: true, subtree: true }));
      later(() => mo.disconnect(), 6500);
    });
  }
  // 1.1 bug 1: the how-to guide is a full-screen sheet in the app too; the native tab bar steps aside while it is open
  // (it would cover the guide's Back / Next row), and comes back when it closes.
  // Owner, 21 Nov 2026: "Learn how to use these features: fix it to actually lead you to an instruction manual like the
  // website". The Home pill opens the app's user guide: an Apple-style help page (a large title, grouped topics with
  // icons, and for each topic numbered steps, tips and a button that opens the feature). It covers every feature the app
  // has, in the app's own words (no plans or prices). It lives in the how-to guide's full-screen sheet (#howtoVideoModal),
  // so script.js still opens and closes it (the pill, Escape, the Close X) and watchHowto() keeps the tab bar aside.
  const GUIDE_ICON = {
    text: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z"/><path d="M7.5 9.5h9M7.5 12.5h6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L11.5 6.84"/><path d="M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.33-1.33"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
    qr: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13v3"/>',
    share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5H6.5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7.5a1 1 0 0 0-1-1h-2"/>',
    ai: '<path d="M11 3.5c.6 4 2.6 6 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.5 5.9-2.5 6.5-6.5Z"/><path d="M18.5 15c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/>',
    recovery: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/>',
    learn: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    account: '<circle cx="12" cy="9" r="3.6"/><path d="M5.5 19.2c1.3-3 3.7-4.4 6.5-4.4s5.2 1.4 6.5 4.4"/><circle cx="12" cy="12" r="9"/>'
  };
  const GUIDE = [
    { group: "Check something", topics: [
      { id: "text", icon: "text", tint: "blue", title: "Check a message", sub: "A text, email or DM",
        lead: "Quick Scan checks a message on your iPhone in about a second. It needs no account, and the message is not sent to an AI.",
        steps: ["Tap Check at the bottom of the screen. Quick Scan is selected at the top.", "Tap Text detection.", "Copy the whole message, including any links. Then touch and hold the box and tap Paste.", "Tap Start the analysis.", "Read the answer at the top of the result: SCAM or LOW RISK. Under it you see why, and What to do next.", "To check something else, tap the X at the top right of the result."],
        tips: [["Never paste secrets", "Leave out passwords, one-time codes, card numbers and recovery phrases."], ["Want it explained?", "Analysis AI explains a message in plain language. See Analysis AI below."]],
        go: { label: "Check a message", page: "cybernet", tab: "text" } },
      { id: "link", icon: "link", tint: "teal", title: "Check a link", sub: "A web address on its own",
        lead: "Check a link before you open it. Quick Scan looks at where the address really goes.",
        steps: ["Tap Check, then Link detection.", "Touch and hold the link where you found it and tap Copy Link (or Copy).", "Touch and hold the box, tap Paste, then tap Start the analysis.", "Read the answer: SCAM, LOW RISK or, for a link right on the edge, CAN'T CONFIRM.", "If the answer is not LOW RISK, don't open the link. Go to the company's app or website yourself."],
        tips: [["LOW RISK is not a promise", "It means CyberNet AI found no warning signs, not that the link is certain to be harmless. If a link asks for a password or a payment, go to the company's app or website yourself."]],
        go: { label: "Check a link", page: "cybernet", tab: "link" } },
      { id: "image", icon: "image", tint: "green", title: "Check a screenshot or photo", sub: "A picture of a message or a QR code",
        lead: "Quick Scan finds a QR code inside a picture and checks it. To read the words in a screenshot, use Analysis AI.",
        steps: ["Tap Check, then Image detection.", "Tap the box to choose a screenshot or photo.", "Quick Scan checks any QR code in the picture and tells you what it found.", "If the picture has no QR code, it tells you so. For the words in a screenshot, send it to Analysis AI."],
        tips: [["Cover private details first", "Before you send a screenshot for an AI explanation, crop out names, account numbers and codes."]],
        go: { label: "Check a picture", page: "cybernet", tab: "image" } },
      { id: "qr", icon: "qr", tint: "orange", title: "Scan a QR code", sub: "With the camera, or from a photo",
        lead: "Check a QR code before you act on it. Nothing opens until you choose.",
        steps: ["Tap Scan QR at the bottom of the screen, then Scan with the camera. Or tap Choose a photo of a QR code to check a photo or a screenshot.", "The first time, allow CyberNet AI to use the camera.", "Point the camera at the code. The result opens by itself.", "Read the answer and what the code holds (a web link, Wi-Fi, a contact or plain text).", "Choose what to do: Get an AI explanation, Scan another, Copy, or Open in Safari. A risky link asks you again before it opens.", "Tap the X at the top right to close the result."],
        tips: [["No camera?", "On a Mac, or if the camera is off for CyberNet AI, choose a photo of the QR code instead. A screenshot works too."], ["Using VoiceOver?", "Choose a photo of a QR code is often easier than aiming the camera. The result is read out when it is ready."]],
        go: { label: "Scan a QR code", action: "scan" } },
      { id: "share", icon: "share", tint: "indigo", title: "Share to CyberNet AI", sub: "Check from Safari, Photos and more",
        lead: "Send a link, a picture or text to CyberNet AI from another app, without copying it first.",
        steps: ["Turn it on once: in Safari or Photos, tap Share.", "Scroll the row of apps to the end, tap More, and turn on CyberNet AI.", "From then on, tap Share and choose CyberNet AI. You get a quick check right there.", "Open CyberNet AI if you want an AI explanation of what you shared."],
        tips: [["A text message?", "Messages can't share a text to other apps. Copy it and paste it into Check."]],
        go: { label: "Show me how to turn it on", action: "share-help" } }
    ] },
    { group: "Get help after a scam", topics: [
      { id: "ai", icon: "ai", tint: "purple", title: "Analysis AI", sub: "An AI explanation in plain language",
        lead: "Analysis AI reads a message, a link or a screenshot and explains in plain language what looks wrong and what to do.",
        steps: ["Tap Check, then Analysis AI at the top. Sign in if you are asked: Analysis AI needs an account.", "Paste the message or link into the box. To add a screenshot, tap the attach button.", "Check what will be sent, then tap Send.", "The first time, CyberNet AI asks before anything is sent for an AI explanation. Tap Allow to go on.", "Read the explanation: the answer, the evidence, and what to do next. It is saved under Saved explanations."],
        tips: [["A daily number", "You get a set number of AI explanations each day. The count is at the top of the page."], ["Your choice", "You can turn AI analysis off at any time in Account."]],
        go: { label: "Open Analysis AI", page: "cybernetai" } },
      { id: "recovery", icon: "recovery", tint: "red", title: "Recovery Mode", sub: "A step-by-step plan after a scam",
        lead: "If something already went wrong, Recovery turns it into a calm plan: what to do now, what to secure next, and what to watch for.",
        steps: ["Tap Recovery at the bottom of the screen. Sign in if you are asked: Recovery needs an account.", "Under What happened?, describe it in your own words.", "Pick the incident type, when it happened and your country or region, and tick what applies (for example, I entered my password).", "Tap Start Recovery.", "Work through the plan from the top: it is ordered by what matters most. Tick each step when it is done.", "Your case is saved under Your Recovery cases, so you can come back to it."],
        tips: [["Never include secrets", "No passwords, codes, card numbers or recovery phrases."], ["Reminders", "In Account, turn on Recovery reminders to get a reminder after 1, 3 and 7 days."]],
        go: { label: "Open Recovery", page: "recovery" } }
    ] },
    { group: "Learn and settings", topics: [
      { id: "learn", icon: "learn", tint: "yellow", title: "Learn", sub: "Short lessons on staying safe",
        lead: "The Learn Center has short lessons on scams, passwords, privacy and what to do after an attack. It needs no account.",
        steps: ["Tap Learn at the bottom of the screen.", "Start at the top and follow the roadmap, or tap a topic such as Scams or Passwords.", "Open a lesson to read it, with examples and tips.", "Looking for something? Type it in Find something specific."],
        tips: [],
        go: { label: "Open Learn", page: "learn" } },
      { id: "account", icon: "account", tint: "gray", title: "Account and privacy", sub: "Your data, reminders and help",
        lead: "Account holds your privacy choices, your data and help.",
        steps: ["Tap Account at the bottom of the screen.", "When you're signed in: under Privacy & data, turn AI analysis on or off, export your data, clear saved history or delete your account.", "When you're signed in: under Notifications, turn Recovery reminders on or off.", "Under Help, contact support, turn on Share to CyberNet AI, or see the welcome tips again."],
        tips: [["No account?", "Quick Scan, Scan QR, Share and Learn work without one. Analysis AI and Recovery need a CyberNet AI account."]],
        go: { label: "Open Account", page: "account" } }
    ] }
  ];
  const GUIDE_TOPICS = GUIDE.flatMap(g => g.topics);
  // the website's walkthrough keys (script.js openHowtoVideo) map onto the guide's topics
  const GUIDE_FROM_KEY = { protect: "", cybernetai: "ai", recovery: "recovery" };
  const guideIcon = (t, cls = "") => `<span class="cn-guide-icon cn-guide-${t.tint}${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GUIDE_ICON[t.icon]}</svg></span>`;
  const CHEVRON = '<svg class="cn-guide-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let guide = null; // { modal, bar, body, back, barTitle } once built
  function buildGuide() {
    const modal = $("#howtoVideoModal");
    const shell = modal?.querySelector(".video-player-shell");
    const close = $("#closeHowtoVideo");
    if (!modal || !shell || !close || guide) return;
    // The website's title, tabs and player stay in the page for script.js, out of sight: the guide replaces them.
    const legacy = el('<div class="cn-guide-legacy" hidden></div>');
    [...shell.children].forEach(c => legacy.appendChild(c));
    close.className = "cn-ios-sheet-x cn-ios-head-x";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = CLOSE_X;
    const bar = el(`<div class="cn-guide-bar">
        <button type="button" class="cn-guide-back" data-guide-back hidden><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Guide</button>
        <p class="cn-guide-bar-title" aria-hidden="true"></p>
      </div>`);
    bar.appendChild(close);
    const body = el('<div class="cn-guide-body" id="cnGuide"></div>');
    shell.setAttribute("aria-labelledby", "cnGuideTitle");
    shell.classList.add("cn-guide");
    shell.append(bar, body, legacy);
    guide = { modal, shell, bar, body, back: bar.querySelector("[data-guide-back]"), barTitle: bar.querySelector(".cn-guide-bar-title") };
    guide.back.addEventListener("click", () => showGuide(""));
    body.addEventListener("click", e => {
      const row = e.target.closest?.("[data-guide-topic]");
      if (row) { showGuide(row.getAttribute("data-guide-topic")); return; }
      const go = e.target.closest?.("[data-guide-go]");
      if (go) guideGo(GUIDE_TOPICS.find(t => t.id === go.getAttribute("data-guide-go")));
    });
    // the large title hands over to the small one in the bar once it scrolls under it, as in a navigation bar
    shell.addEventListener("scroll", () => { guide.bar.classList.toggle("is-scrolled", shell.scrollTop > 44); }, { passive: true });
  }
  function showGuide(id) {
    if (!guide) return;
    const topic = GUIDE_TOPICS.find(t => t.id === id);
    guide.back.hidden = !topic;
    guide.barTitle.textContent = topic ? topic.title : "User Guide";
    guide.bar.classList.remove("is-scrolled");
    guide.body.innerHTML = topic ? guideTopicHtml(topic) : guideIndexHtml();
    guide.shell.scrollTop = 0;
    const title = $("#cnGuideTitle", guide.body);
    try { title?.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  function guideIndexHtml() {
    return `<h2 class="cn-guide-title" id="cnGuideTitle" tabindex="-1">User Guide</h2>
      <p class="cn-guide-lead">How to use each part of CyberNet AI, step by step.</p>
      ${GUIDE.map(g => `<h3 class="cn-guide-group">${esc(g.group)}</h3>
        <ul class="cn-guide-list" role="list">${g.topics.map(t => `<li><button type="button" class="cn-guide-row" data-guide-topic="${t.id}">${guideIcon(t)}<span class="cn-guide-row-text"><span class="cn-guide-row-title">${esc(t.title)}</span><span class="cn-guide-row-sub">${esc(t.sub)}</span></span>${CHEVRON}</button></li>`).join("")}</ul>`).join("")}
      <p class="cn-guide-foot">Still stuck? Write to ${esc(SUPPORT)}.</p>`;
  }
  function guideTopicHtml(t) {
    return `<div class="cn-guide-hero">${guideIcon(t, " cn-guide-icon-lg")}<h2 class="cn-guide-title" id="cnGuideTitle" tabindex="-1">${esc(t.title)}</h2></div>
      <p class="cn-guide-lead">${esc(t.lead)}</p>
      <h3 class="cn-guide-group">Steps</h3>
      <ol class="cn-guide-steps">${t.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
      ${t.tips.map(([h, p]) => `<div class="cn-guide-tip"><p class="cn-guide-tip-title">${esc(h)}</p><p>${esc(p)}</p></div>`).join("")}
      <button type="button" class="primary-btn full cn-guide-go" data-guide-go="${t.id}">${esc(t.go.label)}</button>`;
  }
  // The topic's button closes the guide and opens the feature (a guest asked for Analysis AI or Recovery gets the sign-in card).
  function guideGo(t) {
    if (!t) return;
    $("#closeHowtoVideo")?.click();
    later(() => {
      const g = t.go;
      if (g.action === "scan") { openScan(); return; }
      if (g.action === "share-help") { showShareHelp(); return; }
      if (g.page === "cybernetai") { if (!requireAccount("cybernetai")) arrive("cybernetai"); return; }
      if (g.page === "cybernet" && $("#cnIosSeg")) pickCheckMode("cybernet"); else navigate(g.page);
      if (g.tab) later(() => { $(`.detect-tab[data-tab="${g.tab}"]`)?.click(); scrollToTop(); }, 400);
    }, 60);
  }
  // Which topic was asked for: the pill opens the guide's contents; a walkthrough key (if one is ever used) opens its topic.
  let guideAsk = "", guideFrom = null;
  d.addEventListener("click", e => {
    const t = e.target.closest?.("#heroLearnFeaturesBtn, [data-video]");
    if (t && !t.closest("#howtoVideoModal")) { guideAsk = t.id === "heroLearnFeaturesBtn" ? "" : (GUIDE_FROM_KEY[t.getAttribute("data-video")] ?? ""); guideFrom = t; }
  }, true);

  function watchHowto() {
    const modal = $("#howtoVideoModal");
    if (!modal) return;
    buildGuide();
    let open = false;
    new MutationObserver(() => {
      const now = modal.classList.contains("show");
      if (now === open) return;
      open = now;
      if (now) { showGuide(guideAsk); guideAsk = ""; if (!guideFrom && d.activeElement !== d.body) guideFrom = d.activeElement; }
      inertBehind(now);
      // VoiceOver and the keyboard come back to what opened the guide (a tap on WebKit does not focus a button)
      if (!now) { const from = guideFrom; guideFrom = null; later(() => focusBack(from), 60); }
      if (!nativeTabs) return;
      if (now) nativeTabs.setHidden({ hidden: true }).catch(() => {});
      else if (!barByCard && !$("#cnIntroStage")) nativeTabs.setHidden({ hidden: false }).catch(() => {});
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
    // the guide's own tabs get the selection tick of a native segmented control
    modal.addEventListener("click", e => { if (e.target.closest?.(".video-modal-tab:not(.active)")) tick(); });
  }
  function pressStates() {
    d.addEventListener("touchstart", () => {}, { passive: true });
    // 1.1 design item 11: a selection tick when the inner Text / Link / Image tabs change, like a native segmented control
    d.addEventListener("click", e => { if (e.target.closest?.(".detect-tabs .detect-tab:not(.active)")) tick(); });
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
  // Larger Text: follow the iPhone's text size (Dynamic Type) up to the largest accessibility sizes (AX5 body is about 53 pt,
  // so a 16..40 px root covers about 235%). It runs at start and again each time the app comes back (the size may have changed).
  function dynamicType() {
    const probe = el('<span aria-hidden="true" style="position:absolute;visibility:hidden;font:-apple-system-body">x</span>');
    d.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    if (Number.isFinite(px) && px > 0) root.style.fontSize = `${Math.min(40, Math.max(16, px * (16 / 17)))}px`;
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
      buildCheckSwitch();
      watchPages();
      bindAccount();
      renderAccount();
      setupSignupConsent();
      setupApple();
      watchAuthModal();
      accountReady(5000).then(watchSignIn); // needs the Supabase client, which script.js builds after this file first runs
      tidyAnalysisAi();
      addCheckDisclaimer();
      guardAccountLinks();
      followHomeScans();
      emptyStates();
      watchHowto();
      pressStates();
      dynamicType();
      watchNetwork();
      new MutationObserver(() => { clearTimeout(start.dt); start.dt = setTimeout(decorateResults, 120); }).observe($("#cnMain") || d.body, { childList: true, subtree: true });
      watchAnnouncements();
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
      ln?.addListener("localNotificationActionPerformed", ev => { if (ev?.notification?.extra?.open === "recovery") openRecoveryFromReminder().catch(error => report(error, "reminder")); });
      const app = P("App");
      app?.addListener("appStateChange", ({ isActive }) => {
        const auth = supabase()?.auth;
        try { if (isActive) auth?.startAutoRefresh?.(); else auth?.stopAutoRefresh?.(); } catch { /* ignore */ }
        if (isActive) { later(checkInbox, 300); startTracking(false); dynamicType(); }
      });
      const kb = P("Keyboard");
      kb?.addListener("keyboardWillShow", () => { root.classList.add("cn-kb-open"); nativeTabs?.setHidden({ hidden: true }).catch(() => {}); });
      kb?.addListener("keyboardWillHide", () => { root.classList.remove("cn-kb-open"); nativeTabs?.setHidden({ hidden: barByCard || !!$("#cnIntroStage") }).catch(() => {}); });
      P("StatusBar")?.setStyle({ style: "DARK" }).catch(() => {});
      // The launch (section 7d). The stage (the first launch's motion, the short gate for a signed-out person on a later
      // launch, or the stage that opens onto Check for everyone else) goes up under the launch screen, which then hides onto
      // it once the session check has answered (the Keychain: milliseconds; 1.2 s at most). A link or a shared item: no stage.
      const first = !store.get(INTRO_KEY);
      const prepared = (first ? prepareIntro() : prepareGate()).catch(error => report(error, first ? "intro" : "gate"));
      const hideSplash = () => requestAnimationFrame(() => requestAnimationFrame(() => P("SplashScreen")?.hide().catch(() => {})));
      prepared.then(hideSplash);
      later(() => P("SplashScreen")?.hide().catch(() => {}), 3000);
      // A launch step that fails (an intro or a gate that rejects) is reported and the launch goes on: the tracking question and the
      // shared item (in finally) are never skipped because of it. After a deletion that Apple could not complete, its one step is last.
      const appleLeft = appleLeftoverDue();
      later(async () => {
        try {
          await prepared;
          if (first) await showIntro(); else await showGate();
        } catch (error) { report(error, "launch"); }
        finally {
          try { await startTracking(true); } catch (error) { report(error, "tracking"); }
          try { if (appleLeft) await showAppleLeftover(); } catch (error) { report(error, "apple leftover"); }
          checkInbox();
        }
      }, 600);
    } catch (error) { report(error, "start"); }
  }

  /* ================================================================ 1.1.1: the daily limit sheet */
  // Shown once, right after something was refused for today: the server's 429 for an AI explanation, a Recovery case or a
  // Recovery update (code daily_limit_reached or cooldown_active, seen by the fetch layer above), or script.js's own
  // pre-check before an AI explanation (its "You've used today's AI explanations" bubble). Never at launch, never on its own.
  // The inline messages and meters stay as they are. The sheet says what ran out, when it comes back (a live countdown and
  // the local clock time) and has OK. It names no plan and nothing to buy: in in-app purchase builds ios/store.js may add
  // one offer through CNPro.limitOffer (Free accounts only, it opens the paywall); a CN_NO_IAP=1 build has no store.js.
  const LIMIT_TEXT = Object.freeze({
    ai: { title: "You've used today's AI explanations", one: "AI explanation", many: "AI explanations", again: "AI explanations are available again." },
    cases: { title: "You've used today's Recovery cases", one: "Recovery case", many: "Recovery cases", again: "You can start a new Recovery case now." },
    updates: { title: "You've used today's Recovery updates", one: "Recovery update", many: "Recovery updates", again: "You can send a Recovery update now." },
    cooldown: { title: "Your next Recovery update is ready in", again: "You can send your next Recovery update now.", line: "Recovery updates have a short wait between them, so each one can build on the last." }
  });
  const LIMIT_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v4.2l2.6 1.6M9.5 2.8h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // AI explanations reset at 00:00 UTC; the Recovery window at 12:00 PM Asia/Dubai = 08:00 UTC (netlify/lib/app-tier.mjs).
  function nextUtc(hour, now = Date.now()) {
    const t = new Date(now);
    let at = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hour, 0, 0, 0);
    if (at <= now) at += 86400e3;
    return at;
  }
  function limitDeadline(kind, usage, now = Date.now()) {
    if (kind === "cooldown") {
      const s = Number(usage?.cooldownSecondsRemaining ?? usage?.cooldown_seconds_remaining);
      if (Number.isFinite(s) && s > 0) return now + Math.min(s, 86400) * 1000;
    }
    const given = Date.parse((kind === "ai" ? usage?.resetDate || usage?.resetAt : usage?.resetAt || usage?.reset_at) || "");
    // the server's time when it is a sensible one (within the next day); otherwise the known reset
    if (Number.isFinite(given) && given > now && given - now <= 86400e3 + 60e3) return given;
    return nextUtc(kind === "ai" ? 0 : 8, now);
  }
  function waitText(ms) {
    const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${m}m`;
  }
  function clockText(at, now = Date.now()) {
    let time;
    try { time = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { time = new Date(at).toTimeString().slice(0, 5); }
    const day = x => new Date(x).toDateString();
    return day(at) === day(now) ? `at ${time} today` : day(at) === day(now + 86400e3) ? `at ${time} tomorrow` : `at ${time}`;
  }
  let limitOpen = null, limitLast = { kind: "", at: 0 };
  function limitSheet(kind, usage, trigger) {
    const text = LIMIT_TEXT[kind];
    if (!text || limitOpen) return limitOpen?.promise || Promise.resolve(null);
    if (limitLast.kind === kind && Date.now() - limitLast.at < 4000) return Promise.resolve(null); // one refusal, one sheet
    limitLast = { kind, at: Date.now() };
    const back = trigger && trigger !== d.body ? trigger : d.activeElement;
    const deadline = limitDeadline(kind, usage);
    const limit = Number(usage?.limit ?? usage?.daily_limit);
    const line = kind === "cooldown" ? text.line
      : Number.isFinite(limit) && limit > 0 && limit < 1000 ? `Your account includes ${limit} ${limit === 1 ? text.one : text.many} a day.` : "";
    let offer = null;
    /*@iap*/
    try { offer = w.CNPro?.limitOffer?.(kind) || null; } catch (error) { report(error, "limit offer"); } // in-app purchase builds only
    /*@end-iap*/
    const actions = offer
      ? `<button type="button" class="primary-btn full cn-limit-cta" data-sheet-value="offer" data-autofocus>${esc(offer.label)}</button><button type="button" class="cn-ios-link-btn cn-limit-later" data-sheet-value="later">Not now</button>`
      : '<button type="button" class="primary-btn full cn-limit-cta" data-sheet-value="ok" data-autofocus>OK</button>';
    let timer = 0;
    const paintWait = panel => {
      const left = deadline - Date.now();
      const title = $(".cn-limit-title", panel), when = $(".cn-limit-when", panel);
      if (!title || !when) return;
      if (left <= 0) {
        if (kind === "cooldown") title.textContent = "Your next Recovery update is ready";
        when.innerHTML = `<span class="cn-limit-in">${esc(text.again)}</span>`;
        when.classList.add("is-ready");
        clearInterval(timer);
        return;
      }
      if (kind === "cooldown") title.textContent = `${text.title} ${waitText(left)}`;
      when.innerHTML = kind === "cooldown"
        ? `<span class="cn-limit-in">Ready ${esc(clockText(deadline))}</span>`
        : `<span class="cn-limit-in">Resets in ${esc(waitText(left))}</span><span class="cn-limit-at">${esc(clockText(deadline))}</span>`;
    };
    const onShow = () => { if (!d.hidden && limitOpen) paintWait(limitOpen.panel); };
    const promise = sheet({
      id: "cnLimitSheet",
      label: "Daily limit",
      html: `<div class="cn-limit-head"><span class="cn-limit-icon">${LIMIT_ICON}</span><h2 class="cn-ios-sheet-title cn-limit-title" id="cnLimitTitle">${esc(text.title)}</h2>${line ? `<p class="cn-limit-line">${esc(line)}</p>` : ""}</div>
        <p class="cn-limit-when"></p>${offer?.line ? `<p class="cn-limit-offer">${esc(offer.line)}</p>` : ""}
        <div class="cn-ios-sheet-actions">${actions}</div>`,
      onOpen(panel) {
        panel.classList.add("cn-limit-sheet");
        panel.setAttribute("aria-labelledby", "cnLimitTitle");
        panel.removeAttribute("aria-label");
        if (limitOpen) limitOpen.panel = panel;
        paintWait(panel);
        timer = setInterval(() => paintWait(panel), 30000);
        d.addEventListener("visibilitychange", onShow);
      }
    }).then(value => {
      clearInterval(timer);
      d.removeEventListener("visibilitychange", onShow);
      limitOpen = null;
      limitLast = { kind: "", at: 0 }; // a deliberate retry after closing gets its own sheet
      if (value === "offer" && offer?.open) later(() => offer.open(), 240);
      else later(() => { if (back?.isConnected && !back.disabled) { try { back.focus({ preventScroll: true }); } catch { /* ignore */ } } }, 0);
      return value;
    });
    limitOpen = { promise, panel: null };
    limitOpen.panel = $("#cnLimitSheet .cn-ios-sheet");
    return promise;
  }
  // The server's refusal, read from a copy of the reply (script.js reads the original and shows its own message first).
  function noteLimitReply(url, res, trigger) {
    res.clone().json().then(data => {
      const code = data?.code;
      if (code !== "daily_limit_reached" && code !== "cooldown_active") return;
      const kind = /recovery-update/.test(url) ? (code === "cooldown_active" ? "cooldown" : "updates") : /recovery-mode/.test(url) ? "cases" : "ai";
      later(() => limitSheet(kind, data.usage || {}, trigger), 60);
    }).catch(() => {});
  }
  // script.js's AI pre-check adds this bubble without asking the server (today's count is already used up).
  function watchLimitBubbles() {
    const box = $("#chatMessages");
    if (!box) return;
    new MutationObserver(list => {
      for (const m of list) for (const n of m.addedNodes) {
        if (n.nodeType !== 1 || !n.classList?.contains("chat-bubble-ai")) continue;
        if (/^You've used today's AI explanations/.test(n.querySelector(".warning")?.textContent || "")) later(() => limitSheet("ai", state()?.usage || {}, $("#chatSendBtn")), 60);
      }
    }).observe(box, { childList: true });
  }
  onReady(watchLimitBubbles);

  w.CNIos = Object.freeze({
    version: VERSION, openLegal, startQrScan, showQrVerdict, askConsent, showIntro, checkInbox, reportProblem, navigate,
    // shared with the app's other files (1.1: ios/store.js)
    P, sheet, toast, haptic, tick, esc, report, store, state, signedIn, authHeaders, signInCard, openExternal, activePage, motionOff, limitSheet,
    isOffline: () => offline
  });
  onReady(start);
})();
