"use strict";
// Phase 17F-B3 — ATOMIC official admission & deterministic backpressure (node:test, no Docker; a REAL on-disk journal in a temp
// directory per test, exactly like the 17D-B2 suites).
//
// B10-F1 (found by the load / certification harness): with RUNNER_OFFICIAL_MAX_PENDING = 3, eight SEQUENTIAL official
// submissions give 3 accepted + 5 RUNNER_BUSY, but eight CONCURRENT submissions could give 8 accepted. Root cause: submit()
// serialises only ONE job id (withJob); the LIVE count / records.size are read, then the async journal writes run, then
// records.set installs the record — so every concurrent NEW job id evaluates capacity against the same stale shared state.
// These tests make the old race DETERMINISTIC with a gate on the journal writes (never CPU-scheduling luck) and pin the
// server-owned invariants:  LIVE (received + running) ≤ maxPending,  records ≤ maxRecords,  one lifecycle per job id, no
// regression of the target revision authority, "accepted" only after the durable record, failure / stop liveness, and that the
// admission authority never covers sandbox execution or callback delivery.
// Fail-first on 10b7e785 (main after PR #248): ADM1/2/3/4/5/7/8/17/18/20 fail (over-admission, regeneration without capacity,
// post-stop admission, target regression, same-revision double acceptance).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const H = require("../helpers/durable.js");
const { job, TARGET, tmpJournalDir, recordOf, fakeSandbox, latch, fakeApi, boot, crash, waitFor, sleep, quiet } = H;
const { signRequest } = require("../../gateway/auth.js");
const { createGatewayServer } = require("../../gateway/server.js");

let unhandled = 0;
process.on("unhandledRejection", () => { unhandled++; });
const count = (results, status) => results.filter(r => r && r.status === status).length;
const jobs = (n, from = 1, over = {}) => Array.from({ length: n }, (_, i) => job(from + i, over));
/** A sandbox that HOLDS every execution open (accepted work stays LIVE) and records the peak physical concurrency. */
function holdingSandbox() {
  const hold = latch();
  let running = 0, peak = 0;
  const sandbox = fakeSandbox(async () => { running++; peak = Math.max(peak, running); try { await hold.promise; } finally { running--; } });
  return { sandbox, hold, peak: () => peak, running: () => running };
}
/** Gates one journal method: every call waits until `open()`; the real write runs afterwards. Widens the old race window. */
function gate(journal, method) {
  const original = journal[method].bind(journal);
  const g = latch();
  let calls = 0;
  journal[method] = async (...args) => { calls++; await g.promise; return original(...args); };
  return { open: g.open, calls: () => calls, restore: () => { journal[method] = original; } };
}
/** Makes one journal method throw exactly `times` times (then the real write runs). */
function failing(journal, method, times = 1) {
  const original = journal[method].bind(journal);
  let left = times, failures = 0;
  journal[method] = async (...args) => { if (left > 0) { left--; failures++; throw new Error("injected " + method + " failure"); } return original(...args); };
  return { failures: () => failures };
}
/** Issues every submit "at once" (same tick), then opens the gate(s) once all of them are in flight, and settles. */
async function burst(q, list, gates = []) {
  const pending = list.map(j => q.submit(j));
  await sleep(25);
  for (const g of gates) g.open();
  return Promise.all(pending);
}
const maxPendingSampled = async (q, pendingPromise) => {
  let max = 0, done = false;
  pendingPromise.then(() => { done = true; }, () => { done = true; });
  while (!done) { max = Math.max(max, q.size().pending); await sleep(1); }
  return max;
};

