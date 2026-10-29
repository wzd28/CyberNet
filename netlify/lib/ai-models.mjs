// Which OpenAI model each AI call uses, and which request parameters that
// model accepts. Analysis AI (analyze.mts), BYOK (byok-analyze.mts) and
// Recovery (recovery-mode.mts, recovery-update.mts) all build their requests
// through here, so switching models in the Netlify environment variables
// cannot send a parameter value the new model rejects.
//
// Sources (OpenAI API docs, read 2026-10-29):
// - https://developers.openai.com/api/docs/deprecations - entry of 2026-06-11:
//   gpt-5 / gpt-5-2025-08-07 and gpt-5-mini / gpt-5-mini-2025-08-07 shut down
//   on 2026-12-11; OpenAI's named replacements are gpt-5.6-sol and
//   gpt-5.6-terra (gpt-5-nano -> gpt-5.6-luna). Entry of 2026-10-01: gpt-5.1
//   and gpt-5.4-nano shut down on 2027-04-01 (-> gpt-6-sol, gpt-6-luna).
//   Entry of 2026-10-14: the dated gpt-4o, gpt-4o-mini, gpt-4.1 and
//   gpt-4.1-mini snapshots shut down on 2027-01-14 (-> gpt-6-luna).
// - Model pages (/api/docs/models/<id>), "reasoning.effort supports":
//   gpt-5: minimal, low, medium, high.
//   gpt-5.1: none (default), low, medium, high.
//   gpt-5.2, gpt-5.4: none (default), low, medium, high, xhigh.
//   gpt-5.6-sol / -terra / -luna, gpt-6-sol, gpt-6-luna, gpt-6.1-terra: none,
//   low, medium (default), high, xhigh, max.
//   gpt-6-astra, gpt-6.1-sol: low, medium (default), high, xhigh, max - no
//   "none" and no "minimal".
//   Every GPT-6 model lists Structured Outputs, image input and the Responses
//   API; none takes temperature/top_p when effort is not none (these requests
//   never send them).
// - https://developers.openai.com/api/docs/guides/latest-model: "If your
//   existing request uses minimal, start with low"; Astra and Sol have no
//   "none" ("use low instead").
// - https://developers.openai.com/api/docs/guides/prompt-caching: on GPT-5.6
//   and later caching is on by default from 1,024 prompt tokens with a 30-minute
//   lifetime, a cache write costs 1.25x the input rate, and prompt_cache_key is
//   only for separate cache accounting (it is still accepted).
// - https://developers.openai.com/api/docs/guides/safety-checks: send a stable,
//   hashed end-user ID (safety_identifier) so a flag stays with that user.

import { createHash } from "node:crypto";

// The two models, chosen 29 Oct 2026 by price, speed and quality for short
// scam-analysis answers (prices per 1M tokens, input / cached / output):
// - DEFAULT_MODEL (Pro/Business ambiguous Analysis AI, investigation, critical
//   Recovery): gpt-6.1-terra, $1 / $0.05 / $5, against gpt-5's $1.25 / $0.125
//   / $10. It accepts "none", so the 24 s quick call stays about as fast as
//   gpt-5 at "minimal". OpenAI's own pick, gpt-5.6-sol, is $4 / $0.40 / $20.
// - DEFAULT_MINI_MODEL (Free Analysis AI, other Recovery cases):
//   gpt-6-luna, $0.10 / $0.01 / $0.50, against gpt-5-mini's $0.25 / $0.025 /
//   $2. OpenAI's own pick, gpt-5.6-terra, is $2 / $0.20 / $12.
// ANALYSIS_MODEL and ANALYSIS_MODEL_MINI in Netlify still override both. To go
// back before 2026-12-11, set them to gpt-5 and gpt-5-mini; after that date a
// call to a removed model is retried once on the replacement below (unless
// ANALYSIS_MODEL_AUTO_REPLACE is "off").
export const DEFAULT_MODEL = "gpt-6.1-terra";
export const DEFAULT_MINI_MODEL = "gpt-6-luna";

