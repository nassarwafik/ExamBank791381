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
  assert.equal((await h.journal.listTargets({ maxEntries: 10 })).targets.length, 0);
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
  const { targets } = await h2.journal.listTargets({ maxEntries: 10 });
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
  const { targets } = await r.h.journal.listTargets({ maxEntries: 10 });
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
  const { targets } = await h.journal.listTargets({ maxEntries: 10 });
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
  assert.deepEqual(h2.summary.targets, { repaired: 0, inconsistent: 0, blocked: 0, held: 0, scanned: 1, truncated: false });
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
  assert.deepEqual(h2.summary.targets, { repaired: 1, inconsistent: 0, blocked: 0, held: 0, scanned: 1, truncated: false });
  assert.deepEqual(authority(await h2.journal.readTarget(TARGET)), { revision: 3, jobId: young.jobId }, "unambiguous crash window not repaired");
  assert.deepEqual(authority(await h2.journal.readTarget(TARGET2)), { revision: 2, jobId: oldOne.jobId });   // consistent: untouched
  now.advance(5000);                                                                                // both entries are now older than failedRetentionMs: pruned legitimately …
  assert.deepEqual(await h2.q.maintain(), { pruned: 0, prunedTargets: 2 });
  assert.equal(await h2.journal.readTarget(TARGET), null);
  assert.equal(await h2.journal.readTarget(TARGET2), null);
  await crash(h2);
  const h3 = await boot(dir, { now, maxPending: 8, limits });                                        // … and a restart does NOT re-create them from the old confirmed records
  assert.deepEqual(h3.summary.targets, { repaired: 0, inconsistent: 0, blocked: 0, held: 0, scanned: 0, truncated: false });
  assert.equal(await h3.journal.readTarget(TARGET), null, "legitimately pruned history re-created");
  assert.equal(await h3.journal.readTarget(TARGET2), null, "legitimately pruned history re-created");
  assert.equal((await h3.q.submit(v(747, 1, TARGET2))).status, "accepted");                         // retention semantics unchanged: an old target accepts any revision again
  assert.equal((await h3.q.submit(v(748, 2))).status, "accepted");
  await h3.q.idle(); await crash(h3);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Independent Review Fix 2 — the in-memory target map is a CACHE of the durable index, never the only authority.