// ── maxPending under a concurrent burst (B10-F1) ──────────────────────────────────────────────────────────────────────
test("ADM1 maxPending=3, eight DISTINCT concurrent submissions with LIVE work held: exactly 3 accepted, 5 busy (B10-F1 reproduction)", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 3, sandbox: s.sandbox });
  const g = gate(h.journal, "writeRecord");
  const results = await burst(h.q, jobs(8), [g]);
  assert.equal(count(results, "accepted"), 3, JSON.stringify(results.map(r => r.status)));
  assert.equal(count(results, "busy"), 5);
  assert.equal(h.q.size().pending, 3);
  assert.equal(fs.readdirSync(path.join(dir, "jobs")).length, 3);                              // exactly the admitted records are durable
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM2 repeated deterministic bursts with different write windows: accepted never exceeds maxPending", async () => {
  for (const [maxPending, n, delay] of [[3, 8, 0], [3, 8, 10], [1, 6, 0], [2, 12, 5], [5, 5, 0]]) {
    const dir = tmpJournalDir(), s = holdingSandbox();
    const h = await boot(dir, { maxPending, sandbox: s.sandbox });
    const original = h.journal.writeRecord.bind(h.journal);
    h.journal.writeRecord = async rec => { if (delay) await sleep(delay); return original(rec); };
    const results = await Promise.all(jobs(n, 100).map(j => h.q.submit(j)));
    assert.ok(count(results, "accepted") <= maxPending, `maxPending=${maxPending}: ${JSON.stringify(results.map(r => r.status))}`);
    assert.equal(count(results, "accepted") + count(results, "busy"), n);
    assert.ok(h.q.size().pending <= maxPending);
    s.hold.open(); await h.q.idle(); await crash(h);
  }
});

test("ADM3 queue.size().pending never exceeds maxPending at any moment of the burst", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 3, sandbox: s.sandbox });
  const g = gate(h.journal, "writeRecord");
  const pending = Promise.all(jobs(8, 200).map(j => h.q.submit(j)));
  setTimeout(() => g.open(), 25);
  const peak = await maxPendingSampled(h.q, pending);
  const results = await pending;
  assert.ok(peak <= 3, "peak pending " + peak);
  assert.equal(count(results, "accepted"), 3);
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM4 HTTP: eight concurrent signed POSTs against maxPending=3 → three 202 accepted, five 503 RUNNER_BUSY", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 3, sandbox: s.sandbox });
  const server = createGatewayServer({ key: H.KEY, sandbox: h.sandbox, maxConcurrency: 2, logger: quiet(), officialQueue: h.q });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const post = body => {
    const raw = Buffer.from(JSON.stringify(body));
    const headers = { "content-type": "application/json", "content-length": String(raw.length), ...signRequest({ key: H.KEY, method: "POST", path: "/v1/official-grading-jobs", timestamp: String(Math.floor(Date.now() / 1000)), requestId: "b3_" + crypto.randomBytes(9).toString("hex"), body: raw }) };
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/v1/official-grading-jobs", headers }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(p).toString("utf8") || "null") })); });
      req.on("error", reject); req.end(raw);
    });
  };
  const g = gate(h.journal, "writeRecord");
  try {
    const pending = Promise.all(jobs(8, 300).map(j => post(j)));
    await waitFor(() => g.calls() >= 1 || h.q.size().pending >= 3, { timeoutMs: 3000 });
    await sleep(40);
    g.open();
    const results = await pending;
    assert.equal(results.filter(r => r.status === 202 && r.json.accepted === true && r.json.duplicate === false).length, 3, JSON.stringify(results));
    assert.equal(results.filter(r => r.status === 503 && r.json.code === "RUNNER_BUSY").length, 5);
    assert.equal(h.q.size().pending, 3);
  } finally { await new Promise(r => server.close(r)); s.hold.open(); await h.q.idle(); await crash(h); }
});

// ── maxRecords under a concurrent burst ───────────────────────────────────────────────────────────────────────────────
test("ADM5 maxRecords=3 with a high maxPending: concurrent distinct new jobs never produce more than 3 records", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 16, sandbox: s.sandbox, limits: { maxRecords: 3 } });
  const g = gate(h.journal, "writeRecord");
  const results = await burst(h.q, jobs(7, 400), [g]);
  assert.equal(count(results, "accepted"), 3, JSON.stringify(results.map(r => r.status)));
  assert.equal(count(results, "busy"), 4);
  assert.equal(h.q.size().entries, 3);
  assert.equal(fs.readdirSync(path.join(dir, "jobs")).length, 3);
  s.hold.open(); await h.q.idle(); await crash(h);
});

