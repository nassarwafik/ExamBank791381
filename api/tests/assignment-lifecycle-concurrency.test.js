import { describe, it, expect } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { withAssignmentLock, AssignmentLockBusyError, lockName } from "../src/lib/assignment-lock.js";

// Roadmap #7 — SERIALIZABILITY of assignment-lifecycle ops vs student state-writes across the TWO blobs
// (assignment + submission) that a single race spans. mutateJsonWithRetry is single-blob optimistic
// concurrency and cannot serialize a cross-blob interleaving; the per-assignment lifecycle lock does.
//
// These tests drive the REAL handlers through their DI seams over an in-memory store and control the exact
// interleavings with pause hooks. Each hazard is run twice:
//   • with a NO-OP lock  → proves the race genuinely occurs without coordination (bad outcome asserted),
//   • with a real per-key MUTEX (the in-process stand-in for the blob lease's mutual exclusion) → proves
//     the bad outcome is impossible once the lock is in place.
// The lock PRIMITIVE itself (acquire/retry/release/finally, cross-instance via the storage service) is
// covered separately in TEST 5 against a fake Azure lease client.

const clone = v => (v === null || v === undefined ? v : structuredClone(v));
const AID = "asg1";
const AP = "platform/assignments/" + AID + ".json";
const SUBPREFIX = "platform/submissions/" + AID + "/";
const SP = SUBPREFIX + "stu-1.json";
const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
class StorageConflictError extends Error {}

// A per-key async mutex — the deterministic in-process model of the Azure blob lease's mutual exclusion.
// Serializes callers sharing a key; different keys never block each other. Records peak concurrency so a
// test can assert the invariant "never two holders of the same key at once".
function makeKeyedMutex() {
  const tails = new Map(), active = new Map();
  let maxConcurrent = 0;
  const withLock = async (_c, key, fn) => {
    const prev = tails.get(key) || Promise.resolve();
    const gate = deferred();
    tails.set(key, prev.then(() => gate.promise));
    await prev;
    active.set(key, (active.get(key) || 0) + 1);
    maxConcurrent = Math.max(maxConcurrent, active.get(key));
    try { return await fn(); }
    finally { active.set(key, active.get(key) - 1); gate.resolve(); }
  };
  return { withLock, get maxConcurrent() { return maxConcurrent; } };
}
const NOOP_LOCK = async (_c, _id, fn) => fn();

// Shared in-memory world + DI deps for both handlers. hooks.beforeSubmissionWrite / beforeAssignmentWrite
// pause a write at the exact commit point so interleavings are deterministic.
function makeWorld({ withLock, hooks = {} }) {
  const store = new Map();
  store.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  store.set("platform/classes/c1.json", { classId: "c1", status: "active" });
  const dl = async (_c, k) => (store.has(k) ? clone(store.get(k)) : null);
  const ls = async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix) && k.endsWith(".json")).map(([, v]) => clone(v));
  const lbn = async (_c, prefix) => [...store.keys()].filter(k => k.startsWith(prefix) && k.endsWith(".json"));
  const db = async (_c, k) => { store.delete(k); };
  const studentMut = async (_c, key, fn) => { const cur = store.has(key) ? clone(store.get(key)) : null; const next = await fn(cur); if (hooks.beforeSubmissionWrite) await hooks.beforeSubmissionWrite(); store.set(key, clone(next)); return next; };
  const assignmentMut = async (_c, key, fn) => { const cur = store.has(key) ? clone(store.get(key)) : null; const next = await fn(cur); if (hooks.beforeAssignmentWrite) await hooks.beforeAssignmentWrite(); store.set(key, clone(next)); return next; };
  const manageDeps = {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), getContainer: () => ({}),
    downloadJsonOrNull: dl, listJson: ls, listBlobNames: lbn, deleteBlob: db,
    mutateJsonWithRetry: assignmentMut, StorageConflictError, recordAuditEvent: async () => {}, withAssignmentLock: withLock
  };
  const studentDeps = {
    requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }), getContainer: () => ({}),
    downloadJsonOrNull: dl, mutateJsonWithRetry: studentMut, StorageConflictError,
    gradeExam: () => ({ score: 10, totalMarks: 10, percentage: 100, manualReviewMarks: 0, finalized: true, questions: [], sections: [] }),
    recordAchievementIfEligible: async () => {}, withAssignmentLock: withLock
  };
  return { store, manageDeps, studentDeps };
}
function seedPublished(store) { store.set(AP, { schemaVersion: 2, attemptModelVersion: 2, assignmentId: AID, classId: "c1", className: "ص", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, sourceExamId: "", sourceExamTitle: "ا", questionCount: 1, totalMarks: 10, examSnapshot: { title: "ا", sections: [{ id: "s", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] }] }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }); }
const archiveReq = body => ({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "archive", assignmentId: AID, ...body }) });
const purgeReq = () => ({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "purge", assignmentId: AID, confirmAssignmentId: AID, confirmTitle: "واجب" }) });
const startReq = (assignmentId = AID) => ({ method: "POST", params: { assignmentId }, json: async () => ({ action: "startAttempt" }) });
const activeAttemptExists = (store, sp = SP) => { const s = store.get(sp); return !!(s && s.activeAttempt && s.activeAttempt.startedAt); };

