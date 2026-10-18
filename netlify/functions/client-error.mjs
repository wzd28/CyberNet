// POST /api/client-error: receives one browser error from
// public/cybernet-errors.js and hands it to reportError (log line + alert
// email, deduplicated and capped there).
//
// What it accepts: a JSON object under 8 KB with a message and, optionally, a
// stack, file:line:col, the page path, the UI bundle version, a browser
// family, a timestamp and a short label. Everything else is dropped, and every
// text field is scrubbed again here (the browser already scrubs), because the
// sender cannot be trusted. Cookies and other headers are never read, apart
// from the connection address used for rate limiting, which is hashed and
// never stored or logged as is.
//
// Limits: 10 reports a minute per address in each warm instance, then 30 an
// hour per address and 300 an hour for everyone together through the
// existing consume_api_quota RPC (fails open, like the other quota checks).
// The per-address limit uses one of 256 fixed keys (cn_cerr:ip:00 to ff, from
// the hashed address), so new addresses never add rows to api_rate_limits.

import { createHmac } from "node:crypto";
import { reportError, scrubText, consumeQuota, CLIENT_FILE, CLIENT_UA } from "../lib/report-error.mjs";

const MAX_BODY_BYTES = 8 * 1024;
const PER_ADDRESS_PER_MINUTE = 10;
const PER_ADDRESS_PER_HOUR = 30;
const ALL_PER_HOUR = 300;

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "");
  } catch {
    return "";
  }
}

function reply(status, data, extraHeaders = {}) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {
      ...(data === null ? {} : { "Content-Type": "application/json; charset=utf-8" }),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

const accepted = () => reply(204, null);

// Reads at most `max` bytes; null means the body was larger.
async function readCapped(request, max) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const str = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
const int = (value) => (Number.isInteger(value) && value >= 0 && value <= 10_000_000 ? value : undefined);

// Shapes the body into the fields reportError knows. Returns null when there
// is nothing usable (no message).
export function validateReport(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  let message = str(body.message, 2000).replace(/^Uncaught\s+/, "").trim();
  if (!message) return null;
  const kind = ["error", "rejection", "manual"].includes(body.kind) ? body.kind : "error";
  const name = /^[A-Za-z_$][\w$.]{0,59}$/.test(str(body.name, 60)) ? body.name : "Error";
  // "TypeError: x is not a function" already carries its name.
  const prefix = `${name}: `;
  if (message.startsWith(prefix)) message = message.slice(prefix.length) || message;
  const line = int(body.line);
  const col = int(body.col);
  // Only a script on this site (/script.js, /ui/cybernet-ui.js): anything else
  // is dropped rather than passed on to the log and the alert email.
  const rawFile = str(body.file, 300);
  let file = rawFile.split(/[?#]/)[0];
  if (!CLIENT_FILE.test(file)) file = "";
  if (file && line !== undefined) file += `:${line}${col !== undefined ? `:${col}` : ""}`;
  let page = str(body.page, 400).split(/[?#]/)[0];
  if (!page.startsWith("/")) page = "/";
  const ts = typeof body.ts === "string" && Math.abs(Date.parse(body.ts) - Date.now()) < 24 * 60 * 60 * 1000 ? body.ts : undefined;
  return {
    kind,
    name,
    message,
    stack: str(body.stack, 2048),
    file,
    rawFile,
    page,
    version: /^[\w-]{1,32}$/.test(str(body.version, 32)) ? body.version : "",
    ua: CLIENT_UA.test(str(body.ua, 60)) ? body.ua : "",
    where: str(body.where, 80),
    ts
  };
}

const EXTENSION = /\b(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\/|webkit-masked-url:/i;

// Noise the browser script already drops; checked again for old or forged senders.
export function isNoise(report) {
  if (/ResizeObserver loop/i.test(report.message)) return true;
  if (/^Script error\.?$/i.test(report.message) && !report.rawFile && !report.stack) return true;
  if (EXTENSION.test(report.rawFile || report.file || "") || EXTENSION.test(report.stack.split("\n").slice(0, 3).join("\n"))) return true;
  return false;
}

// The address is only ever used as a hashed bucket name.
function addressBucket(request, context) {
  let address = "";
  try {
    address = String(
      context?.ip ||
      request.headers.get("x-nf-client-connection-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    ).slice(0, 64);
  } catch {
    address = "unknown";
  }
  const pepper = env("ERROR_REPORT_SALT") || env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY") || "cybernet-client-error";
  return createHmac("sha256", pepper).update(address).digest("hex").slice(0, 24);
}

// The durable per-address key: the first byte of the hashed bucket, so there
// are at most 256 such rows however many addresses send reports. Addresses
// that share a byte share the hourly limit, which is harmless here.
export function durableAddressKey(bucket) {
  return `cn_cerr:ip:${String(bucket).slice(0, 2)}`;
}

const recent = new Map(); // bucket -> { windowStart, count }

function withinMemoryLimit(bucket, now = Date.now()) {
  const current = recent.get(bucket);
  if (!current || now - current.windowStart >= 60_000) {
    recent.set(bucket, { windowStart: now, count: 1 });
    if (recent.size > 2000) {
      for (const [key, value] of recent) {
        if (now - value.windowStart >= 60_000) recent.delete(key);
      }
      while (recent.size > 2000) recent.delete(recent.keys().next().value);
    }
    return true;
  }
  current.count += 1;
  return current.count <= PER_ADDRESS_PER_MINUTE;
}

// For the tests.
export function resetClientErrorMemory() {
  recent.clear();
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return reply(405, { error: "Method not allowed. Send error reports with POST." }, { Allow: "POST" });
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return reply(413, { error: "The report is larger than 8 KB." });

  let text;
  try {
    text = await readCapped(request, MAX_BODY_BYTES);
  } catch {
    return reply(400, { error: "The report could not be read." });
  }
  if (text === null) return reply(413, { error: "The report is larger than 8 KB." });

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: "The report is not valid JSON." });
  }

  const report = validateReport(body);
  if (!report) return reply(400, { error: "The report needs a message." });
  if (isNoise(report)) return accepted();

  const bucket = addressBucket(request, context);
  if (!withinMemoryLimit(bucket)) return reply(429, { error: "Too many reports. Try again in a minute." });

  const perAddress = await consumeQuota(durableAddressKey(bucket), 3600, PER_ADDRESS_PER_HOUR);
  if (perAddress && !perAddress.allowed) return reply(429, { error: "Too many reports. Try again later." });
  const everyone = await consumeQuota("cn_cerr:all", 3600, ALL_PER_HOUR);
  if (everyone && !everyone.allowed) return reply(429, { error: "Too many reports. Try again later." });

  reportError(
    { name: report.name, message: report.message, stack: scrubText(report.stack, 2048) },
    {
      source: "client",
      kind: report.kind,
      page: report.page,
      file: report.file,
      version: report.version,
      ua: report.ua,
      where: report.where,
      ts: report.ts,
      context
    }
  );

  return accepted();
};

export const config = {
  path: "/api/client-error"
};
