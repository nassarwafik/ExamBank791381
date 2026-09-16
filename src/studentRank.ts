// UX-7 — the student's PERSONAL rank (progression only; there is no class leaderboard and nothing here ever
// compares one student with another). The rank is derived from exactly two server-authoritative,
// finalized-only stats of /api/student-dashboard: `finalized` (assignments whose latest grading status is
// final) and `averageFinalized` (the average over those same assignments). Provisional / pendingReview
// results are excluded by construction — they are not part of either input — and the module never looks at
// a raw score, a percentage or a result object.
export const RANK_MIN_FINALIZED = 10;

export type RankTier = "gold" | "silver" | "bronze" | "starter";
export type StudentRank = { tier: RankTier; label: string; averageFinalized: number; finalized: number };
export type RankInput = { finalized?: number | null; averageFinalized?: number | null } | null | undefined;
export type RankProgress = { finalized: number; needed: number; remaining: number; percent: number };

export const RANK_LABELS: Record<RankTier, string> = { gold: "متفوّق", silver: "متقدّم", bronze: "مثابر", starter: "في الطريق" };

/** Tier for an already-authoritative finalized average (mirrors the medal thresholds; below 70 is a starter rank, never "no rank"). */
export function rankTierFor(averageFinalized: number): RankTier {
  if (averageFinalized >= 90) return "gold";
  if (averageFinalized >= 80) return "silver";
  if (averageFinalized >= 70) return "bronze";
  return "starter";
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
  return { tier, label: RANK_LABELS[tier], averageFinalized, finalized };
}

/** Progress towards unlocking the rank (finalized assignments only). */
export function rankProgress(stats: RankInput): RankProgress {
  const raw = Number(stats?.finalized ?? 0);
  const finalized = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const capped = Math.min(finalized, RANK_MIN_FINALIZED);
  return { finalized, needed: RANK_MIN_FINALIZED, remaining: RANK_MIN_FINALIZED - capped, percent: Math.round((capped / RANK_MIN_FINALIZED) * 100) };
}
