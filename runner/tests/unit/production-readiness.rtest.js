"use strict";
// Runner production-readiness hardening (after Phase 17D-B2) — node:test, no Docker:
//   LOCK1–LOCK6  the journal lock is bound to the kernel BOOT IDENTITY as well as the PID: a lock left by a gateway of a PREVIOUS
//                boot is stale even when Linux has re-used its PID for an unrelated live process (no manual deletion after a
//                genuine reboot), while a live gateway of the SAME boot still owns the journal; an unreadable boot id falls back to
//                the PID rule; a malformed lock is handled deterministically (refused while it may still be being written, stale
//                after a grace period).
//   SCAN1–SCAN2  a TRUNCATED startup scan never deletes inputs / results of records it did not see (orphan cleanup needs the
//                complete index); a complete scan still removes genuine orphans.
//   GEN1–GEN3    a technical outcome that SmartAssess confirms as RETRYABLE starts a new, bounded execution generation on the next
//                delivery of the same job (fresh execution, re-persisted input, same revision / targetRef); the bound holds across
//                restarts and the generation counter never resets.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const H = require("../helpers/durable.js");

const { job, boot, crash, fakeSandbox, fakeApi, latch, recordOf, waitFor, tmpJournalDir, TARGET, FAST } = H;
const JOURNAL = path.join(__dirname, "..", "..", "gateway", "journal.js");
const { createJournal } = require(JOURNAL);
const BOOT_A = "11111111-2222-4333-8444-555555555555";
const BOOT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const lockFile = dir => path.join(dir, "journal.lock");
const readLock = dir => JSON.parse(fs.readFileSync(lockFile(dir), "utf8"));
const plantLock = (dir, content) => { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(lockFile(dir), typeof content === "string" ? content : JSON.stringify(content), { mode: 0o600 }); };
const openErr = async j => { try { await j.open(); return null; } catch (e) { return e; } };
/** A live process that is NOT a gateway (stands for a PID re-used after a reboot). */
const liveForeign = () => { const p = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" }); return p; };
const deadPid = () => new Promise(r => { const p = spawn(process.execPath, ["-e", ""], { stdio: "ignore" }); p.on("exit", () => r(p.pid)); });

// ── M1: boot-bound journal lock ─────────────────────────────────────────────────────────────────────────────────────
test("LOCK1 same boot + LIVE foreign PID → the journal is owned by another gateway: JOURNAL_LOCKED, lock untouched", async () => {
  const dir = tmpJournalDir(), other = liveForeign();
  try {
    const held = { pid: other.pid, bootId: BOOT_A, token: "t-live", at: new Date().toISOString() };
    plantLock(dir, held);
    const e = await openErr(createJournal({ dir, bootId: () => BOOT_A }));
    assert.equal(e && e.code, "JOURNAL_LOCKED");
    assert.deepEqual(readLock(dir), held);
  } finally { other.kill(); }
});

test("LOCK2 same boot + DEAD PID → stale lock replaced by this process (pid + boot id)", async () => {
  const dir = tmpJournalDir();
  plantLock(dir, { pid: await deadPid(), bootId: BOOT_A, token: "t-dead", at: new Date().toISOString() });
  const j = createJournal({ dir, bootId: () => BOOT_A });
  assert.equal(await openErr(j), null);
  const l = readLock(dir);
  assert.equal(l.pid, process.pid);
  assert.equal(l.bootId, BOOT_A);
  await j.close();
  assert.equal(fs.existsSync(lockFile(dir)), false);
});

test("LOCK3 lock from a PREVIOUS boot whose PID is now re-used by a live unrelated process → stale, replaced (no manual deletion)", async () => {
  const dir = tmpJournalDir(), reused = liveForeign();
  try {
    plantLock(dir, { pid: reused.pid, bootId: BOOT_A, token: "t-prev-boot", at: new Date(Date.now() - 3600000).toISOString() });
    const j = createJournal({ dir, bootId: () => BOOT_B });
    assert.equal(await openErr(j), null);
    const l = readLock(dir);
    assert.equal(l.pid, process.pid);
    assert.equal(l.bootId, BOOT_B);
    assert.notEqual(l.token, "t-prev-boot");
    await j.close();
  } finally { reused.kill(); }
});

test("LOCK4 single ownership stays safe: a second LIVE gateway process on the same boot is refused; after close it may open", async () => {
  const dir = tmpJournalDir();
  const j = createJournal({ dir });                                          // the REAL boot id of this host
  assert.equal(await openErr(j), null);
  const child = () => spawnSync(process.execPath, ["-e", `const { createJournal } = require(${JSON.stringify(JOURNAL)}); createJournal({ dir: ${JSON.stringify(dir)} }).open().then(() => { console.log("OPENED"); }, e => { console.log(e.code || "ERR"); });`], { encoding: "utf8" }).stdout.trim();
  assert.equal(child(), "JOURNAL_LOCKED");
  const mine = readLock(dir);
  assert.equal(mine.pid, process.pid);
  // the lock of THIS process (same pid, same boot) — e.g. left by an instance that was not closed — is this process's own
  const again = createJournal({ dir });
  assert.equal(await openErr(again), null);
  await again.close();
  await j.close();
  assert.equal(child(), "OPENED");
});

test("LOCK5 boot id unavailable → deterministic fallback to the PID rule (never 'unreadable = stale')", async () => {
  const other = liveForeign();
  try {
    // current boot id unreadable, stored lock of another boot + live pid → still locked (no bypass)
    let dir = tmpJournalDir();
    plantLock(dir, { pid: other.pid, bootId: BOOT_A, token: "t1", at: new Date().toISOString() });
    assert.equal((await openErr(createJournal({ dir, bootId: () => null })))?.code, "JOURNAL_LOCKED");
    // stored lock without a boot id (17D-B2 format) + live pid → locked; + dead pid → replaced
    dir = tmpJournalDir();
    plantLock(dir, { pid: other.pid, token: "t2", at: new Date().toISOString() });
    assert.equal((await openErr(createJournal({ dir, bootId: () => BOOT_B })))?.code, "JOURNAL_LOCKED");
    dir = tmpJournalDir();
    plantLock(dir, { pid: await deadPid(), token: "t3", at: new Date().toISOString() });
    const j = createJournal({ dir, bootId: () => null });
    assert.equal(await openErr(j), null);
    assert.equal(readLock(dir).pid, process.pid);
    assert.equal(readLock(dir).bootId, null);
    await j.close();
    // a stored boot id that is not a boot id at all is "unavailable", not "different": PID rule
    dir = tmpJournalDir();
    plantLock(dir, { pid: other.pid, bootId: "not-a-boot-id", token: "t4", at: new Date().toISOString() });
    assert.equal((await openErr(createJournal({ dir, bootId: () => BOOT_B })))?.code, "JOURNAL_LOCKED");
  } finally { other.kill(); }
});

test("LOCK6 malformed lock → refused while it may still be being written (fresh), replaced once older than the grace period", async () => {
  for (const garbage of ["", "{not json", JSON.stringify({ pid: "12", bootId: BOOT_A }), JSON.stringify([1, 2])]) {
    const dir = tmpJournalDir();
    plantLock(dir, garbage);
    const fresh = await openErr(createJournal({ dir, bootId: () => BOOT_A }));
    assert.equal(fresh && fresh.code, "JOURNAL_LOCKED", JSON.stringify(garbage));
    assert.equal(fs.readFileSync(lockFile(dir), "utf8"), garbage);                       // never silently removed while fresh
    const later = createJournal({ dir, bootId: () => BOOT_A, now: () => Date.now() + 10 * 60 * 1000 });
    assert.equal(await openErr(later), null, JSON.stringify(garbage));
    assert.equal(readLock(dir).pid, process.pid);
    await later.close();
  }
  // an OLD malformed lock (e.g. a crash during a write before the reboot) is recovered at once
  const dir = tmpJournalDir();
  plantLock(dir, "{trunc");
  const old = new Date(Date.now() - 3600000);
  fs.utimesSync(lockFile(dir), old, old);
  const j = createJournal({ dir, bootId: () => BOOT_B });
  assert.equal(await openErr(j), null);
  await j.close();
});

// ── m1: truncated startup scan never deletes what it did not see ─────────────────────────────────────────────────────
const failing = () => fakeApi(() => ({ delivered: false, retryable: true, status: 503, errorClass: "http" }));
const SLOW = { ...FAST, baseMs: 60000, capMs: 60000 };
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };

