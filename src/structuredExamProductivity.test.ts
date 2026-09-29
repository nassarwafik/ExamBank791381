import { describe, it, expect } from "vitest";
import type { BuilderQuestion, BuilderSection, StructuredExam } from "./examTypes";
import { openExamHistory, updateExamHistory, undoExamHistory, redoExamHistory } from "./examHistory";
import {
  indexExamQuestions, filterNavigatorEntries, EMPTY_NAVIGATOR_FILTERS, navigatorFiltersActive,
  bulkDeleteQuestions, bulkMoveQuestions, bulkDuplicateQuestions, bulkSetMarks, isValidQuestionMarks,
  insertQuestionsIntoSection, pruneSelection, usedBankQuestionIds, bankExamQuestionToBuilderQuestion, MAX_BANK_SELECT
} from "./structuredExamProductivity";

// Phase 13B — the PURE productivity model: navigator index / search / filters, bulk operations (one exam mutation each,
// same-reference no-ops), selection pruning, bank duplicate detection and the canonical bank → structured bridge.

const q = (id: string, over: Partial<BuilderQuestion> & Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: "نص " + id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...over } as BuilderQuestion);
const sec = (id: string, title: string, questions: BuilderQuestion[]): BuilderSection => ({ id, title, gradingPolicy: "all", questions });
const exam = (sections: BuilderSection[]): StructuredExam => ({ examId: "EX", title: "T", sections } as StructuredExam);
const ids = (s: BuilderSection) => s.questions.map(x => x.examQuestionId);
const three = () => [
  sec("s1", "الأول", [q("a1"), q("a2", { displayNumber: "٢", presentationType: "shortAnswer", answer: {} }), q("a3", { origin: "bank", bankQuestionId: "BQ-9", questionNumber: "17", topic: "SUBNETTING", difficulty: 4 })]),
  sec("s2", "الثاني", [q("b1", { presentationType: "fillBlank", fields: [{ id: "f1", kind: "text", correct: "x" }], answer: { mode: "exactSequence", values: ["x"] } }), q("b2")]),
  sec("s3", "الثالث", [])
];

describe("13B model — navigator index", () => {
  it("flattens sections in order with stable ids, section/question order, display number, type, marks, origin and bank metadata", () => {
    const list = indexExamQuestions(exam(three()));
    expect(list.map(e => e.examQuestionId)).toEqual(["a1", "a2", "a3", "b1", "b2"]);
    expect(list.map(e => [e.sectionId, e.sectionIndex, e.questionIndex])).toEqual([["s1", 0, 0], ["s1", 0, 1], ["s1", 0, 2], ["s2", 1, 0], ["s2", 1, 1]]);
    expect(list[1]).toMatchObject({ number: "٢", displayNumber: "٢", presentationType: "shortAnswer", sectionTitle: "الأول", marks: 2, origin: "manual" });
    expect(list[0].number).toBe("1");
    expect(list[2]).toMatchObject({ origin: "bank", bankQuestionId: "BQ-9", sourceQuestionNumber: "17", topic: "SUBNETTING", difficulty: 4 });
    expect(list[3]).toMatchObject({ origin: "manual", bankQuestionId: "", topic: "", difficulty: null });   // no metadata invented
    expect(list.every(e => typeof e.text === "string")).toBe(true);
  });
  it("is cheap: entries carry text previews, never the question objects", () => {
    const list = indexExamQuestions(exam(three()));
    for (const e of list) expect(Object.keys(e)).not.toContain("question");
  });
});

