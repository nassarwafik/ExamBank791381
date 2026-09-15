// Roadmap #14 — shared FRONTEND grading-status vocabulary. The backend is the sole authority on what a
// result's gradingStatus IS (see api/src/lib/grading-status.js); the frontend only DISPLAYS it. This module
// centralizes the Arabic labels and CSS classes so no React component re-derives the rule from a raw score
// or percentage. Grading status is independent from attempt lifecycle and from a dashboard presentation
// state (dashboardState) — a final previous result stays final even while a new attempt is in progress.

export type GradingStatus = "notSubmitted" | "pendingReview" | "final";
export type DashboardState =
  | "scheduled" | "available" | "inProgress" | "awaitingReview" | "completed" | "closedUnsubmitted";

// The ONE frontend legacy-compatibility resolver. The backend (api/src/lib/grading-status.js) is the sole
// authority for every new payload: when a result carries a valid `gradingStatus` it is returned unchanged.
// This helper exists ONLY so a component that receives an older/cached result WITHOUT gradingStatus derives
// it from the SAME inputs the server uses — manualReviewMarks and finalized — and NEVER from score or
// percentage. All four grading-aware components (StudentPortal, AssignmentsPanel, AssignmentReview,
// StudentExamPage) call this instead of re-implementing the rule.
//
// Semantics (mirrors the canonical server rule):
//   A. a valid server gradingStatus present            => returned unchanged
//   B. no completed result (null/undefined/non-object) => notSubmitted
//   C. legacy result, manualReviewMarks > 0            => pendingReview
//   D. legacy result, finalized === false              => pendingReview
//   E. legacy result, manualReviewMarks <= 0 & finalized === true => final
//   F. legacy result, finalized absent & manualReviewMarks <= 0   => final
// It NEVER inspects score / percentage / latestScore / latestPercentage.
export interface GradingResultLike { gradingStatus?: GradingStatus; manualReviewMarks?: number; finalized?: boolean }
const VALID_GRADING: readonly GradingStatus[] = ["notSubmitted", "pendingReview", "final"];
export function resolveGradingStatus(result: GradingResultLike | null | undefined): GradingStatus {
  if (result && result.gradingStatus && VALID_GRADING.includes(result.gradingStatus)) return result.gradingStatus; // A
  if (!result || typeof result !== "object") return "notSubmitted";                                                 // B
  const manual = Number(result.manualReviewMarks || 0);
  if (Number.isFinite(manual) && manual > 0) return "pendingReview";                                                // C
  if (result.finalized === false) return "pendingReview";                                                           // D
  return "final";                                                                                                   // E / F
}

// Short grading badge label (teacher gradebook / review tabs / student cards).
const GRADING_LABEL: Record<GradingStatus, string> = {
  notSubmitted: "لم يسلّم",
  pendingReview: "بانتظار التصحيح",
  final: "نهائي"
};
export function gradingLabel(s: GradingStatus): string { return GRADING_LABEL[s] || s; }

// CSS modifier class for a grading badge: iex-grade-final / iex-grade-pending / iex-grade-none.
export function gradingClass(s: GradingStatus): string {
  return s === "final" ? "final" : s === "pendingReview" ? "pending" : "none";
}

// The single dashboard-card presentation label (student portal). Mirrors the server dashboardState.
const DASHBOARD_LABEL: Record<DashboardState, string> = {
  scheduled: "قريبًا",
  available: "متاح للحل",
  inProgress: "قيد الحل",
  awaitingReview: "بانتظار مراجعة المعلم",
  completed: "مكتمل",
  closedUnsubmitted: "انتهى دون تسليم"
};
export function dashboardStateLabel(s: DashboardState): string { return DASHBOARD_LABEL[s] || s; }

// How a completed result's SCORE should be worded: provisional vs final. A pending result must NEVER be
// worded as final, and a final result never as provisional.
export function scoreLabel(s: GradingStatus): string {
  return s === "final" ? "العلامة النهائية" : "علامة مؤقتة";
}
