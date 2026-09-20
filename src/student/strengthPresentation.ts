// Unified Strength (نقاط القوة) — PRESENTATION of the server's `dashboard.strength`.
//
// Authority contract (one policy, on the server — api/src/lib/student-strength.js):
//   • `strength` payload present and well-formed → it is trusted COMPLETELY: tier, level, nextTier, levelBlockSize,
//     withinLevelPoints, nextLevelRemaining and percent are the server's values. Nothing here divides, floors or
//     compares totalPoints against a threshold; the helpers below only shape and label those values (tier id →
//     Arabic label / artwork is presentation, not policy).
//   • no `strength` payload at all (an older API during a rollout) → the LEGACY finalized-only fallback: finalized
//     × 100 through the compatibility helpers of studentRank.ts, so the ring never disappears. That is the ONLY
//     place a rank is derived on the client, and it is used as a WHOLE — server fields are never mixed with locally
//     recalculated ones.
//   • a `strength` object that is malformed / incomplete (a missing or non-numeric field, an unknown tier id) →
//     treated exactly like "no payload": the whole legacy fallback, never a partial acceptance.
import { RANK_LABELS, RANK_ORDER, nextRankForStrength, rankTierForStrength, strengthFromFinalized, strengthProgress, type RankTier, type StrengthProgress, type StudentRank } from "../studentRank";
import type { ProjectStrength, StudentStrength } from "./types";

const NUMERIC_FIELDS = ["totalPoints", "examPoints", "practicePoints", "projectPoints", "level", "levelBlockSize", "withinLevelPoints", "nextLevelRemaining", "percent"] as const;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isTierOrNull = (v: unknown): v is RankTier | null => v === null || (typeof v === "string" && (RANK_ORDER as string[]).includes(v));

/** True when `raw` is a complete, well-formed server Strength payload (the documented acceptance rule). */
export function isServerStrength(raw: unknown): raw is StudentStrength {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return NUMERIC_FIELDS.every(k => isFiniteNumber(r[k])) && isTierOrNull(r.tier) && isTierOrNull(r.nextTier) && Array.isArray(r.projects);
}

/** Which authority `normalizeStrength` would use for a raw payload — "server" or the "legacy" finalized fallback. */
export function strengthAuthority(raw: unknown): "server" | "legacy" {
  return isServerStrength(raw) ? "server" : "legacy";
}

const nonNegativeInt = (value: number): number => (value > 0 ? Math.trunc(value) : 0);

/** A well-formed StudentStrength from the server payload; `finalized` feeds the legacy fallback only. */
export function normalizeStrength(raw: unknown, finalized: number | null | undefined): StudentStrength {
  if (!isServerStrength(raw)) return legacyStrength(finalized);
  const projects: ProjectStrength[] = (raw.projects as unknown[])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map(x => ({ projectCode: String(x.projectCode || ""), overallProgress: isFiniteNumber(x.overallProgress) ? nonNegativeInt(x.overallProgress) : 0, strengthPoints: isFiniteNumber(x.strengthPoints) ? nonNegativeInt(x.strengthPoints) : 0 }));
  // Shape only: integers where the contract is integral; the tier ids and the progression are the server's.
  return {
    totalPoints: nonNegativeInt(raw.totalPoints), examPoints: nonNegativeInt(raw.examPoints), practicePoints: nonNegativeInt(raw.practicePoints), projectPoints: nonNegativeInt(raw.projectPoints),
    // Study Practice Strength is a later, optional field: an older payload without it is still a complete server payload.
    studyPoints: isFiniteNumber((raw as Record<string, unknown>).studyPoints) ? nonNegativeInt((raw as Record<string, unknown>).studyPoints as number) : 0,
    tier: raw.tier, level: nonNegativeInt(raw.level), nextTier: raw.nextTier,
    levelBlockSize: nonNegativeInt(raw.levelBlockSize), withinLevelPoints: nonNegativeInt(raw.withinLevelPoints), nextLevelRemaining: nonNegativeInt(raw.nextLevelRemaining), percent: nonNegativeInt(raw.percent),
    projects,
  };
}

/** The rank object the progress section renders, shaped from the SERVER's tier / nextTier / block progress. */
export function rankPresentationFromStrength(strength: StudentStrength, stats: { finalized?: number | null; averageFinalized?: number | null } | null | undefined): StudentRank | null {
  if (!strength.tier) return null;
  const avgRaw = stats?.averageFinalized;
  const avg = Number(avgRaw);
  const next = strength.nextTier
    ? { tier: strength.nextTier, label: RANK_LABELS[strength.nextTier], remaining: strength.nextLevelRemaining, percent: strength.percent }
    : null;
  return {
    tier: strength.tier, label: RANK_LABELS[strength.tier],
    averageFinalized: avgRaw !== null && avgRaw !== undefined && Number.isFinite(avg) ? avg : 0,
    finalized: isFiniteNumber(stats?.finalized) ? nonNegativeInt(stats!.finalized as number) : 0,
    points: strength.totalPoints,
    next,
  };
}

/** The ring / "next level" progress, shaped from the SERVER's block values (never recomputed from totalPoints). */
export function progressPresentationFromStrength(strength: StudentStrength): StrengthProgress {
  return { points: strength.totalPoints, withinBlock: strength.withinLevelPoints, needed: strength.levelBlockSize, remaining: strength.nextLevelRemaining, percent: strength.percent };
}

/** The project contribution row for one project code (null when the server reported none). */
export function projectContribution(strength: StudentStrength | null | undefined, projectCode: string): ProjectStrength | null {
  return strength?.projects.find(p => p.projectCode === projectCode) ?? null;
}

// ── Legacy fallback (no / malformed server payload): finalized × 100 through the compatibility helpers ─────────
function legacyStrength(finalized: number | null | undefined): StudentStrength {
  const examPoints = strengthFromFinalized(finalized);
  const tier = rankTierForStrength(examPoints);
  const next = nextRankForStrength(examPoints);
  const p = strengthProgress(examPoints);
  return {
    totalPoints: examPoints, examPoints, practicePoints: 0, studyPoints: 0, projectPoints: 0,
    tier, level: tier ? RANK_ORDER.indexOf(tier) + 1 : 0, nextTier: tier ? (next ? next.tier : null) : "beginner",
    levelBlockSize: p.needed, withinLevelPoints: tier && !next ? p.needed : p.withinBlock, nextLevelRemaining: tier && !next ? 0 : p.remaining, percent: tier && !next ? 100 : p.percent,
    projects: [],
  };
}
