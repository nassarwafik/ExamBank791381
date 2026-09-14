import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { extendRejection, timerState } from "../src/lib/assignment-availability.js";

// B2B — TEACHER ATTEMPT LIFECYCLE CONTROLS. Deterministic tests (fake timers + DI seams) for allowRetry,
// reopenStudent and extendActiveAttempt, plus the completed-attempt extension audit on timeout.

const MIN = 60_000;
const BASE = 1_700_000_000_000;
const iso = ms => new Date(ms).toISOString();
class StorageConflictError extends Error {}

let store, audits;
function baseDeps(extra = {}) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }),
    getContainer: () => ({}),
    downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
    mutateJsonWithRetry: async (_c, key, fn) => { const cur = store.has(key) ? structuredClone(store.get(key)) : null; const next = await fn(cur); store.set(key, next); return next; },
    StorageConflictError,
    recordAuditEvent: async (_c, ev) => { audits.push(ev); },
    ...extra
  };
}
const AP = "platform/assignments/asg1.json";
const UP = "platform/users/stu-1.json";
const SP = "platform/submissions/asg1/stu-1.json";
function seed({ durationMinutes = 0, attemptModelVersion = 2, maxAttempts = 1, dueAt = "", submission = undefined } = {}) {
  store = new Map(); audits = [];
  store.set(UP, { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
  const a = { assignmentId: "asg1", classId: "c1", status: "published", maxAttempts, durationMinutes, title: "واجب", dueAt,
    examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] } };
  if (attemptModelVersion) a.attemptModelVersion = attemptModelVersion;
  store.set(AP, a);
  if (submission !== undefined) store.set(SP, submission);
}
const post = body => resultsHandler({ method: "POST", url: "http://x/assignment-results", json: async () => body }, baseDeps());
const postWith = (body, deps) => resultsHandler({ method: "POST", url: "http://x/assignment-results", json: async () => body }, deps);
const getResults = () => resultsHandler({ method: "GET", url: "http://x/assignment-results?assignmentId=asg1", json: async () => ({}) }, baseDeps());

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); });
afterEach(() => { vi.useRealTimers(); });

const completed1 = { attemptNumber: 1, submittedAt: iso(BASE - 60 * MIN), score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 0, finalized: true, endReason: "submitted", startedAt: iso(BASE - 61 * MIN), endedAt: iso(BASE - 60 * MIN) };

describe("B2B allowRetry", () => {
  it("A: completed attempt is unchanged; allowedAttempts enables a next attempt; snapshot returned", async () => {
    seed({ maxAttempts: 1, submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: null, allowedAttempts: null } });
    const r = await post({ action: "allowRetry", assignmentId: "asg1", studentId: "stu-1" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.allowedAttempts).toBe(2);          // used(1)+1
    expect(r.jsonBody.attemptsUsed).toBe(1);
    expect(r.jsonBody.attemptStatus).toBe("submitted");
    expect(store.get(SP).attempts).toHaveLength(1);      // completed attempt untouched
    expect(store.get(SP).attempts[0].score).toBe(5);
    expect(audits.some(e => e.action === "assignment.allowRetry")).toBe(true);
  });
  it("B: allowRetry while an active attempt exists does not modify/restart the current attempt", async () => {
    seed({ durationMinutes: 60, maxAttempts: 2, submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: { attemptNumber: 2, startedAt: iso(BASE), endsAt: iso(BASE + 60 * MIN), status: "started" } } });
    const r = await post({ action: "allowRetry", assignmentId: "asg1", studentId: "stu-1" });
    expect(r.status).toBe(200);
    const aa = store.get(SP).activeAttempt;
    expect(aa.attemptNumber).toBe(2);
    expect(aa.startedAt).toBe(iso(BASE));
    expect(aa.endsAt).toBe(iso(BASE + 60 * MIN));       // unchanged
    expect(r.jsonBody.attemptStatus).toBe("started");   // active beats history
  });
});

