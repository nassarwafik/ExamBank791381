// Phase R-5a — the chart series of the Reports Center: the shapes the API sends (`insights`, `overview`) and the PURE shaping the
// charts need (ranking, change between points, gap to the class average). No network, no React.
// Grading safety (AGENTS.md §10, owner decision D-1): a number is drawn ONLY for a final result. A result awaiting the teacher
// («بانتظار التصحيح») and a student who never handed in («لم يسلّم») have no percentage — here they stay `null`, so a chart shows
// a gap and its table shows the state in words; nothing in this file turns a missing, pending or unknown outcome into a 0.

export type AssessmentPoint = { assignmentId: string; title: string; date?: string; students: number; submitted: number; missing: number; pendingReview?: number; submissionRate: number; average: number | null };
export type StudentStanding = { studentId: string; displayName: string; average: number | null; graded: number; pending: number; missing: number };
export type SubmissionSplit = { graded: number; pending: number; missing: number };
export type ClassInsights = { assessments: AssessmentPoint[]; students: StudentStanding[]; submission: SubmissionSplit };
export type StudentAssessmentPoint = { assignmentId: string; title: string; date?: string; state: string; percentage: number | null; attempts: number; classAverage: number | null };
export type StudentInsights = { assessments: StudentAssessmentPoint[]; submission: SubmissionSplit };
export type OverviewClass = { classId: string; name: string; schoolYear: string; studentCount: number; assessments: number; average: number | null; submissionRate: number; pendingReview: number; graded: number; pending: number; missing: number };
export type OverviewData = {
  classes: OverviewClass[];
  totals: { classes: number; students: number; assessments: number; average: number | null; submissionRate: number; pendingReview: number };
  trend: { month: string; assessments: number; average: number | null; submissionRate: number }[];
};

export const GRADED_LABEL = "مصحَّح";
export const PENDING_LABEL = "بانتظار التصحيح";
export const MISSING_LABEL = "لم يسلّم";

/** A finite number, or null — the only way a value reaches a chart. */
export function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The student's drawable result: a number ONLY for a final result (`state === "submitted"`); anything else — pending, missing
 *  or a state this client does not know — is null (fail closed, like the matrix of the assessments report). */
export function gradedValue(p: Pick<StudentAssessmentPoint, "state" | "percentage">): number | null {
  return p.state === "submitted" ? finiteOrNull(p.percentage) : null;
}

/** The state of a student's point in words (table / tooltip): the result, «بانتظار التصحيح» or «لم يسلّم». */
export function stateText(p: Pick<StudentAssessmentPoint, "state" | "percentage">): string {
  if (p.state === "missing") return MISSING_LABEL;
  const v = gradedValue(p);
  return v === null ? PENDING_LABEL : Math.round(v) + "%";
}

export type Change = { last: number; previous: number; delta: number };
/** The change between the last two KNOWN values of a series (gaps skipped); null with fewer than two. */
export function latestChange(values: (number | null)[]): Change | null {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length < 2) return null;
  const last = known[known.length - 1], previous = known[known.length - 2];
  return { last, previous, delta: round1(last - previous) };
}

/** LEFT-TO-RIGHT MARK: in right-to-left text a leading sign is a neutral character and would be drawn AFTER its number
 *  («7+», «4-»); the mark keeps the sign in front of it, in HTML and on a chart canvas alike. It draws nothing. */
export const LRM = "\u200E";
/** «+12» / «-4» / «0» — a signed difference in percentage points (Western digits), safe inside Arabic text (LRM-prefixed). */
export function signed(delta: number): string {
  const d = round1(delta);
  return d === 0 ? "0" : LRM + (d > 0 ? "+" : "") + String(d);
}

export function round1(n: number): number { return Math.round(n * 10) / 10; }

/** Students by average, highest first; the students with no final result yet keep their order at the end (never as a 0). */
export function rankStandings(standings: StudentStanding[]): StudentStanding[] {
  const withAvg = standings.filter(s => finiteOrNull(s.average) !== null).sort((a, b) => (b.average as number) - (a.average as number));
  return [...withAvg, ...standings.filter(s => finiteOrNull(s.average) === null)];
}

/** The student's result minus the class average of the same assessment; null when either side has no number. */
export function gapToClass(points: StudentAssessmentPoint[]): (number | null)[] {
  return points.map(p => {
    const mine = gradedValue(p), cls = finiteOrNull(p.classAverage);
    return mine === null || cls === null ? null : round1(mine - cls);
  });
}

/** In how many of the comparable assessments the student is at or above the class average. */
export function aboveClassCount(points: StudentAssessmentPoint[]): { above: number; of: number } {
  const gaps = gapToClass(points).filter((g): g is number => g !== null);
  return { above: gaps.filter(g => g >= 0).length, of: gaps.length };
}

/** Week-over-week change of a weekly series: one entry per week after the first. */
export function weeklyDeltas(trend: { weekStart: string; avgOverall: number }[]): { weekStart: string; delta: number }[] {
  return trend.slice(1).map((t, i) => ({ weekStart: t.weekStart, delta: round1(t.avgOverall - trend[i].avgOverall) }));
}

/** Graded / pending / missing of one assessment row (graded = handed in − awaiting the teacher, never below 0). */
export function rowSplit(r: { submitted: number; missing: number; pendingReview?: number }): SubmissionSplit {
  const pending = Math.max(0, r.pendingReview ?? 0);
  return { graded: Math.max(0, r.submitted - pending), pending, missing: Math.max(0, r.missing) };
}

/** Students of a project by state: completed / in progress / not started (in progress is what the two counts leave). */
export function projectStudentSplit(p: { studentCount?: number; completedCount: number; notStartedCount?: number }): { completed: number; inProgress: number; notStarted: number } | null {
  const total = finiteOrNull(p.studentCount);
  if (total === null || total <= 0) return null;                 // an older API without the population: no bar, nothing guessed
  const completed = Math.max(0, p.completedCount), notStarted = Math.max(0, p.notStartedCount ?? 0);
  return { completed, inProgress: Math.max(0, total - completed - notStarted), notStarted };
}

/** A label short enough for an axis; the full text stays in the tooltip and the table. */
export function shortLabel(text: string, max = 16): string {
  const t = String(text ?? "");
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
/** "2026-03" → «مارس 2026» (Western digits); anything else is returned as is. */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const name = MONTHS_AR[Number(m[2]) - 1];
  return name ? name + " " + m[1] : month;
}
