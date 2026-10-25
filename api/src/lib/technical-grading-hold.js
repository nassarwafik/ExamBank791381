// QA-9 — the ONE rule for "this completed attempt's mark is still provisional for a TECHNICAL reason". Teacher analytics use it
// to keep such a mark out of every average, extreme, distribution band, trend and follow-up reason (AGENTS.md §10: never
// manufacture a failing grade because of an infrastructure failure). The attempt stays a submission and stays pending review.
//
// True only while the canonical grading status is still "pendingReview" AND at least one of:
//   - official coding execution that can still change the mark is open (autoGradingPending: pending / dispatched / retryable, or
//     a corrupt target — fail safe; a well-formed compile-error review or a teacher-marked question is not open);
//   - a question held for a render failure (Phase 21E.3) has not been marked by the teacher yet (its grade is still manualReview,
//     or the attempt has no grade for it — fail safe).
// An attempt pending only for an ordinary manual review (an essay the teacher has not marked) is NOT technical: its partial
// score keeps counting, as Roadmap #23 pins. Read-time only — never mutates the attempt.
const { deriveGradingStatus } = require("./grading-status");
const { autoGradingPending } = require("./coding/official-grading");

const isObj = value => !!value && typeof value === "object" && !Array.isArray(value);

function renderHoldOpen(attempt) {
  if (!isObj(attempt.renderFailures)) return false;
  const grades = Array.isArray(attempt.questionGrades) ? attempt.questionGrades : [];
  return Object.entries(attempt.renderFailures).some(([questionId, record]) => {
    if (!isObj(record) || record.held !== true) return false;
    const grade = grades.find(g => isObj(g) && String(g.questionId) === questionId);
    return !grade || grade.manualReview === true;
  });
}

function technicalGradingPending(attempt) {
  if (!isObj(attempt) || deriveGradingStatus(attempt) !== "pendingReview") return false;
  return autoGradingPending(attempt) || renderHoldOpen(attempt);
}

module.exports = { technicalGradingPending };
