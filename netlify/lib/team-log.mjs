// What a team member submitted is kept so the team owner's activity log can
// show it. The copy that is kept has payment-card numbers and secret keys
// blanked out first: the owner needs to see the suspicious message, not a card
// number the member happened to paste along with it, and those values should
// never sit in the database in the clear.

// A run of 13-19 digits is only treated as a card number when it passes the
// card checksum. Without that test a scammer's IBAN, a parcel number or a long
// reference code would be blanked too, and those are exactly what the owner
// needs to be able to read.
function passesCardChecksum(digits) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

const CARD_LIKE = /\b\d(?:[ -]?\d){12,18}\b/g;
const PRIVATE_KEY = /-----BEGIN[^-]{0,40}PRIVATE KEY-----[\s\S]*?-----END[^-]{0,40}PRIVATE KEY-----/g;
const SECRET_TOKEN = /\b(?:sk|pk|rk)[-_][a-zA-Z0-9_-]{16,}\b/g;

export function redactForTeamLog(value, maxChars = 10_000) {
  const text = String(value ?? "")
    .replaceAll(String.fromCharCode(0), "")
    .replace(CARD_LIKE, (match) => {
      const digits = match.replace(/\D/g, "");
      return /^0+$/.test(digits) || !passesCardChecksum(digits) ? match : "[card number hidden]";
    })
    .replace(PRIVATE_KEY, "[private key hidden]")
    .replace(SECRET_TOKEN, "[secret key hidden]");
  return text.slice(0, maxChars);
}
