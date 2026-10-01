// Recovery plan actions get positional ids (immediate-0, t10-1, ...), so every
// plan version would otherwise reuse the same task keys: a new action would
// land on an old task row and inherit its title and completed status. From
// version 2 on, each action's id carries its plan version (v3-immediate-0),
// so a new version always gets its own task rows. Version 1 keeps the plain
// ids it was created with.

const ACTION_LISTS = (plan) => [
  plan?.immediateActions,
  plan?.timeline?.first10Minutes,
  plan?.timeline?.firstHour,
  plan?.timeline?.first24Hours,
  plan?.timeline?.next7Days,
];

// Mutates the plan in place (and returns it) so the stored structured_plan and
// the task rows use the same ids.
export function rekeyPlan(plan, version) {
  for (const list of ACTION_LISTS(plan)) {
    if (!Array.isArray(list)) continue;
    for (const action of list) {
      if (!action) continue;
      action.id = `v${version}-` + String(action.id).replace(/^v\d+-/, "");
    }
  }
  return plan;
}

export function planActions(plan) {
  return ACTION_LISTS(plan).flatMap((list) => (Array.isArray(list) ? list : []));
}

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase();
}

// An action the user already completed in an earlier version (same title)
// starts out completed; everything else starts pending. Keys that already
// exist are skipped (the table is UNIQUE on case_id + task_key). Every row has
// the same keys, as a PostgREST bulk insert requires.
export function buildTaskRows(caseId, version, actions, existingTasks) {
  const existing = Array.isArray(existingTasks) ? existingTasks : [];
  return (Array.isArray(actions) ? actions : [])
    .filter((action) => !existing.some((task) => task.task_key === action.id))
    .map((action) => {
      const done = existing.find(
        (task) => task.status === "completed" && normalizeTitle(task.title) === normalizeTitle(action.title),
      );
      return {
        case_id: caseId,
        plan_version: version,
        task_key: action.id,
        title: action.title,
        status: done ? "completed" : "pending",
        priority: action.priority,
        completed_at: done ? done.completed_at || new Date().toISOString() : null,
      };
    });
}

// Task rows the new version replaces: pending ones that are not in the new
// plan, and completed ones (not in the plan) whose completion was just
// carried over to a new row with the same title (so a carried action is not
// counted twice in progress or in the team owner's log).
export function supersededTaskKeys(existingTasks, actions, newRows) {
  const keys = new Set((Array.isArray(actions) ? actions : []).map((action) => action.id));
  const carried = new Set(
    (Array.isArray(newRows) ? newRows : [])
      .filter((row) => row.status === "completed")
      .map((row) => normalizeTitle(row.title)),
  );
  return (Array.isArray(existingTasks) ? existingTasks : [])
    .filter((task) => !keys.has(task.task_key))
    .filter((task) => task.status !== "completed" || carried.has(normalizeTitle(task.title)))
    .map((task) => String(task.task_key));
}

// PostgREST in.(...) list of quoted, URL-encoded task keys.
export function taskKeyInList(keys) {
  return keys.map((key) => encodeURIComponent(`"${String(key).replace(/"/g, "")}"`)).join(",");
}
