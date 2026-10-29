// Sign in with Apple token revocation when an account is deleted
// (Apple TN3194; App Review 5.1.1(v); BUILD-PLAN §8.5 step 3).
//
// The app asks Apple for a fresh authorization code just before deletion and
// posts it as `appleAuthorizationCode`. The server exchanges it for a refresh
// token and revokes that token, so Settings > Apple Account > Sign in with
// Apple no longer lists CyberNet AI. A failure is logged and never blocks the
// deletion itself.
//
// Environment (set by the owner in Netlify; never committed):
//   APPLE_TEAM_ID           the 10-character Apple Developer Team ID
//   APPLE_SIWA_KEY_ID       the Key ID of the "Sign in with Apple" key (.p8)
//   APPLE_SIWA_PRIVATE_KEY  the .p8 file's contents (PEM, "-----BEGIN PRIVATE
//                           KEY-----" ...). Line breaks may be pasted as \n.
//   APPLE_SIWA_CLIENT_ID    optional; the app's bundle ID, default
//                           "app.cybernetai" (native sign-in codes are issued
//                           to the bundle ID, not to a web Services ID)

import { createPrivateKey, sign } from "node:crypto";

const APPLE = "https://appleid.apple.com";
export const DEFAULT_CLIENT_ID = "app.cybernetai";

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    try { return String(process.env[name] || "").trim(); } catch { return ""; }
  }
}

export function appleConfig() {
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_SIWA_KEY_ID");
  const privateKey = env("APPLE_SIWA_PRIVATE_KEY").replace(/\\n/g, "\n");
  const clientId = env("APPLE_SIWA_CLIENT_ID") || DEFAULT_CLIENT_ID;
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey, clientId } : null;
}

const b64url = (value) => Buffer.from(value).toString("base64url");

// The client secret is a short-lived ES256 JWT signed with the SIWA key.
export function makeClientSecret({ teamId, keyId, privateKey, clientId }, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: APPLE, sub: clientId }));
  const input = `${header}.${payload}`;
  const key = createPrivateKey({ key: privateKey, format: "pem" });
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

// An Apple authorization code: letters, digits, dots, dashes, underscores.
export function cleanAuthorizationCode(value) {
  const code = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._-]{8,1024}$/.test(code) ? code : "";
}

export function hasAppleIdentity(user) {
  const providers = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [];
  return user?.app_metadata?.provider === "apple" ||
    providers.includes("apple") ||
    (Array.isArray(user?.identities) && user.identities.some((identity) => identity?.provider === "apple"));
}

// Apple's user id ("sub") for the account's Sign in with Apple identity, or "".
// Supabase stores it as the identity's provider id and in identity_data.sub.
export function appleSubOf(user) {
  const identity = Array.isArray(user?.identities) ? user.identities.find((item) => item?.provider === "apple") : null;
  if (!identity) return "";
  return String(identity.identity_data?.sub || identity.provider_id || identity.id || "").trim();
}

// The "sub" claim of the id_token Apple returned with the token exchange. The
// token came straight from appleid.apple.com over TLS in answer to our own
// signed request, so reading the claim without verifying the signature is
// enough to compare it.
export function idTokenSub(idToken) {
  try {
    const part = String(idToken || "").split(".")[1];
    if (!part) return "";
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof payload?.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
}

async function post(path, form) {
  return fetch(`${APPLE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(6000)
  });
}

// Never throws. Returns { revoked: true } or { revoked: false, reason }.
//
// expectedSub: Apple's user id for the account being deleted (appleSubOf).
// The code the app sends is issued for the Apple ID signed in on the device,
// which can differ from the one the account was created with. Then the grant
// just created by that code is still revoked (it must not be left behind),
// but the answer is { revoked: false, reason: "different_apple_id" }, because
// the account's own grant is still listed in the person's Apple settings.
export async function revokeAppleTokens(authorizationCode, config = appleConfig(), { expectedSub = "" } = {}) {
  const code = cleanAuthorizationCode(authorizationCode);
  if (!code) return { revoked: false, reason: "no_code" };
  if (!config) return { revoked: false, reason: "not_configured" };
  try {
    const clientSecret = makeClientSecret(config);
    const exchange = await post("/auth/token", {
      client_id: config.clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code"
    });
    const tokens = await exchange.json().catch(() => ({}));
    if (!exchange.ok) return { revoked: false, reason: `token_${exchange.status}_${String(tokens?.error || "error").slice(0, 40)}` };
    const token = tokens.refresh_token || tokens.access_token;
    if (!token) return { revoked: false, reason: "no_token" };
    const revoke = await post("/auth/revoke", {
      client_id: config.clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token"
    });
    if (!revoke.ok) return { revoked: false, reason: `revoke_${revoke.status}` };
    const expected = String(expectedSub || "").trim();
    const actual = idTokenSub(tokens.id_token);
    if (expected && actual && actual !== expected) return { revoked: false, reason: "different_apple_id" };
    return { revoked: true };
  } catch (error) {
    return { revoked: false, reason: `error_${String(error?.name || "Error").slice(0, 40)}` };
  }
}
