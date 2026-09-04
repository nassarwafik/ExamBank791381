import { describe, it, expect } from "vitest";
import { toPreviewQuestion } from "./ExamThemePreview";
import type { PreviewSourceQuestion } from "./ExamThemePreview";

function sourceQuestion(overrides: Partial<PreviewSourceQuestion> = {}): PreviewSourceQuestion {
  return {
    examQuestionId: "q1",
    text: "أي بروتوكول لا يضمن التسليم؟",
    marks: 5,
    presentationType: "multipleChoice",
    options: [{ text: "TCP" }, { text: "UDP" }],
    ...overrides
  };
}

describe("toPreviewQuestion - the correct answer must never reach the teacher-facing preview", () => {
  it("never includes an answer field, even if the source object carries one", () => {
    const source = { ...sourceQuestion(), answer: { correctOptionIndex: 1 } } as PreviewSourceQuestion & { answer: unknown };
    const result = toPreviewQuestion(source);
    expect(result).not.toHaveProperty("answer");
  });

  it("preserves every display-relevant field unchanged", () => {
    const source = sourceQuestion({
      textHtml: "<p>...</p>",
      fields: [{ id: "f1", label: "Row 1", order: 0, options: [{ value: "A" }] }],
      wordBank: ["A", "B"],
      image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,x" }] }
    });
    const result = toPreviewQuestion(source);
    expect(result.examQuestionId).toBe("q1");
    expect(result.text).toBe(source.text);
    expect(result.textHtml).toBe("<p>...</p>");
    expect(result.marks).toBe(5);
    expect(result.presentationType).toBe("multipleChoice");
    expect(result.options).toEqual(source.options);
    expect(result.fields).toEqual(source.fields);
    expect(result.wordBank).toEqual(["A", "B"]);
    expect(result.image).toEqual(source.image);
  });

  it("tolerates a question with no options/fields/wordBank/image (legacy/minimal shape)", () => {
    const source = sourceQuestion({ options: undefined, fields: undefined, wordBank: undefined, image: undefined });
    expect(() => toPreviewQuestion(source)).not.toThrow();
  });
});
