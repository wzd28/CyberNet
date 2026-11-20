/* CyberNet AI iPhone app 1.1: CyberNet AI Pro with Apple In-App Purchase (StoreKit 2). In-app purchase builds only: a
   CN_NO_IAP=1 build has no copy of this file (mobile/scripts/build-web.mjs), and the bundle gate refuses it there.
   Loaded after ios.js (it uses window.CNIos) and before cn-analytics.js.

   What it owns
     - the Pro paywall sheet: Apple's own prices (StoreKit displayPrice, never typed here), Yearly and Monthly, Continue,
       Restore Purchases, Terms of Use (Apple's standard EULA) and the Privacy Policy, and the auto-renewal terms (3.1.2);
     - the Account tab's "CyberNet AI Pro" group: Get Pro, Pro billed by Apple (renewal date, Manage subscription, Request a
       refund), Pro from outside the App Store (one status line, no link: owner decision D13), linked to another account;
     - the "Get more with Pro" entry under the Analysis AI and Recovery meters once today's allowance is used up;
     - the Manage subscription step in the delete-account dialog (App Review 5.1.1(v));
     - buying: sign-in first (D3, then back to the paywall), one purchase at a time, the signed transaction sent to
       /api/apple-verify, and only after the server stored it, finish;
     - restoring, and the silent sync of renewals, Ask to Buy approvals and unfinished transactions.

   What it never does
     - decide who has Pro: the server does (/api/apple-verify, /api/account-status); success is read from the entitlement the
       server returns, never from the phone;
     - show a price it made up, or open at launch;
     - name, link to or point at any other way to pay (App Review 3.1.1): there is none in the app.

   The native side is mobile/native/App/Plugins/StoreKitPlugin.swift (JS name CNStore). Other files reach this one through
   window.CNPro (open, sync). */
