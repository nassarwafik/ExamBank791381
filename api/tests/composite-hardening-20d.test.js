import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { rebuildAttemptGrades } from "../src/lib/attempt-grade-rebuild.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { compositeReviewOf } from "../src/lib/composite-review.js";
import { validateStructuredExam } from "../../src/examQuality";
import { compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam } from "../../src/composite/compositeFixtures";

// Phase 20D — HARDENING of composite@1 (new tests written with the implementation, not fail-first): bounds, question-level exact keys,
// the child projection's structural hygiene, rebuild clamping of uncounted parts, coding target ambiguity / child identity pins,
// parent-override precedence over open child targets, and type-first dispatch (a composite never grades as a compound).
const require_ = createRequire(import.meta.url);
const official = () => require_("../src/lib/coding/official-grading.js");
const clone = x => JSON.parse(JSON.stringify(x));
const qOf = e => e.sections[0].questions[0];
const errors = e => validateStructuredExam(e).filter(i => i.severity === "error").map(i => i.code);
const comp = (parts, contexts = {}) => ({ kind: "composite", parts, contexts });
const code = source => ({ kind: "code", language: "python", languageVersion: 1, source });

describe("20D-H1 bounds and question-level exact keys", () => {
  it("contexts ≤ 8, SmartSim contexts ≤ 3, source contexts ≤ 6, parts ≤ 40, coding children ≤ 4, root ≤ 1 MB", () => {
    const src = i => ({ id: "c" + i, version: 1, kind: "source", sources: [{ id: "s" + i, version: 1, kind: "text", text: "x" }] });
    const sim = i => ({ ...clone(qOf(compositePhysicsExam()).composite.contexts[0]), id: "sim" + i });
    for (const [name, mut] of [
      ["9 contexts", q => { q.composite.contexts = [...Array.from({ length: 6 }, (_, i) => src(i)), sim(1), sim(2), sim(3)]; }],
      ["4 SmartSim contexts", q => { q.composite.contexts = [sim(1), sim(2), sim(3), sim(4)]; }],
      ["7 source contexts", q => { q.composite.contexts = Array.from({ length: 7 }, (_, i) => src(i)); }],
      ["41 parts", q => { const p = qOf(compositeArabicExam()).composite.groups[0].parts[0]; q.composite.groups = [{ id: "gg", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: Array.from({ length: 41 }, (_, i) => ({ ...clone(p), id: "x" + i })) }]; q.marks = 82; }],
      ["5 coding children", q => { const c = qOf(compositeCsExam()).composite.groups[1].parts[0]; q.composite.groups = [{ id: "gg", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: Array.from({ length: 5 }, (_, i) => ({ ...clone(c), id: "x" + i })) }]; q.marks = 50; }],
      ["root over 1 MB", q => { q.composite.contexts[0].sources[0].text = "ن".repeat(19000); q.composite.contexts = [q.composite.contexts[0], ...Array.from({ length: 5 }, (_, i) => ({ ...clone(q.composite.contexts[0]), id: "big" + i, sources: Array.from({ length: 8 }, (_, k) => ({ id: "b" + i + "_" + k, version: 1, kind: "text", text: "ن".repeat(19000) })) }))]; }]
    ]) { const e = compositeArabicExam(); mut(qOf(e)); expect(errors(e), name).toContain("COMPOSITE_LIMIT"); }
  });
  it("a composite question carries only its contract keys (an unknown question-level key blocks)", () => {
    const e = compositeArabicExam(); qOf(e).hiddenGrader = "x";
    expect(errors(e)).toContain("COMPOSITE_UNKNOWN_KEY");
    const ok = compositeArabicExam(); Object.assign(qOf(ok), { displayNumber: "4", assessmentMeta: { bloom: "apply" } });
    expect(errors(ok)).toEqual([]);
  });
});

describe("20D-H2 child projection hygiene — structural, for every child of every fixture", () => {
  it("no delivered child carries answer / hint / teacher fields / presentationType / textHtml / assessmentMeta", () => {
    for (const f of [compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam]) {
      const out = sanitizeExamForStudent(f(), { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } });
      for (const p of qOf(out).composite.groups.flatMap(g => g.parts))
        for (const k of ["answer", "hint", "teacherNote", "aiInstruction", "history", "redoStack", "presentationType", "textHtml", "assessmentMeta", "explanation"]) expect(Object.prototype.hasOwnProperty.call(p, k), p.id + "." + k).toBe(false);
    }
  });
});

