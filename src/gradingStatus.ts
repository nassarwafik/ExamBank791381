// Roadmap #14 — shared FRONTEND grading-status vocabulary. The backend is the sole authority on what a
// result's gradingStatus IS (see api/src/lib/grading-status.js); the frontend only DISPLAYS it. This module
// centralizes the Arabic labels and CSS classes so no React component re-derives the rule from a raw score
// or percentage. Grading status is independent from attempt lifecycle and from a dashboard presentation
// state (dashboardState) — a final previous result stays final even while a new attempt is in progress.

export type GradingStatus = "notSubmitted" | "pendingReview" | "final";
export type DashboardState =
  | "scheduled" | "available" | "inProgress" | "awaitingReview" | "completed" | "closedUnsubmitted";

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