// Snapshots OpenAI has scheduled for removal. `replacement` is where the
// one-time retry in createResponse goes: the defaults above, not OpenAI's named
// replacement (`openai`): for these calls gpt-5.6-sol costs about four times
// gpt-6.1-terra, and gpt-5.6-terra about twenty times gpt-6-luna. Keys are
// lower case.
function retiring(retiresOn, replacement, openai) {
  return Object.freeze({ retiresOn, replacement, openai });
}
export const RETIRING_MODELS = Object.freeze({
  "gpt-5": retiring("2026-12-11", DEFAULT_MODEL, "gpt-5.6-sol"),
  "gpt-5-2025-08-07": retiring("2026-12-11", DEFAULT_MODEL, "gpt-5.6-sol"),
  "gpt-5-mini": retiring("2026-12-11", DEFAULT_MINI_MODEL, "gpt-5.6-terra"),
  "gpt-5-mini-2025-08-07": retiring("2026-12-11", DEFAULT_MINI_MODEL, "gpt-5.6-terra"),
  "gpt-5-nano": retiring("2026-12-11", DEFAULT_MINI_MODEL, "gpt-5.6-luna"),
  "gpt-5-nano-2025-08-07": retiring("2026-12-11", DEFAULT_MINI_MODEL, "gpt-5.6-luna"),
  "gpt-4o-2024-08-06": retiring("2027-01-14", DEFAULT_MINI_MODEL, "gpt-6-luna"),
  "gpt-4o-2024-11-20": retiring("2027-01-14", DEFAULT_MINI_MODEL, "gpt-6-luna"),
  "gpt-4o-mini-2024-07-18": retiring("2027-01-14", DEFAULT_MINI_MODEL, "gpt-6-luna"),
  "gpt-4.1-2025-04-14": retiring("2027-01-14", DEFAULT_MINI_MODEL, "gpt-6-luna"),
  "gpt-4.1-mini-2025-04-14": retiring("2027-01-14", DEFAULT_MINI_MODEL, "gpt-6-luna"),
  "gpt-5.1": retiring("2027-04-01", DEFAULT_MODEL, "gpt-6-sol"),
  "gpt-5.1-2025-11-13": retiring("2027-04-01", DEFAULT_MODEL, "gpt-6-sol"),
  "gpt-5.4-nano": retiring("2027-04-01", DEFAULT_MINI_MODEL, "gpt-6-luna"),
  "gpt-5.4-nano-2026-03-17": retiring("2027-04-01", DEFAULT_MINI_MODEL, "gpt-6-luna"),
});

const EFFORTS_GPT5 = ["minimal", "low", "medium", "high"];
const EFFORTS_NONE_TO_HIGH = ["none", "low", "medium", "high"];
const EFFORTS_NONE_TO_XHIGH = ["none", "low", "medium", "high", "xhigh"];
const EFFORTS_NONE_TO_MAX = ["none", "low", "medium", "high", "xhigh", "max"];
const EFFORTS_LOW_TO_MAX = ["low", "medium", "high", "xhigh", "max"];
// "low" is accepted by every OpenAI reasoning model documented above, so an
// unknown reasoning model gets only these.
const EFFORTS_SAFE = ["low", "medium", "high"];

const SNAPSHOT = "(?:-\\d{4}-\\d{2}-\\d{2})?$";
const FAMILIES = [
  { re: new RegExp(`^gpt-5(?:-mini|-nano)?${SNAPSHOT}`), efforts: EFFORTS_GPT5 },
  { re: new RegExp(`^gpt-5\\.1${SNAPSHOT}`), efforts: EFFORTS_NONE_TO_HIGH },
  { re: new RegExp(`^gpt-5\\.[24]${SNAPSHOT}`), efforts: EFFORTS_NONE_TO_XHIGH },
  { re: new RegExp(`^gpt-5\\.6(?:-(?:sol|terra|luna))?${SNAPSHOT}`), efforts: EFFORTS_NONE_TO_MAX },
  { re: new RegExp(`^(?:gpt-6-(?:sol|luna)|gpt-6\\.1-terra)${SNAPSHOT}`), efforts: EFFORTS_NONE_TO_MAX },
  { re: new RegExp(`^(?:gpt-6-astra|gpt-6\\.1-sol)${SNAPSHOT}`), efforts: EFFORTS_LOW_TO_MAX },
  { re: /^o\d/, efforts: EFFORTS_SAFE },
  // Not reasoning models: a reasoning field is rejected outright.
  { re: /^(?:gpt-4|gpt-3\.5|chatgpt-4o)/, efforts: null },
];

export function supportedEfforts(model) {
  const id = String(model || "").trim().toLowerCase();
  const family = FAMILIES.find((f) => f.re.test(id));
  return family ? family.efforts : EFFORTS_SAFE;
}

// The first effort in `preferred` the model accepts; an override (from
// ANALYSIS_REASONING_EFFORT) wins when the model accepts it. Returns null for
// a model that takes no reasoning field at all.
export function reasoningFor(model, preferred = ["minimal", "none", "low"], override = "") {
  const supported = supportedEfforts(model);
  if (!supported) return null;
  const wanted = String(override || "").trim().toLowerCase();
  if (wanted && supported.includes(wanted)) return { effort: wanted };
  const effort = preferred.find((value) => supported.includes(value)) || (supported.includes("low") ? "low" : supported[0]);
  return { effort };
}

// Reasoning tokens are billed as output and count against max_output_tokens.
// The base budgets were sized for gpt-5 at "minimal"; a model thinking at
// "low" or above needs headroom or its answer ends "incomplete".
export function outputBudget(base, reasoning) {
  const effort = reasoning && reasoning.effort;
  if (!effort || effort === "none" || effort === "minimal") return base;
  if (effort === "low") return base + 1_500;
  return base + 4_000;
}

