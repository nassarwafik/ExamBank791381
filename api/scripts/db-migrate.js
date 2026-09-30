#!/usr/bin/env node
// Phase 15A — apply the schema migrations in api/db/migrations to the database in AZURE_SQL_CONNECTION_STRING.
//
//   node api/scripts/db-migrate.js            status: connectivity + pending migrations (read-only)
//   node api/scripts/db-migrate.js apply      apply every pending migration (one transaction per file)
//
// Run by an operator (or CI) — never on Functions startup.

const { getPool, closePool, databaseStatus, isDatabaseConfigured, ENV_NAME } = require("../src/lib/db/sql-client");
const { migrate } = require("../src/lib/db/migrations-runner");

async function main() {
  const mode = process.argv[2] || "status";
  if (!["status", "apply"].includes(mode)) throw new Error("Usage: db-migrate.js [status|apply]");
  if (!isDatabaseConfigured()) throw new Error(ENV_NAME + " is not set.");
  const overrides = { requestTimeout: 300000 }; // DDL on a just-resumed serverless database can be slow
  const status = await databaseStatus(process.env, {}, overrides);
  if (status.state !== "ok") throw new Error("Database not reachable: " + (status.message || status.state));
  console.log("database: " + status.database);
  const pool = await getPool(process.env, {}, overrides);
  const { applied, plan } = await migrate(pool, { dryRun: mode === "status", log: m => console.log(m) });
  if (mode === "status") console.log("pending: " + (plan.pending.map(f => f.name).join(", ") || "none"));
  else console.log("applied: " + (applied.join(", ") || "nothing (up to date)"));
}

main()
  .then(() => closePool())
  .catch(async error => { console.error("db-migrate: " + error.message); await closePool(); process.exitCode = 1; });
