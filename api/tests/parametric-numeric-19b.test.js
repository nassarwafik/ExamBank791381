import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent, sanitizeQuestionForStudent } from "../src/lib/student-exam-sanitize.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 19B — parametricNumeric@1 on the SERVER, the only authority: the registered grader regenerates the official instance from
// the server-owned generation identity { assignmentId, studentId, attemptNumber, questionKey } threaded through gradeExam (no
// identity ⇒ fail closed to manual review); the student delivery renders the SAME instance per attempt (refresh, pause / resume,
// legacy untimed lazy attempts), a reopened attempt gets its own instance; ingest drops forged client seed / values / expected
// result; the teacher review regenerates with the SAME authority; nothing private reaches a student. Pinned instances come from an
// independent reference of generator v1. New-function suite (fail-first on b8aa6ce: no grader / no shared module).
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const CFG = { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } };
const KEY = { expression: "a * b", mode: "tolerance", tolerance: 0 };
const PRIVATE = /a \* b|"expression"|"tolerance"|"constraints"|a < b|"generatorVersion":1,"variables"|"min":2/;
const pq = (over = {}) => ({ examQuestionId: "pq1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 4, parametric: JSON.parse(JSON.stringify(CFG)), answer: JSON.parse(JSON.stringify(KEY)), ...over });
const exam = questions => ({ examId: "E19B", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const g = (r, id = "pq1") => r.questions.find(x => x.questionId === id);
const num = (value, extra = {}) => ({ kind: "numeric", value, ...extra });
const CTX = { parametric: { assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1 } };   // pinned (independent reference): pq1 ⇒ a=10, b=13
// Pinned (independent reference): fixture identity asg-17c-auto / S1 / attempt 1 / pq1 ⇒ a=2, b=6 (12); attempt 2 ⇒ a=9, b=19 (171).
const PIN1 = { values: { a: 2, b: 6 }, text: "احسب ناتج ضرب 2 في 6.", expected: "12", digest: "9486406d36e984774c639386e0873738" };
const PIN2 = { values: { a: 9, b: 19 }, text: "احسب ناتج ضرب 9 في 19.", expected: "171" };

describe("19B — the registered parametricNumeric@1 grader and the generation context", () => {
  it("is registered at exactly version 1; the catalog lists 20 production types", () => {
    expect(typeof resolveGrader("parametricNumeric", 1)).toBe("function");
    expect(resolveGrader("parametricNumeric", 2)).toBeUndefined();
    const catalog = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
    expect(catalog.QUESTION_TYPE_CATALOG.length).toBe(26);   /* 20D adds composite (after compound) · 21A.1 adds chartSelection (after composite) */   // 19D appends hotspot / labelDiagram · 19E appends openResponse
    expect(catalog.questionTypeDefinition("parametricNumeric")).toMatchObject({ version: 1, gradingMode: "auto", legacy: false, responseKinds: ["numeric"] });
  });
  it("gradeExam threads the identity + the section-scoped question key to the grader (pinned asg-19b / stu-1 / 1 / pq1 ⇒ 10 × 13)", () => {
    expect(g(gradeExam(exam([pq()]), { pq1: num("130") }, CTX))).toMatchObject({ score: 4, correct: true, manualReview: false });
    expect(g(gradeExam(exam([pq()]), { pq1: num("26") }, CTX))).toMatchObject({ score: 0, correct: false, manualReview: false });   // the q1 instance is not this one
    // forged client authority reaching the grader directly (ingest would drop it anyway): another attempt's seed ⇒ 8 × 18, forged values
    const forgedSeed = '["smartassess.parametric",1,"official","asg-19b","stu-1",2,"pq1"]';
    expect(g(gradeExam(exam([pq()]), { pq1: num("144", { seed: forgedSeed }) }, CTX))).toMatchObject({ score: 0, correct: false });
    expect(g(gradeExam(exam([pq()]), { pq1: num("1", { values: { a: 1, b: 1 }, expected: 1 }) }, CTX))).toMatchObject({ score: 0, correct: false });
    expect(g(gradeExam(exam([pq()]), { pq1: num("130", { seed: forgedSeed, values: { a: 1, b: 1 } }) }, CTX))).toMatchObject({ score: 4, correct: true });
    // positional key "s1::q1" (no explicit id) is the SAME key the sanitizer uses
    const anon = pq(); delete anon.examQuestionId;
    const student = sanitizeExamForStudent(exam([anon]), CTX).sections[0].questions[0];
    const [a, b] = student.parametric.status === "ready" ? [student.parametric.values.a, student.parametric.values.b] : [NaN, NaN];
    expect(g(gradeExam(exam([anon]), { "s1::q1": num(String(a * b)) }, CTX), "s1::q1")).toMatchObject({ score: 4, correct: true });
  });
  it("WITHOUT a server identity (or with a malformed one) the question fails closed to manual review — never an ordinary zero, never full credit", () => {
    for (const ctx of [undefined, {}, { parametric: { assignmentId: "asg-19b", studentId: "stu-1" } }, { parametric: { ...CTX.parametric, attemptNumber: "1" } }]) {
      const r = gradeExam(exam([pq()]), { pq1: num("26") }, ctx);
      expect(g(r), JSON.stringify(ctx)).toMatchObject({ score: 0, correct: false, manualReview: true });
      expect(r.manualReviewMarks).toBe(4); expect(r.finalized).toBe(false);
    }
  });
  it("malformed published authority ⇒ 0 + manual review; malformed student input ⇒ ordinary 0; other types are graded exactly as before", () => {
    for (const bad of [{ answer: { ...KEY, mode: "x" } }, { answer: { ...KEY, expression: "eval(1)" } }, { parametric: { ...CFG, generatorVersion: 2 } }, { parametric: { ...CFG, secret: 1 } }, { questionTypeVersion: 2 }, { text: "{{zz}}" }]) {
      const r = g(gradeExam(exam([pq(bad)]), { pq1: num("26") }, CTX));
      expect(r.score, JSON.stringify(bad)).toBe(0); expect(r.manualReview).toBe(true);
    }
    for (const resp of [{ kind: "text", value: "26" }, num(26), num("x")]) expect(g(gradeExam(exam([pq()]), { pq1: resp }, CTX))).toMatchObject({ score: 0, manualReview: false });
    const nr = { examQuestionId: "n1", presentationType: "numericResponse", text: "x", marks: 2, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 5, tolerance: 0 } };
    expect(g(gradeExam(exam([nr]), { n1: num("5") }), "n1")).toMatchObject({ score: 2, correct: true });
    expect(g(gradeExam(exam([nr]), { n1: num("5") }, CTX), "n1")).toMatchObject({ score: 2, correct: true });
  });
});

describe("19B — student sanitizer: strict per-attempt projection", () => {
  it("renders the stem with the generated values; only v / status / generatorVersion / values / response reach the student", () => {
    const s = sanitizeExamForStudent(exam([pq()]), CTX).sections[0].questions[0];
    expect(s.text).toBe("احسب ناتج ضرب 10 في 13.");
    expect(s.parametric).toEqual({ v: 1, status: "ready", generatorVersion: 1, values: { a: 10, b: 13 }, response: { unit: "none" } });
    expect(s.answer).toEqual({});
    expect(JSON.stringify(s)).not.toMatch(PRIVATE);
  });
  it("without a generation identity (live challenge, practice) the question is delivered UNAVAILABLE: no template syntax, no config", () => {
    for (const s of [sanitizeExamForStudent(exam([pq()])).sections[0].questions[0], sanitizeQuestionForStudent(pq())]) {
      expect(s.parametric).toEqual({ v: 1, status: "unavailable" });
      expect(s.text).not.toMatch(/\{\{|\}\}/);
      expect(JSON.stringify(s)).not.toMatch(PRIVATE);
    }
  });
  it("a smuggled private field in the public config never projects; legacy flat exams key questions like the grader does", () => {
    const s = sanitizeExamForStudent(exam([pq({ parametric: { ...CFG, expected: 26 } })]), CTX).sections[0].questions[0];
    expect(s.parametric).toEqual({ v: 1, status: "unavailable" });
    expect(JSON.stringify(s)).not.toMatch(/expected|26/);
    const flat = sanitizeExamForStudent({ title: "t", questions: [pq()] }, CTX).questions[0];
    expect(flat.text).toBe("احسب ناتج ضرب 10 في 13.");
  });
});

describe("19B — ingest binding", () => {
  it("a parametric answer keeps exactly { kind, value, unit? }; forged seed / values / expected are dropped; another kind is rejected; numericResponse untouched", () => {
    const ex = exam([pq(), { examQuestionId: "n1", presentationType: "numericResponse", text: "x", marks: 1, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 1, tolerance: 0 } }]);
    const r = normalizeDraftAnswers({ pq1: num("26", { seed: "s", values: { a: 1 }, expected: 26, generatorVersion: 7 }), n1: num("1", { note: "kept as before" }) }, ex);
    expect(r.answers.pq1).toEqual({ kind: "numeric", value: "26" });
    expect(r.answers.n1).toEqual(num("1"));                                        // 20G.1 — a legacy numeric answer is rebuilt to exactly { kind, value, unit? } (the extra key is never stored)
    const bad = normalizeDraftAnswers({ pq1: { kind: "text", value: "26" } }, ex);
    expect(bad.answers.pq1).toBeUndefined(); expect(bad.rejected).toEqual([{ id: "pq1", code: "PARAM_ANSWER_INVALID" }]);
  });
});

describe("19B — attempt lifecycle through the REAL handlers (same attempt ⇒ same instance)", () => {
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const submission = () => require_("../src/functions/student-submission.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const results = () => require_("../src/functions/assignment-results.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const teacherAuth = () => ({ ok: true, user: { sub: "teacher-19b", role: "teacher" } });
  const snapshot = (question = pq()) => ({ title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [question] }] });
  const assignment = (over = {}) => F.assignment({ examSnapshot: snapshot(), totalMarks: 4, questionCount: 1, ...over });
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: studentAuth, requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const open = async ctx => { const r = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx)); expect(r.status).toBe(200); return r.jsonBody.assignment.exam.sections[0].questions[0]; };
  const write = (ctx, body) => submission().handler(F.studentRequest({ expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, ...body }), deps(ctx));

  it("refresh, pause and resume: the delivered instance never changes inside the attempt (pinned), nothing private is delivered", async () => {
    const ctx = F.seed({ a: assignment() });
    const first = await open(ctx);
    expect(first.text).toBe(PIN1.text); expect(first.parametric.values).toEqual(PIN1.values);
    expect(JSON.stringify(first)).not.toMatch(PRIVATE);
    expect(await open(ctx)).toEqual(first);                                                        // refresh
    expect((await write(ctx, { action: "pauseAttempt", expectedAttemptEpoch: 1, answers: { pq1: num("1") } })).status).toBe(200);
    expect((await write(ctx, { action: "resumeAttempt", expectedAttemptEpoch: 2 })).status).toBe(200);
    expect(await open(ctx)).toEqual(first);                                                        // pause / resume
    expect(ctx.getJson(F.SUB).draftAnswers.pq1).toEqual(num("1"));                                // restore keeps the answer
  });
  it("saveDraft drops forged client authority; submit grades against the SERVER instance; the review regenerates the SAME instance", async () => {
    const ctx = F.seed({ a: assignment() });
    const d = await write(ctx, { action: "saveDraft", expectedAttemptEpoch: 1, answers: { pq1: num("999", { seed: "forged", values: { a: 1, b: 999 }, expected: 999 }) } });
    expect(d.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.pq1).toEqual(num("999"));
    const s = await write(ctx, { action: "submit", expectedAttemptEpoch: 1, answers: { pq1: num(PIN1.expected, { expected: 1, values: { a: 1, b: 1 } }) } });
    expect(s.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 1);
    expect(attempt.answers.pq1).toEqual(num(PIN1.expected));
    expect(attempt.score).toBe(4); expect(attempt.finalized).toBe(true);
    expect(JSON.stringify(s.jsonBody)).not.toMatch(PRIVATE);
    const rv = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
    expect(rv.status).toBe(200);
    const q = rv.jsonBody.questions.find(x => x.questionId === "pq1");
    expect(q.parametricInstance).toEqual({ ok: true, generatorVersion: 1, seedDigest: PIN1.digest, identity: { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionKey: "pq1" }, values: PIN1.values, text: PIN1.text, expected: 12 });
  });
  it("a REOPENED / next attempt gets its own deterministic instance (pinned attempt 2), graded with that attempt's identity", async () => {
    const done = { attemptNumber: 1, submittedAt: F.STARTED, score: 4, totalMarks: 4, percentage: 100, manualReviewMarks: 0, finalized: true, questionGrades: [], answers: {}, manualOverrides: {}, startedAt: F.STARTED, endedAt: F.STARTED, endReason: "submitted" };
    const ctx = F.seed({ a: assignment(), doc: F.activeDoc({}, { attempts: [done], activeAttempt: { attemptNumber: 2, startedAt: F.STARTED, endsAt: new Date(Date.now() + 25 * 60000).toISOString(), status: "started", attemptEpoch: 1 } }) });
    const q = await open(ctx);
    expect(q.text).toBe(PIN2.text); expect(q.parametric.values).toEqual(PIN2.values);
    const s = await submission().handler(F.studentRequest({ action: "submit", expectedAttemptNumber: 2, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1, answers: { pq1: num(PIN2.expected) } }), deps(ctx));
    expect(s.status).toBe(200);
    expect(ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 2).score).toBe(4);
  });
  it("legacy UNTIMED assignment (no explicit start): the instance before and after the lazy draft attempt is the same; submit grades it", async () => {
    const legacy = assignment({ attemptModelVersion: 0, attemptPolicy: undefined, durationMinutes: 0 });
    const ctx = F.seed({ a: legacy, doc: null });
    const before = await open(ctx);
    expect(before.text).toBe(PIN1.text);
    expect((await submission().handler(F.studentRequest({ action: "saveDraft", answers: { pq1: num("3") } }), deps(ctx))).status).toBe(200);
    expect(await open(ctx)).toEqual(before);
    expect((await submission().handler(F.studentRequest({ action: "submit", answers: { pq1: num(PIN1.expected) } }), deps(ctx))).status).toBe(200);
    expect(ctx.getJson(F.SUB).attempts[0].score).toBe(4);
  });
  it("a TEACHER-ENDED attempt is graded with the attempt's own identity from the server draft", async () => {
    const ctx = F.seed({ a: assignment(), doc: F.activeDoc({ pq1: num(PIN1.expected) }) });
    const r = await results().handler(F.teacherRequest("/api/assignment-results", { action: "endActiveAttempt", assignmentId: F.AID, studentId: F.S1, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps(ctx));
    expect(r.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 1);
    expect(attempt.endReason).toBe("teacherEnded"); expect(attempt.score).toBe(4); expect(attempt.manualReviewMarks).toBe(0);
  });
  it("every official grading call site passes the server generation identity (submit, timeout, integrity exit / finalize, teacher end)", () => {
    const sub = fs.readFileSync(new URL("../src/functions/student-submission.js", import.meta.url), "utf8");
    const res = fs.readFileSync(new URL("../src/functions/assignment-results.js", import.meta.url), "utf8");
    expect((sub.match(/gradeFn\(a\.examSnapshot,[^)]*,parametricGenerationContext\(/g) || []).length).toBe(3);
    expect((res.match(/gradeFn\(fa\.examSnapshot,serverAnswers,parametricGenerationContext\(/g) || []).length).toBe(1);
    expect((sub.match(/gradeFn\(/g) || []).length).toBe(3);
  });
});

describe("19B — shared build parity", () => {
  it("the engine and the question model are in the shared build and the CommonJS mirror agrees with the source", async () => {
    expect(SHARED_ENTRIES).toContain("src/parametricEngine.ts");
    expect(SHARED_ENTRIES).toContain("src/parametricNumericQuestion.ts");
    const shared = require_("../src/lib/shared-finalization/parametricNumericQuestion.js");
    const ts = await import("../../src/parametricNumericQuestion.ts");
    const ID = { assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1, questionKey: "q1" };
    for (const [n, response, identity] of [[pq(), num("26"), ID], [pq(), num("12"), { ...ID, questionKey: "pq1", assignmentId: F.AID, studentId: F.S1 }], [pq({ answer: { ...KEY, mode: "x" } }), num("26"), ID], [pq(), num("26"), null]]) {
      expect(shared.scoreParametricNumeric({ question: n, response, maxMarks: 4, identity })).toEqual(ts.scoreParametricNumeric({ question: n, response, maxMarks: 4, identity }));
      expect(shared.projectParametricNumericForStudent(n, identity)).toEqual(ts.projectParametricNumericForStudent(n, identity));
    }
    expect(shared.validateParametricNumericQuestion(pq())).toEqual(ts.validateParametricNumericQuestion(pq()));
  });
});
