import { describe, it, expect } from "vitest";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { rebuildAttemptGrades } from "../src/lib/attempt-grade-rebuild.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { compositePartOverrides } from "../src/lib/composite-review.js";
import { validateStructuredExam } from "../../src/examQuality";
import { compositeArabicExam, compositeCsExam } from "../../src/composite/compositeFixtures";

// Phase 20D — REVIEW FIX 1 (fail-first on 127c0b2, the head the independent review examined). Three findings:
//  F2  the "::part::" reservation and the composite's own id rule looked only at examQuestionId; the RUNTIME id is the effective
//      sectionQuestionId (examQuestionId ?? id ?? "<section>::qN"), so a top-level question whose `id` equals a composite child key
//      passed finalization and its legacy override was read as the composite part's override (a wrong grade on the part).
//  F3  a composite whose effective id is not a safe composite id (an `id` / derived section id with other characters) passed
//      finalization; its child keys can never be parsed (coding children never planned, part overrides silently dropped).
//  F1  the composite answered-predicate ran the client `answered()` on student-controlled nested answers and threw on malformed
//      shapes (TypeError ⇒ submit / end-attempt 500, a stuck attempt) — also for a forged `composite` answer on a NON-composite question.
const clone = x => JSON.parse(JSON.stringify(x));
const qOf = e => e.sections[0].questions[0];
const errors = e => validateStructuredExam(e).filter(i => i.severity === "error").map(i => i.code);
const comp = (parts, contexts = {}) => ({ kind: "composite", parts, contexts });

describe("20D-RF1-F2 the composite child identity is reserved against the EFFECTIVE question id", () => {
  const colliding = () => { const e = compositeArabicExam(); e.sections[0].questions.push({ id: "q4::part::pC1", presentationType: "shortAnswer", text: "اشرح", marks: 6, answer: {} }); return e; };
  it("a top-level question whose `id` (no examQuestionId) equals a composite child key blocks finalization", () => {
    expect(errors(colliding())).toContain("COMPOSITE_TARGET_KEY_AMBIGUOUS");
  });
  it("a derived section id carrying the separator (<section>::qN) blocks finalization too", () => {
    const e = compositeArabicExam();
    e.sections.push({ ...clone(e.sections[0]), id: "x::part::y", questions: [{ presentationType: "shortAnswer", text: "اشرح", marks: 1, answer: {} }] });
    expect(errors(e)).toContain("COMPOSITE_TARGET_KEY_AMBIGUOUS");
  });
  it("runtime (finalization bypassed): an override stored under a key that is ALSO a top-level question id never grades the composite part", () => {
    const e = colliding();
    const g = gradeExam(e, { q4: comp({ pC1: { kind: "text", value: "x" } }), "q4::part::pC1": { kind: "text", value: "y" } });
    const at = { attemptNumber: 1, questionGrades: clone(g.questions), manualOverrides: { "q4::part::pC1": { score: 6, comment: "top-level" } }, gradedStructured: true, sections: clone(g.sections), totalMarks: g.totalMarks };
    expect(compositePartOverrides(e, at, { "q4::part::pC1": { score: 6 } }).entries.size).toBe(0);
    rebuildAttemptGrades(at);
    const pc1 = at.questionGrades.find(x => x.questionId === "q4").parts.find(p => p.partId === "pC1");
    expect(pc1).toMatchObject({ score: 0, manualReview: true });                          // stays pending: the ambiguous key is not its authority
    expect(pc1.teacherComment === undefined || pc1.teacherComment === "").toBe(true);
    expect(at.questionGrades.find(x => x.questionId === "q4::part::pC1").score).toBe(6);  // the top-level question keeps its own override
  });
});

