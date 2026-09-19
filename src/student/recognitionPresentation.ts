// Recognition (الميداليات / التفاعلات / الإنجازات) — PRESENTATION of the server's `dashboard.recognition`. The three
// counts are separate kinds of recognition (medals = finalized assessment, reactions = social appreciation received,
// achievements = meaningful milestones) and are never added together; nothing here computes a point or a rank.
import type { StudentRecognition } from "./types";

const REACTIONS = ["heart", "clap", "cheer", "fire"] as const;
const ACHIEVEMENTS = ["global_rank_up", "project_rank_up", "project_complete"] as const;
const int = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const counts = <K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> => {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(keys.map(k => [k, int(r[k])])) as Record<K, number>;
};

/** A well-formed recognition summary, or null when the payload has none (older API). */
export function normalizeRecognition(raw: unknown): StudentRecognition | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const medals = r.medals && typeof r.medals === "object" ? (r.medals as Record<string, unknown>) : {};
  const reactions = r.reactionsReceived && typeof r.reactionsReceived === "object" ? (r.reactionsReceived as Record<string, unknown>) : {};
  const achievements = r.achievements && typeof r.achievements === "object" ? (r.achievements as Record<string, unknown>) : {};
  return {
    medals: { total: int(medals.total), gold: int(medals.gold), silver: int(medals.silver), bronze: int(medals.bronze) },
    reactionsReceived: { total: int(reactions.total), byType: counts(reactions.byType, REACTIONS) },
    achievements: { total: int(achievements.total), byType: counts(achievements.byType, ACHIEVEMENTS) },
  };
}
