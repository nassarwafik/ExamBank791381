"use strict";
// Phase 17F-B3 — Independent Review Fix 1: the DURABLE TARGET REVISION AUTHORITY (node:test, no Docker; a REAL on-disk journal
// in a temp directory per test, like the other 17D-B2 / 17F-B3 suites).
//
// Review 1 of PR #250 found two production correctness blockers in the B3 head (8f8cfc2):
//   RF1-A  PHANTOM TARGET AUTHORITY — submit() advanced the target index (writeTarget + targets.set) BEFORE the durable accepted
//          commit (writeRecord). A writeRecord failure left the index (disk + memory) pointing at a job that was never accepted:
//          every later job of that revision got a false JOB_ID_CONFLICT, and the phantom survived a restart.
//   RF1-B  maintain() deleted target index entries (journal.deleteTarget + targets.delete) OUTSIDE the admission authority, so a
//          retention pass that had already decided to prune a stale entry could delete the entry of a revision admitted meanwhile.
//   RF1-C  start() loaded records and targets independently and trusted whatever the interrupted transaction left behind.
// New protocol (official.js): the durable RECORD is the authority of a revision; the target index is advanced ONLY AFTER the durable
// accepted commit (memory first, then the durable index); a failed index write is logged, counted, retried under the admission
// authority and derived again from the records at startup; EVERY mutation of the index (admission, retention, startup repair)
// runs under the ONE admission authority (withAdmission), without re-entering it from inside an admission transaction.
// Fail-first on 8f8cfc2: TAR1, TAR2, TAR3, TAR4, TAR5, TAR6, TAR7, TAR8, TAR9, TAR10, TAR12, TAR14 fail; TAR11 and TAR13 pin
// pre-existing behaviour (no deadlock between the two retention paths, retained target history survives a restart).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const H = require("../helpers/durable.js");
const { job, TARGET, tmpJournalDir, recordOf, fakeSandbox, latch, boot, crash, waitFor, sleep, quiet, capture } = H;
const { signRequest } = require("../../gateway/auth.js");
const { createGatewayServer } = require("../../gateway/server.js");

let unhandled = 0;
process.on("unhandledRejection", () => { unhandled++; });
const TARGET2 = "tr_" + "cd".repeat(20);
const v = (n, revision, targetRef = TARGET) => job(n, { revision, targetRef });
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };
const targetFile = dir => path.join(dir, "targets", TARGET + ".json");
const targetOnDisk = dir => { try { return JSON.parse(fs.readFileSync(targetFile(dir), "utf8")); } catch { return null; } };
const authority = t => (t ? { revision: t.revision, jobId: t.jobId } : null);
/** A sandbox that HOLDS every execution open (accepted work stays LIVE). */
function holdingSandbox() { const hold = latch(); return { sandbox: fakeSandbox(async () => { await hold.promise; }), hold }; }
/** Gates one journal method: every call waits until `open()`; the real operation runs afterwards. */
function gate(journal, method) {
  const original = journal[method].bind(journal);
  const g = latch();
  let calls = 0;
  journal[method] = async (...args) => { calls++; await g.promise; return original(...args); };
  return { open: g.open, calls: () => calls, restore: () => { journal[method] = original; } };
}
/** Makes one journal method throw exactly `times` times (then the real operation runs). */
function failing(journal, method, times = 1) {
  const original = journal[method].bind(journal);
  let left = times, failures = 0;
  journal[method] = async (...args) => { if (left > 0) { left--; failures++; throw new Error("injected " + method + " failure"); } return original(...args); };
  return { failures: () => failures };
}
const bounded = (p, ms, label) => Promise.race([p, sleep(ms).then(() => { throw new Error(label + ": not settled within " + ms + " ms (deadlock?)"); })]);
/** rev 7 of TARGET accepted, executed and confirmed on a fresh queue (the authority is rev 7 / job 700). */
async function withRev7(dir, opts = {}) {
  const h = await boot(dir, { maxPending: 8, ...opts });
  assert.equal((await h.q.submit(v(700, 7))).status, "accepted");
  await h.q.idle();
  assert.equal(recordOf(dir, v(700, 7).jobId).state, "confirmed");
  assert.deepEqual(authority(targetOnDisk(dir)), { revision: 7, jobId: v(700, 7).jobId });
  return h;
}

