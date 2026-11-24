// What a function may tell the browser when something fails (security audit
// Nov 2026, SRV-AUTH-11 / SRV-14 / PAY-10). Database (PostgREST) and Stripe
// messages name tables, columns, constraints, customer ids and lookup keys, so
// they stay in the logs (console.error / reportError) and the visitor gets a
// fixed, friendly sentence instead.
//
// Kept as written:
//   - errors this code created with an explicit 4xx status ("Sign in again",
//     "Only the team owner can ...", the 409 checkout guard texts);
//   - errors this code created with a 5xx status and `expose: true` (the
//     friendly "try again in a moment" texts).
// Everything else (no status, an upstream status, any Stripe error) becomes
// `fallback`.
function isStripeError(error) {
  return Boolean(error?.raw || error?.rawType || /^Stripe/.test(String(error?.type || "")));
}

export function publicError(error, fallback, fallbackStatus = 500) {
  const own = Number(error?.status);
  const ownStatus = Number.isInteger(own) && own >= 400 && own <= 599 && !isStripeError(error) ? own : 0;
  if (ownStatus && ownStatus < 500) return { status: ownStatus, message: String(error?.message || fallback) };
  if (ownStatus && error?.expose === true) return { status: ownStatus, message: String(error?.message || fallback) };
  return { status: ownStatus || fallbackStatus, message: fallback };
}

// The same, as the JSON response most functions return.
export function publicErrorBody(error, fallback, fallbackStatus = 500) {
  const { status, message } = publicError(error, fallback, fallbackStatus);
  return { body: { error: message }, status };
}