describe("B2B blocker 1 — allowRetry must grant a FUTURE attempt beyond an active one", () => {
  const activeSub = (allowedAttempts) => ({ assignmentId: "asg1", studentId: "stu-1", classId: "c1", allowedAttempts, attempts: [completed1], activeAttempt: { attemptNumber: 2, startedAt: iso(BASE), endsAt: iso(BASE + 60 * MIN), extendedEndsAt: "", status: "started" } });
  it("1A: completed 1 + active 2, allowed 2 => allowRetry raises allowedAttempts to 3; active attempt untouched", async () => {
    seed({ durationMinutes: 60, maxAttempts: 2, submission: activeSub(2) });
    const r = await post({ action: "allowRetry", assignmentId: "asg1", studentId: "stu-1" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.allowedAttempts).toBe(3);          // used(1) + 2 (active occupies attempt 2)
    const aa = store.get(SP).activeAttempt;
    expect(aa.attemptNumber).toBe(2);
    expect(aa.startedAt).toBe(iso(BASE));                 // untouched
    expect(aa.endsAt).toBe(iso(BASE + 60 * MIN));
    expect(aa.extendedEndsAt).toBe("");
    expect(store.get(SP).attempts).toHaveLength(1);       // history intact
    // ...and after attempt 2 submits, attempt 3 is startable (attemptsUsed 2 < allowedAttempts 3)
    const st = timerState(store.get(AP), { ...store.get(SP), attempts: [completed1, { attemptNumber: 2 }], activeAttempt: null }, BASE);
    expect(st.attemptsUsed).toBe(2); expect(st.allowedAttempts).toBe(3);
  });
  it("1B: existing future capacity (allowed 4) => allowRetry stays 4 (no-op)", async () => {
    seed({ durationMinutes: 60, maxAttempts: 2, submission: activeSub(4) });
    const r = await post({ action: "allowRetry", assignmentId: "asg1", studentId: "stu-1" });
    expect(r.jsonBody.allowedAttempts).toBe(4);
  });
});

describe("B2B blocker 2 — extension of an UNRESOLVABLE timed attempt fails closed", () => {
  it("2A: startedAt invalid + endsAt \"\" => extend rejected, nothing stored, attempt stays fail-closed", async () => {
    seed({ durationMinutes: 60, submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "invalid", endsAt: "", status: "started" } } });
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(409);
    expect(store.get(SP).activeAttempt.extendedEndsAt === undefined || store.get(SP).activeAttempt.extendedEndsAt === "").toBe(true);
    expect(timerState(store.get(AP), store.get(SP), BASE).canWrite).toBe(false); // still fail-closed
  });
  it("2B: endsAt \"\" but startedAt valid => derived deadline, a later extension is still allowed (B2A recovery)", async () => {
    seed({ durationMinutes: 60, submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: "", status: "started" } } });
    // derived deadline = BASE+60; extend to BASE+120 must succeed
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(200);
    expect(store.get(SP).activeAttempt.extendedEndsAt).toBe(iso(BASE + 120 * MIN));
  });
});

describe("B2B reopenStudent", () => {
  it("C: reopen a closed student sets a future dueAtOverride and grants a next attempt", async () => {
    seed({ maxAttempts: 1, dueAt: iso(BASE - 10 * MIN), submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: null } });
    const r = await post({ action: "reopenStudent", assignmentId: "asg1", studentId: "stu-1", reopenUntil: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.dueAtOverride).toBe(iso(BASE + 120 * MIN));
    expect(r.jsonBody.allowedAttempts).toBe(2);
    expect(store.get(SP).dueAtOverride).toBe(iso(BASE + 120 * MIN));
    expect(audits.some(e => e.action === "assignment.reopenStudent")).toBe(true);
  });
  it("D: reopen does NOT create an active attempt or start a timer", async () => {
    seed({ durationMinutes: 60, maxAttempts: 1, dueAt: iso(BASE - 10 * MIN), submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: null } });
    const r = await post({ action: "reopenStudent", assignmentId: "asg1", studentId: "stu-1", reopenUntil: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(200);
    expect(store.get(SP).activeAttempt == null).toBe(true);
    expect(r.jsonBody.activeAttempt).toBeNull();
    expect(store.get(SP).attempts).toHaveLength(1);      // history preserved
  });
  it("E: reopen is rejected while an active attempt exists", async () => {
    seed({ durationMinutes: 60, maxAttempts: 2, dueAt: iso(BASE + 60 * MIN), submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: iso(BASE + 60 * MIN), status: "started" } } });
    const r = await post({ action: "reopenStudent", assignmentId: "asg1", studentId: "stu-1", reopenUntil: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(409);
  });
  it("F: reopen rejects a past/invalid reopenUntil, and requires it when the assignment is closed", async () => {
    seed({ maxAttempts: 1, dueAt: iso(BASE - 10 * MIN), submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: null } });
    expect((await post({ action: "reopenStudent", assignmentId: "asg1", studentId: "stu-1", reopenUntil: iso(BASE - 5 * MIN) })).status).toBe(400); // past
    expect((await post({ action: "reopenStudent", assignmentId: "asg1", studentId: "stu-1", reopenUntil: "not-a-date" })).status).toBe(400);        // invalid
    expect((await post({ action: "reopenStudent", assignmentId: "asg1", studentId: "stu-1" })).status).toBe(400);                                  // closed => reopenUntil required
  });
});

