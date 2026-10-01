"use strict";
// Phase 17B — Coding Runner Gateway entry point (`npm --prefix runner start`). Configuration (environment of the GATEWAY host
// only — never the SmartAssess app settings):
//     RUNNER_HMAC_KEY         required, ≥ 32 characters, no whitespace; the same value as the SmartAssess API's runner signing key setting
//     RUNNER_HOST             bind address (default 127.0.0.1 — put a TLS-terminating reverse proxy in front for remote use)
//     RUNNER_PORT             default 8787
//     RUNNER_MAX_CONCURRENCY  concurrent sandboxes, clamped to 1..16 (default 2)
//   Phase 17C — official grading jobs (POST /v1/official-grading-jobs) are enabled ONLY when the callback destination is valid:
//     SMARTASSESS_CALLBACK_BASE_URL   https://<SmartAssess host> (fixed destination; never taken from a request)
//     SMARTASSESS_CALLBACK_HMAC_KEY   ≥ 32 characters; a callback-only key (independent of RUNNER_HMAC_KEY)
//     RUNNER_OFFICIAL_MAX_PENDING     queued + running official jobs, clamped to 1..64 (default 8)
//     RUNNER_OFFICIAL_MAX_ACTIVE      official jobs running at once, clamped to 1..4 (default 1)
//     RUNNER_OFFICIAL_CASE_CONCURRENCY hidden cases of one job running at once, clamped to 1..4 (default 2)
//   Phase 17D-B2 — official grading ALSO requires a DURABLE journal (journal.js), else it stays disabled (fail closed):
//     RUNNER_JOURNAL_DIR              absolute path on a PERSISTENT disk of the runner VM (OS disk or a managed data disk) —
//                                     never tmpfs / ramfs / overlay / the Azure temporary resource disk; created 0700, owned by the
//                                     gateway user, one gateway process per directory (journal.lock)
//     RUNNER_JOURNAL_ALLOW_EPHEMERAL  "1" ONLY for local development / tests (reported as "ephemeral-override", never durable)
// The key is held in memory only: it is never logged, echoed, or passed to the docker CLI / a sandbox.
const { createGatewayServer } = require("./server.js");
const { createDockerSandbox } = require("./sandbox.js");
const { createOfficialGradingQueue } = require("./official.js");
const { readCallbackConfig, createCallbackDeliverer } = require("./callback.js");
const { readJournalConfig, createJournal } = require("./journal.js");

const clampInt = (v, lo, hi, dflt) => { const n = Number(v === undefined || v === "" ? dflt : v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : dflt; };

function readGatewayConfig(env, { journalProbe } = {}) {
  const key = typeof env.RUNNER_HMAC_KEY === "string" ? env.RUNNER_HMAC_KEY : "";
  if (key.length < 32 || key.length > 512 || /\s/.test(key)) throw new Error("RUNNER_HMAC_KEY is missing or too weak (≥ 32 characters, no whitespace).");
  const port = Number(env.RUNNER_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("RUNNER_PORT is invalid.");
  const requested = Number(env.RUNNER_MAX_CONCURRENCY || 2);
  const maxConcurrency = Number.isFinite(requested) ? Math.min(16, Math.max(1, Math.floor(requested))) : 2;
  // Review Fix 1 — key separation on the RAW secrets, regardless of the callback URL's validity: equal keys refuse startup.
  const rawCallbackKey = typeof env.SMARTASSESS_CALLBACK_HMAC_KEY === "string" ? env.SMARTASSESS_CALLBACK_HMAC_KEY : "";
  if (rawCallbackKey && rawCallbackKey === key) throw new Error("SMARTASSESS_CALLBACK_HMAC_KEY must differ from RUNNER_HMAC_KEY.");
  const callback = readCallbackConfig(env);
  const journal = journalProbe ? readJournalConfig(env, journalProbe) : readJournalConfig(env);
  const journalState = journal.enabled ? (journal.ephemeral ? "ephemeral-override" : "durable") : journal.reason;
  const official = { enabled: callback.enabled && journal.enabled, journal: journalState, maxPending: clampInt(env.RUNNER_OFFICIAL_MAX_PENDING, 1, 64, 8), maxActive: clampInt(env.RUNNER_OFFICIAL_MAX_ACTIVE, 1, 4, 1), caseConcurrency: clampInt(env.RUNNER_OFFICIAL_CASE_CONCURRENCY, 1, 4, 2) };
  const config = { host: env.RUNNER_HOST || "127.0.0.1", port, maxConcurrency, official };
  Object.defineProperty(config, "key", { value: key, enumerable: false });
  Object.defineProperty(config, "callback", { value: callback, enumerable: false });
  Object.defineProperty(config, "journalDir", { value: journal.enabled ? journal.dir : null, enumerable: false });
  return config;
}

/**
 * Starts ONE gateway: configuration → sandbox sweep → (official grading only with a callback destination AND a durable journal:
 * open the journal, recover it — bounded — and start the official queue) → HTTP. → { server, officialQueue, journal, close }
 */
async function startGateway({ env = process.env, sandbox = createDockerSandbox(), logger = console, journalProbe } = {}) {
  const config = readGatewayConfig(env, { journalProbe });
  const removed = await sandbox.sweep();
  let officialQueue, journal, recovery = null;
  if (config.official.enabled) {
    journal = createJournal({ dir: config.journalDir });
    await journal.open();                                                              // fails closed: lock / owner / permission
    officialQueue = createOfficialGradingQueue({ sandbox, deliver: createCallbackDeliverer({ config: config.callback, logger }).attempt, journal, maxPending: config.official.maxPending, maxActive: config.official.maxActive, caseConcurrency: config.official.caseConcurrency, logger });
    recovery = await officialQueue.start();
  }
  const server = createGatewayServer({ key: config.key, sandbox, maxConcurrency: config.maxConcurrency, officialQueue, logger });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(config.port, config.host, () => { server.off("error", reject); resolve(); }); });
  logger.info(JSON.stringify({ event: "runner.gateway.started", host: config.host, port: config.port, maxConcurrency: config.maxConcurrency, officialGrading: config.official, sweptContainers: removed, ...(recovery ? { recovery: { scanned: recovery.scanned, truncated: recovery.truncated, corrupt: recovery.corrupt, ...recovery.recovered } } : {}) }));
  const close = () => new Promise(resolve => {
    if (officialQueue) officialQueue.stop();
    server.close(async () => { if (journal) await journal.close().catch(() => {}); resolve(); });
  });
  return { server, officialQueue, journal, close };
}

async function main() {
  const gateway = await startGateway();
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { gateway.close().then(() => process.exit(0)); });
}

if (require.main === module) {
  main().catch(e => { console.error(JSON.stringify({ event: "runner.gateway.failed", message: String(e && e.message || e) })); process.exit(1); });
}

module.exports = { readGatewayConfig, startGateway };
