import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { registerGrader, resolveGrader } from "../src/lib/question-type-graders.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
// The grader module `require`s the shared catalog (CJS); a test must register into THAT instance, not an ESM-loaded copy.
const { registerQuestionType, effectiveQuestionTypeVersion } = createRequire(import.meta.url)("../src/lib/shared-finalization/questionTypeCatalog.js");

// Phase 16A — Independent Review Fix 1: the AUTHORITATIVE server grader is bound to (key, version) — a published V1 question
// is graded by the V1 grader forever while V1 is supported, even after V2 exists (RV6–RV10) — and the student sanitizer
// implements the UNIVERSAL contract: public scenario data stays, every private expected / scoring state is removed without the
// sanitizer knowing the plugin's domain (UP9, UP10). Fail-first on e1f295a (key-only grader registry, TYPE_CONFIG_KEYS list).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const exam = (questions) => ({ examId: "E-RF1", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const q = (r, id) => r.questions.find(x => x.questionId === id);
const caps = { autoGrading: true, manualGrading: false, hybridGrading: false, partialCredit: true, compoundPart: true, interactive: true, requiresImage: false, offline: true };
const family = () => registerQuestionType({ key: "versionedSynthetic", version: 2, label: "محاكاة مُصدَّرة", category: "interactive", gradingMode: "auto", capabilities: caps, responseKinds: ["fields"], legacy: false });
const v1Grader = (question, response, max) => ({ score: max * 0.4, manualReview: false, correct: false });   // response X → 4/10
const v2Grader = (question, response, max) => ({ score: max * 0.8, manualReview: false, correct: false });   // same response X → 8/10
const question = (id, version) => ({ examQuestionId: id, presentationType: "versionedSynthetic", ...(version === undefined ? {} : { questionTypeVersion: version }), text: "x", marks: 10, scenario: { rule: "v" + (version || 1) }, answer: { expectedState: { a: version || 1 } } });
const X = { kind: "fields", values: { a: "x" } };

describe("RF1 R1 — server grading is version-bound", () => {
  it("RV6 / RV7 / RV8 / RV9 / RV1 — @1 always gets the V1 result, @2 the V2 result, absent = V1, V3 fails closed, registering V2 never replaces V1", () => {
    const undoCatalog = family();
    const undo1 = registerGrader("versionedSynthetic", 1, v1Grader);
    const undo2 = registerGrader("versionedSynthetic", 2, v2Grader);
    try {
      const r = gradeExam(exam([question("v1", 1), question("v2", 2), question("abs", undefined), question("v3", 3)]), { v1: X, v2: X, abs: X, v3: X });
      expect(q(r, "v1").score).toBe(4); expect(q(r, "v2").score).toBe(8); expect(q(r, "abs").score).toBe(4);
      expect(q(r, "v3").score).toBe(0); expect(q(r, "v3").manualReview).toBe(true); expect(r.manualReviewMarks).toBe(10);
      expect(resolveGrader("versionedSynthetic", 1)).toBe(v1Grader); expect(resolveGrader("versionedSynthetic", 2)).toBe(v2Grader); expect(resolveGrader("versionedSynthetic", undefined)).toBe(v1Grader); expect(resolveGrader("versionedSynthetic", 3)).toBeUndefined();
      expect(() => registerGrader("versionedSynthetic", 1, v2Grader)).toThrow();                            // RV8: identity taken, V1 untouched
      expect(resolveGrader("versionedSynthetic", 1)).toBe(v1Grader);
      expect(effectiveQuestionTypeVersion("versionedSynthetic", undefined)).toBe(1);
    } finally { undo2(); undo1(); undoCatalog(); }
    expect(q(gradeExam(exam([question("v1", 1)]), { v1: X }), "v1").score).toBe(0);                          // unregistered → fail closed
  });
  it("RV10 — a sanitized / published V1 question stays V1 (version travels to the student and back) and grades with the V1 grader after V2 exists", () => {
    const undoCatalog = family();
    const undo1 = registerGrader("versionedSynthetic", 1, v1Grader);
    try {
      const published = sanitizeExamForStudent(exam([question("v1", 1)]));
      const studentQ = published.sections[0].questions[0];
      expect(studentQ.questionTypeVersion).toBe(1); expect(studentQ.answer).toEqual({});
      const undo2 = registerGrader("versionedSynthetic", 2, v2Grader);
      try {
        expect(q(gradeExam(exam([question("v1", 1)]), { v1: X }), "v1").score).toBe(4);
        expect(q(gradeExam(exam([{ ...question("v1", 1), questionTypeVersion: studentQ.questionTypeVersion }]), { v1: X }), "v1").score).toBe(4);
      } finally { undo2(); }
    } finally { undo1(); undoCatalog(); }
  });
  it("legacy types: absent / 1 → the legacy adapter; an explicit unsupported version fails closed; a grader registered without a catalog entry serves version 1 only", () => {
    expect(resolveGrader("multipleChoice", undefined)).toBe(Symbol.for("exambank.legacy-grader"));
    expect(resolveGrader("multipleChoice", 1)).toBe(Symbol.for("exambank.legacy-grader"));
    expect(resolveGrader("multipleChoice", 2)).toBeUndefined();
    const undo = registerGrader("orphanGrader", 1, v1Grader);
    try { expect(resolveGrader("orphanGrader", undefined)).toBe(v1Grader); expect(resolveGrader("orphanGrader", 1)).toBe(v1Grader); expect(resolveGrader("orphanGrader", 2)).toBeUndefined(); } finally { undo(); }
    expect(() => registerGrader("x", 0, v1Grader)).toThrow(); expect(() => registerGrader("x", 1.5, v1Grader)).toThrow(); expect(() => registerGrader("x", "1", v1Grader)).toThrow();
  });
});

