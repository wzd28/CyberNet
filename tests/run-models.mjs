// Request shapes for every OpenAI call (netlify/lib/ai-models.mjs): which
// reasoning effort each model is sent, the output budget that goes with it,
// and the retry when a model is gone or rejects a setting. No network, no keys:
//
//   node tests/run-models.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reasoningFor, outputBudget, modelParams, createResponse, supportedEfforts, replacementFor, retirementOf, autoReplaceEnabled, safetyIdentifierFor, byokModel, RETIRING_MODELS, DEFAULT_MODEL, DEFAULT_MINI_MODEL } from "../netlify/lib/ai-models.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
let checks = 0;
function check(id, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`[${id}] FAIL ${JSON.stringify(detail)}`);
  }
}

// The preferred-effort lists the functions use (keep in sync with the code).
const PATHS = {
  quick: ["minimal", "none", "low"], // analyze.mts, byok-analyze.mts
  plan: ["minimal", "low"], // recovery-mode.mts
  update: ["low"], // recovery-update.mts
};
// The base output budgets the functions pass (keep in sync with the code).
const BASE = { quick: 2_500, investigation: 8_000, plan: 3_500, update: 5_000 };
const MODELS = ["gpt-5", "gpt-5-mini", "gpt-5-2025-08-07", "gpt-5-mini-2025-08-07", "gpt-5.1", "gpt-5.2", "gpt-5.4", "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-luna", "gpt-6-sol", "gpt-6-astra", "gpt-6.1-sol", "gpt-6.1-terra", "o4-mini", "gpt-4.1-mini", "gpt-4o-mini", "some-future-model"];
const quiet = (fn) => async (...args) => {
  const warn = console.warn;
  console.warn = () => {};
  try { return await fn(...args); } finally { console.warn = warn; }
};

// The defaults (chosen 29 Oct 2026): gpt-6.1-terra for the full model,
// gpt-6-luna for the mini model. Neither is on OpenAI's deprecation list.
check("defaults", DEFAULT_MODEL === "gpt-6.1-terra" && DEFAULT_MINI_MODEL === "gpt-6-luna", { DEFAULT_MODEL, DEFAULT_MINI_MODEL });
check("defaults-not-retiring", retirementOf(DEFAULT_MODEL) === null && retirementOf(DEFAULT_MINI_MODEL) === null);
check("defaults-known-efforts", supportedEfforts(DEFAULT_MODEL)?.includes("none") && supportedEfforts(DEFAULT_MINI_MODEL)?.includes("none"));

// The exact requests the new defaults receive on each path.
{
  const quick = modelParams(DEFAULT_MINI_MODEL, { preferredEfforts: PATHS.quick, baseOutputTokens: BASE.quick, cacheKey: "cybernet-analyze-quick-v1" });
  check("luna-quick-request", JSON.stringify(quick) === JSON.stringify({ model: "gpt-6-luna", reasoning: { effort: "none" }, max_output_tokens: 2_500, prompt_cache_key: "cybernet-analyze-quick-v1" }), quick);
  const full = modelParams(DEFAULT_MODEL, { preferredEfforts: PATHS.quick, baseOutputTokens: BASE.quick, cacheKey: "cybernet-analyze-quick-v1" });
  check("terra-quick-request", JSON.stringify(full) === JSON.stringify({ model: "gpt-6.1-terra", reasoning: { effort: "none" }, max_output_tokens: 2_500, prompt_cache_key: "cybernet-analyze-quick-v1" }), full);
  const investigation = modelParams(DEFAULT_MODEL, { preferredEfforts: PATHS.quick, baseOutputTokens: BASE.investigation });
  check("terra-investigation-none", investigation.reasoning?.effort === "none" && investigation.max_output_tokens === 8_000, investigation);
  for (const model of [DEFAULT_MODEL, DEFAULT_MINI_MODEL]) {
    const plan = modelParams(model, { preferredEfforts: PATHS.plan, baseOutputTokens: BASE.plan });
    check(`plan-low/${model}`, plan.reasoning?.effort === "low" && plan.max_output_tokens === BASE.plan + 1_500, plan);
    const update = modelParams(model, { preferredEfforts: PATHS.update, baseOutputTokens: BASE.update });
    check(`update-low/${model}`, update.reasoning?.effort === "low" && update.max_output_tokens === BASE.update + 1_500, update);
    // Parameters GPT-6 rejects when reasoning is on are never built here.
    for (const request of [plan, update]) check(`no-sampling-params/${model}`, !["temperature", "top_p", "top_logprobs", "prompt_cache_retention"].some((k) => k in request), request);
  }
}

