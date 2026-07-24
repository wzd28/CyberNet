import OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

const MODEL = Netlify.env.get("ANALYSIS_MODEL") || "gpt-5";

const MAX_TEXT_CHARS = 12_000;
const MAX_IMAGE_DATA_CHARS = 4_500_000;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;

const rateBuckets = new Map();
const reputationCache = new Map();

const analysisSchema = {
  type: "object",
  additionalProperties: false,

  required: [
    "verdict",
    "score",
    "confidence",
    "threatType",
    "summary",
    "evidence",
    "counterEvidence",
    "limitations",
    "actions",
  ],

  properties: {
    verdict: {
      type: "string",
      enum: [
        "malicious",
        "suspicious",
        "low_risk",
        "inconclusive",
      ],
    },

    score: {
      type: "integer",
    },

    confidence: {
      type: "integer",
    },

    threatType: {
      type: "string",
    },

    summary: {
      type: "string",
    },

    evidence: {
      type: "array",
      maxItems: 8,
      items: {
        type: "string",
      },
    },

    counterEvidence: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
      },
    },

    limitations: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
      },
    },

    actions: {
      type: "array",
      minItems: 2,
      maxItems: 7,
      items: {
        type: "string",
      },
    },
  },
};

const analystInstructions = `
You are CyberNet Protect's cybersecurity triage analyst.

Analyze suspicious messages, URLs, QR-code destinations, and screenshots for:

- Phishing
- Scams
- Malware delivery
- Brand impersonation
- Account takeover
- Payment fraud
- Sextortion
- Remote-access fraud
- Social engineering

Accuracy rules:

1. Evaluate combinations of evidence, not isolated keywords.

2. Detect negation and educational or security-warning context.
For example, "Never share your OTP" is not itself an OTP request.

3. Distinguish a brand name shown in page text from the actual registered
domain supplied in the local analysis result.

4. Do not claim that a URL, message, or image is safe merely because no
obvious threat is visible or no reputation match exists.

5. Use the verdict "inconclusive" whenever sender identity, surrounding
conversation, final redirects, page contents, or visual evidence are
insufficient.

6. Confidence represents the quality and completeness of the evidence,
not the danger level. A high-risk result can still have limited confidence.

7. Never invent:
- Live reputation results
- Domain age
- WHOIS details
- Website behavior
- Security headers
- Redirect destinations
- Malware execution results

Only use live-reputation information explicitly included in the request.

8. For screenshots, inspect:
- Visible text
- Logos
- Spelling
- Layout
- URLs
- Phone numbers
- QR codes
- Payment requests
- Fake alerts
- Fake login pages
- Mismatched branding

Quote only short visible fragments.

9. Treat direct requests for any of the following as strong evidence:
- Passwords
- OTP codes
- PIN codes
- Card details
- CVV numbers
- Seed phrases
- Recovery phrases
- Remote access
- Executable downloads
- Irreversible payments

10. Provide specific evidence and safe next actions.

Never instruct the user to open a suspicious link to test it.

Scoring guide:

0-15:
Little visible risk, but this is not a guarantee of safety.

16-39:
Weak or mixed indicators.

40-69:
Suspicious, with multiple meaningful indicators.

70-89:
High risk or direct harmful request.

90-100:
Known threat reputation match or exceptionally direct malicious behavior.

Return only the required structured result.
`;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,

    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clamp(
  value: unknown,
  min = 0,
  max = 100
) {
  return Math.max(
    min,
    Math.min(
      max,
      Number(value) || 0
    )
  );
}

function strings(
  value: unknown,
  max = 8
) {
  const items =
    Array.isArray(value)
      ? value
      : [];

  return [
    ...new Set(
      items
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ].slice(0, max);
}

function safeLocalResult(value: any) {
  const item =
    value &&
    typeof value === "object"
      ? value
      : {};

  const allowedVerdicts = [
    "malicious",
    "suspicious",
    "low_risk",
    "inconclusive",
  ];

  const verdict =
    allowedVerdicts.includes(item.verdict)
      ? item.verdict
      : "inconclusive";

  return {
    score: clamp(item.score),

    confidence: clamp(
      item.confidence
    ),

    verdict,

    threatType: String(
      item.scamType ||
      item.threatType ||
      "Local analysis"
    ).slice(0, 100),

    evidence: strings(
      item.reasons,
      8
    ),

    counterEvidence: strings(
      item.counterEvidence,
      5
    ),

    limitations: strings(
      item.limitations,
      5
    ),
  };
}

function checkRateLimit(ip: string) {
  const key = ip || "unknown";
  const now = Date.now();

  const current =
    rateBuckets.get(key);

  if(
    !current ||
    now - current.started >
      RATE_WINDOW_MS
  ) {
    rateBuckets.set(key, {
      started: now,
      count: 1,
    });

    return true;
  }

  current.count += 1;

  return current.count <= RATE_MAX;
}

function normalizeUrl(value: unknown) {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "";
  }

  try {
    const candidate =
      /^[a-z][a-z0-9+.-]*:\/\//i.test(
        raw
      )
        ? raw
        : `https://${raw}`;

    const parsed =
      new URL(candidate);

    if (
      ![
        "http:",
        "https:",
      ].includes(parsed.protocol)
    ) {
      return "";
    }

    parsed.username = "";
    parsed.password = "";

    return parsed.href.slice(
      0,
      2048
    );
  } catch {
    return "";
  }
}