describe("13B model — search + filters", () => {
  const list = indexExamQuestions(exam(three()));
  it("search is case-insensitive, whitespace tolerant, across text / number / topic / bank number / section title", () => {
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, q: "  نص A3 " }).map(e => e.examQuestionId)).toEqual(["a3"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, q: "subnetting" }).map(e => e.examQuestionId)).toEqual(["a3"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, q: "17" }).map(e => e.examQuestionId)).toEqual(["a3"]);   // bank question number
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, q: "٢" }).map(e => e.examQuestionId)).toEqual(["a2"]);    // display number
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, q: "الثاني" }).map(e => e.examQuestionId)).toEqual(["b1", "b2"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, q: "zzz" })).toEqual([]);
  });
  it("filters: section, type, origin, difficulty — combinable; empty filters return the input reference", () => {
    expect(filterNavigatorEntries(list, EMPTY_NAVIGATOR_FILTERS)).toBe(list);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, sectionId: "s2" }).map(e => e.examQuestionId)).toEqual(["b1", "b2"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, type: "fillBlank" }).map(e => e.examQuestionId)).toEqual(["b1"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, origin: "bank" }).map(e => e.examQuestionId)).toEqual(["a3"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, origin: "manual" }).map(e => e.examQuestionId)).toEqual(["a1", "a2", "b1", "b2"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, difficulty: "4" }).map(e => e.examQuestionId)).toEqual(["a3"]);
    expect(filterNavigatorEntries(list, { ...EMPTY_NAVIGATOR_FILTERS, sectionId: "s1", type: "multipleChoice", origin: "bank" }).map(e => e.examQuestionId)).toEqual(["a3"]);
    expect(navigatorFiltersActive(EMPTY_NAVIGATOR_FILTERS)).toBe(false);
    expect(navigatorFiltersActive({ ...EMPTY_NAVIGATOR_FILTERS, q: " " })).toBe(false);
    expect(navigatorFiltersActive({ ...EMPTY_NAVIGATOR_FILTERS, type: "fillBlank" })).toBe(true);
  });
  it("is safe on missing metadata (no text, no title, undefined marks)", () => {
    const bare = indexExamQuestions(exam([{ id: "s", title: "", gradingPolicy: "all", questions: [{ examQuestionId: "x", presentationType: "shortAnswer" } as unknown as BuilderQuestion] }]));
    expect(bare[0]).toMatchObject({ text: "", sectionTitle: "", marks: null, number: "1" });
    expect(filterNavigatorEntries(bare, { ...EMPTY_NAVIGATOR_FILTERS, q: "x" })).toEqual([]);
  });
});

describe("13B model — bulk delete", () => {
  it("removes across sections in one operation; nonexistent ids are ignored; untouched sections keep their reference", () => {
    const s = three();
    const out = bulkDeleteQuestions(s, ["a1", "b2", "ghost"]);
    expect(out.map(ids)).toEqual([["a2", "a3"], ["b1"], []]);
    expect(out[2]).toBe(s[2]);
  });
  it("no-op (empty selection / only ghosts) returns the SAME sections reference", () => {
    const s = three();
    expect(bulkDeleteQuestions(s, [])).toBe(s);
    expect(bulkDeleteQuestions(s, ["ghost"])).toBe(s);
  });
});

describe("13B model — bulk move", () => {
  it("moves selected questions from several sections to the target, appended in global order (section, then question), ids preserved, nothing duplicated", () => {
    const s = three();
    const out = bulkMoveQuestions(s, new Set(["b2", "a1", "a3"]), "s3");
    expect(out.map(ids)).toEqual([["a2"], ["b1"], ["a1", "a3", "b2"]]);
    expect(out[2].questions[0]).toBe(s[0].questions[0]);                            // same question object, same identity
    expect(out.flatMap(ids).sort()).toEqual(["a1", "a2", "a3", "b1", "b2"]);
  });
  it("same-section move re-appends the selected questions at the end of that section", () => {
    const out = bulkMoveQuestions(three(), ["a1"], "s1");
    expect(ids(out[0])).toEqual(["a2", "a3", "a1"]);
  });
  it("no-op: unknown target / empty / ghost ids / already the tail of the target → SAME reference", () => {
    const s = three();
    expect(bulkMoveQuestions(s, ["a1"], "nope")).toBe(s);
    expect(bulkMoveQuestions(s, [], "s3")).toBe(s);
    expect(bulkMoveQuestions(s, ["ghost"], "s3")).toBe(s);
    expect(bulkMoveQuestions(s, ["a2", "a3"], "s1")).toBe(s);                        // already in order at the tail
  });
});

describe("13B model — bulk duplicate", () => {
  it("copies appear right after their originals; fresh question / part / field ids; content preserved; originals untouched; deterministic", () => {
    const s = [sec("s1", "A", [
      q("a1", { presentationType: "fillBlank", fields: [{ id: "f1", kind: "text", correct: "x" }], answer: { mode: "exactSequence", values: ["x"] } }),
      q("a2"),
      q("a3", { presentationType: "compound", parts: [{ id: "p1", type: "multipleChoice", text: "ج", options: [{ text: "1" }, { text: "2" }], fields: [{ id: "pf1", correct: "y" }], answer: { correctOptionIndex: 1 } }], answer: {} })
    ])];
    const out = bulkDuplicateQuestions(s, ["a3", "a1"]);
    const outIds = ids(out[0]);
    expect(outIds).toHaveLength(5);
    expect(outIds[0]).toBe("a1"); expect(outIds[2]).toBe("a2"); expect(outIds[3]).toBe("a3");
    const c1 = out[0].questions[1], c3 = out[0].questions[4];
    expect(c1.examQuestionId).not.toBe("a1"); expect(c3.examQuestionId).not.toBe("a3");
    expect(c1.fields![0].id).not.toBe("f1"); expect(c1.fields![0].correct).toBe("x"); expect(c1.text).toBe("نص a1");
    expect(c3.parts![0].id).not.toBe("p1"); expect(c3.parts![0].fields![0].id).not.toBe("pf1"); expect(c3.parts![0].answer).toEqual({ correctOptionIndex: 1 });
    expect(out[0].questions[0]).toBe(s[0].questions[0]);                              // original object untouched
    expect(new Set(outIds).size).toBe(5);
  });
  it("no-op returns the same reference", () => { const s = three(); expect(bulkDuplicateQuestions(s, ["ghost"])).toBe(s); expect(bulkDuplicateQuestions(s, [])).toBe(s); });
});