// ── duplicates and conflicts under concurrency ────────────────────────────────────────────────────────────────────────
test("ADM6 sixteen identical same-id / same-payload concurrent submissions: ONE new lifecycle, the rest duplicates, one execution, one slot", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 4, sandbox: s.sandbox });
  const g = gate(h.journal, "writeRecord");
  const results = await burst(h.q, Array.from({ length: 16 }, () => job(500)), [g]);
  assert.equal(count(results, "accepted"), 1, JSON.stringify(results.map(r => r.status)));
  assert.equal(count(results, "duplicate"), 15);
  assert.equal(count(results, "busy"), 0);
  assert.equal(h.q.size().pending, 1);
  assert.equal((await h.q.submit(job(501))).status, "accepted");                                // capacity was not consumed by the duplicates
  s.hold.open(); await h.q.idle();
  assert.equal(h.sandbox.count(job(500).jobId), 1);
  await crash(h);
});

test("ADM7 same job id with CONFLICTING payloads concurrently: one canonical payload, every other payload JOB_ID_CONFLICT, one execution", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 8, sandbox: s.sandbox });
  const g = gate(h.journal, "writeRecord");
  const variants = [0, 1, 2, 3].map(i => job(600, { source: "print(" + i + ")" }));
  const results = await burst(h.q, variants, [g]);
  assert.equal(count(results, "accepted"), 1, JSON.stringify(results.map(r => r.status)));
  assert.equal(count(results, "conflict"), 3);
  const rec = recordOf(dir, job(600).jobId);
  const { officialPayloadHash } = require("../../gateway/official.js");
  const winner = variants[results.findIndex(r => r.status === "accepted")];
  assert.equal(rec.payloadHash, officialPayloadHash(winner));
  assert.equal(fs.readdirSync(path.join(dir, "jobs")).length, 1);
  s.hold.open(); await h.q.idle();
  assert.equal(h.sandbox.count(job(600).jobId), 1);
  await crash(h);
});

// ── confirmed / retryable regeneration is a LIVE admission ────────────────────────────────────────────────────────────
test("ADM8 maxPending full + a confirmed/retryable redelivery: busy — generation unchanged, no input rewrite, no transition to received", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  // job 700 runs immediately (nothing held yet) and is confirmed retryable; then two held jobs fill maxPending=2
  const api = fakeApi(async (n, r) => (r.jobId === job(700).jobId ? { delivered: true, status: 200, confirmedAs: "retryable" } : null));
  const sandbox = fakeSandbox(async j => { if (j.jobId !== job(700).jobId) { await s.hold.promise; } });
  const h = await boot(dir, { maxPending: 2, sandbox, api });
  assert.equal((await h.q.submit(job(700))).status, "accepted");
  await waitFor(() => recordOf(dir, job(700).jobId)?.state === "confirmed");
  assert.equal((await h.q.submit(job(701))).status, "accepted");
  assert.equal((await h.q.submit(job(702))).status, "accepted");
  assert.equal(h.q.size().pending, 2);
  const r = await h.q.submit(job(700));                                                             // the retryable redelivery
  assert.equal(r.status, "busy", JSON.stringify(r));
  const rec = recordOf(dir, job(700).jobId);
  assert.equal(rec.state, "confirmed");
  assert.equal(rec.generation, 1);
  assert.equal(fs.existsSync(path.join(dir, "inputs", job(700).jobId + ".json")), false);
  assert.equal(h.q.size().pending, 2);
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM9 once a slot frees, the same confirmed/retryable delivery regenerates EXACTLY once; a further redelivery while received is an ordinary duplicate", async () => {
  const dir = tmpJournalDir(), hold = latch(), gate2 = latch();
  const api = fakeApi(async (n, r) => (r.jobId === job(710).jobId && n === 1 ? { delivered: true, status: 200, confirmedAs: "retryable" } : null));
  const sandbox = fakeSandbox(async j => { if (j.jobId === job(711).jobId) await hold.promise; if (j.jobId === job(710).jobId && sandbox.count(job(710).jobId) > 1) await gate2.promise; });
  const h = await boot(dir, { maxPending: 1, sandbox, api });
  assert.equal((await h.q.submit(job(710))).status, "accepted");
  await waitFor(() => recordOf(dir, job(710).jobId)?.state === "confirmed");
  assert.equal((await h.q.submit(job(711))).status, "accepted");                                    // fills the single slot
  assert.equal((await h.q.submit(job(710))).status, "busy");
  assert.equal(recordOf(dir, job(710).jobId).generation, 1);
  hold.open();
  await waitFor(() => recordOf(dir, job(711).jobId)?.state === "confirmed");
  const again = await h.q.submit(job(710));
  assert.deepEqual(again, { status: "duplicate", state: "received" });
  assert.equal(recordOf(dir, job(710).jobId).generation, 2);
  const third = await h.q.submit(job(710));                                                          // already regenerated: ordinary duplicate
  assert.equal(third.status, "duplicate");
  assert.equal(recordOf(dir, job(710).jobId).generation, 2);
  gate2.open(); await h.q.idle();
  assert.equal(h.sandbox.count(job(710).jobId), 2);                                                 // generation 1 + generation 2, never more
  await crash(h);
});

