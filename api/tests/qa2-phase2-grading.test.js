import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { compositeArabicExam, compositeCsExam } from "../../src/composite/compositeFixtures";

// QA round 2 (main 36dc60e9), phase 2 — never a manufactured zero, never a technical hold averaged as 0% (AGENTS.md §10).
//
// QA2-3   a program over the QUESTION'S size limit was dropped at intake (200, no error) and graded as an automatic final 0
//         «لا إجابة». It is kept for the teacher (never run): the coding target completes as "not-runnable" and the question is held.
// QA2-4   a note without a mark on a composite PART stored 0 (clamp(undefined)): the part's automatic score was replaced, and a part
//         held for a render failure (QA-1) became a reviewed 0. The QA-13 rule now covers parts.
// QA2-16  a whitespace score " " was a mark (Number(" ") === 0).
// QA2-5   the teacher's student profile «المعدل» and item analysis averaged a technical hold as 0%.
// QA2-17  the teacher Today feed showed «· 0%» for a still-grading attempt; the student dashboard's legacy stats.average counted it.
// QA2-6   on a legacy model-0 TIMED assignment later set to untimed, the attempt identity check read the assignment's CURRENT duration,
//         so a stale tab's submit for the previous attempt landed on the running one as a new 0.
//
// Real handlers on the in-memory container (the shared 17C fixtures).

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const submission = require_("../src/functions/student-submission.js");
const review = require_("../src/functions/assignment-review.js");
const grading = require_("../src/functions/coding-grading.js");
const { gradeExam } = require_("../src/lib/assignment-grading.js");
const { teacherCodingEvidence } = require_("../src/lib/coding/official-grading.js");
const { buildStudentProfile } = require_("../src/functions/manage-students.js");
const itemAnalysis = require_("../src/functions/assignment-item-analysis.js");
const { deriveTeacherToday } = require_("../src/functions/teacher-today.js");
const studentDashboard = require_("../src/functions/student-dashboard.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const exam = questions => ({ title: "t", metadata: {}, sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
function harness(a, ctx = F.seed({ a })) {
  const fetch = F.runnerFetch();
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch, recordAuditEvent: async () => {}, recordAchievementIfEligible: async () => {} };
  return {
    ctx, fetch,
    student: body => submission.handler(F.studentRequest(body), sDeps, quiet),
    submit: (answers, extra = {}) => submission.handler(F.studentRequest({ ...F.submitBody(answers), ...extra }), sDeps, quiet),
    saveReview: overrides => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), tDeps, quiet),
    callback: body => grading.callbackHandler(F.callbackRequest(body), { getContainer: () => ctx.container, env: F.ENV }, quiet),
    attempt: () => ctx.getJson(F.SUB).attempts[0]
  };
}

