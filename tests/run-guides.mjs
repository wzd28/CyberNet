// Growth pages (24 Nov 2026): the scam guide pages, the Smart App Banner, the iPhone app links and the
// warn-a-friend share. Static checks only (no browser).
//
//   node tests/run-guides.mjs
//
// 1. Every page in public/sitemap.xml exists, and each pretty URL has its netlify.toml rewrite (with and
//    without the trailing slash) to the file whose canonical is that same URL.
// 2. Guide pages: unique title and description, one H1, the Smart App Banner, valid JSON-LD, a FAQPage
//    that says word for word what the visible FAQ says, a ?try=1 call to action, App Store links with the
//    right id and a ct= campaign tag, the EU note next to the app link, no images from other hosts (CSP).
// 3. Home: the banner, the new title in both index.html and PAGE_META.home, the MobileApplication schema.
// 4. script.js: the app link and the share stay inside a web-only region (the iPhone app never shows an
//    App Store link), the share never sends what was checked, and the EU time-zone test behaves.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(root, rel), "utf8");
let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}${detail ? `\n  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const decode = s => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const APP_ID = "6828596086";
const GUIDES = ["scam-text-checker", "parcel-delivery-scam-text", "toll-fine-scam-text", "qr-code-scam", "is-this-link-safe", "black-friday-scam-checklist"];

/* ---------- 1. sitemap, redirects, canonicals ---------- */
const toml = read("netlify.toml");
const rules = [...toml.matchAll(/\[\[redirects\]\]\s*\n\s*from = "([^"]+)"\s*\n\s*to = "([^"]+)"\s*\n\s*status = (\d+)/g)].map(m => ({ from: m[1], to: m[2], status: Number(m[3]) }));
const sitemap = read("public/sitemap.xml");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
check("sitemap: lists the home page first", locs[0] === "https://cybernetai.app/");
check("sitemap: no duplicates", new Set(locs).size === locs.length);
for (const g of [...GUIDES, "support"]) check(`sitemap: lists /${g}`, locs.includes(`https://cybernetai.app/${g}`));
for (const loc of locs) {
  const p = new URL(loc).pathname;
  let file;
  if (p === "/") file = "public/index.html";
  else if (p.endsWith(".html")) file = `public${p}`;
  else {
    const rule = rules.find(r => r.from === p);
    const slash = rules.find(r => r.from === `${p}/`);
    check(`redirect: ${p} rewrites (200) to a file`, rule && rule.status === 200, rule);
    check(`redirect: ${p}/ rewrites to the same file`, slash && rule && slash.to === rule.to && slash.status === 200);
    file = rule ? `public${rule.to}` : "";
  }
  check(`sitemap: ${loc} has a file (${file})`, file && existsSync(path.join(root, file)));
  if (!file || !existsSync(path.join(root, file)) || p.endsWith(".html")) continue;
  const canon = (/<link rel="canonical" href="([^"]+)"/.exec(read(file)) || [])[1];
  check(`canonical: ${file} is ${loc}`, canon === loc, canon);
}
check("robots.txt points at the sitemap", /Sitemap: https:\/\/cybernetai\.app\/sitemap\.xml/.test(read("public/robots.txt")));

