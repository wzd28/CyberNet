/* Feedback inbox for admins: Account > Feedback inbox.
   The button only appears when /api/account-status said isAdmin, but that is a
   convenience, not the gate: /api/feedback-admin checks the Supabase token and
   ADMIN_EMAILS on the server and answers 403 to everyone else. Every value from
   the database is written with textContent, never as HTML. */
(function () {
  "use strict";

  var ENDPOINT = "/api/feedback-admin";
  var CATEGORY = { bug: "Bug or problem", feature: "Feature request", billing: "Billing", other: "Other" };
  var FILTERS = [["new", "New"], ["read", "Read"], ["replied", "Replied"], ["all", "All"]];
  var state = { status: "new", items: [], total: null, loading: false, returnFocus: null };
  var modal, list, statusLine, moreBtn;

  function account() { return window.CyberNetAccount || null; }
  function isAdmin() { var a = account(); return Boolean(a && a.appState && a.appState.isAdmin && a.isSignedIn && a.isSignedIn()); }
  function headers(extra) { var a = account(); return a && a.authHeaders ? a.authHeaders(extra || {}) : (extra || {}); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function when(value) {
    try { return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return String(value || ""); }
  }

  function setStatus(text, tone) {
    if (!statusLine) return;
    statusLine.textContent = text || "";
    statusLine.className = "auth-message cn-fbinbox-status" + (tone ? " " + tone : "");
  }

  function buildModal() {
    if (modal) return;
    modal = el("div", "modal");
    modal.id = "feedbackInboxModal";
    modal.setAttribute("aria-hidden", "true");
    var card = el("div", "modal-card glass cn-fbinbox-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "feedbackInboxTitle");
    var close = el("button", "close-modal", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", closeInbox);
    var eyebrow = el("span", "account-eyebrow", "Admin");
    var title = el("h2", null, "Feedback inbox");
    title.id = "feedbackInboxTitle";
    var sub = el("p", "cn-fbinbox-sub", "Everything sent through the feedback form, newest first. Saved in the database even when the notification email fails.");
    var filters = el("div", "cn-fbinbox-filter");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Show feedback by status");
    FILTERS.forEach(function (f) {
      var b = el("button", "secondary-btn", f[1]);
      b.type = "button";
      b.dataset.status = f[0];
      b.setAttribute("aria-pressed", String(f[0] === state.status));
      b.addEventListener("click", function () {
        state.status = f[0];
        filters.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.status === state.status)); });
        load(false);
      });
      filters.appendChild(b);
    });
    statusLine = el("div", "auth-message cn-fbinbox-status");
    statusLine.setAttribute("aria-live", "polite");
    list = el("ol", "cn-fbinbox-list");
    moreBtn = el("button", "secondary-btn cn-fbinbox-more", "Load older");
    moreBtn.type = "button";
    moreBtn.hidden = true;
    moreBtn.addEventListener("click", function () { load(true); });
    [close, eyebrow, title, sub, filters, statusLine, list, moreBtn].forEach(function (n) { card.appendChild(n); });
    modal.appendChild(card);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeInbox(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal.classList.contains("show")) closeInbox(); });
    document.body.appendChild(modal);
  }

  function renderItem(item) {
    var li = el("li", "cn-fbinbox-item");
    li.dataset.status = item.status;
    var head = el("div", "cn-fbinbox-head");
    head.appendChild(el("strong", null, CATEGORY[item.category] || item.category));
    head.appendChild(el("span", "cn-fbinbox-pill", item.status));
    head.appendChild(el("time", "cn-fbinbox-time", when(item.created_at)));
    li.appendChild(head);

    var from = el("p", "cn-fbinbox-meta");
    if (item.email) {
      var mail = el("a", null, item.email);
      mail.href = "mailto:" + encodeURIComponent(item.email).replace(/%40/g, "@") + "?subject=" + encodeURIComponent("Re: your CyberNet AI feedback");
      from.appendChild(mail);
    } else {
      from.appendChild(document.createTextNode("No email given"));
    }
    from.appendChild(document.createTextNode(item.user_id ? " · signed in" : " · not signed in"));
    li.appendChild(from);
    li.appendChild(el("p", "cn-fbinbox-message", item.message));
    li.appendChild(el("p", "cn-fbinbox-meta", [item.page || "page unknown", item.user_agent_summary || "browser unknown", item.ui_version ? "UI " + item.ui_version : ""].filter(Boolean).join(" · ")));

    var actions = el("div", "cn-fbinbox-actions");
    [["read", "Mark read"], ["replied", "Mark replied"], ["new", "Mark new"]].forEach(function (a) {
      if (a[0] === item.status) return;
      var b = el("button", "secondary-btn", a[1]);
      b.type = "button";
      b.addEventListener("click", function () { setItemStatus(item, a[0], b); });
      actions.appendChild(b);
    });
    li.appendChild(actions);
    return li;
  }

  function render() {
    list.textContent = "";
    state.items.forEach(function (item) { list.appendChild(renderItem(item)); });
    var label = FILTERS.filter(function (f) { return f[0] === state.status; })[0][1].toLowerCase();
    if (!state.items.length) setStatus(state.status === "all" ? "No feedback yet." : "No " + label + " feedback.");
    else setStatus((state.total != null ? state.total : state.items.length) + " " + (state.status === "all" ? "in total" : label) + ".");
    moreBtn.hidden = !(state.total != null && state.items.length < state.total);
  }

  function load(append) {
    if (state.loading) return;
    state.loading = true;
    setStatus("Loading…");
    var url = ENDPOINT + "?status=" + encodeURIComponent(state.status) + "&limit=50";
    var last = state.items[state.items.length - 1];
    if (append && last) url += "&before=" + encodeURIComponent(last.created_at);
    fetch(url, { headers: headers({ Accept: "application/json" }), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.error || "The feedback inbox could not be loaded.");
        state.items = append ? state.items.concat(res.data.items || []) : (res.data.items || []);
        state.total = typeof res.data.total === "number" ? res.data.total : null;
        render();
      })
      .catch(function (err) { setStatus(err.message, "error"); })
      .then(function () { state.loading = false; });
  }

  function setItemStatus(item, status, button) {
    button.disabled = true;
    fetch(ENDPOINT, { method: "PATCH", headers: headers({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify({ id: item.id, status: status }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.item) throw new Error(res.data.error || "That change was not saved.");
        if (state.status !== "all" && state.status !== status) {
          state.items = state.items.filter(function (x) { return x.id !== item.id; });
          if (state.total != null) state.total -= 1;
        } else {
          state.items = state.items.map(function (x) { return x.id === item.id ? res.data.item : x; });
        }
        render();
      })
      .catch(function (err) { button.disabled = false; setStatus(err.message, "error"); });
  }

  function openInbox() {
    buildModal();
    document.getElementById("accountDetailsModal")?.classList.remove("show");
    state.returnFocus = document.activeElement;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    modal.querySelector(".close-modal").focus({ preventScroll: true });
    load(false);
  }

  function closeInbox() {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    if (state.returnFocus && state.returnFocus.isConnected) state.returnFocus.focus({ preventScroll: true });
    state.returnFocus = null;
  }

  function syncButton() {
    var actions = document.querySelector("#accountDetailsModal .cybernet-account-actions");
    if (!actions) return;
    var button = document.getElementById("accountFeedbackInboxBtn");
    if (!button) {
      button = el("button", "secondary-btn", "Feedback inbox");
      button.type = "button";
      button.id = "accountFeedbackInboxBtn";
      button.addEventListener("click", openInbox);
      actions.appendChild(button);
    }
    button.hidden = !isAdmin();
  }

  function init() {
    syncButton();
    window.addEventListener("cybernet:session", function () { syncButton(); if (!isAdmin()) closeInbox(); });
    document.getElementById("accountNavBtn")?.addEventListener("click", function () { setTimeout(syncButton, 0); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
