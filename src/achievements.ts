// Preset reactions for the class achievement feed — ids mirror the backend allow-list in
// api/src/lib/achievement-feed.js; keep both in sync if this list ever changes.
export type ReactionId = "heart" | "clap" | "cheer" | "fire";

export const REACTIONS: { id: ReactionId; emoji: string; label: string }[] = [
  { id: "heart", emoji: "❤️", label: "أحببته" },
  { id: "clap", emoji: "👏", label: "أحسنت" },
  { id: "cheer", emoji: "🎉", label: "مبروك" },
  { id: "fire", emoji: "🔥", label: "رائع" }
];

// Generic achievement EVENT types (mirrors api/src/lib/achievement-feed.js EVENT_TYPES). Legacy posts without an
// eventType are medal posts.
export type AchievementEventType = "medal" | "global_rank_up" | "project_rank_up" | "project_complete";
export const EVENT_TYPES: AchievementEventType[] = ["medal", "global_rank_up", "project_rank_up", "project_complete"];
export type RankTierId = "beginner" | "bronze" | "silver" | "gold" | "diamond" | "legendary";
// A medal payload. Assessment medals carry only tier/assignmentId/assignmentTitle (historical posts have no `source`
// and must keep working). Phase 4D game medals additionally carry `source: "game"` and safe live-challenge metadata
// (the internal session id is never exposed to the client).
export type FeedMedal = {
  tier: "gold" | "silver" | "bronze";
  assignmentId?: string;
  assignmentTitle: string;
  source?: "game";
  gameType?: "live_challenge";
  placement?: 1 | 2 | 3;
  challengeId?: string;
};
/** LEGACY six-rank payload of a global_rank_up event (historical events; new events also carry `stage`). */
export type FeedRank = { tier: RankTierId | ""; level: number; points?: number };
/** The 25-stage payload of a global_rank_up event written since the Strength path (absent on historical events). */
export type FeedStage = { stageNumber: number; stageCount?: number };
export type FeedProject = { projectCode: string; title: string; tier: RankTierId | null; level: number; projectStrength?: number };

export type FeedPost = {
  postId: string;
  /** Absent on older payloads → medal. */
  eventType?: AchievementEventType;
  studentDisplayName: string;
  /** Legacy medal fields (kept for older payloads). */
  assignmentTitle: string;
  tier?: "gold" | "silver" | "bronze";
  medal?: FeedMedal | null;
  rank?: FeedRank | null;
  stage?: FeedStage | null;
  project?: FeedProject | null;
  createdAt: string;
  shareWithClass?: boolean;
  isOwnPost: boolean;
  reactionCounts: Record<ReactionId, number>;
  myReaction: ReactionId | null;
  teacherReaction: ReactionId | null;
  teacherNote: string;
};

/** The event type of a post — legacy posts (no eventType) are medals. */
export function eventTypeOf(post: { eventType?: string }): AchievementEventType {
  return (EVENT_TYPES as string[]).includes(post.eventType || "") ? (post.eventType as AchievementEventType) : "medal";
}

/**
 * The feed sentence for an event as ordered parts (plain text + the emphasised tokens), so both the student feed and
 * the teacher dashboard render the SAME wording (the class name is inserted by the teacher view only):
 *   medal            → حصلت ليان على ميدالية ذهبية في …
 *   global_rank_up   → stage-era event: وصل كريم إلى المرحلة 7 — ذئب الرياح · historical six-rank event:
 *                      تقدّم كريم إلى تنين النار — المستوى 5
 *   project_rank_up  → تقدّمت هاجر في مشروع AquaSense إلى نمر البرق
 *   project_complete → أكمل أحمد مشروع SecureBank
 * (Arabic verbs are gender-neutral in the shared helper; the caller passes the label functions: `stage` for the
 * 25-stage title, `rank` for the LEGACY six-rank / project-rank titles.)
 */
export type FeedTextPart = { text: string; strong?: boolean };
export function feedEventParts(post: { eventType?: string; studentDisplayName: string; assignmentTitle?: string; tier?: string; medal?: FeedMedal | null; rank?: FeedRank | null; stage?: FeedStage | null; project?: FeedProject | null }, labels: { medal: (tier: string) => string; rank: (tier: string) => string; stage?: (stageNumber: number) => string }): FeedTextPart[] {
  const name = post.studentDisplayName;
  switch (eventTypeOf(post)) {
    case "global_rank_up": {
      const stageNumber = Number(post.stage?.stageNumber);
      if (Number.isInteger(stageNumber) && stageNumber >= 1 && labels.stage) {
        return [{ text: "وصل " }, { text: name, strong: true }, { text: " إلى المرحلة " + stageNumber + " — " }, { text: labels.stage(stageNumber), strong: true }];
      }
      // historical (six-rank era) event
      const tier = post.rank?.tier || "beginner";
      return [{ text: "تقدّم " }, { text: name, strong: true }, { text: " إلى " }, { text: labels.rank(tier), strong: true }, { text: " — المستوى " + (post.rank?.level || 0) }];
    }
    case "project_rank_up": {
      const tier = post.project?.tier || "beginner";
      return [{ text: "تقدّم " }, { text: name, strong: true }, { text: " في مشروع " }, { text: post.project?.title || post.project?.projectCode || "", strong: true }, { text: " إلى " }, { text: labels.rank(tier), strong: true }];
    }
    case "project_complete":
      return [{ text: "أكمل " }, { text: name, strong: true }, { text: " مشروع " }, { text: post.project?.title || post.project?.projectCode || "", strong: true }];
    default: {
      const tier = post.medal?.tier || post.tier || "bronze";
      const title = post.medal?.assignmentTitle || post.assignmentTitle || "";
      // Phase 4D — a persisted GAME medal reads as a Live Challenge win; assessment medals keep their existing wording.
      if (post.medal?.source === "game") {
        return [{ text: name, strong: true }, { text: " حصل على ميدالية " + labels.medal(tier) + " في التحدّي المباشر " }, { text: "«" + title + "»", strong: true }];
      }
      return [{ text: name, strong: true }, { text: " حصل على ميدالية " + labels.medal(tier) + " في " }, { text: title, strong: true }];
    }
  }
}
