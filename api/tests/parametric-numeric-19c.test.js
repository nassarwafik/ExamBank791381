import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 19C — the v2 parametric contract on the SERVER (the only authority): decimal variables, derived values, constraints over
// derived values and formats, generated from the same server-owned identity as Phase 19B (generatorVersion 2 namespace), delivered
// per attempt (refresh, pause / resume, next attempt), graded from the EXACT values, reviewed with derived values and constraint
// evaluation for the teacher, never leaking formulas / derived values / expected values to a student, ignoring forged client
// authority, and failing closed on invalid v2 authority. Phase 19B (v1) questions keep their exact behaviour (the 19B suites run
// unchanged). Pins come from an independent reference of generator v2. Fail-first on 751003f.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const PHYS = { v: 2, generatorVersion: 2, variables: [{ id: "d", kind: "decimal", min: 10, max: 50, step: 0.5 }, { id: "t", kind: "decimal", min: 2, max: 8, step: 0.25 }], derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "fixed", decimals: 2 } }], constraints: ["speed > 1"], response: { unit: "label", label: "م/ث" } };
const pq = (over = {}) => ({ examQuestionId: "pq2", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "قطع جسم {{d}} مترًا في {{t}} ثانية. ما متوسط سرعته؟", marks: 3, parametric: JSON.parse(JSON.stringify(PHYS)), answer: { expression: "speed", mode: "tolerance", tolerance: 0.01 }, ...over });
const exam = questions => ({ examId: "E19C", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const g = (r, id = "pq2") => r.questions.find(x => x.questionId === id);
const num = (value, extra = {}) => ({ kind: "numeric", value, ...extra });
const PRIVATE = /d \/ t|"derivedVariables"|"expression"|"constraints"|speed > 1|"tolerance"|"speed"|9\.83|"min":10/;
// Pinned (independent reference): fixture identity asg-17c-auto / S1 / pq2: attempt 1 ⇒ d=29.5, t=3 (9.8333…); attempt 2 ⇒ d=47.5, t=2.75 (17.2727…)
const PIN1 = { text: "قطع جسم 29.5 مترًا في 3 ثانية. ما متوسط سرعته؟", values: { d: 29.5, t: 3 }, answer: "9.83", speed: 9.833333333333334, digest: "361f9279fdab8950f2ab5ae50649f86d" };
const PIN2 = { text: "قطع جسم 47.5 مترًا في 2.75 ثانية. ما متوسط سرعته؟", answer: "17.27" };
const CTX = { parametric: { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 } };

describe("19C — v2 grading on the server", () => {
  it("grades from the exact official values with the server identity; malformed v2 authority fails closed to manual review", () => {
    expect(g(gradeExam(exam([pq()]), { pq2: num(PIN1.answer) }, CTX))).toMatchObject({ score: 3, correct: true, manualReview: false });
    expect(g(gradeExam(exam([pq()]), { pq2: num("9.9") }, CTX))).toMatchObject({ score: 0, correct: false, manualReview: false });
    expect(g(gradeExam(exam([pq()]), { pq2: num(PIN1.answer) }))).toMatchObject({ score: 0, manualReview: true });
    for (const bad of [{ parametric: { ...PHYS, derivedVariables: [{ id: "x", expression: "y" }, { id: "y", expression: "x" }] } }, { parametric: { ...PHYS, derivedVariables: [{ id: "speed", expression: "cbrt(d)" }] } }, { parametric: { ...PHYS, variables: [{ id: "d", kind: "decimal", min: 10, max: 50, step: 0 }, PHYS.variables[1]] } }, { parametric: { ...PHYS, generatorVersion: 1 } }, { parametric: { ...PHYS, derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "ipv4" } }] } }])
      expect(g(gradeExam(exam([pq(bad)]), { pq2: num(PIN1.answer) }, CTX)), JSON.stringify(bad).slice(0, 80)).toMatchObject({ score: 0, correct: false, manualReview: true });
  });
  it("forged generated values / derived values / seed / format / version overrides reaching the grader never change the grade", () => {
    const forged = { values: { d: 10, t: 1 }, derived: { speed: 10 }, seed: '["smartassess.parametric",2,"official","asg-17c-auto","11111111-1111-1111-1111-111111111111",2,"pq2"]', format: { kind: "fixed", decimals: 0 }, generatorVersion: 1, expected: 10 };
    expect(g(gradeExam(exam([pq()]), { pq2: num("10", forged) }, CTX))).toMatchObject({ score: 0 });
    expect(g(gradeExam(exam([pq()]), { pq2: num(PIN2.answer, forged) }, CTX))).toMatchObject({ score: 0 });
    expect(g(gradeExam(exam([pq()]), { pq2: num(PIN1.answer, forged) }, CTX))).toMatchObject({ score: 3 });
    expect(normalizeDraftAnswers({ pq2: num("9.83", forged) }, exam([pq()])).answers.pq2).toEqual({ kind: "numeric", value: "9.83" });
  });
});