//   RF2-A  the bounded startup listing of targets/ was silently truncated (no signal, unlike the job scan). Target entries live
//          failedRetentionMs (7 days) while confirmed records live confirmedRetentionMs (24 h), so targets/ can legitimately hold
//          more entries than startupScanMax while the job scan is complete: an entry outside the warm cache was invisible to
//          submit(), which then accepted an older revision or a second job id of the same revision.
//   RF2-B  the startup repair chose between two records of the SAME revision by scan order (the pre-B3 gateway could race on
//          same targetRef / same revision / different ids — ADM20 proves it): startup must reason by revision groups, preserve an
//          existing durable index that selects one of them, and otherwise fail closed — never a scan-order winner.
// Fail-first on dcf45e3: TAR15–TAR22, TAR25 fail (plus TAR23 / TAR24 on the new startup summary shape).
const { officialPayloadHash } = require("../../gateway/official.js");
const refOf = n => "tr_" + n.toString(16).padStart(40, "0");
/** A durable index entry written directly (retained history). */
const writeTargetFile = (dir, targetRef, revision, jobId, updatedAt = new Date().toISOString()) => fs.writeFileSync(path.join(dir, "targets", targetRef + ".json"), JSON.stringify({ schemaVersion: 1, targetRef, revision, jobId, updatedAt }), { mode: 0o600 });
/** A RECEIVED record + its input written directly through the journal, exactly as the pre-B3 gateway left them (no queue involved). */
async function craftReceived(journal, j, at = new Date().toISOString()) {
  await journal.writeInput(j.jobId, j);
  await journal.writeRecord({ schemaVersion: 1, jobId: j.jobId, payloadHash: officialPayloadHash(j), revision: j.targetRef ? j.revision : null, targetRef: j.targetRef || null, language: j.language, state: "received", generation: 1, interruptions: 0, receivedAt: at, startedAt: null, executedAt: null, updatedAt: at, outcome: null, technicalCode: null, resultHash: null, summary: null, callback: { attempts: 0, windowEnd: 4, rearms: 0, nextAt: null, lastAt: null, lastStatus: null, lastErrorClass: null, confirmedAt: null, confirmedAs: null } });
}
/** Like H.boot, with a hook on the journal BEFORE start() (scan-order control). */
async function bootWith(dir, opts = {}, patch = null) {
  const { createJournal } = require("../../gateway/journal.js");
  const { createOfficialGradingQueue } = require("../../gateway/official.js");
  const { sandbox = fakeSandbox(), api = H.fakeApi(), maxPending = 8, maxActive = 1, now, logger = quiet(), limits } = opts;
  const journal = createJournal({ dir, logger, ...(limits ? { limits } : {}), ...(now ? { now } : {}) });
  await journal.open();
  if (patch) patch(journal);
  const q = createOfficialGradingQueue({ sandbox, deliver: api.deliver, journal, maxPending, maxActive, logger, callbackPolicy: H.FAST, ...(now ? { now } : {}) });
  const summary = await q.start();
  return { journal, q, sandbox, api, summary, logger };
}
/** The directory order of targets/ as opendir yields it (what the bounded listing sees). */
const targetDirOrder = dir => { const d = fs.opendirSync(path.join(dir, "targets")); const out = []; try { for (let e = d.readSync(); e; e = d.readSync()) { const m = /^(tr_[0-9a-f]{40})\.json$/.exec(e.name); if (m) out.push(m[1]); } } finally { d.closeSync(); } return out; };
/** Counts durable reads of ONE reference through the journal (proves the cache-miss path). */
function spyReads(journal, ref) {
  const original = journal.readTarget.bind(journal);
  let n = 0;
  journal.readTarget = async r => { if (r === ref) n++; return original(r); };
  return { reads: () => n, restore: () => { journal.readTarget = original; } };
}
const SMALL = { startupScanMax: 3 };
/** Fills targets/ with decoy retained entries so that the warm-cache listing (startupScanMax = 3) is truncated, and returns a reference that the listing OMITS. */
function decoysOmitting(dir, retained) {
  for (let i = 1; i <= 12; i++) writeTargetFile(dir, refOf(0x100 + i), 2, job(600 + i).jobId);
  const order = targetDirOrder(dir);
  assert.ok(order.length > SMALL.startupScanMax);
  const omitted = order.slice(SMALL.startupScanMax);
  assert.ok(omitted.length >= 1);
  return retained.find(r => omitted.includes(r)) ?? null;
}

// ── RF2-A — a warm-cache miss is resolved from the durable index ───────────────────────────────────────────────────────
/** rev 8 / job A durable for TARGET (record still present but outside the startup repair window), then the warm cache omits it. */
async function omittedAuthority(dirOpts = {}) {
  const dir = tmpJournalDir(), now = clock();
  // TAR15: the record stays (confirmed retention long) but is outside the startup repair window (index retention short);
  // TAR16: the record is pruned legitimately (confirmed retention short) while the index entry is retained (index retention long)
  const limits = { ...SMALL, ...(dirOpts.prune ? { confirmedRetentionMs: 1000, failedRetentionMs: 60000 } : { confirmedRetentionMs: 60000, failedRetentionMs: 1000 }) };
  const h = await boot(dir, { now, maxPending: 8, limits });
  const a = v(1500, 8);
  assert.equal((await h.q.submit(a)).status, "accepted");
  await h.q.idle();
  assert.equal(recordOf(dir, a.jobId).state, "confirmed");
  now.advance(5000);
  if (dirOpts.prune) { assert.deepEqual(await h.q.maintain(), { pruned: 1, prunedTargets: 0 }); assert.equal(recordOf(dir, a.jobId), null); }   // TAR16: only targets/<ref>.json remains
  else assert.deepEqual(authority(targetOnDisk(dir)), { revision: 8, jobId: a.jobId });
  assert.ok(fs.existsSync(targetFile(dir)));
  await crash(h);
  // the retained rev 8 entry must be outside the bounded listing; decoys make the directory larger than startupScanMax
  let omitted = decoysOmitting(dir, [TARGET]);
  if (!omitted) {                                                                                    // directory order put TARGET in the window: move the authority to an omitted reference
    const order = targetDirOrder(dir);
    omitted = order.slice(SMALL.startupScanMax)[0];
    fs.writeFileSync(path.join(dir, "targets", omitted + ".json"), JSON.stringify({ ...JSON.parse(fs.readFileSync(targetFile(dir), "utf8")), targetRef: omitted }), { mode: 0o600 });
    fs.writeFileSync(targetFile(dir), JSON.stringify({ schemaVersion: 1, targetRef: TARGET, revision: 2, jobId: job(699).jobId, updatedAt: new Date().toISOString() }), { mode: 0o600 });
  }
  return { dir, now, limits, a, ref: omitted };
}