describe("13B model — bulk marks", () => {
  it("sets marks on the selected questions only; unselected untouched (same object); no-op when already equal", () => {
    const s = three();
    const out = bulkSetMarks(s, ["a1", "b1"], 5);
    expect(out[0].questions[0].marks).toBe(5); expect(out[1].questions[0].marks).toBe(5);
    expect(out[0].questions[1]).toBe(s[0].questions[1]); expect(out[2]).toBe(s[2]);
    expect(bulkSetMarks(out, ["a1", "b1"], 5)).toBe(out);
  });
  it("validation matches the Builder rule (finite, > 0); invalid values are rejected at the boundary (no mutation)", () => {
    expect(isValidQuestionMarks(1)).toBe(true); expect(isValidQuestionMarks(0.25)).toBe(true);
    for (const bad of [0, -1, NaN, Infinity, "3", null, undefined]) expect(isValidQuestionMarks(bad)).toBe(false);
    const s = three();
    expect(bulkSetMarks(s, ["a1"], NaN)).toBe(s); expect(bulkSetMarks(s, ["a1"], -2)).toBe(s);
  });
});

describe("13B model — selection pruning + bank duplicate detection", () => {
  it("prune drops ids that no longer exist and returns the same Set when nothing changed", () => {
    const e = exam(three());
    const sel = new Set(["a1", "b2"]);
    expect(pruneSelection(sel, e)).toBe(sel);
    const after = exam(bulkDeleteQuestions(e.sections, ["b2"]));
    expect([...pruneSelection(sel, after)]).toEqual(["a1"]);
    expect([...pruneSelection(new Set(["ghost"]), e)]).toEqual([]);
  });
  it("usedBankQuestionIds collects the exact bankQuestionIds present in the exam", () => {
    expect([...usedBankQuestionIds(exam(three()))]).toEqual(["BQ-9"]);
    expect(usedBankQuestionIds(exam([])).size).toBe(0);
  });
});

