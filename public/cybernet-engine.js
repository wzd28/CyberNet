/*
  CyberNet AI detection engine.

  One rule set, three users: Quick Scan in the browser (window.CyberNetEngine),
  Analysis AI on the server (netlify/functions/analyze.mts imports this file),
  and the regression tests (tests/run-engine.mjs). Quick Scan and Analysis AI
  used to run two different rule sets and disagreed on the same message; now
  they share this one and the AI can only move a score within the margin the
  rules leave it. Edit detection rules here and nowhere else.
*/
(function (root, factory) {
  // One global for the page, the server bundle and the tests.
  root.CyberNetEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,Number(value)||0))}

function unique(items){return [...new Set((items||[]).filter(Boolean).map(String))]}

function containsAny(text,terms){return terms.some(term=>text.includes(term))}

function countMatches(text,regex){return (text.match(regex)||[]).length}

function normalizeText(text){return String(text||"").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/[‐‑‒–—]/g,"-").replace(/\s+/g," ").trim().toLowerCase()}

function deobfuscate(text){return text.replace(/0/g,"o").replace(/[1!|]/g,"i").replace(/3/g,"e").replace(/4/g,"a").replace(/5/g,"s").replace(/7/g,"t").replace(/@/g,"a").replace(/\$/g,"s")}

function hasTerm(variants,terms){return terms.some(term=>variants.some(v=>v.includes(term)))}

function createState(){return{raw:0,signalList:[],signals:new Set(),reasons:[],counterEvidence:[],types:[],categories:new Set(),strong:0,limitations:[]}}

function addSignal(state,id,weight,reason,type="",category="",strong=false){
  if(state.signals.has(id))return;
  state.signals.add(id);state.signalList.push({id,weight,strong:Boolean(strong),category,type});state.raw+=weight;state.reasons.push(reason);
  if(type)state.types.push(type);if(category)state.categories.add(category);if(strong)state.strong++;
}

function nonlinearScore(raw){return clamp(Math.round(100*(1-Math.exp(-Math.max(0,raw)/78))))}

// Official domains per brand. The link engine flags a brand name inside any
// other registered domain, and the previews say which real site it imitates.
const KNOWN_BRANDS={
  paypal:["paypal.com"],microsoft:["microsoft.com"],apple:["apple.com"],google:["google.com"],amazon:["amazon.com","amazon.ae","amazon.sa"],netflix:["netflix.com"],instagram:["instagram.com"],facebook:["facebook.com"],whatsapp:["whatsapp.com"],dropbox:["dropbox.com"],dhl:["dhl.com"],fedex:["fedex.com"],ups:["ups.com"],usps:["usps.com"],adobe:["adobe.com"],coinbase:["coinbase.com"],binance:["binance.com"],icloud:["icloud.com"],walmart:["walmart.com"],chase:["chase.com"],wellsfargo:["wellsfargo.com"],bankofamerica:["bankofamerica.com"],venmo:["venmo.com"],zelle:["zelle.com"],cashapp:["cash.app"],steam:["steampowered.com"],linkedin:["linkedin.com"],tiktok:["tiktok.com"],snapchat:["snapchat.com"],discord:["discord.com"],spotify:["spotify.com"],ezpass:["e-zpass.com"],xfinity:["xfinity.com"],verizon:["verizon.com"],
  hsbc:["hsbc.com","hsbc.ae","hsbc.co.uk"],barclays:["barclays.co.uk"],lloyds:["lloydsbank.com"],santander:["santander.co.uk","santander.com"],citibank:["citi.com","citibank.com"],revolut:["revolut.com"],
  adcb:["adcb.com"],emiratesnbd:["emiratesnbd.com"],enbd:["emiratesnbd.com"],mashreq:["mashreq.com","mashreqbank.com"],rakbank:["rakbank.ae"],bankfab:["bankfab.com"],adib:["adib.ae"],dib:["dib.ae"],
  alrajhi:["alrajhibank.com.sa"],riyadbank:["riyadbank.com"],alahli:["alahli.com"],qnb:["qnb.com"],kfh:["kfh.com"],nbk:["nbk.com"],boubyan:["boubyan.com"],bankmuscat:["bankmuscat.com"],
  etisalat:["etisalat.ae","eand.com"],mobily:["mobily.com.sa"],zain:["zain.com","sa.zain.com"],ooredoo:["ooredoo.com","ooredoo.qa"],dewa:["dewa.gov.ae"],sewa:["sewa.gov.ae"],salik:["salik.ae"],
  uaepass:["uaepass.ae"],absher:["absher.sa"],emiratespost:["emiratespost.ae"],emiratesid:["icp.gov.ae"],
  aramex:["aramex.com"],smsa:["smsaexpress.com"],noon:["noon.com"],talabat:["talabat.com"],careem:["careem.com"],
  tesla:["tesla.com"],metamask:["metamask.io"],trustwallet:["trustwallet.com"],ledger:["ledger.com"],telegram:["telegram.org","t.me"],outlook:["outlook.com","live.com"],gmail:["gmail.com","google.com"]
};

const SHORTENERS=new Set(["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly","rebrand.ly","shorturl.at","tiny.one","rb.gy","v.gd","s.id","lnkd.in","tr.im","clickmeter.com"]);

// Words criminals put in a domain name to make it feel official.
const LURE_WORDS=["secure","security","verify","verification","login","signin","update","support","alert","confirm","unlock","refund","billing","payment","pay","wallet","account","auth","helpdesk","service","redelivery","reschedule","customs","claim","prize","bonus","activate","reactivate"];

function isOfficialDomain(registered){return Object.values(KNOWN_BRANDS).some(domains=>domains.includes(registered))}

// A brand name as a whole token of the host ("adcb-secure-login.info"), or a
// longer name anywhere in the hyphen-stripped host ("emirates-post-redelivery")
// or the path, on a domain the brand does not own.
function brandMismatch(host,registered,pathQuery=""){
  if(isOfficialDomain(registered))return null;
  const tokens=new Set([...host.split(/[.-]/),...String(pathQuery||"").split(/[\/._-]/)].filter(Boolean));
  const compact=host.replace(/-/g,"");
  for(const [brand,officials] of Object.entries(KNOWN_BRANDS)){
    if(tokens.has(brand)||(brand.length>=5&&compact.includes(brand)))return{brand,official:officials[0]};
  }
  return null;
}

function lureWordsIn(registered){
  const core=String(registered||"").split(".")[0];const parts=core.split("-");const compact=core.replace(/-/g,"");
  return LURE_WORDS.filter(word=>parts.includes(word)||(word.length>=5&&compact.includes(word)));
}

