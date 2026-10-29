// 29 Oct 2026 pre-launch audit (owner: "yes, fix detection"). Made-up sample
// messages only; no real people or numbers.
// - A "don't share this code" line only speaks for its own sentence: a scam
//   that pastes the real code text above "send it back to me" is SCAM.
// - Finished refunds, "credited within 24 hours", brands' own short domains and
//   the X / LinkedIn link wrappers are no longer false alarms.
// - Wordings the rules missed: secrecy, per-task pay, withdrawal fees, ClickFix
//   without the Run box, callback numbers without "press 1", app-link QR codes.
export const CASES = [
  // Warnings that cover for a code-relay ask
  { id: "guard-relay-after-code-sms", expect: "scam", input: "Your WhatsApp code: 381-204\nDon't share this code with others\n\nHi sorry, I sent you a 6 digit code by mistake, can you send it back to me please?" },
  { id: "guard-curly-apostrophe", expect: "scam", input: "Your WhatsApp code: 381-204\nDon’t share this code with others\n\nHi sorry, I sent you a 6 digit code by mistake, can you send it back to me please?" },
  { id: "guard-except-me", expect: "scam", input: "Do not share this code with anyone except me. I am from the bank security team." },
  { id: "guard-same-sentence-relay", expect: "scam", input: "Don't share this code with anyone, just send it back to me so I can fix your account." },
  { id: "guard-agent-relay", expect: "scam", input: "Never share your OTP with strangers. Our agent will call you now, read the code to our agent to stop the payment." },
  { id: "guard-tip-plus-lure-link", expect: "scam", input: "For your security, never share your password. Click the link below to verify your account: http://secure-verify-acct.com/login" },
  // Genuine warnings stay calm
  { id: "guard-legit-otp-sms", expect: "safe", input: "Your OTP for transaction of AED 500.00 at AMAZON is 482913. Do not share it with anyone. Bank staff will never ask for it." },
  { id: "guard-legit-enter-code", expect: "safe", input: "Enter the verification code 482913 to log in. Never share this code with anyone." },
  { id: "guard-legit-never-ask-send", expect: "safe", input: "Do not share this code. We will never ask you to send it to us." },
  { id: "guard-legit-never-ask-password", expect: "safe", input: "We will never ask you to send us your password by email or text." },
  { id: "guard-legit-bank-tip", expect: "safe", input: "Security tip: never share your PIN or OTP with anyone, even if they say they are from the bank. Report suspicious calls to 800 123." },
  { id: "guard-legit-app-store", expect: "safe", input: "Never share your password. Download our official app from the App Store to manage your account." },
  // Refunds and service promises
  { id: "refund-processed", expect: "safe", input: "Your Amazon refund of AED 129.00 has been processed to your original payment method." },
  { id: "refund-within-24h", expect: "safe", input: "Your refund will be credited within 24 hours to your card ending 1234." },
  { id: "refund-ask-still-scam", expect: "scam", input: "Your Amazon refund of AED 129.00 is pending. Click here to verify your card and receive it: http://amazon-refund-help.top" },
  // Brands' own domains and platform link wrappers
  { id: "official-discord-gg", type: "link", expect: "safe", input: "https://discord.gg/abcd" },
  { id: "official-spotify-link", type: "link", expect: "safe", input: "https://open.spotify.link/xyz" },
  { id: "official-instagr-am", type: "link", expect: "safe", input: "https://instagr.am/p/abc" },
  { id: "official-telegram-me", type: "link", expect: "safe", input: "https://telegram.me/somechannel" },
  { id: "official-netflix-net", type: "link", expect: "safe", input: "https://netflix.net/" },
  { id: "official-microsoftstore", type: "link", expect: "safe", input: "https://www.microsoftstore.com/" },
  { id: "lookalike-discord-gift", type: "link", expect: "scam", input: "https://discord-gift.gg/abc" },
  { id: "wrapper-t-co", type: "link", expect: "unverified", input: "https://t.co/AbC123xyz" },
  { id: "wrapper-lnkd-in", type: "link", expect: "unverified", input: "https://lnkd.in/dXyZ12a" },
  { id: "shortener-bitly-still-scam", type: "link", expect: "scam", input: "https://bit.ly/3abcDEF" },
  // Missed wordings
  { id: "secrecy-dont-tell-anyone", expect: "scam", input: "Hi it's me, I changed my number. Please don’t tell anyone, I need 2000 AED today, I'll pay you back." },
  { id: "callback-no-press-1", expect: "scam", input: "Payment of SAR 3,200 to STC Pay was successful. Not you? Call 0501234567 to cancel." },
  { id: "clickfix-powershell", expect: "scam", input: "Verify you are human: open PowerShell, paste the command we copied for you and press Enter." },
  { id: "clickfix-terminal-document", expect: "scam", input: "To view the document, open Terminal and paste the code below." },
  { id: "mule-payment-agent", expect: "scam", input: "We are hiring a payment processing agent. You will receive payments on behalf of our company and keep 10%." },
  { id: "otp-ask-next-sentence", expect: "scam", input: "We sent you a 6-digit verification code. Please share it with us to confirm your identity." },
  { id: "otp-share-with-agent", expect: "scam", input: "Our agent will call you. Share it with our agent when you get the code." },
  { id: "otp-arabic-object-first", expect: "scam", input: "وصلك رمز تحقق من واتساب، أرسله لي بسرعة" },
  { id: "withdrawal-fee", expect: "scam", input: "Your balance is 4,850 USDT. To withdraw your profits you must pay the 15% tax first." },
  { id: "task-pay-per-review", expect: "scam", input: "Get paid 5 USDT per review, only 10 minutes a day. Contact our HR on Telegram." },
  // Everyday look-alikes of those wordings
  { id: "everyday-surprise-party", expect: "safe", input: "Don't tell anyone, it's a surprise party for mom on Saturday!" },
  { id: "everyday-darling", expect: "safe", input: "Darling, can you pick up milk on your way home?" },
  { id: "everyday-bank-debit-800", expect: "safe", input: "Your card ending 1234 was charged AED 250.00 at Carrefour. If this wasn't you, call 600 54 0000." },
  { id: "everyday-terminal-dev", expect: "safe", input: "Open Terminal and paste this command to install Node: brew install node" },
  { id: "everyday-atm-fee", expect: "safe", input: "A withdrawal fee of AED 2 applies to ATM withdrawals at other banks." },
  { id: "everyday-fixed-deposit", expect: "safe", input: "To withdraw from your fixed deposit early you will pay a penalty fee of 1%." },
  // QR codes and app links
  { id: "app-install-itms", type: "link", expect: "scam", input: "itms-services://?action=download-manifest&url=https://x.example/app.plist" },
  { id: "app-link-intent", type: "link", expect: "unverified", input: "intent://scan/#Intent;scheme=zxing;package=com.x;end" },
];
