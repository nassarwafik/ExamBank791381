// UNIFIED STRENGTH POINTS (نقاط القوة) — the ONE progression policy behind the student's six rank images.
//
// Three authoritative sources feed one total; the SAME six ranks (beginner … legendary) remain the visual
// progression — no project rank, no training rank, no exam rank, no second image set:
//
//   FINALIZED EXAMS   — each server-finalized assignment result            = 100 points
//   T-SERIES PRACTICE — each unique training's BEST percentage             = round(best × 25 / 100)  (≤ 25)
//                       ONLY the T-series trainings (T01, T02, …) count. The F-series «امتحانات نهائية للتدريب»
//                       (F01–F06) are solved through the same Learning-Practice runner and keep a best result for
//                       practice history, but contribute 0 — their open questions cannot be auto-graded, so their
//                       automatic percentage must never move a rank (see trainingCountsTowardStrength).
//   PROJECTS          — each enrolled project's authoritative progress     = round(overallProgress × 4)  (≤ 400)
//
//   totalStrengthPoints = examPoints + practicePoints + projectPoints
//   rank tier           = floor(total / 400): 0–399 none · 400 beginner · 800 bronze · 1200 silver · 1600 gold ·
//                         2000 diamond · 2400+ legendary (no level 7)
//
// BACKWARD COMPATIBILITY: with zero practice and zero project points, 4 finalized exams = 400 points, so the
// historical "one tier per four finalized exams" boundaries (3/4, 7/8, 11/12, 15/16, 19/20, 23/24) are unchanged.
//
// PROJECT POINTS ARE DERIVED, NEVER INCREMENTED: they follow the CURRENT authoritative Project Tracker summary
// (`core.buildStudentSummary(...).overallProgress`, approved weighted stages). Repeated reads or status flips never
// stack points, there is no counter to farm, and a deliberate teacher reset/correction lowers the contribution.
// Practice points come from the per-student BEST percentage per training (retries only ever improve it).
// Medals stay exam-only and are not touched here. Pure module: no IO, no HTTP.

const FINALIZED_EXAM_STRENGTH_POINTS = 100;
const TRAINING_MAX_STRENGTH_POINTS = 25;
// The ONE rule deciding which Learning-Practice ids feed Strength: the T-series only (id = "T" + digits).
const STRENGTH_TRAINING_ID = /^T\d+$/;
const PROJECT_MAX_STRENGTH_POINTS = 400;
const RANK_STEP_STRENGTH_POINTS = 400;
const RANK_ORDER = ["beginner", "bronze", "silver", "gold", "diamond", "legendary"];

/** A safe non-negative integer count (NaN / negative / Infinity / malformed → 0). */
function safeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
/** A percentage clamped to 0..100 (NaN / malformed → 0). Deterministic. */
function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
/** Deterministic half-up rounding for non-negative values. */
function roundPoints(value) {
  return Math.round(Number(value) || 0);
}

/** Exam contribution: finalized count × 100. */
function strengthFromFinalizedCount(finalizedCount) {
  return safeCount(finalizedCount) * FINALIZED_EXAM_STRENGTH_POINTS;
}
/** Practice contribution of ONE T-series training from its best percentage: 40 → 10, 60 → 15, 80 → 20, 100 → 25. */
function strengthFromTrainingBest(bestPercentage) {
  return roundPoints(clampPercent(bestPercentage) * TRAINING_MAX_STRENGTH_POINTS / 100);
}
/** Whether a Learning-Practice id contributes to Strength: T01…T30 → true; F01…F06 (and anything else) → false. */
function trainingCountsTowardStrength(trainingId) {
  return STRENGTH_TRAINING_ID.test(String(trainingId || "").trim());
}
/** The ceiling advertised for one id: 25 for a T-series training, 0 for an F-series final exam for training. */
function trainingMaxStrengthPoints(trainingId) {
  return trainingCountsTowardStrength(trainingId) ? TRAINING_MAX_STRENGTH_POINTS : 0;
}
/** Practice contribution of ONE id from its best percentage — 0 for every non-T id whatever the percentage. */
function strengthFromTrainingResult(trainingId, bestPercentage) {
  return trainingCountsTowardStrength(trainingId) ? strengthFromTrainingBest(bestPercentage) : 0;
}
/** Project contribution from authoritative overallProgress: 0 → 0, 1 → 4, 25 → 100, 50 → 200, 75 → 300, 100 → 400. */
function strengthFromProjectProgress(overallProgress) {
  return roundPoints(clampPercent(overallProgress) * PROJECT_MAX_STRENGTH_POINTS / 100);
}
/** Practice total from a trainings map { T01: { bestPercentage } … }: stored bestPoints are never trusted, and an
 *  entry stored under a non-T id (F01–F06 practice history) adds 0 whatever it contains. */
