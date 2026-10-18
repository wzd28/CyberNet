// Sign-in dialog copy and checks in public/script.js, without a browser:
//
//   node tests/run-auth-messages.mjs
//
// The helpers live inside script.js's DOMContentLoaded closure, so this test lifts each one out of
// the source by name and runs it in a small sandbox: the plain-language error mapping
// (friendlyAuthError, friendlyNetworkError), the field checks (fieldProblem), what a returning
// link says (describeAuthReturnError) and how the return URL is read (CYBERNET_AUTH_RETURN).
// It also checks the email templates and the invite function point people at
// support@cybernetai.app. No network, no keys, no accounts.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => readFileSync(path.join(root, rel), "utf8");
const script = read("public/script.js");

let checks = 0, failures = 0;
function check(id, ok, detail) {
  checks++;
  if (!ok) { failures++; console.log(`[${id}] FAIL ${typeof detail === "string" ? detail : JSON.stringify(detail)}`); }
}

/* ---- lift declarations out of script.js (brace / paren aware, skips strings and template text) ---- */
function scanTo(src, start, stopAtSemicolon) {
  let depth = 0, i = start, quote = null;
  const templates = []; // depth at which each open ${ ... } inside a template literal started
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (quote === "`" && c === "$" && src[i + 1] === "{") { templates.push(depth); depth++; i++; quote = null; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "/" && /[(,=:!&|?{};\n]\s*$/.test(src.slice(Math.max(0, i - 3), i))) {
      // a regular expression literal
      let j = i + 1, inClass = false;
      for (; j < src.length; j++) {
        if (src[j] === "\\") { j++; continue; }
        if (src[j] === "[") inClass = true; else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
      }
      i = j; continue;
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (c === "}" && templates.length && templates[templates.length - 1] === depth) { templates.pop(); quote = "`"; continue; }
      // Started on an opening bracket: stop at its partner.
      if (depth === 0 && !stopAtSemicolon) return i + 1;
    } else if (c === ";" && depth === 0 && stopAtSemicolon) return i + 1;
  }
  throw new Error("unterminated declaration at " + start);
}
function lift(name) {
  const fn = script.search(new RegExp(`\\bfunction ${name}\\(`));
  if (fn >= 0) {
    const open = script.indexOf("(", fn);
    const params = scanTo(script, open, false); // just after the parameter list
    const end = scanTo(script, script.indexOf("{", params), false);
    return script.slice(fn, end);
  }
  const decl = script.search(new RegExp(`\\bconst ${name}=`));
  if (decl < 0) throw new Error(`${name} not found in public/script.js`);
  return script.slice(decl, scanTo(script, decl, true));
}

function sandbox(names, globals = {}) {
  const ctx = vm.createContext({ console: { warn() {}, log() {} }, URLSearchParams, ...globals });
  vm.runInContext(names.map(lift).join("\n") + `\n;globalThis.__x={${names.filter(n => /^[a-z]/i.test(n)).join(",")}};`, ctx);
  return ctx.__x;
}

const ERR_NAMES = ["SUPPORT_CONTACT", "friendlyNetworkError", "authErrorCode", "authWaitSeconds", "isUnconfirmedEmailError", "AUTH_FALLBACK", "friendlyAuthError"];
const nav = { onLine: true };
const E = sandbox(ERR_NAMES, { navigator: nav });
const err = (message, extra = {}) => Object.assign(new Error(message), extra);

