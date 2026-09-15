import {
  runAiRecoveryPlan,
  sanitizePlan,
  serviceFetch,
  verifyBackgroundSignature,
  type ClassifierResult,
} from "./recovery-mode.mts";
import { runAiUpdate, sanitizeUpdate, writeUpdatedVersion } from "./recovery-update.mts";

// Builds the AI recovery plan (or AI update) after the user's request has
// already returned. Netlify runs this as a background function: the caller
// gets a 202 immediately and this has up to 15 minutes, so the model is no
// longer racing a request timeout. The page polls /api/recovery-case and swaps
// the full plan in when the case's version number moves.
//
// Only recovery-mode and recovery-update can start a job: they sign the body
// with the service key and the signature is checked before anything runs.

type StartJob = {
  kind: "start";
  caseId: string;
  userId: string;
  classifier: ClassifierResult;
  region: string;
  input: Parameters<typeof runAiRecoveryPlan>[0];
};

type UpdateJob = {
  kind: "update";
  caseId: string;
  userId: string;
  updateText: string;
  completedTaskTitles: string[];
  previousPlan: any;
  riskFloor: string;
};

async function loadCase(caseId: string) {
  const response = await serviceFetch(`/rest/v1/recovery_cases?id=eq.${encodeURIComponent(caseId)}&select=*`);
  const rows = await response.json().catch(() => []);
  return response.ok && Array.isArray(rows) ? rows[0] || null : null;
}

async function loadTasks(caseId: string): Promise<any[]> {
  const response = await serviceFetch(`/rest/v1/recovery_tasks?case_id=eq.${encodeURIComponent(caseId)}&select=*`);
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

// The AI plan replaces the deterministic one the case was created with: it
// becomes the next version, its actions become the task list, and the
// deterministic tasks nobody has ticked yet are dropped so progress is
// measured against the plan the user actually sees.
async function writeAiStartVersion(caseId: string, plan: any) {
  const caseRow = await loadCase(caseId);
  if (!caseRow) throw new Error("Recovery case disappeared before the AI plan was ready.");

  const newVersionNumber = (Number(caseRow.current_version) || 1) + 1;
  const existingTasks = await loadTasks(caseId);
  const planActions = [
    ...plan.immediateActions,
    ...plan.timeline.first10Minutes,
    ...plan.timeline.firstHour,
    ...plan.timeline.first24Hours,
    ...plan.timeline.next7Days,
  ];
  const planKeys = new Set(planActions.map((action: any) => action.id));

  const stalePending = existingTasks.filter((task) => task.status !== "completed" && !planKeys.has(task.task_key));
  if (stalePending.length) {
    await serviceFetch(
      `/rest/v1/recovery_tasks?case_id=eq.${encodeURIComponent(caseId)}&task_key=in.(${stalePending.map((t) => `"${t.task_key}"`).join(",")})`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }

  const newTasks = planActions.filter((action: any) => !existingTasks.some((task) => task.task_key === action.id));
  if (newTasks.length) {
    await serviceFetch("/rest/v1/recovery_tasks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(newTasks.map((task: any) => ({
        case_id: caseId,
        plan_version: newVersionNumber,
        task_key: task.id,
        title: task.title,
        status: "pending",
        priority: task.priority,
      }))),
    });
  }

  await Promise.all([
    serviceFetch(`/rest/v1/recovery_cases?id=eq.${encodeURIComponent(caseId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        incident_type: plan.incidentType,
        risk_level: plan.riskLevel,
        urgency: plan.urgency,
        confidence: plan.confidence,
        current_version: newVersionNumber,
        updated_at: new Date().toISOString(),
      }),
    }),
    serviceFetch("/rest/v1/recovery_versions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        case_id: caseId,
        version_number: newVersionNumber,
        structured_plan: plan,
        change_summary: "CyberNet AI recovery plan ready.",
        risk_level: plan.riskLevel,
        progress_percent: Number(caseRow.progress_percent) || 0,
      }),
    }),
  ]);
}

async function runStart(job: StartJob) {
  let rawPlan: any = null;
  try {
    rawPlan = await runAiRecoveryPlan(job.input, { timeoutMs: 120_000 });
  } catch (error) {
    console.error("CyberNet Recovery background plan generation failed", {
      caseId: job.caseId,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
      status: (error as any)?.status,
      code: (error as any)?.code,
      requestId: (error as any)?.request_id,
    });
  }
  // No AI plan means the deterministic version stays current; the page stops
  // polling on its own and tells the user the essential actions still apply.
  if (!rawPlan) return;

  const plan = sanitizePlan(rawPlan, job.classifier, job.region);
  await writeAiStartVersion(job.caseId, plan);
}

async function runUpdate(job: UpdateJob) {
  const caseRow = await loadCase(job.caseId);
  if (!caseRow) return;

  let rawUpdate: any = null;
  try {
    rawUpdate = await runAiUpdate(
      { previousPlan: job.previousPlan, completedTaskTitles: job.completedTaskTitles, updateText: job.updateText, riskFloor: job.riskFloor },
      { timeoutMs: 120_000 },
    );
  } catch (error) {
    console.error("CyberNet Recovery background update generation failed", {
      caseId: job.caseId,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
      status: (error as any)?.status,
      code: (error as any)?.code,
      requestId: (error as any)?.request_id,
    });
  }

  // Even without the model, the update is recorded as a new version so the
  // user's completed tasks and note are reflected in the plan they see.
  const updatedPlan = sanitizeUpdate(rawUpdate, job.previousPlan);
  const taskList = await loadTasks(job.caseId);
  await writeUpdatedVersion({ caseId: job.caseId, caseRow, updatedPlan, taskList });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = await request.text();
  const signature = request.headers.get("x-cybernet-signature") || "";
  if (!(await verifyBackgroundSignature(body, signature))) {
    return new Response("Forbidden", { status: 403 });
  }

  let job: StartJob | UpdateJob;
  try {
    job = JSON.parse(body);
  } catch {
    return new Response("Invalid job", { status: 400 });
  }

  try {
    if (job.kind === "start") await runStart(job);
    else if (job.kind === "update") await runUpdate(job);
    else return new Response("Unknown job", { status: 400 });
  } catch (error) {
    console.error("CyberNet Recovery background job failed", { kind: job.kind, caseId: job.caseId, error });
  }

  return new Response("ok");
}

export const config = {
  path: "/api/recovery-plan-background",
  method: ["POST"],
  background: true,
};
