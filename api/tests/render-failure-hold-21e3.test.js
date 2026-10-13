import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 21E.3 — assessment integrity when a question renderer cannot recover on the student's device.
//
// Fail-first (owner decision, PR #303): on the defective baseline a question the student could NOT see (a chunk-load /
// runtime failure the recovery card could not clear) was submitted as a plain blank and auto-graded 0 as if the student had
// chosen not to answer. The fix is SERVER-AUTHORITATIVE: the client only REPORTS (`renderFailures`, additive); the API
// verifies the report against the published exam and the stored answers and, for a question that is unanswered, HOLDS the
// grade for the teacher (score 0 / manualReview true — the same mechanism a compile error or a key-less table uses), so
// the attempt stays pendingReview and never publishes an automatic zero. A report can never RAISE a score, never touches an
// answered question, never names a question outside the exam, and is bounded. Legacy submissions (no field) are unchanged.
//
// Every test runs the REAL handlers on the in-memory blob store with the REAL grader (nothing stubbed).

const S1 = "11111111-1111-1111-1111-111111111111";
const CID = "c1";
const MIN = 60000;
const T0 = Date.UTC(2026, 9, 13, 8, 0, 0);
const iso = ms => new Date(ms).toISOString();
// q1 / q2 / q3: multiple choice, 2 marks each; q2 is the question whose renderer fails.
const EXAM = { questions: [
  { examQuestionId: "q1", presentationType: "multipleChoice", text: "س1", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } },
  { examQuestionId: "q2", presentationType: "multipleChoice", text: "س2", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } },
  { examQuestionId: "q3", presentationType: "multipleChoice", text: "س3", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }
] };
const A1 = { kind: "choice", index: 0 }, A2 = { kind: "choice", index: 1 }, A3 = { kind: "choice", index: 0 };

let ctx;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: CID, active: true, archived: false, authVersion: 1 },
    ["platform/classes/" + CID + ".json"]: { classId: CID, name: "الصف", active: true, studentIds: [] }
  });
});
afterEach(() => { vi.useRealTimers(); });
const at = ms => vi.setSystemTime(ms);

const T = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const SD = () => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), recordAchievementIfEligible: async () => {} });
const manage = body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T());
const results = (aid, body) => body
  ? resultsHandler({ method: "POST", url: "https://x/api/assignment-results", json: async () => ({ assignmentId: aid, studentId: S1, ...body }) }, T())
  : resultsHandler({ method: "GET", url: "https://x/api/assignment-results?assignmentId=" + aid }, T());
const review = (aid, body) => body
  ? reviewHandler({ method: "POST", url: "https://x/api/assignment-review", json: async () => ({ action: "saveReview", assignmentId: aid, studentId: S1, attemptNumber: 1, ...body }) }, T())
  : reviewHandler({ method: "GET", url: "https://x/api/assignment-review?assignmentId=" + aid + "&studentId=" + S1 + "&attemptNumber=1" }, T());
const sub = (aid, body) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: { get: () => null }, json: async () => body }, SD());
const getState = async aid => (await submissionHandler({ method: "GET", params: { assignmentId: aid }, headers: { get: () => null } }, SD())).jsonBody.state;
const idOf = st => ({ expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt, ...(st.activeAttempt.attemptEpoch ? { expectedAttemptEpoch: st.activeAttempt.attemptEpoch } : {}) });
const doc = aid => ctx.getJson("platform/submissions/" + aid + "/" + S1 + ".json");
const gradeOf = (attempt, id) => attempt.questionGrades.find(g => g.questionId === id);

async function create(extra = {}) {
  const r = await manage({ action: "create", classId: CID, title: "امتحان", examSnapshot: EXAM, publish: true, maxAttempts: 1, openAt: iso(T0 - MIN), dueAt: iso(T0 + 24 * 60 * MIN), ...extra });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.assignment.assignmentId;
}
async function start(aid) {
  const r = await sub(aid, { action: "startAttempt" });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.state;
}
const FAIL_Q2 = [{ questionId: "q2", code: "chunk-load" }];

