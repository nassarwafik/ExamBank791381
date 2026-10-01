"use strict";
// Phase 17D-B2 — the DURABLE RUNNER JOURNAL and durable callback delivery (node:test, no Docker):
//   • configuration fails CLOSED: official grading needs RUNNER_JOURNAL_DIR — absolute, private, NOT ephemeral (tmpfs / ramfs /
//     overlay / squashfs / the Azure resource disk) unless the explicit development override is set;
//   • idempotent receive (jobId + payload hash, signed revision ordering per opaque target), durable BEFORE the 202;
//   • callback retry state is durable and bounded (attempt window, exponential backoff with a cap, bounded re-arms by a fresh
//     delivery from SmartAssess); permanent failures do not spin;
//   • corrupt journal entries are quarantined (moved, never silently deleted, never executed / called back);
//   • every structure is bounded: records, startup scan, admission, retention pruning per pass, quarantine;
//   • no source, hidden-test input, program output, key or signature in the journal metadata or in logs.
// Fail-first on a6e26ac: gateway/journal.js does not exist; job state is RAM-only; the deliverer has no single-attempt contract.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const H = require("../helpers/durable.js");

const { job, boot, crash, fakeSandbox, fakeApi, latch, recordOf, waitFor, sleep, tmpJournalDir, TARGET, FAST, capture, quiet } = H;
const journalMod = () => require("../../gateway/journal.js");
const callbackMod = () => require("../../gateway/callback.js");
const mode = file => fs.statSync(file).mode & 0o777;
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };

const MOUNTS = [
  "/dev/vda1 / ext4 rw,relatime 0 0",
  "tmpfs /run tmpfs rw,nosuid,nodev 0 0",
  "tmpfs /tmp tmpfs rw,nosuid,nodev 0 0",
  "/dev/sdb1 /mnt ext4 rw,relatime 0 0",
  "overlay /var/lib/container-root overlay rw 0 0",
  "/dev/sdc1 /data ext4 rw,relatime 0 0",
  "/dev/sdc2 /srv/with\\040space ext4 rw 0 0"
].join("\n");
const probe = { mounts: () => MOUNTS, resourceDevice: () => "/dev/sdb1" };

test("JK1 journal configuration fails CLOSED: official grading needs an absolute, NON-ephemeral RUNNER_JOURNAL_DIR (override only for development)", () => {
  const { readJournalConfig } = journalMod();
  const cfg = dir => readJournalConfig(dir === undefined ? {} : { RUNNER_JOURNAL_DIR: dir }, probe);
  assert.deepEqual(cfg(undefined), { enabled: false, reason: "not-configured" });
  assert.deepEqual(cfg(""), { enabled: false, reason: "not-configured" });
  assert.deepEqual(cfg("relative/journal"), { enabled: false, reason: "not-absolute" });
  for (const ephemeral of ["/tmp/journal", "/run/sa/journal", "/mnt/journal", "/mnt/resource/journal", "/var/lib/container-root/journal", "/data/../tmp/journal"]) assert.deepEqual(cfg(ephemeral), { enabled: false, reason: "ephemeral" }, ephemeral);
  assert.deepEqual(cfg("/data/smartassess/journal"), { enabled: true, dir: "/data/smartassess/journal", ephemeral: false });
  assert.deepEqual(cfg("/var/lib/smartassess-runner/journal"), { enabled: true, dir: "/var/lib/smartassess-runner/journal", ephemeral: false });
  assert.deepEqual(cfg("/srv/with space/j"), { enabled: true, dir: "/srv/with space/j", ephemeral: false });
  assert.deepEqual(readJournalConfig({ RUNNER_JOURNAL_DIR: "/tmp/journal", RUNNER_JOURNAL_ALLOW_EPHEMERAL: "1" }, probe), { enabled: true, dir: "/tmp/journal", ephemeral: true });
  assert.deepEqual(readJournalConfig({ RUNNER_JOURNAL_DIR: "/tmp/journal", RUNNER_JOURNAL_ALLOW_EPHEMERAL: "true" }, probe), { enabled: false, reason: "ephemeral" });
  // the gateway: a valid callback destination is NOT enough — without a durable journal official grading stays disabled
  const { readGatewayConfig } = require("../../gateway/main.js");
  const base = { RUNNER_HMAC_KEY: H.KEY, SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: H.CB_KEY };
  assert.equal(readGatewayConfig(base, { journalProbe: probe }).official.enabled, false);
  assert.equal(readGatewayConfig(base, { journalProbe: probe }).official.journal, "not-configured");
  assert.equal(readGatewayConfig({ ...base, RUNNER_JOURNAL_DIR: "/tmp/j" }, { journalProbe: probe }).official.enabled, false);
  const ok = readGatewayConfig({ ...base, RUNNER_JOURNAL_DIR: "/data/j" }, { journalProbe: probe });
  assert.equal(ok.official.enabled, true);
  assert.equal(ok.official.journal, "durable");
  assert.equal(JSON.stringify(ok).includes(H.KEY) || JSON.stringify(ok).includes(H.CB_KEY), false);
});

