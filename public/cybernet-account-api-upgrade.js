(() => {
  "use strict";

  const KEY_STORAGE = "cybernet_validated_openai_key";
  const MODEL_STORAGE = "cybernet_validated_openai_model";
  const KEY_SUFFIX_STORAGE = "cybernet_openai_key_suffix";
  const ORIGINAL_FETCH = window.fetch.bind(window);

  function getSessionKey() {
    try {
      return sessionStorage.getItem(KEY_STORAGE) || "";
    } catch {
      return "";
    }
  }

  function getSessionModel() {
    try {
      return sessionStorage.getItem(MODEL_STORAGE) || "gpt-5-mini";
    } catch {
      return "gpt-5-mini";
    }
  }

  function clearSessionKey() {
    try {
      sessionStorage.removeItem(KEY_STORAGE);
      sessionStorage.removeItem(MODEL_STORAGE);
      sessionStorage.removeItem(KEY_SUFFIX_STORAGE);
    } catch {
      // Ignore browser storage failures.
    }
  }

  /*
    Optional BYOK routing:
    - Normal CyberNet analysis continues to use /api/analyze.
    - When a validated visitor key exists, Text, Link, and Image requests
      use /api/byok-analyze instead.
  */
  window.fetch = async function cyberNetFetch(input, init = {}) {
    try {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      const url = new URL(rawUrl, window.location.origin);
      const requestMethod = String(
        init.method || (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const visitorKey = getSessionKey();

      if (
        visitorKey &&
        url.origin === window.location.origin &&
        url.pathname === "/api/analyze" &&
        requestMethod === "POST"
      ) {
        const headers = new Headers(
          input instanceof Request ? input.headers : undefined
        );

        new Headers(init.headers || {}).forEach((value, name) => {
          headers.set(name, value);
        });

        headers.set("X-CyberNet-OpenAI-Key", visitorKey);
        headers.set("X-CyberNet-OpenAI-Model", getSessionModel());

        return ORIGINAL_FETCH("/api/byok-analyze", {
          ...init,
          headers
        });
      }
    } catch {
      // Keep the original request if routing checks fail.
    }

    return ORIGINAL_FETCH(input, init);
  };

  function start() {
    if (document.documentElement.dataset.cybernetAccountUpgrade === "ready") {
      return;
    }

    document.documentElement.dataset.cybernetAccountUpgrade = "ready";

    ensureUpgradeStylesheet();
    createAccountNavigation();
    createAccountModal();
    moveBillingOutOfCyberNetAI();
    createApiKeyPanel();
    createHowToGetKeyModal();
    initializeController();
    fixPopularBadge();
  }

  function ensureUpgradeStylesheet() {
    if (document.getElementById("cybernetAccountUpgradeStylesheet")) return;

    const link = document.createElement("link");
    link.id = "cybernetAccountUpgradeStylesheet";
    link.rel = "stylesheet";
    link.href = "cybernet-account-api-upgrade.css";
    document.head.appendChild(link);
  }

  function createAccountNavigation() {
    if (document.getElementById("accountNavBtn")) return;

    const pricingButton = document.querySelector(
      '.nav-tabs .nav-link[data-page="pricing"]'
    );
    const nav = pricingButton?.parentElement || document.querySelector(".nav-tabs");

    if (!nav) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "accountNavBtn";
    button.className = "nav-link account-nav-link";
    button.textContent = "Account";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "accountDetailsModal");

    if (pricingButton) {
      pricingButton.insertAdjacentElement("afterend", button);
    } else {
      nav.appendChild(button);
    }
  }

  function createAccountModal() {
    if (document.getElementById("accountDetailsModal")) return;

    const modal = document.createElement("div");
    modal.id = "accountDetailsModal";
    modal.className = "modal";
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="modal-card glass reveal cybernet-account-card"
           role="dialog"
           aria-modal="true"
           aria-labelledby="cybernetAccountTitle">
        <button class="close-modal"
                id="closeAccountDetails"
                type="button"
                aria-label="Close">&times;</button>

        <div class="cybernet-account-head">
          <div class="cn-account-title-row">
            <svg class="cn-account-title-icon" viewBox="0 0 24 26" fill="none" aria-label="CyberNet AI" width="40" height="40"><path d="M12 2 L21 6 L20 15 L12 24 L4 15 L3 6 Z" stroke="#22D3EE" stroke-width="1.8" stroke-linejoin="round"/><rect x="8.3" y="12.5" width="7.4" height="6.2" rx="1.2" fill="#22D3EE"/><path d="M9.6 12.5v-2.3a2.4 2.4 0 0 1 4.8 0v2.3" stroke="#22D3EE" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="15.2" r="1" fill="#08152a"/><path d="M12 15.9v1.4" stroke="#08152a" stroke-width="1" stroke-linecap="round"/></svg>
            <div>
              <span class="account-eyebrow">YOUR CYBERNET ACCOUNT</span>
              <h2 id="cybernetAccountTitle">Account</h2>
              <p>Your identity, subscription, daily usage, and billing controls in one secure place.</p>
            </div>
          </div>
          <span class="cybernet-account-live-badge">Secure session</span>
        </div>

        <div class="cybernet-account-grid">
          <div class="cybernet-account-item">
            <span>Name</span>
            <strong id="accountDetailName">—</strong>
          </div>

          <div class="cybernet-account-item">
            <span>Email</span>
            <strong id="accountDetailEmail">—</strong>
          </div>

          <div class="cybernet-account-item">
            <span>Current plan</span>
            <strong class="cybernet-account-plan">
              <b id="accountDetailPlan">—</b>
              <i class="cybernet-account-plan-badge" id="accountDetailPlanBadge">—</i>
            </strong>
          </div>

        </div>

        <div class="cybernet-account-actions">
          <button type="button"
                  class="primary-btn"
                  id="accountUpgradeBtn">View Pro Plans</button>

          <button type="button"
                  class="primary-btn"
                  id="accountManageBillingBtn"
                  hidden>Manage Billing</button>

          <button type="button"
                  class="secondary-btn"
                  id="accountRefreshBtn">Refresh Account</button>

          <button type="button"
                  class="secondary-btn"
                  id="accountSignOutBtn">Sign Out</button>
        </div>

        <div id="accountDetailsMessage"
             class="cybernet-account-message"
             aria-live="polite"></div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function moveBillingOutOfCyberNetAI() {
    document.getElementById("manageBillingBtn")?.remove();
  }

  function createApiKeyPanel() {
    if (document.getElementById("cybernetByokPanel")) return;

    const aiConfig = document.querySelector("#cybernetai .ai-config");
    if (!aiConfig) return;

    const panel = document.createElement("section");
    panel.id = "cybernetByokPanel";
    panel.className = "cybernet-byok-panel";
    panel.setAttribute("aria-labelledby", "cybernetByokTitle");

    panel.innerHTML = `
      <div class="cybernet-byok-title-row">
        <h5 id="cybernetByokTitle">Use your OpenAI API key</h5>
        <span class="cybernet-byok-status-pill" id="cybernetByokPill">Not connected</span>
      </div>

      <p>
        Optional BYOK mode for CyberNet AI Text, Link, and Image analysis.
        The key is validated by a secure Netlify Function before it is accepted.
      </p>

      <div class="cybernet-byok-field">
        <input id="cybernetVisitorApiKey"
               type="password"
               inputmode="text"
               autocomplete="off"
               spellcheck="false"
               placeholder="sk-proj-..." />
        <button type="button"
                class="cybernet-byok-show"
                id="cybernetByokShow">Show</button>
      </div>

      <div class="cybernet-byok-actions">
        <button type="button"
                class="primary-btn"
                id="cybernetValidateApiKey">Validate &amp; Connect</button>
        <button type="button"
                class="secondary-btn"
                id="cybernetHowToGetKey">How to get a personal API key</button>
        <button type="button"
                class="secondary-btn"
                id="cybernetForgetApiKey">Forget Key</button>
      </div>

      <div id="cybernetByokMessage"
           class="cybernet-byok-message"
           aria-live="polite"></div>

      <small class="cybernet-byok-privacy">
        Stored only in this browser tab using session storage. CyberNet does not
        save the key to Supabase or your account. Close the tab or press Forget
        Key to remove it.
      </small>
    `;

    const refreshButton = document.getElementById("testApiKeyBtn");
    const upgradeButton = document.getElementById("aiUpgradeBtn");

    if (refreshButton) {
      refreshButton.insertAdjacentElement("beforebegin", panel);
    } else if (upgradeButton) {
      upgradeButton.insertAdjacentElement("beforebegin", panel);
    } else {
      aiConfig.appendChild(panel);
    }
  }

  function createHowToGetKeyModal() {
    if (document.getElementById("cybernetHowToGetKeyModal")) return;

    const modal = document.createElement("div");
    modal.id = "cybernetHowToGetKeyModal";
    modal.className = "modal";

    modal.innerHTML = `
      <div class="modal-card glass reveal cybernet-account-card cybernet-howto-modal"
           role="dialog"
           aria-modal="true"
           aria-labelledby="cybernetHowToGetKeyTitle">
        <button class="close-modal"
                id="closeHowToGetKeyModal"
                type="button"
                aria-label="Close">&times;</button>

        <div class="cybernet-account-head">
          <div>
            <span class="account-eyebrow">CONNECT YOUR OWN AI</span>
            <h2 id="cybernetHowToGetKeyTitle">How to get a personal API key</h2>
            <p>CyberNet AI's BYOK field currently validates OpenAI-format keys only. Steps for the most common providers are below in case you'd like to generate one, or see what it takes with other providers.</p>
          </div>
        </div>

        <div class="cybernet-howto-provider">
          <h4>OpenAI (ChatGPT)</h4>
          <ol>
            <li>Go to <strong>platform.openai.com</strong> and sign in with your ChatGPT account.</li>
            <li>Open <strong>Dashboard → API keys</strong> from the left-hand menu.</li>
            <li>Click <strong>Create new secret key</strong>, give it a name (e.g. "CyberNet AI"), and confirm.</li>
            <li>Copy the key immediately — it's only shown once. Paste it into the field above.</li>
            <li>Add a spending limit under <strong>Settings → Billing → Limits</strong> so usage stays controlled.</li>
          </ol>
        </div>

        <div class="cybernet-howto-provider">
          <h4>Anthropic (Claude)</h4>
          <ol>
            <li>Go to <strong>console.anthropic.com</strong> and sign in.</li>
            <li>Open <strong>Settings → API Keys</strong>.</li>
            <li>Click <strong>Create Key</strong>, name it, and copy the value shown.</li>
            <li>A Claude key will not validate in CyberNet AI's field above — support for it hasn't been built yet.</li>
          </ol>
        </div>

        <div class="cybernet-howto-provider">
          <h4>Google (Gemini)</h4>
          <ol>
            <li>Go to <strong>aistudio.google.com/app/apikey</strong> and sign in with a Google account.</li>
            <li>Click <strong>Create API key</strong>, then choose or create a Google Cloud project.</li>
            <li>Copy the generated key.</li>
            <li>A Gemini key will not validate in CyberNet AI's field above — support for it hasn't been built yet.</li>
          </ol>
        </div>

        <p class="cybernet-howto-note">Never share your API key with anyone else. Use a restricted key with a spending limit, and press "Forget Key" when you're finished on a shared or public device.</p>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById("closeHowToGetKeyModal");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.classList.remove("show");
      });
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("show");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("show")) {
        modal.classList.remove("show");
      }
    });

    const openBtn = document.getElementById("cybernetHowToGetKey");
    if (openBtn) {
      openBtn.addEventListener("click", () => {
        modal.classList.add("show");
      });
    }
  }

  function fixPopularBadge() {
    const ribbon = document.querySelector("#pricing .popular-ribbon");
    const card = ribbon?.closest(".price-card");

    if (card) {
      card.style.overflow = "visible";
      card.style.position = "relative";
    }

    ribbon?.setAttribute("aria-label", "Most Popular Plan");
  }

  function initializeController() {
    const config = window.CYBERNET_CONFIG || {};
    const supabaseReady =
      Boolean(window.supabase?.createClient) &&
      /^https:\/\//.test(String(config.SUPABASE_URL || "")) &&
      String(config.SUPABASE_ANON_KEY || "").length > 20;

    const client = supabaseReady
      ? window.supabase.createClient(
          config.SUPABASE_URL,
          config.SUPABASE_ANON_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          }
        )
      : null;

    const modal = document.getElementById("accountDetailsModal");
    const accountButton = document.getElementById("accountNavBtn");
    const closeButton = document.getElementById("closeAccountDetails");
    const refreshButton = document.getElementById("accountRefreshBtn");
    const signOutButton = document.getElementById("accountSignOutBtn");
    const upgradeButton = document.getElementById("accountUpgradeBtn");
    const manageButton = document.getElementById("accountManageBillingBtn");
    const message = document.getElementById("accountDetailsMessage");

    const keyInput = document.getElementById("cybernetVisitorApiKey");
    const keyShow = document.getElementById("cybernetByokShow");
    const keyValidate = document.getElementById("cybernetValidateApiKey");
    const keyForget = document.getElementById("cybernetForgetApiKey");
    const keyMessage = document.getElementById("cybernetByokMessage");
    const keyPill = document.getElementById("cybernetByokPill");

    let currentSession = null;
    let currentAccount = null;

    function setMessage(text = "", tone = "") {
      if (!message) return;
      message.textContent = text;
      message.className = `cybernet-account-message ${tone}`.trim();
    }

    function setKeyMessage(text = "", tone = "") {
      if (!keyMessage) return;
      keyMessage.textContent = text;
      keyMessage.className = `cybernet-byok-message ${tone}`.trim();
    }

    function setKeyConnected(connected, suffix = "", model = "") {
      if (keyPill) {
        keyPill.textContent = connected
          ? `Connected${suffix ? ` • ${suffix}` : ""}`
          : "Not connected";
        keyPill.className =
          `cybernet-byok-status-pill ${connected ? "connected" : ""}`.trim();
      }

      if (keyInput) {
        keyInput.value = "";
        keyInput.placeholder = connected
          ? `Connected key ending ${suffix || "••••"}`
          : "sk-proj-...";
      }

      if (connected) {
        setKeyMessage(
          `Verified${model ? ` with ${model}` : ""}. Quick CyberNet AI scans will use this key in the current tab.`,
          "success"
        );
      }
    }

    async function getSession() {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      currentSession = data?.session || null;
      return currentSession;
    }

    function authHeaders(extra = {}) {
      return currentSession?.access_token
        ? {
            ...extra,
            Authorization: `Bearer ${currentSession.access_token}`
          }
        : { ...extra };
    }

    function friendlyStatus(value) {
      const status = String(value || "inactive")
        .replaceAll("_", " ")
        .trim();

      return status
        ? status.charAt(0).toUpperCase() + status.slice(1)
        : "Inactive";
    }

    function planDetails(account) {
      const profile = account?.profile || {};
      const plan = String(profile.plan || "").toLowerCase();
      const interval = String(profile.billingInterval || "").toLowerCase();

      // Trust the server's plan value directly. account-status.mjs already
      // verifies subscription status (via effectivePlan) and the admin
      // allowlist before deciding what "plan" to return, so re-deriving
      // "active" status here was redundant and, worse, blocked the Business
      // badge from ever showing for genuine Business subscribers or for the
      // server-side admin override, since neither necessarily carries a
      // real "active" Stripe subscription_status row.
      if (plan === "business") {
        return {
          pro: true,
          label: "CyberNet AI Business",
          badge: "BUSINESS"
        };
      }

      if (plan !== "pro") {
        return {
          pro: false,
          label: "CyberNet AI Free",
          badge: "FREE"
        };
      }

      if (interval === "year" || interval === "yearly") {
        return {
          pro: true,
          label: "CyberNet AI Pro Yearly",
          badge: "PRO YEARLY"
        };
      }

      if (interval === "month" || interval === "monthly") {
        return {
          pro: true,
          label: "CyberNet AI Pro Monthly",
          badge: "PRO MONTHLY"
        };
      }

      return {
        pro: true,
        label: "CyberNet AI Pro",
        badge: "PRO"
      };
    }

    function renderAccount(session, account) {
      const profile = account?.profile || {};
      const usage = account?.usage || {};
      const details = planDetails(account);

      const name =
        profile.fullName ||
        session?.user?.user_metadata?.full_name ||
        [
          session?.user?.user_metadata?.first_name,
          session?.user?.user_metadata?.last_name
        ].filter(Boolean).join(" ") ||
        session?.user?.email?.split("@")[0] ||
        "CyberNet User";

      const email = session?.user?.email || "—";
      const used = Math.max(0, Number(usage.used) || 0);
      const limit = Math.max(1, Number(usage.limit) || (details.pro ? 50 : 5));
      const remaining = Math.max(
        0,
        Number.isFinite(Number(usage.remaining))
          ? Number(usage.remaining)
          : limit - used
      );
      const percent = Math.min(100, Math.round((used / limit) * 100));

      const nameEl = document.getElementById("accountDetailName");
      const emailEl = document.getElementById("accountDetailEmail");
      const planEl = document.getElementById("accountDetailPlan");
      const badgeEl = document.getElementById("accountDetailPlanBadge");
      const statusEl = document.getElementById("accountDetailStatus");
      const usageEl = document.getElementById("accountDetailUsage");
      const usageBar = document.getElementById("accountDetailUsageBar");

      if (nameEl) nameEl.textContent = name;
      if (emailEl) emailEl.textContent = email;
      if (planEl) planEl.textContent = details.label;
      if (badgeEl) badgeEl.textContent = details.badge;
      if (statusEl) {
        statusEl.textContent = details.pro
          ? friendlyStatus(profile.subscriptionStatus)
          : "Free account";
      }
      if (usageEl) {
        usageEl.textContent =
          `${used} of ${limit} used today • ${remaining} remaining`;
      }
      if (usageBar) usageBar.style.width = `${percent}%`;

      if (manageButton) manageButton.hidden = !details.pro;
      if (upgradeButton) {
        upgradeButton.hidden = details.pro;
        upgradeButton.textContent = "View Pro Plans";
      }

      if (accountButton) {
        accountButton.title =
          `${details.label} • ${remaining} analyses remaining`;
      }
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

    async function refreshAccount({ quiet = false } = {}) {
      if (!client) {
        setMessage(
          "Supabase account configuration is unavailable. Confirm config.js is loaded.",
          "error"
        );
        return null;
      }

      const session = await getSession();

      if (!session) {
        currentAccount = null;
        if (!quiet) {
          closeAccount();
          openExistingAuth();
        }
        return null;
      }

      if (!quiet) setMessage("Refreshing your secure account…");

      try {
        const response = await ORIGINAL_FETCH(
          "/api/account-status?includeHistory=1",
          {
            headers: authHeaders({ Accept: "application/json" })
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Could not load your account.");
        }

        currentAccount = data;
        renderAccount(session, data);

        if (!quiet) {
          setMessage("Account information is up to date.", "success");
        }

        window.dispatchEvent(
          new CustomEvent("cybernet:account-refreshed", {
            detail: data
          })
        );

        return data;
      } catch (error) {
        setMessage(
          error?.message || "Could not load your account.",
          "error"
        );
        return null;
      }
    }

    async function openAccount() {
      const session = await getSession();

      if (!session) {
        openExistingAuth();
        return;
      }

      modal?.classList.add("show");
      modal?.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";

      await refreshAccount();
    }

    function closeAccount() {
      modal?.classList.remove("show");
      modal?.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    async function openBillingPortal() {
      const session = await getSession();

      if (!session) {
        closeAccount();
        openExistingAuth();
        return;
      }

      setMessage("Opening Stripe's secure billing portal…");

      try {
        const response = await ORIGINAL_FETCH("/api/customer-portal", {
          method: "POST",
          headers: authHeaders({
            "Content-Type": "application/json"
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.url) {
          throw new Error(data.error || "Billing portal is unavailable.");
        }

        window.location.assign(data.url);
      } catch (error) {
        setMessage(
          error?.message || "Billing portal is unavailable.",
          "error"
        );
      }
    }

    function openPricing() {
      closeAccount();

      const pricingButton = document.querySelector(
        '.nav-link[data-page="pricing"]'
      );

      if (pricingButton) {
        pricingButton.click();
      } else {
        document.getElementById("pricing")?.scrollIntoView({
          behavior: "smooth"
        });
      }
    }

    async function signOut() {
      if (!client) return;

      setMessage("Signing out…");

      try {
        clearSessionKey();
        await client.auth.signOut();
        closeAccount();
        window.location.reload();
      } catch (error) {
        setMessage(error?.message || "Sign out failed.", "error");
      }
    }

    async function validateApiKey() {
      if (!client) {
        setKeyMessage(
          "Account service is unavailable. Confirm Supabase is configured.",
          "error"
        );
        return;
      }

      const session = await getSession();

      if (!session) {
        setKeyMessage(
          "Sign in before connecting an OpenAI API key.",
          "warning"
        );
        openExistingAuth();
        return;
      }

      const apiKey = String(keyInput?.value || "").trim();

      if (!apiKey) {
        setKeyMessage("Paste your OpenAI API key first.", "warning");
        return;
      }

      if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
        setKeyMessage(
          "This does not look like an OpenAI API key. OpenAI project keys normally begin with sk-proj-.",
          "warning"
        );
        return;
      }

      if (keyValidate) {
        keyValidate.disabled = true;
        keyValidate.textContent = "Validating…";
      }

      setKeyMessage("Securely checking the key with OpenAI…", "warning");

      try {
        const response = await ORIGINAL_FETCH("/api/validate-openai-key", {
          method: "POST",
          headers: authHeaders({
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({ apiKey })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.valid) {
          throw new Error(
            data.error ||
            "OpenAI rejected the key or the key lacks API permission."
          );
        }

        try {
          sessionStorage.setItem(KEY_STORAGE, apiKey);
          sessionStorage.setItem(
            MODEL_STORAGE,
            data.model || "gpt-5-mini"
          );
          sessionStorage.setItem(
            KEY_SUFFIX_STORAGE,
            data.keySuffix || apiKey.slice(-4)
          );
        } catch {
          throw new Error(
            "The key is valid, but this browser blocked session storage."
          );
        }

        setKeyConnected(
          true,
          data.keySuffix || apiKey.slice(-4),
          data.model || ""
        );
      } catch (error) {
        clearSessionKey();
        setKeyConnected(false);
        setKeyMessage(
          error?.message || "The key could not be validated.",
          "error"
        );
      } finally {
        if (keyValidate) {
          keyValidate.disabled = false;
          keyValidate.textContent = "Validate & Connect";
        }
      }
    }

    function forgetApiKey() {
      clearSessionKey();
      setKeyConnected(false);
      setKeyMessage(
        "The temporary API key was removed from this browser tab.",
        "success"
      );
    }

    accountButton?.addEventListener("click", openAccount);
    closeButton?.addEventListener("click", closeAccount);
    refreshButton?.addEventListener("click", () => refreshAccount());
    signOutButton?.addEventListener("click", signOut);
    upgradeButton?.addEventListener("click", openPricing);
    manageButton?.addEventListener("click", openBillingPortal);

    modal?.addEventListener("click", event => {
      if (event.target === modal) closeAccount();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && modal?.classList.contains("show")) {
        closeAccount();
      }
    });

    keyShow?.addEventListener("click", () => {
      if (!keyInput) return;
      const hidden = keyInput.type === "password";
      keyInput.type = hidden ? "text" : "password";
      keyShow.textContent = hidden ? "Hide" : "Show";
    });

    keyValidate?.addEventListener("click", validateApiKey);
    keyForget?.addEventListener("click", forgetApiKey);

    keyInput?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        validateApiKey();
      }
    });

    const storedKey = getSessionKey();

    if (storedKey) {
      let suffix = storedKey.slice(-4);

      try {
        suffix = sessionStorage.getItem(KEY_SUFFIX_STORAGE) || suffix;
      } catch {
        // Keep the calculated suffix.
      }

      setKeyConnected(true, suffix, getSessionModel());
    }

    if (client) {
      client.auth.onAuthStateChange((event, session) => {
        currentSession = session || null;

        if (event === "SIGNED_OUT") {
          clearSessionKey();
          closeAccount();
          setKeyConnected(false);
        }

        if (session) {
          setTimeout(() => refreshAccount({ quiet: true }), 250);
        }
      });

      getSession().then(session => {
        if (session) refreshAccount({ quiet: true });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
