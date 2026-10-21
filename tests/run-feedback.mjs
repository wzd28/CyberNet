// Feedback pipeline: /api/feedback (validation, honeypot, rate limits, the
// database row as the source of truth) and /api/feedback-admin (the server-side
// ADMIN_EMAILS gate). No network: fetch and Netlify.env are stubbed.
//
//   node tests/run-feedback.mjs
let failures = 0;
let checks = 0;
function check(id, ok, detail) {
  checks++;
  if (!ok) {
    failures++;
    process.stdout.write(`[${id}] FAIL ${JSON.stringify(detail)?.slice(0, 600)}\n`);
  }
}

const SUPABASE = "https://stub-project.supabase.test";
const ENV = {
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  RESEND_API_KEY: "stub-resend",
  ADMIN_EMAILS: "Owner@Example.com, second@example.com"
};
globalThis.Netlify = { env: { get: (name) => ENV[name] } };
console.error = () => {}; // the functions log JSON lines on purpose

// Tokens the stub auth server accepts.
const USERS = {
  "tok-admin": { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
  "tok-user": { id: "22222222-2222-4222-8222-222222222222", email: "user@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
  "tok-admin-unconfirmed": { id: "33333333-3333-4333-8333-333333333333", email: "second@example.com", email_confirmed_at: null }
};

const quota = new Map(); // key -> count (windows ignored: each test resets)
const rows = [];
const mails = [];
const restCalls = [];
let dbDown = false;
let mailDown = false;
let quotaDown = false;
let nextId = 1;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method || "GET").toUpperCase();
  const auth = new Headers(init.headers || {}).get("authorization") || "";
  if (url.hostname === "api.resend.com") {
    if (mailDown) return json({ message: "resend down" }, 500);
    mails.push(JSON.parse(init.body));
    return json({ id: `mail-${mails.length}` });
  }
  if (url.origin !== SUPABASE) throw new Error(`unexpected fetch ${url}`);
  if (url.pathname === "/auth/v1/user") {
    const user = USERS[auth.replace(/^Bearer /, "")];
    return user ? json(user) : json({ message: "invalid JWT" }, 401);
  }
  // Everything below needs the service key, never a user's token.
  if (auth !== "Bearer stub-service") return json({ message: "no service key" }, 401);
  if (url.pathname === "/rest/v1/rpc/consume_api_quota") {
    if (quotaDown) return json({ message: "down" }, 500);
    const { p_key, p_max_requests } = JSON.parse(init.body);
    const used = (quota.get(p_key) || 0) + 1;
    quota.set(p_key, used);
    return json({ allowed: used <= p_max_requests, used, limit: p_max_requests, reset_at: new Date(Date.now() + 3600e3).toISOString() });
  }
  if (url.pathname === "/rest/v1/feedback") {
    restCalls.push({ method, search: url.search });
    if (dbDown) return json({ code: "PGRST205", message: "Could not find the table 'public.feedback'" }, 404);
    if (method === "POST") {
      const row = { id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`, created_at: new Date(Date.now() + rows.length).toISOString(), status: "new", handled_at: null, ...JSON.parse(init.body) };
      rows.push(row);
      return json([{ id: row.id, created_at: row.created_at }], 201);
    }
    if (method === "GET") {
      const status = url.searchParams.get("status");
      const list = rows.filter((r) => !status || r.status === status.replace(/^eq\./, "")).sort((a, b) => b.created_at.localeCompare(a.created_at));
      return json(list.slice(0, Number(url.searchParams.get("limit")) || 50), 200, { "Content-Range": `0-${list.length - 1}/${list.length}` });
    }
    if (method === "PATCH") {
      const id = url.searchParams.get("id").replace(/^eq\./, "");
      const row = rows.find((r) => r.id === id);
      if (!row) return json([]);
      Object.assign(row, JSON.parse(init.body));
      return json([row]);
    }
  }
  throw new Error(`unexpected supabase call ${method} ${url.pathname}`);
};

const feedback = await import("../netlify/functions/feedback.mjs");
const admin = (await import("../netlify/functions/feedback-admin.mjs")).default;
const { uaSummary, validateFeedback } = await import("../netlify/lib/feedback.mjs");

function reset() {
  quota.clear(); rows.length = 0; mails.length = 0; restCalls.length = 0;
  dbDown = mailDown = quotaDown = false;
  feedback.resetFeedbackMemory();
}

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
let ipCounter = 0;
async function send(body, { token, ip = `198.51.100.${++ipCounter % 250}`, raw } = {}) {
  const headers = { "Content-Type": "application/json", "User-Agent": CHROME };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await feedback.default(new Request("https://cybernetai.app/api/feedback", { method: "POST", headers, body: raw ?? JSON.stringify(body) }), { ip });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const good = (extra = {}) => ({ category: "bug", message: "The scan button did nothing.", email: "visitor@example.com", page: "/quick-scan?token=secret#x", uiVersion: "20261021-1", bot_field: "", ...extra });

/* ---------- /api/feedback ---------- */

reset();
{
  const r = await send(good());
  check("valid-201", r.status === 201 && r.data.ok && r.data.id, r);
  const row = rows[0];
  check("valid-row", row && row.category === "bug" && row.message === "The scan button did nothing." && row.email === "visitor@example.com" && row.user_id === null, row);
  check("valid-page-path-only", row?.page === "/quick-scan", row?.page);
  check("valid-ua-summary", row?.user_agent_summary === "Chrome 141 on Windows" && !("user_agent" in row), row);
  check("valid-ui-version", row?.ui_version === "20261021-1", row);
  check("valid-mail-sent", mails.length === 1 && mails[0].reply_to === "visitor@example.com" && !mails[0].subject.includes("scan button"), mails[0]);
  check("valid-mail-to-support", mails[0]?.to?.[0] === "support@cybernetai.app" && /notifications@cybernetai\.app/.test(mails[0]?.from), mails[0]);
}

reset();
{
  const r = await send(good({ email: "", category: "nonsense" }), { token: "tok-user" });
  check("signed-in-201", r.status === 201, r);
  check("signed-in-user-id", rows[0]?.user_id === USERS["tok-user"].id && rows[0]?.email === "user@example.com", rows[0]);
  check("unknown-category-other", rows[0]?.category === "other", rows[0]);
  const forged = await send(good(), { token: "tok-forged" });
  check("invalid-token-anonymous", forged.status === 201 && rows[1]?.user_id === null, { forged, row: rows[1] });
}

reset();
{
  const empty = await send(good({ message: "   " }));
  check("empty-400", empty.status === 400, empty);
  const huge = await send(good({ message: "x".repeat(5001) }));
  check("oversized-message-400", huge.status === 400, huge);
  const body = await send(null, { raw: JSON.stringify(good({ message: "y".repeat(20000) })) });
  check("oversized-body-413", body.status === 413, body);
  const honey = await send(good({ bot_field: "http://spam.invalid" }));
  check("honeypot-400", honey.status === 400, honey);
  const badEmail = await send(good({ email: "not an email" }));
  check("bad-email-400", badEmail.status === 400, badEmail);
  const notJson = await send(null, { raw: "{" });
  check("not-json-400", notJson.status === 400, notJson);
  check("rejected-nothing-stored", rows.length === 0 && mails.length === 0, { rows: rows.length, mails: mails.length });
  const get = await feedback.default(new Request("https://cybernetai.app/api/feedback"), {});
  check("get-405", get.status === 405, get.status);
}

reset();
{
  // Per minute in memory: 3 from one address, then 429.
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await send(good(), { ip: "203.0.113.9" })).status);
  check("rate-limit-minute", statuses.join() === "201,201,201,429", statuses);
  // Durable per address (6 an hour): memory reset between bursts.
  const hourly = [];
  for (let i = 0; i < 4; i++) {
    feedback.resetFeedbackMemory();
    hourly.push((await send(good(), { ip: "203.0.113.9" })).status);
  }
  check("rate-limit-hour", hourly.join() === "201,201,201,429", hourly);
  check("rate-limited-not-stored", rows.length === 6, rows.length);
}

reset();
{
  // Per account (6 an hour) even from different addresses.
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await send(good(), { token: "tok-user", ip: `192.0.2.${i + 1}` })).status);
  check("rate-limit-user", statuses.slice(0, 6).every((s) => s === 201) && statuses[6] === 429, statuses);
  // Quota service down: fails open like the other checks.
  reset();
  quotaDown = true;
  const r = await send(good());
  check("quota-down-fails-open", r.status === 201 && rows.length === 1, r);
}

reset();
{
  mailDown = true;
  const r = await send(good());
  check("mail-fails-still-saved", r.status === 201 && rows.length === 1 && rows[0].message === "The scan button did nothing.", { r, rows: rows.length });
}

reset();
{
  dbDown = true;
  const r = await send(good());
  check("db-down-email-copy-202", r.status === 202 && r.data.stored === false && mails.length === 1 && /NO: the database/.test(mails[0].text), { r, mails: mails.length });
  mailDown = true;
  const both = await send(good());
  check("db-and-mail-down-503", both.status === 503, both);
}

reset();
{
  // Links in a visitor's message are defanged in the email; the subject has no visitor text.
  await send(good({ message: "Your account is locked, log in at https://evil.invalid/login now" }));
  check("mail-defanged", mails[0] && !mails[0].text.includes("https://evil.invalid") && !mails[0].html.includes("https://evil.invalid"), mails[0]?.text);
  check("ua-summary-unit", uaSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1") === "Safari 18 on iOS" && uaSummary("") === null, null);
  check("validate-page-rejects-odd", validateFeedback(good({ page: "//evil.invalid/x" })).row.page === null, null);
}

/* ---------- /api/feedback-admin ---------- */

async function adminCall(method, { token, query = "", body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body) h["Content-Type"] = "application/json";
  const res = await admin(new Request(`https://cybernetai.app/api/feedback-admin${query}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

reset();
{
  await send(good({ message: "first" }));
  await send(good({ message: "second", category: "feature" }));
  const anon = await adminCall("GET");
  check("admin-anon-401", anon.status === 401 && !anon.data.items, anon);
  const user = await adminCall("GET", { token: "tok-user" });
  check("admin-user-403", user.status === 403 && !user.data.items, user);
  // Client-side claims change nothing: the server only trusts Supabase's answer.
  const spoof = await adminCall("GET", { token: "tok-user", query: "?isAdmin=1&email=owner@example.com", headers: { "X-Admin": "1", "X-User-Email": "owner@example.com" } });
  check("admin-spoof-403", spoof.status === 403, spoof);
  const unconfirmed = await adminCall("GET", { token: "tok-admin-unconfirmed" });
  check("admin-unconfirmed-403", unconfirmed.status === 403, unconfirmed);
  const forged = await adminCall("GET", { token: "tok-forged" });
  check("admin-forged-401", forged.status === 401, forged);
  check("admin-denied-no-db-reads", !restCalls.some((c) => c.method === "GET"), restCalls);

  const list = await adminCall("GET", { token: "tok-admin" });
  check("admin-list-200", list.status === 200 && list.data.items.length === 2 && list.data.total === 2, list);
  check("admin-list-newest-first", list.data.items?.[0]?.message === "second", list.data.items?.map((i) => i.message));
  check("admin-list-filter-new", restCalls.some((c) => c.method === "GET" && c.search.includes("status=eq.new") && c.search.includes("order=created_at.desc")), restCalls);

  const id = list.data.items[0].id;
  const userPatch = await adminCall("PATCH", { token: "tok-user", body: { id, status: "replied" } });
  check("admin-user-cannot-patch", userPatch.status === 403 && rows.find((r) => r.id === id).status === "new", userPatch);
  const patch = await adminCall("PATCH", { token: "tok-admin", body: { id, status: "replied" } });
  check("admin-mark-replied", patch.status === 200 && patch.data.item.status === "replied" && patch.data.item.handled_at, patch);
  const back = await adminCall("PATCH", { token: "tok-admin", body: { id, status: "new" } });
  check("admin-mark-new-clears", back.status === 200 && back.data.item.handled_at === null, back);
  const badStatus = await adminCall("PATCH", { token: "tok-admin", body: { id, status: "deleted" } });
  check("admin-bad-status-400", badStatus.status === 400, badStatus);
  const badId = await adminCall("PATCH", { token: "tok-admin", body: { id: "1 or 1=1", status: "read" } });
  check("admin-bad-id-400", badId.status === 400, badId);
  const badFilter = await adminCall("GET", { token: "tok-admin", query: "?status=spam" });
  check("admin-bad-filter-400", badFilter.status === 400, badFilter);
  const replied = await adminCall("GET", { token: "tok-admin", query: "?status=all" });
  check("admin-list-all", replied.status === 200 && replied.data.items.length === 2, replied);

  dbDown = true;
  const missing = await adminCall("GET", { token: "tok-admin" });
  check("admin-missing-table-503", missing.status === 503 && /migration|SQL editor/i.test(missing.data.error), missing);
}

process.stdout.write(`feedback: ${checks - failures}/${checks} checks passed\n`);
if (failures) process.exit(1);
