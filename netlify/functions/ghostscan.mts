import type { Config, Context } from "@netlify/functions";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

declare const Netlify: { env: { get(name: string): string | undefined } };


const DEFAULT_BROWSERLESS_ORIGIN = "https://production-sfo.browserless.io";
const MAX_BROWSERLESS_WAIT_MS = 45_000;

type JsonRecord = Record<string, unknown>;

type BrowserScan = {
  inputUrl: string;
  finalUrl: string;
  redirects: Array<{ url: string; status?: number; stage?: string; detail?: string }>;
  domains: string[];
  forms: Array<{
    method?: string;
    action?: string;
    fields?: string[];
    sensitiveFields?: string[];
  }>;
  behavior: string[];
  page: {
    title?: string;
    url?: string;
    status?: number;
    https?: boolean;
    textSample?: string;
    hasPasswordField?: boolean;
    downloadLinks?: number;
  };
  screenshots: { desktop?: string; mobile?: string };
  mobileDifference?: boolean;
};

function json(data: JsonRecord, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  const host = cleanHostname(hostname);
  return (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home") ||
    host === "metadata.google.internal"
  );
}

function isBlockedIp(address: string): boolean {
  const ip = cleanHostname(address);

  if (ip.includes(":")) {
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("fe8") ||
      ip.startsWith("fe9") ||
      ip.startsWith("fea") ||
      ip.startsWith("feb") ||
      ip.startsWith("2001:db8:") ||
      ip.startsWith("::ffff:127.") ||
      ip.startsWith("::ffff:10.") ||
      ip.startsWith("::ffff:192.168.") ||
      ip.startsWith("::ffff:169.254.")
    );
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function normalizeTarget(rawValue: unknown): URL {
  const raw = String(rawValue ?? "").trim();
  if (!raw) throw new Error("Paste a URL before starting GhostScan.");
  if (raw.length > 2_048) throw new Error("The URL is too long to scan safely.");

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS URL.");
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("GhostScan only accepts HTTP and HTTPS links.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs containing embedded usernames or passwords are not accepted.");
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    throw new Error("GhostScan blocks unusual ports for safety.");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Local and private-network destinations are blocked.");
  }

  return parsed;
}

async function assertPublicDestination(target: URL): Promise<void> {
  const host = cleanHostname(target.hostname);

  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error("Local and private-network destinations are blocked.");
    return;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("The destination domain could not be resolved.");
  }

  if (!records.length || records.some((record) => isBlockedIp(record.address))) {
    throw new Error("The destination resolves to a blocked network address.");
  }
}

function registrableDomain(hostname: string): string {
  const labels = cleanHostname(hostname).split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');

  const compoundSuffixes = new Set([
    'co.uk', 'org.uk', 'gov.uk', 'com.au', 'net.au', 'co.nz', 'com.br',
    'com.tr', 'com.lb', 'com.cy', 'co.jp', 'co.in', 'com.sg', 'com.cn', 'com.hk',
  ]);
  const suffix = labels.slice(-2).join('.');
  return compoundSuffixes.has(suffix)
    ? labels.slice(-3).join('.')
    : labels.slice(-2).join('.');
}

function addFinding(
  findings: Array<{ severity: string; title: string; detail: string }>,
  severity: string,
  title: string,
  detail: string,
): void {
  if (!findings.some((finding) => finding.title === title)) {
    findings.push({ severity, title, detail });
  }
}

