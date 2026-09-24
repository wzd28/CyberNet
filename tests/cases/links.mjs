// Link-only cases (type "link"). They probe the link rules in
// public/cybernet-engine.js (analyzeLinkRules) and the server layer
// (analyzeLinkServer): look-alike domains, brand names in subdomains, lure
// words, shorteners, raw IPs, punycode, http login pages, authority names on
// commercial domains, payment/penalty paths, redirects and downloads, plus
// legitimate links that must NOT be flagged. All sample data is made up.
//
// Labels: "scam" = page shows SCAM (score 32+), "safe" = NOT A SCAM on a
// vouched-for domain, "unverified" = bare link on an unknown domain.
export const CASES = [
  // ── Brand look-alikes and brand names in the wrong place ──
  { id: "google-brand-in-subdomain", type: "link", expect: "scam", input: "https://accounts.google.com.session-check.net/signin", note: "The real-looking accounts.google.com is only a subdomain of session-check.net" },
  { id: "enbd-hyphen-lure", type: "link", expect: "scam", input: "https://secure-emiratesnbd-verify.com/otp", note: "Bank name wrapped in secure-/-verify on a domain the bank does not own" },
  { id: "enbd-no-scheme-lure", type: "link", expect: "scam", input: "emiratesnbd-online.verify-account.co/login", note: "Written without https:// as it arrives in SMS" },
  { id: "microsoft-zero-for-o", type: "link", expect: "scam", input: "https://micr0soft-365-login.com/", note: "0 for o in the brand name plus a -login lure domain" },
  { id: "apple-one-for-l", type: "link", expect: "scam", input: "https://app1e-id-support.com/unlock", note: "1 for l in apple, -support lure, unlock path" },
  { id: "microsoft-rn-for-m", type: "link", expect: "scam", input: "https://rnicrosoft.com/login", note: "rn reads as m at a glance; classic typosquat two edits away" },
  { id: "arabic-script-host", type: "link", expect: "scam", input: "https://الامارات-الوطني.com/login", note: "Arabic-script host name (becomes punycode) with a login path" },
  { id: "userinfo-at-trick", type: "link", expect: "scam", input: "https://www.adcb.com@customer-verify-portal.net/", note: "Everything before @ is ignored by the browser; real host is customer-verify-portal.net" },

  // ── Lure-only domains, shorteners, raw IPs, http login ──
  { id: "lure-only-https", type: "link", expect: "scam", input: "https://secure-account-verify.net/session", note: "No brand, but nobody legitimate registers secure-account-verify.net" },
  { id: "shortener-t-ly", type: "link", expect: "scam", input: "https://t.ly/9xQ2", note: "t.ly is a widely used shortener; hidden destination" },
  { id: "ip-no-scheme-verify", type: "link", expect: "scam", input: "192.0.2.45/verify", note: "Raw IP pasted without a scheme" },
  { id: "ip-port-apk", type: "link", expect: "scam", input: "http://203.0.113.9:8080/update.apk", note: "Raw IP, odd port, Android installer" },
  { id: "http-login-page", type: "link", expect: "scam", input: "http://mail-access-portal.com/login.php", note: "Unencrypted login form on an unknown domain" },

  // ── Authority names on commercial domains, fine-and-fee shapes ──
  { id: "dubaipolice-fines-com", type: "link", expect: "scam", input: "https://dubaipolice-fines.com/pay", note: "Police name glued to fines on a .com" },
  { id: "moi-traffic-ae", type: "link", expect: "scam", input: "https://moi-traffic-services.ae/fine/12345", note: ".ae is not .gov.ae; ministry-of-interior-style name plus a fine path" },
  { id: "ministry-top-tld", type: "link", expect: "scam", input: "https://ministry-of-interior.top/visa-status" },
  { id: "gov-name-in-subdomain", type: "link", expect: "scam", input: "https://police.gov.cy.notice-portal.com/view", note: "Real police.gov.cy is only a subdomain of notice-portal.com" },
  { id: "parcel-in-domain-fee-path", type: "link", expect: "scam", input: "https://your-parcel-is-waiting.com/fee", note: "Delivery lure in the domain, fee in the path" },

  // ── Redirects and downloads ──
  { id: "redirect-encoded-dest", type: "link", expect: "scam", input: "https://tracker-mail.com/r?dest=https%3A%2F%2Fadcb-secure.info", note: "Encoded nested destination on a bank look-alike" },
  { id: "exe-download", type: "link", expect: "scam", input: "https://drive-share-files.com/invoice_2026.exe" },
  { id: "dmg-download", type: "link", expect: "scam", input: "https://mac-updates-portal.com/Flash_Player.dmg", note: "Mac installer from an updates lure domain" },

  // ── Official domains that must stay NOT A SCAM ──
  { id: "google-signin-official", type: "link", expect: "safe", input: "https://accounts.google.com/signin/v2/identifier" },
  { id: "google-signin-continue-param", type: "link", expect: "safe", input: "https://accounts.google.com/signin/v2/identifier?continue=https://mail.google.com/mail/", note: "Every real Google sign-in link carries continue=; must not read as a redirect trick" },
  { id: "apple-id-manage", type: "link", expect: "safe", input: "https://id.apple.com/account/manage" },
  { id: "uaepass-bare-no-scheme", type: "link", expect: "safe", input: "uaepass.ae" },
  { id: "absher-no-scheme", type: "link", expect: "safe", input: "www.absher.sa/portal/individuals.html" },
  { id: "enbd-otp-help-page", type: "link", expect: "safe", input: "https://www.emiratesnbd.com/en/help-and-support/security-centre/otp-safety", note: "OTP wording on the bank's own domain is normal" },
  { id: "microsoftonline-real-login", type: "link", expect: "safe", input: "https://login.microsoftonline.com/common/oauth2/authorize", note: "Microsoft's real sign-in domain for work accounts" },
  { id: "outlook-office-real", type: "link", expect: "safe", input: "https://outlook.office.com/mail/inbox", note: "Microsoft's real webmail domain" },

  // ── Real government domains ──
  { id: "gov-uk-tax-service", type: "link", expect: "safe", input: "https://www.tax.service.gov.uk/personal-account", note: "HMRC's real self-service site" },
  { id: "police-uk-met", type: "link", expect: "safe", input: "https://www.met.police.uk/ro/report/", note: "Real UK police reporting page" },
  { id: "gouv-fr-impots", type: "link", expect: "safe", input: "https://www.impots.gouv.fr/particulier", note: "French tax office" },
  { id: "gov-cy-police", type: "link", expect: "safe", input: "https://www.police.gov.cy/en/news", note: "Real Cyprus Police site" },
  { id: "gov-sa-portal", type: "link", expect: "safe", input: "https://www.my.gov.sa/wps/portal/snp/main", note: "Saudi national portal" },

  // ── Ordinary unknown domains: COULDN'T VERIFY, never SCAM ──
  { id: "bakery-menu", type: "link", expect: "unverified", input: "https://sunrise-bakery-dubai.com/menu" },
  { id: "school-parent-portal-login", type: "link", expect: "unverified", input: "https://portal.brightfuture-school.com/parents/login", note: "A school login page is normal; nobody has vouched for the domain" },
  { id: "taxfoundation-research", type: "link", expect: "unverified", input: "https://taxfoundation.org/research/federal-tax/", note: "tax inside a longer word, tax in the path; a think tank, not a fine notice" },
  { id: "pineapple-bakery", type: "link", expect: "unverified", input: "https://pineapple-bakery.com/menu", note: "apple inside pineapple is not Apple" },
  { id: "upstream-media", type: "link", expect: "unverified", input: "https://upstream-media.co/portfolio", note: "Ordinary agency site on a .co domain" },
  { id: "traffic-analytics-tool", type: "link", expect: "unverified", input: "https://traffic-analytics-tool.io/docs", note: "Web-traffic analytics, not traffic fines" },
  { id: "immigration-lawyers", type: "link", expect: "unverified", input: "https://immigration-lawyers-dubai.com/contact", note: "A law firm's contact page; immigration is its trade, not an authority claim" },
  { id: "french-cooking-blog", type: "link", expect: "unverified", input: "https://www.blog-de-cuisine.fr/recettes/tarte-aux-pommes" },
  { id: "nursery-fees-no-scheme", type: "link", expect: "unverified", input: "www.greenvalley-nursery.ae/fees", note: "A fees page on a nursery site, pasted without https://" },
  { id: "payroll-software-reviews", type: "link", expect: "unverified", input: "https://payroll-software-reviews.com/compare", note: "pay is a prefix of payroll, not a lure word" },
];
