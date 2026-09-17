// UX-7 — the student's PERSONAL rank (progression only; there is no class leaderboard and nothing here ever
// compares one student with another). The rank is derived from exactly two server-authoritative,
// finalized-only stats of /api/student-dashboard: `finalized` (assignments whose latest grading status is
// final) and `averageFinalized` (the average over those same assignments). Provisional / pendingReview
// results are excluded by construction — they are not part of either input — and the module never looks at
// a raw score, a percentage or a result object.
export const RANK_MIN_FINALIZED = 10;

// The locked six-tier system. Thresholds are applied to the UNROUNDED finalized average.
export type RankTier = "beginner" | "bronze" | "silver" | "gold" | "diamond" | "legendary";
export const RANK_ORDER: RankTier[] = ["beginner", "bronze", "silver", "gold", "diamond", "legendary"];
export const RANK_MIN: Record<RankTier, number> = { beginner: 0, bronze: 60, silver: 70, gold: 80, diamond: 90, legendary: 96 };
export const RANK_LABELS: Record<RankTier, string> = { beginner: "مبتدئ", bronze: "برونزي", silver: "فضي", gold: "ذهبي", diamond: "ألماسي", legendary: "أسطوري" };

export type NextRank = { tier: RankTier; label: string; threshold: number; percent: number };
export type StudentRank = { tier: RankTier; label: string; averageFinalized: number; finalized: number; next: NextRank | null };
export type RankInput = { finalized?: number | null; averageFinalized?: number | null } | null | undefined;
export type RankProgress = { finalized: number; needed: number; remaining: number; percent: number };

/** Tier for an already-authoritative finalized average (unrounded): <60 beginner, 60 bronze, 70 silver, 80 gold, 90 diamond, 96 legendary. */
export function rankTierFor(averageFinalized: number): RankTier {
  if (averageFinalized >= 96) return "legendary";
  if (averageFinalized >= 90) return "diamond";
  if (averageFinalized >= 80) return "gold";
  if (averageFinalized >= 70) return "silver";
  if (averageFinalized >= 60) return "bronze";
  return "beginner";
}

/** Progress from the current tier's floor towards the next tier's threshold; null for the top tier. */
export function nextRankProgress(tier: RankTier, averageFinalized: number): NextRank | null {
  const index = RANK_ORDER.indexOf(tier);
  if (index < 0 || index === RANK_ORDER.length - 1) return null;
  const nextTier = RANK_ORDER[index + 1];
  const min = RANK_MIN[tier], threshold = RANK_MIN[nextTier];
  const raw = ((averageFinalized - min) / (threshold - min)) * 100;
  const percent = Math.round(Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0)));
  return { tier: nextTier, label: RANK_LABELS[nextTier], threshold, percent };
}

/** null until at least RANK_MIN_FINALIZED assignments are final AND the server sent a finalized average. */
export function rankFor(stats: RankInput): StudentRank | null {
  const finalized = Number(stats?.finalized ?? 0);
  if (!Number.isFinite(finalized) || finalized < RANK_MIN_FINALIZED) return null;
  const avg = stats?.averageFinalized;
  if (avg === null || avg === undefined) return null;
  const averageFinalized = Number(avg);
  if (!Number.isFinite(averageFinalized)) return null;
  const tier = rankTierFor(averageFinalized);
  return { tier, label: RANK_LABELS[tier], averageFinalized, finalized, next: nextRankProgress(tier, averageFinalized) };
}

/** Progress towards unlocking the rank (finalized assignments only). */
export function rankProgress(stats: RankInput): RankProgress {
  const raw = Number(stats?.finalized ?? 0);
  const finalized = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const capped = Math.min(finalized, RANK_MIN_FINALIZED);
  return { finalized, needed: RANK_MIN_FINALIZED, remaining: RANK_MIN_FINALIZED - capped, percent: Math.round((capped / RANK_MIN_FINALIZED) * 100) };
}