describe("QA2-3 a program over the question's size limit is kept for the teacher, never an automatic 0", () => {
  const limited = () => { const q = F.autoQ(); q.coding.limits.sourceBytes = 1024; return q; };
  const big = "print(1)\n" + "#".repeat(1100) + "\n";

  it("submit keeps the code, runs nothing, completes the target as not-runnable and holds the question (attempt not final)", async () => {
    const h = harness(F.assignment({ examSnapshot: exam([limited()]), totalMarks: 10 }));
    expect((await h.submit({ auto1: F.code(big) })).status).toBe(200);
    const at = h.attempt();
    expect(at.answers.auto1).toEqual(F.code(big));
    expect(h.fetch.jobs()).toHaveLength(0);
    expect(at.codingGrading.targets.auto1).toMatchObject({ state: "complete", result: { outcome: "not-runnable" } });
    expect(at.questionGrades.find(g => g.questionId === "auto1")).toMatchObject({ score: 0, manualReview: true });
    expect({ finalized: at.finalized, manualReviewMarks: at.manualReviewMarks }).toEqual({ finalized: false, manualReviewMarks: 10 });
    const ev = teacherCodingEvidence({ questionId: "auto1", node: limited() }, at);
    expect({ outcome: ev.outcome, effectiveScore: ev.effectiveScore }).toEqual({ outcome: "not-runnable", effectiveScore: null });
  });

  it("the teacher's mark resolves it", async () => {
    const h = harness(F.assignment({ examSnapshot: exam([limited()]), totalMarks: 10 }));
    await h.submit({ auto1: F.code(big) });
    expect((await h.saveReview({ auto1: { score: 7, comment: "" } })).status).toBe(200);
    expect(h.attempt()).toMatchObject({ score: 7, finalized: true });
  });

  it("a saved draft over the limit is graded the same way at timeout (the server draft keeps it)", async () => {
    const h = harness(F.assignment({ examSnapshot: exam([limited()]), totalMarks: 10 }));
    expect((await h.student({ action: "saveDraft", answers: { auto1: F.code(big) }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 })).status).toBe(200);
    expect(h.ctx.getJson(F.SUB).draftAnswers.auto1).toEqual(F.code(big));
  });

  it("unchanged: a forged language stays refused at intake (the editor cannot produce it) and a blank program is still 'no answer'", async () => {
    const forged = harness(F.assignment({ examSnapshot: exam([F.autoQ()]), totalMarks: 10 }));
    await forged.submit({ auto1: F.code("print(1)\n", "ruby") });
    expect(forged.attempt().answers.auto1).toBeUndefined();
    expect(forged.attempt().codingGrading.targets.auto1.result.outcome).toBe("no-answer");
    const blank = harness(F.assignment({ examSnapshot: exam([F.autoQ()]), totalMarks: 10 }));
    await blank.submit({ auto1: F.code("   \n") });
    expect(blank.attempt().codingGrading.targets.auto1.result.outcome).toBe("no-answer");
    expect(blank.fetch.jobs()).toHaveLength(0);
  });

  it("unchanged: a program within the limit is dispatched to the Runner", async () => {
    const h = harness(F.assignment({ examSnapshot: exam([limited()]), totalMarks: 10 }));
    await h.submit({ auto1: F.code("print(1)\n") });
    expect(h.fetch.jobs()).toHaveLength(1);
  });
});

describe("QA2-4 a note without a mark on a composite part is a comment, never a 0", () => {
  function seedComposite() {
    const ex = compositeArabicExam();
    const answers = { q4: { kind: "composite", parts: { pA1: { kind: "choice", index: 0 } }, contexts: {} } };
    const g = gradeExam(ex, answers);
    const AID = "asg-cmp", S = "stu-cmp", CLS = "cls-cmp", DOC = "platform/submissions/" + AID + "/" + S + ".json";
    const ctx = createMemoryContainer({
      ["platform/assignments/" + AID + ".json"]: { assignmentId: AID, classId: CLS, title: "t", status: "published", examSnapshot: ex, totalMarks: g.totalMarks },
      ["platform/users/" + S + ".json"]: { userId: S, role: "student", classId: CLS, displayName: "s", code: "S1" },
      ["platform/classes/" + CLS + ".json"]: { classId: CLS, name: "c", active: true },
      [DOC]: { assignmentId: AID, studentId: S, classId: CLS, attempts: [{ attemptNumber: 1, submittedAt: new Date().toISOString(), score: g.score, totalMarks: g.totalMarks, percentage: g.percentage, manualReviewMarks: g.manualReviewMarks, finalized: g.finalized, questionGrades: g.questions, sections: g.sections, answers, manualOverrides: {}, teacherFeedback: "" }] }
    });
    const part = () => ctx.getJson(DOC).attempts[0].questionGrades.find(x => x.questionId === "q4").parts.find(p => p.partId === "pA1");
    const save = overrides => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: AID, studentId: S, attemptNumber: 1, overrides, teacherFeedback: "" }), { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-x" } }), getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordAchievementIfEligible: async () => {} }, quiet);
    return { part, save, overrides: () => ctx.getJson(DOC).attempts[0].manualOverrides };
  }

  it("a comment-only note (or score null) keeps the part's automatic score", async () => {
    const h = seedComposite();
    expect(h.part().score).toBe(2);
    expect((await h.save({ "q4::part::pA1": { comment: "ملاحظة فقط" } })).status).toBe(200);
    expect(h.part().score).toBe(2);
    expect(h.overrides()["q4::part::pA1"]).toMatchObject({ comment: "ملاحظة فقط" });
    expect("score" in h.overrides()["q4::part::pA1"]).toBe(false);
    await h.save({ "q4::part::pA1": { score: null, comment: "x" } });
    expect(h.part().score).toBe(2);
  });

  it("a later comment-only note keeps the teacher's earlier part mark", async () => {
    const h = seedComposite();
    await h.save({ "q4::part::pA1": { score: 1, comment: "" } });
    expect(h.part().score).toBe(1);
    await h.save({ "q4::part::pA1": { comment: "ملاحظة" } });
    expect(h.part().score).toBe(1);
    // the teacher's mark stays RECORDED as the teacher's (overrideScoreOf reads it: a later regrade never replaces it)
    expect(h.overrides()["q4::part::pA1"]).toMatchObject({ score: 1, comment: "ملاحظة" });
  });

  it("a comment-only note on a composite coding part held for a render failure keeps it under review (never a reviewed 0)", async () => {
    const ex = compositeCsExam();
    const h = harness(F.assignment({ examSnapshot: { title: "cs", metadata: {}, presentationTheme: "classic", sections: ex.sections }, totalMarks: 18, questionCount: 1 }));
    expect((await h.submit({}, { renderFailures: [{ questionId: "cs1", code: "chunk-load" }] })).status).toBe(200);
    const c1 = () => h.attempt().questionGrades[0].parts.find(p => p.partId === "c1");
    expect(c1()).toMatchObject({ score: 0, manualReview: true });
    expect((await h.saveReview({ "cs1::part::c1": { comment: "سأراجع لاحقًا" } })).status).toBe(200);
    expect({ manualReview: c1().manualReview, reviewed: c1().reviewed, finalized: h.attempt().finalized }).toEqual({ manualReview: true, reviewed: false, finalized: false });
  });

  it("unchanged: an explicit part mark (0 included) is a mark", async () => {
    const h = seedComposite();
    await h.save({ "q4::part::pA1": { score: 0, comment: "" } });
    expect(h.part().score).toBe(0);
  });
});

