import { describe, it, expect } from "vitest";
import { normalizeDetectedQuestion, mergeChunkResults } from "../src/lib/import-ai-detect.js";

const topicCodes = new Set(["PRIVATE_PUBLIC_IP", "DHCP", "VLAN"]);

describe("normalizeDetectedQuestion", () => {
  it("passes through a fully valid detected question unchanged", () => {
    const raw = {
      questionNumberGuess: "3",
      topic: "DHCP",
      difficulty: 2,
      presentationType: "multipleChoice",
      text: "What does DHCP stand for?",
      options: [{ value: "a", text: "Dynamic Host Configuration Protocol" }],
      hasVisibleAnswer: true,
      answerText: "a",
      confidence: 0.9
    };
    const result = normalizeDetectedQuestion(raw, { topicCodes });
    expect(result.topic).toBe("DHCP");
    expect(result.difficulty).toBe(2);
    expect(result.presentationType).toBe("multipleChoice");
    expect(result.text).toBe("What does DHCP stand for?");
  });

  it("drops a hallucinated topic to null instead of inventing/accepting it", () => {
    const result = normalizeDetectedQuestion({ topic: "SOME_MADE_UP_TOPIC", text: "x" }, { topicCodes });
    expect(result.topic).toBeNull();
  });

  it("drops an invalid presentationType to null", () => {
    const result = normalizeDetectedQuestion({ presentationType: "essay", text: "x" }, { topicCodes });
    expect(result.presentationType).toBeNull();
  });

  it("drops an out-of-range or non-integer difficulty to null rather than defaulting it", () => {
    expect(normalizeDetectedQuestion({ difficulty: 7, text: "x" }, { topicCodes }).difficulty).toBeNull();
    expect(normalizeDetectedQuestion({ difficulty: 2.5, text: "x" }, { topicCodes }).difficulty).toBeNull();
    expect(normalizeDetectedQuestion({ difficulty: 0, text: "x" }, { topicCodes }).difficulty).toBeNull();
  });

  it("clamps confidence into [0,1]", () => {
    expect(normalizeDetectedQuestion({ confidence: 5, text: "x" }, { topicCodes }).confidence).toBe(1);
    expect(normalizeDetectedQuestion({ confidence: -2, text: "x" }, { topicCodes }).confidence).toBe(0);
  });

  it("never truncates question text", () => {
    const longText = "س".repeat(2000);
    expect(normalizeDetectedQuestion({ text: longText }, { topicCodes }).text.length).toBe(2000);
  });

  it("drops an empty-text option and ignores hasVisibleAnswer's answerText when false", () => {
    const result = normalizeDetectedQuestion(
      { text: "x", options: [{ value: "a", text: "" }, { value: "b", text: "keep" }], hasVisibleAnswer: false, answerText: "should be dropped" },
      { topicCodes }
    );
    expect(result.options).toEqual([{ value: "b", text: "keep" }]);
    expect(result.answerText).toBe("");
  });
});

describe("mergeChunkResults", () => {
  it("assigns sequential importedQuestionIds and carries page metadata across chunks", () => {
    const chunkResults = [
      { pageNumbers: [1], questions: [normalizeDetectedQuestion({ text: "q1" }, { topicCodes })] },
      { pageNumbers: [2, 3], questions: [normalizeDetectedQuestion({ text: "q2" }, { topicCodes })] }
    ];
    const merged = mergeChunkResults("imp-abc", chunkResults);
    expect(merged.map(q => q.importedQuestionId)).toEqual(["imp-abc-1", "imp-abc-2"]);
    expect(merged[1].pageNumbers).toEqual([2, 3]);
  });

  it("skips a question with empty text", () => {
    const chunkResults = [{ pageNumbers: [1], questions: [normalizeDetectedQuestion({ text: "" }, { topicCodes })] }];
    expect(mergeChunkResults("imp-abc", chunkResults)).toHaveLength(0);
  });

  it("flags requiresManualReview when topic, presentationType is null or confidence is low", () => {
    const lowConfidence = normalizeDetectedQuestion({ text: "x", topic: "DHCP", presentationType: "open", confidence: 0.3 }, { topicCodes });
    const unknownTopic = normalizeDetectedQuestion({ text: "x", presentationType: "open", confidence: 0.9 }, { topicCodes });
    const confident = normalizeDetectedQuestion({ text: "x", topic: "DHCP", presentationType: "open", confidence: 0.9 }, { topicCodes });
    const merged = mergeChunkResults("imp-abc", [{ pageNumbers: [1], questions: [lowConfidence, unknownTopic, confident] }]);
    expect(merged[0].requiresManualReview).toBe(true);
    expect(merged[1].requiresManualReview).toBe(true);
    expect(merged[2].requiresManualReview).toBe(false);
  });
});
