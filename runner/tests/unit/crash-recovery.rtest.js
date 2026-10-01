"use strict";
// Phase 17D-B2 — CRASH RECOVERY of official grading jobs inside the Coding Runner Gateway (node:test, no Docker).
// Every accepted job is journaled DURABLY (RUNNER_JOURNAL_DIR, file per job, atomic rename) before the 202; a restart reloads the
// journal and resumes exactly what is safe: RECEIVED → execute, RUNNING (its process died) → interrupted, re-run (bounded),
// EXECUTED (result durable, callback pending) → callback retry ONLY, never a re-execution; CONFIRMED → nothing.
// Guarantees: at-least-once delivery + idempotent job identity (jobId + payload hash, signed revision ordering per opaque
// target) + ONE official authority (the SmartAssess attempt). Physical execution happens at most once per job unless the
// gateway process dies DURING execution (then it is re-run, bounded); the official grade is applied at most once (API).
// Restarts are simulated in-process (a stopped instance + a new journal / queue over the same directory) AND with REAL gateway
// processes killed with SIGKILL (RR1–RR3, through the production startGateway()).
// Fail-first on a6e26ac: there is no journal (gateway/journal.js), no startGateway(), and every job state is RAM-only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const H = require("../helpers/durable.js");

const { job, boot, crash, fakeSandbox, fakeApi, latch, recordOf, waitFor, sleep, tmpJournalDir, TARGET, FAST, capture } = H;
const states = (dir, ids) => ids.map(id => (recordOf(dir, id) || {}).state);

test("CR1r a delivery that cannot be journaled is NOT accepted (no 202, nothing runs); a later delivery is accepted and runs once", async () => {
  const dir = tmpJournalDir();
  const h = await boot(dir);
  const real = h.journal.writeRecord;
  h.journal.writeRecord = async () => { throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }); };
  const r = await h.q.submit(job(1));
  assert.equal(r.status, "busy");                                                            // the API keeps the target retryable
  await h.q.idle();
  assert.equal(h.sandbox.count(job(1).jobId), 0);
  assert.equal(recordOf(dir, job(1).jobId), null);
  h.journal.writeRecord = real;
  assert.equal((await h.q.submit(job(1))).status, "accepted");
  await h.q.idle();
  assert.equal(h.sandbox.count(job(1).jobId), 1);
  assert.equal(h.api.attempts(job(1).jobId), 1);
  assert.equal(recordOf(dir, job(1).jobId).state, "confirmed");
  await crash(h);
});

test("CR2 crash after the runner accepted a job but before it started: after restart it runs exactly once and is called back once", async () => {
  const dir = tmpJournalDir(), hold = latch();
  const a = job(1), b = job(2);
  const h1 = await boot(dir, { sandbox: fakeSandbox(async j => { if (j.jobId === a.jobId) await hold.promise; }) });
  assert.equal((await h1.q.submit(a)).status, "accepted");
  assert.equal((await h1.q.submit(b)).status, "accepted");
  await waitFor(() => states(dir, [a.jobId, b.jobId]).join() === "running,received");
  assert.ok(fs.existsSync(path.join(dir, "inputs", b.jobId + ".json")));                      // the input survives for the restart
  await crash(h1);
  const log = capture();
  const h2 = await boot(dir, { logger: log });
  await h2.q.idle();
  assert.equal(h1.sandbox.count(b.jobId), 0);
  assert.equal(h2.sandbox.count(b.jobId), 1);                                                 // exactly once overall
  assert.equal(h2.api.attempts(b.jobId), 1);
  assert.equal(recordOf(dir, b.jobId).state, "confirmed");
  assert.ok(h2.summary.recovered.received >= 1);
  assert.ok(log.events().some(e => e.event === "coding.runner.execution.resumed"));
  assert.equal(fs.existsSync(path.join(dir, "inputs", b.jobId + ".json")), false);            // inputs are deleted once the result is durable
  hold.open();
  await crash(h2);
});

