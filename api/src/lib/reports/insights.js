// Phase R-5a — pure, storage-free shaping of the SERIES the Reports Center draws as charts (class and student reports).
// Every figure comes from the same canonical outcome as the rest of the Reports Center (aggregate.studentOutcome /
// aggregate.assignmentStats), so a chart can never disagree with a KPI or a table of the same report, and the grading-safety
// rules hold by construction (docs/enterprise-reports-insight-charts-r5a.md):
//   - a result still awaiting the teacher is "pending": it has NO percentage, is never a zero and never enters an average;
//   - a student who never handed in is "missing": no percentage either — never a zero;
//   - an outcome this code cannot classify is counted as pending (handed in, no number) — it never becomes a number.
const { studentOutcome, assignmentStats, average, round1 } = require("./aggregate");

// Calendar day (YYYY-MM-DD) of an ISO timestamp, or "" when it is absent or not a date.
function isoDay(iso) {
  const s = String(iso || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

// Phase R-5b — the spread of a set of FINAL percentages: highest, lowest, median and (population) standard deviation, each
// rounded to 1 dp. Every figure is null when there is no final result — never 0. No threshold and no pass mark is implied.
function spread(values) {
  const v = values.filter(n => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return { highest: null, lowest: null, median: null, stdDev: null };
  const mid = Math.floor(v.length / 2);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return {
    highest: round1(v[v.length - 1]), lowest: round1(v[0]),
    median: round1(v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2),
    stdDev: round1(Math.sqrt(v.reduce((s, x) => s + (x - mean) * (x - mean), 0) / v.length))
  };
}

// The FINAL percentages of the roster in one assessment (pending and missing carry none).
function finalPercentages(students, subs) {
  const out = [];
  for (const s of students) {
    const o = studentOutcome(subs.get(String(s.studentId)));
    if (o.state === "submitted") out.push(o.percentage);
  }
  return out;
}

// highest / lowest / median of one assessment's final results (the per-assessment row's three extra figures).
function assessmentSpread(students, subs) {
  const { highest, lowest, median } = spread(finalPercentages(students, subs));
  return { highest, lowest, median };
}

// The class at a glance, over the students' averages: the spread, and WHO holds the highest and the lowest average (the first
// in roster order on a tie). Students with no final result are left out — they are not the lowest.
function standingsSummary(standings) {
  const ranked = standings.filter(s => typeof s.average === "number" && Number.isFinite(s.average));
  const pick = (better) => ranked.reduce((best, s) => (best === null || better(s.average, best.average) ? s : best), null);
  const who = s => (s ? { studentId: s.studentId, displayName: s.displayName, average: s.average } : null);
  const { median, stdDev } = spread(ranked.map(s => s.average));
  return { highest: who(pick((a, b) => a > b)), lowest: who(pick((a, b) => a < b)), median, stdDev, withAverage: ranked.length };
}

// One point per assessment, in the order given (the caller passes them by createdAt, oldest first): the SAME figures as the
// assessments report's per-assessment row. subsByAssignment[i] is the Map studentId -> submission of assignments[i].
function assessmentSeries(assignments, students, subsByAssignment) {
  return assignments.map((a, i) => {
    const subs = subsByAssignment[i];
    const st = assignmentStats(students.map(s => ({ studentId: s.studentId, submission: subs.get(String(s.studentId)) })));
    return {
      assignmentId: a.assignmentId, title: a.title, date: isoDay(a.createdAt),
      students: st.students, submitted: st.submitted, missing: st.missing, pendingReview: st.pendingReview,
      submissionRate: st.submissionRate, average: st.average
    };
  });
}

// One row per student of the roster: the average of their FINAL results over the given assessments (null when none), and how
// many of those assessments are graded / awaiting the teacher / not handed in. graded + pending + missing = assessments.
function studentStandings(students, subsByAssignment) {
  return students.map(s => {
    const pcts = [];
    let pending = 0, missing = 0;
    for (const subs of subsByAssignment) {
      const o = studentOutcome(subs.get(String(s.studentId)));
      if (o.state === "submitted") pcts.push(o.percentage);
      else if (o.state === "missing") missing += 1;
      else pending += 1;                                        // pending, or a state this code does not know: never a number
    }
    return { studentId: s.studentId, displayName: s.displayName, average: average(pcts), graded: pcts.length, pending, missing };
  });
}

// Student × assessment cells by state. graded + pending = the handed-in cells the submission rate counts.
function submissionSplit(standings) {
  const split = { graded: 0, pending: 0, missing: 0 };
  for (const s of standings) { split.graded += s.graded; split.pending += s.pending; split.missing += s.missing; }
  return split;
}

// The class average of each assessment (FINAL results of the roster only; null when none) — the per-assessment «المتوسط».
function classAverages(students, subsByAssignment) {
  return subsByAssignment.map(subs => assignmentStats(students.map(s => ({ studentId: s.studentId, submission: subs.get(String(s.studentId)) }))).average);
}

// One point per assessment for ONE student (mySubs[i] is their submission of assignments[i], or null): the state, the
// percentage ONLY when the latest result is final, their attempt count, and the class average of that assessment.
function studentSeries(assignments, mySubs, averages) {
  return assignments.map((a, i) => {
    const o = studentOutcome(mySubs[i]);
    const known = o.state === "submitted" || o.state === "missing";
    const avg = averages && averages[i] !== undefined ? averages[i] : null;
    return {
      assignmentId: a.assignmentId, title: a.title, date: isoDay(a.createdAt),
      state: known ? o.state : "pending",
      percentage: o.state === "submitted" ? o.percentage : null,
      attempts: o.attempts,
      classAverage: avg
    };
  });
}

// graded / pending / missing counts of one student's series.
function studentSplit(series) {
  const split = { graded: 0, pending: 0, missing: 0 };
  for (const p of series) {
    if (p.state === "submitted") split.graded += 1;
    else if (p.state === "missing") split.missing += 1;
    else split.pending += 1;
  }
  return split;
}

// The Reports Center hub overview: one row per class, the totals over all of them and a month-by-month trend.
// classInputs: [{ meta: { classId, name, schoolYear }, students, assignments, subsByAssignment }] — one entry per class the caller
// may read. Averages pool FINAL results only; the submission rate counts every handed-in cell (pending included) over
// students × assessments — the class report's own two rules, so a class reads the same here and in its report.
function overviewRollup(classInputs) {
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
  const months = new Map();                                     // "YYYY-MM" -> { assessments, pcts, handedIn, cells }
  const allPcts = [];
  let students = 0, assessments = 0, handedIn = 0, cells = 0, pendingTotal = 0;
  const classes = classInputs.map(({ meta, students: roster, assignments, subsByAssignment }) => {
    const classPcts = [];
    let graded = 0, pending = 0, missing = 0;
    assignments.forEach((a, i) => {
      const subs = subsByAssignment[i];
      const month = isoDay(a.createdAt).slice(0, 7);
      const bucket = month ? (months.get(month) || months.set(month, { assessments: 0, pcts: [], handedIn: 0, cells: 0 }).get(month)) : null;
      if (bucket) bucket.assessments += 1;
      for (const s of roster) {
        const o = studentOutcome(subs.get(String(s.studentId)));
        if (bucket) bucket.cells += 1;
        if (o.state === "missing") { missing += 1; continue; }
        if (bucket) bucket.handedIn += 1;
        if (o.state === "submitted") { graded += 1; classPcts.push(o.percentage); if (bucket) bucket.pcts.push(o.percentage); }
        else pending += 1;                                      // pending, or a state this code does not know: never a number
      }
    });
    const classCells = roster.length * assignments.length;
    students += roster.length; assessments += assignments.length; handedIn += graded + pending; cells += classCells; pendingTotal += pending;
    for (const p of classPcts) allPcts.push(p);
    return {
      classId: meta.classId, name: meta.name, schoolYear: meta.schoolYear || "", studentCount: roster.length, assessments: assignments.length,
      average: average(classPcts), submissionRate: pct(graded + pending, classCells), pendingReview: pending, graded, pending, missing
    };
  });
  const trend = [...months.keys()].sort().map(month => {
    const m = months.get(month);
    return { month, assessments: m.assessments, average: average(m.pcts), submissionRate: pct(m.handedIn, m.cells) };
  });
  return {
    classes,
    totals: { classes: classes.length, students, assessments, average: average(allPcts), submissionRate: pct(handedIn, cells), pendingReview: pendingTotal },
    trend
  };
}

module.exports = { overviewRollup, spread, assessmentSpread, standingsSummary, isoDay, assessmentSeries, studentStandings, submissionSplit, classAverages, studentSeries, studentSplit };