// ── RF1-A — a failed admission never leaves phantom target authority ─────────────────────────────────────────────────
test("TAR1 rev 7 authoritative; a rev 8 admission whose writeRecord fails → busy, no record, authority still rev 7 (disk + memory); another valid rev 8 job is admitted (no phantom conflict)", async () => {
  const dir = tmpJournalDir(), h = await withRev7(dir), before = unhandled;
  const f = failing(h.journal, "writeRecord", 1);
  const failed = v(701, 8);
  assert.equal((await h.q.submit(failed)).status, "busy");
  assert.equal(f.failures(), 1);
  assert.equal(recordOf(dir, failed.jobId), null);
  assert.equal(fs.existsSync(path.join(dir, "inputs", failed.jobId + ".json")), false);
  assert.deepEqual(authority(targetOnDisk(dir)), { revision: 7, jobId: v(700, 7).jobId }, "durable authority advanced by a failed admission");
  assert.deepEqual(authority(await h.journal.readTarget(TARGET)), { revision: 7, jobId: v(700, 7).jobId });
  const other = v(702, 8);
  assert.equal((await h.q.submit(other)).status, "accepted", "phantom target authority: a valid rev 8 job refused");   // memory authority
  assert.deepEqual(authority(targetOnDisk(dir)), { revision: 8, jobId: other.jobId });
  assert.equal((await h.q.submit(v(703, 7))).status, "stale");
  assert.equal(unhandled, before);
  await h.q.idle(); await crash(h);
});

test("TAR2 no previous target: a rev 1 admission whose writeRecord fails → busy, the target is NOT owned by the failed job; another rev 1 job is accepted", async () => {
  const dir = tmpJournalDir(), h = await boot(dir, { maxPending: 8 }), before = unhandled;
  failing(h.journal, "writeRecord", 1);
  const failed = v(710, 1);
  assert.equal((await h.q.submit(failed)).status, "busy");
  assert.equal(recordOf(dir, failed.jobId), null);
  assert.equal(await h.journal.readTarget(TARGET), null, "a failed admission created target authority");
  assert.equal((await h.journal.listTargets({ maxEntries: 10 })).length, 0);
  const other = v(711, 1);
  assert.equal((await h.q.submit(other)).status, "accepted");
  assert.deepEqual(authority(await h.journal.readTarget(TARGET)), { revision: 1, jobId: other.jobId });
  assert.equal(unhandled, before);
  await h.q.idle(); await crash(h);
});

test("TAR3 TAR1 then a restart BEFORE the retry: the recovered authority is rev 7 (never the failed job); a valid rev 8 job is admitted after the restart", async () => {
  const dir = tmpJournalDir(), h = await withRev7(dir);
  failing(h.journal, "writeRecord", 1);
  const failed = v(701, 8);
  assert.equal((await h.q.submit(failed)).status, "busy");
  await crash(h);                                                                                   // nothing in memory survives
  const h2 = await boot(dir, { maxPending: 8 });
  const targets = await h2.journal.listTargets({ maxEntries: 10 });
  assert.equal(targets.length, 1);
  assert.deepEqual(authority(targets[0]), { revision: 7, jobId: v(700, 7).jobId }, "phantom target authority survived the restart");
  const other = v(702, 8);
  assert.equal((await h2.q.submit(other)).status, "accepted", "phantom conflict after the restart");
  assert.equal((await h2.q.submit(failed)).status, "conflict");                                    // legitimate now: 702 owns rev 8
  await h2.q.idle();
  assert.equal(recordOf(dir, other.jobId).state, "confirmed");
  await crash(h2);
});

