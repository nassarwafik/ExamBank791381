import { describe, it, expect } from "vitest";
import { clampInteger, normalizePlan } from "../src/functions/interpret-exam-request.js";

describe("clampInteger", () => {
  it("passes values already within range through unchanged", () => {
    expect(clampInteger(10, 1, 40)).toBe(10);
  });
  it("clamps a value above the max down to the max", () => {
    expect(clampInteger(41, 1, 40)).toBe(40);
    expect(clampInteger(100, 1, 40)).toBe(40);
    expect(clampInteger(1000, 1, 40)).toBe(40);
  });
  it("clamps a value below the min up to the min", () => {
    expect(clampInteger(0, 1, 40)).toBe(1);
    expect(clampInteger(-5, 1, 40)).toBe(1);
  });
  it("falls back to min for non-finite input", () => {
    expect(clampInteger(NaN, 1, 40)).toBe(1);
    expect(clampInteger(undefined, 1, 40)).toBe(1);
  });
});

describe("normalizePlan question-count cap (40 max)", () => {
  const cases = [
    { requested: 10, expected: 10 },
    { requested: 40, expected: 40 },
    { requested: 41, expected: 40 },
    { requested: 100, expected: 40 },
    { requested: 1000, expected: 40 }
  ];

  for (const { requested, expected } of cases) {
    it(`totalQuestions=${requested} -> effective ${expected}`, () => {
      const plan = normalizePlan({ totalQuestions: requested }, "test prompt");
      expect(plan.totalQuestions).toBe(expected);
    });
  }

  it("preserves the raw requestedQuestionCount even when it exceeds 40", () => {
    const plan = normalizePlan({ totalQuestions: 40, requestedQuestionCount: 100 }, "أنشئ امتحان من 100 سؤال");
    expect(plan.totalQuestions).toBe(40);
    expect(plan.requestedQuestionCount).toBe(100);
  });

  it("defaults requestedQuestionCount to the effective count when the AI didn't report one", () => {
    const plan = normalizePlan({ totalQuestions: 10 }, "10 أسئلة");
    expect(plan.requestedQuestionCount).toBe(10);
  });
});
