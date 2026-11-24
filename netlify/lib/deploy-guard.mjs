// Paid endpoints answer only on the production deploy (security audit Nov 2026, INFRA-1).
//
// Every Netlify deploy keeps its own public URL (deploy previews, branch deploys
// such as redesign-v3--cybernet-ai.netlify.app, and per-deploy permalinks), and
// its functions run with whatever environment variables that context gets. A
// branch or preview built from older code would let anyone with a free account
// call OpenAI, the screenshot provider or Stripe through code that predates the
// current limits. This wrapper makes the endpoints that spend money or touch
// billing answer 404 on deploy previews and branch deploys built from now on.
//
// What it decides on: context.deploy.context, the Functions v2 runtime value
// ("production", "deploy-preview", "branch-deploy", "dev"). process.env.CONTEXT
// is a build-time variable and is not reliable inside a running function.
//
// Fails open on purpose: when the value is missing (the tests, which call the
// handlers without a Netlify context, and anything unexpected) or is
// "production" / "dev" (local `netlify dev`), the request goes through
// unchanged. Only the two explicit non-production values are blocked, so a
// change in Netlify's runtime can never switch off the live site.
//
// Testing a paid flow on a preview: set CN_ALLOW_PREVIEW_PAID=1 for the
// "Deploy Previews" (or "Branch deploys") context only, in Netlify > Site
// configuration > Environment variables, then remove it again.
//
// This only protects deploys built after this change. Older deploys that are
// already published keep their old code: the real fix for those is rotating
// the secrets they hold and deleting them (owner steps, INFRA-1).

const BLOCKED_CONTEXTS = new Set(["deploy-preview", "branch-deploy"]);

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}

export function deployContext(context) {
  try {
    const value = context?.deploy?.context;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export function blockedOutsideProduction(context) {
  if (!BLOCKED_CONTEXTS.has(deployContext(context))) return false;
  return env("CN_ALLOW_PREVIEW_PAID") !== "1";
}

export function productionOnly(handler) {
  return async function productionOnlyHandler(request, context) {
    if (blockedOutsideProduction(context)) {
      return new Response(JSON.stringify({ error: "Not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }
    return handler(request, context);
  };
}
