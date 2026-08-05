import {
  json,
  verifyUser
} from "../lib/supabase.mjs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

function clientAddress(request) {
  return (
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function allowed(ip) {
  const now = Date.now();
  const current = attempts.get(ip);

  if (!current || now - current.startedAt > WINDOW_MS) {
    attempts.set(ip, {
      startedAt: now,
      count: 1
    });
    return true;
  }

  current.count += 1;
  return current.count <= MAX_ATTEMPTS;
}

function looksLikeOpenAIKey(value) {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(String(value || ""));
}

function chooseModel(modelIds) {
  const available = new Set(modelIds);

  const preferred = [
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

  return modelIds.find(model =>
    /^(gpt-5|gpt-4\.1|gpt-4o)(?:[.-]|$)/i.test(model) &&
    !/(audio|realtime|search|transcribe|tts|embedding|image)/i.test(model)
  ) || "";
}

export default async request => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    await verifyUser(request);

    const ip = clientAddress(request);

    if (!allowed(ip)) {
      return json(
        {
          error:
            "Too many API-key checks. Wait ten minutes and try again."
        },
        429
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (contentLength > 16_000) {
      return json({ error: "Request is too large." }, 413);
    }

    const body = await request.json().catch(() => ({}));
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
    return json(
      {
        valid: false,
        error:
          error?.message ||
          "The API key could not be validated."
      },
      Number(error?.status) || 500
    );
  }
};

export const config = {
  path: "/api/validate-openai-key"
};