function classifyScan(scan: BrowserScan) {
  const findings: Array<{ severity: string; title: string; detail: string }> = [];
  const behavior = [...(scan.behavior || [])];
  let score = 0;
  let strongSignals = 0;

  const input = new URL(scan.inputUrl);
  const final = new URL(scan.finalUrl || scan.inputUrl);
  const text = String(scan.page?.textSample || '').toLowerCase();
  const title = String(scan.page?.title || '').toLowerCase();
  const combinedText = `${title} ${text}`;

  if (final.protocol !== 'https:') {
    score += 18;
    addFinding(findings, 'medium', 'Connection is not encrypted', 'The final page uses HTTP instead of HTTPS.');
  }

  if (scan.redirects.length >= 3) {
    score += Math.min(18, scan.redirects.length * 4);
    addFinding(findings, 'medium', 'Multiple navigation steps', `The page used ${scan.redirects.length} navigation steps before settling.`);
  }

  const inputDomain = registrableDomain(input.hostname);
  const finalDomain = registrableDomain(final.hostname);
  if (inputDomain && finalDomain && inputDomain !== finalDomain) {
    score += 22;
    strongSignals += 1;
    addFinding(findings, 'high', 'Destination changed domains', `The submitted domain changed from ${inputDomain} to ${finalDomain}.`);
  }

  if (final.hostname.startsWith('xn--') || final.hostname.includes('.xn--')) {
    score += 24;
    strongSignals += 1;
    addFinding(findings, 'high', 'Internationalized lookalike domain', 'The final hostname uses Punycode and may imitate another domain.');
  }

  if (isIP(final.hostname)) {
    score += 30;
    strongSignals += 1;
    addFinding(findings, 'high', 'Raw IP destination', 'The page uses an IP address instead of a normal domain name.');
  }

  if ((final.hostname.match(/-/g) || []).length >= 3) {
    score += 10;
    addFinding(findings, 'medium', 'Unusual domain structure', 'The final hostname contains many hyphens.');
  }

  const sensitiveForms = (scan.forms || []).filter((form) => form.sensitiveFields?.length);
  if (sensitiveForms.length) {
    score += 38;
    strongSignals += 1;
    addFinding(findings, 'high', 'Sensitive form detected', 'The rendered page requests passwords, payment information, authentication codes, or other sensitive data.');
  }

  for (const form of scan.forms || []) {
    if (!form.action) continue;
    try {
      const action = new URL(form.action, scan.finalUrl);
      if (registrableDomain(action.hostname) !== finalDomain) {
        score += 28;
        strongSignals += 1;
        addFinding(findings, 'high', 'Form submits to another domain', `A form sends data to ${action.hostname}.`);
        break;
      }
    } catch {
      // Ignore malformed form actions.
    }
  }

  if (scan.page?.downloadLinks && scan.page.downloadLinks > 0) {
    score += 18;
    addFinding(findings, 'medium', 'Download links detected', `The page exposes ${scan.page.downloadLinks} possible download link(s).`);
  }

  const credentialLanguage = /\b(sign in|log in|login|verify|password|account locked|security alert|wallet|seed phrase|otp|verification code)\b/i.test(combinedText);
  if (credentialLanguage) {
    score += 14;
    addFinding(findings, 'medium', 'Account or credential language', 'The page contains login, verification, password, wallet, or authentication language.');
  }

  const brandRules: Array<[string, RegExp]> = [
    ['microsoft', /\b(microsoft|outlook|office 365)\b/i],
    ['google', /\b(google|gmail)\b/i],
    ['apple', /\b(apple|icloud)\b/i],
    ['paypal', /\bpaypal\b/i],
    ['amazon', /\bamazon\b/i],
    ['facebook', /\b(facebook|meta)\b/i],
    ['instagram', /\binstagram\b/i],
    ['whatsapp', /\bwhatsapp\b/i],
  ];

  for (const [brand, pattern] of brandRules) {
    if (pattern.test(combinedText) && !finalDomain.includes(brand)) {
      score += 30;
      strongSignals += 1;
      addFinding(findings, 'high', `Possible ${brand} impersonation`, `The page displays ${brand} branding or wording on the unrelated domain ${finalDomain}.`);
      break;
    }
  }

  if (behavior.some((item) => /popup|dialog|notification|geolocation|local-network/i.test(item))) {
    score += 12;
    addFinding(findings, 'medium', 'Intrusive browser behavior', 'The page attempted a popup, dialog, permission request, or blocked local-network access.');
  }

  if (strongSignals >= 2) score = Math.max(score, 78);
  else if (strongSignals === 1) score = Math.max(score, 52);
  score = Math.max(0, Math.min(100, score));

  if (!findings.length) {
    addFinding(findings, 'low', 'No strong threat behavior observed', 'The isolated visit did not reveal a decisive phishing or malware indicator.');
  }

  const riskLevel = score >= 85
    ? 'Critical Risk'
    : score >= 60
      ? 'High Risk'
      : score >= 32
        ? 'Medium Risk'
        : 'No threat observed';

  const verdict = score >= 85 ? 'malicious' : score >= 55 ? 'suspicious' : 'low_risk';
  const confidence = Math.min(96, 68 + Math.min(20, findings.length * 4) + strongSignals * 4);

  const actions = score >= 60
    ? [
        'Do not enter passwords, payment details, authentication codes, or recovery phrases on this page.',
        'Do not download or run files offered by the destination.',
        'Open the organization’s official website manually instead of using the submitted link.',
        'If you already entered information, change the affected password and enable multi-factor authentication.',
      ]
    : [
        'Keep treating the destination as unverified; no automated scan can prove that a page is completely safe.',
        'Confirm the sender and domain through an official source before entering sensitive information.',
        'Avoid downloading unexpected files or granting browser permissions.',
      ];

  const summary = score >= 60
    ? 'GhostScan observed multiple behaviors associated with phishing or unsafe destinations.'
    : score >= 32
      ? 'GhostScan found warning signs that should be reviewed before trusting this page.'
      : 'The isolated visit did not reveal a strong threat signal, but the destination is not guaranteed safe.';

  return {
    score,
    confidence,
    verdict,
    riskLevel,
    threatType: riskLevel,
    summary,
    findings,
    actions,
    limitations: [
      'Threat-list reputation is not enabled in this first local version.',
      'GhostScan does not submit forms, enter credentials, or intentionally download files.',
    ],
  };
}

