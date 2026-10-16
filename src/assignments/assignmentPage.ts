// Phase 21G.3 — the full-width assignment page model (pure): its sections, the score distribution and the students' status
// breakdown, computed from the gradebook rows the page already holds (no extra request). Grading safety: the distribution counts
// FINAL results only — a result still waiting for manual review is provisional, so it is counted apart and never drawn as a score.
import { rowGrading } from "./assignmentsView";
import type { StudentResult } from "./types";

export type PageTab = "students" | "overview" | "analysis";
export const PAGE_TABS: { key: PageTab; label: string }[] = [
  { key: "students", label: "الطلاب" },
  { key: "overview", label: "نظرة عامة" },
  { key: "analysis", label: "تحليل الأسئلة" }
];

export type ScoreBand = { key: string; label: string; min: number; max: number; count: number };
const BANDS: Omit<ScoreBand, "count">[] = [
  { key: "b0", label: "أقل من 50%", min: 0, max: 50 },
  { key: "b50", label: "50–64%", min: 50, max: 65 },
  { key: "b65", label: "65–79%", min: 65, max: 80 },
  { key: "b80", label: "80–89%", min: 80, max: 90 },
  { key: "b90", label: "90–100%", min: 90, max: Infinity }
];

/** The band of a percentage (clamped to 0–100), shared by the distribution and the per-question grid so their edges never disagree. */
export const bandOf = (percentage: number) => {
  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  return BANDS.find(b => pct >= b.min && pct < b.max) || BANDS[BANDS.length - 1];
};
export const SCORE_BANDS: readonly Omit<ScoreBand, "count">[] = BANDS;

export type ScoreDistribution = { bands: ScoreBand[]; graded: number; pendingReview: number; largest: number };
/** The latest-attempt percentage of every student whose latest result is FINAL, in five bands; pending reviews are counted apart. */
export function scoreDistribution(results: readonly StudentResult[]): ScoreDistribution {
  const bands = BANDS.map(b => ({ ...b, count: 0 }));
  let graded = 0, pendingReview = 0;
  for (const s of results) {
    const g = rowGrading(s);
    if (g === "pendingReview") { pendingReview++; continue; }
    if (g !== "final" || !s.latestResult) continue;
    const key = bandOf(s.latestResult.percentage).key;
    (bands.find(b => b.key === key) as ScoreBand).count++; graded++;
  }
  return { bands, graded, pendingReview, largest: Math.max(0, ...bands.map(b => b.count)) };
}

export type StatusPart = { key: "final" | "pendingReview" | "active" | "notSubmitted"; label: string; count: number };
/**
 * Where each student stands: graded, waiting for review, in an attempt now without a submitted one yet, or not submitted. Every
 * student is in exactly one part (a live second attempt after a graded first one still counts as graded).
 */
export function statusBreakdown(results: readonly StudentResult[]): StatusPart[] {
  const parts: StatusPart[] = [
    { key: "final", label: "مصحّح", count: 0 },
    { key: "pendingReview", label: "بانتظار التصحيح", count: 0 },
    { key: "active", label: "يحاول الآن", count: 0 },
    { key: "notSubmitted", label: "لم يسلّم", count: 0 }
  ];
  const at = (k: StatusPart["key"]) => parts.find(p => p.key === k) as StatusPart;
  for (const s of results) {
    const g = rowGrading(s);
    if (g === "final") at("final").count++;
    else if (g === "pendingReview") at("pendingReview").count++;
    else if (s.activeAttempt) at("active").count++;
    else at("notSubmitted").count++;
  }
  return parts;
}

/** Arabic count of students (1 · 2 · 3–10 · 11+). */
export const studentsCount = (n: number) => (n === 0 ? "لا أحد" : n === 1 ? "طالب واحد" : n === 2 ? "طالبان" : n >= 3 && n <= 10 ? n + " طلاب" : n + " طالبًا");