(function () {
  "use strict";
  const w = window, d = document;
  const Ios = w.CNIos;
  if (w.CN_PLATFORM !== "ios" || !Ios || w.CNPro) return;
  const { P, sheet, toast, haptic, tick, esc, report, store, state, signedIn, authHeaders } = Ios;
  const $ = (sel, scope = d) => scope.querySelector(sel);
  const account = () => w.CyberNetAccount || null;
  const CNStore = P("CNStore"); // null in a desktop preview

  /* ================================================================ products and facts */
  // The one subscription group "CyberNet AI Pro". Must equal StoreKitPlugin.swift and netlify/lib/apple-products.mjs
  // (mobile/tests/run-bundle.mjs compares the three).
  const PRO_MONTHLY = "app.cybernetai.pro.monthly";
  const PRO_YEARLY = "app.cybernetai.pro.yearly";
  const PRO_IDS = Object.freeze([PRO_MONTHLY, PRO_YEARLY]);
  // What Pro gives, from netlify/lib/plans.mjs PLAN_LIMITS (mobile/tests/run-bundle.mjs compares them).
  const LIMITS = Object.freeze({ free: { ai: 3, cases: 1 }, pro: { ai: 15, cases: 3, waitHours: 2 } });
  const EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
  const SYNC_KEY = "cn-pro-sync";
  const SIX_HOURS = 6 * 3600e3;

  const TEXT = Object.freeze({
    lead: "More AI explanations and more Recovery help every day, on your iPhone and on the website.",
    account: "Pro is saved to your CyberNet AI account, so it also works on the website.",
    signInTitle: "Sign in to get Pro",
    unavailable: "Pro can't be loaded right now. Check your connection and try again.",
    noPayments: "Purchases are turned off on this iPhone. You can allow them in Settings, under Screen Time.",
    offline: "You're offline. Connect to the internet and try again.",
    pending: "Waiting for approval. Pro turns on as soon as the purchase is approved.",
    unconfirmed: "Your purchase went through, but we couldn't confirm it yet. It finishes on its own; you can also tap Restore Purchases.",
    failed: "The purchase didn't finish. Please try again.",
    refused: "This purchase couldn't be confirmed. If you were charged, email support@cybernetai.app.",
    wrongAccount: "Pro on this Apple Account is linked to a different CyberNet AI account. Sign in with that account to use it.",
    restored: "Pro is restored.",
    nothingToRestore: "No Pro purchase was found for this Apple Account.",
    restoreFailed: "Purchases couldn't be restored. Please try again.",
    success: "You're on Pro.",
    outside: "Pro is active on your account. It's billed outside the App Store, so you manage it where you subscribed.",
    team: "Pro is active on your account through your team.",
    twice: "This account also has Pro billed outside the App Store, so you may be paying twice. Cancel the one you don't need.",
    grace: "Apple couldn't renew Pro. Update your payment method in the Settings app; Pro stays on meanwhile.",
    terms: "Pro renews automatically at the price shown until you turn it off at least 24 hours before the current period ends. Your Apple Account is charged when you confirm the purchase. Manage or cancel it any time in the Settings app: tap your name, then Subscriptions.",
    deleteNote: "Deleting your account does not cancel Pro. Apple keeps billing you until you cancel it."
  });

  /* ---------------------------------------------------------------- what the server says about this account */
  // ios.js copies profile.appPlan and profile.billing from every /api/account-status reply into appState.cnBilling, with
  // the account they belong to. They count only while that account is the one signed in.
  function facts() {
    const s = state();
    const uid = String(s?.user?.id || "").toLowerCase();
    if (!signedIn() || !uid) return { guest: true, known: false };
    const b = s?.cnBilling;
    if (!b || b.uid !== uid) return { guest: false, known: false, uid };
    return { guest: false, known: true, uid, appPlan: b.appPlan, billing: b.billing || null };
  }
  // "free" | "apple" | "outside" | "team" | "unknown" | "guest"
  function standing(f = facts()) {
    if (f.guest) return "guest";
    if (!f.known) return "unknown";
    const src = f.billing?.source;
    if (src === "apple" || src === "both") return "apple";
    if (src === "team") return "team";
    if (src === "outside" || f.appPlan === "pro") return "outside";
    return "free";
  }
  const canBuy = f => !f.guest && f.known && f.billing?.canPurchase === true;

  // Apple's facts set by this session: an Apple Account whose active Pro the server linked to another CyberNet account.
  // Kept per signed-in account, for this launch only (the server answers again at the next sync).
  let elsewhere = { uid: "", on: false };
  const linkedElsewhere = () => elsewhere.on && elsewhere.uid === facts().uid;

  /* ---------------------------------------------------------------- Apple's prices */
  let products = new Map();
  let productsState = CNStore ? "idle" : "unavailable"; // idle | loading | ready | failed | unavailable | blocked
  let productsLoad = null;
  function loadProducts(force = false) {
    if (!CNStore) { productsState = "unavailable"; return Promise.resolve(); }
    if (productsLoad) return productsLoad;
    if (productsState === "ready" && !force) return Promise.resolve();
    productsState = "loading";
    paint();
    productsLoad = (async () => {
      try {
        const allowed = await CNStore.canMakePayments().catch(() => ({ allowed: true }));
        // StoreKit normally answers in well under a second; a store that never answers must not leave the sheet loading
        const res = await Promise.race([CNStore.products({ ids: PRO_IDS }), new Promise((_, no) => setTimeout(() => no(Object.assign(new Error("timeout"), { code: "NOT_AVAILABLE" })), 15000))]);
        const list = Array.isArray(res?.products) ? res.products : [];
        products = new Map(list.filter(p => PRO_IDS.includes(p?.id) && p.displayPrice).map(p => [p.id, p]));
        productsState = !products.size ? "failed" : allowed?.allowed === false ? "blocked" : "ready";
        if (productsState === "ready" && !products.has(choice)) choice = products.has(PRO_YEARLY) ? PRO_YEARLY : PRO_MONTHLY;
      } catch (error) {
        productsState = "failed";
        if (!/NOT_AVAILABLE/.test(String(error?.code || ""))) report(error, "pro products");
      } finally {
        productsLoad = null;
        paint();
      }
    })();
    return productsLoad;
  }
  const numberOf = id => { const n = Number(products.get(id)?.price); return Number.isFinite(n) && n > 0 ? n : 0; };
  function money(amount, currency) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); } catch { return ""; }
  }
  // Yearly: about this much a month, and the saving against twelve months of Monthly (both from Apple's own numbers).
  function yearlyFacts() {
    const y = products.get(PRO_YEARLY), year = numberOf(PRO_YEARLY), month = numberOf(PRO_MONTHLY);
    if (!y || !year) return null;
    const saving = month ? Math.floor((1 - year / (month * 12)) * 100) : 0;
    return { perMonth: money(year / 12, y.currencyCode), saving: saving >= 5 ? saving : 0 };
  }
  const periodWord = id => (products.get(id)?.periodUnit === "year" || id === PRO_YEARLY ? "year" : "month");

  /* ================================================================ talking to the server */
  // POST /api/apple-verify (netlify/functions/apple-verify.mjs). Each result names the item it answers by `index`; a result
  // with finish:true is finished at Apple, anything else stays unfinished and comes back (503, offline, not_linked).
  // Returns { ok, results, entitlement } or { ok: false, kind: "network" | "rate" | "later" | "signin" | "bad" }.
  let chain = Promise.resolve();
  const exclusive = fn => { const next = chain.then(fn, fn); chain = next.catch(() => {}); return next; };
  const verifying = new Set();
  async function verify(list, reason) {
    const items = list.filter(t => t?.jws).slice(0, 20);
    if (!items.length) return { ok: true, results: [], entitlement: facts().billing };
    let res, data;
    try {
      res = await fetch("/api/apple-verify", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({ reason, transactions: items.map(t => (t.renewalInfoJws ? { jws: t.jws, renewalInfoJws: t.renewalInfoJws } : { jws: t.jws })) })
      });
      data = await res.json().catch(() => ({}));
    } catch { return { ok: false, kind: "network" }; }
    if (!res.ok) return { ok: false, kind: res.status === 429 ? "rate" : res.status === 401 ? "signin" : res.status >= 500 ? "later" : "bad" };
    const results = Array.isArray(data?.results) ? data.results : [];
    for (const r of results) {
      const item = items[Number(r?.index)];
      if (r?.finish !== true || !item?.transactionId) continue;
      try { await CNStore.finish({ transactionId: String(item.transactionId) }); } catch (error) { report(error, "pro finish"); }
    }
    const entitlement = data?.entitlement && typeof data.entitlement === "object" ? data.entitlement : null;
    const s = state(), uid = facts().uid;
    if (s && uid && entitlement) {
      const pro = Boolean(entitlement.apple?.active) || ["apple", "both", "outside", "team"].includes(entitlement.source);
      s.cnBilling = { uid, appPlan: pro ? "pro" : "free", billing: entitlement, at: Date.now() };
    }
    if (uid) {
      const wrong = results.some(r => r?.status === "wrong_account");
      const appleOn = Boolean(entitlement?.apple?.active);
      elsewhere = { uid, on: wrong && !appleOn };
    }
    // the new limits (15 / 3) and the Account rows; script.js repaints the meters
    try { await account()?.refreshAccountStatus?.(); } catch { /* the next status repaints */ }
    paint();
    return { ok: true, results, entitlement };
  }
  const appleActive = done => Boolean(done?.entitlement?.apple?.active) || ["apple", "both"].includes(done?.entitlement?.source);
  const anyStatus = (done, status) => (done?.results || []).some(r => r?.status === status);

  /* ================================================================ the paywall sheet */
  let open = null;       // { panel, done } while the paywall is up
  let choice = PRO_YEARLY;
  let busy = "";         // "" | "purchase" | "restore"
  let note = { text: "", tone: "" }; // the line above Continue
  let justBought = false;

  const SHIELD = '<svg viewBox="0 0 48 48" width="52" height="52" aria-hidden="true"><defs><linearGradient id="cnProG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#0891b2"/></linearGradient></defs><path d="M24 4 8 10v12c0 10.2 6.8 18.6 16 22 9.2-3.4 16-11.8 16-22V10L24 4Z" fill="url(#cnProG)" opacity=".18"/><path d="M24 4 8 10v12c0 10.2 6.8 18.6 16 22 9.2-3.4 16-11.8 16-22V10L24 4Z" fill="none" stroke="url(#cnProG)" stroke-width="2.2" stroke-linejoin="round"/><path d="m17 24 5 5 9-10" fill="none" stroke="#e6fbff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHECK = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function benefitsHtml() {
    const rows = [
      [`${LIMITS.pro.ai} AI explanations a day`, `instead of ${LIMITS.free.ai}`],
      [`${LIMITS.pro.cases} Recovery cases a day`, `instead of ${LIMITS.free.cases}`],
      ["Unlimited Recovery updates", `${LIMITS.pro.waitHours} hours apart`],
      ["Works on the website too", "Same account on every device"]
    ];
    return `<ul class="cn-pro-benefits">${rows.map(([a, b]) => `<li><span class="cn-pro-tick">${CHECK}</span><span><strong>${esc(a)}</strong><small>${esc(b)}</small></span></li>`).join("")}</ul>`;
  }

  function optionHtml(id) {
    const p = products.get(id);
    const yearly = id === PRO_YEARLY;
    const facts = yearly ? yearlyFacts() : null;
    const on = choice === id;
    return `<button type="button" class="cn-pro-option${on ? " is-on" : ""}" role="radio" aria-checked="${on}" data-pro-pick="${id}">
        <span class="cn-pro-radio" aria-hidden="true"></span>
        <span class="cn-pro-option-name">${yearly ? "Yearly" : "Monthly"}${facts?.saving ? `<em class="cn-pro-save">Save ${facts.saving}%</em>` : ""}</span>
        <span class="cn-pro-option-price"><strong>${esc(p?.displayPrice || "")}</strong><span> / ${periodWord(id)}</span>${facts?.perMonth ? `<small>about ${esc(facts.perMonth)} per month</small>` : ""}</span>
      </button>`;
  }

  function bodyHtml() {
    const f = facts();
    const where = standing(f);
    const head = `<div class="cn-pro-head">${SHIELD}<h2 class="cn-ios-sheet-title" id="cnProTitle">CyberNet AI Pro</h2><p class="cn-pro-lead">${esc(TEXT.lead)}</p></div>`;
    if (justBought && where === "apple") {
      return `${head}<div class="cn-pro-done" role="status"><span class="cn-pro-done-tick">${CHECK}</span><p><strong>${esc(TEXT.success)}</strong> Your new daily limits are ready.</p></div>
        <div class="cn-ios-sheet-actions"><button type="button" class="primary-btn full cn-pro-cta" data-sheet-value="done" data-autofocus>Done</button></div>`;
    }
    if (where === "apple" || where === "outside" || where === "team") {
      const line = where === "apple" ? appleLine(f.billing) : where === "team" ? TEXT.team : TEXT.outside;
      return `${head}${benefitsHtml()}<p class="cn-pro-status" role="status">${esc(line)}</p>
        <div class="cn-ios-sheet-actions">${where === "apple" ? '<button type="button" class="secondary-btn full" data-pro-act="manage">Manage subscription</button>' : ""}
        <button type="button" class="primary-btn full cn-pro-cta" data-sheet-value="done">Done</button></div>`;
    }
    let price;
    if (productsState === "ready" || productsState === "blocked") {
      price = `<div class="cn-pro-options" role="radiogroup" aria-label="Choose how often you pay">${[PRO_YEARLY, PRO_MONTHLY].filter(id => products.has(id)).map(optionHtml).join("")}</div>`;
    } else if (productsState === "loading" || productsState === "idle") {
      price = '<div class="cn-pro-options is-loading" aria-busy="true"><div class="cn-pro-option cn-pro-skel"></div><div class="cn-pro-option cn-pro-skel"></div></div>';
    } else {
      price = `<div class="cn-pro-unavailable" role="status"><p>${esc(TEXT.unavailable)}</p><button type="button" class="secondary-btn" data-pro-act="retry">Try again</button></div>`;
    }
    const wrong = linkedElsewhere();
    const blocked = productsState === "blocked";
    const ready = productsState === "ready" && !wrong;
    const label = busy === "purchase" ? "Waiting for Apple…" : f.guest ? "Sign in and continue" : "Continue";
    const msg = wrong ? TEXT.wrongAccount : blocked ? TEXT.noPayments : note.text;
    const tone = wrong || blocked ? "warn" : note.tone;
    return `<button type="button" class="cn-ios-link-btn cn-pro-restore" data-pro-act="restore"${busy ? " disabled" : ""}>Restore</button>
      ${head}${benefitsHtml()}${price}
      <p class="cn-pro-note" data-tone="${esc(tone)}" role="status" aria-live="polite"${msg ? "" : " hidden"}>${esc(msg)}</p>
      ${wrong ? "" : `<div class="cn-ios-sheet-actions">
        <button type="button" class="primary-btn full cn-pro-cta" data-pro-act="buy"${ready && !busy ? "" : " disabled"}${busy === "purchase" ? ' aria-busy="true"' : ""}>${esc(label)}</button>
      </div>`}
      <p class="cn-pro-why">${esc(TEXT.account)}</p>
      <p class="cn-pro-terms">${esc(TEXT.terms)}</p>
      <p class="cn-pro-links"><button type="button" class="cn-ios-link-btn" data-pro-act="eula">Terms of Use</button><span aria-hidden="true">·</span><button type="button" class="cn-ios-link-btn" data-pro-act="privacy">Privacy Policy</button><span aria-hidden="true">·</span><button type="button" class="cn-ios-link-btn" data-pro-act="restore"${busy ? " disabled" : ""}>Restore Purchases</button></p>`;
  }

  function dateText(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "";
    try { return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); } catch { return new Date(t).toDateString(); }
  }
  // Critic #17: "Renews" only when Apple said it renews; a switch to the other period shows on its date; unknown = end date only.
  function appleLine(b) {
    const a = b?.apple || {};
    const when = dateText(a.expiresAt || b?.appleExpiresAt);
    const test = (a.environment || b?.appleEnvironment) === "Sandbox" ? " (test purchase)" : "";
    const period = (a.productId || b?.appleProductId) === PRO_YEARLY ? "Yearly" : "Monthly";
    let line = `Billed by Apple: Pro ${period}${test}.`;
    if (a.inGrace) line += ` ${TEXT.grace}`;
    else if (when && a.autoRenew === true && a.autoRenewProductId && a.autoRenewProductId !== a.productId && PRO_IDS.includes(a.autoRenewProductId)) line += ` Changes to ${a.autoRenewProductId === PRO_YEARLY ? "Yearly" : "Monthly"} on ${when}.`;
    else if (when && a.autoRenew === true) line += ` Renews on ${when}.`;
    else if (when && a.autoRenew === false) line += ` Ends on ${when}; it won't renew.`;
    else if (when) line += ` Current period ends on ${when}.`;
    if (b?.alsoBilledElsewhere) line += ` ${TEXT.twice}`;
    return line;
  }

  function paint() {
    paintAccount();
    paintMeters();
    if (!open) return;
    const { panel } = open;
    const focused = d.activeElement?.closest?.("[data-pro-act],[data-pro-pick],[data-sheet-value]");
    const key = focused ? (focused.getAttribute("data-pro-act") || focused.getAttribute("data-pro-pick") || focused.getAttribute("data-sheet-value")) : "";
    const body = $(".cn-pro-body", panel);
    if (!body) return;
    body.innerHTML = bodyHtml();
    panel.setAttribute("aria-busy", String(Boolean(busy) || productsState === "loading"));
    if (key) $(`[data-pro-act="${key}"],[data-pro-pick="${key}"],[data-sheet-value="${key}"]`, body)?.focus({ preventScroll: true });
  }
  function say(text, tone = "") {
    note = { text: text || "", tone };
    if (open) paint();
    else if (text) toast(text, tone);
  }

  // The paywall. Never shown at launch: only from Get Pro (Account) and the meters' "Get more with Pro".
  function openPaywall() {
    if (open) return open.promise;
    note = { text: "", tone: "" };
    justBought = false;
    if (Ios.isOffline?.()) note = { text: TEXT.offline, tone: "warn" };
    const promise = sheet({
      id: "cnPaywall",
      label: "CyberNet AI Pro",
      html: '<div class="cn-pro-body"></div>',
      onOpen(panel, done) {
        panel.classList.add("cn-pro-sheet");
        panel.setAttribute("aria-labelledby", "cnProTitle");
        open = { panel, done, promise: null };
        panel.addEventListener("click", onPaywallClick);
        paint();
        loadProducts();
        checkElsewhere();
      }
    }).then(value => { open = null; paint(); return value; });
    if (open) open.promise = promise;
    return promise;
  }
  function onPaywallClick(e) {
    const pick = e.target.closest?.("[data-pro-pick]");
    if (pick && !busy) {
      if (choice !== pick.getAttribute("data-pro-pick")) { choice = pick.getAttribute("data-pro-pick"); tick(); paint(); }
      return;
    }
    const b = e.target.closest?.("[data-pro-act]");
    if (!b || b.disabled) return;
    const act = b.getAttribute("data-pro-act");
    if (act === "buy") buy();
    else if (act === "restore") restore();
    else if (act === "retry") { note = { text: "", tone: "" }; loadProducts(true); }
    else if (act === "manage") manage();
    else if (act === "eula") Ios.openExternal(EULA);
    else if (act === "privacy") Ios.openLegal("privacy");
  }
  // Paywall open, signed in: an active Pro purchase already on this Apple Account is sent to the server first, so an account
  // that is not its owner sees "linked to a different account" instead of Continue (critic #2). No call when there is none.
  async function checkElsewhere() {
    if (!CNStore || !signedIn() || busy) return;
    try {
      const found = (await CNStore.currentEntitlements())?.transactions || [];
      if (!found.length) return;
      await exclusive(() => verify(found, "launch"));
    } catch (error) { report(error, "pro check"); }
  }

  /* ================================================================ buying */
  async function ensureAccount() {
    if (signedIn()) return true;
    const answer = await Ios.signInCard({ title: TEXT.signInTitle, lead: TEXT.account });
    if (answer !== "signed-in") return false;
    for (let i = 0; i < 40 && !state()?.user?.id; i++) await new Promise(r => setTimeout(r, 50));
    try { await account()?.refreshAccountStatus?.(); } catch { /* checked below */ }
    paint();
    checkElsewhere();
    return signedIn();
  }

  async function buy() {
    if (busy || !CNStore) return;
    if (Ios.isOffline?.() || navigator.onLine === false) { say(TEXT.offline, "warn"); return; }
    if (!(await ensureAccount())) return;
    // Back from the sign-in card: the person sees what this account already has (and the price) before Apple's sheet.
    if (busy) return;
    busy = "purchase";
    note = { text: "", tone: "" };
    paint();
    try {
      // Right before Apple's sheet: the server's latest word on this account (critic #10: never a second Pro).
      try { await account()?.refreshAccountStatus?.(); } catch { /* facts() below */ }
      const f = facts();
      if (!canBuy(f) || linkedElsewhere()) {
        if (!f.known || !f.billing) say("Pro can't be bought right now. Please try again in a moment.", "warn");
        return;
      }
      const productId = products.has(choice) ? choice : PRO_MONTHLY;
      const token = String(f.billing.appAccountToken || f.uid);
      const outcome = await exclusive(async () => {
        const bought = await CNStore.purchase({ productId, appAccountToken: token });
        if (bought?.status === "cancelled") return { stop: "cancelled" };
        if (bought?.status === "pending") return { stop: "pending" };
        if (!bought?.jws) return { stop: "failed" };
        const id = String(bought.transactionId || "");
        verifying.add(id);
        try { return { done: await verify([bought], "purchase") }; } finally { verifying.delete(id); }
      });
      if (outcome.stop === "cancelled") return;
      if (outcome.stop === "pending") { say(TEXT.pending); return; }
      if (outcome.stop) { say(TEXT.failed, "error"); return; }
      const done = outcome.done;
      if (!done.ok) { say(TEXT.unconfirmed, "warn"); return; }
      if (appleActive(done)) { justBought = true; haptic("SUCCESS"); note = { text: "", tone: "" }; return; }
      if (anyStatus(done, "wrong_account")) { say(TEXT.wrongAccount, "warn"); return; }
      if (anyStatus(done, "not_linked")) { say(TEXT.unconfirmed, "warn"); return; }
      if (anyStatus(done, "invalid") || anyStatus(done, "not_ours")) { say(TEXT.refused, "error"); return; }
      say(TEXT.unconfirmed, "warn");
    } catch (error) {
      const code = String(error?.code || "");
      if (/CANCELED/.test(code)) return;
      if (!/NOT_AVAILABLE/.test(code)) report(new Error(`pro purchase ${code || "error"}`), "pro purchase");
      say(/NOT_AVAILABLE/.test(code) ? TEXT.unavailable : TEXT.failed, "error");
      haptic("ERROR");
    } finally {
      busy = "";
      paint();
    }
  }

  /* ================================================================ restoring and managing */
  async function restore() {
    if (busy) return;
    if (!CNStore) { say(TEXT.unavailable, "warn"); return; }
    if (Ios.isOffline?.() || navigator.onLine === false) { say(TEXT.offline, "warn"); return; }
    if (!(await ensureAccount())) return;
    busy = "restore";
    note = { text: "Restoring…", tone: "" };
    paint();
    try {
      const outcome = await exclusive(async () => {
        const found = ((await CNStore.restore())?.transactions || []).filter(t => t?.jws);
        if (!found.length) return { empty: true };
        return { done: await verify(found, "restore") };
      });
      if (outcome.empty) { say(TEXT.nothingToRestore); return; }
      if (!outcome.done.ok) { say(outcome.done.kind === "rate" ? TEXT.restoreFailed : TEXT.unconfirmed, "warn"); return; }
      if (appleActive(outcome.done)) { say(TEXT.restored, "success"); haptic("SUCCESS"); if (!open) toast(TEXT.restored, "success"); return; }
      if (anyStatus(outcome.done, "wrong_account")) { say(TEXT.wrongAccount, "warn"); return; }
      if (anyStatus(outcome.done, "invalid") || anyStatus(outcome.done, "not_ours")) { say(TEXT.refused, "error"); return; }
      say(TEXT.nothingToRestore);
    } catch (error) {
      if (/CANCELED/.test(String(error?.code || ""))) { say(""); return; }
      report(new Error(`pro restore ${error?.code || "error"}`), "pro restore");
      say(TEXT.restoreFailed, "error");
    } finally {
      busy = "";
      paint();
    }
  }

  async function manage() {
    if (!CNStore) { toast("Subscriptions can't be managed right now."); return; }
    try { await CNStore.manageSubscriptions(); } catch (error) { report(error, "pro manage"); toast("Subscriptions can't be managed right now."); }
    // a cancel or a switch reaches the server through Apple's notification and the next sync
    later(() => sync("update", { force: true }), 600);
  }
  async function refund() {
    if (!CNStore) return;
    try {
      const r = await CNStore.refundRequest({});
      if (r?.status === "success") toast("Your refund request was sent to Apple. Apple emails you its answer.");
    } catch (error) { report(error, "pro refund"); toast("A refund can't be requested right now."); }
  }
  const later = (fn, ms) => setTimeout(() => { try { fn(); } catch (error) { report(error, "pro later"); } }, ms);

  /* ================================================================ silent sync */
  // At sign-in, at launch and when the app comes back: unfinished transactions every time, the active Pro purchase at most
  // once in six hours per account. No network call when Apple holds nothing (critic #2: no call for every free account).
  // Silent: a purchase linked to another account is remembered for Account and the paywall, never announced.
  let syncing = false;
  async function sync(reason = "launch", { force = false } = {}) {
    if (!CNStore || !signedIn() || syncing || busy) return;
    const uid = facts().uid;
    if (!uid) return;
    syncing = true;
    try {
      const found = [], seen = new Set();
      const add = list => (list || []).forEach(t => { const id = String(t?.transactionId || ""); if (t?.jws && id && !seen.has(id) && !verifying.has(id)) { seen.add(id); found.push(t); } });
      add((await CNStore.unfinished())?.transactions);
      let last = null;
      try { last = JSON.parse(store.get(SYNC_KEY) || "null"); } catch { last = null; }
      const due = force || !(last && last.u === uid && Date.now() - Number(last.t) < SIX_HOURS);
      if (due) add((await CNStore.currentEntitlements())?.transactions);
      if (!found.length) { if (due) store.set(SYNC_KEY, JSON.stringify({ u: uid, t: Date.now() })); return; }
      const before = standing();
      const done = await exclusive(() => verify(found, reason === "launch" ? "launch" : "update"));
      if (done.ok && due) store.set(SYNC_KEY, JSON.stringify({ u: uid, t: Date.now() }));
      if (done.ok && before === "free" && appleActive(done) && !open) toast("Pro is on.", "success");
    } catch (error) {
      report(error, "pro sync");
    } finally {
      syncing = false;
      paint();
    }
  }
  // A renewal, an Ask to Buy approval, a purchase on another device: the server stores it, then it is finished.
  async function onUpdate(event) {
    const id = String(event?.transactionId || "");
    if (!event?.jws || !id || verifying.has(id)) return;
    for (let i = 0; i < 100 && !signedIn(); i++) await new Promise(r => setTimeout(r, 100)); // the session may still be loading
    if (!signedIn()) return; // stays unfinished at Apple; sync() takes it after the next sign-in
    verifying.add(id);
    try {
      const before = standing();
      const done = await exclusive(() => verify([event], "update"));
      if (done.ok && before !== "apple" && appleActive(done)) { if (open) { justBought = true; paint(); } else toast("Pro is on.", "success"); }
    } catch (error) { report(error, "pro update"); } finally { verifying.delete(id); }
  }

  /* ================================================================ Account: the CyberNet AI Pro group */
  // Placeholder: mobile/web-ios/partials/account.html #cnAcctPro (in-app purchase builds only).
  function paintAccount() {
    const slot = $("#cnAcctPro");
    if (!slot) return;
    const f = facts();
    const where = standing(f);
    let rows;
    if (where === "unknown") rows = '<div class="cn-ios-row"><span>CyberNet AI Pro</span><strong class="cn-ios-loading" aria-label="Loading">&mdash;</strong></div>';
    else if (where === "apple") {
      rows = `<div class="cn-ios-row cn-ios-row-stack"><strong>Pro is on</strong><span>${esc(appleLine(f.billing))}</span></div>
        <button type="button" class="cn-ios-row cn-ios-row-btn" data-pro-row="manage" data-ios-nav>Manage subscription</button>
        <button type="button" class="cn-ios-row cn-ios-row-btn" data-pro-row="refund" data-ios-nav>Request a refund</button>
        <button type="button" class="cn-ios-row cn-ios-row-btn" data-pro-row="restore">Restore Purchases</button>`;
    } else if (where === "outside" || where === "team") {
      rows = `<div class="cn-ios-row cn-ios-row-stack"><strong>Pro is on</strong><span>${esc(where === "team" ? TEXT.team : TEXT.outside)}</span></div>`;
    } else {
      const wrong = linkedElsewhere();
      rows = `<div class="cn-ios-row cn-ios-row-stack"><strong>CyberNet AI Pro</strong><span>${esc(wrong ? TEXT.wrongAccount : `${LIMITS.pro.ai} AI explanations and ${LIMITS.pro.cases} Recovery cases a day, on your iPhone and on the website.`)}</span></div>
        ${wrong ? "" : '<button type="button" class="cn-ios-row cn-ios-row-btn cn-pro-get" data-pro-row="open" data-ios-nav>Get Pro</button>'}
        <button type="button" class="cn-ios-row cn-ios-row-btn" data-pro-row="restore">Restore Purchases</button>`;
    }
    const html = `<h2 class="cn-ios-group-title">CyberNet AI Pro</h2><div class="cn-ios-group">${rows}</div>`;
    if (slot.dataset.html !== html) { slot.innerHTML = html; slot.dataset.html = html; }
  }

  /* ================================================================ the meters: "Get more with Pro" at the limit */
  const METERS = [["#analysisAiHeaderUsageText", "#analysisAiHeaderUsageCard"], ["#recoveryUsageCaseText", "#recoveryUsageCard"]];
  function paintMeters() {
    const f = facts();
    const offer = standing(f) === "free" && canBuy(f) && !linkedElsewhere();
    for (const [textSel, cardSel] of METERS) {
      const card = $(cardSel);
      if (!card) continue;
      const m = /(\d+)\s*\/\s*(\d+)/.exec($(textSel)?.textContent || "");
      const full = Boolean(m) && Number(m[2]) > 0 && Number(m[1]) >= Number(m[2]);
      let btn = card.nextElementSibling?.classList?.contains("cn-pro-meter") ? card.nextElementSibling : null;
      if (offer && full) {
        if (!btn) {
          btn = d.createElement("button");
          btn.type = "button";
          btn.className = "cn-pro-meter";
          btn.setAttribute("data-pro-row", "open");
          btn.innerHTML = `<span>Get more with Pro</span><small>${LIMITS.pro.ai} AI explanations and ${LIMITS.pro.cases} Recovery cases a day</small>`;
          card.insertAdjacentElement("afterend", btn);
        }
      } else btn?.remove();
    }
  }
  function watchMeters() {
    const watch = new MutationObserver(() => paintMeters());
    for (const [sel] of METERS) { const n = $(sel); if (n) watch.observe(n, { childList: true, characterData: true, subtree: true }); }
  }

  /* ================================================================ deleting the account with Pro billed by Apple */
  // cybernet-privacy-controls.js opens the dialog; the app's copy already says deletion does not cancel an App Store
  // subscription (text-overrides.json). With Pro billed by Apple and still renewing, Manage subscription sits right there.
  // Deletion is never held up by this (App Review 5.1.1(v)).
  async function deleteStep() {
    const modal = $("#cnDeleteAccountModal");
    if (!modal) return;
    $("#cnDeleteProStep", modal)?.remove();
    let renewing = false;
    const f = facts();
    if (standing(f) === "apple") renewing = f.billing?.apple?.autoRenew !== false;
    else {
      try {
        const res = await fetch("/api/privacy-data", { method: "POST", headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify({ action: "delete-check" }) });
        renewing = res.ok && (await res.json().catch(() => ({})))?.appleSubscription?.open === true;
      } catch { renewing = false; }
    }
    if (!renewing || !modal.isConnected) return;
    const box = d.createElement("div");
    box.id = "cnDeleteProStep";
    box.className = "cn-pro-delete";
    box.innerHTML = `<p><strong>Pro is billed by Apple.</strong> ${esc(TEXT.deleteNote)}</p><button type="button" class="secondary-btn full" data-pro-row="manage">Manage subscription</button>`;
    box.addEventListener("click", e => { if (e.target.closest("[data-pro-row=manage]")) manage(); });
    modal.querySelector(".cn-privacy-confirm")?.insertAdjacentElement("beforebegin", box);
  }

  /* ================================================================ start */
  function start() {
    d.addEventListener("click", e => {
      const b = e.target.closest?.("[data-pro-row]");
      if (!b || b.closest("#cnDeleteProStep")) return;
      const what = b.getAttribute("data-pro-row");
      if (what === "open") openPaywall();
      else if (what === "restore") restore();
      else if (what === "manage") manage();
      else if (what === "refund") refund();
    });
    d.addEventListener("click", e => { if (e.target.closest?.("#cnPrivacyDeleteBtn")) later(deleteStep, 0); });
    w.addEventListener("cybernet:account-ui", paint);
    let lastUid = "";
    w.addEventListener("cybernet:session", e => {
      const uid = String(e.detail?.userId || "").toLowerCase();
      if (uid !== lastUid) { elsewhere = { uid: "", on: false }; lastUid = uid; if (uid) later(() => sync("launch"), 1500); }
      paint();
    });
    watchMeters();
    paint();
    if (CNStore) {
      try { CNStore.addListener("transactionUpdate", event => { onUpdate(event).catch(error => report(error, "pro update")); }); } catch (error) { report(error, "pro listener"); }
      try { P("App")?.addListener("appStateChange", ({ isActive }) => { if (isActive) later(() => sync("update"), 800); }); } catch (error) { report(error, "pro app state"); }
    }
  }

  w.CNPro = Object.freeze({ open: openPaywall, sync, restore, manage, ids: () => PRO_IDS.slice() });
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