test("SCAN1 a TRUNCATED startup scan keeps the inputs / results of unscanned valid jobs; they are recovered intact later", async () => {
  const dir = tmpJournalDir(), sandbox = fakeSandbox(), now = clock();
  const jobs = Array.from({ length: 8 }, (_, i) => job(300 + i));
  const h1 = await boot(dir, { sandbox, api: failing(), callbackPolicy: SLOW, maxPending: 16, now });
  for (const j of jobs) assert.equal((await h1.q.submit(j)).status, "accepted");
  await waitFor(() => jobs.every(j => { const r = recordOf(dir, j.jobId); return r && r.state === "executed" && r.callback.attempts >= 1; }));
  await crash(h1);
  for (const j of jobs) assert.ok(fs.existsSync(path.join(dir, "results", j.jobId + ".json")));
  // more directory entries than the startup scan may examine (foreign / leftover files beyond the design bound)
  for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(dir, "jobs", "zz-foreign-" + i + ".txt"), "x");
  const h2 = await boot(dir, { sandbox, api: failing(), callbackPolicy: SLOW, limits: { startupScanMax: 6 }, now });
  assert.equal(h2.summary.truncated, true);
  for (const j of jobs) {
    assert.ok(fs.existsSync(path.join(dir, "results", j.jobId + ".json")), "result of " + j.jobId + " must survive a truncated scan");
    assert.equal(recordOf(dir, j.jobId).state, "executed");
  }
  assert.equal((await h2.q.submit(job(399))).status, "busy");                               // index incomplete → still fail closed
  await crash(h2);
  // the operator clears the foreign entries; a COMPLETE scan recovers every job from its durable result — none quarantined
  for (const f of fs.readdirSync(path.join(dir, "jobs"))) if (f.startsWith("zz-")) fs.unlinkSync(path.join(dir, "jobs", f));
  now.advance(5 * 60 * 1000);
  const api3 = fakeApi();
  const h3 = await boot(dir, { sandbox, api: api3, callbackPolicy: SLOW, now });
  assert.equal(h3.summary.truncated, false);
  assert.equal(h3.summary.corrupt, 0);
  await h3.q.idle();
  for (const j of jobs) assert.equal(recordOf(dir, j.jobId).state, "confirmed", j.jobId);
  assert.equal(api3.calls.length, jobs.length);
  assert.equal(fs.readdirSync(path.join(dir, "quarantine")).filter(f => f.startsWith("cg_")).length, 0);
  for (const j of jobs) assert.equal(sandbox.count(j.jobId), 1);                             // never re-executed
  await crash(h3);
});