test("TAR4 the durable index write fails AFTER the accepted commit: the lag is explicit (logged + counted, never hidden), the authority stays correct (no false accept / conflict / stale), no unhandled rejection, and the next maintenance pass repairs the durable index", async () => {
  const dir = tmpJournalDir(), logger = capture(), h = await withRev7(dir, { logger }), before = unhandled;
  const f = failing(h.journal, "writeTarget", 2);                                                   // the retry inside the same pass fails too
  const accepted = v(741, 8);
  assert.equal((await h.q.submit(accepted)).status, "accepted");                                    // its record IS durable: the commit point is unchanged
  assert.equal(recordOf(dir, accepted.jobId).revision, 8);
  assert.deepEqual(authority(targetOnDisk(dir)), { revision: 7, jobId: v(700, 7).jobId });        // the durable index lags …
  assert.equal(h.q.status().targetIndexLag, 1, "the failed index write is hidden");                 // … and that is visible
  assert.ok(logger.events().some(e => e.event === "coding.runner.target.write-failed" && e.jobId === accepted.jobId && e.revision === 8), "the failed index write is not logged");
  assert.ok(!logger.lines.some(l => l.includes(TARGET)), "the opaque target reference is logged");
  assert.equal((await h.q.submit(v(742, 8))).status, "conflict", "rev 8 is owned by the accepted job");
  assert.equal((await h.q.submit(v(743, 7))).status, "stale");
  assert.equal((await h.q.submit(accepted)).status, "duplicate");
  assert.deepEqual(await h.q.maintain(), { pruned: 0, prunedTargets: 0 });                          // second failure: still lagging, still explicit
  assert.equal(f.failures(), 2);
  assert.equal(h.q.status().targetIndexLag, 1);
  await h.q.maintain();                                                                             // the retry under the admission authority succeeds
  assert.equal(h.q.status().targetIndexLag, 0);
  assert.deepEqual(authority(targetOnDisk(dir)), { revision: 8, jobId: accepted.jobId }, "durable index not repaired");
  assert.ok(logger.events().some(e => e.event === "coding.runner.target.repaired" && e.jobId === accepted.jobId && e.stage === "maintenance"));
  assert.equal((await h.q.submit(v(744, 9))).status, "accepted");
  assert.equal(unhandled, before);
  await h.q.idle(); await crash(h);
});

test("TAR5 HTTP: a versioned POST whose writeRecord fails → 503 RUNNER_BUSY; the retry of the same delivery → 202; a NEW job id of the same revision → 202 (never a false 409)", async () => {
  const dir = tmpJournalDir(), h = await boot(dir, { maxPending: 8 });
  const server = createGatewayServer({ key: H.KEY, sandbox: h.sandbox, maxConcurrency: 2, logger: quiet(), officialQueue: h.q });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const post = body => {
    const raw = Buffer.from(JSON.stringify(body));
    const headers = { "content-type": "application/json", "content-length": String(raw.length), ...signRequest({ key: H.KEY, method: "POST", path: "/v1/official-grading-jobs", timestamp: String(Math.floor(Date.now() / 1000)), requestId: "tar_" + crypto.randomBytes(9).toString("hex"), body: raw }) };
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/v1/official-grading-jobs", headers }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(p).toString("utf8") || "null") })); });
      req.on("error", reject); req.end(raw);
    });
  };
  try {
    failing(h.journal, "writeRecord", 1);
    const a = v(750, 3);
    assert.deepEqual(await post(a), { status: 503, json: { ok: false, code: "RUNNER_BUSY" } });
    assert.deepEqual(await post(a), { status: 202, json: { ok: true, accepted: true, duplicate: false } });          // the same delivery, retried
    await h.q.idle();                                                                                              // (its lifecycle writes must not consume the next injected failure)
    failing(h.journal, "writeRecord", 1);
    const c = v(751, 5, TARGET2);
    assert.deepEqual(await post(c), { status: 503, json: { ok: false, code: "RUNNER_BUSY" } });
    const d = v(752, 5, TARGET2);                                                                                   // SmartAssess re-issued the revision under a new id
    assert.deepEqual(await post(d), { status: 202, json: { ok: true, accepted: true, duplicate: false } }, "false JOB_ID_CONFLICT from phantom authority");
    assert.deepEqual(await post(c), { status: 409, json: { ok: false, code: "JOB_ID_CONFLICT" } });                 // legitimate: 752 owns rev 5
    assert.deepEqual(await post(v(753, 4, TARGET2)), { status: 409, json: { ok: false, code: "STALE_REVISION" } });
  } finally { await new Promise(r => server.close(r)); await h.q.idle(); await crash(h); }
});