// The parameters that depend on the model. prompt_cache_key and
// safety_identifier are only sent to OpenAI itself (not through a custom
// OPENAI_BASE_URL gateway, which may not pass unknown fields through).
export function modelParams(model, { preferredEfforts, baseOutputTokens, cacheKey = "", effortOverride = "", customBaseUrl = false, safetyIdentifier = "" }) {
  const reasoning = reasoningFor(model, preferredEfforts, effortOverride);
  return {
    model,
    ...(reasoning ? { reasoning } : {}),
    max_output_tokens: outputBudget(baseOutputTokens, reasoning),
    ...(cacheKey && !customBaseUrl ? { prompt_cache_key: cacheKey } : {}),
    ...(safetyIdentifier && !customBaseUrl ? { safety_identifier: safetyIdentifier } : {}),
  };
}

// A stable ID for one signed-in user that does not reveal who they are: a
// one-way hash of their account id, for modelParams' safetyIdentifier. OpenAI
// asks for one so that, if a safety classifier flags a request (scam content
// can look like attack material), the flag stays with that user instead of
// counting against the whole organisation. Empty for a visitor without an id.
export function safetyIdentifierFor(userId) {
  const id = String(userId || "").trim();
  if (!id) return "";
  return createHash("sha256").update(`cybernet-ai:${id}`).digest("hex").slice(0, 32);
}

// Bring-your-own-key Analysis AI (website only, byok-analyze.mts) sends the
// model the visitor's key was validated for. A key saved before OpenAI removed
// that model would fail on every call, so a model past its removal date goes
// to its replacement. No model, or a malformed name: DEFAULT_MINI_MODEL.
export function byokModel(value, today = new Date().toISOString().slice(0, 10)) {
  const model = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(model)) return DEFAULT_MINI_MODEL;
  const entry = retirementOf(model);
  if (entry && entry.retiresOn <= today) return entry.replacement;
  return model;
}

export function replacementFor(model) {
  const entry = RETIRING_MODELS[String(model || "").trim().toLowerCase()];
  return entry ? entry.replacement : "";
}

export function retirementOf(model) {
  return RETIRING_MODELS[String(model || "").trim().toLowerCase()] || null;
}

function errorText(error) {
  return `${error?.message || ""} ${error?.error?.message || ""}`.toLowerCase();
}

export function isModelUnavailableError(error) {
  const status = Number(error?.status) || 0;
  const code = String(error?.code || error?.error?.code || "").toLowerCase();
  if (code === "model_not_found") return true;
  if (status !== 404 && status !== 400) return false;
  return /model[^.]{0,80}(?:does not exist|not found|deprecated|no longer (?:available|supported)|has been (?:removed|retired|shut down)|not supported)/.test(errorText(error));
}

function rejectedParam(error) {
  const status = Number(error?.status) || 0;
  if (status !== 400) return "";
  return String(error?.param || error?.error?.param || "").toLowerCase();
}

// Sends one Responses API request built for `model`. Two narrow retries, each
// at most once: a model the API says is gone is retried on OpenAI's named
// replacement (when allowed), and a rejected reasoning setting is retried with
// "low" (or without one). The returned model is the one that answered.
export async function createResponse(client, model, buildRequest, { allowReplace = true, label = "OpenAI" } = {}) {
  let currentModel = model;
  let effortOverride = "";
  let dropReasoning = false;
  let replaced = false;
  let effortRetried = false;
  for (;;) {
    const request = buildRequest(currentModel, effortOverride);
    if (dropReasoning) delete request.reasoning;
    try {
      return { response: await client.responses.create(request), model: currentModel };
    } catch (error) {
      const replacement = !replaced && allowReplace && isModelUnavailableError(error) ? replacementFor(currentModel) : "";
      if (replacement) {
        console.warn(`${label}: model ${currentModel} is unavailable; retrying once on ${replacement}. Set ANALYSIS_MODEL / ANALYSIS_MODEL_MINI in Netlify.`);
        replaced = true;
        currentModel = replacement;
        effortOverride = "";
        continue;
      }
      const param = rejectedParam(error);
      if (!effortRetried && param.startsWith("reasoning") && request.reasoning) {
        effortRetried = true;
        if (param === "reasoning.effort" && request.reasoning.effort !== "low") effortOverride = "low";
        else dropReasoning = true;
        console.warn(`${label}: ${currentModel} rejected ${param}; retrying once ${dropReasoning ? "without it" : "with effort low"}.`);
        continue;
      }
      throw error;
    }
  }
}

// ANALYSIS_MODEL_AUTO_REPLACE=off turns the replacement retry off.
export function autoReplaceEnabled(value) {
  return !/^(?:off|false|0|no)$/i.test(String(value || "").trim());
}
