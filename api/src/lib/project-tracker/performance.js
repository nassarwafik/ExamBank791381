// ONE pure project-performance calculator (no React, no network, no storage): a stage's share of the project
// (from the SAME trackWeights / stage weights / counted stages the progress math uses — never a second weighting
// system), a teacher score's weighted contribution, the project GRADE (0–100), the project-specific STRENGTH
// (0–600) and its six-band rank. Frontends only display these outputs.
//
//   stage project weight  = trackWeight(track) / Σ trackWeights  ×  stageWeight / Σ counted stage weights of the track  × 100
//   stage weighted score  = score / 100 × stage project weight          (ONLY while the stage is approved)
//   project grade         = Σ stage weighted scores                    (unapproved / unscored stages contribute 0; ≤ 100)
//   project progress      = summary.overallProgress (core.buildStudentSummary — canonical, never derived from the grade)
//   project Strength      = round((progress + grade) / 200 × 600), clamped 0..600
//   project rank bands    = 0–99 beginner · 100–199 bronze · 200–299 silver · 300–399 gold · 400–499 diamond · 500–600 legendary
//
// Grade precision is kept internally (gradePrecise); presentation rounds. Status (workflow) and score (quality) stay
// separate: a stage moved back from approved keeps its stored score but contributes 0 until approved again.
const core = require("./core");
const { SCORE_ERROR, normalizeScore, validateScoreInput } = require("./score");

const PROJECT_MAX_STRENGTH = 600;
const PROJECT_RANK_STEP = 100;
const RANK_ORDER = ["beginner", "bronze", "silver", "gold", "diamond", "legendary"];

function trackWeightShare(definition, trackId) {
  const weights = (definition && definition.trackWeights) || {};
  let num = 0, den = 0;
  for (const t of ((definition && definition.tracks) || [])) {
    const w = Number(weights[t.trackId]);
    const ww = Number.isFinite(w) && w >= 0 ? w : 50;     // same default as core.calculateOverall
    if (t.trackId === trackId) num = ww;
    den += ww;
  }
  return den > 0 ? num / den : 0;
}

/**
 * A stage's maximum contribution to the project (0–100). Only counted stages (active + required — the same set the
 * progress math uses) carry project value; inactive/optional stages → 0.
 */
function calculateStageProjectWeight(definition, stage) {
  if (!stage || !core.countedStages([stage], null).length) return 0;
  const counted = core.countedStages((definition && definition.stages) || [], stage.track);
  let total = 0;
  for (const s of counted) total += core.stageWeight(s);
  if (total <= 0) return 0;
  return trackWeightShare(definition, stage.track) * (core.stageWeight(stage) / total) * 100;
}

/** The score's weighted contribution — ONLY while the stage is approved and a valid score exists; else 0. */
function calculateStageWeightedScore(definition, stage, entry) {
  const status = core.stageStatus(entry ? { stages: { [stage.stageId]: entry } } : null, stage.stageId);
  const score = normalizeScore(entry && entry.score);
  if (status !== "approved" || score === null) return 0;
  return (score / 100) * calculateStageProjectWeight(definition, stage);
}

/** Per-stage performance rows keyed by stageId (only stages that carry project value are listed). */
function buildStageValues(definition, progressDoc) {
  const out = {};
  const stagesById = progressDoc && progressDoc.stages ? progressDoc.stages : {};
  for (const stage of ((definition && definition.stages) || [])) {
    const maxContribution = calculateStageProjectWeight(definition, stage);
    if (maxContribution <= 0) continue;
    const entry = stagesById[stage.stageId] || null;
    const score = normalizeScore(entry && entry.score);
    const status = core.stageStatus(progressDoc, stage.stageId);
    const counted = status === "approved" && score !== null;
    out[stage.stageId] = {
      stageId: stage.stageId,
      track: stage.track,
      status,
      score,
      maxContribution,
      contribution: counted ? (score / 100) * maxContribution : 0,
      counted
    };
  }
  return out;
}

/** Project grade 0–100 (precise): the sum of approved stages' weighted scores, capped at 100. */
function calculateProjectGrade(definition, progressDoc) {
  let total = 0;
  for (const row of Object.values(buildStageValues(definition, progressDoc))) total += row.contribution;
  return Math.min(100, Math.max(0, total));
}

const clampPercent = v => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0; };

/** Project-specific Strength 0–600: 50% progress + 50% grade. */
function calculateProjectStrength(progressPercent, projectGrade) {
  const raw = Math.round(((clampPercent(progressPercent) + clampPercent(projectGrade)) / 200) * PROJECT_MAX_STRENGTH);
  return Math.min(PROJECT_MAX_STRENGTH, Math.max(0, raw));
}

/** The six-band project rank for a project Strength (always a tier — a project starts at بذرة القوة). */
function projectStrengthTier(strength) {
  const s = Math.min(PROJECT_MAX_STRENGTH, Math.max(0, Number(strength) || 0));
  return RANK_ORDER[Math.min(Math.floor(s / PROJECT_RANK_STEP), RANK_ORDER.length - 1)];
}
function projectRankLevel(tier) { return RANK_ORDER.indexOf(tier) + 1; }

/**
 * Everything a project card / hero / stage list shows for ONE student in ONE project. `summary` is the canonical
 * core.buildStudentSummary output (progress authority); the grade never feeds progress and progress never feeds the grade.
 */
function buildProjectPerformanceSummary(definition, progressDoc, now, summary) {
  const s = summary || core.buildStudentSummary(definition, progressDoc, now);
  const gradePrecise = calculateProjectGrade(definition, progressDoc);
  const grade = Math.round(gradePrecise);
  const strength = calculateProjectStrength(s.overallProgress, gradePrecise);
  const tier = projectStrengthTier(strength);
  return {
    overallProgress: s.overallProgress,
    grade,
    gradePrecise,
    projectStrength: strength,
    maxStrength: PROJECT_MAX_STRENGTH,
    tier,
    level: projectRankLevel(tier),
    nextTier: RANK_ORDER[RANK_ORDER.indexOf(tier) + 1] || null,
    complete: s.complete === true,
    stageValues: buildStageValues(definition, progressDoc)
  };
}

module.exports = {
  PROJECT_MAX_STRENGTH, PROJECT_RANK_STEP, RANK_ORDER, SCORE_ERROR,
  normalizeScore, validateScoreInput,
  calculateStageProjectWeight, calculateStageWeightedScore, buildStageValues, calculateProjectGrade,
  calculateProjectStrength, projectStrengthTier, projectRankLevel, buildProjectPerformanceSummary
};
