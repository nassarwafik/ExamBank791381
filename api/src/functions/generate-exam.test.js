import { describe, it, expect } from "vitest";
import { selectQuestions } from "./generate-exam.js";

function makeCandidate(id, overrides = {}) {
  return {
    id,
    sourceId: "src-" + id,
    section: "BASIC",
    topic: "PRIVATE_PUBLIC_IP",
    difficulty: 2,
    type: "multipleChoice",
    needsReview: false,
    reviewStatus: "ok",
    ...overrides
  };
}

function minimalPlan(overrides = {}) {
  return {
    totalQuestions: 10,
    sectionTargets: { BASIC: 0, INFRASTRUCTURE: 0 },
    difficultyTargets: {},
    topicTargets: [],
    typeTargets: {},
    minimums: {},
    rules: {},
    excludedTopics: [],
    ...overrides
  };
}

describe("selectQuestions - absolute 40-question cap (defense in depth)", () => {
  it("never returns more than 40 questions even if the plan claims far more, when called directly", () => {
    const bank = Array.from({ length: 200 }, (_, i) => makeCandidate("q" + i));
    const result = selectQuestions(bank, minimalPlan({ totalQuestions: 1000 }));
    expect(result.selected.length).toBe(40);
  });

  it("caps a plan of exactly 41 down to 40", () => {
    const bank = Array.from({ length: 60 }, (_, i) => makeCandidate("q" + i));
    const result = selectQuestions(bank, minimalPlan({ totalQuestions: 41 }));
    expect(result.selected.length).toBe(40);
  });

  it("honors a request under the cap exactly (10 requested -> 10 selected)", () => {
    const bank = Array.from({ length: 20 }, (_, i) => makeCandidate("q" + i));
    const result = selectQuestions(bank, minimalPlan({ totalQuestions: 10 }));
    expect(result.selected.length).toBe(10);
  });
});

describe("selectQuestions - strict topic restriction never substitutes an unrequested topic", () => {
  it("throws instead of filling the count from an excluded topic when the allowed topic is scarce", () => {
    const bank = [
      makeCandidate("ip1", { topic: "PRIVATE_PUBLIC_IP" }),
      makeCandidate("ip2", { topic: "PRIVATE_PUBLIC_IP" }),
      makeCandidate("ip3", { topic: "PRIVATE_PUBLIC_IP" }),
      // 20 VLAN questions available - a buggy implementation could "top up" from these.
      ...Array.from({ length: 20 }, (_, i) => makeCandidate("vlan" + i, { topic: "VLAN" }))
    ];
    const plan = minimalPlan({
      totalQuestions: 10,
      excludedTopics: ["VLAN"],
      topicTargets: [{ topic: "PRIVATE_PUBLIC_IP", count: 10 }]
    });
    expect(() => selectQuestions(bank, plan)).toThrow(/Not enough eligible bank questions/);
  });

  it("succeeds and never includes an excluded topic when enough of the allowed topic exists", () => {
    const bank = [
      ...Array.from({ length: 10 }, (_, i) => makeCandidate("ip" + i, { topic: "PRIVATE_PUBLIC_IP" })),
      ...Array.from({ length: 20 }, (_, i) => makeCandidate("vlan" + i, { topic: "VLAN" }))
    ];
    const plan = minimalPlan({
      totalQuestions: 10,
      excludedTopics: ["VLAN"],
      topicTargets: [{ topic: "PRIVATE_PUBLIC_IP", count: 10 }]
    });
    const result = selectQuestions(bank, plan);
    expect(result.selected).toHaveLength(10);
    expect(result.selected.every(item => item.topic === "PRIVATE_PUBLIC_IP")).toBe(true);
  });
});

describe("selectQuestions - allowedDifficulties/allowedTypes are hard filters", () => {
  it("only ever selects questions matching the allowed difficulty and type, never substituting others", () => {
    const bank = [
      ...Array.from({ length: 5 }, (_, i) => makeCandidate("match" + i, { difficulty: 1, type: "multipleChoice" })),
      ...Array.from({ length: 20 }, (_, i) => makeCandidate("wrongDiff" + i, { difficulty: 2, type: "multipleChoice" })),
      ...Array.from({ length: 20 }, (_, i) => makeCandidate("wrongType" + i, { difficulty: 1, type: "shortAnswer" }))
    ];
    const plan = minimalPlan({
      totalQuestions: 5,
      allowedDifficulties: [1],
      allowedTypes: ["multipleChoice"]
    });
    const result = selectQuestions(bank, plan);
    expect(result.selected).toHaveLength(5);
    for (const item of result.selected) {
      expect(item.difficulty).toBe(1);
      expect(item.type).toBe("multipleChoice");
    }
  });

  it("throws rather than picking a wrong-difficulty/type question when the strict pool is too small", () => {
    const bank = [
      makeCandidate("only-one", { difficulty: 1, type: "multipleChoice" }),
      ...Array.from({ length: 20 }, (_, i) => makeCandidate("plenty" + i, { difficulty: 2, type: "open" }))
    ];
    const plan = minimalPlan({
      totalQuestions: 5,
      allowedDifficulties: [1],
      allowedTypes: ["multipleChoice"]
    });
    expect(() => selectQuestions(bank, plan)).toThrow(/Not enough eligible bank questions/);
  });
});
