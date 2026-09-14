import { describe, it, expect } from "vitest";
import { resolveGradingStatus } from "./gradingStatus";

// Grading-authority consistency pass — the ONE shared frontend legacy resolver. It mirrors the canonical
// server rule (api/src/lib/grading-status.js) and must NEVER infer grading from score/percentage.
describe("resolveGradingStatus — the single shared frontend resolver", () => {
  it("A: a valid server gradingStatus is returned unchanged", () => {
    expect(resolveGradingStatus({ gradingStatus: "pendingReview", manualReviewMarks: 0, finalized: true })).toBe("pendingReview");
    expect(resolveGradingStatus({ gradingStatus: "final", manualReviewMarks: 5, finalized: false })).toBe("final");
    expect(resolveGradingStatus({ gradingStatus: "notSubmitted" })).toBe("notSubmitted");
  });
  it("B: no completed result (null / undefined) => notSubmitted", () => {
    expect(resolveGradingStatus(null)).toBe("notSubmitted");
    expect(resolveGradingStatus(undefined)).toBe("notSubmitted");
  });
  it("C: legacy final — manualReviewMarks 0, finalized ABSENT, gradingStatus absent => final", () => {
    expect(resolveGradingStatus({ manualReviewMarks: 0 })).toBe("final");
  });
  it("D: legacy pending — finalized === false => pendingReview", () => {
    expect(resolveGradingStatus({ manualReviewMarks: 0, finalized: false })).toBe("pendingReview");
  });
  it("E: manualReviewMarks > 0 with finalized true => pendingReview (manual marks take precedence)", () => {
    expect(resolveGradingStatus({ manualReviewMarks: 3, finalized: true })).toBe("pendingReview");
  });
  it("F: legacy final — manualReviewMarks 0, finalized true => final", () => {
    expect(resolveGradingStatus({ manualReviewMarks: 0, finalized: true })).toBe("final");
  });
  it("never infers from score/percentage: a high-scoring result still pending resolves pending, not final", () => {
    // A provisional result can carry a numeric score; the score must not make it "final".
    expect(resolveGradingStatus({ score: 99, percentage: 99, manualReviewMarks: 12, finalized: false } as never)).toBe("pendingReview");
    // Score present but manual marks outstanding — still pending.
    expect(resolveGradingStatus({ score: 100, percentage: 100, manualReviewMarks: 4 } as never)).toBe("pendingReview");
  });
});
