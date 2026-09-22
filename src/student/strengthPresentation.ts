// Unified Strength (نقاط القوة) — PRESENTATION of the server's `dashboard.strength` (the 25-stage path).
//
// Authority contract (one policy, on the server — api/src/lib/student-strength.js):
//   • `strength` payload present and well-formed → it is trusted COMPLETELY: stageNumber, stagePoints, withinStagePoints,
//     stagePercent, nextStageNumber, nextStageRemaining, pointsToMaximum … are the server's values. Nothing here
//     divides, floors or compares a total against a threshold; the helpers below only shape and label those values
//     (stage number → Arabic title / artwork is presentation, not policy).
//   • no `strength` payload, or a malformed / incomplete one (a missing or non-numeric stage field, a stage outside
//     1..25) → `null`: the portal shows an explicit "unavailable" state. There is deliberately NO client-side fallback
//     that would derive a stage from points — the browser must never compute the stage.
import { stageVisual, type StageVisual } from "../studentStageVisuals";
import { RANK_ORDER, type RankTier } from "../studentRank";
import type { LegacyRank, ProjectStrength, StudentStrength } from "./types";

const NUMERIC_FIELDS = ["examPoints", "practicePoints", "projectPoints", "stagePoints", "stageMaxPoints", "stageNumber", "stageCount", "stageBlockSize", "withinStagePoints", "stagePercent", "nextStageRemaining"] as const;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isTierOrNull = (v: unknown): v is RankTier | null => v === null || (typeof v === "string" && (RANK_ORDER as string[]).includes(v));
const nonNegativeInt = (value: number): number => (value > 0 ? Math.trunc(value) : 0);

/** True when `raw` is a complete, well-formed server Strength payload (the documented acceptance rule). */
export function isServerStrength(raw: unknown): raw is StudentStrength {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (!NUMERIC_FIELDS.every(k => isFiniteNumber(r[k]))) return false;
  if (!isFiniteNumber(r.rawTotalPoints) && !isFiniteNumber(r.totalPoints)) return false;
  const stage = r.stageNumber as number, count = r.stageCount as number;
  if (!Number.isInteger(stage) || stage < 1 || stage > count) return false;
  if (!(r.nextStageNumber === null || isFiniteNumber(r.nextStageNumber))) return false;
  return Array.isArray(r.projects);
}

/** Which authority `normalizeStrength` would use for a raw payload — "server" or none ("unavailable"). */
export function strengthAuthority(raw: unknown): "server" | "unavailable" {
  return isServerStrength(raw) ? "server" : "unavailable";
}

function legacyRankOf(raw: unknown): LegacyRank | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isTierOrNull(r.tier) || !isTierOrNull(r.nextTier)) return null;
  return { tier: r.tier, nextTier: r.nextTier, level: isFiniteNumber(r.level) ? nonNegativeInt(r.level) : 0, levelBlockSize: isFiniteNumber(r.levelBlockSize) ? nonNegativeInt(r.levelBlockSize) : 0, withinLevelPoints: isFiniteNumber(r.withinLevelPoints) ? nonNegativeInt(r.withinLevelPoints) : 0, nextLevelRemaining: isFiniteNumber(r.nextLevelRemaining) ? nonNegativeInt(r.nextLevelRemaining) : 0, percent: isFiniteNumber(r.percent) ? nonNegativeInt(r.percent) : 0 };
}