test("SCAN2 a COMPLETE startup scan still removes genuine orphan inputs / results (orphan cleanup is not disabled globally)", async () => {
  const dir = tmpJournalDir();
  const h1 = await boot(dir, { api: failing(), callbackPolicy: SLOW });
  const j = job(410);
  assert.equal((await h1.q.submit(j)).status, "accepted");
  await waitFor(() => (recordOf(dir, j.jobId) || {}).state === "executed");
  await crash(h1);
  const orphanIn = path.join(dir, "inputs", "cg_orphan0000000000000001.json"), orphanRes = path.join(dir, "results", "cg_orphan0000000000000002.json");
  fs.writeFileSync(orphanIn, "{}"); fs.writeFileSync(orphanRes, "{}");
  const h2 = await boot(dir, { api: failing(), callbackPolicy: SLOW });
  assert.equal(h2.summary.truncated, false);
  assert.equal(fs.existsSync(orphanIn), false);
  assert.equal(fs.existsSync(orphanRes), false);
  assert.ok(fs.existsSync(path.join(dir, "results", j.jobId + ".json")));                   // the referenced result is kept
  await crash(h2);
});

// ── m2: new execution generation after a confirmed RETRYABLE (technical) outcome ─────────────────────────────────────
const RETRYABLE = { delivered: true, status: 200, confirmedAs: "retryable" };
/** A sandbox whose n-th physical execution produces "gen-n" (to prove a fresh execution, never a re-used result). */
const genSandbox = gate => fakeSandbox(async (j, opts, n) => { if (gate) await gate(n); return { cases: j.cases.map(c => ({ token: c.token, status: "success", stdout: "gen-" + n + "\n", stderr: "", exitCode: 0, durationMs: 1 })) }; });
const versioned = n => job(n, { revision: 3, targetRef: TARGET });

