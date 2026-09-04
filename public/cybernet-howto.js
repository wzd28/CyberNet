/*
  CyberNet AI — feature walkthroughs.

  Replaces the three how-to GIFs (7.5MB combined, 256-colour, low frame rate)
  with a stepped walkthrough that explains what each part of the interface
  means. The panels are rendered from the site's own design tokens rather than
  captured as images, so they stay sharp at any size, weigh nothing, are
  readable by screen readers and search engines, and cannot drift out of date
  when the interface is restyled.

  Self-contained by design: it renders into the existing modal's player element
  and exposes a single entry point. Nothing else on the page depends on it.
*/
(() => {
  "use strict";

  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  /* ── Reusable fragments that mirror real product surfaces ───────────── */

  const verdict = (kind, headline, tag, score) => `
    <div class="hw-verdict hw-verdict-${kind}">
      <span class="hw-verdict-icon">${kind === "safe" ? "✓" : kind === "info" ? "↗" : "✕"}</span>
      <span class="hw-verdict-text">${esc(headline)}</span>
    </div>
    ${tag ? `<div class="hw-verdict-meta">
      <span class="hw-tag">${esc(tag)}</span>
      ${score !== undefined ? `<span class="hw-score">${score}<span>/100</span></span>` : ""}
    </div>` : ""}`;

  const list = (title, icon, items, variant = "") => `
    <div class="hw-list ${variant}">
      <div class="hw-list-title"><span>${icon}</span>${esc(title)}</div>
      <ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
    </div>`;

  const field = (label, value, mono) => `
    <div class="hw-field">
      <span class="hw-field-label">${esc(label)}</span>
      <div class="hw-field-box${mono ? " hw-mono" : ""}">${esc(value)}</div>
    </div>`;

  const tabs = (items, activeIndex) => `
    <div class="hw-tabs">${items
      .map((t, i) => `<span class="hw-tab${i === activeIndex ? " is-active" : ""}">${esc(t)}</span>`)
      .join("")}</div>`;

  /* ── Walkthrough content ────────────────────────────────────────────── */

  const WALKTHROUGHS = {
    protect: {
      title: "How To Use Quick Scan",
      summary:
        "Quick Scan runs entirely on CyberNet's own rules. It is instant, it does not use your daily AI analyses, and it never sends your text to an AI model.",
      steps: [
        {
          heading: "Pick what you are checking",
          body:
            "Three separate engines. Choose the one that matches what you have in front of you — the wrong tab will still work, but the right one looks for more.",
          visual: `${tabs(["Text Detection", "Link Detection", "Image Detection"], 0)}
            <div class="hw-note-grid">
              <div><b>Text</b>A message, email or DM</div>
              <div><b>Link</b>A URL on its own</div>
              <div><b>Image</b>A screenshot or QR code</div>
            </div>`,
          callout: {
            kind: "info",
            title: "Image is the narrow one",
            body:
              "Quick Scan reads QR codes and file details in a picture, but it cannot read words or logos inside a screenshot. For those, it will tell you to use Analysis AI instead.",
          },
        },
        {
          heading: "Paste it in",
          body:
            "Paste the whole thing, including any links. More context means a more confident answer — a lone sentence gives the engine very little to work with.",
          visual: field(
            "Paste your text here...",
            "URGENT: Your account has been suspended. Verify within 24 hours at secure-verify-account.tk or lose access.",
            false
          ),
          callout: {
            kind: "warn",
            title: "Never paste secrets",
            body:
              "Do not include passwords, one-time codes, card numbers or recovery phrases — not here and not anywhere else in CyberNet.",
          },
        },
        {
          heading: "Read the verdict",
          body:
            "You always get a straight answer. There is no 'not sure' — the headline is the conclusion, and everything under it is the evidence for it.",
          visual: verdict("danger", "SCAM", "Credential phishing", 80),
          callout: {
            kind: "info",
            title: "What the two numbers mean",
            body:
              "The headline is the answer. The score is how much evidence stacked up behind it — 80/100 means many independent signals agreed, not that it is '80% likely' to be a scam.",
          },
        },
        {
          heading: "Then act on it",
          body:
            "Every scan ends with the reasoning and a specific list of what to do. That second column is the part worth reading twice.",
          visual: `${list("Why We Think This Is A Scam", "⚠", [
            "Uses urgency or a deadline to reduce careful thinking.",
            "Mentions account verification or a security alert.",
            "Most suspicious destination: secure-verify-account.tk",
          ])}
          ${list("What You Should Do", "→", [
            "Do not click the link.",
            "Check the account directly through the official app.",
            "Never share passwords or one-time codes.",
          ], "hw-list-safe")}`,
          callout: {
            kind: "ok",
            title: "Free plan gets 5 of these a day",
            body: "Quick Scans are separate from AI analyses. Pro removes the limit entirely.",
          },
        },
      ],
    },

    cybernetai: {
      title: "How To Use Analysis AI",
      summary:
        "Analysis AI reads the thing you send it and explains its reasoning. It handles what Quick Scan cannot — screenshots with text, unusual wording, and questions that need judgement.",
      steps: [
        {
          heading: "Send anything suspicious",
          body:
            "One box for everything. Paste a message, drop a link, or attach a screenshot — it works out what it is looking at and runs the right analysis.",
          visual: field(
            "Paste a message, link, or describe what happened...",
            "I got an SMS saying a payment of £849 to Apple is pending, cancel at hsbc-secure-cancel.info — is this real?",
            false
          ),
          callout: {
            kind: "info",
            title: "Screenshots are its strength",
            body:
              "It reads the text and logos inside an image. A fake bank screenshot that Quick Scan cannot interpret is exactly what this is for.",
          },
        },
        {
          heading: "It explains, not just labels",
          body:
            "You get the same decisive verdict, plus the reasoning in plain language — what it saw, what it could not verify, and why it landed where it did.",
          visual: `${verdict("danger", "SCAM", "Phishing / smishing", 62)}
            <p class="hw-quote">The web address is not the bank's real domain, and the message pushes a 24-hour deadline to stop you checking. Genuine bank alerts never send you to a different domain to cancel a payment.</p>`,
          callout: {
            kind: "info",
            title: "It says when it cannot be sure",
            body:
              "Where evidence is thin it tells you what is missing rather than inventing confidence. It will not claim to have visited a link it never opened.",
          },
        },
        {
          heading: "Watch your daily allowance",
          body:
            "AI analyses are metered because each one costs real processing. The counter sits above the box so you always know where you stand.",
          visual: `<div class="hw-meter-row">
              <div class="hw-meter"><span class="hw-meter-label">Free</span><div class="hw-meter-track"><span style="width:33%"></span></div><b>1 / 3 today</b></div>
              <div class="hw-meter"><span class="hw-meter-label">Pro</span><div class="hw-meter-track"><span style="width:13%"></span></div><b>2 / 15 today</b></div>
            </div>`,
          callout: {
            kind: "ok",
            title: "Resets at midnight UTC",
            body: "Business teams share one larger pool across everyone on the account.",
          },
        },
      ],
    },

    recovery: {
      title: "How To Use Recovery Mode",
      summary:
        "Recovery Mode is for after something has gone wrong. It turns a panicked situation into an ordered list of what to do, in the order that limits the damage.",
      steps: [
        {
          heading: "Say what happened",
          body:
            "Plain language is fine. Pick the closest incident type — that choice directly affects how urgently the plan treats your situation.",
          visual: `${field("Incident type", "Social media compromised", true)}
            ${field(
              "What happened?",
              "Someone changed my Instagram password and email. My followers are getting crypto investment DMs from my account.",
              false
            )}`,
          callout: {
            kind: "warn",
            title: "Never include credentials",
            body:
              "No passwords, one-time codes, recovery codes or card numbers. CyberNet tries to strip secrets automatically, but that is a safety net, not a guarantee.",
          },
        },
        {
          heading: "Get a plan ordered by urgency",
          body:
            "Not a wall of advice. The plan is grouped by when each action matters, because in an account takeover the order genuinely changes the outcome.",
          visual: `<div class="hw-timeline">
              <div class="hw-tl-row"><span class="hw-tl-when">Right now</span><span class="hw-tl-what">Secure the email account behind the compromised one</span></div>
              <div class="hw-tl-row"><span class="hw-tl-when">10 minutes</span><span class="hw-tl-what">Sign out every other session, turn on two-factor</span></div>
              <div class="hw-tl-row"><span class="hw-tl-when">1 hour</span><span class="hw-tl-what">Warn contacts who received messages from you</span></div>
              <div class="hw-tl-row"><span class="hw-tl-when">7 days</span><span class="hw-tl-what">Watch for follow-up recovery scams targeting you</span></div>
            </div>`,
          callout: {
            kind: "info",
            title: "Risk level is a floor, not a guess",
            body:
              "Telling it your account was compromised sets a minimum severity. It can raise that based on what you describe, but it will never quietly downgrade it.",
          },
        },
        {
          heading: "Work the checklist, then update it",
          body:
            "Tick items off as you go. Tell it what you have done and it revises the remaining plan around your actual progress.",
          visual: `<div class="hw-tasks">
              <div class="hw-task is-done"><span class="hw-check">✓</span>Changed the email password</div>
              <div class="hw-task is-done"><span class="hw-check">✓</span>Signed out all sessions</div>
              <div class="hw-task"><span class="hw-check"></span>Enabled two-factor authentication</div>
              <div class="hw-task"><span class="hw-check"></span>Reported the account as compromised</div>
            </div>
            ${field("Tell CyberNet what you have done", "I changed my password and enabled 2FA, but I still cannot sign in.", false)}`,
          callout: {
            kind: "ok",
            title: "Your case is saved",
            body:
              "Come back to it later from the Recovery page. Reporting links for your country are included and are never invented.",
          },
        },
      ],
    },
  };

  /* ── Renderer ───────────────────────────────────────────────────────── */

  const CALLOUT_LABEL = { info: "Good to know", warn: "Important", ok: "Worth knowing" };

  function render(container, key, onRendered) {
    const data = WALKTHROUGHS[key] || WALKTHROUGHS.protect;
    let index = 0;

    function paint() {
      const step = data.steps[index];
      const last = data.steps.length - 1;
      container.innerHTML = `
        <div class="hw" role="group" aria-label="${esc(data.title)}">
          <p class="hw-summary">${esc(data.summary)}</p>
          <div class="hw-step" aria-live="polite">
            <div class="hw-side">
              <span class="hw-step-count">Step ${index + 1} of ${data.steps.length}</span>
              <h4 class="hw-heading">${esc(step.heading)}</h4>
              <p class="hw-body">${esc(step.body)}</p>
              <div class="hw-callout hw-callout-${step.callout.kind}">
                <span class="hw-callout-label">${CALLOUT_LABEL[step.callout.kind] || "Note"}</span>
                <b>${esc(step.callout.title)}</b>
                <p>${esc(step.callout.body)}</p>
              </div>
            </div>
            <div class="hw-visual">${step.visual}</div>
          </div>
          <div class="hw-nav">
            <button type="button" class="hw-btn" data-hw="prev"${index === 0 ? " disabled" : ""}>Back</button>
            <div class="hw-dots" role="tablist">
              ${data.steps
                .map(
                  (s, i) =>
                    `<button type="button" class="hw-dot${i === index ? " is-active" : ""}" data-hw-go="${i}" role="tab" aria-selected="${i === index}" aria-label="Step ${i + 1}: ${esc(s.heading)}"></button>`
                )
                .join("")}
            </div>
            <button type="button" class="hw-btn hw-btn-primary" data-hw="next"${index === last ? " disabled" : ""}>Next</button>
          </div>
        </div>`;

      container.querySelector('[data-hw="prev"]').onclick = () => {
        if (index > 0) { index--; paint(); }
      };
      container.querySelector('[data-hw="next"]').onclick = () => {
        if (index < last) { index++; paint(); }
      };
      container.querySelectorAll("[data-hw-go]").forEach((dot) => {
        dot.onclick = () => { index = Number(dot.dataset.hwGo); paint(); };
      });
      if (typeof onRendered === "function") onRendered(data.title);
    }

    paint();

    // Arrow-key navigation, scoped to the modal so it cannot capture keys
    // anywhere else on the page.
    return function handleKey(event) {
      if (event.key === "ArrowRight" && index < data.steps.length - 1) { index++; paint(); }
      else if (event.key === "ArrowLeft" && index > 0) { index--; paint(); }
    };
  }

  window.CyberNetHowto = {
    render,
    titleFor: (key) => (WALKTHROUGHS[key] || WALKTHROUGHS.protect).title,
    has: (key) => Boolean(WALKTHROUGHS[key]),
  };
})();
