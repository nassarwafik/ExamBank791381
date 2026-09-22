// Milestone recording — the SERVER compares authoritative before/after states and creates at most ONE achievement
// event per newly reached milestone (deterministic create-only ids). React never decides a milestone.
//
//   global_rank_up   : the student's UNIFIED Strength STAGE (student-strength.js, 1..25) rose above the last observed
//                      stage. Evaluated at the ONE place the total Strength is built (the student dashboard), against
//                      the persisted observation in platform/recognition/<studentId>.json — so a change from ANY
//                      library/module source is caught on the next portal load. The first observation only records the
//                      baseline (no retroactive event for an already-reached stage).
//   project_rank_up  : ONE project's Strength (/600) tier rose in a real progress mutation (before vs after docs).
//   project_complete : the first not-complete → complete transition of a project.
// A jump over several stages records ONE event for the final stage; a decrease (reset / correction) records nothing.
const { downloadJsonOrNull, uploadJson } = require("./platform-storage");
const { recordAchievementEvent } = require("./achievement-feed");
const perf = require("./project-tracker/performance");

const RECOGNITION_PREFIX = "platform/recognition/";
const recognitionDocName = studentId => RECOGNITION_PREFIX + String(studentId) + ".json";

const tierIndex = (order, tier) => (tier ? order.indexOf(tier) : -1);

/**
 * Global stage milestone: returns the stage (1..25) of the event created now, or null. Best-effort (never throws).
 * Steady state is WRITE-FREE: the observation doc is written only on first sight (baseline — an already-reached stage
 * is never posted retroactively) and when the stage changes. Reads/writes go through the dashboard's seams.
 * Backward compatible: an older recognition doc (with lastGlobalTier but no lastGlobalStage) is treated as first
 * sight for the STAGE milestone, so it records the baseline and posts nothing retroactively.
 */
async function recordGlobalRankMilestone(container, { student, classId, strength, now }, deps = {}) {
  try {
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const up = deps.uploadJson || uploadJson;
    const studentId = String(student && student.userId || "");
    const currentStage = Math.max(0, Math.floor(Number(strength && strength.stage) || 0));   // 1..25 (0 = no strength)
    if (!studentId) return null;
    const existing = await dl(container, recognitionDocName(studentId));
    const first = !existing || typeof existing !== "object" || !Object.prototype.hasOwnProperty.call(existing, "lastGlobalStage");
    const previous = first ? 0 : Math.max(0, Math.floor(Number(existing.lastGlobalStage) || 0));
    if (first || previous !== currentStage) {
      await up(container, recognitionDocName(studentId), { ...(existing && typeof existing === "object" ? existing : { schemaVersion: 1, studentId }), lastGlobalStage: currentStage, lastGlobalPoints: Number(strength && strength.totalPoints || 0), updatedAt: now || new Date().toISOString() });
    }
    if (first || !currentStage || !classId) return null;
    if (currentStage <= previous) return null;   // only a real increase posts; a jump records ONE event for the final stage
    const created = await recordAchievementEvent(container, {
      eventType: "global_rank_up", postId: "global_stage_" + currentStage + "_" + studentId, classId, studentId,
      studentDisplayName: student.displayName, shareWithClass: student.shareAchievements !== false, now,
      rank: { stage: currentStage, points: Number(strength.totalPoints || 0) }
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