test("CR3 crash DURING execution: marked interrupted and re-run (no fake continuation); one callback; a job that keeps killing the runner ends as a TECHNICAL failure", async () => {
  const dir = tmpJournalDir(), a = job(3);
  const hang = () => fakeSandbox(() => new Promise(() => {}));
  const h1 = await boot(dir, { sandbox: hang() });
  await h1.q.submit(a);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "running");
  await crash(h1);
  const log = capture();
  const h2 = await boot(dir, { logger: log });
  await h2.q.idle();
  const rec = recordOf(dir, a.jobId);
  assert.equal(rec.state, "confirmed");
  assert.equal(rec.interruptions, 1);
  assert.equal(h2.sandbox.count(a.jobId), 1);                                                 // physically re-run once after the crash
  assert.equal(h2.api.calls.length, 1);                                                      // ONE callback → at most one official application
  assert.equal(h2.api.calls[0].outcome, "completed");
  assert.ok(log.events().some(e => e.event === "coding.runner.execution.interrupted"));
  await crash(h2);
  // a poison job: the runner dies during it every time → bounded re-runs, then a technical outcome (never a zero, never a loop)
  const dir2 = tmpJournalDir(), p = job(4);
  let h = await boot(dir2, { sandbox: hang() });
  await h.q.submit(p);
  for (let i = 0; i < 3; i++) {
    await waitFor(() => (recordOf(dir2, p.jobId) || {}).state === "running");
    await crash(h);
    h = await boot(dir2, { sandbox: hang() });
  }
  await h.q.idle();
  const poison = recordOf(dir2, p.jobId);
  assert.equal(poison.state, "confirmed");
  assert.equal(poison.outcome, "failed");
  assert.equal(poison.technicalCode, "RUNNER_INTERRUPTED");
  assert.equal(h.sandbox.count(p.jobId), 0);                                                  // the last instance does not run it again
  assert.deepEqual({ outcome: h.api.calls[0].outcome, technicalCode: h.api.calls[0].technicalCode, cases: h.api.calls[0].cases }, { outcome: "failed", technicalCode: "RUNNER_INTERRUPTED", cases: [] });
  await crash(h);
});

test("CR4 crash after execution but before the callback succeeded: the durable result is called back after restart WITHOUT re-executing", async () => {
  const dir = tmpJournalDir(), a = job(5);
  const down = fakeApi(async () => ({ delivered: false, retryable: true, errorClass: "network" }));
  const h1 = await boot(dir, { api: down });
  await h1.q.submit(a);
  // (an attempt is reserved in the journal BEFORE it is sent — wait for the attempt actually sent and its recorded outcome)
  await waitFor(() => { const r = recordOf(dir, a.jobId); return down.calls.length >= 1 && r && r.state === "executed" && r.callback.lastErrorClass === "network"; });
  assert.equal(fs.existsSync(path.join(dir, "inputs", a.jobId + ".json")), false);
  assert.ok(fs.existsSync(path.join(dir, "results", a.jobId + ".json")));
  const firstBody = JSON.stringify(down.calls[0]);
  await crash(h1);
  const h2 = await boot(dir);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed");                 // after the persisted backoff
  assert.equal(h1.sandbox.count(a.jobId), 1);
  assert.equal(h2.sandbox.count(a.jobId), 0);                                                 // NEVER re-executed to rebuild a callback
  assert.equal(h2.api.calls.length, 1);
  assert.equal(JSON.stringify(h2.api.calls[0]), firstBody);                                   // the same evidence, byte for byte
  assert.equal(recordOf(dir, a.jobId).state, "confirmed");
  await waitFor(() => !fs.existsSync(path.join(dir, "results", a.jobId + ".json")));         // released once confirmed (after the commit)
  await crash(h2);
});

test("CR5 the callback was applied but its response was lost: the runner retries; the API answers already-applied; ONE application", async () => {
  const dir = tmpJournalDir(), a = job(6);
  const api = fakeApi(async (n, result) => {
    if (n === 1) { api.applied.set(result.jobId, JSON.stringify(result)); return { delivered: false, retryable: true, errorClass: "network" }; }   // applied, response lost
    return { delivered: true, status: 200, confirmedAs: "complete" };                                                                         // "alreadyApplied"
  });
  const h = await boot(dir, { api });
  await h.q.submit(a);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed");
  assert.equal(api.attempts(a.jobId), 2);
  assert.equal(api.applied.size, 1);
  assert.equal(h.sandbox.count(a.jobId), 1);
  assert.equal(recordOf(dir, a.jobId).callback.attempts, 2);
  assert.equal(recordOf(dir, a.jobId).callback.confirmedAs, "complete");
  await crash(h);
});

test("CR6 a duplicate delivery while the job is running is acknowledged and never starts a second execution", async () => {
  const dir = tmpJournalDir(), a = job(7), hold = latch();
  const h = await boot(dir, { sandbox: fakeSandbox(async () => { await hold.promise; }) });
  await h.q.submit(a);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "running");
  for (let i = 0; i < 3; i++) assert.equal((await h.q.submit(JSON.parse(JSON.stringify(a)))).status, "duplicate");
  hold.open();
  await h.q.idle();
  assert.equal(h.sandbox.count(a.jobId), 1);
  assert.equal(h.api.attempts(a.jobId), 1);
  await crash(h);
});

