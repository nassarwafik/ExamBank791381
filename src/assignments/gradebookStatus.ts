// Phase 21G.4 — ONE status per student in the gradebook (it showed a lifecycle badge AND a grading badge side by side). Grading comes
// first, through the shared resolver (a final result stays final while a newer attempt runs); a student with no graded result is
// described by their live attempt, if any. The lifecycle is kept as a short note only when it says something the status does not
// («انتهى الوقت», «أنهى المعلم المحاولة», or a live attempt beside a grade). Never derived from a score or a percentage.
import { gradingClass, gradingLabel, type GradingStatus } from "../gradingStatus";
import { LIFECYCLE_LABEL, type StudentResult } from "./types";

export type StudentStatusKey = "final" | "pendingReview" | "active" | "paused" | "notSubmitted";
export type StudentStatus = { key: StudentStatusKey; label: string; tone: "success" | "warn" | "info" | "neutral"; className: string; note: string | null };

const QUIET_LIFECYCLE = new Set(["submitted", "notStarted"]), LIVE_LIFECYCLE = new Set(["started", "draft", "paused"]);

export function studentStatus(s: StudentResult, gs: GradingStatus): StudentStatus {
  const lifecycle = s.attemptStatus ? LIFECYCLE_LABEL[s.attemptStatus] || s.attemptStatus : "";
  const note = s.attemptStatus && !QUIET_LIFECYCLE.has(s.attemptStatus) ? lifecycle : null;
  if (gs === "final") return { key: "final", label: gradingLabel(gs), tone: "success", className: "review-state " + gradingClass(gs), note };
  if (gs === "pendingReview") {
    const marks = s.latestResult && s.latestResult.manualReviewMarks > 0 ? " (" + s.latestResult.manualReviewMarks + " ع.)" : "";
    return { key: "pendingReview", label: gradingLabel(gs) + marks, tone: "warn", className: "review-state " + gradingClass(gs), note };
  }
  if (s.activeAttempt) {
    const paused = s.activeAttempt.status === "paused" || s.attemptStatus === "paused";
    const live = paused ? "paused" : s.attemptStatus && LIVE_LIFECYCLE.has(s.attemptStatus) ? s.attemptStatus : "started";
    return { key: paused ? "paused" : "active", label: LIFECYCLE_LABEL[live], tone: paused ? "warn" : "info", className: "lifecycle-badge lifecycle-" + live, note: null };
  }
  return { key: "notSubmitted", label: gradingLabel("notSubmitted"), tone: "neutral", className: "review-state none", note };
}