describe("20D-RF1-F3 the composite's OWN effective id must be a safe composite id", () => {
  for (const [name, mut] of [
    ["an `id` with spaces / Arabic letters (no examQuestionId)", e => { delete qOf(e).examQuestionId; qOf(e).id = "سؤال 2"; }],
    ["a derived <section>::qN id from an unsafe section id", e => { delete qOf(e).examQuestionId; delete qOf(e).id; e.sections[0].id = "القسم الأول"; }]
  ]) it(name + " blocks finalization", () => { const e = compositeCsExam(); mut(e); expect(errors(e)).toContain("COMPOSITE_QUESTION_ID_INVALID"); });
  it("a safe effective `id` (no examQuestionId) is accepted", () => {
    const e = compositeCsExam(); delete qOf(e).examQuestionId; qOf(e).id = "cs1";
    expect(errors(e)).toEqual([]);
  });
});

describe("20D-RF1-F1 forged / malformed nested answers never crash grading and never take a slot", () => {
  const FORGED = [{ kind: "text" }, { kind: "fields" }, { kind: "sequence" }, { kind: "table", values: "x" }, { kind: "text", value: 5 }, { kind: "choice", index: "0" }, { kind: "compound", parts: null }, { kind: "compound", parts: {} }, { kind: "composite", parts: {} }, { kind: "nope" }, null, 7];
  it("binding drops every malformed / wrong-family child answer (reported), keeps the well-formed ones; grading never throws", () => {
    for (const bad of FORGED) {
      const b = normalizeDraftAnswers({ q4: comp({ pA1: bad, pA3: { kind: "choice", index: 0 } }) }, compositeArabicExam());
      expect(b.answers.q4.parts, JSON.stringify(bad)).toEqual({ pA3: { kind: "choice", index: 0 } });
      expect(b.rejected.map(r => r.id), JSON.stringify(bad)).toContain("q4.pA1");
      expect(() => gradeExam(compositeArabicExam(), b.answers)).not.toThrow();
    }
  });
  it("the server answered-predicate is total: a raw malformed composite answer is never a crash (unbound / stored legacy data)", () => {
    for (const bad of FORGED) {
      expect(() => isResponseAnswered(comp({ pA1: bad }))).not.toThrow();
      expect(() => gradeExam(compositeArabicExam(), { q4: comp({ pA1: bad }) })).not.toThrow();
    }
    expect(isResponseAnswered(comp({ pA1: { kind: "text" } }))).toBe(false);
  });
  it("a composite answer on a NON-composite question is refused when bound (baseline semantics: it was never an answer there)", () => {
    const mc = id => ({ examQuestionId: id, presentationType: "multipleChoice", text: "x", marks: 1, options: [{ text: "a" }, { text: "b" }], answer: { correctOptionIndex: 0 } });
    const exam = { sections: [{ id: "s", gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 1, questions: [mc("m1"), mc("m2")] }] };
    const b = normalizeDraftAnswers({ m1: comp({ x: { kind: "text" } }), m2: { kind: "choice", index: 0 } }, exam);
    expect(b.answers).toEqual({ m2: { kind: "choice", index: 0 } });
    expect(b.rejected).toEqual([{ id: "m1", code: "COMPOSITE_QUESTION_MISMATCH" }]);
    const g = gradeExam(exam, b.answers);
    expect([g.score, g.totalMarks]).toEqual([1, 1]);                                     // the real answer takes the slot
    expect(() => gradeExam(exam, { m1: comp({ x: { kind: "text" } }), m2: { kind: "choice", index: 0 } })).not.toThrow();
  });
});

describe("20D-RF1-N1 the 1 MB authoring bound exempts only image payloads", () => {
  it("a 1.1 MB text source starting with \"data:\" counts against the bound (it is not an image)", () => {
    const e = compositeArabicExam();
    const big = "data:" + "x".repeat(1_100_000);
    qOf(e).composite.contexts = [{ id: "c0", version: 1, kind: "source", sources: [{ id: "s0", version: 1, kind: "text", text: big }] }];
    for (const g of qOf(e).composite.groups) for (const p of g.parts) delete p.contextId;
    expect(errors(e)).toContain("COMPOSITE_LIMIT");
  });
});
