// UAE and Gulf messages, half Arabic and half English: bank, telecom and
// government impersonation, traffic fines, Emirates ID, visa, parcel customs,
// prize draws, job offers, crypto and forex, plus the legitimate notices
// people in the region really receive. Made-up sample data only.
export const CASES = [
  // ── Bank and card impersonation ──
  { id: "enbd-card-blocked-ar", type: "text", expect: "scam", input: "بنك الإمارات دبي الوطني: تم إيقاف بطاقتك مؤقتاً بسبب محاولة دخول غير معتادة. لإعادة التفعيل يرجى تحديث بياناتك عبر الرابط emiratesnbd-verify.com/ae", note: "Arabic card-block lure with a look-alike link written without https://" },
  { id: "adcb-obfuscated-card-en", type: "text", expect: "scam", input: "ADCB A1ert: Y0ur debit card has been b1ocked due to susp1cious act1vity. Un-block n0w: adcb.com.verify-card.info", note: "0/1 substitutions; the brand sits in a subdomain of a lure domain" },
  { id: "mashreq-payee-added-en", type: "text", expect: "scam", input: "Mashreq: a new payee AL NOOR TRADING LLC was added to your account today. If this was not you, cancel it immediately at mashreq-secure.co/cancel", note: "No classic keywords except a look-alike link; the fear is a payee you did not add" },

  // ── Telecom, utilities and toll ──
  { id: "etisalat-obfuscated-bill-en", type: "text", expect: "scam", input: "Etisa1at: your l1ne will be disconnected today due to an unpaid bill of AED 95. Pay before 6pm to keep your number active: etisalat-bill-pay.com", note: "Typo-brand with a 1 for l; deobfuscation turns it into 'etisaiat', not 'etisalat'" },
  { id: "du-cutoff-ar", type: "text", expect: "scam", input: "دو: فاتورتك متأخرة وسيتم قطع الخدمة خلال 24 ساعة. ادفع الآن لتجنب رسوم إعادة التوصيل du-pay-bill.net" },
  { id: "etisalat-points-expiry-ar", type: "text", expect: "scam", input: "اتصالات: نقاطك 4,500 ستنتهي اليوم! استبدلها الآن بهدية مجانية من متجرنا e-and-rewards.com/points", note: "Loyalty-points expiry lure, a very common UAE smishing theme; the link has no brand token" },
  { id: "dewa-overdue-en", type: "text", expect: "scam", input: "DEWA: Your electricity bill of AED 312.40 is overdue. Service will be disconnected tonight. Pay here to avoid reconnection charges dewa-bills-ae.com/pay" },
  { id: "salik-negative-balance-ar", type: "text", expect: "scam", input: "سالك: رصيدك سالب. أعد التعبئة الآن لتجنب غرامة 100 درهم على كل عبور salik-recharge.com" },

  // ── Government: fines, Emirates ID, visa, UAE Pass ──
  { id: "police-traffic-fine-ar", type: "text", expect: "scam", input: "شرطة دبي: لديك مخالفة مرورية بقيمة 600 درهم. سدد خلال 48 ساعة لتجنب حجز المركبة dubaipolice-fines.ae" },
  { id: "uaepass-deactivate-en", type: "text", expect: "scam", input: "UAE PASS: Your account will be deactivated in 24 hours because your Emirates ID details are outdated. Re-verify here: uaepass-verify.com" },
  { id: "eid-renewal-fee-ar", type: "text", expect: "scam", input: "الهيئة الاتحادية للهوية: انتهت صلاحية هويتك الإماراتية. جدد الآن وادفع الرسوم عبر icp-renewal.com لتجنب الغرامة" },
  { id: "visa-overstay-fine-en", type: "text", expect: "scam", input: "Immigration Department UAE: your visa is under review for overstay. A fine of AED 1,250 must be settled within 48 hours to avoid deportation. Settle at gdrfa-fines.com/settle" },
  { id: "moi-summons-phone-ar", type: "text", expect: "scam", input: "وزارة الداخلية: صدر بحقك أمر استدعاء بسبب قضية غسيل أموال مرتبطة بهويتك. للتواصل مع الضابط المختص اتصل فوراً على 800 000 0000 ولا تخبر أحداً", note: "Digital-arrest style: authority, secrecy and a phone number; no link" },

  // ── Parcel and customs ──
  { id: "aramex-customs-ar", type: "text", expect: "scam", input: "أرامكس: شحنتك معلقة في الجمارك. يرجى دفع رسوم جمركية 15 درهم لإكمال التوصيل aramex-ae-delivery.com" },
  { id: "noon-mixed-order-card-ar", type: "text", expect: "scam", input: "شكراً لتسوقك من نون! طلبك رقم NAE1234 تم شحنه وسيصلك خلال يومين. ملاحظة: بسبب تحديث النظام يرجى تأكيد بيانات بطاقتك لتجنب إلغاء الطلب noon-ae-orders.com/confirm", note: "Safe-looking order update with a card-confirmation lure at the end" },
  { id: "eid-delivery-fee-short-en", type: "text", expect: "scam", input: "Ur Emirates ID is ready. Pay delivery fee AED 20: emiratesid-delivery.com", note: "Short SMS with text-speak" },

  // ── Prize draws, jobs, crypto and forex ──
  { id: "prize-draw-ar", type: "text", expect: "scam", input: "مبروك! رقمك فاز بجائزة 20,000 درهم في سحب نون الشهري. للاستلام أرسل اسمك ورقم بطاقتك على واتساب 050 000 0000", note: "Prize plus a card-number request in Arabic, no link and no deadline" },
  { id: "etisalat-draw-emirates-id-en", type: "text", expect: "scam", input: "Congratulations! Your mobile number has won AED 100,000 in the Etisalat Anniversary Draw. Send your name and Emirates ID copy to claim your prize.", note: "AED amounts are not counted as a money signal" },
  { id: "job-recruitment-fee-en", type: "text", expect: "scam", input: "Dear candidate, Emirates Group HR has selected your CV for a Customer Service role in Dubai, salary AED 9,500 plus housing. To process your visa, pay a refundable AED 350 medical fee to our agent. Reply for the payment details.", note: "Advance-fee job scam: pay to get the job" },
  { id: "hr-onboarding-card-photo-en", type: "text", expect: "scam", input: "Hi, this is Ahmed from the HR team. Your onboarding is complete, welcome aboard! One last step: HR needs your Emirates ID front and back plus a photo of your bank card, both sides including the 3 digits on the back, for salary setup. Send them here on WhatsApp today.", note: "Friendly onboarding that asks for the CVV" },
  { id: "crypto-guaranteed-ar", type: "text", expect: "scam", input: "استثمر في البيتكوين مع خبرائنا وحقق عائد مضمون 15% شهرياً. ابدأ بـ 1000 درهم فقط، وسحب الأرباح يومياً. تواصل معنا على واتساب" },
  { id: "forex-signals-en", type: "text", expect: "scam", input: "Dubai based forex signals group, our members made 40% last week. Minimum deposit $250 with our regulated broker, profits withdrawn daily to your bank. DM me to join before the group closes.", note: "Investment pitch with no link and no threat" },

  // ── OTP relay in Arabic ──
  { id: "otp-relay-ar", type: "text", expect: "scam", input: "أهلاً، أرسل لي رمز التحقق اللي وصلك على جوالك بسرعة لو سمحت، ضغطت على رقمك بالغلط", note: "Send me the code that reached you: the Arabic OTP-relay wording" },

  // ── Links ──
  { id: "link-rta-fines", type: "link", expect: "scam", input: "https://rta-fines-check.com/pay" },
  { id: "link-du-bill-noscheme", type: "link", expect: "scam", input: "du-ae-bill.com/pay" },
  { id: "link-enbd-digit-typo", type: "link", expect: "scam", input: "https://em1ratesnbd.com/login" },

  // ── Legitimate messages that should stay NOT A SCAM ──
  { id: "dewa-bill-en", type: "text", expect: "safe", input: "DEWA: Your bill for September 2026 is AED 412.30, due on 12 October. You can pay through the DEWA app, dewa.gov.ae or any authorised payment channel." },
  { id: "salik-topup-ar", type: "text", expect: "safe", input: "سالك: تمت إضافة 100 درهم إلى حسابك بنجاح. رصيدك الحالي 143.50 درهم. شكراً لاستخدامك سالك." },
  { id: "enbd-otp-en", type: "text", expect: "safe", input: "Emirates NBD: 482913 is your OTP for a purchase of AED 349.00 at NOON. Valid for 3 minutes. Never share this code with anyone, not even bank staff." },
  { id: "adcb-otp-ar", type: "text", expect: "safe", input: "بنك أبوظبي التجاري: رمز التحقق لعملية الشراء بقيمة 250 درهم هو 573921. لا تشارك هذا الرمز مع أي شخص، البنك لن يطلبه منك أبداً.", note: "A real bank OTP delivery in Arabic with the standard do-not-share warning" },
  { id: "mashreq-txn-alert-ar", type: "text", expect: "safe", input: "بنك المشرق: تمت عملية شراء بقيمة 89.00 درهم من كارفور باستخدام بطاقتك المنتهية بـ 4412 في 14:32. إن لم تكن أنت، اتصل بنا على الرقم خلف بطاقتك." },
  { id: "uaepass-signin-alert-en", type: "text", expect: "safe", input: "UAE PASS: You have successfully signed in on a new device (iPhone) at 09:14. If this was not you, change your password from the UAE PASS app." },
  { id: "icp-renewal-received-ar", type: "text", expect: "safe", input: "الهيئة الاتحادية للهوية والجنسية: تم استلام طلب تجديد الهوية الإماراتية الخاص بك، مدة الإنجاز 3 أيام عمل. ستصلك رسالة عند جاهزية البطاقة." },
  { id: "eand-data-usage-en", type: "text", expect: "safe", input: "e&: You have used 80% of your 20GB data. Your plan renews on 1 October. To add data, use the e& app or dial *170#." },
  { id: "aramex-out-for-delivery-en", type: "text", expect: "safe", input: "Aramex: Your shipment 4471 8823 0091 is out for delivery today between 2pm and 6pm. No payment is required. Track it at aramex.com" },
  { id: "epost-arrival-ar", type: "text", expect: "safe", input: "بريد الإمارات: طردك رقم EE123456789AE وصل إلى مركز التوزيع وسيتم توصيله غداً. لا حاجة لأي إجراء من طرفك." },
  { id: "dentist-reminder-ar", type: "text", expect: "safe", input: "تذكير: موعدك في عيادة الأسنان يوم الثلاثاء الساعة 4:30 مساءً. للإلغاء أو التغيير يرجى الاتصال بالعيادة." },
  { id: "school-holiday-ar", type: "text", expect: "safe", input: "أولياء الأمور الكرام، غداً إجازة بمناسبة اليوم الوطني ويستأنف الدوام يوم الاثنين. نتمنى لكم عطلة سعيدة." },

  // ── Links on official Gulf domains ──
  { id: "link-adcb-official", type: "link", expect: "safe", input: "https://www.adcb.com/en/personal/accounts/" },
  { id: "link-salik-official", type: "link", expect: "safe", input: "https://www.salik.ae/en" },
  { id: "link-enbd-noscheme", type: "link", expect: "safe", input: "emiratesnbd.com/en/help/otp" },

  // ── Bare links on unknown domains ──
  { id: "link-parking-rates", type: "link", expect: "unverified", input: "https://dubai-mall-parking-rates.net/info" },
  { id: "link-sharjah-events", type: "link", expect: "unverified", input: "sharjah-events.ae/october" },
];
