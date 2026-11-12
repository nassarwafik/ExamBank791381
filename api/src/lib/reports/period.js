// Reports R-6 (owner decision D-2, docs/enterprise-reports-period-r6.md) — the ONE date of an assessment for the Reports Center:
// the day it was PUBLISHED to its students. Every assessment report uses it for the same four things, so they cannot disagree:
// which period the assessment belongs to, the date shown beside it, its place in the order, and its month in the hub's trend.
//
// An assessment published before the stamp existed carries none; it keeps its CREATION date — the documented fallback of D-2.
// Nothing stored is rewritten and no date is guessed. `periodBasis` tells the client how many assessments of a reply are dated
// that way, so the screen can say so instead of presenting a creation date as a publication date.
// Pure: no storage, no clock.
const { publishedAtOf } = require("../assignment-lifecycle");
const { inRange } = require("./date-range");

const PERIOD_CRITERION = "publishedAt";

// The ISO instant the reports date an assessment by: its publication, else its creation ("" when it has neither).
function assessmentDate(assignment) {
  return publishedAtOf(assignment) || String((assignment && assignment.createdAt) || "");
}

// True when the assessment has no publication stamp and is therefore dated by its creation.
function datedByCreation(assignment) {
  return !publishedAtOf(assignment);
}

// Oldest first by the assessment date; assessments of the same instant keep their creation order (stable for older data, where
// the two dates are the same thing).
function byAssessmentDate(a, b) {
  return assessmentDate(a).localeCompare(assessmentDate(b)) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
}

// The assessments of a list that fall in the range (an empty range keeps them all; an assessment with no usable date is left
// out of any non-empty range — date-range's own rule).
function inPeriod(assignments, range) {
  return assignments.filter(a => inRange(assessmentDate(a), range));
}

// What a reply says about its dates: the criterion, and how many of ITS assessments fell back to the creation date.
function periodBasis(assignments) {
  return { criterion: PERIOD_CRITERION, byCreation: assignments.filter(datedByCreation).length };
}

module.exports = { PERIOD_CRITERION, assessmentDate, datedByCreation, byAssessmentDate, inPeriod, periodBasis };
