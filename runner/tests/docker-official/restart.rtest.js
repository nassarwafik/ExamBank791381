"use strict";
// Phase 17D-B2 — REAL restart proof through the production entry point (runner/gateway/main.js) with the REAL Docker sandbox
// (requires Docker + the built worker images; nothing is skipped):
//   D1 a job executes, its callback keeps failing, the gateway process is SIGKILLed after execution; the restarted gateway
//      (same RUNNER_JOURNAL_DIR) calls back the DURABLE result — student code is NOT executed again.
//   D2 a job is accepted while another one is running; the process is SIGKILLed; the restarted gateway runs the waiting job
//      once and re-runs the interrupted one; every job is called back once; no sandbox container is left behind.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { signRequest } = require("../../gateway/auth.js");

const KEY = "test-only-runner-hmac-key-restart-0123456789";            // TEST keys — never real secrets
const CB_KEY = "test-only-callback-hmac-key-restart-9876543210";
const LIMITS = { timeMs: 3000, memoryMb: 128, outputBytes: 17408 };
const MAIN = path.join(__dirname, "..", "..", "gateway", "main.js");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const orphans = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
async function waitFor(fn, timeoutMs = 60000) { const until = Date.now() + timeoutMs; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > until) throw new Error("waitFor timed out"); await sleep(50); } }
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });

