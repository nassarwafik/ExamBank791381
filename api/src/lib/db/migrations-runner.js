// Phase 15A — ordered, checksummed schema migrations (docs/database-architecture-15.md §5).
//
// Files: api/db/migrations/NNNN_name.sql, applied in file-name order. Batches are separated by lines containing
// only `GO` (the sqlcmd convention; GO is not T-SQL, so the runner splits on it). Each file is applied inside ONE
// transaction together with its row in dbo.schema_migrations — a failing file leaves nothing behind.
//
// An already-applied file whose content changed (checksum drift), or an applied version whose file disappeared,
// stops the run before anything is applied: schema history is append-only; a change is a new file.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_DIR = path.join(__dirname, "..", "..", "..", "db", "migrations");
const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

const MIGRATIONS_TABLE_DDL = `
IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NULL
CREATE TABLE dbo.schema_migrations (
  version     char(4)        NOT NULL CONSTRAINT pk_schema_migrations PRIMARY KEY,
  name        nvarchar(200)  NOT NULL,
  checksum    char(64)       NOT NULL,
  applied_at  datetime2(3)   NOT NULL CONSTRAINT df_schema_migrations_applied_at DEFAULT SYSUTCDATETIME()
);`;

/** SHA-256 of the file text with line endings normalized (a CRLF checkout must not look like drift). */
function checksumOf(text) {
  return crypto.createHash("sha256").update(String(text).replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/** Splits a script on `GO` separator lines; drops batches that contain only whitespace and comments. */
function splitBatches(text) {
  const batches = [];
  let current = [];
  for (const line of String(text).replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*GO\s*;?\s*$/i.test(line)) { batches.push(current.join("\n")); current = []; }
    else current.push(line);
  }
  batches.push(current.join("\n"));
  return batches
    .map(b => b.trim())
    .filter(b => b.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim() !== "");
}

/** Reads and validates the migration files of a directory, sorted by version. */
function loadMigrationFiles(dir = DEFAULT_DIR) {
  const names = fs.readdirSync(dir).filter(n => n.endsWith(".sql")).sort();
  const files = [];
  const seen = new Set();
  for (const name of names) {
    const m = FILE_PATTERN.exec(name);
    if (!m) throw new Error("Invalid migration file name: " + name + " (expected NNNN_lower_snake.sql)");
    if (seen.has(m[1])) throw new Error("Duplicate migration version: " + m[1]);
    seen.add(m[1]);
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    files.push({ version: m[1], name, checksum: checksumOf(text), batches: splitBatches(text) });
  }
  return files;
}

/**
 * Pure plan: which files are pending, and whether history is consistent.
 * applied = [{ version, name, checksum }] from dbo.schema_migrations.
 */
function planMigrations(files, applied) {
  const byVersion = new Map(files.map(f => [f.version, f]));
  const drift = [];
  const missing = [];
  const appliedVersions = new Set();
  for (const row of applied || []) {
    const version = String(row.version).trim();
    appliedVersions.add(version);
    const file = byVersion.get(version);
    if (!file) missing.push(version);
    else if (String(row.checksum).trim() !== file.checksum) drift.push(version);
  }
  const pending = files.filter(f => !appliedVersions.has(f.version));
  // A pending file older than the newest applied one means history was rewritten (or a merge reordered files).
  const newestApplied = [...appliedVersions].sort().pop() || "";
  const outOfOrder = pending.filter(f => f.version < newestApplied).map(f => f.version);
  return { pending, drift, missing, outOfOrder, ok: drift.length === 0 && missing.length === 0 && outOfOrder.length === 0 };
}

async function ensureMigrationsTable(pool) {
  await pool.request().batch(MIGRATIONS_TABLE_DDL);
}

async function migrationsTableExists(pool) {
  const r = await pool.request().query("SELECT OBJECT_ID(N'dbo.schema_migrations', N'U') AS id");
  return r.recordset[0].id !== null && r.recordset[0].id !== undefined;
}

async function readApplied(pool) {
  const r = await pool.request().query("SELECT version, name, checksum FROM dbo.schema_migrations ORDER BY version");
  return r.recordset;
}

async function applyFile(pool, file, sqlLib) {
  const tx = new sqlLib.Transaction(pool);
  await tx.begin();
  try {
    for (const batch of file.batches) await new sqlLib.Request(tx).batch(batch);
    await new sqlLib.Request(tx)
      .input("version", sqlLib.Char(4), file.version)
      .input("name", sqlLib.NVarChar(200), file.name)
      .input("checksum", sqlLib.Char(64), file.checksum)
      .query("INSERT INTO dbo.schema_migrations (version, name, checksum) VALUES (@version, @name, @checksum)");
    await tx.commit();
  } catch (error) {
    try { await tx.rollback(); } catch { /* already rolled back by the server */ }
    error.message = "Migration " + file.name + " failed: " + error.message;
    throw error;
  }
}

/**
 * Applies every pending migration. { dryRun: true } only reports the plan and changes nothing (not even the
 * bookkeeping table). Returns { applied: [names], plan }. Throws before applying anything if the plan is not ok.
 */
async function migrate(pool, { dir = DEFAULT_DIR, dryRun = false, sqlLib = require("mssql"), log = () => {} } = {}) {
  const files = loadMigrationFiles(dir);
  let history;
  if (dryRun) history = (await migrationsTableExists(pool)) ? await readApplied(pool) : [];
  else { await ensureMigrationsTable(pool); history = await readApplied(pool); }
  const plan = planMigrations(files, history);
  if (!plan.ok) {
    const parts = [];
    if (plan.drift.length) parts.push("changed after being applied: " + plan.drift.join(", "));
    if (plan.missing.length) parts.push("applied but missing from disk: " + plan.missing.join(", "));
    if (plan.outOfOrder.length) parts.push("pending but older than the newest applied: " + plan.outOfOrder.join(", "));
    throw new Error("Migration history is inconsistent — " + parts.join("; "));
  }
  const applied = [];
  if (dryRun) return { applied, plan };
  for (const file of plan.pending) {
    log("applying " + file.name + " (" + file.batches.length + " batches)");
    await applyFile(pool, file, sqlLib);
    applied.push(file.name);
  }
  return { applied, plan };
}

module.exports = {
  DEFAULT_DIR,
  checksumOf,
  splitBatches,
  loadMigrationFiles,
  planMigrations,
  migrate
};
