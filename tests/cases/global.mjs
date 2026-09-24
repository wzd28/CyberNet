// Global smishing, phishing and social-engineering cases in English (plus a
// little Arabic), and legitimate messages that use the same vocabulary.
// Same format as tests/engine-cases.mjs. Sample data only: every name,
// number, address and domain here is made up.
export const CASES = [
  // ── Delivery and postal ──
  { id: "usps-address-hold", type: "text", expect: "scam", input: "USPS: We could not deliver your package due to incomplete address information. Confirm your address within 12 hours or it will be returned: usps-package-hold.com/track", note: "brand in a non-official domain, no https" },
  { id: "royalmail-unpaid-fee", type: "text", expect: "scam", input: "Royal Mail: your parcel has a £2.99 unpaid shipping fee. Pay now to avoid return to sender: royalmail-redelivery-fee.co/pay" },
  { id: "royalmail-fee-link", type: "link", expect: "scam", input: "royalmail-redelivery-fee.co/pay", note: "same link alone; lure words in the domain" },
  { id: "parcel-confirm-text", type: "text", expect: "scam", input: "Your parcel is waiting at our depot. Confirm your address to release it: parcel-confirm-eu.com/track", note: "the message-vs-link mismatch the user reported" },
  { id: "parcel-confirm-link", type: "link", expect: "scam", input: "parcel-confirm-eu.com/track", note: "same link alone" },

  // ── Tax refund and tax debt ──
  { id: "irs-rebate-bare-link", type: "text", expect: "scam", input: "IRS: You are eligible for a tax rebate of $1,240 for the 2025 tax year. Submit your claim before it expires: irs-rebate-portal.com/claim" },
  { id: "tax-debt-call", type: "text", expect: "scam", input: "This is the final notice from the Internal Revenue Service. You have an outstanding tax debt of $3,240. A warrant will be issued unless you call 202-555-0148 today." },

  // ── Subscription and streaming renewals ──
  { id: "disney-renewal", type: "text", expect: "scam", input: "Your Disney+ subscription has expired. Renew now to keep watching, your payment method needs to be updated: disneyplus-renew.com/billing", note: "brand not in KNOWN_BRANDS, no https" },

  // ── Account suspension ──
  { id: "instagram-copyright", type: "text", expect: "scam", input: "Your Instagram account has been reported for copyright violation and will be permanently disabled in 24 hours. Appeal here: instagram-copyright-appeal.com" },
  { id: "hsbc-obfuscated-sms", type: "text", expect: "scam", input: "Y0ur acc0unt has been l0cked. Ver1fy n0w: hsbc-0nline-secure.com", note: "0 for o, 1 for i, no https" },

  // ── Two-factor and OTP relay ──
  { id: "otp-by-accident", type: "text", expect: "scam", input: "Hey it's Mark from the office, I put your number by accident on my Uber account so a 6 digit code should come to you, can you screenshot it to me? thanks", note: "\"by accident\" and \"screenshot it to me\" instead of \"by mistake\" / \"send it back\"" },
  { id: "fraud-team-read-back-code", type: "text", expect: "scam", input: "This is Sarah from the fraud team. To cancel the fraudulent transfer of $980 we need you to read back the 6-digit code we just sent to your phone.", note: "vishing script: the code is the reader's own OTP" },

  // ── Tech support pop-ups ──
  { id: "windows-defender-popup", type: "text", expect: "scam", input: "Windows Defender Security Center: Your PC is infected with 5 viruses. Do not shut down your computer. Call toll-free (844) 555-0177 to remove the threat.", note: "no \"support\" or \"microsoft\" word, just a callback number" },

  // ── Romance-investment and wrong-number openers ──
  { id: "romance-gold-trading", type: "text", expect: "scam", input: "Good morning my love, my uncle showed me the gold trading platform he uses and I made 2,000 USDT this week. I want us to build our future together, I will teach you step by step." },
  { id: "wrong-number-crypto", type: "text", expect: "scam", input: "Sorry, wrong number! But you seem nice. I'm Amy from Singapore, I do crypto trading on the side and made 20% last month, happy to show you how if you're interested :)", note: "wrong-number opener that turns into an investment pitch" },

  // ── Task jobs, fake recruiters, money mule ──
  { id: "amazon-rating-job", type: "text", expect: "scam", input: "Hello! I'm Lisa from Amazon Marketing. We are hiring part-time staff to rate products, 200-500 USD daily, 60-90 min a day. Contact me on WhatsApp +1 305 555 0142" },
  { id: "recruiter-background-fee", type: "text", expect: "scam", input: "Congratulations, your CV was shortlisted for Remote Data Entry at TechNova Ltd. Salary 4,500 USD/month. To proceed, pay the 50 USD background check fee via the link: technova-onboarding.net/fee", note: "advance-fee job offer" },
  { id: "mule-payment-agent", type: "text", expect: "scam", input: "We are looking for local payment agents. Funds are sent to your personal account, you keep 10% and transfer the rest the same day. No experience needed, start this week." },

  // ── Sextortion ──
  { id: "sextortion-short", type: "text", expect: "scam", input: "i know what you did last night on cam. 500$ in btc or your family sees the video. you have 24 hrs", note: "short, lowercase, \"500$\" and \"btc\" instead of \"$500\" / \"bitcoin\"" },

  // ── Marketplace overpayment, rental deposit ──
  { id: "marketplace-overpayment", type: "text", expect: "scam", input: "Hi, I'll take the sofa. My assistant will send a cheque for 1,200 which includes the movers cost, please transfer the extra 400 to the mover by bank transfer once it clears." },
  { id: "rental-deposit-abroad", type: "text", expect: "scam", input: "The apartment is still available. I'm currently abroad so I can't show it, but if you send the deposit of 800 EUR by wire transfer I will courier the keys to you." },

  // ── Charity and lottery ──
  { id: "charity-flood-crypto", type: "text", expect: "scam", input: "URGENT APPEAL: Children in the flood zone need your help tonight. Donate now via bitcoin wallet bc1qexample or send a gift card code to relief-fund-2026@gmail.com" },
  { id: "lottery-google-promo", type: "text", expect: "scam", input: "Dear Winner, your email address was randomly selected in the Google Anniversary Promo and you have won 950,000 GBP. Reply with your full name, address and phone number to our claims agent." },

  // ── Fake bank fraud alert with a callback number ──
  { id: "chase-fake-alert-call", type: "text", expect: "scam", input: "ALERT: A purchase of $499.99 at an electronics store was attempted on your Chase card. If this was not you, call 1-855-555-0133 immediately to block the card.", note: "gives its own number instead of the one on the card" },

  // ── Arabic script ──
  { id: "arabic-aramex", type: "text", expect: "scam", input: "أرامكس: لم نتمكن من توصيل شحنتك بسبب عنوان غير مكتمل. يرجى تحديث بياناتك خلال 24 ساعة: aramex-ae-delivery.com/update" },
  { id: "arabic-ministry-fee", type: "text", expect: "scam", input: "وزارة المالية: لديك مبلغ مستحق بقيمة 350 ريال. سدد الآن لتجنب الغرامة عبر الرابط mof-sa-pay.com" },

  // ── Legitimate messages with similar words ──
  { id: "real-2fa-code", type: "text", expect: "safe", input: "Your code is 482913. Do not share it." },
  { id: "real-google-code", type: "text", expect: "safe", input: "G-733921 is your Google verification code." },
  { id: "real-bank-alert-card", type: "text", expect: "safe", input: "Chase Fraud Alert: did you attempt $212.50 at PETROL STATION on 09/21? Reply YES or NO. If NO, call the number on the back of your card." },
  { id: "real-supplier-invoice", type: "text", expect: "safe", input: "Hi Tom, invoice INV-2291 for the September web hosting is attached, total 340 USD, due 15 October. Same account details as always. Thanks, Priya" },
  { id: "newsletter-link", type: "text", expect: "safe", input: "The Weekly Byte, issue 84: 5 tools for faster code reviews, plus our take on the new EU AI rules. Read online: https://weeklybyte.substack.com/p/issue-84 Unsubscribe anytime." },
  { id: "friend-pay-back", type: "text", expect: "safe", input: "hey can you send me the 40 for the concert tickets when you get a chance? bank transfer or revolut is fine" },
  { id: "landlord-rent-reminder", type: "text", expect: "safe", input: "Hi, just a reminder that rent for October is due on the 1st. Same amount as usual to the account you have on file. Let me know if you need the details again." },
  { id: "hr-payroll-dates", type: "text", expect: "safe", input: "Hi all, payroll for September will be processed on the 27th and should land in your accounts by the 30th. Payslips will be available in Workday as usual. HR" },
  { id: "dhl-out-for-delivery", type: "text", expect: "safe", input: "DHL: your shipment 4471 2290 15 is out for delivery today between 10:00 and 14:00. No action is needed." },
  { id: "hmrc-self-assessment", type: "text", expect: "safe", input: "HMRC: Your Self Assessment tax return for 2025-26 is due by 31 January. Sign in to your HMRC online account to file. We will never ask for bank details by text." },
  { id: "spotify-payment-received", type: "text", expect: "safe", input: "Your Spotify Premium payment of $10.99 was received. Next billing date: 24 Oct. Manage your plan in Settings." },
  { id: "new-sign-in-notice", type: "text", expect: "safe", input: "New sign-in to your account from Chrome on Windows. If this was you, you can ignore this message. If not, change your password from account settings in the app." },
  { id: "arabic-clinic-reminder", type: "text", expect: "safe", input: "تذكير: موعدك في العيادة يوم الثلاثاء الساعة 4 مساءً. للإلغاء أو إعادة الجدولة اتصل بنا.", note: "\"إعادة الجدولة\" is also a delivery-lure term" },
  { id: "etisalat-otp-warning", type: "text", expect: "safe", input: "Etisalat: your one-time password is 551204. It expires in 5 minutes. Do not share this with anyone, including Etisalat staff." },

  // ── Links ──
  { id: "spotify-official-account", type: "link", expect: "safe", input: "https://www.spotify.com/account/overview" },
  { id: "gov-uk-self-assessment", type: "link", expect: "safe", input: "https://www.gov.uk/self-assessment-tax-returns", note: "real government site, but not in KNOWN_BRANDS" },
];
