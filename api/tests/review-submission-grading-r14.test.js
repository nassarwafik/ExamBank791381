import { describe, it, expect, vi } from "vitest";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";

// Roadmap #14 — grading status flows through manual review (assignment-review) and student submit/finalize
// (student-submission), independent of timedOut.
const AP = "platform/assignments/", SP = "platform/submissions/", UP = "platform/users/";
const iso = ms => new Date(ms).toISOString();

// ---- assignment-review (Q, R, S) ----
function reviewDeps(store, audits = []) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
    getContainer: () => ({}),
    downloadJsonOrNull: async (_c, key) => store.has(key) ? structuredClone(store.get(key)) : null,
    mutateJsonWithRetry: async (_c, key, fn) => { const cur = store.has(key) ? structuredClone(store.get(key)) : null; const next = await fn(cur); store.set(key, next); return next; },
    recordAuditEvent: async (_c, ev) => audits.push(ev),
    recordAchievementIfEligible: async () => {}
  };
}
function seedReview() {
  const store = new Map();
  store.set(AP + "a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", totalMarks: 15, examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 5, text: "x1" }, { examQuestionId: "q2", presentationType: "shortAnswer", marks: 10, text: "x2" }] } });
  store.set(UP + "s1.json", { userId: "s1", classId: "c1", active: true, displayName: "أ", code: "S1" });
  const attempt = { attemptNumber: 1, submittedAt: iso(Date.now()), score: 5, totalMarks: 15, percentage: 33.33, manualReviewMarks: 10, finalized: false,
    answers: {}, manualOverrides: {}, questionGrades: [
      { questionId: "q1", score: 5, maxMarks: 5, manualReview: false },
      { questionId: "q2", score: 0, maxMarks: 10, manualReview: true }
    ] };
  store.set(SP + "a1/s1.json", { assignmentId: "a1", studentId: "s1", classId: "c1", attempts: [attempt], activeAttempt: null });
  return store;
}
const reviewGet = store => reviewHandler({ method: "GET", url: "http://x/assignment-review?assignmentId=a1&studentId=s1&attemptNumber=1", json: async () => ({}) }, reviewDeps(store));
const saveReview = (store, overrides) => reviewHandler({ method: "POST", url: "http://x/assignment-review", json: async () => ({ action: "saveReview", assignmentId: "a1", studentId: "s1", attemptNumber: 1, overrides, teacherFeedback: "" }) }, reviewDeps(store));

describe("R14 assignment-review gradingStatus", () => {
  it("Q: GET attempt + attempts list include gradingStatus", async () => {
    const r = await reviewGet(seedReview());
    expect(r.status).toBe(200);
    expect(r.jsonBody.attempt.gradingStatus).toBe("pendingReview");
    expect(r.jsonBody.attempts[0].gradingStatus).toBe("pendingReview");
  });
  it("R: saveReview that clears the last manual-review marks => finalized true, gradingStatus final", async () => {
    const store = seedReview();
    const r = await saveReview(store, { q2: { score: 8, comment: "" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.finalized).toBe(true);
    expect(r.jsonBody.result.manualReviewMarks).toBe(0);
    expect(r.jsonBody.result.gradingStatus).toBe("final");
  });
  it("S: saveReview that leaves manual marks => gradingStatus pendingReview", async () => {
    const store = seedReview();
    const r = await saveReview(store, { q1: { score: 5, comment: "" } });   // q2 left unreviewed
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.finalized).toBe(false);
    expect(r.jsonBody.result.manualReviewMarks).toBe(10);
    expect(r.jsonBody.result.gradingStatus).toBe("pendingReview");
  });
});

// ---- student-submission (T, U, V) ----
const student = { userId: "u1", classId: "c1", code: "S1", displayName: "علي" };
function subDeps(store, grade) {
  return {
    requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
    downloadJsonOrNull: async (_c, name) => store.has(name) ? structuredClone(store.get(name)) : null,
    mutateJsonWithRetry: async (_c, name, fn) => { const cur = store.has(name) ? structuredClone(store.get(name)) : null; const next = await fn(cur); store.set(name, next); return next; },
    withAssignmentLock: async (_c, _id, fn) => fn(),
    gradeExam: () => grade,
    recordAchievementIfEligible: async () => {}
  };
}
const subReq = body => ({ method: "POST", params: { assignmentId: "a1" }, headers: { get: () => null }, json: async () => body });

describe("R14 student-submission gradingStatus", () => {
  it("T: a fully auto-graded submit returns gradingStatus final", async () => {
    const store = new Map();
    store.set(AP + "a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", maxAttempts: 1, durationMinutes: 0, examSnapshot: { questions: [] } }); // legacy untimed
    store.set("platform/classes/c1.json", { classId: "c1", active: true });
    const grade = { score: 10, totalMarks: 10, percentage: 100, manualReviewMarks: 0, finalized: true, questions: [], sections: [] };
    const r = await submissionHandler(subReq({ action: "submit", answers: {} }), subDeps(store, grade));
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.finalized).toBe(true);
    expect(r.jsonBody.result.gradingStatus).toBe("final");
  });
  it("U: a manual-review submit returns gradingStatus pendingReview", async () => {
    const store = new Map();
    store.set(AP + "a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", maxAttempts: 1, durationMinutes: 0, examSnapshot: { questions: [] } });
    store.set("platform/classes/c1.json", { classId: "c1", active: true });
    const grade = { score: 5, totalMarks: 20, percentage: 25, manualReviewMarks: 15, finalized: false, questions: [], sections: [] };
    const r = await submissionHandler(subReq({ action: "submit", answers: {} }), subDeps(store, grade));
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.gradingStatus).toBe("pendingReview");
  });
  it("V: timeout finalization status follows grading state INDEPENDENTLY of timedOut", async () => {
    const store = new Map();
    store.set(AP + "a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", maxAttempts: 1, durationMinutes: 30, attemptModelVersion: 2, examSnapshot: { questions: [] } });
    store.set("platform/classes/c1.json", { classId: "c1", active: true });
    // An expired timed active attempt (endsAt in the past relative to real now).
    store.set(SP + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", draftAnswers: {}, attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(Date.now() - 3600000), endsAt: iso(Date.now() - 1800000), status: "started" } });
    const grade = { score: 4, totalMarks: 10, percentage: 40, manualReviewMarks: 6, finalized: false, questions: [], sections: [] }; // still needs manual review
    const r = await submissionHandler(subReq({ action: "finalizeTimedOutAttempt" }), subDeps(store, grade));
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.timedOut).toBe(true);                 // end reason is timed out…
    expect(r.jsonBody.result.endReason).toBe("timedOut");
    expect(r.jsonBody.result.gradingStatus).toBe("pendingReview"); // …but grading status is independent
  });
});
