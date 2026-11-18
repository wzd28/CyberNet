// The sign-up code step in public/script.js (web only), without a browser:
//
//   node tests/run-code-step.mjs
//
// The step lives inside script.js's DOMContentLoaded closure, so this test lifts its web region out
// of the source and runs it in a sandbox with a small fake page and a fake Supabase client. It checks
// the final fixes of 18 Nov 2026: the address waiting for its code survives a reload and a look at the
// Sign In tab, and a code refused because the email link was opened first still ends signed in.
// No network, no keys, no accounts.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(path.join(root, "public/script.js"), "utf8");

let checks = 0, failures = 0;
function check(name, ok, detail) {
  checks++;
  if (!ok) { failures++; console.log(`[${name}] FAIL ${detail === undefined ? "" : JSON.stringify(detail)}`); }
}

const region = script.match(/\/\*@web\*\/  \/\* Sign-up by code[\s\S]*?\/\*@end-web\*\//);
check("the code step is one web region", Boolean(region));
if (!region) { console.log("code step: region not found"); process.exit(1); }
check("the password is never written to storage", !/setItem\([^)]*[Pp]assword/.test(region[0]));

function element(id) {
  const classes = new Set(), handlers = {};
  return {
    id, hidden: false, value: "", textContent: "", attrs: {}, handlers, focused: 0,
    classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); } },
    addEventListener(type, fn) { handlers[type] = fn; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    focus() { this.focused++; }, reset() { this.wasReset = true; }
  };
}

// One "page load": a fresh closure over the same tab storage.
function load(storage, { signedIn = false, otp = "refused", passwordWorks = false, resendOk = true } = {}) {
  const els = {};
  for (const id of ["authCodeBox", "authSignupForm", "authModal", "signupResendBtn", "authCode", "authCodeForm", "authCodeBtn", "authCodeResendBtn", "authCodeBackBtn"]) els[id] = element(id);
  els.authCodeBox.hidden = true;
  const log = { verify: [], signIn: [], resend: [], messages: [], toasts: [], closed: 0, fieldErrors: [] };
  const sandbox = {
    console, JSON, Date, Number, String, Boolean, Object, Error, Promise,
    sessionStorage: {
      getItem: (k) => (storage.blocked ? (() => { throw new Error("blocked"); })() : (k in storage.data ? storage.data[k] : null)),
      setItem: (k, v) => { if (storage.blocked) throw new Error("blocked"); storage.data[k] = String(v); },
      removeItem: (k) => { if (storage.blocked) throw new Error("blocked"); delete storage.data[k]; }
    },
    document: { getElementById: (id) => els[id] || null },
    authModal: els.authModal, authView: "signup",
    AUTH_HEADINGS: { signup: ["Create your account", "Free."], login: ["Sign in", ""] },
    authTitleEl: element("title"), authIntroEl: element("intro"),
    signupForm: els.authSignupForm, loginForm: element("loginForm"),
    loginEmailEl: element("loginEmail"), loginPasswordEl: element("loginPassword"), resendConfirmBtn: element("resendConfirmBtn"),
    isSignedIn: () => signedIn,
    coolingDown: () => false, isBusy: () => false, setBusy: () => () => {},
    hidePasswords() {}, focusField(f) { f?.focus(); }, focusFirstField() {},
    setFieldError(field, text) { log.fieldErrors.push(text); },
    setAuthMessage(message = "", tone = "", actions = []) { log.messages.push({ message, tone, actions }); },
    closeAuthModal() { log.closed++; els.authModal.classList.remove("show"); },
    showAuthToast(text) { log.toasts.push(text); },
    authSetupMessage: () => "setup",
    authErrorCode: (error) => String(error?.code || "").toLowerCase(),
    friendlyAuthError: () => "friendly",
    async sendConfirmationEmail(email) { log.resend.push(email); return resendOk; },
    appState: { supabase: { auth: {
      async verifyOtp(args) {
        log.verify.push(args);
        if (otp === "ok") return { data: { session: { access_token: "t" } }, error: null };
        return { data: {}, error: { code: "otp_expired", message: "Token has expired or is invalid" } };
      },
      async signInWithPassword(args) {
        log.signIn.push(args);
        if (passwordWorks) return { data: { session: { access_token: "t" } }, error: null };
        return { data: {}, error: { code: "email_not_confirmed", message: "Email not confirmed" } };
      }
    } } }
  };
  sandbox.setAuthView = (view) => { sandbox.authView = view; if (view === "signup") sandbox.restoreCodeStep(); else sandbox.renderCodeStep(false); };
  vm.createContext(sandbox);
  vm.runInContext(region[0], sandbox);
  const submit = async (code) => { els.authCode.value = code; await els.authCodeForm.handlers.submit({ preventDefault() {} }); };
  const onStep = () => !els.authCodeBox.hidden && els.authSignupForm.hidden && els.authModal.classList.contains("cn-code-step");
  return { sandbox, els, log, submit, onStep };
}
const newTab = () => ({ data: {}, blocked: false });