test("ADM10 a callback_failed → executed re-arm stays allowed under full maxPending and consumes no LIVE slot", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const api = fakeApi(async (n, r) => (r.jobId === job(720).jobId && n === 1 ? { delivered: false, retryable: false, status: 401, errorClass: "http" } : null));
  const sandbox = fakeSandbox(async j => { if (j.jobId !== job(720).jobId) await s.hold.promise; });
  const h = await boot(dir, { maxPending: 2, sandbox, api });
  assert.equal((await h.q.submit(job(720))).status, "accepted");
  await waitFor(() => recordOf(dir, job(720).jobId)?.state === "callback_failed");
  assert.equal((await h.q.submit(job(721))).status, "accepted");
  assert.equal((await h.q.submit(job(722))).status, "accepted");
  assert.equal((await h.q.submit(job(723))).status, "busy");                                        // full
  const r = await h.q.submit(job(720));
  assert.deepEqual(r, { status: "duplicate", state: "executed" });                                  // re-armed, not refused
  assert.equal(h.q.size().pending, 2);                                                              // executed is not LIVE
  await waitFor(() => recordOf(dir, job(720).jobId)?.state === "confirmed");
  s.hold.open(); await h.q.idle(); await crash(h);
});

// ── maxActive stays separate; the admission authority never covers execution or delivery ─────────────────────────────
test("ADM11 maxActive=1: physical execution never exceeds one although several jobs are accepted concurrently", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 4, maxActive: 1, sandbox: s.sandbox });
  const results = await Promise.all(jobs(4, 800).map(j => h.q.submit(j)));
  assert.equal(count(results, "accepted"), 4);
  await sleep(30);
  assert.equal(h.q.size().active, 1);
  assert.equal(s.peak(), 1);
  s.hold.open(); await h.q.idle();
  assert.equal(s.peak(), 1);
  await crash(h);
});

test("ADM12 a slow execution does not hold the admission authority: a second job is admitted while the first still executes", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 2, sandbox: s.sandbox });
  assert.equal((await h.q.submit(job(810))).status, "accepted");
  await waitFor(() => s.running() === 1);
  const second = await Promise.race([h.q.submit(job(811)), sleep(1500).then(() => ({ status: "timeout" }))]);
  assert.equal(second.status, "accepted");
  assert.equal(s.running(), 1);
  s.hold.open(); await h.q.idle(); await crash(h);
});

// ── failure release / liveness ────────────────────────────────────────────────────────────────────────────────────────
for (const method of ["writeInput", "writeRecord"]) {
  test(`ADM13–14 a ${method} failure returns busy, leaves no phantom record and releases the admission authority`, async () => {
    const dir = tmpJournalDir(), s = holdingSandbox();
    const h = await boot(dir, { maxPending: 4, sandbox: s.sandbox });
    const f = failing(h.journal, method, 1);
    const before = unhandled;
    assert.equal((await h.q.submit(job(900))).status, "busy");
    assert.equal(f.failures(), 1);
    assert.equal(h.q.size().entries, 0);
    assert.equal(fs.readdirSync(path.join(dir, "jobs")).length, 0);
    assert.equal(fs.existsSync(path.join(dir, "inputs", job(900).jobId + ".json")), false);
    const later = await Promise.race([h.q.submit(job(901)), sleep(1500).then(() => ({ status: "timeout" }))]);
    assert.equal(later.status, "accepted");                                                       // ADM16
    assert.equal((await h.q.submit(job(900))).status, "accepted");
    assert.equal(unhandled, before);
    s.hold.open(); await h.q.idle(); await crash(h);
  });
}

