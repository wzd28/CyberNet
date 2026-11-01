/* CyberNet AI iPhone app: the plans page and Apple In-App Purchase (owner decision, 30 Oct 2026: Free, Pro and Business in
   the app, bought with StoreKit 2 as App Review guideline 3.1.1 requires). Loaded right after ios.js; only the app loads it.

   What it owns
     - the plans page (#pricing, the website's pricing section in the app's words; markup in public/index.html): the
       Monthly | Yearly toggle, the Business seat picker, every price (Apple's own text, never typed here), the buttons
       that say Current Plan / Included with ... / Upgrade, the retry box when Apple's prices cannot be loaded, Restore
       Purchases and Manage subscription;
     - buying: sign-in first (the plan belongs to the account), one purchase at a time, the signed transaction sent to
       /api/apple-verify, and only then told to Apple that it was delivered (finish);
     - restoring, Apple's Manage Subscriptions sheet, and picking up purchases that happened somewhere else (renewals,
       Ask to Buy approvals, another device) or that could not be confirmed before.

   What it never does
     - decide who has a plan: the server does (POST /api/apple-verify, GET /api/account-status);
     - show a price it made up: with no answer from Apple the cards say so and the buttons stay off;
     - link to, or name, any other way to pay (App Review 3.1.1): there is none in the app.

   The native side is StoreKitPlugin.swift (JS name CNStore). The plugin is the local CNStore below; the page-level API
   other files call is window.CNStore (openPaywall, manage, restore, sync). */