// ── RF1-B — target pruning obeys the admission authority ─────────────────────────────────────────────────────────────
/** rev 8 confirmed and old enough to prune; a maintenance pass is PAUSED right before journal.deleteTarget; rev 9 is admitted meanwhile; the pass resumes. */
async function pruneRace(dir, opts = {}) {
  const now = clock(), s = holdingSandbox();
  const h = await boot(dir, { now, maxPending: 8, limits: { confirmedRetentionMs: 60000, failedRetentionMs: 1000 }, ...opts });
  const old = v(760, 8);
  assert.equal((await h.q.submit(old)).status, "accepted");
  s.hold.open(); await h.q.idle();
  assert.equal(recordOf(dir, old.jobId).state, "confirmed");
  now.advance(5000);                                                                                 // the rev 8 index entry is prunable: old, no LIVE / executed job
  const g = gate(h.journal, "deleteTarget");
  const pass = h.q.maintain();
  await waitFor(() => g.calls() >= 1);                                                              // paused right before the delete
  const newer = v(761, 9);
  const admission = h.q.submit(newer);                                                              // concurrent versioned admission
  await sleep(30);
  g.open();
  const [passResult, admitted] = await bounded(Promise.all([pass, admission]), 5000, "maintenance + admission");
  assert.equal(admitted.status, "accepted");
  return { h, now, s, old, newer, passResult };
}

test("TAR6 maintenance paused right before deleting the stale rev 8 entry, rev 9 admitted meanwhile: the final authority is rev 9 / the rev 9 job — never missing, never rev 8", async () => {
  const dir = tmpJournalDir(), r = await pruneRace(dir);
  const targets = await r.h.journal.listTargets({ maxEntries: 10 });
  assert.equal(targets.length, 1, "target authority deleted by the retention pass: " + JSON.stringify(targets));
  assert.deepEqual(authority(targets[0]), { revision: 9, jobId: r.newer.jobId });
  assert.deepEqual(r.passResult, { pruned: 0, prunedTargets: 1 });                                  // the stale rev 8 entry was pruned, under the authority
  await r.h.q.idle(); await crash(r.h);
});

test("TAR7 same race, verified on disk (journal.readTarget) and after a restart: the durable authority is rev 9 / the rev 9 job", async () => {
  const dir = tmpJournalDir(), r = await pruneRace(dir);
  assert.deepEqual(authority(await r.h.journal.readTarget(TARGET)), { revision: 9, jobId: r.newer.jobId }, "durable target authority lost");
  assert.deepEqual(authority(targetOnDisk(dir)), { revision: 9, jobId: r.newer.jobId });
  await r.h.q.idle(); await crash(r.h);
  const h2 = await boot(dir, { now: r.now, maxPending: 8, limits: { confirmedRetentionMs: 60000, failedRetentionMs: 1000 } });
  assert.deepEqual(authority(await h2.journal.readTarget(TARGET)), { revision: 9, jobId: r.newer.jobId });
  assert.equal((await h2.q.submit(v(762, 8))).status, "stale");
  await crash(h2);
});

test("TAR8 after the race, a rev 8 delivery is STALE (the authority was not regressed or lost)", async () => {
  const dir = tmpJournalDir(), r = await pruneRace(dir);
  assert.equal((await r.h.q.submit(v(763, 8))).status, "stale", "authority lost: an older revision was admitted");
  assert.equal(recordOf(dir, v(763, 8).jobId), null);
  await r.h.q.idle(); await crash(r.h);
});

test("TAR9 after the race, the same rev 9 under another job id is JOB_ID_CONFLICT", async () => {
  const dir = tmpJournalDir(), r = await pruneRace(dir);
  assert.equal((await r.h.q.submit(v(764, 9))).status, "conflict", "authority lost: rev 9 admitted twice");
  assert.equal((await r.h.q.submit(r.newer)).status, "duplicate");
  await r.h.q.idle(); await crash(r.h);
});

