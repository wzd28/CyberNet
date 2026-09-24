/* ─── Adaptive Particle Network (mobile-aware) ─── */
(function initParticleNetwork(){
  const canvas=document.getElementById("particleCanvas");
  if(!canvas)return;
  const reduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer=window.matchMedia?.("(pointer: coarse)").matches;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const saveData=Boolean(connection?.saveData);
  if(reduceMotion||saveData){canvas.style.display="none";return}

  const ctx=canvas.getContext("2d",{alpha:true,desynchronized:true});
  if(!ctx)return;
  const lowPower=(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4);
  const mobile=coarsePointer||window.innerWidth<760;
  if(mobile||lowPower){canvas.style.display="none";return}
  const COUNT=48;
  const MAX_DIST=135;
  const MAX_DIST_SQ=MAX_DIST*MAX_DIST;
  const TARGET_FPS=40;
  const FRAME_MS=1000/TARGET_FPS;
  let particles=[];
  let running=true;
  let lastFrame=0;
  let resizeTimer=0;
  let rafId=0;

  function resize(){
    const dpr=Math.min(window.devicePixelRatio||1,1.6);
    const width=Math.max(1,window.innerWidth);
    const height=Math.max(1,window.innerHeight);
    canvas.width=Math.round(width*dpr);
    canvas.height=Math.round(height*dpr);
    canvas.style.width=width+"px";
    canvas.style.height=height+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function seed(){
    particles=Array.from({length:COUNT},()=>({
      x:Math.random()*window.innerWidth,
      y:Math.random()*window.innerHeight,
      r:Math.random()*1.25+.45,
      dx:(Math.random()-.5)*.28,
      dy:(Math.random()-.5)*.28,
      o:Math.random()*.28+.07
    }));
  }
  function draw(timestamp){
    if(!running)return;
    rafId=requestAnimationFrame(draw);
    if(timestamp-lastFrame<FRAME_MS)return;
    lastFrame=timestamp;
    const width=window.innerWidth,height=window.innerHeight;
    ctx.clearRect(0,0,width,height);
    for(let i=0;i<particles.length;i++){
      const a=particles[i];
      for(let j=i+1;j<particles.length;j++){
        const b=particles[j],dx=a.x-b.x,dy=a.y-b.y,distSq=dx*dx+dy*dy;
        if(distSq<MAX_DIST_SQ){
          const alpha=.045*(1-distSq/MAX_DIST_SQ);
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
          ctx.strokeStyle=`rgba(34,211,238,${alpha})`;ctx.lineWidth=.55;ctx.stroke();
        }
      }
      ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(34,211,238,${a.o})`;ctx.fill();
      a.x+=a.dx;a.y+=a.dy;
      if(a.x<-8)a.x=width+8;else if(a.x>width+8)a.x=-8;
      if(a.y<-8)a.y=height+8;else if(a.y>height+8)a.y=-8;
    }
  }
  resize();seed();rafId=requestAnimationFrame(draw);
  window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{resize();seed()},160)},{passive:true});
  document.addEventListener("visibilitychange",()=>{
    running=!document.hidden;
    if(running){lastFrame=0;cancelAnimationFrame(rafId);rafId=requestAnimationFrame(draw)}
  });
})();

document.addEventListener("DOMContentLoaded",()=>{

  /* ─── Core ─── */
  const navButtons=document.querySelectorAll("[data-page]");
  const pages=document.querySelectorAll(".page");
  const mobileMenu=document.getElementById("mobileMenu");
  const navbar=document.querySelector(".navbar");
  let currentPageId="home";

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
  const DEFAULT_TITLE=document.title;
  const DEFAULT_DESCRIPTION=document.querySelector('meta[name="description"]')?.content||"";
  const PAGE_META={
    home:{
      title:"CyberNet AI | AI-Powered Cybersecurity",
      description:"CyberNet AI provides on-demand threat analysis, account-based AI access, and clear defensive next actions for suspicious messages, links, and screenshots."
    },
    cybernet:{
      title:"Quick Scan | CyberNet AI",
      description:"Scan suspicious text messages, links, and screenshots for phishing, scams, and impersonation with instant risk explanations."
    },
    cybernetai:{
      title:"Analysis AI | CyberNet AI",
      description:"Paste a message, link, or screenshot and get an automatic, expert-level cybersecurity analysis powered by CyberNet's managed AI or your own API key."
    },
    learn:{
      title:"Learn Cybersecurity | CyberNet AI",
      description:"Free, interactive cybersecurity lessons covering phishing, malware, passwords, authentication, safe browsing, and privacy — with real examples, warning signs, and quizzes."
    },
    pricing:{
      title:"Pricing | CyberNet AI",
      description:"Compare CyberNet AI Free and Pro plans: daily AI analysis limits, saved history, downloadable reports, and Recovery features."
    },
    about:{
      title:"About | CyberNet AI",
      description:"CyberNet AI's mission is to protect people before threats become real damage, by making cybersecurity understandable and accessible."
    }
  };
  function updatePageMeta(pageName){
    const meta=PAGE_META[pageName];
    document.title=meta?meta.title:DEFAULT_TITLE;
    const descTag=document.querySelector('meta[name="description"]');
    if(descTag)descTag.setAttribute("content",meta?meta.description:DEFAULT_DESCRIPTION);
  }

  /* ─── Real, shareable URLs per page (e.g. cybernetai.app/quick-scan) ─── */
  const PAGE_PATHS={
    home:"/",
    cybernet:"/quick-scan",
    cybernetai:"/analysis-ai",
    recovery:"/recovery",
    learn:"/learn",
    pricing:"/pricing",
    about:"/about"
  };
  const PATH_TO_PAGE=Object.fromEntries(Object.entries(PAGE_PATHS).map(([page,path])=>[path,page]));
  function pageForCurrentPath(){
    const path=window.location.pathname.replace(/\/$/,"")||"/";
    return PATH_TO_PAGE[path]||null;
  }

  function switchPage(pageName,options={}){
    const target=document.getElementById(pageName);if(!target)return;
    const current=document.querySelector(".page.active-page");
    if(current&&current.id===pageName){if(navbar)navbar.classList.remove("open");runRevealAnimation();return}
    currentPageId=pageName;
    updatePageMeta(pageName);
    if(!options.skipUrlUpdate&&PAGE_PATHS[pageName]!==undefined){
      const targetPath=PAGE_PATHS[pageName];
      if(window.location.pathname!==targetPath){
        history.pushState({page:pageName},"",targetPath+window.location.hash);
      }
    }
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

  /* ─── Route to the right page based on the URL when the site first loads ─── */
  const initialRoutePage=pageForCurrentPath();
  if(initialRoutePage&&initialRoutePage!=="home"){
    switchPage(initialRoutePage,{skipUrlUpdate:true});
  }

  /* ─── Support the browser's back/forward buttons ─── */
  window.addEventListener("popstate",()=>{
    const page=pageForCurrentPath()||"home";
    switchPage(page,{skipUrlUpdate:true});
  });

  /* ─── Secure account, plan, and entitlement state ─── */
  const authModal=document.getElementById("authModal");
  const openAuth=document.getElementById("openAuth");
  const closeAuth=document.getElementById("closeAuth");
  const authTabs=document.querySelectorAll(".auth-tab");
  const googleAuthWrap=document.getElementById("googleAuthWrap");
  const loginForm=document.getElementById("authLoginForm");
  const signupForm=document.getElementById("authSignupForm");
  const loginBtn=document.getElementById("loginBtn");
  const resendConfirmBtn=document.getElementById("resendConfirmBtn");
  const signupBtn=document.getElementById("signupBtn");
  const forgotPasswordBtn=document.getElementById("forgotPasswordBtn");
  const switchToSignupBtn=document.getElementById("switchToSignupBtn");
  const switchToLoginBtn=document.getElementById("switchToLoginBtn");
  const logoutBtn=document.getElementById("logoutBtn");
  const navGreeting=document.getElementById("navGreeting");
  const accountSummary=document.getElementById("accountSummary");
  const navPlanBadge=document.getElementById("navPlanBadge");
  const authMessage=document.getElementById("authMessage");
  const freePlanBtn=document.getElementById("freePlanBtn");
  const proPlanBtn=document.getElementById("proPlanBtn");
  const businessPlanBtn=document.getElementById("businessPlanBtn");
  const pricingNotice=document.getElementById("pricingNotice");
  const aiUpgradeBtn=document.getElementById("aiUpgradeBtn");
  const manageBillingBtn=document.getElementById("manageBillingBtn");

  const appState={
    supabase:null,
    session:null,
    user:null,
    profile:{plan:"guest",fullName:"",subscriptionStatus:"inactive",billingInterval:""},
    usage:{used:0,limit:0,remaining:0,resetDate:""},
    quickScanUsage:{used:0,limit:0,plan:"free"},
    recoveryUsage:{used:0,limit:0},
    history:[],
    accountReady:false,
    recoveryMode:false
  };

  const publicConfig=window.CYBERNET_CONFIG||{};
  const supabaseConfigured=Boolean(
    window.supabase?.createClient&&
    /^https:\/\//.test(String(publicConfig.SUPABASE_URL||""))&&
    String(publicConfig.SUPABASE_ANON_KEY||"").length>20&&
    !String(publicConfig.SUPABASE_URL).includes("YOUR_")&&
    !String(publicConfig.SUPABASE_ANON_KEY).includes("YOUR_")
  );

  function setAuthMessage(message="",tone=""){
    if(!authMessage)return;
    authMessage.textContent=message;
    authMessage.className=`auth-message ${tone}`.trim();
  }

  function authSetupMessage(){
    if(!window.supabase?.createClient)return "The Supabase browser library did not load. Refresh the page and check your internet connection.";
    if(!publicConfig.SUPABASE_URL||!publicConfig.SUPABASE_ANON_KEY)return "Account configuration is missing. Confirm config.js is deployed beside index.html.";
    if(!/^https:\/\/.+\.supabase\.co$/i.test(String(publicConfig.SUPABASE_URL)))return "The Supabase project URL in config.js is not valid.";
    return "The account service could not start. Open /config.js on the live site, confirm the values appear, then hard-refresh.";
  }

  function friendlyAuthError(error,mode="login"){
    const raw=String(error?.message||"").trim();
    const message=raw.toLowerCase();
    if(message.includes("invalid login credentials"))return "Email or password not recognized. Check your details. If you do not have an account yet, choose Create Account.";
    if(message.includes("email not confirmed"))return "Confirm your email first, then return and sign in.";
    if(message.includes("user already registered"))return "An account may already exist for this email. Switch to Sign In or use Forgot your password.";
    if(message.includes("password should be at least")||message.includes("weak password"))return "Use a stronger password with at least 8 characters.";
    if(message.includes("rate limit"))return "Too many account attempts. Wait a few minutes, then try again.";
    if(message.includes("network")||message.includes("fetch"))return "The account service could not be reached. Check your connection and try again.";
    return raw||(mode==="signup"?"Account creation failed.":"Sign in failed.");
  }

  function setAuthTab(mode="login"){
    authTabs.forEach(tab=>tab.classList.toggle("active",tab.dataset.auth===mode));
    loginForm?.classList.toggle("active-auth-form",mode==="login");
    signupForm?.classList.toggle("active-auth-form",mode==="signup");
    // Google works for both tabs — an existing Google account signs in, a new one
    // is created — so only the divider's wording follows the tab.
    if(googleAuthWrap){
      googleAuthWrap.hidden=false;
      const divider=document.getElementById("googleAuthDivider");
      if(divider)divider.textContent=mode==="signup"?"or sign up with email":"or sign in with email";
    }
  }

  function openAuthModal(mode="login"){
    setAuthTab(mode);
    setAuthMessage("");
    authModal?.classList.add("show");
  }

  if(openAuth)openAuth.addEventListener("click",()=>openAuthModal("login"));
  if(switchToSignupBtn)switchToSignupBtn.addEventListener("click",()=>setAuthTab("signup"));
  if(switchToLoginBtn)switchToLoginBtn.addEventListener("click",()=>setAuthTab("login"));
  if(closeAuth&&authModal)closeAuth.addEventListener("click",()=>authModal.classList.remove("show"));
  if(authModal)authModal.addEventListener("click",event=>{if(event.target===authModal)authModal.classList.remove("show")});
  authTabs.forEach(tab=>tab.addEventListener("click",()=>setAuthTab(tab.dataset.auth)));

  function firstName(value=""){
    const raw=String(value||"").trim().split(/\s+/)[0]||"User";
    return raw.charAt(0).toUpperCase()+raw.slice(1);
  }

  function planTier(){
    const plan=appState.profile?.plan;
    return plan==="business"?"business":plan==="pro"?"pro":"free";
  }
  function isPro(){return planTier()!=="free"}
  function isBusiness(){return planTier()==="business"}
  function isSignedIn(){return Boolean(appState.session?.access_token)}

  // A Business team member's activity is shown to their team owner; they agree
  // to that when they accept the invite. Quick Scan runs on this device, so its
  // result has to be sent up for the owner's log. Nothing is sent for anyone
  // else, and the owner's own activity is never reported.
  function isLoggedTeamMember(){return Boolean(appState.profile?.isTeamMember)&&appState.profile?.teamRole!=="owner"}
  function reportTeamActivity(payload){
    if(!isSignedIn()||!isLoggedTeamMember())return;
    try{fetch("/api/team-activity",{method:"POST",headers:authHeaders({"Content-Type":"application/json"}),body:JSON.stringify(payload),keepalive:true}).catch(()=>{})}catch{}
  }
  function quickScanLogResult(result,extra={}){
    return{score:result.score,scamType:result.scamType,confidence:result.confidence,reasons:(result.reasons||[]).slice(0,14),advice:(result.advice||[]).slice(0,12),counterEvidence:(result.counterEvidence||[]).slice(0,10),links:(result.links||[]).slice(0,4).map(link=>({url:link.url,score:link.result?.score,label:link.result?.scamType})),...extra};
  }

  function authHeaders(extra={}){
    return appState.session?.access_token?{...extra,Authorization:`Bearer ${appState.session.access_token}`}:{...extra};
  }

  function showPricingNotice(message,tone=""){
    if(!pricingNotice)return;
    pricingNotice.textContent=message;
    pricingNotice.className=`pricing-notice glass show ${tone}`.trim();
  }

  function renderProHistory(){
    const list=document.getElementById("proHistoryList");
    const label=document.getElementById("historyPlanLabel");
    if(!list)return;
    if(!isSignedIn()){
      if(label)label.textContent="Sign in required";
      list.innerHTML="<p>Sign in to view your plan and AI access.</p>";
      return;
    }
    if(!isPro()){
      if(label)label.textContent="Pro feature";
      list.innerHTML="<p>Upgrade to Pro to save and revisit your AI scan history.</p>";
      return;
    }
    if(label)label.textContent="Saved securely";
    if(!appState.history.length){
      list.innerHTML="<p>Your completed Pro analyses will appear here.</p>";
      return;
    }
    list.innerHTML=appState.history.slice(0,8).map(item=>{
      const type=escapeHTML(String(item.analysis_type||"analysis").toUpperCase());
      const title=escapeHTML(item.threat_type||item.verdict||"Security analysis");
      const date=new Date(item.created_at).toLocaleString();
      return `<div class="history-entry"><strong>${type} · ${title}</strong><span>${Math.round(Number(item.score)||0)}/100 · ${escapeHTML(date)}</span></div>`;
    }).join("");
  }

  function updatePlanBenefits(){
    const list=document.getElementById("aiBenefitList");
    if(!list)return;
    if(isPro()){
      list.innerHTML=`
        <div><span>✓</span> 15 advanced AI analyses per day</div>
        <div><span>✓</span> Detailed risk scoring and threat intelligence</div>
        <div><span>✓</span> Saved scan history</div>
        <div><span>✓</span> Downloadable security reports</div>`;
    }else{
      list.innerHTML=`
        <div><span>✓</span> Accurate Text, Link &amp; Image analysis</div>
        <div><span>✓</span> Basic threat explanations</div>
        <div class="benefit-locked"><span>×</span> Saved scan history</div>
        <div class="benefit-locked"><span>×</span> Downloadable reports</div>`;
    }
  }

  function updateAccountUI(){
    const signedIn=isSignedIn();
    const pro=isPro();
    const plan=signedIn?(pro?"pro":"free"):"guest";
    document.body.dataset.plan=plan;

    if(accountSummary)accountSummary.hidden=!signedIn;
    if(openAuth){openAuth.hidden=signedIn;}
    const authCheckingSkeleton=document.getElementById("authCheckingSkeleton");
    if(authCheckingSkeleton)authCheckingSkeleton.hidden=true;
    if(navGreeting)navGreeting.textContent=signedIn?`Hi ${firstName(appState.profile.fullName||appState.user?.user_metadata?.full_name||appState.user?.email)}`:"";

    const cyberTextBtnEl=document.getElementById("cyberTextBtn");
    const cyberLinkBtnEl=document.getElementById("cyberLinkBtn");
    const cyberUploadHeading=document.querySelector("#cyberDropZone h3");
    const chatSendBtnEl=document.getElementById("chatSendBtn");
    const recoveryStartBtnEl=document.getElementById("recoveryStartBtn");
    if(cyberTextBtnEl)cyberTextBtnEl.textContent=signedIn?"Analyze Text":"Register for Free to Scan";
    if(cyberLinkBtnEl)cyberLinkBtnEl.textContent=signedIn?"Analyze Link":"Register for Free to Scan";
    if(cyberUploadHeading)cyberUploadHeading.textContent=signedIn?"Drag & Drop Your Image Here":"Register for Free to Scan";
    if(chatSendBtnEl){
      chatSendBtnEl.innerHTML=signedIn?"➤":"Register for Free to Scan";
      chatSendBtnEl.classList.toggle("send-btn-wide",!signedIn);
    }
    if(recoveryStartBtnEl&&!recoveryStartBtnEl.disabled)recoveryStartBtnEl.textContent=signedIn?"Start Recovery":"Register for Free to Start a Recovery Case";

    const badgeText=isBusiness()?"BUSINESS":pro?"PRO":"FREE";
    [navPlanBadge,document.getElementById("aiPlanBadge")].forEach(badge=>{
      if(!badge)return;
      badge.textContent=badgeText;
      badge.className=`plan-badge ${isBusiness()?"plan-badge-business":pro?"plan-badge-pro":"plan-badge-free"}`;
    });

    const used=Number(appState.usage.used)||0;
    const limit=Number(appState.usage.limit)||(signedIn?(pro?15:3):3);
    const remaining=Math.max(0,Number.isFinite(appState.usage.remaining)?Number(appState.usage.remaining):limit-used);
    
    // Quick Scan's own usage meter (separate limit from Analysis AI)
    const qsUsed=Number(appState.quickScanUsage?.used)||0;
    const qsServerLimit=Number(appState.quickScanUsage?.limit);
    const qsHasServerLimit=Number.isFinite(qsServerLimit)&&qsServerLimit>0;
    const qsUnlimited=qsHasServerLimit?qsServerLimit>=99999:(appState.isAdmin||(pro&&!isBusiness()));
    const qsFallbackLimit=qsHasServerLimit?qsServerLimit:(isBusiness()?100:5);
    const qsUsageText=document.getElementById("quickScanUsageText");
    const qsUsageBar=document.getElementById("quickScanUsageBar");
    const qsUsageReset=document.getElementById("quickScanUsageReset");
    if(qsUsageText)qsUsageText.textContent=!signedIn?"— / 5":qsUnlimited?`${qsUsed} / Unlimited`:`${qsUsed} / ${qsFallbackLimit}`;
    if(qsUsageBar)qsUsageBar.style.width=`${signedIn&&!qsUnlimited?Math.min(100,(qsUsed/qsFallbackLimit)*100):0}%`;
    if(qsUsageReset)qsUsageReset.textContent=qsUnlimited?"Unlimited":"Resets daily";

    // Recovery Mode's own usage meter (separate limit, separate reset time)
    const recUsed=Number(appState.recoveryUsage?.used)||0;
    const recServerLimit=Number(appState.recoveryUsage?.limit);
    const recHasServerLimit=Number.isFinite(recServerLimit)&&recServerLimit>0;
    const recUnlimited=recHasServerLimit?recServerLimit>=99999:appState.isAdmin;
    const recLimit=recHasServerLimit?recServerLimit:(appState.isAdmin?999999:isBusiness()?20:pro?3:1);
    const recUsageText=document.getElementById("recoveryUsageCaseText");
    const recUsageBar=document.getElementById("recoveryUsageCaseBar");
    if(recUsageText)recUsageText.textContent=!signedIn?`— / ${recLimit}`:recUnlimited?`${recUsed} / Unlimited`:`${recUsed} / ${recLimit}`;
    if(recUsageBar)recUsageBar.style.width=`${signedIn&&!recUnlimited?Math.min(100,(recUsed/recLimit)*100):0}%`;

    const aiPlanTitle=document.getElementById("aiPlanTitle");
    const aiPlanDescription=document.getElementById("aiPlanDescription");
    const aiUsageText=document.getElementById("aiUsageText");
    const aiUsageBar=document.getElementById("aiUsageBar");
    const aiUsageReset=document.getElementById("aiUsageReset");
    const aiConnPill=document.getElementById("aiConnPill");
    const aiReqLeft=document.getElementById("aiReqLeft");
    const aiApiStatus=document.getElementById("aiApiStatus");

    if(aiPlanTitle)aiPlanTitle.textContent=pro?"Analysis AI Pro":"Analysis AI Free";
    if(aiPlanDescription)aiPlanDescription.textContent=!signedIn?"Sign in to activate 3 accurate AI analyses per day across text, links, and images.":pro?"Top-level Analysis AI protection with advanced analysis, history, and reports.":"Accurate everyday AI protection with 3 shared analyses per day.";
    if(aiUsageText)aiUsageText.textContent=signedIn?`${used} / ${limit}`:`0 / 3`;
    if(aiUsageBar)aiUsageBar.style.width=`${signedIn?Math.min(100,(used/Math.max(1,limit))*100):0}%`;
    if(aiUsageReset)aiUsageReset.textContent=appState.usage.resetDate?`Resets ${new Date(appState.usage.resetDate).toLocaleDateString()}`:"Resets daily";

    const analysisAiHeaderUsageText=document.getElementById("analysisAiHeaderUsageText");
    const analysisAiHeaderUsageBar=document.getElementById("analysisAiHeaderUsageBar");
    const analysisAiHeaderUsageReset=document.getElementById("analysisAiHeaderUsageReset");
    if(analysisAiHeaderUsageText)analysisAiHeaderUsageText.textContent=signedIn?`${used} / ${limit}`:`— / 3`;
    if(analysisAiHeaderUsageBar)analysisAiHeaderUsageBar.style.width=`${signedIn?Math.min(100,(used/Math.max(1,limit))*100):0}%`;
    if(analysisAiHeaderUsageReset)analysisAiHeaderUsageReset.textContent=appState.usage.resetDate?`Resets ${new Date(appState.usage.resetDate).toLocaleDateString()}`:"Resets daily";
    if(aiConnPill){
      aiConnPill.textContent=!signedIn?"Signed out":pro?"Pro active":"Free active";
      aiConnPill.className=`status-pill ${signedIn?"status-pill-safe":"status-pill-warn"}`;
    }
    if(aiReqLeft)aiReqLeft.textContent=signedIn?String(remaining):"—";
    if(aiApiStatus){
      if(!supabaseConfigured)aiApiStatus.innerHTML=`<span class="warning">${escapeHTML(authSetupMessage())}</span>`;
      else if(!signedIn)aiApiStatus.innerHTML='<span class="warning">Sign in or create a free account before running AI analysis.</span>';
      else if(remaining<=0)aiApiStatus.innerHTML=`<span class="warning">Daily limit reached. ${pro?"Your 15 analyses reset tomorrow.":"Upgrade to Pro for 15 analyses per day."}</span>`;
      else aiApiStatus.innerHTML=`<span class="safe">✓ ${remaining} secure AI ${remaining===1?"analysis":"analyses"} remaining today.</span>`;
    }

    if(aiUpgradeBtn){aiUpgradeBtn.hidden=pro;aiUpgradeBtn.textContent=signedIn?"Upgrade to Pro":"View Pro Plan"}
    if(manageBillingBtn)manageBillingBtn.hidden=!pro;
    if(freePlanBtn){freePlanBtn.textContent=!signedIn?"Start Free":pro?"Included with Pro":"Current Plan";freePlanBtn.disabled=signedIn}
    if(proPlanBtn){proPlanBtn.textContent=pro?"Current Plan":"Upgrade to Pro";proPlanBtn.disabled=pro}
    if(businessPlanBtn){const isBusiness=effectivePlanName()==="business";businessPlanBtn.textContent=isBusiness?"Current Plan":"Upgrade to Business";businessPlanBtn.disabled=isBusiness}

    updatePlanBenefits();
    renderProHistory();
  }

  async function refreshAccountStatus(){
    if(!isSignedIn()){
      appState.isAdmin=false;
      appState.profile={plan:"guest",fullName:"",subscriptionStatus:"inactive",billingInterval:""};
      appState.usage={used:0,limit:0,remaining:0,resetDate:""};
      appState.history=[];
      appState.accountReady=true;
      updateAccountUI();
      return null;
    }
    try{
      const response=await fetch("/api/account-status?includeHistory=1",{headers:authHeaders({Accept:"application/json"}),cache:"no-store"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Account status is unavailable.");
      appState.isAdmin=Boolean(data.isAdmin);
      appState.profile={
        plan:data.profile?.plan||"free",
        fullName:data.profile?.fullName||appState.user?.user_metadata?.full_name||"",
        subscriptionStatus:data.profile?.subscriptionStatus||"inactive",
        billingInterval:data.profile?.billingInterval||"",
        isTeamMember:Boolean(data.profile?.isTeamMember),
        teamRole:data.profile?.teamRole||null
      };
      appState.usage={
        used:Number(data.usage?.used)||0,
        limit:Number(data.usage?.limit)||5,
        remaining:Number(data.usage?.remaining),
        resetDate:data.usage?.resetDate||""
      };
      appState.history=Array.isArray(data.history)?data.history:[];
    }catch(error){
      appState.isAdmin=false;
      appState.profile={plan:"free",fullName:appState.user?.user_metadata?.full_name||"",subscriptionStatus:"inactive",billingInterval:""};
      appState.usage={used:0,limit:5,remaining:5,resetDate:""};
      appState.history=[];
      console.warn(error);
    }
    appState.accountReady=true;
    updateAccountUI();
    return appState;
  }

  async function syncSession(session){
    appState.session=session||null;
    appState.user=session?.user||null;
    await refreshAccountStatus();
  }

  if(supabaseConfigured){
    appState.supabase=window.supabase.createClient(publicConfig.SUPABASE_URL,publicConfig.SUPABASE_ANON_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    appState.supabase.auth.getSession().then(({data})=>syncSession(data.session)).catch(()=>syncSession(null));
    /* Failsafe: if the session check never answers, the Sign In button still appears. */
    setTimeout(()=>{if(openAuth&&openAuth.hidden&&!isSignedIn()){openAuth.hidden=false;const skeleton=document.getElementById("authCheckingSkeleton");if(skeleton)skeleton.hidden=true}},5000);
    appState.supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY"){
        appState.recoveryMode=true;
        setAuthTab("login");
        if(loginBtn)loginBtn.textContent="Update Password";
        setAuthMessage("Enter your new password below, then choose Update Password.","success");
        authModal?.classList.add("show");
      }
      setTimeout(()=>syncSession(session),0);
    });
  }else{
    updateAccountUI();
  }

  const googleAuthBtn=document.getElementById("googleAuthBtn");
  /* Coming back from Google with the browser's Back button restores the page from cache with the button still disabled. */
  window.addEventListener("pageshow",event=>{if(event.persisted&&googleAuthBtn)googleAuthBtn.disabled=false});
  /* In-app browsers (Instagram, TikTok, LinkedIn, Facebook) often cannot complete Google sign-in. */
  if(googleAuthBtn&&/FBAN|FBAV|FB_IAB|Instagram|musical_ly|BytedanceWebview|TikTok|LinkedInApp|Snapchat/i.test(navigator.userAgent||"")){
    const note=document.createElement("p");
    note.className="auth-inapp-note";
    note.textContent="Inside the Instagram, TikTok or LinkedIn app, Google sign-in may not open. Use email sign-in, or open cybernetai.app in Safari or Chrome.";
    googleAuthBtn.insertAdjacentElement("afterend",note);
  }
  if(googleAuthBtn)googleAuthBtn.addEventListener("click",async()=>{
    if(!appState.supabase){setAuthMessage(authSetupMessage(),"error");return}
    googleAuthBtn.disabled=true;
    try{
      const{error}=await appState.supabase.auth.signInWithOAuth({
        provider:"google",
        options:{redirectTo:window.location.origin}
      });
      if(error){setAuthMessage(error.message||"Google sign-in is not available right now.","error");googleAuthBtn.disabled=false}
    }catch(error){
      setAuthMessage(error.message||"Google sign-in is not available right now.","error");
      googleAuthBtn.disabled=false;
    }
  });

  if(loginBtn)loginBtn.addEventListener("click",async()=>{
    if(!appState.supabase){setAuthMessage(authSetupMessage(),"error");return}
    const email=document.getElementById("loginEmail")?.value.trim()||"";
    const password=document.getElementById("loginPassword")?.value||"";
    loginBtn.disabled=true;
    try{
      if(appState.recoveryMode){
        if(password.length<8)throw new Error("Use at least 8 characters for the new password.");
        const {error}=await appState.supabase.auth.updateUser({password});
        if(error)throw error;
        appState.recoveryMode=false;
        loginBtn.textContent="Sign In";
        setAuthMessage("Password updated successfully.","success");
        setTimeout(()=>authModal?.classList.remove("show"),900);
      }else{
        if(!email||!password)throw new Error("Enter your email and password.");
        const {error}=await appState.supabase.auth.signInWithPassword({email,password});
        if(error)throw error;
        setAuthMessage("Signed in successfully.","success");
        authModal?.classList.remove("show");
        if(resendConfirmBtn)resendConfirmBtn.hidden=true;
      }
    }catch(error){
      setAuthMessage(friendlyAuthError(error,"login"),"error");
      if(resendConfirmBtn)resendConfirmBtn.hidden=!String(error.message||"").toLowerCase().includes("email not confirmed");
    }
    finally{loginBtn.disabled=false}
  });

  if(resendConfirmBtn)resendConfirmBtn.addEventListener("click",async()=>{
    if(!appState.supabase)return;
    const email=document.getElementById("loginEmail")?.value.trim()||"";
    if(!email){setAuthMessage("Enter your email above first, then resend the confirmation.","error");return}
    resendConfirmBtn.disabled=true;
    try{
      const{error}=await appState.supabase.auth.resend({type:"signup",email});
      if(error)throw error;
      setAuthMessage("Confirmation email resent. Check your inbox (and spam folder).","success");
    }catch(error){
      setAuthMessage(error.message||"Could not resend the confirmation email.","error");
    }finally{
      resendConfirmBtn.disabled=false;
    }
  });

  if(signupBtn)signupBtn.addEventListener("click",async()=>{
    if(!appState.supabase){setAuthMessage(authSetupMessage(),"error");return}
    const first=document.getElementById("signupFirstName")?.value.trim()||"";
    const last=document.getElementById("signupLastName")?.value.trim()||"";
    const fullName=`${first} ${last}`.trim();
    const email=document.getElementById("signupEmail")?.value.trim().toLowerCase()||"";
    const password=document.getElementById("signupPassword")?.value||"";
    signupBtn.disabled=true;
    try{
      if(!first||!last||!email||password.length<8)throw new Error("Enter your first name, last name, a valid email, and a password of at least 8 characters.");
      const {data,error}=await appState.supabase.auth.signUp({
        email,password,
        options:{
          data:{full_name:fullName,first_name:first,last_name:last},
          emailRedirectTo:`${window.location.origin}/`
        }
      });
      if(error)throw error;
      if(data.session){
        setAuthMessage("Your free account is ready.","success");
        authModal?.classList.remove("show");
      }else{
        setAuthMessage("Account request received. Check your email to confirm it, then return and sign in.","success");
      }
    }catch(error){setAuthMessage(friendlyAuthError(error,"signup"),"error")}
    finally{signupBtn.disabled=false}
  });

  if(forgotPasswordBtn)forgotPasswordBtn.addEventListener("click",async()=>{
    if(!appState.supabase){setAuthMessage(authSetupMessage(),"error");return}
    const email=document.getElementById("loginEmail")?.value.trim()||"";
    if(!email){setAuthMessage("Enter your email address first.","error");return}
    const {error}=await appState.supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/?reset=1`});
    setAuthMessage(error?error.message:"Password reset email sent.",error?"error":"success");
  });

  document.getElementById("loginPassword")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();loginBtn?.click()}});
  document.getElementById("signupPassword")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();signupBtn?.click()}});

  if(logoutBtn)logoutBtn.addEventListener("click",async()=>{
    await appState.supabase?.auth.signOut();
    switchPage("home");
  });

  function selectedSeatTier(){
    const active=document.querySelector("#businessSeatPicker .cn-seat-option.is-active");
    const tier=Number(active?.dataset.seatTier)||5;
    return [5,10,20].includes(tier)?tier:5;
  }

  async function startCheckout(cycle="monthly",plan="pro"){
    const btn=plan==="pro"?proPlanBtn:null;
    const businessBtns=plan==="business"?[businessPlanBtn].filter(Boolean):[];
    if(!isSignedIn()){
      try{sessionStorage.setItem("cybernet_pending_cycle",cycle);sessionStorage.setItem("cybernet_pending_plan",plan)}catch{}
      openAuthModal("signup");
      showPricingNotice(`Create a free account first, then choose ${plan==="business"?"Business":"Pro"} again.`);
      return;
    }
    if(plan==="business"&&effectivePlanName()==="business"){showPricingNotice("CyberNet AI Business is already active on this account.","success");return}
    if(plan==="pro"&&isPro()){showPricingNotice("CyberNet AI Pro is already active on this account.","success");return}
    showPricingNotice("Opening secure Stripe Checkout…");
    if(btn)btn.disabled=true;
    businessBtns.forEach(b=>b.disabled=true);
    try{
      const seatTier=plan==="business"?selectedSeatTier():undefined;
      const response=await fetch("/api/create-checkout-session",{
        method:"POST",
        headers:authHeaders({"Content-Type":"application/json"}),
        body:JSON.stringify(plan==="business"?{cycle,plan,seatTier}:{cycle,plan})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Stripe Checkout is not configured yet.");
      if(!data.url)throw new Error("Stripe did not return a Checkout URL.");
      // Lets the Manage Business panel open itself once the owner lands back
      // on the site after paying, so the first thing they see is their team.
      if(plan==="business"){try{sessionStorage.setItem("cybernet_pending_business_checkout","1")}catch{}}
      window.location.assign(data.url);
    }catch(error){
      showPricingNotice(error.message||"Checkout could not start.","error");
    }
    finally{if(btn)btn.disabled=false;businessBtns.forEach(b=>b.disabled=false)}
  }

  function effectivePlanName(){
    return appState.profile?.plan==="business"&&["active","trialing"].includes(appState.profile?.subscriptionStatus)?"business":isPro()?"pro":"free";
  }

  async function openBillingPortal(){
    if(!isSignedIn())return openAuthModal("login");
    try{
      const response=await fetch("/api/customer-portal",{method:"POST",headers:authHeaders({"Content-Type":"application/json"})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Billing portal unavailable.");
      window.location.assign(data.url);
    }catch(error){showPricingNotice(error.message||"Billing portal unavailable.","error");switchPage("pricing")}
  }

  if(freePlanBtn)freePlanBtn.addEventListener("click",()=>{if(!isSignedIn())openAuthModal("signup")});
  if(proPlanBtn)proPlanBtn.addEventListener("click",()=>startCheckout(proPlanBtn.dataset.cycle||"monthly","pro"));
  if(businessPlanBtn)businessPlanBtn.addEventListener("click",()=>startCheckout(businessPlanBtn.dataset.cycle||"monthly","business"));
  if(aiUpgradeBtn)aiUpgradeBtn.addEventListener("click",()=>switchPage("pricing"));
  if(manageBillingBtn)manageBillingBtn.addEventListener("click",openBillingPortal);

  const checkoutState=new URLSearchParams(window.location.search).get("checkout");
  if(checkoutState==="success"){
    setTimeout(()=>{switchPage("pricing");showPricingNotice("Payment received. Your Pro access is being confirmed securely.","success");refreshAccountStatus()},900);
    history.replaceState({},"",window.location.pathname);
  }else if(checkoutState==="cancelled"){
    setTimeout(()=>{switchPage("pricing");showPricingNotice("Checkout was cancelled. No payment was taken.")},500);
    history.replaceState({},"",window.location.pathname);
  }


  /* ─── CyberNet support and Netlify feedback survey ─── */
  const SUPPORT_EMAIL="cybernetai.26@gmail.com";
  const feedbackModal=document.getElementById("feedbackModal");
  const openFeedbackButtons=document.querySelectorAll(".open-feedback-btn");
  const closeFeedback=document.getElementById("closeFeedback");
  const feedbackForm=document.getElementById("feedbackForm");
  const feedbackMessage=document.getElementById("feedbackMessage");

  function setFeedbackMessage(message="",tone=""){
    if(!feedbackMessage)return;
    feedbackMessage.textContent=message;
    feedbackMessage.className=`auth-message feedback-message ${tone}`.trim();
  }

  function prefillFeedback(){
    const user=appState.user;
    const metadata=user?.user_metadata||{};
    const fullName=String(metadata.full_name||appState.profile.fullName||"").trim();
    const parts=fullName.split(/\s+/).filter(Boolean);
    const first=document.getElementById("feedbackFirstName");
    const last=document.getElementById("feedbackLastName");
    const email=document.getElementById("feedbackEmail");
    if(first&&!first.value)first.value=metadata.first_name||parts[0]||"";
    if(last&&!last.value)last.value=metadata.last_name||parts.slice(1).join(" ")||"";
    if(email&&!email.value)email.value=user?.email||"";
    const page=document.getElementById("feedbackPageUrl");
    const submitted=document.getElementById("feedbackSubmittedAt");
    const browser=document.getElementById("feedbackBrowser");
    if(page)page.value=window.location.href.slice(0,1000);
    if(submitted)submitted.value=new Date().toISOString();
    if(browser)browser.value=navigator.userAgent.slice(0,500);
  }

  function openFeedbackModal(){
    prefillFeedback();
    setFeedbackMessage("");
    feedbackModal?.classList.add("show");
    feedbackModal?.setAttribute("aria-hidden","false");
  }
  function closeFeedbackModal(){
    feedbackModal?.classList.remove("show");
    feedbackModal?.setAttribute("aria-hidden","true");
  }

  openFeedbackButtons.forEach(btn=>btn.addEventListener("click",openFeedbackModal));
  closeFeedback?.addEventListener("click",closeFeedbackModal);
  feedbackModal?.addEventListener("click",event=>{if(event.target===feedbackModal)closeFeedbackModal()});

  /* ─── Home page how-to videos: full-screen player with custom controls ─── */
  const howtoVideoModal=document.getElementById("howtoVideoModal");
  const closeHowtoVideo=document.getElementById("closeHowtoVideo");
  const closeHowtoVideoInline=document.getElementById("closeHowtoVideoInline");
  const howtoVideoTitle=document.getElementById("howtoVideoTitle");
  const howtoVideoPlayer=document.getElementById("howtoVideoPlayer");
  const howtoVideoCards=document.querySelectorAll(".hero-video-btn[data-video]");
  const howtoVideoTabs=document.querySelectorAll(".video-modal-tab[data-video]");
  const heroLearnFeaturesBtn=document.getElementById("heroLearnFeaturesBtn");
  const videoPlayerControls=document.getElementById("videoPlayerControls");
  const videoPlayPauseBtn=document.getElementById("videoPlayPauseBtn");
  const videoSpeedBtn=document.getElementById("videoSpeedBtn");

  // Titles and tab keys only. The content itself lives in cybernet-howto.js as
  // a stepped walkthrough; the GIFs these used to point at have been removed.
  // The src/type branches below are kept for any future real video.
  const HOWTO_VIDEOS={
    protect:{title:"How To Use Quick Scan"},
    cybernetai:{title:"How To Use Analysis AI"},
    recovery:{title:"How To Use Recovery Mode"}
  };

  function wireVideoControls(videoEl){
    if(!videoEl||!videoPlayerControls)return;
    videoPlayerControls.hidden=false;
    videoEl.playbackRate=1;
    if(videoSpeedBtn)videoSpeedBtn.textContent="1x";
    const iconPlay=videoPlayPauseBtn?.querySelector(".icon-play");
    const iconPause=videoPlayPauseBtn?.querySelector(".icon-pause");
    function syncPlayIcon(){
      const playing=!videoEl.paused&&!videoEl.ended;
      if(iconPlay)iconPlay.hidden=playing;
      if(iconPause)iconPause.hidden=!playing;
    }
    videoEl.addEventListener("play",syncPlayIcon);
    videoEl.addEventListener("pause",syncPlayIcon);
    if(videoPlayPauseBtn)videoPlayPauseBtn.onclick=()=>{videoEl.paused?videoEl.play():videoEl.pause()};
    if(videoSpeedBtn)videoSpeedBtn.onclick=()=>{
      videoEl.playbackRate=videoEl.playbackRate===1?2:1;
      videoSpeedBtn.textContent=videoEl.playbackRate===1?"1x":"2x";
    };
    syncPlayIcon();
  }

  // Arrow-key handler for the walkthrough, registered only while the modal is
  // open so it cannot swallow arrow keys anywhere else on the page.
  let howtoKeyHandler=null;

  function detachHowtoKeys(){
    if(howtoKeyHandler){
      document.removeEventListener("keydown",howtoKeyHandler);
      howtoKeyHandler=null;
    }
  }

  function openHowtoVideo(key){
    const activeKey=HOWTO_VIDEOS[key]?key:"protect";
    const data=HOWTO_VIDEOS[activeKey];
    if(howtoVideoTitle)howtoVideoTitle.textContent=data.title;
    detachHowtoKeys();
    if(howtoVideoPlayer){
      // Stepped walkthrough replaces the old GIFs. The playback controls belong
      // to a <video> and mean nothing here, so they stay hidden.
      if(window.CyberNetHowto?.has(activeKey)){
        if(videoPlayerControls)videoPlayerControls.hidden=true;
        howtoKeyHandler=window.CyberNetHowto.render(howtoVideoPlayer,activeKey,title=>{
          if(howtoVideoTitle&&title)howtoVideoTitle.textContent=title;
        });
        if(howtoKeyHandler)document.addEventListener("keydown",howtoKeyHandler);
      }else if(data.src&&data.type==="gif"){
        if(videoPlayerControls)videoPlayerControls.hidden=true;
        howtoVideoPlayer.innerHTML=`<img src="${data.src}" alt="${data.title}" class="howto-gif" />`;
      }else if(data.src){
        howtoVideoPlayer.innerHTML=`<video src="${data.src}" autoplay playsinline></video>`;
        wireVideoControls(howtoVideoPlayer.querySelector("video"));
      }else{
        if(videoPlayerControls)videoPlayerControls.hidden=true;
        howtoVideoPlayer.innerHTML=`
          <div class="video-modal-placeholder">
            <svg viewBox="0 0 24 24" fill="none" width="46" height="46" aria-hidden="true"><circle cx="12" cy="12" r="11" stroke="currentColor" stroke-width="1.3"/><path d="M10 8.5l6 3.5-6 3.5v-7Z" fill="currentColor"/></svg>
            <p>Video coming soon.</p>
          </div>`;
      }
    }
    howtoVideoTabs.forEach(tab=>tab.classList.toggle("active",tab.dataset.video===activeKey));
    howtoVideoModal?.classList.add("show");
    howtoVideoModal?.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  }

  function closeHowtoVideoModal(){
    howtoVideoModal?.classList.remove("show");
    howtoVideoModal?.setAttribute("aria-hidden","true");
    detachHowtoKeys();
    if(howtoVideoPlayer)howtoVideoPlayer.innerHTML="";
    if(videoPlayerControls)videoPlayerControls.hidden=true;
    document.body.style.overflow="";
  }

  howtoVideoCards.forEach(card=>{
    card.addEventListener("click",()=>openHowtoVideo(card.dataset.video));
  });
  howtoVideoTabs.forEach(tab=>{
    tab.addEventListener("click",()=>openHowtoVideo(tab.dataset.video));
  });
  heroLearnFeaturesBtn?.addEventListener("click",()=>openHowtoVideo("protect"));
  closeHowtoVideo?.addEventListener("click",closeHowtoVideoModal);
  closeHowtoVideoInline?.addEventListener("click",closeHowtoVideoModal);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&howtoVideoModal?.classList.contains("show"))closeHowtoVideoModal()});

  feedbackForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    prefillFeedback();
    const formData=new FormData(feedbackForm);
    if(String(formData.get("bot-field")||"").trim()){
      setFeedbackMessage("Thank you. Your report was received.","success");
      return;
    }
    const required=["first_name","last_name","email","feedback_type","message"];
    if(required.some(name=>!String(formData.get(name)||"").trim())){
      setFeedbackMessage("Complete every required field before sending.","error");
      return;
    }
    const button=document.getElementById("feedbackSubmitBtn");
    if(button)button.disabled=true;
    setFeedbackMessage("Sending your report securely…");
    try{
      const response=await fetch("/",{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams(formData).toString()
      });
      if(!response.ok)throw new Error(`Submission failed with ${response.status}`);
      feedbackForm.reset();
      prefillFeedback();
      setFeedbackMessage(`Thank you. Your report was submitted to CyberNet support at ${SUPPORT_EMAIL}.`,"success");
    }catch(error){
      console.error("CyberNet feedback submission failed",error);
      setFeedbackMessage(`The survey could not be sent. Email ${SUPPORT_EMAIL} directly.`,"error");
    }finally{
      if(button)button.disabled=false;
    }
  });

  window.CyberNetAccount={appState,refreshAccountStatus,startCheckout,isPro,isSignedIn,openAuthModal,authHeaders,updateAccountUI,openFeedbackModal};

  /* ─── Stable counters (fixed-width + requestAnimationFrame) ─── */
  const reduceCounterMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function animateNumberElement(el,target,{decimal=false,suffix="",duration=850}={}){
    if(!el||el.dataset.animated==="true")return;
    el.dataset.animated="true";
    if(reduceCounterMotion){
      el.textContent=(decimal?Number(target).toFixed(1):Math.round(Number(target)).toLocaleString())+suffix;
      return;
    }
    const startTime=performance.now();
    const numericTarget=Number(target)||0;
    function frame(now){
      const raw=Math.min(1,(now-startTime)/duration);
      const eased=1-Math.pow(1-raw,3);
      const value=numericTarget*eased;
      el.textContent=(decimal?value.toFixed(1):Math.round(value).toLocaleString())+suffix;
      if(raw<1)requestAnimationFrame(frame);
      else el.textContent=(decimal?numericTarget.toFixed(1):Math.round(numericTarget).toLocaleString())+suffix;
    }
    requestAnimationFrame(frame);
  }

  function animateWowCounters(){
    document.querySelectorAll(".wow-stat-number").forEach(el=>animateNumberElement(el,parseInt(el.dataset.target||"0",10),{duration:900}));
  }

  /* ─── Home hero live activity counters (real usage data) ─── */
  function animateToValue(el,target){
    if(reduceCounterMotion){el.textContent=target.toLocaleString();return}
    const startTime=performance.now();
    const duration=1600;
    function frame(now){
      const raw=Math.min(1,(now-startTime)/duration);
      const eased=1-Math.pow(1-raw,3);
      el.textContent=Math.round(target*eased).toLocaleString();
      if(raw<1)requestAnimationFrame(frame);
      else el.textContent=target.toLocaleString();
    }
    requestAnimationFrame(frame);
  }
  async function initLiveHeroCounters(){
    const els=document.querySelectorAll(".hero-live-stat strong[id]");
    const noteEl=document.getElementById("heroStatsNote");
    if(!els.length)return;
    try{
      const res=await fetch("/api/public-stats");
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.live)throw new Error("unavailable");
      const values={liveScansCount:data.totalScans,liveThreatsCount:data.threatsFound,liveRecoveriesCount:data.recoveryCases};
      els.forEach(el=>{
        const target=Number(values[el.id])||0;
        animateToValue(el,target);
      });
      if(noteEl)noteEl.innerHTML=`Real usage counts from CyberNet AI's own database, updated continuously.`;
    }catch{
      els.forEach(el=>{el.textContent="—"});
      if(noteEl)noteEl.innerHTML=`<strong>Stats unavailable</strong> — could not reach CyberNet AI's usage data right now.`;
    }
  }

  function animateHeroStats(scopeSelector){
    const scope=scopeSelector?document.querySelector(scopeSelector):document;
    if(!scope)return;
    scope.querySelectorAll(".hero-stats-row strong").forEach(el=>{
      const raw=String(el.dataset.count||"0");
      animateNumberElement(el,parseFloat(raw),{decimal:raw.includes("."),suffix:el.dataset.suffix||"",duration:900});
    });
  }

  setTimeout(()=>{
    animateWowCounters();
    animateHeroStats("#home");
    initLiveHeroCounters();
  },650);

  /* ─── Ticker duplication for seamless loop ─── */
  const tickerTrack=document.querySelector(".ticker-track");
  if(tickerTrack){const clone=tickerTrack.innerHTML;tickerTrack.innerHTML=clone+clone}

  /* ─── CyberNet hybrid risk engine ─── */
  const ANALYSIS_ENDPOINT="/api/analyze";
  const serviceState={online:null,aiEnabled:false,model:"Server-selected",reputation:false,lastChecked:0};

  function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,Number(value)||0))}
  function unique(items){return [...new Set((items||[]).filter(Boolean).map(String))]}
  function escapeHTML(value){return String(value??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]))}
  function containsAny(text,terms){return terms.some(term=>text.includes(term))}
  function countMatches(text,regex){return (text.match(regex)||[]).length}
  /* The detection rules live in cybernet-engine.js (shared with the server and
     the tests). These names stay so the page code reads as before. */
  if(!window.CyberNetEngine)console.error("CyberNet AI: cybernet-engine.js did not load; scans cannot run.");
  function normalizeText(...args){return window.CyberNetEngine.normalizeText(...args)}
  function deobfuscate(...args){return window.CyberNetEngine.deobfuscate(...args)}
  function hasTerm(...args){return window.CyberNetEngine.hasTerm(...args)}
  function createState(...args){return window.CyberNetEngine.createState(...args)}
  function addSignal(...args){return window.CyberNetEngine.addSignal(...args)}
  function nonlinearScore(...args){return window.CyberNetEngine.nonlinearScore(...args)}
  const KNOWN_BRANDS=window.CyberNetEngine.KNOWN_BRANDS;
  const SHORTENERS=window.CyberNetEngine.SHORTENERS;
  const LURE_WORDS=window.CyberNetEngine.LURE_WORDS;
  function isOfficialDomain(...args){return window.CyberNetEngine.isOfficialDomain(...args)}
  function brandMismatch(...args){return window.CyberNetEngine.brandMismatch(...args)}
  function lureWordsIn(...args){return window.CyberNetEngine.lureWordsIn(...args)}
  function collectLinksInText(...args){return window.CyberNetEngine.collectLinksInText(...args)}
  function analyzeQrPayload(...args){return window.CyberNetEngine.analyzeQr(...args)}
  function analyzeTextRules(...args){return window.CyberNetEngine.analyzeText(...args)}
  function analyzeTextRulesCore(...args){return window.CyberNetEngine.analyzeTextRulesCore(...args)}
  function levenshtein(...args){return window.CyberNetEngine.levenshtein(...args)}
  function hostnameEntropy(...args){return window.CyberNetEngine.hostnameEntropy(...args)}
  function isPrivateHost(...args){return window.CyberNetEngine.isPrivateHost(...args)}
  function registrableDomain(...args){return window.CyberNetEngine.registrableDomain(...args)}
  function looksLikeWebAddress(...args){return window.CyberNetEngine.looksLikeWebAddress(...args)}
  function analyzeLinkRules(...args){return window.CyberNetEngine.analyzeLink(...args)}
  function analyzeImageRules(...args){return window.CyberNetEngine.analyzeImage(...args)}
  function detectChatContentType(...args){return window.CyberNetEngine.detectChatContentType(...args)}

  function getDanger(score,meta={}){
    /*
      CyberNet AI always commits to a yes-or-no answer rather than showing a
      "Not Sure" result, and that answer follows the score alone.

      An earlier version also forced any "uncertain" read to UNSAFE. That was
      intended as fail-safe, but it fired on ordinary content the engine simply
      could not verify: a legitimate Google Docs link scored 28 and was still
      reported UNSAFE. A warning that shows up on safe things teaches people to
      ignore the warning, which costs more safety than it buys.

      Where the engine cannot see the content at all — a screenshot with no QR
      code, which the local image path cannot read — the honest answer is not a
      verdict in either direction. That case is handled by the deep-scan prompt
      instead of being guessed at here.

      Detection scoring, weights and thresholds are unchanged.
    */
    if(score>=32)return{label:"Scam",headline:"SCAM",css:"danger"};
    // A bare link from a domain nobody has vouched for is not evidence of
    // safety: the same link inside its message may well read as a scam. Say
    // that plainly instead of a "NOT A SCAM" the message would contradict.
    if(meta&&meta.kind==="link"&&!meta.officialBrand)return{label:"Can't Confirm",headline:"CAN'T CONFIRM",css:"uncertain"};
    return{label:"Not A Scam",headline:"NOT A SCAM",css:"safe"};
  }

  function showDeepScanPrompt(resultBox,advice){
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add("result-has-uncertain");
    resultBox.innerHTML=`<div class="scan-report">
      <div class="verdict-headline verdict-headline-uncertain">
        <span class="verdict-headline-icon">↗</span>
        <span class="verdict-headline-text">SEND THIS TO ANALYSIS AI</span>
      </div>
      <div class="verdict-note"><span>ⓘ</span><p>Quick Scan checks an image's file details and reads any QR code inside it. It cannot read the words, logos, or layout in a screenshot, so it has nothing to judge this picture on — calling it safe or unsafe here would be a guess either way.</p></div>
      <div class="report-body">
        <div class="report-col"><div class="report-col-title"><span class="col-safe">→</span> Get a real answer</div><ul class="report-list safe-list"><li><strong>Open Analysis AI and drop this same image in.</strong> It reads the text and logos in the picture and gives a straight verdict.</li><li>If the image contains a QR code, Quick Scan will decode it and judge where it leads — this one had none.</li></ul></div>
        <div class="report-col"><div class="report-col-title"><span class="col-warn">⚠</span> Until then</div><ul class="report-list">${unique(advice).slice(0,4).map(a=>`<li>${escapeHTML(a)}</li>`).join("")}</ul></div>
      </div>
    </div>`;
  }

  function renderPlainSummary(plain){
    return `<div class="plain-summary">
      <p class="plain-lead">${escapeHTML(plain.lead)}</p>
      <ul class="plain-points">${plain.points.map(point=>`<li>${escapeHTML(point)}</li>`).join("")}</ul>
      <p class="plain-action"><strong>What to do:</strong> ${escapeHTML(plain.action)}</p>
    </div>`;
  }
  const DETAILS_TOGGLE=`<button type="button" class="details-toggle" aria-expanded="false">Show more details</button>`;

  function showReport(resultBox,score,scamType,reasons,advice,meta={}){
    // The local engine saw nothing it could judge, so say that plainly and
    // point at the tool that can, rather than deriving a verdict from a score
    // that was never based on the image's actual content.
    if(meta.needsDeepScan){showDeepScanPrompt(resultBox,advice);return}
    const uncertain=Boolean(meta.uncertain||meta.verdict==="inconclusive");
    const confidence=clamp(meta.confidence??(uncertain?45:75));
    const danger=getDanger(score,meta);
    const isSafe=danger.css==="safe";
    const isUnverified=danger.css==="uncertain";
    // What the person reads first: the verdict, why in plain words, and what to
    // do. The evidence list, score and sources stay under "Show more details".
    const plain=window.CyberNetEngine.plainSummary({...meta,score},{fallbackText:meta.summary||""});
    const confidenceText=confidence>=82?"High confidence":confidence>=58?"Moderate confidence":"Limited confidence";
    const verdictNote=meta.note||(uncertain
      ?"CyberNet AI could not confirm this is safe, so treat it as unsafe. Don’t click its links, share details or send money because of it."
      :isUnverified
      ?"CyberNet AI found no scam tricks in this address, but it also cannot prove the site is real. Be careful with anything you type there."
      :isSafe
      ?"CyberNet AI didn't find any warning signs, but no scanner can promise something is 100% safe. Stay alert."
      :"CyberNet AI found signs that this could be a scam. Read the details below before you do anything.");
    const sourceLabels=unique(meta.sources||[]);
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add(`result-has-${danger.css}`);
    resultBox.innerHTML=`<div class="scan-report">
      <div class="verdict-headline verdict-headline-${danger.css}">
        <span class="verdict-headline-icon">${danger.css==="uncertain"?"?":isSafe?"✓":"✕"}</span>
        <span class="verdict-headline-text">${danger.headline}</span>
      </div>
      ${renderPlainSummary(plain)}
      ${meta.previewHtml||""}
      ${DETAILS_TOGGLE}
      <div class="report-details" hidden>
        <div class="report-top-row">
          <span class="scam-type-tag">${escapeHTML(scamType)}</span>
          <span class="score-display">${clamp(Math.round(score))}<span>/100</span></span>
        </div>
        ${sourceLabels.length?`<div class="analysis-sources">${sourceLabels.map(x=>`<span>${escapeHTML(x)}</span>`).join("")}<span>${confidenceText}</span></div>`:""}
        <div class="verdict-note"><span>ⓘ</span><p>${escapeHTML(verdictNote)}</p></div>
        ${unique(meta.counterEvidence||[]).length?`<div class="counter-evidence"><strong>Reasons this might be okay</strong><ul>${unique(meta.counterEvidence||[]).slice(0,5).map(item=>`<li>${escapeHTML(item)}</li>`).join("")}</ul></div>`:""}
        <div class="report-body">
          <div class="report-col"><div class="report-col-title"><span class="col-warn">⚠</span> ${(isSafe||isUnverified)?"What the scan checked":"Technical warning signs"}</div><ul class="report-list">${unique(reasons).slice(0,10).map(r=>`<li>${escapeHTML(r)}</li>`).join("")||"<li>Nothing unusual was found.</li>"}</ul></div>
          <div class="report-col"><div class="report-col-title"><span class="col-safe">→</span> Safety steps</div><ul class="report-list safe-list">${unique(advice).slice(0,8).map(a=>`<li>${escapeHTML(a)}</li>`).join("")}</ul></div>
        </div>
      </div>
    </div>`;
    hydratePreviews(resultBox);
  }

  function runScan(btn,resultBox,cb,delay=420){
    const orig=btn.innerHTML;btn.innerHTML=`<span class="btn-spinner"></span> analyzing…`;btn.disabled=true;
    resultBox.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">analyzing</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;
    setTimeout(async()=>{try{await cb()}finally{btn.innerHTML=orig;btn.disabled=false}},delay);
  }

  /* ─── Known brands, lure words, link facts and the preview cards ─── */
  function linkFacts(rawUrl,linkResult){
    const original=String(rawUrl||"").trim();
    const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(original)?original:`https://${original}`;
    let url;try{url=new URL(candidate)}catch{return{href:original,host:"",registered:"",path:"",badges:[{cls:"bad",text:"Not a valid web address"}],mismatch:null,score:linkResult?.score}}
    const host=url.hostname.toLowerCase().replace(/^www\./,"");
    const registered=registrableDomain(host);
    const pathQuery=(url.pathname+url.search).toLowerCase();
    const badges=[];
    const mismatch=brandMismatch(host,registered,pathQuery);
    if(mismatch)badges.push({cls:"bad",text:`Looks like ${mismatch.brand} but the real site is ${mismatch.official}`});
    if(isOfficialDomain(registered))badges.push({cls:"good",text:"This is the brand's official domain"});
    if(url.protocol==="http:")badges.push({cls:"warn",text:"Not encrypted (http)"});
    if(SHORTENERS.has(registered))badges.push({cls:"warn",text:"Shortened link — the real destination is hidden"});
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host))badges.push({cls:"bad",text:"Raw IP address instead of a website name"});
    const lures=isOfficialDomain(registered)?[]:lureWordsIn(registered);
    if(lures.length)badges.push({cls:"warn",text:`Uses “${lures.slice(0,2).join("”, “")}” in the domain name to look official`});
    if(!isOfficialDomain(registered)&&/login|signin|verify|password|account|wallet|unlock/.test(pathQuery))badges.push({cls:"warn",text:"The page asks for login or account details"});
    return{href:url.href,host,registered,path:url.pathname+url.search,badges,mismatch,score:linkResult?.score};
  }
  function renderLinkPreview(rawUrl,linkResult,options={}){
    const f=linkFacts(rawUrl,linkResult);
    const score=typeof f.score==="number"?clamp(Math.round(f.score)):null;
    const label=score===null?null:score>=60?{cls:"bad",text:"High risk"}:score>=32?{cls:"warn",text:"Suspicious"}:{cls:"good",text:"No red flags in the address"};
    return `<div class="dest-preview">
      <strong>${escapeHTML(options.heading||"🔗 Where this link goes")}</strong>
      <code class="dest-url">${escapeHTML(f.href)}</code>
      <div class="dest-facts">
        ${f.registered?`<span class="dest-domain">Website: <b>${escapeHTML(f.registered)}</b></span>`:""}
        ${label?`<span class="dest-badge dest-badge-${label.cls}">${label.text} · ${score}/100</span>`:""}
        ${f.badges.map(b=>`<span class="dest-badge dest-badge-${b.cls}">${escapeHTML(b.text)}</span>`).join("")}
      </div>
      ${options.screenshot===false||!/^https?:\/\//i.test(f.href)?"":`<div class="dest-shot" data-shot-url="${escapeHTML(f.href)}"></div>`}
    </div>`;
  }
  const QR_KIND_LABELS={url:"Web link",wifi:"Wi-Fi network",contact:"Contact card",action:"Phone / email / SMS action",payment:"Payment request",text:"Plain text"};
  function renderQrPreview(qrData,kind,qrResult){
    const links=kind!=="url"&&qrResult?.links?.length?renderLinksFound(qrResult.links):"";
    return `<div class="qr-preview">
      <strong>📷 What this QR code contains</strong>
      <span class="qr-kind">${escapeHTML(QR_KIND_LABELS[kind]||"Content")}</span>
      <code class="qr-raw">${escapeHTML(String(qrData||"").slice(0,600))}</code>
      ${kind==="url"?renderLinkPreview(qrData,qrResult,{heading:"🔗 Where this QR code takes you"}):links}
    </div>`;
  }
  function renderLinksFound(links){
    const list=(links||[]).filter(l=>l&&l.url).slice(0,4).sort((a,b)=>(b.result?.score||0)-(a.result?.score||0));
    if(!list.length)return "";
    return `<div class="links-found">
      <strong>🔗 ${list.length===1?"Link found in this message":`${list.length} links found in this message`}</strong>
      ${list.map((l,i)=>renderLinkPreview(l.url,l.result,{heading:list.length===1?"Where it goes":`Link ${i+1}`,screenshot:i===0})).join("")}
    </div>`;
  }
  // Fills every screenshot slot in a rendered report: a live picture of the
  // page for paid plans, a one-line upgrade note otherwise.
  function hydratePreviews(root){
    if(!root)return;
    root.querySelectorAll(".dest-shot[data-shot-url]").forEach(slot=>{
      const url=slot.getAttribute("data-shot-url");slot.removeAttribute("data-shot-url");
      if(!isSignedIn()){slot.remove();return}
      if(!isPro()){slot.innerHTML=`<p class="dest-shot-note">Upgrade to Pro to see a live picture of this page before you decide.</p>`;return}
      slot.innerHTML=`<div class="screenshot-loading"><span class="btn-spinner"></span> Loading a picture of this page…</div>`;
      loadScreenshotPreview(slot,url);
    });
  }




  function normalizeServerResult(data){
    const r=data?.analysis||data;
    if(!r||typeof r!=="object")return null;
    const verdict=String(r.verdict||"inconclusive").toLowerCase();
    return{summary:String(r.summary||""),score:clamp(r.score),confidence:clamp(r.confidence),scamType:r.threatType||r.scamType||"Deep security analysis",reasons:unique([...(r.evidence||r.reasons||[]),...(r.limitations||[])]),counterEvidence:unique(r.counterEvidence||[]),advice:unique(r.actions||r.advice||[]),uncertain:verdict==="inconclusive",verdict,sources:unique([...(data?.aiUsed?["Secure AI analysis"]:[]),...(data?.reputation?.checked?["Live URL reputation"]:[])]),note:r.summary||r.note||"Secure deep analysis completed.",reputation:data?.reputation||null,virusTotal:data?.virusTotal||null,aiUsed:Boolean(data?.aiUsed),isFollowUp:r.isFollowUp===true,teamLogId:Number(data?.teamLogId)||null};
  }
  function mergeAnalysis(local,deep){
    if(!deep)return local;
    const reputationHit=Boolean(deep.reputation?.listed);
    const localHigh=local.score>=60&&local.confidence>=65;
    const disagreement=(local.verdict==="low_risk"&&["suspicious","malicious"].includes(deep.verdict))||(["suspicious","malicious"].includes(local.verdict)&&deep.verdict==="low_risk");
    let score=Math.round(local.score*.34+deep.score*.66);
    score=Math.max(deep.score,score);
    if(localHigh)score=Math.max(score,Math.max(55,local.score-8));
    if(reputationHit)score=Math.max(score,98);
    // The label follows the score, so the score can never sit below the line
    // the model's own verdict implies: "suspicious" is at least a medium read
    // and "malicious" at least a high one.
    if(deep.verdict==="malicious")score=Math.max(score,60);else if(deep.verdict==="suspicious")score=Math.max(score,32);
    const agreement=local.verdict===deep.verdict&&!local.uncertain&&!deep.uncertain;
    const confidence=clamp(Math.max(deep.confidence,Math.round((local.confidence+deep.confidence)/2))+(agreement?5:0)+(reputationHit?6:0)-(disagreement?18:0));
    const uncertain=reputationHit?false:(disagreement||deep.verdict==="inconclusive"||(deep.uncertain&&local.uncertain));
    return{kind:local.kind,officialBrand:local.officialBrand,signals:local.signals,summary:deep.summary||"",score,confidence,scamType:reputationHit?"Known unsafe URL":(deep.scamType||local.scamType),reasons:unique([...(deep.reasons||[]),...(local.reasons||[])]),counterEvidence:unique([...(deep.counterEvidence||[]),...(local.counterEvidence||[])]),advice:unique([...(deep.advice||[]),...(local.advice||[])]),uncertain,verdict:reputationHit?"malicious":uncertain?"inconclusive":deep.verdict,sources:unique([...(local.sources||[]),...(deep.sources||[])]),note:reputationHit?"The live reputation service matched this URL to a known unsafe resource.":disagreement?"CyberNet AI's local and deep-analysis layers reached different conclusions, so this can't be confirmed safe — treat it as unsafe until you've verified it independently.":deep.note||local.note,reputation:deep.reputation,virusTotal:deep.virusTotal||null,aiUsed:Boolean(deep.aiUsed)};
  }
  async function requestDeepAnalysis(type,content,localResult,imageData="",history=[]){
    if(!isSignedIn()){
      openAuthModal("login");
      const error=new Error("Sign in or create a free account before running AI analysis.");
      error.code="sign_in_required";
      throw error;
    }
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),36000);
    try{
      const res=await fetch(ANALYSIS_ENDPOINT,{
        method:"POST",
        headers:authHeaders({"Content-Type":"application/json"}),
        body:JSON.stringify({type,content,imageData,localResult,history}),
        signal:controller.signal
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok){
        if(data.usage){appState.usage=data.usage;updateAccountUI()}
        const error=new Error(data.error||`Analysis service returned ${res.status}`);
        error.code=data.code||"analysis_failed";
        throw error;
      }
      serviceState.online=true;
      serviceState.lastChecked=Date.now();
      if(data.usage){appState.usage=data.usage;updateAccountUI()}
      if(Array.isArray(data.history))appState.history=data.history;
      return normalizeServerResult(data);
    }finally{clearTimeout(timer)}
  }
  /* ─── CyberNet Text ─── */
  const cyberTextInput=document.getElementById("cyberTextInput"),cyberTextResult=document.getElementById("cyberTextResult"),cyberTextBtn=document.getElementById("cyberTextBtn");
  const cyberTextCount=document.getElementById("cyberTextCount");
  if(cyberTextInput&&cyberTextCount)cyberTextInput.addEventListener("input",()=>{cyberTextCount.textContent=cyberTextInput.value.length});

  function animateScanRing(ringEl,labelEl,statusEl,duration,onDone){
    if(!ringEl||!labelEl)return onDone?.();
    const circumference=276;if(statusEl)statusEl.textContent="Scanning…";ringEl.style.strokeDashoffset=circumference;
    requestAnimationFrame(()=>{ringEl.style.strokeDashoffset=0});
    const started=performance.now();
    function tick(now){const pct=Math.min(100,((now-started)/duration)*100);labelEl.textContent=Math.round(pct)+"%";if(pct<100)requestAnimationFrame(tick);else{if(statusEl)statusEl.textContent="Deep analysis…";onDone?.()}}
    requestAnimationFrame(tick);
  }
  function prependScan(listId,mainText,result){
    const list=document.getElementById(listId);if(!list)return;
    const meta=riskMeta(result);const li=document.createElement("li");
    li.innerHTML=`<span class="scan-list-main">${escapeHTML(mainText)}</span><span class="risk-tag ${meta.cls}">${meta.label}</span>`;
    list.insertBefore(li,list.firstChild);if(list.children.length>4)list.removeChild(list.lastChild);
  }
  function riskMeta(result){
    // Follows the score, matching the verdict shown in the report itself (see
    // getDanger). Tagging every unconfirmed read "High Risk" put that label on
    // ordinary safe items and drained it of meaning.
    if(result.score>=60)return{label:"High Risk",cls:"risk-tag-danger"};
    if(result.score>=32)return{label:"Medium Risk",cls:"risk-tag-warning"};
    if(result.kind==="link"&&!result.officialBrand)return{label:"Can't Confirm",cls:"risk-tag-warning"};
    return{label:"Low Visible Risk",cls:"risk-tag-safe"};
  }

  async function checkQuickScanQuota(){
    try{
      const res=await fetch("/api/quickscan-usage",{method:"POST",headers:authHeaders()});
      const data=await res.json().catch(()=>({}));
      if(!res.ok){
        appState.quickScanUsage={used:Number(data.used)||0,limit:Number(data.limit)||5,plan:data.plan||"free"};
        updateAccountUI();
        return{allowed:false,message:data.error||"Daily Quick Scan limit reached. Upgrade to Pro for unlimited scans."};
      }
      appState.quickScanUsage={used:Number(data.used)||0,limit:Number(data.limit)||5,plan:data.plan||"free"};
      updateAccountUI();
      return{allowed:true};
    }catch{
      return{allowed:false,message:"Could not check your Quick Scan usage right now. Please try again."};
    }
  }

  if(cyberTextBtn&&cyberTextInput&&cyberTextResult)cyberTextBtn.addEventListener("click",async()=>{
    if(!isSignedIn()){openAuthModal("signup");return}
    const text=cyberTextInput.value.trim();if(!text){cyberTextResult.innerHTML=`<span class="warning">Paste a suspicious message first.</span>`;return}
    cyberTextBtn.disabled=true;
    const quota=await checkQuickScanQuota();
    if(!quota.allowed){
      cyberTextResult.innerHTML=`<span class="warning">${escapeHTML(quota.message)}</span>`;
      cyberTextBtn.disabled=false;
      return;
    }
    const ring=document.getElementById("textScanRing"),label=document.getElementById("textScanLabel"),status=document.getElementById("textScanStatus");
    const duration=window.matchMedia?.("(pointer: coarse)").matches?650:900;
    const isBareLink=detectChatContentType(text)==="link";
    animateScanRing(ring,label,status,duration,async()=>{
      const result=isBareLink?analyzeLinkRules(text):analyzeTextRules(text);
      const note=isBareLink
        ?"This looked like a link rather than a message, so CyberNet AI analyzed it with the link engine for a more accurate result. Use Link Detection directly next time for the same result."
        :"Local protection scan complete. Use the CyberNet AI page for account-based AI analysis.";
      showReport(cyberTextResult,result.score,result.scamType,result.reasons,result.advice,{...result,note,previewHtml:isBareLink?renderLinkPreview(text,result):renderLinksFound(result.links||[])});
      prependScan("textScanList",`“${text.slice(0,42)}${text.length>42?"…":""}”`,result);
      reportTeamActivity({kind:"quick_scan",scanType:isBareLink?"link":"text",content:text,result:quickScanLogResult(result)});
      if(status)status.textContent="Local scan complete";
      cyberTextBtn.disabled=false;
    });
  });

  /* ─── CyberNet Link ─── */
  const cyberLinkInput=document.getElementById("cyberLinkInput"),cyberLinkResult=document.getElementById("cyberLinkResult"),cyberLinkBtn=document.getElementById("cyberLinkBtn");
  if(cyberLinkBtn&&cyberLinkInput&&cyberLinkResult)cyberLinkBtn.addEventListener("click",async()=>{
    if(!isSignedIn()){openAuthModal("signup");return}
    const link=cyberLinkInput.value.trim();if(!link){cyberLinkResult.innerHTML=`<span class="warning">Paste a suspicious link first.</span>`;return}
    // Plain sentences used to be parsed as an "encoded URL" and scored, which
    // read as a verdict on nothing. Only web addresses get a report.
    if(!looksLikeWebAddress(link)){cyberLinkResult.innerHTML=`<span class="warning">That doesn't look like a web address. Paste the full link, for example https://example.com/page.</span>`;return}
    cyberLinkBtn.disabled=true;
    const quota=await checkQuickScanQuota();
    if(!quota.allowed){
      cyberLinkResult.innerHTML=`<span class="warning">${escapeHTML(quota.message)}</span>`;
      cyberLinkBtn.disabled=false;
      return;
    }
    cyberLinkBtn.disabled=false;
    runScan(cyberLinkBtn,cyberLinkResult,async()=>{
      const result=analyzeLinkRules(link);
      showReport(cyberLinkResult,result.score,result.scamType,result.reasons,result.advice,{...result,note:"Local structural URL scan complete. Use the CyberNet AI page for account-based AI analysis.",previewHtml:renderLinkPreview(link,result)});
      prependScan("linkScanList",link.slice(0,52),result);
      reportTeamActivity({kind:"quick_scan",scanType:"link",content:link,result:quickScanLogResult(result)});
    });
  });

  /* ─── CyberNet Image (efficient QR + secure vision analysis) ─── */
  const cyberImageInput=document.getElementById("cyberImageInput"),cyberImageResult=document.getElementById("cyberImageResult"),cyberDropZone=document.getElementById("cyberDropZone");
  let jsQRLoader=null;
  function ensureJsQR(){
    if(typeof window.jsQR==="function")return Promise.resolve(window.jsQR);
    if(jsQRLoader)return jsQRLoader;
    jsQRLoader=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";script.async=true;script.onload=()=>resolve(window.jsQR);script.onerror=reject;document.head.appendChild(script)});
    return jsQRLoader;
  }
  async function imageToCanvas(file,maxSide=1400){
    let source,width,height,cleanup=()=>{};
    if("createImageBitmap" in window){source=await createImageBitmap(file);width=source.width;height=source.height;cleanup=()=>source.close?.()}
    else{source=await new Promise((resolve,reject)=>{const img=new Image();const objectUrl=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(objectUrl);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error("Image decode failed"))};img.src=objectUrl});width=source.naturalWidth;height=source.naturalHeight}
    const scale=Math.min(1,maxSide/Math.max(width,height));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});ctx.drawImage(source,0,0,canvas.width,canvas.height);cleanup();
    return{canvas,ctx,width:canvas.width,height:canvas.height};
  }
  async function decodeQRFromFile(file){
    try{const qr=await ensureJsQR();const image=await imageToCanvas(file,1300);const data=image.ctx.getImageData(0,0,image.width,image.height);const code=qr(data.data,data.width,data.height,{inversionAttempts:"attemptBoth"});return{qrData:code?.data||"",width:image.width,height:image.height,canvas:image.canvas}}catch{return{qrData:"",width:0,height:0,canvas:null}}
  }
  async function decodeQRFromDataUrl(dataUrl){
    if(!dataUrl)return{qrData:"",width:0,height:0,canvas:null};
    try{
      const qr=await ensureJsQR();
      const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=dataUrl});
      const maxSide=1300;
      const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d",{willReadFrequently:true,alpha:false});
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=qr(data.data,data.width,data.height,{inversionAttempts:"attemptBoth"});
      return{qrData:code?.data||"",width:canvas.width,height:canvas.height,canvas};
    }catch{return{qrData:"",width:0,height:0,canvas:null}}
  }
  async function compressImage(file,maxSide=1280,quality=.8){
    const mobile=window.matchMedia?.("(max-width: 700px)").matches;
    const image=await imageToCanvas(file,mobile?900:maxSide);return image.canvas.toDataURL("image/jpeg",mobile ? .72 : quality);
  }
  async function handleCyberImage(file){
    if(!file||!cyberImageResult)return;
    if(!file.type.startsWith("image/")){cyberImageResult.innerHTML=`<span class="warning">Please upload a JPG, PNG, or WEBP image.</span>`;return}
    if(file.size>10*1024*1024){cyberImageResult.innerHTML=`<span class="warning">The image must be smaller than 10 MB.</span>`;return}
    const quota=await checkQuickScanQuota();
    if(!quota.allowed){
      cyberImageResult.innerHTML=`<span class="warning">${escapeHTML(quota.message)}</span>`;
      return;
    }
    if(cyberDropZone){const old=cyberDropZone.querySelector(".upload-preview");old?.remove();const preview=document.createElement("div");preview.className="upload-preview";const url=URL.createObjectURL(file);preview.innerHTML=`<img src="${url}" alt="Uploaded preview" decoding="async"><span class="upload-preview-label">${escapeHTML(file.name)}</span>`;preview.querySelector("img").onload=()=>URL.revokeObjectURL(url);cyberDropZone.appendChild(preview)}
    cyberImageResult.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">Inspecting QR and visual signals</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;
    const decoded=await decodeQRFromFile(file);
    let qrResult=null,qrKind="";
    if(decoded.qrData)({kind:qrKind,result:qrResult}=analyzeQrPayload(decoded.qrData));
    const result=analyzeImageRules(file,{...decoded,qrResult});
    // With no QR code there is nothing in the picture this path can actually
    // read, so hand it to Analysis AI rather than showing a verdict built from
    // the filename alone. Opted in here, not inside analyzeImageRules, because
    // the Analysis AI page reuses that function for its own pre-analysis.
    showReport(cyberImageResult,result.score,result.scamType,result.reasons,result.advice,{...result,needsDeepScan:!decoded.qrData,note:"Local QR and file checks complete. Use the CyberNet AI page for account-based visual AI analysis.",previewHtml:decoded.qrData?renderQrPreview(decoded.qrData,qrKind,qrResult):""});
    prependScan("imageScanList",file.name,result);
    reportTeamActivity({kind:"quick_scan",scanType:"image",content:"",fileName:file.name,qr:decoded.qrData?{kind:qrKind,data:decoded.qrData}:null,result:quickScanLogResult(result,{needsDeepScan:!decoded.qrData})});
  }
  if(cyberDropZone)cyberDropZone.addEventListener("click",e=>{if(!isSignedIn()){e.preventDefault();openAuthModal("signup")}});
  if(cyberImageInput)cyberImageInput.addEventListener("change",()=>{if(!isSignedIn()){cyberImageInput.value="";openAuthModal("signup");return}handleCyberImage(cyberImageInput.files[0])});
  if(cyberDropZone&&cyberImageInput){
    cyberDropZone.addEventListener("dragover",e=>{e.preventDefault();cyberDropZone.classList.add("drag-over")});
    cyberDropZone.addEventListener("dragleave",()=>cyberDropZone.classList.remove("drag-over"));
    cyberDropZone.addEventListener("drop",e=>{e.preventDefault();cyberDropZone.classList.remove("drag-over");if(!isSignedIn()){openAuthModal("signup");return}const f=e.dataTransfer.files[0];if(f)handleCyberImage(f)});
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


  /* ─── Secure backend and account status ─── */
  const aiApiStatus=document.getElementById("aiApiStatus");
  const testApiKeyBtn=document.getElementById("testApiKeyBtn");
  const aiConnPill=document.getElementById("aiConnPill");
  const aiReqLeft=document.getElementById("aiReqLeft");
  const aiModelName=document.getElementById("aiModelName");

  async function checkAnalysisService(force=false){
    if(!force&&Date.now()-serviceState.lastChecked<30000&&serviceState.online!==null)return serviceState.online;
    if(aiConnPill){aiConnPill.textContent="Checking…";aiConnPill.className="status-pill status-pill-warn"}
    try{
      const res=await fetch(ANALYSIS_ENDPOINT,{headers:authHeaders({Accept:"application/json"}),cache:"no-store"});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||"Service unavailable");
      serviceState.online=Boolean(data.online);
      serviceState.aiEnabled=Boolean(data.aiEnabled);
      serviceState.model=data.model||"Server-selected";
      serviceState.reputation=Boolean(data.reputationEnabled);
      serviceState.lastChecked=Date.now();
      if(aiModelName)aiModelName.textContent=serviceState.model;
      await refreshAccountStatus();
      return true;
    }catch(error){
      serviceState.online=false;
      serviceState.lastChecked=Date.now();
      if(aiModelName)aiModelName.textContent="Service unavailable";
      if(aiApiStatus)aiApiStatus.innerHTML=`<span class="warning">${escapeHTML(error.message||"The secure analysis service is unavailable.")}</span>`;
      if(aiConnPill){aiConnPill.textContent=isSignedIn()?"Account online":"Signed out";aiConnPill.className="status-pill status-pill-warn"}
      if(aiReqLeft)aiReqLeft.textContent=isSignedIn()?String(appState.usage.remaining||0):"—";
      return false;
    }
  }

  if(testApiKeyBtn)testApiKeyBtn.addEventListener("click",()=>checkAnalysisService(true));
  setTimeout(()=>checkAnalysisService(),650);

  /* ─── Chat interface ─── */
  const chatMessages=document.getElementById("chatMessages"),chatInput=document.getElementById("chatInput"),chatSendBtn=document.getElementById("chatSendBtn"),chatInputRowUnified=document.getElementById("chatInputRowUnified"),aiImageInput=document.getElementById("aiImageInput"),chatAttachBtn=document.getElementById("chatAttachBtn"),chatAttachPreview=document.getElementById("chatAttachPreview"),chatAttachThumb=document.getElementById("chatAttachThumb"),chatAttachName=document.getElementById("chatAttachName"),chatAttachRemove=document.getElementById("chatAttachRemove");
  let pendingAttachment=null;
  function addChatBubble(role,html){
    if(!chatMessages)return null;const bubble=document.createElement("div");bubble.className="chat-bubble "+(role==="user"?"chat-bubble-user":"chat-bubble-ai");bubble.innerHTML=`<div class="chat-bubble-inner">${html}</div>`;chatMessages.appendChild(bubble);chatMessages.scrollTop=chatMessages.scrollHeight;return bubble;
  }
  function canStartAiAnalysis(){
    if(!isSignedIn()){
      openAuthModal("signup");
      addChatBubble("ai",`<span class="warning">Create a free account or sign in before running AI analysis.</span>`);
      return false;
    }
    if(Number(appState.usage.remaining)<=0){
      addChatBubble("ai",`<span class="warning">You have reached today's ${appState.usage.limit||5}-analysis limit.</span><button class="report-download-btn" data-upgrade-now>View Pro options</button>`);
      return false;
    }
    return true;
  }

  function downloadSecurityReport(result,type,content){
    const timestamp=new Date().toLocaleString();
    const evidence=(result.reasons||[]).map(item=>`<li>${escapeHTML(item)}</li>`).join("");
    const actions=(result.advice||[]).map(item=>`<li>${escapeHTML(item)}</li>`).join("");
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>CyberNet AI Security Report</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#102033}h1{color:#086b85}section{margin:28px 0;padding:18px;border:1px solid #d9e8ef;border-radius:12px}.score{font-size:34px;font-weight:800}small{color:#607487}li{margin:8px 0;line-height:1.5}</style></head><body><h1>CyberNet AI Security Report</h1><small>${escapeHTML(timestamp)} · ${escapeHTML(type.toUpperCase())} analysis</small><section><div class="score">${Math.round(result.score)}/100</div><h2>${escapeHTML(result.scamType||"Security analysis")}</h2><p>${escapeHTML(result.note||"")}</p></section><section><h2>Evidence</h2><ul>${evidence||"<li>No decisive evidence recorded.</li>"}</ul></section><section><h2>Recommended actions</h2><ol>${actions||"<li>Verify the content through an official channel.</li>"}</ol></section><section><h2>Submitted content</h2><p>${escapeHTML(String(content||"").slice(0,3000))}</p></section><small>CyberNet AI provides risk guidance, not a guarantee of safety.</small></body></html>`;
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;
    anchor.download=`cybernet-ai-report-${Date.now()}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  const DIAGNOSTIC_STAGES={
    link:["Analyzing link structure and domain patterns…","Running CyberNet AI deep analysis…","Correlating threat intelligence…"],
    image:["Decoding QR and visual signals…","Running CyberNet AI vision analysis…","Correlating threat intelligence…"],
    text:["Parsing language and structural signals…","Running CyberNet AI deep analysis…","Correlating threat intelligence…"]
  };
  function runDiagnosticAnimation(container,type){
    const stages=DIAGNOSTIC_STAGES[type]||DIAGNOSTIC_STAGES.text;
    let index=0;
    function render(){
      container.innerHTML=`
        <div class="diagnostic-progress">
          <div class="diagnostic-progress-head">
            <span class="diagnostic-spinner"></span>
            <span class="diagnostic-progress-text">${escapeHTML(stages[index])}</span>
          </div>
          <div class="diagnostic-progress-steps">
            ${stages.map((s,i)=>`<div class="diagnostic-step ${i<index?"done":i===index?"active":""}"><span class="diagnostic-step-dot">${i<index?"✓":""}</span>${escapeHTML(s.replace("…",""))}</div>`).join("")}
          </div>
        </div>`;
    }
    render();
    const interval=setInterval(()=>{if(index<stages.length-1){index++;render()}},1300);
    return ()=>clearInterval(interval);
  }

  /*
    Mirrors AI_CONFIDENCE_SKIP_THRESHOLD in analyze.mts. The server treats a
    deterministic result at or above this confidence as good enough to answer
    with on its own — good enough to skip calling the model at all. Below it,
    the deterministic layer is a stand-in, not an answer.
  */
  const DETERMINISTIC_TRUST_FLOOR=70;

  function showAnalysisIncomplete(resultBox){
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add("result-has-uncertain");
    resultBox.innerHTML=`<div class="scan-report">
      <div class="verdict-headline verdict-headline-uncertain">
        <span class="verdict-headline-icon">↻</span>
        <span class="verdict-headline-text">COULDN'T COMPLETE THIS ANALYSIS</span>
      </div>
      <div class="verdict-note"><span>ⓘ</span><p>CyberNet AI could not finish reading this one, so it is not going to guess. Saying "not a scam" on an analysis that did not actually run would be worse than saying nothing.</p></div>
      <div class="report-body">
        <div class="report-col"><div class="report-col-title"><span class="col-safe">→</span> What to do</div><ul class="report-list safe-list"><li><strong>Send it again.</strong> This is usually momentary, and a retry normally works.</li><li>This attempt was not counted against your daily analyses.</li></ul></div>
        <div class="report-col"><div class="report-col-title"><span class="col-warn">⚠</span> Until it works</div><ul class="report-list"><li>Treat the message as unverified.</li><li>Do not click links, share codes, or send money based on it.</li><li>Check with the organisation through a number or app you already trust.</li></ul></div>
      </div>
    </div>`;
  }

  function showDiagnosticReport(resultBox,result,type,decodedQr){
    /*
      The AI did not run and the deterministic layer is not confident enough to
      speak for it, so no verdict is shown. This path exists because a real
      phishing SMS was scored 0/100 at confidence 35 by the deterministic engine
      and presented as NOT A SCAM — asserting safety from a fallback that never
      analysed the content is the one failure direction a security tool cannot
      afford. Refunding the usage already happens server-side.
    */
    if(!result.aiUsed&&clamp(result.confidence)<DETERMINISTIC_TRUST_FLOOR){
      showAnalysisIncomplete(resultBox);
      return;
    }
    // A follow-up is an answer about an earlier item, not a new verdict, so it
    // reads as one: the question, the answer, and what to do - no score line.
    if(result.isFollowUp){
      resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
      resultBox.innerHTML=`
        <div class="diagnostic-report diagnostic-followup">
          <div class="diagnostic-followup-head">💬 About your earlier message <span class="diagnostic-followup-tag">${escapeHTML(String(result.scamType||"").replace(/^Follow-up\s*·\s*/,""))}</span></div>
          <div class="diagnostic-note"><p>${escapeHTML(result.note||"")}</p></div>
          ${unique(result.advice||[]).length?`<div class="diagnostic-body"><div class="diagnostic-col"><h5>What You Should Do</h5><ul class="diagnostic-actions">${unique(result.advice).slice(0,6).map(a=>`<li>${escapeHTML(a)}</li>`).join("")}</ul></div></div>`:""}
        </div>`;
      return;
    }
    const uncertain=Boolean(result.uncertain||result.verdict==="inconclusive");
    const danger=getDanger(result.score,result);
    const isSafe=danger.css==="safe";
    const isUnverified=danger.css==="uncertain";
    const plain=window.CyberNetEngine.plainSummary(result,{fallbackText:result.summary||""});
    const previewUrl=type==="link"?result.previewUrl:decodedQr&&/^https?:\/\//i.test(decodedQr)?decodedQr:null;
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add(`result-has-${danger.css}`);
    resultBox.innerHTML=`
      <div class="diagnostic-report">
        <div class="verdict-headline verdict-headline-${danger.css}">
          <span class="verdict-headline-icon">${danger.css==="uncertain"?"?":isSafe?"✓":"✕"}</span>
          <span class="verdict-headline-text">${danger.headline}</span>
        </div>
        ${renderPlainSummary(plain)}
        ${result.previewHtml||(decodedQr?renderQrPreview(decodedQr,/^https?:\/\//i.test(decodedQr)?"url":"text",null):"")}
        ${DETAILS_TOGGLE}
        <div class="report-details" hidden>
          <div class="diagnostic-report-head">
            <span class="diagnostic-scam-type">${escapeHTML(result.scamType)}</span>
            <span class="diagnostic-score">${clamp(Math.round(result.score))}<span>/100</span></span>
          </div>
          <div class="diagnostic-note"><p>${escapeHTML(result.note||"")}</p></div>
          ${unique(result.counterEvidence||[]).length?`<div class="diagnostic-counter"><strong>Reasons this might be okay</strong><ul>${unique(result.counterEvidence).slice(0,5).map(item=>`<li>${escapeHTML(item)}</li>`).join("")}</ul></div>`:""}
          <div class="diagnostic-body">
            <div class="diagnostic-col"><h5>${(isSafe||isUnverified)?"What the scan checked":"Technical warning signs"}</h5><ul>${unique(result.reasons).slice(0,10).map(r=>`<li>${escapeHTML(r)}</li>`).join("")||"<li>Nothing unusual was found.</li>"}</ul></div>
            <div class="diagnostic-col"><h5>Safety steps</h5><ul class="diagnostic-actions">${unique(result.advice).slice(0,8).map(a=>`<li>${escapeHTML(a)}</li>`).join("")}</ul></div>
          </div>
        </div>
      </div>`;
    hydratePreviews(resultBox);
  }

  async function loadScreenshotPreview(container,url){
    if(!container)return;
    try{
      const res=await fetch("/api/screenshot-preview",{method:"POST",headers:authHeaders({"Content-Type":"application/json"}),body:JSON.stringify({url})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.screenshot){container.remove();return}
      container.innerHTML=`
        <strong>📷 Here's what this page looks like right now:</strong>
        <img src="${escapeHTML(data.screenshot)}" alt="Preview of the destination page" loading="lazy"/>
        <p class="screenshot-disclaimer">A screenshot shows what a page looked like at this moment — it doesn't prove the page is safe. A convincing fake login page can look exactly like a real one.</p>
      `;
    }catch{
      container.remove();
    }
  }



  // The last few turns, sent with each analysis so a follow-up question is
  // answered about the item it refers to.
  const chatHistory=[];
  async function analyzeChat(type,content,imageData=""){
    if(!canStartAiAnalysis())return;
    let local;
    let serverContent=content;
    let decodedQrForDisplay="";
    let qrKind="",qrResult=null;
    if(type==="image"){
      const decoded=await decodeQRFromDataUrl(imageData);
      if(decoded.qrData){
        decodedQrForDisplay=decoded.qrData;
        ({kind:qrKind,result:qrResult}=analyzeQrPayload(decoded.qrData));
        serverContent=`${content}\n\n[Decoded QR code content: ${decoded.qrData.slice(0,500)}]`;
      }
      local=analyzeImageRules({name:"uploaded-image",size:0},{...decoded,qrResult});
    }else{
      local=type==="link"?analyzeLinkRules(content):analyzeTextRules(content);
    }
    const thinking=addChatBubble("ai",`<div class="diagnostic-progress"></div>`);
    const inner=thinking?.querySelector(".chat-bubble-inner");
    const stopDiagnostic=inner?runDiagnosticAnimation(inner,type):null;
    const minWait=new Promise(resolve=>setTimeout(resolve,3400));
    try{
      const [deep]=await Promise.all([requestDeepAnalysis(type,serverContent,local,imageData,chatHistory.slice(-6)),minWait]);
      if(stopDiagnostic)stopDiagnostic();
      // A follow-up question is answered about the earlier item, so the local
      // engine's read of the question itself has nothing to add.
      const result=deep?.isFollowUp?{...deep,scamType:`Follow-up · ${deep.scamType}`}:mergeAnalysis(local,deep);
      if(type==="link")result.previewUrl=/^https?:\/\//i.test(content)?content:`https://${content}`;
      if(deep?.teamLogId)reportTeamActivity({kind:"analysis_shown",logId:deep.teamLogId,shown:{score:clamp(Math.round(result.score)),label:deep.isFollowUp?"FOLLOW-UP":getDanger(result.score,result).headline,threatType:result.scamType}});
      result.previewHtml=deep?.isFollowUp?"":type==="link"?renderLinkPreview(result.previewUrl,local):type==="image"&&decodedQrForDisplay?renderQrPreview(decodedQrForDisplay,qrKind,qrResult):renderLinksFound(local.links||[]);
      chatHistory.push({role:"user",text:(type==="image"?"[image attached] ":"")+String(content||"").slice(0,600)},{role:"assistant",text:`${getDanger(result.score,result).headline} ${clamp(Math.round(result.score))}/100 · ${result.scamType}. ${String(result.note||"").slice(0,320)}`});
      if(chatHistory.length>8)chatHistory.splice(0,chatHistory.length-8);
      if(inner){
        showDiagnosticReport(inner,result,type,decodedQrForDisplay);
        if(isPro()){
          const button=document.createElement("button");
          button.className="report-download-btn";
          button.type="button";
          button.textContent="Download Security Report";
          button.addEventListener("click",()=>downloadSecurityReport(result,type,content));
          inner.appendChild(button);
        }
      }
      if(isPro())await refreshAccountStatus();
    }catch(error){
      if(stopDiagnostic)stopDiagnostic();
      if(inner)inner.innerHTML=`<span class="warning">${escapeHTML(error.message||"Analysis failed.")}</span>${error.code==="daily_limit_reached"?'<button class="report-download-btn" data-upgrade-now>Upgrade to Pro</button>':""}`;
    }
    if(chatMessages)chatMessages.scrollTop=chatMessages.scrollHeight;
  }

  function clearAttachment(){
    pendingAttachment=null;
    if(aiImageInput)aiImageInput.value="";
    if(chatAttachPreview)chatAttachPreview.hidden=true;
    if(chatAttachThumb)chatAttachThumb.style.backgroundImage="";
    if(chatAttachName)chatAttachName.textContent="";
  }

  async function handleAttachedFile(file){
    if(!file)return;
    if(!canStartAiAnalysis())return;
    if(file.size>10*1024*1024){addChatBubble("ai",`<span class="warning">Please attach an image smaller than 10 MB.</span>`);return}
    let b64="";
    try{b64=await compressImage(file)}catch{}
    pendingAttachment={name:file.name,data:b64};
    if(chatAttachPreview)chatAttachPreview.hidden=false;
    if(chatAttachName)chatAttachName.textContent=file.name;
    if(chatAttachThumb&&b64)chatAttachThumb.style.backgroundImage=`url(${b64})`;
    if(chatInput)chatInput.focus();
  }

  function sendChatMessage(){
    if(!isSignedIn()){openAuthModal("signup");return}
    const text=chatInput?.value.trim()||"";
    if(pendingAttachment){
      addChatBubble("user",`📎 ${escapeHTML(pendingAttachment.name)}${text?`<br>${escapeHTML(text)}`:""}`);
      const imageData=pendingAttachment.data;
      const label=text||pendingAttachment.name;
      if(chatInput)chatInput.value="";
      clearAttachment();
      analyzeChat("image",label,imageData);
      return;
    }
    if(!text)return;
    if(!canStartAiAnalysis())return;
    addChatBubble("user",escapeHTML(text));
    if(chatInput)chatInput.value="";
    analyzeChat(detectChatContentType(text),text);
  }
  if(chatSendBtn)chatSendBtn.addEventListener("click",sendChatMessage);
  if(chatInput)chatInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();sendChatMessage()}});
  if(chatMessages)chatMessages.addEventListener("click",event=>{if(event.target.closest("[data-upgrade-now]"))switchPage("pricing")});
  if(aiImageInput)aiImageInput.addEventListener("change",()=>{
    const file=aiImageInput.files[0];
    if(!file){return}
    if(!canStartAiAnalysis()){aiImageInput.value="";return}
    handleAttachedFile(file);
  });
  if(chatAttachRemove)chatAttachRemove.addEventListener("click",clearAttachment);
  if(chatInputRowUnified){
    ["dragover","dragenter"].forEach(evtName=>chatInputRowUnified.addEventListener(evtName,event=>{
      event.preventDefault();
      chatInputRowUnified.classList.add("drag-active");
    }));
    ["dragleave","dragend"].forEach(evtName=>chatInputRowUnified.addEventListener(evtName,()=>{
      chatInputRowUnified.classList.remove("drag-active");
    }));
    chatInputRowUnified.addEventListener("drop",event=>{
      event.preventDefault();
      chatInputRowUnified.classList.remove("drag-active");
      const file=event.dataTransfer?.files?.[0];
      if(file&&file.type.startsWith("image/")){
        if(!canStartAiAnalysis())return;
        handleAttachedFile(file);
      }
    });
  }

  /* ─── Learn Roadmap ─── */
  document.querySelectorAll(".rm-node").forEach(node=>{
    node.addEventListener("click",()=>{
      const wasExpanded=node.classList.contains("expanded");
      node.closest(".rm-nodes").querySelectorAll(".rm-node").forEach(n=>n.classList.remove("expanded"));
      if(!wasExpanded)node.classList.add("expanded");
      if(!wasExpanded&&node.id)history.replaceState(null,"",`#${node.id}`);
    });
  });

  /* ─── Learn deep-linking: #learn-<topic> opens Learn, scrolls to, and expands that topic ─── */
  function openLearnDeepLink(){
    const hash=window.location.hash.slice(1);
    if(!hash||!hash.startsWith("learn-"))return;
    const target=document.getElementById(hash);
    if(!target)return;
    switchPage("learn");
    document.querySelectorAll(".rm-node").forEach(n=>n.classList.remove("expanded"));
    target.classList.add("expanded");
    setTimeout(()=>target.scrollIntoView({behavior:"smooth",block:"center"}),150);
  }
  window.addEventListener("hashchange",openLearnDeepLink);
  if(window.location.hash)setTimeout(openLearnDeepLink,300);

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
      btn.addEventListener("click",()=>{matches[i].nodeEl.classList.add("expanded");matches[i].nodeEl.scrollIntoView({behavior:"smooth",block:"center"});if(matches[i].nodeEl.id)history.replaceState(null,"",`#${matches[i].nodeEl.id}`)});
    });
  }
  if(learnSearchBtn)learnSearchBtn.addEventListener("click",searchLessons);
  if(learnSearch)learnSearch.addEventListener("keydown",e=>{if(e.key==="Enter")searchLessons()});

  /* ─── NEW: Tilt-card interaction (subtle, Apple-style) ─── */
  (function initTiltCards(){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse=window.matchMedia&&window.matchMedia("(pointer: coarse)").matches;
    const saveData=Boolean(navigator.connection?.saveData);
    if(reduceMotion||coarse||saveData)return;
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
  /* ─── NEW: Cursor-follow glow in hero ─── */
  (function initCursorGlow(){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse=window.matchMedia&&window.matchMedia("(pointer: coarse)").matches;
    const heroSection=document.getElementById("heroSection");
    const cursorGlow=document.getElementById("cursorGlow");
    if(reduceMotion||coarse||navigator.connection?.saveData||!heroSection||!cursorGlow)return;
    heroSection.addEventListener("mousemove",e=>{
      const rect=heroSection.getBoundingClientRect();
      cursorGlow.style.left=(e.clientX-rect.left)+"px";
      cursorGlow.style.top=(e.clientY-rect.top)+"px";
      heroSection.classList.add("glow-active");
    });
    heroSection.addEventListener("mouseleave",()=>heroSection.classList.remove("glow-active"));
  })();

  /* ─── Pricing monthly/yearly toggle + Business seat-tier picker ─── */
  (function initPricingToggle(){
    const toggle=document.getElementById("pricingToggle");
    const proButton=document.getElementById("proPlanBtn");
    const equivalent=document.getElementById("billingEquivalent");
    const businessEquivalent=document.getElementById("businessBillingEquivalent");
    const seatPicker=document.getElementById("businessSeatPicker");
    const businessAmount=document.querySelector(".business-price-card .price-amount");
    const businessButtons=[document.getElementById("businessPlanBtn")].filter(Boolean);
    if(!toggle)return;
    const options=toggle.querySelectorAll(".toggle-option");

    function applyCycle(cycle){
      toggle.dataset.cycle=cycle;
      options.forEach(option=>option.classList.toggle("active",option.dataset.cycle===cycle));
      document.querySelectorAll(".price-card .price-amount").forEach(amount=>{
        const value=amount.dataset[cycle];
        if(value!==undefined)amount.textContent=`$${value}`;
        const period=amount.closest("h2")?.querySelector(".price-period");
        if(period)period.textContent=cycle==="yearly"?"/year":"/month";
      });
      if(equivalent)equivalent.textContent=cycle==="yearly"?"Billed once at $95.90 — about $7.99/month.":"Billed monthly. Cancel anytime.";
      if(proButton)proButton.dataset.cycle=cycle;
      /* The Business buttons previously kept data-cycle="monthly" no matter
         what the toggle said, so a yearly Business purchase would have checked
         out at the monthly price. They now follow the toggle like Pro does. */
      businessButtons.forEach(button=>{button.dataset.cycle=cycle});
      updateBusinessEquivalent(cycle);
    }

    function updateBusinessEquivalent(cycle){
      if(!businessEquivalent||!businessAmount)return;
      if(cycle==="yearly"){
        const yearly=Number(businessAmount.dataset.yearly)||0;
        const perMonth=yearly?(yearly/12).toFixed(0):"";
        businessEquivalent.textContent=`Billed once at $${yearly} — about $${perMonth}/month.`;
      }else{
        businessEquivalent.textContent="Billed monthly. Cancel anytime.";
      }
    }

    if(seatPicker&&businessAmount){
      seatPicker.querySelectorAll(".cn-seat-option").forEach(option=>{
        option.addEventListener("click",()=>{
          seatPicker.querySelectorAll(".cn-seat-option").forEach(other=>other.classList.toggle("is-active",other===option));
          businessAmount.dataset.monthly=option.dataset.monthly;
          businessAmount.dataset.yearly=option.dataset.yearly;
          applyCycle(toggle.dataset.cycle||"monthly");
        });
      });
    }

    options.forEach(option=>option.addEventListener("click",()=>applyCycle(option.dataset.cycle)));
    applyCycle("monthly");
  })();

  /* ─── Home visual stability ─── */
  /* The previous scroll transform changed the entire hero while reveal animations
     were still running, which caused the first-load jump/glitch. The hero now
     stays in a stable layout and only its internal CSS animations run. */

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


  /* ─── Recovery Mode ─── */
  (function initRecoveryMode(){
    const RECOVERY_ENDPOINT="/api/recovery-mode";
    const RECOVERY_UPDATE_ENDPOINT="/api/recovery-update";
    const RECOVERY_CASE_ENDPOINT="/api/recovery-case";

    const intakeEl=document.getElementById("recoveryIntake");
    const dashboardEl=document.getElementById("recoveryDashboard");
    const descriptionEl=document.getElementById("recoveryDescription");
    const incidentTypeEl=document.getElementById("recoveryIncidentType");
    const incidentTimeEl=document.getElementById("recoveryIncidentTime");
    const regionEl=document.getElementById("recoveryRegion");
    const accountsEl=document.getElementById("recoveryAccounts");
    const imageInput=document.getElementById("recoveryImageInput");
    const uploadLabel=document.getElementById("recoveryUploadLabel");
    const startBtn=document.getElementById("recoveryStartBtn");
    const intakeMessage=document.getElementById("recoveryIntakeMessage");
    const usageNote=document.getElementById("recoveryUsageNote");
    const caseListEl=document.getElementById("recoveryCaseList");
    const backBtn=document.getElementById("recoveryBackBtn");

    const incidentTypeOut=document.getElementById("recoveryIncidentTypeOut");
    const riskOut=document.getElementById("recoveryRiskOut");
    const urgencyOut=document.getElementById("recoveryUrgencyOut");
    const progressOut=document.getElementById("recoveryProgressOut");
    const summaryOut=document.getElementById("recoverySummaryOut");
    const confidenceOut=document.getElementById("recoveryConfidenceOut");
    const confidenceReasonOut=document.getElementById("recoveryConfidenceReasonOut");
    const knowList=document.getElementById("recoveryKnowList");
    const inferList=document.getElementById("recoveryInferList");
    const unknownList=document.getElementById("recoveryUnknownList");
    const immediateActionsEl=document.getElementById("recoveryImmediateActions");
    const timelineActionsEl=document.getElementById("recoveryTimelineActions");
    const timelineLockedEl=document.getElementById("recoveryTimelineLocked");
    const remainingListEl=document.getElementById("recoveryRemainingList");
    const resourcesListEl=document.getElementById("recoveryResourcesList");
    const updateQuestionEl=document.getElementById("recoveryUpdateQuestion");
    const updateTextEl=document.getElementById("recoveryUpdateText");
    const updateMessageEl=document.getElementById("recoveryUpdateMessage");
    const updateBtn=document.getElementById("recoveryUpdateBtn");
    const updateUsageNote=document.getElementById("recoveryUpdateUsageNote");
    const historyListEl=document.getElementById("recoveryHistoryList");
    const downloadBtn=document.getElementById("recoveryDownloadBtn");
    const proUpsellEl=document.getElementById("recoveryProUpsell");

    if(!intakeEl||!dashboardEl)return;

    let pendingRecoveryImage=null;
    let currentCaseId=null;
    let currentPlan=null;
    let currentTasks=[];
    let activeTimelineTab="first10Minutes";

    function setIntakeMessage(message="",tone=""){
      if(!intakeMessage)return;
      intakeMessage.textContent=message;
      intakeMessage.className=`auth-message ${tone}`.trim();
    }
    function setUpdateMessage(message="",tone=""){
      if(!updateMessageEl)return;
      updateMessageEl.textContent=message;
      updateMessageEl.className=`auth-message ${tone}`.trim();
    }

    if(imageInput)imageInput.addEventListener("change",async()=>{
      const file=imageInput.files[0];
      if(!file)return;
      if(file.size>10*1024*1024){setIntakeMessage("Please attach an image smaller than 10 MB.","");imageInput.value="";return}
      let b64="";
      try{b64=await compressImage(file)}catch{}
      pendingRecoveryImage={name:file.name,data:b64};
      if(uploadLabel)uploadLabel.textContent=`Attached: ${file.name}`;
    });

    function collectQuickAnswers(){
      const answers={};
      document.querySelectorAll("#recoveryIntake [data-quick]").forEach(input=>{
        answers[input.dataset.quick]=input.checked;
      });
      return answers;
    }

    async function startRecoveryCase(){
      if(!isSignedIn()){openAuthModal("signup");setIntakeMessage("Create a free account or sign in to start Recovery Mode.","");return}
      const description=descriptionEl?.value.trim()||"";
      if(!description){setIntakeMessage("Please describe what happened before starting.","");return}

      setIntakeMessage("");
      startBtn.disabled=true;
      const originalLabel=startBtn.textContent;
      startBtn.innerHTML=`<span class="btn-spinner"></span> Analyzing…`;

      try{
        const accountsInvolved=(accountsEl?.value||"").split(",").map(v=>v.trim()).filter(Boolean);
        const res=await fetch(RECOVERY_ENDPOINT,{
          method:"POST",
          headers:authHeaders({"Content-Type":"application/json"}),
          body:JSON.stringify({
            description,
            quickAnswers:collectQuickAnswers(),
            incidentType:incidentTypeEl?.value||"",
            incidentTime:incidentTimeEl?.value||"",
            region:regionEl?.value||"",
            accountsInvolved,
            imageData:pendingRecoveryImage?.data||""
          })
        });
        const data=await res.json().catch(()=>({}));
        // The plan arrives on a streamed 200, so a failure after the stream
        // opened comes back as an error field rather than a status code.
        if(!res.ok||data.error||!data.plan){
          const error=new Error(data.error||`Recovery service returned ${res.status}`);
          error.code=data.code;
          error.usage=data.usage;
          throw error;
        }
        currentCaseId=data.caseId;
        currentPlan={...data.plan,progressPercent:0};
        currentTasks=[];
        if(data.usage)appState.recoveryUsage={used:Number(data.usage.used)||0,limit:Number(data.usage.daily_limit)||1};
        updateAccountUI();
        renderDashboard();
        showDashboard();
        if(data.aiPending)watchForAiPlan(data.caseId,Number(data.caseVersion)||1,"plan");
      }catch(error){
        if(error.code==="daily_limit_reached"){
          setIntakeMessage(`${error.message} Upgrade to Pro for more Recovery cases per day.`,"warning");
          if(error.usage){appState.recoveryUsage={used:Number(error.usage.used)||0,limit:Number(error.usage.daily_limit)||1};updateAccountUI()}
        }else{
          setIntakeMessage(error.message||"Recovery Mode couldn't start right now. Please try again.","warning");
        }
      }finally{
        startBtn.disabled=false;
        startBtn.textContent=originalLabel;
      }
    }
    if(startBtn)startBtn.addEventListener("click",startRecoveryCase);

    function riskClass(risk){return `recovery-risk-${risk||"medium"}`}
    function priorityClass(priority){return `recovery-priority-${priority||"normal"}`}

    function renderActionItem(action,options={}){
      const completed=currentTasks.find(t=>t.task_key===action.id)?.status==="completed";
      const wrap=document.createElement("div");
      wrap.className=`recovery-action-item${completed?" completed":""}`;
      wrap.innerHTML=`
        <label class="recovery-action-check">
          <input type="checkbox" data-task-key="${escapeHTML(action.id)}" ${completed?"checked":""}/>
        </label>
        <div class="recovery-action-body">
          <div class="recovery-action-title-row">
            <strong>${escapeHTML(action.title)}</strong>
            <span class="recovery-priority-pill ${priorityClass(action.priority)}">${escapeHTML(action.priority||"normal")}</span>
            <span class="recovery-priority-pill recovery-priority-normal">${Number(action.estimatedMinutes)||10} min</span>
          </div>
          <p class="recovery-action-instruction">${escapeHTML(action.instruction)}</p>
          ${action.why?`<p class="recovery-action-why"><strong>Why:</strong> ${escapeHTML(action.why)}</p>`:""}
          ${action.verification?`<p class="recovery-action-verify"><strong>Verify:</strong> ${escapeHTML(action.verification)}</p>`:""}
        </div>
      `;
      return wrap;
    }

    function renderActionList(container,actions){
      if(!container)return;
      container.innerHTML="";
      if(!actions||!actions.length){
        container.innerHTML=`<p class="recovery-empty-note">No actions in this stage.</p>`;
        return;
      }
      actions.forEach(action=>container.appendChild(renderActionItem(action)));
    }

    function renderDashboard(){
      if(!currentPlan)return;
      const plan=currentPlan;
      const pro=isPro();

      if(incidentTypeOut)incidentTypeOut.textContent=plan.incidentType||"—";
      if(riskOut){riskOut.textContent=(plan.riskLevel||"medium").toUpperCase();riskOut.className=`recovery-risk-badge ${riskClass(plan.riskLevel)}`}
      if(urgencyOut)urgencyOut.textContent=(plan.urgency||"soon").replace(/^\w/,c=>c.toUpperCase());
      if(progressOut)progressOut.textContent=`${plan.progressPercent||0}%`;
      if(summaryOut)summaryOut.textContent=plan.summary||"";
      if(confidenceOut)confidenceOut.textContent=`Confidence: ${plan.confidence||0}%`;
      if(confidenceReasonOut)confidenceReasonOut.textContent=`${plan.confidenceReason||""} ${plan.confidenceMeaning||""}`.trim();

      const fillList=(el,items)=>{
        if(!el)return;
        el.innerHTML=(items&&items.length)?items.map(i=>`<li>${escapeHTML(i)}</li>`).join(""):`<li>None recorded.</li>`;
      };
      fillList(knowList,plan.whatWeKnow);
      fillList(inferList,plan.inferences);
      fillList(unknownList,plan.unknowns);

      renderActionList(immediateActionsEl,plan.immediateActions);

      const timeline=plan.timeline||{};
      const timelineAvailable=pro||activeTimelineTab==="first10Minutes";
      if(timelineLockedEl)timelineLockedEl.hidden=timelineAvailable;
      if(timelineActionsEl)timelineActionsEl.style.display=timelineAvailable?"":"none";
      if(timelineAvailable)renderActionList(timelineActionsEl,timeline[activeTimelineTab]);

      if(remainingListEl){
        remainingListEl.innerHTML=(plan.remainingRisk&&plan.remainingRisk.length)
          ?plan.remainingRisk.map(i=>`<li>${escapeHTML(i)}</li>`).join("")
          :`<li>No specific remaining risks flagged yet.</li>`;
      }

      if(resourcesListEl){
        const resources=plan.reportingResources||[];
        resourcesListEl.innerHTML=resources.length?resources.map(r=>`
          <div class="recovery-resource-item">
            <div class="recovery-resource-info">
              <strong>${escapeHTML(r.organization)}</strong>
              <span>${escapeHTML(r.purpose)}${r.phone?` · ${escapeHTML(r.phone)}`:""}</span>
            </div>
            <a href="${escapeHTML(r.officialUrl)}" target="_blank" rel="noopener">Visit official site →</a>
          </div>
        `).join(""):`<p class="recovery-empty-note">No region-specific resources matched. Contact your local police or consumer protection authority.</p>`;
      }

      if(updateQuestionEl)updateQuestionEl.textContent=plan.updateQuestion||"Tell CyberNet AI what you've done or what changed.";

      if(proUpsellEl)proUpsellEl.hidden=pro;
      if(downloadBtn)downloadBtn.hidden=!pro;

      if(usageNote)usageNote.textContent="";
    }

    function downloadRecoveryReport(){
      if(!currentPlan)return;
      const plan=currentPlan;
      const timestamp=new Date().toLocaleString();
      const listHtml=(items)=>(items&&items.length)?items.map(i=>`<li>${escapeHTML(i)}</li>`).join(""):"<li>None recorded.</li>";
      const actionsHtml=(items)=>(items&&items.length)?items.map(a=>`<li><strong>${escapeHTML(a.title)}</strong> — ${escapeHTML(a.instruction)}${a.verification?` <em>(Verify: ${escapeHTML(a.verification)})</em>`:""}</li>`).join(""):"<li>None recorded.</li>";
      const resourcesHtml=(plan.reportingResources||[]).map(r=>`<li>${escapeHTML(r.organization)} — ${escapeHTML(r.purpose)}${r.phone?` · ${escapeHTML(r.phone)}`:""} — ${escapeHTML(r.officialUrl)}</li>`).join("")||"<li>No region-specific resources matched.</li>";
      const timeline=plan.timeline||{};
      const html=`<!doctype html><html><head><meta charset="utf-8"><title>CyberNet AI Recovery Report</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 24px;color:#0d1f16}h1{color:#0f8a53}h2{color:#0d1f16;font-size:17px;margin-top:0}section{margin:26px 0;padding:18px;border:1px solid #d7f0e2;border-radius:12px}small{color:#5a7568}li{margin:8px 0;line-height:1.55}.badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#e5f8ee;color:#0f8a53;font-weight:700;font-size:13px}</style></head><body>
        <h1>CyberNet AI Recovery Report</h1>
        <small>${escapeHTML(timestamp)} · Case ID: ${escapeHTML(currentCaseId||"—")}</small>
        <section>
          <span class="badge">${escapeHTML((plan.riskLevel||"").toUpperCase())} RISK</span>
          <h2>${escapeHTML(plan.incidentType||"Recovery case")}</h2>
          <p>${escapeHTML(plan.summary||"")}</p>
          <p><strong>Urgency:</strong> ${escapeHTML(plan.urgency||"")} &nbsp; <strong>Confidence:</strong> ${plan.confidence||0}% &nbsp; <strong>Progress:</strong> ${plan.progressPercent||0}%</p>
        </section>
        <section><h2>What We Know</h2><ul>${listHtml(plan.whatWeKnow)}</ul></section>
        <section><h2>Reasonable Inferences</h2><ul>${listHtml(plan.inferences)}</ul></section>
        <section><h2>Unknowns</h2><ul>${listHtml(plan.unknowns)}</ul></section>
        <section><h2>Immediate Actions</h2><ul>${actionsHtml(plan.immediateActions)}</ul></section>
        <section><h2>First 10 Minutes</h2><ul>${actionsHtml(timeline.first10Minutes)}</ul></section>
        <section><h2>First Hour</h2><ul>${actionsHtml(timeline.firstHour)}</ul></section>
        <section><h2>First 24 Hours</h2><ul>${actionsHtml(timeline.first24Hours)}</ul></section>
        <section><h2>Next 7 Days</h2><ul>${actionsHtml(timeline.next7Days)}</ul></section>
        <section><h2>What's Still At Risk</h2><ul>${listHtml(plan.remainingRisk)}</ul></section>
        <section><h2>Official Reporting Resources</h2><ul>${resourcesHtml}</ul></section>
        <small>CyberNet AI provides recovery guidance, not a guarantee of safety. This report reflects the case state at the time of download.</small>
      </body></html>`;
      const blob=new Blob([html],{type:"text/html;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=`cybernet-ai-recovery-report-${Date.now()}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    if(downloadBtn)downloadBtn.addEventListener("click",downloadRecoveryReport);

    document.querySelectorAll(".recovery-timeline-tab").forEach(tab=>{
      tab.addEventListener("click",()=>{
        document.querySelectorAll(".recovery-timeline-tab").forEach(t=>t.classList.remove("active"));
        tab.classList.add("active");
        activeTimelineTab=tab.dataset.timeline;
        if(!isPro()&&activeTimelineTab!=="first10Minutes"){
          switchPage("pricing");
          return;
        }
        renderDashboard();
      });
    });

    if(immediateActionsEl)immediateActionsEl.addEventListener("change",event=>{
      const checkbox=event.target.closest("[data-task-key]");
      if(checkbox)markTaskLocally(checkbox.dataset.taskKey,checkbox.checked);
    });
    if(timelineActionsEl)timelineActionsEl.addEventListener("change",event=>{
      const checkbox=event.target.closest("[data-task-key]");
      if(checkbox)markTaskLocally(checkbox.dataset.taskKey,checkbox.checked);
    });

    function markTaskLocally(taskKey,checked){
      const existing=currentTasks.find(t=>t.task_key===taskKey);
      if(existing)existing.status=checked?"completed":"pending";
      else currentTasks.push({task_key:taskKey,status:checked?"completed":"pending"});
    }

    async function submitRecoveryUpdate(){
      if(!currentCaseId)return;
      const updateText=updateTextEl?.value.trim()||"";
      const completedTaskKeys=currentTasks.filter(t=>t.status==="completed").map(t=>t.task_key);
      if(!updateText&&!completedTaskKeys.length){setUpdateMessage("Tell CyberNet AI what changed before updating.","");return}

      setUpdateMessage("");
      updateBtn.disabled=true;
      const originalLabel=updateBtn.textContent;
      updateBtn.innerHTML=`<span class="btn-spinner"></span> Updating…`;

      try{
        const res=await fetch(RECOVERY_UPDATE_ENDPOINT,{
          method:"POST",
          headers:authHeaders({"Content-Type":"application/json"}),
          body:JSON.stringify({caseId:currentCaseId,updateText,completedTaskKeys})
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok||data.error||!data.plan){
          const error=new Error(data.error||`Recovery update returned ${res.status}`);
          error.code=data.code;
          error.usage=data.usage;
          throw error;
        }
        currentPlan=data.plan;
        if(updateTextEl)updateTextEl.value="";
        renderDashboard();
        if(data.aiPending)watchForAiPlan(currentCaseId,Number(data.caseVersion)||1,"update");
        else setUpdateMessage("Recovery case updated.","success");
      }catch(error){
        if(error.code==="cooldown_active"){
          setUpdateMessage(error.message||"Please wait before submitting another update.","warning");
        }else if(error.code==="daily_limit_reached"){
          setUpdateMessage(`${error.message} Upgrade to Pro for more updates per day.`,"warning");
        }else{
          setUpdateMessage(error.message||"Couldn't update this case right now.","warning");
        }
      }finally{
        updateBtn.disabled=false;
        updateBtn.textContent=originalLabel;
      }
    }
    if(updateBtn)updateBtn.addEventListener("click",submitRecoveryUpdate);

    // The server answers with the deterministic plan and builds the AI one in
    // the background; this swaps it in once the case's version number moves.
    let aiWatch=null;
    async function watchForAiPlan(caseId,seenVersion,kind){
      const token={};aiWatch=token;
      const started=Date.now();
      setUpdateMessage(kind==="update"?"Updating your plan with CyberNet AI… the plan below stays current until then.":"Your essential actions are ready. CyberNet AI is preparing your full plan…","");
      while(aiWatch===token&&currentCaseId===caseId&&Date.now()-started<180000){
        await new Promise(r=>setTimeout(r,4000));
        if(aiWatch!==token||currentCaseId!==caseId)return;
        try{
          const res=await fetch(`${RECOVERY_CASE_ENDPOINT}?caseId=${encodeURIComponent(caseId)}`,{headers:authHeaders({Accept:"application/json"}),cache:"no-store"});
          const data=await res.json().catch(()=>({}));
          const version=Number(data.case?.current_version)||0;
          if(res.ok&&data.plan&&version>seenVersion){
            currentPlan={...data.plan,progressPercent:Number(data.case?.progress_percent)||0};
            currentTasks=Array.isArray(data.tasks)?data.tasks:[];
            renderDashboard();
            setUpdateMessage(kind==="update"?"Recovery case updated.":"Your full CyberNet AI recovery plan is ready.","success");
            loadCaseList();
            return;
          }
        }catch{}
      }
      if(aiWatch===token&&currentCaseId===caseId)setUpdateMessage(kind==="update"?"The AI update is taking longer than usual — the plan below is still current.":"CyberNet AI couldn't finish the full plan this time — the essential actions below still apply.","warning");
    }

    function showDashboard(){
      intakeEl.hidden=true;
      dashboardEl.hidden=false;
    }
    function showIntake(){
      dashboardEl.hidden=true;
      intakeEl.hidden=false;
      currentCaseId=null;
      currentPlan=null;
      currentTasks=[];
      loadCaseList();
    }
    if(backBtn)backBtn.addEventListener("click",showIntake);

    async function loadCaseList(){
      if(!caseListEl)return;
      if(!isSignedIn()){
        caseListEl.innerHTML=`<p class="recovery-empty-note">Sign in to see your saved Recovery cases.</p>`;
        return;
      }
      try{
        const res=await fetch(RECOVERY_CASE_ENDPOINT,{headers:authHeaders()});
        const data=await res.json().catch(()=>({}));
        if(!res.ok||!Array.isArray(data.cases)){
          caseListEl.innerHTML=`<p class="recovery-empty-note">Couldn't load your Recovery cases right now.</p>`;
          return;
        }
        if(!data.cases.length){
          caseListEl.innerHTML=`<p class="recovery-empty-note">No Recovery cases yet. Start one above.</p>`;
          return;
        }
        caseListEl.innerHTML="";
        data.cases.forEach(item=>{
          const btn=document.createElement("button");
          btn.type="button";
          btn.className="recovery-case-item";
          btn.innerHTML=`
            <strong>${escapeHTML(item.case_title||item.incident_type||"Recovery case")}</strong>
            <small>${escapeHTML((item.risk_level||"").toUpperCase())} risk · ${escapeHTML(item.status||"active")} · ${new Date(item.updated_at).toLocaleDateString()}</small>
            <div class="recovery-case-progress"><span style="width:${Number(item.progress_percent)||0}%"></span></div>
          `;
          btn.addEventListener("click",()=>openExistingCase(item.id));
          caseListEl.appendChild(btn);
        });
      }catch{
        caseListEl.innerHTML=`<p class="recovery-empty-note">Couldn't load your Recovery cases right now.</p>`;
      }
    }

    async function openExistingCase(caseId){
      try{
        const res=await fetch(`${RECOVERY_CASE_ENDPOINT}?caseId=${encodeURIComponent(caseId)}`,{headers:authHeaders()});
        const data=await res.json().catch(()=>({}));
        if(!res.ok||!data.plan){setIntakeMessage("Couldn't load that Recovery case.","warning");return}
        currentCaseId=caseId;
        currentPlan={...data.plan,progressPercent:data.case?.progress_percent||0};
        currentTasks=Array.isArray(data.tasks)?data.tasks:[];
        if(historyListEl)historyListEl.innerHTML="";
        renderDashboard();
        showDashboard();
      }catch{
        setIntakeMessage("Couldn't load that Recovery case.","warning");
      }
    }

    document.querySelectorAll('[data-page="recovery"]').forEach(btn=>{
      btn.addEventListener("click",()=>{if(intakeEl&&!intakeEl.hidden)loadCaseList()});
    });

    loadCaseList();
  })();

  /* ─── Clear buttons on the analysis inputs ─── */
  document.querySelectorAll(".input-clear-btn[data-clear]").forEach(btn=>{
    const field=document.getElementById(btn.dataset.clear);
    if(!field)return;
    const sync=()=>{btn.hidden=!field.value};
    ["input","change","focus","blur","keyup"].forEach(type=>field.addEventListener(type,sync));
    const after=btn.dataset.syncAfter?document.getElementById(btn.dataset.syncAfter):null;
    if(after)after.addEventListener("click",()=>setTimeout(sync,60));
    btn.addEventListener("click",()=>{
      field.value="";
      field.dispatchEvent(new Event("input",{bubbles:true}));
      sync();
      field.focus();
    });
    sync();
  });

  /* ─── "Show more details" on scan reports ─── */
  document.addEventListener("click",event=>{
    const toggle=event.target.closest?.(".details-toggle");
    if(!toggle)return;
    const details=toggle.nextElementSibling;
    if(!details||!details.classList.contains("report-details"))return;
    const open=details.hidden;
    details.hidden=!open;
    toggle.textContent=open?"Hide details":"Show more details";
    toggle.setAttribute("aria-expanded",String(open));
  });

  /* ─── /login and /signup aliases land here with ?auth=login|signup ─── */
  try{
    const authParam=new URLSearchParams(window.location.search).get("auth");
    if(authParam==="login"||authParam==="signup"){
      openAuthModal(authParam);
      history.replaceState(null,"",window.location.pathname+window.location.hash);
    }
  }catch{}

  moveNavIndicator(currentPageId);
  runRevealAnimation();
});

