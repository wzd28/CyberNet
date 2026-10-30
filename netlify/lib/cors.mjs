// The iPhone app (Capacitor) loads its pages from capacitor://localhost and
// calls https://cybernetai.app/api/... from there, so every function the app
// uses must answer CORS. Netlify's [[headers]] in netlify.toml do not apply to
// function responses, so the headers are added here, in code.
//
// Only that one origin is allowed. Requests from the website itself are
// same-origin and never carry an Origin that matches, so for them the wrapped
// function behaves exactly as before: same status, same body, same headers.
//
// isIOS(): the app's fetch shim adds `X-CyberNet-Platform: ios` to every /api
// call (BUILD-PLAN §5.5). A request from the app's origin counts as iOS even
// if a call slips past the shim, so the app can never reach the web paths
// (plans, billing, admin bypass) by accident.

export const APP_ORIGIN = "capacitor://localhost";
const ALLOWED = new Set([APP_ORIGIN]);

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-CyberNet-Platform, X-CyberNet-App-Version",
  "Access-Control-Max-Age": "600"
});

function corsHeaders(origin) {
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin", ...CORS_HEADERS };
}

export function allowedOrigin(request) {
  const origin = request?.headers?.get?.("origin") || "";
  return ALLOWED.has(origin) ? origin : "";
}

export function isIOS(request) {
  const headers = request?.headers;
  if (!headers?.get) return false;
  return String(headers.get("x-cybernet-platform") || "").trim().toLowerCase() === "ios" || Boolean(allowedOrigin(request));
}

// Copies the response with the CORS headers added. The body is passed on as a
// stream, so nothing is buffered.
function withHeaders(response, origin) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function withCors(handler) {
  return async function corsWrapped(request, context) {
    const origin = allowedOrigin(request);
    if (!origin) return handler(request, context); // the website: untouched
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...corsHeaders(origin), "Cache-Control": "no-store" } });
    }
    let response;
    try {
      response = await handler(request, context);
    } catch (error) {
      // An uncaught error would reach the app as an opaque CORS failure; give
      // it a readable 500 instead. The website path above still rethrows.
      console.error("CyberNet function failed (app request)", error?.message || error);
      response = new Response(JSON.stringify({ error: "Something went wrong on our side. Please try again in a few minutes." }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    return withHeaders(response, origin);
  };
}

// Functions the iPhone app must never use: purchases, billing, BYOK, link
// previews, Business team management and the admin inbox (App Review 3.1.1
// and 2.5.19). An iOS request gets a plain 403 and the function never runs.
export const NOT_IN_APP_MESSAGE = "This isn't available in the CyberNet AI app.";

export function webOnly(handler) {
  return async function webOnlyWrapped(request, context) {
    if (isIOS(request)) {
      return new Response(JSON.stringify({ error: NOT_IN_APP_MESSAGE, code: "NOT_AVAILABLE_IN_APP" }), {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
      });
    }
    return handler(request, context);
  };
}