// Review fix 1 (target authority): the target index is advanced AFTER the durable accepted commit, so a writeTarget failure can
// no longer refuse an admission whose record is durable — it is accepted, the authority is correct in memory, the durable index
// lags EXPLICITLY (status().targetIndexLag, logged) and is repaired by maintenance; a crash before that is repaired from the
// record at the next start (TAR4 / TAR12). The admission authority is released either way.
test("ADM15 a writeTarget failure (after the durable commit) is accepted with an explicit, repaired index lag; the authority holds and the admission authority is released", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 4, sandbox: s.sandbox });
  const f = failing(h.journal, "writeTarget", 1);
  const versioned = { revision: 1, targetRef: TARGET };
  const before = unhandled;
  assert.equal((await h.q.submit(job(900, versioned))).status, "accepted");
  assert.equal(f.failures(), 1);
  assert.equal(h.q.size().entries, 1);
  assert.equal(recordOf(dir, job(900).jobId).state, "received");
  assert.equal(await h.journal.readTarget(TARGET), null);                                          // the durable index lags …
  assert.equal(h.q.status().targetIndexLag, 1);                                                    // … visibly
  const later = await Promise.race([h.q.submit(job(901, versioned)), sleep(1500).then(() => ({ status: "timeout" }))]);
  assert.equal(later.status, "conflict");                                                          // ADM16: released; rev 1 is owned by 900
  assert.equal((await h.q.submit(job(900, versioned))).status, "duplicate");
  assert.equal((await h.q.submit(job(902))).status, "accepted");
  await h.q.maintain();
  assert.equal(h.q.status().targetIndexLag, 0);
  assert.equal((await h.journal.readTarget(TARGET)).jobId, job(900).jobId);
  assert.equal(unhandled, before);
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM16 after an internal admission rejection (maintenance throws) and an injected write failure, later VALID submits on the SAME queue still succeed (no wedged admission authority)", async () => {
  const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };
  const dir = tmpJournalDir(), s = holdingSandbox(), now = clock();
  const h = await boot(dir, { now, maxPending: 8, sandbox: s.sandbox, limits: { maxRecords: 2, confirmedRetentionMs: 1000 } });
  assert.equal((await h.q.submit(job(910))).status, "accepted");
  assert.equal((await h.q.submit(job(911))).status, "accepted");
  const realMaintain = h.q.maintain;
  h.q.maintain = async () => { throw new Error("injected maintenance failure"); };            // records.size ≥ maxRecords → maintain REJECTS inside the admission section
  const before = unhandled;
  assert.equal((await h.q.submit(job(912))).status, "busy");
  h.q.maintain = realMaintain;
  assert.equal((await h.q.submit(job(912))).status, "busy");                                        // legitimately full: two live records, nothing expired
  s.hold.open(); await h.q.idle();
  await waitFor(() => recordOf(dir, job(911).jobId)?.state === "confirmed");
  now.advance(2000);                                                                                // retention may now free the two confirmed records
  const later = await Promise.race([h.q.submit(job(912)), sleep(3000).then(() => ({ status: "timeout" }))]);
  assert.equal(later.status, "accepted", "admission authority wedged after an internal rejection: " + JSON.stringify(later));
  const origInput = h.journal.writeInput.bind(h.journal);
  h.journal.writeInput = async () => { throw new Error("injected writeInput failure"); };
  assert.equal((await h.q.submit(job(913))).status, "busy");
  h.journal.writeInput = origInput;
  const results = await Promise.race([Promise.all([job(914), job(915)].map(j => h.q.submit(j))), sleep(3000).then(() => null)]);
  assert.ok(results, "admission authority wedged after a failed write");
  assert.ok(count(results, "accepted") + count(results, "busy") === 2 && count(results, "accepted") >= 1, JSON.stringify(results));
  assert.equal(unhandled, before);
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM17 stop() while submissions wait for admission: no post-stop admission record is committed; waiters get busy", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 8, sandbox: s.sandbox });
  const g = gate(h.journal, "writeRecord");
  const first = h.q.submit(job(930));                                                              // in flight at the write gate
  await waitFor(() => g.calls() >= 1);
  const waiting = [h.q.submit(job(931)), h.q.submit(job(932))];
  await sleep(20);
  h.q.stop();
  g.open();
  const [r1, ...rest] = await Promise.all([first, ...waiting]);
  assert.ok(["accepted", "busy"].includes(r1.status));
  for (const r of rest) assert.equal(r.status, "busy", JSON.stringify(r));
  const files = fs.readdirSync(path.join(dir, "jobs"));
  assert.ok(files.length <= 1, "post-stop records: " + files.join(", "));
  assert.equal(files.includes(job(931).jobId + ".json"), false);
  assert.equal(files.includes(job(932).jobId + ".json"), false);
  await h.journal.close();
});

