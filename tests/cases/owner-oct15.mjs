// False alarms the owner asked to fix on 15 Oct 2026 ("yes fix the false
// alarms"): everyday messages that older rules scored SCAM. Each is fixed where
// the misreading starts, and every fix is pinned by real scams of the same
// family that must stay SCAM:
//
//  1. Service line: a bank's own 600 / 800 number in a notice that asks for
//     nothing risky is how real notices sign off. A mobile or foreign number,
//     or an alarm, code, link, payment or prize next to the call, stays SCAM.
//  2. Police warnings: a warning that describes what fraudsters ask for (a
//     deposit, a transfer) is not a demand. A fine or case aimed at the reader
//     stays SCAM, even when it opens with "beware".
//  3. Arrest news: "police arrested a gang" is news, not a threat to you.
//  4. "Urgent sale" is the seller's hurry, unless it comes with a bargain or a
//     deposit to pay.
//  5. Sextortion: "on cam", "video of you", "webcam" need a payment demand or
//     an exposure threat, and whole words ("valuation came" is not "on cam").
//  6. "Work from home" is a job scam when work is offered with pay, not when
//     the sender is looking for work.
//  7. "There is no guaranteed return" denies the promise; "I made 6%" is not a
//     prize.
//  8. "I'd love to learn from you" is not a love line.
//  9. Lost property: a wallet someone found is not a crypto wallet, "police
//     station" is a place unless a consequence comes with it, and "send a
//     trusted person" sends a person, not your ID.
// 10. A notice whose only ask is a visit to a branch in person is not phishing.
// 11. "You will receive the refund within 7 days" is the sender's service
//     time, not a deadline on you.
// Made-up sample data only.
export const CASES = [
  // ── 1. Official service line ──
  { id: "fa-ar-fund-statement-800", type: "text", expect: "safe", input: "عزيزي العميل، حقق حسابك الاستثماري عائداً بنسبة 1.8% هذا الشهر. للاستفسار اتصل بنا على 800 5 1234.", note: "Arabic fund statement: your investment account returned 1.8% this month, for enquiries call 800 5 1234" },
  { id: "fa-adcb-otp-alert-600", type: "text", expect: "safe", input: "ADCB alert: never share your OTP. Fraudsters may call claiming to be from the bank, offer investments with guaranteed returns or ask you to help transfer funds. Call us on 600 5 00 000 if in doubt." },
  { id: "fa-bank-beware-600", type: "text", expect: "safe", input: "Beware of scammers impersonating our bank. We will never ask for your PIN. Call us on 600 54 0000 if in doubt." },
  { id: "fa-ar-enbd-debit-alert-600", type: "text", expect: "safe", input: "بنك الإمارات دبي الوطني: تم خصم 85.50 درهم من بطاقتك المنتهية بـ 4401 لدى كارفور. إذا لم تكن أنت اتصل بنا على 600540000", note: "Arabic debit alert from the bank, with its own 600 number" },
  { id: "fa-bank-helpline-statement", type: "text", expect: "safe", input: "Your statement for September is ready in the app. For any questions call our bank helpline on 600 52 2229." },
  { id: "fa-ar-bank-never-ask-600", type: "text", expect: "safe", input: "تذكير من البنك: لن نطلب منك أبداً رمز التحقق أو كلمة المرور. للاستفسار اتصل بنا على 600 54 0000", note: "Arabic: the bank will never ask for your code or password; call 600 54 0000" },
  { id: "line-scam-blocked-official-otp", type: "text", expect: "scam", input: "ADCB alert: your debit card has been blocked due to suspicious activity. Call us immediately on 600 5 00 000 and confirm your card number and OTP to unblock it." },
  { id: "line-scam-suspended-mobile", type: "text", expect: "scam", input: "Emirates NBD: your account is suspended. Call our support team now on +971 55 123 4567 to reactivate." },
  { id: "line-scam-unusual-share-code", type: "text", expect: "scam", input: "Bank security: we noticed unusual activity on your account. Call 0501234567 now and share the code we sent you." },
  { id: "line-scam-closed-800-verify", type: "text", expect: "scam", input: "Dear customer, your bank account will be closed today. Call our support on 800 5 1234 and verify your details to keep it open." },
  { id: "line-scam-callback-press-1", type: "text", expect: "scam", input: "Your ADCB card ending 4401 was charged AED 3,499 at Apple. If not you, press 1 or call 600 5 00 000 immediately." },
  { id: "line-scam-ar-suspended-mobile", type: "text", expect: "scam", input: "بنك الإمارات دبي الوطني: تم إيقاف بطاقتك بسبب نشاط مشبوه. اتصل فوراً على 0551234567 لإعادة التفعيل", note: "Arabic: your card is stopped for suspicious activity, call a mobile number now" },
  { id: "line-scam-ar-600-send-code", type: "text", expect: "scam", input: "عزيزي العميل، تم تعليق حسابك. اتصل بنا على 600 54 0000 وأرسل رمز التحقق لإعادة التفعيل", note: "Arabic: account suspended, call 600 and send the verification code" },
  { id: "line-scam-ar-prize-800-code", type: "text", expect: "scam", input: "مبروك! ربحت جائزة نقدية، للاستلام اتصل على 800 5 1234 وأرسل رمز التحقق", note: "Arabic: you won a cash prize, call 800 and send the code" },

  // ── 2. Police warnings about scams ──
  { id: "fa-dubai-police-gold-warning", type: "text", expect: "safe", input: "Dubai Police warns: beware of fraudsters posing as gold dealers who offer gold bars at prices below the market and ask for a deposit. Always buy from licensed shops. Report on 901." },
  { id: "fa-ad-police-safe-account-warning", type: "text", expect: "safe", input: "Abu Dhabi Police warn the public: fraudsters pretend to be bank staff and ask for a bank transfer to a 'safe account'. Never transfer money to anyone who calls you." },
  { id: "warn-scam-unpaid-fine-transfer", type: "text", expect: "scam", input: "Dubai Police: you have an unpaid traffic fine of AED 1,500. Pay by bank transfer within 24 hours to avoid arrest." },
  { id: "warn-scam-beware-case-against-you", type: "text", expect: "scam", input: "Beware of delays! Dubai Police notice: a money laundering case has been opened against you. Pay the AED 5,000 deposit by bank transfer today to clear your name." },
  { id: "warn-scam-warning-fraud-case-deposit", type: "text", expect: "scam", input: "Warning from Abu Dhabi Police: your Emirates ID is linked to a fraud case. You must pay a refundable deposit of AED 3,000 by bank transfer or you will be arrested." },
  { id: "warn-scam-ar-fine-transfer", type: "text", expect: "scam", input: "شرطة دبي: عليك مخالفة مرورية غير مدفوعة بقيمة 1500 درهم، ادفع الآن عبر تحويل مصرفي خلال 24 ساعة وإلا سيتم اعتقالك", note: "Arabic: unpaid traffic fine, pay by bank transfer within 24 hours or be arrested" },

  // ── 3. Arrest news ──
  { id: "fa-police-arrested-wrong-number-gang", type: "text", expect: "safe", input: "Dubai Police arrested a gang that sent 'wrong number' messages and then offered to teach victims how to invest in gold. Victims lost AED 2 million." },
  { id: "fa-police-arrested-five-suspects", type: "text", expect: "safe", input: "Sharjah Police have arrested five suspects who posed as bank employees. Residents are reminded never to share card details." },
  { id: "arrest-scam-case-against-you", type: "text", expect: "scam", input: "This is the Dubai Police. A case has been filed against you. You will be arrested today unless you pay the AED 3,000 fine." },
  { id: "arrest-scam-son-bail-western-union", type: "text", expect: "scam", input: "Police arrested your son for drugs. Send AED 10,000 bail money now via Western Union and don't tell anyone." },
  { id: "arrest-scam-man-using-your-id", type: "text", expect: "scam", input: "Police have arrested a man using your Emirates ID. You must pay AED 2,000 today to clear your name." },
  { id: "arrest-scam-ar-warrant-fine", type: "text", expect: "scam", input: "معك النيابة العامة، صدر بحقك أمر اعتقال، ادفع الغرامة 3000 درهم فوراً لإلغائه", note: "Arabic: public prosecution, an arrest warrant was issued, pay the AED 3,000 fine now" },

  // ── 4. "Urgent sale" ──
  { id: "fa-marina-2br-urgent-sale", type: "text", expect: "safe", input: "Hi Mr Rashid, I have an offer for you: 2BR in Dubai Marina, AED 1.9 million, 8% net yield, motivated seller, urgent sale. Reply for details and viewing." },
  { id: "fa-jvc-studio-urgent-sale", type: "text", expect: "safe", input: "Urgent sale: studio in JVC, AED 520,000, owner relocating. Viewing this weekend, call me if interested." },
  { id: "rush-scam-car-deposit-transfer", type: "text", expect: "scam", input: "Urgent sale! Toyota Land Cruiser 2022 for AED 45,000 only, owner leaving the UAE. Pay a 5,000 AED deposit by bank transfer today to reserve it." },
  { id: "rush-scam-gold-cheap", type: "text", expect: "scam", input: "URGENT SALE!! 10 kilos of gold bars, cheap price, need to sell fast, papers complete. DM me" },
  { id: "rush-scam-iphone-half-price-link", type: "text", expect: "scam", input: "Urgent sale: iPhone 15 Pro sealed at half price, AED 1,500. Pay the deposit via the link to reserve: bit.ly/ip15deal" },
  { id: "rush-scam-ar-car-deposit", type: "text", expect: "scam", input: "عاجل: بيع سيارة لكزس 2023 بسعر 30 ألف درهم فقط بسبب السفر، حوّل العربون 5000 درهم الآن لحجزها", note: "Arabic: urgent, Lexus for only AED 30k due to travel, transfer the AED 5,000 deposit now" },

  // ── 5. Sextortion words ──
  { id: "fa-villa-valuation-came-in", type: "text", expect: "safe", input: "Your villa valuation came in at AED 6.5 million. A buyer is offering 5% below the asking price for a quick sale, all documents ready. Do you want to proceed?" },
  { id: "fa-see-you-on-campus", type: "text", expect: "safe", input: "See you on campus tomorrow at 9" },
  { id: "fa-wedding-video-of-you", type: "text", expect: "safe", input: "Here is the video of you dancing at the wedding, so cute" },
  { id: "fa-webcam-meeting", type: "text", expect: "safe", input: "Is your webcam working for the 3pm meeting?" },
  { id: "sext-scam-webcam-bitcoin", type: "text", expect: "scam", input: "I recorded you on your webcam while you were watching adult videos. Send $800 in Bitcoin within 48 hours or I will share the video with all your contacts." },
  { id: "sext-scam-private-photos-pay", type: "text", expect: "scam", input: "I have hacked your phone camera and have private photos of you. Pay 2,000 AED or your family sees everything." },
  { id: "sext-scam-on-cam-unless", type: "text", expect: "scam", input: "I know what you did on cam last night. Unless you transfer 500 USD today, the video goes to your friends." },
  { id: "sext-scam-webcam-before-i-send", type: "text", expect: "scam", input: "I recorded you through your webcam. Contact me on this email before I send the video to all your contacts." },
  { id: "sext-scam-ar-private-photos", type: "text", expect: "scam", input: "لدي صور خاصة لك، ادفع 3000 درهم وإلا سأرسلها لجهات اتصالك", note: "Arabic: I have private photos of you, pay AED 3,000 or I send them to your contacts" },
  { id: "sext-scam-ar-transfer-publish", type: "text", expect: "scam", input: "سجلتك بالكاميرا وعندي صور خاصة لك، إذا ما حولت 5000 درهم سأنشرها لأهلك", note: "Arabic: I recorded you, if you don't transfer AED 5,000 I publish them to your family" },

  // ── 6. Work from home ──
  { id: "fa-widow-looking-for-work", type: "text", expect: "safe", input: "Hello, I'm Mariam, a widow from Abu Dhabi. I'm looking for part time work from home and I can help with bookkeeping. My late husband was an accountant and taught me. Please let me know if you have any openings." },
  { id: "fa-wfh-friday-plumber", type: "text", expect: "safe", input: "Work from home on Friday? I have a plumber coming in the morning." },
  { id: "fa-sister-looking-for-wfh", type: "text", expect: "safe", input: "My sister is looking for work from home, she is a translator. Do you know anyone hiring?" },
  { id: "wfh-scam-earn-per-day", type: "text", expect: "scam", input: "Work from home and earn 300 AED per day, no experience needed. Message our HR on WhatsApp." },
  { id: "wfh-scam-are-you-looking", type: "text", expect: "scam", input: "Are you looking for part time work from home? Earn $500 weekly liking videos. Reply YES to start." },
  { id: "wfh-scam-we-are-looking-staff", type: "text", expect: "scam", input: "We are looking for work from home staff, salary 5,000 AED a month, no experience. Apply on WhatsApp." },
  { id: "wfh-scam-ar-daily-salary", type: "text", expect: "scam", input: "وظيفة عمل من المنزل براتب يومي 300 درهم بدون خبرة، تواصل معنا على واتساب", note: "Arabic: work from home job, daily salary AED 300, no experience, WhatsApp us" },

  // ── 7. No guaranteed return ──
  { id: "fa-ar-no-guaranteed-return-khalid", type: "text", expect: "safe", input: "ما في عائد مضمون في السوق يا خالد، أي واحد يقول لك أرباح مضمونة فهو يكذب. أنا ربحت 6% هذه السنة بالتداول وخسرت قبلها.", note: "Arabic: there is no guaranteed return, Khalid; anyone who promises guaranteed profit is lying. I made 6% this year trading and lost before" },
  { id: "fa-no-guaranteed-returns-sara", type: "text", expect: "safe", input: "There are no guaranteed returns in the stock market, Sara. I made 5% last year and lost 3% the year before." },
  { id: "guar-scam-group-20-monthly", type: "text", expect: "scam", input: "Join our trading group: guaranteed returns of 20% every month, no risk. Deposit 1,000 USDT to start." },
  { id: "guar-scam-not-a-scam-bot", type: "text", expect: "scam", input: "This is not a scam! Guaranteed returns of 15% weekly with our crypto bot. DM me to join." },
  { id: "guar-scam-ar-30-monthly", type: "text", expect: "scam", input: "استثمر معنا بعائد مضمون 30% شهرياً، أرسل المبلغ عبر تحويل مصرفي وابدأ اليوم", note: "Arabic: invest with us, guaranteed 30% monthly, send the money by bank transfer" },
  { id: "guar-scam-ar-you-won-prize", type: "text", expect: "scam", input: "مبروك! لقد ربحت جائزة 10000 درهم، أرسل رقم بطاقتك ورمز التحقق لاستلامها", note: "Arabic: congratulations, you won AED 10,000, send your card number and code" },

  // ── 8. "I'd love to" ──
  { id: "fa-uncle-gold-trading-love-to-learn", type: "text", expect: "safe", input: "Hi uncle, I got your number from Baba. I'm Omar, I work in gold trading at a jewellery group and I'd love to learn from your experience investing in real estate. Profit margins in gold are small." },
  { id: "fa-gold-trading-seminar-invite", type: "text", expect: "safe", input: "We'd love to invite you to our gold trading seminar at the DMCC on Sunday. Entry is free, registration at the door." },
  { id: "love-scam-my-love-platform", type: "text", expect: "scam", input: "Good morning my love, I made 5,000 USDT on my gold trading platform this week. I want our future together, let me teach you step by step." },
  { id: "love-scam-sweetheart-mentor", type: "text", expect: "scam", input: "I love you sweetheart. My uncle is a trading mentor, join the crypto trading platform and double your money." },
  { id: "love-scam-id-love-my-dear", type: "text", expect: "scam", input: "I'd love to see you soon my dear. Invest with my broker on this trading platform, guaranteed returns of 30% a month." },

  // ── 9. Lost property ──
  { id: "fa-lost-property-sgt-wallet", type: "text", expect: "safe", input: "This is Sgt. Mohammed from the lost property office at the police station. We found your wallet with cash inside. You may send a trusted person with your Emirates ID to collect it." },
  { id: "fa-lost-and-found-sergeant-wallet", type: "text", expect: "safe", input: "This is Sergeant Hamdan from the police lost-and-found. We found your wallet with cash and cards. Collect it with your Emirates ID or send a trusted person." },
  { id: "fa-found-wallet-in-taxi", type: "text", expect: "safe", input: "Hi, I think I found your wallet in the taxi, it has your Emirates ID inside. Where can I drop it?" },
  { id: "fa-police-station-renew-report", type: "text", expect: "safe", input: "I was at the police station to renew my report, took 2 hours." },
  { id: "lost-scam-wallet-seed-phrase", type: "text", expect: "scam", input: "Binance: your wallet is frozen. Verify your wallet now by entering your seed phrase at binance-verify.com" },
  { id: "lost-scam-wallet-address-btc-fine", type: "text", expect: "scam", input: "Interpol: we found your wallet address linked to illegal activity. Pay the 0.5 BTC fine to unfreeze it." },
  { id: "lost-scam-come-to-station-warrant", type: "text", expect: "scam", input: "Dubai Police: you must come to the police station within 24 hours or a warrant will be issued for your arrest." },
  { id: "lost-scam-wallet-fee-id-card", type: "text", expect: "scam", input: "Lost property office: we found your wallet. To release it, pay the AED 200 handling fee by bank transfer and send a copy of your Emirates ID and bank card on WhatsApp." },
  { id: "lost-scam-wallet-send-code", type: "text", expect: "scam", input: "Police lost and found: we have your wallet. Send us the 6 digit code we just sent to your phone to confirm it is yours." },
  { id: "lost-scam-ar-wallet-card-photo", type: "text", expect: "scam", input: "شرطة دبي: وجدنا محفظتك. لاستلامها أرسل صورة بطاقتك البنكية من الجهتين ورمز التحقق", note: "Arabic: we found your wallet, send a photo of your bank card both sides and the code" },

  // ── 10. Visit a branch in person ──
  { id: "fa-dormant-account-visit-branch", type: "text", expect: "safe", input: "Your dormant account at the bank has been identified. Visit any branch with your Emirates ID to reactivate. You may nominate a trusted person to act for you." },
  { id: "branch-scam-dormant-click-link", type: "text", expect: "scam", input: "Your dormant account at the bank has been identified. To reactivate it, click https://bank-reactivate.top and enter your card details." },
  { id: "branch-scam-branch-or-mobile", type: "text", expect: "scam", input: "Your ADCB account has been suspended. Visit any branch or call us on 0551234567 to reactivate within 24 hours." },
  { id: "branch-scam-branch-or-reply-pin", type: "text", expect: "scam", input: "Your bank account is blocked. Visit any branch or reply with your Emirates ID number and card PIN to reactivate." },
  { id: "branch-scam-ar-branch-or-code", type: "text", expect: "scam", input: "تم إيقاف حسابك البنكي. قم بزيارة أقرب فرع أو أرسل رمز التحقق لإعادة التفعيل", note: "Arabic: your account is stopped, visit a branch or send the verification code" },

  // ── 11. Service time, not a deadline ──
  { id: "fa-refund-policy-within-7-days", type: "text", expect: "safe", input: "This is general information about the refund policy. If you return the item you will receive 80% of the money paid, within 7 days." },
  { id: "fa-refund-credited-within-5-days", type: "text", expect: "safe", input: "Thanks for your order. Your refund will be credited to your card within 5 days." },
  { id: "time-scam-pay-fee-within-24h", type: "text", expect: "scam", input: "Your refund of AED 850 has been approved. Pay the AED 25 processing fee within 24 hours to receive it." },
  { id: "time-scam-returned-unless-pay", type: "text", expect: "scam", input: "Your package will be returned within 24 hours unless you pay the customs fee at https://emiratespost-fee.top" },
  { id: "time-scam-confirm-card-within-12h", type: "text", expect: "scam", input: "Tax refund: you are owed AED 1,240. Confirm your card details within 12 hours or the refund will be cancelled: https://refund-uae.top" },
  { id: "time-scam-ar-fee-within-24h", type: "text", expect: "scam", input: "تم قبول استرداد مبلغ 850 درهم، ادفع رسوم 25 درهم خلال 24 ساعة لاستلامه", note: "Arabic: refund approved, pay a AED 25 fee within 24 hours to receive it" },
];