test("CR7 a duplicate delivery after execution never re-executes; while the callback is pending it triggers an immediate callback retry", async () => {
  const dir = tmpJournalDir(), a = job(8);
  let fail = true;
  const api = fakeApi(async () => (fail ? { delivered: false, retryable: true, status: 503, errorClass: "http" } : null));
  const h = await boot(dir, { api, callbackPolicy: { ...FAST, baseMs: 60000, capMs: 60000 } });       // the next automatic retry is a minute away
  await h.q.submit(a);
  await waitFor(() => { const r = recordOf(dir, a.jobId); return api.attempts(a.jobId) === 1 && r && r.state === "executed" && r.callback.lastStatus === 503; });
  fail = false;
  assert.equal((await h.q.submit(a)).status, "duplicate");
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed", { timeoutMs: 3000 });
  assert.equal(h.sandbox.count(a.jobId), 1);
  assert.equal(api.attempts(a.jobId), 2);
  await crash(h);
});

test("CR8 a duplicate delivery after the callback was confirmed is acknowledged as complete: no execution, no callback", async () => {
  const dir = tmpJournalDir(), a = job(9);
  const h1 = await boot(dir);
  await h1.q.submit(a); await h1.q.idle();
  assert.equal((await h1.q.submit(a)).status, "duplicate");
  await h1.q.idle();
  await crash(h1);
  const h2 = await boot(dir);                                                                 // also after a restart
  const r = await h2.q.submit(a);
  assert.equal(r.status, "duplicate");
  assert.equal(r.state, "confirmed");
  await h2.q.idle();
  assert.equal(h1.sandbox.count(a.jobId) + h2.sandbox.count(a.jobId), 1);
  assert.equal(h1.api.calls.length + h2.api.calls.length, 1);
  assert.equal(h2.summary.recovered.received + h2.summary.recovered.executed, 0);
  await crash(h2);
});

test("CR9 a stale OLDER revision of the same target never executes after a newer one (refused, or superseded while queued) — across restarts", async () => {
  const dir = tmpJournalDir();
  const rev1 = job(10, { revision: 1, targetRef: TARGET }), rev2 = job(11, { revision: 2, targetRef: TARGET });
  const h1 = await boot(dir);
  assert.equal((await h1.q.submit(rev2)).status, "accepted");
  await h1.q.idle();
  assert.equal((await h1.q.submit(rev1)).status, "stale");
  await crash(h1);
  const h2 = await boot(dir);
  assert.equal((await h2.q.submit(rev1)).status, "stale");                                   // the ordering is durable
  await h2.q.idle();
  assert.equal(h1.sandbox.count(rev1.jobId) + h2.sandbox.count(rev1.jobId), 0);
  assert.equal(h1.api.calls.concat(h2.api.calls).filter(c => c.jobId === rev1.jobId).length, 0);
  // same job id, different revision: never silently combined
  assert.equal((await h2.q.submit({ ...rev2, revision: 3 })).status, "conflict");
  await crash(h2);
  // queued older revision overtaken by a newer one before it started → superseded, never executed, never called back
  const dir2 = tmpJournalDir(), hold = latch(), blocker = job(12);
  const o1 = job(13, { revision: 1, targetRef: TARGET }), o2 = job(14, { revision: 2, targetRef: TARGET });
  const h3 = await boot(dir2, { sandbox: fakeSandbox(async j => { if (j.jobId === blocker.jobId) await hold.promise; }) });
  await h3.q.submit(blocker);
  await waitFor(() => (recordOf(dir2, blocker.jobId) || {}).state === "running");
  assert.equal((await h3.q.submit(o1)).status, "accepted");
  assert.equal((await h3.q.submit(o2)).status, "accepted");
  hold.open();
  await h3.q.idle();
  assert.equal(recordOf(dir2, o1.jobId).state, "superseded");
  assert.equal(h3.sandbox.count(o1.jobId), 0);
  assert.equal(h3.sandbox.count(o2.jobId), 1);
  assert.equal(h3.api.calls.filter(c => c.jobId === o1.jobId).length, 0);
  await crash(h3);
});

