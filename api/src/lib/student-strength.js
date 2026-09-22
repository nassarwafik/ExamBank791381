// UNIFIED STRENGTH POINTS (نقاط القوة) — the ONE progression policy behind the student's 25-STAGE Strength path.
//
// Four authoritative sources feed one RAW total; the visible path is 25 stages of 80 points (2000 points):
//
//   FINALIZED SCHOOL EXAMS — each CURRENT authoritative final assignment result   = round(clamp(final %, 0, 100))
//                        (0..100 per exam, uncapped total). A result contributes ONLY while its gradingStatus is
//                        "final" (pending manual review / in progress / scheduled / closed-without-final = 0); the
//                        value is always DERIVED from the current final percentage, never a stored/incremented
//                        counter, so a later teacher correction (70% → 85%, or 90% → 60%) moves it automatically.
//                        Examples: 100% = 100, 70% = 70, 20% = 20, 0% = 0.
//   LEARNING PRACTICE  — each of the 36 canonical Learning-Practice items (T01–T30 AND F01–F06), from its BEST
//                        percentage                                             = round(best × 40 / 100)  (≤ 40 each)
//                        36 × 40 = 1440. One item = ONE bucket, wherever it was opened (Training Library or the
//                        Learning-Materials Reader): the same id, the same best percentage, the same 40-point cap.
//   STUDY PRACTICE     — each of the 28 course modules, from its uniquely completed eligible in-page exercises
//                                                                               = round(completed / eligible × 20)  (≤ 20 each)
//                        28 × 20 = 560. Completion STATE, never a counter (see learning-study.js); a module without
//                        eligible exercises contributes 0. Library-training blocks embedded in a module are NOT study
//                        exercises — they belong only to their canonical 40-point Learning-Practice bucket.
//   PROJECTS           — each enrolled project's authoritative progress         = round(overallProgress × 4)  (≤ 400 each)
//
//   rawTotalPoints = examPoints + practicePoints + studyPoints + projectPoints           (never capped, never lost)
//   stagePoints    = min(rawTotalPoints, 2000)                                           (the VISIBLE path only)
//   stageNumber    = stagePoints ≥ 2000 ? 25 : floor(stagePoints / 80) + 1                (1..25 — there is NO stage 26)
//
// Learning Practice (1440) + Study Practice (560) = exactly the 2000 visible points by design; exams and projects can
// push the raw total beyond 2000 — that raw total is kept and reported, only the path presentation is capped.
//
// The SERVER is authoritative for every stage field below (buildStrengthSummary); the browser never derives a stage
// from a total. Practice points come from the per-student BEST percentage per item (retries only ever improve it,
// stored bestPoints are never trusted); project points are DERIVED from the current Project Tracker summary, never
// incremented. Medals stay exam-only and are not touched here. Pure module: no IO, no HTTP.
//
// LEGACY six-rank cadence (beginner … legendary, one tier per 400 raw points): kept ONLY so historical achievement
// events and their renderers stay readable (`legacyRank` on the summary, RANK_ORDER). It never decides the stage.

// ── Finalized school exams (each result contributes its rounded final percentage, 0..100) ─────────────────────
const FINALIZED_EXAM_MAX_POINTS = 100;

// ── Learning Practice (the 36 canonical items) ──────────────────────────────────────────────────────────────
const LEARNING_PRACTICE_MAX_POINTS = 40;
/** The ONE rule deciding which ids are canonical Learning-Practice items: T01…T30 and F01…F06 — nothing else. */
const LEARNING_PRACTICE_ITEM_ID = /^(?:T(?:0[1-9]|[12]\d|30)|F0[1-6])$/;
const LEARNING_PRACTICE_ITEM_COUNT = 36;
const LEARNING_PRACTICE_MAX_TOTAL = LEARNING_PRACTICE_ITEM_COUNT * LEARNING_PRACTICE_MAX_POINTS;   // 1440