for (const prune of [false, true]) {
  test(`TAR${prune ? 16 : 15} ${prune ? "only targets/<ref>.json remains (record pruned)" : "rev 8 / job A durable"} and the warm-cache listing OMITS it: after a restart rev 7 → STALE, rev 8 / job B → CONFLICT, rev 9 → ACCEPTED, resolved from the durable index on the cache miss`, async () => {
    const s = await omittedAuthority({ prune }), before = unhandled;
    const h2 = await boot(s.dir, { now: s.now, maxPending: 8, limits: s.limits });
    assert.equal(h2.summary.truncated, false);                                                      // the job scan is complete
    const spy = spyReads(h2.journal, s.ref);
    assert.equal((await h2.q.submit(v(1501, 7, s.ref))).status, "stale", "an older revision was accepted although its durable authority exists");
    assert.equal((await h2.q.submit(v(1502, 8, s.ref))).status, "conflict", "rev 8 accepted twice although its durable authority exists");
    assert.ok(spy.reads() >= 1, "submit never consulted the durable index on the cache miss");
    assert.equal(recordOf(s.dir, v(1501, 7).jobId), null);
    assert.equal(recordOf(s.dir, v(1502, 8).jobId), null);
    const nine = v(1503, 9, s.ref);
    assert.equal((await h2.q.submit(nine)).status, "accepted");
    assert.deepEqual(authority(await h2.journal.readTarget(s.ref)), { revision: 9, jobId: nine.jobId });
    assert.equal((await h2.q.submit(v(1504, 8, s.ref))).status, "stale");                          // now from the cache
    assert.equal(h2.summary.targets.truncated, true, "the bounded target listing did not report its truncation");   // the warm cache was not complete
    assert.equal(unhandled, before);
    await h2.q.idle(); await crash(h2);
  });
}

test("TAR17 the bounded target listing explicitly reports truncation: { targets, scanned, truncated }", async () => {
  const dir = tmpJournalDir(), h = await boot(dir, { maxPending: 8 });
  for (let i = 1; i <= 5; i++) writeTargetFile(dir, refOf(0x200 + i), i, job(620 + i).jobId);
  const bounded = await h.journal.listTargets({ maxEntries: 3 });
  assert.ok(bounded && Array.isArray(bounded.targets), "listTargets does not return { targets, scanned, truncated }: " + JSON.stringify(bounded));
  assert.equal(bounded.targets.length, 3);
  assert.equal(bounded.scanned, 3);
  assert.equal(bounded.truncated, true, "truncation is silent");
  const full = await h.journal.listTargets({ maxEntries: 10 });
  assert.equal(full.targets.length, 5);
  assert.equal(full.scanned, 5);
  assert.equal(full.truncated, false);
  assert.ok(full.targets.every(t => t.schemaVersion === 1 && /^tr_[0-9a-f]{40}$/.test(t.targetRef) && Number.isInteger(t.revision)));
  await crash(h);
});