describe("QA2-16 a blank score string is not a mark", () => {
  it("score \" \" with a note keeps the automatic score; score \"0\" is still a mark", async () => {
    const h = harness(undefined);
    await h.submit({ auto1: F.code("x\n"), sa1: { kind: "text", value: "x" } });
    await h.callback(F.callbackBody(h.fetch.jobs()[0], F.CANARY.expected));
    const grade = () => h.attempt().questionGrades.find(g => g.questionId === "auto1");
    expect(grade().score).toBe(10);
    await h.saveReview({ auto1: { score: " ", comment: "note" } });
    expect(grade().score).toBe(10);
    await h.saveReview({ auto1: { score: "0", comment: "" } });
    expect(grade().score).toBe(0);
  });
});

describe("QA2-5 / QA2-17 a technical hold is never averaged as 0%", () => {
  const U = "platform/users/", C = "platform/classes/", A = "platform/assignments/", S = "platform/submissions/";
  const codingPending = () => ({ attemptNumber: 1, submittedAt: "2026-03-02T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false,
    questionGrades: [{ questionId: "q1", score: 0, maxMarks: 10, countedMaxMarks: 10, manualReview: true, correct: false }],
    codingGrading: { version: 1, targets: { q1: { mode: "hiddenTests", state: "dispatched", revision: 1, jobId: "cg_aaaaaaaaaaaaaaaaaaaa", updatedAt: new Date().toISOString() } } } });
  const final100 = { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 10, totalMarks: 10, percentage: 100, manualReviewMarks: 0, finalized: true, questionGrades: [{ questionId: "q1", score: 10, maxMarks: 10, countedMaxMarks: 10, manualReview: false, correct: true }] };
  const essayPending = { ...final100, score: 4, percentage: 40, manualReviewMarks: 6, finalized: false, questionGrades: [{ questionId: "q1", score: 4, maxMarks: 10, countedMaxMarks: 10, manualReview: true, correct: false }] };

  it("QA2-5 the teacher's student profile «المعدل» skips a technical hold (null when it is the only mark); an ordinary review still counts", async () => {
    const ctx = createMemoryContainer({
      [U + "u1.json"]: { userId: "u1", role: "student", classId: "c1", displayName: "علي", code: "S1", active: true },
      [C + "c1.json"]: { classId: "c1", name: "صف", grade: "11", schoolYear: "2026" },
      [A + "a1.json"]: { assignmentId: "a1", classId: "c1", status: "published", title: "A1", totalMarks: 10, maxAttempts: 1, createdAt: "2026-02-01T00:00:00.000Z" },
      [A + "a2.json"]: { assignmentId: "a2", classId: "c1", status: "published", title: "A2", totalMarks: 10, maxAttempts: 1, createdAt: "2026-02-02T00:00:00.000Z" },
      [A + "a3.json"]: { assignmentId: "a3", classId: "c1", status: "published", title: "A3", totalMarks: 10, maxAttempts: 1, createdAt: "2026-02-03T00:00:00.000Z" },
      [S + "a1/u1.json"]: { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [final100] },
      [S + "a2/u1.json"]: { assignmentId: "a2", studentId: "u1", classId: "c1", attempts: [codingPending()] }
    });
    const p = await buildStudentProfile(ctx.container, "u1");
    expect({ average: p.stats.average, completed: p.stats.completed }).toEqual({ average: 100, completed: 2 });
    ctx.setJson(S + "a3/u1.json", { assignmentId: "a3", studentId: "u1", classId: "c1", attempts: [essayPending] });
    expect((await buildStudentProfile(ctx.container, "u1")).stats.average).toBe(70);   // (100 + 40) / 2 — an essay awaiting review counts
    ctx.setJson(S + "a1/u1.json", { assignmentId: "a1", studentId: "u1", classId: "c1", attempts: [codingPending()] });
    ctx.setJson(S + "a3/u1.json", { assignmentId: "a3", studentId: "u1", classId: "c1", attempts: [codingPending()] });
    expect((await buildStudentProfile(ctx.container, "u1")).stats.average).toBeNull();
  });

  it("QA2-5 item analysis: a coding grade still running and a render-failure hold are not averaged; the settled grade is", async () => {
    const ctx = createMemoryContainer({
      [U + "u1.json"]: { userId: "u1", role: "student", classId: "c1", displayName: "A", code: "1", active: true },
      [U + "u2.json"]: { userId: "u2", role: "student", classId: "c1", displayName: "B", code: "2", active: true },
      [U + "u3.json"]: { userId: "u3", role: "student", classId: "c1", displayName: "C", code: "3", active: true },
      [C + "c1.json"]: { classId: "c1", name: "صف", active: true },
      [A + "a1.json"]: { assignmentId: "a1", classId: "c1", status: "published", title: "A1", examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "coding", marks: 10 }] } },
      [S + "a1/u1.json"]: { assignmentId: "a1", studentId: "u1", attempts: [final100] },
      [S + "a1/u2.json"]: { assignmentId: "a1", studentId: "u2", attempts: [codingPending()] },
      [S + "a1/u3.json"]: { assignmentId: "a1", studentId: "u3", attempts: [{ ...codingPending(), codingGrading: undefined, renderFailures: { q1: { code: "runtime", held: true, reportedAt: "x" } } }] }
    });
    const r = await itemAnalysis.handler({ method: "GET", url: "https://x.test/api/assignment-item-analysis?assignmentId=a1", headers: new Headers() }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), getContainer: () => ctx.container }, null);
    expect(r.status).toBe(200);
    const q = r.jsonBody.questions[0];
    expect({ studentsAnalyzed: q.studentsAnalyzed, averageScore: q.averageScore, difficulty: q.difficulty }).toEqual({ studentsAnalyzed: 1, averageScore: 10, difficulty: "easy" });
  });

  it("QA2-17 the Today feed shows no percentage for a still-grading attempt (a final one keeps it)", () => {
    const now = new Date().toISOString();
    const out = deriveTeacherToday({
      assignments: [{ assignmentId: "a1", classId: "c1", status: "published", title: "A1" }],
      classes: [{ classId: "c1", name: "صف", status: "active" }],
      users: [{ userId: "u1", role: "student", classId: "c1", displayName: "A" }, { userId: "u2", role: "student", classId: "c1", displayName: "B" }],
      submissionsByAssignment: new Map([["a1", new Map([
        ["u1", { assignmentId: "a1", studentId: "u1", attempts: [{ ...codingPending(), submittedAt: now, endReason: "submitted" }] }],
        ["u2", { assignmentId: "a1", studentId: "u2", attempts: [{ ...final100, submittedAt: now, endReason: "submitted" }] }]
      ])]]),
      nowMs: Date.now()
    });
    const recent = out.recent || out.categories?.recent || [];
    expect(recent.find(x => x.studentId === "u1" && x.kind === "submitted").percentage).toBeNull();
    expect(recent.find(x => x.studentId === "u2" && x.kind === "submitted").percentage).toBe(100);
  });

  it("QA2-17 the student dashboard's legacy stats.average skips a technical hold (averageFinalized unchanged)", async () => {
    const ctx = createMemoryContainer({
      [U + "u1.json"]: { schemaVersion: 3, userId: "u1", role: "student", classId: "c1", displayName: "A", code: "1", active: true, archived: false, authVersion: 1 },
      [C + "c1.json"]: { classId: "c1", name: "صف", active: true },
      [A + "a1.json"]: { assignmentId: "a1", classId: "c1", status: "published", title: "A1", totalMarks: 10 },
      [A + "a2.json"]: { assignmentId: "a2", classId: "c1", status: "published", title: "A2", totalMarks: 10 },
      [S + "a1/u1.json"]: { assignmentId: "a1", studentId: "u1", attempts: [final100] },
      [S + "a2/u1.json"]: { assignmentId: "a2", studentId: "u1", attempts: [codingPending()] }
    });
    const r = await studentDashboard.handler({ method: "GET", url: "https://x.test/api/student-dashboard", headers: new Headers() }, { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }) }, null);
    expect(r.status).toBe(200);
    expect({ average: r.jsonBody.stats.average, averageFinalized: r.jsonBody.stats.averageFinalized }).toEqual({ average: 100, averageFinalized: 100 });
  });
});

