import { describe, it, expect } from "vitest";
import { qualityWarnings } from "./composerQuality";
import { composerVerdict } from "./composerExam";
import { editorQualityNotes } from "../builder/qualityNotes";
import { newQuestion } from "../examBuilderState";
import type { StructuredExam } from "../examTypes";

// Phase 21X — three more wording checks in the shared quality warnings (the composer's verdict AND the builder's 21W notes):
// a catch-all option («كل ما سبق» / «لا شيء مما سبق»), two options identical once spacing / diacritics / letter forms are ignored
// (moved here from the verdict's exact check, so it is reported once and the builder shows it too), and a double negative stem.
const mcq = (id: string, text: string, options: string[], correct = 0) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: correct } });
const exam = (...questions: unknown[]): StructuredExam => ({ examId: "E21X", title: "t", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions }] } as unknown as StructuredExam);
const codes = (e: StructuredExam) => qualityWarnings(e).map(w => [w.code, w.questionId]);

describe("21X-CATCHALL «كل ما سبق» / «لا شيء مما سبق»", () => {
  it("flags the catch-all option in any spelling form (diacritics, alef / taa marbuta, case), naming it", () => {
    for (const opt of ["كل ما سبق", "جميعُ ما سبق", "لا شيء مما سبق", "جميع الاجابات صحيحه", "All of the above", "None of the above."]) {
      const w = qualityWarnings(exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "المبدّل", opt])));
      expect(w.map(x => [x.code, x.questionId]), opt).toEqual([["COMPOSER_CATCH_ALL_OPTION", "q1"]]);
      expect(w[0].message).toContain("«" + opt.trim());
    }
  });
  it("an option that only CONTAINS those words is not a catch-all", () => {
    expect(codes(exam(mcq("q1", "أي عبارة صحيحة؟", ["ما سبق ذكره في الفصل الأول", "المبدّل", "المكرّر"])))).toEqual([]);
    expect(codes(exam(mcq("q1", "كم عنوانًا في الشبكة؟", ["مجموع كل ما سبق من عناوين", "عنوان واحد", "عنوانان"])))).toEqual([]);   // a real answer containing the words
  });
});

describe("21X-DUPOPT options identical after normalisation", () => {
  it("«الموجّه» and «الموجه» are the same option; distinct options are not flagged", () => {
    expect(codes(exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "الموجه", "المكرّر"])))).toEqual([["COMPOSER_DUPLICATE_OPTIONS", "q1"]]);
    expect(codes(exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "المبدّل", "المكرّر"])))).toEqual([]);
  });
  it("the composer verdict reports an exact duplicate ONCE (the old verdict check moved into the quality warnings)", () => {
    const v = composerVerdict(exam(mcq("q1", "أي جهاز يربط الشبكات المختلفة؟", ["الموجّه", "الموجّه", "المكرّر"])));
    expect(v.warnings.filter(w => w.code === "COMPOSER_DUPLICATE_OPTIONS").map(w => w.questionId)).toEqual(["q1"]);
  });
  it("multiple-select options are checked too", () => {
    const ms = newQuestion("multipleSelect", { examQuestionId: "m1", text: "اختر البروتوكولات", marks: 2, options: [{ text: "DHCP" }, { text: "dhcp" }, { text: "DNS" }] });
    expect(codes(exam(ms)).map(c => c[0])).toContain("COMPOSER_DUPLICATE_OPTIONS");
  });
});

describe("21X-NEG double negative stems", () => {
  it("two negations in the stem are flagged; one is not", () => {
    expect(codes(exam(mcq("q1", "أي مما يلي لا يُعدّ غير صحيح؟", ["أ", "ب"])))).toEqual([["COMPOSER_DOUBLE_NEGATIVE", "q1"]]);
    expect(codes(exam(mcq("q1", "Which statement is not never true?", ["a", "b"])))).toEqual([["COMPOSER_DOUBLE_NEGATIVE", "q1"]]);
    expect(codes(exam(mcq("q1", "أي مما يلي لا يُعدّ بروتوكولًا للتوجيه؟", ["أ", "ب"])))).toEqual([]);
  });
  it("a composite part's stem and options are checked and reported on the composite question", () => {
    const composite = newQuestion("composite", { examQuestionId: "c1", text: "أجب عما يلي", marks: 2, composite: { groups: [{ id: "g1", parts: [
      { id: "p1", type: "multipleChoice", text: "أي مما يلي لم يكن غير مستخدم؟", marks: 1, options: [{ text: "أ" }, { text: "كل ما سبق" }], answer: { correctOptionIndex: 0 } }
    ] }] } as never });
    expect(codes(exam(composite)).map(c => c.join("@")).sort()).toEqual(["COMPOSER_CATCH_ALL_OPTION@c1", "COMPOSER_DOUBLE_NEGATIVE@c1"]);
  });
});

describe("21X-BUILDER the builder's notes (21W) show the new checks", () => {
  it("a hand-written question with «لا شيء مما سبق» gets a note on its question", () => {
    expect(editorQualityNotes(exam(mcq("q1", "أي جهاز يربط الشبكات؟", ["الموجّه", "المبدّل", "لا شيء مما سبق"]))).map(n => [n.code, n.number])).toEqual([["COMPOSER_CATCH_ALL_OPTION", 1]]);
  });
});