test("TAR18 job scan complete + target warm cache truncated: the queue stays usable (plain and new-target admissions), the condition is exposed, and cache-miss revision decisions stay correct", async () => {
  const s = await omittedAuthority(), logger = capture();
  const h2 = await boot(s.dir, { now: s.now, maxPending: 8, limits: s.limits, logger });
  assert.equal(h2.summary.truncated, false);
  assert.equal(h2.summary.targets.truncated, true);
  assert.equal(h2.q.status().truncated, false);
  assert.equal(h2.q.status().targetIndexTruncated, true, "the truncated warm cache is not exposed in status()");
  assert.ok(logger.events().some(e => e.event === "coding.runner.target.listing-truncated" && e.limit === SMALL.startupScanMax), "the truncated warm cache is not logged");
  assert.equal((await h2.q.submit(job(1510))).status, "accepted");                                   // plain job
  assert.equal((await h2.q.submit(v(1511, 1, refOf(0x300)))).status, "accepted");                   // a NEW target: no durable entry, admitted
  assert.deepEqual(authority(await h2.journal.readTarget(refOf(0x300))), { revision: 1, jobId: v(1511, 1).jobId });
  assert.equal((await h2.q.submit(v(1512, 7, s.ref))).status, "stale");                             // the omitted authority still orders
  assert.equal((await h2.q.submit(v(1513, 8, s.ref))).status, "conflict");
  let n = 1514;
  for (const decoy of targetDirOrder(s.dir).filter(r => r !== s.ref && r !== TARGET && r !== refOf(0x300)).slice(0, 3)) {   // decoys (rev 2) in and out of the window
    assert.equal((await h2.q.submit(v(n++, 1, decoy))).status, "stale");
    assert.equal((await h2.q.submit(v(n++, 3, decoy))).status, "accepted");
  }
  await h2.q.idle(); await crash(h2);
});

test("TAR19 the durable index read fails on a cache miss: that versioned submission fails CLOSED (busy / target-authority-unavailable) — no record, no input, no index change, no execution; an I/O error is never «no authority»", async () => {
  const dir = tmpJournalDir(), logger = capture(), h = await withRev7(dir, { logger }), before = unhandled;
  const fresh = refOf(0x400);
  const original = h.journal.readTarget.bind(h.journal);
  let failures = 0;
  h.journal.readTarget = async r => { if (r === fresh || r === TARGET) { failures++; throw Object.assign(new Error("injected EIO"), { code: "EIO" }); } return original(r); };
  const j = v(1520, 9, fresh);
  assert.equal((await h.q.submit(j)).status, "busy", "an I/O error on the durable index read was interpreted as «no authority»");
  assert.ok(logger.events().some(e => e.event === "runner.official.busy" && e.jobId === j.jobId && e.reason === "target-authority-unavailable"), "busy reason not deterministic");
  assert.ok(failures >= 1);
  assert.equal(recordOf(dir, j.jobId), null);
  assert.equal(fs.existsSync(path.join(dir, "inputs", j.jobId + ".json")), false);
  assert.equal(fs.existsSync(path.join(dir, "targets", fresh + ".json")), false);
  assert.equal(h.sandbox.runs.includes(j.jobId), false);
  assert.equal((await h.q.submit(v(1521, 6))).status, "stale");                                      // TARGET is cached (rev 7): no durable read, unaffected
  assert.ok(!logger.lines.some(l => l.includes(fresh)), "the opaque reference is logged");
  h.journal.readTarget = original;                                                                   // transient: the next attempt is admitted
  assert.equal((await h.q.submit(j)).status, "accepted");
  assert.equal(unhandled, before);
  await h.q.idle(); await crash(h);
});

