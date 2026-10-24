import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { compositeCsExam } from "../../src/composite/compositeFixtures";

// QA-1 — a render-failure technical hold (Phase 21E.3) on a HIDDEN-TEST coding question must survive official coding grading.
//
// Fail-first (QA on main c244cbab): a coding question the student's device could not render was held for the teacher by
// applyRenderFailureHolds (score 0, manualReview true), and then planCodingGrading's "no answer" branch turned that hold into an
// automatic, FINAL 0 (manualReview false, attempt finalized, gradingStatus "final") — on submit, on the timed-out finalize, on the
// teacher's endActiveAttempt, for a composite@1 coding part, and again on a teacher force regrade. AGENTS.md §10: never manufacture
// an academic zero because of an infrastructure failure. The fix: a target whose question is held for a render failure records
// the no-answer evidence but keeps the grade under review; an unheld unanswered question still grades 0 exactly as before.
//
// Every test runs the REAL handlers on the in-memory store (fixtures shared with the 17C coding tests).

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const results = require_("../src/functions/assignment-results.js");
const grading = require_("../src/functions/coding-grading.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const SA = { sa1: { kind: "text", value: "x" } };
const RF = qid => ({ renderFailures: [{ questionId: qid, code: "chunk-load" }] });

function harness({ ctx = F.seed(), fetch = F.runnerFetch() } = {}) {
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch };
  return {
    ctx, fetch,
    submit: (answers, extra = {}) => submission.handler(F.studentRequest({ ...F.submitBody(answers), ...extra }), sDeps, quiet),
    student: body => submission.handler(F.studentRequest(body), sDeps, quiet),
    results: body => results.handler(F.teacherRequest("/api/assignment-results", body), tDeps, quiet),
    regrade: body => grading.regradeHandler(F.teacherRequest("/api/coding/regrade", body), tDeps, quiet),
    attempt: () => ctx.getJson(F.SUB).attempts[0],
    grade: (q = "auto1") => ctx.getJson(F.SUB).attempts[0].questionGrades.find(g => g.questionId === q)
  };
}

// The held question stays the teacher's: under review, not finalized, with the technical reason kept.
function expectHeld(attempt, questionId = "auto1") {
  expect(attempt.renderFailures[questionId]).toMatchObject({ held: true });
  const g = attempt.questionGrades.find(x => x.questionId === questionId);
  expect(g).toMatchObject({ score: 0, manualReview: true, correct: false, technicalFailure: { reason: "renderFailure" } });
  expect(attempt.finalized).toBe(false);
  expect(attempt.manualReviewMarks).toBeGreaterThan(0);
}

describe("QA-1 render-failure hold on a hidden-test coding question survives official grading", () => {
  it("submit: the held, unanswered coding question stays under review — the attempt is pendingReview, never a final 0", async () => {
    const h = harness();
    const r = await h.submit(SA, RF("auto1"));
    expect(r.status).toBe(200);
    expectHeld(h.attempt());
    expect(r.jsonBody.result.gradingStatus).toBe("pendingReview");
    expect(h.attempt().codingGrading.targets.auto1).toMatchObject({ state: "complete", result: { outcome: "no-answer" } });   // nothing to run
    expect(h.fetch.jobs()).toHaveLength(0);
  });

  it("timed-out finalize (server draft + draftRenderFailures): same hold", async () => {
    const doc = F.activeDoc(SA, { draftRenderFailures: [{ questionId: "auto1", code: "runtime" }], activeAttempt: { attemptNumber: 1, startedAt: F.STARTED, endsAt: new Date(Date.now() - 1000).toISOString(), status: "draft", attemptEpoch: 1, pauseCount: 0 } });
    const h = harness({ ctx: F.seed({ doc, a: F.assignment({ durationMinutes: 5 }) }) });
    const r = await h.student({ action: "finalizeTimedOutAttempt" });
    expect(r.status).toBe(200);
    expectHeld(h.attempt());
  });

  it("teacher endActiveAttempt: same hold", async () => {
    const h = harness({ ctx: F.seed({ doc: F.activeDoc(SA, { draftRenderFailures: [{ questionId: "auto1", code: "chunk-load" }] }) }) });
    const r = await h.results({ action: "endActiveAttempt", assignmentId: F.AID, studentId: F.S1, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 });
    expect(r.status).toBe(200);
    expectHeld(h.attempt());
  });

  it("composite@1: the held composite's unanswered coding part stays under review", async () => {
    const exam = compositeCsExam();
    const h = harness({ ctx: F.seed({ a: F.assignment({ examSnapshot: { title: "cs", metadata: {}, presentationTheme: "classic", sections: exam.sections }, totalMarks: 18, questionCount: 1 }) }) });
    const r = await h.submit({}, RF("cs1"));
    expect(r.status).toBe(200);
    const a = h.attempt();
    expect(a.renderFailures.cs1).toMatchObject({ held: true });
    expect(a.questionGrades[0].parts.find(p => p.partId === "c1")).toMatchObject({ score: 0, manualReview: true });
    expect(a.finalized).toBe(false);
  });

  it("a teacher force regrade of the held question keeps the hold (no automatic 0 on a new revision)", async () => {
    const h = harness({ fetch: F.runnerFetch("throw") });
    await h.submit(SA, RF("auto1"));
    const r = await h.regrade({ action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" });
    expect(r.status).toBe(200);
    expectHeld(h.attempt());
    expect(h.attempt().codingGrading.targets.auto1).toMatchObject({ revision: 2, state: "complete" });
  });

  it("unchanged: an unanswered coding question WITHOUT a render failure is still the no-answer automatic 0, and the attempt is final", async () => {
    const h = harness();
    const r = await h.submit(SA);
    expect(r.status).toBe(200);
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
    expect(h.grade().technicalFailure).toBeUndefined();
    expect(h.attempt().finalized).toBe(true);
  });

  it("only a server-VERIFIED hold counts: a stored report with held:false on an unanswered question still regrades to the automatic 0", async () => {
    const h = harness({ fetch: F.runnerFetch("throw") });
    await h.submit(SA);
    const doc = h.ctx.getJson(F.SUB);
    doc.attempts[0].renderFailures = { auto1: { code: "chunk-load", held: false, reportedAt: F.STARTED } };
    h.ctx.setJson(F.SUB, doc);
    const r = await h.regrade({ action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" });
    expect(r.status).toBe(200);
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
  });

  it("unchanged: an ANSWERED coding question with a render-failure report is graded normally (report recorded held:false, job dispatched)", async () => {
    const h = harness();
    const r = await h.submit({ ...SA, auto1: F.code("print(1)\n") }, RF("auto1"));
    expect(r.status).toBe(200);
    expect(h.attempt().renderFailures.auto1).toMatchObject({ held: false });
    expect(h.attempt().codingGrading.targets.auto1.state).not.toBe("complete");
    expect(h.fetch.jobs()).toHaveLength(1);
  });
});