describe("20D-H3 rebuild clamps uncounted parts and keeps the whole-question precedence", () => {
  it("an override stored on an IGNORED first-N part (bypassing the review endpoint) can never add marks", () => {
    const r = gradeExam(compositeArabicExam(), { q4: comp({ pB1: { kind: "fields", values: { t1: "k1", t2: "k2" } }, pB2: { kind: "fields", values: { x1: "c1", x2: "c2" } }, pB3: { kind: "numeric", value: "70" } }) });
    const at = { questionGrades: clone(r.questions), sections: clone(r.sections), manualOverrides: { "q4::part::pB3": { score: 2 } }, totalMarks: r.totalMarks };
    rebuildAttemptGrades(at);
    expect(at.score).toBe(r.score);
    expect(at.questionGrades[0].parts.find(p => p.partId === "pB3").score).toBe(0);
  });
  it("a composite carrying a legacy parts array is a broken authority (fails closed), never graded as a compound", () => {
    const e = compositeArabicExam(); qOf(e).parts = [{ id: "z", type: "trueFalse", text: "t", marks: 20, answer: { correct: true } }];
    const g = gradeExam(e, { q4: { kind: "compound", parts: { z: { kind: "choice", index: 0 } } } }).questions[0];
    expect(g).toMatchObject({ score: 0, manualReview: true });
    expect(sanitizeExamForStudent(e).sections[0].questions[0].parts).toBeUndefined();
  });
});

describe("20D-H4 coding child identity, ambiguity and override precedence", () => {
  const graded = (exam, answers) => { const g = gradeExam(exam, answers); return { attemptNumber: 1, submittedAt: "2026-01-01T00:00:00.000Z", answers, questionGrades: g.questions, sections: g.sections, manualOverrides: {}, totalMarks: g.totalMarks }; };
  it("PIN: the child target identity (job id, target ref, fingerprint, grading key) of fixture C's coding child", () => {
    const answers = { cs1: comp({ c1: code("print(1)\n") }) };
    const a = official().targetAuthority(compositeCsExam(), graded(compositeCsExam(), answers), "cs1::part::c1", { assignmentId: "asg-pin", studentId: "stu-pin", revision: 1 });
    expect({ ok: a.ok, jobId: a.jobId, targetRef: a.targetRef, gradingKey: a.gradingKey, questionFingerprint: a.questionFingerprint, answerHash: a.answerHash, maxMarks: a.maxMarks }).toEqual({ ok: true, jobId: "cg_156c3a12bcb841cdfd7416e341939eb6ec79e747", targetRef: "tr_39e9dcf916d5502e10a9d61594b0033729b7ae78", gradingKey: "bcec2d8a4aa40c959eb3bdc49fa3fda9ef4dfbec9a1801c8f628f3e2252c4967", questionFingerprint: "67f6dfafaffc83ca00086180f2fddcc8f246a2da6118c31b9e0209ac63b17386", answerHash: "14228e9c641faa5f46c4501e1cc4af5a74506cd11fc848f30126b38f261d6feb", maxMarks: 10 });
  });
  it("a key that resolves BOTH as a top-level question and as a composite child is ambiguous: no authority (fails closed), never planned", () => {
    const e = compositeCsExam();
    e.sections[0].questions.push({ ...clone(qOf(compositeCsExam()).composite.groups[1].parts[0]), presentationType: "coding", examQuestionId: "cs1::part::c1", marks: 10 });
    const answers = { cs1: comp({ c1: code("print(1)\n") }), "cs1::part::c1": code("print(2)\n") };
    const at = graded(e, answers);
    expect(official().resolveCodingTarget(e, at, "cs1::part::c1")).toEqual({ ambiguous: true });
    expect(official().targetAuthority(e, at, "cs1::part::c1", { assignmentId: "a", studentId: "s", revision: 1 })).toMatchObject({ ok: false, code: "QUESTION_INVALID" });
    const plan = official().planCodingGrading(e, at, { assignmentId: "a", studentId: "s" });
    expect(plan.dispatch).toEqual([]);                                                             // nothing is ever sent for an ambiguous key
    expect(at.codingGrading.targets["cs1::part::c1"]).toMatchObject({ state: "retryable", technicalCode: "QUESTION_INVALID" });   // held for review, never a zero
  });
  it("an ignored composite (excess in a first-N question-unit section) plans NO child target", () => {
    const e = compositeCsExam(); const second = clone(qOf(e)); second.examQuestionId = "cs2";
    e.sections[0] = { ...e.sections[0], gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 18, questions: [qOf(e), second] };
    const at = graded(e, { cs1: comp({ c1: code("print(1)\n") }), cs2: comp({ c1: code("print(2)\n") }) });
    const plan = official().planCodingGrading(e, at, { assignmentId: "a", studentId: "s" });
    expect(plan.dispatch).toEqual(["cs1::part::c1"]);
  });
  it("a whole-composite override supersedes an open child target (student status / pending flag)", () => {
    const at = graded(compositeCsExam(), { cs1: comp({ c1: code("print(1)\n") }) });
    official().planCodingGrading(compositeCsExam(), at, { assignmentId: "a", studentId: "s" });
    expect(official().autoGradingPending(at)).toBe(true);
    at.manualOverrides = { cs1: { score: 12 } };
    expect(official().overrideScoreOf(at, "cs1::part::c1")).toBe(12);
    expect(official().autoGradingPending(at)).toBe(false);
    at.manualOverrides = { "cs1::part::c1": { score: 3 } };
    expect(official().overrideScoreOf(at, "cs1::part::c1")).toBe(3);
  });
});

