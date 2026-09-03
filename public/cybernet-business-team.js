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

  function start() {
    if (document.documentElement.dataset.cybernetBusinessTeam === "ready") return;
    document.documentElement.dataset.cybernetBusinessTeam = "ready";

    ensureStylesheet();
    createTeamModal();
    createAcceptInviteModal();
    injectManageButton();
    initializeController();
  }

  function ensureStylesheet() {
    if (document.getElementById("cybernetBusinessTeamStylesheet")) return;

    const link = document.createElement("link");
    link.id = "cybernetBusinessTeamStylesheet";
    link.rel = "stylesheet";
    link.href = "cybernet-business-team.css";
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

        <div class="cn-team-stats">
          <div class="cn-team-stat">
            <span>Seats used</span>
            <strong id="cnTeamSeats">—</strong>
            <small id="cnTeamSeatsNote">Members plus any invites you've sent that haven't been accepted yet.</small>
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
            <p>Every analysis and recovery case your team has run, newest first. Tap any entry to open the full stored result.</p>
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
            <li>The team owner can see the full results of every scan, analysis, and recovery case you run on this team.</li>
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

    const client = supabaseReady
      ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        })
      : null;

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
    let team = null;
    let autoOpened = false;

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

    async function getSession() {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      session = data?.session || null;
      return session;
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
      host.innerHTML = pending.map((invite) => `
        <div class="cn-team-pending-item">
          <span>Invite sent</span>
          ${escapeHtml(invite.email)}
        </div>
      `).join("");
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
        if (fill) fill.style.width = `${percent}%`;
      }

      const recoveryEl = document.getElementById("cnTeamRecovery");
      if (recoveryEl) recoveryEl.textContent = String(Number(team.recoveryPoolLimit) || 0);

      const introEl = document.getElementById("cnTeamIntro");
      if (introEl) {
        introEl.textContent = isOwner
          ? "Add teammates, see exactly who used what today, and review every analysis your team has run."
          : "You're a member of this team. Your Business access and daily limits come from the team's shared pool.";
      }

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
          ? `Team is full (${seatsUsed}/${seatCap} seats). Remove a member to free a seat, or email cybernetai.26@gmail.com to move up a tier.`
          : `"Used today" is each person's own share of the team pool.`;
      }

      renderMembers();
      renderPending();
    }

    function renderActivity(feed) {
      const host = document.getElementById("cnTeamActivity");
      if (!host) return;

      if (!feed?.length) {
        host.innerHTML = '<div class="cn-team-empty">No team activity yet. Scans and recovery cases your team runs will appear here.</div>';
        return;
      }

      host.innerHTML = feed.map((row, index) => {
        const who = row.member?.fullName || row.member?.email || "Team member";
        const isScan = row.type === "scan";
        const dangerous = isScan
          ? !["low_risk", "safe"].includes(String(row.verdict || "").toLowerCase())
          : ["critical", "high"].includes(String(row.riskLevel || "").toLowerCase());

        const title = isScan
          ? row.threatType || "Security analysis"
          : row.caseTitle || row.incidentType || "Recovery case";

        const verdictLabel = isScan
          ? `${row.verdict || "—"} · ${Number(row.score) || 0}/100`
          : `${row.riskLevel || "—"} risk`;

        const body = isScan
          ? `<strong>Result summary</strong>${escapeHtml(row.summary || "No summary stored.")}
             <strong>Analysis type</strong>${escapeHtml(row.analysisType || "—")}`
          : `<strong>Incident type</strong>${escapeHtml(row.incidentType || "—")}
             <strong>Urgency</strong>${escapeHtml(row.urgency || "—")}
             <strong>Status</strong>${escapeHtml(row.status || "—")}`;

        return `
          <div class="cn-activity-item">
            <button class="cn-activity-summary" type="button" data-activity-toggle="${index}">
              <span class="cn-activity-kind ${isScan ? "is-scan" : "is-recovery"}">${isScan ? "Scan" : "Recovery"}</span>
              <span class="cn-activity-main">
                <span class="cn-activity-title">${escapeHtml(title)}</span>
                <span class="cn-activity-meta">${escapeHtml(who)} · ${escapeHtml(formatDate(row.createdAt))}</span>
              </span>
              <span class="cn-activity-verdict ${dangerous ? "is-danger" : "is-safe"}">${escapeHtml(verdictLabel)}</span>
            </button>
            <div class="cn-activity-body" id="cnActivityBody${index}" hidden>${body}</div>
          </div>
        `;
      }).join("");

      host.querySelectorAll("[data-activity-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
          const body = document.getElementById(`cnActivityBody${button.dataset.activityToggle}`);
          if (body) body.hidden = !body.hidden;
        });
      });
    }

    async function loadTeam({ quiet = false } = {}) {
      if (!(await getSession())) {
        openExistingAuth();
        return null;
      }

      if (!quiet) setMessage("Loading your team…");

      try {
        const response = await fetch("/api/business-account", {
          headers: authHeaders({ Accept: "application/json" })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(data.error || "Could not load your team.");

        if (!data.onTeam) {
          team = null;
          setMessage("This account isn't on a Business team.", "warning");
          return null;
        }

        team = data;
        renderTeam();
        if (!quiet) setMessage("");

        if (team.role === "owner") loadActivity();

        return data;
      } catch (error) {
        setMessage(error?.message || "Could not load your team.", "error");
        return null;
      }
    }

    async function loadActivity() {
      try {
        const response = await fetch("/api/business-activity?limit=30", {
          headers: authHeaders({ Accept: "application/json" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load team activity.");
        renderActivity(data.feed || []);
      } catch (error) {
        renderActivity([]);
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
        setMessage(`Invite sent to ${email}. They'll get an email with a link to join.`, "success");
        await loadTeam({ quiet: true });
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

    function openTeam() {
      modal?.classList.add("show");
      modal?.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      loadTeam();
    }

    function closeTeam() {
      modal?.classList.remove("show");
      modal?.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    /* ─── Accept invite ─── */

    function inviteToken() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token") || "";
      const onInvitePath = window.location.pathname.replace(/\/+$/, "") === "/accept-invite";
      return onInvitePath && token ? token : "";
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
        if (inviteAcceptBtn) inviteAcceptBtn.textContent = "Sign in to accept";
        if (body) {
          body.textContent =
            "Sign in to your CyberNet AI account to accept this invite. If you don't have one yet, create a free account with the email the invite was sent to — then come back to this page.";
        }
        setInviteMessage("You need to be signed in before you can join a team.", "warning");
      } else {
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

        if (!response.ok) throw new Error(data.error || "Could not accept this invite.");

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
      syncManageButton(event.detail);
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
        session = nextSession || null;
        if (inviteToken()) refreshInviteGate();
      });
    }

    if (inviteToken()) {
      openInviteModal();
      refreshInviteGate();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