// ── target revision authority under concurrency ───────────────────────────────────────────────────────────────────────
test("ADM18 revisions 7 and 8 of one target arriving concurrently: the target authority ends at 8, never regresses to 7", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 8, sandbox: s.sandbox });
  const original = h.journal.writeTarget.bind(h.journal);
  h.journal.writeTarget = async doc => { if (doc.revision === 7) await sleep(40); return original(doc); };   // the OLDER revision's write lands LAST
  const r7 = job(940, { revision: 7, targetRef: TARGET }), r8 = job(941, { revision: 8, targetRef: TARGET });
  const [a, b] = await Promise.all([h.q.submit(r8), h.q.submit(r7)]);
  assert.equal(a.status, "accepted");
  assert.ok(["accepted", "stale"].includes(b.status), JSON.stringify(b));
  const targets = await h.journal.listTargets({ maxEntries: 10 });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].revision, 8, "target authority regressed: " + JSON.stringify(targets[0]));
  assert.equal(targets[0].jobId, r8.jobId);
  s.hold.open(); await h.q.idle();
  assert.equal(recordOf(dir, r8.jobId).state, "confirmed");
  assert.ok(["superseded", "confirmed"].includes(recordOf(dir, r7.jobId)?.state ?? "superseded"));
  await crash(h);
});

test("ADM19 revision 8 already authoritative: a later / concurrent revision 7 is STALE", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 8, sandbox: s.sandbox });
  assert.equal((await h.q.submit(job(950, { revision: 8, targetRef: TARGET }))).status, "accepted");
  const results = await Promise.all([job(951, { revision: 7, targetRef: TARGET }), job(952, { revision: 7, targetRef: TARGET })].map(j => h.q.submit(j)));
  assert.deepEqual(results.map(r => r.status), ["stale", "stale"]);
  assert.equal((await h.journal.listTargets({ maxEntries: 10 }))[0].revision, 8);
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM20 the same target revision with different job ids concurrently: one accepted, the other JOB_ID_CONFLICT", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 8, sandbox: s.sandbox });
  const g = gate(h.journal, "writeRecord");
  const results = await burst(h.q, [job(960, { revision: 3, targetRef: TARGET }), job(961, { revision: 3, targetRef: TARGET }), job(962, { revision: 3, targetRef: TARGET })], [g]);
  assert.equal(count(results, "accepted"), 1, JSON.stringify(results.map(r => r.status)));
  assert.equal(count(results, "conflict"), 2);
  assert.equal(fs.readdirSync(path.join(dir, "jobs")).length, 1);
  s.hold.open(); await h.q.idle(); await crash(h);
});

// ── truncated journal, duplicates at full capacity, durable commit point, serialization scope ─────────────────────────
test("ADM21 a truncated journal index refuses every concurrent admission fail-closed", async () => {
  const dir = tmpJournalDir();
  const h1 = await boot(dir, { maxPending: 64 });
  for (let i = 0; i < 24; i++) assert.equal((await h1.q.submit(job(1000 + i))).status, "accepted");
  await h1.q.idle(); await crash(h1);
  const h2 = await boot(dir, { maxPending: 64, limits: { startupScanMax: 8 } });
  assert.equal(h2.summary.truncated, true);
  const results = await Promise.all(jobs(6, 1100).map(j => h2.q.submit(j)));
  assert.deepEqual([...new Set(results.map(r => r.status))], ["busy"]);
  assert.equal(h2.q.size().pending, 0);
  await crash(h2);
});