test("CR10 a restart during callback backoff keeps the attempt count and the schedule (never reset, never early); the window stays bounded", async () => {
  const dir = tmpJournalDir(), a = job(15);
  const always503 = () => fakeApi(async () => ({ delivered: false, retryable: true, status: 503, errorClass: "http" }));
  const policy = { ...FAST, baseMs: 40, capMs: 400, maxAttemptsPerWindow: 6 };
  const api1 = always503();
  const h1 = await boot(dir, { api: api1, callbackPolicy: policy });
  await h1.q.submit(a);
  await waitFor(() => { const r = recordOf(dir, a.jobId); return r && r.callback.attempts >= 3; });
  await crash(h1);
  const before = recordOf(dir, a.jobId);
  const api2 = always503();
  const t0 = Date.now();
  const h2 = await boot(dir, { api: api2, callbackPolicy: policy });
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "callback_failed", { timeoutMs: 8000 });
  const after = recordOf(dir, a.jobId);
  assert.equal(after.callback.attempts, policy.maxAttemptsPerWindow);                         // continued, not restarted at 0
  // an attempt is reserved durably BEFORE it is sent: a crash between the two counts it without a request (never the reverse)
  assert.ok(api1.calls.length + api2.calls.length <= policy.maxAttemptsPerWindow);
  assert.ok(api1.calls.length + api2.calls.length >= policy.maxAttemptsPerWindow - 1);
  assert.equal(api2.calls.length, policy.maxAttemptsPerWindow - before.callback.attempts);
  assert.ok(Date.parse(before.callback.nextAt) - t0 <= policy.capMs + 50);
  assert.equal(h2.sandbox.count(a.jobId), 0);
  await sleep(policy.capMs * 2);
  assert.equal(api2.calls.length, policy.maxAttemptsPerWindow - before.callback.attempts);   // no further attempts: bounded
  await crash(h2);
});

// ── REAL gateway processes (production startGateway(), SIGKILL, same journal directory) ─────────────────────────────────
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.unref(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
/** A SmartAssess-like callback endpoint: verifies SA-CODING-CALLBACK-1, applies each job ONCE, mode decides the answer. */
async function callbackServer() {
  const st = { mode: "ok", applied: new Map(), requests: 0, badSignatures: 0 };
  const server = http.createServer((req, res) => {
    const parts = [];
    req.on("data", d => parts.push(d));
    req.on("end", () => {
      st.requests++;
      const raw = Buffer.concat(parts), h = req.headers;
      const canonical = ["SA-CODING-CALLBACK-1", "POST", "/api/coding/grade-callback", h["x-sa-callback-timestamp"], h["x-sa-callback-request-id"], crypto.createHash("sha256").update(raw).digest("hex")].join("\n");
      const mac = "v1=" + crypto.createHmac("sha256", Buffer.from(H.CB_KEY, "utf8")).update(canonical, "utf8").digest("hex");
      if (mac !== h["x-sa-callback-signature"]) { st.badSignatures++; res.writeHead(401); res.end("{}"); return; }
      const body = JSON.parse(raw.toString("utf8"));
      if (st.mode === "fail") { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, code: "UNAVAILABLE" })); return; }
      const already = st.applied.has(body.jobId);
      if (!already) st.applied.set(body.jobId, raw.toString("utf8"));
      if (st.mode === "drop-after-apply") { st.mode = "ok"; req.socket.destroy(); return; }   // applied, response lost
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(already ? { ok: true, alreadyApplied: true } : { ok: true, applied: true, state: "complete" }));
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  st.port = server.address().port;
  st.close = () => new Promise(r => server.close(r));
  return st;
}
async function startProcess(env) {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "helpers", "gateway-process.js")], { env: { PATH: process.env.PATH, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", d => { out += d.toString("utf8"); });
  child.stderr.on("data", d => { out += d.toString("utf8"); });
  await waitFor(() => /runner\.gateway\.started/.test(out) || child.exitCode !== null, { timeoutMs: 8000 });
  if (child.exitCode !== null) throw new Error("gateway process exited: " + out.slice(0, 400));
  child.output = () => out;
  return child;
}
const kill9 = child => new Promise(r => { if (!child || child.exitCode !== null || child.signalCode !== null) return r(); child.once("exit", () => r()); child.kill("SIGKILL"); });
function postJob(port, body) {
  const { signRequest } = require("../../gateway/auth.js");
  const raw = Buffer.from(JSON.stringify(body));
  const headers = { "content-type": "application/json", "content-length": String(raw.length), ...signRequest({ key: H.KEY, method: "POST", path: "/v1/official-grading-jobs", timestamp: String(Math.floor(Date.now() / 1000)), requestId: "rr_" + crypto.randomBytes(9).toString("hex"), body: raw }) };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/v1/official-grading-jobs", headers }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(p).toString("utf8") || "null") })); });
    req.on("error", reject); req.end(raw);
  });
}
async function processEnv(dir, cb, extra = {}) {
  return { RUNNER_HMAC_KEY: H.KEY, RUNNER_HOST: "127.0.0.1", RUNNER_PORT: String(await freePort()), SMARTASSESS_CALLBACK_BASE_URL: "http://127.0.0.1:" + cb.port, SMARTASSESS_CALLBACK_HMAC_KEY: H.CB_KEY, RUNNER_JOURNAL_DIR: dir, RUNNER_JOURNAL_ALLOW_EPHEMERAL: "1", RUNNER_OFFICIAL_MAX_ACTIVE: "1", FAKE_EXEC_LOG: path.join(dir, "..", path.basename(dir) + ".exec.log"), ...extra };
}
const execCount = (env, jobId) => { try { return fs.readFileSync(env.FAKE_EXEC_LOG, "utf8").split("\n").filter(l => l === jobId).length; } catch { return 0; } };