test("J1 receive is durable BEFORE the 202 and idempotent: private record + input, same id + same body → duplicate, different body → conflict", async () => {
  const dir = tmpJournalDir(), a = job(1), hold = latch();
  const h = await boot(dir, { sandbox: fakeSandbox(async () => { await hold.promise; }) });
  assert.equal((await h.q.submit(a)).status, "accepted");
  const rec = recordOf(dir, a.jobId);
  assert.ok(rec && ["received", "running"].includes(rec.state));
  assert.equal(rec.schemaVersion, 1);
  assert.equal(rec.jobId, a.jobId);
  assert.match(rec.payloadHash, /^[0-9a-f]{64}$/);
  const input = path.join(dir, "inputs", a.jobId + ".json");
  assert.ok(fs.existsSync(input));
  assert.equal(mode(input), 0o600);
  assert.equal(mode(path.join(dir, "jobs", a.jobId + ".json")), 0o600);
  for (const sub of ["", "jobs", "inputs", "results", "quarantine", "targets"]) assert.equal(mode(path.join(dir, sub)), 0o700, sub);
  assert.equal((await h.q.submit(JSON.parse(JSON.stringify(a)))).status, "duplicate");
  assert.equal((await h.q.submit({ ...a, source: "print('replacement')" })).status, "conflict");
  hold.open();
  await h.q.idle();
  assert.equal(h.sandbox.count(a.jobId), 1);
  assert.equal(fs.readdirSync(path.join(dir, "jobs")).filter(n => n.endsWith(".json")).length, 1);
  await crash(h);
});

test("J2 HTTP: journaled official endpoint — 202 / duplicate, 409 JOB_ID_CONFLICT, 409 STALE_REVISION, 503 RUNNER_BUSY when the journal cannot write", async () => {
  const { signRequest } = require("../../gateway/auth.js");
  const { createGatewayServer } = require("../../gateway/server.js");
  const dir = tmpJournalDir();
  const h = await boot(dir);
  const server = createGatewayServer({ key: H.KEY, sandbox: h.sandbox, maxConcurrency: 2, logger: quiet(), officialQueue: h.q });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  let n = 0;
  const post = body => new Promise((resolve, reject) => {
    const raw = Buffer.from(JSON.stringify(body));
    const headers = { "content-type": "application/json", "content-length": String(raw.length), ...signRequest({ key: H.KEY, method: "POST", path: "/v1/official-grading-jobs", timestamp: String(Math.floor(Date.now() / 1000)), requestId: "j2_req_" + String(++n).padStart(6, "0"), body: raw }) };
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/v1/official-grading-jobs", headers }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(p).toString("utf8")) })); });
    req.on("error", reject); req.end(raw);
  });
  try {
    const r2 = job(2, { revision: 2, targetRef: TARGET }), r1 = job(3, { revision: 1, targetRef: TARGET });
    assert.deepEqual(await post(r2), { status: 202, json: { ok: true, accepted: true, duplicate: false } });
    assert.deepEqual(await post(r2), { status: 202, json: { ok: true, accepted: true, duplicate: true } });
    assert.deepEqual(await post({ ...r2, source: "print(2)" }), { status: 409, json: { ok: false, code: "JOB_ID_CONFLICT" } });
    assert.deepEqual(await post(r1), { status: 409, json: { ok: false, code: "STALE_REVISION" } });
    assert.equal((await post({ ...job(4), revision: 1 })).status, 400);                         // revision and targetRef travel together
    assert.equal((await post({ ...job(4), revision: 0, targetRef: TARGET })).status, 400);
    assert.equal((await post({ ...job(4), revision: 1, targetRef: "tr_short" })).status, 400);
    h.journal.writeRecord = async () => { throw new Error("EIO"); };
    assert.deepEqual(await post(job(5)), { status: 503, json: { ok: false, code: "RUNNER_BUSY" } });
    await h.q.idle();
    assert.equal(h.sandbox.count(job(5).jobId), 0);
  } finally { server.close(); await crash(h); }
});