const BROWSER_FUNCTION = String.raw`
export default async ({ page, context }) => {
  const target = context.url;
  const domains = new Set();
  const redirects = [];
  const behavior = [];
  const seenNavigation = new Set();
  let phase = "desktop";
  let desktopStatus = 0;

  const cleanHost = (value) => String(value || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const blockedHost = (hostname) => {
    const host = cleanHost(hostname);
    return host === "localhost" || host === "::1" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  };

  await page.setRequestInterception(true);

  page.on("request", (request) => {
    try {
      const value = request.url();
      const parsed = new URL(value);

      if (parsed.protocol === "data:" || parsed.protocol === "blob:") {
        request.continue();
        return;
      }

      if (!['http:', 'https:'].includes(parsed.protocol) || blockedHost(parsed.hostname)) {
        if (!behavior.includes("Blocked a non-web or local-network request.")) {
          behavior.push("Blocked a non-web or local-network request.");
        }
        request.abort("blockedbyclient");
        return;
      }

      domains.add(parsed.hostname.toLowerCase());

      if (phase === "desktop" && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        if (!seenNavigation.has(value)) {
          redirects.push({
            url: value,
            status: 0,
            stage: redirects.length ? "Redirect" : "Original link",
          });
          seenNavigation.add(value);
        }
      }

      request.continue();
    } catch {
      request.abort("blockedbyclient");
    }
  });

  page.on("response", (response) => {
    try {
      const request = response.request();
      if (phase === "desktop" && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        desktopStatus = response.status();
        const match = [...redirects].reverse().find((item) => item.url === response.url());
        if (match) match.status = response.status();
      }
    } catch {}
  });

  page.on("dialog", async (dialog) => {
    behavior.push("Displayed a " + dialog.type() + " browser dialog.");
    try { await dialog.dismiss(); } catch {}
  });

  page.on("popup", async (popup) => {
    behavior.push("Attempted to open a popup window.");
    try { await popup.close(); } catch {}
  });

  await page.setViewport({ width: 1365, height: 768, deviceScaleFactor: 1 });
  const initialResponse = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25000 });
  if (initialResponse) desktopStatus = initialResponse.status();
  try { await page.waitForNetworkIdle({ idleTime: 800, timeout: 5000 }); } catch {}

  const desktopData = await page.evaluate(() => {
    const normalizeAction = (form) => {
      try { return new URL(form.getAttribute("action") || location.href, location.href).href; }
      catch { return form.getAttribute("action") || location.href; }
    };

    const forms = Array.from(document.forms).map((form) => {
      const controls = Array.from(form.querySelectorAll("input, select, textarea"));
      const fields = controls.map((control) => {
        const type = String(control.getAttribute("type") || control.tagName || "field").toLowerCase();
        const name = control.getAttribute("name") || control.getAttribute("autocomplete") || control.getAttribute("id") || "unnamed";
        return type + ":" + name;
      });
      const sensitiveFields = controls.filter((control) => {
        const haystack = [
          control.getAttribute("type"),
          control.getAttribute("name"),
          control.getAttribute("id"),
          control.getAttribute("autocomplete"),
          control.getAttribute("placeholder"),
        ].filter(Boolean).join(" ").toLowerCase();
        return /(password|passcode|otp|one.time|verification|cvv|cvc|card|credit|debit|account|routing|iban|seed|recovery|wallet|pin)/i.test(haystack);
      }).map((control) => control.getAttribute("name") || control.getAttribute("type") || control.getAttribute("id") || "sensitive field");

      return {
        method: String(form.method || "GET").toUpperCase(),
        action: normalizeAction(form),
        fields,
        sensitiveFields,
      };
    });

    const links = Array.from(document.querySelectorAll("a[href]"));
    const downloadLinks = links.filter((link) => {
      const href = String(link.getAttribute("href") || "");
      return link.hasAttribute("download") || /\.(exe|msi|apk|dmg|pkg|zip|rar|7z|iso|img|scr|bat|cmd|ps1)(?:$|[?#])/i.test(href);
    }).length;

    const bodyText = String(document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 9000);
    const lowerText = bodyText.toLowerCase();
    if (/allow notifications|enable notifications|click allow/i.test(lowerText)) {
      // Returned as part of the page snapshot and converted to a behavior signal outside the page.
    }

    return {
      title: document.title || "",
      url: location.href,
      textSample: bodyText,
      forms,
      hasPasswordField: Boolean(document.querySelector('input[type="password"]')),
      downloadLinks,
      asksNotifications: /allow notifications|enable notifications|click allow/i.test(lowerText),
      asksGeolocation: /share your location|allow location|enable location/i.test(lowerText),
    };
  });

  if (desktopData.asksNotifications) behavior.push("The page asks the visitor to enable browser notifications.");
  if (desktopData.asksGeolocation) behavior.push("The page asks the visitor to share location information.");

  const desktopImage = await page.screenshot({
    type: "jpeg",
    quality: 58,
    fullPage: false,
    encoding: "base64",
  });

  const desktopUrl = page.url();
  phase = "mobile";
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 22000 });
    try { await page.waitForNetworkIdle({ idleTime: 700, timeout: 4000 }); } catch {}
  } catch {}

  const mobileData = await page.evaluate(() => ({
    title: document.title || "",
    url: location.href,
    formCount: document.forms.length,
    hasPasswordField: Boolean(document.querySelector('input[type="password"]')),
  }));

  const mobileImage = await page.screenshot({
    type: "jpeg",
    quality: 58,
    fullPage: false,
    encoding: "base64",
  });

  const finalUrl = desktopUrl || desktopData.url || target;
  const mobileDifference = mobileData.url !== finalUrl ||
    mobileData.title !== desktopData.title ||
    mobileData.formCount !== desktopData.forms.length ||
    mobileData.hasPasswordField !== desktopData.hasPasswordField;

  if (mobileDifference) behavior.push("Desktop and mobile rendering produced different page behavior or content.");

  return {
    data: {
      inputUrl: target,
      finalUrl,
      redirects,
      domains: Array.from(domains).slice(0, 60),
      forms: desktopData.forms,
      behavior: Array.from(new Set(behavior)),
      page: {
        title: desktopData.title,
        url: finalUrl,
        status: desktopStatus,
        https: finalUrl.startsWith("https://"),
        textSample: desktopData.textSample,
        hasPasswordField: desktopData.hasPasswordField,
        downloadLinks: desktopData.downloadLinks,
      },
      screenshots: {
        desktop: "data:image/jpeg;base64," + desktopImage,
        mobile: "data:image/jpeg;base64," + mobileImage,
      },
      mobileDifference,
    },
    type: "application/json",
  };
};
`;