// The old models stay selectable through ANALYSIS_MODEL / ANALYSIS_MODEL_MINI,
// with exactly the requests production sent before the switch.
check("gpt-5-quick-minimal", reasoningFor("gpt-5", PATHS.quick)?.effort === "minimal");
check("gpt-5-mini-quick-minimal", reasoningFor("gpt-5-mini", PATHS.quick)?.effort === "minimal");
check("gpt-5-plan-minimal", reasoningFor("gpt-5-mini", PATHS.plan)?.effort === "minimal");
check("gpt-5-update-low", reasoningFor("gpt-5", PATHS.update)?.effort === "low");
check("gpt-5-budget-unchanged", outputBudget(2500, reasoningFor("gpt-5", PATHS.quick)) === 2500 && outputBudget(3500, reasoningFor("gpt-5-mini", PATHS.plan)) === 3500);

// Every model only ever gets an effort it lists (no "minimal" outside gpt-5).
for (const model of MODELS) {
  for (const [name, preferred] of Object.entries(PATHS)) {
    const reasoning = reasoningFor(model, preferred);
    const supported = supportedEfforts(model);
    check(`supported/${model}/${name}`, supported === null ? reasoning === null : supported.includes(reasoning?.effort), { reasoning, supported });
    if (!/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) check(`no-minimal/${model}/${name}`, reasoning?.effort !== "minimal", reasoning);
  }
}
check("terra56-quick-none", reasoningFor("gpt-5.6-terra", PATHS.quick)?.effort === "none");
check("terra56-plan-low", reasoningFor("gpt-5.6-terra", PATHS.plan)?.effort === "low");
check("terra61-quick-none", reasoningFor("gpt-6.1-terra", PATHS.quick)?.effort === "none");
check("terra61-snapshot", reasoningFor("gpt-6.1-terra-2026-10-26", PATHS.quick)?.effort === "none");
check("astra-quick-low", reasoningFor("gpt-6-astra", PATHS.quick)?.effort === "low");
check("sol61-quick-low", reasoningFor("gpt-6.1-sol", PATHS.quick)?.effort === "low");
check("luna6-quick-none", reasoningFor("gpt-6-luna", PATHS.quick)?.effort === "none");
check("model-id-case-and-space", reasoningFor("  GPT-6.1-Terra ", PATHS.quick)?.effort === "none");
check("gpt4o-no-reasoning", reasoningFor("gpt-4o-mini", PATHS.quick) === null);
check("unknown-low", reasoningFor("some-future-model", PATHS.quick)?.effort === "low");
check("override-used-when-supported", reasoningFor("gpt-6-luna", PATHS.quick, "low")?.effort === "low");
check("override-ignored-when-unsupported", reasoningFor("gpt-5", PATHS.quick, "none")?.effort === "minimal" && reasoningFor("gpt-6.1-terra", PATHS.quick, "minimal")?.effort === "none");
check("low-gets-headroom", outputBudget(2500, { effort: "low" }) > 2500 && outputBudget(2500, { effort: "medium" }) > outputBudget(2500, { effort: "low" }));

// prompt_cache_key and safety_identifier only straight to OpenAI.
check("cache-key-direct", modelParams("gpt-5", { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, cacheKey: "k" }).prompt_cache_key === "k");
check("cache-key-not-via-gateway", !("prompt_cache_key" in modelParams("gpt-5", { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, cacheKey: "k", customBaseUrl: true })));
check("no-reasoning-field-for-gpt4", !("reasoning" in modelParams("gpt-4.1-mini", { preferredEfforts: PATHS.quick, baseOutputTokens: 1400 })));
{
  const id = safetyIdentifierFor("6f1c2b0e-0000-4000-8000-000000000001");
  check("safety-id-hashed", /^[0-9a-f]{32}$/.test(id) && !id.includes("6f1c2b0e") && id === safetyIdentifierFor(" 6f1c2b0e-0000-4000-8000-000000000001 "), id);
  check("safety-id-per-user", id !== safetyIdentifierFor("6f1c2b0e-0000-4000-8000-000000000002"));
  check("safety-id-empty-for-guest", safetyIdentifierFor("") === "" && safetyIdentifierFor(null) === "" && safetyIdentifierFor(undefined) === "");
  const direct = modelParams(DEFAULT_MODEL, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, safetyIdentifier: id });
  check("safety-id-direct", direct.safety_identifier === id, direct);
  check("safety-id-not-via-gateway", !("safety_identifier" in modelParams(DEFAULT_MODEL, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, safetyIdentifier: id, customBaseUrl: true })));
  check("safety-id-absent-by-default", !("safety_identifier" in modelParams(DEFAULT_MODEL, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500 })));
}