test("RR1 real process: SIGKILL while one job runs and another waits; the restarted process finishes both (waiting one once), one callback each", async () => {
  const dir = tmpJournalDir(), cb = await callbackServer();
  const env = await processEnv(dir, cb, { FAKE_EXEC_DELAY_MS: "5000" });
  const a = job(21), b = job(22);
  let child = null;
  try {
    child = await startProcess(env);
    assert.equal((await postJob(Number(env.RUNNER_PORT), a)).status, 202);
    assert.equal((await postJob(Number(env.RUNNER_PORT), b)).status, 202);
    await waitFor(() => execCount(env, a.jobId) === 1 && (recordOf(dir, b.jobId) || {}).state === "received");
    await kill9(child);
    child = await startProcess({ ...env, FAKE_EXEC_DELAY_MS: "0" });
    await waitFor(() => states(dir, [a.jobId, b.jobId]).join() === "confirmed,confirmed", { timeoutMs: 15000 });
    assert.equal(execCount(env, b.jobId), 1);                                                 // accepted-but-not-started: exactly once
    assert.equal(execCount(env, a.jobId), 2);                                                 // killed mid-execution: re-run (documented)
    assert.equal(recordOf(dir, a.jobId).interruptions, 1);
    assert.equal(cb.applied.size, 2);
    assert.equal(cb.badSignatures, 0);
  } finally { await kill9(child); await cb.close(); }
});

test("RR2 real process: SIGKILL after execution while the callback is failing; the restarted process calls back from the journal — no re-execution", async () => {
  const dir = tmpJournalDir(), cb = await callbackServer();
  cb.mode = "fail";
  const env = await processEnv(dir, cb);
  const a = job(23);
  let child = null;
  try {
    child = await startProcess(env);
    assert.equal((await postJob(Number(env.RUNNER_PORT), a)).status, 202);
    await waitFor(() => { const r = recordOf(dir, a.jobId); return r && r.state === "executed" && r.callback.attempts >= 1; }, { timeoutMs: 8000 });
    const attempts = recordOf(dir, a.jobId).callback.attempts;
    await kill9(child);
    cb.mode = "ok";
    child = await startProcess(env);
    await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed", { timeoutMs: 15000 });
    assert.equal(execCount(env, a.jobId), 1);
    assert.equal(cb.applied.size, 1);
    assert.ok(recordOf(dir, a.jobId).callback.attempts > attempts);                          // continued counting across the restart
  } finally { await kill9(child); await cb.close(); }
});

test("RR3 real process: the callback is applied but its response is lost and the process is killed before confirming; after restart: re-sent, applied once, confirmed", async () => {
  const dir = tmpJournalDir(), cb = await callbackServer();
  cb.mode = "drop-after-apply";
  const env = await processEnv(dir, cb);
  const a = job(24);
  let child = null;
  try {
    child = await startProcess(env);
    assert.equal((await postJob(Number(env.RUNNER_PORT), a)).status, 202);
    await waitFor(() => cb.applied.has(a.jobId), { timeoutMs: 8000 });
    await kill9(child);
    assert.notEqual((recordOf(dir, a.jobId) || {}).state, "confirmed");                       // the runner never saw the ACK
    child = await startProcess(env);
    await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed", { timeoutMs: 15000 });
    assert.equal(execCount(env, a.jobId), 1);
    assert.equal(cb.applied.size, 1);
    assert.ok(cb.requests >= 2);
  } finally { await kill9(child); await cb.close(); }
});
