// Phase 9B — Project Performance Foundation: the ONE pure EVALUATION summary of a student in a project.
//
// Storage model (canonical, unchanged): a stage score already lives ADDITIVELY on the student's progress document
// (`progress.stages[stageId].score`, a finite number 0–100 written by project-794589-progress.applyProgressUpdate
// through the CAS pipeline of service.updateStudentProgress, with a history event of type "score"). This module adds
// no store and writes nothing: it DERIVES, from that document and the class snapshot, what the teacher and the
// student need to see about the EVALUATION axis:
//
//   totalStages         — the ACTIVE stages of the class snapshot (the same gate the write path uses: only an active
//                         stage can be scored, so only an active stage can be "ungraded");
//   gradedStages        — active stages whose entry carries a valid score (0 IS a grade);
//   ungradedStages      — totalStages − gradedStages;
//   evaluationProgress  — round(gradedStages / totalStages × 100), 0 when the snapshot has no active stage;
//   projectScore        — the plain average of the graded stages' scores, rounded for display; projectScorePrecise
//                         keeps the unrounded value; BOTH are null while no stage is graded (never a fake 0);
//   stages[]            — one row per active stage in snapshot order (stageId, track, groupId, title, order,
//                         required, score | null, graded, status, scoredAt, scoredBy);
//   orphanStageIds[]    — stage ids that carry a score in the document but are no longer active in the snapshot
//                         (deleted / retired / deactivated stage): IGNORED by every count, surfaced only as ids so a
//                         teacher-side UI may mention them; they never crash and are never counted as ungraded;
//   updatedAt           — the newest score change (history "score" event, else the entry's updatedAt), "" when none.
//
// This is deliberately DIFFERENT from the existing `performance` model (performance.js): there, `grade` is the
// weighted sum of scores counted ONLY while a stage is approved and feeds the project Strength / tier. The evaluation
// summary counts every graded active stage regardless of its workflow status and feeds nothing else (Phase 9B scope:
// no Project Strength, no Global Strength, no ranks). `workflowProgress` (core.buildStudentSummary.overallProgress)
// and `evaluationProgress` are therefore exposed side by side and never conflated.
const { normalizeScore } = require("./score");

const EMPTY_STATUS = "not_started";
const STATUSES = ["not_started", "in_progress", "ready_for_review", "approved"];

const isActiveStage = stage => !!stage && stage.active === true && typeof stage.stageId === "string" && stage.stageId !== "";
const stampOf = value => { const t = Date.parse(String(value || "")); return Number.isFinite(t) ? t : 0; };

/** The latest history event of type "score" per stageId (a legacy document without history → empty map). */
function latestScoreEvents(progressDoc) {
  const out = new Map();
  const history = progressDoc && Array.isArray(progressDoc.history) ? progressDoc.history : [];
  for (const ev of history) {
    if (!ev || ev.type !== "score" || typeof ev.stageId !== "string") continue;
    const prev = out.get(ev.stageId);
    if (!prev || stampOf(ev.createdAt) >= stampOf(prev.createdAt)) out.set(ev.stageId, ev);
  }
  return out;
}

/**
 * Pure: (class snapshot / working definition, student progress document | null) → the evaluation summary described
 * above. Deterministic; no clock, no storage, no exceptions on malformed entries (a junk score is "not graded").
 */
function buildProjectEvaluation(definition, progressDoc) {
  const stages = (definition && Array.isArray(definition.stages) ? definition.stages : []).filter(isActiveStage);
  const entries = progressDoc && progressDoc.stages && typeof progressDoc.stages === "object" ? progressDoc.stages : {};
  const scoreEvents = latestScoreEvents(progressDoc);
  const rows = [];
  let graded = 0, sum = 0, newest = "";
  for (const stage of stages) {                                  // snapshot order (order is per track; the UI groups by track)
    const entry = entries[stage.stageId] && typeof entries[stage.stageId] === "object" ? entries[stage.stageId] : null;
    const score = normalizeScore(entry ? entry.score : null);
    const isGraded = score !== null;
    const ev = scoreEvents.get(stage.stageId) || null;
    const scoredAt = isGraded ? String((ev && ev.createdAt) || (entry && entry.updatedAt) || "") : "";
    const scoredBy = isGraded ? String((ev && ev.actor) || "") : "";
    if (isGraded) {
      graded += 1; sum += score;
      if (stampOf(scoredAt) > stampOf(newest)) newest = scoredAt;
    }
    rows.push({
      stageId: stage.stageId, track: stage.track, groupId: stage.groupId, title: stage.title || "", order: Number(stage.order) || 0,
      required: stage.required !== false,
      status: entry && STATUSES.includes(entry.status) ? entry.status : EMPTY_STATUS,
      score, graded: isGraded, scoredAt, scoredBy
    });
  }
  const activeIds = new Set(stages.map(s => s.stageId));
  const orphanStageIds = Object.keys(entries).filter(id => !activeIds.has(id) && normalizeScore(entries[id] && entries[id].score) !== null).sort();
  const total = rows.length;
  const precise = graded > 0 ? sum / graded : null;
  return {
    totalStages: total,
    gradedStages: graded,
    ungradedStages: total - graded,
    evaluationProgress: total > 0 ? Math.round((graded / total) * 100) : 0,
    projectScore: precise === null ? null : Math.round(precise),
    projectScorePrecise: precise,
    stages: rows,
    orphanStageIds,
    updatedAt: newest
  };
}

module.exports = { buildProjectEvaluation };
