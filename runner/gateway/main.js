"use strict";
// Phase 17B — Coding Runner Gateway entry point (`npm --prefix runner start`). Configuration (environment of the GATEWAY host
// only — never the SmartAssess app settings):
//     RUNNER_HMAC_KEY         required, ≥ 32 characters, no whitespace; the same value as the SmartAssess API's runner signing key setting
//     RUNNER_HOST             bind address (default 127.0.0.1 — put a TLS-terminating reverse proxy in front for remote use)
//     RUNNER_PORT             default 8787
//     RUNNER_MAX_CONCURRENCY  concurrent sandboxes, clamped to 1..16 (default 2)
// The key is held in memory only: it is never logged, echoed, or passed to the docker CLI / a sandbox.
const { createGatewayServer } = require("./server.js");
const { createDockerSandbox } = require("./sandbox.js");

function readGatewayConfig(env) {
  const key = typeof env.RUNNER_HMAC_KEY === "string" ? env.RUNNER_HMAC_KEY : "";
  if (key.length < 32 || key.length > 512 || /\s/.test(key)) throw new Error("RUNNER_HMAC_KEY is missing or too weak (≥ 32 characters, no whitespace).");
  const port = Number(env.RUNNER_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("RUNNER_PORT is invalid.");
  const requested = Number(env.RUNNER_MAX_CONCURRENCY || 2);
  const maxConcurrency = Number.isFinite(requested) ? Math.min(16, Math.max(1, Math.floor(requested))) : 2;
  const config = { host: env.RUNNER_HOST || "127.0.0.1", port, maxConcurrency };
  Object.defineProperty(config, "key", { value: key, enumerable: false });
  return config;
}

async function main() {
  const config = readGatewayConfig(process.env);
  const sandbox = createDockerSandbox();
  const removed = await sandbox.sweep();
  const server = createGatewayServer({ key: config.key, sandbox, maxConcurrency: config.maxConcurrency });
  server.listen(config.port, config.host, () => {
    console.info(JSON.stringify({ event: "runner.gateway.started", host: config.host, port: config.port, maxConcurrency: config.maxConcurrency, sweptContainers: removed }));
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
}

if (require.main === module) {
  main().catch(e => { console.error(JSON.stringify({ event: "runner.gateway.failed", message: String(e && e.message || e) })); process.exit(1); });
}

module.exports = { readGatewayConfig };
