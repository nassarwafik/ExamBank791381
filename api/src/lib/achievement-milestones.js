// Milestone recording — the SERVER compares authoritative before/after states and creates at most ONE achievement
// event per newly reached milestone (deterministic create-only ids). React never decides a milestone.
//
//   global_rank_up   : the student's UNIFIED Strength STAGE (student-strength.js, the 25-stage path) rose above the
//                      last observed stage. Evaluated at the ONE place the total Strength is built (the student
//                      dashboard), against the persisted observation in platform/recognition/<studentId>.json — so a
//                      change from ANY source (finalized exam, practice best, study, project progress) is caught on
//                      the next portal load. The first observation only records the baseline (no retroactive event
//                      for an already-reached stage). The event keeps its historical type name and carries
//                      `stage: { stageNumber, stageCount }` plus the LEGACY `rank` (six-rank tier) so older renderers
//                      and stored events stay readable; the legacy tier never decides the milestone.
//   project_rank_up  : ONE project's Strength (/600) tier rose in a real progress mutation (before vs after docs).
//   project_complete : the first not-complete → complete transition of a project.
// A jump over several tiers records ONE event for the final tier; a decrease (reset / correction) records nothing.
const { downloadJsonOrNull, uploadJson } = require("./platform-storage");
const { recordAchievementEvent } = require("./achievement-feed");
const perf = require("./project-tracker/performance");

const RECOGNITION_PREFIX = "platform/recognition/";
const recognitionDocName = studentId => RECOGNITION_PREFIX + String(studentId) + ".json";

const tierIndex = (order, tier) => (tier ? order.indexOf(tier) : -1);
const stageOf = strength => { const n = Number(strength && strength.stageNumber); return Number.isInteger(n) && n >= 1 ? n : 0; };

/**
 * Global stage milestone: returns the stage number of the event created now, or null. Best-effort (never throws).
 * Steady state is WRITE-FREE: the observation doc is written only on first sight (baseline — an already-reached
 * stage is never posted retroactively; a document from the six-rank era, without `lastGlobalStage`, is a first
 * sight) and when the stage changes. Stage 1 is the zero-point start, never an event. Reads/writes go through the
 * dashboard's seams. The LEGACY `lastGlobalTier` field keeps being written for older readers — it decides nothing.
 */
async function recordGlobalRankMilestone(container, { student, classId, strength, now }, deps = {}) {
  try {
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const up = deps.uploadJson || uploadJson;
    const studentId = String(student && student.userId || "");
    const currentStage = stageOf(strength);
    const legacy = strength && strength.legacyRank && typeof strength.legacyRank === "object" ? strength.legacyRank : { tier: null, level: 0 };
    if (!studentId || !currentStage) return null;
    const existing = await dl(container, recognitionDocName(studentId));
    const first = !existing || typeof existing !== "object" || !Object.prototype.hasOwnProperty.call(existing, "lastGlobalStage");
    const previous = first ? 0 : stageOf({ stageNumber: existing.lastGlobalStage });
    if (first || previous !== currentStage) {
      await up(container, recognitionDocName(studentId), { ...(existing && typeof existing === "object" ? existing : { schemaVersion: 1, studentId }), lastGlobalStage: currentStage, lastGlobalTier: legacy.tier || null, lastGlobalPoints: Number(strength && strength.totalPoints || 0), updatedAt: now || new Date().toISOString() });
    }
    if (first || currentStage <= 1 || !classId) return null;
    if (currentStage <= previous) return null;
    const created = await recordAchievementEvent(container, {
      eventType: "global_rank_up", postId: "global_stage_" + String(currentStage).padStart(2, "0") + "_" + studentId, classId, studentId,
      studentDisplayName: student.displayName, shareWithClass: student.shareAchievements !== false, now,
      stage: { stageNumber: currentStage, stageCount: Number(strength.stageCount || 25) },
      rank: { tier: legacy.tier || "", level: Number(legacy.level || 0), points: Number(strength.totalPoints || 0) }
    });
    return created ? currentStage : null;
  } catch {
    return null;
  }
}

/** Project milestones from a real mutation: [ "rank" | "complete" ] events created now. Best-effort. */
async function recordProjectMilestones(container, { classId, student, projectCode, projectTitle, workDef, before, after, now }) {
  const created = [];
  try {
    const studentId = String(student && student.studentId || student && student.userId || "");
    if (!classId || !studentId) return created;
    const b = perf.buildProjectPerformanceSummary(workDef, before || null, now);
    const a = perf.buildProjectPerformanceSummary(workDef, after || null, now);
    const base = { classId, studentId, studentDisplayName: student.displayName, shareWithClass: student.shareAchievements !== false, now };
    if (tierIndex(perf.RANK_ORDER, a.tier) > tierIndex(perf.RANK_ORDER, b.tier)) {
      const ok = await recordAchievementEvent(container, {
        ...base, eventType: "project_rank_up", postId: "project_" + projectCode + "_rank_" + a.tier + "_" + studentId,
        project: { projectCode: String(projectCode), title: String(projectTitle || ""), tier: a.tier, level: a.level, projectStrength: a.projectStrength }
      });
      if (ok) created.push("rank");
    }
    if (!b.complete && a.complete) {
      const ok = await recordAchievementEvent(container, {
        ...base, eventType: "project_complete", postId: "project_" + projectCode + "_complete_" + studentId,
        project: { projectCode: String(projectCode), title: String(projectTitle || ""), tier: a.tier, level: a.level, projectStrength: a.projectStrength }
      });
      if (ok) created.push("complete");
    }
  } catch {
    // recognition bookkeeping never breaks the progress write
  }
  return created;
}

module.exports = { RECOGNITION_PREFIX, recognitionDocName, recordGlobalRankMilestone, recordProjectMilestones };
