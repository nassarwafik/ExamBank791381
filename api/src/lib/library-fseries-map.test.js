import { describe, it, expect } from "vitest";
import { mapQCard } from "./library-fseries-map.js";

const opts = { examId: "LIB-F01", ordinal: 1, marks: 2 };

describe("mapQCard - radioGroup", () => {
  const card = { id: "q1", text: "س", field: { kind: "radioGroup", name: "q1", options: [{ value: "a", text: "A" }, { value: "b", text: "B" }] } };

  it("maps to multipleChoice with correctOptionIndex when the key matches an option value", () => {
    const q = mapQCard(card, { ...opts, answerMap: new Map([["q1", "b"]]) });
    expect(q.presentationType).toBe("multipleChoice");
    expect(q.answer).toEqual({ correctOptionIndex: 1 });
    expect(q.requiresManualReview).toBe(false);
  });

  it("flags manual review (empty answer) when there is no key for it", () => {
    const q = mapQCard(card, { ...opts, answerMap: new Map() });
    expect(q.presentationType).toBe("multipleChoice");
    expect(q.answer).toEqual({});
    expect(q.requiresManualReview).toBe(true);
  });

  it("flags manual review when the key value matches no visible option", () => {
    const q = mapQCard(card, { ...opts, answerMap: new Map([["q1", "z"]]) });
    expect(q.requiresManualReview).toBe(true);
  });
});

describe("mapQCard - singleText maps to open (not fillBlank) graded by answer.text", () => {
  const card = { id: "q3", text: "حوّل:", field: { kind: "singleText", fieldId: "q3" } };

  it("uses presentationType open so StudentQuestionCard renders a textarea, not a word-bank dropdown", () => {
    const q = mapQCard(card, { ...opts, answerMap: new Map([["q3", "202"]]) });
    expect(q.presentationType).toBe("open");
    expect(q.answer).toEqual({ text: "202" });
  });
});

describe("mapQCard - controlTable maps to a gradeTable-compatible matching question", () => {
  const card = {
    id: "q5", text: "اربط:",
    field: { kind: "controlTable", rows: [
      { label: "DNS", controlId: "q5_dns", kind: "select", options: ["تحويل الأسماء", "نقل الملفات"] },
      { label: "FTP", controlId: "q5_ftp", kind: "select", options: ["تحويل الأسماء", "نقل الملفات"] }
    ] }
  };

  it("builds a markdown table in text, fields per row, and answer.text as label=value pairs", () => {
    const q = mapQCard(card, { ...opts, answerMap: new Map([["q5_dns", "تحويل الأسماء"], ["q5_ftp", "نقل الملفات"]]) });
    expect(q.presentationType).toBe("matching");
    expect(q.text).toContain("| DNS |");
    expect(q.fields).toHaveLength(2);
    expect(q.answer.text).toBe("DNS=تحويل الأسماء؛ FTP=نقل الملفات");
    expect(q.requiresManualReview).toBe(false);
  });

  it("flags manual review when any row is missing its key (never partially grades a table)", () => {
    const q = mapQCard(card, { ...opts, answerMap: new Map([["q5_dns", "تحويل الأسماء"]]) });
    expect(q.requiresManualReview).toBe(true);
    expect(q.answer).toEqual({});
  });
});

describe("mapQCard - unrecognized/multi-part shapes are kept as open + manual review, never dropped", () => {
  it("preserves the question text and flags it", () => {
    const card = { id: "q4", text: "سؤال متعدد الفراغات", field: null };
    const q = mapQCard(card, { ...opts, answerMap: new Map() });
    expect(q.presentationType).toBe("open");
    expect(q.text).toBe("سؤال متعدد الفراغات");
    expect(q.requiresManualReview).toBe(true);
  });
});
