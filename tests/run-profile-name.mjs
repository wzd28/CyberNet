// Owner, 21 Nov 2026: Sign in with Apple accounts showed the email's first part instead of the person's name.
// betterProfileName() (netlify/lib/supabase.mjs) decides when the server replaces the saved fallback name.
import { betterProfileName } from "../netlify/lib/supabase.mjs";

let pass = 0, fail = 0;
function check(name, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
const u = (email, meta) => ({ email, user_metadata: meta });

// repaired: the saved name is only the fallback and Apple (or the sign-up form) gave a real name
check("apple name replaces the email part", betterProfileName("walid.test", u("walid.test@example.com", { full_name: "Walid Example" })), "Walid Example");
check("hide-my-email code replaced", betterProfileName("x7k2abc9", u("x7k2abc9@privaterelay.appleid.com", { full_name: "Sam Lee" })), "Sam Lee");
check("first and last name used", betterProfileName("sam", u("sam@example.com", { first_name: "Sam", last_name: "Lee" })), "Sam Lee");
check("Google's name key used", betterProfileName("sam", u("sam@example.com", { name: "Sam Lee" })), "Sam Lee");
check("empty saved name replaced", betterProfileName("", u("sam@example.com", { full_name: "Sam Lee" })), "Sam Lee");
check("'User' fallback replaced", betterProfileName("User", u(null, { full_name: "Sam Lee" })), "Sam Lee");
check("case of the email part ignored", betterProfileName("SAM", u("sam@example.com", { full_name: "Sam Lee" })), "Sam Lee");
check("spaces tidied", betterProfileName("sam", u("sam@example.com", { full_name: "  Sam   Lee " })), "Sam Lee");
check("at most 120 characters", betterProfileName("sam", u("sam@example.com", { full_name: "A".repeat(200) })).length, 120);

// left alone
check("a real saved name is kept", betterProfileName("Samantha Lee", u("sam@example.com", { full_name: "Sam Lee" })), "");
check("no name anywhere: nothing to do", betterProfileName("sam", u("sam@example.com", {})), "");
check("no metadata at all", betterProfileName("sam", { email: "sam@example.com" }), "");
check("same name already saved", betterProfileName("Sam Lee", u("sam@example.com", { full_name: "Sam Lee" })), "");
check("metadata name is only the email part too", betterProfileName("sam", u("sam@example.com", { full_name: "sam" })), "");
check("blank metadata name", betterProfileName("sam", u("sam@example.com", { full_name: "   " })), "");
check("no user", betterProfileName("sam", null), "");

console.log(`profile name: ${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
