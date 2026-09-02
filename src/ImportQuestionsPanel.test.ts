import { describe, it, expect } from "vitest";
import { applySectionOverride } from "./ImportQuestionsPanel";
import type { ImportedQuestion } from "./ImportQuestionsPanel";

function question(overrides: Partial<ImportedQuestion> = {}): ImportedQuestion {
  return {
    importedQuestionId: "q1",
    importJobId: "imp-1",
    sourceFileName: "exam.docx",
    pageNumbers: [1],
    questionNumberGuess: "1",
    topic: "OSPF",
    difficulty: 2,
    presentationType: "open",
    confidence: 0.9,
    text: "text",
    options: [],
    hasVisibleAnswer: false,
    answerText: "",
    requiresManualReview: false,
    images: [],
    section: "INFRASTRUCTURE",
    sectionConfidence: 1,
    ...overrides
  };
}

describe("applySectionOverride - the teacher can always change the auto-resolved section", () => {
  it("overrides a section that was auto-resolved with full (1.0) confidence", () => {
    const pool = [question({ section: "INFRASTRUCTURE", sectionConfidence: 1 })];
    const updated = applySectionOverride(pool, "q1", "BASIC");
    expect(updated[0].section).toBe("BASIC");
  });

  it("overrides a section that was left null (low-confidence/unknown topic)", () => {
    const pool = [question({ section: null, sectionConfidence: 0 })];
    const updated = applySectionOverride(pool, "q1", "INFRASTRUCTURE");
    expect(updated[0].section).toBe("INFRASTRUCTURE");
  });

  it("does not touch sectionConfidence or any other field when overriding", () => {
    const pool = [question({ section: "BASIC", sectionConfidence: 0.972, topic: "IP_ADDRESSING" })];
    const updated = applySectionOverride(pool, "q1", "INFRASTRUCTURE");
    expect(updated[0].sectionConfidence).toBe(0.972);
    expect(updated[0].topic).toBe("IP_ADDRESSING");
  });

  it("only updates the targeted question, leaving others in the pool untouched", () => {
    const pool = [question({ importedQuestionId: "q1", section: "BASIC" }), question({ importedQuestionId: "q2", section: "INFRASTRUCTURE" })];
    const updated = applySectionOverride(pool, "q1", "INFRASTRUCTURE");
    expect(updated[0].section).toBe("INFRASTRUCTURE");
    expect(updated[1].section).toBe("INFRASTRUCTURE"); // q2's own original value, unrelated to the override
  });
});
