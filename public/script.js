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
  function switchPage(pageName){
    const target=document.getElementById(pageName);if(!target)return;
    const current=document.querySelector(".page.active-page");
    if(current&&current.id===pageName){if(navbar)navbar.classList.remove("open");runRevealAnimation();return}
    currentPageId=pageName;
    updatePageMeta(pageName);
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
  const switchToSignupBtn=document.getElementById("switchToSignupBtn");
  const switchToLoginBtn=document.getElementById("switchToLoginBtn");
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

    if(aiPlanTitle)aiPlanTitle.textContent=pro?"Analysis AI Pro":"Analysis AI Free";
    if(aiPlanDescription)aiPlanDescription.textContent=!signedIn?"Sign in to activate 5 accurate AI analyses per day across text, links, and images.":pro?"Top-level Analysis AI protection with advanced analysis, history, and reports.":"Accurate everyday AI protection with 5 shared analyses per day.";
    if(aiUsageText)aiUsageText.textContent=signedIn?`${used} / ${limit}`:`0 / 5`;
    if(aiUsageBar)aiUsageBar.style.width=`${signedIn?Math.min(100,(used/Math.max(1,limit))*100):0}%`;
    if(aiUsageReset)aiUsageReset.textContent=appState.usage.resetDate?`Resets ${new Date(appState.usage.resetDate).toLocaleDateString()}`:"Resets daily";
    if(aiConnPill){
      aiConnPill.textContent=!signedIn?"Signed out":pro?"Pro active":"Free active";
      aiConnPill.className=`status-pill ${signedIn?"status-pill-safe":"status-pill-warn"}`;
    }
    if(aiReqLeft)aiReqLeft.textContent=signedIn?String(remaining):"—";
    if(aiApiStatus){
      if(!supabaseConfigured)aiApiStatus.innerHTML=`<span class="warning">${escapeHTML(authSetupMessage())}</span>`;
      else if(!signedIn)aiApiStatus.innerHTML='<span class="warning">Sign in or create a free account before running AI analysis.</span>';
      else if(remaining<=0)aiApiStatus.innerHTML=`<span class="warning">Daily limit reached. ${pro?"Your 50 analyses reset tomorrow.":"Upgrade to Pro for 50 analyses per day."}</span>`;
      else aiApiStatus.innerHTML=`<span class="safe">✓ ${remaining} secure AI ${remaining===1?"analysis":"analyses"} remaining today.</span>`;
    }

    if(aiUpgradeBtn){aiUpgradeBtn.hidden=pro;aiUpgradeBtn.textContent=signedIn?"Upgrade to Pro":"View Pro Plan"}
    if(manageBillingBtn)manageBillingBtn.hidden=!pro;
    if(freePlanBtn){freePlanBtn.textContent=!signedIn?"Start Free":pro?"Included with Pro":"Current Plan";freePlanBtn.disabled=signedIn}
    if(proPlanBtn){proPlanBtn.textContent=pro?"Current Plan":"Upgrade to Pro";proPlanBtn.disabled=pro}

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
      }
    }catch(error){setAuthMessage(friendlyAuthError(error,"login"),"error")}
    finally{loginBtn.disabled=false}
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
  const openFeedback=document.getElementById("openFeedback");
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

  openFeedback?.addEventListener("click",openFeedbackModal);
  closeFeedback?.addEventListener("click",closeFeedbackModal);
  feedbackModal?.addEventListener("click",event=>{if(event.target===feedbackModal)closeFeedbackModal()});

  /* ─── Home page how-to videos ─── */
  const howtoVideoModal=document.getElementById("howtoVideoModal");
  const closeHowtoVideo=document.getElementById("closeHowtoVideo");
  const howtoVideoTitle=document.getElementById("howtoVideoTitle");
  const howtoVideoPlayer=document.getElementById("howtoVideoPlayer");
  const howtoVideoCards=document.querySelectorAll(".hero-video-btn[data-video]");
  const howtoVideoTabs=document.querySelectorAll(".video-modal-tab[data-video]");
  const heroLearnFeaturesBtn=document.getElementById("heroLearnFeaturesBtn");

  const HOWTO_VIDEOS={
    protect:{
      title:"How To Use Quick Scan",
      src:""
    },
    cybernetai:{
      title:"How To Use Analysis AI",
      src:""
    },
    recovery:{
      title:"How To Use Recovery Mode",
      src:""
    }
  };

  function openHowtoVideo(key){
    const activeKey=HOWTO_VIDEOS[key]?key:"protect";
    const data=HOWTO_VIDEOS[activeKey];
    if(howtoVideoTitle)howtoVideoTitle.textContent=data.title;
    if(howtoVideoPlayer){
      if(data.src){
        howtoVideoPlayer.innerHTML=`<video src="${data.src}" controls autoplay playsinline></video>`;
      }else{
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
  }

  function closeHowtoVideoModal(){
    howtoVideoModal?.classList.remove("show");
    howtoVideoModal?.setAttribute("aria-hidden","true");
    if(howtoVideoPlayer)howtoVideoPlayer.innerHTML="";
  }

  howtoVideoCards.forEach(card=>{
    card.addEventListener("click",()=>openHowtoVideo(card.dataset.video));
  });
  howtoVideoTabs.forEach(tab=>{
    tab.addEventListener("click",()=>openHowtoVideo(tab.dataset.video));
  });
  heroLearnFeaturesBtn?.addEventListener("click",()=>openHowtoVideo("protect"));
  closeHowtoVideo?.addEventListener("click",closeHowtoVideoModal);
  howtoVideoModal?.addEventListener("click",event=>{if(event.target===howtoVideoModal)closeHowtoVideoModal()});

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
      if(noteEl)noteEl.innerHTML=`<strong>Live</strong> — real usage counts from CyberNet AI's own database, updated continuously.`;
    }catch{
      els.forEach(el=>{el.textContent="—"});
      if(noteEl)noteEl.innerHTML=`<strong>Live stats unavailable</strong> — could not reach CyberNet AI's usage data right now.`;
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
    const colorMap={danger:"#ff6b6b",warning:"#ffcf6b",safe:"#38bdf8",uncertain:"#a78bfa"};
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
    if(containsAny(clean,["unpaid toll","outstanding toll","toll balance","e-zpass","ezpass","toll invoice"])&&containsAny(clean,["pay","suspend","fine","fee","link","click"]))addSignal(state,"toll-smishing",30,"Claims an unpaid road toll and pressures payment or a link click — a widely-reported smishing pattern.","Toll-fee smishing scam","impersonation",true);
    if(containsAny(clean,["package could not be delivered","delivery failed","parcel is on hold","redelivery fee","customs fee","shipment is on hold","update your delivery"]))addSignal(state,"delivery-smishing",26,"Claims a package or delivery problem requiring a fee or link click.","Package-delivery smishing scam","impersonation",true);
    if(containsAny(clean,["work from home","earn $","earn up to","no experience needed","flexible hours easy money","daily payout","task completion bonus","product boosting","earn per task"]))addSignal(state,"job-scam",24,"Uses work-from-home or easy-money task language typical of job and task scams.","Job / task scam","money",true);
    if(containsAny(clean,["arrest warrant","failure to appear","legal action will be taken","this call is being recorded for legal purposes","stay on the line","do not hang up","identity was used in a crime","federal investigation"]))addSignal(state,"authority-impersonation",34,"Impersonates law enforcement or a government agency with legal threats — a common impersonation/\"digital arrest\" scam pattern.","Government / law-enforcement impersonation scam","impersonation",true);
    if(containsAny(clean,["grandma its me","grandpa its me","ive been in an accident","i need bail money","dont tell mom","dont tell my parents","im in trouble and need money"]))addSignal(state,"family-emergency",30,"Uses a family-emergency plea combined with urgency and secrecy — a pattern seen in impersonation and AI voice-cloning scams.","Family-emergency impersonation scam","impersonation",true);
    if(containsAny(clean,["investment opportunity","guaranteed returns","double your money","crypto trading platform","my broker","trading mentor","withdraw your profits"])&&containsAny(clean,["love","miss you","my dear","sweetheart","darling","relationship"]))addSignal(state,"romance-investment",36,"Combines romantic language with an investment or crypto-trading pitch — the classic \"pig butchering\" scam pattern.","Romance / investment (\"pig butchering\") scam","money",true);

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
    const shorteners=new Set(["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly","rebrand.ly","shorturl.at","tiny.one","rb.gy","v.gd","s.id","lnkd.in","tr.im","clickmeter.com"]);
    const riskyTlds=new Set(["xyz","top","click","zip","mov","review","country","work","support","live","cam","gq","tk","ml","cf","buzz","rest","fit","quest","monster","download","xin","bond","shop","online","cfd","lol","vip","cc","win","loan","men","party","science","stream","racing","accountant","date","faith","icu","bar","rip","surf","cyou","sbs"]);
    const brands={paypal:"paypal.com",microsoft:"microsoft.com",apple:"apple.com",google:"google.com",amazon:"amazon.com",netflix:"netflix.com",instagram:"instagram.com",facebook:"facebook.com",whatsapp:"whatsapp.com",dropbox:"dropbox.com",dhl:"dhl.com",fedex:"fedex.com",ups:"ups.com",usps:"usps.com",adobe:"adobe.com",coinbase:"coinbase.com",binance:"binance.com",icloud:"icloud.com",walmart:"walmart.com",chase:"chase.com",wellsfargo:"wellsfargo.com",bankofamerica:"bankofamerica.com",venmo:"venmo.com",zelle:"zelle.com",cashapp:"cash.app",steam:"steampowered.com",linkedin:"linkedin.com",tiktok:"tiktok.com",snapchat:"snapchat.com",discord:"discord.com",spotify:"spotify.com",ezpass:"e-zpass.com",xfinity:"xfinity.com",verizon:"verizon.com"};
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
    const confidence=clamp(48+state.categories.size*8+state.strong*10+(hadScheme?4:0)+(!state.signals.size?20:0),35,97);
    const uncertain=!state.strong&&state.signals.size>0&&score<32&&!officialBrand;
    const counterEvidence=[];
    if(url.protocol==="https:")counterEvidence.push("The URL uses HTTPS, which protects transport but does not prove the site is legitimate.");
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
    return{score:clamp(r.score),confidence:clamp(r.confidence),scamType:r.threatType||r.scamType||"Deep security analysis",reasons:unique([...(r.evidence||r.reasons||[]),...(r.limitations||[])]),counterEvidence:unique(r.counterEvidence||[]),advice:unique(r.actions||r.advice||[]),uncertain:verdict==="inconclusive",verdict,sources:unique([...(data?.aiUsed?["Secure AI analysis"]:[]),...(data?.reputation?.checked?["Live URL reputation"]:[])]),note:r.summary||r.note||"Secure deep analysis completed.",reputation:data?.reputation||null,virusTotal:data?.virusTotal||null,aiUsed:Boolean(data?.aiUsed)};
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
    return{score,confidence,scamType:reputationHit?"Known unsafe URL":(deep.scamType||local.scamType),reasons:unique([...(deep.reasons||[]),...(local.reasons||[])]),counterEvidence:unique([...(deep.counterEvidence||[]),...(local.counterEvidence||[])]),advice:unique([...(deep.advice||[]),...(local.advice||[])]),uncertain,verdict:reputationHit?"malicious":uncertain?"inconclusive":deep.verdict,sources:unique([...(local.sources||[]),...(deep.sources||[])]),note:reputationHit?"The live reputation service matched this URL to a known unsafe resource.":disagreement?"The local and deep-analysis layers disagree, so CyberNet AI is intentionally marking this result for review.":deep.note||local.note,reputation:deep.reputation,virusTotal:deep.virusTotal||null,aiUsed:Boolean(deep.aiUsed)};
  }
  async function requestDeepAnalysis(type,content,localResult,imageData=""){
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
    const isBareLink=detectChatContentType(text)==="link";
    animateScanRing(ring,label,status,duration,async()=>{
      const result=isBareLink?analyzeLinkRules(text):analyzeTextRules(text);
      const note=isBareLink
        ?"This looked like a link rather than a message, so CyberNet AI analyzed it with the link engine for a more accurate result. Use Link Detection directly next time for the same result."
        :"Local protection scan complete. Use the CyberNet AI page for account-based AI analysis.";
      showReport(cyberTextResult,result.score,result.scamType,result.reasons,result.advice,{...result,note});
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
  const chatMessages=document.getElementById("chatMessages"),chatInput=document.getElementById("chatInput"),chatSendBtn=document.getElementById("chatSendBtn"),chatInputRowUnified=document.getElementById("chatInputRowUnified"),aiImageInput=document.getElementById("aiImageInput"),chatAttachBtn=document.getElementById("chatAttachBtn"),chatAttachPreview=document.getElementById("chatAttachPreview"),chatAttachThumb=document.getElementById("chatAttachThumb"),chatAttachName=document.getElementById("chatAttachName"),chatAttachRemove=document.getElementById("chatAttachRemove");
  let pendingAttachment=null;
  function detectChatContentType(raw){
    const trimmed=String(raw||"").trim();
    if(!trimmed)return "text";
    const soleUrl=/^(https?:\/\/|www\.)\S+$/i;
    const bareDomain=/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;
    if(!/\s/.test(trimmed)&&(soleUrl.test(trimmed)||bareDomain.test(trimmed)))return "link";
    return "text";
  }
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
    link:["Checking Google Safe Browsing…","Checking VirusTotal (70+ security engines)…","Running CyberNet AI deep analysis…","Correlating threat intelligence…"],
    image:["Decoding QR and visual signals…","Checking Google Safe Browsing…","Checking VirusTotal (70+ security engines)…","Running CyberNet AI vision analysis…","Correlating threat intelligence…"],
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

  function virusTotalSummaryHTML(vt){
    if(!vt||!vt.configured){
      return `<div class="intel-row"><span class="intel-name">VirusTotal</span><span class="intel-status intel-status-off">Not configured</span></div>`;
    }
    if(!vt.checked){
      return `<div class="intel-row"><span class="intel-name">VirusTotal</span><span class="intel-status intel-status-off">Unavailable right now</span></div>`;
    }
    if(!vt.totalEngines){
      return `<div class="intel-row"><span class="intel-name">VirusTotal</span><span class="intel-status intel-status-neutral">Not previously scanned by VirusTotal</span></div>`;
    }
    const flagged=vt.malicious+vt.suspicious;
    const statusClass=flagged>=3?"intel-status-bad":flagged>0?"intel-status-warn":"intel-status-good";
    return `
      <div class="intel-row">
        <span class="intel-name">VirusTotal</span>
        <span class="intel-status ${statusClass}">${flagged} / ${vt.totalEngines} engines flagged</span>
      </div>
      ${vt.flaggedBy?.length?`<div class="intel-vendors">${vt.flaggedBy.map(v=>`<span>${escapeHTML(v)}</span>`).join("")}</div>`:""}
      ${vt.permalink?`<a class="intel-link" href="${escapeHTML(vt.permalink)}" target="_blank" rel="noopener">View full VirusTotal report →</a>`:""}
    `;
  }

  function safeBrowsingSummaryHTML(rep){
    if(!rep||!rep.checked){
      return `<div class="intel-row"><span class="intel-name">Google Safe Browsing</span><span class="intel-status intel-status-off">Not available for this check</span></div>`;
    }
    return `<div class="intel-row"><span class="intel-name">Google Safe Browsing</span><span class="intel-status ${rep.listed?"intel-status-bad":"intel-status-good"}">${rep.listed?`Listed: ${escapeHTML((rep.threatTypes||[]).join(", ")||"known threat")}`:"No known-threat match"}</span></div>`;
  }

  function showDiagnosticReport(resultBox,result,type){
    const uncertain=Boolean(result.uncertain||result.verdict==="inconclusive");
    const danger=getDanger(result.score,uncertain);
    const verdictLabel=danger.label;
    const showIntel=type==="link"||type==="image";
    resultBox.className=resultBox.className.replace(/result-has-\w+/g,"").trim();
    resultBox.classList.add(`result-has-${danger.css}`);
    resultBox.innerHTML=`
      <div class="diagnostic-report">
        <div class="diagnostic-report-head">
          <span class="diagnostic-badge diagnostic-badge-${danger.css}">${verdictLabel}</span>
          <span class="diagnostic-scam-type">${escapeHTML(result.scamType)}</span>
          <span class="diagnostic-score">${clamp(Math.round(result.score))}<span>/100</span></span>
        </div>
        <div class="diagnostic-confidence-row">
          <span>Analysis confidence</span>
          <strong>${clamp(result.confidence)}%</strong>
        </div>
        ${showIntel?`
        <div class="diagnostic-intel-card">
          <h5>External Threat Intelligence</h5>
          ${safeBrowsingSummaryHTML(result.reputation)}
          ${virusTotalSummaryHTML(result.virusTotal)}
        </div>`:""}
        <div class="diagnostic-note"><p>${escapeHTML(result.note||"")}</p></div>
        ${unique(result.counterEvidence||[]).length?`<div class="diagnostic-counter"><strong>Evidence that lowers risk</strong><ul>${unique(result.counterEvidence).slice(0,5).map(item=>`<li>${escapeHTML(item)}</li>`).join("")}</ul></div>`:""}
        <div class="diagnostic-body">
          <div class="diagnostic-col"><h5>Evidence it is a scam</h5><ul>${unique(result.reasons).slice(0,10).map(r=>`<li>${escapeHTML(r)}</li>`).join("")||"<li>No decisive evidence recorded.</li>"}</ul></div>
          <div class="diagnostic-col"><h5>What To Do</h5><ul class="diagnostic-actions">${unique(result.advice).slice(0,8).map(a=>`<li>${escapeHTML(a)}</li>`).join("")}</ul></div>
        </div>
      </div>`;
  }


  async function analyzeChat(type,content,imageData=""){
    if(!canStartAiAnalysis())return;
    let local;
    let serverContent=content;
    if(type==="image"){
      const decoded=await decodeQRFromDataUrl(imageData);
      let qrResult=null;
      if(decoded.qrData){
        const looksLikeUrl=/^https?:\/\//i.test(decoded.qrData)||/^[a-z0-9.-]+\.[a-z]{2,}/i.test(decoded.qrData);
        if(looksLikeUrl)qrResult=analyzeLinkRules(/^https?:\/\//i.test(decoded.qrData)?decoded.qrData:`https://${decoded.qrData}`);
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
      const [deep]=await Promise.all([requestDeepAnalysis(type,serverContent,local,imageData),minWait]);
      if(stopDiagnostic)stopDiagnostic();
      const result=mergeAnalysis(local,deep);
      if(inner){
        showDiagnosticReport(inner,result,type);
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

  /* ─── Typewriter effect for info panels (plays once, on scroll into view) ─── */
  (function initTypewriters(){
    if(!("IntersectionObserver" in window))return;
    const reduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const observer=new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        const el=entry.target;
        observer.unobserve(el);
        const text=el.dataset.typewriter||"";
        if(reduceMotion||!text){el.textContent=text;return}
        el.textContent="";
        let i=0;
        const speed=Math.max(7,Math.min(16,900/Math.max(1,text.length)));
        function step(){
          el.textContent=text.slice(0,i);
          i++;
          if(i<=text.length)setTimeout(step,speed);
        }
        step();
      });
    },{threshold:0.3});
    document.querySelectorAll("[data-typewriter]").forEach(el=>observer.observe(el));
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
        if(!res.ok){
          const error=new Error(data.error||`Recovery service returned ${res.status}`);
          error.code=data.code;
          throw error;
        }
        currentCaseId=data.caseId;
        currentPlan={...data.plan,progressPercent:0};
        currentTasks=[];
        renderDashboard();
        showDashboard();
      }catch(error){
        if(error.code==="daily_limit_reached"){
          setIntakeMessage(`${error.message} Upgrade to Pro for more Recovery cases per day.`,"warning");
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
        if(!res.ok){
          const error=new Error(data.error||`Recovery update returned ${res.status}`);
          error.code=data.code;
          error.usage=data.usage;
          throw error;
        }
        currentPlan=data.plan;
        if(updateTextEl)updateTextEl.value="";
        renderDashboard();
        setUpdateMessage("Recovery case updated.","success");
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

  moveNavIndicator(currentPageId);
  runRevealAnimation();
});