// Retired models: a call that fails because the model is gone is retried once
// on our chosen default of the same size; the switch can turn that off.
check("replacements", replacementFor("gpt-5") === DEFAULT_MODEL && replacementFor("gpt-5-2025-08-07") === DEFAULT_MODEL && replacementFor("gpt-5-mini") === DEFAULT_MINI_MODEL && replacementFor("GPT-5-mini-2025-08-07") === DEFAULT_MINI_MODEL && replacementFor(DEFAULT_MODEL) === "" && replacementFor(DEFAULT_MINI_MODEL) === "");
check("retire-dates", retirementOf("gpt-5")?.retiresOn === "2026-12-11" && retirementOf("gpt-5-mini")?.retiresOn === "2026-12-11" && retirementOf("gpt-5.1")?.retiresOn === "2027-04-01" && retirementOf("gpt-4.1-mini-2025-04-14")?.retiresOn === "2027-01-14");
check("openai-named-replacements-kept", retirementOf("gpt-5")?.openai === "gpt-5.6-sol" && retirementOf("gpt-5-mini")?.openai === "gpt-5.6-terra");
for (const [model, entry] of Object.entries(RETIRING_MODELS)) {
  check(`retiring-key-lower/${model}`, model === model.toLowerCase());
  check(`replacement-is-live/${model}`, entry.replacement && !RETIRING_MODELS[entry.replacement] && supportedEfforts(entry.replacement) !== null, entry);
}
check("auto-replace-switch", autoReplaceEnabled(undefined) && autoReplaceEnabled("") && !autoReplaceEnabled("off") && !autoReplaceEnabled("false"));

// createResponse: retired model -> one retry on the replacement, with that model's parameters.
{
  const sent = [];
  const client = { responses: { create: async (req) => {
    sent.push(req);
    if (req.model === "gpt-5-mini" || req.model === "gpt-5") throw Object.assign(new Error(`The model \`${req.model}\` does not exist or you do not have access to it.`), { status: 404, code: "model_not_found" });
    return { ok: true };
  } } };
  const build = (base) => (model, override) => modelParams(model, { preferredEfforts: PATHS.quick, baseOutputTokens: base, effortOverride: override });
  const run = quiet(createResponse);
  const out = await run(client, "gpt-5-mini", build(BASE.quick), { label: "test" });
  check("retired-mini-replaced", out.model === DEFAULT_MINI_MODEL && sent.length === 2 && sent[0].reasoning?.effort === "minimal" && sent[1].reasoning?.effort === "none" && sent[1].max_output_tokens === BASE.quick, sent);
  sent.length = 0;
  const full = await run(client, "gpt-5", (model, override) => modelParams(model, { preferredEfforts: PATHS.plan, baseOutputTokens: BASE.plan, effortOverride: override }), { label: "test" });
  check("retired-full-replaced", full.model === DEFAULT_MODEL && sent.length === 2 && sent[1].reasoning?.effort === "low" && sent[1].max_output_tokens === BASE.plan + 1_500, sent);
  let threw = false;
  sent.length = 0;
  try { await run(client, "gpt-5-mini", build(BASE.quick), { allowReplace: false, label: "test" }); } catch { threw = true; }
  check("retired-model-not-replaced-when-off", threw && sent.length === 1, sent);
  // A new default that is unavailable is not retried somewhere else.
  const gone = { responses: { create: async (req) => { sent.push(req); throw Object.assign(new Error("The model `gpt-6.1-terra` does not exist or you do not have access to it."), { status: 404, code: "model_not_found" }); } } };
  threw = false;
  sent.length = 0;
  try { await run(gone, DEFAULT_MODEL, build(BASE.quick), { label: "test" }); } catch { threw = true; }
  check("default-unavailable-not-rerouted", threw && sent.length === 1, sent);
}
// createResponse: a rejected effort is retried once with "low"; other errors are not retried.
{
  const sent = [];
  const client = { responses: { create: async (req) => {
    sent.push(req);
    if (req.reasoning?.effort === "none") throw Object.assign(new Error("Unsupported value: 'none'"), { status: 400, param: "reasoning.effort", code: "unsupported_value" });
    return { ok: true };
  } } };
  const out = await quiet(createResponse)(client, DEFAULT_MINI_MODEL, (model, override) => modelParams(model, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, effortOverride: override }), { label: "test" });
  check("effort-retry-low", out.model === DEFAULT_MINI_MODEL && sent.length === 2 && sent[1].reasoning?.effort === "low" && sent[1].max_output_tokens > sent[0].max_output_tokens, sent);
  let calls = 0;
  try { await createResponse({ responses: { create: async () => { calls++; throw Object.assign(new Error("Rate limit"), { status: 429 }); } } }, DEFAULT_MODEL, (m) => modelParams(m, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500 }), { label: "test" }); } catch { /* expected */ }
  check("other-errors-not-retried", calls === 1, calls);
  // A safety-classifier refusal is not retried on another model.
  calls = 0;
  try { await createResponse({ responses: { create: async () => { calls++; throw Object.assign(new Error("This request was flagged as potentially violating our usage policy."), { status: 400, code: "cyber_policy" }); } } }, DEFAULT_MODEL, (m) => modelParams(m, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500 }), { label: "test" }); } catch { /* expected */ }
  check("policy-errors-not-retried", calls === 1, calls);
}

