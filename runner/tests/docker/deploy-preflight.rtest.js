"use strict";
// Phase 17F-A1 — the deployment gate and the operator smoke tool against the REAL Docker daemon and the REAL worker images
// (a missing daemon / image FAILS — nothing is skipped):
//   DP1  preflight --mode=verify-sandbox: every container control holds inside REAL hardened sandboxes (python report: uid 10001,
//        no capabilities, no-new-privileges, seccomp, read-only rootfs, network none, no host mounts, no docker socket,
//        pids / memory / cpu bounded; java + csharp compile and run)
//   DP2  a Docker daemon that is unreachable (the real CLI against a missing socket) → exit 30, no sandbox attempted
//   DP3  smoke.js against a REAL gateway with REAL sandboxes: surface, security, the pilot language matrix and the sandbox
//        boundary probes all pass; nothing is left behind
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const P = require("../../deploy/azure-vm/preflight.js");
const smoke = require("../../deploy/azure-vm/smoke.js");
const { createGatewayServer } = require("../../gateway/server.js");
const { createDockerSandbox } = require("../../gateway/sandbox.js");

const KEY_A = crypto.randomBytes(32).toString("hex"), KEY_B = crypto.randomBytes(32).toString("hex");
const leftovers = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();

function devEnv(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-preflight-"));
  fs.chmodSync(dir, 0o700);
  return { ...process.env, RUNNER_HMAC_KEY: KEY_A, SMARTASSESS_CALLBACK_HMAC_KEY: KEY_B, SMARTASSESS_CALLBACK_BASE_URL: "http://127.0.0.1:7071", RUNNER_JOURNAL_DIR: dir, RUNNER_JOURNAL_ALLOW_EPHEMERAL: "1", RUNNER_MAX_CONCURRENCY: "1", RUNNER_HOST: "127.0.0.1", RUNNER_PORT: "8787", ...over };
}

test("DP1 — verify-sandbox: every container control holds in REAL sandboxes for all three toolchains", { timeout: 300000 }, async () => {
  const r = await P.runPreflight({ env: devEnv(), mode: "verify-sandbox", profile: "development", options: { minFreePercent: 1, minJournalFreeMb: 64, minDockerFreeMb: 64 } });
  const sandbox = r.results.filter(x => x.id === "sandbox");
  assert.equal(sandbox.length, 3);
  assert.deepEqual(sandbox.filter(x => x.status !== "pass"), [], JSON.stringify(sandbox));
  assert.match(sandbox[0].reason, /uid 10001.*network none.*no host mounts.*no docker socket/);
  const docker = r.results.find(x => x.id === "docker");
  assert.equal(docker.status, "pass", docker.reason);
  assert.equal(r.results.find(x => x.id === "images").status, "pass");
  assert.equal(leftovers(), "", "no sandbox container left behind");
});

test("DP2 — an unreachable Docker daemon (real CLI, missing socket) fails the gate with exit 30 and starts nothing", { timeout: 60000 }, async () => {
  const r = await P.runPreflight({ env: devEnv({ DOCKER_HOST: "unix:///nonexistent/docker.sock" }), mode: "start", profile: "development", options: { minFreePercent: 1, minJournalFreeMb: 64 } });
  assert.equal(r.exitCode, P.EXIT.DOCKER);
  assert.match(r.results.find(x => x.id === "docker").reason, /unreachable/);
  assert.ok(!r.results.some(x => x.id === "sandbox" || x.id === "images"));
});

test("DP3 — smoke.js against a REAL gateway + REAL sandboxes: surface, security, pilot language matrix, sandbox boundary", { timeout: 600000 }, async () => {
  const server = createGatewayServer({ key: KEY_A, sandbox: createDockerSandbox(), maxConcurrency: 1, officialQueue: { submit: async () => ({ status: "busy" }) }, logger: { info() {}, warn() {} } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    const out = await smoke.smokeRunner({ baseUrl: "http://127.0.0.1:" + server.address().port, key: KEY_A });
    assert.deepEqual(out.filter(c => !c.ok), []);
    assert.equal(out.filter(c => c.id.startsWith("practice:")).length, 14, "4 python + 5 java + 5 csharp rows");
    assert.equal(out.filter(c => c.id.startsWith("sandbox:")).length, 5, "staging-only pressure probes are not run by default");
  } finally { await new Promise(r => server.close(r)); }
  assert.equal(leftovers(), "", "no sandbox container left behind");
});
