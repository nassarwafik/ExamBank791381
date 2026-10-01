// Phase 17C — the ONE canonical attempt-score rebuild. Extracted verbatim from assignment-review.js (Phase 2 manual review) so
// that EVERY authority that changes a completed attempt's question grades — the teacher's manual review and the automatic coding
// grading callback — recomputes the official totals with the same algorithm (no second total-score implementation; parity-tested
// against the original in api/tests/coding-guards-17c.test.js).
//   • a teacher manual override always wins over the stored (automatic or manual-review) base grade, clamped to the EFFECTIVE
//     (counted) max, so a firstN-excluded answer can never be awarded marks;
//   • section-cap-aware totals (capScore / firstNAnswered) when the attempt was graded structured; legacy flat sum otherwise;
//   • manualReviewMarks = the counted marks of questions still awaiting review; finalized = nothing left to review.
const { sectionCappedScore, effectiveMaxMarks } = require("./exam-structure");

function round(n) { return Number(Number(n || 0).toFixed(2)); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, Number(v) || 0)); }

/** Mutates and returns `attempt` with its questionGrades / score / manualReviewMarks / totalMarks / percentage / finalized rebuilt. */
function rebuildAttemptGrades(attempt) {
  const grades = Array.isArray(attempt.questionGrades) ? attempt.questionGrades : [], overrides = attempt.manualOverrides && typeof attempt.manualOverrides === "object" ? attempt.manualOverrides : {};
  let remaining = 0; const scoreById = new Map();
  attempt.questionGrades = grades.map(g => {
    const id = String(g.questionId || ""), o = overrides[id], cap = effectiveMaxMarks(g);
    if (o && o.score !== undefined && o.score !== null) { const s = clamp(o.score, 0, cap); scoreById.set(id, s); return { ...g, score: round(s), manualScore: round(s), manualReview: false, reviewed: true, teacherComment: String(o.comment || "") }; }
    const s = Number(g.score || 0); scoreById.set(id, s); if (g.manualReview) remaining += cap; return { ...g, reviewed: !g.manualReview };
  });
  let score; const sections = Array.isArray(attempt.sections) ? attempt.sections : null;
  if (sections && sections.length) { score = sectionCappedScore(sections, id => scoreById.get(id) || 0); }
  else { score = 0; for (const s of scoreById.values()) score += s; }
  attempt.score = round(score); attempt.manualReviewMarks = round(remaining); attempt.totalMarks = round(attempt.totalMarks); attempt.percentage = attempt.totalMarks ? round(attempt.score / attempt.totalMarks * 100) : 0; attempt.finalized = remaining === 0;
  return attempt;
}

module.exports = { rebuildAttemptGrades, round, clamp };
