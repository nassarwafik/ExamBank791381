"use strict";
// Phase 17D-B2 — a REAL gateway process for the restart tests: the production entry point's startGateway() (configuration,
// journal, startup recovery, official queue, callback deliverer, HTTP server) with ONE substitution — a fake sandbox, so the
// unit suite needs no Docker. Every physical execution appends the job id to FAKE_EXEC_LOG (so executions are counted ACROSS
// processes). The real-Docker variant (tests/docker-official/restart.rtest.js) spawns gateway/main.js itself.
const fs = require("node:fs");
const { startGateway } = require("../../gateway/main.js");

const log = process.env.FAKE_EXEC_LOG;
const delayMs = Number(process.env.FAKE_EXEC_DELAY_MS || 0);
const sandbox = {
  availableLanguages: async () => [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }],
  run: async () => ({ status: "success", stdout: "", stderr: "" }),
  sweep: async () => 0,
  async runOfficialSuite(entry, job) {
    fs.appendFileSync(log, job.jobId + "\n");
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    return { cases: job.cases.map(c => ({ token: c.token, status: "success", stdout: "out-" + c.token + "\n", stderr: "", exitCode: 0, durationMs: 2 })) };
  }
};
startGateway({ env: process.env, sandbox }).catch(e => { console.error(JSON.stringify({ event: "runner.gateway.failed", message: String(e && e.message || e) })); process.exit(1); });