test("TAR10 maintenance interleaved with many versioned admissions (the pass is requested while each admission is mid-commit): the final authority is the highest durably admitted revision", async () => {
  const dir = tmpJournalDir(), now = clock(), before = unhandled;
  const h = await boot(dir, { now, maxPending: 8, limits: { confirmedRetentionMs: 60000, failedRetentionMs: 1000 } });
  let last = null;
  for (let rev = 1; rev <= 12; rev++) {
    if (rev > 1) now.advance(2000);                                                                // the previous entry is prunable (old, confirmed) during this round
    const g = gate(h.journal, "writeRecord");
    const j = v(770 + rev, rev);
    const admission = h.q.submit(j);
    await waitFor(() => g.calls() >= 1);                                                           // the admission holds the authority, mid-commit
    const pass = h.q.maintain();                                                                   // a retention pass requested right now
    await sleep(10);
    g.open();
    const [admitted] = await bounded(Promise.all([admission, pass]), 5000, "round " + rev);
    g.restore();
    assert.equal(admitted.status, "accepted", "round " + rev);
    await h.q.idle();
    assert.equal(recordOf(dir, j.jobId).state, "confirmed");
    last = j;
  }
  await h.q.maintain();
  const targets = await h.journal.listTargets({ maxEntries: 10 });
  assert.equal(targets.length, 1, "authority lost: " + JSON.stringify(targets));
  assert.deepEqual(authority(targets[0]), { revision: 12, jobId: last.jobId });
  assert.equal((await h.q.submit(v(790, 11))).status, "stale");
  assert.equal((await h.q.submit(v(791, 12))).status, "conflict");
  assert.equal(unhandled, before);
  await crash(h);
});

test("TAR11 no deadlock: records.size ≥ maxRecords makes submit() run retention INSIDE its admission transaction while a periodic maintenance pass is active (bounded)", async () => {
  const dir = tmpJournalDir(), now = clock(), before = unhandled;
  const h = await boot(dir, { now, maxPending: 8, limits: { maxRecords: 2, confirmedRetentionMs: 1000, failedRetentionMs: 1000 } });
  assert.equal((await h.q.submit(v(800, 1))).status, "accepted");
  assert.equal((await h.q.submit(job(801))).status, "accepted");
  await h.q.idle();
  now.advance(5000);                                                                                // both confirmed records and the rev 1 entry are expired
  const g = gate(h.journal, "removeJob");
  const periodic = h.q.maintain();                                                                  // the periodic path, paused mid-prune (holding one per-job lock)
  await waitFor(() => g.calls() >= 1);
  const submits = [job(802), job(803), v(804, 2)].map(j => h.q.submit(j));                          // each one: full → retention from inside the admission
  const second = h.q.maintain();
  await sleep(30);
  g.open();
  const [passResult, results] = await bounded(Promise.all([periodic, Promise.all(submits), second]), 5000, "submit retention vs periodic maintenance");
  assert.ok(passResult.pruned + passResult.prunedTargets >= 1, JSON.stringify(passResult));
  assert.ok(results.every(r => r.status === "accepted" || r.status === "busy"), JSON.stringify(results));
  assert.ok(results.filter(r => r.status === "accepted").length >= 1, JSON.stringify(results));
  assert.ok(h.q.size().entries <= 2);
  assert.equal(unhandled, before);
  await h.q.idle(); await crash(h);
});

// ── RF1-C — startup consistency of the target index ──────────────────────────────────────────────────────────────────
test("TAR12 crash after the accepted commit and before the durable index write: the restart derives the authority from the record BEFORE anything executes; the retry is a duplicate; conflict / stale decisions hold", async () => {
  const dir = tmpJournalDir(), h = await withRev7(dir), logger = capture();
  failing(h.journal, "writeTarget", 1);
  const accepted = v(721, 8);
  assert.equal((await h.q.submit(accepted)).status, "accepted");
  await crash(h);                                                                                   // dead before the maintenance retry: record rev 8 on disk, index still rev 7
  assert.equal(recordOf(dir, accepted.jobId).state, "received");
  assert.deepEqual(authority(targetOnDisk(dir)), { revision: 7, jobId: v(700, 7).jobId });
  let seen = null;
  const sandbox = fakeSandbox(async j => { if (j.jobId === accepted.jobId) seen = authority(targetOnDisk(dir)); });
  const h2 = await boot(dir, { maxPending: 8, sandbox, logger });
  assert.equal(h2.summary.recovered.received, 1);
  assert.equal(h2.summary.targets.repaired, 1, "startup did not repair the lagging index");
  assert.deepEqual(authority(await h2.journal.readTarget(TARGET)), { revision: 8, jobId: accepted.jobId });
  assert.ok(logger.events().some(e => e.event === "coding.runner.target.repaired" && e.jobId === accepted.jobId && e.revision === 8 && e.stage === "startup"));
  assert.equal((await h2.q.submit(accepted)).status, "duplicate");                                  // the retried delivery
  assert.equal((await h2.q.submit(v(722, 8))).status, "conflict");
  assert.equal((await h2.q.submit(v(723, 7))).status, "stale");
  await h2.q.idle();
  assert.deepEqual(seen, { revision: 8, jobId: accepted.jobId }, "executed under regressed authority");
  assert.equal(recordOf(dir, accepted.jobId).state, "confirmed");
  assert.equal(h2.q.status().targetIndexLag, 0);
  await crash(h2);
});