describe("B2B extendActiveAttempt", () => {
  const timedActive = (endsAt, extendedEndsAt) => ({ assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt, status: "started", ...(extendedEndsAt ? { extendedEndsAt } : {}) } });

  it("G: extend a timed active attempt adds extendedEndsAt; startedAt/endsAt/attemptNumber unchanged", async () => {
    seed({ durationMinutes: 60, dueAt: "", submission: timedActive(iso(BASE + 60 * MIN)) });
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 90 * MIN) });
    expect(r.status).toBe(200);
    const aa = store.get(SP).activeAttempt;
    expect(aa.startedAt).toBe(iso(BASE));                 // unchanged
    expect(aa.endsAt).toBe(iso(BASE + 60 * MIN));         // ORIGINAL preserved
    expect(aa.attemptNumber).toBe(1);
    expect(aa.extendedEndsAt).toBe(iso(BASE + 90 * MIN)); // added
    expect(audits.some(e => e.action === "assignment.extendActiveAttempt")).toBe(true);
  });
  it("H: extension changes effectiveAttemptEndsAt (no due date)", async () => {
    seed({ durationMinutes: 60, dueAt: "", submission: timedActive(iso(BASE + 60 * MIN)) });
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 90 * MIN) });
    expect(r.jsonBody.effectiveAttemptEndsAt).toBe(iso(BASE + 90 * MIN));
  });
  it("I: a due date CLIPS the extension (effectiveAttemptEndsAt = min(extended, due))", async () => {
    seed({ durationMinutes: 60, dueAt: iso(BASE + 70 * MIN), submission: timedActive(iso(BASE + 60 * MIN)) });
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 90 * MIN) });
    expect(r.jsonBody.activeAttempt.extendedEndsAt).toBe(iso(BASE + 90 * MIN));
    expect(r.jsonBody.effectiveAttemptEndsAt).toBe(iso(BASE + 70 * MIN)); // due-clipped
  });
  it("J: a per-student dueAtOverride lets the full extension apply", async () => {
    seed({ durationMinutes: 60, dueAt: iso(BASE + 70 * MIN), submission: { ...timedActive(iso(BASE + 60 * MIN)), dueAtOverride: iso(BASE + 120 * MIN) } });
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 90 * MIN) });
    expect(r.jsonBody.effectiveAttemptEndsAt).toBe(iso(BASE + 90 * MIN)); // override lifts the clip
  });
  it("K: extending an EXPIRED-but-not-finalized active attempt revives it (attemptExpired false, canWrite true)", async () => {
    // original end BASE+60; now BASE+80 (expired). Extend to BASE+120.
    seed({ durationMinutes: 60, dueAt: "", submission: timedActive(iso(BASE + 60 * MIN)) });
    vi.setSystemTime(BASE + 80 * MIN);
    const before = timerState(store.get(AP), store.get(SP), BASE + 80 * MIN);
    expect(before.attemptExpired).toBe(true);
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.attemptExpired).toBe(false);       // revived
    expect(r.jsonBody.canWrite).toBe(true);
    const aa = store.get(SP).activeAttempt;
    expect(aa.startedAt).toBe(iso(BASE));                 // NOT restarted
    expect(aa.attemptNumber).toBe(1);
  });
  it("L: extension is rejected when there is no active attempt (already submitted/finalized)", async () => {
    seed({ durationMinutes: 60, submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: null } });
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(409);
    expect(store.get(SP).attempts).toHaveLength(1);       // completed attempt untouched
  });
  it("M: extension on an UNTIMED assignment is rejected (400)", async () => {
    seed({ durationMinutes: 0, submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: "", status: "started" } } });
    const r = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 120 * MIN) });
    expect(r.status).toBe(400);
  });
  it("N: extension cannot SHORTEN the current duration end (<= current is rejected)", async () => {
    seed({ durationMinutes: 60, submission: timedActive(iso(BASE + 60 * MIN), iso(BASE + 90 * MIN)) }); // already extended to +90
    // equal to current
    expect((await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 90 * MIN) })).status).toBe(400);
    // earlier than current
    expect((await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 75 * MIN) })).status).toBe(400);
    // later than current extension is allowed
    expect((await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 100 * MIN) })).status).toBe(200);
  });
  it("O: RACE — student submits between the teacher read and the atomic mutation => extension rejected, completed attempt untouched", async () => {
    seed({ durationMinutes: 60, submission: timedActive(iso(BASE + 60 * MIN)) });
    const submittedDoc = { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: iso(BASE + 5 * MIN), score: 10, totalMarks: 10, percentage: 100, finalized: true, endReason: "submitted", startedAt: iso(BASE), endsAt: iso(BASE + 60 * MIN) }], activeAttempt: null };
    // A mutate seam that simulates the student's submit landing FIRST, so the atomic re-check sees no active attempt.
    const racingDeps = baseDeps({ mutateJsonWithRetry: async (_c, key, fn) => { store.set(key, submittedDoc); const cur = structuredClone(store.get(key)); const next = await fn(cur); store.set(key, next); return next; } });
    const r = await postWith({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 120 * MIN) }, racingDeps);
    expect(r.status).toBe(409);                            // re-check rejected it
    expect(store.get(SP).attempts).toHaveLength(1);        // the completed attempt is intact...
    expect(store.get(SP).attempts[0].extendedEndsAt === undefined || store.get(SP).attempts[0].extendedEndsAt === "").toBe(true); // ...and never gained an extension
    expect(store.get(SP).activeAttempt).toBeNull();
  });
});

