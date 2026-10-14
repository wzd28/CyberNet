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

// Two- and three-letter ASCII terms ("irs", "btc") only count as whole words:
// "irs" must not match "first". Longer terms keep substring matching so
// plural and inflected forms still hit.
const SHORT_TERM_CACHE={};
function shortTermRegex(term){return SHORT_TERM_CACHE[term]||(SHORT_TERM_CACHE[term]=new RegExp("(?:^|[^a-z0-9])"+term+"(?![a-z0-9])"))}
function hasTerm(variants,terms){return terms.some(term=>{const whole=/^[a-z]{2,3}$/.test(term);return variants.some(v=>whole?shortTermRegex(term).test(v):v.includes(term))})}

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
  paypal:["paypal.com"],microsoft:["microsoft.com","microsoftonline.com","office.com","office365.com","microsoft365.com","live.com","sharepoint.com","onedrive.com","azure.com","windows.com","msn.com"],apple:["apple.com","apple.co"],google:["google.com"],amazon:["amazon.com","amazon.ae","amazon.sa"],netflix:["netflix.com"],instagram:["instagram.com"],facebook:["facebook.com"],whatsapp:["whatsapp.com"],dropbox:["dropbox.com"],dhl:["dhl.com"],fedex:["fedex.com"],ups:["ups.com"],usps:["usps.com"],adobe:["adobe.com"],coinbase:["coinbase.com"],binance:["binance.com"],icloud:["icloud.com"],walmart:["walmart.com"],chase:["chase.com"],wellsfargo:["wellsfargo.com"],bankofamerica:["bankofamerica.com"],venmo:["venmo.com"],zelle:["zelle.com"],cashapp:["cash.app"],steam:["steampowered.com"],linkedin:["linkedin.com"],tiktok:["tiktok.com"],snapchat:["snapchat.com"],discord:["discord.com"],spotify:["spotify.com"],ezpass:["e-zpass.com"],xfinity:["xfinity.com"],verizon:["verizon.com"],
  hsbc:["hsbc.com","hsbc.ae","hsbc.co.uk"],barclays:["barclays.co.uk"],lloyds:["lloydsbank.com"],santander:["santander.co.uk","santander.com"],citibank:["citi.com","citibank.com"],revolut:["revolut.com"],
  adcb:["adcb.com"],emiratesnbd:["emiratesnbd.com"],enbd:["emiratesnbd.com"],mashreq:["mashreq.com","mashreqbank.com"],rakbank:["rakbank.ae"],bankfab:["bankfab.com"],adib:["adib.ae"],dib:["dib.ae"],
  alrajhi:["alrajhibank.com.sa"],riyadbank:["riyadbank.com"],alahli:["alahli.com"],qnb:["qnb.com"],kfh:["kfh.com"],nbk:["nbk.com"],boubyan:["boubyan.com"],bankmuscat:["bankmuscat.com"],
  etisalat:["etisalat.ae","eand.com"],mobily:["mobily.com.sa"],zain:["zain.com","sa.zain.com"],ooredoo:["ooredoo.com","ooredoo.qa"],dewa:["dewa.gov.ae"],sewa:["sewa.gov.ae"],salik:["salik.ae"],
  uaepass:["uaepass.ae"],absher:["absher.sa"],emiratespost:["emiratespost.ae"],emiratesid:["icp.gov.ae"],
  aramex:["aramex.com"],smsa:["smsaexpress.com"],noon:["noon.com"],talabat:["talabat.com"],careem:["careem.com"],
  tesla:["tesla.com"],metamask:["metamask.io"],trustwallet:["trustwallet.com"],ledger:["ledger.com"],telegram:["telegram.org","t.me"],outlook:["outlook.com","live.com","office.com","office365.com","microsoftonline.com"],gmail:["gmail.com","google.com"],
  sharepoint:["sharepoint.com"],onedrive:["onedrive.com"],docusign:["docusign.com","docusign.net"],royalmail:["royalmail.com"],disneyplus:["disneyplus.com"],du:["du.ae"],
  carrefour:["carrefouruae.com","carrefourksa.com","carrefourqatar.com","carrefourkuwait.com","carrefourbahrain.com","carrefouroman.com","carrefour.com","mafcarrefour.com"],meta:["meta.com","facebook.com"],rta:["rta.ae"],parkin:["parkin.ae"],dubizzle:["dubizzle.com"],emirates:["emirates.com"],skywards:["emirates.com"],etihad:["etihad.com"],flydubai:["flydubai.com"],knet:["knet.com.kw","knetpay.com.kw","kpay.com.kw"],fab:["bankfab.com"],smartdubai:["smartdubai.ae","digitaldubai.ae","dubai.ae"],
  eand:["eand.com","etisalat.ae"],adnoc:["adnoc.ae","adnocdistribution.ae"],luluhypermarket:["luluhypermarket.com"],dubaidutyfree:["dubaidutyfree.com"],stc:["stc.com.sa","stcpay.com.sa"],stcpay:["stcpay.com.sa"],naqel:["naqelexpress.com"],spl:["splonline.com.sa"],qpost:["qpost.qa"]
};
const GULF_CODES=["ae","uae","sa","ksa","saudi","kw","qa","bh","om","dubai","abudhabi","sharjah","kuwait","qatar","oman","bahrain","riyadh"];
const GULF_CODES_SHORT=["ae","uae","sa","ksa","kw","qa","bh","om"];
const PAY_LURES=["pay","payment","payments","paynow","fine","fines","toll","tolls","bonus","reward","rewards","gift","refund","refunds","bill","bills","billing","topup","recharge","penalty","penalties","prize","claim","wallet","fee","fees","unpaid","cashback","voucher"];
// Brand names that are also ordinary words, surnames, acronyms or common
// business prefixes ("meta" tags, "Emirates Accounting", "fab" gifts, UK "RTA"
// claims, "sewa.org"): they only count as a whole host token next to one of
// the payment, account or reward words below, never next to trade words
// ("services", "security", "support") or longer words that merely contain a
// lure ("accounting", "promotions", "packages").
const LURE_ONLY_BRANDS=new Set(["carrefour","meta","emirates","skywards","etihad","flydubai","dubizzle","parkin","knet","smartdubai","sewa","dewa","luluhypermarket","adnoc","dubaidutyfree","eand","fab","rta","stc","spl"]);
const BRAND_LURES=[...PAY_LURES,"verify","verification","login","signin","account","unlock","reactivate","suspended","otp","giveaway","anniversary","miles","expire","expiry","redelivery","winner","lottery","promo","renew","renewal"];
// "Emirates" and "Etihad" also start many ordinary UAE company names
// ("Emirates Payments", "Emirates Gift Shop"): only airline-scam words count.
// "fab" is also "fabulous": only banking words count.
const AIRLINE_LURES=["verify","verification","login","signin","account","refund","refunds","claim","prize","reward","rewards","bonus","giveaway","anniversary","miles","expire","expiry","winner","lottery","promo","unlock","reactivate","suspended","otp","cashback","voucher"];
const BRAND_LURES_ONLY={fab:["login","signin","verify","verification","account","otp","card","cards","pay","payment","refund","update","unlock","reactivate","suspended","wallet","banking"],emirates:AIRLINE_LURES,etihad:AIRLINE_LURES};
const BRAND_LURES_EXTRA={meta:["support","help","helpdesk","appeal","appeals","copyright","verified","badge","violation"]};
function brandLures(brand){return BRAND_LURES_ONLY[brand]||[...BRAND_LURES,...(BRAND_LURES_EXTRA[brand]||[])]}
// Acronyms that mean something else abroad: RTA is "road traffic accident" in
// the UK and a transport authority in Australia.
const ACRONYM_ABROAD={rta:/\.(uk|au|ie|nz)$/};
// Brands one letter away from a dictionary word or surname: parking.com,
// larkin.com (parkin), skyward.com (skywards), emirate.ae. Only the
// look-alike-character check (0 for o, 1 for l) applies to them.
const TYPO_EXEMPT=new Set(["parkin","skywards","emirates"]);
// Gulf government services, toll/parking systems and payment networks that
// scam texts copy ("darb-toll-pay", "knet-payment-kw"). None of them takes
// payment on an unknown commercial domain. Whole tokens only. "parking" is an
// ordinary word and only counts next to a Gulf city or country code.
const GULF_SERVICES=["darb","mawaqif","mawaqef","itc","nol","nolcard","rta","salik","parkin","knet","mof","smartdubai","icp","moi","absher","tamm","gdrfa","mohre","sadad","dewa","sewa","addc","fewa","saher","mada","benefitpay","ejari","qiwa","metrash","sahel","paci","hukoomi","tasheel","edirham","nafath","musaned"];
// Government-only services: a visa, status or renewal word is a lure too.
const GOV_SERVICES=["icp","gdrfa","mohre","moi","mof","tamm","absher","qiwa","metrash","hukoomi","nafath","musaned","tasheel","paci","sahel","ejari"];
const GOV_LURES=["visa","visas","renewal","renew","permit","residency","iqama","violation","violations","mukhalafat"];
const SERVICE_LURES=[...PAY_LURES,"violation","violations","mukhalafat","renew","renewal"];
// Names that make up a "service + country code" look-alike ("rta-dubai-ae",
// "knet-gateway-kw", "du-ae"). The acronyms that also mean other things
// (ITC hotels, ICP, MOI) need a second name or a parking / gov word.
const GULF_IDS=[...GULF_SERVICES,"du","etisalat","eand","emiratespost","uaepass","emiratesid","qpost","naqel","spl","stc","stcpay","adnoc"];
const AMBIGUOUS_IDS=["itc","moi","mof","icp","mada","sahel","nol","stc","spl","paci","sewa","parking"];
// Next to those acronyms only a bill, fine or payment word is the lure, not
// a gift or reward ("itc-hotels-gift", "icp-staking-rewards").
const BILL_LURES=["pay","payment","payments","paynow","fine","fines","toll","tolls","bill","bills","billing","topup","recharge","penalty","penalties","fee","fees","unpaid","refund","refunds","violation","violations","mukhalafat","renew","renewal"];
const ID_FILLERS=["gov","govt","portal","gateway","online","eservices","eservice","services","service","official","express","post","app","web","offer","offers","parking","center","centre","support","help"];
// Free site builders, hosting subdomains, tunnels and storage buckets: anyone
// can publish a page on them in minutes, so a brand, government service or
// payment word in the site name ("du-ae.netlify.app/billing") is the
// scammer's own label. On the path-named ones the site name is the path.
const FREE_HOSTS=["netlify.app","vercel.app","github.io","gitlab.io","codeberg.page","pages.dev","workers.dev","web.app","firebaseapp.com","appspot.com","herokuapp.com","onrender.com","fly.dev","up.railway.app","deno.dev","glitch.me","repl.co","replit.app","replit.dev","lovable.app","bubbleapps.io","softr.app","wixsite.com","editorx.io","wixstudio.io","weebly.com","weeblysite.com","blogspot.com","wordpress.com","sites.google.com","notion.site","000webhostapp.com","square.site","godaddysites.com","mystrikingly.com","jimdosite.com","webnode.page","yolasite.com","site123.me","canva.site","tiiny.site","amplifyapp.com","ngrok-free.app","ngrok-free.dev","ngrok.io","ngrok.app","trycloudflare.com","surge.sh","azurewebsites.net","webflow.io","framer.website","framer.app","carrd.co","glide.page","r2.dev","storage.googleapis.com","firebasestorage.googleapis.com","s3.amazonaws.com","blob.core.windows.net"];
const FREE_HOSTS_PATH_NAMED=["sites.google.com","wixsite.com","editorx.io","wixstudio.io","weebly.com","r2.dev","storage.googleapis.com","firebasestorage.googleapis.com","s3.amazonaws.com","blob.core.windows.net"];
function freeHostOf(host){return FREE_HOSTS.find(s=>host===s||host.endsWith("."+s))||""}
// Payment or account words that make a free-host page a lure on their own
// only in pairs ("refund-claim", "pay-bill"): one ordinary word is a name
// ("bill-chen", "split-the-bill", "fine-dining", "pay-it-forward").
const FREE_HOST_LURES=["billing","bill","bills","pay","payment","payments","paynow","quickpay","easypay","billpay","paybill","epay","verify","verification","login","signin","refund","refunds","fine","fines","toll","tolls","parcel","parcels","redelivery","customs","penalty","unpaid","overdue","invoice","wallet","unlock","suspended","reactivate","otp","claim","prize","reward","rewards","bonus"];
const LURE_STEM={billing:"bill",bills:"bill",payment:"pay",payments:"pay",paynow:"pay",verification:"verify",signin:"login",refunds:"refund",fines:"fine",tolls:"toll",parcels:"parcel",rewards:"reward"};
// Next to a brand or service name, delivery, gift and renewal words count too.
const FREE_HOST_BRAND_LURES=[...FREE_HOST_LURES,...BRAND_LURES,"track","tracking","delivery","shipment","coupon","secure","confirm","reschedule"];
const FREE_HOST_DEV=["clone","demo","tutorial","portfolio","project","practice","sample","replica","example","examples","starter","template","templates","boilerplate","docs","doc","sdk","api","react","native","js","vue","angular","svelte","nextjs","flutter","plugin","lib","library","playground","sandbox","poc","test","course","learn","assignment","homework","fan","fanpage","widget","calculator","generator","dashboard","stats","bot","extension","cli"];
// News, blog and documentation paths ("/news/apple-results",
// "/2024/05/how-to-pay-du-bill-online.html", ".../absher-scam-warning")
// mention brands and bills because they write about them.
const ARTICLE_WORDS=["news","blog","blogs","post","posts","article","articles","story","stories","docs","wiki","scam","scams","fake","beware","warning","hoax","how","guide"];
function articleLikePath(pathQuery){return String(pathQuery||"").split(/[?#]/)[0].split(/[\/._-]/).some(t=>/^(19|20)\d{2}$/.test(t)||ARTICLE_WORDS.includes(t))}
// A domain made only of Gulf service or brand names, country codes and filler
// words ("rta-dubai-ae", "du-ae", "naqel-express-ksa").
function gulfIdOnly(tokens,ids){
  if(tokens.length<2)return false;
  const named=tokens.filter(t=>ids.includes(t));
  if(!named.length||!tokens.some(t=>GULF_CODES.includes(t))||!tokens.every(t=>ids.includes(t)||GULF_CODES.includes(t)||ID_FILLERS.includes(t)))return false;
  return named.some(t=>!AMBIGUOUS_IDS.includes(t))||named.length>=2||tokens.some(t=>["parking","gov","govt"].includes(t));
}
// "nol-rta", "salik-rta": two different Gulf service names and nothing else.
function gulfNamesOnly(tokens,ids){
  if(tokens.length<2||!tokens.every(t=>ids.includes(t)||ID_FILLERS.includes(t)))return false;
  return new Set(tokens.filter(t=>ids.includes(t))).size>=2;
}

// Google's own share links for Maps and Photos are what people send each other
// every day; they live on goo.gl but are not a hiding place for another site.
function officialShortLink(host,pathname){return host==="maps.app.goo.gl"||host==="photos.app.goo.gl"||(host==="goo.gl"&&/^\/maps\//.test(pathname||""))}
// QR-code generator redirect services: real menus use them too, so a weak
// "hidden destination" sign (CAN'T CONFIRM), never a flat SCAM on its own.
const QR_REDIRECTORS=new Set(["qrco.de","l.ead.me","qr.io","me-qr.com","qrfy.com"]);
const SHORTENERS=new Set(["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly","rebrand.ly","shorturl.at","tiny.one","rb.gy","v.gd","s.id","lnkd.in","tr.im","clickmeter.com","t.ly","short.io","tiny.cc","bl.ink","shorte.st","urlz.fr","surl.li","cutt.us"]);

// Words criminals put in a domain name to make it feel official.
const LURE_WORDS=["secure","security","verify","verification","login","signin","update","support","alert","confirm","unlock","refund","billing","payment","pay","wallet","account","auth","helpdesk","service","redelivery","reschedule","customs","claim","prize","bonus","activate","reactivate","bill","fee","fees","reward","rewards","gift","promo","lottery","winner","notice","fines","penalty","parcel","package"];
// Fragments a brand name gets glued to in a lookalike host ("appleid", "paypal365").
const BRAND_GLUE=["id","ids","app","apps","online","official","store","shop","care","help","team","mail","web","tv","plus","live","info","center","centre","portal"];

function isOfficialDomain(registered){return Object.values(KNOWN_BRANDS).some(domains=>domains.includes(registered))}

// A brand name as a whole token of the host ("adcb-secure-login.info"), or a
// longer name anywhere in the hyphen-stripped host ("emirates-post-redelivery")
// or the path, on a domain the brand does not own. News, blog and docs paths
// do not count ("/news/apple-results"). On a free host the subdomain is the
// publisher's own label: the free-host rules judge it (a brand next to a lure
// or a country code), not the bare name ("facebook.github.io", "spotify-stats").
function brandMismatch(host,registered,pathQuery=""){
  if(isOfficialDomain(registered)||freeHostOf(host))return null;
  const hostTokens=host.split(/[.-]/).filter(Boolean);
  const tokens=new Set([...hostTokens,...(articleLikePath(pathQuery)?[]:String(pathQuery||"").split(/[\/._-]/))].filter(Boolean));
  // A brand spelled across whole tokens ("emirates-post", "emiratespost") or
  // glued to a lure word ("appleid-support"), never inside an ordinary word
  // ("pineapple", "purchase", "gazelle").
  const joins=new Set();
  for(let i=0;i<hostTokens.length;i++){let acc="";for(let j=i;j<hostTokens.length&&j<i+3;j++){acc+=hostTokens[j];joins.add(acc)}}
  const glued=brand=>hostTokens.some(t=>{if(t.length<=brand.length)return false;const rest=t.startsWith(brand)?t.slice(brand.length):t.endsWith(brand)?t.slice(0,-brand.length):"";return Boolean(rest)&&(/^\d{1,4}$/.test(rest)||LURE_WORDS.includes(rest)||BRAND_GLUE.includes(rest))});
  // Two- and three-letter brands ("du", "ups", "dhl") are ordinary syllables
  // too ("start-ups"): they only count next to a lure word in the host.
  const lured=lureWordsIn(registered).length>0||hostTokens.some(t=>LURE_WORDS.includes(t));
  // "dhl-ae.cc/track": a short brand with a payment or tracking word in the path.
  const pathLured=/\/(?:track|tracking|pay|payment|fee|verify|login|signin|redeliver|reschedule|confirm|claim|invoice|customs)/.test(String(pathQuery||""));
  // "carrefouruae-gift", "metabusiness-help": the brand glued to a Gulf
  // country code or to "business".
  const gluedCode=brand=>hostTokens.some(t=>t.startsWith(brand)&&(GULF_CODES.includes(t.slice(brand.length))||t.slice(brand.length)==="business"));
  for(const [brand,officials] of Object.entries(KNOWN_BRANDS)){
    if(ACRONYM_ABROAD[brand]&&ACRONYM_ABROAD[brand].test(registered))continue;
    if(LURE_ONLY_BRANDS.has(brand)){const lures=brandLures(brand);if((hostTokens.includes(brand)||joins.has(brand)||gluedCode(brand))&&hostTokens.some(t=>t!==brand&&lures.includes(t)))return{brand,official:officials[0]};continue}
    if(brand.length<=3){if(hostTokens.includes(brand)&&(lured||pathLured))return{brand,official:officials[0]};continue}
    if(tokens.has(brand)||(brand.length>=5&&(joins.has(brand)||glued(brand))))return{brand,official:officials[0]};
  }
  return null;
}

// Longer words that merely contain a lure ("emirates-accounting",
// "holiday-packages") are not that lure.
const LURE_FALSE_FRIENDS=/accounting|accountants?|promotions?|packages|packaging/g;
function lureWordsIn(registered){
  const core=String(registered||"").split(".")[0];const parts=core.split("-");const compact=core.replace(/-/g,"").replace(LURE_FALSE_FRIENDS," ");
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

// ── Two owner-approved rules (14 Oct 2026) ──
// 1. "Sorry, wrong number... I'm a gold trader, I can teach you to invest": the
//    opener of investment and romance ("pig butchering") scams.
// 2. "I am an army officer in Syria with a trunk box of funds, help me move it,
//    you get 30%": the advance-fee hidden-fortune story.
// Each needs two or three parts together, never one keyword, and both read a
// copy of the text made by twoRuleText(): curly apostrophes, Arabic-Indic
// digits and the dots in "Sgt." / "Mr." / "$3.5M" are evened out, and "..." /
// "!!!" become commas, so punctuation does not cut the sentence windows short.
// \b never matches next to Arabic letters, so the Arabic patterns use none.
function twoRuleText(clean){
  return clean.replace(/[’‘ʼ`´]/g,"'").replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/٪/g,"%").replace(/\bu\.s\.(?:a\.)?/g,"us ").replace(/\b(mrs?|ms|miss|dr|engr?|rev|fr|prof|sgt|lt|capt|col|gen|maj|cpl|pvt|hon|sr|jr)\./g,"$1").replace(/(\d)\.(?=\d)/g,"$1,").replace(/\.{2,}|…|!{2,}|\?{2,}/g,", ");
}
// A message that warns about these scams describes them; it is not one ("this
// is not a scam" is the scammer talking, so it does not count).
const TWO_RULE_WARNING=/\b(?:scammers?|fraudsters?|con ?artists?|beware|watch out for|be careful (?:of|with (?:these|such|this kind))|careful everyone|scam alert|fraud alert|fake (?:army|military|officers?|soldiers?|traders?|diplomats?|lawyers?|barristers?|messages?|texts?|emails?|profiles?|accounts?|(?:trading |investment |crypto )?(?:apps?|platforms?|sites?|websites?|brokers?))|lost (?:money|everything|my savings|his savings|her savings)|warn(?:s|ed|ing)|police (?:say|said|warn\w*|arrested|have arrested)|arrested|going around|don'?t (?:reply|respond|answer)|do not (?:reply|respond|answer)|never (?:reply|respond)|report (?:it|them|this|the (?:number|sender))|block (?:the (?:number|sender)|them))\b/;
const TWO_RULE_SCAM_WORD=/\b(?:scams?|fraud|hoax)\b/;
const TWO_RULE_NOT_SCAM=/\b(?:not|no|never|isn'?t)\s+(?:a\s+)?(?:scam|fraud|hoax)\b/;
const TWO_RULE_WARNING_AR=/(?:احذر|احذروا|حذار|تحذير|المحتال|محتال|النصاب|نصاب|احتيال|لا ترد|لا تردوا|لا تتجاوب|بلّغ|بلغوا)/u;
function twoRuleWarning(t){
  return TWO_RULE_WARNING.test(t)||TWO_RULE_WARNING_AR.test(t)||(TWO_RULE_SCAM_WORD.test(t)&&!TWO_RULE_NOT_SCAM.test(t));
}

// Rule 1. The opener: a "wrong number" / "texted you by mistake" message (or a
// vague "got your number from a friend"), in English, Arabic or the chat
// languages common in the Gulf.
const WN_OPENER=/\bwro?ng\s+(?:numb?e?r|nmbr|nmber|nambar|person|contact|chat|text|msg|message|profile|whatsapp|inbox|guy|girl|lady)(?![a-z])|\bwro?ng\s+(?:no\.|#)|\b(?:wrongly|mistakenly|accidentally|accidently)\s+(?:texted|texting|messaged|messaging|msged|sent|added|saved|dialed|dialled|called|contacted|wrote)\b|\b(?:texted|texting|messaged|messaging|msged|sent|added|saved|dialed|dialled|called|contacted|wrote|writing)\s+(?:(?:to|this|this to|that to|a message to|the message to|you|u|your number|this number)\s+){0,2}(?:by (?:mistake|accident)|accidentally|mistakenly|in error)\b|\b(?:mixed|messed)\s+up\s+(?:the\s+|my\s+|your\s+)?(?:numbers?|contacts?)\b|\b(?:saved?|got|have|had|used|typed|dialed|dialled)\s+(?:your|the|this)\s+number\s+(?:wrong(?:ly)?|incorrectly)\b|\bnot the (?:person|one|guy|lady|girl) i (?:was supposed to|wanted to|meant to|was trying to)\b|\bi thought (?:you were|u were|this (?:was|is))\b|\bsorry (?:for|about) (?:the|my) (?:mistake|wrong (?:text|message|number))\b/;
const WN_OPENER_AR=/رقم\s?(?:ال)?(?:خطأ|خطا|غلط|خاطئ)|(?:غلطت|أخطأت|اخطأت|أخطات|اخطات|خربطت|غلطان|غلطانة|غلطانه)\s?(?:في|فى|ب|بال)?\s?(?:ال)?رقم|(?:أرسلت|ارسلت|راسلتك|كتبت لك|بعثت|أرسلتلك|ارسلتلك)[^.!?]{0,25}(?:بالغلط|بالخطأ|بالخطا|عن طريق الخطأ|عن طريق الخطا)|(?:رسالة|الرسالة|رسالتي)\s(?:بالخطأ|بالغلط|بالخطا)/u;
const WN_FOREIGN=/\b(?:galat|ghalat|galt)\s+(?:number|numbr|nmbr|no|raqam|rakam|ra2am|nambar)\b|\b(?:raqam|rakam|ra2am)\s+(?:ghalat|galat|khata|5ata)\b|\bgalti se\b|\bmaling (?:numero|number)\b|\bmauvais num[ée]ro|\bn[uú]mero equivocado\b/;
const WN_REFERRAL=/\b(?:got|found|have|saw|took|received|was given|came across|picked up)\s+your\s+(?:number|contact|details)\s+(?:from|through|via|in|on)\s+(?:(?:a|my)\s+(?:mutual\s+|common\s+)?friend|(?:a|the)\s+business\s+(?:group|directory|forum|network|list)|an?\s+(?:investment|trading|crypto|forex)\s+group)\b/;
const WN_REFERRAL_AR=/(?:حصلت على|أخذت|اخذت)\s?رقمك\s?من\s?(?:صديق|صديقة|أحد الأصدقاء|احد الاصدقاء)/u;
// Not a stranger after all ("if you are the Walid I know from uni"), or a
// property / insurance pitch rather than trading.
const WN_KNOWN=/\b(?:you told me|you said you|as you (?:said|mentioned|asked)|i know you from|you wanted to learn)\b|\b(?:the|my) [a-z]+ (?:i|we) know from\b/;
const WN_PROPERTY=/\b(?:real estate|propert(?:y|ies)|apartments?|villas?|off-?plan|rental|insurance|sukuk|savings plan|pension|mortgage)\b|(?:عقار|عقارات|شقة|شقق|فيلا|تأمين)/u;
const WN_TRADING=/\b(?:crypto\w*|bitcoin|btc|usdt|forex|fx|binary|signals?|gold)\b|(?:فوركس|العملات الرقمية|بيتكوين|الذهب|توصيات)/u;
// The hook. (a) An offer to teach or help the reader make money.
const WN_NUM="\\d[\\d,]*\\s?(?:k|m)?";
const WN_MONEY="(?:invest(?:ing|ment|ments)?|trad(?:e|ing)(?!\\s+(?:cards?|in\\b|places|hours))|earn(?:ing)?\\s+(?:money|extra|more|profits?|income|daily|weekly|monthly|from|online|"+WN_NUM+"|[$€£]|big|good|passive|a lot|up to|stable|steady|cash)|profits?|make (?:money|profits?|"+WN_NUM+"|some|extra|more|good|a lot|daily|passive|real|big)|(?:extra|passive|monthly|daily|weekly|stable|side|second) income|grow (?:your |ur )?(?:money|savings|wealth|capital|income|portfolio)|double (?:your |ur )?(?:money|savings|capital|investment)|financial freedom|get rich|crypto\\w*|forex(?!\\s+(?:exchange|bureau|counter|rates?|card))|bitcoin|btc|usdt)";
const WN_EARN_ANY="(?:invest(?:ing|ment|ments)?|trad(?:e|ing)|earn(?:ing)?|profits?|make (?:money|profits?|"+WN_NUM+"|some|extra|more|good|a lot|daily|passive|real|big)|(?:extra|passive|monthly|daily|weekly|stable|side|second) income|grow (?:your |ur )?(?:money|savings|wealth|capital|income|portfolio)|double (?:your |ur )?(?:money|savings|capital|investment)|financial freedom|get rich|crypto\\w*|forex|bitcoin)";
const WN_OFFER_VERB="(?:teach|show|help|guide|mentor|train|coach|walk|explain(?: it)? to|introduce)\\s+(?:you|u|ya)\\b";
const WN_OFFER=new RegExp("\\b"+WN_OFFER_VERB+"(?:\\s+(?:to|2|on|about|with|in|into|through))?(?:\\s+(?:how|the way)(?:\\s+(?:to|2|i|we|you|u))?)?(?:\\s+(?:start|begin|get started|step by step))?\\s+"+WN_MONEY+"\\b|\\b"+WN_OFFER_VERB+"[^.!?]{0,80}?\\bhow\\s+(?:to|2|i|we|you|u|it)\\b[^.!?]{0,25}?\\b"+WN_EARN_ANY+"\\b|\\bhelp(?:ing|ed|s)?\\s+(?:my\\s+|other\\s+|many\\s+|foreign\\s+|a few\\s+|some\\s+|new\\s+)?(?:friends|beginners|people|others|newbies|students|clients|members|followers|investors)\\s+(?:to\\s+)?(?:earn|make|invest|profit|grow|trade|double)\\b");
const WN_OFFER_AR=/(?:أعلمك|اعلمك|أعلّمك|علمك|أساعدك|اساعدك|ساعدك|مساعدتك|أوريك|اوريك|أشرح لك|اشرح لك|أدربك|ادربك|أرشدك|ارشدك|أوجهك|اوجهك|أعرفك|اعرفك)[^.!?]{0,40}(?:الاستثمار|استثمار|تستثمر|تستثمري|التداول|تداول|تتداول|تتداولي|كيف تربح|تربح|تربحي|تكسب|تكسبي|دخل إضافي|دخل اضافي|تضاعف)/u;
// (b) A question that invites the reader into investing: "do you invest?",
// "would you like to learn how to invest?", "are you into crypto?".
const WN_Q_MONEY="(?:invest(?:ing|ment|ments)?(?!\\s+bank)|trad(?:e|ing)(?!\\s+(?:cards?|in\\b|places|hours))|crypto\\w*|forex(?!\\s+(?:exchange|bureau|counter|rates?|card))|bitcoin|btc|usdt|make (?:money|profits?|extra|more|some money)|earn(?:ing)? (?:money|extra|more|profits?|income|"+WN_NUM+")|profit (?:from|in|with)|(?:extra|passive|side) income)";
const WN_QUESTION=new RegExp("\\b(?:do|would)\\s+(?:you|u|ya)\\s+(?:want|wanna|like|wish|love)\\s+(?:to\\s+)?(?:learn\\s+|try\\s+|start\\s+|know\\s+|join\\s+|make\\s+|earn\\s+)?(?:how\\s+)?(?:to\\s+|i\\s+|we\\s+)?[^.!?]{0,15}?\\b"+WN_Q_MONEY+"\\b|\\b(?:are|r)\\s+(?:you|u|ya)\\s+(?:interested|into|keen|open)\\b[^.!?]{0,25}?\\b"+WN_Q_MONEY+"\\b|\\bhave\\s+(?:you|u)\\s+(?:ever\\s+)?(?:thought about|considered|tried|heard of)\\s+[^.!?]{0,15}?\\b"+WN_Q_MONEY+"\\b");
// "Do you trade?" counts after a pivot to the reader ("by the way", "you seem
// nice") or a finance self-introduction; "if you're open to learn how to
// profit" counts when the sender offers something too.
const WN_Q_HABIT=/\b(?:do|would)\s+(?:you|u|ya)\s+(?:also\s+|ever\s+)?(?:invest|trade)\b(?!\s+in\s+(?:your|my|the|a)\b)/;
const WN_Q_OPEN=new RegExp("\\b(?:you|u|ya)(?:'re| are| r)\\s+(?:interested|keen|open|ready)\\s+(?:in|on|to|for)\\b[^.!?]{0,25}?\\b"+WN_Q_MONEY+"\\b");
const WN_PIVOT=/\b(?:by the way|btw|anyway|anyways|since we(?:'re| are) (?:chatting|talking|here)|since you(?:'re| are) here|you (?:seem|sound|look)(?: like)? (?:a |an )?(?:very |really )?(?:nice|kind|friendly|cool|good|interesting|smart)|nice to meet you)\b/;
const WN_QUESTION_AR=/(?:تحب|تحبي|تريد|تريدي|تود|تودي|تبي|تبغى|تبغي|حاب|حابة|ترغب|ترغبي|هل)\s?(?:أن|ان)?\s?(?:(?:تتعلم|تتعلمي|تبدأ|تبدئي|تجرب|تجربي|تعرف|تدخل)[^.!?]{0,20}(?:الاستثمار|استثمار|التداول|تداول|الربح|الفوركس|العملات الرقمية)|تستثمر|تستثمري|تتداول|تتداولي|تربح|تربحي|تكسب|تكسبي)/u;
// (c) The sender presents as being in trading or investing (or has a trading
// mentor, group or platform) AND invites the reader in or shows off profits.
// A market word ("gold trading", "crypto") is enough with any invitation; a
// plain "trader" / "advisor" (the fish-market trader) needs a teaching-type one.
const WN_FINANCE=/\b(?:i'?m|i am|im|i work(?:ing)?|i do|i'?ve been|i have been|i run|i manage|i own|i lead|i started|we run|working)\b[^.!?]{0,40}?\b(?:trading|investing|investments?|stockbroker|fund manager|wealth manager|portfolio manager|asset management|forex|fx|crypto\w*|bitcoin|btc|stocks?|stock market|commodities|bullion)\b|\b(?:gold|forex|fx|crypto|bitcoin|stocks?|day|options|futures|commodit(?:y|ies)|bullion)\s+(?:traders?|trading|investors?|dealer|broker|analyst)\b|\b(?:i|we)\s+(?:also\s+|mainly\s+|mostly\s+|just\s+|now\s+)?(?:trade|invest(?:\s+in)?)\s+(?:in\s+)?(?:gold|crypto\w*|bitcoin|btc|forex|fx|stocks?|shares|futures|options|commodities|usdt|silver)\b|\b(?:trading|investment|investing|forex|crypto|bitcoin|gold)\s+(?:platform|app|group|club|channel|program|programme|opportunity|company|firm|signals?|tips|bot|mentor|coach|teacher|business)\b|\b(?:my|our)\s+(?:mentor|teacher|coach|uncle|boss|cousin|professor|team|analyst|tutor)\b[^.!?]{0,40}?\b(?:forex|crypto\w*|bitcoin|trading|trades?|invest\w*|signals?|tips|profits?|stocks?|gold)\b|\b(?:tajer|tajir|tajra|mutadawil|motadawel|mostathmer|mustathmir)\b/;
const WN_FINANCE_GENERIC=/\b(?:i'?m|i am|im|i work(?:ing)?|i do|i'?ve been|i have been|working)\b[^.!?]{0,40}?\b(?:traders?|investors?|analyst|broker|advis[eo]r|consultant|banker|banking|finance|financial)\b/;
const WN_FINANCE_AR=/(?:^|[^\p{L}\p{N}_])(?:أنا|انا|أعمل|اعمل|أشتغل|اشتغل|عندي|لدي)(?![\p{L}\p{N}_])[^.!?]{0,25}(?:متداول|متداولة|تداول|التداول|الاستثمار|استثمار|فوركس|الفوركس|العملات الرقمية|الأسهم|الاسهم)|(?:أستاذ|الاستاذ|استاذ|مدرب|معلم)[^.!?]{0,20}(?:فوركس|الفوركس|تداول|التداول|توصيات)|توصيات/u;
const WN_FINANCE_GENERIC_AR=/(?:^|[^\p{L}\p{N}_])(?:أنا|انا|أعمل|اعمل|أشتغل|اشتغل|عندي|لدي)(?![\p{L}\p{N}_])[^.!?]{0,25}(?:تاجر|تاجرة|مستثمر|مستثمرة|محلل|محللة|مستشار|مستشارة|خبير|خبيرة|وسيط|وسيطة|تجارة)/u;
// A teaching-type invitation ("I can teach you", "free signals", "join my
// group", "want me to show you?") and a plain contact one ("add me").
const WN_INVITE=/\b(?:join (?:me|us|my (?:group|team|channel|class)|our (?:group|team|channel|club|class|program(?:me)?))\b|(?:u|you) want (?:to )?join|(?:good|great|best) time to (?:join|start|invest)|you can do it too|you (?:can|could|should) (?:also )?(?:try|join|start)\b|want (?:his|her|their|my (?:teacher|mentor|coach)'?s?) (?:number|contact)|send you (?:the|a|my) link|(?:share|show) (?:you )?(?:my|some|the)? ?(?:experience|tips|signals|strategy|secrets?|results|screenshots|profits?|earnings|portfolio)|introduce you|would you like (?:to|me to) (?:learn|know|join|try|start|invest|trade|earn|make|teach|show|share|help)|do you want (?:to )?(?:learn|know (?:more|how)|try|join|start|make|earn)|wanna (?:learn|know|try|join)|want to (?:learn|try|join|know more)|(?:want|like) me to (?:teach|show|help|guide|explain|introduce|add|send|share)|for free|free of charge|free (?:lessons?|advice|signals?|course|tips|guidance|training|mentoring|coaching)|i can (?:teach|show|guide|coach|mentor) (?:you|u)\b|i'?ll (?:teach|show|guide|coach) (?:you|u)\b|happy to (?:teach|share|explain|guide)|explain how it works|(?:open|limited|few) spots|spots left|accepting (?:new )?members|looking for (?:people|investors|partners|members)|changed my life|life[- ]changing|financial freedom|passive income|double (?:your|ur) money|(?:very|so|really|super) profitable|easy money)/;
const WN_CONTACT=/\b(?:add (?:me|you|u)\b|(?:whatsapp|telegram) me\b|(?:on|via|in) my (?:whatsapp|telegram)|(?:my|our) (?:whatsapp|telegram|vip|private) (?:group|channel)|dm me|inbox me|message me|contact me|if you(?:'re| are)? interested|interested\?|are you interested)/;
const WN_INVITE_AR=/(?:أعلمك|اعلمك|أعلّمك|علمك|أساعدك|اساعدك|ساعدك|مساعدتك|أوريك|اوريك|أعرفك|اعرفك|أعرّفك|مجانا|مجاناً|مجانية|مجاني|انضم|انضمي|تنضم|تضاعف|مضاعفة)|(?:تحب|تحبي|تبي|تبغى|تبغي|تريد|تريدي|ترغب|ترغبي|حاب|حابة|مهتم|مهتمة)\s?(?:أن|ان)?\s?(?:أعلمك|اعلمك|أساعدك|اساعدك|أعرفك|اعرفك|أضيفك|اضيفك|أوريك|اوريك|تتعلم|تتعلمي|تجرب|تجربي|تدخل|تنضم|تستثمر|تتداول|تربح|تكسب)|\b(?:a3al+mak|a3lmak|3al+mak|asa3dak|asa3dek)\b/u;
const WN_CONTACT_AR=/(?:أضفني|اضفني|ضيفني|كلمني|راسلني|واتس|تيليجرام|تلغرام|تليجرام)/u;
// Profit boasting: "I made $3,200 today", "we earn 800 usd weekly", "made 4x".
const WN_BOAST=/\b(?:i|i'?ve|i'?m|we|we'?ve|me|my)\b[^.!?]{0,40}?\b(?:made|make|making|earn(?:ed|ing|s)?|get|got|getting|gain(?:ed|ing)?|turned|withdr[ae]wn?|withdrew|gave me|giving me|returns?|profits?)\b[^.!?]{0,30}?(?:[$€£]\s?\d|\b\d[\d,]*\s?(?:k|usd|usdt|aed|dollars?|dirhams?|%|x|times)(?![a-z])|\b\d[\d,]*\s+(?:a|per|every|each)\s+(?:day|week|month)\b|\b(?:doubled|tripled)\b)|\b(?:made|making|earned|earning)\s+(?:a lot|so much|good money|big money|a fortune)\b/;
const WN_BOAST_AR=/(?:ربحت|كسبت|حققت|أربح|اربح|نربح|أكسب|اكسب|نكسب)[^.!?]{0,25}\d|(?:ربح|أرباح|ارباح|دخل)(?:ي)?\s(?:يومي|يومية|أسبوعي|شهري)|(?:تضاعف|أضاعف|اضاعف|يضاعف|نضاعف)\s?(?:أموالك|اموالك|فلوسك|رأس مالك|راس مالك|المبلغ)/u;
// Other chat languages: "galat number ... gold trader ... invest karna sikha".
const WN_FOREIGN_TRADER=/\b(?:traders?|trading|forex|crypto)\b/;
const WN_FOREIGN_HOOK=/\b(?:invest\w*|investir|invertir|profit|kumita|gagner|ganar|kamai|sikha\w*|turuan|apprendre|enseñ\w*|ensen\w*)/;
function wrongNumberInvestment(t){
  const foreign=WN_FOREIGN.test(t);
  if(!(foreign||WN_OPENER.test(t)||WN_OPENER_AR.test(t)||WN_REFERRAL.test(t)||WN_REFERRAL_AR.test(t)))return false;
  if(WN_KNOWN.test(t)||(WN_PROPERTY.test(t)&&!WN_TRADING.test(t)))return false;
  if(WN_OFFER.test(t)||WN_OFFER_AR.test(t)||WN_QUESTION.test(t)||WN_QUESTION_AR.test(t))return true;
  const boast=WN_BOAST.test(t)||WN_BOAST_AR.test(t);
  const invite=WN_INVITE.test(t)||WN_INVITE_AR.test(t);
  const contact=WN_CONTACT.test(t)||WN_CONTACT_AR.test(t);
  const finance=WN_FINANCE.test(t)||WN_FINANCE_AR.test(t);
  const generic=WN_FINANCE_GENERIC.test(t)||WN_FINANCE_GENERIC_AR.test(t);
  if(finance&&(invite||contact||boast))return true;
  if(generic&&(invite||boast))return true;
  if(WN_Q_HABIT.test(t)&&(finance||generic||WN_PIVOT.test(t)))return true;
  if(WN_Q_OPEN.test(t)&&invite)return true;
  return (boast&&(invite||contact))||(foreign&&WN_FOREIGN_TRADER.test(t)&&WN_FOREIGN_HOOK.test(t));
}

// Rule 2. (a) A fortune: millions, or a box / bag / consignment of cash (a
// bare "trunk box" or a box of gold only in a soldier's or war-zone story,
// since movers and gold shops talk about those every day).
const HF_BIG=/[$€£]\s?\d+(?:,\d+)?\s?(?:m|mn|mln|million|millions|bn|billion)\b|\b(?:usd|us\$|aed|eur|gbp|dollars?)\s?\d+(?:,\d+)?\s?(?:m|mn|mln|million|bn|billion)\b|\b\d+(?:,\d+)?\s?(?:million|millions|mln|billion)\b(?!\s+(?:people|users|miles|views|followers|customers|visitors|subscribers|downloads|km|kilomet\w+|residents|points|steps|years|times|members|passengers|tons|tonnes|litres|liters|barrels|sq|square|units|copies|doses|cases))|\b\d+(?:,\d+)?\s?m\s+(?:usd|dollars|euros|pounds|aed|dirhams)\b|[$€£]\s?\d{1,3}(?:[, ]\d{3}){2,}|\b(?:usd|aed|eur|gbp)\s?\d{1,3}(?:[, ]\d{3}){2,}|\b\d{1,3}(?:,\d{3}){2,}\s?(?:usd|dollars|aed|dirhams?|euros?|pounds)\b|\b\d+\s?kg\s+of\s+gold\b|\bgold (?:bars|bullion|dust)\b|\bmillions? of (?:dollars|euros|pounds)\b/;
const HF_BIG_AR=/\d+(?:,\d+)?\s?(?:مليون|ملايين|مليار)\s?(?:دولار|درهم|ريال|يورو|جنيه|من)|(?:مليون|ملايين|مليار)\s?(?:دولار|درهم|ريال|يورو|جنيه)|سبائك/u;
const HF_BOX_CASH=/\b(?:box(?:es)?|trunks?|safes?|bags?|suitcases?|briefcases?|consignments?|cartons?|packages?|parcels?|vaults?|crates?|containers?)(?:\s+[^\sa-z0-9]{1,4})?\s+(?:of|with|containing|contains|filled with|full of|holding|loaded with|stuffed with)\s+(?:(?:about|over|some|nearly|almost)\s+)?(?:gold\s+(?:and|&)\s+)?(?:[$€£]|\d[\d,]*\s?(?:m|mn|million|millions|bn|billion)\b|(?:money|cash|funds|dollars|us dollars|usd|euros|pounds|currency|bank ?notes)\b)|\b(?:money|cash|funds|dollars|usd|[$€£]\s?\d[\d,]*\s?(?:m|million)?)\s+(?:in|inside)\s+(?:a|an|the|two|three|\d+)\s+(?:(?:trunk|metal|iron|steel|security|safe|diplomatic|consignment|old)\s+)?(?:box(?:es)?|trunks?|safes?|bags?|suitcases?|consignments?|vaults?)\b/;
const HF_BOX_CASH_AR=/(?:صندوق|صناديق|شحنة|حقيبة|حقائب|شنطة|شنط|خزنة|طرد)\S{0,2}\s?(?:فيه|فيها|يحتوي على|تحتوي على|مليئ\S*|مليء\S*|بها|به|من)?\s?(?:ب|بال|ال)?(?:أموال|اموال|نقود|دولارات|دولار|فلوس|كاش|\d)/u;
const HF_STASH=/\b(?:box(?:es)?|trunks?|safes?|bags?|consignments?|crates?)\s+(?:of|with|containing|filled with|full of)\s+gold\b|\b(?:trunk|trunck|metal|iron|steel|security|safe|diplomatic|consignment|strong)\s+box(?:es)?\b|\b(?:old|iron|metal)\s+safe\b|\bsecurity vault\b|\bdiplomatic (?:bag|pouch|cargo)\b/;
const HF_STASH_AR=/(?:صندوق|صناديق|شحنة|حقيبة|شنطة|خزنة)\S{0,2}\s?(?:فيه|فيها|من)?\s?(?:ال)?(?:ذهب|سبائك)|صندوق حديدي|صندوق معدني/u;
const HF_FOUND=/\b(?:found|discovered|recovered|seized)\b[^.!?]{0,30}\b(?:money|cash|funds|dollars|gold)\b/;
const HF_FOUND_AR=/(?:وجدنا|وجدت|عثرنا|عثرت|لقينا|لقيت)[^.!?]{0,30}(?:أموال|اموال|نقود|دولارات|فلوس|ذهب|صندوق|صناديق|حقيبة)/u;
// (b) The ask: a share for you, or help to receive, hold, move or claim it, or
// to stand in as the dead client's next of kin, or a fee to release it.
const HF_SHARE=/\b(?:you|u)(?:'ll| will| would| can| may| shall| could)?\s+(?:will\s+|would\s+|be able to\s+|then\s+)?(?:receive|recieve|get|have|take|keep|earn|be (?:given|paid|compensated with|rewarded with|entitled to))\s+(?:about\s+|around\s+|an?\s+|the\s+|only\s+|up to\s+)?(?:\d{1,2}(?:,\d+)?\s?(?:%|percent|per cent)|half|(?:a|your)\s+(?:good |fair |big |generous |nice )?(?:share|cut|percentage))(?![^.!?]{0,30}\b(?:back|refund\w*|off|discount|cashback|interest|points|bonus|miles|extra|more)\b)|\b(?:give|offer(?:ing)?|pay|send|reward|compensate|award)\s+(?:you|u)\s+(?:with\s+)?(?:about\s+|an?\s+|the\s+|only\s+)?(?:\d{1,2}(?:,\d+)?\s?(?:%|percent|per cent)|half|(?:a|your)\s+(?:good |fair |big |generous |nice )?(?:share|cut|percentage))|\b\d{1,2}(?:,\d+)?\s?(?:%|percent|per cent)\s+(?:(?:is|will be|goes|go)\s+)?(?:(?:to|for)\s+)?(?:you|yours|u)\b|\b(?:your|ur)\s+(?:share|cut|percentage|commission|portion)\s+(?:is|will be|=|:)?\s*\d{1,2}\s?(?:%|percent)|\b(?:your|ur)\s+\d{1,2}\s?%\s+(?:share|cut|commission|portion)\b|\b\d{1,2}\s?%\s+each\b|\b(?:50\s?[\/-]\s?50|60\s?[\/-]\s?40|40\s?[\/-]\s?60|70\s?[\/-]\s?30|30\s?[\/-]\s?70|65\s?[\/-]\s?35|35\s?[\/-]\s?65|55\s?[\/-]\s?45|45\s?[\/-]\s?55|80\s?[\/-]\s?20|20\s?[\/-]\s?80)\b|\bfifty[- ]fifty\b|\b(?:we|us)\s+(?:will\s+|shall\s+|can\s+|could\s+|would\s+|then\s+)?(?:share|split|divide)\s+(?:it|them|the (?:money|funds|cash|amount|sum|profits?|proceeds|gold))\b|\b(?:share|split|divide)\s+(?:(?:it|them|this|the (?:money|funds|cash|amount|sum|profits?|proceeds|gold|box(?:es)?))\s+)?(?:equally\s+|evenly\s+)?(?:between us|with you|you and (?:i|me))\b/;
const HF_SHARE_AR=/(?:ستحصل|تحصل|ستحصلين|ستأخذ|تأخذ|تاخذ|ستنال)\s?(?:على)?\s?(?:نسبة)?\s?\d{1,2}\s?%|(?:لك|ولك|فلك|له|وله|نصيبك|حصتك|نسبتك)\s?(?:نسبة)?\s?\d{1,2}\s?%|\d{1,2}\s?%\s?(?:لك|من المبلغ|من الأموال|من الاموال|نصيبك|حصتك)|(?:أعطيك|اعطيك|سأعطيك|ساعطيك|وأعطيك|واعطيك|أمنحك|امنحك|سأمنحك|وأمنحك|وامنحك|سأعطيه|وسأعطيه|سنعطيك)\s?(?:نسبة)?\s?\d{1,2}\s?%|(?:نتقاسم|نقتسم|سنقتسم|سنتقاسم|ونتقاسم|نقسم|سنقسم|ونقسم|نقسمها|نقسمه|نتقاسمه|نتقاسمها)|مناصفة|(?:^|[^\p{L}\p{N}_])(?:بالنص|نص نص|بالنصف)(?![\p{L}\p{N}_])/u;
const HF_CARRY=/\b(?:help|assist)\s+(?:me|us)\s+(?:to\s+|2\s+)?(?:move|transfer|receive|recieve|claim|secure|ship|evacuate|transport|get|smuggle|clear|bring|send|keep|hold)\b|\b(?:your|ur)\s+(?:help|assistance)\s+(?:to|2|in)\s+(?:move|moving|transfer\w*|ship\w*|receiv\w*|claim\w*|get(?:ting)?|clear\w*|bring\w*)\b|\b(?:receive|recieve|claim|collect|keep|hold|accept)\s+(?:it|them|this|these|the (?:box(?:es)?|consignment|funds?|money|cash|package|trunk))?\s*(?:on my behalf|for me|in your name|for safekeeping|safe)\b|\b(?:want|need|like)\s+(?:you|u)\s+to\s+(?:receive|recieve|keep|hold|claim|collect|accept|stand|act)\b|\b(?:ship|send|move|transfer|deliver|bring)\s+(?:it|them|the (?:box(?:es)?|money|funds|cash|consignment|trunk))?\s*(?:out\s+)?to\s+(?:you|your (?:country|address|account|house|home))\b|\b(?:need|want|looking for|seeking|search(?:ing)? for|require)\s+(?:a|an|your)?\s*(?:very\s+)?(?:trusted|trustworthy|honest|reliable|god[- ]fearing|sincere|foreign)?\s*(?:foreign\s+)?(?:partner|person|foreigner|contact|account|beneficiary)\b|\b(?:your|ur)\s+(?:full\s+)?(?:name\s+and\s+)?(?:home\s+)?address\s+(?:to|so|for)\s+(?:send|ship|deliver)\b|\b(?:reply|respond|contact)\b[^.!?]{0,50}\bto (?:claim|release)\b|\b(?:donate|distribute|give)\b[^.!?]{0,50}\b(?:through|via)\s+(?:you|u)\b|\b(?:give|leave|hand over)\s+(?:my|the|this|all)\b[^.!?]{0,40}\bto\s+you\b/;
const HF_CARRY_AR=/(?:مساعدتك|ساعدني|تساعدني|يساعدني|مساعدتي|أحتاجك|احتاجك)[^.!?]{0,30}(?:نقل|تحويل|استلام|إخراج|اخراج|تأمين)|(?:نيابة عني|بالنيابة)|(?:شخص|شريك|شخصا|شخصاً)\s?(?:موثوق|أمين|امين|أميناً|امينا|أمينا|نثق)|(?:تستلمه|تستلمها|يستلمه|يستلمها|لاستلامه|لاستلامها|تحتفظ (?:لي )?به|تحتفظ بها|يحتفظ به|يحتفظ بها)|(?:ارسالها|إرسالها|ارساله|إرساله) لك|(?:عن طريقك|من خلالك)/u;
const HF_POSE=/\b(?:stand|act|pose|serve|front|appear)\s+as\s+(?:the\s+|his\s+|her\s+|their\s+|a\s+|my\s+(?:late\s+|deceased\s+)?client'?s?\s+)?(?:next of kin|beneficiary|heir|relative|family member)\b|\b(?:present|make|name|nominate|introduce|register|put)\s+you\s+(?:forward\s+)?as\s+(?:the\s+|his\s+|her\s+|a\s+|my\s+)?(?:next of kin|beneficiary|heir|relative|partner)\b/;
const HF_KIN=/\b(?:namesake|same (?:sur)?name as (?:you|yours)|shares? your (?:sur)?name|with your (?:sur)?name|the same (?:sur)?name)\b|\byou (?:have been|were|are|was) (?:selected|chosen|named|nominated|picked|approved|appointed) (?:as )?(?:the )?(?:beneficiary|next of kin|heir)\b|\b(?:inheritance|fund|funds|payment|consignment|compensation)\b[^.!?]{0,60}\b(?:approved|ready) for (?:release|delivery|transfer|payment)\b/;
const HF_KIN_AR=/(?:أقدمك|اقدمك|نقدمك|أقدّمك)\s?(?:ك|على أنك|كـ)?\s?(?:أقرب|اقرب|وريث|قريب|المستفيد)|تكون (?:ال)?وريث|تدعي أنك|تدعي انك|كأقرب الأقارب|كاقرب الاقارب|(?:بنفس|نفس) اسمك|يحمل اسمك/u;
const HF_FEE=/\b(?:pay|send|transfer|wire|remit)\b[^.!?]{0,50}\b(?:delivery|clearance|release|shipping|insurance|customs|diplomatic|courier|processing|security|storage|demurrage|handling|vault|transfer|administrative|legal)\s+(?:fee|fees|charge|charges|duty|duties|cost)\b|\b(?:delivery|clearance|release|shipping|customs|diplomatic|courier|storage|demurrage|handling|vault)\s+(?:fee|fees|charge|charges|duty)\s*(?:of\s+)?(?:is\s+)?(?:[$€£]\s?\d|\d|usd|aed)|\bpay\b[^.!?]{0,25}(?:[$€£]\s?\d|\d[\d,]*\s?(?:usd|aed|dollars))[^.!?]{0,20}\bto (?:clear|release|deliver)\b/;
const HF_FEE_AR=/(?:ادفع|دفع|رسوم|رسم)\s?(?:ال)?(?:توصيل|شحن|تخليص|جمارك|الجمارك|تأمين|إفراج|الإفراج)/u;
// (c) The story. The sender is a soldier, diplomat, UN worker, prince or a
// dying widow; or the money sits in a war zone with troops around it; or it is
// a stranger's: a dead client with no next of kin, your namesake, a dormant or
// unclaimed account, over-invoiced funds, a trusted foreign partner and
// secrecy. A lawyer or banker alone is not the story (real ones write to real
// heirs), and neither is the sender's own family ("my late father left...").
const HF_PERSONA=/\b(?:i'?m|i am|im|my name is|this is|it'?s|from the desk of|i serve|i work|i'?ve been serving|serving|stationed|deployed|posted)\b[^.!?]{0,60}?\b(?:army|military|marines?|navy|naval|air force|soldiers?|(?:army|military|navy|naval|marine|un|peace ?keeping|serving|commissioned)\s+officer|sergeant|sgt|lieutenant|lt|captain|capt|colonel|col|general|gen|major|maj|commander|brigadier|corporal|cpl|peace ?keep\w*|united nations|un|nato|diplomat\w*|embassy|consul\w*|prince|princess|widow|dying|terminally ill)\b(?!\s+(?:of (?:the |a |our )?(?:team|club|class|cricket|football)|manager|information|info|advice|knowledge|practitioner|director|public|purpose|terms|guidance|counsel|sales|services?|enquir\w*|inquir\w*|feedback|statement|assembly|insurance|notice|update|reminder|rule|policy|question))/;
const HF_PERSONA_AR=/(?:^|[^\p{L}\p{N}_])(?:أنا|انا|اسمي)(?![\p{L}\p{N}_])[^.!?]{0,30}(?:ضابط|جندي|جندية|عسكري|عسكرية|جنرال|نقيب|رقيب|عقيد|عميد|ملازم|لواء|دبلوماسي|دبلوماسية|أرملة|ارملة|major|captain|sergeant|officer|soldier)/u;
const HF_WAR=/\b(?:syria|iraq|afghanistan|afganistan|kabul|kandahar|baghdad|libya|yemen|mali|sudan|congo|gaza|somalia|war zone)\b|(?:سوريا|العراق|أفغانستان|افغانستان|بأفغانستان|ليبيا|اليمن)/u;
const HF_TROOPS=/\b(?:army|military|marines?|navy|soldiers?|troops|rebels?|taliban|isis|saddam|gaddafi|palace|raid|operation|mission|deployed|stationed|peace ?keep\w*|nato)\b|\b(?:with|for) the un\b|\bun (?:mission|peace\w*|forces?|staff|officer|doctor|nurse|surgeon|diplomat|troops)\b|(?:القوات|الجيش|جندي|ضابط|الأمم المتحدة|حفظ السلام|مداهمة)/u;
const HF_STRANGER=/\b(?:late|deceased)\s+(?:mr|mrs|ms|dr|engr?|client|customer|general|chief|president|leader|foreigner|investor|contractor|depositor|businessman)\b|\b(?:client|customer|foreigner|national|investor|contractor|depositor|businessman|account holder|patient|gentleman)\b[^.!?]{0,60}\b(?:died|passed away|was killed|deceased)\b|\bdied\b[^.!?]{0,30}\b(?:plane|car|road|air)\s+(?:crash|accident)|\byour late\b|\byou (?:have been|were|are|was) (?:selected|chosen|picked|approved|appointed) (?:as )?(?:the )?(?:beneficiary|next of kin|heir)\b|\b(?:no next of kin|without (?:a will|any heirs?|heirs?|next of kin|any relatives|family)|no (?:heirs?|known relatives|beneficiary)|namesake|same (?:sur)?name|dormant|unclaimed|inactive account|suspense account|frozen (?:funds|account)|over-?invoiced|excess funds|security (?:company|vault)|vault company|diplomatic (?:bag|box|courier|consignment|pouch|cargo|clearance|safe|security)|consignment box|trunk box(?:es)?|business proposal|smuggl\w*|offshore|i trust you|can i trust you|risk[- ]free|diagnosed with|terminally ill)\b|\b(?:keep (?:this|it)? ?(?:confidential|secret|between us)|(?:urgent|strictly|highly|totally) (?:and )?confidential|do not (?:share|tell) (?:this|anyone)|don'?t (?:share|tell) (?:this|anyone))\b|\b(?:transfer\w*|move|moved|ship\w*)\b[^.!?]{0,20}\b(?:abroad|out of the country|overseas)\b|\b(?:trustworthy|honest|god[- ]fearing|sincere)\s+(?:foreign\s+)?(?:partner|person|foreigner|friend|individual|contact|man|woman|beneficiary)\b|\b(?:trusted|reliable)\s+(?:foreign\s+)?(?:person|foreigner|friend|individual)\b|\bforeign(?:er'?s)?\s+(?:partner|contact|account|beneficiary)\b|\bforeigner'?s account\b/;
const HF_STRANGER_AR=/(?:عميل|العميل|لعميل|زبون|أجنبي|اجنبي|موكل|موكلي|لشخص|شخص)[^.!?]{0,30}(?:متوفى|متوفي|توفي|مات|المتوفى)|(?:بدون|ولا|لا|ما له|ماله|ليس له|لم يترك)\s?(?:ورثة|وريث|وريثا|وريثاً)|(?:بنفس|نفس) اسمك|يحمل اسمك|حساب خامل|حساب مجمد|ودائع|خارج البلد|أثق بك|اثق بك|(?:^|[^\p{L}\p{N}_])(?:سري|سرية|بسرية)(?![\p{L}\p{N}_])|(?:شخص|شريك|شخصا|شخصاً)\s?(?:موثوق|أمين|امين|أميناً|امينا|أمينا|نثق)/u;
const HF_FAMILY=/\b(?:my|our)\s+(?:late\s+)?(?:father|mother|dad|daddy|mum|mom|mummy|grandfather|grandmother|grandpa|grandma|granny|uncle|aunt|auntie|brother|sister|cousin|son|daughter|baba|mama|family)\b|\b(?:dad|mum|mom|baba|mama|grandpa|grandma)'?s\b|(?:^|[^\p{L}\p{N}_])(?:والدي|والدتي|أبوي|ابوي|أبي|أمي|امي|جدي|جدتي|عمي|خالي|عمتي|خالتي|الوالد|الوالدة)(?![\p{L}\p{N}_])/u;
function hiddenFundsShare(t){
  const persona=HF_PERSONA.test(t)||HF_PERSONA_AR.test(t);
  const war=HF_WAR.test(t)&&HF_TROOPS.test(t);
  if(!(persona||war||((HF_STRANGER.test(t)||HF_STRANGER_AR.test(t))&&!HF_FAMILY.test(t))))return false;
  const share=HF_SHARE.test(t)||HF_SHARE_AR.test(t),pose=HF_POSE.test(t);
  // "act as my dead client's next of kin, 50/50" is the fortune story even
  // without an amount; "we found money" counts only in a war zone (police find
  // wallets every day).
  const fortune=HF_BIG.test(t)||HF_BIG_AR.test(t)||HF_BOX_CASH.test(t)||HF_BOX_CASH_AR.test(t)||((HF_STASH.test(t)||HF_STASH_AR.test(t))&&(persona||war))||(war&&(HF_FOUND.test(t)||HF_FOUND_AR.test(t)))||(pose&&share);
  if(!fortune)return false;
  return share||pose||HF_CARRY.test(t)||HF_CARRY_AR.test(t)||HF_KIN.test(t)||HF_KIN_AR.test(t)||HF_FEE.test(t)||HF_FEE_AR.test(t);
}

function analyzeTextRulesCore(text){
  const raw=String(text||"");
  // deobfuscate() reads 1 as i; "detai1s" and "acc0unt" need 1 as l too.
  const clean=normalizeText(raw),obfuscated=deobfuscate(clean),variants=[clean,obfuscated,clean.replace(/0/g,"o").replace(/1/g,"l")];
  const state=createState();
  const urls=unique((raw.match(/(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi)||[]).filter(value=>!value.includes("@")));
  const emails=raw.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)||[];
  const phones=raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/g)||[];
  const hiddenChars=/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/.test(raw);

  const groups=[
    {id:"urgency",terms:["urgent","immediately","act now","final warning","last chance","within 24 hours","today only","expires today","immédiatement","dernière chance","عاجل","فوراً","فورا","حالاً","اليوم فقط","ستنتهي اليوم","تنتهي اليوم","ينتهي اليوم","تنتهي الليلة","استبدلها الآن","سارع الآن"],weight:10,reason:"Uses urgency or a deadline to reduce careful thinking.",type:"Urgency-based social engineering",category:"pressure"},
    {id:"prize",terms:["you won","winner","prize","gift card","giveaway","free money","claim reward","selected winner","has won","have won","randomly selected","been selected","lucky draw","prize draw","anniversary draw","lottery","raffle","claims agent","points will expire","points expire","gagné","cadeau","prix gratuit","ربحت","جائزة","هدية مجانية","نقاطك","سحب على الجوائز"],weight:16,reason:"Promises an unexpected prize, reward, or giveaway.",type:"Prize / giveaway scam",category:"reward"},
    {id:"credentials",terms:["password","sign in","sign-in","login","verify your account","confirm your account","security alert","unusual activity","unknown device","new device","unrecognised device","unrecognized device","password will expire","password has expired","password expires","mot de passe","vérifiez votre compte","connexion","كلمة المرور","تحقق من حسابك","تسجيل الدخول","نشاط غير معتاد"],weight:9,reason:"Mentions account verification, login, or security-alert language.",type:"Credential phishing",category:"credentials"},
    {id:"otp",terms:["otp","one-time password","verification code","security code","2fa code","pin code","digit code","digit verification","authenticator","code de vérification","رمز التحقق","رمز الأمان","رمز لمرة واحدة"],weight:12,reason:"Mentions a private authentication or verification code.",type:"OTP / account takeover scam",category:"credentials"},
    {id:"finance",terms:["wire transfer","bank transfer","payment","refund","invoice","crypto","bitcoin","wallet","gift cards","western union","deposit","routing number","direct deposit","account number","btc","usdt","forex","استثمار","استثمر","تداول","بيتكوين","فوركس","بطاقات هدايا","بطاقة هدايا","بطاقات شحن","كروت شحن","tax payment","back taxes","owe taxes","tax debt","unpaid taxes","tax notice","virement","paiement","remboursement","facture","تحويل مصرفي","دفعة","استرداد","فاتورة","عملات رقمية","محفظة"],weight:9,reason:"Mentions money, banking, payment, refund, tax debt, or crypto activity.",type:"Financial scam",category:"money"},
    {id:"threat",terms:["account locked","account suspended","legal action","arrest","police station","court order","court case","court summons","summoned to court","taken to court","appear in court","will go to court","court proceedings","legal complaint","police report has been filed","police will come","police will visit","police are looking for you","warrant","will be deleted","compte suspendu","action légale","حسابك موقوف","إجراء قانوني","اعتقال","سيتم حذف"],weight:17,reason:"Uses fear, punishment, or account-loss threats.",type:"Threat-based phishing",category:"pressure"},
    {id:"remote",terms:["remote access","anydesk","teamviewer","quick support","screen share","install this app","accès à distance","partage d'écran","وصول عن بعد","مشاركة الشاشة","ثبت هذا التطبيق"],weight:34,reason:"Requests or discusses remote access, screen sharing, or control software.",type:"Remote-access support scam",category:"device"},
    {id:"delivery",terms:["parcel","package delivery","delivery fee","customs fee","missed delivery","shipping address","colis","frais de livraison","رسوم التوصيل","طرد","رسوم الجمارك"],weight:12,reason:"Uses a parcel, customs, or delivery problem as a lure.",type:"Delivery phishing",category:"delivery"},
    {id:"job",terms:["easy income","task commission","guaranteed return","investment opportunity","work from home job","revenu garanti","commission de tâche","دخل مضمون","عمولة مهام","عائد مضمون"],weight:16,reason:"Offers unusually easy income, task commissions, or guaranteed returns.",type:"Job / investment scam",category:"money"},
    {id:"secrecy",terms:["keep this confidential","do not tell anyone","don't contact","secret transaction","do not discuss","don't discuss","do not mention","don't mention this","between you and me","keep this between us","discreetly","gardez ceci confidentiel","لا تخبر أحداً","لا تخبر أحد","سري للغاية","بيني وبينك"],weight:19,reason:"Asks the recipient to keep the interaction secret.",type:"Manipulation / impersonation scam",category:"pressure"},
    {id:"authority",terms:["tax authority","immigration officer","customs officer","police department","government grant","social security","irs","hmrc","interpol","وزارة","الشرطة","الجمارك","الضمان الاجتماعي"],weight:13,reason:"Invokes government, police, tax, immigration, or another authority.",type:"Authority impersonation scam",category:"impersonation"},
    {id:"recovery",terms:["recover your money","fund recovery","crypto recovery","refund agent","recovery service","recover your lost","recover your stolen","recover your funds","recover your crypto","recovery specialist","recovery team","recovery agent","استرجاع أموالك","استرداد العملات","استرجاع أموالك المسروقة"],weight:23,reason:"Offers to recover money or cryptocurrency, a common follow-up scam pattern.",type:"Recovery scam",category:"money"},
    {id:"romance",terms:["my dear","my love","future together","our future","love you","emergency money","military deployment","inheritance for us","حبيبي","مستقبلنا","أحتاج المال بشكل عاجل"],weight:13,reason:"Combines emotional trust language with a personal or financial story.",type:"Romance / trust scam",category:"relationship"},
    {id:"mule",terms:["receive money for me","forward the payment","keep a percentage","use your bank account","cash this check","استقبل المال","حوّل الدفعة","احتفظ بنسبة"],weight:31,reason:"Asks the recipient to receive or forward money through their own account.",type:"Money-mule recruitment",category:"money",strong:true},
    {id:"sextortion",terms:["private photos","intimate video","send to your contacts","pay or i will share","leak your photos","on cam","on camera","webcam","recorded you","video of you","sees the video","see the video","send the video","i hacked your","i have hacked your","we hacked your","your family sees","your contacts see","صور خاصة","سأرسلها لجهات اتصالك","ادفع وإلا"],weight:42,reason:"Threatens to expose private or intimate material unless payment is made.",type:"Sextortion scam",category:"extortion",strong:true}
    ,
    // Regional and Arabic vocabulary for the same families. Same ids as the
    // entries above: a signal fires once whichever list matched it.
    {id:"job",terms:["part-time","part time","daily salary","daily income","no experience","reply yes","usd daily","usd per day","hiring part-time","rate products","rating products","reply \"yes\"","reply 'yes'","hr department","online job","remote job","earn daily","flexible hours","بدوام جزئي","راتب يومي","دخل يومي","بدون خبرة","أرسل نعم","أرسل 'نعم'","الموارد البشرية","وظيفة عن بعد","وظيفة بدوام","عمل من المنزل","مهام بسيطة","أرباح يومية"],weight:16,reason:"Offers unusually easy income, task commissions, or guaranteed returns.",type:"Job / investment scam",category:"money"},
    {id:"delivery",terms:["could not be delivered","redelivery","reschedule delivery","parcel on hold","shipment on hold","بريد الإمارات","لم نتمكن من توصيل","توصيل طردك","إعادة الجدولة","إعادة جدولة","شحنتك","الشحنة","رسوم جمركية","رسوم إعادة","الطرد","طردك"],weight:12,reason:"Uses a parcel, customs, or delivery problem as a lure.",type:"Delivery phishing",category:"delivery"},
    {id:"credentials",terms:["reactivate","re-activate","restore access","account limited","account has been limited","تعليق حسابك","تم تعليق","تم إيقاف","إيقاف حسابك","إعادة التفعيل","للتفعيل","ادخل بياناتك","أدخل بياناتك","تحديث بياناتك","إعادة تفعيل","بطاقتك"],weight:9,reason:"Mentions account verification, login, or security-alert language.",type:"Credential phishing",category:"credentials"},
    {id:"threat",terms:["will be closed","will be deactivated","permanently closed","سيتم إغلاق","سيتم تعطيل","سيتم إيقاف","إغلاق الحساب","تعطيل حسابك","إلغاء حسابك"],weight:17,reason:"Uses fear, punishment, or account-loss threats.",type:"Threat-based phishing",category:"pressure"},
    {id:"urgency",terms:["within 24h","within 48h","within 12h","خلال 24 ساعة","خلال 48 ساعة","خلال 12 ساعة","خلال ساعة","قبل انتهاء","آخر فرصة","بشكل عاجل"],weight:10,reason:"Uses urgency or a deadline to reduce careful thinking.",type:"Urgency-based social engineering",category:"pressure"},
    {id:"authority",terms:["uae pass","emirates id","ministry of","federal authority","traffic fine","government services","الهوية الإماراتية","هوية الإمارات","الهيئة الاتحادية","وزارة الداخلية","الحكومة","مخالفة مرورية","غرامة","الهوية الوطنية","أبشر","هويتي","الخدمات الحكومية"],weight:13,reason:"Invokes government, police, tax, immigration, or another authority.",type:"Authority impersonation scam",category:"impersonation"},
    {id:"finance",terms:["iban","new bank details","درهم","ريال","حوالة","آيبان","رقم الحساب","تحويل"],weight:9,reason:"Mentions money, banking, payment, refund, tax debt, or crypto activity.",type:"Financial scam",category:"money"}
  ];
  groups.forEach(g=>{if(hasTerm(variants,g.terms))addSignal(state,g.id,g.weight,g.reason,g.type,g.category,g.strong)});
  const deadline=clean.match(/\bwithin\s+(?:the\s+next\s+)?(\d{1,3})\s*(hours?|hrs?|minutes?|mins?|days?)\b/i);
  if(deadline&&!(deadline[2].startsWith("day")&&Number(deadline[1])>7)&&!state.signals.has("urgency"))addSignal(state,"deadline-pressure",10,"Uses a specific time deadline to reduce careful thinking.","Urgency-based social engineering","pressure");
  // "A police report / criminal case has been filed against you": an authority claim aimed at the
  // reader, the opener of "digital arrest" and fine-settlement scams (with the threat cue it forms
  // the govt-authority-threat combo below).
  if(!state.signals.has("authority")&&/\b(?:police report|police case|criminal case|criminal complaint|legal case|arrest warrant)\b[^.!?]{0,60}\bagainst you\b/i.test(clean))addSignal(state,"authority",13,"Invokes government, police, tax, immigration, or another authority.","Authority impersonation scam","impersonation");
  // "Cyprus Police", "Dubai Police", "traffic police": a named force or office is
  // how fine-and-fee scams open; the plain word "police" stays a threat cue only.
  if(!state.signals.has("authority")&&/\b(?:(?!(?:the|a|an|no|my|our|your|their|his|her|local|city|state|military|secret|riot|campus|motorway|highway)\s)[a-z]+ police|traffic police|police (?:department|notice|station|force|headquarters)|ministry of|tax office|customs office|immigration department|municipality|court notice|government notice)\b/i.test(clean))addSignal(state,"authority",13,"Invokes government, police, tax, immigration, or another authority.","Authority impersonation scam","impersonation");
  // A fine, toll, tax or fee that must be paid is the lure itself.
  // An overdue invoice or balance is everyday accounts wording; a fine, toll or
  // penalty that must be paid is the lure itself.
  if(/\b(?:unpaid|outstanding|overdue|pending)\b.{0,40}\b(?:fine|fines|penalty|penalties|toll|tax|fee|fees)\b|\b(?:fine|fines|penalty|penalties|toll)\b.{0,50}\b(?:pay|payment|settle|clear)\b|\bblack points?\b/i.test(clean))addSignal(state,"fine-demand",18,"Demands payment for a fine, fee, toll or penalty, a common pressure lure.","Fine / fee payment scam","money");
  else if(/\b(?:unpaid|outstanding|overdue|pending)\b.{0,40}\b(?:invoices?|bills?|balance)\b/i.test(clean))addSignal(state,"fine-demand",10,"Demands payment for a fine, fee, toll or penalty, a common pressure lure.","Fine / fee payment scam","money");
  // A confirmation of a payment already made is the opposite of a demand.
  if(/\b(?:was received|has been received|payment (?:successful|confirmed|received|completed)|thank you for your payment|your receipt|has been paid|successfully paid|no (?:further |additional )?(?:payment|action|fee)s? (?:is |are )?(?:required|needed|necessary)|nothing (?:more )?to pay|already (?:paid|included)|included in (?:the|your) (?:price|total|order))\b/i.test(clean)&&!/\b(click|tap|open|visit|verify|confirm your|update your)\b/i.test(clean)){state.raw-=18;state.counterEvidence.push("Reads like a confirmation of a payment already made rather than a demand.")}

  // \b never matches next to Arabic letters, so these use letter-aware
  // boundaries (no lookbehind: old phones lack it): the Arabic branches were dead before.
  const protective=/(?:^|[^\p{L}\p{N}_])(never share|do not share|don't share|never click|never enable|we will never ask|will never ask|will never change|never ask you for|do not click|don't click|ignore suspicious|security tip|fraud warning|protect yourself|ne partagez jamais|ne cliquez pas|conseil de sécurité|لا تشارك|لا تشاركه|لن نطلب منك|لن نطلبه|لن يطلبه|لا تضغط|تحذير أمني)(?![\p{L}\p{N}_])/iu.test(clean);
  // A bare "code" or "pin" is only a secret next to a security word, and some
  // everyday codes are never one: "send me the code for the meeting room",
  // "the pin location", "the promo code", "the wifi password".
  const noUrlText=clean.replace(/(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/g," ");
  const settled=/\b(?:no (?:further |additional )?(?:payment|action|fee)s? (?:is |are )?(?:required|needed|necessary)|nothing (?:more )?to pay|already (?:paid|included)|included in (?:the|your) (?:price|total|order))\b/.test(clean);
  const WEAK_SECRET=/^(?:codes?|pins?|رمز|الرمز|كود|الكود)$/iu;
  const SECURITY_CONTEXT=/(?:otp|one[- ]time|verification|security code|log-?in|sign[- ]?in|sms|text message|whatsapp|telegram|authenticator|2fa|digit|just sent|just received|sent to (?:you|your)|(?:codes?|pins?) (?:that )?you(?:'ve| have| just)? (?:received|got)|(?:we|they|it) (?:just )?sent (?:you|it to you)|your phone|your number|your (?:bank|account|card)|bank|cvv|gift[- ]?cards?|voucher|itunes|google play|steam card|تحقق|التحقق|الأمان|وصلك|وصلتك|بنك|حسابك|هاتفك|جوالك)/iu;
  const EVERYDAY_SECRET=/(?:promo|discount|coupon|voucher|referral|invite|gate|door|entry|building|room|locker|zip|post(?:al)?|area|country|dress|source|bar|qr|tracking|booking|reference|confirmation|order|parcel|wi-?fi|wifi|router|guest|network)\s+(?:codes?|pins?|passwords?)|\bpins?\s+(?:location|drop)|\b(?:location|map|google|dropped)\s+pin|\b(?:wi-?fi|wifi|router|guest|network)\b.{0,12}\bpasswords?/iu;
  const STRONG_CODE_CONTEXT=/(?:otp|one[- ]time|verification|security code|sms|text message|whatsapp|telegram|authenticator|2fa|digit|just sent|cvv|تحقق|التحقق|الأمان)/iu;
  const secretAsk=(re)=>{const m=re.exec(clean);if(!m)return false;const word=String(m[m.length-1]||"");const near=clean.slice(Math.max(0,m.index-50),m.index+m[0].length+70);if(EVERYDAY_SECRET.test(near)&&!STRONG_CODE_CONTEXT.test(near))return false;if(WEAK_SECRET.test(word)&&!SECURITY_CONTEXT.test(near))return false;return true};
  const relationalSecretRequest=secretAsk(/(?:^|[^\p{L}\p{N}_])(send me|send us|send back|send it back|reply with|provide us|provide me|share with me|share with us|tell me|read me|read back|read out|read us|forward me|forward us|envoyez-nous|envoyez-moi|répondez avec|أرسل لي|أرسل لنا|ارسل لي|شارك معي|شارك معنا)(?![\p{L}\p{N}_]).{0,65}(?:^|[^\p{L}\p{N}_])(passwords?|otp|codes?|pins?|cards?|cvv|account number|seed phrase|recovery phrase|mot de passe|رمز|الرمز|كود|الكود|كلمة المرور|رقم البطاقة|عبارة الاسترداد)(?![\p{L}\p{N}_])/iu);
  const imperativeSecretRequest=secretAsk(/(?:^|[^\p{L}\p{N}_])(send|share|provide|enter|type|submit|confirm|verify|upload|attach|envoyer|partager|saisir|أرسل|ارسل|شارك|أدخل|أكد|تحقق)(?![\p{L}\p{N}_]).{0,20}(?:^|[^\p{L}\p{N}_])(your|the|votre|ton|رمز|كلمة|رقم)(?![\p{L}\p{N}_]).{0,45}(?:^|[^\p{L}\p{N}_])(passwords?|otp|codes?|pins?|cards?|cvv|account number|seed phrase|recovery phrase|mot de passe|رمز|كلمة المرور|رقم البطاقة|عبارة الاسترداد)(?![\p{L}\p{N}_])/iu);
  // "a photo of your bank card, both sides" / "the 3 digits on the back": the
  // card details without the words "card number" or "CVV".
  const cardPhotoRequest=/(?:^|[^\p{L}\p{N}_])(photo|picture|image|scan|copy|snap)s?(?![\p{L}\p{N}_]).{0,25}(?:^|[^\p{L}\p{N}_])(bank card|debit card|credit card|your card|the card|both sides)(?![\p{L}\p{N}_])|(?:^|[^\p{L}\p{N}_])(3|three) digits(?![\p{L}\p{N}_]).{0,25}(back|reverse)|(صورة|صور).{0,20}(البطاقة|بطاقتك|بطاقة البنك)/iu.test(clean);
  // "I need the code that was just sent to your phone" (fake support) and the
  // Arabic "send the verification code" with no "to me".
  const needCodeAsk=/\b(?:i|we)\s+(?:need|require|must have|will need)\b[^.!?]{0,40}\b(?:code|otp|pin|passcode)\b[^.!?]{0,60}\b(?:sent|received|texted|on your phone|to your (?:phone|number|email))\b/.test(clean);
  const arabicSecretAsk=/(?:أرسل|ارسل|شارك|أدخل|ادخل|اكتب|زودنا|زودني)\s*(?:لنا|لي)?\s*(?:ب)?(?:رمز التحقق|رمز الأمان|كود التحقق|رمز التفعيل)/u.test(clean)||(/(?:أرسل|ارسل|شارك|أدخل|ادخل|اكتب|زودنا|زودني)\s*(?:لنا|لي)?\s*(?:ب)?(?:الرمز|الكود|كلمة المرور|الرقم السري|رقم البطاقة)/u.test(clean)&&SECURITY_CONTEXT.test(clean));
  const directSecretRequest=relationalSecretRequest||(!protective&&(imperativeSecretRequest||cardPhotoRequest||needCodeAsk||arabicSecretAsk));
  if(protective&&!directSecretRequest){state.raw-=22;state.counterEvidence.push("The wording appears to warn the reader not to share information or follow suspicious instructions.")}
  const training=/(?:^|[^\p{L}\p{N}_])(this is a test|training example|security awareness|example of phishing|sample scam|educational purposes|simulation|exemple de phishing|تدريب توعوي|مثال احتيال)(?![\p{L}\p{N}_])/iu.test(clean);
  if(training){state.raw-=22;state.counterEvidence.push("The text identifies itself as training, simulation, or an educational example.")}

  if(urls.length)addSignal(state,"links",Math.min(14,5+urls.length*3),`Contains ${urls.length} visible web link${urls.length>1?"s":""}.`,"Link-based social engineering","action");
  const linkPressureHit=!protective&&(/(?:^|[^\p{L}\p{N}_])(click|tap|open|visit|scan|cliquez|ouvrez|اضغط|انقر|امسح)(?![\p{L}\p{N}_]).{0,55}(?:^|[^\p{L}\p{N}_])(link|url|qr|button|here|lien|الرابط|رمز)(?![\p{L}\p{N}_])/iu.test(clean)||/(?:^|[^\p{L}\p{N}_])(?:click|tap)\s*[:：]\s*(?:https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/iu.test(clean));
  if(directSecretRequest)addSignal(state,"secret-request",52,"Explicitly asks for credentials, authentication codes, payment details, or a recovery phrase.","Credential theft attempt","credentials",true);
  if(/\b(buy|purchase|pay with|send|transfer)\b.{0,55}\b(gift cards?|bitcoin|btc|crypto|usdt|western union|moneygram|vouchers?)\b/i.test(clean)||/\bpay\b.{0,45}\b(?:via|in|using|by|through)\s+(?:crypto|bitcoin|btc|usdt|gift cards?|western union|moneygram)\b/i.test(clean)||/(اشتر|شراء|اشتري|ابتع|ادفع|أرسل|ارسل|حول).{0,45}(بطاقات? هدايا|بطاقات? شحن|كروت شحن|بطاقات? آيتونز|بطاقات? ايتونز|بطاقات? جوجل|بطاقات? ستيم|بيتكوين|عملات رقمية|ويسترن يونيون)/u.test(clean))addSignal(state,"irreversible-payment",39,"Requests an unusual or difficult-to-reverse payment method.","Payment scam","money",true);
  if(!protective&&/\b(download|install|enable macros?|enable editing|enable content|run this file|sideload|disable antivirus|turn off defender)\b/i.test(clean)){
    // Installing an app from a store is everyday ("install the Careem app").
    // Strong only for macros, files, remote tools or a link to fetch it from.
    const risky=/\b(?:enable (?:macros?|editing|content)|run this file|sideload|disable antivirus|turn off defender|anydesk|teamviewer|screenconnect|attach(?:ed|ment)|remote (?:support|access|control|desktop)|allow (?:full |all )?(?:access|permissions)|cleaner|unlock your (?:frozen )?account|(?:phone|device|computer) is (?:infected|at risk))\b|\.(?:apk|exe|msi|scr|bat|dmg|zip|rar)\b/i.test(clean)||(urls.length>0&&!/\b(?:app store|google play|play store)\b/i.test(clean));
    addSignal(state,"install",risky?38:8,"Requests software execution or asks the user to weaken device security.","Malware delivery attempt","device",risky);
  }
  if(/(?:^|[^\p{L}\p{N}_])(dear customer|dear user|dear winner|valued customer|account holder|dear candidate|cher client|عزيزي العميل|مستخدمنا العزيز)(?![\p{L}\p{N}_])/iu.test(clean))addSignal(state,"generic-greeting",4,"Uses a generic greeting instead of identifying the recipient.","Possible bulk phishing","impersonation");
  if(countMatches(raw,/!/g)>=4)addSignal(state,"punctuation",4,"Uses excessive exclamation marks to create pressure.","Manipulative language","style");
  if(countMatches(raw,/[A-Z]{5,}/g)>=2)addSignal(state,"caps",4,"Uses repeated all-capital words for alarm or urgency.","Manipulative language","style");
  if(countMatches(raw,/[$€£]\s?\d|\d\s?[$€£]|\b(?:usd|eur|gbp|aed|sar|qar|kwd|bhd|omr|egp|usdt)\s?\d|\d+\s?(?:usd|usdt|eur|gbp|aed|sar|qar|kwd|bhd|omr|egp|btc|dollars?|euros?|dirhams?|riyals?|درهم|دراهم|ريال|دولار|دينار|جنيه)(?![\p{L}])/giu)>=1)addSignal(state,"amount",5,"Includes a specific monetary amount.","Financial request","money");
  if(phones.length&&hasTerm(variants,["support","call now","helpline","microsoft","apple","bank","toll-free","toll free","technician","viruses","infected","اتصل","الدعم"]))addSignal(state,"support-phone",19,"Provides a phone number in a support or security-alert context.","Tech-support / vishing scam","impersonation",true);
  if(emails.some(e=>/@(gmail|yahoo|outlook|hotmail|protonmail)\./i.test(e))&&hasTerm(variants,["bank","support","security team","government","microsoft","apple","paypal","procurement","purchase order","accounts payable","finance department","hr department","البنك","الدعم","المشتريات"]))addSignal(state,"public-email",25,"Claims to represent an organization while using a public email provider.","Brand impersonation","impersonation",true);
  if((/\b(paypal|microsoft|apple|google|amazon|netflix|instagram|facebook|whatsapp|dhl|fedex|bank|adcb|enbd|emirates nbd|mashreq|rakbank|hsbc|al ?rajhi|riyad bank|qnb|nbk|kfh|etisalat|stc|mobily|zain|ooredoo|dewa|sewa|salik|uae pass|emirates id|emirates post|aramex|smsa|noon|careem|talabat)\b/i.test(noUrlText)||/(بنك|الراجحي|اتصالات|بريد الإمارات|أرامكس|الهوية|هيئة كهرباء|سالك)/u.test(clean))&&hasTerm(variants,["verify","locked","suspended","refund","security alert","reactivate","restore access","account limited","will be closed","deactivated","customs","blocked","تحقق من حسابك","تحقق من بياناتك","تأكيد حسابك","موقوف","استرداد","تفعيل","تعليق","إيقاف","تحديث","رسوم","إغلاق","تعطيل"]))addSignal(state,"brand-pressure",18,"Combines a well-known brand with account or payment pressure.","Brand impersonation phishing","impersonation");
  if(hiddenChars)addSignal(state,"hidden-chars",16,"Contains hidden bidirectional or zero-width Unicode characters that can disguise content.","Obfuscated phishing","style",true);
  if(containsAny(clean,["unpaid toll","outstanding toll","toll balance","e-zpass","ezpass","toll invoice"])&&containsAny(clean,["pay","suspend","fine","fee","link","click"]))addSignal(state,"toll-smishing",30,"Claims an unpaid road toll and pressures payment or a link click — a widely-reported smishing pattern.","Toll-fee smishing scam","impersonation",true);
  if(!settled&&containsAny(clean,["package could not be delivered","delivery failed","parcel is on hold","redelivery fee","customs fee","shipment is on hold","update your delivery"]))addSignal(state,"delivery-smishing",26,"Claims a package or delivery problem requiring a fee or link click.","Package-delivery smishing scam","impersonation",true);
  if(containsAny(clean,["work from home","earn $","rate products","rating products","rate and review products","no experience needed","no experience required","flexible hours easy money","daily payout","task completion bonus","product boosting","earn per task","بدون خبرة","راتب يومي","دخل يومي","أرباح يومية","وظيفة بدوام جزئي براتب","أرسل نعم","أرسل 'نعم'","عمل من المنزل براتب"]))addSignal(state,"job-scam",24,"Uses work-from-home or easy-money task language typical of job and task scams.","Job / task scam","money",true);
  if(containsAny(clean,["arrest warrant","failure to appear","legal action will be taken","this call is being recorded for legal purposes","stay on the line","do not hang up","identity was used in a crime","federal investigation"]))addSignal(state,"authority-impersonation",34,"Impersonates law enforcement or a government agency with legal threats — a common impersonation/\"digital arrest\" scam pattern.","Government / law-enforcement impersonation scam","impersonation",true);
  if(containsAny(clean,["grandma its me","grandpa its me","ive been in an accident","i need bail money","dont tell mom","dont tell my parents","im in trouble and need money"]))addSignal(state,"family-emergency",30,"Uses a family-emergency plea combined with urgency and secrecy — a pattern seen in impersonation and AI voice-cloning scams.","Family-emergency impersonation scam","impersonation",true);
  if(containsAny(clean,["investment opportunity","guaranteed returns","double your money","crypto trading platform","trading platform","gold trading","my broker","trading mentor","withdraw your profits","teach you step by step","i made"])&&containsAny(clean,["love","miss you","my dear","sweetheart","darling","relationship","our future","future together"]))addSignal(state,"romance-investment",36,"Combines romantic language with an investment or crypto-trading pitch — the classic \"pig butchering\" scam pattern.","Romance / investment (\"pig butchering\") scam","money",true);

  // ── 2026 patterns ──
  if(/\bearn(?:ing|s)?\s+up\s+to\s+[$€£]?\d/.test(clean)&&/\b(?:telegram|whatsapp|dm me|dm us|message (?:us|me|our|the)|contact|register|apply|join|sign up|hr\b|from (?:your )?(?:phone|home)|online|reply|click|link)\b/.test(clean)&&!/\b(?:i|he|she|they|we)\s+(?:earn|earns|make|makes|made)\b/.test(clean))addSignal(state,"job-scam",24,"Uses work-from-home or easy-money task language typical of job and task scams.","Job / task scam","money",true);
  if(/\b(?:linked devices?|link a device)\b/.test(clean)&&/\b(?:scan|code|qr)\b/.test(clean)&&/\b(?:who viewed|see who|view(?:ed)? your (?:profile|photo)|restore|banned|suspend|verify|expire)\b/.test(clean))addSignal(state,"linked-device-lure",34,"Asks you to link a device or scan a code in WhatsApp.","WhatsApp account takeover lure","credentials",true);
  // A prize draw that wants a passport, Emirates ID or card copy over WhatsApp.
  if(state.signals.has("prize")&&/\b(?:whatsapp|send|reply|contact|call|dm)\b/.test(clean)&&/\b(?:passport|emirates id|id copy|copy of (?:your )?(?:id|passport)|bank details|iban|card (?:number|details))\b/.test(clean))addSignal(state,"prize-data-claim",30,"A prize that can only be claimed by sending your ID, passport or bank details — real draws never ask for them.","Prize / giveaway scam","reward",true);
  // "Hi Mum, this is my new number": a new number or a broken phone, then a request to pay.
  const familyOpener=/(?:^|[^\p{L}\p{N}_])(mum|mom|mummy|mommy|mama|dad|daddy|papa|baba|ماما|بابا|أمي|أبي|يمه)(?![\p{L}\p{N}_])/iu.test(clean)||/\b(?:it'?s|its|this is) me\b/.test(clean);
  const newNumberStory=/\b(?:new (?:number|phone|whatsapp)|old (?:number|phone)|(?:lost|broke|broken|dropped|cracked|damaged) (?:my )?phone|phone (?:is |got |has )?(?:broken|dead|lost|stolen|damaged|fell in)|(?:save|delete) (?:this|the old|my) (?:new )?number)\b/.test(clean)||/(رقمي الجديد|رقم جديد|جوالي (?:انكسر|ضاع|خربان)|هاتفي (?:انكسر|ضاع|تعطل))/u.test(clean);
  const payAsk=/\b(?:transfer|wire|lend|loan|bail|money|cash)\b/.test(clean)||/\b(?:pay|send)\b[^.!?]{0,30}(?:\b(?:bill|invoice|rent|fee|fees|amount|account|aed|usd|dirhams?)\b|[$€£]?\d)/.test(clean)||/\b(?:can you|could you|please|pls|plz|need you to|help me)\b[^.!?]{0,15}\bpay\b/.test(clean)||/(حول|حوّل|ادفع|فاتورة|مبلغ|فلوس)/u.test(clean);
  if(familyOpener&&newNumberStory&&payAsk)addSignal(state,"family-new-number",34,"Pretends to be a child or relative on a new number and asks for money — the \"Hi Mum\" scam, now often backed by a cloned voice.","Family-impersonation scam (\"Hi Mum\")","impersonation",true);
  if(familyOpener&&!state.signals.has("family-emergency")&&/\b(?:accident|arrested|jail|police station|hospital|trouble|emergency|kidnapped|detained)\b/.test(clean)&&/\b(?:don'?t call|do not call|can'?t talk|cannot talk|phone (?:was )?taken|they took (?:my )?phone|lawyer|bail)\b/.test(clean)&&payAsk)addSignal(state,"family-emergency",30,"Uses a family-emergency plea combined with urgency and secrecy — a pattern seen in impersonation and AI voice-cloning scams.","Family-emergency impersonation scam","impersonation",true);
  // Cold crypto story: "I trade crypto, made 3,200 USDT, I can show you how".
  const tradeStory=/\b(?:i|we|my (?:uncle|aunt|friend|mentor|teacher|team|broker|cousin|boss))\b[^.!?]{0,50}\b(?:trade|trading|invest(?:ed|ing)?|mine|mining)\b[^.!?]{0,40}\b(?:crypto|bitcoin|btc|binance|forex|gold|stocks?|usdt|eth(?:ereum)?)\b/.test(clean);
  const profitStory=/\b(?:made|earned|profit(?:s|ed)?|gained?|returns?)\b[^.!?]{0,40}(?:[$€£]\s?\d|\d[\d,.]*\s?(?:usdt|usd|aed|btc|eth|%))/.test(clean);
  const offerStory=/\b(?:show you|teach you|help you|join (?:us|me|the)|interested|dm me|message me|contact (?:me|our)|add me)\b/.test(clean);
  if(tradeStory&&profitStory&&offerStory)addSignal(state,"trading-showoff",32,"Shows off crypto or trading profits and offers to teach you — how \"pig butchering\" investment scams open.","Romance / investment (\"pig butchering\") scam","money",true);
  // Task scam: a daily crypto/USD wage for a few minutes of work, handled on a chat app.
  if(/\bearn(?:ing|s)?\s+(?:up to\s+|around\s+|about\s+)?[$€£]?\d[\d,.]*(?:\s?(?:-|–|to)\s?[$€£]?\d[\d,.]*)?\s?(?:usdt|usd|dollars?|aed|eur|gbp|sar|dirhams?)?\s+(?:daily|per day|a day|every day|each day)\b/.test(clean)&&/\b(?:telegram|whatsapp|usdt|crypto|minutes? a day|no experience)\b/.test(clean))addSignal(state,"job-scam",24,"Uses work-from-home or easy-money task language typical of job and task scams.","Job / task scam","money",true);
  // Callback phishing: a purchase you did not make, then "press 1" or "call us".
  const purchaseTalk=/\b(?:order|purchase|charge|transaction|payment|subscription|withdrawal|renewal)\b[^.!?]{0,80}(?:[$€£]\s?\d|\b\d[\d,.]*\s?(?:usd|aed|eur|gbp|sar)\b|\baed\s?\d)/.test(clean);
  if(purchaseTalk&&/\bpress\s+(?:1|one|9|nine|0|zero)\b/.test(clean))addSignal(state,"callback-phishing",30,"Reports a purchase you did not make and tells you to press a key or call a number — the number leads to the scammers, not to the company.","Callback phishing (fake purchase alert)","impersonation",true);
  // The WhatsApp "vote for my cousin" and similar: a code arrives, send it to me.
  if(!protective&&/\b(?:code|otp|pin)\b[^.!?]{0,80}\b(?:send|forward|share|screenshot|read|give|tell)\b[^.!?]{0,15}\b(?:it|that|the code|them)\b[^.!?]{0,15}\b(?:to me|back|to us|to him|to her)\b/.test(clean)&&(/\b(?:6[- ]?digit|six[- ]digit|\d[- ]digit|verification|login|otp)\b/.test(clean)||(/\b(?:whatsapp|telegram|sms|text message)\b/.test(clean)&&!EVERYDAY_SECRET.test(clean))))addSignal(state,"otp-hijack",44,"Asks you to forward a code that was 'sent by mistake' — the code is really for your own account, and passing it on hands that account over.","OTP interception scam","credentials",true);
  if(!protective&&/\b(?:tell|read|give|say|share|dictate)\s+(?:it|the code|that)\s+to\s+(?:our|the|an?|my)\s+(?:agent|operator|representative|caller|person|colleague|team)\b/.test(obfuscated)&&/\b(?:otp|code)\b/.test(obfuscated))addSignal(state,"otp-hijack",44,"Asks you to forward a code that was 'sent by mistake' — the code is really for your own account, and passing it on hands that account over.","OTP interception scam","credentials",true);
  // Fake CAPTCHA that makes you paste a command (ClickFix) and device-code phishing.
  if((/\b(?:win(?:dows)?\s?\+\s?r|windows key|run dialog|run box|open (?:the )?run)\b/.test(clean)&&/\b(?:ctrl\s?\+\s?v|paste)\b/.test(clean))||(/\b(?:verify you are (?:a )?human|i'?m not a robot|captcha)\b/.test(clean)&&/\b(?:ctrl\s?\+\s?v|paste|powershell|terminal|command prompt)\b/.test(clean)))addSignal(state,"clickfix",42,"Tells you to paste a command to prove you are human — a fake CAPTCHA that installs malware.","Fake CAPTCHA (ClickFix) malware lure","device",true);
  if(/(?:microsoft\.com\/devicelogin|aka\.ms\/devicelogin|microsoftonline\.com\/common\/oauth2\/deviceauth|google\.com\/device\b|github\.com\/login\/device)/.test(clean)&&/\b(?:enter|type|input|use)\b[^.!?]{0,30}\bcode\b/.test(clean))addSignal(state,"device-code",36,"Asks you to type a code on a real sign-in page — that hands the sender a logged-in session without a password.","Device-code phishing","credentials",true);
  // Quishing in plain text: scan this QR code to keep or verify an account.
  if(/\bscan(?:ning)?\b[^.!?]{0,30}\bqr\b/.test(clean)&&/\b(?:account|mfa|2fa|multi[- ]factor|verify (?:your )?(?:account|identity|email|mailbox|login|sign-?in|details)|re-?authenticate|log ?in|password|mailbox|access to your|suspension|suspended|payroll|voicemail|authenticator|link a device)\b/.test(clean))addSignal(state,"quishing-lure",34,"Asks you to scan a QR code to keep or verify an account — QR codes hide the web address from filters and from you.","QR-code phishing (quishing)","action",true);
  // The iMessage trick: reply so the link becomes tappable.
  if(/\breply\s+(?:with\s+)?["']?(?:y|yes|1)["']?\b[^.!?]{0,60}\b(?:activate|enable|open|re-?open|click)\b[^.!?]{0,30}\blink\b|\b(?:activate|enable)\s+(?:the\s+)?link\b|\bcopy\s+(?:the\s+)?link\s+(?:to|into)\s+(?:your\s+)?(?:safari|browser|chrome)\b/.test(clean))addSignal(state,"reply-to-activate",30,"Asks you to reply so a link becomes tappable, or to copy it into your browser — a trick to get past phone spam filters.","Smishing filter evasion","action",true);
  // Parcel held / address incomplete, with a fee, link or update request.
  if(!settled&&((/\b(?:shipment|package|parcel)\b[^.!?]{0,30}\b(?:is |was |has been )?(?:held|on hold|returned)\b/.test(clean))||/\b(?:incomplete|missing|incorrect|insufficient)\s+address(?:\s+information)?\b|\bloss of address\b|\baddress (?:is|was) (?:incomplete|missing)\b/.test(clean))&&(urls.length>0||/\b(?:fee|fees|pay|payment|click|link|update your address|release)\b/.test(clean)))addSignal(state,"delivery-smishing",26,"Claims a package or delivery problem requiring a fee or link click.","Package-delivery smishing scam","impersonation",true);

  // "I sent a code to your number by mistake, send it back": the code is the
  // reader's own one-time password, and forwarding it hands the account over.
  const codeBackAsk=/\b(?:send|forward|share|screenshot|read|give|tell|text)\b[^.!?]{0,30}\b(?:me|us|back)\b/i.test(clean);
  if(!protective&&(/\b(sent|send|texted|entered|typed|received|got)\b.{0,50}\b(code|otp|pin|verification|password)\b.{0,70}\b(by mistake|by accident|accidentally|wrong number)\b/i.test(clean)||(codeBackAsk&&/\b(sent|send|texted|entered|typed|received|got)\b.{0,50}\b(code|otp|pin|verification|password)\b.{0,70}\bto your (?:number|phone)\b/i.test(clean))||/\b(by mistake|by accident|accidentally|wrong number)\b.{0,90}\b(code|otp|verification|pin)\b/i.test(clean)||/(أرسلت|وصلك|وصلت|تلقيت|جاك).{0,50}(رمز|كود|الرمز|الكود).{0,50}(بالخطأ|عن طريق الخطأ|بالغلط)/u.test(clean)||/(أرسل|ارسل|حول|أعد إرسال).{0,25}(الرمز|الكود|رمز التحقق).{0,25}(لي|إلي|إليّ|لنا)/u.test(clean)))addSignal(state,"otp-hijack",44,"Asks you to forward a code that was 'sent by mistake' — the code is really for your own account, and passing it on hands that account over.","OTP interception scam","credentials",true);
  // New bank details for a payment, with a reason not to pick up the phone:
  // the shape of invoice and CEO-fraud messages that redirect money.
  const redirectShape=/\b(new|updated|changed|different)\b.{0,20}\b(bank details|bank account|banking details|banking information|bank information|iban|account details|payment details|payment instructions|remittance (?:account|details|instructions)|wire instructions|beneficiary|account number|account no)\b|\b(bank details|banking details|iban|account details|payment details|remittance (?:account|details|instructions)|bank account|account number|wire instructions|payment instructions)\b.{0,30}\b(changed|updated|new|has changed|have changed)\b/i;
  if(variants.some(v=>redirectShape.test(v))||/(تغيرت|تم تغيير|جديد|الجديد).{0,25}(تفاصيل البنك|الحساب البنكي|آيبان|iban|رقم الحساب)/u.test(clean)||/(الحساب البنكي|آيبان|تفاصيل البنك).{0,25}(تغير|تغيرت|الجديد|جديد)/u.test(clean)){
    const paymentTalk=/\b(invoices?|payments?|transfer|wire|pay|remit|settle|process)\b/i.test(obfuscated)||/(فاتورة|دفع|تحويل|حوالة|سداد)/u.test(clean);
    const noCall=/\b(don'?t call|do not call|can'?t talk|cannot talk|in a meeting|in meetings|unavailable|email only|reply by email|discreet)\b/i.test(clean)||/(لا تتصل|لا تكلمني|في اجتماع|مشغول)/u.test(clean);
    const invitesCall=/\b(call me|feel free to call|give me a call|as discussed on the call|as discussed by phone|call to confirm|verify by phone|confirm by phone)\b/i.test(clean)||/(اتصل بي|كما اتفقنا هاتفياً|للتأكيد اتصل)/u.test(clean);
    // A genuine change invites a phone check; the fraud version forbids one.
    if(paymentTalk&&invitesCall&&!noCall){addSignal(state,"payment-redirect",14,"Announces new bank details for a payment — always confirm a change like this by phone with a number you already have before paying.","Payment-detail change","money");state.counterEvidence.push("Invites a phone call to confirm the change, which genuine notices usually do.")}
    else if(paymentTalk)addSignal(state,"payment-redirect",36,"Announces new bank details for a payment — the classic way invoice and CEO-fraud messages redirect money to a criminal's account.","Payment redirection (business email compromise)","money",true);
    if(paymentTalk&&noCall)addSignal(state,"no-verify-pressure",12,"Discourages checking by phone, so the change cannot be verified with the real person.","Payment redirection (business email compromise)","pressure");
  }

  // Investment pitches: a guaranteed or percentage return, or a trading story
  // that leads to profits, deposits or "let me show you". No love word needed.
  if(/\b(guaranteed|assured|risk[- ]free)\s(?:daily |weekly |monthly )?(?:returns?|profits?|income|roi)\b|\b\d{1,3}(?:\.\d)?\s?%\s(?:daily|weekly|monthly|per (?:day|week|month)|(?:last|this|every|a) (?:day|week|month)|in (?:a|one) (?:day|week|month))\b|\b(?:forex|crypto|bitcoin|gold|binary options?)\s(?:trading|signals?|investment)\b.{0,90}\b(?:profits?|returns?|made|earn|earned|deposit|withdraw|withdrawal|%|mentor|teach|show you)\b|\bprofits?\s(?:are\s)?(?:withdrawn|withdrawable|paid out)\s(?:daily|weekly|instantly|anytime)\b/i.test(clean)||/(عائد|أرباح|ربح|دخل)\s?(مضمون|مضمونة|ثابت|ثابتة)|\d{1,3}\s?%\s?(يومياً|يوميا|شهرياً|شهريا|أسبوعياً|أسبوعيا|في اليوم|في الشهر)|(استثمر|استثمار|تداول|التداول).{0,60}(مضمون|أرباح|عائد|%)/u.test(clean))addSignal(state,"investment-pitch",30,"Promises guaranteed or unusually high trading returns — nobody can guarantee that, and this is how investment and \"pig butchering\" scams start.","Investment / trading scam","money",true);
  // Tech-support pop-up wording; the phone-number rule adds the strong half.
  if(/\b(?:your (?:pc|computer|device|mac|phone|system) (?:is|has been) (?:infected|compromised|hacked|blocked|locked)|(?:detected|found) \d+ (?:viruses|threats|infections)|infected with \d+|(?:malware|trojan|spyware|viruses?) (?:detected|found)|do not (?:shut down|restart|turn off) your (?:pc|computer|device)|windows defender|microsoft security|security center)\b/i.test(clean))addSignal(state,"tech-support-alert",18,"Uses fake virus-alert wording to push you to call or install something.","Tech-support scam","device");
  // Pay a fee first to receive a job, visa, prize, loan or parcel: advance-fee fraud.
  const feeAsk=/\b(?:pay|paying|payment of|deposit|transfer|send|sending)\b[^.!?]{0,60}\b(?:refundable|processing|registration|activation|admin(?:istration)?|training|background[- ]check|medical|visa|onboarding|clearance|release|verification|membership|insurance)\s(?:fee|fees|charge|charges|deposit)\b|\b(?:refundable|processing|registration|activation|admin(?:istration)?|training|background[- ]check|medical|visa|onboarding|clearance|release|verification|membership|insurance)\s(?:fee|fees|charge|charges|deposit)\b[^.!?]{0,80}\b(?:pay|payable|paid|send|transfer|deposit|via|before|to (?:proceed|start|release|unlock|activate|receive|claim|get))\b/i.test(clean);
  const windfall=state.signals.has("prize")||state.signals.has("job")||state.signals.has("delivery")||state.signals.has("recovery")||/\b(?:salary|selected|shortlisted|your cv|congratulations|won|winning|claim|inheritance|compensation|grant|loan (?:is )?approved|beneficiary|job offer|offer letter)\b/i.test(clean);
  if(feeAsk&&windfall)addSignal(state,"advance-fee",30,"Asks you to pay a fee first to receive a job, visa, prize or payout — real employers and lotteries never charge you to receive something.","Advance-fee scam","money",true);
  // The two owner-approved rules of 14 Oct 2026 (see wrongNumberInvestment and
  // hiddenFundsShare above). A warning that describes either scam is not one.
  const twoRule=twoRuleText(clean);
  if(!training&&!twoRuleWarning(twoRule)){
    if(wrongNumberInvestment(twoRule))addSignal(state,"wrong-number-investment",34,"Starts as a 'wrong number' text from a stranger who then talks about trading or investing and invites you in — this is how investment and romance (\"pig butchering\") scams open.","Investment / romance scam (wrong-number opener)","money",true);
    if(hiddenFundsShare(twoRule))addSignal(state,"hidden-funds-share",34,"Tells a story about a stranger's hidden fortune (a soldier's trunk box, a diplomat's consignment, a dead client's account) and wants you to help move or claim it for a share — a classic advance-fee scam: the 'fees' to release it come next.","Advance-fee scam","money",true);
  }
  // Marketplace overpayment: a cheque for more than the price, "transfer the extra".
  if(/\b(?:transfer|send|forward|wire)\s(?:the\s|my\s|our\s)?(?:extra|difference|excess|overpayment|surplus)\b|\b(?:once|after|when)\s(?:it|the (?:cheque|check|payment|funds?|money))\s(?:clears|has cleared|is cleared)\b|\b(?:cheque|check)\b.{0,40}\b(?:more than|extra|in excess|which includes|that includes)\b/i.test(clean))addSignal(state,"overpayment",24,"Sends more than the price and asks you to forward the extra — the cheque bounces later and you lose what you forwarded.","Overpayment scam","money");
  // Landlord abroad: cannot show the property, wants the deposit first, will courier the keys.
  if(/\b(?:i'?m|i am|currently|we are|we'?re)\s(?:currently\s)?(?:abroad|overseas|out of the country|in another country|working overseas)\b/i.test(clean)&&/\b(?:can'?t|cannot|unable to|not able to)\s(?:show|meet you|do a viewing|arrange a viewing)\b|\b(?:courier|mail|ship|post|send)\s(?:you\s)?the keys\b|\bkeys\s(?:will be|by)\s(?:courier|couriered|dhl|fedex|mail|post)\b/i.test(clean))addSignal(state,"landlord-abroad",26,"The 'owner' is abroad, cannot show the property and wants a deposit before you have seen it — the classic rental scam.","Rental deposit scam","money");
  // Personal data and documents requested in a message (ID copies, bank details, tax forms).
  if(!protective&&/\b(?:reply|respond|send|provide|submit|email|fill in|confirm|upload|attach|forward)\b.{0,40}\b(?:full name|your name|home address|full address|date of birth|phone number|mobile number|cell number|personal (?:cell|number|mobile)|whatsapp number|passport|id copy|copy of your id|emirates id|national id|id card|bank details|banking details|account details|your bank card)\b/i.test(clean))addSignal(state,"personal-data-request",12,"Asks for personal details or identity documents in a message.","Identity data request","credentials");
  if(/\b(?:need|send|forward|share|provide|email|attach)\b.{0,40}\b(?:w-?2s?|w-?9s?|1099s?|tax forms?|payslips?|pay stubs?|payroll (?:records|data|report)|employee (?:records|data|list|details)|staff records|ssns?|social security numbers?|salary details)\b.{0,160}\b(?:as soon as|asap|urgent|urgently|today|this morning|right away|right now|sent from my)\b/i.test(clean))addSignal(state,"records-request",28,"Asks for staff tax forms or payroll records by message — the shape of W-2 and payroll-data fraud.","Payroll data theft","credentials",true);
  // BEC opener: "are you available", a discreet favour, cannot take calls.
  if(/\b(?:are you (?:available|free|at your desk|in the office)|do you have a (?:moment|minute|sec)|i need (?:you to|a favou?r)|need you to (?:handle|take care of|do) something)\b.{0,220}\b(?:discreet|discreetly|confidential|urgent|quickly|can'?t (?:talk|take calls)|cannot (?:talk|take calls)|in a (?:meeting|conference)|conference|board meetings?|text you|your (?:personal |cell |mobile )?(?:number|cell))\b/i.test(clean))addSignal(state,"bec-opener",22,"Opens like a boss asking a quick discreet favour while unreachable by phone — how gift-card and wire fraud starts.","Executive impersonation (BEC)","pressure");
  // Password expiry with "keep your current password" or a link.
  if(!protective&&/\b(?:password|passcode|account|mailbox|email)\b.{0,30}\b(?:will expire|expires? (?:in|today|tomorrow|within)|is about to expire|expiring|has expired)\b.{0,140}\b(?:keep|retain|same password|click|here|link|http|verify)\b|\bkeep (?:your |the )?(?:current |same |existing )?password\b/i.test(clean))addSignal(state,"password-expiry",24,"Says your password is expiring and offers a link to keep it — real IT systems never let you keep a password through a link.","Credential phishing","credentials",true);
  // MFA fatigue: approve the prompt we sent.
  if(/\b(?:approve|accept|confirm)\b.{0,60}\b(?:authenticator|mfa|2fa|push notification|sign[- ]in request|login request|prompt)\b.{0,80}\b(?:we (?:just |have )?sent|just sent|we triggered|now|immediately|within|right away|or (?:your|the|you))\b|\b(?:sign[- ]in|login|log-in)\s(?:attempts?|request)\b.{0,80}\b(?:unknown device|new device|unrecognised|unrecognized|suspicious)\b/i.test(clean))addSignal(state,"mfa-push",30,"Asks you to approve a sign-in prompt someone else triggered — approving it lets them into your account.","MFA push / account takeover","credentials",true);
  // Payroll diversion: change my direct deposit / salary account.
  if(/\b(?:change|update|switch|changing|updating)\b.{0,30}\b(?:direct deposit|payroll (?:account|details|information)|salary account|bank account (?:for|on file)|my bank (?:details|account))\b|\bnew (?:routing|bank|account) (?:number|details)\b|\bno longer have access to my old account\b/i.test(clean))addSignal(state,"payroll-diversion",26,"Asks payroll to send salary to a new account by message — verify this in person or by phone before changing anything.","Payroll diversion (BEC)","money");
  // Subscription renewal lure; only pressure when the link is not the brand's own.
  const subscriptionLure=/\b(?:subscription|membership|plan)\b.{0,40}\b(?:has expired|expired|will expire|is expiring|expires (?:today|tomorrow|in|soon)|has been suspended|could not be renewed|payment (?:failed|declined|was declined)|renewal failed)\b|\b(?:renew (?:now|today|immediately)|renew your (?:subscription|membership|plan))\b|\bpayment method (?:needs|has) to be updated\b/i.test(clean);

  let highestEmbedded=null;const embedded=[];
  for(const value of urls.slice(0,4)){
    const linkResult=analyzeLinkRules(value);embedded.push(linkResult);
    if(!highestEmbedded||linkResult.score>highestEmbedded.score)highestEmbedded=linkResult;
  }
  if(subscriptionLure)addSignal(state,"subscription-lure",10,"Says a subscription expired or a payment failed and asks you to renew — a common lure for card details.","Subscription renewal phishing",embedded.length&&embedded.some(r=>!r.officialBrand)?"pressure":"");
  if(highestEmbedded?.score>=58)addSignal(state,"dangerous-embedded-link",34,`An embedded link has high-risk structural indicators: ${highestEmbedded.reasons[0]||highestEmbedded.scamType}.`,"Message carrying a suspicious link","action",true);
  else if(highestEmbedded?.score>=32)addSignal(state,"suspicious-embedded-link",18,"An embedded link contains multiple suspicious structural indicators.","Message carrying an unverified link","action");
  if(highestEmbedded?.registeredDomain)state.reasons.push(`Most suspicious visible destination: ${highestEmbedded.registeredDomain}.`);
  // "Click the link" / "scan the QR code" is how every real meeting invite, menu
  // and check-in also reads. It is a strong sign only when the link itself is
  // doubtful or the rest of the message is already about money, an account,
  // pressure or a delivery; a link on a vouched official domain never is.
  if(linkPressureHit){
    const allOfficial=embedded.length>0&&embedded.every(r=>r.officialBrand&&r.score<20);
    const doubtful=embedded.some(r=>r.score>=20)||["credentials","pressure","impersonation","money","device","delivery","reward","extortion"].some(c=>state.categories.has(c));
    addSignal(state,"link-pressure",allOfficial?4:doubtful?18:10,"Directly pressures the recipient to open a link or scan a QR code.","Phishing call-to-action","action",doubtful&&!allOfficial);
  }

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
  // A message can never read safer than a link it carries: Quick Scan on the
  // bare link and on the whole message must agree.
  if(highestEmbedded&&highestEmbedded.score>=SCAM_THRESHOLD&&!protective&&!training)score=Math.max(score,highestEmbedded.score);
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
  const compound=new Set(["co.uk","org.uk","gov.uk","com.au","net.au","co.nz","com.br","com.tr","com.lb","com.cy","co.jp","co.in","com.sg","com.cn","com.hk","com.mx","gov.ae","ac.ae","co.ae","net.ae","org.ae","sch.ae","com.sa","gov.sa","edu.sa","org.sa","net.sa","com.qa","gov.qa","edu.qa","com.kw","gov.kw","edu.kw","com.bh","gov.bh","com.om","gov.om","com.eg","gov.eg","com.jo","gov.jo","co.za","com.pk","gov.in","gov.cy","gouv.fr","gov.gr","gov.tr","gov.lb","gov.il","gov.it","gov.pl","gov.pt","gov.ie","gov.my","gov.sg","gov.ph","gov.ng","gov.za","gov.br","gov.au","govt.nz","go.jp","go.kr","gc.ca"]);
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
  let officialBrand=(()=>{const hit=Object.entries(brands).find(([,domains])=>domains.includes(registered));return hit?[hit[0],registered]:null})();
  // Real government, police and university domains (gov.uk, gouv.fr, gov.cy,
  // gov.sa, police.uk, .gov, .edu) are vouched like a known brand: the scam
  // is the commercial look-alike, not the genuine site. Two-letter country
  // codes only, so "gov.xyz" stays unvouched.
  // Only real government, police and university registries are vouched;
  // "gov.tv" or "police.me" are ordinary two-letter domains anyone can buy.
  const registrySuffix=registered.split(".").slice(1).join(".");
  // .abudhabi and .dubai are restricted to their governments' own entities.
  const governmentSite=/\.(gov|mil|edu|int|abudhabi|dubai)$/i.test(registered)||GOVERNMENT_SUFFIXES.has(registered)||GOVERNMENT_SUFFIXES.has(registrySuffix);
  if(!officialBrand&&governmentSite)officialBrand=["government",registered];

  if(!hadScheme)addSignal(state,"missing-scheme",4,"The protocol was omitted; CyberNet AI assumed HTTPS for parsing.","Unverified URL","structure");
  if(isPrivateHost(host))addSignal(state,"private-host",32,"Points to localhost, a private network, or a link-local address rather than a public website.","Private-network destination","structure",true);
  if(host.endsWith("."))addSignal(state,"trailing-dot",8,"Uses a trailing dot after the hostname, which can make domain comparisons confusing.","Domain-format deception","deception");
  if(url.protocol!=="https:")addSignal(state,"http",18,"Does not use HTTPS encryption.","Insecure web link","transport");
  // Only an "@" before the host disguises the destination (https://bank.com@evil.site); one in the
  // path, like medium.com/@writer/story, is ordinary.
  if(/^[a-z][a-z0-9+.-]*:\/\/[^\/?#]*@/i.test(original)||url.username||url.password)addSignal(state,"userinfo",42,"Contains '@' or embedded credentials, which can disguise the actual destination.","URL destination deception","deception",true);
  if(shorteners.has(registered)&&!officialShortLink(host,url.pathname))addSignal(state,"shortener",28,"Uses a URL-shortening service that hides the final destination.","Hidden destination link","deception",true);
  else if(QR_REDIRECTORS.has(registered)||QR_REDIRECTORS.has(host))addSignal(state,"qr-redirector",14,"Uses a QR-code redirect service that hides the final destination.","Hidden destination link","deception");
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
  if(containsAny(pathQuery,["toll","unpaid","e-zpass","ezpass","turnpike","tollway"])&&!articleLikePath(pathQuery))addSignal(state,"toll-path",26,"The path references an unpaid toll or turnpike fee, a widely-reported smishing pattern.","Toll / package-delivery smishing link","impersonation",true);
  const deliveryActs=["fee","fees","pay","confirm","reschedule","customs","waiting","hold","release","track","tracking","trace"];
  // Whole hyphen tokens only: "your-parcel-is-waiting" yes, "parcel2go" and "parcelforce" no.
  const deliveryInHost=!officialBrand&&domainCore.split("-").some(t=>["parcel","parcels","package","packages","redelivery","redeliver"].includes(t));
  if((containsAny(pathQuery,["package","delivery","redeliver","shipment","parcel","customs-fee"])&&containsAny(pathQuery,["fee","pay","confirm","reschedule"]))||(deliveryInHost&&(containsAny(pathQuery,["fee","pay","confirm","reschedule","customs","release"])||domainCore.split("-").some(t=>deliveryActs.includes(t)))))addSignal(state,"delivery-path",22,"The path references a delivery combined with a fee, confirmation, or rescheduling request.","Package-delivery smishing link","impersonation",true);
  if(/\.(exe|scr|msi|apk|bat|cmd|ps1|js|jar|iso|img|zip|rar|7z|dmg|pkg|vbs|hta|lnk|docm|xlsm)(?:$|[?#])/i.test(url.pathname))addSignal(state,"download",48,"Points directly to an executable, script, disk image, or archive download.","Malware delivery link","malware",true);
  // Only a redirect to another registered domain counts: Google's own sign-in
  // carries continue=https://mail.google.com and is not a redirect trick.
  const redirectTarget=(url.search.match(/[?&](?:redirect|redir|url|target|continue|next|dest|destination|returnurl|return_to|goto)=([^&]*)/i)||[])[1]||"";
  let redirectHost="";try{const t=decodeURIComponent(redirectTarget);if(/^https?:/i.test(t))redirectHost=new URL(t).hostname.toLowerCase().replace(/^www\./,"")}catch{}
  if(redirectHost&&registrableDomain(redirectHost)!==registered)addSignal(state,"redirect",23,"Contains a nested redirect destination that may send visitors elsewhere.","Redirect-based phishing","deception",true);
  try{const decoded=decodeURIComponent(full);if(decoded!==full&&/https?:\/\/[^\s]+https?:\/\//i.test(decoded))addSignal(state,"double-url",24,"Decoding reveals more than one web destination inside the URL.","Nested destination deception","deception",true)}catch{}
  if(/[?&](email|user|username|phone|card|account)=/i.test(url.search)&&state.categories.has("credentials"))addSignal(state,"prefill-identity",12,"Pre-fills identity or account information on a credential-related page.","Targeted credential page","credentials");
  if(/[?&](token|session|auth|password|pass|otp|code|key)=/i.test(url.search))addSignal(state,"secrets-query",24,"Places authentication-like information in the query string.","Credential-bearing URL","credentials",true);

  const mismatch=brandMismatch(host,registered,pathQuery);
  if(mismatch)addSignal(state,`brand-${mismatch.brand}`,35,`References “${mismatch.brand}” but the registered domain is ${registered}, not ${mismatch.official}.`,"Brand impersonation phishing","impersonation",true);
  // "micr0soft", "app1e", "rnicrosoft": read each host token with the usual
  // look-alike substitutions undone and compare it to the brand exactly.
  // The rn/vv tricks only apply to long brands: "stearn" must not become "steam".
  const unmask=(t,brand)=>{const digits=t.replace(/0/g,"o").replace(/1/g,"l");return brand.length>=7?digits.replace(/rn/g,"m").replace(/vv/g,"w"):digits};
  const hostTokens=host.split(/[.-]/).filter(Boolean);
  Object.entries(brands).forEach(([brand,officials])=>{
    if(officials.includes(registered)||brand.length<5)return;
    const core=registered.split(".")[0];const d=levenshtein(core,brand);
    const masked=hostTokens.some(t=>t!==brand&&unmask(t,brand)===brand);
    if(TYPO_EXEMPT.has(brand)&&!masked)return;
    if(masked||(d>0&&d<=1&&core.length>=6))addSignal(state,`typo-${brand}`,37,masked?`The domain spells “${brand}” with look-alike characters.`:`The domain is one character away from the brand “${brand}”.`,"Typosquatting phishing","impersonation",true);
  });
  const lures=officialBrand?[]:lureWordsIn(registered);
  if(lures.length)addSignal(state,"lure-domain",(mismatch||registered.includes("-")?16:10)+8*(Math.min(lures.length,3)-1),`The domain name itself uses account or security wording (“${lures.slice(0,2).join("”, “")}”) to look official.`,"Lookalike-domain phishing","deception");
  if(/[a-z]\d[a-z]|\d[a-z]{2,}|[a-z]{2,}\d/i.test(registered.split(".")[0])&&state.categories.has("impersonation"))addSignal(state,"substitution",16,"Uses letter-number substitutions commonly found in lookalike domains.","Typosquatting phishing","impersonation",true);

  // A police, government, tax or court name inside a commercial domain is the
  // shape of fine-and-fee scams ("cy-police-fines.com"): real authorities use
  // government domains. Whole tokens only, so "policy" and "taxi" pass.
  if(!officialBrand){
    // Subdomains count too: "police.gov.cy.notice-portal.com" carries the
    // real force's name in front of a commercial domain.
    const coreTokens=host.split(/[.-]/).filter(Boolean);
    const compactCore=domainCore.replace(/-/g,"");
    const authorityHit=AUTHORITY_TOKENS.find(token=>coreTokens.includes(token))||AUTHORITY_COMPACT.find(token=>compactCore.includes(token));
    // "traffic", "visa", "tax", "immigration" or "customs" are ordinary business
    // words (analytics, law firms, brokers); they only claim authority next to
    // a fine, fee, notice or account word. Police, ministry, gov and the like
    // are official-sounding on their own.
    // The context must come from a different word: "fine-wines" is not "fines-portal".
    const rest=(domainCore+"/"+pathQuery).split(authorityHit||" ").join(" ");
    const authorityContext=lures.some(w=>w!==authorityHit)||/(fine|fines|penalt|unpaid|overdue|violation|ticket|summons|notice|refund|clearance|declaration|release|e-?services|appeal|toll|portal|parking|speeding)/.test(rest)||/\b(pay|fee|fees|verify|login|secure|update|claim)\b/.test(pathQuery);
    if(authorityHit&&(AUTHORITY_STRONG.includes(authorityHit)||authorityContext))addSignal(state,"authority-lure-domain",26,`The domain name uses an official-sounding word (“${authorityHit}”) but it is not a government website.`,"Government / authority impersonation","impersonation",true);
    else if(authorityHit)addSignal(state,"authority-word",12,`The domain name uses an official-sounding word (“${authorityHit}”) that is not backed by a government website.`,"Official-sounding domain","impersonation");
    const pathLure=(pathQuery.match(/\b(fine|fines|penalty|penalties|unpaid|overdue|refund|refunds|reward|rewards|prize|claim|unlock|suspended|reactivate|verify|verification|confirm|secure|update-payment|billing|invoice|customs|tax|toll)\b/)||[])[1];
    if(pathLure&&!state.signals.has("lure-domain")&&!articleLikePath(pathQuery))addSignal(state,"lure-path",12,`The link’s path uses payment or account wording (“${pathLure}”) that scam pages use to look urgent.`,"Lure wording in the link","deception");
    // A Gulf toll, parking, government or payment-network name next to a
    // payment or reward word ("nol-rta-bonus", "knetpay-kw"): those services
    // only take payment on their own official sites. A product name glued to
    // "pay" on a Gulf registry ("nolpay.ae") is the service's own naming.
    const freeSite=freeHostOf(host);
    const gulfRegistry=/\.(ae|sa|kw|qa|bh|om)$/.test(registered);
    const abroad=s=>Boolean(ACRONYM_ABROAD[s]&&ACRONYM_ABROAD[s].test(registered));
    const serviceJoins=new Set(coreTokens);for(let i=0;i+1<coreTokens.length;i++)serviceJoins.add(coreTokens[i]+coreTokens[i+1]);
    const gluedPay=s=>coreTokens.some(t=>t.startsWith(s)&&SERVICE_LURES.includes(t.slice(s.length)));
    const service=freeSite?"":GULF_SERVICES.find(s=>!abroad(s)&&(serviceJoins.has(s)||gluedPay(s)))||(coreTokens.includes("parking")&&coreTokens.some(t=>GULF_CODES.includes(t))?"parking":"");
    const payLure=service?(AMBIGUOUS_IDS.includes(service)?BILL_LURES:SERVICE_LURES).find(w=>coreTokens.includes(w)||(w.length>=5&&PAY_LURES.includes(w)&&compactCore.includes(w)))||(GOV_SERVICES.includes(service)?GOV_LURES.find(w=>coreTokens.includes(w)):"")||(gluedPay(service)&&!gulfRegistry?"pay":""):"";
    if(service&&payLure)addSignal(state,"service-lure-domain",30,`The domain name pairs “${service}” with “${payLure}”, but that service only takes payments on its official website.`,"Government service / payment impersonation","impersonation",true);
    // Nothing but a Gulf service or brand name and a country code
    // ("rta-dubai-ae.com", "knet-gateway-kw.com", "du-ae.com").
    else if(!freeSite&&!gulfRegistry&&(gulfIdOnly(domainCore.split("-"),GULF_IDS.filter(s=>!abroad(s)))||gulfNamesOnly(domainCore.split("-"),GULF_IDS.filter(s=>!abroad(s)))))addSignal(state,"service-code-domain",30,`The domain name is only “${domainCore.split("-").find(t=>GULF_IDS.includes(t))}” plus a country code, but that organization does not use this address.`,"Government service / brand impersonation","impersonation",true);
  }
  // Free hosting, site-builder, tunnel and storage pages dressed up as a
  // brand, a Gulf service or a bill ("du-ae.netlify.app/billing"). The site
  // name is the subdomain, or the first path segments on path-named hosts.
  const freeHost=freeHostOf(host);
  if(freeHost){
    const words=v=>String(v||"").toLowerCase().replace(/\.(html?|php|aspx?)$/,"").split(/[._-]+/).filter(t=>t&&t!=="www");
    const segs=url.pathname.toLowerCase().split("/").filter(Boolean);
    const hostSite=words(host.slice(0,Math.max(0,host.length-freeHost.length-1)));
    const pathSite=FREE_HOSTS_PATH_NAMED.includes(freeHost)?segs.slice(0,2).flatMap(words):[];
    const siteTokens=[...hostSite,...pathSite];
    // Blog and docs paths write about brands and bills; only a page path counts.
    const pathTokens=articleLikePath(pathQuery)?[]:segs.slice(0,3).flatMap(words);
    const siteJoins=new Set(siteTokens);for(let i=0;i+1<siteTokens.length;i++)siteJoins.add(siteTokens[i]+siteTokens[i+1]);
    const names=[...Object.keys(KNOWN_BRANDS),...GULF_SERVICES];
    const gluedName=t=>names.find(n=>t.length>n.length&&t.startsWith(n)&&GULF_CODES_SHORT.includes(t.slice(n.length)));
    const luresFor=b=>BRAND_LURES_ONLY[b]||[...FREE_HOST_BRAND_LURES,...(BRAND_LURES_EXTRA[b]||[])];
    const brandSite=names.find(n=>siteJoins.has(n))||siteTokens.map(gluedName).find(Boolean)||"";
    const brandLure=brandSite&&[...siteTokens,...pathTokens].find(t=>t!==brandSite&&!t.startsWith(brandSite)&&luresFor(brandSite).includes(t));
    // "du-ae", "etisalat-ae", "naqel-express-ksa": a name plus a country code.
    const idOnly=brandSite&&[hostSite,pathSite].some(list=>gulfIdOnly(list,[...names,...GULF_IDS]));
    // "/dhl/pay", "/du/billing" under a random site name; never a blog post.
    const brandPath=!brandSite&&segs.length<=2?names.find(n=>pathTokens.includes(n)):"";
    const pathLure=brandPath&&[...siteTokens,...pathTokens].find(t=>t!==brandPath&&luresFor(brandPath).includes(t));
    const stems=list=>[...new Set(list.filter(t=>FREE_HOST_LURES.includes(t)).map(t=>LURE_STEM[t]||t))];
    const siteLures=stems(siteTokens),allLures=stems([...siteTokens,...pathTokens]);
    // A brand's own GitHub organization page ("facebook.github.io") and
    // developer projects ("otp-input-react", "google-login-example") are not lures.
    const orgPage=["github.io","gitlab.io","codeberg.page"].includes(freeHost)&&hostSite.length===1&&names.includes(hostSite[0]);
    if(!orgPage&&!siteTokens.some(t=>FREE_HOST_DEV.includes(t))){
      const named=brandSite&&(brandLure||idOnly)?brandSite:brandPath&&pathLure?brandPath:"";
      if(named)addSignal(state,"free-host-brand",32,`The page sits on ${freeHost}, a free website host anyone can use, under the name “${named}”, which the real organization does not use.`,"Free-hosted impersonation page","impersonation",true);
      // One payment word is often a name ("split-the-bill", "fine-dining");
      // two different ones ("refund-claim", "pay-bill") are the lure.
      else if(siteLures.length&&allLures.length>=2)addSignal(state,"free-host-lure",30,`The page sits on ${freeHost}, a free website host anyone can use, and its name uses payment or account wording (“${allLures.slice(0,2).join("”, “")}”).`,"Free-hosted phishing page","deception",true);
    }
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
  const caution=linkNeedsCaution({kind:"link",officialBrand:officialBrand?officialBrand[1]:"",score,signals:state.signalList});
  return{kind:"link",officialBrand:officialBrand?officialBrand[1]:"",signals:state.signalList,categories:[...state.categories],strong:state.strong,score,scamType:state.types.at(-1)||(uncertain?"Unverified link":officialBrand?"Official-looking domain structure":"No dominant URL threat type"),reasons:state.reasons,counterEvidence,advice,uncertain,confidence,verdict,sources:["Local URL engine"],registeredDomain:registered,note:caution?"CyberNet AI could not confirm this link is safe, so treat it as unsafe. Don't open it — go to the organization's official website directly instead.":officialBrand?"The visible domain matches a known official domain, but this does not verify the sender, page content, redirects, or account context.":"CyberNet AI evaluated the URL scheme, registered domain, lookalike patterns, path, query parameters, redirects, downloads, and brand impersonation."};
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
const GOVERNMENT_SUFFIXES=new Set(["gov.uk","police.uk","nhs.uk","ac.uk","gov.ae","ac.ae","gov.sa","edu.sa","gov.qa","gov.kw","gov.bh","gov.om","gov.eg","gov.jo","gov.lb","gov.iq","gov.ps","gov.ma","gov.dz","gov.tn","gov.ly","gov.sd","gov.ye","gov.sy","gov.cy","gov.tr","gov.gr","gov.il","gov.it","gov.pl","gov.pt","gov.ie","gov.my","gov.sg","gov.ph","gov.ng","gov.za","gov.br","gov.au","gov.in","gov.pk","gov.bd","gov.lk","gov.np","gov.mv","gov.cn","gov.hk","gov.tw","gov.kr","go.jp","go.kr","go.id","go.th","gc.ca","gob.mx","gob.es","gob.ar","gob.cl","gob.pe","gob.ve","gouv.fr","govt.nz","gov.kz","gov.ru","gov.ua","gov.ro","gov.bg","gov.hu","gov.cz","gov.sk","gov.si","gov.hr","gov.rs","gov.mt","gov.lv","gov.lt","gov.ee","gov.fi","gov.se","gov.no","gov.dk","gov.nl","gov.be","gov.lu","gov.at","gov.ch","gov.ke","gov.gh","gov.et","gov.tz","gov.ug","gov.rw","gov.vn","gov.mn","gov.kh","gov.la","gov.mm","gov.bn","gov.fj","gov.pg"]);
const AUTHORITY_COMPACT=["police","interpol","ministry","customs","immigration","penalt"];
const AUTHORITY_STRONG=["gov","govt","government","police","ministry","irs","hmrc","interpol","tribunal"];

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

// The one rule for "CAN'T CONFIRM" on a link, shared by the page's headline,
// the scan-list tag, the plain summary and the tests so they never disagree.
// Labelling only: the score and the 32 line are untouched. A link below 32 on
// an unknown domain is a decisive LOW RISK unless the address itself carries a
// deception or impersonation sign (look-alike spelling, payment/gift/brand lure
// words in the domain, a disguised destination), at any score below 32: a green
// answer on a lure domain like "brand-gift-pay.com" would be the wrong signal.
// Transport or structure notes alone, like "no HTTPS", never qualify, and
// neither does "authority-word": an ordinary trade word such as "immigration"
// or "traffic" in a law firm's or analytics tool's name, with no fine or fee.
// One more case is borderline at any score below 32: the rules alone put the
// link at 32+ (a strong sign such as a copied brand name, or localScore from
// Analysis AI) and only the AI's reading pulled it under the line. Rules and
// AI disagree there, so a green LOW RISK would contradict the evidence shown.
// Words that only appear in the page path ("/billing", "/tax", "/track") are common on
// real sites too, so on their own they only count close to the line.
const CAUTION_FLOOR=26;
const CAUTION_PATH_ONLY=["lure-path","delivery-path","toll-path"];
const CAUTION_CATEGORIES=["deception","impersonation"];
const CAUTION_IGNORED=["authority-word"];
function linkNeedsCaution(result){
  if(!result||result.kind!=="link"||result.officialBrand)return false;
  const score=Number(result.score)||0;
  if(score>=SCAM_THRESHOLD)return false;
  const signals=Array.isArray(result.signals)?result.signals:[];
  if((Number(result.localScore)||0)>=SCAM_THRESHOLD||signals.some(item=>item&&item.strong))return true;
  return signals.some(item=>item&&CAUTION_CATEGORIES.includes(item.category)&&!CAUTION_IGNORED.includes(item.id)&&(score>=CAUTION_FLOOR||!CAUTION_PATH_ONLY.includes(item.id)));
}
// Signals that say nothing about a trick in the address itself: no HTTPS, no
// scheme typed, or an ordinary sign-in path (each has its own plain line).
const NOT_A_TRICK=["http","missing-scheme","credential-path"];
// "scam" (32+), "unverified" (the borderline link rule above) or "safe"
// (NOT A SCAM, or LOW RISK for an ordinary link on an unknown domain).
function resultBand(result){
  if((Number(result&&result.score)||0)>=SCAM_THRESHOLD)return "scam";
  return linkNeedsCaution(result)?"unverified":"safe";
}

// Plain-language reading of a result: one lead sentence, up to three reasons
// a non-technical person can act on, and one thing to do. Ordered by how
// decisive the pattern is; the technical evidence stays under "more details".
// Every string id here must be one the engine emits (tests/run-engine.mjs
// checks). "unless" lists ids that make the entry redundant: when one of them
// matched, a more decisive entry above already says it better.
const PLAIN_POINTS=[
  {ids:["secret-request"],text:"It asks you to send a password, one-time code, PIN, card details or gift-card codes. Real companies never ask for these in a message."},
  {ids:["otp-hijack","otp-chain"],text:"It asks you to pass on a code that was sent to your phone. That code protects your account: never share it."},
  {ids:["wrong-number-investment"],text:"It starts as a ‘wrong number’ text from a stranger who then talks about trading or investing and invites you in. That is how investment and romance scams start."},
  {ids:["investment-pitch"],text:"It promises guaranteed or unusually high trading returns. Nobody can guarantee that."},
  {ids:["advance-fee"],text:"It asks you to pay a fee first to receive a job, prize or visa. Real employers and lotteries never charge you."},
  {ids:["hidden-funds-share"],text:"It tells a story about a stranger’s hidden fortune, like a soldier’s trunk box, a diplomat’s parcel or a dead client’s account, and wants your help to move or claim it for a share. There is no money: the ‘fees’ to release it come next."},
  {ids:["remote","install"],text:"It wants you to install something or hand over control of your device."},
  {ids:["irreversible-payment"],text:"It asks you to pay with gift cards or crypto. That money can never be got back."},
  {ids:["payment-redirect"],text:"It announces new bank details for a payment. Always confirm that by phone with a number you already have."},
  {ids:["no-verify-pressure"],text:"It tells you not to phone to check. That is exactly what a scammer would say."},
  {ids:["mfa-push","password-expiry"],text:"It asks you to approve a sign-in or 'keep' a password through a link. That hands your account over."},
  {ids:["records-request","payroll-diversion","bec-opener"],text:"It looks like a boss or colleague asking for staff data or a payment change by message. Confirm by phone with a number you already have."},
  {ids:["overpayment","landlord-abroad"],text:"It asks you to pay or forward money before you have seen the goods, the property or the funds clear."},
  {ids:["tech-support-alert"],text:"It shows a fake virus alert to make you call a number or install something."},
  {ids:["support-phone"],text:"It gives you a phone number to call for ‘support’. The people who answer are the scammers."},
  {ids:["authority-impersonation","govt-authority-threat","govt-authority-finance","authority"],text:"It claims to be the police, a government office or a court, and uses that to pressure you."},
  {ids:["authority-lure-domain"],text:"The address uses a police or government name, but it is not a government website."},
  {ids:["service-lure-domain"],text:"The address pairs a toll, parking, government or bank-card service name with a payment or reward word. Those services only take payments on their own official websites."},
  {ids:["service-code-domain"],text:"The address is just a government service, utility or company name plus a country code, but it is not that organization’s website."},
  {ids:["free-host-brand","free-host-lure"],text:"It is a free website anyone can make in minutes, dressed up with a company, government or payment name. Real organizations don’t send you there to pay or sign in."},
  {ids:["brand-pressure"],text:"It uses a well-known company’s name to make you trust it, then says your account or payment is in trouble."},
  {ids:[/^brand-(?!pressure)/,/^typo-/,"substitution","punycode","unicode","com-prefix-trick"],text:"The web address copies a real company’s name with a look-alike spelling."},
  {ids:["dangerous-embedded-link"],text:"The link inside it looks unsafe: it does not go where it claims."},
  {ids:["threat"],text:"It uses threats, such as arrest, legal action or losing your account, to scare you into acting."},
  {ids:["money-pressure","fine-demand"],text:"It pushes you to pay quickly, before you can check whether the bill is real."},
  {ids:["urgency","deadline-pressure"],text:"It pushes you to act right now, so you do not stop to check."},
  {ids:["otp","credentials"],unless:["secret-request","otp-hijack","otp-chain"],text:"It uses account-security words like ‘verify’, ‘suspended’ or ‘unusual activity’. Real banks do not send these with a link or a code request."},
  {ids:["prize","prize-data-claim"],unless:["irreversible-payment"],text:"It promises a prize, reward or free money you never asked for."},
  {ids:["delivery","delivery-smishing","toll-smishing"],text:"It uses a parcel, toll or delivery fee as the excuse to make you pay or click."},
  {ids:["job","job-scam","romance-investment"],text:"It promises easy money or guaranteed returns. Nobody can guarantee that."},
  {ids:["personal-data-request"],text:"It asks for your ID, address or bank details in a message."},
  {ids:["family-emergency","family-new-number"],text:"It pretends to be someone in your family, often on a ‘new number’, to rush you into sending money. Call them on the number you already have."},
  {ids:["trading-showoff"],text:"It shows off trading profits and offers to teach you. That is how investment scams start."},
  {ids:["callback-phishing"],text:"It reports a purchase you did not make and tells you to call or press a key. The number leads to scammers, not the company."},
  {ids:["clickfix"],text:"It tells you to paste a command to prove you are human. That installs malware."},
  {ids:["device-code"],text:"It asks you to type a code on a real sign-in page. That gives the sender your logged-in session."},
  {ids:["quishing-lure"],text:"It asks you to scan a QR code to keep or verify an account. QR codes hide the web address."},
  {ids:["reply-to-activate"],text:"It asks you to reply or copy a link so it works. Real companies never need that."},
  {ids:["sextortion"],text:"It threatens to share private photos or videos unless you pay. Do not pay: keep the messages and report it."},
  {ids:["mule"],text:"It asks you to receive or pass on money through your own bank account. That would make you part of the crime."},
  {ids:["public-email"],text:"It claims to be a company or bank but writes from a free email address."},
  {ids:["shortener","qr-redirector"],text:"The link is shortened, which hides where it really goes."},
  {ids:["ip","private-host"],text:"It points to a raw number address instead of a normal website name."},
  {ids:["userinfo","redirect","double-url"],text:"The address is built to send you somewhere other than where it appears to go."},
  {ids:["lure-domain","lure-path"],text:"The address uses words like “secure”, “verify” or “fine” to look official."},
  {ids:["suspicious-embedded-link","link-pressure"],text:"It pushes you to tap a link. The link is the trap: it leads to a page made to take your details or money."},
  {ids:["http"],text:"The link starts with http, not https. It is not a secure page, so never type anything on it."},
  {ids:["download"],text:"The link downloads a file, which could be harmful."},
  {ids:["hidden-chars"],text:"It contains hidden characters used to disguise what you are really reading."},
  {ids:["tld","entropy","hyphens","subdomains"],text:"The web address looks like ones scam sites use: an odd ending, many dashes or random letters."}
];
function plainSummary(result,options={}){
  const signals=Array.isArray(result?.signals)?result.signals:[];
  const ids=signals.map(item=>item.id);
  const matches=(pattern)=>pattern instanceof RegExp?ids.some(id=>pattern.test(id)):ids.includes(pattern);
  const score=Number(result?.score)||0;
  const isLink=result?.kind==="link";
  const scam=score>=SCAM_THRESHOLD;
  const unverified=!scam&&linkNeedsCaution({...result,score});
  const lowRiskLink=isLink&&!scam&&!unverified&&!result?.officialBrand;
  const points=[];
  const collect=(limit)=>{
    for(const point of PLAIN_POINTS){
      if(point.unless&&point.unless.some(matches))continue;
      if(point.ids.some(matches)&&!points.includes(point.text))points.push(point.text);
      if(points.length>=limit)break;
    }
  };
  if(scam){
    collect(3);
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
        :"Don’t reply, click or pay. If it says it is from a company, your bank or the police, contact them yourself using their official app, website or a number you already have.",
      scam:true,unverified:false
    };
  }
  if(unverified){
    // Borderline: one sign of a disguised or copied address, close to the line.
    collect(1);
    return{
      lead:"We can’t tell yet if this website is real.",
      points:[
        ...(points.length?points:["The address has one sign that scam sites use, but not enough to call it a scam."]),
        "Scams usually show in the message around a link. Paste the whole message for a better check."
      ],
      action:"Only open it if you were expecting it, and never type passwords or card details there.",
      scam:false,unverified:true
    };
  }
  if(lowRiskLink){
    const note=matches("http")
      ?"It doesn’t use a secure connection (HTTPS), so don’t type passwords or card details there."
      :matches("credential-path")
      ?"It opens a sign-in or account page, so only sign in if you went there yourself."
      :"";
    // Only say "no known scam tricks" when that is literally true; a weak
    // sign below the line (a lure word, many dashes) is named honestly.
    const tricks=signals.filter(item=>item&&!NOT_A_TRICK.includes(item.id)).length;
    const first=!tricks?"The address has no known scam tricks.":tricks===1?"The address has one small sign that scam sites also use, but not enough to call it a scam.":"The address has a few small signs that scam sites also use, but not enough to call it a scam.";
    return{
      lead:"We didn’t find strong scam signs in this link.",
      points:[first,...(note?[note]:[]),"If it came in a message, paste the whole message for the best check."],
      action:"Open it only if you were expecting it.",
      scam:false,unverified:false,lowRisk:true
    };
  }
  return{
    lead:isLink?"This link looks fine.":"We didn’t find the usual signs of a scam.",
    points:[isLink&&result?.officialBrand?`This link goes to the real ${result.officialBrand} website.`:"No pressure, no request for codes or money, and no suspicious link."],
    action:"Stay alert anyway: no scanner can promise something is 100% safe.",
    scam:false,unverified:false
  };
}

return {
  VERSION: "2026-10-14",
  analyzeText: analyzeTextRules,
  analyzeTextRules,
  analyzeTextRulesCore,
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
  linkNeedsCaution,
  resultBand,
  plainSummary,
};
});
