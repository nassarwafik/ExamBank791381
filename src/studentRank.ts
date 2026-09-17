// UX-7 — the student's PERSONAL rank (progression only; there is no class leaderboard and nothing here ever
// compares one student with another). The rank now advances by ONE tier every FOUR server-authoritative,
// finalized-only exams — it is progression-by-completed-finalized-exams, NOT average-based.
//
// The ONLY input to the rank tier is `stats.finalized` (assignments whose latest grading status is final).
// Provisional / pendingReview / submitted / assigned / in-progress results, raw scores and percentages are
// excluded by construction — the module never reads them. `averageFinalized` is kept on the rank object for
// the academic-average display elsewhere (the final-average ring), but it NO LONGER decides the tier. Medals
// keep their own separate score thresholds (see medals.ts) — this file never touches those.

/** The rank cadence: one tier is unlocked for every this-many finalized exams. The single source of truth —
 *  never hardcode the 4 in a component or test. */
export const RANK_STEP_FINALIZED = 4;

// The six-tier system. Tier IDs, labels and the visual rank colors (avatar frame CSS) are preserved.
export type RankTier = "beginner" | "bronze" | "silver" | "gold" | "diamond" | "legendary";
export const RANK_ORDER: RankTier[] = ["beginner", "bronze", "silver", "gold", "diamond", "legendary"];
export const RANK_LABELS: Record<RankTier, string> = { beginner: "مبتدئ", bronze: "برونزي", silver: "فضي", gold: "ذهبي", diamond: "ألماسي", legendary: "أسطوري" };

export type NextRank = { tier: RankTier; label: string; remaining: number; percent: number };
export type StudentRank = { tier: RankTier; label: string; averageFinalized: number; finalized: number; next: NextRank | null };
export type RankInput = { finalized?: number | null; averageFinalized?: number | null } | null | undefined;
export type RankProgress = { finalized: number; withinBlock: number; needed: number; remaining: number; percent: number };

/** A safe non-negative integer finalized count. NaN / negative / Infinity / malformed all collapse to 0. */
function finalizedCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * The rank tier for a finalized-exam COUNT — the heart of the progression:
 *   0–3 → null (no rank yet) · 4–7 beginner · 8–11 bronze · 12–15 silver · 16–19 gold · 20–23 diamond · 24+ legendary.
 * Deterministic and pure. Negative / NaN / Infinity behave as 0 (no rank).
 */
export function rankTierForFinalized(finalized: number | null | undefined): RankTier | null {
  const count = finalizedCount(finalized);
  if (count < RANK_STEP_FINALIZED) return null;
  const index = Math.min(Math.floor(count / RANK_STEP_FINALIZED) - 1, RANK_ORDER.length - 1);
  return RANK_ORDER[index];
}

/** The next tier and the progress THROUGH the current four-exam block towards it; null at legendary (top). */
export function nextRankForFinalized(finalized: number | null | undefined): NextRank | null {
  const count = finalizedCount(finalized);
  const tier = rankTierForFinalized(count);
  if (!tier) return null;
  const index = RANK_ORDER.indexOf(tier);
  if (index >= RANK_ORDER.length - 1) return null; // legendary — no next rank
  const nextTier = RANK_ORDER[index + 1];
  const withinBlock = count % RANK_STEP_FINALIZED;              // 0..3 into the current block
  const remaining = RANK_STEP_FINALIZED - withinBlock;         // 4,3,2,1 exams to the next tier
  const percent = Math.round((withinBlock / RANK_STEP_FINALIZED) * 100);
  return { tier: nextTier, label: RANK_LABELS[nextTier], remaining, percent };
}

/**
 * The student's rank, derived from the finalized COUNT only. `averageFinalized` is carried through for the
 * academic-average display but never influences the tier. null until at least RANK_STEP_FINALIZED finalized.
 */
export function rankFor(stats: RankInput): StudentRank | null {
  const finalized = finalizedCount(stats?.finalized);
  const tier = rankTierForFinalized(finalized);
  if (!tier) return null;
  const avgRaw = stats?.averageFinalized;
  const avg = Number(avgRaw);
  const averageFinalized = avgRaw !== null && avgRaw !== undefined && Number.isFinite(avg) ? avg : 0;
  return { tier, label: RANK_LABELS[tier], averageFinalized, finalized, next: nextRankForFinalized(finalized) };
}

/** Progress within the current four-exam block (used before the first rank for "الطريق إلى رتبتك"). */
export function rankProgress(stats: RankInput): RankProgress {
  const finalized = finalizedCount(stats?.finalized);
  const withinBlock = finalized % RANK_STEP_FINALIZED;
  const remaining = RANK_STEP_FINALIZED - withinBlock;
  return { finalized, withinBlock, needed: RANK_STEP_FINALIZED, remaining, percent: Math.round((withinBlock / RANK_STEP_FINALIZED) * 100) };
}

/**
 * Count-based Arabic phrase for the exams remaining to the next tier (natural singular/dual/plural):
 *   1 → «بقي امتحان واحد» · 2 → «بقي امتحانان» · 3 → «بقي 3 امتحانات» · 4 → «بقي 4 امتحانات».
 * The caller appends the destination (« للوصول إلى رتبة X»). Replaces the old average-threshold wording.
 */
export function remainingExamsPhrase(remaining: number): string {
  const r = Math.max(1, Math.floor(Number(remaining) || 1));
  if (r === 1) return "بقي امتحان واحد";
  if (r === 2) return "بقي امتحانان";
  return "بقي " + r + " امتحانات";
}
