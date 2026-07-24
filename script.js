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
  const loader=document.getElementById("loader");
  const navButtons=document.querySelectorAll("[data-page]");
  const pages=document.querySelectorAll(".page");
  const mobileMenu=document.getElementById("mobileMenu");
  const navbar=document.querySelector(".navbar");
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

  /* ─── Secure account, plan, and entitlement state ─── */
  const authModal=document.getElementById("authModal");
  const openAuth=document.getElementById("openAuth");
  const closeAuth=document.getElementById("closeAuth");
  const authTabs=document.querySelectorAll(".auth-tab");
  const loginForm=document.getElementById("authLoginForm");
  const signupForm=document.getElementById("authSignupForm");
  const loginBtn=document.getElementById("loginBtn");
  const signupBtn=document.getElementById("signupBtn");
  const forgotPasswordBtn=document.getElementById("forgotPasswordBtn");
  const logoutBtn=document.getElementById("logoutBtn");
  const navGreeting=document.getElementById("navGreeting");
  const accountSummary=document.getElementById("accountSummary");
  const navPlanBadge=document.getElementById("navPlanBadge");
  const navUsageChip=document.getElementById("navUsageChip");
  const authMessage=document.getElementById("authMessage");
  const freePlanBtn=document.getElementById("freePlanBtn");
  const proPlanBtn=document.getElementById("proPlanBtn");
  const pricingNotice=document.getElementById("pricingNotice");
  const aiUpgradeBtn=document.getElementById("aiUpgradeBtn");
  const manageBillingBtn=document.getElementById("manageBillingBtn");
  const ghostUpgradeBtn=document.getElementById("ghostUpgradeBtn");
  const ghostPage=document.getElementById("ghostscan");
  const ghostPaywall=document.getElementById("ghostPaywall");

  const appState={
    supabase:null,
    session:null,
    user:null,
    profile:{plan:"guest",fullName:"",subscriptionStatus:"inactive",billingInterval:""},
    usage:{used:0,limit:0,remaining:0,resetDate:""},
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

  function setAuthTab(mode="login"){
    authTabs.forEach(tab=>tab.classList.toggle("active",tab.dataset.auth===mode));
    loginForm?.classList.toggle("active-auth-form",mode==="login");
    signupForm?.classList.toggle("active-auth-form",mode==="signup");
  }

  function openAuthModal(mode="login"){
    setAuthTab(mode);
    setAuthMessage("");
    authModal?.classList.add("show");
  }

  if(openAuth)openAuth.addEventListener("click",()=>openAuthModal("login"));
  if(closeAuth&&authModal)closeAuth.addEventListener("click",()=>authModal.classList.remove("show"));
  if(authModal)authModal.addEventListener("click",event=>{if(event.target===authModal)authModal.classList.remove("show")});
  authTabs.forEach(tab=>tab.addEventListener("click",()=>setAuthTab(tab.dataset.auth)));

  function firstName(value=""){
    const raw=String(value||"").trim().split(/\s+/)[0]||"User";
    return raw.charAt(0).toUpperCase()+raw.slice(1);
  }

  function isPro(){return appState.profile.plan==="pro"&&["active","trialing"].includes(appState.profile.subscriptionStatus||"active")}
  function isSignedIn(){return Boolean(appState.session?.access_token)}

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
        <div><span>✓</span> 50 advanced AI analyses per day</div>
        <div><span>✓</span> Detailed risk scoring and threat intelligence</div>
        <div><span>✓</span> Saved scan history</div>
        <div><span>✓</span> Downloadable security reports</div>
        <div><span>✓</span> Full GhostScan access</div>`;
    }else{
      list.innerHTML=`
        <div><span>✓</span> Accurate Text, Link &amp; Image analysis</div>
        <div><span>✓</span> Basic threat explanations</div>
        <div class="benefit-locked"><span>×</span> Saved scan history</div>
        <div class="benefit-locked"><span>×</span> Downloadable reports</div>
        <div class="benefit-locked"><span>×</span> GhostScan access</div>`;
    }
  }

  function updateAccountUI(){
    const signedIn=isSignedIn();
    const pro=isPro();
    const plan=signedIn?(pro?"pro":"free"):"guest";
    document.body.dataset.plan=plan;

    if(accountSummary)accountSummary.hidden=!signedIn;
    if(openAuth)openAuth.hidden=signedIn;
    if(navGreeting)navGreeting.textContent=signedIn?`Hi ${firstName(appState.profile.fullName||appState.user?.user_metadata?.full_name||appState.user?.email)}`:"";

    const badgeText=pro?"PRO":"FREE";
    [navPlanBadge,document.getElementById("aiPlanBadge")].forEach(badge=>{
      if(!badge)return;
      badge.textContent=badgeText;
      badge.className=`plan-badge ${pro?"plan-badge-pro":"plan-badge-free"}`;
    });

    const used=Number(appState.usage.used)||0;
    const limit=Number(appState.usage.limit)||(signedIn?(pro?50:5):5);
    const remaining=Math.max(0,Number.isFinite(appState.usage.remaining)?Number(appState.usage.remaining):limit-used);
    if(navUsageChip){navUsageChip.textContent=`${used} / ${limit}`;navUsageChip.title=`${remaining} AI analyses remaining today`}

    const aiPlanTitle=document.getElementById("aiPlanTitle");
    const aiPlanDescription=document.getElementById("aiPlanDescription");
    const aiUsageText=document.getElementById("aiUsageText");
    const aiUsageBar=document.getElementById("aiUsageBar");
    const aiUsageReset=document.getElementById("aiUsageReset");
    const aiConnPill=document.getElementById("aiConnPill");
    const aiReqLeft=document.getElementById("aiReqLeft");
    const aiApiStatus=document.getElementById("aiApiStatus");

    if(aiPlanTitle)aiPlanTitle.textContent=pro?"CyberNet AI Pro":"CyberNet AI Free";
    if(aiPlanDescription)aiPlanDescription.textContent=!signedIn?"Sign in to activate 5 accurate AI analyses per day across text, links, and images.":pro?"Top-level CyberNet AI protection with advanced analysis, history, reports, and GhostScan.":"Accurate everyday AI protection with 5 shared analyses per day.";
    if(aiUsageText)aiUsageText.textContent=signedIn?`${used} / ${limit}`:`0 / 5`;
    if(aiUsageBar)aiUsageBar.style.width=`${signedIn?Math.min(100,(used/Math.max(1,limit))*100):0}%`;
    if(aiUsageReset)aiUsageReset.textContent=appState.usage.resetDate?`Resets ${new Date(appState.usage.resetDate).toLocaleDateString()}`:"Resets daily";
    if(aiConnPill){
      aiConnPill.textContent=!signedIn?"Signed out":pro?"Pro active":"Free active";
      aiConnPill.className=`status-pill ${signedIn?"status-pill-safe":"status-pill-warn"}`;
    }
    if(aiReqLeft)aiReqLeft.textContent=signedIn?String(remaining):"—";
    if(aiApiStatus){
      if(!supabaseConfigured)aiApiStatus.innerHTML='<span class="warning">Add your Supabase URL and publishable key in config.js to activate real accounts.</span>';
      else if(!signedIn)aiApiStatus.innerHTML='<span class="warning">Sign in or create a free account before running AI analysis.</span>';
      else if(remaining<=0)aiApiStatus.innerHTML=`<span class="warning">Daily limit reached. ${pro?"Your 50 analyses reset tomorrow.":"Upgrade to Pro for 50 analyses per day."}</span>`;
      else aiApiStatus.innerHTML=`<span class="safe">✓ ${remaining} secure AI ${remaining===1?"analysis":"analyses"} remaining today.</span>`;
    }

    if(aiUpgradeBtn){aiUpgradeBtn.hidden=pro;aiUpgradeBtn.textContent=signedIn?"Upgrade to Pro":"View Pro Plan"}
    if(manageBillingBtn)manageBillingBtn.hidden=!pro;
    if(freePlanBtn){freePlanBtn.textContent=!signedIn?"Start Free":pro?"Included with Pro":"Current Plan";freePlanBtn.disabled=signedIn}
    if(proPlanBtn){proPlanBtn.textContent=pro?"Current Plan":"Upgrade to Pro";proPlanBtn.disabled=pro}

    if(ghostPage)ghostPage.classList.toggle("is-locked",!pro);
    if(ghostUpgradeBtn)ghostUpgradeBtn.textContent=!signedIn?"Sign In to Continue":"Upgrade to Pro";
    if(ghostPaywall){
      const heading=ghostPaywall.querySelector("h1");
      if(heading)heading.textContent=!signedIn?"Sign in to unlock your plan.":"GhostScan is a Pro feature.";
    }

    updatePlanBenefits();
    renderProHistory();
  }

  async function refreshAccountStatus(){
    if(!isSignedIn()){
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
      appState.profile={
        plan:data.profile?.plan||"free",
        fullName:data.profile?.fullName||appState.user?.user_metadata?.full_name||"",
        subscriptionStatus:data.profile?.subscriptionStatus||"inactive",
        billingInterval:data.profile?.billingInterval||""
      };
      appState.usage={
        used:Number(data.usage?.used)||0,
        limit:Number(data.usage?.limit)||5,
        remaining:Number(data.usage?.remaining),
        resetDate:data.usage?.resetDate||""
      };
      appState.history=Array.isArray(data.history)?data.history:[];
    }catch(error){
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
    appState.supabase.auth.getSession().then(({data})=>syncSession(data.session));
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

  if(loginBtn)loginBtn.addEventListener("click",async()=>{
    if(!appState.supabase){setAuthMessage("Supabase is not configured yet. Add the values in config.js.","error");return}
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
      }
    }catch(error){setAuthMessage(error.message||"Sign in failed.","error")}
    finally{loginBtn.disabled=false}
  });

  if(signupBtn)signupBtn.addEventListener("click",async()=>{
    if(!appState.supabase){setAuthMessage("Supabase is not configured yet. Add the values in config.js.","error");return}
    const fullName=document.getElementById("signupName")?.value.trim()||"";
    const email=document.getElementById("signupEmail")?.value.trim()||"";
    const password=document.getElementById("signupPassword")?.value||"";
    signupBtn.disabled=true;
    try{
      if(!fullName||!email||password.length<8)throw new Error("Enter your name, a valid email, and a password of at least 8 characters.");
      const {data,error}=await appState.supabase.auth.signUp({
        email,password,
        options:{data:{full_name:fullName},emailRedirectTo:window.location.origin}
      });
      if(error)throw error;
      if(data.session){
        setAuthMessage("Your free account is ready.","success");
        authModal?.classList.remove("show");
      }else{
        setAuthMessage("Account created. Check your email to confirm it, then sign in.","success");
      }
    }catch(error){setAuthMessage(error.message||"Account creation failed.","error")}
    finally{signupBtn.disabled=false}
  });

  if(forgotPasswordBtn)forgotPasswordBtn.addEventListener("click",async()=>{
    if(!appState.supabase){setAuthMessage("Supabase is not configured yet.","error");return}
    const email=document.getElementById("loginEmail")?.value.trim()||"";
    if(!email){setAuthMessage("Enter your email address first.","error");return}
    const {error}=await appState.supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/?reset=1`});
    setAuthMessage(error?error.message:"Password reset email sent.",error?"error":"success");
  });

  if(logoutBtn)logoutBtn.addEventListener("click",async()=>{
    await appState.supabase?.auth.signOut();
    switchPage("home");
  });

  async function startCheckout(cycle="monthly"){
    if(!isSignedIn()){
      sessionStorage.setItem("cybernet_pending_cycle",cycle);
      openAuthModal("signup");
      showPricingNotice("Create a free account first, then choose Pro again.");
      return;
    }
    if(isPro()){showPricingNotice("CyberNet AI Pro is already active on this account.","success");return}
    showPricingNotice("Opening secure Stripe Checkout…");
    if(proPlanBtn)proPlanBtn.disabled=true;
    try{
      const response=await fetch("/api/create-checkout-session",{
        method:"POST",
        headers:authHeaders({"Content-Type":"application/json"}),
        body:JSON.stringify({cycle})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Stripe Checkout is not configured yet.");
      if(!data.url)throw new Error("Stripe did not return a Checkout URL.");
      window.location.assign(data.url);
    }catch(error){showPricingNotice(error.message||"Checkout could not start.","error")}
    finally{if(proPlanBtn)proPlanBtn.disabled=false}
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
  if(proPlanBtn)proPlanBtn.addEventListener("click",()=>startCheckout(proPlanBtn.dataset.cycle||"monthly"));
  if(aiUpgradeBtn)aiUpgradeBtn.addEventListener("click",()=>switchPage("pricing"));
  if(ghostUpgradeBtn)ghostUpgradeBtn.addEventListener("click",()=>{if(!isSignedIn())openAuthModal("login");else switchPage("pricing")});
  if(manageBillingBtn)manageBillingBtn.addEventListener("click",openBillingPortal);

  const checkoutState=new URLSearchParams(window.location.search).get("checkout");
  if(checkoutState==="success"){
    setTimeout(()=>{switchPage("pricing");showPricingNotice("Payment received. Your Pro access is being confirmed securely.","success");refreshAccountStatus()},900);
    history.replaceState({},"",window.location.pathname);
  }else if(checkoutState==="cancelled"){
    setTimeout(()=>{switchPage("pricing");showPricingNotice("Checkout was cancelled. No payment was taken.")},500);
    history.replaceState({},"",window.location.pathname);
  }

  window.CyberNetAccount={appState,refreshAccountStatus,startCheckout,isPro,isSignedIn,openAuthModal,authHeaders,updateAccountUI};

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
  function normalizeText(text){return String(text||"").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/[‐‑‒–—]/g,"-").replace(/\s+/g," ").trim().toLowerCase()}
  function deobfuscate(text){return text.replace(/0/g,"o").replace(/[1!|]/g,"i").replace(/3/g,"e").replace(/4/g,"a").replace(/5/g,"s").replace(/7/g,"t").replace(/@/g,"a").replace(/\$/g,"s")}
  function hasTerm(variants,terms){return terms.some(term=>variants.some(v=>v.includes(term)))}
  function createState(){return{raw:0,signals:new Set(),reasons:[],counterEvidence:[],types:[],categories:new Set(),strong:0,limitations:[]}}
  function addSignal(state,id,weight,reason,type="",category="",strong=false){
    if(state.signals.has(id))return;
    state.signals.add(id);state.raw+=weight;state.reasons.push(reason);
    if(type)state.types.push(type);if(category)state.categories.add(category);if(strong)state.strong++;
  }
  function nonlinearScore(raw){return clamp(Math.round(100*(1-Math.exp(-Math.max(0,raw)/78))))}

  function getDanger(score,uncertain=false){
    if(uncertain)return{label:"Needs Review",css:"uncertain"};
    if(score>=85)return{label:"Critical Risk",css:"danger"};
    if(score>=60)return{label:"High Risk",css:"danger"};
    if(score>=32)return{label:"Medium Risk",css:"warning"};
    return{label:"Low Visible Risk",css:"safe"};
  }

  function showReport(resultBox,score,scamType,reasons,advice,meta={}){
    const uncertain=Boolean(meta.uncertain||meta.verdict==="inconclusive");
    const confidence=clamp(meta.confidence??(uncertain?45:75));
    const danger=getDanger(score,uncertain);
    const colorMap={danger:"#ff6b6b",warning:"#ffcf6b",safe:"#3ffa8b",uncertain:"#a78bfa"};
    const barColor=colorMap[danger.css];
    const confidenceText=confidence>=82?"High confidence":confidence>=58?"Moderate confidence":"Limited confidence";
    const verdictNote=meta.note||(uncertain
      ?"CyberNet AI found mixed or incomplete evidence. Treat this as unverified until you confirm it through an official source."
      :"This assessment combines visible evidence and available analysis services. No scanner can guarantee that unknown content is safe.");
    const sourceLabels=unique(meta.sources||[]);
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add(`result-has-${danger.css}`);
    resultBox.innerHTML=`<div class="scan-report">
      <div class="report-top-row">
        <span class="risk-badge risk-${danger.css}">${danger.label}</span>
        <span class="scam-type-tag">${escapeHTML(scamType)}</span>
        <span class="score-display">${clamp(Math.round(score))}<span>/100</span></span>
      </div>
      <div class="risk-meter-wrap"><div class="risk-meter-bar" style="background:${barColor};box-shadow:0 0 10px ${barColor}80"></div></div>
      <div class="analysis-confidence"><span>Analysis confidence</span><strong>${confidence}% · ${confidenceText}</strong></div>
      ${sourceLabels.length?`<div class="analysis-sources">${sourceLabels.map(x=>`<span>${escapeHTML(x)}</span>`).join("")}</div>`:""}
      <div class="verdict-note ${uncertain?"verdict-uncertain":""}"><span>${uncertain?"◈":"ⓘ"}</span><p>${escapeHTML(verdictNote)}</p></div>
      ${unique(meta.counterEvidence||[]).length?`<div class="counter-evidence"><strong>Evidence that lowers risk</strong><ul>${unique(meta.counterEvidence||[]).slice(0,5).map(item=>`<li>${escapeHTML(item)}</li>`).join("")}</ul></div>`:""}
      <div class="report-body">
        <div class="report-col"><div class="report-col-title"><span class="col-warn">⚠</span> Evidence &amp; Warning Signs</div><ul class="report-list">${unique(reasons).slice(0,10).map(r=>`<li>${escapeHTML(r)}</li>`).join("")}</ul></div>
        <div class="report-col"><div class="report-col-title"><span class="col-safe">→</span> Recommended Actions</div><ul class="report-list safe-list">${unique(advice).slice(0,8).map(a=>`<li>${escapeHTML(a)}</li>`).join("")}</ul></div>
      </div>
    </div>`;
    requestAnimationFrame(()=>{const bar=resultBox.querySelector(".risk-meter-bar");if(bar)setTimeout(()=>{bar.style.width=clamp(score)+"%"},60)});
  }

  function runScan(btn,resultBox,cb,delay=420){
    const orig=btn.innerHTML;btn.innerHTML=`<span class="btn-spinner"></span> analyzing…`;btn.disabled=true;
    resultBox.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">analyzing</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;
    setTimeout(async()=>{try{await cb()}finally{btn.innerHTML=orig;btn.disabled=false}},delay);
  }

  function analyzeTextRules(text){
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
      {id:"finance",terms:["wire transfer","bank transfer","payment","refund","invoice","crypto","bitcoin","wallet","gift cards","western union","deposit","tax payment","virement","paiement","remboursement","facture","تحويل مصرفي","دفعة","استرداد","فاتورة","عملات رقمية","محفظة"],weight:9,reason:"Mentions money, banking, payment, refund, or crypto activity.",type:"Financial scam",category:"money"},
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
    ];
    groups.forEach(g=>{if(hasTerm(variants,g.terms))addSignal(state,g.id,g.weight,g.reason,g.type,g.category,g.strong)});

    const protective=/\b(never share|do not share|don't share|we will never ask|do not click|don't click|ignore suspicious|security tip|fraud warning|protect yourself|ne partagez jamais|ne cliquez pas|conseil de sécurité|لا تشارك|لن نطلب منك|لا تضغط|تحذير أمني)\b/iu.test(clean);
    const relationalSecretRequest=/\b(send me|send us|reply with|provide us|provide me|share with me|share with us|tell me|envoyez-nous|envoyez-moi|répondez avec|أرسل لي|أرسل لنا|شارك معي|شارك معنا)\b.{0,65}\b(password|otp|code|pin|card|cvv|account number|seed phrase|recovery phrase|mot de passe|رمز|كلمة المرور|رقم البطاقة|عبارة الاسترداد)\b/iu.test(clean);
    const imperativeSecretRequest=/\b(send|share|provide|enter|type|submit|confirm|verify|envoyer|partager|saisir|أرسل|شارك|أدخل|أكد|تحقق)\b.{0,20}\b(your|the|votre|ton|رمز|كلمة|رقم)\b.{0,45}\b(password|otp|code|pin|card|cvv|account number|seed phrase|recovery phrase|mot de passe|رمز|كلمة المرور|رقم البطاقة|عبارة الاسترداد)\b/iu.test(clean);
    const directSecretRequest=relationalSecretRequest||(!protective&&imperativeSecretRequest);
    if(protective&&!directSecretRequest){state.raw-=22;state.counterEvidence.push("The wording appears to warn the reader not to share information or follow suspicious instructions.")}
    if(/\b(this is a test|training example|security awareness|example of phishing|sample scam|educational purposes|simulation|exemple de phishing|تدريب توعوي|مثال احتيال)\b/iu.test(clean)){state.raw-=22;state.counterEvidence.push("The text identifies itself as training, simulation, or an educational example.")}

    if(urls.length)addSignal(state,"links",Math.min(14,5+urls.length*3),`Contains ${urls.length} visible web link${urls.length>1?"s":""}.`,"Link-based social engineering","action");
    if(!protective&&/\b(click|tap|open|visit|scan|cliquez|ouvrez|اضغط|انقر|امسح)\b.{0,55}\b(link|url|qr|button|lien|الرابط|رمز)\b/iu.test(clean))addSignal(state,"link-pressure",18,"Directly pressures the recipient to open a link or scan a QR code.","Phishing call-to-action","action",true);
    if(directSecretRequest)addSignal(state,"secret-request",52,"Explicitly asks for credentials, authentication codes, payment details, or a recovery phrase.","Credential theft attempt","credentials",true);
    if(/\b(buy|purchase|pay with|send|transfer)\b.{0,55}\b(gift card|bitcoin|crypto|usdt|western union|moneygram|voucher)\b/i.test(clean))addSignal(state,"irreversible-payment",39,"Requests an unusual or difficult-to-reverse payment method.","Payment scam","money",true);
    if(!protective&&/\b(download|install|enable macros|run this file|sideload|disable antivirus|turn off defender)\b/i.test(clean))addSignal(state,"install",38,"Requests software execution or asks the user to weaken device security.","Malware delivery attempt","device",true);
    if(/\b(dear customer|dear user|valued customer|account holder|cher client|عزيزي العميل|مستخدمنا العزيز)\b/iu.test(clean))addSignal(state,"generic-greeting",4,"Uses a generic greeting instead of identifying the recipient.","Possible bulk phishing","impersonation");
    if(countMatches(raw,/!/g)>=4)addSignal(state,"punctuation",4,"Uses excessive exclamation marks to create pressure.","Manipulative language","style");
    if(countMatches(raw,/[A-Z]{5,}/g)>=2)addSignal(state,"caps",4,"Uses repeated all-capital words for alarm or urgency.","Manipulative language","style");
    if(countMatches(raw,/[$€£]\s?\d|\d+\s?(usd|eur|gbp|dollars?|euros?)/gi)>=1)addSignal(state,"amount",5,"Includes a specific monetary amount.","Financial request","money");
    if(phones.length&&hasTerm(variants,["support","call now","helpline","microsoft","apple","bank","اتصل","الدعم"]))addSignal(state,"support-phone",19,"Provides a phone number in a support or security-alert context.","Tech-support / vishing scam","impersonation",true);
    if(emails.some(e=>/@(gmail|yahoo|outlook|hotmail|protonmail)\./i.test(e))&&hasTerm(variants,["bank","support","security team","government","microsoft","apple","paypal","البنك","الدعم"]))addSignal(state,"public-email",25,"Claims to represent an organization while using a public email provider.","Brand impersonation","impersonation",true);
    if(/\b(paypal|microsoft|apple|google|amazon|netflix|instagram|facebook|whatsapp|dhl|fedex|bank)\b/i.test(clean)&&hasTerm(variants,["verify","locked","suspended","refund","security alert","تحقق","موقوف","استرداد"]))addSignal(state,"brand-pressure",18,"Combines a well-known brand with account or payment pressure.","Brand impersonation phishing","impersonation");
    if(hiddenChars)addSignal(state,"hidden-chars",16,"Contains hidden bidirectional or zero-width Unicode characters that can disguise content.","Obfuscated phishing","style",true);

    let highestEmbedded=null;
    for(const value of urls.slice(0,4)){
      const linkResult=analyzeLinkRules(value);
      if(!highestEmbedded||linkResult.score>highestEmbedded.score)highestEmbedded=linkResult;
    }
    if(highestEmbedded?.score>=60)addSignal(state,"dangerous-embedded-link",34,`An embedded link has high-risk structural indicators: ${highestEmbedded.reasons[0]||highestEmbedded.scamType}.`,"Message carrying a suspicious link","action",true);
    else if(highestEmbedded?.score>=32)addSignal(state,"suspicious-embedded-link",18,"An embedded link contains multiple suspicious structural indicators.","Message carrying an unverified link","action");
    if(highestEmbedded?.registeredDomain)state.reasons.push(`Most suspicious visible destination: ${highestEmbedded.registeredDomain}.`);

    const combo=(id,needs,weight,reason,type,category)=>{if(needs.every(x=>state.signals.has(x)))addSignal(state,id,weight,reason,type,category,true)};
    combo("credential-chain",["credentials","urgency","links"],28,"Combines account pressure, urgency, and a clickable link.","Credential phishing","credentials");
    combo("otp-chain",["otp","urgency"],18,"Combines authentication-code language with urgency.","OTP theft scam","credentials");
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
    const uncertain=veryShort||(lowEvidence&&!protective)||(score>=22&&score<=50&&confidence<65);
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
    const verdict=uncertain?"inconclusive":score>=85?"malicious":score>=55?"suspicious":"low_risk";
    const scamType=protective&&score<=14&&state.strong===0?"Security guidance / low visible risk":state.types.at(-1)||(uncertain?"Inconclusive text analysis":"No dominant threat type");
    return{score,scamType,reasons:[...state.reasons,...state.limitations],counterEvidence:state.counterEvidence,advice,uncertain,confidence,verdict,sources:["Local language engine",...(highestEmbedded?["Embedded-link engine"]:[])],note:uncertain?"CyberNet AI does not have enough reliable context to make a confident classification. This is unverified, not confirmed safe.":"CyberNet AI evaluated language, requested actions, pressure tactics, sensitive-data requests, impersonation, embedded links, and multi-signal combinations."};
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
    const labels=host.split(".").filter(Boolean);if(labels.length<=2)return host;
    const compound=new Set(["co.uk","org.uk","gov.uk","com.au","net.au","co.nz","com.br","com.tr","com.lb","com.cy","co.jp","co.in","com.sg","com.cn","com.hk","com.mx"]);
    const tail2=labels.slice(-2).join(".");return compound.has(tail2)?labels.slice(-3).join("."):tail2;
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
    const shorteners=new Set(["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly","rebrand.ly","shorturl.at","tiny.one","rb.gy"]);
    const riskyTlds=new Set(["xyz","top","click","zip","mov","review","country","work","support","live","cam","gq","tk","ml","cf","buzz","rest","fit","quest","monster","download"]);
    const brands={paypal:"paypal.com",microsoft:"microsoft.com",apple:"apple.com",google:"google.com",amazon:"amazon.com",netflix:"netflix.com",instagram:"instagram.com",facebook:"facebook.com",whatsapp:"whatsapp.com",dropbox:"dropbox.com",dhl:"dhl.com",fedex:"fedex.com",adobe:"adobe.com",coinbase:"coinbase.com",binance:"binance.com",icloud:"icloud.com"};
    const officialBrand=Object.entries(brands).find(([,domain])=>registered===domain);

    if(!hadScheme)addSignal(state,"missing-scheme",4,"The protocol was omitted; CyberNet AI assumed HTTPS for parsing.","Unverified URL","structure");
    if(isPrivateHost(host))addSignal(state,"private-host",32,"Points to localhost, a private network, or a link-local address rather than a public website.","Private-network destination","structure",true);
    if(host.endsWith("."))addSignal(state,"trailing-dot",8,"Uses a trailing dot after the hostname, which can make domain comparisons confusing.","Domain-format deception","deception");
    if(url.protocol!=="https:")addSignal(state,"http",18,"Does not use HTTPS encryption.","Insecure web link","transport");
    if(original.includes("@")||url.username||url.password)addSignal(state,"userinfo",42,"Contains '@' or embedded credentials, which can disguise the actual destination.","URL destination deception","deception",true);
    if(shorteners.has(registered))addSignal(state,"shortener",28,"Uses a URL-shortening service that hides the final destination.","Hidden destination link","deception",true);
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||/^\[[0-9a-f:]+\]$/i.test(url.hostname))addSignal(state,"ip",34,"Uses a raw IP address instead of a normal domain name.","IP-based phishing link","structure",true);
    if(host.includes("xn--"))addSignal(state,"punycode",31,"Uses Punycode, which may imitate letters from a trusted domain.","Lookalike-domain phishing","deception",true);
    if(/[\u0080-\uffff]/.test(host))addSignal(state,"unicode",25,"Contains internationalized characters that may visually imitate another domain.","Lookalike-domain phishing","deception",true);
    if(labels.length>=5)addSignal(state,"subdomains",13,"Uses an unusually deep subdomain chain.","Subdomain deception","structure");
    if((registered.match(/-/g)||[]).length>=3)addSignal(state,"hyphens",11,"The registered domain contains many hyphens.","Suspicious domain structure","structure");
    if(hostnameEntropy(domainCore)>3.65&&domainCore.length>=14)addSignal(state,"entropy",13,"The main domain label looks randomly generated or unusually complex.","Algorithmic-looking domain","structure");
    if(/^(?:0x[0-9a-f]+|\d{8,})$/i.test(host))addSignal(state,"encoded-ip",35,"The hostname resembles an encoded numeric IP address.","Obfuscated IP destination","deception",true);
    if(full.length>135)addSignal(state,"long",12,"The URL is unusually long and difficult to inspect.","Obfuscated URL","structure");
    if(url.port&&!['80','443'].includes(url.port))addSignal(state,"port",12,`Uses the uncommon network port ${url.port}.`,"Unusual service port","structure");
    if(riskyTlds.has(labels.at(-1)))addSignal(state,"tld",18,`Uses the higher-risk .${labels.at(-1)} domain extension.`,"Suspicious domain extension","structure");
    if(countMatches(full,/%[0-9a-f]{2}/gi)>=4)addSignal(state,"encoding",13,"Uses heavy URL encoding that makes the destination harder to read.","Encoded URL","deception");
    if(containsAny(pathQuery,["login","signin","verify","verification","account","password","secure-update","wallet-connect","unlock-account"]))addSignal(state,"credential-path",18,"The path asks for login, verification, account, password, or wallet action.","Credential phishing link","credentials");
    if(containsAny(pathQuery,["free","gift","claim","prize","winner","airdrop","bonus","reward"]))addSignal(state,"reward-path",15,"The path promotes a prize, gift, bonus, reward, or airdrop.","Prize / crypto scam link","reward");
    if(/\.(exe|scr|msi|apk|bat|cmd|ps1|js|jar|iso|img|zip|rar|7z)(?:$|[?#])/i.test(url.pathname))addSignal(state,"download",48,"Points directly to an executable, script, disk image, or archive download.","Malware delivery link","malware",true);
    if(containsAny(full,["redirect=","url=","target=","continue=","next=","dest=","returnurl=","return_to="])&&/https?%3a|https?:\/\//i.test(full))addSignal(state,"redirect",23,"Contains a nested redirect destination that may send visitors elsewhere.","Redirect-based phishing","deception",true);
    try{const decoded=decodeURIComponent(full);if(decoded!==full&&/https?:\/\/[^\s]+https?:\/\//i.test(decoded))addSignal(state,"double-url",24,"Decoding reveals more than one web destination inside the URL.","Nested destination deception","deception",true)}catch{}
    if(/[?&](email|user|username|phone|card|account)=/i.test(url.search)&&state.categories.has("credentials"))addSignal(state,"prefill-identity",12,"Pre-fills identity or account information on a credential-related page.","Targeted credential page","credentials");
    if(/[?&](token|session|auth|password|pass|otp|code|key)=/i.test(url.search))addSignal(state,"secrets-query",24,"Places authentication-like information in the query string.","Credential-bearing URL","credentials",true);

    Object.entries(brands).forEach(([brand,official])=>{
      if((host.includes(brand)||pathQuery.includes(brand))&&registered!==official)addSignal(state,`brand-${brand}`,35,`References “${brand}” but the registered domain is ${registered}, not ${official}.`,"Brand impersonation phishing","impersonation",true);
      const core=registered.split(".")[0];const d=levenshtein(core,brand);
      if(registered!==official&&brand.length>=5&&d>0&&d<=1)addSignal(state,`typo-${brand}`,37,`The domain is one character away from the brand “${brand}”.`,"Typosquatting phishing","impersonation",true);
    });
    if(/[a-z]\d[a-z]|\d[a-z]{2,}|[a-z]{2,}\d/i.test(registered.split(".")[0])&&state.categories.has("impersonation"))addSignal(state,"substitution",16,"Uses letter-number substitutions commonly found in lookalike domains.","Typosquatting phishing","impersonation",true);

    let score=nonlinearScore(state.raw);
    if(state.strong>=2)score=Math.max(score,83);else if(state.strong===1)score=Math.max(score,58);
    if(officialBrand&&state.signals.size===0)score=2;
    if(!state.signals.size&&!officialBrand)score=7;
    const confidence=clamp(48+state.categories.size*8+state.strong*10+(hadScheme?4:0),35,97);
    const uncertain=!state.strong&&score<32&&!officialBrand;
    const counterEvidence=[];
    if(url.protocol==="https:")counterEvidence.push("The link uses HTTPS, which protects transport but does not prove the site is legitimate.");
    if(officialBrand)counterEvidence.push(`The visible registered domain exactly matches ${officialBrand[1]}.`);
    if(labels.length<=3&&!host.includes("xn--")&&!state.signals.has("entropy")&&!state.signals.has("hyphens"))counterEvidence.push("The visible hostname is relatively simple and does not use Punycode.");
    if(!state.reasons.length)state.reasons.push(officialBrand?`The visible registered domain matches ${officialBrand[1]}.`:"No strong suspicious pattern was found in the visible URL structure.");
    const advice=[
      "Do not open the link when the sender or context is unexpected.",
      `Verify that the registered domain is exactly “${registered}”.`,
      "Open the official website manually or use a trusted bookmark.",
      "Never enter passwords, OTP codes, payment details, or wallet recovery phrases on an unverified page.",
      "A structural scan cannot prove a page is safe without live reputation and destination-content checks."
    ];
    const verdict=uncertain?"inconclusive":score>=85?"malicious":score>=58?"suspicious":"low_risk";
    return{score,scamType:state.types.at(-1)||(uncertain?"Inconclusive link analysis":officialBrand?"Official-looking domain structure":"No dominant URL threat type"),reasons:state.reasons,counterEvidence,advice,uncertain,confidence,verdict,sources:["Local URL engine"],registeredDomain:registered,note:uncertain?"No decisive visible URL pattern was found. The link remains unverified until live reputation and destination checks complete.":officialBrand?"The visible domain matches a known official domain, but this does not verify the sender, page content, redirects, or account context.":"CyberNet AI evaluated the URL scheme, registered domain, lookalike patterns, path, query parameters, redirects, downloads, and brand impersonation."};
  }

  function analyzeImageRules(file,details={}){
    const state=createState(),name=normalizeText(file?.name||"");
    if(containsAny(name,["qr","scan","qrcode"]))addSignal(state,"filename-qr",9,"The filename suggests QR-code content.","Possible QR-code content","qr");
    if(containsAny(name,["bank","payment","invoice","receipt","crypto","wallet","refund"]))addSignal(state,"filename-money",8,"The filename suggests payment, banking, invoice, or crypto content.","Possible payment image","money");
    if(containsAny(name,["login","account","verify","security","password","otp"]))addSignal(state,"filename-login",9,"The filename suggests login, account, or verification content.","Possible login image","credentials");
    if(details.qrData)addSignal(state,"decoded-qr",32,`A QR code was decoded${details.qrData.length?`: ${details.qrData.slice(0,90)}${details.qrData.length>90?"…":""}`:"."}`,"QR code content","qr",true);
    if(details.width&&details.height){
      const megapixels=(details.width*details.height)/1e6;
      if(megapixels>20)state.limitations.push("The uploaded image was downscaled for efficient analysis.");
    }
    const score=details.qrResult?details.qrResult.score:nonlinearScore(state.raw);
    const reasons=details.qrResult?unique([...state.reasons,...details.qrResult.reasons]):unique([...state.reasons,"Local image analysis can reliably inspect file properties and QR codes, but not all visible text, logos, or layout details.",...state.limitations]);
    const advice=details.qrResult?details.qrResult.advice:["Do not scan unknown QR codes or follow instructions shown only in a screenshot.","Verify payments, alerts, and login requests through the official app or website.","Do not call phone numbers or install software shown in suspicious popups.","Use the secure deep-analysis service for visual text, logo, and impersonation inspection."];
    return{score,scamType:details.qrResult?.scamType||state.types.at(-1)||"Unverified image content",reasons,advice,uncertain:details.qrResult?details.qrResult.uncertain:true,confidence:details.qrResult?Math.max(details.qrResult.confidence||0,78):(details.qrData?62:28),verdict:details.qrResult?.verdict||"inconclusive",sources:["Local image checks",...(details.qrData?["QR decoder"]:[])],note:details.qrResult?"CyberNet AI decoded the QR code and evaluated its content. Deep image analysis may add visible-text and impersonation evidence.":"CyberNet AI could not confidently inspect every visual element locally. The result is intentionally inconclusive until deep image analysis is available."};
  }

  function normalizeServerResult(data){
    const r=data?.analysis||data;
    if(!r||typeof r!=="object")return null;
    const verdict=String(r.verdict||"inconclusive").toLowerCase();
    return{score:clamp(r.score),confidence:clamp(r.confidence),scamType:r.threatType||r.scamType||"Deep security analysis",reasons:unique([...(r.evidence||r.reasons||[]),...(r.limitations||[])]),counterEvidence:unique(r.counterEvidence||[]),advice:unique(r.actions||r.advice||[]),uncertain:verdict==="inconclusive",verdict,sources:unique([...(data?.aiUsed?["Secure AI analysis"]:[]),...(data?.reputation?.checked?["Live URL reputation"]:[])]),note:r.summary||r.note||"Secure deep analysis completed.",reputation:data?.reputation||null};
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
    const agreement=local.verdict===deep.verdict&&!local.uncertain&&!deep.uncertain;
    const confidence=clamp(Math.max(deep.confidence,Math.round((local.confidence+deep.confidence)/2))+(agreement?5:0)+(reputationHit?6:0)-(disagreement?18:0));
    const uncertain=reputationHit?false:(disagreement||deep.verdict==="inconclusive"||(deep.uncertain&&local.uncertain));
    return{score,confidence,scamType:reputationHit?"Known unsafe URL":(deep.scamType||local.scamType),reasons:unique([...(deep.reasons||[]),...(local.reasons||[])]),counterEvidence:unique([...(deep.counterEvidence||[]),...(local.counterEvidence||[])]),advice:unique([...(deep.advice||[]),...(local.advice||[])]),uncertain,verdict:reputationHit?"malicious":uncertain?"inconclusive":deep.verdict,sources:unique([...(local.sources||[]),...(deep.sources||[])]),note:reputationHit?"The live reputation service matched this URL to a known unsafe resource.":disagreement?"The local and deep-analysis layers disagree, so CyberNet AI is intentionally marking this result for review.":deep.note||local.note,reputation:deep.reputation};
  }
  async function requestDeepAnalysis(type,content,localResult,imageData=""){
    if(!isSignedIn()){
      openAuthModal("signup");
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
        body:JSON.stringify({type,content,imageData,localResult}),
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
    if(result.uncertain)return{label:"Needs Review",cls:"risk-tag-warning"};
    if(result.score>=60)return{label:"High Risk",cls:"risk-tag-danger"};
    if(result.score>=32)return{label:"Medium Risk",cls:"risk-tag-warning"};
    return{label:"Low Visible Risk",cls:"risk-tag-safe"};
  }

  if(cyberTextBtn&&cyberTextInput&&cyberTextResult)cyberTextBtn.addEventListener("click",()=>{
    const text=cyberTextInput.value.trim();if(!text){cyberTextResult.innerHTML=`<span class="warning">Paste a suspicious message first.</span>`;return}
    const ring=document.getElementById("textScanRing"),label=document.getElementById("textScanLabel"),status=document.getElementById("textScanStatus");
    cyberTextBtn.disabled=true;
    const duration=window.matchMedia?.("(pointer: coarse)").matches?650:900;
    animateScanRing(ring,label,status,duration,async()=>{
      const result=analyzeTextRules(text);
      showReport(cyberTextResult,result.score,result.scamType,result.reasons,result.advice,{...result,note:"Local protection scan complete. Use the CyberNet AI page for account-based AI analysis."});
      prependScan("textScanList",`“${text.slice(0,42)}${text.length>42?"…":""}”`,result);
      if(status)status.textContent="Local scan complete";
      cyberTextBtn.disabled=false;
    });
  });

  /* ─── CyberNet Link ─── */
  const cyberLinkInput=document.getElementById("cyberLinkInput"),cyberLinkResult=document.getElementById("cyberLinkResult"),cyberLinkBtn=document.getElementById("cyberLinkBtn");
  if(cyberLinkBtn&&cyberLinkInput&&cyberLinkResult)cyberLinkBtn.addEventListener("click",()=>{
    const link=cyberLinkInput.value.trim();if(!link){cyberLinkResult.innerHTML=`<span class="warning">Paste a suspicious link first.</span>`;return}
    runScan(cyberLinkBtn,cyberLinkResult,async()=>{
      const result=analyzeLinkRules(link);
      showReport(cyberLinkResult,result.score,result.scamType,result.reasons,result.advice,{...result,note:"Local structural URL scan complete. Use the CyberNet AI page for account-based AI analysis."});
      prependScan("linkScanList",link.slice(0,52),result);
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
  async function compressImage(file,maxSide=1280,quality=.8){
    const mobile=window.matchMedia?.("(max-width: 700px)").matches;
    const image=await imageToCanvas(file,mobile?900:maxSide);return image.canvas.toDataURL("image/jpeg",mobile ? .72 : quality);
  }
  async function handleCyberImage(file){
    if(!file||!cyberImageResult)return;
    if(!file.type.startsWith("image/")){cyberImageResult.innerHTML=`<span class="warning">Please upload a JPG, PNG, or WEBP image.</span>`;return}
    if(file.size>10*1024*1024){cyberImageResult.innerHTML=`<span class="warning">The image must be smaller than 10 MB.</span>`;return}
    if(cyberDropZone){const old=cyberDropZone.querySelector(".upload-preview");old?.remove();const preview=document.createElement("div");preview.className="upload-preview";const url=URL.createObjectURL(file);preview.innerHTML=`<img src="${url}" alt="Uploaded preview" decoding="async"><span class="upload-preview-label">${escapeHTML(file.name)}</span>`;preview.querySelector("img").onload=()=>URL.revokeObjectURL(url);cyberDropZone.appendChild(preview)}
    cyberImageResult.innerHTML=`<div class="scanning-placeholder"><span class="scanning-placeholder-text">Inspecting QR and visual signals</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`;
    const decoded=await decodeQRFromFile(file);
    let qrResult=null;
    if(decoded.qrData){const looksLikeUrl=/^https?:\/\//i.test(decoded.qrData)||/^[a-z0-9.-]+\.[a-z]{2,}/i.test(decoded.qrData);if(looksLikeUrl)qrResult=analyzeLinkRules(/^https?:\/\//i.test(decoded.qrData)?decoded.qrData:`https://${decoded.qrData}`)}
    const result=analyzeImageRules(file,{...decoded,qrResult});
    showReport(cyberImageResult,result.score,result.scamType,result.reasons,result.advice,{...result,note:"Local QR and file checks complete. Use the CyberNet AI page for account-based visual AI analysis."});
    prependScan("imageScanList",file.name,result);
  }
  if(cyberImageInput)cyberImageInput.addEventListener("change",()=>handleCyberImage(cyberImageInput.files[0]));
  if(cyberDropZone&&cyberImageInput){
    cyberDropZone.addEventListener("dragover",e=>{e.preventDefault();cyberDropZone.classList.add("drag-over")});
    cyberDropZone.addEventListener("dragleave",()=>cyberDropZone.classList.remove("drag-over"));
    cyberDropZone.addEventListener("drop",e=>{e.preventDefault();cyberDropZone.classList.remove("drag-over");const f=e.dataTransfer.files[0];if(f)handleCyberImage(f)});
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
  const chatMessages=document.getElementById("chatMessages"),chatInput=document.getElementById("chatInput"),chatSendBtn=document.getElementById("chatSendBtn"),chatInputRowText=document.getElementById("chatInputRowText"),chatInputRowImage=document.getElementById("chatInputRowImage"),aiImageInput=document.getElementById("aiImageInput");
  let currentChatMode="text";
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

  async function analyzeChat(type,content,imageData=""){
    if(!canStartAiAnalysis())return;
    const local=type==="link"?analyzeLinkRules(content):type==="image"?analyzeImageRules({name:"uploaded-image",size:0},{qrData:""}):analyzeTextRules(content);
    const thinking=addChatBubble("ai",`<div class="scanning-placeholder"><span class="scanning-placeholder-text">Running secure ${isPro()?"advanced ":""}analysis</span><div class="scan-dots"><span></span><span></span><span></span></div></div>`);
    const inner=thinking?.querySelector(".chat-bubble-inner");
    try{
      const deep=await requestDeepAnalysis(type,content,local,imageData);
      const result=mergeAnalysis(local,deep);
      if(inner){
        showReport(inner,result.score,result.scamType,result.reasons,result.advice,result);
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
      if(inner)inner.innerHTML=`<span class="warning">${escapeHTML(error.message||"Analysis failed.")}</span>${error.code==="daily_limit_reached"?'<button class="report-download-btn" data-upgrade-now>Upgrade to Pro</button>':""}`;
    }
    if(chatMessages)chatMessages.scrollTop=chatMessages.scrollHeight;
  }
  function sendChatMessage(){
    const text=chatInput?.value.trim();if(!text)return;
    if(!canStartAiAnalysis())return;
    addChatBubble("user",escapeHTML(text));chatInput.value="";analyzeChat(currentChatMode==="link"?"link":"text",text);
  }
  if(chatSendBtn)chatSendBtn.addEventListener("click",sendChatMessage);
  if(chatInput)chatInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();sendChatMessage()}});
  if(chatMessages)chatMessages.addEventListener("click",event=>{if(event.target.closest("[data-upgrade-now]"))switchPage("pricing")});
  if(aiImageInput)aiImageInput.addEventListener("change",async()=>{
    const file=aiImageInput.files[0];if(!file)return;
    if(!canStartAiAnalysis()){aiImageInput.value="";return}
    if(file.size>10*1024*1024){addChatBubble("ai",`<span class="warning">Please upload an image smaller than 10 MB.</span>`);return}
    addChatBubble("user",`📎 ${escapeHTML(file.name)}`);let b64="";try{b64=await compressImage(file)}catch{};analyzeChat("image",file.name,b64);
  });
  document.querySelectorAll(".chat-tab").forEach(tab=>tab.addEventListener("click",()=>{
    document.querySelectorAll(".chat-tab").forEach(t=>t.classList.remove("active"));tab.classList.add("active");currentChatMode=tab.dataset.chat;
    if(chatInputRowText)chatInputRowText.style.display=currentChatMode==="image"?"none":"flex";
    if(chatInputRowImage)chatInputRowImage.style.display=currentChatMode==="image"?"flex":"none";
    if(chatInput)chatInput.placeholder=currentChatMode==="link"?"Paste a suspicious link…":"Paste a suspicious message…";
  }));

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
  (function initMagneticButtons(){
    const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse=window.matchMedia&&window.matchMedia("(pointer: coarse)").matches;
    const saveData=Boolean(navigator.connection?.saveData);
    if(reduceMotion||coarse||saveData)return;
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

  /* ─── Pricing monthly/yearly toggle ─── */
  (function initPricingToggle(){
    const toggle=document.getElementById("pricingToggle");
    const proButton=document.getElementById("proPlanBtn");
    const equivalent=document.getElementById("billingEquivalent");
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



  /* ─── GhostScan coming-soon experience ─── */
  (function initGhostComingSoon(){
    const coming=document.getElementById("ghostComingSoon");
    const scanBtn=document.getElementById("ghostScanBtn");
    const uploadBtn=document.getElementById("ghostUploadBtn");
    const urlInput=document.getElementById("ghostUrlInput");
    const serviceText=document.getElementById("ghostServiceText");
    const serviceLine=document.getElementById("ghostServiceLine");
    if(!coming)return;
    if(serviceText)serviceText.textContent="Preview available · Full isolated browser is in development";
    if(serviceLine)serviceLine.classList.add("ghost-service-development");
    const revealComing=event=>{
      event?.preventDefault?.();
      event?.stopImmediatePropagation?.();
      coming.scrollIntoView({behavior:"smooth",block:"start"});
    };
    scanBtn?.addEventListener("click",revealComing,true);
    uploadBtn?.addEventListener("click",revealComing,true);
    urlInput?.addEventListener("keydown",event=>{if(event.key==="Enter")revealComing(event)},true);
  })();

  /* ═══════════════════════════════════════════════════════
     GHOSTSCAN — ISOLATED BROWSER INVESTIGATION
     ═══════════════════════════════════════════════════════ */
  (function initGhostScan(){
    const ENDPOINT="/api/ghostscan";
    const landing=document.getElementById("ghostLanding");
    const workspace=document.getElementById("ghostWorkspace");
    const progressView=document.getElementById("ghostProgressView");
    const resultsView=document.getElementById("ghostResultsView");
    const historyView=document.getElementById("ghostHistoryView");
    const urlInput=document.getElementById("ghostUrlInput");
    const scanBtn=document.getElementById("ghostScanBtn");
    const uploadBtn=document.getElementById("ghostUploadBtn");
    const fileInput=document.getElementById("ghostFileInput");
    const fileName=document.getElementById("ghostFileName");
    const serviceLine=document.getElementById("ghostServiceLine");
    const serviceText=document.getElementById("ghostServiceText");
    if(!landing||!workspace||!scanBtn||!urlInput)return;
    if(document.getElementById("ghostComingSoon"))return;

    let service={online:false,browserEnabled:false,aiEnabled:false,reputationEnabled:false};
    let activeController=null;
    let elapsedTimer=null;
    let progressTimer=null;
    let logClockStart=0;
    let selectedImageData="";
    let selectedImageName="";
    let lastResult=null;

    const els={
      target:document.getElementById("ghostTargetUrl"),
      previewAddress:document.getElementById("ghostPreviewAddress"),
      previewStage:document.getElementById("ghostPreviewStage"),
      logList:document.getElementById("ghostLogList"),
      elapsed:document.getElementById("ghostElapsed"),
      alert:document.getElementById("ghostResultAlert"),
      verdictTitle:document.getElementById("ghostVerdictTitle"),
      verdictSummary:document.getElementById("ghostVerdictSummary"),
      confidence:document.getElementById("ghostConfidenceBadge"),
      meta:document.getElementById("ghostResultMeta"),
      score:document.getElementById("ghostScoreValue"),
      scoreRing:document.querySelector(".ghost-score-ring"),
      riskLabel:document.getElementById("ghostRiskLabel"),
      findings:document.getElementById("ghostFindingsList"),
      actions:document.getElementById("ghostActionsList"),
      limitationsCard:document.getElementById("ghostLimitationsCard"),
      limitations:document.getElementById("ghostLimitationsList"),
      replay:document.getElementById("ghostReplayTrack"),
      replayCount:document.getElementById("ghostReplayCount"),
      desktopShot:document.getElementById("ghostDesktopShot"),
      mobileShot:document.getElementById("ghostMobileShot"),
      noShot:document.getElementById("ghostNoScreenshot"),
      redirects:document.getElementById("ghostRedirectList"),
      domains:document.getElementById("ghostDomainsList"),
      forms:document.getElementById("ghostFormsList"),
      pageInfo:document.getElementById("ghostPageInfo"),
      behavior:document.getElementById("ghostBehaviorList"),
      reputation:document.getElementById("ghostReputationInfo"),
      historyList:document.getElementById("ghostHistoryList")
    };

    function setServiceState(kind,text){
      serviceLine.classList.remove("online","offline");
      if(kind)serviceLine.classList.add(kind);
      serviceText.textContent=text;
    }

    async function checkService(){
      setServiceState("","Checking isolated browser service…");
      try{
        const response=await fetch(ENDPOINT,{headers:{Accept:"application/json"},cache:"no-store"});
        if(!response.ok)throw new Error("Unavailable");
        service=await response.json();
        if(service.browserEnabled){
          setServiceState("online",`Isolated browser online · ${service.provider||"Browserless"}${service.reputationEnabled?" · reputation enabled":""}`);
          scanBtn.disabled=false;
        }else{
          setServiceState("offline","GhostScan needs a Browserless token before real scans can run.");
          scanBtn.disabled=true;
        }
      }catch{
        setServiceState("offline","GhostScan backend is not deployed yet. Local results will never be faked.");
        scanBtn.disabled=true;
      }
    }

    function showLanding(){
      activeController?.abort();
      stopProgress();
      landing.classList.remove("ghost-hidden");
      workspace.classList.add("ghost-hidden");
      progressView.classList.remove("ghost-hidden");
      resultsView.classList.add("ghost-hidden");
      historyView.classList.add("ghost-hidden");
    }

    function showWorkspace(view="progress"){
      landing.classList.add("ghost-hidden");
      workspace.classList.remove("ghost-hidden");
      progressView.classList.toggle("ghost-hidden",view!=="progress");
      resultsView.classList.toggle("ghost-hidden",view!=="results");
      historyView.classList.toggle("ghost-hidden",view!=="history");
      window.scrollTo({top:0,behavior:"auto"});
    }

    function formatTime(ms){
      const total=Math.floor(ms/1000);
      return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
    }

    function log(message,tone=""){
      const now=Date.now();
      const item=document.createElement("div");
      item.className=`ghost-log-item ${tone}`.trim();
      item.innerHTML=`<time>${formatTime(now-logClockStart)}</time><p>${escapeHTML(message)}</p>`;
      els.logList.appendChild(item);
      els.logList.scrollTop=els.logList.scrollHeight;
    }

    function setStep(index){
      document.querySelectorAll("#ghostStepper .ghost-step").forEach((step,i)=>{
        step.classList.toggle("done",i<index);
        step.classList.toggle("active",i===index);
        const badge=step.querySelector("span");
        if(badge)badge.textContent=i<index?"✓":String(i+1);
      });
    }

    function resetProgress(targetLabel){
      logClockStart=Date.now();
      els.logList.innerHTML="";
      els.elapsed.textContent="00:00";
      els.target.textContent=targetLabel||"Image awaiting URL extraction";
      els.previewAddress.textContent="isolated://starting";
      els.previewStage.innerHTML=`<div class="ghost-preview-loader"><div class="ghost-radar"></div><strong>Launching isolated browser</strong><small>No customer cookies or credentials are shared.</small></div>`;
      setStep(0);
      log("Creating a fresh, temporary browser session","safe");
      elapsedTimer=setInterval(()=>{els.elapsed.textContent=formatTime(Date.now()-logClockStart)},1000);
      const scheduled=[
        [900,1,"Validating destination and following redirects"],
        [2400,2,"Rendering desktop and mobile page versions"],
        [4800,3,"Inspecting forms, downloads, permissions, and network activity"],
        [8500,4,"Combining behavior, reputation, and visual evidence"]
      ];
      let pointer=0;
      progressTimer=setInterval(()=>{
        const elapsed=Date.now()-logClockStart;
        while(pointer<scheduled.length&&elapsed>=scheduled[pointer][0]){
          const [,step,message]=scheduled[pointer++];
          setStep(step);
          log(message,step===3?"warn":"");
        }
      },180);
    }

    function stopProgress(){
      clearInterval(elapsedTimer);clearInterval(progressTimer);
      elapsedTimer=null;progressTimer=null;
    }

    function dataUrlFromCanvas(canvas,quality=.78){
      return canvas.toDataURL("image/jpeg",quality);
    }

    async function prepareImage(file){
      if(!file)return;
      if(!file.type.startsWith("image/")||file.size>8*1024*1024){
        fileName.textContent="Please choose a JPG, PNG, or WEBP under 8 MB.";
        selectedImageData="";selectedImageName="";return;
      }
      fileName.textContent=`Preparing ${file.name}…`;
      try{
        const image=await imageToCanvas(file,1200);
        selectedImageData=dataUrlFromCanvas(image.canvas,.76);
        selectedImageName=file.name;
        fileName.textContent=`${file.name} ready · GhostScan will decode its QR or extract the visible URL securely.`;
        urlInput.value="";
      }catch{
        selectedImageData="";selectedImageName="";
        fileName.textContent="This image could not be read.";
      }
    }

    function resultClass(score,uncertain){
      if(uncertain)return "review";
      if(score>=85)return "critical";
      if(score>=60)return "high";
      if(score>=32)return "medium";
      return "low";
    }

    function confidenceWord(value){
      return value>=82?"High":value>=58?"Moderate":"Limited";
    }

    function findingTone(severity){
      return severity==="critical"||severity==="high"?"danger":severity==="medium"?"warn":"";
    }

    function renderFailure(message,details=[]){
      renderResult({
        verdict:"inconclusive",score:0,confidence:95,riskLevel:"Scan Incomplete",threatType:"GhostScan could not complete",
        summary:message,
        findings:[{severity:"medium",title:"No behavioral verdict was generated",detail:"CyberNet AI does not create simulated scan results when the isolated browser is unavailable."}],
        actions:["Do not open the link while the scan is incomplete.","Check that BROWSERLESS_TOKEN is configured in Netlify.","Try again after the isolated browser service is available."],
        limitations:details.length?details:["The remote browser session did not return enough evidence."],
        redirects:[],domains:[],forms:[],behavior:[],page:{},screenshots:{},reputation:{checked:false},durationMs:Date.now()-logClockStart
      },false);
    }

    function renderResult(result,save=true){
      lastResult=result;
      stopProgress();
      setStep(4);
      showWorkspace("results");
      const uncertain=result.verdict==="inconclusive"||result.uncertain;
      const score=clamp(result.score);
      const cls=resultClass(score,uncertain);
      els.alert.className=`ghost-result-alert ${cls}`;
      els.verdictTitle.textContent=result.riskLevel||result.threatType||(uncertain?"Needs Review":"GhostScan Complete");
      els.verdictSummary.textContent=result.summary||"GhostScan completed the isolated investigation.";
      els.confidence.textContent=`Confidence: ${confidenceWord(clamp(result.confidence))} (${clamp(result.confidence)}%)`;
      els.meta.textContent=`Scanned ${new Date(result.completedAt||Date.now()).toLocaleString()} · ${Math.max(1,Math.round((result.durationMs||0)/1000))}s · ${result.provider||"isolated browser"}`;
      els.score.textContent=Math.round(score);
      els.scoreRing?.style.setProperty("--score",`${score}%`);
      els.riskLabel.textContent=uncertain?"Needs Review — not confirmed safe":score>=85?"Critical Risk":score>=60?"High Risk":score>=32?"Medium Risk":"No threat observed";

      const findings=(result.findings||[]).slice(0,10);
      els.findings.innerHTML=findings.length?findings.map(item=>`<div class="ghost-finding ${findingTone(item.severity)}"><span>${item.severity==="high"||item.severity==="critical"?"!":item.severity==="medium"?"◆":"✓"}</span><div><strong>${escapeHTML(item.title||"Finding")}</strong>${escapeHTML(item.detail||"")}</div></div>`).join(""):`<div class="ghost-finding"><span>◈</span><div><strong>No decisive finding</strong>The scan did not collect enough evidence for a confident classification.</div></div>`;
      els.actions.innerHTML=(result.actions||[]).map((item,i)=>`<div class="ghost-action"><span>${i+1}</span><div>${escapeHTML(item)}</div></div>`).join("");
      const limitations=result.limitations||[];
      els.limitationsCard.classList.toggle("ghost-hidden",!limitations.length);
      els.limitations.innerHTML=limitations.map(item=>`<li>${escapeHTML(item)}</li>`).join("");

      const redirects=result.redirects||[];
      const replay=redirects.length?redirects:[{url:result.inputUrl||result.page?.url||"Submitted destination",status:result.page?.status||0,stage:"Original link"}];
      if(result.forms?.some(form=>form.sensitiveFields?.length))replay.push({url:result.forms.find(form=>form.sensitiveFields?.length)?.action||result.page?.url,stage:"Sensitive form detected",detail:"The page requests credentials or financial information."});
      els.replayCount.textContent=`${replay.length} step${replay.length===1?"":"s"}`;
      els.replay.innerHTML=replay.slice(0,10).map((item,i)=>`<div class="ghost-replay-node"><small>${escapeHTML(item.stage||`STEP ${i+1}`)}</small><strong>${escapeHTML(shortHost(item.url)||"Unknown destination")}</strong><p>${escapeHTML(item.detail||`${item.status?`HTTP ${item.status} · `:""}${displayUrl(item.url)}`)}</p>${i===replay.length-1&&result.screenshots?.desktop?`<img src="${result.screenshots.desktop}" alt="Final isolated page">`:""}</div>`).join("");

      const desktop=result.screenshots?.desktop||"";
      const mobile=result.screenshots?.mobile||"";
      els.desktopShot.src=desktop;els.mobileShot.src=mobile;
      els.desktopShot.classList.toggle("ghost-hidden",!desktop);
      els.mobileShot.classList.add("ghost-hidden");
      els.noShot.classList.toggle("ghost-hidden",Boolean(desktop||mobile));

      els.redirects.innerHTML=redirects.length?redirects.map(item=>`<li><strong>${item.status||"—"}</strong> ${escapeHTML(displayUrl(item.url))}</li>`).join(""):`<li>No redirect chain was available.</li>`;
      els.domains.innerHTML=(result.domains||[]).length?(result.domains||[]).slice(0,30).map(domain=>`<li>${escapeHTML(domain)}</li>`).join(""):`<li>No contacted domains were recorded.</li>`;
      els.forms.innerHTML=(result.forms||[]).length?(result.forms||[]).slice(0,12).map((form,i)=>`<div class="ghost-form-item"><strong>Form #${i+1}${form.sensitiveFields?.length?" · Sensitive fields":""}</strong>Method: ${escapeHTML(form.method||"GET")}<br>Action: ${escapeHTML(displayUrl(form.action||"same page"))}<br>Fields: ${escapeHTML((form.fields||[]).join(", ")||"none detected")}</div>`).join(""):`<p>No forms were detected in the rendered page.</p>`;
      const page=result.page||{};
      els.pageInfo.innerHTML=[["Title",page.title],["Final URL",displayUrl(page.url||result.finalUrl)],["Status",page.status],["HTTPS",page.https===true?"Yes":page.https===false?"No":"Unknown"],["Desktop/Mobile",result.mobileDifference?"Different behavior observed":"No major difference observed"],["Provider",result.provider]].filter(([,v])=>v!==undefined&&v!=="").map(([k,v])=>`<dt>${escapeHTML(k)}</dt><dd>${escapeHTML(String(v))}</dd>`).join("");
      els.behavior.innerHTML=(result.behavior||[]).length?(result.behavior||[]).map(item=>`<li>${escapeHTML(typeof item==="string"?item:item.detail||item.type)}</li>`).join(""):`<li>No special browser behavior was observed.</li>`;
      const rep=result.reputation||{};
      els.reputation.innerHTML=`<span class="ghost-reputation-badge ${rep.listed?"listed":""}">${rep.listed?"KNOWN THREAT":rep.checked?"NO LIST MATCH":"NOT CONFIGURED"}</span><p>${escapeHTML(rep.listed?`Matched: ${(rep.threatTypes||[]).join(", ")||"unsafe resource"}.`:rep.checked?"No threat-list match was returned. This does not prove the page is safe.":"Live Web Risk was not available for this scan.")}</p>`;
      if(save)saveHistory(result);
    }

    function shortHost(value){try{return new URL(value).hostname}catch{return ""}}
    function displayUrl(value){
      if(!value)return "";
      try{
        const parsed=new URL(value);const names=[...parsed.searchParams.keys()];parsed.search="";parsed.hash="";
        return parsed.href+(names.length?`?[${names.join(", ")}]`:"");
      }catch{return String(value).slice(0,180)}
    }

    async function startScan(){
      if(!service.browserEnabled){await checkService();if(!service.browserEnabled)return}
      const url=urlInput.value.trim();
      if(!url&&!selectedImageData){
        setServiceState("offline","Paste a link or upload a QR/screenshot first.");
        return;
      }
      showWorkspace("progress");
      resetProgress(url||selectedImageName||"Uploaded screenshot");
      activeController=new AbortController();
      scanBtn.disabled=true;
      try{
        const response=await fetch(ENDPOINT,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({url,imageData:selectedImageData,imageName:selectedImageName}),
          signal:activeController.signal
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||`GhostScan returned ${response.status}`);
        log(`Final destination: ${shortHost(data.finalUrl||data.page?.url)||"unknown"}`,data.score>=60?"danger":"safe");
        log(`${data.redirects?.length||0} navigation step(s), ${data.domains?.length||0} contacted domain(s)`);
        renderResult(data,true);
      }catch(error){
        if(error.name==="AbortError"){showLanding();return}
        log(error.message||"The isolated scan failed","danger");
        renderFailure(error.message||"The isolated browser did not complete the scan.",["No page behavior was classified because the scan did not complete."]);
      }finally{
        scanBtn.disabled=!service.browserEnabled;
        activeController=null;
      }
    }

    function saveHistory(result){
      try{
        const history=JSON.parse(localStorage.getItem("cybernetGhostHistory")||"[]");
        history.unshift({id:result.scanId||crypto.randomUUID?.()||String(Date.now()),date:result.completedAt||Date.now(),url:displayUrl(result.inputUrl||result.finalUrl||result.page?.url),score:clamp(result.score),verdict:result.verdict,summary:result.summary,confidence:clamp(result.confidence)});
        localStorage.setItem("cybernetGhostHistory",JSON.stringify(history.slice(0,12)));
      }catch{}
    }

    function renderHistory(){
      let history=[];try{history=JSON.parse(localStorage.getItem("cybernetGhostHistory")||"[]")}catch{}
      els.historyList.innerHTML=history.length?history.map(item=>`<div class="ghost-history-item"><div><strong>${escapeHTML(item.url||"Unknown destination")}</strong><small>${new Date(item.date).toLocaleString()} · ${escapeHTML(item.summary||item.verdict||"")}</small></div><div class="ghost-history-score">${Math.round(item.score)}/100</div></div>`).join(""):`<div class="ghost-history-empty">No GhostScan reports are stored in this browser yet.</div>`;
    }

    function reportText(){
      if(!lastResult)return "";
      return [`CyberNet AI GhostScan`,`${lastResult.riskLevel||lastResult.threatType} · ${Math.round(lastResult.score)}/100 · ${clamp(lastResult.confidence)}% confidence`,lastResult.summary,"",...(lastResult.findings||[]).map(x=>`• ${x.title}: ${x.detail}`),"","Recommended actions:",...(lastResult.actions||[]).map((x,i)=>`${i+1}. ${x}`)].join("\n");
    }

    scanBtn.addEventListener("click",startScan);
    urlInput.addEventListener("keydown",event=>{if(event.key==="Enter")startScan()});
    urlInput.addEventListener("input",()=>{if(urlInput.value.trim()){selectedImageData="";selectedImageName="";fileName.textContent="JPG, PNG or WEBP · max 8 MB"}});
    uploadBtn?.addEventListener("click",()=>fileInput?.click());
    fileInput?.addEventListener("change",()=>prepareImage(fileInput.files?.[0]));
    document.getElementById("ghostBackHome")?.addEventListener("click",showLanding);
    document.getElementById("ghostNewScanBtn")?.addEventListener("click",showLanding);
    document.getElementById("ghostCancelBtn")?.addEventListener("click",()=>{activeController?.abort();showLanding()});
    document.getElementById("ghostCopyTarget")?.addEventListener("click",()=>navigator.clipboard?.writeText(els.target.textContent||""));
    document.getElementById("ghostCopyReportBtn")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(reportText());document.getElementById("ghostCopyReportBtn").textContent="Copied";setTimeout(()=>document.getElementById("ghostCopyReportBtn").textContent="Copy summary",1400)}catch{}});
    document.getElementById("ghostPrintBtn")?.addEventListener("click",()=>window.print());
    document.getElementById("ghostHistoryBtn")?.addEventListener("click",()=>{renderHistory();showWorkspace("history")});
    document.getElementById("ghostHistoryBack")?.addEventListener("click",()=>showWorkspace(lastResult?"results":"progress"));
    document.getElementById("ghostClearHistory")?.addEventListener("click",()=>{localStorage.removeItem("cybernetGhostHistory");renderHistory()});

    document.querySelectorAll("[data-ghost-tab]").forEach(button=>button.addEventListener("click",()=>{
      document.querySelectorAll("[data-ghost-tab]").forEach(x=>x.classList.toggle("active",x===button));
      document.querySelectorAll("[data-ghost-panel]").forEach(panel=>panel.classList.toggle("active",panel.dataset.ghostPanel===button.dataset.ghostTab));
    }));
    document.querySelectorAll("[data-screen]").forEach(button=>button.addEventListener("click",()=>{
      document.querySelectorAll("[data-screen]").forEach(x=>x.classList.toggle("active",x===button));
      const mobile=button.dataset.screen==="mobile";
      els.desktopShot.classList.toggle("ghost-hidden",mobile||!els.desktopShot.src);
      els.mobileShot.classList.toggle("ghost-hidden",!mobile||!els.mobileShot.src);
      els.noShot.classList.toggle("ghost-hidden",Boolean(mobile?els.mobileShot.src:els.desktopShot.src));
    }));

    checkService();
  })();


  /* ─── Start ─── */
  moveNavIndicator(currentPageId);
  runRevealAnimation();
});