/* CyberNet AI first-run welcome (owner: onboarding). Styles: ui-src/css/67-onboarding.css.

   A short card that can be skipped, shown once after a user's first confirmed sign-in:
     1. Paste anything suspicious. Finishing the tour puts the cursor in the home scan box
        (#cnScanInput).
     2. What your plan includes. The numbers come from the live account state
        (window.CyberNetAccount.appState, filled from /api/account-status), never from this file:
        the server allows Free 3 AI analyses a day while script.js falls back to 5 when the status
        call fails, so a number is shown only once the status has loaded. Quick Scan and Recovery
        allowances use the live state once it exists, otherwise the plan's own card on the
        Pricing page, otherwise no number at all.
     3. Recovery Mode, for when something has already gone wrong.

   When it shows
   - On each "cybernet:session" event (script.js fires it after every sign-in change, once the
     account status has loaded), for a signed-in user whose email is confirmed, when
     user_metadata.onboarded !== true and localStorage cybernet_onboarded_<uid> is absent.
   - Not on page loads that have their own job: /accept-invite or a saved team invite waiting
     (cybernet-business-team.js sends the visitor back to it), password recovery (?reset=1,
     #type=recovery or appState.recoveryMode) and ?checkout= returns. script.js and Supabase
     clean those addresses up right after load, so they are read from the navigation entry and
     from the address this file saw when it started. The next ordinary sign-in shows it.
   - It waits while another dialog (.modal.show, the Legal Center), the cookie bar or the phone
     menu is open, or while the tab is hidden, and opens a moment after they close. If the
     visitor is already typing in a field, it leaves them alone until the next page load.

   Finishing or skipping (Next on the last step, the X, Esc, a click on the backdrop, Skip
   intro, Open Recovery Mode) marks it done: localStorage first, then, in the background,
   supabase auth.updateUser({ data: { onboarded: true } }). Supabase merges that key into
   user_metadata. A failed update never blocks anything; the browser flag still stops a repeat.

   Accessibility: the card is a .modal > .modal-card[role=dialog][aria-modal=true], so
   ui-src/js/08-focus.js (when loaded) makes the rest of the page inert and hands focus back.
   This file also keeps Tab inside the card, closes it on Esc and moves focus to each step's
   heading. Motion: one short fade between steps, none under reduced motion or Pause motion
   (67-onboarding.css). No network calls except the Supabase update above.

   Test hook (screenshots, tests): window.CNOnboarding.open({ fake: true, step: 1-3,
   plan: "free" | "pro" | "business", name: "Alex", confirmed: true }) opens it with sample data.
   A fake run never writes the flag and never calls Supabase. CNOnboarding.state reports the
   last decision; CNOnboarding._test exposes the pure helpers. */
