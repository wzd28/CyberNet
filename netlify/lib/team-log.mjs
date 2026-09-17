// What a team member submitted is kept so the team owner's activity log can
// show it. The copy that is kept has payment-card numbers and secret keys
// blanked out first: the owner needs to see the suspicious message, not a card
// number the member happened to paste along with it, and those values should
// never sit in the database in the clear.
const PATTERNS = [
  [/\b(?:\d[ -]?){13,19}\b/g, "[card number hidden]"],
  [/-----BEGIN[^-]{0,40}PRIVATE KEY-----[\s\S]*?-----END[^-]{0,40}PRIVATE KEY-----/g, "[private key hidden]"],
  [/\b(?:sk|pk|rk)[-_][a-zA-Z0-9_-]{16,}\b/g, "[secret key hidden]"],
];

export function redactForTeamLog(value, maxChars = 10_000) {
  let text = String(value ?? "").replace(/\u0000/g, "");
  for (const [pattern, label] of PATTERNS) text = text.replace(pattern, label);
  return text.slice(0, maxChars);
}
