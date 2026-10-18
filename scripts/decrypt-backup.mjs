#!/usr/bin/env node
// Opens a CyberNet AI backup file (.cnbk) from the weekly backup email.
//
//   node scripts/decrypt-backup.mjs <backup.cnbk>
//       Writes the data as <backup>.json next to the file.
//   node scripts/decrypt-backup.mjs <backup.cnbk> --sql
//       Also writes <backup>.restore.sql, which loads the tables into a new
//       Supabase project (see docs/BACKUPS.md).
//   node scripts/decrypt-backup.mjs --restore-auth <backup.json> [--dry-run]
//       Recreates the sign-in accounts in a NEW Supabase project, keeping
//       their ids. Reads RESTORE_SUPABASE_URL and RESTORE_SERVICE_ROLE_KEY.
//
// Add --force to replace output files that already exist.
//
// The passphrase comes from the BACKUP_PASSPHRASE environment variable, or is
// asked for without showing what you type. Needs Node 18 or newer and no
// packages, so it works on any computer with just this file.
//
// The format is written by netlify/lib/backup.mjs and the constants below
// must match it: "CNBK", version 1, 16-byte salt, 12-byte IV, AES-256-GCM
// ciphertext, 16-byte tag; key = PBKDF2-HMAC-SHA256, 600,000 iterations, over
// the passphrase with leading and trailing spaces removed (Unicode NFC); the
// 33 header bytes are the GCM additional data.

import { createDecipheriv, pbkdf2 } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const pbkdf2Async = promisify(pbkdf2);

export const FORMAT = {
  magic: Buffer.from("CNBK", "ascii"),
  versions: [1],
  saltBytes: 16,
  ivBytes: 12,
  tagBytes: 16,
  iterations: 600_000,
  digest: "sha256",
  keyBytes: 32
};
export const HEADER_BYTES = FORMAT.magic.length + 1 + FORMAT.saltBytes + FORMAT.ivBytes;

// An error with a message written for the person running the script.
export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function normalizePassphrase(passphrase) {
  return String(passphrase ?? "").normalize("NFC").trim();
}

export function parseHeader(data) {
  if (!Buffer.isBuffer(data) || data.length < 4 || !data.subarray(0, 4).equals(FORMAT.magic)) {
    throw new CliError("This file is not a CyberNet AI backup. Backup files start with the letters CNBK and end in .cnbk. Check that you picked the attachment from the backup email.");
  }
  const version = data[4];
  if (!FORMAT.versions.includes(version)) {
    throw new CliError(`This backup uses format version ${version}, which this script does not know. Update the CyberNet project (git pull) and try again.`);
  }
  if (data.length < HEADER_BYTES + FORMAT.tagBytes) {
    throw new CliError("This backup file is incomplete (it is too short). Save the attachment from the email again and retry.");
  }
  const salt = data.subarray(5, 5 + FORMAT.saltBytes);
  const iv = data.subarray(5 + FORMAT.saltBytes, HEADER_BYTES);
  return { version, salt, iv };
}

const WRONG_PASSPHRASE =
  "That passphrase does not open this backup, or the file was damaged. " +
  "Check the passphrase in your password manager (capital letters matter) and try again. " +
  "If you changed the passphrase at some point, older backups need the old one. " +
  "If it still fails, save the attachment from the email again, or try an earlier week's backup.";

