import { describe, it, expect } from "vitest";
import {
  FINALIZED_EXAM_STRENGTH_POINTS, TRAINING_MAX_STRENGTH_POINTS, PROJECT_MAX_STRENGTH_POINTS, RANK_STEP_STRENGTH_POINTS, RANK_ORDER,
  strengthFromFinalizedCount, strengthFromTrainingBest, strengthFromProjectProgress, practicePointsFromTrainings,
  rankTierFromStrength, strengthProgress, buildStrengthSummary
} from "../src/lib/student-strength.js";

// Unified Strength Points — the one progression policy. Pure, deterministic; pins the owner's acceptance numbers.

describe("canonical constants", () => {
  it("100 per finalized exam · 25 max per training · 400 max per project · 400 per rank level · six ranks", () => {
    expect(FINALIZED_EXAM_STRENGTH_POINTS).toBe(100);
    expect(TRAINING_MAX_STRENGTH_POINTS).toBe(25);
    expect(PROJECT_MAX_STRENGTH_POINTS).toBe(400);
    expect(RANK_STEP_STRENGTH_POINTS).toBe(400);
    expect(RANK_ORDER).toEqual(["beginner", "bronze", "silver", "gold", "diamond", "legendary"]);
  });
});

describe("contributions", () => {
  it("exams: count × 100; malformed counts → 0", () => {
    expect(strengthFromFinalizedCount(0)).toBe(0); expect(strengthFromFinalizedCount(3)).toBe(300); expect(strengthFromFinalizedCount(24)).toBe(2400);
    for (const bad of [-1, NaN, Infinity, "x", null, undefined, 2.9]) expect(strengthFromFinalizedCount(bad)).toBe(bad === 2.9 ? 200 : 0);
  });
  it("training best: 40 → 10, 60 → 15, 80 → 20, 100 → 25; clamped 0..100; deterministic rounding", () => {
    expect(strengthFromTrainingBest(40)).toBe(10); expect(strengthFromTrainingBest(60)).toBe(15); expect(strengthFromTrainingBest(80)).toBe(20); expect(strengthFromTrainingBest(100)).toBe(25);
    expect(strengthFromTrainingBest(50)).toBe(13); expect(strengthFromTrainingBest(0)).toBe(0);
    expect(strengthFromTrainingBest(150)).toBe(25); expect(strengthFromTrainingBest(-20)).toBe(0); expect(strengthFromTrainingBest("abc")).toBe(0);
  });
  it("project progress: 0 → 0, 1 → 4, 25 → 100, 50 → 200, 75 → 300, 100 → 400; malformed clamped to 0..100", () => {
    expect(strengthFromProjectProgress(0)).toBe(0); expect(strengthFromProjectProgress(1)).toBe(4); expect(strengthFromProjectProgress(25)).toBe(100);
    expect(strengthFromProjectProgress(50)).toBe(200); expect(strengthFromProjectProgress(75)).toBe(300); expect(strengthFromProjectProgress(100)).toBe(400);
    expect(strengthFromProjectProgress(120)).toBe(400); expect(strengthFromProjectProgress(-5)).toBe(0); expect(strengthFromProjectProgress(NaN)).toBe(0); expect(strengthFromProjectProgress(null)).toBe(0);
  });
  it("practice total sums the best of each unique training from bestPercentage (stored bestPoints are never trusted)", () => {
    expect(practicePointsFromTrainings({ T01: { bestPercentage: 80, bestPoints: 999 }, T02: { bestPercentage: 100 } })).toBe(45);
    expect(practicePointsFromTrainings({})).toBe(0); expect(practicePointsFromTrainings(null)).toBe(0); expect(practicePointsFromTrainings({ T01: null, T02: "x" })).toBe(0);
  });
});

