// Labelled Recovery Mode descriptions for tests/run-recovery.mjs. Made-up
// sample data only. Fields (all optional except id and description):
//   category    exact incidentCategory the classifier must return
//   minRisk     lowest acceptable risk floor (low < medium < high < critical)
//   maxRisk     highest acceptable risk floor (keeps everyday cases calm)
//   minUrgency  lowest acceptable urgency floor (soon < today < immediate)
//   money       whether the instant plan must open with the bank step
export const RECOVERY_CASES = [
  // ── Existing keyword paths (must keep working) ──
  { id: "sent-money-keyword", description: "I sent money to a seller on Instagram and he blocked me.", category: "Financial / payment fraud", minRisk: "medium", money: true },
  { id: "card-charged", description: "My card was charged three times for something I never bought.", category: "Financial / payment fraud", minRisk: "high", minUrgency: "immediate", money: true },
  { id: "clicked-link-entered-password", description: "I clicked a link from what looked like my bank and entered my password.", category: "Phishing", minRisk: "medium", money: true },
  { id: "sim-swap", description: "My phone has no signal since this morning and I got an email that my number was ported.", category: "SIM swap / phone-number takeover", minRisk: "medium" },
  { id: "seed-phrase", description: "I typed my seed phrase into a site that said it would fix my MetaMask wallet.", category: "Cryptocurrency / wallet incident", minRisk: "medium" },
  { id: "selected-type-and-quick-answers", description: "Something is wrong", quickAnswers: { sharedOtp: true, sentMoney: true }, incidentType: "Account hacked", category: "Account compromise", minRisk: "critical", minUrgency: "immediate", money: true },
  { id: "quick-answer-money-only", description: "Please help, I think I was scammed.", quickAnswers: { sentMoney: true }, minRisk: "high", minUrgency: "immediate", money: true },
  // 29 Oct 2026 audit: these ticks were sent by the page but ignored.
  { id: "quick-answer-shared-card", description: "Please help, I think I was scammed.", quickAnswers: { sharedPayment: true }, minRisk: "high", minUrgency: "immediate", money: true },
  { id: "quick-answer-clicked-and-downloaded", description: "I got a weird message.", quickAnswers: { clickedLink: true, downloadedFile: true }, minRisk: "high", money: false },
  { id: "malware-attachment", description: "I opened an attachment from an unknown sender and now my laptop is acting strange.", category: "Malware / device compromise", money: false },
  { id: "no-money-account-locked", description: "I am locked out of my account after someone changed my password.", minRisk: "medium", money: false },
  { id: "calm-question", description: "I got a strange email but I did not click anything. What should I watch for?", maxRisk: "medium", money: false },
  // ── Varied English and Arabic wording (2026-10-14): the exact keyword lists
  // missed these, so they came out as "Other" at LOW or MEDIUM risk. ──
  { id: "instagram-was-hacked", description: "My Instagram was hacked this morning and the hacker is messaging my followers asking for money", category: "Social media compromise", minRisk: "high", minUrgency: "today", money: false },
  { id: "gmail-login-russia-locked-out", description: "Someone logged into my Gmail from Russia and I can not get in anymore", category: "Email compromise", minRisk: "high" },
  { id: "parcel-fee-paid-card-charged", description: "I got a text about a parcel fee and I paid 12 dirhams on the link, then they charged my card 3 times", incidentType: "Other", category: "Financial / payment fraud", minRisk: "high", minUrgency: "immediate", money: true },
  { id: "hi-mum-transferred", description: "A WhatsApp message from my daughter's new number asked me to pay an invoice and I transferred 4000 AED", category: "Financial / payment fraud", minRisk: "high", minUrgency: "immediate", money: true },
  { id: "ar-instagram-hacked", description: "تم اختراق حسابي على انستغرام وغيروا كلمة المرور والبريد الإلكتروني", category: "Social media compromise", minRisk: "high" },
  { id: "ar-money-transferred-otp", description: "حولت مبلغ 5000 درهم لشخص ادعى انه من البنك وطلب مني رمز التحقق", category: "Financial / payment fraud", minRisk: "high", minUrgency: "immediate", money: true },
  { id: "ar-gave-otp", description: "أعطيت رمز التحقق لشخص اتصل بي وقال انه من البنك", category: "OTP / credential exposure", minRisk: "high", minUrgency: "immediate" },
  { id: "clickfix-ran-command", description: "A website said verify you are human and told me to press Win+R and paste a command, I did it", category: "Malware / device compromise", minRisk: "high" },
  { id: "whatsapp-linked-device", description: "I see an unknown linked device on my WhatsApp after I clicked a link to see a photo", minRisk: "medium" },
  { id: "fake-trading-app-deposit", description: "I deposited 20000 AED into a trading app a girl I met online recommended and now they say I must pay tax to withdraw", category: "Romance / investment (\"pig butchering\") scam", minRisk: "high", minUrgency: "immediate", money: true },
  { id: "device-code-entered", description: "I entered a code on microsoft.com/devicelogin that a colleague emailed me", minRisk: "medium" },
  { id: "voice-clone-son", description: "I got a call that sounded exactly like my son saying he was in an accident and needed 10000 AED immediately", category: "Family-emergency / voice-cloning scam", minRisk: "medium" },
  { id: "gave-them-the-code-en", description: "A man said he was from my bank and I gave him the code from the SMS", category: "OTP / credential exposure", minRisk: "high", minUrgency: "immediate", money: true },
  // Calm cases must stay calm.
  { id: "received-code-not-shared", description: "Someone sent me a code I didn't request. I did not share it with anyone.", maxRisk: "medium", money: false },
  { id: "never-gave-code", description: "A caller asked for my OTP but I never gave them the code and hung up.", maxRisk: "medium" },
];