(() => {
  "use strict";
  if (window.CNOnboarding) return;

  const ROOT_ID = "cnOnboard";
  const FLAG_PREFIX = "cybernet_onboarded_";
  const PENDING_INVITE_KEY = "cybernet_pending_invite"; // cybernet-business-team.js
  const OPEN_DELAY_MS = 1200;   // let the page settle after sign-in before the card appears
  const POLL_MS = 600;          // while waiting for another dialog or the cookie bar to close
  const WAIT_LIMIT_MS = 15 * 60 * 1000;
  const STEPS = 3;

  const doc = document;
  const mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const mqSheet = window.matchMedia ? window.matchMedia("(max-width: 1023.98px)") : null;

  /* ---------- the address this page was opened with ---------- */
  function readStart(hrefs) {
    const urls = [];
    hrefs.forEach(href => { try { if (href) urls.push(new URL(href, "https://cybernetai.app/")); } catch { /* ignore */ } });
    const hashType = url => new URLSearchParams(String(url.hash || "").replace(/^#/, "")).get("type") || "";
    const any = test => urls.some(url => { try { return test(url); } catch { return false; } });
    return {
      checkout: any(url => url.searchParams.has("checkout")),
      recovery: any(url => url.searchParams.get("reset") === "1" || hashType(url) === "recovery"),
      confirmed: any(url => hashType(url) === "signup")
    };
  }

  function startHrefs() {
    const list = [];
    try { list.push(window.location.href); } catch { /* ignore */ }
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (nav && nav.name) list.push(nav.name);
    } catch { /* ignore */ }
    return list;
  }

  const START = readStart(startHrefs());

  /* ---------- the decision (pure; see _test) ---------- */
  // s: { user, flag, invitePage, pendingInvite, recovery, checkout, blocked, typing }
  // Returns "show", "wait", or the reason it does not show.
  function decide(s) {
    const user = s && s.user;
    if (!user || !user.id) return "signed-out";
    if (user.user_metadata && user.user_metadata.onboarded === true) return "done-account";
    if (s.flag) return "done-browser";
    if (!(user.email_confirmed_at || user.confirmed_at)) return "unconfirmed";
    if (s.invitePage || s.pendingInvite) return "invite";
    if (s.recovery) return "recovery";
    if (s.checkout) return "checkout";
    if (s.blocked) return "wait";
    if (s.typing) return "busy";
    return "show";
  }
  // Reasons that hold for the rest of this page load.
  const LATCH = ["invite", "recovery", "checkout", "busy"];

  /* ---------- the plan summary (pure; see _test) ---------- */
  // Pricing card lines -> { quickScans, analyses, recovery } (numbers, or Infinity for Unlimited).
  function parseCard(lines) {
    const out = {};
    const num = value => Number(String(value).replace(/,/g, ""));
    (lines || []).forEach(raw => {
      const line = String(raw || "").replace(/\s+/g, " ");
      let m;
      if (/\bunlimited quick scans\b/i.test(line)) out.quickScans = Infinity;
      else if ((m = line.match(/(\d[\d,]*)\s+quick scans?\s+(?:per|a)\s+day/i))) out.quickScans = num(m[1]);
      if (/\bunlimited ai analys[ie]s\b/i.test(line)) out.analyses = Infinity;
      else if ((m = line.match(/(\d[\d,]*)\s+ai analys[ie]s\s+(?:per|a)\s+day/i))) out.analyses = num(m[1]);
      if ((m = line.match(/(\d[\d,]*)\s+recovery cases?\s+(?:per|a)\s+day/i))) out.recovery = num(m[1]);
    });
    return out;
  }

  function liveLimit(usage) {
    const n = Number(usage && usage.limit);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n >= 99999 ? Infinity : n; // the server reports admin and unlimited as 99999 or more
  }

  function nextResetText(iso) {
    const at = new Date(iso || "");
    if (!iso || Number.isNaN(at.getTime())) return "";
    try { return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
  }

  // state: an appState snapshot. card(plan): that plan's pricing-card facts.
  // Returns { plan, items: [{ value, label, hint }], reset }. plan "" means the account status is
  // not known (not loaded yet, or the call failed): no plan name and no numbers are shown then.
  function planSummary(state, card) {
    const known = !!(state && state.accountReady && !state.accountStatusError && state.user !== null);
    if (!known) return { plan: "", items: [], reset: "" };
    const raw = String(state.profile && state.profile.plan || "").toLowerCase();
    const plan = raw === "business" || raw === "pro" ? raw : "free";
    const facts = (card && card(plan)) || {};
    const analyses = liveLimit(state.usage) ?? facts.analyses ?? null;
    const recovery = liveLimit(state.recoveryUsage) ?? facts.recovery ?? null;
    const items = [];
    const per = (n, one, many) => (n === Infinity ? many : n === 1 ? `${one} a day` : `${many} a day`);
    if (plan === "business") {
      // One shared pool covers Quick Scan and Analysis AI for the whole team.
      if (analyses !== null) items.push({ value: analyses, label: analyses === Infinity ? "Analyses for your team" : "Analyses a day for your team", hint: "Quick Scan and Analysis AI share this pool" });
      if (recovery !== null) items.push({ value: recovery, label: recovery === Infinity ? "Recovery cases for your team" : "Recovery cases a day for your team", hint: "" });
    } else {
      const quick = liveLimit(state.quickScanUsage) ?? facts.quickScans ?? null;
      if (analyses !== null) items.push({ value: analyses, label: per(analyses, "AI analysis", "AI analyses"), hint: "Text, links or images, in any mix" });
      if (quick !== null) items.push({ value: quick, label: per(quick, "Quick Scan", "Quick Scans"), hint: "" });
      if (recovery !== null) items.push({ value: recovery, label: per(recovery, "Recovery case", "Recovery cases"), hint: "" });
    }
    const own = liveLimit(state.usage);
    const reset = own !== null && own !== Infinity ? nextResetText(state.usage.resetDate) : "";
    return { plan, items, reset };
  }

  function cardFacts(plan) {
    const card = doc.querySelector({ free: ".free-price-card", pro: ".pro-price-card", business: ".business-price-card" }[plan] || "#cnNoCard");
    if (!card) return {};
    return parseCard(Array.from(card.querySelectorAll("li"), li => li.textContent));
  }

  /* ---------- page state ---------- */
  let latched = "";        // a reason this page load never shows the card
  let lastVerdict = "";
  let lastResult = null;
  let delayTimer = 0;
  let waitTimer = 0;
  let waitStarted = 0;
  let current = null;      // { user, fake, state, step, opener, name, confirmed }
  let root = null;
  const sentUpdate = new Set();

  const appState = () => (window.CyberNetAccount && window.CyberNetAccount.appState) || null;
  const store = fn => { try { return fn(window.localStorage); } catch { return null; } };
  const flagKey = uid => FLAG_PREFIX + uid;
  const hasFlag = uid => !!store(s => s.getItem(flagKey(uid)));
  const reduced = () => !!(mqReduce && mqReduce.matches) || doc.documentElement.classList.contains("cn-still");

  function onInvitePage() {
    return window.location.pathname.replace(/\/+$/, "") === "/accept-invite";
  }

  function otherLayerOpen() {
    const open = Array.from(doc.querySelectorAll(".modal.show, .cn-legal-modal.show")).some(el => el.id !== ROOT_ID);
    if (open) return true;
    const bar = doc.getElementById("cnConsentBar");
    if (bar && !bar.hidden && bar.getClientRects().length) return true;
    // script.js's short confirmation ("Email confirmed. You're signed in.") sits at the bottom of
    // the screen, where the phone sheet puts this card's buttons. Let it finish first: it leaves
    // by itself within 6.5 s, or on a tap or Escape.
    const toast = doc.getElementById("cnAuthToast");
    if (toast && toast.classList.contains("is-shown")) return true;
    const nav = doc.querySelector("header.navbar.open");
    return !!(nav && (!mqSheet || mqSheet.matches));
  }

  function blockedNow() {
    return !!doc.hidden || otherLayerOpen();
  }

  // Someone already typing in a field on the page (not inside a dialog): the field has focus
  // and already holds text. An empty field that merely has focus (the skip link puts the cursor
  // in the scan box) does not count.
  function typingNow() {
    const a = doc.activeElement;
    if (!a || a === doc.body || (a.closest && a.closest(".modal, .cn-legal-modal"))) return false;
    if (a.isContentEditable) return !!String(a.textContent || "").trim();
    const field = a.tagName === "TEXTAREA" ||
      (a.tagName === "INPUT" && !/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test(a.type || ""));
    return field && !!String(a.value || "").trim();
  }

  function snapshot() {
    const st = appState();
    const user = st && st.user;
    return {
      user,
      flag: !!(user && user.id && hasFlag(user.id)),
      invitePage: onInvitePage(),
      pendingInvite: !!store(s => s.getItem(PENDING_INVITE_KEY)),
      recovery: START.recovery || !!(st && st.recoveryMode),
      checkout: START.checkout,
      blocked: blockedNow(),
      typing: typingNow()
    };
  }

  function schedule() {
    clearTimeout(delayTimer);
    delayTimer = setTimeout(evaluate, OPEN_DELAY_MS);
  }

  function stopWaiting() {
    clearInterval(waitTimer);
    waitTimer = 0;
  }

  function startWaiting() {
    if (waitTimer) return;
    waitStarted = Date.now();
    waitTimer = setInterval(() => {
      if (Date.now() - waitStarted > WAIT_LIMIT_MS) { stopWaiting(); return; }
      if (!blockedNow()) { stopWaiting(); schedule(); }
    }, POLL_MS);
  }

  function evaluate() {
    if (current || latched) return;
    const s = snapshot();
    const verdict = decide(s);
    lastVerdict = verdict;
    if (verdict === "wait") { startWaiting(); return; }
    stopWaiting();
    if (verdict === "show") { open({ user: s.user }); return; }
    if (LATCH.includes(verdict)) latched = verdict;
    // Already done on the account (another browser): remember it here too.
    if (verdict === "done-account") store(st => st.setItem(flagKey(s.user.id), JSON.stringify({ at: new Date().toISOString(), how: "account" })));
  }

  function onSession() {
    const st = appState();
    if (!(st && st.user)) {
      // Signed out: drop any pending show, and close a real (not fake) card.
      clearTimeout(delayTimer);
      stopWaiting();
      if (current && !current.fake) closeCard();
      return;
    }
    if (current && current.user && current.user.id !== st.user.id && !current.fake) closeCard();
    schedule();
  }

  /* ---------- marking it done ---------- */
  function markDone(how) {
    if (!current) return;
    const { user, fake } = current;
    lastResult = { how, fake: !!fake, at: Date.now() };
    if (fake || !user || !user.id) return;
    store(s => s.setItem(flagKey(user.id), JSON.stringify({ at: new Date().toISOString(), how })));
    if (sentUpdate.has(user.id)) return;
    sentUpdate.add(user.id);
    const sb = appState() && appState().supabase;
    if (!(sb && sb.auth && typeof sb.auth.updateUser === "function")) return;
    // Background and best effort. It is never awaited, so nothing waits on it.
    Promise.resolve()
      .then(() => sb.auth.updateUser({ data: { onboarded: true } }))
      .then(result => { lastResult.account = result && result.error ? "failed" : "saved"; })
      .catch(() => { lastResult.account = "failed"; });
  }

  /* ---------- markup ---------- */
  const ICONS = {
    scan: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" focusable="false"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h-.5A2.5 2.5 0 0 1 4 13.5v-7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 8.5h8M8 11.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    plan: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m9 14.5 2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    recovery: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" focusable="false"><path d="M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6l-7-3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function build() {
    if (root && root.isConnected) return root;
    root = el("div", "modal cn-onboard");
    root.id = ROOT_ID;
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="modal-card cn-onboard-card" role="dialog" aria-modal="true" aria-labelledby="cnOnboardTitle" aria-describedby="cnOnboardBody">
        <button type="button" class="close-modal" data-cn-onboard="skip" aria-label="Skip the introduction">&times;</button>
        <div class="cn-onboard-top">
          <span class="account-eyebrow cn-onboard-eyebrow" id="cnOnboardEyebrow">Welcome</span>
          <span class="cn-onboard-count" id="cnOnboardCount">Step 1 of ${STEPS}</span>
        </div>
        <p class="cn-onboard-hello" id="cnOnboardHello" hidden></p>
        <div class="cn-onboard-step" id="cnOnboardStep"></div>
        <div class="cn-onboard-nav">
          <button type="button" class="cn-ghost-btn cn-onboard-back" id="cnOnboardBack" data-cn-onboard="skip">Skip intro</button>
          <ol class="cn-onboard-dots" aria-hidden="true">${"<li></li>".repeat(STEPS)}</ol>
          <button type="button" class="primary-btn cn-onboard-next" id="cnOnboardNext" data-cn-onboard="next">Next</button>
        </div>
      </div>`;
    root.addEventListener("click", onClick);
    doc.body.appendChild(root);
    return root;
  }

  function stepHead(icon, title) {
    const head = el("div", "cn-onboard-head");
    const tile = el("span", "cn-onboard-icon");
    tile.innerHTML = ICONS[icon];
    const h2 = el("h2", "cn-onboard-title", title);
    h2.id = "cnOnboardTitle";
    h2.tabIndex = -1;
    head.append(tile, h2);
    return head;
  }

  function body(text) {
    const p = el("p", "cn-onboard-body", text);
    p.id = "cnOnboardBody";
    return p;
  }

  function renderStep1(box) {
    box.append(
      stepHead("scan", "Paste anything suspicious"),
      body("Got a text, an email or a link you are not sure about? Paste it into the box on the home page. CyberNet AI tells you in plain words whether it looks like a scam, and what to do next.")
    );
    const kinds = el("ul", "cn-onboard-kinds");
    kinds.setAttribute("aria-label", "What you can check");
    ["Text messages", "Emails", "Links"].forEach(k => kinds.append(el("li", "", k)));
    box.append(kinds);
  }

  function factValue(value) {
    const word = value === Infinity;
    return el("span", `cn-onboard-num${word ? " is-word" : ""}`, word ? "Unlimited" : String(value));
  }

  const GENERIC_PLAN = "Every account gets a daily allowance of Quick Scans, AI analyses and Recovery cases.";

  function renderStep2(box) {
    const st = current.state || appState();
    const sum = planSummary(st, cardFacts);
    const title = sum.plan === "business" ? "What your Business plan includes"
      : sum.plan === "pro" ? "What your Pro plan includes"
      : sum.plan === "free" ? "What your free plan includes"
      : "What your plan includes";
    const lead = sum.plan === "business" ? "Your whole team shares one daily allowance:"
      : sum.plan === "pro" ? "Thank you for choosing Pro. Every day you get:"
      : sum.plan === "free" ? "The free plan costs nothing and has no end date. Every day you get:"
      : GENERIC_PLAN;
    box.append(stepHead("plan", title), body(sum.items.length ? lead : GENERIC_PLAN));
    if (sum.items.length) {
      const list = el("ul", "cn-onboard-facts");
      sum.items.forEach(item => {
        const li = el("li");
        const text = el("span", "cn-onboard-fact");
        text.append(el("span", "cn-onboard-label", item.label));
        if (item.hint) text.append(el("span", "cn-onboard-hint", item.hint));
        li.append(factValue(item.value), text);
        list.append(li);
      });
      box.append(list);
    }
    const notes = [];
    if (sum.reset) notes.push(`AI analyses start again every day at ${sum.reset}, your time.`);
    notes.push(sum.plan ? "You can see what is left today at the top of each tool." : "You can see what is left today at the top of each tool, and compare plans on the Pricing page.");
    box.append(el("p", "cn-onboard-note", notes.join(" ")));
  }

  function renderStep3(box) {
    box.append(
      stepHead("recovery", "Already clicked, paid or shared a code?"),
      body("Open Recovery Mode and describe what happened in your own words. It builds a step-by-step plan to protect your accounts, money and devices, starting with what to do first.")
    );
    const tip = el("p", "cn-onboard-tip");
    tip.append(el("strong", "", "Good to know: "), doc.createTextNode("Recovery Mode never needs your passwords, one-time codes or card numbers, so leave them out."));
    const alt = el("button", "secondary-btn cn-onboard-alt", "Open Recovery Mode");
    alt.type = "button";
    alt.dataset.cnOnboard = "recovery";
    box.append(tip, alt);
  }

  function render(step, opts) {
    const card = root.querySelector(".cn-onboard-card");
    const box = root.querySelector("#cnOnboardStep");
    current.step = step;
    box.textContent = "";
    box.dataset.step = String(step);
    card.dataset.step = String(step);
    if (step === 1) renderStep1(box);
    else if (step === 2) renderStep2(box);
    else renderStep3(box);

    root.querySelector("#cnOnboardEyebrow").textContent = current.confirmed ? "Email confirmed" : "Welcome";
    root.querySelector("#cnOnboardCount").textContent = `Step ${step} of ${STEPS}`;
    const hello = root.querySelector("#cnOnboardHello");
    hello.hidden = step !== 1;
    hello.textContent = current.name ? `Hi ${current.name}, here is CyberNet AI in three short steps.` : "Here is CyberNet AI in three short steps.";

    const back = root.querySelector("#cnOnboardBack");
    back.textContent = step === 1 ? "Skip intro" : "Back";
    back.dataset.cnOnboard = step === 1 ? "skip" : "back";
    const next = root.querySelector("#cnOnboardNext");
    next.textContent = step === STEPS ? "Start scanning" : "Next";
    next.dataset.cnOnboard = step === STEPS ? "scan" : "next";
    root.querySelectorAll(".cn-onboard-dots li").forEach((dot, i) => dot.classList.toggle("is-active", i === step - 1));

    if (!reduced() && opts && opts.animate) {
      box.classList.remove("is-entering");
      void box.offsetWidth; // restart the fade
      box.classList.add("is-entering");
    }
    if (card.scrollTop) card.scrollTop = 0;
    if (!opts || opts.focus !== false) focusTitle();
  }

  function focusTitle() {
    const title = root && root.querySelector("#cnOnboardTitle");
    if (!title) return;
    try { title.focus({ preventScroll: true }); } catch { title.focus(); }
  }

  /* ---------- open and close ---------- */
  function displayName(user) {
    const m = (user && user.user_metadata) || {};
    const raw = String(m.first_name || m.given_name || String(m.full_name || m.name || "").trim().split(/\s+/)[0] || "").trim().slice(0, 40);
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  }

  function open({ user, fake = false, state = null, step = 1, name, confirmed }) {
    build();
    const active = doc.activeElement;
    current = {
      user,
      fake,
      state,
      step,
      opener: active && active !== doc.body && !root.contains(active) ? active : null,
      name: name !== undefined ? String(name || "").slice(0, 40) : displayName(user),
      confirmed: confirmed !== undefined ? !!confirmed : START.confirmed
    };
    render(step, { focus: false });
    root.classList.add("show");
    root.setAttribute("aria-hidden", "false");
    doc.addEventListener("keydown", onKey);
    requestAnimationFrame(focusTitle);
  }

  function closeCard() {
    if (!root) return;
    root.classList.remove("show");
    root.setAttribute("aria-hidden", "true");
    doc.removeEventListener("keydown", onKey);
    current = null;
  }

  // Focus can only land once the page is no longer inert (08-focus.js lifts it a frame after
  // the card closes), so this retries for up to a second.
  function focusWhenFree(target, after) {
    if (!target) return;
    const started = Date.now();
    (function attempt() {
      const free = target.isConnected && !(target.closest && target.closest("[inert]"));
      if (free) {
        try { target.focus({ preventScroll: true }); } catch { target.focus(); }
        if (doc.activeElement === target) { if (after) after(target); return; }
      }
      if (Date.now() - started < 1000) setTimeout(attempt, 40);
    })();
  }

  function showPage(id, done) {
    const page = doc.getElementById(id);
    if (!page) { done(false); return; }
    if (page.classList.contains("active-page")) { done(true); return; }
    const link = doc.querySelector(`.nav-tabs .nav-link[data-page="${id}"]`) || doc.querySelector(`button[data-page="${id}"]`);
    if (link) link.click();
    const started = Date.now();
    (function check() {
      if (page.classList.contains("active-page")) { setTimeout(() => done(true), 60); return; }
      if (Date.now() - started > 2000) { done(false); return; }
      setTimeout(check, 50);
    })();
  }

  function finish(how) {
    if (!current) return;
    const opener = current.opener;
    markDone(how);
    closeCard();
    if (how === "scan") {
      showPage("home", () => {
        const input = doc.getElementById("cnScanInput");
        if (!input) return;
        try { input.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" }); } catch { input.scrollIntoView(); }
        focusWhenFree(input);
      });
    } else if (how === "recovery") {
      showPage("recovery", () => focusWhenFree(doc.getElementById("cnMain")));
    } else if (opener) {
      focusWhenFree(opener);
    }
  }

  function go(step) {
    if (!current) return;
    render(Math.max(1, Math.min(STEPS, step)), { animate: true });
  }

  function onClick(event) {
    if (!current) return;
    if (event.target === root) { finish("backdrop"); return; }
    const button = event.target.closest && event.target.closest("[data-cn-onboard]");
    if (!button || !root.contains(button)) return;
    const action = button.dataset.cnOnboard;
    if (action === "next") go(current.step + 1);
    else if (action === "back") go(current.step - 1);
    else if (action === "skip") finish("skip");
    else if (action === "scan") finish("scan");
    else if (action === "recovery") finish("recovery");
  }

  function tabbables() {
    const card = root.querySelector(".cn-onboard-card");
    return Array.from(card.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      .filter(node => !node.disabled && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
  }

  function onKey(event) {
    if (!current) return;
    if ((event.key === "Escape" || event.key === "Esc") && !event.isComposing) {
      if (otherLayerOpen()) return; // a dialog opened above this one owns the key
      event.preventDefault();
      finish("escape");
      return;
    }
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    if (otherLayerOpen()) return;
    const list = tabbables();
    if (!list.length) { event.preventDefault(); return; }
    const card = root.querySelector(".cn-onboard-card");
    const a = doc.activeElement, first = list[0], last = list[list.length - 1];
    if (!card.contains(a)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && a === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && a === last) { event.preventDefault(); first.focus(); }
  }

  /* ---------- test hook ---------- */
  function fakeState(plan) {
    const p = plan === "pro" || plan === "business" ? plan : "free";
    const facts = cardFacts(p);
    const reset = new Date();
    reset.setUTCDate(reset.getUTCDate() + 1);
    reset.setUTCHours(0, 0, 0, 0);
    // Sample values for screenshots only; a real run always reads the account state.
    const analyses = p === "business" ? 50 : (facts.analyses ?? (p === "pro" ? 15 : 3));
    return {
      accountReady: true,
      accountStatusError: false,
      user: { id: "fake" },
      profile: { plan: p },
      usage: { used: 0, limit: analyses, remaining: analyses, resetDate: reset.toISOString() },
      quickScanUsage: { used: 0, limit: 0 },
      recoveryUsage: { used: 0, limit: p === "business" ? 20 : 0 }
    };
  }

  window.CNOnboarding = Object.freeze({
    open(options) {
      const o = options || {};
      if (current) closeCard();
      const fake = o.fake !== false;
      const st = appState();
      if (!fake && !(st && st.user)) return false;
      open({
        user: fake ? { id: "fake", user_metadata: {} } : st.user,
        fake,
        state: fake ? fakeState(o.plan) : null,
        step: Math.max(1, Math.min(STEPS, Number(o.step) || 1)),
        name: o.name !== undefined ? o.name : (fake ? "" : undefined),
        confirmed: o.confirmed
      });
      return true;
    },
    // Closes without marking anything (finishing or skipping in the card marks it done).
    close() { if (current) closeCard(); },
    get state() {
      return { open: !!current, step: current ? current.step : 0, fake: !!(current && current.fake), lastVerdict, latched, lastResult, start: { ...START } };
    },
    _test: { decide, parseCard, planSummary, readStart, liveLimit }
  });

  window.addEventListener("cybernet:session", onSession);
  // Safety net: if this file loads after the first session event (it is meant to load after
  // script.js, which fires it only once the account status has arrived), look once anyway.
  const early = appState();
  if (early && early.user && early.accountReady) schedule();
})();
