// Phase 21E.1 (slice 2) — the pure «تراجع» snapshot behind the builder's delete toast (src/structuredDeletionUndo.ts): the deletion is
// captured as the unchanged object + where it was, and restoring it is re-validated against the exam AS IT IS NOW (never a history pop).
import { describe, it, expect } from "vitest";
import type { BuilderQuestion, BuilderSection, StructuredExam } from "./examTypes";
import { deleteQuestion, deleteSection, moveQuestion, moveSection, updateQuestion, addQuestion } from "./examBuilderState";
import { validateSectionScenarios } from "./scenarioSource";
import { createQuestionInScenario } from "./scenarioBuilderOps";
import { applyDeletion, captureQuestionDeletion, captureSectionDeletion, deletionIsBack, restoreDeletion, type QuestionDeletion, type SectionDeletion } from "./structuredDeletionUndo";

const Q = (id: string, over: Partial<BuilderQuestion> & { bankQuestionId?: string } = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "shortAnswer", text: "نص " + id, marks: 1, answer: { text: "x" }, ...over }) as BuilderQuestion;
const S = (id: string, questions: BuilderQuestion[], over: Partial<BuilderSection> = {}): BuilderSection =>
  ({ id, title: "قسم " + id, gradingPolicy: "all", questions, ...over }) as BuilderSection;
const scenario = (id: string, questionIds: string[]) => ({ id, version: 1 as const, title: "سيناريو", sources: [{ id: "src-" + id, version: 1, kind: "text", text: "مصدر" }], questionIds });
const exam = (sections: BuilderSection[], examId = "ex1"): StructuredExam => ({ examId, title: "امتحان", schemaVersion: 2, status: "draft", sections } as StructuredExam);
const ids = (e: StructuredExam, sectionId = "s1") => e.sections.find(s => s.id === sectionId)!.questions.map(q => q.examQuestionId);
const withSections = (e: StructuredExam, f: (s: BuilderSection[]) => BuilderSection[]) => ({ ...e, sections: f(e.sections) });

const base = () => exam([
  S("s1", [Q("q1"), Q("q2", { displayNumber: " 2-أ " }), Q("q3"), Q("q4")]),
  S("s2", [Q("r1"), Q("r2", { bankQuestionId: "bank-7" } as never)]),
  S("s3", []),
]);

describe("21E.1 slice 2 — capture", () => {
  it("a question: the very same object, its index, the number the teacher saw, its neighbours; null when absent", () => {
    const e = base();
    const d = captureQuestionDeletion(e, "s1", "q2")!;
    expect(d.question).toBe(e.sections[0].questions[1]);
    expect(d).toMatchObject({ kind: "question", examId: "ex1", sectionId: "s1", sectionTitle: "قسم s1", index: 1, label: "2-أ", prevId: "q1", nextId: "q3", scenarioId: null, scenarioPos: -1 });
    expect(captureQuestionDeletion(e, "s1", "q1")).toMatchObject({ label: "1", prevId: null, nextId: "q2" });
    expect(captureQuestionDeletion(e, "s1", "q4")).toMatchObject({ label: "4", prevId: "q3", nextId: null });
    expect(captureQuestionDeletion(e, "s1", "nope")).toBeNull();
    expect(captureQuestionDeletion(e, "s9", "q1")).toBeNull();
  });
  it("a section: the very same object, its index and neighbours; null when absent", () => {
    const e = base();
    const d = captureSectionDeletion(e, "s2")!;
    expect(d.section).toBe(e.sections[1]);
    expect(d).toMatchObject({ kind: "section", index: 1, label: "2", prevId: "s1", nextId: "s3" });
    expect(captureSectionDeletion(e, "s9")).toBeNull();
  });
  it("applyDeletion is exactly the existing transition (scenario membership clean-up included)", () => {
    const e = exam([S("s1", [Q("q1"), Q("q2"), Q("q3")], { scenarios: [scenario("sc", ["q1", "q2", "q3"])] } as never)]);
    const d = captureQuestionDeletion(e, "s1", "q2")!;
    expect(d).toMatchObject({ scenarioId: "sc", scenarioPos: 1 });
    expect(applyDeletion(e, d).sections).toEqual(deleteQuestion(e.sections, "s1", "q2"));
    const ds = captureSectionDeletion(e, "s1")!;
    expect(applyDeletion(e, ds).sections).toEqual(deleteSection(e.sections, "s1"));
  });
});

