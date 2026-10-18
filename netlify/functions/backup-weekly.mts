// Weekly encrypted database backup, emailed to support@cybernetai.app.
//
// "@weekly" runs every Sunday at 00:00 UTC. Netlify scheduled functions work
// on every plan, Free included, but only on the published production deploy
// (Deploy Previews and branch deploys never run them on a schedule), and they
// stop after 30 seconds, so the run keeps a 25-second budget. They cannot be
// called through a URL; to make a backup right away, use "Run now" on this
// function's page in Netlify, or the optional /api/backup-now trigger.
//
// Without BACKUP_PASSPHRASE it only logs a warning. All the work is in
// netlify/lib/backup.mjs; docs/BACKUPS.md covers setup and restore.
import { runBackup } from "../lib/backup.mjs";

export default async () => {
  const result = await runBackup({ trigger: "schedule" });
  const body = result.status === "sent"
    ? { status: "sent", filename: result.filename, bytes: result.bytes }
    : result;
  return new Response(JSON.stringify(body), {
    status: result.status === "failed" ? 500 : 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
};

export const config = {
  schedule: "@weekly"
};
