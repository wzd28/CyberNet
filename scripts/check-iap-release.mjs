// Release check for the FIRST server deploy that should accept Apple purchases
// (and before any iPhone build without CN_NO_IAP goes to TestFlight or App Review).
//
//   npm run check:iap-release
//
// It fails while Apple Root CA - G3 is still the placeholder in
// netlify/lib/apple-root-ca-g3.mjs: until then /api/apple-verify answers 503
// and /api/apple-notifications answers 500, so a purchase would be charged but
// never unlock Pro. It is NOT part of `npm test` on purpose: build 10 (no
// in-app purchases) and the website ship safely without the certificate.
//
// When it passes, the embedded certificate also matched its pinned SHA-256
// (embeddedRoots() refuses anything else), so a wrong file cannot pass.
import * as rootCa from "../netlify/lib/apple-root-ca-g3.mjs";
import { embeddedRoots } from "../netlify/lib/apple-verify-jws.mjs";

const problems = [];
if (rootCa.APPLE_ROOT_CA_G3_BASE64 === rootCa.APPLE_ROOT_CA_G3_PLACEHOLDER) {
  problems.push("Apple Root CA - G3 is still the placeholder in netlify/lib/apple-root-ca-g3.mjs (owner step O6).");
} else {
  let roots = null;
  try { roots = embeddedRoots(); } catch (error) { problems.push(`The embedded certificate could not be read: ${error?.message || error}`); }
  if (!problems.length && !(Array.isArray(roots) && roots.length === 1)) {
    problems.push("The embedded certificate does not match the pinned SHA-256 (APPLE_ROOT_CA_G3_SHA256).");
  }
}

if (problems.length) {
  for (const p of problems) console.error(`check-iap-release: FAIL ${p}`);
  console.error("check-iap-release: the server is NOT ready to accept Apple purchases.");
  process.exit(1);
}
console.log("check-iap-release: Apple Root CA - G3 is embedded and matches its pin.");