// ── the step is shown, hidden and brought back without losing the address ──
{
  const tab = newTab();
  let page = load(tab);
  page.sandbox.codePassword = "pw-typed";
  page.sandbox.showCodeStep("ana@example.test");
  check("after sign-up: the code step is on the card", page.onStep());
  check("the address is kept for this tab", JSON.parse(tab.data["cn-code-email"] || "{}").email === "ana@example.test", tab.data);
  check("the tab storage holds no password", !JSON.stringify(tab.data).includes("pw-typed"), tab.data);
  check("the heading names the address", page.sandbox.authIntroEl.textContent.includes("ana@example.test"));

  page.sandbox.setAuthView("login");
  check("Sign In tab: the step is hidden", page.els.authCodeBox.hidden && !page.els.authModal.classList.contains("cn-code-step") && !page.els.authSignupForm.hidden);
  check("Sign In tab: the address is still waiting", page.sandbox.codeEmail === "ana@example.test" && Boolean(tab.data["cn-code-email"]));
  page.sandbox.setAuthView("signup");
  check("back on Sign Up: the code step returns", page.onStep());

  // reload: a new closure, the same tab storage
  page = load(tab);
  check("after a reload nothing is in memory", page.sandbox.codeEmail === "");
  check("after a reload the saved address is found", page.sandbox.pendingCodeEmail() === "ana@example.test");
  page.sandbox.setAuthView("signup");
  check("after a reload: Sign Up opens on the code step", page.onStep() && page.sandbox.codeEmail === "ana@example.test");

  page.els.authCodeBackBtn.handlers.click();
  check("Use a different email: the form is back and the address is forgotten", !page.onStep() && page.sandbox.codeEmail === "" && !("cn-code-email" in tab.data));
  page.sandbox.setAuthView("login"); page.sandbox.setAuthView("signup");
  check("Use a different email: the step does not come back", !page.onStep());
}
{
  const tab = newTab();
  tab.data["cn-code-email"] = JSON.stringify({ email: "old@example.test", at: Date.now() - 25 * 3600 * 1000 });
  const page = load(tab);
  page.sandbox.setAuthView("signup");
  check("an address saved more than a day ago is ignored", !page.onStep());
  check("only a recent address reopens the card on load", page.sandbox.pendingCodeEmail(3600000) === "");
  tab.data["cn-code-email"] = "{not json";
  check("broken storage is ignored", page.sandbox.pendingCodeEmail() === "");
  tab.data["cn-code-email"] = JSON.stringify({ email: "<img src=x>", at: Date.now() });
  check("a value that is not an address is ignored", page.sandbox.pendingCodeEmail() === "");
}
{
  const tab = newTab(); tab.blocked = true;
  const page = load(tab);
  page.sandbox.showCodeStep("ana@example.test");
  check("blocked storage: the step still works for this page", page.onStep());
}
{
  const tab = newTab();
  tab.data["cn-code-email"] = JSON.stringify({ email: "ana@example.test", at: Date.now() });
  const page = load(tab, { signedIn: true });
  page.sandbox.setAuthView("signup");
  check("signed in: no code step", !page.onStep());
  page.sandbox.codeStepSignedIn();
  check("signed in: the waiting address is cleared", !("cn-code-email" in tab.data));
}
{
  // the email link was opened in another tab of this browser while the step was on screen
  const tab = newTab();
  const page = load(tab);
  page.sandbox.showCodeStep("ana@example.test");
  page.els.authModal.classList.add("show");
  page.sandbox.codeStepSignedIn();
  check("a session from the link closes the step", page.log.closed === 1 && !page.onStep() && !("cn-code-email" in tab.data) && page.log.toasts.length === 1, page.log);
}

