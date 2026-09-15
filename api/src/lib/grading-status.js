// Roadmap #14 — the ONE canonical, server-side grading-status helper. Grading status answers "is this
// completed attempt's mark final or still awaiting the teacher?" and is DELIBERATELY separate from the
// attempt LIFECYCLE (notStarted/started/draft/submitted/timedOut in assignment-availability). A student
// can simultaneously have a FINAL previous result AND a newly-started active attempt — the two dimensions
// never overwrite each other. timedOut is an END REASON, never a grading status.
//
// Canonical values: "notSubmitted" | "pendingReview" | "final".
//
// Rules (read-time only — NEVER migrates or mutates stored submissions):
//   - no result                                  => notSubmitted
//   - manualReviewMarks > 0                       => pendingReview
//   - finalized === false                         => pendingReview
//   - finalized === true AND manualReviewMarks<=0 => final
//   - LEGACY (finalized absent): manualReviewMarks>0 => pendingReview, else => final
//
// `result` is a completed-attempt object (or the latest result), or null/undefined when the student has
// no completed attempt.
function deriveGradingStatus(result) {
  if (!result || typeof result !== "object") return "notSubmitted";
  const manual = Number(result.manualReviewMarks || 0);
  if (Number.isFinite(manual) && manual > 0) return "pendingReview";
  // finalized may be absent on legacy results — treat "no pending manual marks" as final in that case.
  if (result.finalized === false) return "pendingReview";
  return "final";
}

module.exports = { deriveGradingStatus };