test("ADM22 ordinary duplicates of received / running / executed jobs stay usable when capacity is otherwise full", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 2, maxActive: 1, sandbox: s.sandbox });
  assert.equal((await h.q.submit(job(1200))).status, "accepted");                                   // running (held)
  assert.equal((await h.q.submit(job(1201))).status, "accepted");                                   // received
  assert.equal((await h.q.submit(job(1202))).status, "busy");
  await waitFor(() => s.running() === 1);
  assert.deepEqual(await h.q.submit(job(1200)), { status: "duplicate", state: "running" });
  assert.deepEqual(await h.q.submit(job(1201)), { status: "duplicate", state: "received" });
  assert.equal(h.q.size().pending, 2);
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM23 no request resolves «accepted» before its durable writeRecord resolves", async () => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 2, sandbox: s.sandbox });
  const g = gate(h.journal, "writeRecord");
  let settled = null;
  const p = h.q.submit(job(1300)).then(r => { settled = r; return r; });
  await waitFor(() => g.calls() >= 1);
  await sleep(60);
  assert.equal(settled, null);                                                                      // still waiting for the durable write
  assert.equal(h.q.size().entries, 0);
  g.open();
  assert.equal((await p).status, "accepted");
  assert.equal(recordOf(dir, job(1300).jobId).state, "received");
  s.hold.open(); await h.q.idle(); await crash(h);
});

test("ADM24 the admission authority is released before execution and before callback delivery (both held) — later admissions proceed", async () => {
  const dir = tmpJournalDir(), exec = latch(), deliverHold = latch();
  const sandbox = fakeSandbox(async j => { if (j.jobId === job(1400).jobId) await exec.promise; });
  const api = fakeApi(async (n, r) => { if (r.jobId === job(1400).jobId) await deliverHold.promise; return null; });
  const h = await boot(dir, { maxPending: 3, sandbox, api });
  assert.equal((await h.q.submit(job(1400))).status, "accepted");
  await waitFor(() => recordOf(dir, job(1400).jobId)?.state === "running");
  const during = await Promise.race([h.q.submit(job(1401)), sleep(1500).then(() => ({ status: "timeout" }))]);
  assert.equal(during.status, "accepted");                                                          // while 1400 executes
  exec.open();
  await waitFor(() => h.api.attempts(job(1400).jobId) === 1);                                       // 1400's callback is now in flight and held
  const whileDelivering = await Promise.race([h.q.submit(job(1402)), sleep(1500).then(() => ({ status: "timeout" }))]);
  assert.equal(whileDelivering.status, "accepted");
  deliverHold.open(); await h.q.idle(); await crash(h);
});

test("ADM25 100 bounded concurrent submit attempts: no deadlock, no over-admission, every request answered (performance micro-test)", async t => {
  const dir = tmpJournalDir(), s = holdingSandbox();
  const h = await boot(dir, { maxPending: 10, sandbox: s.sandbox, limits: { maxRecords: 2048 } });
  const original = h.journal.writeRecord.bind(h.journal);
  h.journal.writeRecord = async rec => { await sleep(Math.floor(Math.random() * 3)); return original(rec); };
  const t0 = Date.now();
  const results = await Promise.race([Promise.all(jobs(100, 2000).map(j => h.q.submit(j))), sleep(20000).then(() => null)]);
  const elapsed = Date.now() - t0;
  assert.ok(results, "deadlock / no answer within 20 s");
  const accepted = count(results, "accepted"), busy = count(results, "busy");
  assert.equal(accepted + busy, 100);
  assert.ok(accepted <= 10, "over-admission: " + accepted);
  assert.equal(h.q.size().pending, accepted);
  t.diagnostic(`ADM25 100 concurrent submits: ${elapsed} ms total, accepted=${accepted}, busy=${busy}`);
  assert.equal(unhandled, 0);
  s.hold.open(); await h.q.idle(); await crash(h);
});