/** A well-formed StudentStrength from the server payload, or null when there is no trustworthy payload. */
export function normalizeStrength(raw: unknown): StudentStrength | null {
  if (!isServerStrength(raw)) return null;
  const r = raw as unknown as Record<string, unknown>;
  const projects: ProjectStrength[] = (r.projects as unknown[])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map(x => ({ projectCode: String(x.projectCode || ""), overallProgress: isFiniteNumber(x.overallProgress) ? nonNegativeInt(x.overallProgress) : 0, strengthPoints: isFiniteNumber(x.strengthPoints) ? nonNegativeInt(x.strengthPoints) : 0 }));
  const rawTotal = nonNegativeInt(isFiniteNumber(r.rawTotalPoints) ? r.rawTotalPoints : (r.totalPoints as number));
  const stagePoints = nonNegativeInt(r.stagePoints as number), stageMaxPoints = nonNegativeInt(r.stageMaxPoints as number);
  // Shape only: integers where the contract is integral; every progression value is the server's.
  return {
    rawTotalPoints: rawTotal, totalPoints: rawTotal,
    examPoints: nonNegativeInt(r.examPoints as number), practicePoints: nonNegativeInt(r.practicePoints as number), projectPoints: nonNegativeInt(r.projectPoints as number),
    studyPoints: isFiniteNumber(r.studyPoints) ? nonNegativeInt(r.studyPoints) : 0,
    stagePoints, stageMaxPoints, stageCount: nonNegativeInt(r.stageCount as number), stageBlockSize: nonNegativeInt(r.stageBlockSize as number),
    stageNumber: r.stageNumber as number,
    stageFloor: isFiniteNumber(r.stageFloor) ? nonNegativeInt(r.stageFloor) : 0,
    withinStagePoints: nonNegativeInt(r.withinStagePoints as number), stagePercent: Math.min(100, nonNegativeInt(r.stagePercent as number)),
    nextStageNumber: r.nextStageNumber === null ? null : nonNegativeInt(r.nextStageNumber as number) || null,
    nextStageRemaining: nonNegativeInt(r.nextStageRemaining as number),
    pointsToMaximum: isFiniteNumber(r.pointsToMaximum) ? nonNegativeInt(r.pointsToMaximum) : Math.max(0, stageMaxPoints - stagePoints),
    isMaximumStage: r.isMaximumStage === true || r.nextStageNumber === null,
    pathComplete: r.pathComplete === true || (isFiniteNumber(r.pointsToMaximum) && r.pointsToMaximum === 0),
    legacyRank: legacyRankOf(r.legacyRank),
    projects,
  };
}

/** What the progress section renders for the stage: the current visual, the next one (null at stage 25) and copy. */
export type StagePresentation = {
  current: StageVisual;
  next: StageVisual | null;
  /** «المرحلة 7 من 25» */
  stageLabel: string;
  /** The accessible name of the ring's progressbar. */
  progressLabel: string;
  /** The "remaining" sentence under the ring: toward the next stage, toward completing the path, or the completion note. */
  remainingText: string;
};

/** «بقي 50 نقطة قوة» — natural singular / dual / plural. */
export function remainingStrengthPhrase(remaining: number): string {
  const r = Math.max(1, Math.floor(Number(remaining) || 1));
  if (r === 1) return "بقيت نقطة قوة واحدة";
  if (r === 2) return "بقيت نقطتا قوة";
  return "بقي " + r + " نقطة قوة";
}

/** The stage presentation from the SERVER's values (never recomputed from a total). */
export function stagePresentationFromStrength(strength: StudentStrength): StagePresentation {
  const current = stageVisual(strength.stageNumber);
  const next = strength.nextStageNumber !== null && strength.nextStageNumber > strength.stageNumber ? stageVisual(strength.nextStageNumber) : null;
  const stageLabel = "المرحلة " + strength.stageNumber + " من " + strength.stageCount;
  if (next) {
    return { current, next, stageLabel, progressLabel: "التقدم نحو المرحلة " + next.stageNumber + " — " + next.title, remainingText: remainingStrengthPhrase(strength.nextStageRemaining) + " للوصول إلى المرحلة " + next.stageNumber + " — " + next.title };
  }
  if (strength.pathComplete || strength.pointsToMaximum === 0) {
    return { current, next: null, stageLabel, progressLabel: "اكتمال مسار القوة", remainingText: "أكملت مسار القوة" };
  }
  return { current, next: null, stageLabel, progressLabel: "التقدم نحو إكمال مسار القوة", remainingText: remainingStrengthPhrase(strength.pointsToMaximum) + " لإكمال مسار القوة" };
}

/** The project contribution row for one project code (null when the server reported none). */
export function projectContribution(strength: StudentStrength | null | undefined, projectCode: string): ProjectStrength | null {
  return strength?.projects.find(p => p.projectCode === projectCode) ?? null;
}