test("TAR13 legitimately retained target history (the confirmed record already pruned) is NOT destroyed by a restart and still orders later deliveries", async () => {
  const dir = tmpJournalDir(), now = clock();
  const limits = { confirmedRetentionMs: 1000, failedRetentionMs: 60000 };
  const h = await boot(dir, { now, maxPending: 8, limits });
  const j = v(730, 5);
  assert.equal((await h.q.submit(j)).status, "accepted");
  await h.q.idle();
  now.advance(5000);
  assert.deepEqual(await h.q.maintain(), { pruned: 1, prunedTargets: 0 });                          // the record goes, the index entry stays
  assert.equal(recordOf(dir, j.jobId), null);
  await crash(h);
  const h2 = await boot(dir, { now, maxPending: 8, limits });
  assert.deepEqual(h2.summary.targets, { repaired: 0, inconsistent: 0 });
  assert.deepEqual(authority(await h2.journal.readTarget(TARGET)), { revision: 5, jobId: j.jobId }, "retained target history destroyed at startup");
  assert.equal((await h2.q.submit(v(731, 4))).status, "stale");
  assert.equal((await h2.q.submit(v(732, 5))).status, "conflict");
  assert.equal((await h2.q.submit(v(733, 6))).status, "accepted");
  await h2.q.idle(); await crash(h2);
});

test("TAR14 startup repairs ONLY unambiguous states: a missing index for a record younger than the index retention is re-derived; a record older than the index retention (its entry may have been legitimately pruned) is left alone", async () => {
  const dir = tmpJournalDir(), now = clock();
  const limits = { confirmedRetentionMs: 60000, failedRetentionMs: 1000 };
  const h = await boot(dir, { now, maxPending: 8, limits });
  const young = v(745, 3), oldOne = v(746, 2, TARGET2);
  assert.equal((await h.q.submit(oldOne)).status, "accepted");
  assert.equal((await h.q.submit(young)).status, "accepted");
  await h.q.idle();
  await crash(h);
  fs.unlinkSync(targetFile(dir));                                                                   // the crash window of RF1-A for the YOUNG record (index never written)
  const h2 = await boot(dir, { now, maxPending: 8, limits });
  assert.deepEqual(h2.summary.targets, { repaired: 1, inconsistent: 0 });
  assert.deepEqual(authority(await h2.journal.readTarget(TARGET)), { revision: 3, jobId: young.jobId }, "unambiguous crash window not repaired");
  assert.deepEqual(authority(await h2.journal.readTarget(TARGET2)), { revision: 2, jobId: oldOne.jobId });   // consistent: untouched
  now.advance(5000);                                                                                // both entries are now older than failedRetentionMs: pruned legitimately …
  assert.deepEqual(await h2.q.maintain(), { pruned: 0, prunedTargets: 2 });
  assert.equal(await h2.journal.readTarget(TARGET), null);
  assert.equal(await h2.journal.readTarget(TARGET2), null);
  await crash(h2);
  const h3 = await boot(dir, { now, maxPending: 8, limits });                                        // … and a restart does NOT re-create them from the old confirmed records
  assert.deepEqual(h3.summary.targets, { repaired: 0, inconsistent: 0 });
  assert.equal(await h3.journal.readTarget(TARGET), null, "legitimately pruned history re-created");
  assert.equal(await h3.journal.readTarget(TARGET2), null, "legitimately pruned history re-created");
  assert.equal((await h3.q.submit(v(747, 1, TARGET2))).status, "accepted");                         // retention semantics unchanged: an old target accepts any revision again
  assert.equal((await h3.q.submit(v(748, 2))).status, "accepted");
  await h3.q.idle(); await crash(h3);
});