describe("QA2-6 a legacy timed attempt keeps its identity check after the assignment is set to untimed", () => {
  const MIN = 60000;
  const shortExam = () => exam([F.shortQ()]);
  function setup() {
    const started1 = new Date(Date.now() - 60 * MIN).toISOString(), started2 = new Date(Date.now() - 1 * MIN).toISOString();
    const a = F.assignment({ attemptModelVersion: undefined, attemptPolicy: undefined, durationMinutes: 0, maxAttempts: 3, examSnapshot: shortExam(), totalMarks: 2 });
    const doc = F.activeDoc({}, { attempts: [{ attemptNumber: 1, submittedAt: started2, startedAt: started1, score: 2, totalMarks: 2, percentage: 100, finalized: true, manualReviewMarks: 0 }], activeAttempt: { attemptNumber: 2, startedAt: started2, endsAt: new Date(Date.now() + 29 * MIN).toISOString(), durationMinutes: 30, status: "started" } });
    return { started1, started2, h: harness(a, F.seed({ a, doc })) };
  }
  it("a stale tab's submit for the previous attempt is refused (409) and attempt 2 is untouched", async () => {
    const { started1, h } = setup();
    expect((await h.student({ action: "submit", answers: {}, expectedAttemptNumber: 1, expectedStartedAt: started1 })).status).toBe(409);
    const doc = h.ctx.getJson(F.SUB);
    expect({ attempts: doc.attempts.length, active: doc.activeAttempt && doc.activeAttempt.attemptNumber }).toEqual({ attempts: 1, active: 2 });
  });
  it("unchanged: the running attempt's own submit (matching identity) is accepted", async () => {
    const { started2, h } = setup();
    expect((await h.student({ action: "submit", answers: { sa1: { kind: "text", value: "x" } }, expectedAttemptNumber: 2, expectedStartedAt: started2 })).status).toBe(200);
    expect(h.ctx.getJson(F.SUB).attempts).toHaveLength(2);
  });
  it("unchanged: a legacy UNTIMED assignment with no running timed attempt still submits without an identity", async () => {
    const a = F.assignment({ attemptModelVersion: undefined, attemptPolicy: undefined, durationMinutes: 0, maxAttempts: 3, examSnapshot: shortExam(), totalMarks: 2 });
    const h = harness(a, F.seed({ a, doc: F.activeDoc({}, { activeAttempt: null }) }));
    expect((await h.student({ action: "submit", answers: { sa1: { kind: "text", value: "x" } } })).status).toBe(200);
  });
});