test("CB1 retryable callback failures (network, timeout, 5xx, 408, 429) are retried with growing, capped backoff until confirmed", async () => {
  const dir = tmpJournalDir(), a = job(6);
  const script = [{ delivered: false, retryable: true, errorClass: "network" }, { delivered: false, retryable: true, errorClass: "timeout" }, { delivered: false, retryable: true, status: 503, errorClass: "http" }, { delivered: false, retryable: true, status: 429, errorClass: "http" }];
  const at = [];
  const api = fakeApi(async n => { at.push(Date.now()); return script[n - 1] || null; });
  const h = await boot(dir, { api, callbackPolicy: { ...FAST, baseMs: 20, capMs: 70, maxAttemptsPerWindow: 8 } });
  await h.q.submit(a);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed", { timeoutMs: 4000 });
  assert.equal(api.attempts(a.jobId), 5);
  const rec = recordOf(dir, a.jobId);
  assert.equal(rec.callback.attempts, 5);
  assert.equal(rec.callback.confirmedAs, "complete");
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(gaps[0] >= 15 && gaps[1] >= 35, JSON.stringify(gaps));                           // 20 ms, 40 ms, then capped at 70 ms
  assert.ok(gaps.every(g => g < 400), JSON.stringify(gaps));
  assert.equal(h.sandbox.count(a.jobId), 1);
  await crash(h);
});

test("CB1b the deliverer makes ONE signed attempt per call and classifies the SmartAssess answer (no internal loop)", async () => {
  const { createCallbackDeliverer } = callbackMod();
  const config = { enabled: true, url: "https://app.example.test/api/coding/grade-callback" };
  Object.defineProperty(config, "key", { value: H.CB_KEY, enumerable: false });
  const cases = [
    [200, { ok: true, applied: true, state: "complete" }, { delivered: true, confirmedAs: "complete" }],
    [200, { ok: true, alreadyApplied: true }, { delivered: true, confirmedAs: "complete" }],
    [200, { ok: true, applied: true, state: "retryable" }, { delivered: true, confirmedAs: "retryable" }],
    [500, {}, { delivered: false, retryable: true }], [503, {}, { delivered: false, retryable: true }], [408, {}, { delivered: false, retryable: true }], [429, {}, { delivered: false, retryable: true }],
    [400, { code: "REQUEST_INVALID" }, { delivered: false, retryable: false }], [401, {}, { delivered: false, retryable: false }], [403, {}, { delivered: false, retryable: false }],
    [404, { code: "UNKNOWN_JOB" }, { delivered: false, retryable: false }], [409, { code: "STALE_RESULT" }, { delivered: false, retryable: false }], [413, {}, { delivered: false, retryable: false }]
  ];
  for (const [status, body, want] of cases) {
    let calls = 0;
    const d = createCallbackDeliverer({ config, fetch: async () => { calls++; return new Response(JSON.stringify(body), { status }); }, logger: quiet() });
    const r = await d.attempt({ jobId: "cg_cb1b00000000000000000", outcome: "completed", cases: [] });
    assert.equal(calls, 1, String(status));
    assert.equal(r.delivered, want.delivered, String(status));
    if (want.confirmedAs) assert.equal(r.confirmedAs, want.confirmedAs, String(status));
    if (!want.delivered) assert.equal(r.retryable, want.retryable, String(status));
  }
  for (const err of [new TypeError("fetch failed"), Object.assign(new Error("timeout"), { name: "TimeoutError" })]) {
    const d = createCallbackDeliverer({ config, fetch: async () => { throw err; }, logger: quiet() });
    const r = await d.attempt({ jobId: "cg_cb1b00000000000000000", outcome: "completed", cases: [] });
    assert.deepEqual({ delivered: r.delivered, retryable: r.retryable }, { delivered: false, retryable: true });
  }
});

