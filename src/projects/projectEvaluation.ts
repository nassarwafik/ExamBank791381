// Phase 9B — project EVALUATION presentation (no policy): the server's `evaluation` object is the authority for the
// graded / ungraded counts, the evaluation progress and the project score. This module only validates its shape and
// formats it; nothing is recomputed on the client. A malformed or absent payload (older API) → null → the UI shows
// no evaluation block instead of inventing numbers.
import { fmtContribution, NOT_GRADED_LABEL } from "./projectPerformance";
import type { EvaluationStage, ProjectEvaluation, StageStatus } from "./types";

/** One teacher mutation on a stage: exactly one of status / note / score (see ProjectStudentDetail). */
export type StagePatch = { status?: StageStatus; note?: string; score?: number | string | null };
export type MutationKind = "score" | "status" | "note";
export const kindOfPatch = (patch: StagePatch): MutationKind => (patch.status !== undefined ? "status" : patch.note !== undefined ? "note" : "score");
/**
 * The request body of one mutation. Status and note stay the canonical `progress.update`; a score goes through the
 * NARROW score actions (`score.set` / `score.clear`: studentId + stageId [+ score] only — the server merges ONE stage
 * entry through the same CAS pipeline), so a grading request can never carry a workflow change.
 */
export function mutationBody(classId: string, studentId: string, stageId: string, patch: StagePatch): Record<string, unknown> {
  if (kindOfPatch(patch) !== "score") return { action: "progress.update", classId, studentId, stageId, ...patch };
  return patch.score === null ? { action: "score.clear", classId, studentId, stageId } : { action: "score.set", classId, studentId, stageId, score: patch.score };
}

/** What the Today Hub shows about the projects' evaluation (one line; nothing else leaves the project panel). */
export type ProjectEvaluationBrief = { projectCode: string; title: string; gradedStages: number; totalStages: number };
export function evaluationBriefs(projects: { projectCode: string; title: string; evaluation?: unknown }[] | undefined | null): ProjectEvaluationBrief[] {
  const out: ProjectEvaluationBrief[] = [];
  for (const p of projects || []) {
    const e = normalizeProjectEvaluation(p.evaluation);
    if (e && e.totalStages > 0) out.push({ projectCode: p.projectCode, title: p.title, gradedStages: e.gradedStages, totalStages: e.totalStages });
  }
  return out;
}
/** «مشروعك: 5/7 مراحل مقيّمة» (one project) or «مشاريعك: 9/14 مراحل مقيّمة» (several); "" when nothing to show. */
export function projectEvaluationText(briefs: { gradedStages: number; totalStages: number }[] | null | undefined): string {
  const list = (briefs || []).filter(b => b.totalStages > 0);
  if (!list.length) return "";
  const graded = list.reduce((n, b) => n + b.gradedStages, 0), total = list.reduce((n, b) => n + b.totalStages, 0);
  return (list.length === 1 ? "مشروعك: " : "مشاريعك: ") + graded + "/" + total + " مراحل مقيّمة";
}

const STATUSES: StageStatus[] = ["not_started", "in_progress", "ready_for_review", "approved"];
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isScore = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

/** A well-formed evaluation from whatever the server sent; null when absent or malformed (never invented values). */
export function normalizeProjectEvaluation(raw: unknown): ProjectEvaluation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isCount(r.totalStages) || !isCount(r.gradedStages) || !Array.isArray(r.stages)) return null;
  const projectScore = isScore(r.projectScore) ? r.projectScore : null;
  const stages: EvaluationStage[] = [];
  for (const row of r.stages as unknown[]) {
    if (!row || typeof row !== "object") continue;
    const s = row as Record<string, unknown>;
    if (typeof s.stageId !== "string" || !s.stageId) continue;
    const score = isScore(s.score) ? s.score : null;
    stages.push({
      stageId: s.stageId, track: String(s.track || ""), groupId: String(s.groupId || ""), title: String(s.title || ""), order: Number(s.order) || 0,
      required: s.required !== false, status: STATUSES.includes(s.status as StageStatus) ? (s.status as StageStatus) : "not_started",
      score, graded: score !== null, scoredAt: String(s.scoredAt || ""), scoredBy: String(s.scoredBy || "")
    });
  }
  const total = r.totalStages, graded = Math.min(r.gradedStages, total);
  return {
    totalStages: total, gradedStages: graded,
    ungradedStages: isCount(r.ungradedStages) ? r.ungradedStages : total - graded,
    evaluationProgress: isCount(r.evaluationProgress) ? Math.min(100, Math.round(r.evaluationProgress)) : total > 0 ? Math.round((graded / total) * 100) : 0,
    projectScore, projectScorePrecise: typeof r.projectScorePrecise === "number" && Number.isFinite(r.projectScorePrecise) ? r.projectScorePrecise : projectScore,
    stages, orphanStageIds: Array.isArray(r.orphanStageIds) ? (r.orphanStageIds as unknown[]).filter((x): x is string => typeof x === "string") : [],
    updatedAt: String(r.updatedAt || "")
  };
}

/** «84 / 100» for the project score, «لم تُقيّم بعد» while nothing is graded (0 → «0 / 100»). */
export function fmtProjectScore(score: number | null): string {
  return typeof score === "number" && Number.isFinite(score) ? fmtContribution(score) + " / 100" : NOT_GRADED_LABEL;
}

/** The one-line summary: «التقييم العام: 84 / 100 · المراحل المقيّمة: 5 / 7 · نسبة التقييم: 71%». */
export function evaluationSummaryText(e: ProjectEvaluation): string {
  return "التقييم العام: " + fmtProjectScore(e.projectScore) + " · المراحل المقيّمة: " + e.gradedStages + " / " + e.totalStages + " · نسبة التقييم: " + e.evaluationProgress + "%";
}

/** The ungraded ACTIVE stages in snapshot order (what the student still waits for / the teacher still owes). */
export function ungradedStagesOf(e: ProjectEvaluation): EvaluationStage[] {
  return e.stages.filter(s => !s.graded);
}