describe("21E.1 slice 2 — restore a question", () => {
  it("delete then restore gives back the identical exam, with the identical question object", () => {
    const e = base();
    for (const qid of ["q1", "q2", "q4"]) {
      const d = captureQuestionDeletion(e, "s1", qid)!;
      const r = restoreDeletion(applyDeletion(e, d), d);
      expect(r.outcome).toBe("restored");
      expect(r.exam).toEqual(e);
      expect(r.exam.sections[0].questions.find(q => q.examQuestionId === qid)).toBe(d.question);
    }
  });
  it("keeps every edit made after the deletion (it is a new entry, not a history pop)", () => {
    const e = base();
    const d = captureQuestionDeletion(e, "s1", "q2")!;
    let now = applyDeletion(e, d);
    now = { ...now, title: "عنوان جديد" };
    now = withSections(now, s => updateQuestion(s, "s1", "q3", { text: "نص معدّل" }));
    now = withSections(now, s => addQuestion(s, "s2", Q("r3")));
    const r = restoreDeletion(now, d);
    expect(r.outcome).toBe("restored");
    expect(r.exam.title).toBe("عنوان جديد");
    expect(r.exam.sections[0].questions.find(q => q.examQuestionId === "q3")!.text).toBe("نص معدّل");
    expect(ids(r.exam, "s2")).toEqual(["r1", "r2", "r3"]);
    expect(ids(r.exam)).toEqual(["q1", "q2", "q3", "q4"]);
  });
  it("returns after its previous neighbour wherever it moved; else before its next one; else at its index (clamped)", () => {
    const e = base();
    const d = captureQuestionDeletion(e, "s1", "q2")!;                         // prev q1, next q3
    let now = withSections(applyDeletion(e, d), s => moveQuestion(s, "s1", "q1", 2));   // q3 q4 q1
    expect(ids(restoreDeletion(now, d).exam)).toEqual(["q3", "q4", "q1", "q2"]);
    now = withSections(applyDeletion(e, d), s => deleteQuestion(s, "s1", "q1"));         // q3 q4 → before q3
    expect(ids(restoreDeletion(now, d).exam)).toEqual(["q2", "q3", "q4"]);
    now = withSections(applyDeletion(e, d), s => deleteQuestion(deleteQuestion(s, "s1", "q1"), "s1", "q3")); // q4 → index 1
    expect(ids(restoreDeletion(now, d).exam)).toEqual(["q4", "q2"]);
    now = withSections(applyDeletion(e, d), s => s.map(x => (x.id === "s1" ? { ...x, questions: [] } : x)));   // empty → clamped to 0
    expect(ids(restoreDeletion(now, d).exam)).toEqual(["q2"]);
  });
  it("re-joins its scenario at its place when the members stay contiguous; the result passes the scenario validator", () => {
    const e = exam([S("s1", [Q("q0"), Q("q1"), Q("q2"), Q("q3")], { scenarios: [scenario("sc", ["q1", "q2", "q3"])] } as never)]);
    const d = captureQuestionDeletion(e, "s1", "q2")!;
    const r = restoreDeletion(applyDeletion(e, d), d);
    expect(r.exam).toEqual(e);
    expect(validateSectionScenarios(r.exam.sections[0]).issues).toEqual([]);
    // the only member: its scenario was emptied by the deletion and gets it back
    const one = exam([S("s1", [Q("q0"), Q("q1")], { scenarios: [scenario("sc", ["q1"])] } as never)]);
    const d1 = captureQuestionDeletion(one, "s1", "q1")!;
    expect(restoreDeletion(applyDeletion(one, d1), d1).exam).toEqual(one);
  });
  it("returns UNLINKED (never an invalid scenario) when its place no longer keeps the members contiguous", () => {
    const e = exam([S("s1", [Q("q0"), Q("q1"), Q("q2")], { scenarios: [scenario("sc", ["q1", "q2"])] } as never)]);
    const d = captureQuestionDeletion(e, "s1", "q1")!;                         // prev q0, next q2
    const now = withSections(applyDeletion(e, d), s => moveQuestion(s, "s1", "q0", 1)); // q2 q0
    const r = restoreDeletion(now, d);
    expect(r.outcome).toBe("restored");
    expect(ids(r.exam)).toEqual(["q2", "q0", "q1"]);
    expect((r.exam.sections[0].scenarios as { questionIds: string[] }[])[0].questionIds).toEqual(["q2"]);
    expect(validateSectionScenarios(r.exam.sections[0]).issues).toEqual([]);
  });
  it("Review Fix 2: when the previous member LEFT the scenario meanwhile, the member order stays the section order (never a stale position)", () => {
    const e = exam([S("s1", [Q("q1"), Q("q2"), Q("q3")], { scenarios: [scenario("sc", ["q1", "q2", "q3"])] } as never), S("s2", [Q("z")])]);
    const d = captureQuestionDeletion(e, "s1", "q2")!;                         // prev q1, next q3, member at 1
    // q1 moves to another section: it leaves the scenario, which now holds [q3]; q2 comes back BEFORE q3.
    const now = withSections(applyDeletion(e, d), s => s.map(sec => sec.id === "s1"
      ? { ...sec, questions: sec.questions.filter(q => q.examQuestionId !== "q1"), scenarios: [scenario("sc", ["q3"])] as never }
      : { ...sec, questions: [...sec.questions, e.sections[0].questions[0]] }));
    const r = restoreDeletion(now, d);
    expect(r.outcome).toBe("restored");
    expect(ids(r.exam)).toEqual(["q2", "q3"]);
    expect((r.exam.sections[0].scenarios as { questionIds: string[] }[])[0].questionIds).toEqual(["q2", "q3"]);
    expect(validateSectionScenarios(r.exam.sections[0]).issues).toEqual([]);
  });
  it("never splits ANOTHER scenario's block: it takes the first of after-previous / before-next / its index / the end that keeps blocks whole", () => {
    const e = exam([S("s1", [Q("x"), Q("p"), Q("q"), Q("n")], { scenarios: [scenario("T", ["x", "p"])] } as never)]);
    const d = captureQuestionDeletion(e, "s1", "q")!;                          // prev p, next n, not a member
    let now = withSections(applyDeletion(e, d), s => moveQuestion(s, "s1", "p", -1)); // p x n — T still contiguous
    let r = restoreDeletion(now, d);
    expect(ids(r.exam)).toEqual(["p", "x", "q", "n"]);                          // after p would split T → before n
    expect(validateSectionScenarios(r.exam.sections[0]).issues).toEqual([]);
    now = withSections(now, s => deleteQuestion(s, "s1", "n"));                  // p x — no next neighbour; index 2 is the end
    r = restoreDeletion(now, d);
    expect(ids(r.exam)).toEqual(["p", "x", "q"]);
    expect(validateSectionScenarios(r.exam.sections[0]).issues).toEqual([]);
    const two = exam([S("s1", [Q("a"), Q("b"), Q("q"), Q("c"), Q("d")], { scenarios: [scenario("U", ["a", "b"]), scenario("V", ["c", "d"])] } as never)]);
    const d2 = captureQuestionDeletion(two, "s1", "q")!;                       // prev b, next c
    now = withSections(applyDeletion(two, d2), s => moveQuestion(moveQuestion(s, "s1", "b", -1), "s1", "c", 1)); // b a d c
    r = restoreDeletion(now, d2);                                                // after b splits U, before c splits V → its index 2
    expect(ids(r.exam)).toEqual(["b", "a", "q", "d", "c"]);
    expect(validateSectionScenarios(r.exam.sections[0]).issues).toEqual([]);
    // a question created INSIDE a scenario after the deletion («+ سؤال» in the scenario block) right after the previous neighbour
    const grow = exam([S("s1", [Q("q1"), Q("q2"), Q("q3"), Q("q4")], { scenarios: [scenario("sc", ["q1"])] } as never)]);
    const d3 = captureQuestionDeletion(grow, "s1", "q2")!;                      // prev q1 (a member), next q3
    now = withSections(applyDeletion(grow, d3), s => s.map(x => (x.id === "s1" ? createQuestionInScenario(x, "sc", Q("qN")) : x))); // q1 qN q3 q4
    r = restoreDeletion(now, d3);
    expect(ids(r.exam)).toEqual(["q1", "qN", "q2", "q3", "q4"]);                 // not between q1 and qN
    expect(validateSectionScenarios(r.exam.sections[0]).issues).toEqual([]);
  });
  it("refuses with a reason: already back, another exam, section gone, the same bank question inserted again", () => {
    const e = base();
    const d = captureQuestionDeletion(e, "s1", "q2")!;
    expect(restoreDeletion(e, d)).toEqual({ exam: e, outcome: "already-present" });
    const other = { ...applyDeletion(e, d), examId: "ex2" };
    expect(restoreDeletion(other, d)).toEqual({ exam: other, outcome: "stale" });
    const gone = withSections(applyDeletion(e, d), s => deleteSection(s, "s1"));
    expect(restoreDeletion(gone, d)).toEqual({ exam: gone, outcome: "section-missing" });
    const db = captureQuestionDeletion(e, "s2", "r2")!;
    const again = withSections(applyDeletion(e, db), s => addQuestion(s, "s1", Q("fresh", { bankQuestionId: "bank-7" } as never)));
    expect(restoreDeletion(again, db)).toEqual({ exam: again, outcome: "bank-duplicate" });
    expect(restoreDeletion(applyDeletion(e, db), db).outcome).toBe("restored");
  });
});

