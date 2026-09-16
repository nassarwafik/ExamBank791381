import { describe, it, expect } from "vitest";
import { RANK_MIN_FINALIZED, RANK_ORDER, nextRankProgress, rankFor, rankProgress, rankTierFor } from "./studentRank";

// UX-7 — personal rank: finalized-only inputs, unlocked at >= 10 finalized assignments, the locked six-tier
// system on the UNROUNDED finalized average, progress to the next tier, never a leaderboard.
describe("studentRank", () => {
  it("is null below RANK_MIN_FINALIZED finalized assignments, whatever the average (9 + 99 => no rank)", () => {
    expect(RANK_MIN_FINALIZED).toBe(10);
    expect(rankFor({ finalized: 9, averageFinalized: 99 })).toBeNull();
    expect(rankFor({ finalized: 0, averageFinalized: 99 })).toBeNull();
    expect(rankFor(null)).toBeNull();
    expect(rankFor(undefined)).toBeNull();
    expect(rankFor({})).toBeNull();
  });
  it("is null without a server finalized average even at 10+ finalized", () => {
    expect(rankFor({ finalized: 12, averageFinalized: null })).toBeNull();
    expect(rankFor({ finalized: 12 })).toBeNull();
    expect(rankFor({ finalized: 12, averageFinalized: Number.NaN })).toBeNull();
  });
  it("maps the unrounded finalized average to the six tiers at exactly 10 finalized (locked boundaries)", () => {
    const at = (avg: number) => rankFor({ finalized: 10, averageFinalized: avg });
    const table: [number, string, string][] = [
      [59.9, "beginner", "مبتدئ"], [60, "bronze", "برونزي"], [69.9, "bronze", "برونزي"], [70, "silver", "فضي"], [79.9, "silver", "فضي"],
      [80, "gold", "ذهبي"], [89.9, "gold", "ذهبي"], [90, "diamond", "ألماسي"], [95.9, "diamond", "ألماسي"], [96, "legendary", "أسطوري"], [100, "legendary", "أسطوري"]
    ];
    for (const [avg, tier, label] of table) {
      const r = at(avg);
      expect(r?.tier, String(avg)).toBe(tier);
      expect(r?.label, String(avg)).toBe(label);
      expect(r?.averageFinalized).toBe(avg);
      expect(r?.finalized).toBe(10);
    }
    expect(rankTierFor(0)).toBe("beginner");
    expect(RANK_ORDER).toEqual(["beginner", "bronze", "silver", "gold", "diamond", "legendary"]);
  });
  it("never rounds before choosing the tier", () => {
    expect(rankTierFor(59.99)).toBe("beginner");
    expect(rankTierFor(69.5)).toBe("bronze");
    expect(rankTierFor(79.6)).toBe("silver");
    expect(rankTierFor(89.95)).toBe("gold");
    expect(rankTierFor(95.99)).toBe("diamond");
  });
  it("ignores every other stat: pendingReview never counts towards the 10 and average / latestPercentage / raw score are never inputs", () => {
    const base = { finalized: 10, averageFinalized: 85 };
    expect(rankFor({ ...base, pendingReview: 40, average: 20, latestPercentage: 5, score: 1, submitted: 50, completed: 50 } as never)).toEqual(rankFor(base));
    expect(rankFor({ finalized: 9, averageFinalized: 85, pendingReview: 5, completed: 14, submitted: 14 } as never)).toBeNull();
  });
  it("reports progress from the current tier floor to the next threshold (65 bronze => 50% toward silver, 75 => gold, 85 => diamond, 93 => legendary)", () => {
    expect(rankFor({ finalized: 10, averageFinalized: 65 })?.next).toEqual({ tier: "silver", label: "فضي", threshold: 70, percent: 50 });
    expect(rankFor({ finalized: 10, averageFinalized: 75 })?.next).toEqual({ tier: "gold", label: "ذهبي", threshold: 80, percent: 50 });
    expect(rankFor({ finalized: 10, averageFinalized: 85 })?.next).toEqual({ tier: "diamond", label: "ألماسي", threshold: 90, percent: 50 });
    expect(rankFor({ finalized: 10, averageFinalized: 93 })?.next).toEqual({ tier: "legendary", label: "أسطوري", threshold: 96, percent: 50 });
    expect(rankFor({ finalized: 10, averageFinalized: 30 })?.next).toEqual({ tier: "bronze", label: "برونزي", threshold: 60, percent: 50 });
    expect(nextRankProgress("beginner", 0)?.percent).toBe(0);
    expect(nextRankProgress("diamond", 95.9)?.percent).toBe(98);
  });
  it("legendary has no next rank", () => {
    expect(rankFor({ finalized: 10, averageFinalized: 96 })?.next).toBeNull();
    expect(rankFor({ finalized: 25, averageFinalized: 100 })?.next).toBeNull();
    expect(nextRankProgress("legendary", 100)).toBeNull();
  });
  it("reports progression towards the unlock, capped at the threshold", () => {
    expect(rankProgress({ finalized: 0 })).toEqual({ finalized: 0, needed: 10, remaining: 10, percent: 0 });
    expect(rankProgress({ finalized: 3 })).toEqual({ finalized: 3, needed: 10, remaining: 7, percent: 30 });
    expect(rankProgress({ finalized: 14 })).toEqual({ finalized: 14, needed: 10, remaining: 0, percent: 100 });
    expect(rankProgress(null).percent).toBe(0);
  });
});