function practicePointsFromTrainings(trainings) {
  if (!trainings || typeof trainings !== "object") return 0;
  let total = 0;
  for (const [trainingId, entry] of Object.entries(trainings)) {
    if (!entry || typeof entry !== "object") continue;
    total += strengthFromTrainingResult(trainingId, entry.bestPercentage);
  }
  return total;
}

/** Rank tier for a total: null below 400, then one tier per 400, capped at legendary. */
function rankTierFromStrength(totalPoints) {
  const total = safeCount(totalPoints);
  if (total < RANK_STEP_STRENGTH_POINTS) return null;
  return RANK_ORDER[Math.min(Math.floor(total / RANK_STEP_STRENGTH_POINTS) - 1, RANK_ORDER.length - 1)];
}
/**
 * Progress within the current 400-point block: { tier, level, nextTier, withinLevelPoints, nextLevelRemaining,
 * percent }. Before the first rank the block is 0..399 toward beginner. At the top rank the block is shown full
 * (400 / 400, 100%) — a decorative flourish, there is no next tier.
 */
function strengthProgress(totalPoints) {
  const total = safeCount(totalPoints);
  const tier = rankTierFromStrength(total);
  const level = tier ? RANK_ORDER.indexOf(tier) + 1 : 0;
  const top = tier === RANK_ORDER[RANK_ORDER.length - 1];
  const withinLevelPoints = top ? RANK_STEP_STRENGTH_POINTS : total % RANK_STEP_STRENGTH_POINTS;
  const nextLevelRemaining = top ? 0 : RANK_STEP_STRENGTH_POINTS - withinLevelPoints;
  const percent = top ? 100 : Math.round((withinLevelPoints / RANK_STEP_STRENGTH_POINTS) * 100);
  const nextTier = top ? null : RANK_ORDER[level];   // level is 0-based index of the NEXT tier (beginner when unranked)
  return { tier, level, nextTier, levelBlockSize: RANK_STEP_STRENGTH_POINTS, withinLevelPoints, nextLevelRemaining, percent };
}

/**
 * The student's full Strength summary (the dashboard payload):
 *   input  { finalizedCount, trainings, projects: [{ projectCode, overallProgress }] }
 *   output { totalPoints, examPoints, practicePoints, projectPoints, levelBlockSize, withinLevelPoints,
 *            nextLevelRemaining, percent, tier, level, nextTier, projects: [{ projectCode, overallProgress, strengthPoints }] }
 */
function buildStrengthSummary({ finalizedCount, trainings, projects } = {}) {
  const examPoints = strengthFromFinalizedCount(finalizedCount);
  const practicePoints = practicePointsFromTrainings(trainings);
  const projectRows = (Array.isArray(projects) ? projects : []).map(p => {
    const overallProgress = Math.round(clampPercent(p && p.overallProgress));
    return { projectCode: String((p && p.projectCode) || ""), overallProgress, strengthPoints: strengthFromProjectProgress(overallProgress) };
  });
  const projectPoints = projectRows.reduce((sum, p) => sum + p.strengthPoints, 0);
  const totalPoints = examPoints + practicePoints + projectPoints;
  const progress = strengthProgress(totalPoints);
  return { totalPoints, examPoints, practicePoints, projectPoints, ...progress, projects: projectRows };
}

module.exports = {
  FINALIZED_EXAM_STRENGTH_POINTS, TRAINING_MAX_STRENGTH_POINTS, PROJECT_MAX_STRENGTH_POINTS, RANK_STEP_STRENGTH_POINTS, RANK_ORDER,
  clampPercent, strengthFromFinalizedCount, strengthFromTrainingBest, trainingCountsTowardStrength, trainingMaxStrengthPoints,
  strengthFromTrainingResult, strengthFromProjectProgress, practicePointsFromTrainings,
  rankTierFromStrength, strengthProgress, buildStrengthSummary
};
