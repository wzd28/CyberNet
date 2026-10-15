/*
  CyberNet AI — Manage Business

  Self-contained module (same pattern as cybernet-account-api-upgrade.js):
  injects its own stylesheet and modals, and hooks into the existing account
  modal by id rather than reaching into another script's closure.

  Covers:
    • Manage Business panel — seat usage, shared daily pools, member roster
      with each member's own usage today, invites, and the owner's activity log
    • Accept-invite flow at /accept-invite?token=..., including the
      sign-in-first gate for people who open the link signed out
*/
(() => {
  "use strict";

  const PENDING_BUSINESS_CHECKOUT = "cybernet_pending_business_checkout";
  const PENDING_INVITE = "cybernet_pending_invite";
  const PENDING_INVITE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const INVITE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
  const STYLESHEET_VERSION = "20260927-2";

  function start() {
    if (document.documentElement.dataset.cybernetBusinessTeam === "ready") return;
    document.documentElement.dataset.cybernetBusinessTeam = "ready";

    ensureStylesheet();
    createTeamModal();
    createAcceptInviteModal();
    injectManageButton();
    whenAppReady(initializeController);
  }

  // script.js creates the page's Supabase client in its DOMContentLoaded
  // handler, which runs after this deferred file has executed. Wait for it so
  // the page shares one auth client instead of creating another one.
  function whenAppReady(callback) {
    if (window.CyberNetAccount || document.readyState === "complete") {
      callback();
      return;
    }
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      callback();
    };
    document.addEventListener("DOMContentLoaded", run, { once: true });
    window.addEventListener("load", run, { once: true });
  }

  function ensureStylesheet() {
    if (document.getElementById("cybernetBusinessTeamStylesheet")) return;

    const link = document.createElement("link");
    link.id = "cybernetBusinessTeamStylesheet";
    link.rel = "stylesheet";
    link.href = `/cybernet-business-team.css?v=${STYLESHEET_VERSION}`;
    document.head.appendChild(link);
  }

  function createTeamModal() {
    if (document.getElementById("businessTeamModal")) return;

    const modal = document.createElement("div");
    modal.id = "businessTeamModal";
    modal.className = "modal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="modal-card glass reveal cn-team-card"
           role="dialog"
           aria-modal="true"
           aria-labelledby="cnTeamTitle">
        <button class="close-modal" id="cnTeamClose" type="button" aria-label="Close">&times;</button>

        <div class="cn-team-head">
          <div>
            <span class="account-eyebrow">YOUR CYBERNET BUSINESS TEAM</span>
            <h2 id="cnTeamTitle">Manage Business</h2>
            <p id="cnTeamIntro">Add teammates, see exactly who used what today, and review every analysis your team has run.</p>
          </div>
          <span class="cn-team-tier-badge" id="cnTeamTier">—</span>
        </div>

        <div class="cn-team-loader" id="cnTeamLoader" tabindex="-1" hidden>
          <span class="cn-team-loader-mark" aria-hidden="true">
            <svg viewBox="0 0 24 26" fill="none" width="40" height="44"><path d="M12 2 L21 6 L20 15 L12 24 L4 15 L3 6 Z" stroke="#22D3EE" stroke-width="1.8" stroke-linejoin="round"/><rect x="8.3" y="12.5" width="7.4" height="6.2" rx="1.2" fill="#22D3EE"/><path d="M9.6 12.5v-2.3a2.4 2.4 0 0 1 4.8 0v2.3" stroke="#22D3EE" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1" fill="#08152a"/><path d="M12 15.9v1.4" stroke="#08152a" stroke-width="1" stroke-linecap="round"/></svg>
          </span>
          <p class="cn-team-loader-title" id="cnTeamLoaderTitle">Loading your team</p>
          <p class="cn-team-loader-text" id="cnTeamLoaderText">Seats, invites and today's usage are on their way.</p>
          <span class="cn-team-loader-line" aria-hidden="true"><span></span></span>
          <button class="primary-btn cn-team-retry" id="cnTeamRetry" type="button" hidden>Try again</button>
        </div>
        <p class="cn-team-status" id="cnTeamStatus" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0"></p>

        <div class="cn-team-stats">
          <div class="cn-team-stat">
            <span>Seats used</span>
            <strong id="cnTeamSeats">—</strong>
            <small id="cnTeamSeatsNote">Members plus invites still waiting to be accepted. Expired or cancelled invites free their seat.</small>
          </div>

          <div class="cn-team-stat">
            <span>Analyses left today</span>
            <strong id="cnTeamPool">—</strong>
            <div class="cn-team-track" id="cnTeamPoolTrack"><span></span></div>
            <small>Quick Scan and Analysis AI draw from one pool shared by your whole team. Resets at UTC midnight.</small>
          </div>

          <div class="cn-team-stat">
            <span>Recovery cases per day</span>
            <strong id="cnTeamRecovery">—</strong>
            <small>Also shared across the team. Resets daily at 12:00 PM Gulf Standard Time.</small>
          </div>
        </div>

        <div class="cn-team-section" id="cnTeamInviteSection">
          <div class="cn-team-section-head">
            <h3>Invite a teammate</h3>
            <p>They'll get an email with a link to join. If they already have a CyberNet AI account, they just sign in and accept.</p>
          </div>
          <div class="cn-team-invite-row">
            <input id="cnTeamInviteEmail" type="email" autocomplete="off" spellcheck="false" placeholder="teammate@yourcompany.com" />
            <button class="primary-btn" id="cnTeamInviteBtn" type="button">Send invite</button>
          </div>
          <p class="cn-team-invite-note">Invites expire 24 hours after you send them. You can cancel a pending invite any time before it's accepted.</p>
          <div class="cn-team-pending" id="cnTeamPending"></div>
        </div>

        <div class="cn-team-section">
          <div class="cn-team-section-head">
            <h3>Team members</h3>
            <p id="cnTeamMembersNote">"Used today" is each person's own share of the team pool.</p>
          </div>
          <div class="cn-team-members" id="cnTeamMembers"></div>
        </div>

        <div class="cn-team-section" id="cnTeamActivitySection">
          <div class="cn-team-section-head">
            <h3>Team activity</h3>
            <p>Every Quick Scan, Analysis AI check and recovery case your teammates have run, newest first. Tap an entry to see what they submitted and the full result.</p>
          </div>
          <div class="cn-team-activity" id="cnTeamActivity"></div>
        </div>

        <div id="cnTeamMessage" class="cn-team-message" aria-live="polite"></div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function createAcceptInviteModal() {
    if (document.getElementById("acceptInviteModal")) return;

    const modal = document.createElement("div");
    modal.id = "acceptInviteModal";
    modal.className = "modal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="modal-card glass reveal cn-invite-card"
           role="dialog"
           aria-modal="true"
           aria-labelledby="cnInviteTitle">
        <button class="close-modal" id="cnInviteClose" type="button" aria-label="Close">&times;</button>

        <span class="account-eyebrow">CYBERNET AI BUSINESS TEAM INVITE</span>
        <h2 id="cnInviteTitle">You've been invited to join a team</h2>
        <p id="cnInviteBody">Joining gives you Business-tier access to Quick Scan, Analysis AI, and Recovery Mode while you're on the team.</p>

        <div class="cn-invite-terms">
          <strong>Before you accept</strong>
          <ul>
            <li>The team owner can see what you submit (the messages, links and QR code contents you check, and what you write in Recovery Mode) and the full results of every Quick Scan, analysis, and recovery case you run on this team. Pictures you upload are not stored.</li>
            <li>Once you join, only the team owner can remove you from the team.</li>
            <li>Your Quick Scan, Analysis AI, and Recovery Mode usage comes out of the team's shared daily pool.</li>
          </ul>
        </div>

        <div class="cn-invite-actions">
          <button class="primary-btn" id="cnInviteAcceptBtn" type="button">Accept and join the team</button>
          <button class="secondary-btn" id="cnInviteDeclineBtn" type="button">Not now</button>
        </div>

        <div id="cnInviteMessage" class="cn-team-message" aria-live="polite"></div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function injectManageButton() {
    if (document.getElementById("accountManageBusinessBtn")) return true;

    const actions = document.querySelector("#accountDetailsModal .cybernet-account-actions");
    if (!actions) return false;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-btn";
    button.id = "accountManageBusinessBtn";
    button.textContent = "Manage Business";
    button.hidden = true;

    actions.insertBefore(button, actions.firstChild);
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
    ));
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
      });
    } catch {
      return "—";
    }
  }

  function initializeController() {
    const config = window.CYBERNET_CONFIG || {};
    const supabaseReady =
      Boolean(window.supabase?.createClient) &&
      /^https:\/\//.test(String(config.SUPABASE_URL || "")) &&
      String(config.SUPABASE_ANON_KEY || "").length > 20;

    // Reuse script.js's client. The fallback is only used if script.js failed,
    // so it neither refreshes tokens nor consumes codes in the URL.
    const shared = window.CyberNetAccount?.appState?.supabase || null;
    const client = shared || (supabaseReady
      ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
        })
      : null);

    const modal = document.getElementById("businessTeamModal");
    const closeBtn = document.getElementById("cnTeamClose");
    const inviteSection = document.getElementById("cnTeamInviteSection");
    const inviteEmail = document.getElementById("cnTeamInviteEmail");
    const inviteBtn = document.getElementById("cnTeamInviteBtn");
    const activitySection = document.getElementById("cnTeamActivitySection");
    const message = document.getElementById("cnTeamMessage");

    const inviteModal = document.getElementById("acceptInviteModal");
    const inviteCloseBtn = document.getElementById("cnInviteClose");
    const inviteAcceptBtn = document.getElementById("cnInviteAcceptBtn");
    const inviteDeclineBtn = document.getElementById("cnInviteDeclineBtn");
    const inviteMessage = document.getElementById("cnInviteMessage");

    let session = null;
    // False until the first answer from Supabase: until then "no session"
    // does not yet mean "signed out".
    let sessionKnown = false;
    let team = null;
    let autoOpened = false;

    // Pending-invite countdown: one interval for the whole list, only while
    // the panel is open. clockSkew corrects a device clock that is off.
    let countdownTimer = null;
    let clockSkew = 0;
    let expiryRefreshTimer = null;
    let lastExpiryRefresh = 0;

    const INTRO_OWNER = "Add teammates, see exactly who used what today, and review every analysis your team has run.";
    const INTRO_MEMBER = "You're a member of this team. Your Business access and daily limits come from the team's shared pool.";

    function setMessage(text = "", tone = "") {
      if (!message) return;
      message.textContent = text;
      message.className = `cn-team-message ${tone}`.trim();
    }

    function setInviteMessage(text = "", tone = "") {
      if (!inviteMessage) return;
      inviteMessage.textContent = text;
      inviteMessage.className = `cn-team-message ${tone}`.trim();
    }

    // Every change of signed-in user drops what was loaded for the previous one.
    function setSession(next) {
      const previous = session?.user?.id || "";
      session = next || null;
      sessionKnown = true;
      if ((session?.user?.id || "") !== previous) forgetTeamData();
      return previous;
    }

    async function getSession() {
      if (!client) {
        sessionKnown = true;
        return null;
      }
      const { data } = await client.auth.getSession();
      setSession(data?.session || null);
      return session;
    }

    // The session in memory is used as it is while its token has more than
    // 90 seconds left (Supabase keeps it current through onAuthStateChange);
    // otherwise Supabase is asked, which refreshes a token that is expiring.
    async function readySession() {
      const expiresAt = Number(session?.expires_at) * 1000;
      if (session?.access_token && Number.isFinite(expiresAt) && expiresAt - Date.now() > 90 * 1000) {
        return session;
      }
      return getSession();
    }

    function authHeaders(extra = {}) {
      return session?.access_token
        ? { ...extra, Authorization: `Bearer ${session.access_token}` }
        : { ...extra };
    }

    function openExistingAuth() {
      const authModal = document.getElementById("authModal");
      if (authModal) {
        authModal.classList.add("show");
        authModal.setAttribute("aria-hidden", "false");
      } else {
        document.getElementById("openAuth")?.click();
      }
    }

    /* ─── Manage Business panel ─── */

    function renderMembers() {
      const host = document.getElementById("cnTeamMembers");
      if (!host || !team) return;

      const isOwner = team.role === "owner";
      const myId = session?.user?.id;

      host.innerHTML = (team.members || []).map((member) => {
        const isYou = member.userId === myId;
        const name = member.fullName || member.email?.split("@")[0] || "Team member";
        const canRemove = isOwner && member.role !== "owner";

        return `
          <div class="cn-team-member">
            <div class="cn-team-member-id">
              <div class="cn-team-member-name">
                ${escapeHtml(name)}
                <span class="cn-role-badge ${member.role === "owner" ? "" : "is-member"}">${escapeHtml(member.role)}</span>
                ${isYou ? '<span class="cn-role-badge is-you">You</span>' : ""}
              </div>
              <span class="cn-team-member-email">${escapeHtml(member.email || "")}</span>
            </div>
            <div class="cn-team-member-usage">
              ${Number(member.usageToday) || 0}
              <small>used today</small>
            </div>
            ${canRemove
              ? `<button class="cn-team-remove" type="button" data-remove-user="${escapeHtml(member.userId)}" data-remove-label="${escapeHtml(name)}">Remove</button>`
              : ""}
          </div>
        `;
      }).join("") || '<div class="cn-team-empty">No active members yet.</div>';

      host.querySelectorAll("[data-remove-user]").forEach((button) => {
        button.addEventListener("click", () => {
          removeMember(button.dataset.removeUser, button.dataset.removeLabel, button);
        });
      });
    }

    function renderPending() {
      const host = document.getElementById("cnTeamPending");
      if (!host || !team) return;

      const pending = team.pendingInvites || [];
      host.innerHTML = pending.map((invite) => {
        const expiresText = formatExpiry(invite.expiresAt);
        const label = `Pending invite to ${invite.email || "this person"}${expiresText ? `, expires ${expiresText}` : ""}`;

        // The ticking text has no aria-live on purpose; the row's label carries
        // the exact expiry time for screen readers instead.
        return `
          <div class="cn-team-pending-item" role="group" title="${escapeHtml(expiresText ? `Expires ${expiresText}` : "")}" aria-label="${escapeHtml(label)}">
            <div class="cn-team-pending-id">
              <span class="cn-team-pending-email">${escapeHtml(invite.email)}</span>
              <span class="cn-team-pending-meta">
                <span class="cn-team-pending-badge">Pending</span>
                <span class="cn-team-pending-countdown" data-expires-at="${escapeHtml(invite.expiresAt || "")}" aria-hidden="true"></span>
              </span>
            </div>
            ${invite.id
              ? `<button class="cn-team-remove" type="button" data-cancel-invite="${escapeHtml(invite.id)}" data-cancel-email="${escapeHtml(invite.email || "")}">Cancel invite</button>`
              : ""}
          </div>
        `;
      }).join("");

      host.querySelectorAll("[data-cancel-invite]").forEach((button) => {
        button.addEventListener("click", () => {
          cancelInvite(button.dataset.cancelInvite, button.dataset.cancelEmail, button);
        });
      });

      syncCountdown();
    }

    function formatExpiry(value) {
      const time = Date.parse(value || "");
      if (!Number.isFinite(time)) return "";
      try {
        return new Date(time).toLocaleString(undefined, {
          weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
        });
      } catch {
        return "";
      }
    }

    function formatRemaining(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const pad = (value) => String(value).padStart(2, "0");

      // Invites sent before the 24-hour limit still run on 7 days.
      if (ms > 48 * 3600 * 1000) return `${days}d ${Math.floor((totalSeconds % 86400) / 3600)}h`;
      if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
      return `${minutes}m ${pad(seconds)}s`;
    }

    function panelOpen() {
      return Boolean(modal?.classList.contains("show"));
    }

    function stopCountdown() {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = null;
      if (expiryRefreshTimer) clearTimeout(expiryRefreshTimer);
      expiryRefreshTimer = null;
    }

    function syncCountdown() {
      const hasCountdowns = Boolean(document.querySelector("#cnTeamPending [data-expires-at]"));
      if (!panelOpen() || !hasCountdowns) {
        stopCountdown();
        return;
      }
      tickCountdown();
      if (!countdownTimer) countdownTimer = setInterval(tickCountdown, 1000);
    }

    function tickCountdown() {
      if (!panelOpen()) {
        stopCountdown();
        return;
      }

      const now = Date.now() + clockSkew;
      let anyExpired = false;

      document.querySelectorAll("#cnTeamPending [data-expires-at]").forEach((node) => {
        const expiresAt = Date.parse(node.dataset.expiresAt || "");
        if (!Number.isFinite(expiresAt)) {
          node.textContent = "";
          return;
        }

        const remaining = expiresAt - now;
        if (remaining <= 0) {
          node.textContent = "Expired";
          node.classList.remove("is-soon");
          node.classList.add("is-expired");
          anyExpired = true;
          return;
        }

        node.textContent = `Expires in ${formatRemaining(remaining)}`;
        node.classList.toggle("is-soon", remaining < 3600 * 1000);
      });

      if (anyExpired) refreshAfterExpiry();
    }

    // Once an invite runs out, ask the server once (it marks it expired and
    // frees the seat). Held back so several invites expiring together, or a
    // clock that is still slightly off, never turn into a request every second.
    function refreshAfterExpiry() {
      if (expiryRefreshTimer || Date.now() - lastExpiryRefresh < 15000) return;
      expiryRefreshTimer = setTimeout(() => {
        expiryRefreshTimer = null;
        lastExpiryRefresh = Date.now();
        if (panelOpen()) loadTeam({ quiet: true, activity: false });
      }, 1500);
    }

    function renderTeam() {
      if (!team) return;

      const isOwner = team.role === "owner";
      const seatCap = Number(team.seatCap) || 5;
      const seatsUsed = Number(team.seatsUsed) || 0;
      const poolLimit = Number(team.dailyPoolLimit) || 0;
      const poolUsed = Number(team.poolUsedToday) || 0;
      const poolLeft = Math.max(0, poolLimit - poolUsed);
      const percent = poolLimit ? Math.min(100, Math.round((poolUsed / poolLimit) * 100)) : 0;

      const tierEl = document.getElementById("cnTeamTier");
      if (tierEl) tierEl.textContent = `${seatCap} seats · Business`;

      const seatsEl = document.getElementById("cnTeamSeats");
      if (seatsEl) seatsEl.textContent = `${seatsUsed} of ${seatCap}`;

      const poolEl = document.getElementById("cnTeamPool");
      if (poolEl) poolEl.textContent = `${poolLeft} of ${poolLimit}`;

      const track = document.getElementById("cnTeamPoolTrack");
      if (track) {
        track.classList.toggle("is-high", percent >= 80);
        const fill = track.querySelector("span");
        if (fill) fill.style.transform = `scaleX(${percent / 100})`;
      }

      const recoveryEl = document.getElementById("cnTeamRecovery");
      if (recoveryEl) recoveryEl.textContent = String(Number(team.recoveryPoolLimit) || 0);

      const introEl = document.getElementById("cnTeamIntro");
      if (introEl) introEl.textContent = isOwner ? INTRO_OWNER : INTRO_MEMBER;

      if (inviteSection) inviteSection.hidden = !isOwner;
      if (activitySection) activitySection.hidden = !isOwner;

      if (inviteBtn) {
        const full = seatsUsed >= seatCap;
        inviteBtn.disabled = full;
        inviteBtn.textContent = full ? "Team is full" : "Send invite";
      }

      const membersNote = document.getElementById("cnTeamMembersNote");
      if (membersNote) {
        membersNote.textContent = seatsUsed >= seatCap
          ? `Team is full (${seatsUsed}/${seatCap} seats, including ${isOwner ? "you" : "the owner"}). Remove a member to free a seat, or email support@cybernetai.app to move up a tier.`
          : `"Used today" is each person's own share of the team pool.`;
      }

      renderMembers();
      renderPending();
    }

    /* ─── Activity log ─── */

    const ANALYSIS_TYPE_LABELS = { text: "Message", link: "Link", image: "Picture or QR code" };
    const TIMELINE_LABELS = [
      ["first10Minutes", "First 10 minutes"],
      ["firstHour", "First hour"],
      ["first24Hours", "First 24 hours"],
      ["next7Days", "Next 7 days"]
    ];
    let activityDetailCache = new Map();

    // The badge repeats what the member saw on their own screen: the site calls
    // anything from 32 up a scam and anything below it not a scam. When the page
    // reported the figures it actually showed, those are used as they are.
    function scanBadge(row) {
      if (row.followUp === true) return { label: "Follow-up question", tone: "is-neutral" };
      if (row.needsDeepScan === true) return { label: "No verdict", tone: "is-neutral" };
      const score = Number(row.shown?.score ?? row.score) || 0;
      const label = row.shown?.label || (score >= 32 ? "SCAM" : "NOT A SCAM");
      return { label: `${label} · ${score}/100`, tone: score >= 32 ? "is-danger" : "is-safe" };
    }

    function detailBlock(title, html) {
      return html ? `<strong>${escapeHtml(title)}</strong>${html}` : "";
    }

    function detailList(title, items) {
      const list = (Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean);
      if (!list.length) return "";
      return detailBlock(title, `<ul class="cn-activity-list">${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    }

    function renderScanDetail(detail) {
      const analysis = detail.analysis || {};
      const isQuick = detail.source === "quick_scan";
      const parts = [];

      // Shown as plain text on purpose: a link in a suspicious message must
      // never become something the owner can click from here.
      let submitted = "";
      if (detail.submittedContent) {
        submitted += `<pre class="cn-activity-submitted">${escapeHtml(detail.submittedContent)}</pre>`;
      }
      if (analysis.hadImage) {
        const file = analysis.fileName ? ` (${escapeHtml(analysis.fileName)})` : "";
        submitted += `<p class="cn-activity-note">A picture was uploaded${file}. Pictures are never stored, only what was read from them.</p>`;
      }
      if (!submitted) {
        submitted = '<p class="cn-activity-note">The original text was not saved for this entry. Entries made from 17 September 2026 onward include it.</p>';
      }
      const submittedTitle = analysis.qr?.data && isQuick ? "What the QR code contained" : "What they submitted";
      parts.push(detailBlock(submittedTitle, submitted));

      const badge = scanBadge({
        score: detail.score,
        shown: analysis.shown,
        followUp: analysis.isFollowUp === true,
        needsDeepScan: analysis.needsDeepScan === true
      });
      const confidence = Number(analysis.confidence) > 0 ? ` · confidence ${Number(analysis.confidence)}%` : "";
      let resultHtml = `<p>${escapeHtml(badge.label)}${escapeHtml(confidence)} · ${escapeHtml(detail.threatType || "Security analysis")}</p>`;
      if (analysis.shown && Number(analysis.shown.score) !== Number(detail.score)) {
        resultHtml += `<p class="cn-activity-note">The AI on its own scored this ${Number(detail.score) || 0}/100. The page blends that with its on-device check, which is why your teammate saw ${Number(analysis.shown.score) || 0}/100.</p>`;
      }
      parts.push(detailBlock("Result shown to them", resultHtml));

      const checkedBy = isQuick
        ? "Quick Scan — the on-device check, no AI involved"
        : analysis.aiUsed === false
          ? "Analysis AI — settled by the built-in rules, the AI was not needed (no usage charged)"
          : `Analysis AI${analysis.engine ? ` (${analysis.engine})` : ""}`;
      parts.push(detailBlock("Checked by", `<p>${escapeHtml(checkedBy)} · ${escapeHtml(ANALYSIS_TYPE_LABELS[detail.analysisType] || detail.analysisType || "—")}</p>`));

      parts.push(detailBlock(isQuick ? "In short" : "Full explanation", `<p>${escapeHtml(detail.summary || "No summary stored.")}</p>`));
      parts.push(detailList("Warning signs found", analysis.evidence));
      parts.push(detailList("Signs it may be fine", analysis.counterEvidence));
      parts.push(detailList("What they were told to do", analysis.actions));
      parts.push(detailList("Limits of this check", analysis.limitations));

      const links = (Array.isArray(analysis.links) ? analysis.links : []).filter((link) => link?.url);
      if (links.length) {
        parts.push(detailBlock("Links found in it", `<ul class="cn-activity-list">${links.map((link) =>
          `<li><span class="cn-activity-url">${escapeHtml(link.url)}</span> — ${Number(link.score) || 0}/100${link.label ? ` · ${escapeHtml(link.label)}` : ""}</li>`
        ).join("")}</ul>`));
      }

      return parts.filter(Boolean).join("");
    }

    function renderRecoveryDetail(detail) {
      const plan = detail.plan || {};
      const parts = [];

      parts.push(detailBlock("What they described", detail.submittedDescription
        ? `<pre class="cn-activity-submitted">${escapeHtml(detail.submittedDescription)}</pre><p class="cn-activity-note">Card numbers, one-time codes and keys are removed before anything is stored.</p>`
        : '<p class="cn-activity-note">The description was not saved for this case. Cases opened from 17 September 2026 onward include it.</p>'));

      const facts = [
        `Incident: ${detail.incidentType || "—"}`,
        `Risk: ${detail.riskLevel || "—"}`,
        `Urgency: ${detail.urgency || "—"}`,
        `Status: ${detail.status || "—"}`,
        `Progress: ${Number(detail.progressPercent) || 0}%`,
        Number(detail.confidence) > 0 ? `Confidence: ${Number(detail.confidence)}%` : "",
        detail.region ? `Region: ${detail.region}` : ""
      ].filter(Boolean);
      parts.push(detailBlock("Case", `<p>${facts.map(escapeHtml).join(" · ")}</p>`));

      if (plan.summary) parts.push(detailBlock("Plan summary", `<p>${escapeHtml(plan.summary)}</p>`));
      parts.push(detailList("What is known", plan.whatWeKnow));

      const actionItems = (list) => (Array.isArray(list) ? list : [])
        .filter((action) => action?.title)
        .map((action) => `<li><b>${escapeHtml(action.title)}</b>${action.instruction ? ` — ${escapeHtml(action.instruction)}` : ""}</li>`)
        .join("");

      const doFirst = actionItems(plan.immediateActions);
      if (doFirst) parts.push(detailBlock("Do first", `<ul class="cn-activity-list">${doFirst}</ul>`));

      TIMELINE_LABELS.forEach(([key, label]) => {
        const items = actionItems(plan.timeline?.[key]);
        if (items) parts.push(detailBlock(label, `<ul class="cn-activity-list">${items}</ul>`));
      });

      parts.push(detailList("Risk that remains", plan.remainingRisk));
      parts.push(detailList("Limits of this plan", plan.limitations));

      // Every task on the case, the same set the progress figure is worked out from.
      const tasks = Array.isArray(detail.tasks) ? detail.tasks : [];
      if (tasks.length) {
        const done = tasks.filter((task) => task.status === "done" || task.status === "completed").length;
        parts.push(detailBlock(`Checklist — ${done} of ${tasks.length} done`, `<ul class="cn-activity-list cn-activity-tasks">${tasks.map((task) => {
          const finished = task.status === "done" || task.status === "completed";
          return `<li class="${finished ? "is-done" : ""}">${finished ? "✓" : "○"} ${escapeHtml(task.title)}</li>`;
        }).join("")}</ul>`));
      }

      const versions = Array.isArray(detail.versions) ? detail.versions : [];
      if (versions.length) {
        parts.push(detailBlock("Plan history", `<ul class="cn-activity-list">${versions.map((version) =>
          `<li>Version ${Number(version.version) || 1} · ${escapeHtml(formatDate(version.createdAt))} — ${escapeHtml(version.changeSummary || "Updated")}</li>`
        ).join("")}</ul>`));
      }

      return parts.filter(Boolean).join("");
    }

    async function openActivityDetail(row, bodyEl) {
      const key = `${row.type}:${row.id}`;
      if (activityDetailCache.has(key)) {
        bodyEl.innerHTML = activityDetailCache.get(key);
        return;
      }

      bodyEl.innerHTML = '<p class="cn-activity-note">Loading the full entry…</p>';

      try {
        const response = await fetch(
          `/api/business-activity?detail=${encodeURIComponent(row.type)}&id=${encodeURIComponent(row.id)}`,
          { headers: authHeaders(), cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.detail) throw new Error(data.error || "Could not load this entry.");

        const html = row.type === "scan" ? renderScanDetail(data.detail) : renderRecoveryDetail(data.detail);
        activityDetailCache.set(key, html);
        bodyEl.innerHTML = html;
      } catch (error) {
        bodyEl.innerHTML = `<p class="cn-activity-note is-error">${escapeHtml(error?.message || "Could not load this entry.")} Tap the entry again to retry.</p>`;
      }
    }

    function renderActivity(feed) {
      const host = document.getElementById("cnTeamActivity");
      if (!host) return;

      activityDetailCache = new Map();

      if (!feed?.length) {
        host.innerHTML = '<div class="cn-team-empty">No team activity yet. Every Quick Scan, Analysis AI check and recovery case your teammates run will appear here. Your own stay private.</div>';
        return;
      }

      host.innerHTML = feed.map((row, index) => {
        const who = row.member?.fullName || row.member?.email || "Team member";
        const isScan = row.type === "scan";
        const isQuick = isScan && row.source === "quick_scan";

        const kindLabel = !isScan ? "Recovery" : isQuick ? "Quick Scan" : "Analysis AI";
        const kindClass = !isScan ? "is-recovery" : isQuick ? "is-quick" : "is-scan";

        const title = isScan
          ? row.threatType || "Security analysis"
          : row.caseTitle || row.incidentType || "Recovery case";

        const badge = isScan
          ? scanBadge(row)
          : {
              label: `${row.riskLevel || "—"} risk`,
              tone: ["critical", "high"].includes(String(row.riskLevel || "").toLowerCase()) ? "is-danger" : "is-safe"
            };

        const what = isScan ? ANALYSIS_TYPE_LABELS[row.analysisType] || "" : `${Number(row.progressPercent) || 0}% done`;

        return `
          <div class="cn-activity-item">
            <button class="cn-activity-summary" type="button" data-activity-toggle="${index}" aria-expanded="false" aria-controls="cnActivityBody${index}">
              <span class="cn-activity-kind ${kindClass}">${kindLabel}</span>
              <span class="cn-activity-main">
                <span class="cn-activity-title">${escapeHtml(title)}</span>
                <span class="cn-activity-meta">${escapeHtml(who)} · ${escapeHtml(formatDate(row.createdAt))}${what ? ` · ${escapeHtml(what)}` : ""}</span>
              </span>
              <span class="cn-activity-verdict ${badge.tone}">${escapeHtml(badge.label)}</span>
            </button>
            <div class="cn-activity-body" id="cnActivityBody${index}" hidden></div>
          </div>
        `;
      }).join("");

      host.querySelectorAll("[data-activity-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.activityToggle);
          const body = document.getElementById(`cnActivityBody${index}`);
          if (!body) return;

          body.hidden = !body.hidden;
          button.setAttribute("aria-expanded", String(!body.hidden));
          if (!body.hidden) openActivityDetail(feed[index], body);
        });
      });
    }

    /* ─── Loading the team ───
       Opening the panel used to wait for a membership check, then repeat the
       same request from the panel, then ask for the activity log: three round
       trips one after another before the panel was complete, and nothing on
       screen for the whole first one. Now the panel opens in the frame of the
       tap, showing the last good answer when there is one (refreshed behind
       it) or the loading state while one request runs. Owners' activity log is
       requested alongside it, and identical requests are shared. */

    const TEAM_FRESH_MS = 30 * 1000;       // reused as it is, no new request
    const TEAM_KEEP_MS = 10 * 60 * 1000;   // shown at once while a refresh runs behind it
    const TEAM_TIMEOUT_MS = 15 * 1000;     // then an error with Try again
    const TEAM_SLOW_MS = 5 * 1000;         // then the loader says it is still working

    let teamCache = null;        // { userId, data, seq, skew, at }
    let activityCache = null;    // { userId, feed, at }
    let teamRequest = null;      // { key, seq, promise }
    let activityRequest = null;  // { key, promise }
    let teamRequestSeq = 0;
    let renderedTeamSeq = 0;
    let renderedTeamSig = "";
    let renderedActivitySig = "";
    let openSeq = 0;
    let slowTimer = null;
    let revealTimer = null;
    let lastAccount = null;      // { userId, profile, isAdmin } from cybernet:account-refreshed

    function currentUserId() {
      return session?.user?.id || "";
    }

    function cacheAge(entry) {
      return entry && entry.userId && entry.userId === currentUserId() ? Date.now() - entry.at : Infinity;
    }

    function forgetTeamData() {
      teamCache = null;
      activityCache = null;
      renderedTeamSig = "";
      renderedActivitySig = "";
      team = null;
    }

    // fetch + JSON with a time limit, so the panel can never wait forever.
    // A server's own error message is kept; a timeout or a lost connection
    // becomes the plain-language message given.
    function fetchJson(url, options, messages) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = setTimeout(() => controller?.abort(), TEAM_TIMEOUT_MS);

      return fetch(url, { ...options, signal: controller?.signal })
        .then(async (response) => {
          const data = await response.json().catch((error) => {
            if (error?.name === "AbortError") throw error;
            return {};
          });
          if (!response.ok) {
            const failure = new Error(data.error || messages.failed);
            failure.fromServer = true;
            throw failure;
          }
          return data;
        })
        .catch((error) => {
          if (error?.fromServer) throw error;
          throw new Error(error?.name === "AbortError" ? messages.timeout : messages.offline);
        })
        .finally(() => clearTimeout(timer));
    }

    // One /api/business-account request per access token at a time; force
    // starts a new one (after a change, an older answer is out of date).
    function requestTeam({ force = false } = {}) {
      const key = session?.access_token || "";
      if (!force && teamRequest && teamRequest.key === key) return teamRequest.promise;

      const seq = ++teamRequestSeq;
      const userId = currentUserId();
      const promise = fetchJson("/api/business-account", {
        headers: authHeaders({ Accept: "application/json" }),
        cache: "no-store"
      }, {
        failed: "Could not load your team.",
        timeout: "Your team is taking longer than usual to load. Check your connection and try again.",
        offline: "Could not reach CyberNet AI. Check your connection and try again."
      })
        .then((data) => {
          const serverTime = Date.parse(data.serverTime || "");
          const result = {
            userId, data, seq,
            skew: Number.isFinite(serverTime) ? serverTime - Date.now() : 0,
            at: Date.now()
          };
          // Answers can arrive out of order: only a newer one replaces the cache.
          if (userId && userId === currentUserId() && seq > (teamCache?.seq || 0)) teamCache = result;
          return result;
        })
        .finally(() => {
          if (teamRequest?.seq === seq) teamRequest = null;
        });

      teamRequest = { key, seq, promise };
      return promise;
    }

    function requestActivity({ force = false } = {}) {
      const key = session?.access_token || "";
      if (!force && activityRequest && activityRequest.key === key) return activityRequest.promise;

      const userId = currentUserId();
      const promise = fetchJson("/api/business-activity?limit=30", {
        headers: authHeaders({ Accept: "application/json" })
      }, {
        failed: "Could not load team activity.",
        timeout: "Team activity is taking longer than usual to load. Close and reopen the panel to try again.",
        offline: "Could not load team activity."
      })
        .then((data) => {
          const feed = data.feed || [];
          if (userId && userId === currentUserId()) activityCache = { userId, feed, at: Date.now() };
          return feed;
        })
        .finally(() => {
          if (activityRequest?.promise === promise) activityRequest = null;
        });

      // Nobody may be waiting for it yet (it starts alongside the team request).
      promise.catch(() => {});
      activityRequest = { key, promise };
      return promise;
    }

    // What the account check (script.js, or the account dialog's own copy)
    // says about the signed-in user, or null while that isn't known yet.
    function accountProfile() {
      const userId = currentUserId();
      if (!userId) return null;

      const app = window.CyberNetAccount?.appState;
      if (app?.accountReady && !app.accountStatusError && app.accountUserId === userId && app.profile) {
        return { ...app.profile, isAdmin: Boolean(app.isAdmin) };
      }
      if (lastAccount?.userId === userId) return { ...lastAccount.profile, isAdmin: lastAccount.isAdmin };
      return null;
    }

    function teamSignature(data) {
      try {
        const { serverTime, ...rest } = data || {};
        return JSON.stringify(rest);
      } catch {
        return "";
      }
    }

    // Draws a team answer unless a newer one is already on screen. An answer
    // identical to what is shown is not redrawn, so a quiet refresh never
    // collapses an open entry or moves keyboard focus.
    function applyTeam(result) {
      if (!result?.data?.onTeam || result.seq < renderedTeamSeq) return false;
      renderedTeamSeq = result.seq;
      clockSkew = result.skew || 0;
      team = result.data;

      const sig = teamSignature(result.data);
      if (sig && sig === renderedTeamSig) syncCountdown();
      else {
        renderedTeamSig = sig;
        renderTeam();
      }
      setLoading(false);
      return true;
    }

    function applyActivity(feed) {
      let sig = "";
      try {
        sig = JSON.stringify(feed || []);
      } catch {
        sig = "";
      }
      if (sig && sig === renderedActivitySig) return;
      renderedActivitySig = sig;
      renderActivity(feed);
    }

    function showActivityPlaceholder() {
      const host = document.getElementById("cnTeamActivity");
      if (!host || host.querySelector(".cn-activity-item")) return;
      renderedActivitySig = "";
      host.innerHTML = '<div class="cn-team-empty cn-team-activity-loading">Loading team activity…</div>';
    }

    function announce(text) {
      const status = document.getElementById("cnTeamStatus");
      if (status) status.textContent = text;
    }

    // The loading state: the CyberNet shield, a calm progress line and the
    // panel's own heading. mode: "loading", "error" or false (the content).
    function setLoading(mode, text = "") {
      const card = modal?.querySelector(".cn-team-card");
      const loader = document.getElementById("cnTeamLoader");
      const title = document.getElementById("cnTeamLoaderTitle");
      const body = document.getElementById("cnTeamLoaderText");
      const retry = document.getElementById("cnTeamRetry");
      const wasLoading = Boolean(card?.classList.contains("is-loading"));

      clearTimeout(slowTimer);
      slowTimer = null;

      if (!mode) {
        if (!wasLoading) return;
        card?.classList.remove("is-loading", "is-error-state");
        if (loader) {
          loader.hidden = true;
          loader.classList.remove("is-error");
        }
        if (retry) retry.hidden = true;
        // The figures settle in once, instead of popping in.
        card?.classList.add("is-revealing");
        clearTimeout(revealTimer);
        revealTimer = setTimeout(() => card?.classList.remove("is-revealing"), 700);
        announce("Your team is ready.");
        return;
      }

      card?.classList.add("is-loading");
      card?.classList.toggle("is-error-state", mode === "error");
      card?.classList.remove("is-revealing", "is-refreshing");
      if (loader) {
        loader.hidden = false;
        loader.classList.toggle("is-error", mode === "error");
      }

      if (mode === "error") {
        if (title) title.textContent = "We couldn't load your team";
        if (body) body.textContent = text || "Could not load your team.";
        if (retry) retry.hidden = false;
        announce(`We couldn't load your team. ${text || ""}`.trim());
        return;
      }

      if (title) title.textContent = "Loading your team";
      if (body) body.textContent = "Seats, invites and today's usage are on their way.";
      if (retry) retry.hidden = true;
      announce("Loading your team…");
      slowTimer = setTimeout(() => {
        if (body && card?.classList.contains("is-loading") && !card.classList.contains("is-error-state")) {
          body.textContent = "Still working on it. The first load of the day can take a few seconds.";
        }
      }, TEAM_SLOW_MS);
    }

    // A thin progress line along the top of the panel while figures that are
    // already on screen are being refreshed.
    function setRefreshing(on) {
      modal?.querySelector(".cn-team-card")?.classList.toggle("is-refreshing", Boolean(on));
    }

    // Used after an invite, a cancellation, a removal and an expired invite:
    // always a new request, drawn into the open panel.
    async function loadTeam({ quiet = false, activity = true } = {}) {
      if (!(await readySession())) {
        openExistingAuth();
        return null;
      }

      if (!quiet) setMessage("Loading your team…");

      try {
        const result = await requestTeam({ force: true });

        if (!result.data.onTeam) {
          team = null;
          setLoading(false);
          setMessage("This account isn't on a Business team.", "warning");
          return null;
        }

        applyTeam(result);
        if (!quiet) setMessage("");

        if (team?.role === "owner" && activity) loadActivity();

        return result.data;
      } catch (error) {
        setMessage(error?.message || "Could not load your team.", "error");
        return null;
      }
    }

    async function loadActivity() {
      try {
        applyActivity(await requestActivity({ force: true }));
      } catch (error) {
        applyActivity([]);
        setMessage(error?.message || "Could not load team activity.", "error");
      }
    }

    async function sendInvite() {
      const email = String(inviteEmail?.value || "").trim();

      if (!email || !email.includes("@")) {
        setMessage("Enter the teammate's email address first.", "warning");
        return;
      }

      if (inviteBtn) {
        inviteBtn.disabled = true;
        inviteBtn.textContent = "Sending…";
      }
      setMessage("Sending the invite…");

      try {
        const response = await fetch("/api/business-invite", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ email })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(data.error || "Could not send the invite.");

        if (inviteEmail) inviteEmail.value = "";
        setMessage(`Invite sent to ${email}. It expires in 24 hours, and you can cancel it below any time before they accept.`, "success");
        await loadTeam({ quiet: true, activity: false });
      } catch (error) {
        setMessage(error?.message || "Could not send the invite.", "error");
      } finally {
        if (inviteBtn) {
          inviteBtn.disabled = false;
          inviteBtn.textContent = "Send invite";
        }
      }
    }

    async function removeMember(userId, label, button) {
      if (!userId) return;

      const confirmed = window.confirm(
        `Remove ${label || "this teammate"} from your Business team?\n\n` +
        "They'll immediately lose Business access and go back to their own plan. " +
        "Their past activity stays in your team activity log."
      );
      if (!confirmed) return;

      if (button) {
        button.disabled = true;
        button.textContent = "Removing…";
      }

      try {
        const response = await fetch("/api/business-member-remove", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ userId })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(data.error || "Could not remove the teammate.");

        setMessage(`${label || "That teammate"} was removed from the team.`, "success");
        await loadTeam({ quiet: true });
      } catch (error) {
        setMessage(error?.message || "Could not remove the teammate.", "error");
        if (button) {
          button.disabled = false;
          button.textContent = "Remove";
        }
      }
    }

    async function cancelInvite(inviteId, email, button) {
      if (!inviteId) return;

      const who = email || "this person";
      const confirmed = window.confirm(`Cancel the invite to ${who}? The link in their email will stop working.`);
      if (!confirmed) return;

      if (button) {
        button.disabled = true;
        button.textContent = "Cancelling…";
      }

      try {
        const response = await fetch("/api/business-invite-cancel", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ inviteId })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const failure = new Error(data.error || "Could not cancel the invite.");
          failure.status = response.status;
          throw failure;
        }

        setMessage(`Invite to ${who} cancelled. That seat is free again.`, "success");
        await loadTeam({ quiet: true, activity: false });
      } catch (error) {
        setMessage(error?.message || "Could not cancel the invite.", "error");
        // Gone or already accepted: the list is out of date, so redraw it.
        if (error?.status === 404 || error?.status === 409) {
          await loadTeam({ quiet: true, activity: false });
        } else if (button) {
          button.disabled = false;
          button.textContent = "Cancel invite";
        }
      }
    }

    let lastOpenFromNav = false;

    // Opens the panel in the frame of the tap: with the last good answer when
    // there is one, otherwise with the loading state. fromNav: the navigation
    // entry, where someone who turns out not to be on a team is taken to the
    // Business plan (as before) instead of an empty panel.
    function openTeam(options) {
      const fromNav = Boolean(options?.fromNav);
      const seq = ++openSeq;
      lastOpenFromNav = fromNav;

      modal?.classList.add("show");
      modal?.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      setMessage("");

      const kept = cacheAge(teamCache) < TEAM_KEEP_MS && teamCache.data?.onTeam ? teamCache : null;
      if (kept) {
        applyTeam(kept);
        if (kept.data.role === "owner" && cacheAge(activityCache) < TEAM_KEEP_MS) applyActivity(activityCache.feed);
      } else {
        const role = accountProfile()?.teamRole || "";
        modal?.querySelector(".cn-team-card")?.classList.toggle("is-member-hint", role === "member");
        const introEl = document.getElementById("cnTeamIntro");
        if (introEl && role) introEl.textContent = role === "owner" ? INTRO_OWNER : INTRO_MEMBER;
        setLoading("loading");
      }

      loadPanel(seq, { fromNav, kept: Boolean(kept) });
    }

    async function loadPanel(seq, { fromNav = false, kept = false } = {}) {
      const stillOpen = () => seq === openSeq && panelOpen();

      let current = null;
      try {
        current = await readySession();
      } catch {
        current = null;
      }
      if (!stillOpen()) return;
      if (!current) {
        closeTeam();
        openExistingAuth();
        return;
      }

      const fresh = cacheAge(teamCache) < TEAM_FRESH_MS ? teamCache : null;
      const role = ((kept || fresh) && teamCache?.data?.role) || accountProfile()?.teamRole || "";
      const activityFresh = cacheAge(activityCache) < TEAM_FRESH_MS;
      // An owner's activity log is asked for alongside the team, not after it.
      const earlyActivity = role === "owner" && !activityFresh ? requestActivity() : null;

      if (kept && !fresh) setRefreshing(true);

      let result;
      try {
        result = fresh || await requestTeam();
      } catch (error) {
        if (!stillOpen()) return;
        setRefreshing(false);
        // Figures already on screen stay; otherwise the error takes the loader's place.
        if (kept) setMessage(error?.message || "Could not load your team.", "error");
        else setLoading("error", error?.message || "Could not load your team.");
        return;
      }
      if (!stillOpen()) return;
      setRefreshing(false);

      if (!result.data?.onTeam) {
        team = null;
        if (fromNav) {
          closeTeam();
          showBusinessPlan();
        } else {
          setLoading(false);
          announce("");
          setMessage("This account isn't on a Business team.", "warning");
        }
        return;
      }

      applyTeam(result);
      if (result.data.role !== "owner") return;

      if (activityFresh && !earlyActivity) {
        applyActivity(activityCache.feed);
        return;
      }

      const feedRequest = earlyActivity || requestActivity();
      showActivityPlaceholder();
      try {
        const feed = await feedRequest;
        if (stillOpen()) applyActivity(feed);
      } catch (error) {
        if (!stillOpen()) return;
        applyActivity([]);
        setMessage(error?.message || "Could not load team activity.", "error");
      }
    }

    function retryTeam() {
      const seq = ++openSeq;
      setLoading("loading");
      // The Try again button is hidden now: keep keyboard focus in the panel.
      try {
        document.getElementById("cnTeamLoader")?.focus({ preventScroll: true });
      } catch {
        // Older browsers: focus stays where the browser puts it.
      }
      loadPanel(seq, { fromNav: lastOpenFromNav });
    }

    function closeTeam() {
      openSeq += 1; // anything still loading for this opening is dropped
      modal?.classList.remove("show");
      modal?.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      stopCountdown();
      setRefreshing(false);
      clearTimeout(slowTimer);
      slowTimer = null;
    }

    // Not on a team: the Business plan, with a note saying why.
    function showBusinessPlan() {
      document.querySelector('.nav-tabs .nav-link[data-page="pricing"]')?.click();
      const notice = document.getElementById("pricingNotice");
      if (notice) {
        notice.textContent = "Manage Business comes with the Business plan. Upgrade below to create your team.";
        notice.className = "pricing-notice glass show";
      }
      setTimeout(() => {
        document.querySelector(".business-price-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 350);
    }

    // Asks for the team before the tap lands, when the account check says this
    // person is on one (or is an admin, whose check doesn't say): on hover or
    // focus of Manage Business, when the phone menu or the account dialog
    // opens, and once when the page is idle. Visitors who aren't on a team
    // never cause a request this way.
    function prefetchTeam({ activity = false } = {}) {
      if (!session || panelOpen()) return;
      const profile = accountProfile();
      if (!profile || !(profile.isTeamMember || profile.isAdmin)) return;

      readySession()
        .then((current) => {
          if (!current || panelOpen()) return;
          if (cacheAge(teamCache) >= TEAM_FRESH_MS) requestTeam().catch(() => {});
          if (activity && profile.teamRole === "owner" && cacheAge(activityCache) >= TEAM_FRESH_MS) requestActivity();
        })
        .catch(() => {});
    }

    let idlePrefetchedFor = "";
    function prefetchWhenIdle() {
      const userId = currentUserId();
      const profile = accountProfile();
      if (!userId || idlePrefetchedFor === userId || !profile || !(profile.isTeamMember || profile.isAdmin)) return;

      const connection = navigator.connection;
      if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ""))) return;

      idlePrefetchedFor = userId;
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => prefetchTeam(), { timeout: 4000 });
      } else {
        setTimeout(() => prefetchTeam(), 2500);
      }
    }

    /* ─── Accept invite ─── */

    function onInvitePage() {
      return window.location.pathname.replace(/\/+$/, "") === "/accept-invite";
    }

    function inviteToken() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token") || "";
      return onInvitePage() && token ? token : "";
    }

    // Signing up (email confirmation) or signing in with Google can land the
    // visitor on the home page when the invite URL isn't on Supabase's
    // redirect allow-list. The token is kept here so they're sent back.
    function rememberInvite(token) {
      if (!INVITE_TOKEN_PATTERN.test(token)) return;
      try {
        localStorage.setItem(PENDING_INVITE, JSON.stringify({ token, savedAt: Date.now() }));
      } catch {
        // Storage blocked: the redirect URL is the only way back.
      }
    }

    function forgetInvite() {
      try {
        localStorage.removeItem(PENDING_INVITE);
      } catch {
        // Ignore storage failures.
      }
    }

    function storedInvite() {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(PENDING_INVITE) || "null");
      } catch {
        saved = null;
      }
      if (!saved) {
        forgetInvite();
        return "";
      }

      const token = String(saved.token || "");
      const age = Date.now() - Number(saved.savedAt);
      if (!INVITE_TOKEN_PATTERN.test(token) || !(age >= 0 && age < PENDING_INVITE_MAX_AGE)) {
        forgetInvite();
        return "";
      }
      return token;
    }

    // Signed in somewhere other than the invite page with an invite still
    // waiting: go back to it. The entry is removed before leaving so this can
    // only ever happen once per saved invite.
    function resumeStoredInvite() {
      if (!session || onInvitePage()) return;

      const token = storedInvite();
      if (!token) return;

      forgetInvite();
      window.location.replace(`/accept-invite?token=${encodeURIComponent(token)}`);
    }

    function openInviteModal() {
      inviteModal?.classList.add("show");
      inviteModal?.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function closeInviteModal() {
      inviteModal?.classList.remove("show");
      inviteModal?.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    async function refreshInviteGate() {
      const token = inviteToken();
      if (!token) return;

      await getSession();

      const body = document.getElementById("cnInviteBody");

      if (!session) {
        // Only needed while signed out: it carries the invite through sign-up
        // or Google. Once signed in here, the visitor is already back.
        rememberInvite(token);
        if (inviteAcceptBtn) inviteAcceptBtn.textContent = "Sign in to accept";
        if (body) {
          body.textContent =
            "Sign in or create a free account with the email this invite was sent to. You'll come straight back here to accept.";
        }
        setInviteMessage("You need to be signed in before you can join a team.", "warning");
      } else {
        forgetInvite();
        if (inviteAcceptBtn) inviteAcceptBtn.textContent = "Accept and join the team";
        if (body) {
          body.textContent =
            "Joining gives you Business-tier access to Quick Scan, Analysis AI, and Recovery Mode while you're on the team.";
        }
        setInviteMessage(`Signed in as ${session.user?.email || "your account"}.`);
      }
    }

    async function acceptInvite() {
      const token = inviteToken();
      if (!token) return;

      await getSession();

      if (!session) {
        setInviteMessage("Sign in first, then press Accept again.", "warning");
        openExistingAuth();
        return;
      }

      if (inviteAcceptBtn) {
        inviteAcceptBtn.disabled = true;
        inviteAcceptBtn.textContent = "Joining…";
      }
      setInviteMessage("Joining the team…");

      try {
        const response = await fetch("/api/business-invite-accept", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ token })
        });
        const data = await response.json().catch(() => ({}));

        // Invalid, cancelled, expired, used or meant for another email: none of
        // these will work later either, so stop sending the visitor back here.
        if ([403, 404, 410].includes(response.status)) forgetInvite();
        if (!response.ok) throw new Error(data.error || "Could not accept this invite.");

        forgetInvite();
        setInviteMessage("You're on the team. Business features are unlocked on this account.", "success");
        if (inviteAcceptBtn) inviteAcceptBtn.textContent = "Joined";

        setTimeout(() => {
          window.location.assign("/");
        }, 2200);
      } catch (error) {
        setInviteMessage(error?.message || "Could not accept this invite.", "error");
        if (inviteAcceptBtn) {
          inviteAcceptBtn.disabled = false;
          inviteAcceptBtn.textContent = "Accept and join the team";
        }
      }
    }

    /* ─── Wiring ─── */

    // The "Manage Business" entry in the main navigation. Team members get the
    // panel; everyone else is pointed at the Business plan rather than shown an
    // empty panel, and visitors who aren't signed in get the sign-in modal.
    // Every branch answers in the frame of the tap: nothing here waits for the
    // network before something appears.
    function openTeamFromNav() {
      document.querySelector(".navbar")?.classList.remove("open");

      if (sessionKnown && !session) {
        openExistingAuth();
        return;
      }

      // Known not to be on a team (a recent answer, or the account check of a
      // non-admin): the Business plan at once. Membership is still confirmed
      // behind it, as before, and the panel opens if the answer differs.
      if (session) {
        const recent = cacheAge(teamCache) < TEAM_KEEP_MS ? teamCache.data : null;
        const profile = accountProfile();
        const notOnTeam = recent
          ? !recent.onTeam
          : Boolean(profile && !profile.isAdmin && profile.isTeamMember === false);
        if (notOnTeam) {
          showBusinessPlan();
          confirmNoTeam();
          return;
        }
      }

      openTeam({ fromNav: true });
    }

    function confirmNoTeam() {
      if (cacheAge(teamCache) < TEAM_FRESH_MS) return;
      const askedAt = Date.now();
      readySession()
        .then((current) => (current ? requestTeam() : null))
        .then((result) => {
          if (!result?.data?.onTeam || Date.now() - askedAt > 20000) return;
          if (document.querySelector(".modal.show, .cn-legal-modal.show")) return;
          openTeam({ fromNav: true });
        })
        .catch(() => {});
    }

    function watchIntent(button) {
      const intent = () => prefetchTeam({ activity: true });
      button.addEventListener("pointerenter", intent, { passive: true });
      button.addEventListener("pointerdown", intent, { passive: true });
      button.addEventListener("focus", intent);
    }

    const navManageBtn = document.getElementById("navManageBusinessBtn");
    if (navManageBtn && !navManageBtn.dataset.wired) {
      navManageBtn.dataset.wired = "1";
      navManageBtn.addEventListener("click", openTeamFromNav);
      watchIntent(navManageBtn);
    }

    // The phone menu and the account dialog both lead to Manage Business.
    document.getElementById("mobileMenu")?.addEventListener("click", () => {
      setTimeout(() => {
        if (document.querySelector(".navbar.open")) prefetchTeam();
      }, 0);
    });
    document.getElementById("accountNavBtn")?.addEventListener("click", () => prefetchTeam());

    document.getElementById("cnTeamRetry")?.addEventListener("click", retryTeam);

    function syncManageButton(account) {
      if (!injectManageButton()) return;

      const button = document.getElementById("accountManageBusinessBtn");
      if (!button) return;

      const profile = account?.profile || {};
      const onTeam = Boolean(profile.isTeamMember);

      button.hidden = !onTeam;
      button.textContent = profile.teamRole === "owner" ? "Manage Business" : "My Business Team";

      if (!button.dataset.wired) {
        button.dataset.wired = "1";
        button.addEventListener("click", () => {
          document.getElementById("accountDetailsModal")?.classList.remove("show");
          openTeam();
        });
        watchIntent(button);
      }

      // Right after a Business checkout, take the owner straight into the
      // panel so the first thing they see is where to add their team.
      if (onTeam && profile.teamRole === "owner" && !autoOpened) {
        let pending = "";
        try {
          pending = sessionStorage.getItem(PENDING_BUSINESS_CHECKOUT) || "";
        } catch {
          pending = "";
        }

        if (pending) {
          autoOpened = true;
          try {
            sessionStorage.removeItem(PENDING_BUSINESS_CHECKOUT);
          } catch {
            // Ignore storage failures.
          }
          setTimeout(openTeam, 1200);
        }
      }
    }

    window.addEventListener("cybernet:account-refreshed", (event) => {
      const account = event.detail || {};
      if (account.profile && currentUserId()) {
        lastAccount = { userId: currentUserId(), profile: account.profile, isAdmin: Boolean(account.isAdmin) };
      }
      syncManageButton(account);
      prefetchWhenIdle();
      // Opened before the account check answered: an owner's activity log
      // starts now instead of after the team request.
      if (panelOpen() && account.profile?.teamRole === "owner" && cacheAge(activityCache) >= TEAM_FRESH_MS) {
        readySession().then((current) => { if (current && panelOpen()) requestActivity(); }).catch(() => {});
      }
    });

    closeBtn?.addEventListener("click", closeTeam);
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) closeTeam();
    });

    inviteBtn?.addEventListener("click", sendInvite);
    inviteEmail?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendInvite();
      }
    });

    inviteCloseBtn?.addEventListener("click", closeInviteModal);
    inviteDeclineBtn?.addEventListener("click", () => {
      forgetInvite();
      closeInviteModal();
      window.location.assign("/");
    });
    inviteAcceptBtn?.addEventListener("click", acceptInvite);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (modal?.classList.contains("show")) closeTeam();
      if (inviteModal?.classList.contains("show")) closeInviteModal();
    });

    if (client) {
      client.auth.onAuthStateChange((_event, nextSession) => {
        const previous = setSession(nextSession);
        // Signed out, or another account signed in: the open panel showed the
        // previous person's team.
        if (previous && previous !== currentUserId() && panelOpen()) closeTeam();
        if (inviteToken()) refreshInviteGate();
        else resumeStoredInvite();
      });
    }

    if (inviteToken()) {
      openInviteModal();
      refreshInviteGate();
    } else {
      getSession().then(resumeStoredInvite).catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