/* ---- friendlyNetworkError ---- */
{
  const f = E.friendlyNetworkError;
  check("net-fetch", /couldn't reach CyberNet AI/.test(f(new TypeError("Failed to fetch"))), f(new TypeError("Failed to fetch")));
  check("net-safari", /couldn't reach/.test(f(new TypeError("Load failed"))), "Load failed");
  check("net-firefox", /couldn't reach/.test(f(new TypeError("NetworkError when attempting to fetch resource."))), "NetworkError");
  check("net-supabase", /couldn't reach/.test(f(err("{}", { name: "AuthRetryableFetchError", status: 0 }))), "AuthRetryableFetchError");
  nav.onLine = false;
  check("net-offline", /You're offline/.test(f(new TypeError("Failed to fetch"))), "offline");
  nav.onLine = true;
  check("net-abort", /taking longer than usual/.test(f(err("signal is aborted without reason", { name: "AbortError" }))), "AbortError");
  check("net-timeout", /taking longer than usual/.test(f(err("The operation timed out.", { name: "TimeoutError" }))), "TimeoutError");
  check("net-5xx", /having a problem right now/.test(f(err("Analysis service returned 504"))), "504");
  check("net-auth-503", /having a problem/.test(f(err("Service Unavailable", { name: "AuthRetryableFetchError", status: 503 }))), "503");
  check("net-server-message-kept", f(err("Daily limit reached. Upgrade to Pro for 15 analyses per day.")) === "", "server message must pass through");
  check("net-server-timeout-kept", f(err("The AI provider timed out. Please try again.")) === "", "server timeout text must pass through");
  check("net-null", f(null) === "" && f(undefined) === "", "null");
}

/* ---- friendlyAuthError ---- */
{
  const f = E.friendlyAuthError;
  const cases = [
    ["creds-code", err("Invalid login credentials", { code: "invalid_credentials", status: 400 }), "login", /don't match an account/],
    ["creds-text", err("Invalid login credentials"), "login", /don't match an account/],
    ["unconfirmed", err("Email not confirmed", { code: "email_not_confirmed" }), "login", /isn't confirmed yet.*Resend confirmation email/],
    ["exists", err("User already registered", { code: "user_already_exists" }), "signup", /already exists for this email/],
    ["same-password", err("New password should be different from the old password.", { code: "same_password", status: 422 }), "recovery", /password you use now/],
    ["weak-length", err("Password should be at least 8 characters.", { code: "weak_password" }), "signup", /at least 8 characters/],
    ["weak-pwned", err("Password is known to be weak and easy to guess, please choose a different one.", { code: "weak_password" }), "recovery", /data leaks/],
    ["weak-chars", err("Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789", { code: "weak_password" }), "signup", /mix of letters, numbers and symbols/],
    ["too-long", err("Password cannot be longer than 72 characters"), "recovery", /72 characters or fewer/],
    ["resend-throttle", err("For security purposes, you can only request this after 52 seconds.", { code: "over_email_send_rate_limit", status: 429 }), "resend", /wait 52 seconds before asking for another email/],
    ["resend-throttle-1", err("For security purposes, you can only request this after 1 second."), "reset", /wait 1 second before/],
    ["email-rate", err("Email rate limit exceeded", { code: "over_email_send_rate_limit", status: 429 }), "reset", /several emails in a short time/],
    ["request-rate", err("Request rate limit reached", { code: "over_request_rate_limit", status: 429 }), "login", /Too many attempts/],
    ["status-429", err("Too Many Requests", { status: 429 }), "login", /Too many attempts/],
    ["email-format", err("Unable to validate email address: invalid format", { code: "validation_failed" }), "signup", /doesn't look right/],
    ["email-invalid", err('Email address "x@y" is invalid', { code: "email_address_invalid" }), "signup", /doesn't look right/],
    ["provider-disabled", err("Unsupported provider: provider is not enabled", { code: "provider_disabled" }), "google", /Google sign-in is turned off/],
    ["email-disabled", err("Email logins are disabled", { code: "email_provider_disabled" }), "login", /Signing in with email is turned off/],
    ["signup-disabled", err("Signups not allowed for this instance", { code: "signup_disabled" }), "signup", /can't be created right now/],
    ["session-missing-recovery", err("Auth session missing!", { name: "AuthSessionMissingError", status: 400 }), "recovery", /reset link has timed out/],
    ["session-missing-login", err("Auth session missing!"), "login", /session has ended/],
    ["otp-expired", err("Token has expired or is invalid", { code: "otp_expired" }), "login", /expired or was already used/],
    ["network", new TypeError("Failed to fetch"), "login", /couldn't reach CyberNet AI/],
    ["db-error", err("Database error saving new user", { code: "unexpected_failure", status: 500 }), "signup", /account service had a problem.*support@cybernetai\.app/],
    ["unknown-login", err("something odd {\"x\":1}"), "login", /^We couldn't sign you in just now/],
    ["unknown-signup", err("weird"), "signup", /^We couldn't create your account just now/],
    ["unknown-reset", err(""), "reset", /^We couldn't send the reset email/],
    ["unknown-google", err("boom"), "google", /^Google sign-in isn't available right now/],
    ["no-error", undefined, "recovery", /^We couldn't save your new password/],
  ];
  for (const [id, e, mode, want] of cases) {
    const got = f(e, mode);
    check(`auth-${id}`, want.test(got), { mode, got });
    // Raw technical text never reaches people.
    if (e?.message && e.message.length > 6) check(`auth-${id}-not-raw`, !got.includes(e.message), { got });
  }
}

/* ---- fieldProblem ---- */
{
  const newPasswordEl = { value: "" };
  const F = sandbox(["EMAIL_PATTERN", "MIN_PASSWORD", "FIELD_RULES", "fieldProblem"], { newPasswordEl });
  const p = (id, value) => F.fieldProblem({ id, value });
  const ok = (id, value) => check(`field-${id}-${JSON.stringify(value)}`, p(id, value) === "", { id, value, got: p(id, value) });
  const bad = (id, value, re) => check(`field-${id}-${JSON.stringify(value)}`, re.test(p(id, value)), { id, value, got: p(id, value) });
  bad("loginEmail", "", /Enter your email address/);
  bad("loginEmail", "   ", /Enter your email address/);
  for (const v of ["bob", "bob@", "bob@example", "@example.com", "bob@@example.com", "bob@.example.com", "bob @example.com", "bob@example.c", "bob@example..com"]) bad("signupEmail", v, /full email address/);
  for (const v of ["bob@example.com", " bob@example.com ", "a.b+tag@sub.example.co.uk", "x@xn--p1ai.xn--p1ai", "O'Neil@Example.ORG"]) ok("resetEmail", v);
  bad("loginEmail", "a".repeat(250) + "@x.com", /full email address/);
  bad("loginPassword", "", /Enter your password/);
  ok("loginPassword", "short"); // existing accounts may have older, shorter passwords
  bad("signupFirstName", " ", /first name/);
  bad("signupLastName", "", /last name/);
  ok("signupFirstName", "Ana");
  bad("signupPassword", "", /Choose a password/);
  bad("authNewPassword", "", /Enter a new password/);
  bad("signupPassword", "1234567", /at least 8 characters\. This one has 7/);
  ok("signupPassword", "12345678");
  bad("authNewPassword", "x".repeat(73), /72 characters or fewer/);
  ok("authNewPassword", "x".repeat(72));
  newPasswordEl.value = "three random words";
  bad("authNewPasswordConfirm", "", /Type your new password again/);
  bad("authNewPasswordConfirm", "three random word", /don't match/);
  ok("authNewPasswordConfirm", "three random words");
  check("field-unknown", p("somethingElse", "") === "", "unknown field");
}

/* ---- describeAuthReturnError ---- */
{
  const D = sandbox(["SUPPORT_CONTACT", "describeAuthReturnError"]).describeAuthReturnError;
  let d = D({ error: "access_denied", errorCode: "otp_expired", errorDescription: "Email link is invalid or has expired", reset: true });
  check("return-reset-expired", d.view === "reset" && d.kind === "link-expired" && /expired or was already used/.test(d.title) && /send a new one/.test(d.text), d);
  d = D({ error: "access_denied", errorCode: "otp_expired", errorDescription: "Email link is invalid or has expired", reset: false });
  check("return-confirm-expired", d.view === "login" && d.resend === true && /Resend confirmation email/.test(d.text) && /still signed in/.test(d.signedIn), d);
  d = D({ error: "", errorCode: "", errorDescription: "Token has expired or is invalid", reset: false });
  check("return-expired-by-text", d.kind === "link-expired", d);
  d = D({ error: "access_denied", errorCode: "", errorDescription: "The user denied the request", reset: false });
  check("return-google-cancelled", d.kind === "sign-in-cancelled" && /Google sign-in was cancelled/.test(d.title) && /not signed in/.test(d.text), d);
  d = D({ error: "validation_failed", errorCode: "provider_disabled", errorDescription: "Unsupported provider: provider is not enabled" });
  check("return-provider-disabled", /isn't available right now/.test(d.title), d);
  d = D({ error: "access_denied", errorCode: "signup_disabled", errorDescription: "Signups not allowed for this instance" });
  check("return-signup-disabled", /can't be created/.test(d.title), d);
  d = D({ error: "server_error", errorCode: "unexpected_failure", errorDescription: "Unable to exchange external code" });
  check("return-generic", /didn't finish/.test(d.title) && /support@cybernetai\.app/.test(d.text) && !/exchange external code/.test(d.text), d);
}

/* ---- CYBERNET_AUTH_RETURN (top of script.js, before the Supabase client starts) ---- */
{
  const readAt = (search, hash) => {
    const ctx = vm.createContext({ URLSearchParams, window: { location: { search, hash } } });
    vm.runInContext(lift("CYBERNET_AUTH_RETURN") + ";globalThis.__r=CYBERNET_AUTH_RETURN;", ctx);
    return ctx.__r;
  };
  let r = readAt("?reset=1", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  check("url-expired-reset", r.reset && r.error === "access_denied" && r.errorCode === "otp_expired" && r.errorDescription === "Email link is invalid or has expired" && !r.hasSession, r);
  r = readAt("?error=access_denied&error_description=The+user+denied", "");
  check("url-query-error", r.error === "access_denied" && r.errorDescription === "The user denied" && !r.reset, r);
  r = readAt("", "#access_token=SECRET.TOKEN.VALUE&expires_in=3600&refresh_token=REFRESH&token_type=bearer&type=signup");
  check("url-signup", r.type === "signup" && r.hasSession === true, r);
  check("url-no-token-kept", !JSON.stringify(r).includes("SECRET") && !JSON.stringify(r).includes("REFRESH"), r);
  r = readAt("?reset=1", "#access_token=t&type=recovery");
  check("url-recovery", r.type === "recovery" && r.reset && r.hasSession, r);
  r = readAt("", "#learn-phishing-attacks");
  check("url-learn-hash", !r.type && !r.error && !r.hasSession && !r.reset, r);
  r = readAt(`?token=${"a".repeat(64)}&checkout=success`, "");
  check("url-other-params", !r.error && !r.reset, r);
  check("url-frozen", Object.isFrozen(r), "frozen");
}

/* ---- contact address and the recovery template ---- */
{
  const invite = read("netlify/functions/business-invite.mts");
  check("invite-contact", !invite.includes("cybernetai.26@gmail.com") && invite.includes("support@cybernetai.app"), "business-invite.mts");
  const confirm = read("supabase/email-template-confirm-signup.html");
  check("confirm-contact", !confirm.includes("cybernetai.26@gmail.com") && confirm.includes("mailto:support@cybernetai.app"), "confirm template");
  const recovery = read("supabase/email-template-recovery.html");
  check("recovery-url", (recovery.match(/\{\{ \.ConfirmationURL \}\}/g) || []).length >= 2, "ConfirmationURL");
  check("recovery-contact", recovery.includes("mailto:support@cybernetai.app") && !recovery.includes("cybernetai.26"), "contact");
  check("recovery-no-emoji", !/\p{Extended_Pictographic}/u.test(recovery), "emoji in the recovery template");
  check("script-no-old-contact", !script.includes("cybernetai.26@gmail.com"), "script.js");
}

/* ---- markup: the forms the checks rely on ---- */
{
  const html = read("public/index.html");
  for (const id of ["authLoginForm", "authSignupForm", "authResetForm", "authNewPasswordForm"])
    check(`form-${id}`, new RegExp(`<form id="${id}" class="auth-form[^"]*" novalidate>`).test(html), id);
  for (const id of ["loginEmail", "loginPassword", "signupFirstName", "signupLastName", "signupEmail", "signupPassword", "resetEmail", "authNewPassword", "authNewPasswordConfirm"]) {
    const tag = (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [""])[0];
    check(`input-${id}`, / required/.test(tag) && new RegExp(`aria-describedby="[^"]*${id}Error`).test(tag) && html.includes(`id="${id}Error"`) && html.includes(`<label for="${id}">`), tag);
  }
  check("recovery-update-label", /id="recoveryUpdateText"[^>]*aria-labelledby="recoveryUpdateQuestion"/.test(html), "recoveryUpdateText");
}

console.log(`auth messages: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
