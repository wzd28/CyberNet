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

// The other three documents in the Legal Center keep their own version line.
for (const key of ["terms", "refunds", "acceptable"]) {
  check(`${key} still has its version line`, /Legal Center · Version 2026-09-04/.test(legal[key]));
}

console.log(`legal copy: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