// ── the code itself ──
{
  const tab = newTab();
  const page = load(tab, { otp: "ok" });
  page.sandbox.showCodeStep("ana@example.test");
  await page.submit("123 456");
  check("a good code: verifyOtp with the address, the digits and type email", page.log.verify.length === 1 && page.log.verify[0].email === "ana@example.test" && page.log.verify[0].token === "123456" && page.log.verify[0].type === "email", page.log.verify);
  check("a good code: signed in, card closed, address forgotten", page.log.closed === 1 && page.log.signIn.length === 0 && !("cn-code-email" in tab.data) && page.sandbox.codePassword === "", page.log);
}
{
  // link opened first (another browser, or a mail scanner): the code is used up, the account is confirmed
  const tab = newTab();
  const page = load(tab, { passwordWorks: true });
  page.sandbox.codePassword = "pw-typed";
  page.sandbox.showCodeStep("ana@example.test");
  await page.submit("123456");
  check("refused code, link already opened: one sign-in with the typed password", page.log.signIn.length === 1 && page.log.signIn[0].email === "ana@example.test" && page.log.signIn[0].password === "pw-typed", page.log.signIn);
  check("refused code, link already opened: ends signed in", page.log.closed === 1 && !page.onStep() && !("cn-code-email" in tab.data) && page.log.fieldErrors.every((t) => !t), page.log);
}
{
  // a wrong code on an account that is not confirmed yet
  const tab = newTab();
  const page = load(tab, { passwordWorks: false });
  page.sandbox.codePassword = "pw-typed";
  page.sandbox.showCodeStep("ana@example.test");
  await page.submit("999999");
  const last = page.log.messages[page.log.messages.length - 1];
  check("wrong code: the step stays with an error on the field", page.onStep() && page.log.closed === 0 && /doesn't match|expired/.test(page.log.fieldErrors[page.log.fieldErrors.length - 1] || ""), page.log);
  check("wrong code: a Sign in instead button is offered", last?.actions?.[0]?.label === "Sign in instead" && /link/.test(last.message), last);
  last.actions[0].run();
  check("Sign in instead: Sign In tab with the address filled in, the code still waiting", page.sandbox.authView === "login" && page.sandbox.loginEmailEl.value === "ana@example.test" && Boolean(tab.data["cn-code-email"]));
}
{
  // after a reload there is no password in memory
  const tab = newTab();
  tab.data["cn-code-email"] = JSON.stringify({ email: "ana@example.test", at: Date.now() });
  const page = load(tab, { passwordWorks: true });
  page.sandbox.setAuthView("signup");
  await page.submit("123456");
  check("refused code after a reload: no sign-in is tried, Sign in instead is offered", page.log.signIn.length === 0 && page.log.messages[page.log.messages.length - 1]?.actions?.[0]?.label === "Sign in instead", page.log);
}
{
  const page = load(newTab());
  page.sandbox.showCodeStep("ana@example.test");
  await page.submit("12");
  check("a short code is stopped before any request", page.log.verify.length === 0 && Boolean(page.log.fieldErrors[page.log.fieldErrors.length - 1]));
}

// ── Send a new code ──
{
  const page = load(newTab(), { passwordWorks: true });
  page.sandbox.codePassword = "pw-typed";
  page.sandbox.showCodeStep("ana@example.test");
  await page.els.authCodeResendBtn.handlers.click();
  check("Send a new code, account already confirmed by the link: signs in, sends nothing", page.log.signIn.length === 1 && page.log.resend.length === 0 && page.log.closed === 1, page.log);
}
{
  const page = load(newTab(), { passwordWorks: false });
  page.sandbox.codePassword = "pw-typed";
  page.sandbox.showCodeStep("ana@example.test");
  await page.els.authCodeResendBtn.handlers.click();
  const last = page.log.messages[page.log.messages.length - 1];
  check("Send a new code, not confirmed yet: a new email goes to the address", page.log.resend.length === 1 && page.log.resend[0] === "ana@example.test" && page.onStep(), page.log);
  check("Send a new code: the message offers Sign in instead", last?.tone === "success" && last.actions?.[0]?.label === "Sign in instead", last);
}
{
  const page = load(newTab());
  page.sandbox.loginPasswordEl.value = "pw-login";
  page.sandbox.authView = "login";
  page.sandbox.openCodeStepFor("ana@example.test", "pw-login", "Your email isn't confirmed yet.");
  check("Sign In with an unconfirmed address: the code step opens for it", page.onStep() && page.sandbox.authView === "signup" && page.sandbox.codeEmail === "ana@example.test" && page.sandbox.codePassword === "pw-login");
  check("Sign In with an unconfirmed address: says why", page.log.messages[page.log.messages.length - 1]?.message.includes("isn't confirmed"));
}

// ── how the rest of script.js reaches the step ──
check("leaving Sign Up hides the step without forgetting the address", script.includes('if(view==="signup"){cnFunnel("signup_open");restoreCodeStep()}else renderCodeStep(false);'));
check("Sign In: an unconfirmed address opens the code step (web only)", /\/\*@web\*\/[^\n]*\n\s*if\(isUnconfirmedEmailError\(error\)\)\{openCodeStepFor\(email\.toLowerCase\(\),password,/.test(script));
check("a reload in the middle of sign-up reopens the card", script.includes('/*@web*/    else if(!signedIn&&!authModal?.classList.contains("show")&&pendingCodeEmail(3600000))openAuthModal("signup");/*@end-web*/'));
check("a new session ends a waiting code step", script.includes("try{if(appState.user)codeStepSignedIn()}catch{}/*@end-web*/"));
check("the same address again inside the email limit shows the code step", /if\(authWaitSeconds\(error\)&&email===lastSignupEmail\)\{\s*codePassword=password;\s*showCodeStep\(email\);/.test(script));

console.log(`code step: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
