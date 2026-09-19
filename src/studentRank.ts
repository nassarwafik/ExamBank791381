// UX-7 — the student's PERSONAL rank (progression only; there is no class leaderboard and nothing here ever
// compares one student with another).
//
// UNIFIED STRENGTH POINTS (نقاط القوة): the rank now advances by ONE tier every 400 Strength Points, and the
// points come from THREE server-authoritative sources (computed by the API in `dashboard.strength`, never here):
//   finalized exams × 100  +  T-series practice best (≤ 25 each)  +  projects round(overallProgress × 4) (≤ 400 each)
// The SAME six rank tiers / images remain the visual progression. With zero practice and project points this is
// exactly the historical "one tier per four finalized exams" cadence (4 × 100 = 400), so every finalized-count
// helper below is kept as a backward-compatible wrapper and proven equivalent by tests.
//
// Provisional / pendingReview results, raw percentages and averages never reach the tier: `averageFinalized` is
// carried on the rank object for the academic-average display only. Medals keep their own separate thresholds
// (see medals.ts) — this file never touches those.

/** Historical cadence: one tier per this-many finalized exams (= RANK_STEP_STRENGTH_POINTS / 100). Kept as the
 *  single source of truth for the finalized-count compatibility helpers — never hardcode the 4 elsewhere. */
export const RANK_STEP_FINALIZED = 4;
/** The unified cadence: one tier per this-many Strength Points. */
export const RANK_STEP_STRENGTH_POINTS = 400;
/** Strength Points per finalized exam (the compatibility bridge: 4 exams × 100 = one tier). */
export const FINALIZED_EXAM_STRENGTH_POINTS = 100;

// The six-tier system. Tier IDs, labels and the visual rank colors (avatar frame CSS) are preserved.
export type RankTier = "beginner" | "bronze" | "silver" | "gold" | "diamond" | "legendary";
export const RANK_ORDER: RankTier[] = ["beginner", "bronze", "silver", "gold", "diamond", "legendary"];
export const RANK_LABELS: Record<RankTier, string> = { beginner: "مبتدئ", bronze: "برونزي", silver: "فضي", gold: "ذهبي", diamond: "ألماسي", legendary: "أسطوري" };

/** `remaining` and `percent` are measured in Strength Points within the current 400-point block. */
export type NextRank = { tier: RankTier; label: string; remaining: number; percent: number };
export type StudentRank = { tier: RankTier; label: string; averageFinalized: number; finalized: number; points: number; next: NextRank | null };
export type RankInput = { finalized?: number | null; averageFinalized?: number | null } | null | undefined;
export type RankProgress = { finalized: number; withinBlock: number; needed: number; remaining: number; percent: number };
/** Progress through the current 400-point block (before the first rank: toward unlocking level 1). */
export type StrengthProgress = { points: number; withinBlock: number; needed: number; remaining: number; percent: number };

/** A safe non-negative integer (finalized count or Strength Points). NaN / negative / Infinity / malformed → 0. */
function finalizedCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
const pointsCount = finalizedCount;

// ── Unified Strength (canonical) ────────────────────────────────────────────────────────────────────────────────

/** Strength Points of a finalized-exam count alone (the compatibility bridge used when no server strength exists). */
export function strengthFromFinalized(finalized: number | null | undefined): number {
  return finalizedCount(finalized) * FINALIZED_EXAM_STRENGTH_POINTS;
}

/**
 * The rank tier for a Strength total — the heart of the progression:
 *   0–399 → null · 400–799 beginner · 800–1199 bronze · 1200–1599 silver · 1600–1999 gold · 2000–2399 diamond · 2400+ legendary.
 * Deterministic and pure; there is no level 7.
 */
export function rankTierForStrength(points: number | null | undefined): RankTier | null {
  const total = pointsCount(points);
  if (total < RANK_STEP_STRENGTH_POINTS) return null;
  const index = Math.min(Math.floor(total / RANK_STEP_STRENGTH_POINTS) - 1, RANK_ORDER.length - 1);
  return RANK_ORDER[index];
}

/** The next tier and the progress THROUGH the current 400-point block towards it; null at legendary (top). */
export function nextRankForStrength(points: number | null | undefined): NextRank | null {
  const total = pointsCount(points);
  const tier = rankTierForStrength(total);
  if (!tier) return null;
  const index = RANK_ORDER.indexOf(tier);
  if (index >= RANK_ORDER.length - 1) return null; // legendary — no next rank
  const nextTier = RANK_ORDER[index + 1];
  const withinBlock = total % RANK_STEP_STRENGTH_POINTS;
  const remaining = RANK_STEP_STRENGTH_POINTS - withinBlock;
  const percent = Math.round((withinBlock / RANK_STEP_STRENGTH_POINTS) * 100);
  return { tier: nextTier, label: RANK_LABELS[nextTier], remaining, percent };
}

/** The student's rank from a Strength total; `stats` only supplies the display-only finalized count / average. */
export function rankForStrength(points: number | null | undefined, stats?: RankInput): StudentRank | null {
  const total = pointsCount(points);
  const tier = rankTierForStrength(total);
  if (!tier) return null;
  const avgRaw = stats?.averageFinalized;
  const avg = Number(avgRaw);
  const averageFinalized = avgRaw !== null && avgRaw !== undefined && Number.isFinite(avg) ? avg : 0;
  return { tier, label: RANK_LABELS[tier], averageFinalized, finalized: finalizedCount(stats?.finalized), points: total, next: nextRankForStrength(total) };
}

/** Progress within the current 400-point block (the power ring before the first rank and between ranks). */
export function strengthProgress(points: number | null | undefined): StrengthProgress {
  const total = pointsCount(points);
  const withinBlock = total % RANK_STEP_STRENGTH_POINTS;
  const remaining = RANK_STEP_STRENGTH_POINTS - withinBlock;
  return { points: total, withinBlock, needed: RANK_STEP_STRENGTH_POINTS, remaining, percent: Math.round((withinBlock / RANK_STEP_STRENGTH_POINTS) * 100) };
}

/** «بقي 280 نقطة قوة» — the caller appends the destination (« للوصول إلى رتبة X»). */
export function remainingPointsPhrase(remaining: number): string {
  const r = Math.max(1, Math.floor(Number(remaining) || 1));
  if (r === 1) return "بقيت نقطة قوة واحدة";
  if (r === 2) return "بقيت نقطتا قوة";
  return "بقي " + r + " نقطة قوة";
}

// ── Finalized-count compatibility wrappers (finalized × 100 — proven equivalent by tests) ──────────────────────

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
  return { tier, label: RANK_LABELS[tier], averageFinalized, finalized, points: strengthFromFinalized(finalized), next: nextRankForFinalized(finalized) };
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