// No function builds its own reasoning field any more: every OpenAI request
// goes through modelParams, so a model switch cannot send an effort it rejects.
for (const file of readdirSync(path.join(root, "netlify/functions")).filter((f) => /\.(mts|mjs)$/.test(f))) {
  const source = readFileSync(path.join(root, "netlify/functions", file), "utf8");
  check(`no-literal-reasoning/${file}`, !/reasoning:\s*\{\s*effort/.test(source), file);
}

// ANALYSIS_MODEL / ANALYSIS_MODEL_MINI still override the defaults, and no
// function hard-codes a model of its own for its OpenAI call.
for (const file of ["analyze.mts", "recovery-mode.mts"]) {
  const source = readFileSync(path.join(root, "netlify/functions", file), "utf8");
  check(`env-override-full/${file}`, /Netlify\.env\.get\("ANALYSIS_MODEL"\)[^\n]*\|\|\s*DEFAULT_MODEL/.test(source), file);
  check(`env-override-mini/${file}`, /Netlify\.env\.get\("ANALYSIS_MODEL_MINI"\)[^\n]*\|\|\s*DEFAULT_MINI_MODEL/.test(source), file);
}
for (const file of ["analyze.mts", "recovery-mode.mts", "recovery-update.mts"]) {
  const source = readFileSync(path.join(root, "netlify/functions", file), "utf8");
  check(`no-hardcoded-model/${file}`, !/["'`]gpt-\d/.test(source), file);
}

// Bring-your-own-key (website): a key validated for a removed model keeps working.
{
  check("byok/default", byokModel("") === "gpt-6-luna" && byokModel(undefined) === "gpt-6-luna", byokModel(""));
  check("byok/malformed", byokModel("gpt 5; drop") === "gpt-6-luna", byokModel("gpt 5; drop"));
  check("byok/kept-before-removal", byokModel("gpt-5-mini", "2026-12-10") === "gpt-5-mini", byokModel("gpt-5-mini", "2026-12-10"));
  check("byok/replaced-on-removal-day", byokModel("gpt-5-mini", "2026-12-11") === "gpt-6-luna", byokModel("gpt-5-mini", "2026-12-11"));
  check("byok/full-replaced", byokModel("gpt-5", "2027-01-01") === "gpt-6.1-terra", byokModel("gpt-5", "2027-01-01"));
  check("byok/other-model-kept", byokModel("gpt-5.4", "2027-06-01") === "gpt-5.4", byokModel("gpt-5.4", "2027-06-01"));
  const byok = readFileSync(path.join(root, "netlify/functions", "byok-analyze.mts"), "utf8");
  check("byok/uses-byokModel", /byokModel\(value\)/.test(byok) && !/["'`]gpt-\d/.test(byok), "byok-analyze.mts");
  const validator = readFileSync(path.join(root, "netlify/functions", "validate-openai-key.mts"), "utf8");
  check("byok/validator-prefers-luna", /const preferred = \[\s*"gpt-6-luna"/.test(validator), "validate-openai-key.mts");
}

console.log(`${checks - failures}/${checks} model checks pass`);
process.exit(failures ? 1 : 0);
