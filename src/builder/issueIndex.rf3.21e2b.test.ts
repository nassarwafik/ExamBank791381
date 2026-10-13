// Phase 21E.2 part 2 — Review Fix 3 (owner-listed I-1 / I-3): the two pure helpers behind the summary's focus, checked against the
// REAL canonical validator (validateStructuredExam — never a copy of its rules).
//   issuePart        reads back which compound / composite part a canonical issue names (parity: every issue a broken part adds maps
//                    to that part, at any position — «البند 1» is never «البند 11» — with or without labels / a display number; a
//                    question-level issue maps to none; two parts with the same label are "ambiguous");
//   targetCardIssues the issues of the card a summary entry leads to when a question id is duplicated (after the last DUPLICATE_ID).
//   issuePartFocus   (RR3-1 / RR3-3) WHAT of that part an issue is about: the numbered row the validator names (its own number,
//                    never the part's first row), a row that cannot be located (a table cell / CLI field) → the named list, the part's
//                    rich content, its type, else its answer body; and every form the validator uses to name a composite part.
import { describe, it, expect } from "vitest";
import { validateStructuredExam, type StructuredIssue } from "../examQuality";
import { compositeArabicExam } from "../composite/compositeFixtures";
import { issuePart, issuePartFocus, targetCardIssues } from "./issueIndex";
import type { StructuredExam, BuilderQuestion } from "../examTypes";