async function runBrowserless(target: URL, token: string): Promise<BrowserScan> {
  const configuredOrigin =Netlify.env.get("BROWSERLESS_ORIGIN") || DEFAULT_BROWSERLESS_ORIGIN;
  const origin = configuredOrigin.replace(/\/$/, '');
  const endpoint = `${origin}/function?token=${encodeURIComponent(token)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_BROWSERLESS_WAIT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        code: BROWSER_FUNCTION,
        context: { url: target.href },
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      const safeMessage = response.status === 401
        ? 'Browserless rejected the API token.'
        : `Browserless returned HTTP ${response.status}.`;
      throw new Error(safeMessage);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Browserless returned an unreadable response.');
    }

    return parsed as BrowserScan;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The isolated browser timed out before the scan completed.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default async (request: Request, _context: Context): Promise<Response> => {
const token = (Netlify.env.get("BROWSERLESS_TOKEN") || "").trim();
  if (request.method === 'GET') {
    return json({
      online: true,
      browserEnabled: Boolean(token),
      provider: 'Browserless',
      aiEnabled: false,
      reputationEnabled: false,
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  if (!token) {
    return json({ error: 'BROWSERLESS_TOKEN is missing from the Netlify environment variables.' }, 503);
  }

  let body: { url?: unknown; imageData?: unknown; imageName?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'The GhostScan request body must be valid JSON.' }, 400);
  }

  if (!body.url && body.imageData) {
    return json({
      error: 'Image and QR URL extraction is not configured yet. Paste a URL for the first local test.',
    }, 400);
  }

  const startedAt = Date.now();

  try {
    const target = normalizeTarget(body.url);
    await assertPublicDestination(target);

    const scan = await runBrowserless(target, token);
    const classification = classifyScan(scan);

    return json({
      scanId: randomUUID(),
      completedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      provider: 'Browserless',
      ...scan,
      ...classification,
      reputation: { checked: false, listed: false, threatTypes: [] },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GhostScan failed unexpectedly.';
    return json({ error: message }, 400);
  }
};

export const config: Config = {
  path: '/api/ghostscan',
};