test("GEN1 confirmed RETRYABLE → the next delivery of the SAME job starts generation 2: input re-persisted, executed again, fresh result", async () => {
  const dir = tmpJournalDir(), hold = latch();
  const sandbox = genSandbox(n => (n === 2 ? hold.promise : null));
  const api = fakeApi(n => (n === 1 ? RETRYABLE : null));                                   // 2nd callback: applied as complete
  const h = await boot(dir, { sandbox, api });
  const j = versioned(500);
  assert.equal((await h.q.submit(j)).status, "accepted");
  await h.q.idle();
  let r = recordOf(dir, j.jobId);
  assert.equal(r.state, "confirmed");
  assert.equal(r.callback.confirmedAs, "retryable");
  assert.equal(r.generation, 1);
  assert.equal(fs.existsSync(path.join(dir, "inputs", j.jobId + ".json")), false);
  assert.deepEqual(await h.q.submit(j), { status: "duplicate", state: "received" });       // SmartAssess re-delivers the same job
  await waitFor(() => { const x = recordOf(dir, j.jobId); return x.state === "running" && x.generation === 2; });
  r = recordOf(dir, j.jobId);
  assert.ok(fs.existsSync(path.join(dir, "inputs", j.jobId + ".json")), "input re-persisted for the new generation");
  assert.equal(r.revision, 3);
  assert.equal(r.targetRef, TARGET);
  assert.equal(r.resultHash, null);
  assert.equal(r.callback.attempts, 1);                                                      // cumulative, never reset
  assert.equal(r.callback.windowEnd, 1 + FAST.maxAttemptsPerWindow);
  assert.equal(r.callback.rearms, 0);
  hold.open();
  await h.q.idle();
  r = recordOf(dir, j.jobId);
  assert.equal(r.state, "confirmed");
  assert.equal(r.callback.confirmedAs, "complete");
  assert.equal(r.generation, 2);
  assert.equal(sandbox.count(j.jobId), 2);
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[1].cases[0].stdout, "gen-2\n");                                    // the generation-1 result is never re-used
  assert.equal(api.calls[1].jobId, j.jobId);
  await crash(h);
});

test("GEN2 generations are BOUNDED: after generation 3 is confirmed retryable, further deliveries never start generation 4 (also after restart)", async () => {
  const dir = tmpJournalDir(), sandbox = genSandbox();
  const api = fakeApi(() => RETRYABLE);
  let h = await boot(dir, { sandbox, api });
  const j = versioned(510);
  assert.equal((await h.q.submit(j)).status, "accepted");
  await h.q.idle();
  for (let g = 2; g <= 3; g++) {
    assert.deepEqual(await h.q.submit(j), { status: "duplicate", state: "received" });
    await h.q.idle();
    assert.equal(recordOf(dir, j.jobId).generation, g);
  }
  assert.deepEqual(await h.q.submit(j), { status: "duplicate", state: "confirmed" });      // no generation 4
  await h.q.idle();
  assert.equal(sandbox.count(j.jobId), 3);
  await crash(h);
  h = await boot(dir, { sandbox, api });
  assert.deepEqual(await h.q.submit(j), { status: "duplicate", state: "confirmed" });
  await h.q.idle();
  const r = recordOf(dir, j.jobId);
  assert.equal(r.generation, 3);
  assert.equal(r.revision, 3);
  assert.equal(sandbox.count(j.jobId), 3);
  assert.equal(api.calls.length, 3);                                                         // nothing new reaches SmartAssess
  await crash(h);
});

test("GEN3 the generation counter is durable: generation 2 survives a restart, the next delivery runs generation 3, the bound holds after another restart", async () => {
  const dir = tmpJournalDir(), sandbox = genSandbox();
  const api = fakeApi(() => RETRYABLE);
  let h = await boot(dir, { sandbox, api });
  const j = versioned(520);
  await h.q.submit(j); await h.q.idle();
  await h.q.submit(j); await h.q.idle();
  assert.equal(recordOf(dir, j.jobId).generation, 2);
  await crash(h);
  h = await boot(dir, { sandbox, api });
  assert.equal(recordOf(dir, j.jobId).generation, 2);
  assert.deepEqual(await h.q.submit(j), { status: "duplicate", state: "received" });
  await h.q.idle();
  assert.equal(recordOf(dir, j.jobId).generation, 3);
  assert.equal(sandbox.count(j.jobId), 3);
  await crash(h);
  h = await boot(dir, { sandbox, api });
  assert.deepEqual(await h.q.submit(j), { status: "duplicate", state: "confirmed" });
  await h.q.idle();
  assert.equal(recordOf(dir, j.jobId).generation, 3);
  assert.equal(sandbox.count(j.jobId), 3);
  await crash(h);
});