test("CB2 a NON-retryable callback failure does not spin: one attempt, parked; only a fresh delivery from SmartAssess re-arms it (bounded)", async () => {
  const dir = tmpJournalDir(), a = job(7);
  const api = fakeApi(async () => ({ delivered: false, retryable: false, status: 401, errorClass: "http" }));
  const h = await boot(dir, { api, callbackPolicy: { ...FAST, maxRearms: 2 } });
  await h.q.submit(a);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "callback_failed");
  await sleep(250);
  assert.equal(api.attempts(a.jobId), 1);                                                     // no retry loop on a permanent failure
  for (let i = 1; i <= 4; i++) {
    assert.equal((await h.q.submit(a)).status, "duplicate");
    await h.q.idle();
    await sleep(30);
  }
  assert.equal(api.attempts(a.jobId), 3);                                                     // 1 + 2 bounded re-arms
  assert.equal(recordOf(dir, a.jobId).callback.rearms, 2);
  assert.equal(h.sandbox.count(a.jobId), 1);
  await crash(h);
});

test("CB3 callback retry state survives a restart: attempts are not reset and no attempt happens before the persisted next time", async () => {
  const dir = tmpJournalDir(), a = job(8);
  const api1 = fakeApi(async () => ({ delivered: false, retryable: true, status: 502, errorClass: "http" }));
  const policy = { ...FAST, baseMs: 3000, capMs: 3000, maxAttemptsPerWindow: 5 };
  const h1 = await boot(dir, { api: api1, callbackPolicy: policy });
  await h1.q.submit(a);
  await waitFor(() => { const r = recordOf(dir, a.jobId); return r && r.callback.attempts === 1 && r.callback.nextAt; });
  await crash(h1);
  const saved = recordOf(dir, a.jobId);
  const api2 = fakeApi();
  const h2 = await boot(dir, { api: api2, callbackPolicy: policy });
  await sleep(300);
  assert.equal(api2.calls.length, 0);                                                         // still inside the persisted backoff
  assert.equal(recordOf(dir, a.jobId).callback.attempts, saved.callback.attempts);
  assert.equal(recordOf(dir, a.jobId).callback.nextAt, saved.callback.nextAt);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed", { timeoutMs: 6000 });
  assert.ok(Date.now() >= Date.parse(saved.callback.nextAt) - 20);
  assert.equal(recordOf(dir, a.jobId).callback.attempts, 2);
  assert.equal(h2.sandbox.count(a.jobId), 0);
  await crash(h2);
});

