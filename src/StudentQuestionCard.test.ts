import { describe, it, expect } from "vitest";
import { qid, typeOf, answered, tableCheckbox, getWordBank } from "./StudentQuestionCard";
import type { Question, Answer } from "./StudentQuestionCard";

// Regression guard for the mechanical extraction out of StudentExamPage.tsx - these helpers must
// keep behaving exactly as they did before the move, since StudentExamPage.tsx, ExamThemePreview.tsx,
// and the parent's done/pct progress calculation all depend on them unchanged.

function question(overrides: Partial<Question> = {}): Question {
  return { examQuestionId: "q1", text: "نص السؤال", marks: 5, ...overrides };
}

describe("qid", () => {
  it("prefers examQuestionId, then id, then number, then the 1-based index", () => {
    expect(qid(question({ examQuestionId: "eq1" }), 0)).toBe("eq1");
    expect(qid(question({ examQuestionId: undefined, id: "legacy-id" }), 0)).toBe("legacy-id");
    expect(qid(question({ examQuestionId: undefined, id: undefined, number: 7 }), 0)).toBe("7");
    expect(qid(question({ examQuestionId: undefined, id: undefined, number: undefined }), 2)).toBe("3");
  });
});

describe("typeOf", () => {
  it("lowercases presentationType", () => {
    expect(typeOf(question({ presentationType: "multipleChoice" }))).toBe("multiplechoice");
  });
  it("falls back to type when presentationType is absent", () => {
    expect(typeOf(question({ presentationType: undefined, type: "wordBank" }))).toBe("wordbank");
  });
  it("returns empty string when neither is present", () => {
    expect(typeOf(question({ presentationType: undefined, type: undefined }))).toBe("");
  });
});

describe("answered", () => {
  it("returns false for undefined", () => {
    expect(answered(undefined)).toBe(false);
  });
  it("choice: answered only when index is a valid integer", () => {
    expect(answered({ kind: "choice", index: 0 } as Answer)).toBe(true);
    expect(answered({ kind: "choice", index: NaN } as Answer)).toBe(false);
  });
  it("text: answered only when trimmed value is non-empty", () => {
    expect(answered({ kind: "text", value: "  " } as Answer)).toBe(false);
    expect(answered({ kind: "text", value: "hi" } as Answer)).toBe(true);
  });
  it("table: a checked (true) checkbox counts as answered, unchecked (false) does not", () => {
    expect(answered({ kind: "table", values: [true] } as Answer)).toBe(true);
    expect(answered({ kind: "table", values: [false] } as Answer)).toBe(false);
  });
  it("table: an empty string value does not count as answered", () => {
    expect(answered({ kind: "table", values: [""] } as Answer)).toBe(false);
  });
  it("sequence: at least one non-empty value counts as answered", () => {
    expect(answered({ kind: "sequence", values: ["", "x"] } as Answer)).toBe(true);
    expect(answered({ kind: "sequence", values: ["", ""] } as Answer)).toBe(false);
  });
});

describe("tableCheckbox", () => {
  it("detects the legacy checkbox-style Arabic phrasing", () => {
    expect(tableCheckbox(question({ text: "وضع علامة أمام الشبكات الخاصة" }))).toBe(true);
  });
  it("detects the check-mark symbol", () => {
    expect(tableCheckbox(question({ text: "✓ صنّف كل عنوان" }))).toBe(true);
  });
  it("returns false for plain table questions with no checkbox phrasing", () => {
    expect(tableCheckbox(question({ text: "صنّف صلاحية العناوين التالية" }))).toBe(false);
  });
});

describe("getWordBank", () => {
  it("collects unique values from the question's own wordBank array", () => {
    expect(getWordBank(question({ wordBank: ["OSPF", "RIP", "OSPF"] }))).toEqual(["OSPF", "RIP"]);
  });
  it("collects values from field.options when no wordBank is present", () => {
    const q = question({ fields: [{ options: [{ text: "A" }, { label: "B" }] }] });
    expect(getWordBank(q)).toEqual(["A", "B"]);
  });
  it("drops the placeholder '— اختر —' value", () => {
    const q = question({ wordBank: ["— اختر —", "Real Value"] });
    expect(getWordBank(q)).toEqual(["Real Value"]);
  });
  it("falls back to top-level options only for wordBank-type questions with no other source", () => {
    const q = question({ presentationType: "wordBank", options: [{ value: "X" }] });
    expect(getWordBank(q)).toEqual(["X"]);
  });
  it("does not fall back to top-level options for non-wordBank question types", () => {
    const q = question({ presentationType: "open", options: [{ value: "X" }] });
    expect(getWordBank(q)).toEqual([]);
  });
});