// ── TEST 1 — student passed its final published check first, THEN archive commits ─────────────────────
describe("TEST 1 — student state-write vs archive (student checked published first)", () => {
  it("NO-OP lock: student creates an attempt AFTER archive commits => uncoordinated new submission on an archived assignment (the race)", async () => {
    const before = deferred(), reached = deferred();
    const { store, manageDeps, studentDeps } = makeWorld({ withLock: NOOP_LOCK, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(store);
    const pStudent = submissionHandler(startReq(), studentDeps); // passes its in-mutation published check, then pauses before the CAS
    await reached.promise;
    const rArchive = await manageHandler(archiveReq(), manageDeps); // archive runs fully while the student is paused: sees 0 submissions
    before.resolve();
    const rStudent = await pStudent;
    expect(rArchive.status).toBe(200);                    // archive "succeeded"
    expect(store.get(AP).status).toBe("archived");
    expect(rStudent.status).toBe(200);                    // student ALSO succeeded
    expect(activeAttemptExists(store)).toBe(true);        // BAD: a new attempt now exists on an archived assignment
  });

  it("MUTEX: the student write and archive are serialized — archive observes the attempt (409) OR the student is blocked; never archive-success + a new post-archive attempt", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    const { store, manageDeps, studentDeps } = makeWorld({ withLock: mutex.withLock, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(store);
    const pStudent = submissionHandler(startReq(), studentDeps); // acquires the lock, pauses before the CAS INSIDE the critical section
    await reached.promise;
    const pArchive = manageHandler(archiveReq(), manageDeps);    // blocks on the lock
    await settle();
    before.resolve();                                            // let the student finish + release
    const [rStudent, rArchive] = await Promise.all([pStudent, pArchive]);
    expect(rStudent.status).toBe(200);                    // student won (assignment was published throughout its section)
    expect(activeAttemptExists(store)).toBe(true);
    expect(rArchive.status).toBe(409);                    // archive observed the attempt => requires confirmation
    expect(rArchive.jsonBody.requiresConfirmation).toBe(true);
    expect(store.get(AP).status).toBe("published");       // NOT silently archived over the live attempt
    expect(mutex.maxConcurrent).toBe(1);                  // never two holders of the same assignment at once
  });
});

// ── TEST 2 — archive scanned zero active attempts, THEN a new attempt starts ──────────────────────────
describe("TEST 2 — archive vs a newly-started active attempt", () => {
  it("NO-OP lock: archive scans 0 active, an attempt starts, archive commits without confirm => silent win over a live attempt (the race)", async () => {
    const before = deferred(), reached = deferred();
    const { store, manageDeps, studentDeps } = makeWorld({ withLock: NOOP_LOCK, hooks: { beforeAssignmentWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(store);
    const pArchive = manageHandler(archiveReq(), manageDeps); // scans 0 active, then pauses just before committing archived
    await reached.promise;
    const rStudent = await submissionHandler(startReq(), studentDeps); // a new attempt appears
    before.resolve();
    const rArchive = await pArchive;
    expect(rStudent.status).toBe(200);
    expect(activeAttemptExists(store)).toBe(true);
    expect(rArchive.status).toBe(200);                    // BAD: archived with no confirmation despite a now-live attempt
    expect(store.get(AP).status).toBe("archived");
  });

  it("MUTEX: forcing student-first, archive then observes the attempt and refuses without confirm (no silent win)", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    const { store, manageDeps, studentDeps } = makeWorld({ withLock: mutex.withLock, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(store);
    const pStudent = submissionHandler(startReq(), studentDeps); // holds the lock, pauses before CAS
    await reached.promise;
    const pArchive = manageHandler(archiveReq(), manageDeps);    // blocks on the lock
    await settle();
    before.resolve();
    const [rStudent, rArchive] = await Promise.all([pStudent, pArchive]);
    expect(rStudent.status).toBe(200);
    expect(rArchive.status).toBe(409);                    // archive serialized AFTER the attempt => 409, not a silent win
    expect(store.get(AP).status).toBe("published");
    expect(mutex.maxConcurrent).toBe(1);
  });

  it("MUTEX: forcing archive-first (with confirm), the later startAttempt is blocked by the committed archived state", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    const { store, manageDeps, studentDeps } = makeWorld({ withLock: mutex.withLock, hooks: { beforeAssignmentWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(store);
    const pArchive = manageHandler(archiveReq({ confirmActiveAttempts: true }), manageDeps); // holds the lock, pauses before committing archived
    await reached.promise;
    const pStudent = submissionHandler(startReq(), studentDeps); // blocks on the lock
    await settle();
    before.resolve();
    const [rArchive, rStudent] = await Promise.all([pArchive, pStudent]);
    expect(rArchive.status).toBe(200);
    expect(store.get(AP).status).toBe("archived");
    expect(rStudent.status).toBe(403);                    // startAttempt re-read archived under the lock => blocked
    expect(activeAttemptExists(store)).toBe(false);       // no attempt created
    expect(mutex.maxConcurrent).toBe(1);
  });
});

// ── TEST 3 — purge vs an in-flight FIRST student write ────────────────────────────────────────────────
describe("TEST 3 — purge vs an in-flight first submission (no orphan)", () => {
  // Timeline: a first student write reads the assignment as published and passes its check; the teacher then
  // archives (with confirm) and purges; the student's submission upload would land afterwards. The invariant
  // that must NEVER break: a submission blob exists while the assignment blob is gone (an orphan).
  const orphanExists = store => !store.has(AP) && store.has(SP);

  it("NO-OP lock: the first write commits after archive+purge delete the assignment => ORPHAN (the race)", async () => {
    const before = deferred(), reached = deferred();
    const { store, manageDeps, studentDeps } = makeWorld({ withLock: NOOP_LOCK, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(store);
    const pStudent = submissionHandler(startReq(), studentDeps); // passes published check, pauses before CAS
    await reached.promise;
    await manageHandler(archiveReq({ confirmActiveAttempts: true }), manageDeps); // 0 submissions yet => archives
    const rPurge = await manageHandler(purgeReq(), manageDeps);                    // 0 history => deletes the assignment
    expect(rPurge.status).toBe(200);
    expect(store.has(AP)).toBe(false);
    before.resolve();
    await pStudent;                                        // now creates the submission — on a deleted assignment
    expect(orphanExists(store)).toBe(true);               // BAD: orphan submission
  });

  it("MUTEX: the first write is serialized whole — purge is then blocked by history, so no orphan is possible", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    const { store, manageDeps, studentDeps } = makeWorld({ withLock: mutex.withLock, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(store);
    const pStudent = submissionHandler(startReq(), studentDeps); // holds the lock through its CAS
    await reached.promise;
    const pArchive = manageHandler(archiveReq({ confirmActiveAttempts: true }), manageDeps); // blocks on the lock
    await settle();
    before.resolve();
    const rStudent = await pStudent;                       // creates the submission, releases
    const rArchive = await pArchive;                       // acquires next: sees the attempt, archives (confirm given)
    const rPurge = await manageHandler(purgeReq(), manageDeps); // sees history => 409 blockedByHistory, deletes nothing
    expect(rStudent.status).toBe(200);
    expect(rArchive.status).toBe(200);
    expect(rPurge.status).toBe(409);
    expect(rPurge.jsonBody.blockedByHistory).toBe(true);
    expect(store.has(AP)).toBe(true);                      // assignment still present
    expect(store.has(SP)).toBe(true);                      // submission still present
    expect(orphanExists(store)).toBe(false);              // invariant holds: never a submission without its assignment
    expect(mutex.maxConcurrent).toBe(1);
  });
});

// ── TEST 4 — operations on DIFFERENT assignments must not block each other ────────────────────────────
describe("TEST 4 — different assignments do not serialize", () => {
  it("a held lock on assignment A does not delay a state-write on assignment B", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    // World A: student write on assignment A holds the lock and pauses.
    const worldA = makeWorld({ withLock: mutex.withLock, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    seedPublished(worldA.store);
    let aDone = false;
    const pA = submissionHandler(startReq(AID), worldA.studentDeps).then(r => { aDone = true; return r; });
    await reached.promise;                                 // A is holding lock(asg1), paused
    // World B: a DIFFERENT assignment id — its own lock blob / mutex key. It must complete without waiting.
    const BID = "asg2", BAP = "platform/assignments/" + BID + ".json";
    const worldB = makeWorld({ withLock: mutex.withLock });
    worldB.store.set(BAP, { ...clone(worldA.store.get(AP)), assignmentId: BID });
    // patch worldB's assignment path lookups: reuse makeWorld store but store under asg2 path + submission path
    const rB = await submissionHandler(startReq(BID), { ...worldB.studentDeps,
      downloadJsonOrNull: async (_c, k) => (k === "platform/assignments/" + BID + ".json" ? clone(worldB.store.get(BAP)) : (worldB.store.has(k) ? clone(worldB.store.get(k)) : null)),
      mutateJsonWithRetry: async (_c, key, fn) => { const cur = worldB.store.has(key) ? clone(worldB.store.get(key)) : null; const next = await fn(cur); worldB.store.set(key, clone(next)); return next; } });
    expect(rB.status).toBe(200);                           // B finished while A is still held
    expect(aDone).toBe(false);                             // proof: A is still in-flight (holding lock asg1) — B did not wait for it
    expect(worldB.store.has("platform/submissions/" + BID + "/stu-1.json")).toBe(true);
    before.resolve();
    const rA = await pA;
    expect(rA.status).toBe(200);
    expect(mutex.maxConcurrent).toBe(1);                   // asg1 and asg2 never counted as the same holder
  });
});

// ── TEST 5 — the lock PRIMITIVE: acquire / retry / release / finally, cross-instance via the lease ─────
describe("TEST 5 — withAssignmentLock primitive (blob lease semantics)", () => {
  function fakeContainer(opts = {}) {
    const existing = new Set(opts.existing || []);
    const releases = [], acquiredNames = [];
    let acquireAttempts = 0;
    const failTimes = opts.failAcquireTimes || 0;
    const container = {
      getBlockBlobClient: name => ({ upload: async (_b, _l, options) => { if (existing.has(name) && options && options.conditions && options.conditions.ifNoneMatch === "*") { const e = new Error("exists"); e.statusCode = 409; e.code = "BlobAlreadyExists"; throw e; } existing.add(name); return { etag: '"e"' }; } }),
      getBlobClient: name => ({ getBlobLeaseClient: () => ({ leaseId: "lease-" + name, acquireLease: async () => { acquireAttempts++; if (acquireAttempts <= failTimes) { const e = new Error("held"); e.statusCode = 409; e.code = "LeaseAlreadyPresent"; throw e; } acquiredNames.push(name); return {}; }, releaseLease: async () => { releases.push(name); } }) })
    };
    return { container, existing, releases, acquiredNames, get acquireAttempts() { return acquireAttempts; } };
  }

  it("happy path: runs fn once, returns its value, releases the lease", async () => {
    const f = fakeContainer();
    let ran = 0;
    const out = await withAssignmentLock(f.container, AID, async () => { ran++; return "OK"; });
    expect(out).toBe("OK");
    expect(ran).toBe(1);
    expect(f.acquiredNames).toEqual([lockName(AID)]);
    expect(f.releases).toEqual([lockName(AID)]);           // released on success
  });

  it("releases the lease even when fn throws a domain error (finally)", async () => {
    const f = fakeContainer();
    await expect(withAssignmentLock(f.container, AID, async () => { const e = new Error("domain"); e.httpStatus = 409; throw e; })).rejects.toThrow("domain");
    expect(f.releases).toEqual([lockName(AID)]);           // released despite the throw
  });

  it("retries acquisition under contention, then succeeds", async () => {
    const f = fakeContainer({ failAcquireTimes: 2 });
    let ran = 0;
    const out = await withAssignmentLock(f.container, AID, async () => { ran++; return 1; }, { baseDelayMs: 1, attempts: 5 });
    expect(out).toBe(1);
    expect(ran).toBe(1);
    expect(f.acquireAttempts).toBe(3);                     // failed twice, acquired on the third
    expect(f.releases.length).toBe(1);
  });

  it("persistent contention: throws AssignmentLockBusyError (503), never runs fn, never releases", async () => {
    const f = fakeContainer({ failAcquireTimes: 99 });
    let ran = 0;
    await expect(withAssignmentLock(f.container, AID, async () => { ran++; }, { baseDelayMs: 1, attempts: 3 }))
      .rejects.toBeInstanceOf(AssignmentLockBusyError);
    expect(ran).toBe(0);
    expect(f.acquireAttempts).toBe(3);
    expect(f.releases.length).toBe(0);                     // never acquired => nothing to release
  });

  it("AssignmentLockBusyError carries httpStatus 503 for the handlers to surface", () => {
    expect(new AssignmentLockBusyError(AID).httpStatus).toBe(503);
  });

  it("ensureLockBlob tolerates a pre-existing lock blob (create race) and still acquires", async () => {
    const f = fakeContainer({ existing: [lockName(AID)] }); // lock blob already exists
    const out = await withAssignmentLock(f.container, AID, async () => "ok");
    expect(out).toBe("ok");
    expect(f.releases).toEqual([lockName(AID)]);
  });

  it("lock names are per assignment (no cross-assignment collision)", () => {
    expect(lockName("a1")).not.toBe(lockName("a2"));
    expect(lockName("a1")).toBe("platform/locks/assignment-a1.lock");
  });
});

// ── TEST A/B — LEGACY UNTIMED stale-snapshot race: saveDraft/submit may lazily create the next attempt ──
// A legacy untimed assignment (attemptModelVersion < 2, durationMinutes 0) lets saveDraft/submit run
// without an explicit startAttempt and LAZILY establish the next attempt. The request-start snapshot `s`
// can show active attempt #1, so `stateCreating` is false and the modern rule would skip the lock — but a
// concurrent submit can complete #1 and clear it, and this write then lazily creates a NEW attempt with no
// lifecycle serialization. The fix forces legacy untimed saveDraft/submit to always take the lock.
describe("TEST A/B — legacy untimed saveDraft/submit stale-snapshot race", () => {
  const LEGACY = { schemaVersion: 1, assignmentId: AID, classId: "c1", className: "ص", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: "", maxAttempts: 2, durationMinutes: 0, sourceExamId: "", sourceExamTitle: "ا", questionCount: 1, totalMarks: 10, examSnapshot: { title: "ا", sections: [{ id: "s", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] }] } }; // NO attemptModelVersion => legacy
  const completed1 = { attemptNumber: 1, submittedAt: "2026-01-01T09:00:00.000Z", score: 5, totalMarks: 10, percentage: 50, finalized: true, questionGrades: [], sections: [] };
  // store state AFTER a concurrent submit completed attempt #1 (no active attempt, one attempt remains)
  const clearedSub = { schemaVersion: 1, assignmentId: AID, studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: null, draftAnswers: {} };
  // the STALE request-start snapshot the racing write loaded: attempt #1 still active
  const staleActiveSub = { schemaVersion: 1, assignmentId: AID, studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T08:30:00.000Z", status: "draft" }, draftAnswers: {} };
  // `extra` lets a MODERN test attach the attempt identity the guard now requires (legacy tests omit it).
  const saveDraftReq = (extra = {}) => ({ method: "POST", params: { assignmentId: AID }, json: async () => ({ action: "saveDraft", answers: { q1: { kind: "text", value: "x" } }, ...extra }) });
  const submitReq = (extra = {}) => ({ method: "POST", params: { assignmentId: AID }, json: async () => ({ action: "submit", answers: { q1: { kind: "text", value: "x" } }, ...extra }) });
  // student deps whose FIRST submission read returns the stale (active #1) snapshot and every later read
  // returns the live store (cleared) — reproducing "loaded active #1, but it was completed before commit".
  function staleStudentDeps(world) {
    let spReads = 0;
    return { ...world.studentDeps, downloadJsonOrNull: async (_c, k) => {
      if (k === SP) { spReads++; return spReads === 1 ? clone(staleActiveSub) : (world.store.has(SP) ? clone(world.store.get(SP)) : null); }
      return world.store.has(k) ? clone(world.store.get(k)) : null;
    } };
  }

  it("A NO-OP lock: legacy saveDraft lazily creates active #2 AFTER archive scanned 0 active and committed (the race)", async () => {
    const before = deferred(), reached = deferred();
    const world = makeWorld({ withLock: NOOP_LOCK, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    world.store.set(AP, clone(LEGACY)); world.store.set(SP, clone(clearedSub));
    const pSave = submissionHandler(saveDraftReq(), staleStudentDeps(world)); // builds active #2, pauses before writing it
    await reached.promise;
    const rArchive = await manageHandler(archiveReq(), world.manageDeps);     // scans the LIVE store: 0 active => archives with no confirm
    before.resolve();
    const rSave = await pSave;
    expect(rArchive.status).toBe(200);
    expect(world.store.get(AP).status).toBe("archived");
    expect(rSave.status).toBe(200);
    expect(world.store.get(SP).activeAttempt).not.toBeNull();               // BAD: a new active attempt appeared after archive committed
    expect(world.store.get(SP).activeAttempt.attemptNumber).toBe(2);
  });

  it("A MUTEX: legacy saveDraft takes the lifecycle lock (despite the stale active snapshot); archive is serialized and observes attempt #2 (409)", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    const world = makeWorld({ withLock: mutex.withLock, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    world.store.set(AP, clone(LEGACY)); world.store.set(SP, clone(clearedSub));
    const pSave = submissionHandler(saveDraftReq(), staleStudentDeps(world)); // holds the lock (legacy untimed rule), pauses before writing #2
    await reached.promise;
    let archiveDone = false;
    const pArchive = manageHandler(archiveReq(), world.manageDeps).then(r => { archiveDone = true; return r; });
    await settle();
    expect(archiveDone).toBe(false);                                        // archive is blocked on the lock the saveDraft holds
    before.resolve();
    const [rSave, rArchive] = await Promise.all([pSave, pArchive]);
    expect(rSave.status).toBe(200);
    expect(world.store.get(SP).activeAttempt.attemptNumber).toBe(2);        // #2 created inside the serialized section
    expect(rArchive.status).toBe(409);                                      // archive ran AFTER => observed #2 => requires confirmation
    expect(rArchive.jsonBody.requiresConfirmation).toBe(true);
    expect(world.store.get(AP).status).toBe("published");                   // never silently archived over the new attempt
    expect(mutex.maxConcurrent).toBe(1);
  });

  it("B NO-OP lock: legacy submit records a new completed attempt AFTER archive committed (the race)", async () => {
    const before = deferred(), reached = deferred();
    const world = makeWorld({ withLock: NOOP_LOCK, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    world.store.set(AP, clone(LEGACY)); world.store.set(SP, clone(clearedSub));
    const pSubmit = submissionHandler(submitReq(), staleStudentDeps(world)); // builds completed #2, pauses before writing
    await reached.promise;
    const rArchive = await manageHandler(archiveReq(), world.manageDeps);
    before.resolve();
    const rSubmit = await pSubmit;
    expect(rArchive.status).toBe(200);
    expect(world.store.get(AP).status).toBe("archived");
    expect(rSubmit.status).toBe(200);
    expect(world.store.get(SP).attempts.length).toBe(2);                    // BAD: a second completed attempt appeared after archive
  });

  it("B MUTEX: legacy submit is serialized (archive-first) — after archive wins, the submit is blocked (403), no second completed attempt", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    const world = makeWorld({ withLock: mutex.withLock, hooks: { beforeAssignmentWrite: async () => { reached.resolve(); await before.promise; } } });
    world.store.set(AP, clone(LEGACY)); world.store.set(SP, clone(clearedSub));
    const pArchive = manageHandler(archiveReq(), world.manageDeps);         // 0 active => holds lock, pauses just before committing archived
    await reached.promise;
    const pSubmit = submissionHandler(submitReq(), staleStudentDeps(world)); // request-start reads published (archive not committed yet), then blocks on the lock
    await settle();
    before.resolve();
    const [rArchive, rSubmit] = await Promise.all([pArchive, pSubmit]);
    expect(rArchive.status).toBe(200);
    expect(world.store.get(AP).status).toBe("archived");
    expect(rSubmit.status).toBe(403);                                       // submit re-read archived under the lock => blocked
    expect(world.store.get(SP).attempts.length).toBe(1);                    // no second completed attempt created after archive won
    expect(mutex.maxConcurrent).toBe(1);
  });

  it("REGRESSION: a modern v2 untimed ORDINARY autosave (existing active attempt) stays LOCK-FREE (hot path preserved)", async () => {
    const before = deferred(), reached = deferred();
    const mutex = makeKeyedMutex();
    const world = makeWorld({ withLock: mutex.withLock, hooks: { beforeSubmissionWrite: async () => { reached.resolve(); await before.promise; } } });
    // v2 untimed assignment; the submission already has a live active attempt (created earlier under the lock).
    world.store.set(AP, { schemaVersion: 2, attemptModelVersion: 2, assignmentId: AID, classId: "c1", className: "ص", title: "واجب", status: "published", openAt: "", dueAt: "", maxAttempts: 2, durationMinutes: 0, questionCount: 1, totalMarks: 10, examSnapshot: { title: "ا", sections: [{ id: "s", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] }] } });
    world.store.set(SP, { schemaVersion: 1, assignmentId: AID, studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T08:30:00.000Z", status: "draft" }, draftAnswers: {} });
    const pSave = submissionHandler(saveDraftReq({ expectedAttemptNumber: 1, expectedStartedAt: "2026-01-01T08:30:00.000Z" }), world.studentDeps); // modern write carries attempt identity; ordinary autosave: needLock=false => lock-free; pauses before its write
    await reached.promise;
    let archiveDone = false;
    // Because the autosave holds NO lock, a concurrent archive (with confirm) acquires immediately and finishes.
    const rArchive = await manageHandler(archiveReq({ confirmActiveAttempts: true }), world.manageDeps).then(r => { archiveDone = true; return r; });
    expect(archiveDone).toBe(true);                                         // proof: archive completed while the autosave was paused => autosave is lock-free
    expect(rArchive.status).toBe(200);
    before.resolve();
    const rSave = await pSave;                                              // autosave resumes and commits (its published check ran before archive committed)
    // The trailing write is BENIGN and is exactly why the v2 hot path is safe to leave lock-free: it only
    // updates draft content of an ALREADY-live, already-counted attempt — it creates NO new attempt and no
    // orphan, so it can never hide an attempt from an archive scan or outlive its assignment.
    expect(rSave.status).toBe(200);
    expect(world.store.get(SP).activeAttempt.attemptNumber).toBe(1);        // still attempt #1 — no NEW attempt was created
    expect(world.store.get(SP).attempts.length).toBe(0);                    // no new completed attempt
    expect(world.store.get(SP).draftAnswers).toEqual({ q1: { kind: "text", value: "x" } }); // just a draft-content update
    expect(mutex.maxConcurrent).toBe(1);
  });
});