// ── Study Practice (the 28 modules) ─────────────────────────────────────────────────────────────────────────
const STUDY_MODULE_MAX_POINTS = 20;
const STUDY_MODULE_COUNT = 28;
const STUDY_MAX_TOTAL = STUDY_MODULE_COUNT * STUDY_MODULE_MAX_POINTS;                                // 560

// ── Projects ────────────────────────────────────────────────────────────────────────────────────────────────
const PROJECT_MAX_STRENGTH_POINTS = 400;

// ── The visible 25-stage path ───────────────────────────────────────────────────────────────────────────────
const STRENGTH_STAGE_COUNT = 25;
const STRENGTH_STAGE_POINTS = 80;
const STRENGTH_STAGE_MAX_POINTS = STRENGTH_STAGE_COUNT * STRENGTH_STAGE_POINTS;                       // 2000

// ── LEGACY six-rank cadence (historical events only — never the stage) ──────────────────────────────────────
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

/** Exam contribution of ONE finalized result: its FINAL percentage, clamped to 0..100 and rounded half-up
 *  (100 → 100, 70 → 70, 20 → 20, 0 → 0, 84.5 → 85; NaN / <0 / >100 → safe 0..100). */
function examStrengthFromPercentage(finalPercentage) {
  return roundPoints(clampPercent(finalPercentage));
}
/** Exam total: the sum of every CURRENT FINAL result's rounded percentage. The caller passes only the percentages
 *  of results whose gradingStatus is "final" (see student-dashboard / manage-students) — pending review and every
 *  non-final state are simply absent, contributing 0. A non-array (an older caller / no assignments) → 0. This is
 *  DERIVED each time from the authoritative percentages, never a stored counter, so corrections move it. */
function examPointsFromFinalizedResults(finalizedPercentages) {
  if (!Array.isArray(finalizedPercentages)) return 0;
  let total = 0;
  for (const pct of finalizedPercentages) total += examStrengthFromPercentage(pct);
  return total;
}
/** Whether an id is a canonical Learning-Practice item (T01…T30, F01…F06) — every one of them feeds Strength. */
function isLearningPracticeItem(trainingId) {
  return LEARNING_PRACTICE_ITEM_ID.test(String(trainingId || "").trim());
}
/** Practice contribution of ONE item from its best percentage: 25 → 10, 40 → 16, 50 → 20, 60 → 24, 75 → 30, 80 → 32, 90 → 36, 100 → 40. */
function strengthFromTrainingBest(bestPercentage) {
  return roundPoints(clampPercent(bestPercentage) * LEARNING_PRACTICE_MAX_POINTS / 100);
}
/** The ceiling advertised for one id: 40 for every canonical item, 0 for an unknown id. */
function trainingMaxStrengthPoints(trainingId) {
  return isLearningPracticeItem(trainingId) ? LEARNING_PRACTICE_MAX_POINTS : 0;
}
/** Practice contribution of ONE id from its best percentage — 0 for an unknown id whatever the percentage. */
function strengthFromTrainingResult(trainingId, bestPercentage) {
  return isLearningPracticeItem(trainingId) ? strengthFromTrainingBest(bestPercentage) : 0;
}
/** Project contribution from authoritative overallProgress: 0 → 0, 1 → 4, 25 → 100, 50 → 200, 75 → 300, 100 → 400. */
function strengthFromProjectProgress(overallProgress) {
  return roundPoints(clampPercent(overallProgress) * PROJECT_MAX_STRENGTH_POINTS / 100);
}
/** Practice total from a trainings map { T01: { bestPercentage } … }: ONE bucket per id, stored bestPoints are never
 *  trusted (re-derived from bestPercentage), and an entry under an unknown id adds 0 whatever it contains. */
function practicePointsFromTrainings(trainings) {
  if (!trainings || typeof trainings !== "object") return 0;
  let total = 0;
  for (const [trainingId, entry] of Object.entries(trainings)) {
    if (!entry || typeof entry !== "object") continue;
    total += strengthFromTrainingResult(trainingId, entry.bestPercentage);
  }
  return total;
}