export async function decryptBackup(data, passphrase) {
  const { salt, iv } = parseHeader(data);
  const key = await pbkdf2Async(normalizePassphrase(passphrase), salt, FORMAT.iterations, FORMAT.keyBytes, FORMAT.digest);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(data.subarray(0, HEADER_BYTES));
  decipher.setAuthTag(data.subarray(data.length - FORMAT.tagBytes));

  let zipped;
  try {
    zipped = Buffer.concat([decipher.update(data.subarray(HEADER_BYTES, data.length - FORMAT.tagBytes)), decipher.final()]);
  } catch {
    throw new CliError(WRONG_PASSPHRASE);
  }

  let doc;
  try {
    doc = JSON.parse(gunzipSync(zipped).toString("utf8"));
  } catch {
    throw new CliError("The backup opened, but its contents could not be read. Try an earlier week's backup, and keep this file in case it is needed later.");
  }
  if (doc?.manifest?.format !== "cybernet-ai-backup" || typeof doc.tables !== "object" || !Array.isArray(doc.authUsers)) {
    throw new CliError("The file opened, but it does not look like a CyberNet AI backup inside. Check that you picked the right file.");
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Restore SQL for the public tables
// ---------------------------------------------------------------------------

export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function dollarTag(text) {
  for (let i = 0; ; i += 1) {
    const tag = i ? `$cnbk${i}$` : "$cnbk$";
    if (!text.includes(tag)) return tag;
  }
}

// One transaction that adds every saved row, in the backup's restore order
// (each table after the tables it references). Rows whose key already exists
// are updated to the saved values, which covers the profiles that Supabase
// creates automatically when the accounts are recreated. Nothing is deleted.
export function buildRestoreSql(doc, { sourceFile = "" } = {}) {
  const manifest = doc.manifest || {};
  const order = Array.isArray(manifest.restoreOrder) && manifest.restoreOrder.length
    ? manifest.restoreOrder
    : Object.keys(doc.tables || {});

  const out = [
    "-- CyberNet AI restore script, made by scripts/decrypt-backup.mjs" + (sourceFile ? ` from ${path.basename(sourceFile)}` : "") + ".",
    `-- Backup taken ${manifest.createdAt || "(unknown time)"} from ${manifest.source || "(unknown project)"}; schema ${manifest.schemaVersion || "(unknown)"}.`,
    "--",
    "-- Run it in a NEW Supabase project (SQL Editor, or psql), and only after:",
    "--   1. supabase/schema.sql has been run there, and",
    "--   2. the sign-in accounts were recreated with:",
    "--        node scripts/decrypt-backup.mjs --restore-auth <backup.json>",
    "--",
    "-- It adds the saved rows, and sets rows with the same key back to the saved",
    "-- values. It never deletes anything. It runs as one transaction: if any part",
    "-- fails, nothing is changed, and it is safe to fix the problem and run it again.",
    "-- This file holds personal data. Delete it when the restore is done.",
    "",
    "begin;",
    ""
  ];

  const counts = [];
  for (const name of order) {
    const rows = Array.isArray(doc.tables?.[name]) ? doc.tables[name] : [];
    const info = manifest.tables?.[name] || {};
    const note = info.found === "auto" ? " (found automatically; it was not in the backup list yet)" : "";
    out.push(`-- ${name}: ${rows.length} ${rows.length === 1 ? "row" : "rows"}${note}`);
    counts.push([name, rows.length]);
    if (!rows.length) {
      out.push("");
      continue;
    }

    const columns = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
    const key = (Array.isArray(info.key) ? info.key : []).filter((column) => columns.includes(column));
    const others = columns.filter((column) => !key.includes(column));
    const columnList = columns.map(quoteIdent).join(", ");
    const table = `public.${quoteIdent(name)}`;
    const json = JSON.stringify(rows);
    const tag = dollarTag(json);

    let conflict = "on conflict do nothing";
    if (key.length && others.length) {
      conflict = `on conflict (${key.map(quoteIdent).join(", ")}) do update set ` +
        others.map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`).join(", ");
    } else if (key.length) {
      conflict = `on conflict (${key.map(quoteIdent).join(", ")}) do nothing`;
    }

    out.push(`insert into ${table} (${columnList})${info.identity ? " overriding system value" : ""}`);
    out.push(`select ${columnList} from json_populate_recordset(null::${table}, ${tag}${json}${tag}::json)`);
    out.push(`${conflict};`);

    // Numbered ids: move the counter past the restored rows so new rows do
    // not collide with them.
    if (info.identity && columns.includes(info.identity)) {
      out.push(
        `select setval(pg_get_serial_sequence(${quoteLiteral(table)}, ${quoteLiteral(info.identity)}), ` +
        `coalesce(max(${quoteIdent(info.identity)}), 0) + 1, false) from ${table};`
      );
    }
    out.push("");
  }

  out.push("commit;", "");
  if (counts.length) {
    out.push("-- Check: every table should show the same number in both columns.");
    out.push(counts.map(([name, n], i) =>
      `${i ? "union all " : ""}select ${quoteLiteral(name)} as table_name, (select count(*) from public.${quoteIdent(name)}) as rows_now, ${n} as rows_in_backup`
    ).join("\n") + ";", "");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Recreating the sign-in accounts through the Auth admin API
// ---------------------------------------------------------------------------

export function authUserPayload(user, now = Date.now()) {
  const appMetadata = { ...(user.app_metadata || {}) };
  // Supabase sets these itself from the way each person signs in.
  delete appMetadata.provider;
  delete appMetadata.providers;

  const payload = { id: user.id, user_metadata: user.user_metadata || {}, app_metadata: appMetadata };
  if (user.email) {
    payload.email = user.email;
    payload.email_confirm = Boolean(user.email_confirmed_at || (!user.phone && user.confirmed_at));
  }
  if (user.phone) {
    payload.phone = user.phone;
    payload.phone_confirm = Boolean(user.phone_confirmed_at);
  }
  const bannedUntil = Date.parse(user.banned_until || "");
  if (Number.isFinite(bannedUntil) && bannedUntil > now) {
    payload.ban_duration = `${Math.ceil((bannedUntil - now) / 3_600_000)}h`;
  }
  return payload;
}

export async function restoreAuthUsers(doc, { url, serviceKey, dryRun = false, log = console.log }) {
  const result = { created: 0, existing: 0, skipped: 0, planned: 0, failed: [] };
  const base = String(url || "").replace(/\/+$/, "");

  for (const user of doc.authUsers || []) {
    const who = user.email || user.phone || user.id;
    if (!user.id || (!user.email && !user.phone)) {
      result.skipped += 1;
      log(`  skipped ${who || "(no id)"}: no email or phone to sign in with`);
      continue;
    }
    const payload = authUserPayload(user);
    if (dryRun) {
      result.planned += 1;
      log(`  would create ${who}`);
      continue;
    }

    let response;
    try {
      response = await fetch(`${base}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000)
      });
    } catch (error) {
      result.failed.push({ who, message: `could not reach Supabase (${error?.name === "TimeoutError" ? "timed out" : error?.message || error})` });
      continue;
    }

    if (response.ok) {
      result.created += 1;
      continue;
    }
    const text = (await response.text().catch(() => "")).slice(0, 300);
    if (response.status === 422 && /already|exists|registered/i.test(text)) {
      result.existing += 1;
      continue;
    }
    let message = text;
    try { message = JSON.parse(text)?.msg || JSON.parse(text)?.message || text; } catch { /* plain text */ }
    result.failed.push({ who, message: `HTTP ${response.status}: ${message}` });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = new Set();
  const files = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg);
    else files.push(arg);
  }
  const known = new Set(["--sql", "--force", "--restore-auth", "--dry-run", "--into-source-project", "--help"]);
  for (const flag of flags) {
    if (!known.has(flag)) throw new CliError(`Unknown option ${flag}. Run with --help to see the options.`, 2);
  }
  return { flags, files };
}

