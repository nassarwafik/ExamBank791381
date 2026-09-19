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
export type FeedMedal = { tier: "gold" | "silver" | "bronze"; assignmentId?: string; assignmentTitle: string };
export type FeedRank = { tier: RankTierId; level: number; points?: number };
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
 *   global_rank_up   → تقدّم كريم إلى تنين النار — المستوى 5
 *   project_rank_up  → تقدّمت هاجر في مشروع AquaSense إلى نمر البرق
 *   project_complete → أكمل أحمد مشروع SecureBank
 * (Arabic verbs are gender-neutral in the shared helper; the caller passes `rankTitle` for tiers.)
 */
export type FeedTextPart = { text: string; strong?: boolean };
export function feedEventParts(post: { eventType?: string; studentDisplayName: string; assignmentTitle?: string; tier?: string; medal?: FeedMedal | null; rank?: FeedRank | null; project?: FeedProject | null }, labels: { medal: (tier: string) => string; rank: (tier: string) => string }): FeedTextPart[] {
  const name = post.studentDisplayName;
  switch (eventTypeOf(post)) {
    case "global_rank_up": {
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
      return [{ text: name, strong: true }, { text: " حصل على ميدالية " + labels.medal(tier) + " في " }, { text: title, strong: true }];
    }
  }
}