describe("rank thresholds — unified Strength", () => {
  it("0–399 none · 400 beginner · 800 bronze · 1200 silver · 1600 gold · 2000 diamond · 2400+ legendary; no level 7", () => {
    expect(rankTierFromStrength(0)).toBeNull(); expect(rankTierFromStrength(399)).toBeNull();
    expect(rankTierFromStrength(400)).toBe("beginner"); expect(rankTierFromStrength(799)).toBe("beginner");
    expect(rankTierFromStrength(800)).toBe("bronze"); expect(rankTierFromStrength(1199)).toBe("bronze");
    expect(rankTierFromStrength(1200)).toBe("silver"); expect(rankTierFromStrength(1600)).toBe("gold");
    expect(rankTierFromStrength(2000)).toBe("diamond"); expect(rankTierFromStrength(2399)).toBe("diamond");
    expect(rankTierFromStrength(2400)).toBe("legendary"); expect(rankTierFromStrength(9999)).toBe("legendary");
  });
  it("OLD RANK REGRESSION: with zero practice/project points the finalized-exam boundaries are unchanged", () => {
    const tierForFinalized = n => rankTierFromStrength(buildStrengthSummary({ finalizedCount: n }).totalPoints);
    expect([3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23, 24].map(tierForFinalized)).toEqual([null, "beginner", "beginner", "bronze", "bronze", "silver", "silver", "gold", "gold", "diamond", "diamond", "legendary"]);
  });
  it("strengthProgress: within-block points / remaining / percent; top rank is a full decorative 100%", () => {
    expect(strengthProgress(0)).toMatchObject({ tier: null, level: 0, nextTier: "beginner", withinLevelPoints: 0, nextLevelRemaining: 400, percent: 0, levelBlockSize: 400 });
    expect(strengthProgress(200)).toMatchObject({ tier: null, level: 0, nextTier: "beginner", withinLevelPoints: 200, nextLevelRemaining: 200, percent: 50 });
    expect(strengthProgress(520)).toMatchObject({ tier: "beginner", level: 1, nextTier: "bronze", withinLevelPoints: 120, nextLevelRemaining: 280, percent: 30 });
    expect(strengthProgress(2400)).toMatchObject({ tier: "legendary", level: 6, nextTier: null, withinLevelPoints: 400, nextLevelRemaining: 0, percent: 100 });
    expect(strengthProgress(3000)).toMatchObject({ tier: "legendary", percent: 100 });
  });
});

describe("buildStrengthSummary — owner acceptance scenarios", () => {
  it("PROJECT-ONLY 50%: 0 exams, 0 practice, project 50% → 200 points, 50% toward the first rank", () => {
    const s = buildStrengthSummary({ finalizedCount: 0, trainings: {}, projects: [{ projectCode: "794589", overallProgress: 50 }] });
    expect(s).toMatchObject({ totalPoints: 200, examPoints: 0, practicePoints: 0, projectPoints: 200, tier: null, level: 0, withinLevelPoints: 200, nextLevelRemaining: 200, percent: 50 });
    expect(s.projects).toEqual([{ projectCode: "794589", overallProgress: 50, strengthPoints: 200 }]);
  });
  it("PROJECT-ONLY 100%: unlocks level 1 (بذرة القوة) with 400 points and no assignments at all", () => {
    const s = buildStrengthSummary({ finalizedCount: 0, projects: [{ projectCode: "794589", overallProgress: 100 }] });
    expect(s).toMatchObject({ totalPoints: 400, projectPoints: 400, tier: "beginner", level: 1, withinLevelPoints: 0, nextLevelRemaining: 400, percent: 0 });
  });
  it("MIXED: 3 exams (300) + T02 best 80% (20) + project 50% (200) = 520 → level 1, 120/400, 30%, 280 remaining", () => {
    const s = buildStrengthSummary({ finalizedCount: 3, trainings: { T02: { bestPercentage: 80 } }, projects: [{ projectCode: "794589", overallProgress: 50 }] });
    expect(s).toMatchObject({ totalPoints: 520, examPoints: 300, practicePoints: 20, projectPoints: 200, tier: "beginner", level: 1, nextTier: "bronze", withinLevelPoints: 120, nextLevelRemaining: 280, percent: 30 });
  });
  it("MULTI-PROJECT: A 50% + B 25% = 300, each project counted once and capped at 400", () => {
    const s = buildStrengthSummary({ projects: [{ projectCode: "A", overallProgress: 50 }, { projectCode: "B", overallProgress: 25 }] });
    expect(s.projectPoints).toBe(300);
    expect(s.projects.map(p => p.strengthPoints)).toEqual([200, 100]);
    expect(buildStrengthSummary({ projects: [{ projectCode: "A", overallProgress: 100 }, { projectCode: "B", overallProgress: 100 }] })).toMatchObject({ projectPoints: 800, tier: "bronze" });
  });
  it("DERIVED, NOT FARMED: the same project state always yields the same points; a lowered progress lowers the contribution", () => {
    const at = pct => buildStrengthSummary({ projects: [{ projectCode: "A", overallProgress: pct }] }).projectPoints;
    expect(at(75)).toBe(300); expect(at(75)).toBe(300); expect(at(75)).toBe(300);
    expect(at(40)).toBe(160);                                              // teacher reset/correction: follows current state
  });
  it("malformed input → zeros, never NaN", () => {
    const s = buildStrengthSummary({ finalizedCount: "x", trainings: "nope", projects: "nope" });
    expect(s).toMatchObject({ totalPoints: 0, examPoints: 0, practicePoints: 0, projectPoints: 0, tier: null, projects: [] });
    expect(buildStrengthSummary()).toMatchObject({ totalPoints: 0 });
  });
});