const USAGE = [
  "Usage:",
  "  node scripts/decrypt-backup.mjs <backup.cnbk> [--sql] [--force]",
  "  node scripts/decrypt-backup.mjs --restore-auth <backup.json> [--dry-run]",
  "",
  "The passphrase comes from BACKUP_PASSPHRASE, or you are asked for it.",
  "See docs/BACKUPS.md for the full restore guide."
].join("\n");

function outputPath(file, suffix) {
  return file.replace(/\.cnbk$/i, "") + suffix;
}

function writeOutput(file, content, force) {
  if (existsSync(file) && !force) {
    throw new CliError(`${file} already exists. Move it somewhere else, or run again with --force to replace it.`);
  }
  writeFileSync(file, content, { mode: 0o600 });
}

// Reads the passphrase without showing it. When the input is piped (not a
// terminal), the first line is used.
async function askPassphrase() {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks = [];
    for await (const chunk of stdin) {
      chunks.push(Buffer.from(chunk));
      if (chunk.includes(10)) break;
    }
    return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0];
  }

  process.stderr.write("Backup passphrase (nothing shows while you type, then press Enter): ");
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          finish();
          // Drop terminal control sequences (arrow keys, paste markers).
          resolve(value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ""));
          return;
        }
        if (ch === "\u0003") {
          finish();
          reject(new CliError("Cancelled. Nothing was written.", 130));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function getPassphrase() {
  const fromEnv = normalizePassphrase(process.env.BACKUP_PASSPHRASE);
  const passphrase = fromEnv || normalizePassphrase(await askPassphrase());
  if (!passphrase) throw new CliError("No passphrase was given, so the backup was not opened. Run the command again and type the passphrase when asked.");
  return passphrase;
}

function summarize(doc, log) {
  const m = doc.manifest;
  log(`Backup taken ${m.createdAt} from ${m.source || "Supabase"} (${m.trigger === "manual" ? "manual run" : "weekly schedule"}).`);
  log(`  sign-in accounts: ${doc.authUsers.length}`);
  for (const name of m.restoreOrder || Object.keys(doc.tables)) {
    log(`  ${name}: ${(doc.tables[name] || []).length}`);
  }
  for (const note of m.notes || []) log(`  note: ${note}`);
}

async function decryptCommand(file, flags, log) {
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) throw new CliError(`Could not find ${resolved}. Check the path and try again.`);
  const data = readFileSync(resolved);
  parseHeader(data);

  const jsonFile = outputPath(resolved, ".json");
  const sqlFile = outputPath(resolved, ".restore.sql");
  if (!flags.has("--force")) {
    for (const target of flags.has("--sql") ? [jsonFile, sqlFile] : [jsonFile]) {
      if (existsSync(target)) throw new CliError(`${target} already exists. Move it somewhere else, or run again with --force to replace it.`);
    }
  }

  const doc = await decryptBackup(data, await getPassphrase());
  writeOutput(jsonFile, JSON.stringify(doc, null, 2) + "\n", flags.has("--force"));
  summarize(doc, log);
  log(`Wrote ${jsonFile}`);
  if (flags.has("--sql")) {
    writeOutput(sqlFile, buildRestoreSql(doc, { sourceFile: resolved }), flags.has("--force"));
    log(`Wrote ${sqlFile}`);
  }
  log("These files hold personal data without encryption. Keep them private and delete them when you are done.");
}