describe("RF1 — universal student sanitization contract (no per-domain list)", () => {
  it("UP10 — public scenario data reaches the student byte-for-byte; `answer` and every secret-looking key inside ANY plugin object are removed; the sanitizer names no domain", () => {
    const scenario = { bodies: [{ id: "b1", mass: 2, label: "كرة" }], gravity: 9.8, grid: { show: true }, steps: ["drop", "measure"] };
    const smuggled = { ...scenario, expectedState: { b1: "rest" }, correctAnswer: "LEAK-1", solution_steps: ["LEAK-2"], nested: { ok: 1, scoringRule: "LEAK-3" } };
    const teacher = exam([{ examQuestionId: "u", presentationType: "universalSim", questionTypeVersion: 1, text: "حرّك", marks: 4, scenario: smuggled, publicConfig: { theme: "dark", answerKey: "LEAK-4" }, answer: { expectedState: { b1: "rest" }, tolerance: 0.1, note: "LEAK-5" } }]);
    const s = sanitizeExamForStudent(teacher);
    const sq = s.sections[0].questions[0];
    const text = JSON.stringify(s);
    for (let i = 1; i <= 5; i++) expect(text).not.toContain("LEAK-" + i);
    expect(text).not.toContain("expectedState"); expect(text).not.toContain("\"rest\"");
    expect(sq.scenario).toEqual({ ...scenario, nested: { ok: 1 } });
    expect(sq.publicConfig).toEqual({ theme: "dark" });
    expect(sq.answer).toEqual({}); expect(sq.questionTypeVersion).toBe(1); expect(sq.presentationType).toBe("universalSim");
    // the same rule serves a compound part
    const c = sanitizeExamForStudent(exam([{ examQuestionId: "c", presentationType: "compound", text: "م", marks: 4, parts: [{ id: "p1", type: "universalSim", questionTypeVersion: 1, text: "ب", marks: 4, scenario: smuggled, answer: { expectedState: 1 } }] }])).sections[0].questions[0].parts[0];
    expect(c.scenario).toEqual({ ...scenario, nested: { ok: 1 } }); expect("answer" in c).toBe(false);
    const src = fs.readFileSync(path.join(repo, "api/src/lib/student-exam-sanitize.js"), "utf8");
    expect(src).not.toMatch(/TYPE_CONFIG_KEYS|"numeric"|"matrix"|"categorization"|networkSimulation|Simulation/);
  });
  it("Wave 1 protections are unchanged: option / row / column / category identities stay, every key is gone", () => {
    const s = sanitizeExamForStudent(exam([
      { examQuestionId: "ms1", presentationType: "multipleSelect", questionTypeVersion: 1, text: "s", marks: 4, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }], answer: { correctOptionIds: ["o1"], scoring: "allOrNothing" } },
      { examQuestionId: "x1", presentationType: "matrix", questionTypeVersion: 1, text: "m", marks: 6, matrix: { rows: [{ id: "r1", label: "x", correctColumn: "c1" }], columns: [{ id: "c1", label: "y" }] }, answer: { correctColumnByRow: { r1: "c1" } } },
      { examQuestionId: "n1", presentationType: "numericResponse", questionTypeVersion: 1, text: "n", marks: 3, numeric: { unitRequired: true, expected: 9.8 }, answer: { mode: "tolerance", expected: 9.8, tolerance: 0.1 } }
    ]));
    const t = JSON.stringify(s);
    expect(t).not.toMatch(/correctOptionIds|correctColumn|"expected"|tolerance/);
    const [ms, mx, num] = s.sections[0].questions;
    expect(ms.options.map(o => o.id)).toEqual(["o1", "o2"]); expect(mx.matrix.rows[0]).toEqual({ id: "r1", label: "x" }); expect(num.numeric).toEqual({ unitRequired: true });
  });
});