describe("B2B setDueAtOverride on an assignment with NO global dueAt", () => {
  it("end-to-end: reopen (no global due) → start → extend timer → then extend the student due to lift the clip", async () => {
    seed({ durationMinutes: 60, dueAt: "", submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [completed1], activeAttempt: null } });
    // 1) reopen with a per-student deadline (no global dueAt)
    const reopen = await post({ action: "reopenStudent", assignmentId: "asg1", studentId: "stu-1", reopenUntil: iso(BASE + 60 * MIN) });
    expect(reopen.status).toBe(200);
    expect(reopen.jsonBody.dueAtOverride).toBe(iso(BASE + 60 * MIN));
    // 2) the student starts a timed attempt (simulated on the stored doc)
    const doc = store.get(SP); doc.activeAttempt = { attemptNumber: 2, startedAt: iso(BASE), endsAt: iso(BASE + 60 * MIN), status: "started" }; store.set(SP, doc);
    // 3) teacher extends the timer to BASE+90; effective end stays clipped by the reopen due (BASE+60)
    const ext = await post({ action: "extendActiveAttempt", assignmentId: "asg1", studentId: "stu-1", newEndsAt: iso(BASE + 90 * MIN) });
    expect(ext.status).toBe(200);
    expect(ext.jsonBody.effectiveAttemptEndsAt).toBe(iso(BASE + 60 * MIN)); // due-clipped
    // 4) teacher extends the student's due to BASE+105 — must be ALLOWED despite no global dueAt
    const due = await post({ action: "setDueAtOverride", assignmentId: "asg1", studentId: "stu-1", dueAtOverride: iso(BASE + 105 * MIN) });
    expect(due.status).toBe(200);
    expect(due.jsonBody.dueAtOverride).toBe(iso(BASE + 105 * MIN));
    expect(due.jsonBody.effectiveAttemptEndsAt).toBe(iso(BASE + 90 * MIN)); // now the full extension applies
    expect(due.jsonBody.attemptExpired).toBe(false);
    expect(due.jsonBody.canWrite).toBe(true);
  });
  it("validation (no global dueAt): invalid=>400, past=>400, future=>200, null=>clears", async () => {
    seed({ durationMinutes: 60, dueAt: "", submission: { assignmentId: "asg1", studentId: "stu-1", classId: "c1", attempts: [], activeAttempt: null } });
    expect((await post({ action: "setDueAtOverride", assignmentId: "asg1", studentId: "stu-1", dueAtOverride: "not-a-date" })).status).toBe(400);
    expect((await post({ action: "setDueAtOverride", assignmentId: "asg1", studentId: "stu-1", dueAtOverride: iso(BASE - 10 * MIN) })).status).toBe(400);
    const ok = await post({ action: "setDueAtOverride", assignmentId: "asg1", studentId: "stu-1", dueAtOverride: iso(BASE + 120 * MIN) });
    expect(ok.status).toBe(200); expect(ok.jsonBody.dueAtOverride).toBe(iso(BASE + 120 * MIN));
    const cleared = await post({ action: "setDueAtOverride", assignmentId: "asg1", studentId: "stu-1", dueAtOverride: null });
    expect(cleared.status).toBe(200); expect(cleared.jsonBody.dueAtOverride).toBeNull();
  });
});