async function restoreAuthCommand(file, flags, log) {
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) throw new CliError(`Could not find ${resolved}. Check the path and try again.`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new CliError(`${resolved} is not readable JSON. Use the .json file this script wrote when it opened the backup.`);
  }
  if (doc?.manifest?.format !== "cybernet-ai-backup" || !Array.isArray(doc.authUsers)) {
    throw new CliError(`${resolved} is not an opened CyberNet AI backup. Use the .json file this script wrote when it opened the backup.`);
  }

  const dryRun = flags.has("--dry-run");
  const url = String(process.env.RESTORE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceKey = String(process.env.RESTORE_SERVICE_ROLE_KEY || "").trim();
  if (!/^https:\/\/[^/]+$/.test(url)) {
    throw new CliError("Set RESTORE_SUPABASE_URL to the NEW project's address (for example https://abcd1234.supabase.co), then run again.");
  }
  if (!serviceKey && !dryRun) {
    throw new CliError("Set RESTORE_SERVICE_ROLE_KEY to the NEW project's service role (or secret) key, then run again. Find it in Supabase under Project Settings, then API Keys.");
  }
  const host = new URL(url).host;
  if (doc.manifest.source && host === doc.manifest.source && !flags.has("--into-source-project")) {
    throw new CliError(`${host} is the project this backup came from. Restore into a new project. If you really mean to put accounts back into the same project, add --into-source-project.`);
  }

  log(`${dryRun ? "Checking" : "Recreating"} ${doc.authUsers.length} sign-in accounts in ${host}...`);
  const result = await restoreAuthUsers(doc, { url, serviceKey, dryRun, log });
  if (dryRun) {
    log(`Dry run: ${result.planned} would be created, ${result.skipped} skipped. Nothing was changed.`);
    return 0;
  }
  log(`Created ${result.created}, already there ${result.existing}, skipped ${result.skipped}, failed ${result.failed.length}.`);
  for (const failure of result.failed) log(`  failed ${failure.who}: ${failure.message}`);
  if (result.failed.length) {
    log("Fix the problem shown above and run the same command again; accounts that were created are not created twice.");
    return 1;
  }
  log("Next: run the .restore.sql file in the new project's SQL Editor (see docs/BACKUPS.md).");
  return 0;
}

export async function main(argv = process.argv.slice(2), { log = (line) => console.log(line) } = {}) {
  const { flags, files } = parseArgs(argv);
  if (flags.has("--help")) {
    log(USAGE);
    return 0;
  }
  if (files.length !== 1) throw new CliError(USAGE, 2);
  if (flags.has("--restore-auth")) return restoreAuthCommand(files[0], flags, log);
  await decryptCommand(files[0], flags, log);
  return 0;
}

function isMainModule() {
  try {
    const self = realpathSync.native(fileURLToPath(import.meta.url));
    const entry = realpathSync.native(path.resolve(process.argv[1] || ""));
    return process.platform === "win32" ? self.toLowerCase() === entry.toLowerCase() : self === entry;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().then(
    (code) => { process.exitCode = code || 0; },
    (error) => {
      if (error instanceof CliError) {
        console.error(error.message);
        process.exitCode = error.exitCode;
      } else {
        console.error("Something unexpected went wrong:", error?.message || error);
        process.exitCode = 1;
      }
    }
  );
}
