// Link-only cases (type "link"). They probe the link rules in
// public/cybernet-engine.js (analyzeLinkRules) and the server layer
// (analyzeLinkServer): look-alike domains, brand names in subdomains, lure
// words, shorteners, raw IPs, punycode, http login pages, authority names on
// commercial domains, payment/penalty paths, redirects and downloads, plus
// legitimate links that must NOT be flagged. All sample data is made up.
//
// Labels: "scam" = page shows SCAM (score 32+), "safe" = NOT A SCAM on a
// vouched-for domain or LOW RISK on an unknown one, "unverified" = CAN'T
// CONFIRM, kept for the borderline link only (26-31 with a deception or
// impersonation sign; CyberNetEngine.linkNeedsCaution).
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

  // ── Ordinary unknown domains: LOW RISK, never SCAM or CAN'T CONFIRM ──
  { id: "bakery-menu", type: "link", expect: "safe", input: "https://sunrise-bakery-dubai.com/menu" },
  { id: "school-parent-portal-login", type: "link", expect: "safe", input: "https://portal.brightfuture-school.com/parents/login", note: "A school login page is normal; nobody has vouched for the domain" },
  { id: "taxfoundation-research", type: "link", expect: "safe", input: "https://taxfoundation.org/research/federal-tax/", note: "tax inside a longer word, tax in the path; a think tank, not a fine notice" },
  { id: "pineapple-bakery", type: "link", expect: "safe", input: "https://pineapple-bakery.com/menu", note: "apple inside pineapple is not Apple" },
  { id: "upstream-media", type: "link", expect: "safe", input: "https://upstream-media.co/portfolio", note: "Ordinary agency site on a .co domain" },
  { id: "traffic-analytics-tool", type: "link", expect: "safe", input: "https://traffic-analytics-tool.io/docs", note: "Web-traffic analytics, not traffic fines" },
  { id: "immigration-lawyers", type: "link", expect: "safe", input: "https://immigration-lawyers-dubai.com/contact", note: "A law firm's contact page; immigration is its trade, not an authority claim" },
  { id: "french-cooking-blog", type: "link", expect: "safe", input: "https://www.blog-de-cuisine.fr/recettes/tarte-aux-pommes" },
  { id: "nursery-fees-no-scheme", type: "link", expect: "safe", input: "www.greenvalley-nursery.ae/fees", note: "A fees page on a nursery site, pasted without https://" },
  { id: "payroll-software-reviews", type: "link", expect: "safe", input: "https://payroll-software-reviews.com/compare", note: "pay is a prefix of payroll, not a lure word" },

  // ── When CAN'T CONFIRM shows: only the genuinely borderline link ──
  { id: "plain-unknown-https-shop", type: "link", expect: "safe", input: "https://oakandhoney-candles.com/shop/autumn", note: "Ordinary shop on an unknown domain: LOW RISK" },
  { id: "unknown-http-no-lure", type: "link", expect: "safe", input: "http://cornerbakery-jlt.ae/menu", note: "No HTTPS is a note, not a deception sign: LOW RISK" },
  { id: "unknown-http-no-scheme-structure", type: "link", expect: "safe", input: "http://kids-art-club-sharjah.org/timetable", note: "http plus a few dashes, nothing deceptive" },
  { id: "borderline-lure-domain-no-scheme", type: "link", expect: "unverified", input: "myaccount-verify.net/home", note: "Two lure words in the domain, just under 32: CAN'T CONFIRM" },
  { id: "borderline-lure-domain-https", type: "link", expect: "unverified", input: "https://secure-login.net/", note: "secure + login in the domain itself, score in 26-31" },
  { id: "lure-domain-at-scam-line", type: "link", expect: "scam", input: "https://secure-login-verify.com/", note: "Three lure words reach 32: SCAM" },
  { id: "official-brand-root", type: "link", expect: "safe", input: "https://www.emiratesnbd.com/en", note: "Vouched brand domain: NOT A SCAM" },
  { id: "uae-portal-unlisted", type: "link", expect: "safe", input: "https://u.ae/en/information-and-services", note: "u.ae is not in the registry list, so it reads LOW RISK, not CAN'T CONFIRM" },
  { id: "government-gov-domain", type: "link", expect: "safe", input: "https://www.moe.gov.ae/en/pages/home.aspx", note: "Ministry on gov.ae: NOT A SCAM" },

  // ── Free hosting / site-builder pages dressed up as a brand or a bill ──
  { id: "free-host-du-billing", type: "link", expect: "scam", input: "https://du-ae.netlify.app/billing", note: "Telecom name plus country code on a free Netlify subdomain, billing path" },
  { id: "free-host-google-sites-du", type: "link", expect: "scam", input: "https://sites.google.com/view/du-billing", note: "Google Sites page named after a telecom bill" },
  { id: "free-host-rta-fines", type: "link", expect: "scam", input: "https://rta-fines.web.app", note: "Transport authority plus fines on Firebase hosting" },
  { id: "free-host-dhl-path", type: "link", expect: "scam", input: "https://abc123.firebaseapp.com/dhl/pay", note: "Courier name and pay in the path of a free Firebase site" },

  // ── Gulf service / payment-network names next to a payment or reward word ──
  { id: "darb-toll-pay", type: "link", expect: "scam", input: "http://darb-toll-pay.com", note: "Abu Dhabi toll system name plus toll and pay" },
  { id: "darb-toll-pay-https", type: "link", expect: "scam", input: "https://darb-toll-pay.com", note: "Same with HTTPS: the domain alone is the lure" },
  { id: "parking-pay-dubai", type: "link", expect: "scam", input: "http://parking-pay-dubai.com" },
  { id: "itc-mawaqif-pay", type: "link", expect: "scam", input: "http://itc-mawaqif-pay.com", note: "Abu Dhabi parking (Mawaqif / ITC) plus pay" },
  { id: "nol-rta-bonus", type: "link", expect: "scam", input: "http://nol-rta-bonus.com", note: "nol card and RTA plus a bonus" },
  { id: "knet-payment-kw", type: "link", expect: "scam", input: "https://knet-payment-kw.com", note: "Kuwait's KNET payment network on a commercial domain" },
  { id: "mof-sa-pay", type: "link", expect: "scam", input: "https://mof-sa-pay.com", note: "Saudi Ministry of Finance initials plus pay" },
  { id: "smart-dubai-pay", type: "link", expect: "scam", input: "https://smart-dubai-pay.com", note: "Smart Dubai spelled across two tokens plus pay" },

  // ── Known brand plus a lure word on a domain the brand does not own ──
  { id: "carrefour-gift", type: "link", expect: "scam", input: "https://carrefour-uae-gift.com" },
  { id: "meta-business-support", type: "link", expect: "scam", input: "https://meta-business-support.com", note: "Classic Facebook page-ban phishing domain" },
  { id: "parcel-tracking-ae", type: "link", expect: "scam", input: "https://parcel-tracking-ae.com", note: "Parcel plus tracking plus country code" },

  // ── Guards: the real sites and ordinary look-alikes stay NOT A SCAM / LOW RISK ──
  { id: "carrefour-official", type: "link", expect: "safe", input: "https://www.carrefouruae.com/" },
  { id: "meta-official", type: "link", expect: "safe", input: "https://www.meta.com/" },
  { id: "rta-official", type: "link", expect: "safe", input: "https://www.rta.ae/wps/portal/rta/ae/home" },
  { id: "parkin-official", type: "link", expect: "safe", input: "https://www.parkin.ae/" },
  { id: "dubizzle-official", type: "link", expect: "safe", input: "https://www.dubizzle.com/" },
  { id: "emirates-skywards-official", type: "link", expect: "safe", input: "https://www.emirates.com/ae/english/skywards/" },
  { id: "etihad-official", type: "link", expect: "safe", input: "https://www.etihad.com/en-ae/" },
  { id: "knet-official", type: "link", expect: "safe", input: "https://www.knet.com.kw/" },
  { id: "mof-sa-official", type: "link", expect: "safe", input: "https://www.mof.gov.sa/" },
  { id: "dubai-portal-official", type: "link", expect: "safe", input: "https://www.dubai.ae/" },
  { id: "fab-official", type: "link", expect: "safe", input: "https://www.bankfab.com/en-ae/personal" },
  { id: "github-io-portfolio", type: "link", expect: "safe", input: "https://jane-doe.github.io/portfolio", note: "Personal site on a free host, no brand or lure words" },
  { id: "netlify-recipes", type: "link", expect: "safe", input: "https://my-recipes.netlify.app" },
  { id: "vercel-weather-app", type: "link", expect: "safe", input: "https://weather-dashboard.vercel.app/" },
  { id: "wixsite-bakery", type: "link", expect: "safe", input: "https://acme.wixsite.com/bakery" },
  { id: "blogspot-bills-post", type: "link", expect: "safe", input: "https://my-blog.blogspot.com/2026/10/paying-bills.html", note: "A blog post about bills: the lure word is part of a longer word in the path" },
  { id: "paypoint-cafe-menu", type: "link", expect: "safe", input: "https://paypoint-cafe.com/menu", note: "pay inside a longer business name" },
  { id: "parking-garage-company", type: "link", expect: "safe", input: "https://www.skyline-parking.com/locations", note: "A parking company with no payment or reward word" },
  { id: "gift-shop-flowers", type: "link", expect: "safe", input: "https://thegiftbox-dubai.com/flowers" },
  { id: "news-tax-bill-article", type: "link", expect: "safe", input: "https://www.thenationalnews.com/business/2026/10/04/uae-corporate-tax-bill", note: "News article path with tax and bill" },
  { id: "emirates-hospital", type: "link", expect: "safe", input: "https://emirates-hospital.ae/", note: "Emirates as an ordinary business prefix, no lure word" },
  // ── Free-host look-alikes the first pass missed ──
  { id: "free-host-du-quickpay-workers", type: "link", expect: "scam", input: "https://du-quickpay.acc123.workers.dev/", note: "Telecom name plus a glued pay word on a Cloudflare Workers subdomain" },
  { id: "free-host-dhl-track", type: "link", expect: "scam", input: "https://dhl-express.pages.dev/track", note: "Courier name on Cloudflare Pages with a tracking path" },
  { id: "free-host-carrefour-gift-card", type: "link", expect: "scam", input: "https://carrefour.netlify.app/gift-card" },
  { id: "free-host-eand-bill", type: "link", expect: "scam", input: "https://eand-ae.web.app/bill", note: "e& (eand) plus country code and bill" },
  { id: "free-host-lulu-gift", type: "link", expect: "scam", input: "https://lulu-hypermarket-gift.web.app/" },
  { id: "free-host-etisalat-ae", type: "link", expect: "scam", input: "https://etisalat-ae.netlify.app/", note: "Brand plus country code is the whole site name" },
  { id: "free-host-naqel-ksa", type: "link", expect: "scam", input: "https://naqel-express-ksa.web.app/" },
  { id: "free-host-spl-redelivery", type: "link", expect: "scam", input: "https://spl-saudi-post.web.app/redelivery" },
  { id: "free-host-skywards-miles", type: "link", expect: "scam", input: "https://emirates-skywards.web.app/miles" },
  { id: "free-host-weeblysite-du", type: "link", expect: "scam", input: "https://du-ae.weeblysite.com/pay" },
  { id: "free-host-gitlab-du", type: "link", expect: "scam", input: "https://du-ae.gitlab.io/billing" },
  { id: "free-host-wordpress-glued-code", type: "link", expect: "scam", input: "https://duae-billing.wordpress.com/", note: "du glued to ae" },
  { id: "free-host-gcs-bucket", type: "link", expect: "scam", input: "https://storage.googleapis.com/du-ae/billing.html", note: "Storage bucket: the site name is the path" },
  { id: "free-host-r2-bucket", type: "link", expect: "scam", input: "https://pub-1a2b3c.r2.dev/rta-fines.html" },
  { id: "free-host-appspot-rta", type: "link", expect: "scam", input: "https://rta-uae.appspot.com/fines" },
  { id: "free-host-two-lures", type: "link", expect: "scam", input: "https://refund-claim.netlify.app/", note: "Two different payment words with no brand" },

  // ── Gulf services, payment networks and brands the first pass missed ──
  { id: "adnoc-anniversary-gift", type: "link", expect: "scam", input: "https://adnoc-anniversary-gift.com/" },
  { id: "dubai-duty-free-giveaway", type: "link", expect: "scam", input: "https://dubaidutyfree-giveaway.com/" },
  { id: "emirates-airline-giveaway", type: "link", expect: "scam", input: "https://emirates-airline-giveaway.com/" },
  { id: "skywards-miles-expire", type: "link", expect: "scam", input: "https://skywards-miles-expire.com/" },
  { id: "meta-appeal-center", type: "link", expect: "scam", input: "https://meta-appeal-center.com/" },
  { id: "metabusiness-help", type: "link", expect: "scam", input: "https://metabusiness-help.com/", note: "Meta glued to business, plus help" },
  { id: "knet-gateway-kw", type: "link", expect: "scam", input: "https://knet-gateway-kw.com/", note: "Payment network plus country code, no pay word" },
  { id: "rta-dubai-ae", type: "link", expect: "scam", input: "https://rta-dubai-ae.com/" },
  { id: "du-ae-com", type: "link", expect: "scam", input: "https://du-ae.com/" },
  { id: "itc-abudhabi-parking", type: "link", expect: "scam", input: "https://itc-abudhabi-parking.com/" },
  { id: "tamm-services-ae", type: "link", expect: "scam", input: "https://tamm-services-ae.com/" },
  { id: "icp-visa-status", type: "link", expect: "scam", input: "https://icp-visa-status.com/", note: "Government-only service plus visa" },
  { id: "mada-pay-sa", type: "link", expect: "scam", input: "https://mada-pay-sa.com/" },
  { id: "benefitpay-bh", type: "link", expect: "scam", input: "https://benefitpay-bh.com/" },
  { id: "saher-fines-sa", type: "link", expect: "scam", input: "https://saher-fines-sa.com/" },
  { id: "mawaqef-pay", type: "link", expect: "scam", input: "https://mawaqef-pay.com/", note: "Common transliteration of Mawaqif" },
  { id: "nolcard-topup", type: "link", expect: "scam", input: "https://nolcard-topup.com/" },
  { id: "rta-mukhalafat", type: "link", expect: "scam", input: "https://rta-mukhalafat.com/", note: "Arabic for traffic violations" },
  { id: "ejari-renewal-pay", type: "link", expect: "scam", input: "https://ejari-renewal-pay.com/" },
  { id: "qiwa-sa-fee", type: "link", expect: "scam", input: "https://qiwa-sa-fee.com/" },
  { id: "metrash-qatar-fine", type: "link", expect: "scam", input: "https://metrash-qatar-fine.com/" },
  { id: "stc-pay-refund", type: "link", expect: "scam", input: "https://stc-pay-refund.com/" },

  // ── Guards: real sites, free-host projects, articles and ordinary words ──
  { id: "knetpay-official-gateway", type: "link", expect: "safe", input: "https://www.knetpay.com.kw/CGW302/hppaction", note: "KNET's own payment gateway host" },
  { id: "kpay-official-gateway", type: "link", expect: "safe", input: "https://www.kpay.com.kw/kpg/PaymentHTTP.htm" },
  { id: "tamm-pay-government-gtld", type: "link", expect: "safe", input: "https://pay.tamm.abudhabi/", note: ".abudhabi is restricted to the Abu Dhabi government" },
  { id: "adnoc-official", type: "link", expect: "safe", input: "https://www.adnoc.ae/en/" },
  { id: "stc-pay-official", type: "link", expect: "safe", input: "https://stcpay.com.sa/en/send-money" },
  { id: "parking-com-real", type: "link", expect: "safe", input: "https://www.parking.com/pay", note: "SP+ Parking; one letter from Parkin is not a typo trick" },
  { id: "skyward-com-real", type: "link", expect: "safe", input: "https://www.skyward.com/", note: "Skyward school software, not Emirates Skywards" },
  { id: "larkin-surname", type: "link", expect: "safe", input: "https://www.larkin.com/" },
  { id: "parkingpay-uk", type: "link", expect: "safe", input: "https://www.parkingpay.co.uk/", note: "parking is an ordinary word outside a Gulf city name" },
  { id: "sewa-ngo", type: "link", expect: "safe", input: "https://www.sewa.org/", note: "SEWA India NGO, no lure word" },
  { id: "emirates-accounting-firm", type: "link", expect: "safe", input: "https://emirates-accounting.com/", note: "accounting is not the lure word account" },
  { id: "emirates-promotions-agency", type: "link", expect: "safe", input: "https://emirates-promotions.com/" },
  { id: "parkin-accountants-uk", type: "link", expect: "safe", input: "https://parkin-accountants.co.uk/", note: "Parkin is a surname" },
  { id: "emirates-gift-shop", type: "link", expect: "unverified", input: "https://emirates-gift-shop.com/", note: "Emirates is an ordinary UAE company prefix: gift keeps it at CAN'T CONFIRM, never SCAM" },
  { id: "rta-claims-uk", type: "link", expect: "unverified", input: "https://rta-claims.co.uk/", note: "UK road traffic accident claims: never SCAM (claims keeps CAN'T CONFIRM)" },
  { id: "fab-gift-shop", type: "link", expect: "unverified", input: "https://fab-gift-shop.ae/", note: "fab = fabulous: never SCAM (gift keeps CAN'T CONFIRM)" },
  { id: "github-org-facebook", type: "link", expect: "safe", input: "https://facebook.github.io/react-native/", note: "A brand's own GitHub organization page" },
  { id: "github-org-google", type: "link", expect: "safe", input: "https://google.github.io/styleguide/" },
  { id: "github-oss-google-signin", type: "link", expect: "safe", input: "https://react-native-google-signin.github.io/docs/install", note: "Open-source library docs" },
  { id: "github-io-bill-name", type: "link", expect: "safe", input: "https://bill-chen.github.io/", note: "A person named Bill" },
  { id: "netlify-split-the-bill", type: "link", expect: "safe", input: "https://split-the-bill.netlify.app/" },
  { id: "vercel-invoice-generator", type: "link", expect: "safe", input: "https://simple-invoice-generator.vercel.app/" },
  { id: "vercel-otp-input-library", type: "link", expect: "safe", input: "https://otp-input-react.vercel.app/" },
  { id: "wixsite-fine-dining", type: "link", expect: "safe", input: "https://chezmarie.wixsite.com/fine-dining" },
  { id: "wixsite-customs-garage", type: "link", expect: "safe", input: "https://jdm-customs.wixsite.com/garage" },
  { id: "blogspot-pay-it-forward", type: "link", expect: "safe", input: "https://pay-it-forward-dubai.blogspot.com/" },
  { id: "blogspot-how-to-pay-du-bill", type: "link", expect: "safe", input: "https://expat-mum-dubai.blogspot.com/2024/05/how-to-pay-du-bill-online.html", note: "A how-to blog post about paying a bill" },
  { id: "github-io-apple-pay-post", type: "link", expect: "safe", input: "https://jdoe.github.io/blog/2023/08/integrating-apple-pay-in-ios/" },
  { id: "github-io-verify-meta-post", type: "link", expect: "safe", input: "https://jane.github.io/posts/how-to-verify-your-meta-account/" },
  { id: "github-io-parking-zones-map", type: "link", expect: "safe", input: "https://dubai-parking-zones.github.io/", note: "A city and a service name with no lure word" },
  { id: "github-io-rta-bus-routes", type: "link", expect: "safe", input: "https://rta-bus-routes-dubai.github.io/" },
  { id: "vercel-salik-calculator", type: "link", expect: "safe", input: "https://salik-calculator-uae.vercel.app/" },
  { id: "netlify-fab-lab", type: "link", expect: "safe", input: "https://fab-lab-uae.netlify.app/" },
  { id: "netlify-parking-fees-calculator", type: "link", expect: "safe", input: "https://parking-fees-calculator.netlify.app/" },
  { id: "vercel-spotify-stats", type: "link", expect: "safe", input: "https://spotify-stats.vercel.app/", note: "Developer project named after an API, no lure" },
  { id: "news-apple-results", type: "link", expect: "safe", input: "https://www.bbc.com/news/apple-results", note: "A brand in a news article path" },
  { id: "news-salik-fake-links", type: "link", expect: "safe", input: "https://www.khaleejtimes.com/uae/beware-of-fake-salik-and-rta-fine-payment-links" },
  { id: "news-darb-toll-scam", type: "link", expect: "safe", input: "https://www.thenationalnews.com/uae/2024/03/12/darb-toll-scam-texts-warning/" },
  { id: "news-absher-scam-warning", type: "link", expect: "safe", input: "https://www.arabnews.com/node/2400000/saudi-arabia/absher-scam-warning" },
];
