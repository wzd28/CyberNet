/* ─── Particle Network ─── */
(function(){
  const canvas=document.getElementById("particleCanvas");if(!canvas)return;
  const ctx=canvas.getContext("2d");let particles=[];const COUNT=55,MAX_DIST=130;
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight}
  resize();window.addEventListener("resize",resize);
  for(let i=0;i<COUNT;i++){particles.push({x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,r:Math.random()*1.8+0.6,dx:(Math.random()-0.5)*0.35,dy:(Math.random()-0.5)*0.35,o:Math.random()*0.4+0.1})}
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<particles.length;i++){for(let j=i+1;j<particles.length;j++){const dx=particles[i].x-particles[j].x,dy=particles[i].y-particles[j].y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<MAX_DIST){const alpha=0.07*(1-dist/MAX_DIST);ctx.beginPath();ctx.moveTo(particles[i].x,particles[i].y);ctx.lineTo(particles[j].x,particles[j].y);ctx.strokeStyle="rgba(14,165,233,"+alpha+")";ctx.lineWidth=0.6;ctx.stroke()}}}
    particles.forEach(function(p){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle="rgba(0,229,255,"+p.o+")";ctx.fill();p.x+=p.dx;p.y+=p.dy;if(p.x<-10)p.x=canvas.width+10;if(p.x>canvas.width+10)p.x=-10;if(p.y<-10)p.y=canvas.height+10;if(p.y>canvas.height+10)p.y=-10;p.o+=(Math.random()-0.5)*0.008;if(p.o<0.06)p.o=0.06;if(p.o>0.45)p.o=0.45});
    requestAnimationFrame(draw);
  }draw();
})();

