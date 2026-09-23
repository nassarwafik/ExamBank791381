const { uploadJsonConditional, listBlobNames, downloadManyJson } = require("./platform-storage");

const FEED_PREFIX = "platform/feed/";
// Mirrors src/medals.ts's thresholds/ids exactly — kept in sync manually since the frontend
// module is TypeScript and can't be shared directly with these CommonJS backend files.
const REACTIONS = ["heart", "clap", "cheer", "fire"];
// Generic achievement EVENT types. Legacy posts (written before eventType existed) are medal posts.
const EVENT_TYPES = ["medal", "global_rank_up", "project_rank_up", "project_complete"];

function medalTierFromPercentage(pct) {
  if (pct >= 90) return "gold";
  if (pct >= 80) return "silver";
  if (pct >= 70) return "bronze";
  return null;
}

function feedBlobName(classId, postId) {
  return FEED_PREFIX + String(classId || "") + "/" + postId + ".json";
}

/** The event type of a stored post — legacy posts without `eventType` normalize as `medal` (no migration). */
function eventTypeOf(post) {
  return EVENT_TYPES.includes(post && post.eventType) ? post.eventType : "medal";
}

/** A post is visible to a classmate only when shared; the owner always sees their own; legacy posts (created only
 *  when sharing was on) carry no flag and stay visible. Teachers see every educational achievement event. */
function isVisibleToStudent(post, studentId) {
  if (String(post && post.studentId || "") === String(studentId)) return true;
  return !(post && post.shareWithClass === false);
}

function reactionCounts(reactions) {
  const out = {};
  for (const key of REACTIONS) out[key] = Array.isArray(reactions && reactions[key]) ? reactions[key].length : 0;
  return out;
}

/** Reactions RECEIVED on one post: classmates' (one per student) plus the teacher's, by type and in total. */
function receivedReactionsOf(post) {
  const byType = reactionCounts(post && post.reactions);
  if (post && REACTIONS.includes(post.teacherReaction)) byType[post.teacherReaction] += 1;
  let total = 0;
  for (const key of REACTIONS) total += byType[key];
  return { total, byType };
}

/** Safe game-medal metadata for the public projection (Phase 4D). Only present on a persisted GAME medal
 *  (medal.source === "game"); exposes ONLY what the feed presentation needs. The internal session id (sourceId, which
 *  is the join code) is NOT exposed — it was only a storage key. Answers, grades, competition points, the snapshot and
 *  classmate ids are never part of a medal post and so never leak. */
function gameMedalPublicFields(medal) {
  if (!medal || typeof medal !== "object" || medal.source !== "game") return null;
  return {
    source: "game",
    gameType: String(medal.gameType || "live_challenge"),
    placement: Number(medal.placement) >= 1 ? Number(medal.placement) : undefined,
    challengeId: medal.challengeId ? String(medal.challengeId) : undefined,
  };
}

/** The ONE public projection of a stored post (both feeds add their own viewer-specific fields on top). */
function publicPost(post) {
  const eventType = eventTypeOf(post);
  const rawMedal = post.medal && typeof post.medal === "object" ? post.medal : null;
  const game = gameMedalPublicFields(rawMedal);
  const medal = rawMedal
    ? { tier: String(rawMedal.tier || post.tier || ""), assignmentId: String(rawMedal.assignmentId || post.assignmentId || ""), assignmentTitle: String(rawMedal.assignmentTitle || post.assignmentTitle || ""), ...(game || {}) }
    : eventType === "medal" ? { tier: String(post.tier || ""), assignmentId: String(post.assignmentId || ""), assignmentTitle: String(post.assignmentTitle || "") } : null;
  return {
    postId: String(post.postId || ""),
    eventType,
    studentDisplayName: String(post.studentDisplayName || ""),
    // Legacy medal fields kept for older clients.
    assignmentTitle: medal ? medal.assignmentTitle : "",
    tier: medal ? medal.tier : undefined,
    medal,
    rank: post.rank && typeof post.rank === "object" ? { tier: String(post.rank.tier || ""), level: Number(post.rank.level || 0), points: Number(post.rank.points || 0) } : null,
    // 25-stage milestone (stage-era global_rank_up events); null on historical six-rank events — renderers fall back to `rank`.
    stage: post.stage && typeof post.stage === "object" && Number(post.stage.stageNumber) >= 1 ? { stageNumber: Number(post.stage.stageNumber), stageCount: Number(post.stage.stageCount || 25) } : null,
    project: post.project && typeof post.project === "object" ? { projectCode: String(post.project.projectCode || ""), title: String(post.project.title || ""), tier: post.project.tier ? String(post.project.tier) : null, level: Number(post.project.level || 0), projectStrength: Number(post.project.projectStrength || 0) } : null,
    createdAt: String(post.createdAt || ""),
    shareWithClass: post.shareWithClass !== false,
    reactionCounts: reactionCounts(post.reactions),
    teacherReaction: REACTIONS.includes(post.teacherReaction) ? post.teacherReaction : null,
    teacherNote: String(post.teacherNote || "")
  };
}

/**
 * Create-only write of ONE achievement event with a deterministic id (ending `_<studentId>`): a retry, a re-review or
 * a concurrent request can never duplicate it. Returns true when the event was created now, false when it already
 * existed or could not be written — bookkeeping never breaks the action that triggered it.
 */
