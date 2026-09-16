import { describe, it, expect } from "vitest";
import { RANK_MIN_FINALIZED, rankFor, rankProgress, rankTierFor } from "./studentRank";

// UX-7 — personal rank: finalized-only inputs, unlocked at >= 10 finalized assignments, never a leaderboard.
describe("studentRank", () => {
  it("is null below RANK_MIN_FINALIZED finalized assignments, whatever the average", () => {
    expect(RANK_MIN_FINALIZED).toBe(10);
    expect(rankFor({ finalized: 0, averageFinalized: 99 })).toBeNull();
    expect(rankFor({ finalized: 9, averageFinalized: 99 })).toBeNull();
    expect(rankFor(null)).toBeNull();
    expect(rankFor(undefined)).toBeNull();
    expect(rankFor({})).toBeNull();
  });
  it("is null without a server finalized average even at 10+ finalized", () => {
    expect(rankFor({ finalized: 12, averageFinalized: null })).toBeNull();
    expect(rankFor({ finalized: 12 })).toBeNull();
    expect(rankFor({ finalized: 12, averageFinalized: Number.NaN })).toBeNull();
  });
  it("unlocks exactly at 10 and maps the finalized average to a tier (90 gold / 80 silver / 70 bronze / else starter)", () => {
    expect(rankFor({ finalized: 10, averageFinalized: 90 })).toEqual({ tier: "gold", label: "متفوّق", averageFinalized: 90, finalized: 10 });
    expect(rankFor({ finalized: 10, averageFinalized: 89.9 })?.tier).toBe("silver");
    expect(rankFor({ finalized: 15, averageFinalized: 80 })?.tier).toBe("silver");
    expect(rankFor({ finalized: 15, averageFinalized: 79.9 })?.tier).toBe("bronze");
    expect(rankFor({ finalized: 15, averageFinalized: 70 })?.tier).toBe("bronze");
    expect(rankFor({ finalized: 15, averageFinalized: 69.9 })?.tier).toBe("starter");
    expect(rankFor({ finalized: 15, averageFinalized: 0 })?.label).toBe("في الطريق");
    expect(rankTierFor(100)).toBe("gold");
  });
  it("ignores every other stat: pendingReview / legacy average / submitted never change the outcome", () => {
    const base = { finalized: 10, averageFinalized: 85 };
    expect(rankFor({ ...base, pendingReview: 40, average: 20, submitted: 50, completed: 50 } as never)).toEqual(rankFor(base));
    expect(rankFor({ finalized: 9, averageFinalized: 85, pendingReview: 5, completed: 14 } as never)).toBeNull();   // pending never counts towards 10
  });
  it("reports progression towards the unlock, capped at the threshold", () => {
    expect(rankProgress({ finalized: 0 })).toEqual({ finalized: 0, needed: 10, remaining: 10, percent: 0 });
    expect(rankProgress({ finalized: 3 })).toEqual({ finalized: 3, needed: 10, remaining: 7, percent: 30 });
    expect(rankProgress({ finalized: 14 })).toEqual({ finalized: 14, needed: 10, remaining: 0, percent: 100 });
    expect(rankProgress(null).percent).toBe(0);
  });
});
