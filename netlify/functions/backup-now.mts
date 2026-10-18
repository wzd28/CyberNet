// Optional manual trigger for the weekly backup, so the owner can make the
// first backup right after a deploy without waiting for Sunday:
//
//   POST /api/backup-now   with header   x-backup-token: <BACKUP_TRIGGER_TOKEN>
//
// It exists because Netlify does not let scheduled functions be called
// through a URL. It answers 404 to everything unless BACKUP_TRIGGER_TOKEN is
// set (at least 32 characters) and the request is a POST carrying exactly
// that token, so without the variable the endpoint does not exist. It only
// ever emails the encrypted backup to the fixed backup address; the response
// carries row counts, never data. "Run now" on the backup-weekly function
// page in Netlify does the same without a token.
import { MIN_TRIGGER_TOKEN_LENGTH, runBackup, tokenMatches } from "../lib/backup.mjs";

function env(name) {
  try {
    return String(globalThis.Netlify?.env?.get?.(name) || process.env[name] || "").trim();
  } catch {
    return String(process.env[name] || "").trim();
  }
}

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function notFound() {
  return new Response(JSON.stringify({ error: "Not found." }), { status: 404, headers });
}

export default async (request) => {
  const expected = env("BACKUP_TRIGGER_TOKEN");
  if (!expected) return notFound();
  if (expected.length < MIN_TRIGGER_TOKEN_LENGTH) {
    console.warn(`CyberNet backup-now is off: BACKUP_TRIGGER_TOKEN is shorter than ${MIN_TRIGGER_TOKEN_LENGTH} characters. See docs/BACKUPS.md.`);
    return notFound();
  }
  if (request.method !== "POST") return notFound();
  if (!tokenMatches(request.headers.get("x-backup-token"), expected)) return notFound();

  const result = await runBackup({ trigger: "manual" });

  if (result.status === "sent") {
    return new Response(JSON.stringify({
      status: "sent",
      message: `The backup was emailed to ${result.to}.`,
      filename: result.filename,
      bytes: result.bytes,
      authUsers: result.authUsers,
      tables: result.tables,
      notes: result.notes
    }), { status: 200, headers });
  }

  if (result.status === "skipped") {
    return new Response(JSON.stringify({
      status: "skipped",
      message: "BACKUP_PASSPHRASE is not set in the Netlify environment variables, so nothing was backed up. Set it, redeploy, and try again."
    }), { status: 503, headers });
  }

  return new Response(JSON.stringify({
    status: "failed",
    message: result.error,
    alertSent: result.alertSent
  }), { status: 502, headers });
};

export const config = {
  path: "/api/backup-now"
};