function cacheSeconds(
  duration: unknown
) {
  const match =
    String(duration || "")
      .match(
        /^([0-9.]+)s$/
      );

  return match
    ? Math.max(
        60,
        Math.min(
          86_400,
          Number(match[1]) || 300
        )
      )
    : 300;
}

async function checkUrlReputation(
  rawUrl: string
) {
  const apiKey =
    Netlify.env.get(
      "SAFE_BROWSING_API_KEY"
    );

  const checkedUrl =
    normalizeUrl(rawUrl);

  if (
    !apiKey ||
    !checkedUrl
  ) {
    return {
      checked: false,
      listed: false,
      threatTypes: [],
    };
  }

  const cached =
    reputationCache.get(
      checkedUrl
    );

  if (
    cached &&
    cached.expires > Date.now()
  ) {
    return cached.value;
  }

  const endpoint =
    new URL(
      "https://safebrowsing.googleapis.com/v5/urls:search"
    );

  endpoint.searchParams.set(
    "key",
    apiKey
  );

  endpoint.searchParams.append(
    "urls",
    checkedUrl
  );

  try {
    const response =
      await fetch(endpoint, {
        headers: {
          Accept:
            "application/json",
        },

        signal:
          AbortSignal.timeout(
            7000
          ),
      });

    if (!response.ok) {
      throw new Error(
        `Safe Browsing returned ${response.status}`
      );
    }

    const data =
      await response.json();

    const threats =
      Array.isArray(
        data.threats
      )
        ? data.threats
        : [];

    const value = {
      checked: true,

      listed:
        threats.length > 0,

      threatTypes: [
        ...new Set(
          threats.flatMap(
            (item: any) =>
              item.threatTypes || []
          )
        ),
      ],

      cacheDuration:
        data.cacheDuration || "",
    };

    reputationCache.set(
      checkedUrl,
      {
        value,

        expires:
          Date.now() +
          cacheSeconds(
            data.cacheDuration
          ) *
            1000,
      }
    );

    return value;
  } catch {
    return {
      checked: false,
      listed: false,
      threatTypes: [],
      unavailable: true,
    };
  }
}

function fallbackAnalysis(
  local: any,
  reputation: any
) {
  if (reputation.listed) {
    return {
      verdict: "malicious",

      score: 99,

      confidence: 99,

      threatType:
        "Known unsafe URL",

      summary:
        "The live URL reputation service matched this destination to a known threat list.",

      evidence: [
        `Live reputation match: ${
          reputation
            .threatTypes
            .join(", ") ||
          "known unsafe resource"
        }.`,

        ...local.evidence,
      ].slice(0, 8),

      counterEvidence:
        local.counterEvidence,

      limitations: [
        "The destination page was not opened or executed by CyberNet Protect.",
      ],

      actions: [
        "Do not open the link or enter any information.",

        "Delete and report the message or page that supplied it.",

        "Change affected credentials from a clean device if you already entered them.",

        "Contact the real organization through its official app or known phone number.",
      ],
    };
  }

  return {
    verdict:
      local.verdict,

    score:
      Math.round(
        local.score
      ),

    confidence:
      Math.round(
        local.confidence
      ),

    threatType:
      local.threatType,

    summary:
      "Secure AI analysis is unavailable, so this result uses the local evidence layer only.",

    evidence:
      local.evidence.length
        ? local.evidence
        : [
            "No decisive local indicator was available.",
          ],

    counterEvidence:
      local.counterEvidence,

    limitations: [
      ...local.limitations,

      "AI-assisted semantic or visual analysis was not available.",
    ].slice(0, 5),

    actions: [
      "Treat the content as unverified until the sender and destination are independently confirmed.",

      "Do not share credentials, authentication codes, payment details, or recovery phrases.",

      "Use the organization's official app, website, or known phone number to verify the request.",
    ],
  };
}