document.addEventListener("DOMContentLoaded",()=>{

  /* ─── Core ─── */
  const loader=document.getElementById("loader");
  const navButtons=document.querySelectorAll("[data-page]");
  const pages=document.querySelectorAll(".page");
  const mobileMenu=document.getElementById("mobileMenu");
  const navbar=document.querySelector(".navbar");
  let savedApiKey="";
  const LOADER_MS=1500;

  /* ─── Loader ─── */
  function hideLoader(){if(!loader)return;setTimeout(()=>loader.classList.add("hide"),LOADER_MS)}
  hideLoader();
  function restartLoaderAnimation(){const p=document.querySelector(".loading-progress");if(!p)return;p.style.animation="none";p.offsetHeight;p.style.animation=`loadProgress ${LOADER_MS/1000}s ease forwards`}
  function showTransition(cb){if(!loader){cb();return}loader.classList.remove("hide");restartLoaderAnimation();setTimeout(cb,220);setTimeout(()=>loader.classList.add("hide"),LOADER_MS)}

  /* ─── Reveal ─── */
  function runRevealAnimation(){const items=document.querySelectorAll(".active-page .reveal");items.forEach((item,i)=>{item.classList.remove("show");setTimeout(()=>item.classList.add("show"),110+i*85)})}

  /* ─── Page switching ─── */
  function switchPage(pageName){
    const target=document.getElementById(pageName);if(!target)return;
    const current=document.querySelector(".page.active-page");
    if(current&&current.id===pageName){if(navbar)navbar.classList.remove("open");runRevealAnimation();return}
    showTransition(()=>{
      pages.forEach(p=>p.classList.remove("active-page"));
      target.classList.add("active-page");
      document.querySelectorAll(".nav-tabs .nav-link").forEach(btn=>{btn.classList.toggle("active",btn.dataset.page===pageName)});
      if(navbar)navbar.classList.remove("open");
      window.scrollTo({top:0,behavior:"smooth"});
      setTimeout(runRevealAnimation,110);
      if(pageName==="home")setTimeout(animateWowCounters,600);
    });
  }
  navButtons.forEach(btn=>{btn.addEventListener("click",e=>{e.preventDefault();if(btn.dataset.page)switchPage(btn.dataset.page)})});
  if(mobileMenu&&navbar)mobileMenu.addEventListener("click",()=>navbar.classList.toggle("open"));

  /* ─── Auth Modal ─── */
  const authModal=document.getElementById("authModal");
  const openAuth=document.getElementById("openAuth");
  const closeAuth=document.getElementById("closeAuth");
  const authTabs=document.querySelectorAll(".auth-tab");
  const loginForm=document.getElementById("authLoginForm");
  const signupForm=document.getElementById("authSignupForm");
  const loginBtn=document.getElementById("loginBtn");
  const signupBtn=document.getElementById("signupBtn");
  const navGreeting=document.getElementById("navGreeting");

  if(openAuth&&authModal)openAuth.addEventListener("click",()=>authModal.classList.add("show"));
  if(closeAuth&&authModal)closeAuth.addEventListener("click",()=>authModal.classList.remove("show"));
  if(authModal)authModal.addEventListener("click",e=>{if(e.target===authModal)authModal.classList.remove("show")});

  authTabs.forEach(tab=>{
    tab.addEventListener("click",()=>{
      authTabs.forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      if(tab.dataset.auth==="login"){loginForm.classList.add("active-auth-form");signupForm.classList.remove("active-auth-form")}
      else{signupForm.classList.add("active-auth-form");loginForm.classList.remove("active-auth-form")}
    });
  });

  function doLogin(name){
    const first=name.split(" ")[0]||name;
    if(navGreeting){navGreeting.textContent=`Hi ${first}, How can CyberNet help you today?`;navGreeting.classList.add("visible")}
    if(openAuth)openAuth.style.display="none";
    if(authModal)authModal.classList.remove("show");
  }

  if(loginBtn){
    loginBtn.addEventListener("click",()=>{
      const email=document.getElementById("loginEmail").value.trim();
      const pass=document.getElementById("loginPassword").value.trim();
      if(!email||!pass){alert("Please fill in all fields.");return}
      const name=email.split("@")[0];doLogin(name);
    });
  }
  if(signupBtn){
    signupBtn.addEventListener("click",()=>{
      const name=document.getElementById("signupName").value.trim();
      const email=document.getElementById("signupEmail").value.trim();
      const pass=document.getElementById("signupPassword").value.trim();
      if(!name||!email||!pass){alert("Please fill in all fields.");return}
      doLogin(name);
    });
  }

  /* ─── Wow Section Counters ─── */
  let wowAnimated=false;
  function animateWowCounters(){
    if(wowAnimated)return;wowAnimated=true;
    document.querySelectorAll(".wow-stat-number").forEach(el=>{
      const target=parseInt(el.dataset.target);let current=0;
      const step=Math.max(1,Math.floor(target/60));
      const interval=setInterval(()=>{current+=step;if(current>=target){current=target;clearInterval(interval)}el.textContent=current.toLocaleString()},25);
    });
  }
  // Trigger on load for home page
  setTimeout(animateWowCounters,1200);

  /* ─── Ticker duplication for seamless loop ─── */
  const tickerTrack=document.querySelector(".ticker-track");
  if(tickerTrack){const clone=tickerTrack.innerHTML;tickerTrack.innerHTML=clone+clone}

  /* ─── Risk helpers ─── */
  function getDanger(score){
    if(score>=80)return{label:"Critical Risk",css:"danger"};
    if(score>=55)return{label:"High Risk",css:"danger"};
    if(score>=30)return{label:"Medium Risk",css:"warning"};
    return{label:"Low Risk",css:"safe"};
  }

  function showReport(resultBox,score,scamType,reasons,advice){
    const danger=getDanger(score);
    const colorMap={danger:"#ff5c7a",warning:"#ffd166",safe:"#28f59b"};
    const barColor=colorMap[danger.css];
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add(`result-has-${danger.css}`);
    resultBox.innerHTML=`<div class="scan-report"><div class="report-top-row"><span class="risk-badge risk-${danger.css}">${danger.label}</span><span class="scam-type-tag">${scamType}</span><span class="score-display">${score}<span>/100</span></span></div><div class="risk-meter-wrap"><div class="risk-meter-bar" id="mb_${Date.now()}" style="background:${barColor};box-shadow:0 0 10px ${barColor}80"></div></div><div class="report-body"><div class="report-col"><div class="report-col-title"><span class="col-warn">⚠</span> Warning Signs</div><ul class="report-list">${reasons.map(r=>`<li>${r}</li>`).join("")}</ul></div><div class="report-col"><div class="report-col-title"><span class="col-safe">→</span> What To Do</div><ul class="report-list safe-list">${advice.map(a=>`<li>${a}</li>`).join("")}</ul></div></div></div>`;
    requestAnimationFrame(()=>{const bar=resultBox.querySelector(".risk-meter-bar");if(bar)setTimeout(()=>{bar.style.width=score+"%"},80)});
  }

  function runScan(btn,resultBox,cb){
    const orig=btn.innerHTML;btn.innerHTML=`<span class="btn-spinner"></span> Scanning…`;btn.disabled=true;
    resultBox.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">Analyzing</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;
    resultBox.classList.add("is-scanning");
    setTimeout(()=>{resultBox.classList.remove("is-scanning");cb();btn.innerHTML=orig;btn.disabled=false},680);
  }

  /* ─── Analysis rules ─── */
  function analyzeTextRules(text){
    let score=0,scamType="General suspicious message";const reasons=[];const lower=text.toLowerCase();
    const checks=[
      {words:["urgent","immediately","now","limited time","final warning","act fast"],points:15,reason:"Creates urgency or time pressure."},
      {words:["winner","won","prize","reward","gift","free","claim"],points:20,reason:"Mentions prizes, gifts, or free offers.",type:"Prize / giveaway scam"},
      {words:["password","login","verify","confirm","account","security alert"],points:20,reason:"Asks for account login, verification, or confirmation.",type:"Credential phishing scam"},
      {words:["otp","code","pin","2fa","verification code"],points:25,reason:"Requests OTP, PIN, or verification codes.",type:"OTP theft scam"},
      {words:["bank","payment","refund","invoice","crypto","wallet","transfer"],points:20,reason:"Involves money, banking, payment, or crypto.",type:"Financial scam"},
      {words:["blocked","locked","suspended","deleted","legal action","police"],points:18,reason:"Uses threats or fear to pressure you.",type:"Threat-based phishing scam"},
      {words:["click","link","http","www",".com",".net",".org"],points:12,reason:"Tries to make you click a link."}
    ];
    checks.forEach(c=>{if(c.words.some(w=>lower.includes(w))){score+=c.points;reasons.push(c.reason);if(c.type)scamType=c.type}});
    if((text.match(/!/g)||[]).length>=3){score+=8;reasons.push("Excessive exclamation marks.")}
    if(text.length<20){score+=5;reasons.push("Message is unusually short.")}
    if(!reasons.length)reasons.push("No major scam patterns detected.");
    return{score:Math.min(score,100),scamType,reasons,advice:["Do not click links from unknown senders.","Never share passwords, OTP codes, or bank details.","Verify directly via the official website or app.","Delete and report the message if suspicious."]};
  }

  function analyzeLinkRules(link){
    let score=0,scamType="Suspicious link";const reasons=[];const lower=link.toLowerCase();
    if(!lower.startsWith("https://")){score+=20;reasons.push("Link does not use HTTPS.")}
    if(lower.includes("@")){score+=25;reasons.push("Link contains '@' which can hide the real destination.")}
    if(["bit.ly","tinyurl","t.co","shorturl"].some(s=>lower.includes(s))){score+=25;reasons.push("Uses a URL shortener.");scamType="Hidden destination scam link"}
    if(["login","verify","account","secure"].some(s=>lower.includes(s))){score+=18;reasons.push("Contains phishing keywords.");scamType="Credential phishing link"}
    if(["free","gift","claim","prize"].some(s=>lower.includes(s))){score+=18;reasons.push("Promises gifts or prizes.");scamType="Prize scam link"}
    if(/\d+\.\d+\.\d+\.\d+/.test(lower)){score+=30;reasons.push("Uses a raw IP address.")}
    if((lower.match(/-/g)||[]).length>=3){score+=10;reasons.push("Many hyphens in domain.")}
    if(lower.length>90){score+=12;reasons.push("URL is excessively long.")}
    if([".xyz",".top",".click",".zip",".review",".country"].some(e=>lower.includes(e))){score+=18;reasons.push("Uses a high-risk domain extension.")}
    if(!reasons.length)reasons.push("No major suspicious patterns found.");
    return{score:Math.min(score,100),scamType,reasons,advice:["Do not open the link if you don't trust the source.","Check the domain character by character.","Open the official website manually.","Never enter passwords on suspicious pages."]};
  }

  function analyzeImageRules(file){
    let score=35,scamType="Image / QR phishing risk";const reasons=["Images can hide fake login pages, fake payments, scam popups, or QR codes."];
    const name=file.name.toLowerCase();
    if(name.includes("qr")){score+=25;scamType="QR code phishing (quishing)";reasons.push("File name suggests a QR code.")}
    if(name.includes("bank")||name.includes("payment")||name.includes("invoice")){score+=20;scamType="Fake payment or invoice scam";reasons.push("File name suggests banking or payment content.")}
    if(name.includes("login")||name.includes("account")||name.includes("verify")){score+=20;scamType="Fake login screenshot scam";reasons.push("File name suggests login or verification content.")}
    return{score:Math.min(score,100),scamType,reasons,advice:["Do not scan unknown QR codes.","Do not enter login details from a screenshot link.","Verify via the official website or app.","Use CyberNet AI for deeper analysis."]};
  }

  /* ─── CyberNet Text ─── */
  const cyberTextInput=document.getElementById("cyberTextInput"),cyberTextResult=document.getElementById("cyberTextResult"),cyberTextBtn=document.getElementById("cyberTextBtn");
  if(cyberTextBtn&&cyberTextInput&&cyberTextResult){cyberTextBtn.addEventListener("click",()=>{const text=cyberTextInput.value.trim();if(!text){cyberTextResult.innerHTML=`<span class="warning">Paste a suspicious message first.</span>`;return}runScan(cyberTextBtn,cyberTextResult,()=>{const r=analyzeTextRules(text);showReport(cyberTextResult,r.score,r.scamType,r.reasons,r.advice)})})}

  /* ─── CyberNet Link ─── */
  const cyberLinkInput=document.getElementById("cyberLinkInput"),cyberLinkResult=document.getElementById("cyberLinkResult"),cyberLinkBtn=document.getElementById("cyberLinkBtn");
  if(cyberLinkBtn&&cyberLinkInput&&cyberLinkResult){cyberLinkBtn.addEventListener("click",()=>{const link=cyberLinkInput.value.trim();if(!link){cyberLinkResult.innerHTML=`<span class="warning">Paste a suspicious link first.</span>`;return}runScan(cyberLinkBtn,cyberLinkResult,()=>{const r=analyzeLinkRules(link);showReport(cyberLinkResult,r.score,r.scamType,r.reasons,r.advice)})})}

  /* ─── CyberNet Image ─── */
  const cyberImageInput=document.getElementById("cyberImageInput"),cyberImageResult=document.getElementById("cyberImageResult"),cyberDropZone=document.getElementById("cyberDropZone");
  function handleCyberImage(file){
    if(!file||!cyberImageResult)return;
    if(cyberDropZone){const ex=cyberDropZone.querySelector(".upload-preview");if(ex)ex.remove();const reader=new FileReader();reader.onload=ev=>{const p=document.createElement("div");p.className="upload-preview";p.innerHTML=`<img src="${ev.target.result}" alt="preview"><span class="upload-preview-label">${file.name}</span>`;cyberDropZone.appendChild(p)};reader.readAsDataURL(file)}
    cyberImageResult.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">Analyzing image</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;
    cyberImageResult.classList.add("is-scanning");
    setTimeout(()=>{cyberImageResult.classList.remove("is-scanning");const r=analyzeImageRules(file);showReport(cyberImageResult,r.score,r.scamType,r.reasons,r.advice)},680);
  }
  if(cyberImageInput)cyberImageInput.addEventListener("change",()=>handleCyberImage(cyberImageInput.files[0]));
  if(cyberDropZone&&cyberImageInput){
    cyberDropZone.addEventListener("dragover",e=>{e.preventDefault();cyberDropZone.classList.add("drag-over")});
    cyberDropZone.addEventListener("dragleave",()=>cyberDropZone.classList.remove("drag-over"));
    cyberDropZone.addEventListener("drop",e=>{e.preventDefault();cyberDropZone.classList.remove("drag-over");const f=e.dataTransfer.files[0];if(f){cyberImageInput.files=e.dataTransfer.files;handleCyberImage(f)}});
  }

  /* ─── API Key ─── */
  const aiApiKeyInput=document.getElementById("aiApiKeyInput"),aiApiStatus=document.getElementById("aiApiStatus"),testApiKeyBtn=document.getElementById("testApiKeyBtn"),apiKeyBox=document.querySelector(".api-key-box");
  if(aiApiKeyInput){const wrap=document.createElement("div");wrap.className="api-key-input-row";aiApiKeyInput.parentNode.insertBefore(wrap,aiApiKeyInput);wrap.appendChild(aiApiKeyInput);const toggle=document.createElement("button");toggle.type="button";toggle.className="api-key-toggle";toggle.textContent="👁";toggle.addEventListener("click",()=>{aiApiKeyInput.type=aiApiKeyInput.type==="password"?"text":"password";toggle.textContent=aiApiKeyInput.type==="password"?"👁":"🔒"});wrap.appendChild(toggle)}

  async function testApiKey(){
    const key=aiApiKeyInput.value.trim();
    if(!key){aiApiStatus.innerHTML=`<span class="warning">Paste your OpenAI API key first.</span>`;return}
    if(!key.startsWith("sk-")){aiApiStatus.innerHTML=`<span class="warning">That doesn't look like an OpenAI key (should start with sk-).</span>`;return}
    testApiKeyBtn.innerHTML=`<span class="btn-spinner"></span> Testing…`;testApiKeyBtn.disabled=true;
    aiApiStatus.innerHTML=`<span class="warning">Testing API key…</span>`;
    try{
      const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:"Reply with: CyberNet API OK"}],max_tokens:15})});
      if(!res.ok)throw new Error();savedApiKey=key;
      aiApiStatus.innerHTML=`<span class="safe">✓ API key verified — CyberNet AI is ready.</span>`;
      if(apiKeyBox)apiKeyBox.classList.add("api-unlocked");
    }catch{savedApiKey="";aiApiStatus.innerHTML=`<span class="danger">✗ Invalid key, billing issue, or network error.</span>`;if(apiKeyBox)apiKeyBox.classList.remove("api-unlocked")}
    finally{testApiKeyBtn.innerHTML="Test API Key";testApiKeyBtn.disabled=false}
  }
  if(testApiKeyBtn)testApiKeyBtn.addEventListener("click",testApiKey);

  /* ─── AI calls ─── */
  async function callCyberNetAI(prompt,resultBox){
    if(!savedApiKey){resultBox.innerHTML=`<span class="warning">Connect and test your API key first (above).</span>`;return}
    resultBox.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">CyberNet AI analyzing</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;resultBox.classList.add("is-scanning");
    try{
      const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${savedApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:"You are CyberNet AI, a cybersecurity analyst. For every input, respond with: Danger Score (X/100), Danger Level, Scam Type, Reasons, and What to do. Use short bullet points."},{role:"user",content:prompt}],max_tokens:600})});
      if(!res.ok)throw new Error();const data=await res.json();const reply=data.choices[0].message.content;
      resultBox.classList.remove("is-scanning");resultBox.innerHTML=`<div style="line-height:1.7">${reply.replace(/\n/g,"<br>")}</div>`;
    }catch{resultBox.classList.remove("is-scanning");resultBox.innerHTML=`<span class="danger">AI analysis failed. Check your key, billing, or connection.</span>`}
  }

  /* ─── AI Text / Link / Image ─── */
  const aiTextInput=document.getElementById("aiTextInput"),aiTextResult=document.getElementById("aiTextResult"),aiTextBtn=document.getElementById("aiTextBtn");
  if(aiTextBtn)aiTextBtn.addEventListener("click",()=>{const t=aiTextInput.value.trim();if(!t){aiTextResult.innerHTML=`<span class="warning">Paste suspicious text first.</span>`;return}callCyberNetAI(`Analyze this suspicious message:\n\n${t}`,aiTextResult)});

  const aiLinkInput=document.getElementById("aiLinkInput"),aiLinkResult=document.getElementById("aiLinkResult"),aiLinkBtn=document.getElementById("aiLinkBtn");
  if(aiLinkBtn)aiLinkBtn.addEventListener("click",()=>{const l=aiLinkInput.value.trim();if(!l){aiLinkResult.innerHTML=`<span class="warning">Paste a suspicious link first.</span>`;return}callCyberNetAI(`Analyze this URL for phishing risk:\n\n${l}`,aiLinkResult)});

  const aiImageInput=document.getElementById("aiImageInput"),aiImageResult=document.getElementById("aiImageResult"),aiImageBtn=document.getElementById("aiImageBtn"),aiDropZone=document.getElementById("aiDropZone");
  function showAiImagePreview(file){if(!aiDropZone||!file)return;const ex=aiDropZone.querySelector(".upload-preview");if(ex)ex.remove();const reader=new FileReader();reader.onload=ev=>{const p=document.createElement("div");p.className="upload-preview";p.innerHTML=`<img src="${ev.target.result}" alt="preview"><span class="upload-preview-label">${file.name}</span>`;aiDropZone.appendChild(p)};reader.readAsDataURL(file)}
  if(aiImageInput)aiImageInput.addEventListener("change",()=>showAiImagePreview(aiImageInput.files[0]));
  if(aiDropZone&&aiImageInput){aiDropZone.addEventListener("dragover",e=>{e.preventDefault();aiDropZone.classList.add("drag-over")});aiDropZone.addEventListener("dragleave",()=>aiDropZone.classList.remove("drag-over"));aiDropZone.addEventListener("drop",e=>{e.preventDefault();aiDropZone.classList.remove("drag-over");const f=e.dataTransfer.files[0];if(f){aiImageInput.files=e.dataTransfer.files;showAiImagePreview(f)}})}

  function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
  if(aiImageBtn)aiImageBtn.addEventListener("click",async()=>{
    const file=aiImageInput.files[0];
    if(!file){aiImageResult.innerHTML=`<span class="warning">Upload an image first.</span>`;return}
    if(!savedApiKey){aiImageResult.innerHTML=`<span class="warning">Connect and test your API key first.</span>`;return}
    aiImageResult.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">AI scanning image</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;aiImageResult.classList.add("is-scanning");
    try{
      const b64=await fileToBase64(file);
      const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${savedApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:"You are CyberNet AI. Analyze images for scams: fake login pages, QR scams, fake payments, suspicious screenshots. Return: Danger Score /100, Danger Level, Scam Type, Reasons, and What to do."},{role:"user",content:[{type:"text",text:"Analyze this image for cybersecurity threats."},{type:"image_url",image_url:{url:b64}}]}],max_tokens:700})});
      if(!res.ok)throw new Error();const data=await res.json();const reply=data.choices[0].message.content;
      aiImageResult.classList.remove("is-scanning");aiImageResult.innerHTML=`<div style="line-height:1.7">${reply.replace(/\n/g,"<br>")}</div>`;
    }catch{aiImageResult.classList.remove("is-scanning");aiImageResult.innerHTML=`<span class="danger">Image analysis failed.</span>`}
  });

  /* ─── Learn Roadmap ─── */
  document.querySelectorAll(".rm-node").forEach(node=>{
    node.addEventListener("click",()=>{
      const wasExpanded=node.classList.contains("expanded");
      // Close all in same module
      node.closest(".rm-nodes").querySelectorAll(".rm-node").forEach(n=>n.classList.remove("expanded"));
      if(!wasExpanded)node.classList.add("expanded");
    });
  });

  /* ─── Learn Search ─── */
  const learnSearch=document.getElementById("learnSearch"),learnSearchBtn=document.getElementById("learnSearchBtn"),learnSearchResult=document.getElementById("learnSearchResult");
  function searchLessons(){
    if(!learnSearch||!learnSearchResult)return;
    const query=learnSearch.value.trim().toLowerCase();
    if(!query){learnSearchResult.innerHTML=`<span class="warning">Type something to search first.</span>`;return}
    const nodes=document.querySelectorAll(".rm-node");const matches=[];
    nodes.forEach(node=>{
      const text=node.textContent.toLowerCase();const keywords=(node.dataset.keywords||"").toLowerCase();
      if(text.includes(query)||keywords.includes(query)){
        const mod=node.closest(".rm-module");const modTitle=mod.querySelector(".rm-module-head h2").textContent;
        const nodeTitle=node.querySelector("h3").textContent;const nodeDesc=node.querySelector(".rm-node-info p").textContent;
        matches.push({modTitle,nodeTitle,nodeDesc,nodeEl:node});
      }
    });
    if(!matches.length){learnSearchResult.innerHTML=`<strong class="warning">Nothing found for "${query}".</strong><br>Try: password, phishing, malware, scam, ransomware, wifi, VPN, OTP.`;return}
    learnSearchResult.innerHTML=matches.slice(0,5).map((m,i)=>`<div class="search-result-item"><strong>${m.nodeTitle}</strong><br><span style="color:var(--cyan);font-size:13px">${m.modTitle}</span><p style="margin-top:6px;margin-bottom:0">${m.nodeDesc}</p><button class="secondary-btn" style="margin-top:10px;min-height:38px;padding:0 16px;font-size:13px" data-search-idx="${i}">Open Lesson →</button></div>`).join("");
    learnSearchResult.querySelectorAll("[data-search-idx]").forEach((btn,i)=>{
      btn.addEventListener("click",()=>{matches[i].nodeEl.classList.add("expanded");matches[i].nodeEl.scrollIntoView({behavior:"smooth",block:"center"})});
    });
  }
  if(learnSearchBtn)learnSearchBtn.addEventListener("click",searchLessons);
  if(learnSearch)learnSearch.addEventListener("keydown",e=>{if(e.key==="Enter")searchLessons()});

  /* ─── Start ─── */
  runRevealAnimation();
});