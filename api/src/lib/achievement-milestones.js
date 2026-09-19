// Milestone recording — the SERVER compares authoritative before/after states and creates at most ONE achievement
// event per newly reached milestone (deterministic create-only ids). React never decides a milestone.
//
//   global_rank_up   : the student's UNIFIED Strength tier (student-strength.js) rose above the last observed tier.
//                      Evaluated at the ONE place the total Strength is built (the student dashboard), against the
//                      persisted observation in platform/recognition/<studentId>.json — so a change from ANY source
//                      (finalized exam, training best, project progress) is caught on the next portal load. The
//                      first observation only records the baseline (no retroactive event for an existing rank).
//   project_rank_up  : ONE project's Strength (/600) tier rose in a real progress mutation (before vs after docs).
//   project_complete : the first not-complete → complete transition of a project.
// A jump over several tiers records ONE event for the final tier; a decrease (reset / correction) records nothing.
const { RANK_ORDER } = require("./student-strength");
const { downloadJsonOrNull, uploadJson } = require("./platform-storage");
const { recordAchievementEvent } = require("./achievement-feed");
const perf = require("./project-tracker/performance");

const RECOGNITION_PREFIX = "platform/recognition/";
const recognitionDocName = studentId => RECOGNITION_PREFIX + String(studentId) + ".json";

const tierIndex = (order, tier) => (tier ? order.indexOf(tier) : -1);

/**
 * Global rank milestone: returns the tier of the event created now, or null. Best-effort (never throws).
 * Steady state is WRITE-FREE: the observation doc is written only on first sight (baseline — an already-earned rank
 * is never posted retroactively) and when the tier changes. Reads/writes go through the dashboard's seams.
 */
async function recordGlobalRankMilestone(container, { student, classId, strength, now }, deps = {}) {
  try {
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const up = deps.uploadJson || uploadJson;
    const studentId = String(student && student.userId || "");
    const currentTier = strength && strength.tier ? strength.tier : null;
    if (!studentId) return null;
    const existing = await dl(container, recognitionDocName(studentId));
    const first = !existing || typeof existing !== "object" || !Object.prototype.hasOwnProperty.call(existing, "lastGlobalTier");
    const previous = first ? null : (existing.lastGlobalTier || null);
    if (first || previous !== currentTier) {
      await up(container, recognitionDocName(studentId), { ...(existing && typeof existing === "object" ? existing : { schemaVersion: 1, studentId }), lastGlobalTier: currentTier, lastGlobalPoints: Number(strength && strength.totalPoints || 0), updatedAt: now || new Date().toISOString() });
    }
    if (first || !currentTier || !classId) return null;
    if (tierIndex(RANK_ORDER, currentTier) <= tierIndex(RANK_ORDER, previous)) return null;
    const created = await recordAchievementEvent(container, {
      eventType: "global_rank_up", postId: "global_rank_" + currentTier + "_" + studentId, classId, studentId,
      studentDisplayName: student.displayName, shareWithClass: student.shareAchievements !== false, now,
      rank: { tier: currentTier, level: Number(strength.level || 0), points: Number(strength.totalPoints || 0) }
    });
    return created ? currentTier : null;
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