type Json = Record<string, unknown>;
const ok = (id: string, label?: string): Json => ({ id, ...(label ? { label } : {}), type: "multipleChoice", text: "اختر", options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
// One defect per shape — legacy body rules and the canonical type seam (Wave-1 types), as a compound part has them.
const BROKEN: Record<string, (id: string, label?: string) => Json> = {
  mcNoOptions: (id, label) => ({ ...ok(id, label), options: [], answer: {} }),
  mcNoAnswer: (id, label) => ({ ...ok(id, label), answer: {} }),
  trueFalseNoAnswer: (id, label) => ({ id, ...(label ? { label } : {}), type: "trueFalse", text: "صح؟" }),
  multiTrueFalseRowNoKey: (id, label) => ({ id, ...(label ? { label } : {}), type: "multiTrueFalse", text: "حدد", fields: [{ id: "r1", statement: "س", kind: "boolean", correct: true }, { id: "r2", statement: "ص", kind: "boolean" }] }),
  matchingIncomplete: (id, label) => ({ id, ...(label ? { label } : {}), type: "matching", text: "طابق", fields: [{ id: "m1", label: "", kind: "select", options: [{ text: "1" }], correct: "1" }], answer: { text: "=1" } }),
  fillBlankNoFields: (id, label) => ({ id, ...(label ? { label } : {}), type: "fillBlank", text: "أكمل" }),
  unknownType: (id, label) => ({ id, ...(label ? { label } : {}), type: "legacyGizmo", text: "؟" }),
  numericNoExpected: (id, label) => ({ id, ...(label ? { label } : {}), type: "numericResponse", questionTypeVersion: 1, text: "كم؟", numeric: { unitRequired: false }, answer: { mode: "tolerance", tolerance: 0.1 } }),
  multipleSelectNoKey: (id, label) => ({ id, ...(label ? { label } : {}), type: "multipleSelect", questionTypeVersion: 1, text: "اختر", options: [{ id: "o1", text: "1" }, { id: "o2", text: "2" }], answer: { correctOptionIds: [], scoring: "partialNoPenalty" } }),
};
const compound = (parts: Json[], extra: Json = {}): BuilderQuestion => ({ examQuestionId: "k", presentationType: "compound", text: "اقرأ ثم أجب", marks: 0, parts, ...extra } as unknown as BuilderQuestion);
const examOf = (...questions: BuilderQuestion[]): StructuredExam => ({ examId: "e", title: "t", sections: [{ id: "s", title: "ق", gradingPolicy: "all", stimuli: {}, questions }] } as unknown as StructuredExam);
const issuesOf = (q: BuilderQuestion) => validateStructuredExam(examOf(q)).filter(i => i.questionId === q.examQuestionId);
const key = (i: StructuredIssue) => i.code + "|" + i.message;

describe("issuePart — a compound part, read back from the canonical issue (parity with validateStructuredExam)", () => {
  for (const [name, broken] of Object.entries(BROKEN)) {
    for (const labelled of [false, true]) for (const displayNumber of [undefined, "7"]) {
      it(name + (labelled ? " · labelled parts" : " · unlabelled") + (displayNumber ? " · displayed «7»" : ""), () => {
        const labels = labelled ? ["أ", "ب", "ج"] : [undefined, undefined, undefined];
        const extra = displayNumber ? { displayNumber } : {};
        const baseline = new Set(issuesOf(compound(labels.map((l, i) => ok("p" + i, l)), extra)).map(key));
        for (const at of [0, 1, 2]) {
          const q = compound(labels.map((l, i) => (i === at ? broken("p" + i, l) : ok("p" + i, l))), extra);
          const issues = issuesOf(q);
          const added = issues.filter(i => !baseline.has(key(i)));
          expect(added.length, name + " adds an issue at part " + (at + 1)).toBeGreaterThan(0);
          for (const i of added) expect(issuePart(i, q), i.code + ": " + i.message).toEqual({ family: "compound", index: at });
          for (const i of issues.filter(x => baseline.has(key(x)))) expect(issuePart(i, q), "question-level " + i.code).toBeNull();
        }
      });
    }
  }
  it("«البند 1» is never «البند 11» (twelve unlabelled parts, parts 1 and 11 broken)", () => {
    const q = compound(Array.from({ length: 12 }, (_, i) => (i === 0 || i === 10 ? BROKEN.mcNoOptions("p" + i) : ok("p" + i))), { marks: 12 });
    const issues = issuesOf(q).filter(i => i.code === "MISSING_OPTIONS");
    expect(issues.map(i => issuePart(i, q))).toEqual([{ family: "compound", index: 0 }, { family: "compound", index: 10 }]);
  });
  it("two parts with the same label cannot be told apart: \"ambiguous\"", () => {
    const q = compound([BROKEN.mcNoOptions("p0", "أ"), BROKEN.mcNoOptions("p1", "أ")]);
    const options = issuesOf(q).filter(i => i.code === "MISSING_OPTIONS");
    expect(options).toHaveLength(2);
    for (const i of options) expect(issuePart(i, q)).toBe("ambiguous");
  });
  it("question-level compound issues name no part: marks, no parts, a duplicated part id, the marks mismatch", () => {
    const dupPart = compound([ok("p0"), ok("p0")], { marks: 2 });
    expect(issuesOf(dupPart).map(i => i.code)).toEqual(["COMPOUND_DUP_PART"]);
    expect(issuePart(issuesOf(dupPart)[0], dupPart)).toBeNull();
    const mismatch = compound([{ ...ok("p0"), marks: 1 } as Json, { ...ok("p1"), marks: 1 } as Json], { marks: 5 });
    expect(issuesOf(mismatch).map(i => i.code)).toEqual(["MARKS_MISMATCH"]);
    expect(issuePart(issuesOf(mismatch)[0], mismatch)).toBeNull();
    const none = compound([]);
    expect(issuesOf(none).map(i => i.code)).toEqual(["MARKS_PROBLEM", "COMPOUND_NO_PARTS"]);
    for (const i of issuesOf(none)) expect(issuePart(i, none)).toBeNull();
  });
  it("a non-part question, a missing question: none", () => {
    const mcq = { examQuestionId: "m", presentationType: "multipleChoice", text: "س", marks: 1, options: [], answer: {} } as unknown as BuilderQuestion;
    for (const i of issuesOf(mcq)) { expect(issuePart(i, mcq)).toBeNull(); expect(issuePart(i, undefined)).toBeNull(); }
  });
});

describe("issuePart — a composite part (its id: the editor's data-part-id)", () => {
  const composite = () => compositeArabicExam().sections[0].questions[0] as unknown as Json & { composite: { groups: { parts: Json[] }[] } };
  const partById = (q: ReturnType<typeof composite>, id: string) => q.composite.groups.flatMap(g => g.parts).find(p => p.id === id)!;
  it("the acceptance fixture is clean; a broken child maps to that child, a question-level issue to none", () => {
    const clean = composite();
    expect(validateStructuredExam(examOf(clean as unknown as BuilderQuestion))).toEqual([]);
    for (const [id, patch] of [["pA1", { options: [], answer: {} }], ["pB3", { answer: { mode: "tolerance", tolerance: 0 } }], ["pA2", { fields: [] }]] as const) {
      const q = composite();
      Object.assign(partById(q, id), patch);
      const issues = validateStructuredExam(examOf(q as unknown as BuilderQuestion)).filter(i => i.questionId === q.examQuestionId);
      expect(issues.length, id).toBeGreaterThan(0);
      const named = issues.filter(i => i.message.includes("«البند "));
      expect(named.length, id + " child issues").toBeGreaterThan(0);
      for (const i of named) expect(issuePart(i, q as unknown as BuilderQuestion), i.message).toEqual({ family: "composite", id });
    }
    const marks = composite();
    marks.marks = 0;
    const issues = validateStructuredExam(examOf(marks as unknown as BuilderQuestion)).filter(i => i.code === "MARKS_PROBLEM");
    expect(issues).toHaveLength(1);
    expect(issuePart(issues[0], marks as unknown as BuilderQuestion)).toBeNull();
  });
});

describe("targetCardIssues — the card a summary entry leads to", () => {
  const pair = (id: string, dn: string, incomplete: number[]) => ({ examQuestionId: id, displayNumber: dn, presentationType: "matching", text: "طابق", marks: 2,
    fields: [0, 1, 2].map(k => ({ id: "m" + k, label: incomplete.includes(k + 1) ? "" : "L" + k, kind: "select", options: [{ text: "1" }], correct: "1" })), answer: { text: "L1=1" } }) as unknown as BuilderQuestion;
  it("no duplicate: the question's own list", () => {
    const issues = validateStructuredExam(examOf(pair("a", "1", [1, 3])));
    expect(targetCardIssues(issues[1], issues)).toBe(issues);
  });
  it("a duplicated id: the issues after the LAST DUPLICATE_ID (the last card's); an earlier card's issue → null", () => {
    const issues = validateStructuredExam(examOf(pair("d", "1", [1]), pair("d", "2", [1, 3]), pair("d", "3", [2]))).filter(i => i.questionId === "d");
    expect(issues.map(i => i.code)).toEqual(["MATCH_INCOMPLETE_PAIR", "DUPLICATE_ID", "MATCH_INCOMPLETE_PAIR", "MATCH_INCOMPLETE_PAIR", "DUPLICATE_ID", "MATCH_INCOMPLETE_PAIR"]);
    const last = issues[5];
    expect(last.message).toMatch(/^الزوج 2 في ««3»»/);
    expect(targetCardIssues(last, issues)).toEqual([last]);
    for (const k of [0, 1, 2, 3, 4]) expect(targetCardIssues(issues[k], issues), "issue " + k).toBeNull();
  });
});

describe("issuePartFocus — what of the part an issue is about (RR3-1 / RR3-3), read from the canonical issue", () => {
  const opts = [{ text: "80" }, { text: "53" }, { text: "443" }];
  const matchingPart: Json = { id: "pm", type: "matching", text: "طابق", answer: { text: "HTTP=80" }, fields: [
    { id: "m1", label: "HTTP", kind: "select", options: opts, correct: "80" }, { id: "m2", label: "DNS", kind: "select", options: opts, correct: "53" },
    { id: "m3", label: "", kind: "select", options: opts, correct: "443" }, { id: "m4", label: "SSH", kind: "select", options: opts, correct: "22" }] };
  const statementsPart: Json = { id: "pt", type: "multiTrueFalse", text: "حدد", fields: [{ id: "t1", statement: "س", kind: "boolean", correct: true }, { id: "t2", statement: "ص", kind: "boolean" }] };
  const blanksPart: Json = { id: "pf", type: "fillBlank", text: "أكمل", wordBank: ["أ", "ب"], fields: [{ id: "f1", label: "x", kind: "select", correct: "أ" }, { id: "f2", label: "y", kind: "select", correct: "" }], answer: { mode: "exactSequence", values: ["أ", ""] } };
  const tablePart: Json = { id: "pb", type: "tableFill", text: "أكمل الجدول", tableHeaders: ["أ", "ب"], tableRows: [["x", ""]], fields: [{ id: "c1", row: 5, column: 0, kind: "text", correct: "1" }] };
  for (const displayNumber of [undefined, "7"]) {
    it("a numbered row is the validator's own number (pair 3, pair 4's answer, statement 2, blank 2) — never row 1" + (displayNumber ? " · displayed «7»" : ""), () => {
      const q = compound([ok("p0"), matchingPart, statementsPart, blanksPart], { marks: 4, ...(displayNumber ? { displayNumber } : {}) });
      const issues = issuesOf(q);
      const of = (code: string, part: number) => issues.filter(i => i.code === code && JSON.stringify(issuePart(i, q)) === JSON.stringify({ family: "compound", index: part }));
      expect(of("MATCH_INCOMPLETE_PAIR", 1).map(i => issuePartFocus(i, q))).toEqual([{ part: { family: "compound", index: 1 }, at: "row", row: 3, answer: false }]);
      expect(of("CORRECT_NOT_IN_CHOICES", 1).map(i => issuePartFocus(i, q))).toEqual([{ part: { family: "compound", index: 1 }, at: "row", row: 4, answer: true }]);
      expect(of("FIELD_NO_CORRECT", 2).map(i => issuePartFocus(i, q))).toEqual([{ part: { family: "compound", index: 2 }, at: "row", row: 2, answer: true }]);
      expect(of("FIELD_NO_CORRECT", 3).map(i => issuePartFocus(i, q))).toEqual([{ part: { family: "compound", index: 3 }, at: "row", row: 2, answer: true }]);
    });
  }
  it("«البند 2 في «البند 1 من …»» — a statement number is never read as another part", () => {
    const q = compound([statementsPart, ok("p1"), ok("p2")], { marks: 3 });
    const [row] = issuesOf(q).filter(i => i.code === "FIELD_NO_CORRECT");
    expect(row.message).toMatch(/^البند 2 في «البند 1 من »/);
    expect(issuePartFocus(row, q)).toEqual({ part: { family: "compound", index: 0 }, at: "row", row: 2, answer: true });
  });
  it("a row issue whose row cannot be located (a table cell; a number-less cell issue) → the named list, never the part's first control", () => {
    const q = compound([ok("p0"), tablePart], { marks: 2 });
    const cell = issuesOf(q).find(i => i.code === "TABLE_BAD_CELL")!;
    expect(cell, JSON.stringify(issuesOf(q).map(i => i.code))).toBeTruthy();
    expect(issuePartFocus(cell, q)).toEqual({ part: { family: "compound", index: 1 }, at: "list" });
  });
  it("the part as a whole → its answer body; an unknown part type → its type select; a question-level issue → none", () => {
    const q = compound([BROKEN.mcNoOptions("p0"), BROKEN.unknownType("p1")]);
    const issues = issuesOf(q);
    expect(issuePartFocus(issues.find(i => i.code === "MISSING_OPTIONS")!, q)).toEqual({ part: { family: "compound", index: 0 }, at: "body" });
    expect(issuePartFocus(issues.find(i => i.code === "UNKNOWN_QUESTION_TYPE")!, q)).toEqual({ part: { family: "compound", index: 1 }, at: "type" });
    expect(issuePartFocus(issues.find(i => i.code === "MARKS_PROBLEM")!, q)).toBeNull();
    const twin = compound([BROKEN.mcNoOptions("p0", "أ"), BROKEN.mcNoOptions("p1", "أ")]);
    expect(issuePartFocus(issuesOf(twin).find(i => i.code === "MISSING_OPTIONS")!, twin)).toBe("ambiguous");
  });
  describe("composite — every form the validator uses to name a part (RR3-1)", () => {
    const composite = () => compositeArabicExam().sections[0].questions[0] as unknown as Json & { composite: { groups: { parts: Json[] }[] } };
    const partById = (q: ReturnType<typeof composite>, id: string) => q.composite.groups.flatMap(g => g.parts).find(p => p.id === id)!;
    const issuesOfQ = (q: ReturnType<typeof composite>) => validateStructuredExam(examOf(q as unknown as BuilderQuestion)).filter(i => i.questionId === q.examQuestionId);
    it("a part's rich content («البند ب من «4» — المحتوى المنسق: …») → that part, at its rich content", () => {
      const q = composite();
      partById(q, "pA2").richContent = { v: 1, blocks: [42] };
      const rich = issuesOfQ(q).filter(i => i.message.includes(" — المحتوى المنسق: "));
      expect(rich.length, JSON.stringify(issuesOfQ(q).map(i => i.code + " " + i.message))).toBeGreaterThan(0);
      for (const i of rich) {
        expect(issuePart(i, q as unknown as BuilderQuestion), i.message).toEqual({ family: "composite", id: "pA2" });
        expect(issuePartFocus(i, q as unknown as BuilderQuestion)).toEqual({ part: { family: "composite", id: "pA2" }, at: "rich" });
      }
    });
    it("an unsupported child version («… نوع البند «ب» أو إصداره غير مدعوم …») → that part, at its type", () => {
      const q = composite();
      partById(q, "pA2").questionTypeVersion = 99;
      const unsupported = issuesOfQ(q).filter(i => i.code === "COMPOSITE_CHILD_TYPE_UNSUPPORTED");
      expect(unsupported.length, JSON.stringify(issuesOfQ(q).map(i => i.code + " " + i.message))).toBeGreaterThan(0);
      for (const i of unsupported) {
        expect(i.message).toContain("البند «ب»");
        expect(issuePartFocus(i, q as unknown as BuilderQuestion)).toEqual({ part: { family: "composite", id: "pA2" }, at: "type" });
      }
    });
  });
});
