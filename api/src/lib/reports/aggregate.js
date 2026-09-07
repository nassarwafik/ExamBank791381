// Pure, storage-free aggregation helpers for the Reports Center. The reports function does the blob
// reads (prefix listing, batched) and hands plain arrays here, so every calculation is unit-testable
// and there is no N+1 hidden inside the math.

// The latest attempt of a submission doc (or null when the student never submitted).
function latestAttempt(submission) {
  const attempts = submission && Array.isArray(submission.attempts) ? submission.attempts : [];
  return attempts.length ? attempts[attempts.length - 1] : null;
}

// A student's outcome on one assignment, distinguishing "missing" (never submitted) from a real
// submitted score of 0. This is the distinction the assignments report must never blur.
function studentOutcome(submission) {
  const latest = latestAttempt(submission);
  const attempts = submission && Array.isArray(submission.attempts) ? submission.attempts.length : 0;
  if (!latest) return { state: "missing", percentage: null, score: null, attempts };
  return { state: "submitted", percentage: Number(latest.percentage || 0), score: Number(latest.score || 0), attempts };
}

function round1(n) { return Math.round(Number(n) * 10) / 10; }

// Average of an array of numbers (rounded to 1 dp), or null when empty.
function average(nums) {
  const arr = nums.filter(n => Number.isFinite(Number(n))).map(Number);
  return arr.length ? round1(arr.reduce((s, x) => s + x, 0) / arr.length) : null;
}

// Grade distribution buckets over percentages (0-100).
function gradeDistribution(percentages) {
  const b = { "0-49": 0, "50-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0 };
  for (const p of percentages) {
    const v = Number(p);
    if (!Number.isFinite(v)) continue;
    if (v < 50) b["0-49"] += 1;
    else if (v < 60) b["50-59"] += 1;
    else if (v < 70) b["60-69"] += 1;
    else if (v < 80) b["70-79"] += 1;
    else if (v < 90) b["80-89"] += 1;
    else b["90-100"] += 1;
  }
  return b;
}

// Exam-style stats over the latest submissions of one assignment (or a pooled set).
// entries: [{ studentId, submission }]
function examStats(entries) {
  const pcts = [];
  let submitted = 0;
  for (const e of entries) {
    const o = studentOutcome(e.submission);
    if (o.state === "submitted") { submitted += 1; pcts.push(o.percentage); }
  }
  const passing = pcts.filter(p => p >= 50).length;
  return {
    participants: submitted,
    average: average(pcts),
    highest: pcts.length ? Math.max(...pcts) : null,
    lowest: pcts.length ? Math.min(...pcts) : null,
    passRate: pcts.length ? Math.round((passing / pcts.length) * 100) : null,
    distribution: gradeDistribution(pcts)
  };
}

// Assignment-style stats: submission rate, non-submitters, average attempts, avg score, missing vs zero.
// entries: [{ studentId, submission }] across the class for ONE assignment.
function assignmentStats(entries) {
  const total = entries.length;
  let submitted = 0, missing = 0, zeros = 0, attemptSum = 0;
  const pcts = [];
  for (const e of entries) {
    const o = studentOutcome(e.submission);
    attemptSum += o.attempts;
    if (o.state === "missing") { missing += 1; continue; }
    submitted += 1;
    pcts.push(o.percentage);
    if (o.score === 0) zeros += 1;
  }
  return {
    students: total,
    submitted,
    missing,
    zeroScores: zeros,
    submissionRate: total ? Math.round((submitted / total) * 100) : 0,
    average: average(pcts),
    avgAttempts: total ? round1(attemptSum / total) : 0
  };
}

// Pools the latest percentages across many assignments for a student (their academic average).
function studentAcademicAverage(submissionsByAssignment) {
  const pcts = [];
  for (const sub of submissionsByAssignment) {
    const o = studentOutcome(sub);
    if (o.state === "submitted") pcts.push(o.percentage);
  }
  return { average: average(pcts), submittedCount: pcts.length };
}

// ---- CSV ----
// Escapes a cell AND neutralizes CSV/formula injection: a value starting with = + - @ (or tab/CR) is
// prefixed with a single quote so spreadsheets never execute it. Always quoted for safety.
function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function toCsv(rows) {
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

module.exports = {
  latestAttempt, studentOutcome, average, round1, gradeDistribution,
  examStats, assignmentStats, studentAcademicAverage, csvCell, toCsv
};