async function runAiAnalysis({
  type,
  content,
  imageData,
  local,
  reputation,
}: {
  type: string;
  content: string;
  imageData: string;
  local: any;
  reputation: any;
}) {
  const aiAvailable =
    Boolean(
      Netlify.env.get(
        "OPENAI_BASE_URL"
      ) ||
      Netlify.env.get(
        "OPENAI_API_KEY"
      )
    );

  if (!aiAvailable) {
    return null;
  }

  const client =
    new OpenAI();

  const reputationText =
    reputation.checked
      ? reputation.listed
        ? `LIVE REPUTATION: LISTED as ${
            reputation
              .threatTypes
              .join(", ") ||
            "known threat"
          }.`
        : "LIVE REPUTATION: checked; no list match was returned. This absence does not prove safety."
      : "LIVE REPUTATION: not available.";

  const contextText = [
    `ANALYSIS TYPE: ${type}`,

    reputationText,

    `LOCAL RESULT (supporting evidence, not authoritative): ${JSON.stringify(
      local
    )}`,

    `USER-SUPPLIED CONTENT: ${String(
      content || ""
    ).slice(
      0,
      MAX_TEXT_CHARS
    )}`,
  ].join("\n\n");

  const inputContent:
    ResponseInputContent[] = [
      {
        type: "input_text",
        text: contextText,
      },
    ];

  if (
    type === "image" &&
    typeof imageData ===
      "string" &&
    imageData.startsWith(
      "data:image/"
    ) &&
    imageData.length <=
      MAX_IMAGE_DATA_CHARS
  ) {
    inputContent.push({
      type: "input_image",
      image_url: imageData,
      detail: "high",
    });
  }

  const response =
    await client.responses.create({
      model: MODEL,

      instructions:
        analystInstructions,

      input: [
        {
          role: "user",
          content: inputContent,
        },
      ],

      text: {
        format: {
          type: "json_schema",

          name:
            "cybernet_protect_analysis",

          strict: true,

          schema:
            analysisSchema,
        },
      },

      max_output_tokens:
        1500,

      store: false,
    });

  const parsed =
    JSON.parse(
      response.output_text
    );

  if (reputation.listed) {
    parsed.verdict =
      "malicious";

    parsed.score =
      Math.max(
        98,
        clamp(parsed.score)
      );

    parsed.confidence =
      Math.max(
        98,
        clamp(
          parsed.confidence
        )
      );

    parsed.threatType =
      "Known unsafe URL";

    parsed.evidence = [
      `Live reputation match: ${
        reputation
          .threatTypes
          .join(", ") ||
        "known unsafe resource"
      }.`,

      ...strings(
        parsed.evidence,
        7
      ),
    ].slice(0, 8);
  }

  return parsed;
}

export default async function handler(
  req: Request,
  context: any
) {
  if (req.method === "GET") {
    const aiEnabled =
      Boolean(
        Netlify.env.get(
          "OPENAI_BASE_URL"
        ) ||
        Netlify.env.get(
          "OPENAI_API_KEY"
        )
      );

    return json({
      online: true,

      aiEnabled,

      model:
        aiEnabled
          ? MODEL
          : "Local engine",

      reputationEnabled:
        Boolean(
          Netlify.env.get(
            "SAFE_BROWSING_API_KEY"
          )
        ),
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        error:
          "Method not allowed",
      },
      405
    );
  }

  if (
    !checkRateLimit(
      context.ip
    )
  ) {
    return json(
      {
        error:
          "Too many analysis requests. Please try again later.",
      },
      429
    );
  }

  const length =
    Number(
      req.headers.get(
        "content-length"
      ) || 0
    );

  if (length > 5_500_000) {
    return json(
      {
        error:
          "Request is too large",
      },
      413
    );
  }

  let body: any;

  try {
    body =
      await req.json();
  } catch {
    return json(
      {
        error:
          "Invalid JSON body",
      },
      400
    );
  }

  const allowedTypes = [
    "text",
    "link",
    "image",
  ];

  const type =
    allowedTypes.includes(
      body?.type
    )
      ? body.type
      : null;

  if (!type) {
    return json(
      {
        error:
          "Invalid analysis type",
      },
      400
    );
  }

  const content =
    String(
      body?.content || ""
    ).slice(
      0,
      MAX_TEXT_CHARS
    );

  const imageData =
    typeof body?.imageData ===
      "string"
      ? body.imageData.slice(
          0,
          MAX_IMAGE_DATA_CHARS
        )
      : "";

  if (
    !content &&
    !(
      type === "image" &&
      imageData
    )
  ) {
    return json(
      {
        error:
          "No content supplied",
      },
      400
    );
  }

  const local =
    safeLocalResult(
      body?.localResult
    );

  const reputation =
    type === "link"
      ? await checkUrlReputation(
          content
        )
      : {
          checked: false,
          listed: false,
          threatTypes: [],
        };

  let analysis = null;
  let aiUsed = false;

  try {
    analysis =
      await runAiAnalysis({
        type,
        content,
        imageData,
        local,
        reputation,
      });

    aiUsed =
      Boolean(analysis);
  } catch (error) {
    console.error(
      "CyberNet Protect AI analysis failed",
      {
        requestId:
          context.requestId,

        name:
          error instanceof Error
            ? error.name
            : "UnknownError",

        message:
          error instanceof Error
            ? error.message
            : "Unknown error",
      }
    );
  }

  if (!analysis) {
    analysis =
      fallbackAnalysis(
        local,
        reputation
      );
  }

  return json({
    analysis,
    reputation,
    aiUsed,

    model:
      aiUsed
        ? MODEL
        : "Local engine",
  });
}

export const config = {
  path: "/api/analyze",

  method: [
    "GET",
    "POST",
  ],
};