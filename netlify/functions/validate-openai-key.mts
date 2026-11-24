import {
  json,
  verifyUser
} from "../lib/supabase.mjs";
import { reportError } from "../lib/report-error.mjs";
// Not part of the iPhone app (purchases, billing, BYOK, link previews, Business
// management, admin): requests from the app get 403 (netlify/lib/cors.mjs).
import { webOnly } from "../lib/cors.mjs";
// AI-6 / SRV-7 / INFRA-3 (security audit Nov 2026): the limit used to be an
// in-memory Map per function instance, keyed on the connection address (a
// shared Cloudflare edge behind cybernetai.app), so it reset on every cold
// start and worked as a checker for stolen OpenAI keys. It is now durable and
// per account (burstGuard "validate-openai-key": 10 per 10 minutes and 30 a
// day per account, plus per-address limits on the real visitor address).
import { burstGuard, readJsonCapped } from "../lib/abuse-guard.mjs";

const MAX_BODY_BYTES = 16_000;

function looksLikeOpenAIKey(value) {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(String(value || ""));
}

function chooseModel(modelIds) {
  const available = new Set(modelIds);

  // gpt-6-luna first: the cheapest current model, billed to the visitor's own
  // key (docs/app-store/MODEL-CHOICE.md). gpt-5 and gpt-5-mini are removed on
  // 2026-12-11; after that OpenAI no longer lists them for the key.
  const preferred = [
    "gpt-6-luna",
    "gpt-5.6",
    "gpt-5.4",
    "gpt-5.2",
    "gpt-5-mini",
    "gpt-5",
    "gpt-4.1-mini",
    "gpt-4o-mini"
  ];

  const exact = preferred.find(model => available.has(model));
  if (exact) return exact;

  // Never a pro, codex, cyber or deep-research variant: those cost far more
  // per call and are billed to the visitor's own key.
  return modelIds.find(model =>
    /^(gpt-6|gpt-5|gpt-4\.1|gpt-4o)(?:[.-]|$)/i.test(model) &&
    !/(audio|realtime|search|transcribe|tts|embedding|image|pro|codex|cyber|deep-research|chat-latest)/i.test(model)
  ) || "";
}

export default webOnly(async (request, context) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const { user } = await verifyUser(request);

    const burst = await burstGuard("validate-openai-key", { request, context, userId: user?.id });
    if (burst) {
      return json(
        {
          error:
            "Too many API-key checks. Wait ten minutes and try again.",
          code: "rate_limited"
        },
        429
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: "Request is too large." }, 413);
    }

    // SRV-11: capped while it streams in, not only by the declared length.
    const read = await readJsonCapped(request, MAX_BODY_BYTES);
    if (!read.ok && read.status === 413) {
      return json({ error: "Request is too large." }, 413);
    }
    const body = read.ok && read.body && typeof read.body === "object" ? read.body : {};
    const apiKey = String(body.apiKey || "").trim();

    if (!looksLikeOpenAIKey(apiKey)) {
      return json(
        {
          valid: false,
          error: "The key format is not recognized."
        },
        400
      );
    }

    /*
      A successful models request authenticates the API key without generating
      model output or charging for a completion.
    */
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(12_000)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const upstreamMessage = String(
        payload?.error?.message || ""
      ).toLowerCase();

      if (response.status === 401) {
        return json(
          {
            valid: false,
            error: "OpenAI rejected this API key."
          },
          401
        );
      }

      if (response.status === 403) {
        return json(
          {
            valid: false,
            error:
              "The key is recognized, but it does not have permission to list or use API models."
          },
          403
        );
      }

      if (
        upstreamMessage.includes("quota") ||
        upstreamMessage.includes("billing")
      ) {
        return json(
          {
            valid: false,
            error:
              "The key is recognized, but its OpenAI project has a billing or quota restriction."
          },
          402
        );
      }

      return json(
        {
          valid: false,
          error:
            "OpenAI could not validate the key right now."
        },
        502
      );
    }

    const modelIds = Array.isArray(payload?.data)
      ? payload.data
          .map(item => String(item?.id || ""))
          .filter(Boolean)
      : [];

    const model = chooseModel(modelIds);

    if (!model) {
      return json(
        {
          valid: false,
          error:
            "The key is valid, but no supported CyberNet AI model was available to this project."
        },
        403
      );
    }

    return json({
      valid: true,
      model,
      keySuffix: apiKey.slice(-4)
    });
  } catch (error) {
    reportError(error, { fn: "validate-openai-key", label: "Key validation failed", status: error?.status });
    // SRV-AUTH-11: our own 4xx messages (for example "sign in again") stay; any
    // other failure gets a fixed text instead of an upstream message.
    const status = Number(error?.status) || 500;
    return json(
      {
        valid: false,
        error:
          status < 500 && error?.status && error?.message
            ? error.message
            : "The API key could not be validated."
      },
      status
    );
  }
});

export const config = {
  path: "/api/validate-openai-key"
};