function collectLinksInText(text){
  const raw=String(text||"");
  const urls=unique((raw.match(/(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi)||[]).filter(value=>!value.includes("@")));
  return urls.slice(0,4).map(url=>({url,result:analyzeLinkRules(url)}));
}

// What a decoded QR code holds decides which engine judges it: a web address
// goes to the link engine, text to the text engine, and the structured kinds
// (Wi-Fi, contact card, payment) get their own plain-language read. A flat
// "any QR content is suspicious" score used to call a restaurant menu a scam.
function analyzeQrPayload(data){
  const value=String(data||"").trim();
  if(!value)return{kind:"text",result:null};
  if(/^https?:\/\//i.test(value)||/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(value))return{kind:"url",result:analyzeLinkRules(/^https?:\/\//i.test(value)?value:`https://${value}`)};
  if(/^WIFI:/i.test(value)){
    const ssid=(value.match(/S:([^;]*)/)||[])[1]||"";const auth=((value.match(/T:([^;]*)/)||[])[1]||"").toLowerCase();const open=!auth||auth==="nopass";
    return{kind:"wifi",result:{score:open?18:8,scamType:"Wi-Fi network credentials",reasons:[`Joins the Wi-Fi network “${ssid||"unnamed"}”${open?" with no password":""}.`,"Joining a network from a QR code routes your traffic through whoever runs it.",...(open?["Open networks let others nearby watch unencrypted traffic."]:[])],counterEvidence:["Wi-Fi QR codes are a normal way for cafés, hotels and offices to share access."],advice:["Only join if the QR code comes from the venue you are actually in.","Avoid banking or logging into important accounts on shared Wi-Fi.","Forget the network when you leave."],uncertain:false,confidence:82,verdict:"low_risk",sources:["QR decoder"]}};
  }
  if(/^(BEGIN:VCARD|MECARD:)/i.test(value))return{kind:"contact",result:{score:8,scamType:"Contact card",reasons:["The QR code holds a contact card (name, phone, email)."],counterEvidence:["Contact-card QR codes are common on business cards and posters."],advice:["Check the name and number match the person or business you expect before saving it.","Do not call numbers or open links from a card you did not expect."],uncertain:false,confidence:80,verdict:"low_risk",sources:["QR decoder"]}};
  if(/^(bitcoin|ethereum|litecoin|upi|pay):/i.test(value)||/^0x[0-9a-f]{40}$/i.test(value)||/^(bc1|1|3)[a-z0-9]{25,60}$/i.test(value))return{kind:"payment",result:{score:58,scamType:"Payment request in a QR code",reasons:["The QR code encodes a payment destination (wallet address or payment link).","Scanning and paying sends money that usually cannot be reversed."],counterEvidence:["Legitimate shops and invoices also use payment QR codes."],advice:["Only pay a QR code you received directly from a business you already trust, in person or in their official app.","Never pay a QR code sent in a message, email or post to 'unlock', 'verify' or 'release' anything.","If in doubt, ask for an invoice through the business's official channel first."],uncertain:false,confidence:78,verdict:"suspicious",sources:["QR decoder"]}};
  if(/^(mailto|tel|sms|smsto):/i.test(value)){const r=analyzeTextRules(value.replace(/^(mailto|tel|sms|smsto):/i,""));r.reasons=[`The QR code triggers a ${value.split(":")[0].toLowerCase()} action: ${value.slice(0,120)}.`,...r.reasons];r.sources=unique(["QR decoder",...(r.sources||[])]);return{kind:"action",result:r}}
  const r=analyzeTextRules(value);r.sources=unique(["QR decoder",...(r.sources||[])]);return{kind:"text",result:r};
}

function analyzeTextRules(text){
  const result=analyzeTextRulesCore(text);
  result.links=collectLinksInText(text);
  return result;
}

function analyzeTextRulesCore(text){
  const raw=String(text||"");
  const clean=normalizeText(raw),obfuscated=deobfuscate(clean),variants=[clean,obfuscated];
  const state=createState();
  const urls=unique((raw.match(/(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi)||[]).filter(value=>!value.includes("@")));
  const emails=raw.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)||[];
  const phones=raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/g)||[];
  const hiddenChars=/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/.test(raw);

  const groups=[
    {id:"urgency",terms:["urgent","immediately","act now","final warning","last chance","within 24 hours","today only","expires today","immédiatement","dernière chance","عاجل","فوراً","فورا","حالاً","اليوم فقط"],weight:10,reason:"Uses urgency or a deadline to reduce careful thinking.",type:"Urgency-based social engineering",category:"pressure"},
    {id:"prize",terms:["you won","winner","prize","gift card","giveaway","free money","claim reward","selected winner","gagné","cadeau","prix gratuit","ربحت","جائزة","هدية مجانية"],weight:16,reason:"Promises an unexpected prize, reward, or giveaway.",type:"Prize / giveaway scam",category:"reward"},
    {id:"credentials",terms:["password","sign in","login","verify your account","confirm your account","security alert","unusual activity","mot de passe","vérifiez votre compte","connexion","كلمة المرور","تحقق من حسابك","تسجيل الدخول","نشاط غير معتاد"],weight:9,reason:"Mentions account verification, login, or security-alert language.",type:"Credential phishing",category:"credentials"},
    {id:"otp",terms:["otp","one-time password","verification code","security code","2fa code","pin code","code de vérification","رمز التحقق","رمز الأمان","رمز لمرة واحدة"],weight:12,reason:"Mentions a private authentication or verification code.",type:"OTP / account takeover scam",category:"credentials"},
    {id:"finance",terms:["wire transfer","bank transfer","payment","refund","invoice","crypto","bitcoin","wallet","gift cards","western union","deposit","tax payment","back taxes","owe taxes","tax debt","unpaid taxes","tax notice","virement","paiement","remboursement","facture","تحويل مصرفي","دفعة","استرداد","فاتورة","عملات رقمية","محفظة"],weight:9,reason:"Mentions money, banking, payment, refund, tax debt, or crypto activity.",type:"Financial scam",category:"money"},
    {id:"threat",terms:["account locked","account suspended","legal action","arrest","police","court","warrant","will be deleted","compte suspendu","action légale","حسابك موقوف","إجراء قانوني","اعتقال","سيتم حذف"],weight:17,reason:"Uses fear, punishment, or account-loss threats.",type:"Threat-based phishing",category:"pressure"},
    {id:"remote",terms:["remote access","anydesk","teamviewer","quick support","screen share","install this app","accès à distance","partage d'écran","وصول عن بعد","مشاركة الشاشة","ثبت هذا التطبيق"],weight:34,reason:"Requests or discusses remote access, screen sharing, or control software.",type:"Remote-access support scam",category:"device"},
    {id:"delivery",terms:["parcel","package delivery","delivery fee","customs fee","missed delivery","shipping address","colis","frais de livraison","رسوم التوصيل","طرد","رسوم الجمارك"],weight:12,reason:"Uses a parcel, customs, or delivery problem as a lure.",type:"Delivery phishing",category:"delivery"},
    {id:"job",terms:["easy income","task commission","guaranteed return","investment opportunity","work from home job","revenu garanti","commission de tâche","دخل مضمون","عمولة مهام","عائد مضمون"],weight:16,reason:"Offers unusually easy income, task commissions, or guaranteed returns.",type:"Job / investment scam",category:"money"},
    {id:"secrecy",terms:["keep this confidential","do not tell anyone","don't contact","secret transaction","gardez ceci confidentiel","لا تخبر أحداً","سري للغاية"],weight:19,reason:"Asks the recipient to keep the interaction secret.",type:"Manipulation / impersonation scam",category:"pressure"},
    {id:"authority",terms:["tax authority","immigration officer","customs officer","police department","government grant","social security","irs","interpol","وزارة","الشرطة","الجمارك","الضمان الاجتماعي"],weight:13,reason:"Invokes government, police, tax, immigration, or another authority.",type:"Authority impersonation scam",category:"impersonation"},
    {id:"recovery",terms:["recover your money","fund recovery","crypto recovery","refund agent","recovery service","استرجاع أموالك","استرداد العملات"],weight:23,reason:"Offers to recover money or cryptocurrency, a common follow-up scam pattern.",type:"Recovery scam",category:"money"},
    {id:"romance",terms:["my dear","future together","love you","emergency money","military deployment","inheritance for us","حبيبي","مستقبلنا","أحتاج المال بشكل عاجل"],weight:13,reason:"Combines emotional trust language with a personal or financial story.",type:"Romance / trust scam",category:"relationship"},
    {id:"mule",terms:["receive money for me","forward the payment","keep a percentage","use your bank account","cash this check","استقبل المال","حوّل الدفعة","احتفظ بنسبة"],weight:31,reason:"Asks the recipient to receive or forward money through their own account.",type:"Money-mule recruitment",category:"money",strong:true},
    {id:"sextortion",terms:["private photos","intimate video","send to your contacts","pay or i will share","leak your photos","صور خاصة","سأرسلها لجهات اتصالك","ادفع وإلا"],weight:42,reason:"Threatens to expose private or intimate material unless payment is made.",type:"Sextortion scam",category:"extortion",strong:true}
    ,
    // Regional and Arabic vocabulary for the same families. Same ids as the
    // entries above: a signal fires once whichever list matched it.
    {id:"job",terms:["part-time","part time","daily salary","daily income","no experience","reply yes","reply \"yes\"","reply 'yes'","hr department","online job","remote job","earn daily","flexible hours","بدوام جزئي","راتب يومي","دخل يومي","بدون خبرة","أرسل نعم","أرسل 'نعم'","الموارد البشرية","وظيفة عن بعد","وظيفة بدوام","عمل من المنزل","مهام بسيطة","أرباح يومية"],weight:16,reason:"Offers unusually easy income, task commissions, or guaranteed returns.",type:"Job / investment scam",category:"money"},
    {id:"delivery",terms:["could not be delivered","redelivery","reschedule delivery","parcel on hold","shipment on hold","بريد الإمارات","لم نتمكن من توصيل","توصيل طردك","إعادة الجدولة","إعادة جدولة","شحنتك","الشحنة","رسوم جمركية","رسوم إعادة","الطرد","طردك"],weight:12,reason:"Uses a parcel, customs, or delivery problem as a lure.",type:"Delivery phishing",category:"delivery"},
    {id:"credentials",terms:["reactivate","re-activate","restore access","account limited","account has been limited","تعليق حسابك","تم تعليق","تم إيقاف","إيقاف حسابك","إعادة التفعيل","للتفعيل","ادخل بياناتك","أدخل بياناتك","تحديث بياناتك","إعادة تفعيل","بطاقتك"],weight:9,reason:"Mentions account verification, login, or security-alert language.",type:"Credential phishing",category:"credentials"},
    {id:"threat",terms:["will be closed","will be deactivated","permanently closed","سيتم إغلاق","سيتم تعطيل","سيتم إيقاف","إغلاق الحساب","تعطيل حسابك","إلغاء حسابك"],weight:17,reason:"Uses fear, punishment, or account-loss threats.",type:"Threat-based phishing",category:"pressure"},
    {id:"urgency",terms:["within 24h","within 48h","within 12h","خلال 24 ساعة","خلال 48 ساعة","خلال 12 ساعة","خلال ساعة","قبل انتهاء","آخر فرصة","بشكل عاجل"],weight:10,reason:"Uses urgency or a deadline to reduce careful thinking.",type:"Urgency-based social engineering",category:"pressure"},
    {id:"authority",terms:["uae pass","emirates id","ministry of","federal authority","traffic fine","government services","الهوية الإماراتية","هوية الإمارات","الهيئة الاتحادية","وزارة الداخلية","الحكومة","مخالفة مرورية","غرامة","الهوية الوطنية","أبشر","هويتي","الخدمات الحكومية"],weight:13,reason:"Invokes government, police, tax, immigration, or another authority.",type:"Authority impersonation scam",category:"impersonation"},
    {id:"finance",terms:["iban","new bank details","درهم","ريال","حوالة","آيبان","رقم الحساب","تحويل"],weight:9,reason:"Mentions money, banking, payment, refund, tax debt, or crypto activity.",type:"Financial scam",category:"money"}
  ];
  groups.forEach(g=>{if(hasTerm(variants,g.terms))addSignal(state,g.id,g.weight,g.reason,g.type,g.category,g.strong)});
  if(/\bwithin\s+\d{1,3}\s*(hours?|hrs?|minutes?|mins?|days?)\b/i.test(clean)&&!state.signals.has("urgency"))addSignal(state,"deadline-pressure",10,"Uses a specific time deadline to reduce careful thinking.","Urgency-based social engineering","pressure");
  // "Cyprus Police", "Dubai Police", "traffic police": a named force or office is
  // how fine-and-fee scams open; the plain word "police" stays a threat cue only.
  if(!state.signals.has("authority")&&/\b(?:[a-z]+ police|traffic police|police (?:department|notice|station|force|headquarters)|ministry of|tax office|customs office|immigration department|municipality|court notice|government notice)\b/i.test(clean))addSignal(state,"authority",13,"Invokes government, police, tax, immigration, or another authority.","Authority impersonation scam","impersonation");
  // A fine, toll, tax or fee that must be paid is the lure itself.
  if(/\b(?:unpaid|outstanding|overdue|pending)\b.{0,40}\b(?:fine|fines|penalty|penalties|toll|tax|fee|fees|invoice|bill|balance)\b|\b(?:fine|fines|penalty|penalties|toll)\b.{0,50}\b(?:pay|payment|settle|clear)\b|\bblack points?\b/i.test(clean))addSignal(state,"fine-demand",18,"Demands payment for a fine, fee, toll or penalty, a common pressure lure.","Fine / fee payment scam","money");
  // A confirmation of a payment already made is the opposite of a demand.
  if(/\b(?:was received|has been received|payment (?:successful|confirmed|received|completed)|thank you for your payment|your receipt|has been paid|successfully paid)\b/i.test(clean)&&!/\b(click|tap|open|visit|verify|confirm your|update your)\b/i.test(clean)){state.raw-=18;state.counterEvidence.push("Reads like a confirmation of a payment already made rather than a demand.")}

  const protective=/\b(never share|do not share|don't share|we will never ask|do not click|don't click|ignore suspicious|security tip|fraud warning|protect yourself|ne partagez jamais|ne cliquez pas|conseil de sécurité|لا تشارك|لن نطلب منك|لا تضغط|تحذير أمني)\b/iu.test(clean);
  const relationalSecretRequest=/\b(send me|send us|reply with|provide us|provide me|share with me|share with us|tell me|envoyez-nous|envoyez-moi|répondez avec|أرسل لي|أرسل لنا|شارك معي|شارك معنا)\b.{0,65}\b(passwords?|otp|codes?|pins?|cards?|cvv|account number|seed phrase|recovery phrase|mot de passe|رمز|كلمة المرور|رقم البطاقة|عبارة الاسترداد)\b/iu.test(clean);
  const imperativeSecretRequest=/\b(send|share|provide|enter|type|submit|confirm|verify|envoyer|partager|saisir|أرسل|شارك|أدخل|أكد|تحقق)\b.{0,20}\b(your|the|votre|ton|رمز|كلمة|رقم)\b.{0,45}\b(passwords?|otp|codes?|pins?|cards?|cvv|account number|seed phrase|recovery phrase|mot de passe|رمز|كلمة المرور|رقم البطاقة|عبارة الاسترداد)\b/iu.test(clean);
  const directSecretRequest=relationalSecretRequest||(!protective&&imperativeSecretRequest);
  if(protective&&!directSecretRequest){state.raw-=22;state.counterEvidence.push("The wording appears to warn the reader not to share information or follow suspicious instructions.")}
  if(/\b(this is a test|training example|security awareness|example of phishing|sample scam|educational purposes|simulation|exemple de phishing|تدريب توعوي|مثال احتيال)\b/iu.test(clean)){state.raw-=22;state.counterEvidence.push("The text identifies itself as training, simulation, or an educational example.")}

  if(urls.length)addSignal(state,"links",Math.min(14,5+urls.length*3),`Contains ${urls.length} visible web link${urls.length>1?"s":""}.`,"Link-based social engineering","action");
  if(!protective&&/\b(click|tap|open|visit|scan|cliquez|ouvrez|اضغط|انقر|امسح)\b.{0,55}\b(link|url|qr|button|lien|الرابط|رمز)\b/iu.test(clean))addSignal(state,"link-pressure",18,"Directly pressures the recipient to open a link or scan a QR code.","Phishing call-to-action","action",true);
  if(directSecretRequest)addSignal(state,"secret-request",52,"Explicitly asks for credentials, authentication codes, payment details, or a recovery phrase.","Credential theft attempt","credentials",true);
  if(/\b(buy|purchase|pay with|send|transfer)\b.{0,55}\b(gift cards?|bitcoin|crypto|usdt|western union|moneygram|vouchers?)\b/i.test(clean))addSignal(state,"irreversible-payment",39,"Requests an unusual or difficult-to-reverse payment method.","Payment scam","money",true);
  if(!protective&&/\b(download|install|enable macros|run this file|sideload|disable antivirus|turn off defender)\b/i.test(clean))addSignal(state,"install",38,"Requests software execution or asks the user to weaken device security.","Malware delivery attempt","device",true);
  if(/\b(dear customer|dear user|valued customer|account holder|cher client|عزيزي العميل|مستخدمنا العزيز)\b/iu.test(clean))addSignal(state,"generic-greeting",4,"Uses a generic greeting instead of identifying the recipient.","Possible bulk phishing","impersonation");
  if(countMatches(raw,/!/g)>=4)addSignal(state,"punctuation",4,"Uses excessive exclamation marks to create pressure.","Manipulative language","style");
  if(countMatches(raw,/[A-Z]{5,}/g)>=2)addSignal(state,"caps",4,"Uses repeated all-capital words for alarm or urgency.","Manipulative language","style");
  if(countMatches(raw,/[$€£]\s?\d|\d+\s?(usd|eur|gbp|dollars?|euros?)/gi)>=1)addSignal(state,"amount",5,"Includes a specific monetary amount.","Financial request","money");
  if(phones.length&&hasTerm(variants,["support","call now","helpline","microsoft","apple","bank","اتصل","الدعم"]))addSignal(state,"support-phone",19,"Provides a phone number in a support or security-alert context.","Tech-support / vishing scam","impersonation",true);
  if(emails.some(e=>/@(gmail|yahoo|outlook|hotmail|protonmail)\./i.test(e))&&hasTerm(variants,["bank","support","security team","government","microsoft","apple","paypal","البنك","الدعم"]))addSignal(state,"public-email",25,"Claims to represent an organization while using a public email provider.","Brand impersonation","impersonation",true);
  if((/\b(paypal|microsoft|apple|google|amazon|netflix|instagram|facebook|whatsapp|dhl|fedex|bank|adcb|enbd|emirates nbd|mashreq|rakbank|hsbc|al ?rajhi|riyad bank|qnb|nbk|kfh|etisalat|stc|mobily|zain|ooredoo|dewa|sewa|salik|uae pass|emirates id|emirates post|aramex|smsa|noon|careem|talabat)\b/i.test(clean)||/(بنك|الراجحي|اتصالات|بريد الإمارات|أرامكس|الهوية|هيئة كهرباء|سالك)/u.test(clean))&&hasTerm(variants,["verify","locked","suspended","refund","security alert","reactivate","restore access","account limited","will be closed","deactivated","customs","blocked","تحقق","موقوف","استرداد","تفعيل","تعليق","إيقاف","تحديث","رسوم","إغلاق","تعطيل"]))addSignal(state,"brand-pressure",18,"Combines a well-known brand with account or payment pressure.","Brand impersonation phishing","impersonation");
  if(hiddenChars)addSignal(state,"hidden-chars",16,"Contains hidden bidirectional or zero-width Unicode characters that can disguise content.","Obfuscated phishing","style",true);
  if(containsAny(clean,["unpaid toll","outstanding toll","toll balance","e-zpass","ezpass","toll invoice"])&&containsAny(clean,["pay","suspend","fine","fee","link","click"]))addSignal(state,"toll-smishing",30,"Claims an unpaid road toll and pressures payment or a link click — a widely-reported smishing pattern.","Toll-fee smishing scam","impersonation",true);
  if(containsAny(clean,["package could not be delivered","delivery failed","parcel is on hold","redelivery fee","customs fee","shipment is on hold","update your delivery"]))addSignal(state,"delivery-smishing",26,"Claims a package or delivery problem requiring a fee or link click.","Package-delivery smishing scam","impersonation",true);
  if(containsAny(clean,["work from home","earn $","earn up to","no experience needed","no experience required","flexible hours easy money","daily payout","task completion bonus","product boosting","earn per task","بدون خبرة","راتب يومي","دخل يومي","أرباح يومية","وظيفة بدوام جزئي براتب","أرسل نعم","أرسل 'نعم'","عمل من المنزل براتب"]))addSignal(state,"job-scam",24,"Uses work-from-home or easy-money task language typical of job and task scams.","Job / task scam","money",true);
  if(containsAny(clean,["arrest warrant","failure to appear","legal action will be taken","this call is being recorded for legal purposes","stay on the line","do not hang up","identity was used in a crime","federal investigation"]))addSignal(state,"authority-impersonation",34,"Impersonates law enforcement or a government agency with legal threats — a common impersonation/\"digital arrest\" scam pattern.","Government / law-enforcement impersonation scam","impersonation",true);
  if(containsAny(clean,["grandma its me","grandpa its me","ive been in an accident","i need bail money","dont tell mom","dont tell my parents","im in trouble and need money"]))addSignal(state,"family-emergency",30,"Uses a family-emergency plea combined with urgency and secrecy — a pattern seen in impersonation and AI voice-cloning scams.","Family-emergency impersonation scam","impersonation",true);
  if(containsAny(clean,["investment opportunity","guaranteed returns","double your money","crypto trading platform","my broker","trading mentor","withdraw your profits"])&&containsAny(clean,["love","miss you","my dear","sweetheart","darling","relationship"]))addSignal(state,"romance-investment",36,"Combines romantic language with an investment or crypto-trading pitch — the classic \"pig butchering\" scam pattern.","Romance / investment (\"pig butchering\") scam","money",true);

  // "I sent a code to your number by mistake, send it back": the code is the
  // reader's own one-time password, and forwarding it hands the account over.
  if(!protective&&(/\b(sent|send|texted|entered|typed|received|got)\b.{0,50}\b(code|otp|pin|verification|password)\b.{0,70}\b(by mistake|accidentally|wrong number|to your (?:number|phone))\b/i.test(clean)||/\b(by mistake|accidentally|wrong number)\b.{0,70}\b(code|otp|verification|pin)\b/i.test(clean)||/(أرسلت|وصلك|وصلت|تلقيت|جاك).{0,50}(رمز|كود|الرمز|الكود).{0,50}(بالخطأ|عن طريق الخطأ|بالغلط)/u.test(clean)||/(أرسل|ارسل|حول|أعد إرسال).{0,25}(الرمز|الكود|رمز التحقق).{0,25}(لي|إلي|إليّ|لنا)/u.test(clean)))addSignal(state,"otp-hijack",44,"Asks you to forward a code that was 'sent by mistake' — the code is really for your own account, and passing it on hands that account over.","OTP interception scam","credentials",true);
  // New bank details for a payment, with a reason not to pick up the phone:
  // the shape of invoice and CEO-fraud messages that redirect money.
  if(/\b(new|updated|changed|different)\b.{0,20}\b(bank details|bank account|banking details|iban|account details|payment details|beneficiary|account number)\b/i.test(clean)||/\b(bank details|iban|account details)\b.{0,30}\b(changed|updated|new)\b/i.test(clean)||/(تغيرت|تم تغيير|جديد|الجديد).{0,25}(تفاصيل البنك|الحساب البنكي|آيبان|iban|رقم الحساب)/u.test(clean)||/(الحساب البنكي|آيبان|تفاصيل البنك).{0,25}(تغير|تغيرت|الجديد|جديد)/u.test(clean)){
    const paymentTalk=/\b(invoice|payment|transfer|wire|pay|remit|settle|process)\b/i.test(clean)||/(فاتورة|دفع|تحويل|حوالة|سداد)/u.test(clean);
    const noCall=/\b(don'?t call|do not call|can'?t talk|cannot talk|in a meeting|in meetings|unavailable|email only|reply by email|discreet)\b/i.test(clean)||/(لا تتصل|لا تكلمني|في اجتماع|مشغول)/u.test(clean);
    const invitesCall=/\b(call me|feel free to call|give me a call|as discussed on the call|as discussed by phone|call to confirm|verify by phone|confirm by phone)\b/i.test(clean)||/(اتصل بي|كما اتفقنا هاتفياً|للتأكيد اتصل)/u.test(clean);
    // A genuine change invites a phone check; the fraud version forbids one.
    if(paymentTalk&&invitesCall&&!noCall){addSignal(state,"payment-redirect",14,"Announces new bank details for a payment — always confirm a change like this by phone with a number you already have before paying.","Payment-detail change","money");state.counterEvidence.push("Invites a phone call to confirm the change, which genuine notices usually do.")}
    else if(paymentTalk)addSignal(state,"payment-redirect",36,"Announces new bank details for a payment — the classic way invoice and CEO-fraud messages redirect money to a criminal's account.","Payment redirection (business email compromise)","money",true);
    if(paymentTalk&&noCall)addSignal(state,"no-verify-pressure",12,"Discourages checking by phone, so the change cannot be verified with the real person.","Payment redirection (business email compromise)","pressure");
  }

  let highestEmbedded=null;
  for(const value of urls.slice(0,4)){
    const linkResult=analyzeLinkRules(value);
    if(!highestEmbedded||linkResult.score>highestEmbedded.score)highestEmbedded=linkResult;
  }
  if(highestEmbedded?.score>=58)addSignal(state,"dangerous-embedded-link",34,`An embedded link has high-risk structural indicators: ${highestEmbedded.reasons[0]||highestEmbedded.scamType}.`,"Message carrying a suspicious link","action",true);
  else if(highestEmbedded?.score>=32)addSignal(state,"suspicious-embedded-link",18,"An embedded link contains multiple suspicious structural indicators.","Message carrying an unverified link","action");
  if(highestEmbedded?.registeredDomain)state.reasons.push(`Most suspicious visible destination: ${highestEmbedded.registeredDomain}.`);

  const combo=(id,needs,weight,reason,type,category)=>{if(needs.every(x=>state.signals.has(x)))addSignal(state,id,weight,reason,type,category,true)};
  combo("credential-chain",["credentials","urgency","links"],28,"Combines account pressure, urgency, and a clickable link.","Credential phishing","credentials");
  combo("otp-chain",["otp","urgency"],18,"Combines authentication-code language with urgency.","OTP theft scam","credentials");
  combo("govt-authority-threat",["authority","threat"],26,"Combines government/tax-authority impersonation with a legal or arrest threat — a classic pattern in IRS, police, and \"digital arrest\" impersonation scams.","Government / tax-authority impersonation scam","impersonation");
  combo("govt-authority-finance",["authority","finance"],24,"Combines government/tax-authority impersonation with a financial demand — a classic pattern in IRS and tax-scam messages.","Government / tax-authority impersonation scam","impersonation");
  if(state.categories.has("money")&&state.categories.has("pressure"))addSignal(state,"money-pressure",20,"Combines financial activity with fear, secrecy, or urgency.","Financial social engineering","money",true);
  if(state.categories.has("impersonation")&&state.categories.has("action"))addSignal(state,"impersonation-action",19,"Combines impersonation clues with a requested click, call, or reply.","Impersonation phishing","impersonation",true);

  state.raw=Math.max(0,state.raw);
  let score=nonlinearScore(state.raw);
  if(state.strong>=2)score=Math.max(score,80);else if(state.strong===1)score=Math.max(score,55);
  if(protective&&!directSecretRequest&&state.strong===0)score=Math.min(score,14);
  if(!state.signals.size)score=3;
  const contextQuality=Math.min(22,Math.floor(clean.length/75)*3);
  let confidence=clamp(30+state.categories.size*8+state.strong*11+contextQuality+(protective?8:0)-(clean.length<35?18:0),20,97);
  if(protective&&!directSecretRequest&&state.strong===0){
    confidence=Math.max(confidence,76);
    state.reasons=state.reasons.filter(reason=>!reason.startsWith("Mentions account verification")&&!reason.startsWith("Mentions a private authentication"));
    state.reasons.unshift("The message is framed as security guidance and does not ask the reader to disclose sensitive information.");
  }
  const veryShort=clean.length<18;
  const lowEvidence=state.strong===0&&state.categories.size<2;
  const uncertain=state.signals.size>0&&!protective&&(veryShort||lowEvidence||(score>=22&&score<=50&&confidence<65));
  if(!state.reasons.length)state.reasons.push("No strong pre-coded scam pattern was detected in the supplied text.");
  if(clean.length<35)state.limitations.push("The message is short, so sender identity and surrounding conversation are missing.");
  if(!emails.length&&!phones.length&&!urls.length)state.limitations.push("No sender address, phone number, or destination link was available for cross-checking.");
  const advice=[
    "Do not click unexpected links or open attachments until the sender is independently verified.",
    "Never share passwords, OTP codes, PINs, card details, CVVs, or wallet recovery phrases.",
    "Verify the request through the organization's official app, website, or a known phone number.",
    "Inspect the complete sender address and conversation history, not only the displayed name.",
    score>=60?"Preserve evidence, block the sender, and report the message through the platform or organization.":"Treat the message as unverified until its sender and purpose are confirmed."
  ];
  const verdict=verdictFromScore(score,uncertain);
  const scamType=protective&&score<=14&&state.strong===0?"Security guidance / low visible risk":state.types.at(-1)||(uncertain?"Unverified message":"No dominant threat type");
  return{kind:"text",signals:state.signalList,categories:[...state.categories],strong:state.strong,score,scamType,reasons:[...state.reasons,...state.limitations],counterEvidence:state.counterEvidence,advice,uncertain,confidence,verdict,sources:["Local language engine",...(highestEmbedded?["Embedded-link engine"]:[])],note:uncertain?"CyberNet AI could not confirm this message is safe, so treat it as unsafe. Don't act on it, click anything inside it, or reply with personal details.":"CyberNet AI evaluated language, requested actions, pressure tactics, sensitive-data requests, impersonation, embedded links, and multi-signal combinations."};
}

function levenshtein(a,b){
  if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i),cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){cur[0]=i;for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)prev[j]=cur[j]}
  return prev[b.length];
}

