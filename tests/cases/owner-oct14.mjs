// Two families the owner reported on 14 Oct 2026 that the engine scored
// NOT A SCAM (3), plus everyday look-alikes that must stay NOT A SCAM.
//
//  1. Wrong-number / "pig butchering" opener: a "sorry, wrong number" text
//     that turns into "I am a gold trader, I can teach you to invest".
//  2. Advance-fee "trunk box": a soldier, diplomat or lawyer with a box or
//     consignment of hidden money who wants help moving it for a percentage.
//
// Both rules need parts together (the opener or the story, AND the investing
// hook or the fortune plus the share/help ask), never a single keyword.
// The second half of the file holds what the two hunters found on the first
// version of the rules: look-alikes it wrongly called a scam, and scam
// wordings it missed (typos, curly apostrophes, "Mr." dots, Arabic digits).
// Made-up sample data only.
export const CASES = [
  // ── 1. Wrong-number investment opener (scam) ──
  { id: "wrongnum-gold-dubai-teach", type: "text", expect: "scam", input: "Hi Sarah, sorry wrong number haha... I am a gold trader in Dubai. Since we met by fate, maybe I can teach you how to invest 😊", note: "owner's example 1" },
  { id: "wrongnum-oops-add-whatsapp", type: "text", expect: "scam", input: "Oops wrong number... I invest in gold and can teach you how to make money, add me on WhatsApp", note: "owner's example 2" },
  { id: "wrongnum-crypto-analyst-show", type: "text", expect: "scam", input: "Hello, is this David? Oh sorry, I must have the wrong number. Nice to meet you anyway! I'm Lily, I work as a crypto investment analyst in Singapore. If you want I can show you how I earn extra income every week." },
  { id: "wrongnum-typos-forex", type: "text", expect: "scam", input: "sory wrong numbr lol 😂 im jenny, i do forex tradeing for a living, i can teach u how to make profit easy 💰💰", note: "typos and emoji" },
  { id: "wrongnum-wrong-person-guide", type: "text", expect: "scam", input: "Sorry, I texted the wrong person. I was asking my assistant about the gold market. Do you invest too? I can guide you, my mentor sends signals and the profit is very good." },
  { id: "wrongnum-stock-learn-free", type: "text", expect: "scam", input: "Hi Mr. Ahmed, is the meeting still at 3? ... Sorry, wrong number! I'm Mia, a stock trader. Would you like to learn how to invest? I can teach you for free." },
  { id: "wrongnum-ar-gold-teach", type: "text", expect: "scam", input: "مرحبا، آسف أخطأت الرقم 🙏 أنا أعمل في تداول الذهب في دبي، إذا تحب أعلمك الاستثمار وتربح من البيت", note: "Arabic: sorry, wrong number; I work in gold trading; I can teach you investing" },
  { id: "wrongnum-ar-crypto-whatsapp", type: "text", expect: "scam", input: "عفواً رقم خطأ. على كل حال تشرفنا، أنا مستثمر في العملات الرقمية وأقدر أعلمك كيف تربح دخل إضافي، أضفني على الواتساب" },
  { id: "wrongnum-ar-ghalat-learn", type: "text", expect: "scam", input: "السلام عليكم، يبدو اني غلطت بالرقم 😅 انا متداولة فوركس، تحبي تتعلمي التداول؟ اقدر اساعدك تربحي من الجوال" },

  // ── 2. Advance-fee "trunk box" / consignment / officer funds (scam) ──
  { id: "trunkbox-army-syria-30", type: "text", expect: "scam", input: "I am an army officer serving in Syria, I have a trunk box of funds and need your help to move it, you will receive 30%", note: "owner's example" },
  { id: "trunkbox-sgt-afghanistan-40", type: "text", expect: "scam", input: "Greetings, I am Sgt. Monica Brown, a US soldier on a peacekeeping mission in Afghanistan. We recovered some funds ($4.5 million) and I need a trusted partner to receive the consignment. 40% is yours." },
  { id: "trunkbox-diplomat-airport-25", type: "text", expect: "scam", input: "Dear friend, I am a diplomat attached to the UN. There is a consignment box containing USD 7.5M at the airport registered in your name, I need your help to claim it. You will get 25% of the total sum." },
  { id: "trunkbox-typos-captain-iraq", type: "text", expect: "scam", input: "hello dear 🙏 im captain james from US army in iraq, we found trunk boxes with money in a raid, pls help me move them out of the country, ur share is 35%", note: "typos and emoji" },
  { id: "trunkbox-barrister-next-of-kin", type: "text", expect: "scam", input: "I am Barrister Mike Peters, lawyer to the late Mr. Johnson who died with no next of kin. He left $9.2 million in a dormant account. I want to present you as the beneficiary and we share it 50/50." },
  { id: "trunkbox-general-gold-bars", type: "text", expect: "scam", input: "My name is General Robert Fox. I have two boxes containing gold bars and cash kept with a security company. I need a foreign partner to receive them on my behalf; you will be compensated with 20%." },
  { id: "trunkbox-ar-officer-syria", type: "text", expect: "scam", input: "أنا ضابط في الجيش الأمريكي أخدم في سوريا، لدي صندوق أموال وأحتاج مساعدتك في نقله إلى بلدك، وستحصل على 30% من المبلغ", note: "Arabic: army officer, a box of money, you will get 30%" },
  { id: "trunkbox-ar-diplomat-airport", type: "text", expect: "scam", input: "تحية طيبة، أنا دبلوماسي ولدي شحنة أموال بقيمة 5 مليون دولار محتجزة في المطار، أحتاج شخص موثوق لاستلامها، ونصيبك 40%" },

  // ── Look-alikes that must stay NOT A SCAM ──
  { id: "fp-sorry-wrong-number", type: "text", expect: "safe", input: "Sorry, wrong number!" },
  { id: "fp-wrong-number-sister", type: "text", expect: "safe", input: "Oh sorry, wrong number, I was trying to reach my sister. Have a good day!" },
  { id: "fp-wrong-number-good-luck", type: "text", expect: "safe", input: "Sorry wrong number 😅 but good luck with your exam tomorrow!" },
  { id: "fp-you-have-wrong-number", type: "text", expect: "safe", input: "I think you have the wrong number, this is Omar not Sami." },
  { id: "fp-wrong-number-my-gold-investment", type: "text", expect: "safe", input: "Sorry, wrong number. I meant to send this to my financial advisor: please move the meeting about my gold investment to Thursday." },
  { id: "fp-uncle-gold-trader", type: "text", expect: "safe", input: "My uncle is a gold trader in Dubai, he says prices went up again this week." },
  { id: "fp-friend-teach-investing", type: "text", expect: "safe", input: "If you want, I can teach you the basics of investing this weekend, just bring a notebook. You don't need to buy anything." },
  { id: "fp-teach-excel", type: "text", expect: "safe", input: "I can teach you Excel this weekend if you want, pivot tables are easy." },
  { id: "fp-broker-newsletter", type: "text", expect: "safe", input: "Sarwa Learn: this week we explain how index funds work and why diversification matters. Investing involves risk and past performance is not a guarantee of future results." },
  { id: "fp-news-army-officer", type: "text", expect: "safe", input: "News: an army officer serving in Syria was honoured for rescuing civilians during the floods." },
  { id: "fp-news-diplomat-consignment", type: "text", expect: "safe", input: "The diplomat said the consignment of humanitarian aid reached the border on Monday." },
  { id: "fp-trunk-in-car", type: "text", expect: "safe", input: "The trunk is in the car, I left the box of books there for you." },
  { id: "fp-brother-army-box", type: "text", expect: "safe", input: "My brother is in the army and serving abroad, he sent a box of gifts for the kids, it should arrive next week." },
  { id: "fp-charity-fundraiser", type: "text", expect: "safe", input: "Our school is raising funds for the Red Crescent flood appeal. Every dirham helps, you can donate at the school office this week." },
  { id: "fp-colleague-30-discount", type: "text", expect: "safe", input: "Hey, Carrefour has 30% off all coffee machines this week, and you will get 30% back as points if you pay with the app." },
  { id: "fp-bake-sale-share", type: "text", expect: "safe", input: "We'll share the money from the bake sale 50/50, you made half the cupcakes!" },
  { id: "fp-grandma-inheritance", type: "text", expect: "safe", input: "The lawyer called about grandma's inheritance, we need to sign the papers at the notary on Sunday." },
  { id: "fp-ar-wrong-number", type: "text", expect: "safe", input: "عفواً أخطأت الرقم، كنت أبحث عن محل الحلويات" },
  { id: "fp-ar-uncle-gold", type: "text", expect: "safe", input: "خالي يعمل في تداول الذهب في دبي وقال إن الأسعار ارتفعت هذا الأسبوع" },
  { id: "fp-ar-news-officer", type: "text", expect: "safe", input: "ضابط في الجيش يتسلم وسام الشجاعة بعد عملية إنقاذ في سوريا" },
  { id: "fp-ar-discount-30", type: "text", expect: "safe", input: "خصم 30% على جميع المنتجات هذا الأسبوع، وستحصل على 30% إضافية عند الدفع بالتطبيق" },
  { id: "fp-ar-charity-box", type: "text", expect: "safe", input: "ساهموا في صندوق التبرعات للمدرسة، 30% من المبلغ يذهب للهلال الأحمر" },
  // One half without the other.
  { id: "fp-wrong-number-broker-no-offer", type: "text", expect: "safe", input: "Sorry wrong number. I'm a stock broker and thought you were my client Ali. Have a nice day.", note: "opener + trader, but no offer and no money talk" },
  { id: "fp-got-number-tutor", type: "text", expect: "safe", input: "I got your number from Fatima, I'm the maths tutor. I can teach you algebra on Saturdays.", note: "stranger opener + 'teach you', but nothing about investing" },
  { id: "fp-news-general-funds", type: "text", expect: "safe", input: "As the army general said, the funds for the new hospital were approved, you will get 30% more beds.", note: "officer + funds + 30%, but the sender is not introducing themself as the officer" },
  // Warnings that describe the scams in their own words.
  { id: "fp-warning-wrong-number", type: "text", expect: "safe", input: "Beware: scammers send a 'sorry, wrong number' text, then say they are gold traders who can teach you how to invest. Don't reply." },
  { id: "fp-warning-trunk-box-ar", type: "text", expect: "safe", input: "تحذير: المحتالون يدّعون أنهم ضباط في الجيش ولديهم صندوق أموال ويعدونك بنسبة 30% مقابل مساعدتهم في نقله" },

  // ── Hunter round: scam wordings the first version missed ──
  { id: "hunt-wrongnum-add-whatsapp", type: "text", expect: "scam", input: "Hello dear, is this Mr. Ahmed? Sorry I think I have the wrong number. I'm Jessica, I work in gold trading in Dubai. Can I add you on WhatsApp?", note: "trader + contact ask, no 'teach'" },
  { id: "hunt-wrongnum-wrong-no-earn", type: "text", expect: "scam", input: "wrong no. sorry. i trade gold with my uncle, we earn 800 usd weekly, u want join?", note: "'wrong no.' and a profit boast" },
  { id: "hunt-wrongnum-curly-apostrophe", type: "text", expect: "scam", input: "Sorry wrong number. I’m a gold trader in Dubai and the profit is great, it’s a good time to join", note: "curly apostrophes" },
  { id: "hunt-wrongnum-ellipses", type: "text", expect: "scam", input: "Sorry wrong number... I'm a gold trader... I can teach you... how to invest", note: "'...' used to cut the sentence window" },
  { id: "hunt-wrongnum-investor-boast", type: "text", expect: "scam", input: "Hi, sorry wrong number. I'm Grace from Taiwan. I'm an investor and I just made $3,200 today, I'll show you how if you'd like" },
  { id: "hunt-wrongnum-into-crypto", type: "text", expect: "scam", input: "sorry wrong chat 😅 are you into crypto? I've got a really good platform where you deposit USDT and receive profit every 24h" },
  { id: "hunt-wrongnum-help-friends-earn", type: "text", expect: "scam", input: "Sorry wrong number. Btw I saw your profile pic, you look very kind. I work in cryptocurrency and I help my friends to earn a stable monthly income." },
  { id: "hunt-wrongnum-hinglish", type: "text", expect: "scam", input: "Sorry, galat number. Main gold trader hoon Dubai mein, tumhe invest karna sikha sakta hoon, achha profit hai", note: "Roman Hindi/Urdu" },
  { id: "hunt-wrongnum-ar-noun-offer", type: "text", expect: "scam", input: "مرحبا، اعتذر يبدو أن الرقم خطأ. أنا أعمل في تجارة الذهب في دبي وأستطيع مساعدتك في الاستثمار", note: "Arabic: 'I can help you with investing' (noun form)" },
  { id: "hunt-wrongnum-ar-double-money", type: "text", expect: "scam", input: "عفواً أرسلت لك رسالة بالخطأ. أنا مدير استثمار في شركة دبي للذهب، يمكنك أن تضاعف أموالك خلال شهر معي", note: "Arabic: double your money in a month" },
  { id: "hunt-wrongnum-vague-referral", type: "text", expect: "scam", input: "I got your number from the business group. I am a professional gold investor and can guide you to earn 5k a month" },
  { id: "hunt-trunkbox-mr-dot", type: "text", expect: "scam", input: "Dear friend, I am Mr. Peter Hall, a US Army officer serving in Iraq. I have $5 million in cash and I need a partner. You will receive 30%.", note: "the dot in 'Mr.' used to cut the window" },
  { id: "hunt-trunkbox-give-you", type: "text", expect: "scam", input: "Dear, my name is Lt. Col. Sarah Miller, I work with the US Army in Iraq. I have a box of gold and cash I want to send to you for safekeeping until I retire. I will give you 35%." },
  { id: "hunt-trunkbox-typos", type: "text", expect: "scam", input: "Dear frend,\n\nI am Capt. John Walker from US army serving in Afganistan. I have a trunck box with 4.5 million usd, i need ur help 2 move it out. U will recieve 35%\n\nReply me on my private email.", note: "typos" },
  { id: "hunt-trunkbox-percent-word", type: "text", expect: "scam", input: "dear, i am sgt jones us army in syria. i have box of cash 6 million usd. u will get 30 percent. reply fast" },
  { id: "hunt-trunkbox-secrecy-not-warning", type: "text", expect: "scam", input: "Hi dear, I am Lt. Anna Cole of the US Army in Syria. I have 2 boxes with 7 million dollars that I want you to keep for me, I will give you 30% of it. Please do not share this with anyone.", note: "'do not share this' is secrecy, not a warning" },
  { id: "hunt-namesake-50-50", type: "text", expect: "scam", input: "Good day, I'm Mr. Wong, Operations Manager at HSBC Hong Kong. A client with the same surname as you died with $27m in his account, we need you to stand as next of kin. 50/50." },
  { id: "hunt-barrister-act-as-kin", type: "text", expect: "scam", input: "I am Barrister Daniel, I want you to act as next of kin to my deceased client. Share will be 50/50. Reply with your details.", note: "no amount at all" },
  { id: "hunt-diplomat-clearance-fee", type: "text", expect: "scam", input: "Mr. Peter Smith, Diplomatic Courier Services. We have a consignment box addressed to you containing $2.5M. To release it, pay the diplomatic clearance fee $450." },
  { id: "hunt-widow-through-you", type: "text", expect: "scam", input: "I am Mrs. Sarah Johnson, a dying widow from Texas. I want to give my $3.5M inheritance to you since I have no children. Please reply for details." },
  { id: "hunt-trunkbox-ar-indic-digits", type: "text", expect: "scam", input: "انا ضابط امريكي في سوريا لدي مبلغ ٣ ملايين دولار اريد ارسالها لك في صندوق وسوف تحصل على ٣٠٪", note: "Arabic-Indic digits and ٪" },
  { id: "hunt-bank-ar-no-heirs", type: "text", expect: "scam", input: "اخوي انا مسؤول في بنك وعندي حساب لعميل متوفي فيه 10 مليون درهم ما له ورثة، ابيك تكون الوريث ونقسمها بالنص", note: "Gulf Arabic: dead client, no heirs, split in half" },

  // ── Hunter round: look-alikes the first version wrongly called a scam ──
  { id: "hunt-fp-gold-trader-souq", type: "text", expect: "safe", input: "Sorry, wrong number. I'm a gold trader in the Deira souq and I just closed for the day. Profit was good today alhamdulillah.", note: "trader + profit, no invitation" },
  { id: "hunt-fp-show-photos-gold", type: "text", expect: "safe", input: "Oops wrong person! I wanted to show you the photos from the gold souk trip, but I sent them to the wrong chat. Sorry!" },
  { id: "hunt-fp-friend-from-uni", type: "text", expect: "safe", input: "Sorry, wrong number haha. Hey, if you are the Walid I know from uni, I can teach you how to trade stocks, you told me you wanted to learn." },
  { id: "hunt-fp-gold-shop-designs", type: "text", expect: "safe", input: "Sorry for the wrong number, madam. This is Malabar Gold. We will show you the new designs: earn 10% extra gold on exchange." },
  { id: "hunt-fp-real-estate-agent", type: "text", expect: "safe", input: "Hi, sorry I think I have the wrong person. I'm Ravi, a broker at a Dubai real estate agency. Anyway I can help you invest in Dubai property if you are looking. Income yield 7%." },
  { id: "hunt-fp-ar-shop-profits", type: "text", expect: "safe", input: "غلطت في الرقم، آسف. كنت راح أشرح لك عن أرباح المحل لأبوي بس الرقم غلط.", note: "Arabic: 'I was going to explain the shop's profits to you'" },
  { id: "hunt-fp-referral-wealth-manager", type: "text", expect: "safe", input: "Salam, got your number from Mr. Tariq. I'm a wealth manager at a Dubai bank. Would you like to learn how to invest in our fixed income funds? Income of 4% per year.", note: "named referral, not a wrong number" },
  { id: "hunt-fp-ar-referral-academy", type: "text", expect: "safe", input: "حصلت على رقمك من الأستاذ ماجد. أنا مدرب في أكاديمية دبي للأسواق المالية، أعلمك التداول في الأسهم عبر دورة معتمدة." },
  { id: "hunt-fp-bank-sent-by-mistake", type: "text", expect: "safe", input: "Dear client, we sent it by mistake. Please ignore the earlier SMS. We can guide you on how to invest in our new gold fund if you wish." },
  { id: "hunt-fp-group-added-by-mistake", type: "text", expect: "safe", input: "Sorry guys, I added you by mistake to the Dubai Gold Traders group. Remove yourself if you want. I am a gold trader and I earn from commissions, not tips." },
  { id: "hunt-fp-forwarded-warning", type: "text", expect: "safe", input: "Careful everyone, a message is going around: 'sorry wrong number, I am a gold trader in Dubai, I can teach you how to make money'. It's a trap, do not reply." },
  { id: "hunt-fp-advisor-delete-it", type: "text", expect: "safe", input: "Sorry, I sent this by mistake. I'm a financial advisor and that was meant for a client. Would you like me to delete it?" },
  { id: "hunt-fp-fish-market-trader", type: "text", expect: "safe", input: "Sorry to bother you, wrong number. I'm a trader at the fish market, if you ever want fresh hammour message me." },
  { id: "hunt-fp-trade-on-dfm-app", type: "text", expect: "safe", input: "Sorry wrong number! Do you trade on the DFM app too? Mine keeps crashing, that's why I was texting my brother." },
  { id: "hunt-fp-soldier-eid-share", type: "text", expect: "safe", input: "I am a soldier in National Service and I'll be at the camp until Thursday. You will get your share of the Eid gift money on Friday from my brother." },
  { id: "hunt-fp-ar-police-wallet", type: "text", expect: "safe", input: "اسمي العقيد ناصر من شرطة أبوظبي، لقينا محفظتك وفيها أموال. أرسل شخص موثوق ومعاه هويتك لاستلامها.", note: "police lost property" },
  { id: "hunt-fp-airline-captain-refund", type: "text", expect: "safe", input: "This is Captain Majid from the airline. Your flight is cancelled; you will receive 50% of the ticket money back now and the rest after 7 days." },
  { id: "hunt-fp-cricket-captain", type: "text", expect: "safe", input: "I am captain of the cricket team. Prize money: 40% for your team, 60% for ours." },
  { id: "hunt-fp-family-dormant-50-50", type: "text", expect: "safe", input: "The bank said my late father's dormant account still has funds. As his next of kin you and I must share the amount equally, 50/50. We will go to the branch together." },
  { id: "hunt-fp-family-millions-split", type: "text", expect: "safe", input: "My grandfather passed away and left 2 million dirhams. My lawyer says we will split it between us four brothers." },
  { id: "hunt-fp-real-lawyer-heir", type: "text", expect: "safe", input: "I'm a lawyer at Al Tamimi. Our client's estate of AED 4 million will be distributed; your share is 25% as per the will. Please visit our office with your Emirates ID." },
  { id: "hunt-fp-iraq-contract", type: "text", expect: "safe", input: "Our company won a $3 million contract in Iraq. As agreed, you will receive 10% commission." },
  { id: "hunt-fp-movers-trunk-box", type: "text", expect: "safe", input: "Movers will collect the metal box and the trunk box from the villa tomorrow morning. Please receive them on my behalf." },
  { id: "hunt-fp-gold-consignment-partner", type: "text", expect: "safe", input: "Looking for a reliable partner to receive our consignment of gold in Mumbai. We are a registered DMCC trading firm and can share all licences." },
  { id: "hunt-fp-ar-gold-shipment-discount", type: "text", expect: "safe", input: "وصلت شحنة جديدة من سبائك الذهب لمحلنا! لك 10% خصم على المصنعية هذا الأسبوع." },
  { id: "hunt-fp-ar-car-trunk-gold", type: "text", expect: "safe", input: "حطيت صندوق السيارة، فيه ذهب العروس. ساعدني في نقله للبيت قبل لا يجي الضيوف.", note: "Arabic: the bride's gold is in the car boot, help me move it" },
  { id: "hunt-fp-general-information-refund", type: "text", expect: "safe", input: "This is general information only. If you cancel within 14 days you will receive 90% of the money back." },
  { id: "hunt-fp-un-aid-news", type: "text", expect: "safe", input: "The UN said $3 million in aid reached Sudan. Our team will share the update with you tomorrow." },
  { id: "hunt-fp-fake-officers-warning", type: "text", expect: "safe", input: "Fake army officers are emailing about a trunk box of dollars and offering you 30% to help move it. These are frauds, delete them." },
];