describe("19C — student delivery secrecy", () => {
  it("the sanitized question shows the formatted stem and only the values it displays — no formulas, derived values, constraints or expected value", () => {
    const s = sanitizeExamForStudent(exam([pq()]), CTX).sections[0].questions[0];
    expect(s.text).toBe(PIN1.text);
    expect(s.parametric).toEqual({ v: 1, status: "ready", generatorVersion: 2, values: PIN1.values, response: { unit: "label", label: "م/ث" } });
    expect(JSON.stringify(s)).not.toMatch(PRIVATE);
    const shown = sanitizeExamForStudent(exam([pq({ text: "السرعة {{speed}} م/ث. احسب الزمن لمسافة {{d}} م." })]), CTX).sections[0].questions[0];
    expect(shown.text).toBe("السرعة 9.83 م/ث. احسب الزمن لمسافة 29.5 م.");
    expect(JSON.stringify(shown)).not.toMatch(/d \/ t|"derivedVariables"|"expression"|"constraints"/);
  });
});

describe("19C — attempt lifecycle through the REAL handlers (v2)", () => {
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const submission = () => require_("../src/functions/student-submission.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const teacherAuth = () => ({ ok: true, user: { sub: "teacher-19c", role: "teacher" } });
  const snapshot = (question = pq()) => ({ title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [question] }] });
  const assignment = (over = {}) => F.assignment({ examSnapshot: snapshot(), totalMarks: 3, questionCount: 1, ...over });
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: studentAuth, requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const open = async ctx => { const r = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx)); expect(r.status).toBe(200); return r.jsonBody.assignment.exam.sections[0].questions[0]; };
  const write = (ctx, body) => submission().handler(F.studentRequest({ expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, ...body }), deps(ctx));

  it("refresh and pause / resume deliver the SAME v2 instance (pinned); submit grades it; the review shows derived values and constraints", async () => {
    const ctx = F.seed({ a: assignment() });
    const first = await open(ctx);
    expect(first.text).toBe(PIN1.text); expect(first.parametric.values).toEqual(PIN1.values);
    expect(JSON.stringify(first)).not.toMatch(PRIVATE);
    expect(await open(ctx)).toEqual(first);
    expect((await write(ctx, { action: "pauseAttempt", expectedAttemptEpoch: 1, answers: { pq2: num("1") } })).status).toBe(200);
    expect((await write(ctx, { action: "resumeAttempt", expectedAttemptEpoch: 2 })).status).toBe(200);
    expect(await open(ctx)).toEqual(first);
    const s = await write(ctx, { action: "submit", expectedAttemptEpoch: 3, answers: { pq2: num(PIN1.answer, { derived: { speed: 1 } }) } });
    expect(s.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 1);
    expect(attempt.answers.pq2).toEqual(num(PIN1.answer)); expect(attempt.score).toBe(3);
    const rv = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
    const q = rv.jsonBody.questions.find(x => x.questionId === "pq2");
    expect(q.parametricInstance).toEqual({ ok: true, generatorVersion: 2, seedDigest: PIN1.digest, identity: { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionKey: "pq2" }, values: PIN1.values, derived: { speed: PIN1.speed }, text: PIN1.text, expected: PIN1.speed, constraints: [{ source: "speed > 1", left: PIN1.speed, right: 1, holds: true }] });
  });
  it("the next (reopened) attempt receives its own deterministic v2 instance (pinned attempt 2)", async () => {
    const done = { attemptNumber: 1, submittedAt: F.STARTED, score: 3, totalMarks: 3, percentage: 100, manualReviewMarks: 0, finalized: true, questionGrades: [], answers: {}, manualOverrides: {}, startedAt: F.STARTED, endedAt: F.STARTED, endReason: "submitted" };
    const ctx = F.seed({ a: assignment(), doc: F.activeDoc({}, { attempts: [done], activeAttempt: { attemptNumber: 2, startedAt: F.STARTED, endsAt: new Date(Date.now() + 25 * 60000).toISOString(), status: "started", attemptEpoch: 1 } }) });
    const q = await open(ctx);
    expect(q.text).toBe(PIN2.text);
    const s = await submission().handler(F.studentRequest({ action: "submit", expectedAttemptNumber: 2, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1, answers: { pq2: num(PIN2.answer) } }), deps(ctx));
    expect(s.status).toBe(200);
    expect(ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 2).score).toBe(3);
  });
});

describe("19C — shared build parity (v2)", () => {
  it("the committed CommonJS mirror agrees with the source on v2 validation, projection, scoring, review and samples", async () => {
    const shared = require_("../src/lib/shared-finalization/parametricNumericQuestion.js");
    const engine = require_("../src/lib/shared-finalization/parametricEngine.js");
    const ts = await import("../../src/parametricNumericQuestion.ts");
    const ID = { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionKey: "pq2" };
    expect(engine.PARAMETRIC_GENERATOR_VERSIONS).toEqual([1, 2]);
    for (const n of [pq(), pq({ parametric: { ...PHYS, constraints: ["speed > 1000"] } }), pq({ answer: { expression: "sqrt(speed)", mode: "range", below: 0.1, above: 0.1 } })]) {
      expect(shared.validateParametricNumericQuestion(n)).toEqual(ts.validateParametricNumericQuestion(n));
      expect(shared.projectParametricNumericForStudent(n, ID)).toEqual(ts.projectParametricNumericForStudent(n, ID));
      expect(shared.scoreParametricNumeric({ question: n, response: num(PIN1.answer), maxMarks: 3, identity: ID })).toEqual(ts.scoreParametricNumeric({ question: n, response: num(PIN1.answer), maxMarks: 3, identity: ID }));
      expect(shared.parametricReviewInstance(n, ID)).toEqual(ts.parametricReviewInstance(n, ID));
      expect(shared.previewParametricSamples(n, 5)).toEqual(ts.previewParametricSamples(n, 5));
    }
  });
});