describe("fail-first — an unrecoverable renderer failure is never graded as a silent zero", () => {
  it("submit with a verified render failure on an UNANSWERED question: that question is held for the teacher, the attempt is pendingReview, nothing else changes", async () => {
    const aid = await create();
    const st = await start(aid);
    const r = await sub(aid, { action: "submit", answers: { q1: A1, q3: A3 }, renderFailures: FAIL_Q2, ...idOf(st) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    // the two answered questions are graded exactly as before
    expect(gradeOf(attempt, "q1")).toMatchObject({ score: 2, correct: true, manualReview: false });
    expect(gradeOf(attempt, "q3")).toMatchObject({ score: 2, correct: true, manualReview: false });
    // the unseen question is HELD, not zeroed: pending teacher review with its technical reason recorded
    expect(gradeOf(attempt, "q2")).toMatchObject({ score: 0, correct: false, manualReview: true, technicalFailure: { code: "chunk-load" } });
    expect(attempt.manualReviewMarks).toBe(2);
    expect(attempt.finalized).toBe(false);
    expect(attempt.score).toBe(4);
    expect(attempt.totalMarks).toBe(6);
    expect(attempt.renderFailures).toEqual({ q2: expect.objectContaining({ code: "chunk-load", held: true }) });
    // the student-facing result says the mark is not final (and how many questions are technically held)
    expect(r.jsonBody.result.gradingStatus).toBe("pendingReview");
    expect(r.jsonBody.result.finalized).toBe(false);
    expect(r.jsonBody.result.technicalHolds).toBe(1);
    // the teacher gradebook row reports the same status, never a published final 4/6
    const rows = (await results(aid)).jsonBody.students;
    const row = rows.find(x => x.studentId === S1);
    expect(row.gradingStatus).toBe("pendingReview");
    expect(row.attempts[0].technicalHolds).toBe(1);
  });

  it("the same submission WITHOUT the report (a legacy / older client) grades the blank as before: 0, final — the baseline contract is unchanged", async () => {
    const aid = await create();
    const st = await start(aid);
    const r = await sub(aid, { action: "submit", answers: { q1: A1, q3: A3 }, ...idOf(st) });
    expect(r.status).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(gradeOf(attempt, "q2")).toMatchObject({ score: 0, manualReview: false });
    expect(gradeOf(attempt, "q2").technicalFailure).toBeUndefined();
    expect(attempt.finalized).toBe(true);
    expect(attempt.renderFailures).toBeUndefined();
    expect(r.jsonBody.result.gradingStatus).toBe("final");
    expect(r.jsonBody.result.technicalHolds).toBeUndefined();
  });

  it("teacher review shows the held question with its reason, and an explicit teacher score resolves it to a final grade (the existing override path)", async () => {
    const aid = await create();
    const st = await start(aid);
    await sub(aid, { action: "submit", answers: { q1: A1, q3: A3 }, renderFailures: FAIL_Q2, ...idOf(st) });
    const g = await review(aid);
    expect(g.status).toBe(200);
    const q2 = g.jsonBody.questions.find(q => q.questionId === "q2");
    expect(q2.autoGrade).toMatchObject({ manualReview: true, technicalFailure: { code: "chunk-load" } });
    expect(q2.studentAnswer).toBeNull();
    expect(g.jsonBody.attempt.gradingStatus).toBe("pendingReview");
    expect(g.jsonBody.attempt.technicalHolds).toBe(1);
    // the teacher decides: award the full mark after re-examining (or a retry) — the attempt becomes final through the normal path
    const s = await review(aid, { overrides: { q2: { score: 2, comment: "تعذّر عرض السؤال على جهاز الطالب؛ احتُسبت العلامة بعد إعادة الاختبار" } } });
    expect(s.status, JSON.stringify(s.jsonBody)).toBe(200);
    expect(s.jsonBody.result).toMatchObject({ finalized: true, gradingStatus: "final", score: 6 });
    const after = doc(aid).attempts[0];
    expect(after.finalized).toBe(true);
    expect(after.manualReviewMarks).toBe(0);
    expect(gradeOf(after, "q2")).toMatchObject({ score: 2, manualScore: 2, manualReview: false, technicalFailure: { code: "chunk-load" } });   // the reason stays on record
  });
});

describe("the report is untrusted input — verified server-side, it can only move a grade TOWARD the teacher, never upward", () => {
  it("a report on an ANSWERED question changes nothing: the answer is graded normally (right or wrong), no hold, the report is recorded as not held", async () => {
    const aid = await create();
    const st = await start(aid);
    const wrong = { kind: "choice", index: 0 };   // q2's key is index 1
    const r = await sub(aid, { action: "submit", answers: { q1: A1, q2: wrong, q3: A3 }, renderFailures: FAIL_Q2, ...idOf(st) });
    expect(r.status).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(gradeOf(attempt, "q2")).toMatchObject({ score: 0, correct: false, manualReview: false });
    expect(gradeOf(attempt, "q2").technicalFailure).toBeUndefined();
    expect(attempt.finalized).toBe(true);
    expect(attempt.score).toBe(4);
    expect(attempt.renderFailures).toEqual({ q2: expect.objectContaining({ code: "chunk-load", held: false }) });
    expect(r.jsonBody.result.technicalHolds).toBeUndefined();
  });

  it("forged / malformed reports are dropped: unknown question ids, unknown codes, non-object entries, prototype keys, a non-array field — nothing is stored, the grade is the ordinary one", async () => {
    const aid = await create();
    const st = await start(aid);
    const forged = [
      { questionId: "q9", code: "chunk-load" },            // not a question of the published exam
      { questionId: "q2", code: "teacher-approved" },       // not a known technical code
      { questionId: "q2", code: "chunk-load", score: 2 },    // extra fields are irrelevant (kept only as questionId + code)
      "q3", null, 7, { questionId: 5, code: "runtime" }, { questionId: "__proto__", code: "runtime" }, { code: "runtime" }
    ];
    const r = await sub(aid, { action: "submit", answers: { q1: A1 }, renderFailures: forged, ...idOf(st) });
    expect(r.status).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(Object.keys(attempt.renderFailures)).toEqual(["q2"]);                 // only the one valid report survives
    expect(gradeOf(attempt, "q2")).toMatchObject({ manualReview: true, technicalFailure: { code: "chunk-load" } });
    expect(gradeOf(attempt, "q3")).toMatchObject({ score: 0, manualReview: false });   // a genuine blank stays a blank (0, final)
    expect(gradeOf(attempt, "q3").technicalFailure).toBeUndefined();
    expect(attempt.manualReviewMarks).toBe(2);
    expect(attempt.score).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(attempt.renderFailures, "__proto__")).toBe(false);
    for (const bad of [{ q2: "chunk-load" }, "q2", 1, true]) {
      const aid2 = await create();
      const st2 = await start(aid2);
      const r2 = await sub(aid2, { action: "submit", answers: { q1: A1 }, renderFailures: bad, ...idOf(st2) });
      expect(r2.status).toBe(200);
      const a2 = doc(aid2).attempts[0];
      expect(a2.renderFailures).toBeUndefined();
      expect(a2.finalized).toBe(true);
    }
  });

  it("a report never raises a score: a wrong answer with a report stays wrong, and a held question scores 0 until the teacher decides", async () => {
    const aid = await create();
    const st = await start(aid);
    const r = await sub(aid, { action: "submit", answers: { q1: { kind: "choice", index: 1 } }, renderFailures: [{ questionId: "q1", code: "runtime" }, { questionId: "q2", code: "runtime" }, { questionId: "q3", code: "runtime" }], ...idOf(st) });
    expect(r.status).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(attempt.score).toBe(0);
    expect(gradeOf(attempt, "q1")).toMatchObject({ score: 0, manualReview: false });
    expect(gradeOf(attempt, "q2")).toMatchObject({ score: 0, manualReview: true });
    expect(gradeOf(attempt, "q3")).toMatchObject({ score: 0, manualReview: true });
    expect(attempt.manualReviewMarks).toBe(4);
    expect(attempt.finalized).toBe(false);
  });

  it("the report is bounded: duplicates collapse to one entry and at most the exam's own questions are ever recorded", async () => {
    const aid = await create();
    const st = await start(aid);
    const many = Array.from({ length: 500 }, (_, i) => ({ questionId: i % 2 ? "q2" : "q3", code: "chunk-load" }));
    const r = await sub(aid, { action: "submit", answers: { q1: A1 }, renderFailures: many, ...idOf(st) });
    expect(r.status).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(Object.keys(attempt.renderFailures).sort()).toEqual(["q2", "q3"]);
  });
});

describe("the report survives the paths that grade the SERVER draft (timeout, strict exit, teacher end)", () => {
  it("saveDraft persists the latest report with the draft; a later saveDraft without failures clears it; a timed-out attempt is finalized with the hold", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    const s1 = await sub(aid, { action: "saveDraft", answers: { q1: A1 }, renderFailures: FAIL_Q2, ...idOf(st) });
    expect(s1.status, JSON.stringify(s1.jsonBody)).toBe(200);
    expect(doc(aid).draftRenderFailures).toEqual([{ questionId: "q2", code: "chunk-load" }]);
    const s2 = await sub(aid, { action: "saveDraft", answers: { q1: A1 }, renderFailures: [], ...idOf(st) });
    expect(s2.status).toBe(200);
    expect(doc(aid).draftRenderFailures).toBeUndefined();
    const s3 = await sub(aid, { action: "saveDraft", answers: { q1: A1, q3: A3 }, renderFailures: FAIL_Q2, ...idOf(st) });
    expect(s3.status).toBe(200);
    at(T0 + 31 * MIN);
    const f = await sub(aid, { action: "finalizeTimedOutAttempt" });
    expect(f.status, JSON.stringify(f.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(attempt.endReason).toBe("timedOut");
    expect(gradeOf(attempt, "q2")).toMatchObject({ score: 0, manualReview: true, technicalFailure: { code: "chunk-load" } });
    expect(attempt.finalized).toBe(false);
    expect(attempt.renderFailures.q2.held).toBe(true);
    expect(doc(aid).draftRenderFailures).toBeUndefined();   // consumed with the draft
    expect((await getState(aid)).latestResult.technicalHolds).toBe(1);
  });

  it("a strict attempt the student left (finalizeIntegrityExit) honours the saved report; the teacher's endActiveAttempt does too", async () => {
    const aidStrict = await create({ attemptPolicy: "strict" });
    const st = await start(aidStrict);
    expect((await sub(aidStrict, { action: "saveDraft", answers: { q1: A1 }, renderFailures: FAIL_Q2, ...idOf(st) })).status).toBe(200);
    const x = await sub(aidStrict, { action: "finalizeIntegrityExit", ...idOf(st) });
    expect(x.status, JSON.stringify(x.jsonBody)).toBe(200);
    const a1 = doc(aidStrict).attempts[0];
    expect(a1.endReason).toBe("integrityExit");
    expect(gradeOf(a1, "q2")).toMatchObject({ manualReview: true, technicalFailure: { code: "chunk-load" } });
    expect(a1.finalized).toBe(false);

    const aid = await create();
    const st2 = await start(aid);
    expect((await sub(aid, { action: "saveDraft", answers: { q1: A1 }, renderFailures: FAIL_Q2, ...idOf(st2) })).status).toBe(200);
    const e = await results(aid, { action: "endActiveAttempt", ...idOf(st2) });
    expect(e.status, JSON.stringify(e.jsonBody)).toBe(200);
    const a2 = doc(aid).attempts[0];
    expect(a2.endReason).toBe("teacherEnded");
    expect(gradeOf(a2, "q2")).toMatchObject({ manualReview: true, technicalFailure: { code: "chunk-load" } });
    expect(a2.finalized).toBe(false);
    expect(e.jsonBody.gradingStatus).toBe("pendingReview");
  });

  it("the pausable «حفظ مؤقت» path carries the report like a save; a submit's own report (the client's current knowledge) wins over the draft record", async () => {
    const aid = await create({ attemptPolicy: "pausable" });
    let st = await start(aid);
    expect((await sub(aid, { action: "pauseAttempt", answers: { q1: A1 }, renderFailures: FAIL_Q2, ...idOf(st) })).status).toBe(200);
    expect(doc(aid).draftRenderFailures).toEqual([{ questionId: "q2", code: "chunk-load" }]);
    st = await getState(aid);
    expect((await sub(aid, { action: "resumeAttempt", ...idOf(st) })).status).toBe(200);
    st = await getState(aid);
    // after the resume the question rendered: the submit reports no failure → ordinary grading, the stale draft record is not applied
    const r = await sub(aid, { action: "submit", answers: { q1: A1, q2: A2, q3: A3 }, renderFailures: [], ...idOf(st) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(attempt.finalized).toBe(true);
    expect(attempt.score).toBe(6);
    expect(attempt.renderFailures).toBeUndefined();
  });
});

describe("structured exams — first-N sections", () => {
  const STRUCTURED = { sections: [{ id: "s1", title: "اختر 2 من 3", gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 4, questions: EXAM.questions }] };
  it("the quota is not met because a question could not be shown → held (counted) so the teacher can award it; a saturated quota is not held", async () => {
    const aid = await create({ examSnapshot: STRUCTURED });
    const st = await start(aid);
    const r = await sub(aid, { action: "submit", answers: { q1: A1 }, renderFailures: FAIL_Q2, ...idOf(st) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(gradeOf(attempt, "q2")).toMatchObject({ manualReview: true, countedMaxMarks: 2, technicalFailure: { code: "chunk-load" } });
    expect(attempt.manualReviewMarks).toBe(2);
    expect(attempt.finalized).toBe(false);
    const s = await review(aid, { overrides: { q2: { score: 2, comment: "" } } });
    expect(s.jsonBody.result).toMatchObject({ finalized: true, score: 4, totalMarks: 4 });

    const aid2 = await create({ examSnapshot: STRUCTURED });
    const st2 = await start(aid2);
    const r2 = await sub(aid2, { action: "submit", answers: { q1: A1, q3: A3 }, renderFailures: FAIL_Q2, ...idOf(st2) });
    expect(r2.status).toBe(200);
    const a2 = doc(aid2).attempts[0];
    expect(gradeOf(a2, "q2").manualReview).toBe(false);          // two counted answers already fill the quota: nothing to hold
    expect(a2.finalized).toBe(true);
    expect(a2.score).toBe(4);
    expect(a2.renderFailures.q2.held).toBe(false);
  });
});

describe("Review Fix 4 — P1 / P2 of the independent review of 0546504", () => {
  it("P1: a report the client could not persist earlier is accepted on the finalize actions themselves (toward the teacher only)", async () => {
    const aid = await create({ durationMinutes: 30 });
    const st = await start(aid);
    expect((await sub(aid, { action: "saveDraft", answers: { q1: A1 }, ...idOf(st) })).status).toBe(200);   // offline-lost report: nothing recorded
    expect(doc(aid).draftRenderFailures).toBeUndefined();
    at(T0 + 31 * MIN);
    const f = await sub(aid, { action: "finalizeTimedOutAttempt", renderFailures: FAIL_Q2 });
    expect(f.status, JSON.stringify(f.jsonBody)).toBe(200);
    const a1 = doc(aid).attempts[0];
    expect(gradeOf(a1, "q2")).toMatchObject({ score: 0, manualReview: true, technicalFailure: { code: "chunk-load" } });
    expect(a1.finalized).toBe(false);
    // the strict exit likewise; and a report on an answered question still changes nothing
    const aidStrict = await create({ attemptPolicy: "strict" });
    const st2 = await start(aidStrict);
    expect((await sub(aidStrict, { action: "saveDraft", answers: { q1: A1, q2: A2 }, ...idOf(st2) })).status).toBe(200);
    const x = await sub(aidStrict, { action: "finalizeIntegrityExit", renderFailures: [{ questionId: "q2", code: "runtime" }, { questionId: "q3", code: "runtime" }], ...idOf(st2) });
    expect(x.status, JSON.stringify(x.jsonBody)).toBe(200);
    const a2 = doc(aidStrict).attempts[0];
    expect(gradeOf(a2, "q2")).toMatchObject({ score: 2, manualReview: false });
    expect(gradeOf(a2, "q3")).toMatchObject({ score: 0, manualReview: true, technicalFailure: { code: "runtime" } });
    expect(a2.finalized).toBe(false);
  });

  it("P2: holds are bounded by the open first-N slots and never inflate a derived section maximum", async () => {
    const NO_MAX = { sections: [{ id: "s1", title: "اختر 2 من 3", gradingPolicy: "firstNAnswered", requiredAnswers: 2, questions: EXAM.questions }] };
    const aid = await create({ examSnapshot: NO_MAX });
    const st = await start(aid);
    const r = await sub(aid, { action: "submit", answers: { q1: A1 }, renderFailures: [{ questionId: "q2", code: "chunk-load" }, { questionId: "q3", code: "chunk-load" }], ...idOf(st) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const attempt = doc(aid).attempts[0];
    expect(gradeOf(attempt, "q2")).toMatchObject({ manualReview: true, countedMaxMarks: 2 });   // the ONE open slot, in exam order
    expect(gradeOf(attempt, "q3")).toMatchObject({ manualReview: false, countedMaxMarks: 0 });
    expect(attempt.renderFailures.q3.held).toBe(false);
    expect(attempt.manualReviewMarks).toBe(2);
    expect(attempt.totalMarks).toBe(4);                                              // 2 answered-or-held slots × 2 marks, never 6
    const s = await review(aid, { overrides: { q2: { score: 0, comment: "" } } });
    expect(s.jsonBody.result).toMatchObject({ finalized: true, score: 2, totalMarks: 4 });
  });
});