/** Study points of ONE module from { completed, eligible }: eligible 0 → 0, else round(min(completed, eligible) /
 *  eligible × 20), clamped to 0..20. 25% → 5, 50% → 10, 75% → 15, 100% → 20. */
function studyPointsForModule(moduleState) {
  const eligible = safeCount(moduleState && moduleState.eligible);
  if (eligible === 0) return 0;
  const completed = Math.min(safeCount(moduleState && moduleState.completed), eligible);
  return Math.min(STUDY_MODULE_MAX_POINTS, Math.max(0, roundPoints(completed / eligible * STUDY_MODULE_MAX_POINTS)));
}
/** Study total from { moduleId: { completed, eligible } } — every module re-derived, nothing stored is trusted. */
function studyPointsFromModules(study) {
  if (!study || typeof study !== "object") return 0;
  let total = 0;
  for (const moduleState of Object.values(study)) total += studyPointsForModule(moduleState);
  return total;
}

/**
 * The visible 25-stage path for a RAW total — the ONE stage formula (server authority):
 *   stagePoints = min(raw, 2000) · stageNumber = stagePoints ≥ 2000 ? 25 : floor(stagePoints / 80) + 1
 *   stageFloor = (stageNumber − 1) × 80 · withinStagePoints = clamp(stagePoints − stageFloor, 0, 80)
 *   stagePercent = round(withinStagePoints × 100 / 80)
 *   stages 1–24: nextStageNumber = stageNumber + 1, nextStageRemaining = 80 − withinStagePoints
 *   stage 25:    nextStageNumber = null, nextStageRemaining = 0 (there is NO stage 26); pointsToMaximum says how far
 *                the path is from complete (2000), and pathComplete flags 2000 / 2000.
 */
function strengthStageProgress(rawTotalPoints) {
  const raw = safeCount(rawTotalPoints);
  const stagePoints = Math.min(raw, STRENGTH_STAGE_MAX_POINTS);
  const isMaximumStage = stagePoints >= (STRENGTH_STAGE_COUNT - 1) * STRENGTH_STAGE_POINTS;
  const stageNumber = isMaximumStage ? STRENGTH_STAGE_COUNT : Math.floor(stagePoints / STRENGTH_STAGE_POINTS) + 1;
  const stageFloor = (stageNumber - 1) * STRENGTH_STAGE_POINTS;
  const withinStagePoints = Math.min(STRENGTH_STAGE_POINTS, Math.max(0, stagePoints - stageFloor));
  const stagePercent = Math.round(withinStagePoints * 100 / STRENGTH_STAGE_POINTS);
  const pointsToMaximum = STRENGTH_STAGE_MAX_POINTS - stagePoints;
  return {
    rawTotalPoints: raw,
    stagePoints,
    stageMaxPoints: STRENGTH_STAGE_MAX_POINTS,
    stageNumber,
    stageCount: STRENGTH_STAGE_COUNT,
    stageBlockSize: STRENGTH_STAGE_POINTS,
    stageFloor,
    withinStagePoints,
    stagePercent,
    nextStageNumber: isMaximumStage ? null : stageNumber + 1,
    nextStageRemaining: isMaximumStage ? 0 : STRENGTH_STAGE_POINTS - withinStagePoints,
    pointsToMaximum,
    isMaximumStage,
    pathComplete: pointsToMaximum === 0
  };
}

