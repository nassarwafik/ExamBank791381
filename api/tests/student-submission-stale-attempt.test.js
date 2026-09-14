import { describe, it, expect, vi } from "vitest";

// Roadmap #10/#11 — server-side stale-attempt guard. A modern (timed / attemptModelVersion>=2) saveDraft or
// submit that carries the identity of an OLD attempt must be rejected with 409 and write nothing, even when
// it arrives after a newer attempt has started. Legacy untimed attempts (no asserted identity) are unaffected.
const { handler } = await import("../src/functions/student-submission.js");

const AP = "platform/assignments/", SP = "platform/submissions/";
function modernAssignment() { return { assignmentId: "as1", classId: "c1", status: "published", durationMinutes: 0, maxAttempts: 3, attemptModelVersion: 2, title: "T", examSnapshot: { questions: [] } }; }
function legacyAssignment() { return { assignmentId: "as1", classId: "c1", status: "published", durationMinutes: 0, maxAttempts: 3, title: "T", examSnapshot: { questions: [] } }; } // attemptModelVersion undefined → legacy
function submissionAttempt2() {
  return { schemaVersion: 1, assignmentId: "as1", studentId: "u1", classId: "c1", draftAnswers: { q1: "KEEP_ATTEMPT2_DRAFT" }, draftSavedAt: "2026-01-01T12:01:00.000Z",
    attempts: [{ attemptNumber: 1, submittedAt: "x" }], activeAttempt: { attemptNumber: 2, startedAt: "2026-01-01T12:00:00.000Z", endsAt: "", status: "started" } };
}
function makeDeps(a, sub) {
  const store = { doc: sub };
  const student = { userId: "u1", classId: "c1", code: "S1", displayName: "Ali" };
  const gradeExam = vi.fn(() => ({ score: 0, totalMarks: 0, percentage: 0, manualReviewMarks: 0, finalized: true, questions: [], sections: [] }));
  return {
    store, gradeExam,
    deps: {
      requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
      downloadJsonOrNull: async (_c, name) => name === AP + "as1.json" ? a : (name === "platform/classes/c1.json" ? { classId: "c1", active: true } : (name.startsWith(SP) ? store.doc : null)),
      mutateJsonWithRetry: async (_c, _n, fn) => { const next = await fn(store.doc ? JSON.parse(JSON.stringify(store.doc)) : null); store.doc = next; return next; },
      withAssignmentLock: async (_c, _id, fn) => fn(),
      gradeExam,
      recordAchievementIfEligible: async () => {}
    }
  };
}
const req = (body) => ({ method: "POST", params: { assignmentId: "as1" }, headers: { get: () => null }, json: async () => body });

describe("R10/R11 server stale-attempt guard", () => {
  it("6: a modern saveDraft carrying attempt-1 identity is rejected 409 when attempt 2 is live; draft untouched", async () => {
    const a = modernAssignment(); const { store, deps } = makeDeps(a, submissionAttempt2());
    const res = await handler(req({ action: "saveDraft", answers: { q1: "STALE_ATTEMPT1_WRITE" }, expectedAttemptNumber: 1, expectedStartedAt: "2026-01-01T10:00:00.000Z" }), deps);
    expect(res.status).toBe(409);
    expect(store.doc.draftAnswers.q1).toBe("KEEP_ATTEMPT2_DRAFT");         // unchanged
    expect(store.doc.activeAttempt.attemptNumber).toBe(2);
  });

  it("7/C: a modern submit carrying attempt-1 identity is rejected 409; nothing graded, gradeExam NOT called", async () => {
    const a = modernAssignment(); const { store, deps, gradeExam } = makeDeps(a, submissionAttempt2());
    const before = store.doc.attempts.length;
    const res = await handler(req({ action: "submit", answers: { q1: "x" }, expectedAttemptNumber: 1, expectedStartedAt: "2026-01-01T10:00:00.000Z" }), deps);
    expect(res.status).toBe(409);
    expect(store.doc.attempts.length).toBe(before);                        // nothing graded/pushed
    expect(store.doc.activeAttempt.attemptNumber).toBe(2);                 // active attempt intact
    expect(gradeExam).not.toHaveBeenCalled();                             // grading never ran for a stale submit
  });

  it("A: a modern saveDraft WITHOUT any expected identity fails closed (409); draft unchanged", async () => {
    const a = modernAssignment(); const { store, deps } = makeDeps(a, submissionAttempt2());
    const res = await handler(req({ action: "saveDraft", answers: { q1: "NO_IDENTITY" } }), deps); // no expected* fields
    expect(res.status).toBe(409);
    expect(store.doc.draftAnswers.q1).toBe("KEEP_ATTEMPT2_DRAFT");
  });

  it("B: a modern submit WITHOUT any expected identity fails closed (409); gradeExam NOT called, attempts unchanged", async () => {
    const a = modernAssignment(); const { store, deps, gradeExam } = makeDeps(a, submissionAttempt2());
    const before = store.doc.attempts.length;
    const res = await handler(req({ action: "submit", answers: { q1: "x" } }), deps); // no expected* fields
    expect(res.status).toBe(409);
    expect(gradeExam).not.toHaveBeenCalled();
    expect(store.doc.attempts.length).toBe(before);
  });

  it("matching identity saves normally (200)", async () => {
    const a = modernAssignment(); const { store, deps } = makeDeps(a, submissionAttempt2());
    const res = await handler(req({ action: "saveDraft", answers: { q1: "FRESH" }, expectedAttemptNumber: 2, expectedStartedAt: "2026-01-01T12:00:00.000Z" }), deps);
    expect(res.status).toBe(200);
    expect(store.doc.draftAnswers.q1).toBe("FRESH");
  });

  it("legacy untimed without asserted identity is unaffected (200)", async () => {
    const a = legacyAssignment();
    // legacy, no active attempt yet → lazy creation; no expected identity sent
    const { store, deps } = makeDeps(a, { schemaVersion: 1, assignmentId: "as1", studentId: "u1", classId: "c1", draftAnswers: {}, attempts: [], activeAttempt: null });
    const res = await handler(req({ action: "saveDraft", answers: { q1: "LEGACY" } }), deps);
    expect(res.status).toBe(200);
    expect(store.doc.draftAnswers.q1).toBe("LEGACY");
  });
});