async function recordAchievementEvent(container, event) {
  try {
    const { eventType, postId, classId, studentId } = event;
    if (!EVENT_TYPES.includes(eventType) || !postId || !classId || !studentId) return false;
    if (!String(postId).endsWith("_" + String(studentId))) return false;
    const post = {
      schemaVersion: 2,
      eventType,
      postId: String(postId),
      classId: String(classId),
      studentId: String(studentId),
      studentDisplayName: String(event.studentDisplayName || ""),
      createdAt: event.now || new Date().toISOString(),
      shareWithClass: event.shareWithClass !== false,
      reactions: {}
    };
    if (event.medal) { post.medal = event.medal; post.assignmentId = event.medal.assignmentId; post.assignmentTitle = event.medal.assignmentTitle; post.tier = event.medal.tier; }
    if (event.rank) post.rank = event.rank;
    if (event.stage) post.stage = event.stage;
    if (event.project) post.project = event.project;
    await uploadJsonConditional(container, feedBlobName(classId, postId), post, null);
    return true;
  } catch {
    return false;
  }
}

// Called right after a submission attempt becomes finalized. Creates at most one post per (assignmentId, studentId)
// via a create-only conditional write — a retry or later re-review of the same attempt never reposts. The event is
// stored regardless of the sharing flag (the student always sees their own, the teacher sees it, summaries stay
// accurate) and `shareWithClass` governs classmate visibility. Any failure is swallowed so it can never break grading.
async function recordAchievementIfEligible(container, { classId, studentId, studentDisplayName, assignmentId, assignmentTitle, percentage, shareAchievements }) {
  const tier = medalTierFromPercentage(Number(percentage));
  if (!tier) return false;
  if (!classId || !studentId || !assignmentId) return false;
  return recordAchievementEvent(container, {
    eventType: "medal", postId: String(assignmentId) + "_" + String(studentId), classId, studentId, studentDisplayName,
    shareWithClass: shareAchievements !== false,
    medal: { tier, assignmentId: String(assignmentId), assignmentTitle: String(assignmentTitle || "") }
  });
}

/**
 * Lifetime recognition per student across EVERY class's feed (a student's history counts after a class move):
 * reactions RECEIVED (classmates + teacher, by type and total), non-medal achievement events, medal posts. One
 * listing pass under FEED_PREFIX selecting the students' posts by NAME (post ids end with `_<studentId>`) — never a
 * full scan of every post — with the post's own studentId as the authority. Shared by the roster (likesCount) and the
 * student dashboard so the two can never diverge.
 */
async function aggregateRecognition(container, studentIds, deps = {}) {
  const ids = [...new Set((studentIds || []).map(String).filter(Boolean))];
  const out = new Map();
  for (const id of ids) out.set(id, emptyRecognition());
  if (!ids.length) return out;
  const suffixes = ids.map(id => "_" + id + ".json");
  const names = (await (deps.listBlobNames || listBlobNames)(container, FEED_PREFIX)).filter(name => {
    const postId = name.slice(name.lastIndexOf("/") + 1);
    return postId.indexOf("_") < 0 || suffixes.some(suffix => postId.endsWith(suffix));
  });
  for (const post of await (deps.downloadManyJson || downloadManyJson)(container, names)) {
    if (!post) continue;
    const studentId = String(post.studentId || "");
    const acc = out.get(studentId);
    if (!acc) continue;
    const received = receivedReactionsOf(post);
    acc.receivedReactionCount += received.total;
    for (const key of REACTIONS) acc.receivedReactionByType[key] += received.byType[key];
    const type = eventTypeOf(post);
    if (type === "medal") {
      acc.medalPostCount += 1;
      // Phase 4D — GAME medals are an INTERNAL aggregate, counted ONLY from a persisted medal explicitly marked
      // medal.source === "game" (with a valid gold/silver/bronze tier). Legacy/exam medal posts (no `source`, or a
      // different source) NEVER enter this game aggregate, so assessment medals are not double-counted here: the
      // dashboard/profile still derive current exam medals from CURRENT finalized results and ADD these game medals.
      const m = post.medal;
      if (m && typeof m === "object" && m.source === "game" && (m.tier === "gold" || m.tier === "silver" || m.tier === "bronze")) {
        acc.gameMedals.total += 1; acc.gameMedals[m.tier] += 1;
      }
    }
    else { acc.achievementCount += 1; acc.achievementByType[type] += 1; }
  }
  return out;
}
function emptyRecognition() {
  const byType = {}; for (const key of REACTIONS) byType[key] = 0;
  return { receivedReactionCount: 0, receivedReactionByType: byType, achievementCount: 0, achievementByType: { global_rank_up: 0, project_rank_up: 0, project_complete: 0 }, medalPostCount: 0, gameMedals: { total: 0, gold: 0, silver: 0, bronze: 0 } };
}

module.exports = {
  FEED_PREFIX, REACTIONS, EVENT_TYPES, feedBlobName, medalTierFromPercentage,
  eventTypeOf, isVisibleToStudent, reactionCounts, receivedReactionsOf, publicPost,
  recordAchievementEvent, recordAchievementIfEligible, aggregateRecognition, emptyRecognition
};
