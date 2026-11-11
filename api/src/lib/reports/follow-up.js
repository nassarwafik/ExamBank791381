// Phase R-5c — «طلاب يحتاجون متابعة»: which students of a class the teacher should look at, and WHY, by the owner's decision
// (option «أ», docs/enterprise-reports-follow-up-r5c.md): no pass mark and no fixed grade threshold — a student is compared with
// their own class. A student is listed when AT LEAST ONE reason holds, and every reason is named with its number:
//   missing     — did not hand in MISSING_AT_LEAST or more of the period's assessments;
//   belowClass  — their average of FINAL results is BELOW_CLASS_BY points or more under the class average;
//   project     — late in a project of the class, by the class's own setting (the «المتأخرون» report's rule, unchanged).
// Grading safety (AGENTS.md §10): a result awaiting the teacher counts against nobody — it is neither «missing» nor part of an
// average; a student with no final result has no average and is never «below the class»; a class with no average flags nobody
// as below it. Pure and storage-free: the reports function hands it what the class report already read.
const { round1 } = require("./aggregate");

const FOLLOW_UP_CRITERIA = Object.freeze({ missingAtLeast: 2, belowClassBy: 15 });

const finite = n => typeof n === "number" && Number.isFinite(n);

// The ACADEMIC reasons of one standing ({ average, missing }) against the class average (null when the class has none).
function academicReasons(standing, classAverage, criteria = FOLLOW_UP_CRITERIA) {
  const reasons = [];
  if (finite(standing.missing) && standing.missing >= criteria.missingAtLeast) reasons.push({ code: "missing", count: standing.missing });
  if (finite(standing.average) && finite(classAverage)) {
    const gap = round1(classAverage - standing.average);
    if (gap >= criteria.belowClassBy) reasons.push({ code: "belowClass", gap });
  }
  return reasons;
}

// How many students of a class have an academic reason (the hub overview's count: it reads no project).
function academicFollowUpCount(standings, classAverage, criteria = FOLLOW_UP_CRITERIA) {
  return standings.filter(s => academicReasons(s, classAverage, criteria).length > 0).length;
}

// The «المتأخرون» rule for ONE student's project summary, as that report words it (P-5b: a never-started student has the one
// reason «لم يبدأ بعد»). Shared by the delayed report and the follow-up list, so the two can never disagree.
function projectDelayReasons(summary, cfg = {}) {
  const lateThreshold = Number.isFinite(Number(cfg.lateThreshold)) ? Number(cfg.lateThreshold) : 40;
  const reasons = [];
  if (summary.notStarted) reasons.push("لم يبدأ بعد");
  else {
    if (summary.stale) reasons.push("بلا تحديث " + (cfg.staleDays || 7) + "+ أيام");
    if (!summary.complete && summary.overallProgress < lateThreshold) reasons.push("تقدّم أقل من " + lateThreshold + "%");
  }
  return { lateThreshold, reasons };
}

// The list. standings: the class report's own rows; classAverage: the report's «متوسط النتائج»; projectDelays (optional):
// [{ projectCode, title, byStudent: Map studentId -> [reason text] }] for the projects this session may see.
// Order: more reasons first, then the larger gap under the class, then more missing; ties keep the roster's order.
function followUpList(standings, classAverage, projectDelays = [], criteria = FOLLOW_UP_CRITERIA) {
  const students = [];
  standings.forEach((s, index) => {
    const reasons = academicReasons(s, classAverage, criteria);
    for (const p of projectDelays) {
      const late = p.byStudent.get(String(s.studentId));
      if (late && late.length) reasons.push({ code: "project", projectCode: p.projectCode, title: p.title, reasons: late });
    }
    if (reasons.length) students.push({ index, row: { studentId: s.studentId, displayName: s.displayName, average: s.average, missing: s.missing, pending: s.pending, reasons } });
  });
  const gapOf = r => (r.reasons.find(x => x.code === "belowClass") || { gap: 0 }).gap;
  students.sort((a, b) => b.row.reasons.length - a.row.reasons.length || gapOf(b.row) - gapOf(a.row) || b.row.missing - a.row.missing || a.index - b.index);
  return { criteria: { missingAtLeast: criteria.missingAtLeast, belowClassBy: criteria.belowClassBy }, classAverage: finite(classAverage) ? classAverage : null, students: students.map(s => s.row) };
}

module.exports = { FOLLOW_UP_CRITERIA, academicReasons, academicFollowUpCount, projectDelayReasons, followUpList };
