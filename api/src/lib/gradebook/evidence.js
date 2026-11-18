// Class gradebook GB1 (docs/enterprise-class-gradebook-gb.md §4.3) — the EVIDENCE of one student for one gradebook item, read from its
// source. PURE: the route reads the documents; these functions only classify what they are given.
//
// Evidence is one of:
//   { kind: "final", percent }   a mark that counts (0–100, full precision)
//   { kind: "pending" }          a result awaiting the teacher or automatic grading — it never counts
//   { kind: "none" }             nothing submitted / no mark yet — it never counts, and it is never a zero
//   { kind: "missingSource" }    the item's source no longer exists — never a zero
//   { kind: "unclassified" }     anything that cannot be classified with certainty — fail closed, never a mark
const { deriveGradingStatus } = require("../grading-status");
const { autoGradingPending } = require("../coding/official-grading");

const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const NONE = Object.freeze({ kind: "none" });
const PENDING = Object.freeze({ kind: "pending" });
const MISSING_SOURCE = Object.freeze({ kind: "missingSource" });
const UNCLASSIFIED = Object.freeze({ kind: "unclassified" });

/** A percent in [0, 100], or null. */
function percentOrNull(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * The evidence of an assignment / exam item from the student's submission document (or null when the student has none).
 * Owner decision D1: the LATEST completed attempt counts — the one the assignment gradebook shows. Its stored score already carries any
 * late deduction (late-policy.js). The percent is computed from score / totalMarks at full precision; the stored, rounded percentage
 * is used only when the marks are absent.
 */
function assignmentEvidence(submission) {
  if (submission === null || submission === undefined) return NONE;
  if (!isPlainObject(submission)) return UNCLASSIFIED;
  if (submission.attempts === undefined) return NONE;
  if (!Array.isArray(submission.attempts)) return UNCLASSIFIED;
  if (!submission.attempts.length) return NONE;
  const latest = submission.attempts[submission.attempts.length - 1];
  if (!isPlainObject(latest)) return UNCLASSIFIED;
  if (autoGradingPending(latest)) return PENDING;
  const status = deriveGradingStatus(latest);
  if (status === "pendingReview") return PENDING;
  if (status !== "final") return UNCLASSIFIED;
  const score = latest.score, total = latest.totalMarks;
  if (typeof score === "number" && typeof total === "number" && Number.isFinite(score) && Number.isFinite(total) && total > 0) {
    if (score < 0 || score > total) return UNCLASSIFIED;
    return { kind: "final", percent: (score / total) * 100 };
  }
  const p = percentOrNull(latest.percentage);
  return p === null ? UNCLASSIFIED : { kind: "final", percent: p };
}

/**
 * The evidence of a project item: the project grade (0–100) the project tracker computes for the student, or null when the student has
 * no project record. `available === false` means the project is no longer one of the class's projects (a missing source).
 */
function projectEvidence(grade, { available = true } = {}) {
  if (available !== true) return MISSING_SOURCE;
  if (grade === null || grade === undefined) return NONE;
  const p = percentOrNull(grade);
  return p === null ? UNCLASSIFIED : { kind: "final", percent: p };
}

/** The evidence of a manual column from the teacher's typed score (or null / undefined when nothing was typed). */
function manualEvidence(score, maxScore) {
  if (score === null || score === undefined) return NONE;
  if (!Number.isInteger(maxScore) || maxScore < 1) return UNCLASSIFIED;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > maxScore) return UNCLASSIFIED;
  return { kind: "final", percent: (score / maxScore) * 100 };
}

module.exports = { assignmentEvidence, projectEvidence, manualEvidence, NONE, PENDING, MISSING_SOURCE, UNCLASSIFIED };
