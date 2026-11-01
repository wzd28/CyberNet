// Apple Root CA - G3: the one root certificate that signs every JWS Apple sends
// (StoreKit 2 transactions and renewal info, App Store Server Notifications V2).
// It is a PUBLIC certificate (published by Apple, valid until 2039); nothing in
// this file is secret. netlify/lib/apple-jws.mjs trusts a signed message only if
// its certificate chain ends in exactly these bytes.
//
// NOT EMBEDDED YET. The certificate has to be fetched from Apple:
//   https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// Downloading needs the owner's / main session's explicit permission, so it was
// not done when this module was written. Until it is embedded:
//   * APPLE_ROOT_CA_G3_BASE64 below is a clearly invalid placeholder,
//   * apple-jws.mjs refuses every message with code "root_not_configured",
//     apple-verify answers 503 (the app keeps the purchase unfinished and
//     retries) and apple-notifications answers 500 (Apple retries),
//   * tests/run-apple-iap.mjs FAILS ("embedded Apple Root CA - G3 matches its
//     pinned SHA-256"), so this cannot ship by accident.
//
// To embed it (no code change elsewhere):
//   1. Download AppleRootCA-G3.cer (DER) from the URL above.
//   2. Check its SHA-256 against Apple's PKI page
//      https://www.apple.com/certificateauthority/ ("Apple Root CA - G3",
//      SHA-256 fingerprint) and against APPLE_ROOT_CA_G3_SHA256 below:
//        openssl x509 -inform der -in AppleRootCA-G3.cer -noout -fingerprint -sha256
//   3. Replace the placeholder with the base64 of the DER bytes (one line):
//        base64 -w0 AppleRootCA-G3.cer      (or: node -e "console.log(require('fs').readFileSync('AppleRootCA-G3.cer').toString('base64'))")
//   4. Run: node tests/run-apple-iap.mjs
//
// If the fingerprint on Apple's page differs from the constant below, the
// constant (written from the planner's notes) is wrong: fix the constant, not
// the check.

// SHA-256 of the DER certificate, as lowercase hex without colons.
// 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
export const APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

export const APPLE_ROOT_CA_G3_PLACEHOLDER = "NOT-EMBEDDED-YET: replace with the base64 DER of Apple Root CA - G3 (see the comment at the top of this file)";

export const APPLE_ROOT_CA_G3_BASE64 = APPLE_ROOT_CA_G3_PLACEHOLDER;