(function () {
  "use strict";
  const w = window, d = document;
  const Ios = w.CNIos;
  if (w.CN_PLATFORM !== "ios" || !Ios || w.CNStore) return;
  const { toast, signInCard, state, signedIn, authHeaders, report, P, store } = Ios;
  const $ = (sel, scope = d) => scope.querySelector(sel);
  const $$ = (sel, scope = d) => [...scope.querySelectorAll(sel)];
  const account = () => w.CyberNetAccount || null;

  /* ================================================================ products */
  // The one subscription group "CyberNet AI Plans". Must equal StoreKitPlugin.swift and netlify/lib/apple-products.mjs
  // (mobile/tests/run-bundle.mjs compares the three).
  const PRO_MONTHLY = "app.cybernetai.pro.monthly";
  const PRO_YEARLY = "app.cybernetai.pro.yearly";
  const BUSINESS = Object.freeze({ 5: "app.cybernetai.business5.monthly", 10: "app.cybernetai.business10.monthly", 20: "app.cybernetai.business20.monthly" });
  const ALL_IDS = Object.freeze([PRO_MONTHLY, PRO_YEARLY, BUSINESS[5], BUSINESS[10], BUSINESS[20]]);
  const seatsOf = id => Number(Object.keys(BUSINESS).find(n => BUSINESS[n] === id)) || 0;
  const isBusinessId = id => seatsOf(id) > 0;

  // The plugin (null in a desktop preview and in a build without it). Named like the plugin so the calls read CNStore.<method>.
  const CNStore = P("CNStore");

  const SIX_HOURS = 6 * 3600e3;
  const SYNC_KEY = "cn-store-sync";

  const TEXT = Object.freeze({
    unavailable: "Purchases work in the CyberNet AI app.",
    manageUnavailable: "Managing a subscription works in the CyberNet AI app.",
    offline: "You're offline. Connect to the internet to choose a plan.",
    pending: "Waiting for approval. Your plan appears when it is approved.",
    unconfirmed: "We couldn't confirm your purchase yet. It will finish automatically; you can also tap Restore Purchases.",
    restored: "Your plan was restored.",
    nothingToRestore: "No purchases to restore for this account.",
    wrongAccount: "This subscription belongs to a different CyberNet AI account. Sign in with the account you bought it with.",
    failed: "The purchase did not finish. Please try again.",
    refused: "This purchase could not be confirmed. If you were charged, email support@cybernetai.app.",
    notNeeded: "This account already has this plan.",
    twice: "This account already has a plan that was started outside the app, so you may be charged twice. Use Manage subscription to cancel the one you do not need.",
    otherTeam: "This account is part of another team's Business plan, so your own team was not created. Your purchase is kept; tap Restore Purchases after you leave that team.",
    noProducts: "Plans can't load right now. Check your connection and try again.",
    signInTitle: "Sign in to choose a plan",
    signInLead: "Your plan belongs to your CyberNet AI account."
  });

  /* ================================================================ state */
  let products = new Map();      // product id -> what Apple says (displayName, displayPrice, price, currencyCode, periodUnit ...)
  let productsState = CNStore ? "idle" : "unavailable"; // idle | loading | ready | failed | unavailable
  let productsLoad = null;       // the request in flight
  let cycle = "monthly";         // the Monthly | Yearly toggle (Pro only; Business is sold monthly)
  let seatTier = 5;              // the Business seat picker
  let busy = "";                 // "" | "purchase" | "restore": one at a time
  let chain = Promise.resolve(); // verification of transactions, one after another
  const verifying = new Set();   // transaction ids being sent to the server now

  const planOf = profile => (profile?.plan === "business" ? "business" : profile?.plan === "pro" ? "pro" : "free");
  const exclusive = fn => { const next = chain.then(fn, fn); chain = next.catch(() => {}); return next; };

  // What this account has now and who bills it, from /api/account-status.
  function having() {
    const profile = state()?.profile || {};
    const billing = profile.billing || null;
    const plan = planOf(profile);
    const apple = billing?.source === "apple";
    return { plan, billing, apple, seats: apple && plan === "business" ? Number(billing.seatTier) || 0 : 0 };
  }
  // Never offer, and never start, a purchase for a plan the account already has (one subscription, one bill).
  function covered(productId) {
    const have = having();
    if (!isBusinessId(productId)) return have.plan === "pro" || have.plan === "business";
    if (have.plan !== "business") return false;
    return !(have.apple && seatsOf(productId) !== have.seats); // only a team that Apple bills can change its seats
  }

  /* ================================================================ money (Apple's text; the numbers only for the saving) */
  function numberOf(id) {
    const n = Number(products.get(id)?.price);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function formatMoney(amount, currency) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); } catch { return ""; }
  }
  const display = id => String(products.get(id)?.displayPrice || "");
  function yearlyFacts() {
    const yearly = products.get(PRO_YEARLY), monthly = numberOf(PRO_MONTHLY), year = numberOf(PRO_YEARLY);
    if (!yearly || !year) return null;
    const perMonth = formatMoney(year / 12, yearly.currencyCode);
    const saving = monthly ? (1 - year / (monthly * 12)) * 100 : 0;
    return { price: display(PRO_YEARLY), perMonth, saving: saving >= 5 ? Math.round(saving) : 0 };
  }
  const per = id => (products.get(id)?.periodUnit === "year" ? "/year" : "/month");

  /* ================================================================ loading Apple's prices */
  function loadProducts(force = false) {
    if (!CNStore) { productsState = "unavailable"; return Promise.resolve(); }
    if (productsLoad) return productsLoad;
    if (productsState === "ready" && !force) return Promise.resolve();
    productsState = "loading";
    paint();
    productsLoad = (async () => {
      try {
        const res = await CNStore.products({ ids: ALL_IDS });
        const list = Array.isArray(res?.products) ? res.products : [];
        products = new Map(list.filter(p => ALL_IDS.includes(p?.id)).map(p => [p.id, p]));
        // Pro monthly is the one price the page cannot do without; a plan Apple has not published is simply not offered
        productsState = products.has(PRO_MONTHLY) ? "ready" : "failed";
      } catch (error) {
        productsState = "failed";
        if (!/NOT_AVAILABLE/.test(String(error?.code || ""))) report(error, "store products");
      } finally {
        productsLoad = null;
        paint();
      }
    })();
    return productsLoad;
  }

  /* ================================================================ painting the plans page */
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function notice(text, tone = "") {
    const box = $("#pricingNotice");
    if (!box) { if (text) toast(text); return; }
    box.textContent = text || "";
    box.className = `pricing-notice glass${text ? " show" : ""} ${tone}`.trim();
  }
  // Said twice on the plans page (its notice above the cards, and a toast where the finger is); elsewhere, as a toast.
  function say(text, tone = "") {
    if (Ios.activePage() === "pricing") notice(text, tone);
    if (text) toast(text, tone);
  }

  function paint() {
    const root = $("#pricing");
    if (!root) return;
    const have = having();
    const ready = productsState === "ready";
    const out = signedIn();

    // the toggle and the saving
    const toggle = $("#pricingToggle", root);
    if (toggle) {
      toggle.dataset.cycle = cycle;
      $$(".toggle-option", toggle).forEach(o => { const on = o.dataset.cycle === cycle; o.classList.toggle("active", on); o.setAttribute("aria-pressed", String(on)); });
    }
    const facts = ready ? yearlyFacts() : null;
    const save = $("[data-store-save]", root);
    if (save) { save.hidden = !facts?.saving; setText(save, facts?.saving ? `Save ${facts.saving}% yearly` : ""); }
    const yearlyNote = $("[data-store-yearly-note]", root);
    if (yearlyNote) {
      yearlyNote.hidden = !(facts && facts.perMonth);
      setText($("[data-store-yearly-price]", root), facts?.price || "");
      setText($("[data-store-yearly-month]", root), facts?.perMonth || "");
    }

    // Pro
    const proId = cycle === "yearly" && products.has(PRO_YEARLY) ? PRO_YEARLY : PRO_MONTHLY;
    setText($('[data-store-amount="pro"]', root), ready ? display(proId) : "—");
    setText($('[data-store-period="pro"]', root), ready ? per(proId) : "");
    const proLine = $('[data-store-billing="pro"]', root);
    if (proLine) {
      const yearly = proId === PRO_YEARLY;
      setText(proLine, yearly && facts?.perMonth
        ? `Billed once a year at ${facts.price}, about ${facts.perMonth} a month. Renews until you cancel.`
        : "Billed monthly to your Apple ID. Renews until you cancel.");
    }
    const proBtn = $("#proPlanBtn", root);
    if (proBtn) {
      proBtn.dataset.storeBuy = proId;
      proBtn.dataset.cycle = proId === PRO_YEARLY ? "yearly" : "monthly";
      setText(proBtn, have.plan === "pro" ? "Current Plan" : have.plan === "business" ? "Included with Business" : "Upgrade to Pro");
      proBtn.disabled = have.plan !== "free" || !ready || Boolean(busy);
    }
    setText($('[data-store-renew="pro"]', root), ready && have.plan === "free" ? `${display(proId)} / ${proId === PRO_YEARLY ? "year" : "month"}. Renews automatically until you cancel.` : "");

    // Business (monthly only; the Yearly toggle changes the Pro card alone)
    const bizId = BUSINESS[seatTier] || BUSINESS[5];
    $$(".cn-seat-option", root).forEach(o => {
      const on = Number(o.dataset.seatTier) === seatTier;
      o.classList.toggle("is-active", on);
      o.setAttribute("aria-pressed", String(on));
      const id = o.dataset.storeProduct;
      setText($("[data-store-seat-price]", o), ready && products.has(id) ? `${display(id)}/mo` : "—");
    });
    setText($('[data-store-amount="business"]', root), ready && products.has(bizId) ? display(bizId) : "—");
    setText($('[data-store-period="business"]', root), ready && products.has(bizId) ? "/month" : "");
    const change = have.plan === "business" && have.apple && have.seats !== seatTier; // an Apple-billed team picking another size
    const bizBtn = $("#businessPlanBtn", root);
    if (bizBtn) {
      bizBtn.dataset.storeBuy = bizId;
      setText(bizBtn, have.plan === "business" ? (change ? `Change to ${seatTier} seats` : "Current Plan") : "Upgrade to Business");
      bizBtn.disabled = (have.plan === "business" && !change) || !ready || !products.has(bizId) || Boolean(busy);
    }
    setText($('[data-store-renew="business"]', root), ready && products.has(bizId) && (have.plan !== "business" || change)
      ? `${display(bizId)} / month for ${seatTier} seats. Renews automatically until you cancel.` : "");

    // Free
    const freeBtn = $("#freePlanBtn", root);
    if (freeBtn) {
      setText(freeBtn, !out ? "Start Free" : have.plan === "free" ? "Current Plan" : `Included with ${have.plan === "business" ? "Business" : "Pro"}`);
      freeBtn.disabled = out;
    }

    // Manage subscription: only for a plan that Apple bills. Restore Purchases is always there.
    const manage = $("[data-store-manage]", root);
    if (manage) manage.hidden = !(out && have.apple);
    const restore = $("[data-store-restore]", root);
    if (restore) restore.disabled = Boolean(busy);

    // Apple's prices could not be loaded: say so, offer Retry, no invented prices
    const retry = $("[data-store-retry-box]", root);
    if (retry) retry.hidden = productsState !== "failed";
    // No store at all (a desktop preview, or a build without the plugin): say why the buttons are off
    if (productsState === "unavailable") { const box = $("#pricingNotice", root); if (box && !box.textContent) notice(TEXT.unavailable); }
    root.setAttribute("aria-busy", String(productsState === "loading" || Boolean(busy)));
    root.classList.toggle("is-loading", productsState === "loading");
  }

  function bindCycleToggle(root) {
    const toggle = $("#pricingToggle", root);
    if (!toggle) return;
    toggle.addEventListener("click", e => {
      const option = e.target.closest?.(".toggle-option");
      if (!option || !toggle.contains(option)) return;
      cycle = option.dataset.cycle === "yearly" ? "yearly" : "monthly";
      paint();
    });
  }
  function bindSeatPicker(root) {
    const picker = $("#businessSeatPicker", root);
    if (!picker) return;
    picker.addEventListener("click", e => {
      const option = e.target.closest?.(".cn-seat-option");
      if (!option || !picker.contains(option)) return;
      seatTier = [5, 10, 20].includes(Number(option.dataset.seatTier)) ? Number(option.dataset.seatTier) : 5;
      paint();
    });
  }

  /* ================================================================ talking to the server */
  // POST /api/apple-verify: Apple's signed text goes up, the server checks it and records the plan, and says for each transaction
  // whether it may be finished. Returns { ok, results, plan } or { ok: false } when the server could not be reached or could not
  // answer (nothing is finished then: the transaction comes back at the next launch, sign-in or return to the app).
  async function verify(transactions, reason) {
    const list = transactions.filter(t => t?.jws).slice(0, 20);
    if (!list.length) return { ok: true, results: [], plan: planOf(state()?.profile) };
    let res, data;
    try {
      res = await fetch("/api/apple-verify", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({ reason, transactions: list.map(t => ({ jws: t.jws, renewalInfoJws: t.renewalInfoJws || undefined })) })
      });
      data = await res.json().catch(() => ({}));
    } catch { return { ok: false, reason: "network" }; }
    if (!res.ok) return { ok: false, reason: res.status === 401 ? "signin" : "server", status: res.status };
    const results = Array.isArray(data.results) ? data.results : [];
    for (const [i, r] of results.entries()) {
      if (r?.finish !== true) continue;
      const id = String(r.transactionId || list[i]?.transactionId || "");
      if (!id) continue;
      try { await CNStore.finish({ transactionId: id }); } catch (error) { report(error, "store finish"); }
    }
    try { await account()?.refreshAccountStatus?.(); } catch { /* the page repaints on the next status */ }
    return { ok: true, results, plan: planOf(state()?.profile) };
  }

  // The word to say after verify(): what happened to the transactions of one action.
  function outcomeOf(results) {
    const has = status => results.some(r => r?.status === status);
    if (has("applied")) return "applied";
    if (has("wrong_account")) return "wrong_account";
    if (has("conflict_web_plan")) return "conflict";
    if (has("in_other_team")) return "other_team";
    if (has("invalid") || has("not_ours")) return "refused";
    return "none"; // expired, revoked, stale: nothing to give
  }

  /* ================================================================ buying */
  async function ensureAccount() {
    if (signedIn()) return true;
    const choice = await signInCard({ title: TEXT.signInTitle, lead: TEXT.signInLead });
    if (choice !== "signed-in") return false;
    // the card closes when the session exists; the plan and how it is billed come a moment later
    for (let i = 0; i < 40 && !state()?.user?.id; i++) await new Promise(resolve => setTimeout(resolve, 50));
    try { await account()?.refreshAccountStatus?.(); } catch { /* the guard below uses what is known */ }
    return Boolean(state()?.user?.id);
  }

  async function buy(productId) {
    if (busy) return;
    if (!ALL_IDS.includes(productId)) return;
    if (!CNStore) { say(TEXT.unavailable); return; }
    if (navigator.onLine === false) { say(TEXT.offline); return; } // Apple and the server both need the internet
    if (!(await ensureAccount())) return;
    if (busy) return; // a second tap while the sign-in card was open
    if (covered(productId)) { say(TEXT.notNeeded); paint(); return; }
    const uid = String(state()?.user?.id || "");
    if (!uid) { say(TEXT.failed, "error"); return; }
    busy = "purchase";
    paint();
    notice("");
    try {
      const outcome = await exclusive(async () => {
        const bought = await CNStore.purchase({ productId, appAccountToken: uid });
        if (bought?.status === "cancelled") return { stop: "cancelled" };
        if (bought?.status === "pending") return { stop: "pending" };
        if (!bought?.jws) return { stop: "failed" };
        verifying.add(String(bought.transactionId));
        try { return { done: await verify([bought], "purchase") }; } finally { verifying.delete(String(bought.transactionId)); }
      });
      if (outcome.stop === "cancelled") return;
      if (outcome.stop === "pending") { say(TEXT.pending); return; }
      if (outcome.stop) { say(TEXT.failed, "error"); return; }
      if (!outcome.done.ok) { say(TEXT.unconfirmed, "error"); return; }
      const word = outcomeOf(outcome.done.results);
      if (word === "applied") {
        const plan = outcome.done.plan;
        say(plan === "business" ? "Your Business plan is active." : "Your Pro plan is active.", "success");
        if (isBusinessId(productId)) later(() => { try { w.CNBusinessTeam?.open?.(); } catch (error) { report(error, "open team"); } }, 700);
      } else if (word === "wrong_account") say(TEXT.wrongAccount, "error");
      else if (word === "conflict") say(TEXT.twice, "error");
      else if (word === "other_team") say(TEXT.otherTeam, "error");
      else if (word === "refused") say(TEXT.refused, "error");
      else say(TEXT.unconfirmed, "error");
    } catch (error) {
      if (/CANCELED/.test(String(error?.code || ""))) return; // the person closed Apple's sheet
      report(new Error(`store purchase ${error?.code || "error"}`), "store purchase");
      say(/NOT_AVAILABLE/.test(String(error?.code || "")) ? TEXT.noProducts : TEXT.failed, "error");
    } finally {
      busy = "";
      paint();
    }
  }
  const later = (fn, ms) => setTimeout(fn, ms);

  /* ================================================================ restoring */
  async function restore() {
    if (busy) return;
    if (!CNStore) { say(TEXT.unavailable); return; }
    if (navigator.onLine === false) { say(TEXT.offline); return; }
    if (!(await ensureAccount())) return;
    busy = "restore";
    paint();
    notice("");
    try {
      const outcome = await exclusive(async () => {
        const found = await CNStore.restore(); // asks Apple (may ask for the Apple ID)
        const list = (found?.transactions || []).filter(t => t?.jws);
        if (!list.length) return { empty: true };
        return { done: await verify(list, "restore") };
      });
      if (outcome.empty) { say(TEXT.nothingToRestore); return; }
      if (!outcome.done.ok) { say(TEXT.unconfirmed, "error"); return; }
      const word = outcomeOf(outcome.done.results);
      if (word === "applied") say(TEXT.restored, "success");
      else if (word === "wrong_account") say(TEXT.wrongAccount, "error");
      else if (word === "refused") say(TEXT.refused, "error");
      else say(TEXT.nothingToRestore);
    } catch (error) {
      if (/CANCELED/.test(String(error?.code || ""))) return;
      report(new Error(`store restore ${error?.code || "error"}`), "store restore");
      say("Purchases could not be restored. Please try again.", "error");
    } finally {
      busy = "";
      paint();
    }
  }

  /* ================================================================ managing */
  async function manage() {
    if (!CNStore) { toast(TEXT.manageUnavailable); return; }
    try { await CNStore.manageSubscriptions(); } catch (error) { report(error, "store manage"); toast("Subscriptions can't be managed right now."); }
    try { await account()?.refreshAccountStatus?.(); } catch { /* ignore */ }
    paint();
  }

  /* ================================================================ purchases that happened elsewhere, or were not confirmed */
  const readSync = () => { try { return JSON.parse(store.get(SYNC_KEY) || "null"); } catch { return null; } };
  let syncing = false;
  // reason "launch": at sign-in and at start; "update": when the app comes back. Transactions that Apple still holds as unfinished
  // are sent every time (a purchase that could not be confirmed must not wait for six hours); the full list of current plans at most
  // once in six hours per account.
  async function sync(reason = "launch") {
    if (!CNStore || !signedIn() || syncing || busy) return;
    const uid = String(state()?.user?.id || "");
    if (!uid) return;
    syncing = true;
    try {
      const found = [], seen = new Set();
      const add = list => (list || []).forEach(t => { const id = String(t?.transactionId || ""); if (t?.jws && id && !seen.has(id) && !verifying.has(id)) { seen.add(id); found.push(t); } });
      add((await CNStore.unfinished())?.transactions);
      const last = readSync();
      const due = !(last && last.u === uid && Date.now() - Number(last.t) < SIX_HOURS);
      if (due) add((await CNStore.currentEntitlements())?.transactions);
      if (found.length) {
        const before = planOf(state()?.profile);
        const done = await exclusive(() => verify(found, reason === "launch" ? "launch" : "update"));
        if (done.ok && due) store.set(SYNC_KEY, JSON.stringify({ u: uid, t: Date.now() }));
        if (done.ok && before === "free" && done.plan !== "free" && Ios.activePage() !== "pricing") toast(done.plan === "business" ? "Your Business plan is active." : "Your Pro plan is active.");
      } else if (due) store.set(SYNC_KEY, JSON.stringify({ u: uid, t: Date.now() }));
    } catch (error) {
      report(error, "store sync");
    } finally {
      syncing = false;
      paint();
    }
  }

  // A renewal, an Ask to Buy approval, a purchase on another device: Apple tells the app, the server records it, then it is finished.
  async function onUpdate(event) {
    const id = String(event?.transactionId || "");
    if (!event?.jws || !id || verifying.has(id)) return;
    for (let i = 0; i < 100 && !signedIn(); i++) await new Promise(resolve => setTimeout(resolve, 100)); // the update can arrive before the session is read
    if (!signedIn()) return; // stays unfinished at Apple; sync() picks it up after the next sign-in
    verifying.add(id);
    try {
      const before = planOf(state()?.profile);
      const done = await exclusive(() => verify([event], "update"));
      if (done.ok && before === "free" && done.plan !== "free") say(done.plan === "business" ? "Your Business plan is active." : "Your Pro plan is active.", "success");
    } catch (error) {
      report(error, "store update");
    } finally {
      verifying.delete(id);
      paint();
    }
  }

  /* ================================================================ opening the plans page */
  function openPaywall(options = {}) {
    Ios.navigate("pricing");
    if (options.notice) notice(String(options.notice));
    loadProducts();
    if (options.focus === "business") {
      setTimeout(() => $(".business-price-card")?.scrollIntoView({ behavior: Ios.motionOff() ? "auto" : "smooth", block: "center" }), 450);
    }
  }

  function wire() {
    const root = $("#pricing");
    if (!root || root.dataset.storeBound) return;
    root.dataset.storeBound = "1";
    bindCycleToggle(root);
    bindSeatPicker(root);
    root.addEventListener("click", e => {
      const target = e.target.closest?.("[data-store-buy],[data-store-free],[data-store-restore],[data-store-manage],[data-store-retry],[data-store-done]");
      if (!target || !root.contains(target) || target.disabled) return;
      if (target.hasAttribute("data-store-buy")) buy(target.getAttribute("data-store-buy"));
      else if (target.hasAttribute("data-store-free")) { if (!signedIn()) signInCard({ title: TEXT.signInTitle, lead: TEXT.signInLead }); }
      else if (target.hasAttribute("data-store-restore")) restore();
      else if (target.hasAttribute("data-store-manage")) manage();
      else if (target.hasAttribute("data-store-retry")) { notice(""); loadProducts(true); }
      else if (target.hasAttribute("data-store-done")) {
        const back = Ios.plansFrom();
        Ios.navigate(back && back !== "pricing" ? back : "account");
      }
    });
  }

  function start() {
    wire();
    paint();
    // the page asks Apple for prices when it is first opened (not before: most launches never open it)
    Ios.onPage(page => { if (page === "pricing") { loadProducts(); paint(); } });
    w.addEventListener("cybernet:account-ui", paint);
    w.addEventListener("cybernet:session", () => paint());
    if (CNStore) {
      try {
        CNStore.addListener("transactionUpdate", event => { onUpdate(event).catch(error => report(error, "store update")); });
      } catch (error) { report(error, "store listener"); }
      // back in the app: anything Apple still holds as unfinished is tried again
      try {
        P("App")?.addListener("appStateChange", ({ isActive }) => { if (isActive) setTimeout(() => sync("update"), 800); });
      } catch (error) { report(error, "store app state"); }
    }
  }

  w.CNStore = Object.freeze({
    openPaywall,
    manage,
    restore,
    sync,
    ids: () => ALL_IDS.slice()
  });
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