test("JC1 a corrupt journal entry is QUARANTINED (moved, not deleted), never executed or called back; the runner keeps working", async () => {
  const dir = tmpJournalDir();
  const h1 = await boot(dir);
  await h1.q.submit(job(9)); await h1.q.idle();
  await crash(h1);
  fs.writeFileSync(path.join(dir, "jobs", "cg_corrupt0000000000000001.json"), "{ not json", { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "jobs", "cg_corrupt0000000000000002.json"), JSON.stringify({ schemaVersion: 1, jobId: "cg_someoneelse0000000000", state: "received", payloadHash: "0".repeat(64) }), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "jobs", "cg_corrupt0000000000000003.json"), JSON.stringify({ schemaVersion: 99, jobId: "cg_corrupt0000000000000003", state: "received" }), { mode: 0o600 });
  const log = capture();
  const h2 = await boot(dir, { logger: log });
  assert.equal(h2.summary.corrupt, 3);
  const quarantined = fs.readdirSync(path.join(dir, "quarantine"));
  assert.equal(quarantined.length, 3);
  for (const n of [1, 2, 3]) assert.equal(fs.existsSync(path.join(dir, "jobs", "cg_corrupt000000000000000" + n + ".json")), false);
  const corruptEvents = log.events().filter(e => e.event === "coding.runner.journal.corrupt");
  assert.equal(corruptEvents.length, 3);
  assert.equal(JSON.stringify(corruptEvents).includes("not json"), false);
  await h2.q.idle();
  assert.equal(h2.sandbox.runs.length, 0);
  assert.equal(h2.api.calls.length, 0);
  assert.equal((await h2.q.submit(job(10))).status, "accepted");                              // still serving
  await h2.q.idle();
  assert.equal(recordOf(dir, job(10).jobId).state, "confirmed");
  await crash(h2);
});

test("JC2 a durable result that no longer matches its recorded hash is never called back (quarantined); no re-execution from a corrupt record", async () => {
  const dir = tmpJournalDir(), a = job(11);
  const h1 = await boot(dir, { api: fakeApi(async () => ({ delivered: false, retryable: true, errorClass: "network" })) });
  await h1.q.submit(a);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "executed");
  await crash(h1);
  const rf = path.join(dir, "results", a.jobId + ".json");
  const tampered = JSON.parse(fs.readFileSync(rf, "utf8"));
  tampered.cases[0].stdout = "forged\n";
  fs.writeFileSync(rf, JSON.stringify(tampered));
  const log = capture();
  const h2 = await boot(dir, { logger: log });
  await h2.q.idle(); await sleep(100);
  assert.equal(h2.api.calls.length, 0);
  assert.equal(h2.sandbox.count(a.jobId), 0);
  assert.equal(fs.existsSync(path.join(dir, "jobs", a.jobId + ".json")), false);
  assert.ok(fs.readdirSync(path.join(dir, "quarantine")).length >= 1);
  assert.ok(log.events().some(e => e.event === "coding.runner.journal.corrupt" && e.reason === "result-hash"));
  await crash(h2);
});

test("BD1 the startup scan is BOUNDED: past the limit it stops, reports truncation and fails closed for new jobs", async () => {
  const dir = tmpJournalDir();
  const h1 = await boot(dir, { maxPending: 64 });
  for (let i = 0; i < 30; i++) assert.equal((await h1.q.submit(job(100 + i))).status, "accepted");
  await h1.q.idle();
  await crash(h1);
  const reads = [];
  const h2 = await boot(dir, { limits: { startupScanMax: 20 } });
  assert.equal(h2.summary.truncated, true);
  assert.ok(h2.summary.scanned <= 20, String(h2.summary.scanned));
  assert.equal((await h2.q.submit(job(200))).status, "busy");                                 // index incomplete → no new admissions
  assert.equal(h2.q.status().truncated, true);
  await crash(h2);
  const h3 = await boot(dir, { limits: { startupScanMax: 64 } });
  assert.equal(h3.summary.truncated, false);
  assert.equal(h3.summary.scanned, 30);
  assert.equal(reads.length, 0);
  await crash(h3);
});

