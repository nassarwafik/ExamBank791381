// Phase 15A — Azure SQL client (docs/database-architecture-15.md §8).
//
// One lazily created connection pool per Functions worker process, reused across invocations. Nothing in the API
// calls this module yet: in 15A it is used only by the operator scripts (api/scripts/db-migrate.js, db-backfill.js)
// and the CI integration tests. When AZURE_SQL_CONNECTION_STRING is not set, the database is simply "not-configured"
// and no code path touches the network.
//
// Serverless Azure SQL auto-pauses when idle. The first connection after a pause waits while the database resumes,
// which can take longer than the driver's default 15 s. While resuming, the login fails with error 40613 ("database
// … is not currently available"); tedious recognizes that as transient and retries the login itself, but by default
// only 3 times, 500 ms apart — far shorter than a resume. So:
//   - the connection timeout is raised to 60 s (unless the connection string sets a longer one);
//   - tedious retries a transient login failure up to 6 times, 10 s apart;
//   - if the connect still fails transiently, this module retries the whole connect once.
// This suits the operator scripts. An HTTP request cannot wait that long (see docs §8): 15B decides how the API
// handles a paused database.

const ENV_NAME = "AZURE_SQL_CONNECTION_STRING";
const MIN_CONNECT_TIMEOUT_MS = 60000;
const DEFAULT_POOL_MAX = 5;
// 40613 database not currently available (resuming), 40197 / 40501 service busy / error processing, 49918-49920
// not enough resources, 4060 cannot open database (still resuming), -2 / ETIMEOUT connection timeout.
const TRANSIENT_NUMBERS = new Set([40613, 40197, 40501, 49918, 49919, 49920, 4060, -2]);

let sqlModule = null;
function sql() {
  if (!sqlModule) sqlModule = require("mssql");
  return sqlModule;
}

function isDatabaseConfigured(env = process.env) {
  return String(env[ENV_NAME] || "").trim() !== "";
}

/** Driver configuration from a connection string, with the serverless-friendly defaults above. */
function buildPoolConfig(connectionString, overrides = {}) {
  const cs = String(connectionString || "").trim();
  if (!cs) throw new Error(ENV_NAME + " is not configured.");
  const parsed = sql().ConnectionPool.parseConnectionString(cs);
  const options = { encrypt: true, maxRetriesOnTransientErrors: 6, connectionRetryInterval: 10000, ...(parsed.options || {}), ...(overrides.options || {}) };
  return {
    ...parsed,
    ...overrides,
    options,
    connectionTimeout: Math.max(Number(parsed.connectionTimeout) || 0, MIN_CONNECT_TIMEOUT_MS),
    pool: { max: DEFAULT_POOL_MAX, min: 0, idleTimeoutMillis: 30000, ...(parsed.pool || {}), ...(overrides.pool || {}) }
  };
}

function isTransientConnectError(error) {
  if (!error) return false;
  const numbers = [error.number, error.originalError?.number, error.originalError?.info?.number, error.info?.number];
  if (numbers.some(n => TRANSIENT_NUMBERS.has(Number(n)))) return true;
  const code = String(error.code || error.originalError?.code || "");
  if (code === "ETIMEOUT" || code === "ESOCKET") return true;
  // tedious reports login failures as ELOGIN without the server error number; 40613 is recognizable by its text.
  const message = String(error.message || "") + " " + String(error.originalError?.message || "");
  return code === "ELOGIN" && /not currently available|is being resumed|resuming/i.test(message);
}

async function connectWithRetry(config, deps = {}) {
  const create = deps.createPool || (cfg => new (sql().ConnectionPool)(cfg));
  const wait = deps.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  try {
    return await create(config).connect();
  } catch (error) {
    if (!isTransientConnectError(error)) throw error;
    await wait(deps.retryDelayMs ?? 5000);
    return create(config).connect();
  }
}

let poolPromise = null;

/** The shared pool for this process (created on first use). */
function getPool(env = process.env, deps = {}, overrides = {}) {
  if (!poolPromise) {
    const config = buildPoolConfig(env[ENV_NAME], overrides);
    poolPromise = connectWithRetry(config, deps).catch(error => {
      poolPromise = null; // a later call may try again
      throw error;
    });
  }
  return poolPromise;
}

async function closePool() {
  const pending = poolPromise;
  poolPromise = null;
  if (pending) {
    try { (await pending).close(); } catch { /* already closed or never opened */ }
  }
}

/** Runs fn(transaction) inside one transaction; commits on success, rolls back on any error. */
async function withTransaction(pool, fn) {
  const tx = new (sql().Transaction)(pool);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try { await tx.rollback(); } catch { /* the server may already have rolled back */ }
    throw error;
  }
}

/** A cheap connectivity probe for operators: { state: "not-configured" | "ok" | "error", ... }. */
async function databaseStatus(env = process.env, deps = {}, overrides = {}) {
  if (!isDatabaseConfigured(env)) return { state: "not-configured" };
  try {
    const pool = await getPool(env, deps, overrides);
    const r = await pool.request().query("SELECT DB_NAME() AS database_name, SYSUTCDATETIME() AS server_time");
    const row = r.recordset[0] || {};
    return { state: "ok", database: row.database_name, serverTime: row.server_time };
  } catch (error) {
    return { state: "error", message: String(error?.message || error) };
  }
}

module.exports = {
  ENV_NAME,
  MIN_CONNECT_TIMEOUT_MS,
  sql,
  isDatabaseConfigured,
  buildPoolConfig,
  isTransientConnectError,
  connectWithRetry,
  getPool,
  closePool,
  withTransaction,
  databaseStatus
};
