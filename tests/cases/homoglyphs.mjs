// Look-alike letters (owner request, 24 Oct 2026: "google can be written with
// the Greek o instead of the English o, people can impersonate it, check the
// two strings"). A brand spelled with letters from another alphabet, in a link
// or in the message text, is SCAM. A local website or message written in its
// own alphabet (German accents, Greek, Russian, Arabic, Japanese) is not, and
// neither are the brands' real country sites (google.ae, amazon.co.uk,
// paypal.me), which older rules wrongly flagged.
// 28 Oct 2026 (owner: "I need those impersonations to be fixed"): a hunt of about
// 11,000 variants found look-alikes the first version missed. "min" is the lowest
// score the case must reach on the page and the server (75 = malicious).
const FROM = (name, addr, body = "Please review the recent activity on your account.") => `From: ${name} <${addr}>\nSubject: Your account\n\n${body}`;
export const CASES = [
  // Look-alike letters in links
  { id: "hg-google-greek-o", type: "link", expect: "scam", input: "https://gοogle.com/accounts" },
  { id: "hg-paypal-cyr-a", type: "link", expect: "scam", input: "https://pаypal.com/login" },
  { id: "hg-apple-all-cyrillic", type: "link", expect: "scam", input: "https://аррӏе.com" },
  { id: "hg-apple-punycode", type: "link", expect: "scam", input: "https://xn--80ak6aa92e.com/id" },
  { id: "hg-microsoft-cyr-o", type: "link", expect: "scam", input: "https://micrоsoft.com/login" },
  { id: "hg-amazon-cyr-a", type: "link", expect: "scam", input: "https://amаzon.com/orders" },
  { id: "hg-amazon-rn", type: "link", expect: "scam", input: "https://arnazon.com/orders" },
  { id: "hg-netflix-cyr-e", type: "link", expect: "scam", input: "https://nеtflix.com/billing" },
  { id: "hg-whatsapp-cyr-a", type: "link", expect: "scam", input: "https://whаtsapp.com/verify" },
  { id: "hg-enbd-cyr-e", type: "link", expect: "scam", input: "https://еmiratesnbd.com/verify" },
  { id: "hg-etisalat-cyr", type: "link", expect: "scam", input: "https://etіsalat.ae/pay" },
  { id: "hg-google-sub-trick", type: "link", expect: "scam", input: "https://gοogle.com.secure-check.top" },
  { id: "hg-mixed-script-host", type: "link", expect: "scam", input: "https://sеcure-bank-login.com" },
  { id: "hg-typo-paypa1", type: "link", expect: "scam", input: "https://paypa1.com" },
  { id: "hg-typo-g00gle", type: "link", expect: "scam", input: "https://g00gle-login.com" },
  { id: "hg-typo-faceb00k", type: "link", expect: "scam", input: "https://faceb00k.com" },
  { id: "scam-fake-google-sa", type: "link", expect: "scam", input: "https://google.com.sa.verify-account.top" },
  { id: "scam-fake-amazon-de", type: "link", expect: "scam", input: "https://amazon.de-refund.com" },

  // Look-alike letters in the message text
  { id: "hg-google-greek-text", type: "text", expect: "scam", input: "Gοogle security alert: confirm your account now" },
  { id: "hg-paypal-text", type: "text", expect: "scam", input: "Your PаyPal payment of $249.99 is on hold, review it today" },
  { id: "hg-apple-greek-alpha-text", type: "text", expect: "scam", input: "Your Αpple ID has been locked. Unlock it now" },
  { id: "hg-instagram-greek-o", type: "text", expect: "scam", input: "Instagram: your account will be deleted. Log in at instagrаm-support.top" },
  { id: "hg-adcb-text", type: "text", expect: "scam", input: "АDCB alert: your card is blocked, call now" },

  // Real websites in their own alphabet, and real country sites
  { id: "safe-idn-munchen", type: "link", expect: "safe", input: "https://münchen.de" },
  { id: "safe-idn-munchen-puny", type: "link", expect: "safe", input: "https://xn--mnchen-3ya.de" },
  { id: "safe-idn-greek", type: "link", expect: "safe", input: "https://ελλάδα.gr" },
  { id: "safe-idn-russian", type: "link", expect: "safe", input: "https://пример.рф" },
  { id: "safe-idn-arabic", type: "link", expect: "safe", input: "https://مصر.eg" },
  { id: "safe-idn-japanese", type: "link", expect: "safe", input: "https://例え.jp" },
  { id: "safe-idn-zurich", type: "link", expect: "safe", input: "https://zürich.ch" },
  { id: "safe-google-ae", type: "link", expect: "safe", input: "https://www.google.ae" },
  { id: "safe-google-sa", type: "link", expect: "safe", input: "https://google.com.sa" },
  { id: "safe-amazon-uk", type: "link", expect: "safe", input: "https://www.amazon.co.uk" },
  { id: "safe-paypal-me", type: "link", expect: "safe", input: "https://paypal.me/friend" },
  { id: "safe-totalpadel-www", type: "link", expect: "safe", input: "https://www.totalpadel.com" },
  { id: "safe-modern-learn", type: "link", expect: "safe", input: "https://modern-learning.com" },

  // Everyday messages in other alphabets, and accented names
  { id: "safe-text-russian", type: "text", expect: "safe", input: "Привет! Я купил новый Samsung и Apple Watch" },
  { id: "safe-text-russian-meta", type: "text", expect: "safe", input: "Ваша мета на неделю: 5 км" },
  { id: "safe-text-greek", type: "text", expect: "safe", input: "Καλημέρα, το Google Maps δεν δουλεύει σήμερα" },
  { id: "safe-text-greek-netflix", type: "text", expect: "safe", input: "Το Netflix ανέβασε τις τιμές του" },
  { id: "safe-text-accents", type: "text", expect: "safe", input: "José paid the invoice for the Zürich office, see you at the café" },
  { id: "safe-text-german", type: "text", expect: "safe", input: "Tschüss, wir sehen uns in München" },

  // ---- 28 Oct 2026 hunt ----
  // The friend's case and its variants: a look-alike Google sender or name.
  { id: "hg-friend-greek-o-sender", type: "text", expect: "scam", min: 75, input: "From: Google <no-reply@gοogle.com>\nSubject: Security alert\n\nSomeone just used your password to try to sign in to your account. Google stopped this attempt. Please review your account activity and confirm it was you." },
  { id: "hg-greek-o-sender-soft-hyphen", type: "text", expect: "scam", min: 75, input: "From: Google <no-reply@gο­ogle.com>\nSubject: Security alert\n\nSomeone just used your password to try to sign in to your account. Google stopped this attempt. Please review your account activity and confirm it was you." },
  { id: "hg-greek-o-sms-no-link", type: "text", expect: "scam", min: 75, input: "Gοogle: your account has been temporarily limited. Reply YES to restore access." },
  { id: "hg-greek-o-sms-cgj", type: "text", expect: "scam", min: 75, input: "Gο͏ogle: your account will be suspended today. Call 800 555 0199 now to keep it active." },
  { id: "hg-ascii-brand-split-cgj", type: "text", expect: "scam", min: 75, input: "Goo͏gle: your account will be suspended today. Call 800 555 0199 now to keep it active." },
  { id: "hg-greek-o-in-path", type: "link", expect: "scam", min: 75, input: "https://secure-check.example/gοogle/login" },
  // Letters the gate used to skip: dot below, IPA, small capitals, combining marks, strokes.
  { id: "hg-dot-below-link", type: "link", expect: "scam", min: 75, input: "https://gọogle.com/signin" },
  { id: "hg-dot-below-sender-name", type: "text", expect: "scam", min: 75, input: FROM("Gọogle", "alerts@mail-notify.example") },
  { id: "hg-ipa-script-g-link", type: "link", expect: "scam", min: 75, input: "https://ɡoogle.com/signin" },
  { id: "hg-ipa-alpha-adcb-link", type: "link", expect: "scam", min: 75, input: "https://ɑdcb.com/login" },
  { id: "hg-small-caps-link", type: "link", expect: "scam", min: 75, input: "https://ɢᴏᴏɢʟᴇ.com/signin" },
  { id: "hg-small-caps-sender-name", type: "text", expect: "scam", min: 75, input: FROM("ᴀᴘᴘʟᴇ", "id@mail-notify.example") },
  { id: "hg-combining-mark-link", type: "link", expect: "scam", min: 75, input: "https://go̱ogle.com/signin" },
  { id: "hg-stroke-h-dhl-link", type: "link", expect: "scam", min: 75, input: "https://dħl.com/track" },
  // Capitals read before lower-casing: Greek Nu/Eta/Upsilon, Cherokee.
  { id: "hg-greek-capital-nu-sender-name", type: "text", expect: "scam", min: 75, input: FROM("ΝETFLIX", "billing@mail-notify.example") },
  { id: "hg-greek-capital-upsilon-sender-name", type: "text", expect: "scam", min: 75, input: FROM("PAΥPAL", "service@mail-notify.example") },
  { id: "hg-cherokee-apple-link", type: "link", expect: "scam", min: 75, input: "https://ᎪᏢᏢᏞᎬ.com" },
  { id: "hg-cherokee-paypal-sender-name", type: "text", expect: "scam", min: 75, input: FROM("ᏢᎪYᏢᎪᏞ", "service@mail-notify.example") },
  // Short brands and Gulf services.
  { id: "hg-adcb-all-cyrillic-link", type: "link", expect: "scam", min: 75, input: "https://аԁсь.com/login" },
  { id: "hg-dewa-all-cyrillic-link", type: "link", expect: "scam", min: 75, input: "https://ԁеԝа.com/pay-bill" },
  { id: "hg-du-sender-name", type: "text", expect: "scam", min: 75, input: FROM("ԁu", "alerts@mail-notify.example") },
  { id: "hg-fab-sender-address", type: "text", expect: "scam", min: 75, input: FROM("FAB", "alerts@fаb.ae") },
  { id: "hg-stc-sms", type: "text", expect: "scam", min: 75, input: "SТC: Your line will be suspended today. Reply YES to keep your number active." },
  { id: "hg-tamm-sender-name", type: "text", expect: "scam", min: 75, input: FROM("Tаmm", "alerts@mail-notify.example") },
  { id: "hg-sadad-sms", type: "text", expect: "scam", min: 75, input: "Sаdad: your payment of SAR 120 failed. Reply YES to retry." },
  { id: "hg-emirates-post-two-words", type: "text", expect: "scam", min: 75, input: "Emirates Pоst: your parcel could not be delivered. Reply YES to reschedule delivery today." },
  // Brand glued to a lure word; a look-alike domain written without https://.
  { id: "hg-accent-appleid-glued-link", type: "link", expect: "scam", min: 75, input: "https://àppleid.com/" },
  { id: "hg-cyrillic-appleid-glued-link", type: "link", expect: "scam", min: 75, input: "https://аррӏеіԁ.com/" },
  { id: "hg-bare-cyrillic-domain-text", type: "text", expect: "scam", min: 75, input: "Emirates NBD: card blocked. Unblock at enbd-sеcure.com/login now." },
  { id: "hg-ideographic-dot-text", type: "text", expect: "scam", input: "PayPal: your account has been limited. Restore access now at paypal-secure-login。com/verify" },
  // Look-alike letters in plain ASCII (rn, cl, capital I, 5, doubled or swapped letters).
  { id: "hg-capital-i-apple-link", type: "link", expect: "scam", min: 75, input: "https://appIe.com/id" },
  { id: "hg-capital-i-apple-text", type: "text", expect: "scam", min: 75, input: "Your Apple ID was used to sign in on a new iPhone. Not you? appIe.com/id" },
  { id: "hg-caps-rn-microsoft-link", type: "link", expect: "scam", min: 75, input: "https://RNICROSOFT.COM" },
  { id: "hg-cl-for-d-dropbox-link", type: "link", expect: "scam", min: 75, input: "https://clropbox.com" },
  { id: "hg-rn-for-m-gmail-link", type: "link", expect: "scam", min: 75, input: "https://grnail.com" },
  { id: "hg-5-for-s-chase-link", type: "link", expect: "scam", min: 75, input: "https://cha5e.com" },
  { id: "hg-dropped-letter-google-link", type: "link", expect: "scam", min: 75, input: "https://gogle.com" },
  { id: "hg-swapped-letters-microsoft-link", type: "link", expect: "scam", min: 75, input: "https://mircosoft.com" },
  { id: "hg-rn-microsoftonline-link", type: "link", expect: "scam", min: 75, input: "https://login.rnicrosoftonline.com/common/oauth2" },
  { id: "hg-rn-sender-email", type: "text", expect: "scam", min: 75, input: "From: Microsoft <no-reply@rnicrosoft.com>\nSubject: Your password was changed\nThe password for your Microsoft account was changed. If this was you, you can safely ignore this email." },

  // Real messages and sites that must stay NOT A SCAM.
  { id: "safe-real-google-alert", type: "text", expect: "safe", input: "From: Google <no-reply@accounts.google.com>\nSubject: Security alert\n\nA new sign-in on Windows. If this was you, you don't need to do anything." },
  { id: "safe-real-google-alert-link", type: "text", expect: "safe", input: "From: Google <no-reply@accounts.google.com>\nSubject: Security alert\n\nA new sign-in on Windows. If this was you, you don't need to do anything. If not, we'll help you secure your account. Check activity at https://myaccount.google.com/notifications" },
  { id: "safe-real-paypal-alert", type: "text", expect: "safe", input: "From: PayPal <service@paypal.com>\nSubject: Security alert\nWe noticed a new login to your PayPal account from a new device. If this was you, no action is needed." },
  { id: "safe-italian-meta-half", type: "text", expect: "safe", input: "Ciao! Ti mando la metà del conto stasera, il resto domani. Grazie mille!" },
  { id: "safe-italian-meta-short", type: "text", expect: "safe", input: "Ho pagato metà." },
  { id: "safe-french-meta-analyse", type: "text", expect: "safe", input: "J'ai lu une méta-analyse sur le sommeil, je te l'envoie ce soir." },
  { id: "safe-polish-tesla-case", type: "text", expect: "safe", input: "Jadę Teslą do pracy, będę o 9." },
  { id: "safe-turkish-salik-advice", type: "text", expect: "safe", input: "Arkadaşım bu kitabı okumamı salık verdi, yarın kütüphaneden alacağım." },
  { id: "safe-french-name-zain", type: "text", expect: "safe", input: "Zaïn arrive demain." },
  { id: "safe-french-emirates", type: "text", expect: "safe", input: "Mon vol avec Émirates part demain matin." },
  { id: "safe-greek-tiktok", type: "text", expect: "safe", input: "Είδα ένα βίντεο στο τικτοκ χθες, ήταν πολύ αστείο." },
  { id: "safe-russian-du-number", type: "text", expect: "safe", input: "Мой номер у du теперь другой, запиши." },
  { id: "safe-vietnamese-example", type: "text", expect: "safe", input: "Chào bạn, ví dụ này rất hay. Hẹn gặp lại ngày mai nhé." },
  { id: "safe-family-emoji-zwj", type: "text", expect: "safe", input: "Happy birthday Sara! \u{1F468}‍\u{1F469}‍\u{1F467} We're all coming tonight \u{1F389}" },
  { id: "safe-persian-zwnj", type: "text", expect: "safe", input: "سلام، می‌خواهم فردا ساعت ۵ بیایم خانه‌تان." },
  { id: "safe-leading-bom", type: "text", expect: "safe", input: "﻿Hi team, the meeting moved to 3pm tomorrow. Thanks!" },
  { id: "safe-german-soft-hyphens", type: "text", expect: "safe", input: "Die Bundes­regierung hat heute die neuen Regeln ver­kündet." },
  { id: "safe-ipa-transcription", type: "text", expect: "safe", input: "The phonetic spelling is /ˈɡuːɡəl/ in IPA." },
  { id: "safe-idn-italian-meta", type: "link", expect: "safe", input: "https://www.metà.it" },
  { id: "safe-idn-french-zain", type: "link", expect: "safe", input: "https://zaïn.fr" },
  { id: "safe-idn-russian-meta", type: "link", expect: "safe", input: "https://мета.рф" },
  { id: "safe-idn-vietnamese-du", type: "link", expect: "safe", input: "https://dụ.vn" },
  { id: "safe-idn-vietnamese-hyphen", type: "link", expect: "safe", input: "https://tiếng-việt.vn" },
  { id: "safe-zwsp-real-google", type: "link", expect: "safe", input: "https://goo​gle.com/signin" },
  { id: "safe-fullwidth-real-google", type: "link", expect: "safe", input: "https://ｇｏｏｇｌｅ.com" },
  { id: "safe-rn-word-stearn", type: "link", expect: "safe", input: "https://stearn.com" },
  { id: "safe-cl-word-clinic", type: "link", expect: "safe", input: "https://clinic.ae" },
  { id: "safe-vv-word-vvip", type: "link", expect: "safe", input: "https://vvip-lounge.ae" },
  { id: "safe-double-word-goggles", type: "link", expect: "safe", input: "https://goggles.com" },
  { id: "safe-swap-short-appel", type: "link", expect: "safe", input: "https://appel.nl" },
  { id: "safe-office-word", type: "link", expect: "safe", input: "https://office-chairs.ae" },
];