/* ---------- 2. guide pages ---------- */
const titles = new Map(), descriptions = new Map();
function headOf(html) { return html.slice(0, html.indexOf("</head>")); }
for (const g of GUIDES) {
  const file = `public/${g}.html`;
  if (!existsSync(path.join(root, file))) { check(`guide: ${file} exists`, false); continue; }
  const html = read(file), head = headOf(html);
  const title = decode((/<title>([^<]+)<\/title>/.exec(head) || [])[1] || "");
  const desc = (/<meta name="description" content="([^"]+)"/.exec(head) || [])[1] || "";
  check(`guide ${g}: has a title ending in "| CyberNet AI"`, /\| CyberNet AI$/.test(title), title);
  check(`guide ${g}: title at most 65 characters`, title.length <= 65, `${title.length}: ${title}`);
  check(`guide ${g}: description 70-170 characters`, desc.length >= 70 && desc.length <= 170, `${desc.length}`);
  check(`guide ${g}: title is unique`, !titles.has(title), titles.get(title)); titles.set(title, g);
  check(`guide ${g}: description is unique`, !descriptions.has(desc), descriptions.get(desc)); descriptions.set(desc, g);
  check(`guide ${g}: exactly one H1`, (html.match(/<h1[\s>]/g) || []).length === 1);
  check(`guide ${g}: Smart App Banner`, head.includes(`<meta name="apple-itunes-app" content="app-id=${APP_ID}" />`));
  check(`guide ${g}: og:image`, /<meta property="og:image" content="https:\/\/cybernetai\.app\/og-image\.jpg/.test(head));
  check(`guide ${g}: robots index,follow`, /<meta name="robots" content="index,follow/.test(head));
  check(`guide ${g}: shared guide stylesheet`, /<link rel="stylesheet" href="\/cybernet-guide\.css\?v=[\w-]+" \/>/.test(head));
  check(`guide ${g}: no inline <style> (styles live in cybernet-guide.css)`, !/<style[\s>]/.test(html));
  check(`guide ${g}: a ?try=1 call to action`, /class="cn-check-cta" href="\/\?try=1&amp;utm_source=[\w-]+/.test(html));
  const apps = [...html.matchAll(/href="(https:\/\/apps\.apple\.com\/[^"]+)"/g)].map(m => m[1]);
  check(`guide ${g}: links the iPhone app`, apps.length >= 1);
  for (const a of apps) check(`guide ${g}: App Store link ${a} has the app id and a ct= tag`, a.startsWith(`https://apps.apple.com/app/cybernet-ai/id${APP_ID}?ct=`) && /\?ct=[a-z0-9_]+$/.test(a));
  check(`guide ${g}: EU note next to the app link`, /Get the free iPhone app<\/a>[^<]*<small>Not yet on EU App Stores\./.test(html));
  check(`guide ${g}: no image from another host`, ![...html.matchAll(/<img[^>]+src="([^"]+)"/g)].some(m => /^(https?:)?\/\//.test(m[1])));
  check(`guide ${g}: Recovery link says it needs a free account`, !/href="\/recovery"/.test(html) || /href="\/recovery">[^<]+<\/a> \(free account\)/.test(html));
  check(`guide ${g}: no "unlimited", "100%" or "guaranteed" claims`, !/unlimited|100%|guarantee/i.test(decode(html.slice(html.indexOf("<body")))));

  const blocks = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  check(`guide ${g}: has JSON-LD`, blocks.length >= 1);
  let graph = [];
  for (const b of blocks) {
    try { const j = JSON.parse(b); graph.push(...(j["@graph"] || [j])); }
    catch (e) { check(`guide ${g}: JSON-LD parses`, false, e.message); }
  }
  const article = graph.find(n => n["@type"] === "Article");
  check(`guide ${g}: Article JSON-LD with dates and publisher`, article && /^\d{4}-\d{2}-\d{2}$/.test(article.datePublished) && article.publisher && article.mainEntityOfPage === `https://cybernetai.app/${g}`);
  check(`guide ${g}: no aggregateRating (no real ratings on the page)`, !JSON.stringify(graph).includes("aggregateRating"));
  const faq = graph.find(n => n["@type"] === "FAQPage");
  if (g === "black-friday-scam-checklist") continue; // a checklist, no FAQ
  check(`guide ${g}: FAQPage JSON-LD`, faq && faq.mainEntity && faq.mainEntity.length >= 3);
  const fs = html.indexOf('id="cn-faq-h"'), fe = html.indexOf("</section>", fs);
  const visible = [...html.slice(fs, fe).matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(m => [decode(m[1]), decode(m[2])]);
  check(`guide ${g}: visible FAQ has as many questions as the JSON-LD`, faq && visible.length === faq.mainEntity.length, `${visible.length} vs ${faq && faq.mainEntity.length}`);
  if (faq) faq.mainEntity.forEach((q, i) => {
    const v = visible[i] || [];
    check(`guide ${g}: FAQ ${i + 1} question matches the page`, q.name === v[0], `${q.name} | ${v[0]}`);
    check(`guide ${g}: FAQ ${i + 1} answer matches the page`, q.acceptedAnswer && q.acceptedAnswer.text === v[1], `${q.acceptedAnswer && q.acceptedAnswer.text} | ${v[1]}`);
  });
  for (const other of GUIDES.filter(o => o !== g)) check(`guide ${g}: links to /${other}`, html.includes(`href="/${other}"`));
}

/* ---------- 3. home page ---------- */
{
  const html = read("public/index.html"), head = headOf(html), js = read("public/script.js");
  const title = decode((/<title>([^<]+)<\/title>/.exec(head) || [])[1] || "");
  check("home: Smart App Banner", head.includes(`<meta name="apple-itunes-app" content="app-id=${APP_ID}" />`));
  check("home: title names the scam checker", /scam checker/i.test(title) && !/AI-Powered Cybersecurity/.test(head), title);
  check("home: title is not used by a guide page", !titles.has(title));
  const metaTitle = (/home:\{\s*title:"([^"]+)"/.exec(js) || [])[1];
  check("home: PAGE_META.home title equals the <title> (the script sets it after load)", metaTitle === title, `${metaTitle} | ${title}`);
  const ld = JSON.parse((/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head) || [])[1]);
  const app = ld["@graph"].find(n => n["@type"] === "MobileApplication");
  check("home: MobileApplication JSON-LD with the App Store URL", app && app.operatingSystem === "iOS" && app.url === `https://apps.apple.com/app/cybernet-ai/id${APP_ID}` && app.offers && app.offers.price === "0");
  const org = ld["@graph"].find(n => n["@type"] === "Organization");
  check("home: Organization has logo and sameAs", org && org.logo && Array.isArray(org.sameAs) && org.sameAs.length >= 3);
  check("home: no aggregateRating", !JSON.stringify(ld).includes("aggregateRating"));
  const footer = (/<footer data-web-only>[\s\S]*?<\/footer>/.exec(html) || [""])[0];
  check("home: the web-only footer links every guide", GUIDES.every(g => footer.includes(`href="/${g}"`)));
  const bodyApps = [...html.slice(html.indexOf("<body")).matchAll(/https:\/\/apps\.apple\.com\/[^"]+/g)].map(m => m[0]);
  check("home: App Store links in the page body are only in the web-only footer", bodyApps.length > 0 && bodyApps.every(u => footer.includes(u)));
  const manifest = JSON.parse(read("public/site.webmanifest"));
  check("manifest: related_applications points at the App Store app", (manifest.related_applications || []).some(a => a.platform === "itunes" && a.url.includes(APP_ID)));
  check("support: Smart App Banner", read("public/support.html").includes(`<meta name="apple-itunes-app" content="app-id=${APP_ID}" />`));
  const llms = read("public/llms.txt");
  for (const m of llms.matchAll(/\]\((https:\/\/cybernetai\.app\/[^)]+)\)/g)) check(`llms.txt: ${m[1]} is in the sitemap`, locs.includes(m[1]));
}

/* ---------- 4. script.js ---------- */
{
  const js = read("public/script.js");
  // web regions: every /*@web*/ ... /*@end-web*/ span
  const spans = [];
  for (let i = js.indexOf("/*@web*/"); i >= 0; i = js.indexOf("/*@web*/", i + 1)) spans.push([i, js.indexOf("/*@end-web*/", i)]);
  const inWeb = idx => idx >= 0 && spans.some(([a, b]) => idx > a && idx < b);
  for (const needle of ["apps.apple.com", "function appLinkHtml", "function shareWarning", "navigator.share(", "data-cn-app"]) {
    let i = js.indexOf(needle), all = i >= 0;
    for (; i >= 0; i = js.indexOf(needle, i + 1)) if (!inWeb(i)) all = false;
    check(`script.js: every "${needle}" is inside a /*@web*/ region`, all);
  }
  check("script.js: the app link carries a ct= campaign tag", /\$\{APP_STORE_URL\}\?ct=\$\{ct\}/.test(js) && /APP_STORE_URL="https:\/\/apps\.apple\.com\/app\/cybernet-ai\/id6828596086"/.test(js));
  check("script.js: share sends only the fixed sentence and link", /navigator\.share\(\{title:"CyberNet AI",text:SHARE_TEXT,url:SHARE_URL\}\)/.test(js) && /clipboard\.writeText\(`\$\{SHARE_TEXT\} \$\{SHARE_URL\}`\)/.test(js));
  const fnStart = js.indexOf("function shareWarning"), fnEnd = js.indexOf("\n  }\n", fnStart);
  const body = js.slice(fnStart, fnEnd);
  check("script.js: shareWarning reads nothing from the checked content", !/result\.(text|content|links|url|input)|\.value\b/.test(body));
  check("script.js: share only under a SCAM verdict", /riskMeta\(result\)\.label!=="Scam"\)return/.test(body));
  check("script.js: SHARE_URL lands on Quick Scan with a share tag", /SHARE_URL="https:\/\/cybernetai\.app\/\?try=1&utm_source=share&utm_medium=verdict"/.test(js));
  for (const call of ["cyberTextResult", "cyberLinkResult", "cyberImageResult"]) check(`script.js: afterQuickScan(${call}) passes the result`, new RegExp(`afterQuickScan\\(${call},[^)]*,result\\)`).test(js));
  const reSrc = (/const EU_TIME_ZONES=\/(.+)\/;\n/.exec(js) || [])[1];
  check("script.js: EU time-zone pattern found", !!reSrc);
  if (reSrc) {
    const re = new RegExp(reSrc);
    for (const tz of ["Europe/Berlin", "Europe/Paris", "Asia/Nicosia", "Europe/Nicosia", "Asia/Famagusta", "Europe/Dublin", "Atlantic/Canary", "Europe/Athens"]) check(`EU zone: ${tz} hides the app link`, re.test(tz));
    for (const tz of ["Asia/Dubai", "Europe/London", "America/New_York", "Asia/Riyadh", "Europe/Zurich", "Europe/Oslo", "Europe/Istanbul", "Asia/Kolkata", ""]) check(`EU zone: ${tz || "(none)"} keeps the app link`, !re.test(tz));
  }
  const legacy = read("public/legacy/script.js");
  check("legacy/script.js is rebuilt with the app link and share", legacy.includes("Warn a friend or family member") && legacy.includes("id6828596086"));
}

console.log(`guides: ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
