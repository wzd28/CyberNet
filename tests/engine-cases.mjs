// Labelled inputs for the detection engine. Every case runs through the
// shared rules (what Quick Scan shows) and through the server's deterministic
// layer (what Analysis AI starts from before the AI). "scam" means the page
// shows SCAM (score 32 or more), "safe" means NOT A SCAM, "unverified" means a
// bare link from a domain nobody has vouched for ("COULDN'T VERIFY").
//
// Add a case whenever a real message fools the engine; keep the input close
// to what people actually receive. Never put real people's details here.
export const CASES = [
  // ── Fine-and-fee scams (the Cyprus Police report that started this) ──
  { id: "fine-police-link", type: "text", expect: "scam", input: "Cyprus Police: you have an unpaid vehicle fine of EUR 45. Review and pay within 48 hours to avoid further penalties: http://cy-police-fines.com/pay" },
  { id: "fine-police-link-alone", type: "link", expect: "scam", input: "http://cy-police-fines.com/pay" },
  { id: "fine-traffic-uae", type: "text", expect: "scam", input: "Dubai Police notice: a traffic fine of AED 400 is registered against your vehicle. Settle it today to avoid a black point: https://dubai-fines-settle.com/pay-now" },
  { id: "toll-smishing", type: "text", expect: "scam", input: "Salik: you have an unpaid toll balance of AED 12.50. Pay now to avoid a AED 250 fine: https://salik-toll-pay.net/invoice" },
  { id: "tax-refund", type: "text", expect: "scam", input: "HMRC: you are due a tax refund of £248.30. Claim it before 30 September at https://hmrc-refund-claims.co/verify" },

  // ── Credential / OTP ──
  { id: "reward-portal", type: "text", expect: "scam", input: "Your employee reward is ready. Sign in with your work email to claim it within 24 hours: http://staff-rewards-portal.com/login" },
  { id: "otp-relay", type: "text", expect: "scam", input: "Hi, I accidentally sent a verification code to your number by mistake, can you send it back to me please? It's urgent" },
  { id: "bank-otp-request", type: "text", expect: "scam", input: "Emirates NBD security team: unusual activity was detected. Reply with the OTP we just sent you to confirm your identity or your account will be suspended." },
  { id: "account-suspended", type: "text", expect: "scam", input: "Your Netflix account is on hold. Update your payment details within 24 hours or it will be deleted: https://netflix-billing-update.com" },
  { id: "microsoft-lookalike-link", type: "link", expect: "scam", input: "https://login.microsoft-secure-verify.com/account" },

  // ── Money ──
  { id: "gift-card-payment", type: "text", expect: "scam", input: "This is your manager. I'm in a meeting and can't talk. Buy 3 Apple gift cards of $200 each and send me the codes, I'll pay you back today." },
  { id: "bank-detail-change", type: "text", expect: "scam", input: "Please note our bank details have changed. Pay the attached invoice to the new IBAN below. Don't call, I'm travelling; email only." },
  { id: "crypto-guaranteed", type: "text", expect: "scam", input: "Join my crypto trading platform, guaranteed returns of 30% a month, my dear. Deposit 500 USDT to start and withdraw your profits daily." },
  { id: "delivery-fee", type: "text", expect: "scam", input: "Your parcel is on hold at the depot. Pay the AED 12 customs fee within 24 hours to release it: http://ae-parcel-redelivery.com/pay" },
  { id: "prize-claim", type: "text", expect: "scam", input: "Congratulations! You have been selected as the winner of a free iPhone 16. Claim your prize now: https://bit.ly/claim-prize-now" },

  // ── Impersonation / authority ──
  { id: "digital-arrest", type: "text", expect: "scam", input: "This is the Federal Investigation Department. A warrant for your arrest has been issued because your identity was used in a crime. Stay on the line and do not hang up." },
  { id: "tech-support", type: "text", expect: "scam", input: "Microsoft Security Alert: your computer is infected. Call our support now on +1 888 555 0199 and install AnyDesk so we can fix it." },
  { id: "job-task", type: "text", expect: "scam", input: "Work from home, no experience needed, earn up to $300 a day completing simple product boosting tasks. Daily payout. Reply YES to start." },
  { id: "family-emergency", type: "text", expect: "scam", input: "Grandma its me, I've been in an accident and I need bail money tonight. Please dont tell mom. Send it to this account." },
  { id: "arabic-otp", type: "text", expect: "scam", input: "عزيزي العميل، تم رصد نشاط غير معتاد على حسابك. أرسل لنا رمز التحقق فوراً لتجنب إيقاف الحساب." },

  // ── Links: look-alike, shorteners, raw IP, http login ──
  { id: "shortener", type: "link", expect: "scam", input: "https://bit.ly/free-gift-card" },
  { id: "raw-ip-login", type: "link", expect: "scam", input: "http://185.203.117.42/login/verify" },
  { id: "adcb-lookalike", type: "link", expect: "scam", input: "https://adcb-secure-login.info/verify" },
  { id: "punycode", type: "link", expect: "scam", input: "https://xn--pple-43d.com/signin" },
  { id: "gov-lookalike-link", type: "link", expect: "scam", input: "https://uk-gov-tax-refund.com/claim" },

  // ── Legitimate messages that should stay NOT A SCAM ──
  { id: "team-lunch", type: "text", expect: "safe", input: "Team lunch is at 1 pm today, see you at the usual place." },
  { id: "meeting-reschedule", type: "text", expect: "safe", input: "Hi Sara, can we move tomorrow's meeting to 3 pm? The client asked for an earlier slot in the morning." },
  { id: "bank-awareness", type: "text", expect: "safe", input: "Security tip from your bank: we will never ask for your OTP or password. Do not share them with anyone, and report suspicious messages to us." },
  { id: "delivery-legit", type: "text", expect: "safe", input: "Your order #48213 has been shipped and will arrive on Thursday. Track it in the app you ordered from." },
  { id: "dentist", type: "text", expect: "safe", input: "Reminder: your dental appointment is on Monday at 10:30. Reply C to confirm or call the clinic to reschedule." },
  { id: "school-note", type: "text", expect: "safe", input: "Dear parents, the school trip to the science museum is on 3 October. Please sign the permission slip your child brought home." },
  { id: "invoice-normal", type: "text", expect: "safe", input: "Hi, please find attached the invoice for September as agreed. Payment terms are 30 days as usual. Thanks for your business." },
  { id: "arabic-safe", type: "text", expect: "safe", input: "مرحباً، الاجتماع غداً الساعة العاشرة صباحاً في المكتب، أراك هناك." },

  // ── Links on known official domains ──
  { id: "google-docs", type: "link", expect: "safe", input: "https://docs.google.com/document/d/1AbC/edit" },
  { id: "enbd-official", type: "link", expect: "safe", input: "https://www.emiratesnbd.com/en/personal-banking" },
  { id: "apple-official-login", type: "link", expect: "safe", input: "https://appleid.apple.com/sign-in" },
  { id: "dewa-official", type: "link", expect: "safe", input: "https://www.dewa.gov.ae/en/consumer/billing" },

  // ── Bare links from unknown domains: not proven safe, not proven a scam ──
  { id: "unknown-shop", type: "link", expect: "unverified", input: "https://my-random-shop.com/product/42" },
  { id: "unknown-blog", type: "link", expect: "unverified", input: "https://travel-notes-blog.net/2026/09/lisbon" },
  { id: "policy-site", type: "link", expect: "unverified", input: "https://policy-review.org/about" },
  { id: "taxi-site", type: "link", expect: "unverified", input: "https://dubai-taxi.com/book" },
];