describe("20D-H5 mutation hardening — each guard proven on its own", () => {
  const graded = (exam, answers) => { const g = gradeExam(exam, answers); return { attemptNumber: 1, submittedAt: "2026-01-01T00:00:00.000Z", answers, questionGrades: g.questions, sections: g.sections, manualOverrides: {}, totalMarks: g.totalMarks }; };
  it("rebuild: an IGNORED (excess) part never affects the parent's correctness — a wrong excess answer keeps a fully-correct first-N composite correct", () => {
    const e = compositeArabicExam(); qOf(e).composite.groups = [qOf(e).composite.groups[1]]; qOf(e).marks = 4;
    const r = gradeExam(e, { q4: comp({ pB1: { kind: "fields", values: { t1: "k1", t2: "k2" } }, pB2: { kind: "fields", values: { x1: "c1", x2: "c2" } }, pB3: { kind: "numeric", value: "-1" } }) });
    expect(r.questions[0]).toMatchObject({ score: 4, correct: true });
    const at = { questionGrades: clone(r.questions), sections: clone(r.sections), manualOverrides: {}, totalMarks: r.totalMarks };
    rebuildAttemptGrades(at);
    expect(at.questionGrades[0]).toMatchObject({ score: 4, correct: true, manualReview: false });
  });
  it("binding: a composite answer over 1 MB is refused AS TOO LARGE even with few shared-context actions", () => {
    const b = normalizeDraftAnswers({ q4: comp({ pA1: { kind: "choice", index: 0 }, pC1: { kind: "text", value: "ن".repeat(600_000) } }) }, compositeArabicExam());
    expect(b.rejected).toEqual([{ id: "q4", code: "COMPOSITE_ANSWER_TOO_LARGE" }]);
    expect(b.answers.q4).toBeUndefined();
  });
  it("coding: a composite whose OWN grade is ignored (countedMaxMarks 0) plans no child target even if a stored part record still looks counted", () => {
    const at = graded(compositeCsExam(), { cs1: comp({ c1: code("print(1)\n") }) });
    at.questionGrades[0] = { ...at.questionGrades[0], countedMaxMarks: 0 };                       // a corrupted / inconsistent authority record
    expect(official().planCodingGrading(compositeCsExam(), at, { assignmentId: "a", studentId: "s" }).dispatch).toEqual([]);
  });
  it("coding: a child's teacher evidence is computed from the PART grade (its maximum), never from a top-level lookup", () => {
    const at = graded(compositeCsExam(), { cs1: comp({ c1: code("print(1)\n") }) });
    official().planCodingGrading(compositeCsExam(), at, { assignmentId: "a", studentId: "s" });
    const rv = compositeReviewOf(qOf(compositeCsExam()), "cs1", at, { assignmentId: "a", studentId: "s" });
    const c1 = rv.parts.find(p => p.partId === "c1");
    expect(c1.codingEvidence).toBeTruthy();
    expect(c1.codingEvidence.maxMarks).toBe(10);
  });
  it("coding: a linked SmartSim part (or any non-coding child) never resolves as a coding target", () => {
    const at = graded(compositePhysicsExam(), {});
    const linked = qOf(compositePhysicsExam()).composite.groups.flatMap(g => g.parts).find(p => p.type === "smartSim" && p.contextId);
    expect(official().resolveCodingTarget(compositePhysicsExam(), at, "phys1::part::" + linked.id)).toBeNull();
  });
});
