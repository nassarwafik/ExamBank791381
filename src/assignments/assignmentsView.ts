// Phase 21G.1 — the pure view rules of the assignments workspace, extracted unchanged from AssignmentsPanel so they can be tested
// alone and reused by the 21G.2+ pages: the master-list scope, the gradebook rows (search · filter · sort), the item-analysis order
// and summary, and the drill-in gradebook view. No React, no requests.
import { resolveGradingStatus, type GradingStatus } from "../gradingStatus";
import { gradebookFilterFor, drillStudentId, type AssignmentDrill } from "./drillTarget";
import type { Item, StudentResult, GradebookFilter, GradebookSort, ItemAnalysis, AnalysisSort, QuestionStat } from "./types";
import { matchesTimeFilter, type TimeFilter } from "./assignmentsHome";

/**
 * Server-authoritative grading status for a student's LATEST result: the row-level server gradingStatus wins; otherwise the SHARED
 * resolver derives it from the latest result's manualReviewMarks / finalized (never from the percentage). "notSubmitted" when there
 * is no completed attempt. No local copy of the rule.
 */
export const rowGrading = (s: StudentResult): GradingStatus => (s.gradingStatus ? s.gradingStatus : resolveGradingStatus(s.latestResult));

/**
 * Master-list scope (class filter · current/archived view · search). The SAME predicate drives the displayed list and the UX-5
 * invariant "a visible AssignmentDetail belongs to the current master-list scope", so the two can never disagree. `q` is already
 * trimmed + lowercased (normalizeQuery).
 */
export type MasterScope = { classId: string; showArchived: boolean; q: string; /** Phase 21G.2 — the home's time filter (current view only), judged at `now`. */ time?: TimeFilter; now?: number };
export function matchesMasterScope(x: Item, s: MasterScope): boolean {
  if (s.classId && x.classId !== s.classId) return false;
  if (s.showArchived ? x.status !== "archived" : x.status === "archived") return false;
  if (!s.showArchived && s.time && s.time !== "all" && !matchesTimeFilter(x, s.time, s.now ?? 0)) return false;
  if (s.q && ![x.title, x.className].join(" ").toLocaleLowerCase("ar").includes(s.q)) return false;
  return true;
}
export const normalizeQuery = (v: string) => v.trim().toLocaleLowerCase("ar");

/** Roadmap #13 — gradebook rows after client-side search (name / code) + filter (grading / active) + sort. */
export function gradebookRows(results: readonly StudentResult[], search: string, filter: GradebookFilter, sort: GradebookSort): StudentResult[] {
  const q = search.trim().toLowerCase();
  let rows = results.filter(s => !q || String(s.studentName || "").toLowerCase().includes(q) || String(s.studentCode || "").toLowerCase().includes(q));
  rows = rows.filter(s => {
    if (filter === "all") return true;
    if (filter === "active") return !!s.activeAttempt;               // currently attempting (independent of grading)
    return rowGrading(s) === filter;                                  // pendingReview | final | notSubmitted
  });
  // Phase R-1 (owner decision D-1): only a FINAL result has a mark to rank; a result awaiting the teacher follows the final ones
  // (by name) whatever its provisional percentage, and a row with no result stays last (by name).
  const pct = (s: StudentResult) => (s.latestResult && rowGrading(s) === "final" ? Number(s.latestResult.percentage || 0) : null);
  const rank = (s: StudentResult) => (pct(s) !== null ? 0 : s.latestResult ? 1 : 2);
  const byName = (a: StudentResult, b: StudentResult) => String(a.studentName).localeCompare(String(b.studentName), "ar");
  const sorted = [...rows];
  if (sort === "name") sorted.sort(byName);
  else if (sort === "pendingFirst") sorted.sort((a, b) => { const ap = rowGrading(a) === "pendingReview" ? 0 : 1, bp = rowGrading(b) === "pendingReview" ? 0 : 1; return ap !== bp ? ap - bp : byName(a, b); });
  else sorted.sort((a, b) => { const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb; if (ra !== 0) return byName(a, b); const av = pct(a) as number, bv = pct(b) as number; return sort === "highest" ? bv - av : av - bv; });
  return sorted;
}

/** Item-analysis questions in the chosen order; questions without data always come last when sorting by difficulty. */
export function sortAnalysisQuestions(analysis: ItemAnalysis | null, sort: AnalysisSort): QuestionStat[] {
  if (!analysis) return [];
  if (sort === "number") return [...analysis.questions].sort((a, b) => a.number - b.number);
  const withData = analysis.questions.filter(q => q.averagePercentage !== null), withoutData = analysis.questions.filter(q => q.averagePercentage === null);
  withData.sort((a, b) => (sort === "hardest" ? (a.averagePercentage as number) - (b.averagePercentage as number) : (b.averagePercentage as number) - (a.averagePercentage as number)));
  return [...withData, ...withoutData];
}

export type AnalysisSummary = { overallAverage: number | null; hardest: QuestionStat | null; easiest: QuestionStat | null };
/** The overall average and the hardest / easiest question of an item analysis (null when there is none). */
export function summarizeAnalysis(analysis: ItemAnalysis | null): AnalysisSummary | null {
  if (!analysis) return null;
  const withPct = analysis.questions.filter(q => q.averagePercentage !== null);
  if (!withPct.length) return { overallAverage: null, hardest: null, easiest: null };
  const overallAverage = Math.round(withPct.reduce((sum, q) => sum + (q.averagePercentage as number), 0) / withPct.length * 10) / 10;
  const hardest = withPct.reduce((a, b) => ((a.averagePercentage as number) <= (b.averagePercentage as number) ? a : b));
  const easiest = withPct.reduce((a, b) => ((a.averagePercentage as number) >= (b.averagePercentage as number) ? a : b));
  return { overallAverage, hardest, easiest };
}

/**
 * Phase 12B — the drill's gradebook view, decided from the authoritative rows just read (never from the Today summary): the
 * EXISTING filter the intent maps to; a requested student is focused only if present in these rows, and when that student no
 * longer matches the intended filter (the attempt ended since Today was read) the gradebook shows every row so the student's
 * CURRENT state stays visible — with a calm note, never an error.
 */
export type DrillView = { filter: GradebookFilter; focusStudentId: string | null; notice: string | null };
export function drillViewFor(d: AssignmentDrill, students: readonly StudentResult[]): DrillView {
  const wanted = gradebookFilterFor(d.mode), sid = drillStudentId(d);
  if (!sid) return { filter: wanted, focusStudentId: null, notice: null };
  const row = students.find(s => s.studentId === sid);
  if (!row) return { filter: wanted, focusStudentId: null, notice: "لم يعد هذا الطالب ضمن الواجب؛ تُعرض الحالة الحالية." };
  const matches = wanted === "all" || (wanted === "active" ? !!row.activeAttempt : rowGrading(row) === wanted);
  return { filter: matches ? wanted : "all", focusStudentId: sid, notice: matches ? null : "لم تعد محاولة " + row.studentName + " جارية؛ تُعرض حالته الحالية." };
}
