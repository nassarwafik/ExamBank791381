import { describe, it, expect } from "vitest";
import { RANK_STEP_FINALIZED, RANK_ORDER, rankTierForFinalized, nextRankForFinalized, rankFor, rankProgress, remainingExamsPhrase } from "./studentRank";

// Student Portal — the personal rank now advances by ONE tier every FOUR finalized exams (progression by
// completed finalized exams, NOT by average). These tests pin the NEW recurring cadence at every boundary and
// prove (a) the tier depends ONLY on the finalized count, never the average, and (b) no non-finalized stat can
// change it.

describe("RANK_STEP_FINALIZED", () => {
  it("is the single source of truth (4) and the tier order is preserved", () => {
    expect(RANK_STEP_FINALIZED).toBe(4);
    expect(RANK_ORDER).toEqual(["beginner", "bronze", "silver", "gold", "diamond", "legendary"]);
  });
});

describe("rankTierForFinalized — one tier every four finalized exams", () => {
  const boundaries: [number, string | null][] = [
    [0, null], [1, null], [3, null],
    [4, "beginner"], [7, "beginner"],
    [8, "bronze"], [11, "bronze"],
    [12, "silver"], [15, "silver"],
    [16, "gold"], [19, "gold"],
    [20, "diamond"], [23, "diamond"],
    [24, "legendary"], [25, "legendary"], [40, "legendary"], [1000, "legendary"]
  ];
  it("maps every boundary to the exact tier", () => {
    for (const [count, tier] of boundaries) expect(rankTierForFinalized(count), String(count)).toBe(tier);
  });
  it("treats negative / NaN / Infinity / malformed counts as 0 (no rank)", () => {
    expect(rankTierForFinalized(-1)).toBeNull();
    expect(rankTierForFinalized(-100)).toBeNull();
    expect(rankTierForFinalized(Number.NaN)).toBeNull();
    expect(rankTierForFinalized(Infinity)).toBeNull();
    expect(rankTierForFinalized(-Infinity)).toBeNull();
    expect(rankTierForFinalized(null)).toBeNull();
    expect(rankTierForFinalized(undefined)).toBeNull();
    expect(rankTierForFinalized("x" as unknown as number)).toBeNull();
  });
  it("uses integer counts (a fractional value floors into its block)", () => {
    expect(rankTierForFinalized(4.9)).toBe("beginner");
    expect(rankTierForFinalized(7.99)).toBe("beginner");
    expect(rankTierForFinalized(8.01)).toBe("bronze");
  });
});

describe("rank is derived from the finalized COUNT only — NEVER the average", () => {
  it("finalized 8 is bronze regardless of the average (20, 99, or null)", () => {
    for (const averageFinalized of [20, 99, null]) {
      const r = rankFor({ finalized: 8, averageFinalized });
      expect(r?.tier, String(averageFinalized)).toBe("bronze");
      expect(r?.label).toBe("برونزي");
    }
  });
  it("carries the finalized average through for display, but a bad average never changes the tier", () => {
    expect(rankFor({ finalized: 12, averageFinalized: 85 })).toMatchObject({ tier: "silver", averageFinalized: 85, finalized: 12 });
    expect(rankFor({ finalized: 12, averageFinalized: Number.NaN })?.tier).toBe("silver");   // NaN avg → still silver (count-based)
    expect(rankFor({ finalized: 12, averageFinalized: null })?.averageFinalized).toBe(0);    // display falls back to 0, tier unchanged
  });
  it("is null below the first block whatever the average", () => {
    expect(rankFor({ finalized: 3, averageFinalized: 99 })).toBeNull();
    expect(rankFor({ finalized: 0, averageFinalized: 100 })).toBeNull();
    expect(rankFor(null)).toBeNull();
    expect(rankFor({})).toBeNull();
  });
});

