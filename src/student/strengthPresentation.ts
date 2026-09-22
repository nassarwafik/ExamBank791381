// Unified Strength (نقاط القوة) — PRESENTATION of the server's 25-STAGE `dashboard.strength`.
//
// Authority contract (one policy, on the server — api/src/lib/student-strength.js, buildStrengthSummary):
//   • `strength` payload present and well-formed → it is trusted COMPLETELY: totalPoints, libraryPoints, modulePoints,
//     stage (1..25), stageCount, stageSpan, withinStagePoints, nextStageRemaining, percent, nextStage and totalMax are
//     the SERVER's values. Nothing here divides, floors or compares totalPoints against a threshold; the client only
//     maps the stage NUMBER to its uploaded artwork / Arabic name (strengthStages.ts) and displays the server figures.
//   • no `strength` payload / a malformed one (a missing or non-numeric field) → a zeroed, well-formed STAGE-1 summary,
//     so the hero never disappears, never renders NaN and never shows a negative or off-by-one stage. There is NO
//     client-side re-derivation of the stage from the points — the stage is only ever the server's.
//
// The historical 6-rank progression (studentRank.ts) is retired for this path: it is never consulted here and is no
// longer authoritative for the visible Student Strength. (Projects keep their own separate /600 rank, unrelated.)
import { STAGE_COUNT, STAGE_SPAN, STRENGTH_TOTAL_MAX, stageDef, type StrengthStageDef } from "./strengthStages";
import type { StudentStrength } from "./types";

const NUMERIC_FIELDS = [
  "totalPoints", "libraryPoints", "modulePoints", "stage", "stageCount", "stageSpan",
  "withinStagePoints", "nextStageRemaining", "percent", "totalMax",
] as const;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** `nextStage` is a stage number (1..25) or null at the top stage. */
const isNextStage = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));

/** True when `raw` is a complete, well-formed server Strength payload (the documented acceptance rule). */
export function isServerStrength(raw: unknown): raw is StudentStrength {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return NUMERIC_FIELDS.every(k => isFiniteNumber(r[k])) && isNextStage(r.nextStage);
}

/** Which authority `normalizeStrength` would use for a raw payload — "server" or the zeroed "fallback". */
export function strengthAuthority(raw: unknown): "server" | "fallback" {
  return isServerStrength(raw) ? "server" : "fallback";
}

const nonNegativeInt = (value: number): number => (value > 0 ? Math.trunc(value) : 0);

/** A zeroed, well-formed STAGE-1 summary — the safe fallback when the server sent no / a malformed payload. */
function emptyStrength(): StudentStrength {
  return {
    totalPoints: 0, libraryPoints: 0, modulePoints: 0,
    stage: 1, stageCount: STAGE_COUNT, stageSpan: STAGE_SPAN,
    withinStagePoints: 0, nextStageRemaining: STAGE_SPAN, percent: 0,
    nextStage: STAGE_COUNT > 1 ? 2 : null, totalMax: STRENGTH_TOTAL_MAX,
  };
}

/** A well-formed StudentStrength from the server payload (shape only; the stage AND the progress are the server's). */
export function normalizeStrength(raw: unknown): StudentStrength {
  if (!isServerStrength(raw)) return emptyStrength();
  const stageCount = nonNegativeInt(raw.stageCount) || STAGE_COUNT;
  const stage = Math.min(Math.max(nonNegativeInt(raw.stage) || 1, 1), stageCount);
  const atTop = stage >= stageCount;
  return {
    totalPoints: nonNegativeInt(raw.totalPoints), libraryPoints: nonNegativeInt(raw.libraryPoints), modulePoints: nonNegativeInt(raw.modulePoints),
    stage, stageCount, stageSpan: nonNegativeInt(raw.stageSpan) || STAGE_SPAN,
    withinStagePoints: nonNegativeInt(raw.withinStagePoints), nextStageRemaining: nonNegativeInt(raw.nextStageRemaining),
    percent: Math.min(100, nonNegativeInt(raw.percent)),
    // Trust the server's null, but never let a top-stage payload carry a phantom "next".
    nextStage: raw.nextStage === null || atTop ? null : (nonNegativeInt(raw.nextStage) || null),
    totalMax: nonNegativeInt(raw.totalMax) || STRENGTH_TOTAL_MAX,
  };
}

/** The shaped view the Strength UI renders: the current stage's uploaded artwork/name + the server's progress. */
export type StageView = {
  stage: number; stageCount: number; def: StrengthStageDef; name: string;
  totalPoints: number; totalMax: number;
  withinStagePoints: number; stageSpan: number; nextStageRemaining: number; percent: number;
  nextStage: number | null; nextDef: StrengthStageDef | null; isMax: boolean;
  libraryPoints: number; modulePoints: number;
};

/** Shape the server Strength into everything the hero/frame need (defensive re-normalization; never throws). */
export function stageView(strength: StudentStrength | null | undefined): StageView {
  const s = isServerStrength(strength) ? (strength as StudentStrength) : normalizeStrength(strength);
  const def = stageDef(s.stage);
  const isMax = s.nextStage === null || s.stage >= s.stageCount;
  const nextDef = isMax || s.nextStage == null ? null : stageDef(s.nextStage);
  return {
    stage: s.stage, stageCount: s.stageCount, def, name: def.name,
    totalPoints: s.totalPoints, totalMax: s.totalMax,
    withinStagePoints: s.withinStagePoints, stageSpan: s.stageSpan, nextStageRemaining: s.nextStageRemaining,
    percent: isMax ? 100 : s.percent,
    nextStage: isMax ? null : s.nextStage, nextDef, isMax,
    libraryPoints: s.libraryPoints, modulePoints: s.modulePoints,
  };
}

/** «بقيت 12 نقطة قوة» — the remaining points to the next stage (caller appends the destination). */
export function remainingPointsPhrase(remaining: number): string {
  const r = Math.max(1, Math.floor(Number(remaining) || 1));
  if (r === 1) return "بقيت نقطة قوة واحدة";
  if (r === 2) return "بقيت نقطتا قوة";
  return "بقي " + r + " نقطة قوة";
}