describe("21E.1 slice 2 — restore a section", () => {
  it("delete then restore gives back the identical exam (questions, scenarios, settings — the same object)", () => {
    const e = exam([S("s1", [Q("q1")]), S("s2", [Q("r1"), Q("r2")], { scenarios: [scenario("sc", ["r1", "r2"])], instructions: "تعليمات", maxMarks: 5 } as never), S("s3", [])]);
    for (const sid of ["s1", "s2", "s3"]) {
      const d = captureSectionDeletion(e, sid)!;
      const r = restoreDeletion(applyDeletion(e, d), d);
      expect(r.outcome).toBe("restored");
      expect(r.exam).toEqual(e);
      expect(r.exam.sections.find(s => s.id === sid)).toBe(d.section);
    }
  });
  it("position: after its previous neighbour, else before its next one, else at its index (clamped); later edits kept", () => {
    const e = base();
    const d = captureSectionDeletion(e, "s2")!;                                 // prev s1, next s3
    let now = withSections(applyDeletion(e, d), s => moveSection(s, "s1", 1));    // s3 s1
    now = { ...now, title: "بعد الحذف" };
    const r = restoreDeletion(now, d);
    expect(r.exam.sections.map(s => s.id)).toEqual(["s3", "s1", "s2"]);
    expect(r.exam.title).toBe("بعد الحذف");
    now = withSections(applyDeletion(e, d), s => deleteSection(s, "s1"));      // s3 → before s3
    expect(restoreDeletion(now, d).exam.sections.map(s => s.id)).toEqual(["s2", "s3"]);
    now = withSections(applyDeletion(e, d), () => []);                          // nothing left → index clamped to 0
    expect(restoreDeletion(now, d).exam.sections.map(s => s.id)).toEqual(["s2"]);
  });
  it("refuses with a reason: already back, another exam, one of its question ids now elsewhere, its bank question inserted again", () => {
    const e = base();
    const d = captureSectionDeletion(e, "s2")!;
    expect(restoreDeletion(e, d).outcome).toBe("already-present");
    expect(restoreDeletion({ ...applyDeletion(e, d), examId: "ex2" }, d).outcome).toBe("stale");
    const clash = withSections(applyDeletion(e, d), s => addQuestion(s, "s1", Q("r1")));
    expect(restoreDeletion(clash, d)).toEqual({ exam: clash, outcome: "id-conflict" });
    const bank = withSections(applyDeletion(e, d), s => addQuestion(s, "s3", Q("x", { bankQuestionId: "bank-7" } as never)));
    expect(restoreDeletion(bank, d)).toEqual({ exam: bank, outcome: "bank-duplicate" });
  });
});

describe("21E.1 slice 2 — deletionIsBack (the toast leaves when Ctrl+Z / the toolbar brought the item back)", () => {
  it("question and section, and never across exams", () => {
    const e = base();
    const dq: QuestionDeletion = captureQuestionDeletion(e, "s1", "q3")!;
    const ds: SectionDeletion = captureSectionDeletion(e, "s3")!;
    expect(deletionIsBack(applyDeletion(e, dq), dq)).toBe(false);
    expect(deletionIsBack(e, dq)).toBe(true);
    expect(deletionIsBack(applyDeletion(e, ds), ds)).toBe(false);
    expect(deletionIsBack(e, ds)).toBe(true);
    expect(deletionIsBack({ ...e, examId: "ex2" }, dq)).toBe(false);
  });
});
