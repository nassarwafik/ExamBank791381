import { describe, it, expect } from "vitest";
import { deriveGradingStatus } from "../src/lib/grading-status.js";

// Roadmap #14 — canonical grading-status helper. Read-time only; never mutates input.
describe("deriveGradingStatus (canonical)", () => {
  it("A: no result => notSubmitted", () => {
    expect(deriveGradingStatus(null)).toBe("notSubmitted");
    expect(deriveGradingStatus(undefined)).toBe("notSubmitted");
    expect(deriveGradingStatus("x")).toBe("notSubmitted");
  });
  it("B: manualReviewMarks > 0 => pendingReview (even if finalized true)", () => {
    expect(deriveGradingStatus({ manualReviewMarks: 18, finalized: true })).toBe("pendingReview");
    expect(deriveGradingStatus({ manualReviewMarks: 3, finalized: false })).toBe("pendingReview");
  });
  it("C: finalized false + zero manual marks => pendingReview", () => {
    expect(deriveGradingStatus({ manualReviewMarks: 0, finalized: false })).toBe("pendingReview");
  });
  it("D: finalized true + zero manual marks => final", () => {
    expect(deriveGradingStatus({ manualReviewMarks: 0, finalized: true })).toBe("final");
  });
  it("E: legacy missing finalized + zero manual marks => final", () => {
    expect(deriveGradingStatus({ manualReviewMarks: 0 })).toBe("final");
    expect(deriveGradingStatus({ score: 10, totalMarks: 10, percentage: 100 })).toBe("final");
  });
  it("F: legacy missing finalized + manual marks > 0 => pendingReview", () => {
    expect(deriveGradingStatus({ manualReviewMarks: 5 })).toBe("pendingReview");
  });
  it("does not mutate the input object", () => {
    const r = { manualReviewMarks: 0, finalized: true };
    deriveGradingStatus(r);
    expect(Object.keys(r)).toEqual(["manualReviewMarks", "finalized"]);
  });
});