// ── RF2-B — same-revision ambiguity at startup is never resolved by scan order ────────────────────────────────────────
const { createJournal } = require("../../gateway/journal.js");
/** A journal as the pre-B3 gateway could leave it: the given RECEIVED records (and optionally an index entry), no queue. */
async function preB3Journal(records, index = null) {
  const dir = tmpJournalDir(), j = createJournal({ dir, logger: quiet() });
  await j.open();
  for (const r of records) await craftReceived(j, r);
  await j.close();
  if (index) writeTargetFile(dir, TARGET, index.revision, index.jobId);
  return dir;
}
const A8 = v(1600, 8), B8 = v(1601, 8), A7 = v(1602, 7), C9 = v(1603, 9);
let seq = 1700;                                                                                      // distinct plain job ids across the scenario re-runs
const reverseScan = journal => { const s = journal.scan.bind(journal); journal.scan = async o => { const r = await s(o); r.records.reverse(); return r; }; };
/** Boots a pre-B3 journal with two rev 8 records and NO index; asserts the fail-closed outcome. Returns the handle. */
async function expectBlocked(dir, patch = null) {
  const logger = capture(), h = await bootWith(dir, { maxPending: 8, logger }, patch);
  assert.equal(h.summary.targets.blocked, 1, "ambiguous target not blocked: " + JSON.stringify(h.summary.targets));
  assert.equal(h.summary.targets.held, 2);
  assert.equal(h.summary.targets.repaired, 0);
  assert.equal(h.q.status().targetsBlocked, 1);
  await h.q.idle();
  assert.deepEqual(h.sandbox.runs, [], "an ambiguous same-revision record was executed by scan order");
  assert.equal(await h.journal.readTarget(TARGET), null, "a scan-order winner was written as authority");
  assert.equal(recordOf(dir, A8.jobId).state, "received");
  assert.equal(recordOf(dir, B8.jobId).state, "received");
  for (const [n, rev] of [[1610, 7], [1611, 8], [1612, 9]]) {
    const j = v(n, rev);
    assert.equal((await h.q.submit(j)).status, "busy", "rev " + rev + " was decided from a guessed authority");
    assert.ok(logger.events().some(e => e.event === "runner.official.busy" && e.jobId === j.jobId && e.reason === "target-inconsistent"));
    assert.equal(recordOf(dir, j.jobId), null);
  }
  assert.deepEqual(await h.q.submit(A8), { status: "duplicate", state: "received" });               // exact-id duplicate stays idempotent (nothing executes)
  const other = job(seq++);
  assert.equal((await h.q.submit(other)).status, "accepted");                                       // other work is unaffected
  await h.q.idle();
  assert.deepEqual(h.sandbox.runs, [other.jobId]);
  assert.ok(!logger.lines.some(l => l.includes(TARGET)), "the opaque reference is logged");
  return h;
}
/** Boots a pre-B3 journal with two rev 8 records and the index selecting B; asserts B stays the authority. */
async function expectIndexPreserved(dir, patch = null) {
  const h = await bootWith(dir, { maxPending: 8 }, patch);
  assert.equal(h.summary.targets.blocked, 0);
  assert.equal(h.summary.targets.held, 1);                                                         // the competing record A
  assert.equal(h.summary.targets.inconsistent, 1);
  assert.deepEqual(authority(await h.journal.readTarget(TARGET)), { revision: 8, jobId: B8.jobId }, "the existing durable authority was replaced by scan order");
  await h.q.idle();
  assert.deepEqual(h.sandbox.runs, [B8.jobId], "the competing same-revision record executed");
  assert.equal(recordOf(dir, B8.jobId).state, "confirmed");
  assert.equal(recordOf(dir, A8.jobId).state, "received");                                        // held, never executed as the authority
  assert.equal((await h.q.submit(v(1620, 7))).status, "stale");
  assert.equal((await h.q.submit(v(1621, 8))).status, "conflict");
  assert.deepEqual(await h.q.submit(A8), { status: "duplicate", state: "received" });
  const nine = v(1622, 9);
  assert.equal((await h.q.submit(nine)).status, "accepted");
  await h.q.idle();
  assert.deepEqual(authority(await h.journal.readTarget(TARGET)), { revision: 9, jobId: nine.jobId });
  assert.equal(recordOf(dir, nine.jobId).state, "confirmed");
  return h;
}