test("BD2 admission is bounded: live jobs ≤ maxPending, journal records ≤ maxRecords (until retention frees space)", async () => {
  const dir = tmpJournalDir(), hold = latch(), now = clock();
  const h = await boot(dir, { now, maxPending: 2, sandbox: fakeSandbox(async j => { if (j.jobId === job(30).jobId) await hold.promise; }), limits: { maxRecords: 4, confirmedRetentionMs: 60000 } });
  assert.equal((await h.q.submit(job(30))).status, "accepted");
  assert.equal((await h.q.submit(job(31))).status, "accepted");
  assert.equal((await h.q.submit(job(32))).status, "busy");                                   // 2 live
  hold.open(); await h.q.idle();
  assert.equal((await h.q.submit(job(33))).status, "accepted");
  assert.equal((await h.q.submit(job(34))).status, "accepted");
  await h.q.idle();
  assert.equal((await h.q.submit(job(35))).status, "busy");                                   // 4 records kept for dedupe
  now.advance(61000);
  await h.q.maintain();
  assert.equal((await h.q.submit(job(35))).status, "accepted");
  await h.q.idle();
  await crash(h);
});

test("BD3 retention pruning is bounded per pass, never touches live work, keeps parked callbacks longer, and prunes stale target indexes", async () => {
  const dir = tmpJournalDir(), now = clock();
  const limits = { pruneBatch: 3, confirmedRetentionMs: 1000, failedRetentionMs: 5000 };
  const parked = fakeApi(async (n, r) => (r.jobId === job(49).jobId ? { delivered: false, retryable: false, status: 401, errorClass: "http" } : null));
  const h = await boot(dir, { now, api: parked, limits, maxPending: 16 });
  for (let i = 0; i < 8; i++) await h.q.submit(job(40 + i, i === 0 ? { revision: 1, targetRef: TARGET } : {}));
  await h.q.submit(job(49));
  await h.q.idle();
  const hold = latch();
  const live = job(48);
  h.sandbox.runOfficialSuite = async () => { await hold.promise; return { cases: [] }; };
  await h.q.submit(live);
  now.advance(2000);
  const pass = async () => (await h.q.maintain()).pruned;
  assert.equal(await pass(), 3);
  assert.equal(await pass(), 3);
  assert.equal(await pass(), 2);
  assert.equal(await pass(), 0);
  assert.equal(recordOf(dir, live.jobId).state, "running");                                   // live work is never pruned
  assert.equal(recordOf(dir, job(49).jobId).state, "callback_failed");                       // parked: kept for the longer window
  now.advance(5000);
  await pass();
  assert.equal(recordOf(dir, job(49).jobId), null);
  assert.equal(fs.existsSync(path.join(dir, "targets", TARGET + ".json")), false);
  hold.open();
  await crash(h);
});

test("LK1 no source, hidden-test input, program output, key or signature in journal metadata or logs; inputs and results are released after use", async () => {
  const dir = tmpJournalDir(), log = capture();
  let fail = 1;
  const api = fakeApi(async () => (fail-- > 0 ? { delivered: false, retryable: true, errorClass: "network" } : null));
  const h = await boot(dir, { logger: log, api });
  const a = job(60, { revision: 1, targetRef: TARGET });
  await h.q.submit(a);
  await waitFor(() => (recordOf(dir, a.jobId) || {}).state === "confirmed");
  fs.writeFileSync(path.join(dir, "jobs", "cg_corrupt0000000000000060.json"), "{" + H.SOURCE_CANARY, { mode: 0o600 });
  await crash(h);
  const h2 = await boot(dir, { logger: log });
  await crash(h2);
  const logs = log.lines.join("\n");
  const meta = fs.readdirSync(path.join(dir, "jobs")).map(n => fs.readFileSync(path.join(dir, "jobs", n), "utf8")).join("\n") + fs.readdirSync(path.join(dir, "targets")).map(n => fs.readFileSync(path.join(dir, "targets", n), "utf8")).join("\n");
  for (const secret of [H.SOURCE_CANARY, H.STDIN_CANARY, "out-c01", H.KEY, H.CB_KEY, "v1="]) {
    assert.equal(logs.includes(secret), false, "log leaks " + secret);
    assert.equal(meta.includes(secret), false, "journal metadata leaks " + secret);
  }
  assert.deepEqual(fs.readdirSync(path.join(dir, "inputs")), []);
  assert.deepEqual(fs.readdirSync(path.join(dir, "results")), []);
  for (const e of log.events()) assert.ok(JSON.stringify(e).length < 600, "bounded telemetry line");
});
