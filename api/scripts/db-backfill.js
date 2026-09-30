#!/usr/bin/env node
// Phase 15A — first load of the legacy platform data into the database (docs/database-architecture-15.md §6).
//
// DRY RUN (default) — reads Blob Storage only (AZURE_STORAGE_CONNECTION_STRING), changes nothing anywhere, and
// writes a report: row counts per table and every anomaly by blob name. The report holds ids and blob names only
// (no names, codes, identity numbers or password material), so it can be shared for review.
//
//   node api/scripts/db-backfill.js [--dry-run] --school-name "البطوف الشاملة - عرابة" [--school-id <id>]
//        [--ministry-code <n>] [--teacher-code <BUILDER_USER_CODE>] [--teacher-user-id <id>] [--out report.json]
//
// Keep reports out of the repository (the default name is git-ignored; a custom --out path may not be).
//
// APPLY — additionally needs AZURE_SQL_CONNECTION_STRING; refuses when the report has blocking anomalies, when a
// migration is pending, or when any target table already has rows. Loads everything in ONE transaction.
//
//   node api/scripts/db-backfill.js ... --apply
//
// The teacher code defaults to BUILDER_USER_CODE. Ids of the school and teacher default to new UUIDs; pass the same
// ids again when re-running a dry run you want to compare.

const fs = require("fs");
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");
const { readLegacyPlatform } = require("../src/lib/db-migration/legacy-reader");
const { TABLES, transformLegacy, validateRowsAgainstCatalog, summarize } = require("../src/lib/db-migration/legacy-transform");
const { loadSchemaCatalog } = require("../src/lib/db/schema-catalog");

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") { args.apply = true; continue; }
    if (a === "--dry-run") { args.dryRun = true; continue; }
    if (!a.startsWith("--")) throw new Error("Unexpected argument: " + a);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error("Missing value for " + a);
    args[a.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = value;
    i++;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply && args.dryRun) throw new Error("--apply and --dry-run are mutually exclusive.");
  const storage = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!storage) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  if (!args.schoolName) throw new Error("--school-name is required.");
  const teacherCode = args.teacherCode || process.env.BUILDER_USER_CODE;
  if (!teacherCode) throw new Error("--teacher-code (or BUILDER_USER_CODE) is required.");

  const container = BlobServiceClient.fromConnectionString(storage).getContainerClient("bank");
  console.log("reading blobs (read-only)…");
  const legacy = await readLegacyPlatform(container);

  const catalog = loadSchemaCatalog();
  const result = transformLegacy(legacy, {
    school: { schoolId: args.schoolId || crypto.randomUUID(), name: args.schoolName, ministryCode: args.ministryCode },
    teacher: { userId: args.teacherUserId || crypto.randomUUID(), loginCode: teacherCode },
    now: new Date().toISOString()
  });
  result.anomalies.push(...validateRowsAgainstCatalog(result.tables, catalog));
  const summary = summarize(result);
  const report = { generatedAt: new Date().toISOString(), mode: args.apply ? "apply" : "dry-run", summary, anomalies: result.anomalies };

  const out = args.out || "db-backfill-report.json";
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("full report: " + out);

  if (!args.apply) return;
  if (summary.blocking > 0) throw new Error(summary.blocking + " blocking anomalies — fix them first (see the report). Nothing was written.");

  const { getPool, closePool, isDatabaseConfigured, ENV_NAME } = require("../src/lib/db/sql-client");
  const { migrate } = require("../src/lib/db/migrations-runner");
  const { loadIntoEmptyDatabase } = require("../src/lib/db-migration/sql-loader");
  if (!isDatabaseConfigured()) throw new Error(ENV_NAME + " is not set.");
  try {
    const pool = await getPool(process.env, {}, { requestTimeout: 300000 });
    const { plan } = await migrate(pool, { dryRun: true });
    if (plan.pending.length) throw new Error("Pending migrations: " + plan.pending.map(f => f.name).join(", ") + ". Run db-migrate.js apply first.");
    const { verified } = await loadIntoEmptyDatabase(pool, result.tables, catalog, TABLES, { log: m => console.log("  " + m) });
    console.log("loaded and verified: " + JSON.stringify(verified));
  } finally {
    await closePool();
  }
}

// SQL Server constraint errors quote the offending key value (a student code / identity number). Print only the
// error number and the constraint kind for those, so a terminal log is as shareable as the report.
function safeMessage(error) {
  const n = Number(error?.number ?? error?.originalError?.info?.number);
  if ([2627, 2601].includes(n)) return "unique constraint violation (SQL error " + n + "); the key value is withheld. Nothing was written.";
  if (n === 547) return "foreign key / check constraint violation (SQL error 547); details withheld. Nothing was written.";
  return String(error?.message || error);
}

main().catch(error => { console.error("db-backfill: " + safeMessage(error)); process.exitCode = 1; });
