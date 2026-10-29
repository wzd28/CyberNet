// Checks that the two copies of the Privacy Policy agree: the standalone page
// (public/privacy.html) and the in-app Legal Center copy (LEGAL_CONTENT.privacy in
// public/cybernet-legal-upgrade.js). They must say the same thing word for word, apart from the
// one known difference: the standalone page has its own "Cookie settings" button in section 9.
// Also checks that the version and dates agree, and that every provider the code sends data to
// is named in section 6 (checked against netlify/functions, public/*.js and netlify.toml on
// 18 Oct 2026; add a provider here when the code starts using one).
//   node tests/run-legal-copy.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(root, rel), "utf8");

const html = read("public/privacy.html");
const js = read("public/cybernet-legal-upgrade.js");
const PREFIX = "  const LEGAL_CONTENT = Object.freeze(";
const line = js.split("\n").find(l => l.startsWith(PREFIX));
const legal = JSON.parse(line.slice(PREFIX.length, -2));

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}${detail ? `\n  ${detail}` : ""}`);
}

const norm = s => s.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
const start = html.indexOf('<section class="cn-legal-hero">');
const end = html.indexOf('<footer class="cn-legal-page-footer">');
check("privacy.html has the document body", start > 0 && end > start);

// The standalone page's own cookie button, and the sentence that points at it.
const KNOWN = [
  [" or with the button below.", " or on the Privacy Policy page."],
  ['<p><button type="button" class="cn-consent-open-btn" data-cn-consent-open>Cookie settings</button></p>', ""]
];
let page = norm(html.slice(start, end));
for (const [from, to] of KNOWN) {
  check(`known difference present: ${from.slice(0, 40)}`, page.includes(from));
  page = page.replace(from, to);
}
const inApp = norm(legal.privacy);
let i = 0;
while (i < page.length && page[i] === inApp[i]) i++;
check("privacy.html and the Legal Center copy say the same thing", page === inApp,
  page === inApp ? "" : `first difference at ${i}:\n  page:   ...${page.slice(Math.max(0, i - 60), i + 120)}\n  in-app: ...${inApp.slice(Math.max(0, i - 60), i + 120)}`);

// Version and date
const version = (js.match(/const PRIVACY_VERSION = "([\d-]+)"/) || [])[1];
check("PRIVACY_VERSION is set", !!version);
check("page eyebrow shows PRIVACY_VERSION", html.includes(`Legal Center · Version ${version}</span>`));
check("in-app eyebrow shows PRIVACY_VERSION", legal.privacy.includes(`Legal Center · Version ${version}</span>`));
const [y, m, d] = String(version).split("-").map(Number);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const updated = `Last updated: ${d} ${MONTHS[m - 1]} ${y}`;
check(`page says "${updated}"`, html.includes(updated));
check(`in-app copy says "${updated}"`, legal.privacy.includes(updated));

// Section 6 names every recipient the code uses.
const providers = page.slice(page.indexOf('id="providers"'), page.indexOf('id="transfers"'));
const RECIPIENTS = {
  Supabase: () => /supabase/i.test(read("netlify/lib/supabase.mjs")),
  Netlify: () => true,
  Cloudflare: () => true, // DNS, proxy (Cloudflare email-decode script on the live site) and email routing
  Stripe: () => /stripe/i.test(read("netlify/functions/create-checkout-session.mjs")),
  OpenAI: () => read("netlify/functions/byok-analyze.mts").includes("api.openai.com"),
  Resend: () => read("netlify/functions/business-invite.mts").includes("api.resend.com"),
  "GetScreenshot (Rasterwise)": () => read("netlify/functions/screenshot-preview.mjs").includes("api.rasterwise.com"),
  Microlink: () => read("netlify/functions/screenshot-preview.mjs").includes("api.microlink.io"),
  "Google sign-in": () => /provider:\s*"google"/.test(read("public/script.js")),
  "Google Analytics": () => read("public/cybernet-consent.js").includes("googletagmanager.com"),
  Gmail: () => true, // the support inbox that Cloudflare Email Routing delivers to
  jsDelivr: () => read("public/index.html").includes("cdn.jsdelivr.net"),
  "Google Fonts": () => read("public/index.html").includes("fonts.googleapis.com")
};
for (const [name, used] of Object.entries(RECIPIENTS)) {
  if (!used()) continue;
  check(`section 6 names ${name}`, providers.includes(name));
}
check("link previews are explained", /Link and QR-code previews/.test(page));
check("error diagnostics are explained", /Error diagnostics/.test(page));
check("encrypted backups are explained", /Encrypted backups/.test(page) && /8 weeks/.test(page));
// One backup period everywhere (8 weeks), matching docs/BACKUPS.md step 7 and the weekly email.
check("no other backup period", !/backups? for up to 90 days/.test(page) && (page.match(/residual backups for up to 8 weeks/g) || []).length === 2, "residual backups");
check("backup guide deletes after 8 weeks", /older_than:56d/.test(read("docs/BACKUPS.md")) && read("netlify/lib/backup.mjs").includes("Keep this email for 8 weeks, then delete it"));
// The error reporter sends the browser, its main version and the operating system.
check("error diagnostics name the browser version", /the browser, its main version number and the operating system/.test(page) && !/browser family/.test(page));

// The other three documents in the Legal Center share LEGAL_VERSION (their own version line).
const legalVersion = (js.match(/const LEGAL_VERSION = "([\d-]+)"/) || [])[1];
check("LEGAL_VERSION is set", !!legalVersion);
const PAGE_OF = { terms: "public/terms.html", refunds: "public/refunds.html", acceptable: "public/acceptable-use.html" };
for (const key of ["terms", "refunds", "acceptable"]) {
  check(`${key} has the current version line`, legal[key].includes(`Legal Center · Version ${legalVersion}</span>`));
  check(`${key} page has the same version line`, read(PAGE_OF[key]).includes(`Legal Center · Version ${legalVersion}</span>`));
}
const SERVER_VERSION = (read("netlify/functions/legal-acceptance.mts").match(/const CURRENT_VERSION = "([\d-]+)"/) || [])[1];
check("legal-acceptance default version matches LEGAL_VERSION", SERVER_VERSION === legalVersion, SERVER_VERSION);

// 29 Oct 2026 (owner answers): the iPhone app, immediate deletion, AI consent and Google
// Analytics in the app. Each page and its Legal Center copy say the same.
const flat = (s) => norm(s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&"));
const docs = {
  terms: [read("public/terms.html"), legal.terms],
  privacy: [read("public/privacy.html"), legal.privacy],
  refunds: [read("public/refunds.html"), legal.refunds]
};
const MUST = {
  terms: [
    "Deleting your account cancels your paid plan immediately.",
    "no refund, credit or proration is given for the unused part of the current billing period",
    "If the subscription cannot be cancelled, your account is not deleted",
    "listed on Apple’s App Store under the name of its developer, Walid Zeineddine",
    "operated by Marks Events FZ LLE, and these Terms are between you and Marks Events FZ LLE",
    "Apple is not a party to these Terms",
    "10.2 The iPhone app",
    "only after you allow it on the app’s “Allow AI analysis?” screen"
  ],
  privacy: [
    "Marks Events FZ LLE operates the app and is the data controller for it too",
    "passed to OpenAI, a third-party AI provider",
    "Nothing is sent for AI analysis until you choose Allow",
    "You can withdraw it at any time in Account → Privacy & data",
    "Google Analytics in the iPhone app (only if you allow tracking)",
    "If you choose Ask App Not to Track, Google Analytics is never loaded in the app",
    "The Share extension never uses it.",
    "Deletion takes effect immediately.",
    "the deletion cancels it with Stripe at the same time",
    "CyberNet also asks Apple to revoke the app’s access",
    "safeguards at least equal to those described in this Policy",
    "AI analysis permission (iPhone app)"
  ],
  refunds: [
    "Deleting your account cancels your subscription immediately.",
    "The CyberNet AI iPhone app has no purchases"
  ]
};
const GONE = [
  "Cancel billing first",
  "Before deleting an account, cancel any active subscription",
  "Deleting your CyberNet account does not by itself cancel",
  "CyberNet may prevent account deletion",
  "Subscription cancellation is separate from account deletion",
  "Data Not Used to Track"
];
for (const [key, [page, embedded]] of Object.entries(docs)) {
  for (const phrase of MUST[key] || []) {
    const p = norm(phrase);
    check(`${key}: page says "${phrase.slice(0, 50)}"`, flat(page).includes(p));
    check(`${key}: Legal Center copy says "${phrase.slice(0, 50)}"`, flat(embedded).includes(p));
  }
  for (const phrase of GONE) {
    check(`${key}: old wording gone: "${phrase}"`, !flat(page).includes(phrase) && !flat(embedded).includes(phrase));
  }
}
// The website's deletion dialog says the same as the Terms.
{
  const controls = read("public/cybernet-privacy-controls.js");
  check("deletion dialog: plan cancelled immediately, no refund", /Deleting your account cancels the plan immediately\. Paid access ends now and there is no refund/.test(controls));
  check("deletion dialog: no 'Cancel your plan first' refusal left", !/Cancel your plan first|SUBSCRIPTION_ACTIVE/.test(controls));
}

// The App Store Support URL (public/support.html, /support): App Store metadata rules apply to it
// (guideline 3.1.1), so no prices, plans, upgrade or purchase words, no site navigation, and links
// only to the Privacy Policy, the Terms and the support email.
{
  const page = read("public/support.html");
  const text = page.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const word of ["pricing", "upgrade", "subscription", "checkout", "per month", "per year", "free trial", "Pro plan", "Business plan", "$", "Google"]) {
    check(`support page: no "${word}"`, !text.toLowerCase().includes(word.toLowerCase()));
  }
  check("support page: no whole word Pro", !/\bPro\b/.test(text));
  const hrefs = [...page.matchAll(/href="([^"]*)"/g)].map(m => m[1]).filter(h => !/^\/(?:cybernetshield\.png|app\/app-pages\.css|support\.css)\?v=/.test(h) && h !== "https://cybernetai.app/support");
  check("support page: links only to Privacy, Terms and support email", hrefs.length > 0 && hrefs.every(h => ["/privacy.html", "/terms.html", "mailto:support@cybernetai.app"].includes(h)), hrefs.join(", "));
  check("support page: no navigation element", !/<nav\b/i.test(page));
  check("support page: names the operator", text.includes("operated by Marks Events FZ LLE"));
  check("support page: explains account deletion in the app and on the web", /Delete your account/.test(text) && /In the iPhone app:/.test(text) && /On the website:/.test(text));
  check("support page: deletion sentence names no plan", text.includes("If this account has a paid plan from our website, deleting the account cancels it immediately."));
  const toml = read("netlify.toml");
  check("netlify.toml: /support serves support.html", /from = "\/support"\s+to = "\/support\.html"\s+status = 200/.test(toml));
  const supportJs = read("public/support.js");
  check("support.js: posts to /api/feedback", supportJs.includes('"/api/feedback"') && !/=>|\b(?:let|const)\b|`/.test(supportJs));
}

console.log(`legal copy: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
