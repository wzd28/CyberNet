// Which browser error reports are logged but never emailed, and a short,
// fixed-vocabulary browser name for the alert. Used by
// netlify/functions/client-error.mjs.
//
// IGNORED_ERRORS has a copy in public/cybernet-errors.js (IGNORED), which
// drops the same messages before they are sent. Keep the two lists the same:
// tests/run-errors.mjs fails when they differ. Old cached copies of that
// script keep sending these, so this server list is the one that counts.

// Messages that are not bugs in our code. Matched against the message (the
// error name already stripped). Inline "global code@" errors are NOT ignored
// as a group: one of ours would look the same.
export const IGNORED_ERRORS = [
  // Injected by the Instagram / Facebook iOS in-app browser (autofill bridge).
  /_AutofillCallbackHandler/,
  // Injected by the same in-app browsers (Private Click Measurement bridge).
  /_pcmBridgeCallbackHandler/,
  // An in-app browser's injected script posting to its native app; our code never uses it.
  /webkit\.messageHandlers/,
  // Injected by an app's in-app search SDK, not by any script of ours.
  /instantSearchSDKJSBridge/,
  // Injected by an iOS in-app browser that expects a "gmo" bridge object.
  /Can't find variable: gmo/,
  // Harmless browser warning: a ResizeObserver callback ran past one frame.
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
  // A cross-origin script's error with every detail hidden by the browser.
  /^Script error\.?$/
];

export function isIgnoredError(message) {
  const text = String(message ?? "");
  return IGNORED_ERRORS.some((pattern) => pattern.test(text));
}

// Oldest browsers the site supports (they parse the ?. and ?? in our scripts).
// Reports from older ones are logged as "unsupported-browser" and not emailed.
export const MIN_BROWSER = { chromium: 90, firefox: 90, safari: 14, ios: 14 };

const IN_APP = [
  // Our own iPhone app (capacitor.config appendUserAgent "CyberNetAI-iOS/<version>").
  ["CyberNet AI", /\bCyberNetAI-iOS\//],
  ["Instagram", /\bInstagram\b/],
  ["Facebook", /\bFB(?:AN|AV)\//],
  ["TikTok", /musical_ly|BytedanceWebview/i],
  ["Snapchat", /\bSnapchat\b/],
  ["LinkedIn", /\bLinkedInApp\b/],
  ["WhatsApp", /\bWhatsApp\b/],
  ["Google app", /\bGSA\/\d/],
  // A news app seen in the logs (Android WebView, "open_news" token).
  ["News app", /\bopen_news\b/]
];

const major = (pattern, ua) => {
  const m = pattern.exec(ua);
  return m ? Number(m[1]) : 0;
};

// "Instagram in-app (iOS 18)", "Android WebView 69 (Android 9)",
// "Chrome 141 on Windows". Built only from fixed words and version numbers:
// the User-Agent itself is never returned, logged or emailed.
// supported: true/false against MIN_BROWSER, or null when the engine is unknown.
export function describeUserAgent(header) {
  const ua = String(header ?? "").slice(0, 512);
  if (!ua) return null;
  const ios = /\b(?:iPhone|iPad|iPod)\b/.test(ua);
  const android = !ios && /\bAndroid\b/.test(ua);
  const os = ios ? "iOS" : android ? "Android" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const osMajor = ios ? major(/\bOS (\d+)[_.]\d/, ua) : android ? major(/\bAndroid (\d+)/, ua) : 0;
  const osLabel = `${os}${osMajor ? ` ${osMajor}` : ""}`;
  const chromium = major(/\bChrom(?:e|ium)\/(\d+)/, ua);
  const safari = major(/\bVersion\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//, ua);

  let supported = null;
  if (ios) supported = osMajor ? osMajor >= MIN_BROWSER.ios : null; // every iOS browser is WebKit
  else if (/\bFirefox\/\d/.test(ua)) supported = major(/\bFirefox\/(\d+)/, ua) >= MIN_BROWSER.firefox;
  else if (chromium) supported = chromium >= MIN_BROWSER.chromium; // Edge, Samsung, Opera, WebViews too
  else if (safari) supported = safari >= MIN_BROWSER.safari;

  let name = "";
  const app = (ios || android) && IN_APP.find(([, pattern]) => pattern.test(ua));
  if (app) name = `${app[0]} in-app (${osLabel})`;
  else if (android && /; wv\)/.test(ua)) name = `Android WebView${chromium ? ` ${chromium}` : ""} (${osLabel})`;
  else {
    const families = ios
      ? [["Edge", /\bEdgiOS\/(\d+)/], ["Chrome", /\bCriOS\/(\d+)/], ["Firefox", /\bFxiOS\/(\d+)/], ["Safari", /\bVersion\/(\d+)[\d.]* Mobile\/\S+ Safari\//]]
      : [["Edge", /\bEdg(?:e|A)?\/(\d+)/], ["Opera", /\bOPR\/(\d+)/], ["Samsung Internet", /\bSamsungBrowser\/(\d+)/],
        ["Chrome", /\bChrome\/(\d+)/], ["Firefox", /\bFirefox\/(\d+)/], ["Safari", /\bVersion\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//]];
    const found = families.find(([, pattern]) => pattern.test(ua));
    if (found) name = `${found[0]} ${major(found[1], ua)} on ${os}`;
    else if (ios) name = `Other in-app (${osLabel})`; // a WebKit view without a browser token
    else name = `Other on ${os}`;
  }
  return { name, supported };
}

// Fallback when there is no User-Agent header: the label an old copy of
// cybernet-errors.js sends ("Chrome 69 on Android"). null when unknown.
const LABEL_MIN = { Chrome: 90, Edge: 90, Firefox: 90, Safari: 14, "Samsung Internet": 15, Opera: 76 };
export function labelSupported(label) {
  const m = /^(Chrome|Edge|Firefox|Safari|Samsung Internet|Opera) (\d{1,4}) on /.exec(String(label ?? ""));
  return m ? Number(m[2]) >= LABEL_MIN[m[1]] : null;
}
