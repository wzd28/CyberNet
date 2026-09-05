(() => {
  "use strict";

  const LEGAL_VERSION = "2026-09-04";
  const EFFECTIVE_DATE = "4 September 2026";
  const SUPPORT_EMAIL = "cybernetai.26@gmail.com";
  const DOCS = {
    terms: { label: "Terms of Service", url: "terms.html" },
    privacy: { label: "Privacy Policy", url: "privacy.html" },
    refunds: { label: "Refunds & Cancellation", url: "refunds.html" },
    acceptable: { label: "Acceptable Use", url: "acceptable-use.html" }
  };

  const LEGAL_CONTENT = Object.freeze({"terms":"<section class=\"cn-legal-hero\">\n<span class=\"cn-legal-eyebrow\">Legal Center · Version 2026-09-04</span>\n<h1>Terms of Service</h1>\n<p>Formal terms governing CyberNet accounts, automated analysis, connected API keys, reports, subscriptions, payments, privacy controls, liability, and lawful use.</p>\n<div class=\"cn-legal-meta\"><span>Effective: 4 September 2026</span><span>Contact: cybernetai.26@gmail.com</span><span>Service: cybernetai.app</span></div>\n</section>\n<div class=\"cn-legal-layout\">\n<aside class=\"cn-legal-toc\"><strong>On this page</strong><a href=\"#agreement\">1. Agreement and legal operator</a>\n<a href=\"#eligibility\">2. Eligibility, age, and authority</a>\n<a href=\"#accounts\">3. Accounts and security</a>\n<a href=\"#services\">4. Description of the Services</a>\n<a href=\"#analysis\">5. Automated analysis and AI limitations</a>\n<a href=\"#no-guarantee\">6. No guarantee against hacking, scams, or loss</a>\n<a href=\"#submitted-content\">7. Submitted content and user permissions</a>\n<a href=\"#byok\">8. User-provided API keys</a>\n<a href=\"#acceptable-use\">9. Defensive and lawful use only</a>\n<a href=\"#plans\">10. Free and Pro plans</a>\n<a href=\"#subscriptions\">11. Subscription pricing and automatic renewal</a>\n<a href=\"#payments\">12. Payments, taxes, and failed charges</a>\n<a href=\"#cancellation\">13. Cancellation</a>\n<a href=\"#refunds\">14. Refunds and billing disputes</a>\n<a href=\"#history\">15. Saved reports, history, and deletion</a>\n<a href=\"#privacy\">16. Privacy and data protection</a>\n<a href=\"#third-parties\">17. Third-party providers and external services</a>\n<a href=\"#availability\">18. Availability, maintenance, and changes</a>\n<a href=\"#support\">19. Support and user communications</a>\n<a href=\"#ip\">20. Intellectual property</a>\n<a href=\"#termination\">21. Suspension and termination</a>\n<a href=\"#warranties\">22. Disclaimer of warranties</a>\n<a href=\"#liability\">23. Limitation of liability</a>\n<a href=\"#indemnity\">24. Indemnity</a>\n<a href=\"#law\">25. Governing law and disputes</a>\n<a href=\"#general\">26. General terms</a>\n<a href=\"#changes\">27. Changes to these Terms</a>\n<a href=\"#contact\">28. Contact</a></aside>\n<div class=\"cn-legal-content\"><section class=\"cn-legal-section\" id=\"agreement\">\n<h2>1. Agreement and legal operator</h2>\n<p>These Terms of Service (the “Terms”) govern access to and use of the CyberNet AI website, accounts, cybersecurity tools, reports, subscriptions, and related services (collectively, the “Services”). “CyberNet”, “we”, “us”, and “our” refer to the person or legal entity that operates the CyberNet AI brand.</p>\n<p>By accessing the Services, creating an account, submitting content, connecting an API key, or purchasing a subscription, you confirm that you have read and agree to these Terms, the <a href=\"privacy.html\">Privacy Policy</a>, the <a href=\"refunds.html\">Refund and Cancellation Policy</a>, and the <a href=\"acceptable-use.html\">Acceptable Use Policy</a>.</p>\n<div class=\"cn-legal-callout\"><strong>Legal operator:</strong> CyberNet AI is operated by <strong>Marks Events FZ LLE</strong>, registration number 20116/2025. Legal notices, billing questions and formal contact: <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a>.</div>\n<p>CyberNet records the version and time of legal acceptance associated with authenticated accounts. Acceptance records may be retained to demonstrate the contract, payment authorisation, legal compliance, or resolution of disputes.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"eligibility\">\n<h2>2. Eligibility, age, and authority</h2>\n<p>You must be at least 13 years old to create an account. If you are below the age of legal majority where you live, a parent or legal guardian must review and accept these Terms for you. Paid subscriptions may only be purchased by a person with legal capacity or with permission from the payment-method holder.</p>\n<p>If you use CyberNet for a school, employer, company, client, or other organisation, you confirm that you are authorised to accept these Terms and submit the relevant information on its behalf.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"accounts\">\n<h2>3. Accounts and security</h2>\n<p>You must provide accurate information, maintain a secure password, protect your devices and email account, and promptly report suspected unauthorised access. You are responsible for activity performed through your account except where applicable law provides otherwise.</p>\n<p>CyberNet may require email verification, security checks, re-authentication, or additional information before allowing sensitive account, billing, export, or deletion actions. You must not share accounts, bypass usage limits, or allow another person to use your account unlawfully.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"services\">\n<h2>4. Description of the Services</h2>\n<p>Depending on availability and plan, CyberNet may provide:</p>\n<ul>\n<li><strong>Quick Scan:</strong> rule-based and AI-assisted analysis of suspicious text, messages, links, images, screenshots, QR codes, email headers, and multi-artifact investigations.</li>\n<li><strong>Analysis AI:</strong> account-based text, link, and image analysis, explanations, risk scoring, recommended defensive actions, and optional use of a user-provided OpenAI API key.</li>\n<li><strong>Recovery Mode:</strong> guided, case-based incident-response support for account takeovers, phishing, scams, and related cybersecurity incidents, including a recovery plan, task checklist, and case updates.</li>\n<li><strong>Account and Pro features:</strong> usage limits, saved reports, downloadable reports, billing controls, history, support, and legal or privacy controls.</li>\n<li><strong>Learning content:</strong> general cybersecurity education and practical defensive guidance.</li>\n</ul>\n<div class=\"cn-legal-callout\"><strong>Concept preview:</strong> Images and demonstrations labelled “Concept Preview”, “Coming Soon”, “In Development”, or similar are illustrative only. They do not promise a release date, exact interface, provider, capability, or final feature set.</div>\n</section>\n<section class=\"cn-legal-section\" id=\"analysis\">\n<h2>5. Automated analysis and AI limitations</h2>\n<div class=\"cn-legal-callout danger\"><strong>CyberNet does not guarantee safety or accuracy.</strong> A low-risk, safe-looking, or similar result does not prove that a sender, message, website, file, QR code, transaction, account, or device is legitimate or free from threats.</div>\n<p>CyberNet relies on automated rules, artificial intelligence, third-party infrastructure, available reputation information, and the content supplied by the user. Results may be inaccurate, incomplete, delayed, outdated, inconsistent, misleading, or affected by missing context. False positives, false negatives, incorrect classifications, unsupported inferences, and service errors may occur.</p>\n<p>CyberNet is decision-support software, not antivirus software, endpoint protection, identity-theft insurance, a bank, a law firm, a managed security service, law enforcement, or an emergency-response service. It does not continuously monitor every device, account, inbox, network, or transaction.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"no-guarantee\">\n<h2>6. No guarantee against hacking, scams, or loss</h2>\n<p>CyberNet cannot guarantee that you will avoid phishing, fraud, hacking, malware, identity theft, account takeover, data loss, financial loss, reputational harm, or other cyber incidents. Threat actors may conceal evidence, change tactics, exploit unknown vulnerabilities, or use content that automated systems cannot reliably evaluate.</p>\n<p>You remain responsible for strong unique passwords, multi-factor authentication, software updates, backups, access controls, device protection, independent verification, and prompt incident response. Do not rely solely on CyberNet when money, credentials, legal rights, sensitive data, or account access may be at risk.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"submitted-content\">\n<h2>7. Submitted content and user permissions</h2>\n<p>You may submit text, URLs, screenshots, QR codes, images, headers, files supported by the interface, and investigation notes (“Submitted Content”). You confirm that you have the lawful right and authority to submit it and that processing it does not violate privacy, confidentiality, intellectual-property, employment, contractual, or other rights.</p>\n<p>Redact unnecessary personal or confidential information. Do not submit passwords, one-time codes, full payment-card details, private keys, recovery phrases, government identifiers, medical records, intimate content, or trade secrets unless strictly necessary, legally permitted, and appropriately protected.</p>\n<p>You grant CyberNet a limited licence to process, transmit, transform, analyse, and display Submitted Content only as reasonably necessary to provide, secure, troubleshoot, and improve the Services, enforce these Terms, and comply with law, as described in the Privacy Policy.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"byok\">\n<h2>8. User-provided API keys</h2>\n<p>CyberNet may allow you to connect your own OpenAI API key (“BYOK”). You must own or be authorised to use the key, comply with the provider’s terms, and protect it from disclosure. API use is billed directly by the provider to the account connected to that key, not included in CyberNet subscription fees, and remains your responsibility.</p>\n<p>CyberNet stores a validated BYOK key only in the current browser tab’s session storage and does not intentionally save it to your CyberNet account or Supabase database. The key is temporarily transmitted over HTTPS through CyberNet’s Netlify function to validate it and send requests to OpenAI. Provider-side processing and temporary retention are governed by the provider’s terms and privacy documentation.</p>\n<p>Use a separate restricted project key with suitable permissions, budgets, and spending limits. CyberNet is not responsible for provider charges, quota use, revoked keys, project restrictions, or losses caused by exposing or misconfiguring a key, except where liability cannot lawfully be excluded.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"acceptable-use\">\n<h2>9. Defensive and lawful use only</h2>\n<p>CyberNet is intended for defensive, educational, and authorised security use. You must comply with the <a href=\"acceptable-use.html\">Acceptable Use Policy</a>. You may not attack systems, steal credentials, distribute malware, evade safeguards, test targets without permission, harass others, conceal criminal activity, or use CyberNet in violation of law.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"plans\">\n<h2>10. Free, Pro, and Business plans</h2>\n<p>CyberNet may offer Free, Pro, and Business plans with different features, limits, models, storage, or response priority. Current advertised allowances may include 3 AI analyses per day for Free and 15 per day for Pro. Business allowances are per team and depend on the seat tier purchased, as described below. Limits are shared across supported analysis types and may be adjusted for security, capacity, abuse prevention, provider costs, or future plan changes.</p>\n<p>Pro features may include advanced analysis, saved history, reports, and faster processing. Features described as planned or coming soon may not be available at the time of purchase unless the checkout page expressly states otherwise.</p>\n\n<h3>10.1 Business team accounts</h3>\n<p>A Business subscription creates a <strong>team account</strong>. The person who purchases the subscription is the <strong>team owner</strong>. The owner may invite other people to join the team as <strong>members</strong>, up to the seat limit of the tier purchased. Each member signs in with their own separate CyberNet AI account; a Business subscription is not a shared login and must not be used as one.</p>\n<p>Business seat tiers are currently advertised at 5 seats, 10 seats, and 20 seats. The seat limit counts active members together with invitations that have been sent but not yet accepted. For team sizes or arrangements outside these tiers, contact <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a>.</p>\n<p><strong>Shared allowances.</strong> Business daily allowances belong to the team as a whole, not to each individual member. All members draw from the same daily pool, so usage by one member reduces what remains for the rest of the team that day. Advertised pools are 50 analyses and 20 Recovery Mode cases per day at 5 seats, 90 and 36 at 10 seats, and 160 and 64 at 20 seats. Analysis allowances reset at UTC midnight; Recovery Mode allowances reset daily at 12:00 PM Gulf Standard Time.</p>\n<p><strong>Owner visibility.</strong> The team owner can view the activity of every member of their team, including the stored results of each member's Quick Scan, Analysis AI, and Recovery Mode use. Anyone accepting an invitation is shown this before they join. If you do not want your activity visible to the team owner, do not accept the invitation, and use a separate personal account instead.</p>\n<p><strong>Joining and leaving.</strong> Membership begins only when the invited person accepts the invitation from their own signed-in account. Once a member has joined, <strong>only the team owner can remove that member from the team</strong> — members cannot remove themselves. A member who wishes to leave must ask the team owner to remove them. A removed member immediately loses Business access and returns to whatever plan their own account holds.</p>\n<p><strong>Owner responsibility.</strong> The team owner is responsible for who they invite, for removing members who should no longer have access, and for all use of the Services under their team account. Members remain bound by these Terms and by the <a href=\"acceptable-use.html\">Acceptable Use Policy</a> in their own right.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"subscriptions\">\n<h2>11. Subscription pricing and automatic renewal</h2>\n<p>CyberNet AI Pro is currently advertised at <strong>USD $9.99 per month</strong> or <strong>USD $95.90 per year</strong>, unless a different amount is clearly shown at checkout. CyberNet AI Business is currently advertised per seat tier: <strong>5 seats at USD $40 per month or $384 per year</strong>, <strong>10 seats at USD $80 per month or $768 per year</strong>, and <strong>20 seats at USD $160 per month or $1,536 per year</strong>. A paid subscription renews automatically at the displayed interval until cancelled.</p>\n<p>Before checkout, CyberNet displays the amount, billing interval, automatic-renewal notice, and required acceptance. By continuing, you authorise CyberNet and Stripe to charge the selected payment method for the initial term and each renewal, including applicable taxes, until cancellation takes effect.</p>\n<p>CyberNet may change future pricing with reasonable advance notice where required. A price change applies no earlier than the next renewal unless you expressly agree otherwise.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"payments\">\n<h2>12. Payments, taxes, and failed charges</h2>\n<p>Payments are processed by Stripe or another disclosed payment provider. CyberNet does not intentionally store complete payment-card numbers. You authorise the provider to collect and process payment, billing, fraud-prevention, and transaction information under its own terms.</p>\n<p>You are responsible for applicable taxes, bank fees, currency-conversion charges, and accurate billing information. Failed, disputed, reversed, or overdue payments may result in retries, restricted access, suspension, cancellation, or return to the Free plan.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"cancellation\">\n<h2>13. Cancellation</h2>\n<p>You may cancel through <strong>Account → Manage Billing</strong> or by contacting support when self-service cancellation is unavailable. Unless the checkout flow or applicable law states otherwise, cancellation takes effect at the end of the current paid billing period and Pro access continues until that date.</p>\n<p>Deleting your CyberNet account does not by itself cancel a Stripe subscription. Cancel the subscription before requesting account deletion. CyberNet may prevent account deletion while a subscription remains active, trialling, or past due so that billing obligations can be resolved.</p>\n<p><strong>Business team accounts.</strong> Only the team owner can cancel a Business subscription, because the subscription belongs to the owner's account. When a Business subscription is cancelled, lapses, or goes unpaid, <strong>every member of that team loses Business access</strong> at the end of the paid period, not just the owner. Each member's own account returns to whatever plan it holds independently. Members cannot cancel the team subscription and cannot remove themselves from the team; see section 10.1.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"refunds\">\n<h2>14. Refunds and billing disputes</h2>\n<p>Fees are generally non-refundable after a billing period begins, and partial or prorated refunds are not normally provided, except for duplicate charges, confirmed billing errors, a material failure to provide the purchased service, refunds approved by CyberNet, or refunds required by applicable law.</p>\n<p>The complete rules appear in the <a href=\"refunds.html\">Refund and Cancellation Policy</a>. Nothing limits mandatory consumer rights or lawful rights concerning unauthorised transactions.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"history\">\n<h2>15. Saved reports, history, and deletion</h2>\n<p>Saved reports or history may be stored in the browser, CyberNet’s database, or both. Browser data may be lost when site data is cleared, private browsing ends, the device changes, or the browser removes storage. CyberNet does not guarantee permanent retention or recovery.</p>\n<p>Account controls may allow you to export available data, delete individual or all saved history, and request account deletion. Deletion requests are subject to technical processing periods, backups, security investigations, payment records, legal holds, fraud prevention, and information CyberNet must retain by law.</p>\n<p>Reports are informational and are not certified forensic, legal, compliance, insurance, or expert-witness reports.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"privacy\">\n<h2>16. Privacy and data protection</h2>\n<p>The <a href=\"privacy.html\">Privacy Policy</a> explains the categories of information CyberNet processes, purposes, service providers, browser storage, international processing, retention schedule, legal-acceptance records, security measures, and privacy rights.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"third-parties\">\n<h2>17. Third-party providers and external services</h2>\n<p>CyberNet depends on services that may include Supabase, Netlify, Stripe, OpenAI, browser-isolation providers, reputation services, hosting, email, domain, and internet infrastructure. Their outages, errors, policy changes, service limits, and security incidents may affect CyberNet.</p>\n<p>CyberNet may display or analyse external links but does not control or endorse third-party destinations. Opening a link, contacting a sender, downloading content, or following an external recommendation is at your own risk and should be independently verified.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"availability\">\n<h2>18. Availability, maintenance, and changes</h2>\n<p>The Services are provided on an on-demand and “as available” basis. CyberNet may be unavailable because of maintenance, updates, attacks, provider outages, capacity limits, security controls, legal restrictions, or events outside reasonable control.</p>\n<p>CyberNet may add, remove, pause, redesign, or modify features, interfaces, providers, models, usage limits, plans, and integrations. CyberNet does not guarantee a release date for planned features or permanent compatibility with every browser, device, provider, or file type.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"support\">\n<h2>19. Support and user communications</h2>\n<p>CyberNet may send essential account, security, legal, payment, renewal, cancellation, verification, or service messages. Optional marketing messages, if introduced, will be handled separately where consent is required.</p>\n<p>Support information must not include passwords, one-time codes, API keys, private keys, recovery phrases, or full card details.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"ip\">\n<h2>20. Intellectual property</h2>\n<p>CyberNet’s name, logos, interface, source code, designs, documentation, educational content, report formats, and original materials are protected by intellectual-property laws. Except for the limited right to use the Services under these Terms, no rights are transferred to you.</p>\n<p>You may download reports for your own lawful use. You may not copy, resell, scrape, reverse engineer, remove notices from, or create a competing service from CyberNet except where applicable law expressly permits it.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"termination\">\n<h2>21. Suspension and termination</h2>\n<p>CyberNet may warn, restrict, suspend, or terminate access if you breach these Terms, fail to pay, create security or legal risk, misuse the Services, interfere with operations, or expose CyberNet or others to harm. CyberNet may preserve relevant records and cooperate with providers or lawful authorities where required.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"warranties\">\n<h2>22. Disclaimer of warranties</h2>\n<p>To the maximum extent permitted by applicable law, CyberNet is provided “as is” and “as available” without express, implied, or statutory warranties, including warranties of accuracy, reliability, availability, merchantability, fitness for a particular purpose, non-infringement, security, or freedom from harmful components.</p>\n<p>Nothing in these Terms excludes warranties or consumer protections that cannot lawfully be excluded.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"liability\">\n<h2>23. Limitation of liability</h2>\n<p>To the maximum extent permitted by applicable law, CyberNet and its operator, contractors, suppliers, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of money, profits, revenue, data, access, accounts, reputation, opportunities, devices, or goodwill arising from or connected with:</p>\n<ul>\n<li>use of, inability to use, or reliance on CyberNet;</li>\n<li>incorrect, incomplete, delayed, unavailable, or misleading analysis;</li>\n<li>false positives, false negatives, hacking, scams, phishing, malware, identity theft, account compromise, or data loss;</li>\n<li>user actions, Submitted Content, connected API keys, provider charges, third-party services, external websites, or payment disputes; or</li>\n<li>service interruption, deletion, corruption, disclosure, or loss of information.</li>\n</ul>\n<p>Where liability cannot be fully excluded, aggregate liability arising from the Services will, to the maximum extent permitted by law, not exceed the greater of the amount you paid CyberNet during the 12 months before the event giving rise to the claim or USD $100.</p>\n<p>These limits do not apply to fraud, wilful misconduct, or liability that cannot lawfully be excluded or limited.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"indemnity\">\n<h2>24. Indemnity</h2>\n<p>To the extent permitted by law, you agree to defend, indemnify, and hold harmless CyberNet and its operator from claims, losses, liabilities, costs, and reasonable legal fees arising from your unlawful or unauthorised use, Submitted Content, connected API keys, infringement of third-party rights, breach of these Terms, or misuse of analysis results.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"law\">\n<h2>25. Governing law and disputes</h2>\n<p>Unless the final legal-operator notice states otherwise, these Terms are governed by the laws of the United Arab Emirates, without prejudice to mandatory consumer rights that apply in your country of residence. Subject to mandatory forums or consumer rights, disputes will be submitted to the competent courts of the United Arab Emirates.</p>\n<p>Before filing a formal claim, contact <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a> and allow a reasonable opportunity to resolve the issue informally. This does not prevent urgent protective relief or a legally protected complaint.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"general\">\n<h2>26. General terms</h2>\n<p>If a provision is unenforceable, it will be modified or removed only to the minimum extent necessary and the remaining provisions remain effective. Failure to enforce a provision is not a waiver. You may not transfer your account or rights without permission. CyberNet may transfer these Terms as part of a restructuring, financing, acquisition, or sale.</p>\n<p>These Terms and incorporated policies are the entire agreement concerning the Services. Headings are for convenience. The English version controls unless applicable law requires otherwise.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"changes\">\n<h2>27. Changes to these Terms</h2>\n<p>CyberNet may update these Terms to reflect product, provider, security, legal, pricing, or business changes. The version and effective date will be updated. Material changes may be communicated through the website, account, or email. When law requires renewed acceptance, CyberNet will request it before continued use or a new purchase.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"contact\">\n<h2>28. Contact</h2>\n<p>Questions, legal notices, billing concerns, cancellation requests, and privacy requests may be sent to <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a>. Include your account email and enough information to identify the issue, but never send passwords, one-time codes, API keys, private keys, recovery phrases, or complete payment-card data.</p>\n</section></div>\n</div>","privacy":"<section class=\"cn-legal-hero\">\n<span class=\"cn-legal-eyebrow\">Legal Center · Version 2026-09-04</span>\n<h1>Privacy Policy</h1>\n<p>How CyberNet handles account data, submitted evidence, AI processing, connected API keys, browser storage, billing records, legal acceptance, retention, export, and deletion rights.</p>\n<div class=\"cn-legal-meta\"><span>Effective: 4 September 2026</span><span>Contact: cybernetai.26@gmail.com</span><span>Service: cybernetai.app</span></div>\n</section>\n<div class=\"cn-legal-layout\">\n<aside class=\"cn-legal-toc\"><strong>On this page</strong><a href=\"#scope\">1. Scope, controller, and legal operator</a>\n<a href=\"#categories\">2. Information CyberNet may collect</a>\n<a href=\"#feature-storage\">3. How specific features handle information</a>\n<a href=\"#purposes\">4. Why CyberNet uses information</a>\n<a href=\"#legal-bases\">5. Legal bases</a>\n<a href=\"#providers\">6. Service providers and recipients</a>\n<a href=\"#transfers\">7. International processing</a>\n<a href=\"#retention\">8. Retention schedule</a>\n<a href=\"#browser\">9. Cookies and browser storage</a>\n<a href=\"#security\">10. Security measures</a>\n<a href=\"#rights\">11. Privacy rights and account controls</a>\n<a href=\"#deletion\">12. Account deletion and residual records</a>\n<a href=\"#automated\">13. Automated analysis and human review</a>\n<a href=\"#children\">14. Children</a>\n<a href=\"#security-incidents\">15. Security incidents</a>\n<a href=\"#do-not-submit\">16. Sensitive information users should not submit</a>\n<a href=\"#changes\">17. Changes to this Policy</a>\n<a href=\"#contact\">18. Contact and complaints</a></aside>\n<div class=\"cn-legal-content\"><section class=\"cn-legal-section\" id=\"scope\">\n<h2>1. Scope, controller, and legal operator</h2>\n<p>This Privacy Policy explains how CyberNet processes personal information when you visit the website, create or use an account, submit content for analysis, connect an API key, purchase or manage a subscription, save reports, use support, or interact with current and planned features.</p>\n<p>The data controller is <strong>Marks Events FZ LLE</strong>, registration number 20116/2025, which operates CyberNet AI. Privacy requests, access requests and complaints may be sent to <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a>.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"categories\">\n<h2>2. Information CyberNet may collect</h2>\n<h3>Account and identity information</h3>\n<ul><li>first name, last name, full name, email address, user ID, account status, authentication timestamps, and profile metadata;</li><li>email-verification, password-reset, sign-in, session, and security-event information handled through Supabase;</li><li>plan, subscription status, billing interval, daily usage, feature access, and account preferences.</li></ul>\n<h3>Submitted Content and analysis information</h3>\n<ul><li>messages, text, URLs, screenshots, images, QR codes, email headers, filenames, and other evidence you choose to submit;</li><li>local analysis signals, AI prompts derived from the submission, risk scores, verdicts, evidence, limitations, recommended actions, reports, history, and feedback about results.</li></ul>\n<h3>Technical and usage information</h3>\n<ul><li>IP address, approximate network location, browser and device type, operating system, page URL, timestamps, language, request identifiers, function logs, error records, security events, and rate-limit information;</li><li>feature interactions, selected plan, analyses used, report actions, legal-document views, support category, and website-performance data.</li></ul>\n<h3>Billing and support information</h3>\n<ul><li>Stripe customer, checkout, subscription, invoice, payment status, refund, cancellation, and dispute identifiers; CyberNet does not intentionally store complete card numbers;</li><li>support form details, contact email, message, category, page URL, submission time, and browser information.</li></ul>\n<h3>Legal-acceptance records</h3>\n<ul><li>user ID, acceptance type, document versions, server timestamp, page URL, billing cycle when relevant, and limited user-agent information.</li></ul>\n</section>\n<section class=\"cn-legal-section\" id=\"feature-storage\">\n<h2>3. How specific features handle information</h2>\n<h3>Quick Scan and Analysis AI</h3>\n<p>Submitted evidence is processed in the browser and may be sent over HTTPS to Netlify Functions. When AI is enabled, relevant content may be sent to OpenAI to generate the requested analysis. CyberNet does not promise that all processing stays on the device.</p>\n<h3>Recovery Mode</h3>\n<p>Incident descriptions, quick-answer signals, and optional screenshots you submit to Recovery Mode are processed to generate a recovery case, plan, and task checklist stored in Supabase under your account. CyberNet attempts to detect and redact common secrets (such as passwords, OTPs, and card numbers) before they are stored or sent for AI processing, but automatic redaction is not guaranteed — never submit passwords, one-time codes, recovery codes, full card numbers, seed phrases, or private keys.</p>\n<h3>Saved reports and history</h3>\n<p>Some Quick Scan reports may be stored in browser local storage. Pro AI history, Recovery Mode cases, and account information may be stored in Supabase. Screenshot bytes may be excluded from browser-saved history or kept only for the active session, depending on the feature. Browser data can be removed by the user or browser and is not guaranteed to be recoverable.</p>\n<h3>User-provided OpenAI API keys</h3>\n<p>A validated key is stored only in the current browser tab’s session storage. It is temporarily transmitted over HTTPS to a Netlify Function for validation and to send the requested analysis to OpenAI. CyberNet does not intentionally store the key in Supabase, the user profile, logs, or saved reports. Closing the tab or selecting “Forget Key” removes the browser copy. OpenAI may process or temporarily retain API data under its own terms and controls.</p>\n<h3>Business team accounts — your activity is visible to your team owner</h3>\n<p><strong>If you join a CyberNet AI Business team, the team owner can see what you do on that team.</strong> This is the single most important privacy consequence of accepting a team invitation, so it is stated plainly here rather than buried elsewhere.</p>\n<p>Specifically, the owner of the team you belong to can view, for every Quick Scan, Analysis AI, and Recovery Mode use you make while you are a member: your name and the email address on your account, the date and time, which feature you used, and the <strong>full stored result</strong> — including the verdict, risk score, threat type, and the analysis summary CyberNet generated, and for Recovery Mode the case title, incident type, risk level, urgency, and status.</p>\n<p>CyberNet does not retain the raw text, links, or screenshots you submit as part of the stored history, so the owner does not see your original submitted content itself — but the generated analysis of that content can be detailed, and may reveal its subject matter. Treat anything you run on a team account as visible to the team owner.</p>\n<p>Activity from before you joined a team, and activity after you are removed from it, is not shown to that owner. If you do not want an owner to see your activity, do not accept the invitation and use a separate personal account instead. You are shown this consequence on the invitation screen before you join.</p>\n<h3>Payments</h3>\n<p>Stripe processes payment details and returns customer, subscription, invoice, and status information needed to unlock, renew, cancel, refund, or troubleshoot Pro or Business access. For a Business team, billing information belongs to the team owner's account; members do not have access to it.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"purposes\">\n<h2>4. Why CyberNet uses information</h2>\n<p>CyberNet may process information to:</p>\n<ul>\n<li>create, authenticate, secure, and support accounts;</li>\n<li>provide text, link, image, QR, and report functions;</li>\n<li>enforce Free and Pro limits, save eligible history, and provide downloads;</li>\n<li>validate and route optional BYOK requests;</li>\n<li>process subscriptions, invoices, renewals, cancellations, refunds, and payment failures;</li>\n<li>record legal acceptance and demonstrate payment authorisation or compliance;</li>\n<li>detect abuse, fraud, attacks, unauthorised access, and service misuse;</li>\n<li>debug errors, maintain availability, measure performance, and improve safety and usability;</li>\n<li>respond to support, privacy, security, and legal requests; and</li>\n<li>comply with law, enforce agreements, and protect users, CyberNet, providers, and third parties.</li>\n</ul>\n<p>CyberNet does not sell personal information. CyberNet does not use OpenAI API submissions to train CyberNet’s own public model. Third-party processing is governed by provider terms.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"legal-bases\">\n<h2>5. Legal bases</h2>\n<p>Depending on location and context, CyberNet relies on:</p>\n<ul>\n<li><strong>contract:</strong> to provide accounts, analyses, reports, subscriptions, billing, and requested support;</li>\n<li><strong>legitimate interests:</strong> to secure, prevent abuse, troubleshoot, improve, and operate the Services while considering user rights;</li>\n<li><strong>consent:</strong> where law requires it for a particular optional activity or communication;</li>\n<li><strong>legal obligation:</strong> for accounting, tax, sanctions, fraud prevention, consumer, security, and lawful-request duties; and</li>\n<li><strong>vital or public interests:</strong> only where applicable and legally permitted.</li>\n</ul>\n<p>Accepting the Privacy Policy acknowledges this notice; it is not blanket consent for unrelated marketing or advertising.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"providers\">\n<h2>6. Service providers and recipients</h2>\n<p>CyberNet may disclose limited information to providers that process it for the purposes described above, including:</p>\n<ul>\n<li><strong>Supabase:</strong> authentication, profiles, usage, saved history, legal-acceptance records, and database services;</li>\n<li><strong>Netlify:</strong> website hosting, serverless functions, security, logs, deployment, and support forms;</li>\n<li><strong>Stripe:</strong> checkout, recurring billing, invoices, payment methods, refunds, disputes, fraud prevention, and billing portal services;</li>\n<li><strong>OpenAI:</strong> AI analysis requested by CyberNet or by a user through BYOK;</li>\n<li><strong>professional advisers and authorities:</strong> where reasonably necessary for legal, security, fraud, accounting, insurance, or compliance purposes; and</li>\n<li><strong>business successors:</strong> in a merger, financing, acquisition, restructuring, or sale, subject to appropriate safeguards.</li>\n</ul>\n<p>CyberNet does not permit providers to use information for unrelated purposes except as allowed by their direct relationship with the user, their terms, or applicable law.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"transfers\">\n<h2>7. International processing</h2>\n<p>CyberNet and its providers may process information in the United Arab Emirates, the European Economic Area, the United States, and other countries where providers operate. Those countries may have different data-protection laws.</p>\n<p>Where required, CyberNet will use contractual, legal, organisational, or provider safeguards for cross-border transfers and will provide additional information upon a valid request.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"retention\">\n<h2>8. Retention schedule</h2>\n<p>CyberNet keeps information only for the periods reasonably necessary for the stated purposes, security, disputes, and legal obligations. Current target periods are:</p>\n<table class=\"cn-legal-data-table\"><thead><tr><th>Category</th><th>Typical retention</th></tr></thead><tbody>\n<tr><td>Active account and profile</td><td>For the life of the account, then deletion from active systems generally within 30 days after a valid deletion request, subject to exceptions below.</td></tr>\n<tr><td>Unsaved analysis input and output</td><td>CyberNet does not intentionally add it to saved history; temporary function, security, or provider processing may continue for up to 30 days, unless a shorter provider setting applies or an incident requires longer preservation.</td></tr>\n<tr><td>Pro saved history and reports</td><td>While the account remains active or until the user deletes it; deletion from active systems generally within 30 days and residual backups for up to 90 days.</td></tr>\n<tr><td>Browser local or session storage</td><td>Until the user clears it, the browser removes it, the tab closes for session data, or the feature’s “Forget/Clear” control is used.</td></tr>\n<tr><td>BYOK API key</td><td>Current browser tab only; removed when the tab closes or “Forget Key” is used. It is not intentionally retained in the CyberNet account or database.</td></tr>\n<tr><td>Security, access, and rate-limit logs</td><td>Normally up to 90 days; up to 12 months where needed to investigate abuse, fraud, attacks, or service incidents.</td></tr>\n<tr><td>Support and feedback records</td><td>Normally up to 24 months after the matter is closed, unless a dispute or legal duty requires longer.</td></tr>\n<tr><td>Billing, tax, invoice, refund, and dispute records</td><td>Normally up to 7 years after the relevant transaction or account closure, or longer where law requires.</td></tr>\n<tr><td>Legal-acceptance records</td><td>Normally up to 7 years after account closure or the last relevant transaction, or longer where needed for a legal claim or mandatory obligation.</td></tr>\n<tr><td>Backups</td><td>Rolling backups may retain deleted data for up to 90 days before overwrite, unless isolated for security or legal reasons.</td></tr>\n</tbody></table>\n<p>CyberNet may shorten these periods as systems improve. Information may be retained longer when necessary for fraud prevention, security investigations, payment disputes, legal claims, sanctions, tax, accounting, lawful requests, or protection of rights.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"browser\">\n<h2>9. Cookies and browser storage</h2>\n<p>CyberNet may use essential cookies, local storage, and session storage for authentication, navigation, preferences, plan state, legal acceptance, temporary API-key handling, saved browser reports, and security. Essential storage is required for core functionality.</p>\n<p>If optional analytics, advertising, or non-essential cookies are introduced, CyberNet will update this Policy and provide choices where required.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"security\">\n<h2>10. Security measures</h2>\n<p>CyberNet uses measures intended to reduce risk, including HTTPS, server-side secret storage, authenticated Netlify Functions, Supabase Row Level Security, access controls, request limits, input and file-size validation, security headers, restricted browser permissions, provider authentication, and separation of public and private keys.</p>\n<p>No method of transmission or storage is completely secure. Users must protect their devices, passwords, email accounts, API keys, recovery methods, and downloaded reports.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"rights\">\n<h2>11. Privacy rights and account controls</h2>\n<p>Depending on applicable law, you may have rights to access, receive a copy of, correct, delete, restrict, object to, or transfer personal information; withdraw consent; request information about recipients and international transfers; ask for review of automated output; and complain to a regulator.</p>\n<p>CyberNet’s Account area may provide controls to export available account data, clear saved reports, and request account deletion. Browser-saved information must also be removed through CyberNet’s clear controls or browser settings. Subscription cancellation is separate from account deletion.</p>\n<p>CyberNet may verify identity before completing a request. It may refuse or limit a request where law permits, including when necessary to protect another person, preserve security, collect a debt, prevent fraud, or retain legally required records.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"deletion\">\n<h2>12. Account deletion and residual records</h2>\n<p>Before deleting an account, cancel any active subscription through Manage Billing. A valid deletion request removes the CyberNet authentication user and active account data according to the retention schedule. Saved local browser information is cleared on the requesting browser where technically possible.</p>\n<p>Deletion does not require Stripe or other providers to erase records they must retain for payment, fraud, accounting, or legal purposes. CyberNet may retain de-identified information and records necessary for legal acceptance, billing, disputes, security, or compliance.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"automated\">\n<h2>13. Automated analysis and human review</h2>\n<p>CyberNet uses automated rules and AI to classify submitted content and generate cybersecurity information. These results may influence a user’s decision but are not intended to make legally binding decisions about credit, employment, insurance, eligibility, or legal rights.</p>\n<p>Users should apply independent judgment and may contact support to report an incorrect or concerning result. CyberNet may use submitted feedback to investigate and improve the service.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"children\">\n<h2>14. Children</h2>\n<p>CyberNet is not directed to children under 13 and does not knowingly permit them to create accounts. Users below the legal age of majority should use CyberNet only with a parent or guardian. Contact support if you believe a child’s information was collected without appropriate permission.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"security-incidents\">\n<h2>15. Security incidents</h2>\n<p>If CyberNet becomes aware of a personal-data incident, it will investigate, take reasonable containment measures, preserve relevant evidence, and provide notifications required by applicable law. Users should promptly change affected passwords, revoke exposed API keys, enable multi-factor authentication, and contact relevant providers if their own account or submission may have been exposed.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"do-not-submit\">\n<h2>16. Sensitive information users should not submit</h2>\n<p>Never submit passwords, one-time passcodes, complete card details, private keys, recovery phrases, identity documents, medical records, intimate material, or trade secrets unless there is a lawful, necessary, and protected reason. Redact unrelated personal information before using analysis or support features.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"changes\">\n<h2>17. Changes to this Policy</h2>\n<p>CyberNet may update this Policy as features, providers, retention practices, laws, and business operations change. The effective date and version will be updated. Material changes may be communicated through the website, account, or email, and renewed acceptance will be requested where required.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"contact\">\n<h2>18. Contact and complaints</h2>\n<p>Privacy questions, access requests, export requests, deletion requests, and complaints may be sent to <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a>. Include the account email and request type, but never send passwords, one-time codes, API keys, private keys, or complete payment-card information.</p>\n</section></div>\n</div>","refunds":"<section class=\"cn-legal-hero\">\n<span class=\"cn-legal-eyebrow\">Legal Center · Version 2026-09-04</span>\n<h1>Refund &amp; Cancellation Policy</h1>\n<p>Clear rules for CyberNet AI Pro recurring payments, cancellation, access after cancellation, refunds, billing errors, disputes, and mandatory consumer rights.</p>\n<div class=\"cn-legal-meta\"><span>Effective: 4 September 2026</span><span>Contact: cybernetai.26@gmail.com</span><span>Service: cybernetai.app</span></div>\n</section>\n<div class=\"cn-legal-layout\">\n<aside class=\"cn-legal-toc\"><strong>On this page</strong><a href=\"#summary\">1. Policy summary</a>\n<a href=\"#billing\">2. Billing authorisation</a>\n<a href=\"#cancel\">3. How to cancel</a>\n<a href=\"#access\">4. Access after cancellation</a>\n<a href=\"#refund-rule\">5. General refund rule</a>\n<a href=\"#eligible\">6. Situations that may qualify</a>\n<a href=\"#request\">7. Requesting a refund</a>\n<a href=\"#timing\">8. Processing time</a>\n<a href=\"#currency\">9. Currency, taxes, and conversion</a>\n<a href=\"#chargebacks\">10. Chargebacks and disputes</a>\n<a href=\"#promotions\">11. Trials, discounts, and promotions</a>\n<a href=\"#rights\">12. Mandatory rights and contact</a></aside>\n<div class=\"cn-legal-content\"><section class=\"cn-legal-section\" id=\"summary\">\n<h2>1. Policy summary</h2>\n<p>CyberNet AI Pro is a recurring monthly or yearly subscription. It renews automatically until cancelled. The amount and interval are shown before checkout. Unless applicable law or an approved exception requires otherwise, payments are non-refundable after a billing period begins.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"billing\">\n<h2>2. Billing authorisation</h2>\n<p>By selecting Pro and accepting the checkout disclosure, you authorise Stripe and CyberNet to charge the selected payment method for the initial term and each renewal. Monthly subscriptions are currently advertised at USD $9.99 per month and yearly subscriptions at USD $95.90 per year unless checkout clearly shows another amount.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"cancel\">\n<h2>3. How to cancel</h2>\n<p>Cancel through <strong>Account → Manage Billing</strong>. If the billing portal is unavailable, contact <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a> before the next renewal and include the account email. Cancellation normally takes effect at the end of the current paid term.</p>\n<p>Deleting an account does not automatically cancel an active subscription. Cancel billing first.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"access\">\n<h2>4. Access after cancellation</h2>\n<p>Unless checkout or applicable law states otherwise, Pro access continues until the end of the paid billing period. After that, the account returns to Free and Pro-only history, downloads, or planned features may become unavailable.</p>\n<p><strong>Business team accounts.</strong> A Business subscription is owned by the team owner, and only the owner can cancel it. When a Business subscription is cancelled or lapses, Business access ends at the close of the paid period for <strong>the owner and every member of that team at the same time</strong>. Each member's account then returns to whatever plan it independently holds, which for most members is Free. Members cannot cancel the team subscription, and a member leaving the team does not cancel or reduce the owner's subscription — the seat simply becomes free for someone else. Removing a member takes effect immediately and does not generate a refund or proration for the remainder of the paid period.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"refund-rule\">\n<h2>5. General refund rule</h2>\n<p>CyberNet generally does not provide refunds, credits, or prorated amounts for unused time, accidental non-use, a changed decision, failure to cancel before renewal, or features clearly described as coming soon or concept previews.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"eligible\">\n<h2>6. Situations that may qualify</h2>\n<p>CyberNet may approve a refund for a duplicate charge, confirmed billing error, unauthorised transaction after reasonable verification, a material failure to provide purchased access, or another situation required by applicable law. Approval is case-specific and does not create a continuing obligation.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"request\">\n<h2>7. Requesting a refund</h2>\n<p>Contact support promptly with the account email, charge date, amount, last four card digits if appropriate, and a clear explanation. Do not send complete card details, passwords, one-time codes, or identity documents unless support provides a secure and lawful method.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"timing\">\n<h2>8. Processing time</h2>\n<p>Approved refunds are submitted to Stripe promptly. The bank or payment provider controls when funds appear, which may take several business days. CyberNet is not responsible for bank processing times.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"currency\">\n<h2>9. Currency, taxes, and conversion</h2>\n<p>Prices are displayed in the stated currency. Banks may apply exchange rates, international fees, taxes, or other charges that CyberNet does not control and normally cannot refund.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"chargebacks\">\n<h2>10. Chargebacks and disputes</h2>\n<p>Contact CyberNet first so a billing error can be investigated. This does not limit lawful rights to contact a bank or dispute an unauthorised charge. CyberNet may provide checkout, acceptance, usage, cancellation, and account records to the payment provider when responding to a dispute.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"promotions\">\n<h2>11. Trials, discounts, and promotions</h2>\n<p>Promotional prices, coupons, and trials may have specific terms shown at checkout. Unless stated otherwise, a discounted subscription renews at the then-current standard price after the promotional period.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"rights\">\n<h2>12. Mandatory rights and contact</h2>\n<p>Nothing in this Policy excludes a refund, cancellation, withdrawal, or remedy that cannot lawfully be excluded. Billing and cancellation support: <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a>.</p>\n</section></div>\n</div>","acceptable":"<section class=\"cn-legal-hero\">\n<span class=\"cn-legal-eyebrow\">Legal Center · Version 2026-09-04</span>\n<h1>Acceptable Use Policy</h1>\n<p>Rules requiring defensive, authorised, lawful use of Quick Scan, Analysis AI, Recovery Mode, reports, and connected API keys.</p>\n<div class=\"cn-legal-meta\"><span>Effective: 4 September 2026</span><span>Contact: cybernetai.26@gmail.com</span><span>Service: cybernetai.app</span></div>\n</section>\n<div class=\"cn-legal-layout\">\n<aside class=\"cn-legal-toc\"><strong>On this page</strong><a href=\"#purpose\">1. Purpose</a>\n<a href=\"#authorised\">2. Authorised defensive use</a>\n<a href=\"#prohibited\">3. Prohibited conduct</a>\n<a href=\"#content\">4. Submitted Content standards</a>\n<a href=\"#api\">5. API keys and third-party accounts</a>\n<a href=\"#automation\">6. Automation and fair use</a>\n<a href=\"#privacy\">7. Privacy and confidentiality</a>\n<a href=\"#enforcement\">8. Enforcement</a>\n<a href=\"#report\">9. Reporting abuse</a>\n<a href=\"#changes\">10. Changes</a></aside>\n<div class=\"cn-legal-content\"><section class=\"cn-legal-section\" id=\"purpose\">\n<h2>1. Purpose</h2>\n<p>CyberNet is a defensive cybersecurity and education platform. This Policy applies to accounts, submissions, API-key use, Quick Scan analyses, Analysis AI analyses, Recovery Mode cases, reports, downloads, and interactions with CyberNet.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"authorised\">\n<h2>2. Authorised defensive use</h2>\n<p>You may analyse content you own, received, are responsible for protecting, or are expressly authorised to test. Permitted purposes include personal safety, education, incident triage, internal security, and legitimate research performed lawfully and with appropriate permission.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"prohibited\">\n<h2>3. Prohibited conduct</h2>\n<p>You may not use CyberNet to:</p>\n<ul>\n<li>access, scan, test, exploit, monitor, or interfere with systems, accounts, devices, networks, websites, or data without authorisation;</li>\n<li>create, improve, distribute, conceal, or deploy malware, ransomware, credential stealers, phishing kits, botnets, exploits, destructive code, or harmful payloads;</li>\n<li>steal credentials, payment data, personal information, authentication tokens, private keys, or confidential information;</li>\n<li>bypass authentication, rate limits, paywalls, security controls, content filters, abuse systems, or provider restrictions;</li>\n<li>facilitate fraud, impersonation, extortion, harassment, stalking, doxxing, identity theft, money laundering, or unauthorised surveillance;</li>\n<li>upload illegal, abusive, intimate, exploitative, infringing, or child sexual abuse material;</li>\n<li>fabricate evidence, misrepresent CyberNet results, or use outputs to accuse or harm another person without reliable evidence;</li>\n<li>overload, scrape, reverse engineer, disrupt, probe, or attack CyberNet or its providers;</li>\n<li>resell, sublicense, or commercially automate CyberNet without written permission; or</li>\n<li>violate law, sanctions, export controls, court orders, contracts, or third-party rights.</li>\n</ul>\n</section>\n<section class=\"cn-legal-section\" id=\"content\">\n<h2>4. Submitted Content standards</h2>\n<p>Redact unnecessary personal information. Do not submit passwords, one-time codes, full card numbers, private keys, recovery phrases, medical records, identity documents, intimate content, or trade secrets unless legally authorised and strictly necessary.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"api\">\n<h2>5. API keys and third-party accounts</h2>\n<p>You must own or be authorised to use any connected API key, comply with provider terms, protect it from disclosure, and pay provider charges. Do not use stolen, leaked, shared, trial, educational, or restricted keys in violation of provider rules.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"automation\">\n<h2>6. Automation and fair use</h2>\n<p>Do not use bots, scripts, multiple accounts, credential sharing, or workarounds to avoid limits or generate excessive traffic. CyberNet may apply rate, file-size, concurrency, storage, and abuse limits.</p>\n<p><strong>Giving several people access.</strong> Sharing one set of login credentials remains prohibited, on every plan. If more than one person needs access, the supported way to do that is a <strong>CyberNet AI Business team</strong>, where the team owner invites each person and every teammate signs in with their own named account. Using a single login for multiple people — rather than buying the seats — is a breach of this Policy, and it also defeats the purpose of the team activity log, which exists so actions can be attributed to the individual who took them.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"privacy\">\n<h2>7. Privacy and confidentiality</h2>\n<p>Do not submit another person’s personal or confidential information without a lawful basis and appropriate permission. You remain responsible for complying with privacy, employment, education, confidentiality, and data-protection obligations.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"enforcement\">\n<h2>8. Enforcement</h2>\n<p>CyberNet may warn, block content, restrict features, suspend or terminate accounts, preserve records, reverse benefits obtained through abuse, and cooperate with providers or lawful authorities. CyberNet may act without advance notice where necessary to prevent harm or comply with law.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"report\">\n<h2>9. Reporting abuse</h2>\n<p>Report suspected abuse to <a href=\"mailto:cybernetai.26@gmail.com\">cybernetai.26@gmail.com</a>. Include relevant URLs, timestamps, screenshots, and account details, but never send passwords, one-time codes, API keys, private keys, or complete payment-card numbers.</p>\n</section>\n<section class=\"cn-legal-section\" id=\"changes\">\n<h2>10. Changes</h2>\n<p>CyberNet may update this Policy as threats, laws, providers, and product features change. Material changes may require renewed acceptance.</p>\n</section></div>\n</div>"});

  let refreshQueued = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function legalRecord(kind) {
    return {
      kind,
      version: LEGAL_VERSION,
      termsVersion: LEGAL_VERSION,
      privacyVersion: LEGAL_VERSION,
      acceptableUseVersion: LEGAL_VERSION,
      refundVersion: LEGAL_VERSION,
      billingCycle: kind === "checkout" ? selectedCycle() : "",
      effectiveDate: EFFECTIVE_DATE,
      acceptedAt: new Date().toISOString(),
      page: window.location.href
    };
  }

  function storeAcceptance(kind) {
    const record = legalRecord(kind);
    try {
      localStorage.setItem(`cybernet_${kind}_legal_acceptance`, JSON.stringify(record));
    } catch {}
    window.CYBERNET_LEGAL_ACCEPTANCE = record;
    try {
      window.dispatchEvent(new CustomEvent("cybernet:legal-acceptance", { detail: record }));
    } catch {}
    return record;
  }

  function injectLegalModal() {
    if (byId("cnLegalModal")) return;

    const modal = create("div", "cn-legal-modal");
    modal.id = "cnLegalModal";
    modal.setAttribute("aria-hidden", "true");

    const tabs = Object.entries(DOCS).map(([key, value], index) => (
      `<button type="button" class="cn-legal-tab${index === 0 ? " active" : ""}" data-cn-legal-doc="${key}">${value.label}</button>`
    )).join("");

    modal.innerHTML = `
      <div class="cn-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="cnLegalModalTitle">
        <header class="cn-legal-dialog-head">
          <div class="cn-legal-brand">
            <img src="cybernetshield.png?v=20260830-3" alt="CyberNet AI logo" width="32" height="32" style="object-fit:contain" />
            <div>
              <strong id="cnLegalModalTitle">CyberNet Legal Center</strong>
              <small>Effective ${EFFECTIVE_DATE} · Version ${LEGAL_VERSION}</small>
            </div>
          </div>
          <button type="button" class="cn-legal-close" id="cnLegalClose" aria-label="Close legal center">×</button>
        </header>
        <nav class="cn-legal-tabs" aria-label="Legal documents">${tabs}</nav>
        <div class="cn-legal-viewer" id="cnLegalViewer" tabindex="0" role="document" aria-live="polite" aria-label="CyberNet legal document"></div>
        <footer class="cn-legal-dialog-foot">
          <p>Review the documents here, then close this window and use the required checkbox before creating an account or purchasing Pro.</p>
          <button type="button" class="cn-legal-done" id="cnLegalDone">Done reviewing</button>
        </footer>
      </div>
    `;

    document.body.appendChild(modal);
    renderLegalDocument("terms");

    const close = () => closeLegalModal();
    byId("cnLegalClose")?.addEventListener("click", close);
    byId("cnLegalDone")?.addEventListener("click", close);
    modal.addEventListener("click", event => {
      if (event.target === modal) close();
    });

    modal.querySelectorAll("[data-cn-legal-doc]").forEach(button => {
      button.addEventListener("click", () => openLegalModal(button.dataset.cnLegalDoc || "terms"));
    });

    byId("cnLegalViewer")?.addEventListener("click", handleLegalViewerClick);

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && modal.classList.contains("show")) close();
    });
  }

  function legalDocKeyFromHref(href) {
    if (!href) return null;
    try {
      const url = new URL(href, `${window.location.origin}/`);
      const file = url.pathname.split("/").pop()?.toLowerCase() || "";
      const match = Object.entries(DOCS).find(([, value]) => value.url.toLowerCase() === file);
      return match ? { key: match[0], hash: url.hash } : null;
    } catch {
      return null;
    }
  }

  function scrollLegalViewerTo(hash) {
    if (!hash) return;
    const viewer = byId("cnLegalViewer");
    if (!viewer) return;
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (target && viewer.contains(target)) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function renderLegalDocument(doc = "terms", hash = "") {
    const chosen = DOCS[doc] || DOCS.terms;
    const viewer = byId("cnLegalViewer");
    if (!viewer) return;

    const markup = LEGAL_CONTENT[doc] || LEGAL_CONTENT.terms;
    viewer.setAttribute("aria-busy", "true");
    viewer.innerHTML = markup;
    viewer.dataset.currentDoc = doc;
    viewer.setAttribute("aria-label", `CyberNet ${chosen.label}`);
    viewer.scrollTop = 0;
    viewer.setAttribute("aria-busy", "false");

    if (hash) scrollLegalViewerTo(hash);
  }

  function handleLegalViewerClick(event) {
    const link = event.target.closest?.("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (href.startsWith("#")) {
      event.preventDefault();
      scrollLegalViewerTo(href);
      return;
    }

    const legalDoc = legalDocKeyFromHref(href);
    if (legalDoc) {
      event.preventDefault();
      openLegalModal(legalDoc.key, legalDoc.hash);
    }
  }

  function openLegalModal(doc = "terms", hash = "") {
    injectLegalModal();
    const chosen = DOCS[doc] || DOCS.terms;
    const modal = byId("cnLegalModal");
    if (!modal) return;

    modal.querySelectorAll("[data-cn-legal-doc]").forEach(button => {
      button.classList.toggle("active", button.dataset.cnLegalDoc === doc);
    });

    renderLegalDocument(doc, hash);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    byId("cnLegalClose")?.focus({ preventScroll: true });
  }

  function closeLegalModal() {
    const modal = byId("cnLegalModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }

  function showAuthLegalError(message) {
    const authMessage = byId("authMessage");
    if (authMessage) {
      authMessage.textContent = message;
      authMessage.className = "auth-message error";
    }
    const box = byId("cnSignupLegalBox");
    box?.classList.remove("cn-legal-error");
    requestAnimationFrame(() => box?.classList.add("cn-legal-error"));
  }

  function setupSignupConsent() {
    const form = byId("authSignupForm");
    const signupButton = byId("signupBtn");
    if (!form || !signupButton) return false;

    let box = byId("cnSignupLegalBox");
    if (!box) {
      box = create("section", "cn-signup-legal");
      box.id = "cnSignupLegalBox";
      box.innerHTML = `
        <div class="cn-signup-legal-row">
          <input type="checkbox" id="cnSignupLegalConsent" aria-describedby="cnSignupLegalRequired" />
          <label for="cnSignupLegalConsent">
            I have read and agree to the <strong>Terms of Service</strong>, <strong>Privacy Policy</strong>, and <strong>Acceptable Use Policy</strong>. I understand that CyberNet provides automated cybersecurity information that may contain errors and does not guarantee protection from hacking, scams, or loss.
          </label>
        </div>
        <div class="cn-legal-inline-actions">
          <button type="button" class="cn-legal-link-btn" data-open-legal="terms">Review Terms</button>
          <button type="button" class="cn-legal-link-btn" data-open-legal="privacy">Privacy</button>
          <button type="button" class="cn-legal-link-btn" data-open-legal="acceptable">Acceptable Use</button>
        </div>
        <small class="cn-legal-required" id="cnSignupLegalRequired">Required before account creation · Legal version ${LEGAL_VERSION}</small>
      `;

      const message = byId("authMessage");
      if (message && message.parentElement === form) form.insertBefore(box, message);
      else signupButton.insertAdjacentElement("beforebegin", box);
    }

    const checkbox = byId("cnSignupLegalConsent");
    if (checkbox && checkbox.dataset.cnLegalBound !== "true") {
      checkbox.dataset.cnLegalBound = "true";
      const sync = () => {
        signupButton.disabled = !checkbox.checked;
        box.classList.toggle("cn-legal-error", false);
        if (checkbox.checked) storeAcceptance("signup");
      };
      checkbox.addEventListener("change", sync);
      signupButton.disabled = !checkbox.checked;
    }

    return true;
  }

  function selectedCycle() {
    const button = byId("proPlanBtn");
    const cycle = String(button?.dataset.cycle || byId("pricingToggle")?.dataset.cycle || "monthly").toLowerCase();
    return cycle === "yearly" ? "yearly" : "monthly";
  }

  function updateCheckoutDisclosure() {
    const box = byId("cnCheckoutConsentBox");
    const summary = byId("cnCheckoutPriceSummary");
    const label = byId("cnCheckoutConsentLabel");
    if (!box || !summary || !label) return;

    const yearly = selectedCycle() === "yearly";
    const amount = yearly ? "$95.90 USD every year" : "$9.99 USD every month";
    const interval = yearly ? "annual" : "monthly";

    const summaryMarkup = `<strong>${amount}</strong> · Recurring ${interval} subscription · Renews automatically until cancelled.`;
    const labelMarkup = `I authorise this recurring charge and agree to the <strong>Terms of Service</strong> and <strong>Refund &amp; Cancellation Policy</strong>. I understand I can cancel through Account → Manage Billing before the next renewal.`;
    if (summary.innerHTML !== summaryMarkup) summary.innerHTML = summaryMarkup;
    if (label.innerHTML !== labelMarkup) label.innerHTML = labelMarkup;
  }

  function setupCheckoutConsent() {
    const proButton = byId("proPlanBtn");
    if (!proButton) return false;

    let box = byId("cnCheckoutConsentBox");
    if (!box) {
      box = create("section", "cn-checkout-consent");
      box.id = "cnCheckoutConsentBox";
      box.innerHTML = `
        <p class="cn-checkout-price-summary" id="cnCheckoutPriceSummary"></p>
        <div class="cn-checkout-consent-row">
          <input type="checkbox" id="cnCheckoutLegalConsent" aria-describedby="cnCheckoutLegalRequired" />
          <label id="cnCheckoutConsentLabel" for="cnCheckoutLegalConsent"></label>
        </div>
        <div class="cn-legal-inline-actions">
          <button type="button" class="cn-legal-link-btn" data-open-legal="terms">Review Terms</button>
          <button type="button" class="cn-legal-link-btn" data-open-legal="refunds">Refund Policy</button>
        </div>
        <small class="cn-legal-required" id="cnCheckoutLegalRequired">Required before secure Stripe Checkout opens.</small>
      `;
      proButton.insertAdjacentElement("beforebegin", box);
    }

    updateCheckoutDisclosure();

    const checkbox = byId("cnCheckoutLegalConsent");
    if (checkbox && checkbox.dataset.cnLegalBound !== "true") {
      checkbox.dataset.cnLegalBound = "true";
      checkbox.addEventListener("change", () => {
        box.classList.remove("cn-legal-error");
        if (checkbox.checked) storeAcceptance("checkout");
      });
    }

    document.querySelectorAll("#pricingToggle [data-cycle], .toggle-option[data-cycle]").forEach(button => {
      if (button.dataset.cnLegalBound === "true") return;
      button.dataset.cnLegalBound = "true";
      button.addEventListener("click", () => setTimeout(updateCheckoutDisclosure, 0));
    });

    return true;
  }

  function setupFooterLinks() {
    const footer = document.querySelector("footer");
    if (!footer || footer.querySelector(".cn-footer-legal")) return false;

    const links = create("nav", "cn-footer-legal");
    links.setAttribute("aria-label", "Legal links");
    links.innerHTML = `
      <a href="terms.html">Terms of Service</a>
      <a href="privacy.html">Privacy Policy</a>
      <a href="refunds.html">Refund &amp; Cancellation</a>
      <a href="acceptable-use.html">Acceptable Use</a>
      <button type="button" data-open-legal="terms">Legal Center</button>
    `;
    footer.appendChild(links);
    return true;
  }

  function setupAccountLegalPanel() {
    const modal = byId("accountDetailsModal");
    if (!modal || byId("cnAccountLegalPanel")) return false;

    const infoPane = byId("cybernetAccountInfoPane") || modal.querySelector(".cybernet-account-card");
    if (!infoPane) return false;

    const panel = create("section", "cn-account-legal-panel");
    panel.id = "cnAccountLegalPanel";
    panel.innerHTML = `
      <h3>Legal &amp; Billing</h3>
      <p>Review your subscription terms, cancellation rules, privacy information, and defensive-use requirements. Pro renews automatically until cancelled through Manage Billing.</p>
      <div class="cn-account-legal-links">
        <button type="button" data-open-legal="terms">Terms</button>
        <button type="button" data-open-legal="privacy">Privacy</button>
        <button type="button" data-open-legal="refunds">Refunds &amp; Cancellation</button>
        <button type="button" data-open-legal="acceptable">Acceptable Use</button>
      </div>
    `;
    infoPane.appendChild(panel);
    return true;
  }

  function removeAnalysisDisclaimers() {
    document.querySelectorAll(".cn-analysis-disclaimer").forEach(notice => notice.remove());
  }

  function handleLegalClicks(event) {
    const opener = event.target.closest?.("[data-open-legal]");
    if (opener) {
      event.preventDefault();
      openLegalModal(opener.dataset.openLegal || "terms");
      return;
    }

    const signupButton = event.target.closest?.("#signupBtn");
    if (signupButton) {
      const checkbox = byId("cnSignupLegalConsent");
      if (!checkbox?.checked) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        showAuthLegalError("You must accept the Terms of Service, Privacy Policy, and Acceptable Use Policy before creating an account.");
        openLegalModal("terms");
      } else {
        storeAcceptance("signup");
      }
      return;
    }

    const proButton = event.target.closest?.("#proPlanBtn");
    if (proButton && !proButton.disabled && !/current plan/i.test(proButton.textContent || "")) {
      const checkbox = byId("cnCheckoutLegalConsent");
      if (!checkbox?.checked) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const box = byId("cnCheckoutConsentBox");
        box?.classList.remove("cn-legal-error");
        requestAnimationFrame(() => box?.classList.add("cn-legal-error"));
        const notice = byId("pricingNotice");
        if (notice) {
          notice.textContent = "Accept the recurring subscription, Terms, and Refund Policy before continuing to Stripe Checkout.";
          notice.className = "pricing-notice glass show error";
        }
        box?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        storeAcceptance("checkout");
      }
    }
  }

  function refresh() {
    injectLegalModal();
    setupSignupConsent();
    setupCheckoutConsent();
    setupFooterLinks();
    setupAccountLegalPanel();
    removeAnalysisDisclaimers();
    updateCheckoutDisclosure();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function init() {
    if (document.documentElement.dataset.cybernetLegalUpgrade === "ready") return;
    document.documentElement.dataset.cybernetLegalUpgrade = "ready";

    injectLegalModal();
    document.addEventListener("click", handleLegalClicks, true);
    refresh();

    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.addedNodes.length || mutation.type === "attributes")) queueRefresh();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cycle", "class", "hidden"] });

    let attempts = 0;
    const retry = setInterval(() => {
      attempts += 1;
      refresh();
      if (attempts >= 20 && byId("cnSignupLegalBox") && byId("cnCheckoutConsentBox")) clearInterval(retry);
    }, 300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
