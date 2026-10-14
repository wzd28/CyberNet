// 2026 scam trends found
// by research (UAE Cyber Security Council / Emirates Post / DARB / Salik
// notices, FBI toll-smishing, Microsoft + ESET quishing and device-code
// reports, "Hi Mum" voice-clone variants) plus the false positives found by
// probing the engine with everyday messages. Made-up sample data only.
export const CASES = [
  // ── Delivery and iMessage-style lures ──
  { id: "dhl-held-fee-cc", type: "text", expect: "scam", input: "DHL: Your shipment is held. A small fee of AED 5 is required to release it. Click: dhl-ae.cc/track", note: "'held' instead of 'on hold', 'Click:' with no 'link' word, 3-letter brand + country code on a .cc domain" },
  { id: "imessage-reply-y", type: "text", expect: "scam", input: "Your package has arrived at the warehouse but could not be delivered due to incomplete address information. Please update your address in the link below. Reply Y to activate the link, then re-open this message.", note: "the 'reply Y so the link becomes clickable' trick" },
  { id: "emiratespost-address-loss", type: "text", expect: "scam", input: "Emirates Post: due to the loss of address, your package cannot be delivered. Update the address and request a new delivery: https://emiratespost-ae.top/redeliver", note: "wording from the 2026 UAE Cyber Security Council notice" },

  // ── Family impersonation ("Hi Mum", voice clone) ──
  { id: "hi-mum-broke-phone", type: "text", expect: "scam", input: "Mum it's me, I broke my phone and this is my new number. Can you transfer some money for an urgent bill? I'll pay you back tomorrow." },
  { id: "hi-dad-lost-phone", type: "text", expect: "scam", input: "Hi dad, I lost my phone, text me on this new WhatsApp number. I need you to pay a bill for me today, will explain later." },
  { id: "hi-mum-water", type: "text", expect: "scam", input: "Mum its me, new number, my phone fell in water. Can you send 2000 AED to this account for rent now, I will explain later" },
  { id: "hi-mum-save-number", type: "text", expect: "scam", input: "hi mum this is my new number. please save it and delete the old one. can you help me pay an invoice today" },
  { id: "family-bail-voice", type: "text", expect: "scam", input: "Dad it's me. I was in an accident and they arrested me. Don't call my phone, they took it. Please transfer bail money to this lawyer now." },

  // ── Investment, task and recovery scams ──
  { id: "crypto-cold-opener", type: "text", expect: "scam", input: "Hi, did you get my last message? I'm Jessica, I trade crypto on Binance with my uncle's team and last week I made 3,200 USDT. I can show you how if you want." },
  { id: "task-telegram-usdt", type: "text", expect: "scam", input: "We are hiring remote assistants. 30 minutes a day, earn 150-300 USDT daily. Contact our manager on Telegram @JobsHR_official to start." },
  { id: "crypto-recovery-upfront", type: "text", expect: "scam", input: "Hi this is Sarah from Chainalysis recovery. We can recover your lost crypto for a 5% fee upfront. Contact us." },
  { id: "payout-pay-via-crypto", type: "text", expect: "scam", input: "We have placed your case on hold. To verify your identity and release your payout, please pay AED 500 via crypto to the wallet below." },
  { id: "dsf-draw-passport", type: "text", expect: "scam", input: "Congratulations Mr Ahmed, Dubai Shopping Festival draw: you won AED 250,000. WhatsApp +971 50 000 0000 with passport copy" },

  // ── Code theft: callback, WhatsApp, vishing ──
  { id: "callback-amazon-press-1", type: "text", expect: "scam", input: "Hello, this is Amazon security. We noticed a suspicious order of an iPhone 16 for $999 on your account. Press 1 to cancel or call us on 0800 123 4567 now." },
  { id: "whatsapp-vote-code", type: "text", expect: "scam", input: "Please vote for my cousin in this contest, it's quick: you will get a 6-digit code on WhatsApp, send it to me so I can confirm your vote." },
  { id: "whatsapp-suspended-ar", type: "text", expect: "scam", input: "واتساب: تم تعليق حسابك. أرسل رمز التحقق المكون من 6 أرقام الذي وصلك لاستعادة الحساب" },
  { id: "apple-support-need-code", type: "text", expect: "scam", input: "I'm calling from Apple Support. For security I need the code that was just sent to your phone." },
  { id: "otp-tell-agent-obfuscated", type: "text", expect: "scam", input: "Y0ur 0TP 1s 482913. Tell it to our agent on call to cancel the p4yment" },

  // ── Device and browser tricks ──
  { id: "clickfix-win-r", type: "text", expect: "scam", input: "To verify you are human, press Win+R, paste the command with Ctrl+V and press Enter" },
  { id: "device-code-phish", type: "text", expect: "scam", input: "Go to microsoft.com/devicelogin and enter the code ABCD-EFGH to view the shared document" },
  { id: "ghostpairing-photo", type: "text", expect: "scam", input: "Hey I found your photo! https://photos-facebook-view.cc/me" },

  // ── Gulf toll and card lures ──
  { id: "nol-reactivate-cc", type: "text", expect: "scam", input: "Your RTA Nol card balance has expired. Reactivate your card now to keep your points: https://nol-rta.cc/activate" },

  // ── QR-code redirectors seen in quishing: weak, never a flat SCAM ──
  { id: "link-qrco-de", type: "link", expect: "unverified", input: "https://qrco.de/bf7aXk", note: "dynamic QR services are also used by real restaurants: CAN'T CONFIRM, not SCAM" },
  { id: "link-lead-me", type: "link", expect: "unverified", input: "https://l.ead.me/abc" },

  // ── False positives found by probing: everyday messages that must stay NOT A SCAM ──
  { id: "fp-meeting-room-code", type: "text", expect: "safe", input: "Hi, can you send me the code for the meeting room? I'm outside." },
  { id: "fp-promo-code", type: "text", expect: "safe", input: "Can you send me the promo code for the discount you mentioned?" },
  { id: "fp-pin-when-there", type: "text", expect: "safe", input: "Send me the pin when you get there" },
  { id: "fp-pin-location", type: "text", expect: "safe", input: "Send me the pin location please, I cannot find the building" },
  { id: "fp-gate-code", type: "text", expect: "safe", input: "Tell me the gate code, I am downstairs" },
  { id: "fp-wifi-password", type: "text", expect: "safe", input: "Can you share with me the wifi password?" },
  { id: "fp-qr-menu", type: "text", expect: "safe", input: "Scan the QR code on the table to see our menu and order" },
  { id: "fp-qr-checkin", type: "text", expect: "safe", input: "Scan the QR code at the entrance to check in to the event" },
  { id: "fp-tap-button-track", type: "text", expect: "safe", input: "Tap the button below to track your order in the Talabat app" },
  { id: "fp-teams-join", type: "text", expect: "safe", input: "Click the link below to join our Teams meeting: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc" },
  { id: "fp-google-verify-email", type: "text", expect: "safe", input: "Please verify your email address to finish creating your account: https://accounts.google.com/signin/verify" },
  { id: "fp-official-bank-link", type: "text", expect: "safe", input: "Please click the link to complete your payment on our official site https://www.emiratesnbd.com/en/pay" },
  { id: "fp-photos-album-link", type: "text", expect: "safe", input: "Open the link to view the photos from the wedding: https://photos.app.goo.gl/AbCdEf" },
  { id: "fp-maps-location", type: "text", expect: "safe", input: "Here is my location https://maps.app.goo.gl/AbC123xyz so you can find me" },
  { id: "fp-maps-link-alone", type: "link", expect: "safe", input: "https://maps.app.goo.gl/AbC123xyz" },
  { id: "fp-photos-link-alone", type: "link", expect: "safe", input: "https://photos.app.goo.gl/AbCdEf" },
  { id: "fp-apple-co-link", type: "link", expect: "safe", input: "https://apple.co/3abc" },
  { id: "fp-download-eand-app", type: "text", expect: "safe", input: "Download the e& app from the App Store to pay your bill" },
  { id: "fp-install-careem", type: "text", expect: "safe", input: "Install the Careem app and use code WELCOME20 for 20% off your first ride" },
  { id: "fp-police-marathon", type: "text", expect: "safe", input: "The police said the road will be closed tonight because of the marathon. Avoid the area." },
  { id: "fp-customs-included", type: "text", expect: "safe", input: "Customs fee for your order from Amazon is included in the price you already paid. No further payment needed." },
  { id: "fp-hi-mum-mall", type: "text", expect: "safe", input: "Hi Mum, I'm at the mall, will be back at 6. Can you pick up bread on your way? x" },
  { id: "fp-dad-lunch-money", type: "text", expect: "safe", input: "Hi dad, I'm running late, can you transfer me 100 AED for lunch? Thanks, see you tonight" },
  { id: "fp-new-number-no-ask", type: "text", expect: "safe", input: "Hi Mum, I got a new number, here it is. Call me tonight when you are free." },
  { id: "fp-casual-crypto", type: "text", expect: "safe", input: "I trade crypto a bit on the side, made some gains last month but also lost some, it is risky so be careful" },
  { id: "fp-bank-hotline-alert", type: "text", expect: "safe", input: "Mashreq: purchase of AED 89.00 at CARREFOUR on card ending 4412. If this was not you, call 800 2222 or use the app to block the card." },
  { id: "fp-delivery-retry", type: "text", expect: "safe", input: "Aramex: we missed you today. We will deliver again tomorrow between 2pm and 6pm. No action needed." },
  // ── Added while porting (2026-10-14): look-alikes the prototype rules
  // flagged, and wordings they missed. Same engine, refined rules. ──
  { id: "fp-its-me-new-number-address", type: "text", expect: "safe", input: "Hi, it's me Sam, this is my new number. Send me the address for tonight", note: "a bare 'send' is not a money ask" },
  { id: "fp-its-me-new-number-paid-class", type: "text", expect: "safe", input: "It's me, new number. Did you pay for the class already?" },
  { id: "fp-win-r-cmd-help", type: "text", expect: "safe", input: "Press Win+R, type cmd and press Enter to open the command prompt", note: "ClickFix needs the paste" },
  { id: "fp-door-code-whatsapp", type: "text", expect: "safe", input: "The door code is 4512, send it to her on WhatsApp so she can get in" },
  { id: "fp-qr-verify-ticket", type: "text", expect: "safe", input: "Scan the QR code to verify your ticket at the gate" },
  { id: "fp-parcel-on-hold-no-action", type: "text", expect: "safe", input: "Your parcel is on hold at our facility. No further action needed, it will be delivered tomorrow: https://www.aramex.com/track/123" },
  { id: "fp-hotel-confirmation-code", type: "text", expect: "safe", input: "Can you send me the confirmation code for our hotel booking?" },
  { id: "fp-code-when-you-get-there", type: "text", expect: "safe", input: "Send me the code when you get there" },
  { id: "fp-dad-lost-phone-no-ask", type: "text", expect: "safe", input: "Dad it's me, I lost my phone at the gym, using Ali's. I'm fine, will call you tonight" },
  { id: "fp-signup-code-sent-to-phone", type: "text", expect: "safe", input: "We sent a verification code to your phone. Enter it in the app to finish signing up.", note: "was SCAM 55 on the live engine: 'to your phone' alone fired the OTP-hijack rule" },
  { id: "fp-tap-button-rate-ride", type: "text", expect: "safe", input: "Open the Careem app and tap the button to rate your ride" },
  { id: "code-you-received", type: "text", expect: "scam", input: "Hi, please send me the code you received, I need it to finish" },
  { id: "confirmation-code-whatsapp-sent", type: "text", expect: "scam", input: "Please send me the confirmation code WhatsApp sent you, I put your number by mistake" },
  { id: "hi-mum-send-aed", type: "text", expect: "scam", input: "Mum it's me, new number. Can you send 500 AED, I'll explain later" },
  { id: "quishing-mailbox", type: "text", expect: "scam", input: "Your Microsoft 365 MFA settings must be updated. Scan the QR code below to keep access to your mailbox." },
  { id: "task-whatsapp-minutes", type: "text", expect: "scam", input: "Earn 300 AED per day from home, only 20 minutes a day. Message our HR on WhatsApp" },
  { id: "parcel-on-hold-release-fee", type: "text", expect: "scam", input: "Your parcel is on hold. Pay the AED 7 release fee here: https://aramex-ae.help/pay" },
  { id: "police-report-filed-against-you", type: "text", expect: "scam", input: "A police report has been filed against you for fraud. Contact us now to resolve it before you are charged.", note: "caught by the live engine; kept by the authority-against-you rule" },
  { id: "court-unpaid-dues-pay-now", type: "text", expect: "scam", input: "You will be taken to court tomorrow for unpaid dues. Pay AED 900 now to cancel the case. Call 050 000 0000" },
  { id: "fp-ar-new-password-save", type: "text", expect: "safe", input: "اكتب كلمة المرور الجديدة ثم اضغط حفظ" },
  { id: "fp-ar-share-promo-code", type: "text", expect: "safe", input: "شارك الكود الترويجي مع صديقك ليحصل على خصم" },
];
