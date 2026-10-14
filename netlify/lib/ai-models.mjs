// Which OpenAI model each AI call uses, and which request parameters that
// model accepts. Analysis AI (analyze.mts), BYOK (byok-analyze.mts) and
// Recovery (recovery-mode.mts, recovery-update.mts) all build their requests
// through here, so switching models in the Netlify environment variables
// cannot send a parameter value the new model rejects.
//
// Sources (OpenAI API docs, read 2026-10-14):
// - https://developers.openai.com/api/docs/deprecations - entry of 2026-06-11:
//   gpt-5-2025-08-07 and gpt-5-mini-2025-08-07 (the snapshots behind the
//   "gpt-5" and "gpt-5-mini" aliases, see /docs/models/gpt-5 and
//   /docs/models/gpt-5-mini) shut down on 2026-12-11; recommended replacements
//   gpt-5.6-sol and gpt-5.6-terra (gpt-5-nano -> gpt-5.6-luna). Entry of
//   2026-10-01: gpt-5.1 and gpt-5.4-nano shut down on 2027-04-01 (-> gpt-6-sol,
//   gpt-6-luna).
// - Model pages, "reasoning.effort supports":
//   gpt-5: minimal, low, medium, high.
//   gpt-5.1: none (default), low, medium, high.
//   gpt-5.2, gpt-5.4: none (default), low, medium, high, xhigh.
//   gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna, gpt-6-luna: none, low,
//   medium (default), high, xhigh, max.
//   gpt-6-astra, gpt-6.1-sol: low, medium (default), high, xhigh, max - no
//   "none" and no "minimal".
// - https://developers.openai.com/api/docs/guides/latest-model: "If your
//   existing request uses minimal, start with low"; GPT-6 Sol and GPT-6 Luna
//   support none; when effort is not none, temperature/top_p/top_logprobs must
//   not be sent (none of these requests send them).
// - https://developers.openai.com/api/docs/guides/prompt-caching: caching is
//   automatic from 1,024 prompt tokens, needs an identical prefix (static
//   instructions first, dynamic content after), and prompt_cache_key is
//   "optional for separate cache accounting" on GPT-5.6+ and recommended for
//   cache routing on earlier models.

// TODO(owner, before 2026-12-11): the defaults below are the models production
// runs today. Their snapshots are removed on 2026-12-11. Run the eval
// (research item 3), then set ANALYSIS_MODEL and ANALYSIS_MODEL_MINI in Netlify
// (Site configuration > Environment variables) to the chosen models and
// redeploy. If nothing is set by then, the call that fails because the model
// is gone is retried once on OpenAI's named replacement (below), unless
// ANALYSIS_MODEL_AUTO_REPLACE is set to "off".
export const DEFAULT_MODEL = "gpt-5";
export const DEFAULT_MINI_MODEL = "gpt-5-mini";

export const RETIRING_MODELS = {
  "gpt-5": { retiresOn: "2026-12-11", replacement: "gpt-5.6-sol" },
  "gpt-5-2025-08-07": { retiresOn: "2026-12-11", replacement: "gpt-5.6-sol" },
  "gpt-5-mini": { retiresOn: "2026-12-11", replacement: "gpt-5.6-terra" },
  "gpt-5-mini-2025-08-07": { retiresOn: "2026-12-11", replacement: "gpt-5.6-terra" },
  "gpt-5-nano": { retiresOn: "2026-12-11", replacement: "gpt-5.6-luna" },
  "gpt-5-nano-2025-08-07": { retiresOn: "2026-12-11", replacement: "gpt-5.6-luna" },
  "gpt-5.1": { retiresOn: "2027-04-01", replacement: "gpt-6-sol" },
  "gpt-5.4-nano": { retiresOn: "2027-04-01", replacement: "gpt-6-luna" },
};

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
  { re: new RegExp(`^gpt-6-(?:sol|luna)${SNAPSHOT}`), efforts: EFFORTS_NONE_TO_MAX },
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

// The parameters that depend on the model. prompt_cache_key is only sent to
// OpenAI itself (not through a custom OPENAI_BASE_URL gateway, which may not
// pass unknown fields through).
export function modelParams(model, { preferredEfforts, baseOutputTokens, cacheKey = "", effortOverride = "", customBaseUrl = false }) {
  const reasoning = reasoningFor(model, preferredEfforts, effortOverride);
  return {
    model,
    ...(reasoning ? { reasoning } : {}),
    max_output_tokens: outputBudget(baseOutputTokens, reasoning),
    ...(cacheKey && !customBaseUrl ? { prompt_cache_key: cacheKey } : {}),
  };
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
