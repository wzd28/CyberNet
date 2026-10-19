// One retry rule for every server-side PostgREST call (/rest/v1).
//
// The service key is a new-style secret key. For each request the Supabase
// gateway turns it into a short-lived JWT, and now and then that JWT's "iat"
// is a moment ahead of PostgREST's clock. PostgREST then answers
//   401 {"code":"PGRST303","message":"JWT issued at future"}
// while it checks the token, before any query runs, and the same request
// works a moment later. (recovery-checkin hit it 6 times in 24 hours on 17-18
// Oct 2026, and each time the next run worked.)
//
// fetchWithJwtRetry() sends the request and, only for that answer, waits a
// little (about 400 ms, then about 1200 ms) and sends the very same request
// again. Nothing ran the first time, so this is safe for every method,
// including POST, PATCH and DELETE. Every other answer (another 401 such as a
// wrong key, a 4xx, a 5xx) and every network error is returned as it is, with
// no retry. The body is read from a clone, so the caller still gets an unread
// response.
//
// The total time is capped per caller: RETRY_STANDARD for most functions,
// RETRY_TIGHT (one retry after about 400 ms) where the request runs close to
// the ~30 s gateway limit (analyze.mts, the time-boxed alert quota). A
// caller's abort signal is shared by all the tries, so its own timeout still
// bounds the whole call.
//
// Every call that hit it writes one short line to the function log, saying
// whether a retry worked (method and path only, never the query string,
// headers or body), so the frequency stays visible: search the Netlify
// function logs for "PGRST303".

export const JWT_FUTURE_CODE = "PGRST303";

// A retry starts only while (time since the first try + its wait) stays within
// maxTotalMs. In the Supabase edge logs of 18 Oct, PostgREST calls took about
// 0.25 to 1.4 s at the origin (the two PGRST303 answers about 1 s each, while
// the same query sent 6 to 11 ms later got 200), so the caps leave room for
// the retries to happen at all.
export const RETRY_STANDARD = Object.freeze({ delaysMs: Object.freeze([400, 1200]), maxTotalMs: 6000 });
export const RETRY_TIGHT = Object.freeze({ delaysMs: Object.freeze([400]), maxTotalMs: 3000 });

// True only for PostgREST's "JWT issued at future" answer: HTTP 401 whose
// body has code PGRST303 or that message. Reads a clone, never the response.
export async function isJwtIssuedAtFuture(response) {
  if (!response || response.status !== 401 || typeof response.clone !== "function") return false;
  let text = "";
  try {
    text = await response.clone().text();
  } catch {
    return false;
  }
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      return body.code === JWT_FUTURE_CODE || /JWT issued at future/i.test(String(body.message || ""));
    }
  } catch {
    // Not JSON: fall through to the plain-text check.
  }
  return /JWT issued at future/i.test(text);
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener?.("abort", done, { once: true });
  });
}

function describe(input, init) {
  const method = String(init?.method || "GET").toUpperCase();
  let path = "";
  try {
    path = new URL(String(input)).pathname;
  } catch {
    path = String(input).split(/[?#]/)[0];
  }
  return `${method} ${path}`;
}

// A body that fetch can send a second time (a stream can be read only once).
function replayable(input, init) {
  if (typeof input !== "string" && !(input instanceof URL)) return false;
  const body = init?.body;
  return !(body && (typeof body.getReader === "function" || typeof body[Symbol.asyncIterator] === "function"));
}

// fetch(input, init) with the PGRST303 retry. `policy` takes delaysMs and
// maxTotalMs (see RETRY_STANDARD) and a `label` for the log line; fetch,
// sleep, now and log can be swapped in by the tests.
export async function fetchWithJwtRetry(input, init = {}, policy = RETRY_STANDARD) {
  policy = policy || RETRY_STANDARD;
  const delays = Array.isArray(policy.delaysMs) ? policy.delaysMs : RETRY_STANDARD.delaysMs;
  const maxTotalMs = Number.isFinite(policy.maxTotalMs) ? policy.maxTotalMs : RETRY_STANDARD.maxTotalMs;
  const send = policy.fetch || ((url, options) => globalThis.fetch(url, options));
  const sleep = policy.sleep || wait;
  const now = policy.now || Date.now;
  const log = policy.log || ((level, line) => (level === "warn" ? console.warn(line) : console.log(line)));
  const signal = init?.signal;

  const started = now();
  let response = await send(input, init);
  if (!delays.length || !replayable(input, init) || !(await isJwtIssuedAtFuture(response))) return response;

  const what = `CyberNet Supabase: 401 ${JWT_FUTURE_CODE} "JWT issued at future" on ${describe(input, init)}${policy.label ? ` (${policy.label})` : ""}`;
  let retries = 0;

  while (retries < delays.length) {
    const delay = Math.max(0, Number(delays[retries]) || 0);
    if (signal?.aborted || now() - started + delay > maxTotalMs) break;
    await sleep(delay, signal);
    if (signal?.aborted) break;

    let next;
    try {
      next = await send(input, init);
    } catch (error) {
      // The caller would have seen the 401 without the retry; it still does.
      log("warn", `${what}; retry ${retries + 1} could not be sent (${error?.name || "error"}), the 401 stands`);
      return response;
    }
    retries += 1;
    try { response.body?.cancel?.().catch?.(() => {}); } catch { /* already read or locked */ }
    response = next;

    if (!(await isJwtIssuedAtFuture(response))) {
      log("info", `${what}; retry ${retries} of ${delays.length} answered HTTP ${response.status} after ${now() - started} ms`);
      return response;
    }
  }

  log("warn", retries
    ? `${what}; still failing after ${retries} ${retries === 1 ? "retry" : "retries"} (${now() - started} ms)`
    : `${what}; not retried, the time limit for this call was reached (${now() - started} ms)`);
  return response;
}