describe("rank counts ONLY finalized — no other stat can change it", () => {
  it("finalized 7 stays beginner even with pendingReview 100; finalized 8 is what unlocks bronze", () => {
    expect(rankFor({ finalized: 7, pendingReview: 100, submitted: 100, assigned: 100, completed: 100, score: 99, latestPercentage: 99 } as never)?.tier).toBe("beginner");
    expect(rankFor({ finalized: 8 } as never)?.tier).toBe("bronze");
  });
  it("unrelated fields never shift the tier (same result with and without them)", () => {
    const base = { finalized: 16, averageFinalized: 50 };
    expect(rankFor({ ...base, pendingReview: 40, submitted: 30, assigned: 99, completed: 12, score: 5, latestPercentage: 3 } as never)).toEqual(rankFor(base));
  });
});

describe("nextRankForFinalized — progress THROUGH the four-exam block", () => {
  it("beginner→bronze block: 4 = 0%, 5 = 25%, 7 = 75%", () => {
    expect(nextRankForFinalized(4)).toEqual({ tier: "bronze", label: "برونزي", remaining: 4, percent: 0 });
    expect(nextRankForFinalized(5)).toEqual({ tier: "bronze", label: "برونزي", remaining: 3, percent: 25 });
    expect(nextRankForFinalized(7)).toEqual({ tier: "bronze", label: "برونزي", remaining: 1, percent: 75 });
  });
  it("each unlocked tier starts a fresh 0% block toward the next tier", () => {
    expect(nextRankForFinalized(8)).toEqual({ tier: "silver", label: "فضي", remaining: 4, percent: 0 });
    expect(nextRankForFinalized(11)).toEqual({ tier: "silver", label: "فضي", remaining: 1, percent: 75 });
    expect(nextRankForFinalized(12)).toMatchObject({ tier: "gold", percent: 0 });
    expect(nextRankForFinalized(20)).toMatchObject({ tier: "legendary", percent: 0 });
    expect(nextRankForFinalized(23)).toEqual({ tier: "legendary", label: "أسطوري", remaining: 1, percent: 75 });
  });
  it("legendary has no next rank", () => {
    expect(nextRankForFinalized(24)).toBeNull();
    expect(nextRankForFinalized(40)).toBeNull();
    expect(rankFor({ finalized: 24, averageFinalized: 50 })?.next).toBeNull();
  });
  it("no next rank below the first tier", () => {
    expect(nextRankForFinalized(0)).toBeNull();
    expect(nextRankForFinalized(3)).toBeNull();
  });
});

describe("rankProgress — the four-exam cycle (used before the first rank)", () => {
  it("counts within the current block (0/4 .. 3/4) with no off-by-one", () => {
    expect(rankProgress({ finalized: 0 })).toEqual({ finalized: 0, withinBlock: 0, needed: 4, remaining: 4, percent: 0 });
    expect(rankProgress({ finalized: 1 })).toEqual({ finalized: 1, withinBlock: 1, needed: 4, remaining: 3, percent: 25 });
    expect(rankProgress({ finalized: 3 })).toEqual({ finalized: 3, withinBlock: 3, needed: 4, remaining: 1, percent: 75 });
  });
  it("wraps every four exams (4 → 0%, 5 → 25%, 8 → 0%)", () => {
    expect(rankProgress({ finalized: 4 }).percent).toBe(0);
    expect(rankProgress({ finalized: 5 }).percent).toBe(25);
    expect(rankProgress({ finalized: 8 }).percent).toBe(0);
  });
  it("safe on malformed input", () => {
    expect(rankProgress(null).percent).toBe(0);
    expect(rankProgress({ finalized: -3 }).percent).toBe(0);
    expect(rankProgress({ finalized: Infinity }).percent).toBe(0);
  });
});

describe("remainingExamsPhrase — natural Arabic singular/dual/plural", () => {
  it("reads correctly for 1..4 remaining", () => {
    expect(remainingExamsPhrase(1)).toBe("بقي امتحان واحد");
    expect(remainingExamsPhrase(2)).toBe("بقي امتحانان");
    expect(remainingExamsPhrase(3)).toBe("بقي 3 امتحانات");
    expect(remainingExamsPhrase(4)).toBe("بقي 4 امتحانات");
  });
});
