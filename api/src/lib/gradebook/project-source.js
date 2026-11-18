// Class gradebook GB2 (docs/enterprise-class-gradebook-gb.md §4.3) — the evidence of a PROJECT column for one student, from the
// student's project progress document. PURE: the route reads the class's project snapshot and progress documents.
//
// A project grade is a running total: every approved stage adds to it. A partial total is not a final mark, so:
//   no progress document      → none     («—», not counted, never a zero)
//   the project is complete   → final    (the project grade, 0–100, full precision — the same number the project tracker shows)
//   started, not complete     → pending  (not counted; the gradebook's final becomes provisional)
//   anything unreadable       → unclassified (fail closed)
const core = require("../project-tracker/core");
const { buildProjectPerformanceSummary } = require("../project-tracker/performance");
const { projectEvidence, NONE, PENDING, UNCLASSIFIED } = require("./evidence");

function projectEvidenceFromProgress(workDefinition, progressDoc, now) {
  if (progressDoc === null || progressDoc === undefined) return NONE;
  if (typeof progressDoc !== "object" || Array.isArray(progressDoc)) return UNCLASSIFIED;
  try {
    const summary = core.buildStudentSummary(workDefinition, progressDoc, now);
    if (!summary || summary.complete !== true) return PENDING;
    const perf = buildProjectPerformanceSummary(workDefinition, progressDoc, now, summary);
    return projectEvidence(perf.gradePrecise);
  } catch {
    return UNCLASSIFIED;
  }
}

module.exports = { projectEvidenceFromProgress };