function hostnameEntropy(value){
  const label=String(value||"").replace(/[^a-z0-9]/gi,"");if(label.length<10)return 0;
  const counts={};for(const ch of label)counts[ch]=(counts[ch]||0)+1;
  return -Object.values(counts).reduce((sum,count)=>{const p=count/label.length;return sum+p*Math.log2(p)},0);
}

function isPrivateHost(host){
  return host==="localhost"||host.endsWith(".local")||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||host==="::1";
}

function registrableDomain(host){
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.includes(":"))return host;
  const labels=host.split(".").filter(Boolean);if(labels.length<=2)return host;
  const compound=new Set(["co.uk","org.uk","gov.uk","com.au","net.au","co.nz","com.br","com.tr","com.lb","com.cy","co.jp","co.in","com.sg","com.cn","com.hk","com.mx","gov.ae","ac.ae","co.ae","net.ae","org.ae","sch.ae","com.sa","gov.sa","edu.sa","org.sa","net.sa","com.qa","gov.qa","edu.qa","com.kw","gov.kw","edu.kw","com.bh","gov.bh","com.om","gov.om","com.eg","gov.eg","com.jo","gov.jo","co.za","com.pk","gov.in"]);
  const tail2=labels.slice(-2).join(".");return compound.has(tail2)?labels.slice(-3).join("."):tail2;
}

