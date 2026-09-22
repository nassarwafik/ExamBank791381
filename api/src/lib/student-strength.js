// UNIFIED STRENGTH POINTS (نقاط القوة) — the 25-STAGE progression policy behind the student's strength path.
//
// TWO authoritative sources feed ONE total, capped at 2000, split into 25 visible stages of 80 points each:
//
//   LIBRARY ITEMS  — T01–T30 (trainings) AND F01–F06 (final/Bagrut items) = 36 canonical items, each up to 40:
//                      libraryStrength(item) = round(bestPercentage × 40 / 100)   (0..40)
//                    ONE canonical best record per student/itemId (max-merge on retries), so the SAME item solved
//                    from the library OR from inside the Learning Reader contributes IDENTICALLY and is never
//                    double-counted — launch location can never change Strength. F items use the SERVER's
//                    gradable-only percentage (manual-review marks excluded from the denominator; see
//                    gradableStrengthPercentage), so an open-question final exam is never understated.
//                      library max = 36 × 40 = 1440
//   LEARNING MODULES — the 28 interactive book modules, each up to 20, derived from the student's UNIQUE eligible
//                    in-page Study-Practice completion (embedded T/F library cards belong to the library source and
//                    are NOT counted here — strict source separation, no double counting):
//                      moduleStrength(module) = round(clamp01(completed / total) × 20)   (0..20)
//                    Completion state, never a counter: repeating a completed activity never adds points.
//                      modules max = 28 × 20 = 560
//
//   totalStrengthPoints = min(libraryPoints + modulePoints, 2000)
//   stage               = min(floor(total / 80) + 1, 25)   → stage 1: 0–79, stage 2: 80–159, … stage 25: 1920–2000
//
// The old 6-rank / 400-point cadence and the old finalized-exam (×100) and project (×400) Strength sources are NO
// LONGER part of Strength: they are removed here so the 2000-point ceiling can never be exceeded. Medals stay
// exam-only (medals.ts) and projects keep their own separate per-project rank — neither is touched here.
// Pure module: no IO, no HTTP.

const LIBRARY_ITEM_MAX_POINTS = 40;
const MODULE_MAX_POINTS = 20;
const STAGE_SPAN = 80;
const STAGE_COUNT = 25;
const STRENGTH_TOTAL_MAX = STAGE_SPAN * STAGE_COUNT;   // 2000
// The ONE rule deciding which Learning-Practice ids feed the LIBRARY source: T-series AND F-series (both count now).
const LIBRARY_ITEM_ID = /^[TF]\d+$/;

/** A safe non-negative integer (NaN / negative / Infinity / malformed → 0). */
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
/** Total clamped into the valid Strength range [0, 2000]. */
function clampTotal(value) {
  return Math.min(STRENGTH_TOTAL_MAX, Math.max(0, safeCount(value)));
}

// ── LIBRARY source (T01–T30 + F01–F06) ────────────────────────────────────────────────────────────────────────
/** Whether a Learning-Practice id contributes to the LIBRARY Strength source: T01…T30 AND F01…F06 → true. */
function libraryItemCountsTowardStrength(id) {
  return LIBRARY_ITEM_ID.test(String(id || "").trim());
}
/** The ceiling advertised for one library id: 40 for a T/F item, 0 for anything else. */
function libraryItemMaxPoints(id) {
  return libraryItemCountsTowardStrength(id) ? LIBRARY_ITEM_MAX_POINTS : 0;
}
/** Strength of ONE library item from its best percentage: 100 → 40, 90 → 36, 80 → 32, 50 → 20, 0 → 0. */
function strengthFromLibraryBest(bestPercentage) {
  return roundPoints(clampPercent(bestPercentage) * LIBRARY_ITEM_MAX_POINTS / 100);
}
/** Strength of ONE library id from its best percentage — 0 for a non-library id whatever the percentage. */
function strengthFromLibraryResult(id, bestPercentage) {
  return libraryItemCountsTowardStrength(id) ? strengthFromLibraryBest(bestPercentage) : 0;
}
/** Library total from a trainings map { T01: { bestPercentage } , F01: { bestPercentage } … }: Σ per-item strength.
 *  Stored bestPoints are never trusted — re-derived from bestPercentage; ids that are not T/F add 0. */
function libraryPointsFromTrainings(trainings) {
  if (!trainings || typeof trainings !== "object") return 0;
  let total = 0;
  for (const [id, entry] of Object.entries(trainings)) {
    if (!entry || typeof entry !== "object") continue;
    total += strengthFromLibraryResult(id, entry.bestPercentage);
  }
  return total;
}

/**
 * The SERVER-authoritative gradable-only percentage of a graded item, used as the library best percentage so a
 * final exam with manually-reviewed / open questions is scored over the reliably auto-gradable portion ONLY (the
 * pending manual-review marks leave the denominator). For a fully auto-graded item (every T item, and F items with
 * no manual marks) this equals the ordinary percentage. All-manual item (no auto-gradable marks) → 0. Pure.
 *   gradable% = round( min(autoScore, autoMax) / autoMax × 100 ),  autoMax = totalMarks − manualReviewMarks
 */