describe("13B model — bank → structured bridge + insertion", () => {
  const canonical = () => ({
    examQuestionId: "", origin: "bank", bankQuestionId: "791381-2025-q7", sourceId: "791381-2025", sourceQuestionId: "q7", questionNumber: "7",
    section: "INFRASTRUCTURE", topic: "SUBNETTING", secondaryTopics: ["IPV4"], difficulty: 4, difficultyLabel: "صعب", familyKey: "fam-1", hasCLI: false, requiresCalculation: true,
    presentationType: "fillBlank", bankType: "multiField", marks: 0, locked: false, text: "أكمل ____", textHtml: "<p>أكمل ____</p>",
    options: [], fields: [{ id: "f1", label: "الفراغ", kind: "text", correct: "255.255.255.0", order: 1 }], parts: [], answer: { mode: "exactSequence", values: ["255.255.255.0"] }, hint: "",
    wordBank: [], teacherNote: "", aiInstruction: "", wasModified: false,
    image: { exists: true, visible: true, origin: "bank", assets: [{ id: "as1", origin: "bank", blobName: "x.png", contentType: "image/png", dataUrl: "/api/question-image?blob=x.png&exp=1&sig=abc" }], prompt: null },
    history: [], redoStack: []
  });
  it("preserves canonical content + metadata + signed assets, stamps a FRESH examQuestionId and fresh field ids, applies the default marks", () => {
    const b = bankExamQuestionToBuilderQuestion(canonical(), 1.5);
    expect(b.examQuestionId).toMatch(/^q-/); expect(b.examQuestionId).not.toBe("791381-2025-q7");
    expect(b.marks).toBe(1.5);
    expect(b).toMatchObject({ origin: "bank", bankQuestionId: "791381-2025-q7", sourceId: "791381-2025", sourceQuestionId: "q7", questionNumber: "7", topic: "SUBNETTING", secondaryTopics: ["IPV4"], difficulty: 4, familyKey: "fam-1", requiresCalculation: true, presentationType: "fillBlank", text: "أكمل ____", textHtml: "<p>أكمل ____</p>" });
    expect(b.fields![0].id).not.toBe("f1"); expect(b.fields![0].correct).toBe("255.255.255.0");
    expect(b.answer).toEqual({ mode: "exactSequence", values: ["255.255.255.0"] });
    expect(b.image!.assets![0].dataUrl).toBe("/api/question-image?blob=x.png&exp=1&sig=abc");   // the SIGNED asset, untouched
    expect(b.image!.assets![0].origin).toBe("bank");
  });
  it("maps the legacy bank type name `open` to the authorable `shortAnswer` and keeps the canonical answer (grading unchanged)", () => {
    const b = bankExamQuestionToBuilderQuestion({ ...canonical(), presentationType: "open", bankType: "shortAnswer", fields: [], answer: { mode: "anyAccepted", values: ["VLAN"] } }, 1);
    expect(b.presentationType).toBe("shortAnswer");
    expect(b.answer).toEqual({ mode: "anyAccepted", values: ["VLAN"] });
    expect((b as unknown as { bankType: string }).bankType).toBe("shortAnswer");
  });
  it("two conversions of the same bank question never share an examQuestionId; wordBank keeps its choices", () => {
    const a = bankExamQuestionToBuilderQuestion(canonical(), 1), b = bankExamQuestionToBuilderQuestion(canonical(), 1);
    expect(a.examQuestionId).not.toBe(b.examQuestionId);
    const wb = bankExamQuestionToBuilderQuestion({ ...canonical(), presentationType: "wordBank", wordBank: ["OSPF", "RIP"], fields: [{ id: "f1", kind: "select", options: [{ value: "OSPF" }, { value: "RIP" }], correct: "OSPF" }] }, 1);
    expect(wb.wordBank).toEqual(["OSPF", "RIP"]); expect(wb.fields![0].options).toHaveLength(2);
  });
  it("insertQuestionsIntoSection appends to the target in order; missing target or empty batch → SAME reference (no silent fallback)", () => {
    const s = three();
    const n1 = q("n1"), n2 = q("n2");
    const out = insertQuestionsIntoSection(s, "s3", [n1, n2]);
    expect(ids(out[2])).toEqual(["n1", "n2"]); expect(out[0]).toBe(s[0]);
    expect(insertQuestionsIntoSection(s, "deleted-section", [n1])).toBe(s);
    expect(insertQuestionsIntoSection(s, "s3", [])).toBe(s);
    expect(MAX_BANK_SELECT).toBe(50);
  });
});

describe("13B model — ONE operation = ONE history step (through the real 13A history authority)", () => {
  const withHistory = () => openExamHistory(exam(three()));
  it("bulk move of 3 → one undo restores the exact prior sections; redo re-applies", () => {
    const h0 = withHistory();
    const h1 = updateExamHistory(h0, prev => ({ ...prev, sections: bulkMoveQuestions(prev.sections, ["a1", "a3", "b2"], "s3") }));
    expect(h1.past).toHaveLength(1);
    const back = undoExamHistory(h1);
    expect(back.present).toBe(h0.present);
    expect(redoExamHistory(back).present).toBe(h1.present);
  });
  it("bulk delete of 4, bulk duplicate of 2, bulk marks of 5 and a 10-question bank insert are each ONE entry; a no-op adds none", () => {
    let h = withHistory();
    h = updateExamHistory(h, p => ({ ...p, sections: bulkDeleteQuestions(p.sections, ["a1", "a2", "b1", "b2"]) }));
    h = updateExamHistory(h, p => ({ ...p, sections: bulkDuplicateQuestions(p.sections, ["a3"]) }));
    h = updateExamHistory(h, p => ({ ...p, sections: bulkSetMarks(p.sections, p.sections.flatMap(ids), 3) }));
    const batch = Array.from({ length: 10 }, (_, i) => q("n" + i));
    h = updateExamHistory(h, p => ({ ...p, sections: insertQuestionsIntoSection(p.sections, "s2", batch) }));
    expect(h.past).toHaveLength(4);
    expect(h.present!.sections[1].questions).toHaveLength(10);
    const same = updateExamHistory(h, p => ({ ...p, sections: bulkDeleteQuestions(p.sections, ["ghost"]) }));
    expect(same).toBe(h);
    const undone = undoExamHistory(h);
    expect(undone.present!.sections[1].questions).toHaveLength(0);                    // the whole batch gone
    expect(redoExamHistory(undone).present!.sections[1].questions).toHaveLength(10);  // and back
  });
});
