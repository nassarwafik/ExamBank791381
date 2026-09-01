// Preset reactions for the class achievement feed — ids mirror the backend allow-list in
// api/src/lib/achievement-feed.js; keep both in sync if this list ever changes.
export type ReactionId = "heart" | "clap" | "cheer" | "fire";

export const REACTIONS: { id: ReactionId; emoji: string; label: string }[] = [
  { id: "heart", emoji: "❤️", label: "أحببته" },
  { id: "clap", emoji: "👏", label: "أحسنت" },
  { id: "cheer", emoji: "🎉", label: "مبروك" },
  { id: "fire", emoji: "🔥", label: "رائع" }
];

export type FeedPost = {
  postId: string;
  studentDisplayName: string;
  assignmentTitle: string;
  tier: "gold" | "silver" | "bronze";
  createdAt: string;
  isOwnPost: boolean;
  reactionCounts: Record<ReactionId, number>;
  myReaction: ReactionId | null;
  teacherReaction: ReactionId | null;
  teacherNote: string;
};
