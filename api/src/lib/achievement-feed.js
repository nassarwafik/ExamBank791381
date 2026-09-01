const { uploadJsonConditional } = require("./platform-storage");

const FEED_PREFIX = "platform/feed/";
// Mirrors src/medals.ts's thresholds/ids exactly — kept in sync manually since the frontend
// module is TypeScript and can't be shared directly with these CommonJS backend files.
const REACTIONS = ["heart", "clap", "cheer", "fire"];

function medalTierFromPercentage(pct) {
  if (pct >= 90) return "gold";
  if (pct >= 80) return "silver";
  if (pct >= 70) return "bronze";
  return null;
}

function feedBlobName(classId, postId) {
  return FEED_PREFIX + String(classId || "") + "/" + postId + ".json";
}

// Called right after a submission attempt becomes finalized. Creates at most one post per
// (assignmentId, studentId) via a create-only conditional write — a retry or later re-review of
// the same attempt never reposts or duplicates. This is a secondary, celebratory feature: any
// failure (including the expected "already posted" conflict) is swallowed so it can never break
// the grading/review action that triggered it.
async function recordAchievementIfEligible(container, { classId, studentId, studentDisplayName, assignmentId, assignmentTitle, percentage, shareAchievements }) {
  try {
    const tier = medalTierFromPercentage(Number(percentage));
    if (!tier) return;
    if (shareAchievements === false) return;
    if (!classId || !studentId || !assignmentId) return;
    const postId = String(assignmentId) + "_" + String(studentId);
    const post = {
      schemaVersion: 1,
      postId,
      classId: String(classId),
      studentId: String(studentId),
      studentDisplayName: String(studentDisplayName || ""),
      assignmentId: String(assignmentId),
      assignmentTitle: String(assignmentTitle || ""),
      tier,
      createdAt: new Date().toISOString(),
      reactions: {}
    };
    await uploadJsonConditional(container, feedBlobName(classId, postId), post, null);
  } catch {
    // Never let achievement-feed bookkeeping break grading or review.
  }
}

module.exports = { FEED_PREFIX, REACTIONS, feedBlobName, recordAchievementIfEligible };
