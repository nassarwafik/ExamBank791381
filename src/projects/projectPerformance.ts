// Project-performance PRESENTATION (no policy): the server's `performance` object is the authority for the grade,
// the project-specific Strength (/600), its tier and every stage's project value. This module only formats those
// numbers and maps a tier id to the SAME six rank artwork files (studentRankVisuals) — never a second image set.
import { RANK_VISUALS, type RankVisual } from "../studentRankVisuals";
import type { ProjectPerformance, ProjectRankTier, StageValue } from "./types";

/** Display ceiling of the project-specific Strength (the server's `maxStrength`; kept here for labels only). */
export const PROJECT_STRENGTH_MAX = 600;

/** The rank artwork / Arabic title / level for a project tier — the existing six images, reused as-is. */
export function projectRankVisual(tier: ProjectRankTier): RankVisual {
  return RANK_VISUALS[tier];
}

/** «8.5» — one decimal at most, trailing zero dropped (presentation rounding only). */
export function fmtContribution(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** «81 / 100» for a project grade. */
export function fmtGrade(grade: number): string {
  return fmtContribution(grade) + " / 100";
}

/** «85 / 100» or «لم تُرصد بعد» for a stage's score. */
export function fmtStageScore(entry: { score?: number | null } | null | undefined): string {
  const s = entry?.score;
  return typeof s === "number" && Number.isFinite(s) ? fmtContribution(s) + " / 100" : "لم تُرصد بعد";
}

/** The stage's project value row from the server's performance (null when the stage carries no project value). */
export function stageValueOf(performance: ProjectPerformance | null | undefined, stageId: string): StageValue | null {
  return performance?.stageValues?.[stageId] ?? null;
}

/** A well-formed performance object from whatever the server sent; null when absent (older payloads). */
export function normalizeProjectPerformance(raw: unknown): ProjectPerformance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tier = r.tier;
  if (typeof r.projectStrength !== "number" || typeof r.grade !== "number" || typeof r.overallProgress !== "number" || typeof tier !== "string" || !(tier in RANK_VISUALS)) return null;
  const nextTier = typeof r.nextTier === "string" && r.nextTier in RANK_VISUALS ? (r.nextTier as ProjectRankTier) : null;
  return {
    overallProgress: r.overallProgress, grade: r.grade, gradePrecise: typeof r.gradePrecise === "number" ? r.gradePrecise : r.grade,
    projectStrength: r.projectStrength, maxStrength: typeof r.maxStrength === "number" ? r.maxStrength : PROJECT_STRENGTH_MAX,
    tier: tier as ProjectRankTier, level: typeof r.level === "number" ? r.level : RANK_VISUALS[tier as ProjectRankTier].level, nextTier,
    complete: r.complete === true,
    stageValues: r.stageValues && typeof r.stageValues === "object" ? (r.stageValues as Record<string, StageValue>) : {},
  };
}
