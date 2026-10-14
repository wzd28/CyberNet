// Request shapes for every OpenAI call (netlify/lib/ai-models.mjs): which
// reasoning effort each model is sent, the output budget that goes with it,
// and the retry when a model is gone or rejects a setting. No network, no keys:
//
//   node tests/run-models.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reasoningFor, outputBudget, modelParams, createResponse, supportedEfforts, replacementFor, autoReplaceEnabled, DEFAULT_MODEL, DEFAULT_MINI_MODEL } from "../netlify/lib/ai-models.mjs";

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
const MODELS = ["gpt-5", "gpt-5-mini", "gpt-5-2025-08-07", "gpt-5-mini-2025-08-07", "gpt-5.1", "gpt-5.2", "gpt-5.4", "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-luna", "gpt-6-sol", "gpt-6-astra", "gpt-6.1-sol", "o4-mini", "gpt-4.1-mini", "gpt-4o-mini", "some-future-model"];

// Today's production requests are unchanged.
check("gpt-5-quick-minimal", reasoningFor("gpt-5", PATHS.quick)?.effort === "minimal");
check("gpt-5-mini-quick-minimal", reasoningFor("gpt-5-mini", PATHS.quick)?.effort === "minimal");
check("gpt-5-plan-minimal", reasoningFor("gpt-5-mini", PATHS.plan)?.effort === "minimal");
check("gpt-5-update-low", reasoningFor("gpt-5", PATHS.update)?.effort === "low");
check("gpt-5-budget-unchanged", outputBudget(2500, reasoningFor("gpt-5", PATHS.quick)) === 2500 && outputBudget(3500, reasoningFor("gpt-5-mini", PATHS.plan)) === 3500);
check("defaults", DEFAULT_MODEL === "gpt-5" && DEFAULT_MINI_MODEL === "gpt-5-mini");

// Every model only ever gets an effort it lists (no "minimal" outside gpt-5).
for (const model of MODELS) {
  for (const [name, preferred] of Object.entries(PATHS)) {
    const reasoning = reasoningFor(model, preferred);
    const supported = supportedEfforts(model);
    check(`supported/${model}/${name}`, supported === null ? reasoning === null : supported.includes(reasoning?.effort), { reasoning, supported });
    if (!/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) check(`no-minimal/${model}/${name}`, reasoning?.effort !== "minimal", reasoning);
  }
}
check("terra-quick-none", reasoningFor("gpt-5.6-terra", PATHS.quick)?.effort === "none");
check("terra-plan-low", reasoningFor("gpt-5.6-terra", PATHS.plan)?.effort === "low");
check("astra-quick-low", reasoningFor("gpt-6-astra", PATHS.quick)?.effort === "low");
check("sol61-quick-low", reasoningFor("gpt-6.1-sol", PATHS.quick)?.effort === "low");
check("luna6-quick-none", reasoningFor("gpt-6-luna", PATHS.quick)?.effort === "none");
check("gpt4o-no-reasoning", reasoningFor("gpt-4o-mini", PATHS.quick) === null);
check("unknown-low", reasoningFor("some-future-model", PATHS.quick)?.effort === "low");
check("override-used-when-supported", reasoningFor("gpt-5.6-terra", PATHS.quick, "low")?.effort === "low");
check("override-ignored-when-unsupported", reasoningFor("gpt-5", PATHS.quick, "none")?.effort === "minimal");
check("low-gets-headroom", outputBudget(2500, { effort: "low" }) > 2500 && outputBudget(2500, { effort: "medium" }) > outputBudget(2500, { effort: "low" }));

// prompt_cache_key only straight to OpenAI.
check("cache-key-direct", modelParams("gpt-5", { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, cacheKey: "k" }).prompt_cache_key === "k");
check("cache-key-not-via-gateway", !("prompt_cache_key" in modelParams("gpt-5", { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, cacheKey: "k", customBaseUrl: true })));
check("no-reasoning-field-for-gpt4", !("reasoning" in modelParams("gpt-4.1-mini", { preferredEfforts: PATHS.quick, baseOutputTokens: 1400 })));

// Replacements follow OpenAI's deprecation notice; the switch can turn them off.
check("replacements", replacementFor("gpt-5") === "gpt-5.6-sol" && replacementFor("gpt-5-mini") === "gpt-5.6-terra" && replacementFor("gpt-5.6-terra") === "");
check("auto-replace-switch", autoReplaceEnabled(undefined) && autoReplaceEnabled("") && !autoReplaceEnabled("off") && !autoReplaceEnabled("false"));

// createResponse: retired model -> one retry on the replacement, with that model's parameters.
{
  const sent = [];
  const client = { responses: { create: async (req) => {
    sent.push(req);
    if (req.model === "gpt-5-mini") throw Object.assign(new Error("The model `gpt-5-mini` does not exist or you do not have access to it."), { status: 404, code: "model_not_found" });
    return { ok: true };
  } } };
  const build = (model, override) => modelParams(model, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, effortOverride: override });
  const out = await createResponse(client, "gpt-5-mini", build, { label: "test" });
  check("retired-model-replaced", out.model === "gpt-5.6-terra" && sent.length === 2 && sent[1].reasoning?.effort === "none", sent);
  let threw = false;
  sent.length = 0;
  try { await createResponse(client, "gpt-5-mini", build, { allowReplace: false, label: "test" }); } catch { threw = true; }
  check("retired-model-not-replaced-when-off", threw && sent.length === 1, sent);
}
// createResponse: a rejected effort is retried once with "low"; other errors are not retried.
{
  const sent = [];
  const client = { responses: { create: async (req) => {
    sent.push(req);
    if (req.reasoning?.effort === "none") throw Object.assign(new Error("Unsupported value: 'none'"), { status: 400, param: "reasoning.effort", code: "unsupported_value" });
    return { ok: true };
  } } };
  const out = await createResponse(client, "gpt-5.6-terra", (model, override) => modelParams(model, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500, effortOverride: override }), { label: "test" });
  check("effort-retry-low", out.model === "gpt-5.6-terra" && sent.length === 2 && sent[1].reasoning?.effort === "low" && sent[1].max_output_tokens > sent[0].max_output_tokens, sent);
  const failing = { responses: { create: async () => { throw Object.assign(new Error("Rate limit"), { status: 429 }); } } };
  let calls = 0;
  try { await createResponse({ responses: { create: async (r) => { calls++; return failing.responses.create(r); } } }, "gpt-5", (m) => modelParams(m, { preferredEfforts: PATHS.quick, baseOutputTokens: 2500 }), { label: "test" }); } catch { /* expected */ }
  check("other-errors-not-retried", calls === 1, calls);
}

// No function builds its own reasoning field any more: every OpenAI request
// goes through modelParams, so a model switch cannot send an effort it rejects.
for (const file of readdirSync(path.join(root, "netlify/functions")).filter((f) => /\.(mts|mjs)$/.test(f))) {
  const source = readFileSync(path.join(root, "netlify/functions", file), "utf8");
  check(`no-literal-reasoning/${file}`, !/reasoning:\s*\{\s*effort/.test(source), file);
}

console.log(`${checks - failures}/${checks} model checks pass`);
process.exit(failures ? 1 : 0);