// ── LEGACY six-rank helpers (historical achievement events only) ────────────────────────────────────────────
/** LEGACY: the six-rank tier for a raw total (null below 400, one tier per 400, capped at legendary). Never the stage. */
function rankTierFromStrength(totalPoints) {
  const total = safeCount(totalPoints);
  if (total < RANK_STEP_STRENGTH_POINTS) return null;
  return RANK_ORDER[Math.min(Math.floor(total / RANK_STEP_STRENGTH_POINTS) - 1, RANK_ORDER.length - 1)];
}
/** LEGACY: the six-rank block progress { tier, level, nextTier, levelBlockSize, withinLevelPoints, nextLevelRemaining, percent }. */
function legacyRankProgress(totalPoints) {
  const total = safeCount(totalPoints);
  const tier = rankTierFromStrength(total);
  const level = tier ? RANK_ORDER.indexOf(tier) + 1 : 0;
  const top = tier === RANK_ORDER[RANK_ORDER.length - 1];
  const withinLevelPoints = top ? RANK_STEP_STRENGTH_POINTS : total % RANK_STEP_STRENGTH_POINTS;
  const nextLevelRemaining = top ? 0 : RANK_STEP_STRENGTH_POINTS - withinLevelPoints;
  const percent = top ? 100 : Math.round((withinLevelPoints / RANK_STEP_STRENGTH_POINTS) * 100);
  const nextTier = top ? null : RANK_ORDER[level];
  return { tier, level, nextTier, levelBlockSize: RANK_STEP_STRENGTH_POINTS, withinLevelPoints, nextLevelRemaining, percent };
}

/**
 * The student's full Strength summary (the dashboard payload):
 *   input  { finalizedPercentages: number[] (each CURRENT final result's %), trainings, projects: [{ projectCode, overallProgress }], study: { moduleId: { completed, eligible } } }
 *   output { rawTotalPoints, totalPoints (= rawTotalPoints), examPoints, practicePoints, studyPoints, projectPoints,
 *            stagePoints, stageMaxPoints, stageNumber, stageCount, stageBlockSize, stageFloor, withinStagePoints,
 *            stagePercent, nextStageNumber, nextStageRemaining, pointsToMaximum, isMaximumStage, pathComplete,
 *            legacyRank: { tier, level, nextTier, … }   (historical events only — never decides the stage)
 *            projects: [{ projectCode, overallProgress, strengthPoints }] }
 *   `study` absent (a student with no study document, an older caller) → studyPoints 0.
 */
function buildStrengthSummary({ finalizedPercentages, trainings, projects, study } = {}) {
  const examPoints = examPointsFromFinalizedResults(finalizedPercentages);
  const practicePoints = practicePointsFromTrainings(trainings);
  const studyPoints = studyPointsFromModules(study);
  const projectRows = (Array.isArray(projects) ? projects : []).map(p => {
    const overallProgress = Math.round(clampPercent(p && p.overallProgress));
    return { projectCode: String((p && p.projectCode) || ""), overallProgress, strengthPoints: strengthFromProjectProgress(overallProgress) };
  });
  const projectPoints = projectRows.reduce((sum, p) => sum + p.strengthPoints, 0);
  const rawTotalPoints = examPoints + practicePoints + studyPoints + projectPoints;
  const stage = strengthStageProgress(rawTotalPoints);
  return { ...stage, totalPoints: rawTotalPoints, examPoints, practicePoints, studyPoints, projectPoints, legacyRank: legacyRankProgress(rawTotalPoints), projects: projectRows };
}

module.exports = {
  FINALIZED_EXAM_MAX_POINTS,
  LEARNING_PRACTICE_MAX_POINTS, LEARNING_PRACTICE_ITEM_ID, LEARNING_PRACTICE_ITEM_COUNT, LEARNING_PRACTICE_MAX_TOTAL,
  STUDY_MODULE_MAX_POINTS, STUDY_MODULE_COUNT, STUDY_MAX_TOTAL,
  PROJECT_MAX_STRENGTH_POINTS,
  STRENGTH_STAGE_COUNT, STRENGTH_STAGE_POINTS, STRENGTH_STAGE_MAX_POINTS,
  RANK_STEP_STRENGTH_POINTS, RANK_ORDER,
  clampPercent, examStrengthFromPercentage, examPointsFromFinalizedResults, isLearningPracticeItem, strengthFromTrainingBest, trainingMaxStrengthPoints,
  strengthFromTrainingResult, strengthFromProjectProgress, practicePointsFromTrainings,
  studyPointsForModule, studyPointsFromModules,
  strengthStageProgress, rankTierFromStrength, legacyRankProgress, buildStrengthSummary
};