async function callbackServer() {
  const st = { mode: "ok", bodies: new Map(), requests: 0 };
  const server = http.createServer((req, res) => {
    const parts = [];
    req.on("data", d => parts.push(d));
    req.on("end", () => {
      st.requests++;
      const raw = Buffer.concat(parts), h = req.headers;
      const canonical = ["SA-CODING-CALLBACK-1", "POST", "/api/coding/grade-callback", h["x-sa-callback-timestamp"], h["x-sa-callback-request-id"], crypto.createHash("sha256").update(raw).digest("hex")].join("\n");
      if ("v1=" + crypto.createHmac("sha256", Buffer.from(CB_KEY, "utf8")).update(canonical, "utf8").digest("hex") !== h["x-sa-callback-signature"]) { res.writeHead(401); res.end("{}"); return; }
      if (st.mode === "fail") { res.writeHead(503); res.end("{}"); return; }
      const body = JSON.parse(raw.toString("utf8"));
      const already = st.bodies.has(body.jobId);
      if (!already) st.bodies.set(body.jobId, body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(already ? { ok: true, alreadyApplied: true } : { ok: true, applied: true, state: "complete" }));
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  st.port = server.address().port;
  st.close = () => new Promise(r => server.close(r));
  return st;
}
async function startGateway(env) {
  const child = spawn(process.execPath, [MAIN], { env: { PATH: process.env.PATH, HOME: process.env.HOME || os.homedir(), ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}), ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", d => { out += d.toString("utf8"); });
  child.stderr.on("data", d => { out += d.toString("utf8"); });
  await waitFor(() => /runner\.gateway\.started/.test(out) || child.exitCode !== null, 30000);
  if (child.exitCode !== null) throw new Error("gateway exited: " + out.slice(0, 500));
  child.events = () => out.split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return child;
}
const kill9 = child => new Promise(r => { if (!child || child.exitCode !== null || child.signalCode !== null) return r(); child.once("exit", () => r()); child.kill("SIGKILL"); });
function postJob(port, body) {
  const raw = Buffer.from(JSON.stringify(body));
  const headers = { "content-type": "application/json", "content-length": String(raw.length), ...signRequest({ key: KEY, method: "POST", path: "/v1/official-grading-jobs", timestamp: String(Math.floor(Date.now() / 1000)), requestId: "dr_" + crypto.randomBytes(9).toString("hex"), body: raw }) };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/v1/official-grading-jobs", headers }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(p).toString("utf8") || "null") })); });
    req.on("error", reject); req.end(raw);
  });
}
async function envFor(cb) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-b2-docker-journal-"));
  return { dir, env: { RUNNER_HMAC_KEY: KEY, RUNNER_HOST: "127.0.0.1", RUNNER_PORT: String(await freePort()), SMARTASSESS_CALLBACK_BASE_URL: "http://127.0.0.1:" + cb.port, SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY, RUNNER_JOURNAL_DIR: dir, RUNNER_JOURNAL_ALLOW_EPHEMERAL: "1", RUNNER_OFFICIAL_MAX_ACTIVE: "1" } };
}
const started = (child, jobId) => child.events().filter(e => e.event === "coding.runner.execution.started" && e.jobId === jobId).length;
const rec = (dir, jobId) => readJson(path.join(dir, "jobs", jobId + ".json"));

test("D1 real main.js + Docker: SIGKILL after execution while the callback fails → the restarted gateway calls back from the journal, no re-execution", async () => {
  const cb = await callbackServer();
  cb.mode = "fail";
  const { dir, env } = await envFor(cb);
  const job = { jobId: "cg_b2dockerrestart000001", language: "python", languageVersion: 1, source: "a, b = map(int, input().split())\nprint('SUM=' + str(a + b))\n", cases: [{ token: "c01", stdin: "1 2\n" }, { token: "c02", stdin: "5 5\n" }], limits: LIMITS };
  let g1 = null, g2 = null;
  try {
    g1 = await startGateway(env);
    assert.equal((await postJob(Number(env.RUNNER_PORT), job)).status, 202);
    await waitFor(() => { const r = rec(dir, job.jobId); return r && r.state === "executed" && r.callback.attempts >= 1; });
    assert.equal(started(g1, job.jobId), 1);
    await kill9(g1);
    cb.mode = "ok";
    g2 = await startGateway(env);
    await waitFor(() => (rec(dir, job.jobId) || {}).state === "confirmed");
    assert.equal(started(g2, job.jobId), 0);                                                 // NOT executed again
    assert.deepEqual(cb.bodies.get(job.jobId).cases.map(c => [c.token, c.status, c.stdout]), [["c01", "success", "SUM=3\n"], ["c02", "success", "SUM=10\n"]]);
    assert.equal(orphans(), "");
  } finally { await kill9(g1); await kill9(g2); await cb.close(); }
});

test("D2 real main.js + Docker: SIGKILL with one job running and one waiting → both finish after restart, the waiting one executes once", async () => {
  const cb = await callbackServer();
  const { dir, env } = await envFor(cb);
  const slow = { jobId: "cg_b2dockerrestart000002", language: "python", languageVersion: 1, source: "import time\ntime.sleep(2.5)\nprint(input())\n", cases: [{ token: "c01", stdin: "slow\n" }], limits: LIMITS };
  const waiting = { jobId: "cg_b2dockerrestart000003", language: "python", languageVersion: 1, source: "print(input()[::-1])\n", cases: [{ token: "c01", stdin: "abc\n" }], limits: LIMITS };
  let g1 = null, g2 = null;
  try {
    g1 = await startGateway(env);
    assert.equal((await postJob(Number(env.RUNNER_PORT), slow)).status, 202);
    assert.equal((await postJob(Number(env.RUNNER_PORT), waiting)).status, 202);
    await waitFor(() => (rec(dir, slow.jobId) || {}).state === "running" && (rec(dir, waiting.jobId) || {}).state === "received");
    await kill9(g1);
    g2 = await startGateway(env);
    await waitFor(() => (rec(dir, slow.jobId) || {}).state === "confirmed" && (rec(dir, waiting.jobId) || {}).state === "confirmed");
    assert.equal(started(g1, waiting.jobId) + started(g2, waiting.jobId), 1);
    assert.equal(rec(dir, slow.jobId).interruptions, 1);
    assert.equal(cb.bodies.get(waiting.jobId).cases[0].stdout, "cba\n");
    assert.equal(cb.bodies.get(slow.jobId).cases[0].stdout, "slow\n");
    await waitFor(() => orphans() === "", 30000);                                             // the killed run's container is swept on start
  } finally { await kill9(g1); await kill9(g2); await cb.close(); }
});