// ── P: a timed timeout AFTER a teacher extension stores extendedEndsAt and the correct endedAt ────────
describe("B2B extension + timeout audit (student-submission handler)", () => {
  let subStore, subAudits, subDeps;
  function subSeed() {
    subStore = new Map(); subAudits = { grade: 0 };
    subStore.set("platform/users/stu-1.json", { userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "S1" });
    subStore.set("platform/classes/c1.json", { classId: "c1", status: "active" });
    subStore.set(AP, { assignmentId: "asg1", classId: "c1", status: "published", maxAttempts: 1, durationMinutes: 60, attemptModelVersion: 2, title: "واجب", dueAt: iso(BASE + 10 * 60 * MIN), examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] } });
    subDeps = {
      requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1" } }),
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, k) => (subStore.has(k) ? structuredClone(subStore.get(k)) : null),
      mutateJsonWithRetry: async (_c, k, fn) => { const cur = subStore.has(k) ? structuredClone(subStore.get(k)) : null; const next = await fn(cur); subStore.set(k, next); return next; },
      StorageConflictError,
      gradeExam: () => ({ score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 0, finalized: true, questions: [], sections: [] }),
      recordAchievementIfEligible: async () => {},
      withAssignmentLock: async (_c, _id, fn) => fn()
    };
  }
  const sub = (action) => submissionHandler({ method: "POST", params: { assignmentId: "asg1" }, json: async () => ({ action }) }, subDeps);

  it("P: teacher-extended timed attempt times out => completed attempt keeps extendedEndsAt, endedAt = extended deadline", async () => {
    subSeed();
    await sub("startAttempt");                                        // start at BASE => endsAt BASE+60
    // teacher extension: stamp extendedEndsAt directly on the stored active attempt (as the results handler does)
    const doc = subStore.get("platform/submissions/asg1/stu-1.json");
    doc.activeAttempt.extendedEndsAt = iso(BASE + 90 * MIN);
    subStore.set("platform/submissions/asg1/stu-1.json", doc);
    vi.setSystemTime(BASE + 91 * MIN);                                // past the extended deadline
    const r = await sub("finalizeTimedOutAttempt");
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.endReason).toBe("timedOut");
    expect(r.jsonBody.result.extendedEndsAt).toBe(iso(BASE + 90 * MIN));
    expect(r.jsonBody.result.endedAt).toBe(iso(BASE + 90 * MIN));    // the extended deadline, not BASE+60 or BASE+91
    expect(r.jsonBody.result.endsAt).toBe(iso(BASE + 60 * MIN));     // original preserved
  });
});

// ── lib-level extendRejection sanity (pure) ──────────────────────────────────
describe("B2B extendRejection (pure)", () => {
  const timed = { status: "published", maxAttempts: 1, durationMinutes: 60, attemptModelVersion: 2 };
  it("untimed => 400; no active => 409; not-later => 400; valid later => null", () => {
    expect(extendRejection({ ...timed, durationMinutes: 0 }, { activeAttempt: { startedAt: iso(BASE), endsAt: "" } }, iso(BASE + 90 * MIN), BASE).status).toBe(400);
    expect(extendRejection(timed, { attempts: [], activeAttempt: null }, iso(BASE + 90 * MIN), BASE).status).toBe(409);
    const active = { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(BASE), endsAt: iso(BASE + 60 * MIN) } };
    expect(extendRejection(timed, active, iso(BASE + 30 * MIN), BASE).status).toBe(400); // earlier
    expect(extendRejection(timed, active, iso(BASE + 90 * MIN), BASE)).toBeNull();       // later => ok
  });
});
