import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// D4 (item 7) — the student's per-question mark breakdown: marks and the teacher's comment only (owner decision), only inside a
// released result, never while official coding grading can still change a mark. Real student-submission / assignment-review
// handlers on the in-memory container.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const review = require_("../src/functions/assignment-review.js");
const { questionBreakdown, statusOf } = require_("../src/lib/student-question-breakdown.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const mc = (id, correct, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "اختر " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: correct } });
const exam = questions => ({ title: "t", metadata: {}, sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions }] });

function harness(over = {}) {
  const a = F.assignment({ attemptModelVersion: undefined, attemptPolicy: undefined, durationMinutes: 0, maxAttempts: 1, examSnapshot: exam([mc("mc1", 1), mc("mc2", 0)]), totalMarks: 4, ...over });
  const ctx = F.seed({ a, doc: null });
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() };
  return {
    ctx,
    submit: answers => submission.handler(F.studentRequest({ action: "submit", answers }), sDeps, quiet),
    state: () => submission.handler(F.studentRequest(null, "GET"), sDeps, quiet),
    saveReview: overrides => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), tDeps, quiet)
  };
}

describe("the projection — an allowlist, field by field", () => {
  it("only number, section, status, max, score (not while pending) and the teacher's comment leave the server", () => {
    const attempt = { sections: [{ id: "s1", title: "قسم", gradingPolicy: "capScore", score: 3, maxMarks: 5, questionIds: ["q1"] }], questionGrades: [
      { questionId: "q1", questionNumber: 1, sectionId: "s1", score: 2, maxMarks: 2, correct: true, manualReview: false, expected: "SECRET-EXPECTED", answer: { correctOptionIndex: 1 }, parts: [{ partId: "p", expected: "SECRET" }], composite: { groups: [] }, teacherComment: "  ممتاز  " },
      { questionId: "q2", questionNumber: 2, sectionId: "s1", score: 0, maxMarks: 3, manualReview: true, rubric: "SECRET-RUBRIC" },
      { questionId: "q3", questionNumber: 3, sectionId: "s1", score: 1, maxMarks: 4, ignored: true }
    ] };
    const b = questionBreakdown(attempt);
    expect(b).toEqual({
      sections: [{ id: "s1", title: "قسم", capped: true }],
      questions: [
        { number: 1, sectionId: "s1", status: "full", maxMarks: 2, score: 2, comment: "ممتاز" },
        { number: 2, sectionId: "s1", status: "pending", maxMarks: 3 },
        { number: 3, sectionId: "s1", status: "notCounted", maxMarks: 4, score: 1 }
      ]
    });
    expect(JSON.stringify(b)).not.toMatch(/SECRET|correctOptionIndex|expected|rubric|questionId/);
  });
  it("statuses: full / partial / zero / pending (manual review or an unreviewed render hold) / notCounted", () => {
    expect(statusOf({ score: 3, maxMarks: 3 })).toBe("full");
    expect(statusOf({ score: 1.5, maxMarks: 3 })).toBe("partial");
    expect(statusOf({ score: 0, maxMarks: 3 })).toBe("zero");
    expect(statusOf({ score: 0, maxMarks: 3, manualReview: true })).toBe("pending");
    expect(statusOf({ score: 0, maxMarks: 3, technicalFailure: { code: "x" } })).toBe("pending");
    expect(statusOf({ score: 2, maxMarks: 3, technicalFailure: { code: "x" }, reviewed: true })).toBe("partial");
    expect(statusOf({ score: 3, maxMarks: 3, ignored: true })).toBe("notCounted");
  });
  it("an attempt without grades has no breakdown", () => {
    expect(questionBreakdown({})).toBeNull();
    expect(questionBreakdown({ questionGrades: [] })).toBeNull();
  });
});

describe("through the real handlers", () => {
  it("a released result carries the breakdown (one full, one zero) and no answer key anywhere", async () => {
    const h = harness();
    const r = await h.submit({ mc1: { kind: "choice", index: 1 }, mc2: { kind: "choice", index: 1 } });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.result.questionBreakdown.questions.map(q => [q.number, q.status, q.score, q.maxMarks])).toEqual([[1, "full", 2, 2], [2, "zero", 0, 2]]);
    const state = await h.state();
    expect(state.jsonBody.state.latestResult.questionBreakdown.questions).toHaveLength(2);
    expect(JSON.stringify(state.jsonBody.state.latestResult.questionBreakdown)).not.toMatch(/correctOptionIndex|"answer"|index/);
  });
  it("results not released yet (manual release) → no breakdown, exactly like the score", async () => {
    const h = harness({ resultsRelease: "manual" });
    const r = await h.submit({ mc1: { kind: "choice", index: 1 }, mc2: { kind: "choice", index: 0 } });
    expect(r.jsonBody.result.resultsVisible).toBe(false);
    expect(r.jsonBody.result.questionBreakdown).toBeUndefined();
    expect((await h.state()).jsonBody.state.latestResult.questionBreakdown).toBeUndefined();
  });
  it("the teacher's per-question comment from a review reaches the student, with the reviewed mark", async () => {
    const h = harness();
    await h.submit({ mc1: { kind: "choice", index: 0 }, mc2: { kind: "choice", index: 0 } });
    expect((await h.saveReview({ mc1: { score: 1, comment: "راجع الخيار الثاني" } })).status).toBe(200);
    const q = (await h.state()).jsonBody.state.latestResult.questionBreakdown.questions;
    expect(q[0]).toEqual({ number: 1, sectionId: "s1", status: "partial", maxMarks: 2, score: 1, comment: "راجع الخيار الثاني" });
    expect(q[1]).toEqual({ number: 2, sectionId: "s1", status: "full", maxMarks: 2, score: 2 });
  });
  it("while official coding grading is open the score is withheld — and so is the breakdown", async () => {
    const ctx = F.seed();
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const r = await submission.handler(F.studentRequest(F.submitBody({ auto1: F.code("print(1)\n"), sa1: { kind: "text", value: "x" } })), deps, quiet);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.result.autoGradingPending).toBe(true);
    expect(r.jsonBody.result.questionBreakdown).toBeUndefined();
  });
});
