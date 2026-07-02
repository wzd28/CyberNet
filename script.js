/* ─── Particle Network (green theme) ─── */
(function(){
  const canvas=document.getElementById("particleCanvas");if(!canvas)return;
  const ctx=canvas.getContext("2d");let particles=[];const COUNT=50,MAX_DIST=130;
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight}
  resize();window.addEventListener("resize",resize);
  for(let i=0;i<COUNT;i++){particles.push({x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,r:Math.random()*1.6+0.5,dx:(Math.random()-0.5)*0.3,dy:(Math.random()-0.5)*0.3,o:Math.random()*0.35+0.08})}
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<particles.length;i++){for(let j=i+1;j<particles.length;j++){const dx=particles[i].x-particles[j].x,dy=particles[i].y-particles[j].y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<MAX_DIST){const alpha=0.06*(1-dist/MAX_DIST);ctx.beginPath();ctx.moveTo(particles[i].x,particles[i].y);ctx.lineTo(particles[j].x,particles[j].y);ctx.strokeStyle="rgba(34,211,238,"+alpha+")";ctx.lineWidth=0.6;ctx.stroke()}}}
    particles.forEach(function(p){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle="rgba(34,211,238,"+p.o+")";ctx.fill();p.x+=p.dx;p.y+=p.dy;if(p.x<-10)p.x=canvas.width+10;if(p.x>canvas.width+10)p.x=-10;if(p.y<-10)p.y=canvas.height+10;if(p.y>canvas.height+10)p.y=-10;p.o+=(Math.random()-0.5)*0.007;if(p.o<0.05)p.o=0.05;if(p.o>0.4)p.o=0.4});
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
  const LOADER_MS=1400;
  let currentPageId="home";

  /* ─── Loader (first visit only) ─── */
  function hideLoader(){if(!loader)return;setTimeout(()=>loader.classList.add("hide"),LOADER_MS)}
  hideLoader();

  /* ─── Reveal ─── */
  function runRevealAnimation(){const items=document.querySelectorAll(".active-page .reveal");items.forEach((item,i)=>{item.classList.remove("show");setTimeout(()=>item.classList.add("show"),100+i*80)})}

  /* ─── Sliding nav indicator ─── */
  const navIndicator=document.getElementById("navIndicator");
  const navTabsEl=document.querySelector(".nav-tabs");
  function moveNavIndicator(pageName){
    if(!navIndicator||!navTabsEl)return;
    const btn=navTabsEl.querySelector(`.nav-link[data-page="${pageName}"]`);
    if(!btn)return;
    const tabsRect=navTabsEl.getBoundingClientRect();
    const btnRect=btn.getBoundingClientRect();
    navIndicator.style.width=btnRect.width+"px";
    navIndicator.style.transform=`translateX(${btnRect.left-tabsRect.left}px)`;
    navTabsEl.classList.add("indicator-ready");
  }
  window.addEventListener("load",()=>moveNavIndicator(currentPageId));
  window.addEventListener("resize",()=>moveNavIndicator(currentPageId));

  /* ─── Page switching (smooth crossfade, no loader flash after first visit) ─── */
  function switchPage(pageName){
    const target=document.getElementById(pageName);if(!target)return;
    const current=document.querySelector(".page.active-page");
    if(current&&current.id===pageName){if(navbar)navbar.classList.remove("open");runRevealAnimation();return}
    currentPageId=pageName;
    moveNavIndicator(pageName);
    document.querySelectorAll(".nav-tabs .nav-link").forEach(btn=>{btn.classList.toggle("active",btn.dataset.page===pageName)});
    if(navbar)navbar.classList.remove("open");
    const finish=()=>{
      pages.forEach(p=>p.classList.remove("active-page","leaving"));
      target.classList.add("active-page");
      window.scrollTo({top:0,behavior:"auto"});
      setTimeout(runRevealAnimation,60);
      if(pageName==="home")setTimeout(animateWowCounters,450);
      if(pageName==="home")setTimeout(()=>animateHeroStats("#home"),300);
      if(pageName==="about")setTimeout(()=>animateHeroStats("#about"),300);
    };
    if(current){
      current.classList.add("leaving");
      setTimeout(finish,300);
    }else{
      finish();
    }
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
    const first=(name.split(" ")[0]||name).trim();
    const capitalized=first.charAt(0).toUpperCase()+first.slice(1).toLowerCase();
    if(navGreeting){navGreeting.textContent=`Hi ${capitalized}`;navGreeting.classList.add("visible")}
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
  setTimeout(animateWowCounters,1100);

  /* ─── Hero stats row (supports decimals + suffix; works on Home & About) ─── */
  function animateHeroStats(scopeSelector){
    const scope=scopeSelector?document.querySelector(scopeSelector):document;
    if(!scope)return;
    scope.querySelectorAll(".hero-stats-row strong").forEach(el=>{
      if(el.dataset.animated)return;
      el.dataset.animated="true";
      const target=parseFloat(el.dataset.count);
      const suffix=el.dataset.suffix||"";
      const isDecimal=el.dataset.count.includes(".");
      let current=0;
      const steps=50;
      const increment=target/steps;
      let count=0;
      const interval=setInterval(()=>{
        count++;current+=increment;
        if(count>=steps){current=target;clearInterval(interval)}
        el.textContent=(isDecimal?current.toFixed(1):Math.round(current).toLocaleString())+suffix;
      },30);
    });
  }
  setTimeout(()=>animateHeroStats("#home"),900);

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
    const colorMap={danger:"#ff6b6b",warning:"#ffcf6b",safe:"#3ffa8b"};
    const barColor=colorMap[danger.css];
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add(`result-has-${danger.css}`);
    resultBox.innerHTML=`<div class="scan-report"><div class="report-top-row"><span class="risk-badge risk-${danger.css}">${danger.label}</span><span class="scam-type-tag">${scamType}</span><span class="score-display">${score}<span>/100</span></span></div><div class="risk-meter-wrap"><div class="risk-meter-bar" style="background:${barColor};box-shadow:0 0 10px ${barColor}80"></div></div><div class="report-body"><div class="report-col"><div class="report-col-title"><span class="col-warn">⚠</span> Warning Signs</div><ul class="report-list">${reasons.map(r=>`<li>${r}</li>`).join("")}</ul></div><div class="report-col"><div class="report-col-title"><span class="col-safe">→</span> What To Do</div><ul class="report-list safe-list">${advice.map(a=>`<li>${a}</li>`).join("")}</ul></div></div></div>`;
    requestAnimationFrame(()=>{const bar=resultBox.querySelector(".risk-meter-bar");if(bar)setTimeout(()=>{bar.style.width=score+"%"},80)});
  }

  function runScan(btn,resultBox,cb){
    const orig=btn.innerHTML;btn.innerHTML=`<span class="btn-spinner"></span> scanning…`;btn.disabled=true;
    resultBox.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">analyzing</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;
    setTimeout(()=>{cb();btn.innerHTML=orig;btn.disabled=false},650);
  }

  /* ─── Analysis rules (same proven engine) ─── */
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
  const cyberTextCount=document.getElementById("cyberTextCount");
  if(cyberTextInput&&cyberTextCount){cyberTextInput.addEventListener("input",()=>{cyberTextCount.textContent=cyberTextInput.value.length})}

  function animateScanRing(ringEl,labelEl,statusEl,duration,onDone){
    if(!ringEl||!labelEl)return onDone&&onDone();
    const circumference=276;
    if(statusEl)statusEl.textContent="Scanning...";
    ringEl.style.strokeDashoffset=circumference;
    requestAnimationFrame(()=>{ringEl.style.strokeDashoffset=0});
    const tickMs=40;
    const increment=100/(duration/tickMs);
    let pct=0;
    const interval=setInterval(()=>{
      pct+=increment;
      if(pct>=100){pct=100;clearInterval(interval);if(statusEl)statusEl.textContent="Scan complete";if(onDone)setTimeout(onDone,150)}
      labelEl.textContent=Math.round(pct)+"%";
    },tickMs);
  }

  function prependScan(listId,mainText,riskLabel,riskClass){
    const list=document.getElementById(listId);if(!list)return;
    const li=document.createElement("li");
    li.innerHTML=`<span class="scan-list-main">${mainText}</span><span class="risk-tag ${riskClass}">${riskLabel}</span>`;
    list.insertBefore(li,list.firstChild);
    if(list.children.length>4)list.removeChild(list.lastChild);
  }
  function riskMeta(score){
    if(score>=55)return{label:"High Risk",cls:"risk-tag-danger"};
    if(score>=30)return{label:"Medium Risk",cls:"risk-tag-warning"};
    return{label:"Low Risk",cls:"risk-tag-safe"};
  }

  if(cyberTextBtn&&cyberTextInput&&cyberTextResult){cyberTextBtn.addEventListener("click",()=>{
    const text=cyberTextInput.value.trim();if(!text){cyberTextResult.innerHTML=`<span class="warning">Paste a suspicious message first.</span>`;return}
    const ring=document.getElementById("textScanRing"),label=document.getElementById("textScanLabel"),status=document.getElementById("textScanStatus");
    cyberTextBtn.disabled=true;
    animateScanRing(ring,label,status,1400,()=>{
      const r=analyzeTextRules(text);
      showReport(cyberTextResult,r.score,r.scamType,r.reasons,r.advice);
      const meta=riskMeta(r.score);
      prependScan("textScanList",`"${text.slice(0,38)}${text.length>38?"...":""}"`,meta.label,meta.cls);
      cyberTextBtn.disabled=false;
    });
  })}

  /* ─── CyberNet Link ─── */
  const cyberLinkInput=document.getElementById("cyberLinkInput"),cyberLinkResult=document.getElementById("cyberLinkResult"),cyberLinkBtn=document.getElementById("cyberLinkBtn");
  if(cyberLinkBtn&&cyberLinkInput&&cyberLinkResult){cyberLinkBtn.addEventListener("click",()=>{const link=cyberLinkInput.value.trim();if(!link){cyberLinkResult.innerHTML=`<span class="warning">Paste a suspicious link first.</span>`;return}runScan(cyberLinkBtn,cyberLinkResult,()=>{const r=analyzeLinkRules(link);showReport(cyberLinkResult,r.score,r.scamType,r.reasons,r.advice);const meta=riskMeta(r.score);prependScan("linkScanList",link.slice(0,42),meta.label,meta.cls)})})}

  /* ─── CyberNet Image (with real QR decoding) ─── */
  const cyberImageInput=document.getElementById("cyberImageInput"),cyberImageResult=document.getElementById("cyberImageResult"),cyberDropZone=document.getElementById("cyberDropZone");

  function decodeQRFromFile(file){
    return new Promise((resolve)=>{
      if(typeof jsQR==="undefined"){resolve(null);return}
      const reader=new FileReader();
      reader.onload=e=>{
        const img=new Image();
        img.onload=()=>{
          try{
            const canvas=document.createElement("canvas");
            canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
            const ctx=canvas.getContext("2d");
            ctx.drawImage(img,0,0);
            const imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
            const code=jsQR(imageData.data,imageData.width,imageData.height);
            resolve(code?code.data:null);
          }catch(err){resolve(null)}
        };
        img.onerror=()=>resolve(null);
        img.src=e.target.result;
      };
      reader.onerror=()=>resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function handleCyberImage(file){
    if(!file||!cyberImageResult)return;
    if(cyberDropZone){const ex=cyberDropZone.querySelector(".upload-preview");if(ex)ex.remove();const reader=new FileReader();reader.onload=ev=>{const p=document.createElement("div");p.className="upload-preview";p.innerHTML=`<img src="${ev.target.result}" alt="preview"><span class="upload-preview-label">${file.name}</span>`;cyberDropZone.appendChild(p)};reader.readAsDataURL(file)}
    cyberImageResult.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">Analyzing image</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;

    const qrData=await decodeQRFromFile(file);

    setTimeout(()=>{
      let r;
      if(qrData){
        // Real QR code found in the image — decode it and analyze the actual link it points to
        const looksLikeUrl=/^https?:\/\//i.test(qrData)||/^[a-z0-9.-]+\.[a-z]{2,}/i.test(qrData);
        if(looksLikeUrl){
          const normalized=/^https?:\/\//i.test(qrData)?qrData:"http://"+qrData;
          r=analyzeLinkRules(normalized);
        }else{
          r={score:45,scamType:"QR code (non-link content)",reasons:["This QR code does not contain a typical web link."],advice:["Be cautious with unexpected QR codes.","Do not act on unusual instructions from a scanned code."]};
        }
        r.reasons=[`QR code decoded successfully — it points to: "${qrData.slice(0,70)}${qrData.length>70?"...":""}"`,...r.reasons];
      }else{
        // No QR code detected in the image — fall back to filename-based heuristics
        r=analyzeImageRules(file);
        r.reasons=["No QR code detected in this image — analysis is based on filename patterns only.",...r.reasons];
      }
      showReport(cyberImageResult,r.score,r.scamType,r.reasons,r.advice);
      const meta=riskMeta(r.score);
      prependScan("imageScanList",file.name,meta.label,meta.cls);
    },500);
  }
  if(cyberImageInput)cyberImageInput.addEventListener("change",()=>handleCyberImage(cyberImageInput.files[0]));
  if(cyberDropZone&&cyberImageInput){
    cyberDropZone.addEventListener("dragover",e=>{e.preventDefault();cyberDropZone.classList.add("drag-over")});
    cyberDropZone.addEventListener("dragleave",()=>cyberDropZone.classList.remove("drag-over"));
    cyberDropZone.addEventListener("drop",e=>{e.preventDefault();cyberDropZone.classList.remove("drag-over");const f=e.dataTransfer.files[0];if(f){cyberImageInput.files=e.dataTransfer.files;handleCyberImage(f)}});
  }

  /* ─── Detect tabs (CyberNet Features page) ─── */
  document.querySelectorAll(".detect-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".detect-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      const targetPanel=tab.dataset.tab;
      document.querySelectorAll(".detect-panel").forEach(p=>p.classList.toggle("active",p.dataset.panel===targetPanel));
      runRevealAnimation();
    });
  });

  /* ─── API Key ─── */
  const aiApiKeyInput=document.getElementById("aiApiKeyInput"),aiApiStatus=document.getElementById("aiApiStatus"),testApiKeyBtn=document.getElementById("testApiKeyBtn"),aiConnPill=document.getElementById("aiConnPill"),aiReqLeft=document.getElementById("aiReqLeft");
  let aiRequestsLeft=100;
  if(aiApiKeyInput&&aiApiKeyInput.parentElement.classList.contains("api-key-input-row")){
    const wrap=aiApiKeyInput.parentElement;
    const toggle=document.createElement("button");toggle.type="button";toggle.className="api-key-toggle";toggle.textContent="show";
    toggle.style.cssText="position:absolute;right:10px;top:50%;transform:translateY(-50%);border:none;background:transparent;color:var(--muted);font-family:var(--font-mono);font-size:11px;cursor:pointer;";
    toggle.addEventListener("click",()=>{aiApiKeyInput.type=aiApiKeyInput.type==="password"?"text":"password";toggle.textContent=aiApiKeyInput.type==="password"?"show":"hide"});
    aiApiKeyInput.style.paddingRight="52px";
    wrap.appendChild(toggle);
  }

  async function testApiKey(){
    const key=aiApiKeyInput.value.trim();
    if(!key){aiApiStatus.innerHTML=`<span class="warning">Paste your OpenAI API key first.</span>`;return}
    if(!key.startsWith("sk-")){aiApiStatus.innerHTML=`<span class="warning">That doesn't look like an OpenAI key (should start with sk-).</span>`;return}
    testApiKeyBtn.innerHTML=`<span class="btn-spinner"></span> Testing…`;testApiKeyBtn.disabled=true;
    aiApiStatus.innerHTML=`<span class="warning">Testing API key…</span>`;
    if(aiConnPill){aiConnPill.textContent="Connecting...";aiConnPill.className="status-pill status-pill-warn"}
    try{
      const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:"Reply with: CyberNet API OK"}],max_tokens:15})});
      if(!res.ok)throw new Error();savedApiKey=key;
      aiApiStatus.innerHTML=`<span class="safe">✓ API key verified — CyberNet AI is ready.</span>`;
      if(aiConnPill){aiConnPill.textContent="Connected";aiConnPill.className="status-pill status-pill-safe"}
    }catch{
      savedApiKey="";aiApiStatus.innerHTML=`<span class="danger">✗ Invalid key, billing issue, or network error.</span>`;
      if(aiConnPill){aiConnPill.textContent="Not Connected";aiConnPill.className="status-pill"}
    }
    finally{testApiKeyBtn.innerHTML="Save Key";testApiKeyBtn.disabled=false}
  }
  if(testApiKeyBtn)testApiKeyBtn.addEventListener("click",testApiKey);

  /* ─── Chat interface ─── */
  const chatMessages=document.getElementById("chatMessages");
  const chatInput=document.getElementById("chatInput");
  const chatSendBtn=document.getElementById("chatSendBtn");
  const chatInputRowText=document.getElementById("chatInputRowText");
  const chatInputRowImage=document.getElementById("chatInputRowImage");
  const aiImageInput=document.getElementById("aiImageInput");
  let currentChatMode="text";

  function addChatBubble(role,html){
    if(!chatMessages)return null;
    const bubble=document.createElement("div");
    bubble.className="chat-bubble "+(role==="user"?"chat-bubble-user":"chat-bubble-ai");
    bubble.innerHTML=`<div class="chat-bubble-inner">${html}</div>`;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop=chatMessages.scrollHeight;
    return bubble;
  }

  async function sendToAI(promptText,systemPrompt,imageB64){
    if(!savedApiKey){addChatBubble("ai",`<span class="warning">Connect and save your API key on the left first.</span>`);return}
    if(aiRequestsLeft<=0){addChatBubble("ai",`<span class="warning">You've used all 100 demo requests. Refresh to reset.</span>`);return}
    const thinking=addChatBubble("ai",`<div class="scanning-placeholder"><span class="scanning-placeholder-text">Analyzing</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`);
    try{
      const userContent=imageB64?[{type:"text",text:promptText},{type:"image_url",image_url:{url:imageB64}}]:promptText;
      const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${savedApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:systemPrompt},{role:"user",content:userContent}],max_tokens:600})});
      if(!res.ok)throw new Error();
      const data=await res.json();const reply=data.choices[0].message.content;
      thinking.querySelector(".chat-bubble-inner").innerHTML=reply.replace(/\n/g,"<br>");
      aiRequestsLeft--;if(aiReqLeft)aiReqLeft.textContent=aiRequestsLeft+"/100";
    }catch{
      thinking.querySelector(".chat-bubble-inner").innerHTML=`<span class="danger">Analysis failed. Check your key, billing, or connection.</span>`;
    }
  }

  function sendChatMessage(){
    const text=chatInput.value.trim();
    if(!text)return;
    addChatBubble("user",text.replace(/</g,"&lt;"));
    chatInput.value="";
    if(currentChatMode==="link"){
      sendToAI(`Analyze this URL for phishing risk:\n\n${text}`,"You are CyberNet AI, a cybersecurity analyst. For every input, respond with: Danger Score (X/100), Danger Level, Scam Type, Reasons, and What to do. Use short bullet points.");
    }else{
      sendToAI(`Analyze this suspicious message:\n\n${text}`,"You are CyberNet AI, a cybersecurity analyst. For every input, respond with: Danger Score (X/100), Danger Level, Scam Type, Reasons, and What to do. Use short bullet points.");
    }
  }
  if(chatSendBtn)chatSendBtn.addEventListener("click",sendChatMessage);
  if(chatInput)chatInput.addEventListener("keydown",e=>{if(e.key==="Enter")sendChatMessage()});

  function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
  if(aiImageInput)aiImageInput.addEventListener("change",async()=>{
    const file=aiImageInput.files[0];if(!file)return;
    addChatBubble("user",`📎 ${file.name}`);
    const b64=await fileToBase64(file);
    sendToAI("Analyze this image for cybersecurity threats.","You are CyberNet AI. Analyze images for scams: fake login pages, QR scams, fake payments, suspicious screenshots. Return: Danger Score /100, Danger Level, Scam Type, Reasons, and What to do.",b64);
  });

  document.querySelectorAll(".chat-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".chat-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      currentChatMode=tab.dataset.chat;
      if(chatInputRowText)chatInputRowText.style.display=currentChatMode==="image"?"none":"flex";
      if(chatInputRowImage)chatInputRowImage.style.display=currentChatMode==="image"?"flex":"none";
      if(chatInput)chatInput.placeholder=currentChatMode==="link"?"Paste a suspicious link...":"Ask anything about security...";
    });
  });

  /* ─── Learn Roadmap ─── */
  document.querySelectorAll(".rm-node").forEach(node=>{
    node.addEventListener("click",()=>{
      const wasExpanded=node.classList.contains("expanded");
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
    learnSearchResult.innerHTML=matches.slice(0,5).map((m,i)=>`<div class="search-result-item"><strong>${m.nodeTitle}</strong><br><span style="color:var(--green);font-size:12px">${m.modTitle}</span><p style="margin-top:6px;margin-bottom:0">${m.nodeDesc}</p><button class="secondary-btn" style="margin-top:9px;min-height:34px;padding:0 14px;font-size:12px" data-search-idx="${i}">open_lesson →</button></div>`).join("");
    learnSearchResult.querySelectorAll("[data-search-idx]").forEach((btn,i)=>{
      btn.addEventListener("click",()=>{matches[i].nodeEl.classList.add("expanded");matches[i].nodeEl.scrollIntoView({behavior:"smooth",block:"center"})});
    });
  }
  if(learnSearchBtn)learnSearchBtn.addEventListener("click",searchLessons);
  if(learnSearch)learnSearch.addEventListener("keydown",e=>{if(e.key==="Enter")searchLessons()});

  /* ─── NEW: Hero terminal typing effect ─── */
  const heroTermBody=document.getElementById("heroTermBody");
  if(heroTermBody){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lines=[
      "$ cybernet --status",
      "> initializing threat engine... done",
      "> scanning 12,847 endpoints",
      "> 3 threats neutralized in the last hour",
      "> connection secure_"
    ];
    if(reduceMotion){
      heroTermBody.innerHTML=lines.map(l=>`<div class="term-line" style="opacity:1">${l.startsWith("$")?`<span class="prompt">$</span>${l.slice(1)}`:l}</div>`).join("");
    }else{
      let lineIndex=0;
      function typeNextLine(){
        if(lineIndex>=lines.length){
          const cursor=document.createElement("span");cursor.className="term-cursor";
          heroTermBody.lastElementChild&&heroTermBody.lastElementChild.appendChild(cursor);
          return;
        }
        const raw=lines[lineIndex];
        const div=document.createElement("div");div.className="term-line";
        heroTermBody.appendChild(div);
        let charIndex=0;
        const prefix=raw.startsWith("$")?`<span class="prompt">$</span>`:"";
        const text=raw.startsWith("$")?raw.slice(1):raw;
        function typeChar(){
          if(charIndex<=text.length){
            div.innerHTML=prefix+text.slice(0,charIndex);
            charIndex++;
            setTimeout(typeChar,18+Math.random()*22);
          }else{
            lineIndex++;
            setTimeout(typeNextLine,260);
          }
        }
        typeChar();
      }
      setTimeout(typeNextLine,500);
    }
  }

  /* ─── NEW: Tilt-card interaction (subtle, Apple-style) ─── */
  (function initTiltCards(){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduceMotion)return;
    document.querySelectorAll(".tilt-card").forEach(el=>{
      let rect=null;
      el.addEventListener("mouseenter",()=>{rect=el.getBoundingClientRect()});
      el.addEventListener("mousemove",e=>{
        if(!rect)rect=el.getBoundingClientRect();
        const px=(e.clientX-rect.left)/rect.width;
        const py=(e.clientY-rect.top)/rect.height;
        const rotY=(px-0.5)*8;
        const rotX=(0.5-py)*8;
        el.style.transform=`perspective(900px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
      });
      el.addEventListener("mouseleave",()=>{el.style.transform="";rect=null});
    });
  })();

  /* ─── NEW: Magnetic buttons ─── */
  (function initMagneticButtons(){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduceMotion)return;
    document.querySelectorAll(".primary-btn,.secondary-btn,.login-btn").forEach(btn=>{
      btn.addEventListener("mousemove",e=>{
        const rect=btn.getBoundingClientRect();
        const x=(e.clientX-rect.left-rect.width/2)*0.22;
        const y=(e.clientY-rect.top-rect.height/2)*0.32;
        btn.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      });
      btn.addEventListener("mouseleave",()=>{btn.style.transform=""});
    });
  })();

  /* ─── NEW: Cursor-follow glow in hero ─── */
  (function initCursorGlow(){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heroSection=document.getElementById("heroSection");
    const cursorGlow=document.getElementById("cursorGlow");
    if(reduceMotion||!heroSection||!cursorGlow)return;
    heroSection.addEventListener("mousemove",e=>{
      const rect=heroSection.getBoundingClientRect();
      cursorGlow.style.left=(e.clientX-rect.left)+"px";
      cursorGlow.style.top=(e.clientY-rect.top)+"px";
      heroSection.classList.add("glow-active");
    });
    heroSection.addEventListener("mouseleave",()=>heroSection.classList.remove("glow-active"));
  })();

  /* ─── NEW: Pricing monthly/yearly toggle ─── */
  (function initPricingToggle(){
    const toggle=document.getElementById("pricingToggle");
    if(!toggle)return;
    const options=toggle.querySelectorAll(".toggle-option");
    options.forEach(opt=>{
      opt.addEventListener("click",()=>{
        const cycle=opt.dataset.cycle;
        toggle.dataset.cycle=cycle;
        options.forEach(o=>o.classList.toggle("active",o===opt));
        document.querySelectorAll(".price-card h2").forEach(h2=>{
          const amount=h2.querySelector(".price-amount");
          const suffix=h2.querySelector("span:last-child");
          if(!amount||!suffix||amount===suffix)return;
          const val=amount.dataset[cycle];
          if(val===undefined)return;
          amount.textContent="$"+val;
          suffix.textContent=cycle==="yearly"?"/yr":"/mo";
        });
      });
    });
  })();

  /* ─── NEW: Parallax + cinematic scroll effect on the Home hero ─── */
  (function initParallax(){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduceMotion)return;
    const globeWrap=document.querySelector(".globe-shield-wrap");
    const heroEl=document.querySelector(".hero");
    const homeSection=document.getElementById("home");
    if(!globeWrap||!heroEl||!homeSection)return;
    let ticking=false;
    function onScroll(){
      if(ticking)return;
      ticking=true;
      requestAnimationFrame(()=>{
        if(homeSection.classList.contains("active-page")){
          const scrollY=window.scrollY||window.pageYOffset;
          // Globe drifts slower than the page scroll (parallax depth)
          globeWrap.style.transform=`translateY(${scrollY*0.18}px)`;
          // Hero cinematically fades and lifts as it scrolls out of view
          const fadeRange=420;
          const progress=Math.min(Math.max(scrollY/fadeRange,0),1);
          heroEl.style.opacity=String(1-progress*0.7);
          heroEl.style.transform=`translateY(${progress*-30}px)`;
        }
        ticking=false;
      });
    }
    window.addEventListener("scroll",onScroll,{passive:true});
  })();

  /* ─── NEW: Scroll-triggered reveals (cinematic scrolling effect) ─── */
  (function initScrollReveal(){
    if(!("IntersectionObserver" in window))return;
    const observer=new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add("show");
          observer.unobserve(entry.target);
        }
      });
    },{threshold:0.15,rootMargin:"0px 0px -60px 0px"});
    function observeRevealsIn(pageId){
      const page=document.getElementById(pageId);
      if(!page)return;
      page.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
    }
    // Re-observe whenever a page becomes active (covers content below the fold)
    document.querySelectorAll(".page").forEach(p=>observeRevealsIn(p.id));
  })();

  /* ─── Start ─── */
  moveNavIndicator(currentPageId);
  runRevealAnimation();
});