// Look-alike letters (owner request, 24 Oct 2026: "google can be written with
// the Greek o instead of the English o, people can impersonate it, check the
// two strings"). A brand spelled with letters from another alphabet, in a link
// or in the message text, is SCAM. A local website or message written in its
// own alphabet (German accents, Greek, Russian, Arabic, Japanese) is not, and
// neither are the brands' real country sites (google.ae, amazon.co.uk,
// paypal.me), which older rules wrongly flagged.
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
];
