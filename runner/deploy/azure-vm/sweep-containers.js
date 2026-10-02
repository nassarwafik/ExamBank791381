"use strict";
// Phase 17F-A1 — systemd ExecStopPost helper: removes every sandbox container carrying the runner label, using the gateway's
// OWN sweep (sandbox.js) — the same call main.js makes at start-up. Closes the window in which a sleeping student program
// could outlive a stopped gateway until the next start. Never fails the unit stop: exit 0 always; prints a count only.
const path = require("node:path");
const { createDockerSandbox } = require(path.join(__dirname, "..", "..", "gateway", "sandbox.js"));

createDockerSandbox().sweep()
  .then(n => console.log(JSON.stringify({ event: "runner.deploy.swept", containers: n })))
  .catch(() => console.log(JSON.stringify({ event: "runner.deploy.swept", containers: null })))
  .finally(() => process.exit(0));
