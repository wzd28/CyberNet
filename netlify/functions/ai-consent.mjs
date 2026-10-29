// /api/ai-consent: the iPhone app's "Allow AI analysis?" answer
// (BUILD-PLAN §7.4; netlify/lib/ai-consent.mjs).
//
//   GET     -> { granted, version, provider }   is there an open consent for
//                                                the current version?
//   POST    { version } -> { granted: true, version, grantedAt }
//              version must be the current AI_CONSENT_VERSION (the wording
//              the person saw); an older sheet gets 409 and is shown again.
//   DELETE  -> { granted: false, withdrawn: <rows closed> }
//
// Signed-in only; the user id always comes from the verified Supabase token.
// Requests from the app record platform "ios", anything else "web" (the
// website does not ask for this consent in 1.0).

import { json, verifyUser, serviceFetch } from "../lib/supabase.mjs";
import { withCors, isIOS } from "../lib/cors.mjs";
import {
  AI_CONSENT_VERSION, AI_CONSENT_PROVIDER, platformOf,
  hasAiConsent, grantAiConsent, withdrawAiConsent
} from "../lib/ai-consent.mjs";
import { reportError } from "../lib/report-error.mjs";

async function handler(request) {
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return json({ error: "Method not allowed." }, 405);
  }

  let user;
  try {
    ({ user } = await verifyUser(request));
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json({ error: status === 401 ? "Sign in to change AI analysis settings." : "AI analysis settings are not available right now.", code: status === 401 ? "AUTH_REQUIRED" : "NOT_CONFIGURED" }, status === 401 ? 401 : 503);
  }

  const platform = platformOf(isIOS(request));

  try {
    if (request.method === "GET") {
      const granted = await hasAiConsent(serviceFetch, user.id, platform);
      return json({ granted, version: AI_CONSENT_VERSION, provider: AI_CONSENT_PROVIDER });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const version = String(body?.version || "").trim().slice(0, 40);
      if (version !== AI_CONSENT_VERSION) {
        return json({
          error: "The AI analysis notice has changed. Please read it again before allowing.",
          code: "AI_CONSENT_VERSION_MISMATCH",
          version: AI_CONSENT_VERSION
        }, 409);
      }
      const saved = await grantAiConsent(serviceFetch, user.id, platform, request.headers.get("user-agent"));
      return json({ granted: true, version: saved.version, grantedAt: saved.grantedAt, provider: AI_CONSENT_PROVIDER });
    }

    const withdrawn = await withdrawAiConsent(serviceFetch, user.id, platform);
    return json({ granted: false, withdrawn, version: AI_CONSENT_VERSION });
  } catch (error) {
    console.error("CyberNet ai-consent failed", error?.message || error);
    reportError(error, { fn: "ai-consent", label: `AI consent ${request.method} failed` });
    return json({ error: "We couldn't update your AI analysis setting just now. Please try again in a minute.", code: "AI_CONSENT_UNAVAILABLE" }, 503);
  }
}

export default withCors(handler);

export const config = {
  path: "/api/ai-consent"
};