function looksLikeWebAddress(value){
  const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(value)?value:"https://"+value;
  let parsed;try{parsed=new URL(candidate)}catch{return false}
  if(!/^https?:$/i.test(parsed.protocol))return false;
  const host=parsed.hostname;
  return host==="localhost"||/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.includes(":")||/\.[a-z0-9-]{2,}$/i.test(host);
}

function analyzeLinkRules(rawLink){
  const original=String(rawLink||"").trim();
  const state=createState();
  if(!original)return{score:0,scamType:"No link supplied",reasons:["No URL was provided."],advice:["Paste the complete URL, including the domain."],uncertain:true,confidence:0,verdict:"inconclusive",sources:["Local URL engine"]};
  if(/^(javascript|data|file|vbscript|blob):/i.test(original))return{score:97,scamType:"Dangerous or non-web URL scheme",reasons:["The link uses a script, data, local-file, or blob scheme rather than a normal web address."],advice:["Do not open or paste this link into a browser.","Delete the message and report the sender if the link was unexpected."],uncertain:false,confidence:97,verdict:"malicious",sources:["Local URL engine"],note:"The URL scheme itself is dangerous or unsuitable for normal browsing."};
  const hadScheme=/^[a-z][a-z0-9+.-]*:\/\//i.test(original);
  const candidate=hadScheme?original:`https://${original}`;
  let url;
  try{url=new URL(candidate)}catch{return{score:78,scamType:"Malformed or disguised link",reasons:["The supplied value is not a valid standard URL.","Malformed links can hide or confuse the real destination."],advice:["Do not repair or open the link manually.","Navigate to the organization's official website independently."],uncertain:false,confidence:91,verdict:"suspicious",sources:["Local URL engine"]}};

  const host=url.hostname.toLowerCase().replace(/^www\./,"");
  const registered=registrableDomain(host);
  const labels=host.split(".");
  const full=url.href.toLowerCase();
  const pathQuery=(url.pathname+url.search+url.hash).toLowerCase();
  const domainCore=registered.split(".")[0]||"";
  const shorteners=SHORTENERS;
  const riskyTlds=new Set(["xyz","top","click","zip","mov","review","country","work","support","live","cam","gq","tk","ml","cf","buzz","rest","fit","quest","monster","download","xin","bond","shop","online","cfd","lol","vip","cc","win","loan","men","party","science","stream","racing","accountant","date","faith","icu","bar","rip","surf","cyou","sbs"]);
  const brands=KNOWN_BRANDS;
  const officialBrand=(()=>{const hit=Object.entries(brands).find(([,domains])=>domains.includes(registered));return hit?[hit[0],registered]:null})();

  if(!hadScheme)addSignal(state,"missing-scheme",4,"The protocol was omitted; CyberNet AI assumed HTTPS for parsing.","Unverified URL","structure");
  if(isPrivateHost(host))addSignal(state,"private-host",32,"Points to localhost, a private network, or a link-local address rather than a public website.","Private-network destination","structure",true);
  if(host.endsWith("."))addSignal(state,"trailing-dot",8,"Uses a trailing dot after the hostname, which can make domain comparisons confusing.","Domain-format deception","deception");
  if(url.protocol!=="https:")addSignal(state,"http",18,"Does not use HTTPS encryption.","Insecure web link","transport");
  if(original.includes("@")||url.username||url.password)addSignal(state,"userinfo",42,"Contains '@' or embedded credentials, which can disguise the actual destination.","URL destination deception","deception",true);
  if(shorteners.has(registered))addSignal(state,"shortener",28,"Uses a URL-shortening service that hides the final destination.","Hidden destination link","deception",true);
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||/^\[[0-9a-f:]+\]$/i.test(url.hostname))addSignal(state,"ip",34,"Uses a raw IP address instead of a normal domain name.","IP-based phishing link","structure",true);
  if(host.includes("xn--"))addSignal(state,"punycode",31,"Uses special hidden characters in the web address that can make it look like a different, trusted website.","Lookalike-domain phishing","deception",true);
  if(/[\u0080-\uffff]/.test(host))addSignal(state,"unicode",25,"Contains internationalized characters that may visually imitate another domain.","Lookalike-domain phishing","deception",true);
  if(labels.length>=5)addSignal(state,"subdomains",13,"Uses an unusually deep subdomain chain.","Subdomain deception","structure");
  if((registered.match(/-/g)||[]).length>=3)addSignal(state,"hyphens",11,"The registered domain contains many hyphens.","Suspicious domain structure","structure");
  if(/^[a-z0-9]+-com[a-z0-9.-]*\./i.test(host)||/-com-[a-z]/i.test(host))addSignal(state,"com-prefix-trick",29,"Uses \"-com\" combined with other text in the domain, a common trick to visually mimic a real \".com\" address.","Domain lookalike deception","deception",true);
  if(hostnameEntropy(domainCore)>3.65&&domainCore.length>=14)addSignal(state,"entropy",13,"The main domain label looks randomly generated or unusually complex.","Algorithmic-looking domain","structure");
  if(/^(?:0x[0-9a-f]+|\d{8,})$/i.test(host))addSignal(state,"encoded-ip",35,"The hostname resembles an encoded numeric IP address.","Obfuscated IP destination","deception",true);
  if(full.length>135)addSignal(state,"long",12,"The URL is unusually long and difficult to inspect.","Obfuscated URL","structure");
  if(url.port&&!['80','443'].includes(url.port))addSignal(state,"port",12,`Uses the uncommon network port ${url.port}.`,"Unusual service port","structure");
  if(riskyTlds.has(labels.at(-1)))addSignal(state,"tld",18,`Uses the higher-risk .${labels.at(-1)} domain extension.`,"Suspicious domain extension","structure");
  if(countMatches(full,/%[0-9a-f]{2}/gi)>=4)addSignal(state,"encoding",13,"Uses heavy URL encoding that makes the destination harder to read.","Encoded URL","deception");
  if(containsAny(pathQuery,["login","signin","verify","verification","account","password","secure-update","wallet-connect","unlock-account"]))addSignal(state,"credential-path",18,"The path asks for login, verification, account, password, or wallet action.","Credential phishing link","credentials");
  if(containsAny(pathQuery,["free","gift","claim","prize","winner","airdrop","bonus","reward"]))addSignal(state,"reward-path",15,"The path promotes a prize, gift, bonus, reward, or airdrop.","Prize / crypto scam link","reward");
  if(containsAny(pathQuery,["toll","unpaid","e-zpass","ezpass","turnpike","tollway"]))addSignal(state,"toll-path",26,"The path references an unpaid toll or turnpike fee, a widely-reported smishing pattern.","Toll / package-delivery smishing link","impersonation",true);
  if(containsAny(pathQuery,["package","delivery","redeliver","shipment","parcel","customs-fee"])&&containsAny(pathQuery,["fee","pay","confirm","reschedule"]))addSignal(state,"delivery-path",22,"The path references a delivery combined with a fee, confirmation, or rescheduling request.","Package-delivery smishing link","impersonation",true);
  if(/\.(exe|scr|msi|apk|bat|cmd|ps1|js|jar|iso|img|zip|rar|7z)(?:$|[?#])/i.test(url.pathname))addSignal(state,"download",48,"Points directly to an executable, script, disk image, or archive download.","Malware delivery link","malware",true);
  if(containsAny(full,["redirect=","url=","target=","continue=","next=","dest=","returnurl=","return_to="])&&/https?%3a|https?:\/\//i.test(full))addSignal(state,"redirect",23,"Contains a nested redirect destination that may send visitors elsewhere.","Redirect-based phishing","deception",true);
  try{const decoded=decodeURIComponent(full);if(decoded!==full&&/https?:\/\/[^\s]+https?:\/\//i.test(decoded))addSignal(state,"double-url",24,"Decoding reveals more than one web destination inside the URL.","Nested destination deception","deception",true)}catch{}
  if(/[?&](email|user|username|phone|card|account)=/i.test(url.search)&&state.categories.has("credentials"))addSignal(state,"prefill-identity",12,"Pre-fills identity or account information on a credential-related page.","Targeted credential page","credentials");
  if(/[?&](token|session|auth|password|pass|otp|code|key)=/i.test(url.search))addSignal(state,"secrets-query",24,"Places authentication-like information in the query string.","Credential-bearing URL","credentials",true);

  const mismatch=brandMismatch(host,registered,pathQuery);
  if(mismatch)addSignal(state,`brand-${mismatch.brand}`,35,`References “${mismatch.brand}” but the registered domain is ${registered}, not ${mismatch.official}.`,"Brand impersonation phishing","impersonation",true);
  Object.entries(brands).forEach(([brand,officials])=>{
    const core=registered.split(".")[0];const d=levenshtein(core,brand);
    if(!officials.includes(registered)&&brand.length>=5&&d>0&&d<=1)addSignal(state,`typo-${brand}`,37,`The domain is one character away from the brand “${brand}”.`,"Typosquatting phishing","impersonation",true);
  });
  const lures=officialBrand?[]:lureWordsIn(registered);
  if(lures.length)addSignal(state,"lure-domain",mismatch||registered.includes("-")?16:10,`The domain name itself uses account or security wording (“${lures.slice(0,2).join("”, “")}”) to look official.`,"Lookalike-domain phishing","deception");
  if(/[a-z]\d[a-z]|\d[a-z]{2,}|[a-z]{2,}\d/i.test(registered.split(".")[0])&&state.categories.has("impersonation"))addSignal(state,"substitution",16,"Uses letter-number substitutions commonly found in lookalike domains.","Typosquatting phishing","impersonation",true);

  // A police, government, tax or court name inside a commercial domain is the
  // shape of fine-and-fee scams ("cy-police-fines.com"): real authorities use
  // government domains. Whole tokens only, so "policy" and "taxi" pass.
  const governmentSite=/(^|\.)(gov|gouv|gob|govt|gc|go|mil|police|nic)\.[a-z]{2,3}$|\.(gov|mil|edu|int)$/i.test(registered);
  if(!officialBrand&&!governmentSite){
    const coreTokens=domainCore.split("-").filter(Boolean);
    const compactCore=domainCore.replace(/-/g,"");
    const authorityHit=AUTHORITY_TOKENS.find(token=>coreTokens.includes(token))||AUTHORITY_COMPACT.find(token=>compactCore.includes(token));
    if(authorityHit)addSignal(state,"authority-lure-domain",26,`The domain name uses an official-sounding word (“${authorityHit}”) but it is not a government website.`,"Government / authority impersonation","impersonation",true);
    const pathLure=(pathQuery.match(/\b(fine|fines|penalty|penalties|unpaid|overdue|refund|refunds|reward|rewards|prize|claim|unlock|suspended|reactivate|verify|verification|confirm|secure|update-payment|billing|invoice|customs|tax|toll)\b/)||[])[1];
    if(pathLure&&!state.signals.has("lure-domain"))addSignal(state,"lure-path",12,`The link’s path uses payment or account wording (“${pathLure}”) that scam pages use to look urgent.`,"Lure wording in the link","deception");
  }

  let score=nonlinearScore(state.raw);
  if(state.strong>=2)score=Math.max(score,83);else if(state.strong===1)score=Math.max(score,58);
  if(officialBrand&&state.signals.size===0)score=2;
  // A login or account page on the brand's own domain is the normal case,
  // not a warning sign; only strong signals can lift an official domain.
  if(officialBrand&&!state.strong)score=Math.min(score,12);
  if(!state.signals.size&&!officialBrand)score=7;
  const confidence=clamp(48+state.categories.size*8+state.strong*10+(hadScheme?4:0)+(!state.signals.size?20:0),35,97);
  const uncertain=!state.strong&&state.signals.size>0&&score<32&&!officialBrand;
  const counterEvidence=[];
  if(url.protocol==="https:")counterEvidence.push("The URL uses HTTPS, which protects transport but does not prove the site is legitimate.");
  if(officialBrand)counterEvidence.push(`The visible registered domain exactly matches ${officialBrand[1]}.`);
  if(labels.length<=3&&!host.includes("xn--")&&!state.signals.has("entropy")&&!state.signals.has("hyphens"))counterEvidence.push("The web address looks simple and doesn't use any hidden trick characters.");
  if(!state.reasons.length)state.reasons.push(officialBrand?`The visible registered domain matches ${officialBrand[1]}.`:"No strong suspicious pattern was found in the visible URL structure.");
  const advice=[
    "Do not open the link when the sender or context is unexpected.",
    `Verify that the registered domain is exactly “${registered}”.`,
    "Open the official website manually or use a trusted bookmark.",
    "Never enter passwords, OTP codes, payment details, or wallet recovery phrases on an unverified page.",
    "A structural scan cannot prove a page is safe without live reputation and destination-content checks."
  ];
  const verdict=verdictFromScore(score,uncertain);
  return{kind:"link",officialBrand:officialBrand?officialBrand[1]:"",signals:state.signalList,categories:[...state.categories],strong:state.strong,score,scamType:state.types.at(-1)||(uncertain?"Unverified link":officialBrand?"Official-looking domain structure":"No dominant URL threat type"),reasons:state.reasons,counterEvidence,advice,uncertain,confidence,verdict,sources:["Local URL engine"],registeredDomain:registered,note:uncertain?"CyberNet AI could not confirm this link is safe, so treat it as unsafe. Don't open it — go to the organization's official website directly instead.":officialBrand?"The visible domain matches a known official domain, but this does not verify the sender, page content, redirects, or account context.":"CyberNet AI evaluated the URL scheme, registered domain, lookalike patterns, path, query parameters, redirects, downloads, and brand impersonation."};
}

function analyzeImageRules(file,details={}){
  const state=createState(),name=normalizeText(file?.name||"");
  if(containsAny(name,["qr","scan","qrcode"]))addSignal(state,"filename-qr",9,"The filename suggests QR-code content.","Possible QR-code content","qr");
  if(containsAny(name,["bank","payment","invoice","receipt","crypto","wallet","refund"]))addSignal(state,"filename-money",8,"The filename suggests payment, banking, invoice, or crypto content.","Possible payment image","money");
  if(containsAny(name,["login","account","verify","security","password","otp"]))addSignal(state,"filename-login",9,"The filename suggests login, account, or verification content.","Possible login image","credentials");
  // The decoded content is judged by the engine that fits it (see
  // analyzeQrPayload); this line only records that a code was read.
  if(details.qrData)addSignal(state,"decoded-qr",4,`A QR code was decoded${details.qrData.length?`: ${details.qrData.slice(0,90)}${details.qrData.length>90?"…":""}`:"."}`,"","qr");
  if(details.width&&details.height){
    const megapixels=(details.width*details.height)/1e6;
    if(megapixels>20)state.limitations.push("The uploaded image was downscaled for efficient analysis.");
  }
  const score=details.qrResult?details.qrResult.score:nonlinearScore(state.raw);
  const reasons=details.qrResult?unique([...state.reasons,...details.qrResult.reasons]):unique([...state.reasons,"Local image analysis can reliably inspect file properties and QR codes, but not all visible text, logos, or layout details.",...state.limitations]);
  const advice=details.qrResult?details.qrResult.advice:["Do not scan unknown QR codes or follow instructions shown only in a screenshot.","Verify payments, alerts, and login requests through the official app or website.","Do not call phone numbers or install software shown in suspicious popups.","Use the secure deep-analysis service for visual text, logo, and impersonation inspection."];
  return{score,scamType:details.qrResult?.scamType||state.types.at(-1)||"Unverified image content",reasons,advice,uncertain:details.qrResult?details.qrResult.uncertain:true,confidence:details.qrResult?Math.max(details.qrResult.confidence||0,78):(details.qrData?62:28),verdict:details.qrResult?.verdict||"inconclusive",sources:["Local image checks",...(details.qrData?["QR decoder"]:[])],note:details.qrResult?"CyberNet AI decoded the QR code and evaluated its content. Deep image analysis may add visible-text and impersonation evidence.":"CyberNet AI could not confirm this image is safe from local checks alone, so treat it as unsafe. Don't scan any QR code or follow any instructions shown in it."};
}

function detectChatContentType(raw){
  const trimmed=String(raw||"").trim();
  if(!trimmed)return "text";
  const soleUrl=/^(https?:\/\/|www\.)\S+$/i;
  const bareDomain=/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
  if(!/\s/.test(trimmed)&&(soleUrl.test(trimmed)||bareDomain.test(trimmed)))return "link";
  return "text";
}

const AUTHORITY_TOKENS=["gov","govt","government","police","ministry","tax","taxes","irs","hmrc","customs","court","courts","fine","fines","penalty","penalties","interpol","traffic","immigration","municipality","embassy","passport","visa","tribunal"];
const AUTHORITY_COMPACT=["police","interpol","ministry","customs","immigration","penalt"];

// The one line between "scam" and "not a scam", used by the page, the server
// and the team log. 32 and above is shown as SCAM.
const SCAM_THRESHOLD=32;
function verdictFromScore(score,uncertain=false){
  const value=Number(score)||0;
  if(uncertain&&value<70)return "inconclusive";
  if(value>=75)return "malicious";
  if(value>=SCAM_THRESHOLD)return "suspicious";
  return "low_risk";
}

// Plain-language reading of a result: one lead sentence, up to three reasons
// a non-technical person can act on, and one thing to do. Ordered by how
// decisive the pattern is; the technical evidence stays under "more details".
const PLAIN_POINTS=[
  {ids:["secret-request"],text:"It asks you to send a password, code, PIN or card details. Real companies never ask for these in a message."},
  {ids:["otp-relay"],text:"It asks you to pass on a code that was sent to your phone. That code protects your account: never share it."},
  {ids:["remote","install"],text:"It wants you to install something or hand over control of your device."},
  {ids:["irreversible-payment"],text:"It asks for payment in a way that cannot be reversed, such as gift cards or crypto."},
  {ids:["payment-redirect"],text:"It announces new bank details for a payment. Always confirm that by phone with a number you already have."},
  {ids:["authority-impersonation","govt-authority-threat","govt-authority-finance","authority"],text:"It claims to be the police, a government office or a court, and uses that to pressure you."},
  {ids:["authority-lure-domain"],text:"The address uses a police or government name, but it is not a government website."},
  {ids:[/^brand-/,/^typo-/,"substitution","punycode","unicode","com-prefix-trick"],text:"The address imitates a real company’s website with a look-alike name."},
  {ids:["dangerous-embedded-link"],text:"The link inside it looks unsafe: it does not go where it claims."},
  {ids:["threat"],text:"It uses threats, such as arrest, legal action or losing your account, to scare you into acting."},
  {ids:["urgency","deadline-pressure","money-pressure"],text:"It pushes you to act right now, so you do not stop to check."},
  {ids:["otp","credentials"],text:"It talks about passwords, codes or “verifying your account”, which is how scammers get into accounts."},
  {ids:["prize"],text:"It promises a prize, reward or free money you never asked for."},
  {ids:["delivery","delivery-smishing","toll-smishing"],text:"It uses a parcel, toll or delivery fee as the excuse to make you pay or click."},
  {ids:["job","task-scam","romance-investment","investment"],text:"It promises easy money or guaranteed returns. Nobody can guarantee that."},
  {ids:["family-emergency"],text:"It plays on a family emergency to rush you into sending money."},
  {ids:["public-email"],text:"It claims to be a company or bank but writes from a free email address."},
  {ids:["shortener"],text:"The link is shortened, which hides where it really goes."},
  {ids:["ip","private-host"],text:"It points to a raw number address instead of a normal website name."},
  {ids:["userinfo","redirect","double-url"],text:"The address is built to send you somewhere other than where it appears to go."},
  {ids:["lure-domain","lure-path"],text:"The address uses words like “secure”, “verify” or “fine” to look official."},
  {ids:["suspicious-embedded-link","link-pressure"],text:"It wants you to click a link. Scams live in the link, not in the words around it."},
  {ids:["http"],text:"The page is not encrypted (http), so anything typed there can be read by others."},
  {ids:["download","risky-download"],text:"The link downloads a file, which could be harmful."},
  {ids:["hidden-chars"],text:"It contains hidden characters used to disguise what you are really reading."},
  {ids:["risky-tld","entropy","hyphens","subdomains"],text:"The web address is unusual in the ways scam sites often are."},
  {ids:["links"],text:"It contains a link. Check where a link really goes before you open it."}
];
function plainSummary(result,options={}){
  const signals=Array.isArray(result?.signals)?result.signals:[];
  const ids=signals.map(item=>item.id);
  const matches=(pattern)=>pattern instanceof RegExp?ids.some(id=>pattern.test(id)):ids.includes(pattern);
  const score=Number(result?.score)||0;
  const isLink=result?.kind==="link";
  const scam=score>=SCAM_THRESHOLD;
  const unverified=isLink&&!scam&&!result?.officialBrand;
  const points=[];
  if(scam){
    for(const point of PLAIN_POINTS){
      if(point.ids.some(matches)&&!points.includes(point.text))points.push(point.text);
      if(points.length>=3)break;
    }
    // The AI can flag something the rules have no pattern for; its own words
    // then carry the summary.
    if(!points.length&&options.fallbackText){
      const sentences=String(options.fallbackText).match(/[^.!?]+[.!?]+/g)||[String(options.fallbackText)];
      points.push(...sentences.slice(0,2).map(item=>item.trim()));
    }
    if(!points.length)points.push("It matches patterns CyberNet AI sees in scams.");
    return{
      lead:"This has the signs of a scam.",
      points,
      action:isLink
        ?"Don’t open this link. If it came with a message, go to the company’s official app or website yourself."
        :"Don’t click, reply or pay. If it says it is from a company or an authority, contact them through their official app or website.",
      scam:true,unverified:false
    };
  }
  if(unverified){
    return{
      lead:"We couldn’t confirm whether this website is genuine.",
      points:[
        "No known scam tricks in the address, but that does not prove the site is real.",
        "Scams usually show in the message around a link. Paste the whole message for a better check."
      ],
      action:"Only open it if you were expecting it, and never type passwords or card details there.",
      scam:false,unverified:true
    };
  }
  return{
    lead:isLink?"This address looks fine.":"We didn’t find the usual signs of a scam.",
    points:[isLink&&result?.officialBrand?`The web address belongs to ${result.officialBrand}.`:"No pressure, no request for codes or money, and no suspicious link."],
    action:"Stay alert anyway: no scanner can promise something is 100% safe.",
    scam:false,unverified:false
  };
}

return {
  VERSION: "2026-09-24",
  analyzeText: analyzeTextRules,
  analyzeTextRules,
  analyzeLinkRules,
  analyzeImageRules,
  analyzeQrPayload,
  analyzeLink: analyzeLinkRules,
  analyzeQr: analyzeQrPayload,
  analyzeImage: analyzeImageRules,
  collectLinksInText,
  detectChatContentType,
  looksLikeWebAddress,
  registrableDomain,
  isOfficialDomain,
  brandMismatch,
  lureWordsIn,
  KNOWN_BRANDS,
  SHORTENERS,
  LURE_WORDS,
  clamp,
  unique,
  SCAM_THRESHOLD,
  verdictFromScore,
  plainSummary,
};
});