test("TAR20 two durable RECEIVED records of rev 8 (jobs A and B), index MISSING: startup reports one blocked target, neither becomes the authority, new rev 7 / 8 / 9 admissions fail closed (busy / target-inconsistent), nothing executes", async () => {
  const dir = await preB3Journal([A8, B8]);
  const h = await expectBlocked(dir);
  await crash(h);
});

test("TAR21 same two records, durable index says rev 8 / job B: B stays the authority (scan order never replaces it), A is held, rev 7 → stale, rev 8 / new id → conflict, rev 9 advances", async () => {
  const dir = await preB3Journal([A8, B8], { revision: 8, jobId: B8.jobId });
  const h = await expectIndexPreserved(dir);
  await crash(h);
});

test("TAR22 the scan order of A and B reversed: TAR20 and TAR21 outcomes are identical (no scan-order dependency)", async () => {
  for (const patch of [null, reverseScan]) {
    const blocked = await preB3Journal([A8, B8]);
    const h1 = await expectBlocked(blocked, patch);
    await crash(h1);
    const preserved = await preB3Journal([A8, B8], { revision: 8, jobId: B8.jobId });
    const h2 = await expectIndexPreserved(preserved, patch);
    await crash(h2);
    const other = await preB3Journal([B8, A8]);                                                    // written in the other order too
    const h3 = await expectBlocked(other, patch);
    await crash(h3);
  }
});

test("TAR23 two records at DIFFERENT revisions (rev 7 A, rev 8 B), no index: the unique highest revision is repaired to B — history with more than one record is not ambiguity", async () => {
  const dir = await preB3Journal([A7, B8]);
  const h = await boot(dir, { maxPending: 8 });
  assert.equal(h.summary.targets.blocked, 0);
  assert.equal(h.summary.targets.repaired, 1);
  assert.equal(h.summary.targets.held, 0);
  assert.deepEqual(authority(await h.journal.readTarget(TARGET)), { revision: 8, jobId: B8.jobId });
  await h.q.idle();
  assert.deepEqual(h.sandbox.runs, [B8.jobId]);
  assert.equal(recordOf(dir, A7.jobId).state, "superseded");
  assert.equal(recordOf(dir, B8.jobId).state, "confirmed");
  assert.equal((await h.q.submit(v(1630, 8))).status, "conflict");
  await crash(h);
});

test("TAR24 three records (rev 8 A, rev 8 B, rev 9 C), no index: the highest revision is uniquely rev 9 → authority rev 9 / C; the lower duplicate pair never overrides it", async () => {
  const dir = await preB3Journal([A8, B8, C9]);
  const h = await boot(dir, { maxPending: 8 });
  assert.equal(h.summary.targets.blocked, 0);
  assert.equal(h.summary.targets.repaired, 1);
  assert.equal(h.summary.targets.held, 0);
  assert.deepEqual(authority(await h.journal.readTarget(TARGET)), { revision: 9, jobId: C9.jobId });
  await h.q.idle();
  assert.deepEqual(h.sandbox.runs, [C9.jobId], "a lower duplicate executed");
  assert.equal(recordOf(dir, A8.jobId).state, "superseded");
  assert.equal(recordOf(dir, B8.jobId).state, "superseded");
  assert.equal(recordOf(dir, C9.jobId).state, "confirmed");
  assert.equal((await h.q.submit(v(1640, 8))).status, "stale");
  assert.equal((await h.q.submit(v(1641, 9))).status, "conflict");
  await crash(h);
});

test("TAR25 an ambiguous target survives a restart and still fails closed (no «restart clears ambiguity»)", async () => {
  const dir = await preB3Journal([A8, B8]);
  const h = await expectBlocked(dir);
  await crash(h);
  const h2 = await expectBlocked(dir);                                                             // the second start sees the same durable state
  await crash(h2);
  const h3 = await expectBlocked(dir, reverseScan);
  await crash(h3);
});