function gradableStrengthPercentage({ score, totalMarks, manualReviewMarks } = {}) {
  const s = Math.max(0, Number(score) || 0);
  const total = Math.max(0, Number(totalMarks) || 0);
  const manual = Math.max(0, Number(manualReviewMarks) || 0);
  const autoMax = total - manual;
  if (autoMax <= 0) return 0;
  return Math.round(Math.min(s, autoMax) / autoMax * 100);
}

// ── LEARNING-MODULE source (28 book modules, in-page Study-Practice completion) ────────────────────────────────
/** Strength of ONE module from its unique eligible Study-Practice completion: round(clamp01(completed/total) × 20).
 *  A module with zero eligible activities (total 0) yields 0 here — its 20 points require real eligible activities. */
function strengthFromModuleCompletion(completed, total) {
  const t = safeCount(total);
  if (t <= 0) return 0;
  const c = Math.min(safeCount(completed), t);
  return roundPoints((c / t) * MODULE_MAX_POINTS);
}
/** Module total from { moduleId: { completed, total } } — every module re-derived, nothing stored is trusted. */
function modulePointsFromCompletion(moduleCompletion) {
  if (!moduleCompletion || typeof moduleCompletion !== "object") return 0;
  let total = 0;
  for (const entry of Object.values(moduleCompletion)) {
    if (!entry || typeof entry !== "object") continue;
    total += strengthFromModuleCompletion(entry.completed, entry.total);
  }
  return total;
}

// ── Stages ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The 1-based stage for a Strength total: stage 1 (0–79) … stage 25 (1920–2000). Clamped, deterministic. */
function stageForTotal(total) {
  return Math.min(Math.floor(clampTotal(total) / STAGE_SPAN) + 1, STAGE_COUNT);
}
/**
 * Progress within the current 80-point stage:
 *   { stage, stageCount, stageSpan, withinStagePoints, nextStageRemaining, percent, nextStage, totalMax }
 * At the top stage (25) the block is shown full (80 / 80, 100%) and nextStage is null.
 */
function stageProgress(total) {
  const t = clampTotal(total);
  const stage = stageForTotal(t);
  const top = stage >= STAGE_COUNT;
  const stageStart = (stage - 1) * STAGE_SPAN;
  const withinStagePoints = Math.min(t - stageStart, STAGE_SPAN);
  const nextStageRemaining = top ? 0 : STAGE_SPAN - withinStagePoints;
  const percent = Math.round((withinStagePoints / STAGE_SPAN) * 100);
  return { stage, stageCount: STAGE_COUNT, stageSpan: STAGE_SPAN, withinStagePoints, nextStageRemaining, percent, nextStage: top ? null : stage + 1, totalMax: STRENGTH_TOTAL_MAX };
}

/**
 * The student's full Strength summary (the dashboard / teacher payload):
 *   input  { trainings: { T01:{bestPercentage}, F01:{bestPercentage} … }, moduleCompletion: { moduleId:{completed,total} } }
 *   output { totalPoints, libraryPoints, modulePoints, stage, stageCount, stageSpan, withinStagePoints,
 *            nextStageRemaining, percent, nextStage, totalMax }
 * Missing input → 0 points, stage 1: fully backward compatible with an older/empty caller.
 */
function buildStrengthSummary({ trainings, moduleCompletion } = {}) {
  const libraryPoints = libraryPointsFromTrainings(trainings);
  const modulePoints = modulePointsFromCompletion(moduleCompletion);
  const totalPoints = clampTotal(libraryPoints + modulePoints);
  return { totalPoints, libraryPoints, modulePoints, ...stageProgress(totalPoints) };
}

module.exports = {
  LIBRARY_ITEM_MAX_POINTS, MODULE_MAX_POINTS, STAGE_SPAN, STAGE_COUNT, STRENGTH_TOTAL_MAX,
  clampPercent, roundPoints, safeCount, clampTotal,
  libraryItemCountsTowardStrength, libraryItemMaxPoints, strengthFromLibraryBest, strengthFromLibraryResult,
  libraryPointsFromTrainings, gradableStrengthPercentage,
  strengthFromModuleCompletion, modulePointsFromCompletion,
  stageForTotal, stageProgress, buildStrengthSummary,
  // ── Backward-compatible aliases (same NEW semantics) for existing callers ──
  // learning-practice.js re-derives each stored item's bestPoints through the library policy (T AND F now count):
  strengthFromTrainingResult: strengthFromLibraryResult,
  // learning-training.js advertises per-item eligibility + ceiling (T AND F eligible, max 40):
  trainingCountsTowardStrength: libraryItemCountsTowardStrength,
  trainingMaxStrengthPoints: libraryItemMaxPoints,
};
