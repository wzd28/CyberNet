// Apple Root CA - G3: the one root certificate that signs every JWS Apple sends
// (StoreKit 2 transactions and renewal info, App Store Server Notifications V2).
// It is a PUBLIC certificate (published by Apple, valid until 2039); nothing in
// this file is secret. netlify/lib/apple-verify-jws.mjs trusts a signed message only if
// its certificate chain ends in exactly these bytes.
//
// EMBEDDED (25 Nov 2026). Source:
//   https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// Downloading needs the owner's / main session's explicit permission, so it was
// not done when this module was written. Until it is embedded:
//   * APPLE_ROOT_CA_G3_BASE64 below is a clearly invalid placeholder,
//   * apple-verify-jws.mjs refuses every message with code "root_not_configured",
//     apple-verify answers 503 (the app keeps the purchase unfinished and
//     retries) and apple-notifications answers 500 (Apple retries),
//   * tests/run-apple-iap.mjs prints "APPLE ROOT NOT EMBEDDED" (and fails if
//     anything other than the placeholder or the pinned certificate is here),
//     and OWNER-SQL / the release checklist list it as the one deploy blocker.
//   * The website is unaffected: no Apple purchase can exist without it.
//
// To embed it (no code change elsewhere):
//   1. Download AppleRootCA-G3.cer (DER) from the URL above.
//   2. Check its SHA-256 against Apple's PKI page
//      https://www.apple.com/certificateauthority/ ("Apple Root CA - G3",
//      SHA-256 fingerprint) and against APPLE_ROOT_CA_G3_SHA256 below:
//        openssl x509 -inform der -in AppleRootCA-G3.cer -noout -fingerprint -sha256
//   3. Replace the placeholder with the base64 of the DER bytes (one line):
//        base64 -w0 AppleRootCA-G3.cer      (or: node -e "console.log(require('fs').readFileSync('AppleRootCA-G3.cer').toString('base64'))")
//   4. Run: node tests/run-apple-iap.mjs  and  npm run check:iap-release (fails while the placeholder is here)
//
// If the fingerprint on Apple's page differs from the constant below, the
// constant (written from the planner's notes) is wrong: fix the constant, not
// the check.

// SHA-256 of the DER certificate, as lowercase hex without colons.
// 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
export const APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

export const APPLE_ROOT_CA_G3_PLACEHOLDER = "NOT-EMBEDDED-YET: replace with the base64 DER of Apple Root CA - G3 (see the comment at the top of this file)";

// Embedded 25 Nov 2026 (owner approved the download): fetched from apple.com/certificateauthority, 583 bytes,
// SHA-256 matched APPLE_ROOT_CA_G3_SHA256 before embedding.
export const APPLE_ROOT_CA_G3_BASE64 = "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";
