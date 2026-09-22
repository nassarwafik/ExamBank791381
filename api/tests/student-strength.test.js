import { describe, it, expect } from "vitest";
import {
  LIBRARY_ITEM_MAX_POINTS, MODULE_MAX_POINTS, STAGE_SPAN, STAGE_COUNT, STRENGTH_TOTAL_MAX,
  libraryItemCountsTowardStrength, libraryItemMaxPoints, strengthFromLibraryBest, strengthFromLibraryResult,
  libraryPointsFromTrainings, gradableStrengthPercentage,
  strengthFromModuleCompletion, modulePointsFromCompletion,
  stageForTotal, stageProgress, buildStrengthSummary,
} from "../src/lib/student-strength.js";

// UNIFIED STRENGTH POINTS — the 25-STAGE progression policy. Pure, deterministic; pins the owner's authoritative
// model: library items (T01–T30 + F01–F06, ≤40 each = 1440) + book modules (28 × ≤20 = 560) = 0..2000, stage = 25×80.

describe("canonical constants — the 25-stage model", () => {
  it("40 max per library item · 20 max per module · 80 per stage · 25 stages · 2000 total", () => {
    expect(LIBRARY_ITEM_MAX_POINTS).toBe(40);
    expect(MODULE_MAX_POINTS).toBe(20);
    expect(STAGE_SPAN).toBe(80);
    expect(STAGE_COUNT).toBe(25);
    expect(STRENGTH_TOTAL_MAX).toBe(2000);
    // the two source ceilings sum to EXACTLY 2000 (36 × 40 = 1440 library + 28 × 20 = 560 modules)
    expect(36 * LIBRARY_ITEM_MAX_POINTS + 28 * MODULE_MAX_POINTS).toBe(STRENGTH_TOTAL_MAX);
  });
});

describe("library source — T01–T30 AND F01–F06 both count (up to 40 each)", () => {
  it("which ids count: every T-series and F-series id → true; anything else → false", () => {
    for (const id of ["T01", "T30", "F01", "F06", "T5", "F3"]) expect(libraryItemCountsTowardStrength(id), id).toBe(true);
    for (const id of ["", "X01", "T", "01", "m01", null, undefined, "PROJECT", "TF01"]) expect(libraryItemCountsTowardStrength(id), String(id)).toBe(false);
  });
  it("ceiling advertised: 40 for a T/F id, 0 for anything else", () => {
    expect(libraryItemMaxPoints("T01")).toBe(40);
    expect(libraryItemMaxPoints("F06")).toBe(40);
    expect(libraryItemMaxPoints("m01")).toBe(0);
  });
  it("strength of ONE item from its best percentage: 100 → 40, 90 → 36, 80 → 32, 50 → 20, 0 → 0; clamped 0..100", () => {
    expect(strengthFromLibraryBest(100)).toBe(40);
    expect(strengthFromLibraryBest(90)).toBe(36);
    expect(strengthFromLibraryBest(80)).toBe(32);
    expect(strengthFromLibraryBest(50)).toBe(20);
    expect(strengthFromLibraryBest(0)).toBe(0);
    expect(strengthFromLibraryBest(150)).toBe(40);   // clamped
    expect(strengthFromLibraryBest(-20)).toBe(0);
    expect(strengthFromLibraryBest("abc")).toBe(0);
  });
  it("per-id result: a T id and an F id BOTH award; a foreign id awards 0 whatever the percentage (req #6, #7)", () => {
    expect(strengthFromLibraryResult("T02", 80)).toBe(32);
    expect(strengthFromLibraryResult("F01", 100)).toBe(40);   // F NOW contributes
    expect(strengthFromLibraryResult("F06", 90)).toBe(36);
    expect(strengthFromLibraryResult("m01", 100)).toBe(0);
    expect(strengthFromLibraryResult("PROJECT", 100)).toBe(0);
  });
  it("library total sums T AND F from bestPercentage only (stored bestPoints are NEVER trusted)", () => {
    expect(libraryPointsFromTrainings({ T01: { bestPercentage: 80, bestPoints: 999 }, T02: { bestPercentage: 100 }, F01: { bestPercentage: 50 } })).toBe(32 + 40 + 20);
    expect(libraryPointsFromTrainings({})).toBe(0);
    expect(libraryPointsFromTrainings(null)).toBe(0);
    expect(libraryPointsFromTrainings({ T01: null, F02: "x", m01: { bestPercentage: 100 } })).toBe(0);   // foreign / malformed ids add 0
  });
});

describe("gradable-only percentage — F final exams are scored over the auto-gradable portion, never understated (req #7)", () => {
  it("no manual-review marks → the ordinary percentage", () => {
    expect(gradableStrengthPercentage({ score: 8, totalMarks: 10, manualReviewMarks: 0 })).toBe(80);
    expect(gradableStrengthPercentage({ score: 10, totalMarks: 10, manualReviewMarks: 0 })).toBe(100);
  });
  it("manual-review marks leave the DENOMINATOR (they don't drag the percentage down)", () => {
    // 38 auto-correct out of (45 − 7 manual) = 38/38 = 100%, not 38/45 = 84%
    expect(gradableStrengthPercentage({ score: 38, totalMarks: 45, manualReviewMarks: 7 })).toBe(100);
    expect(gradableStrengthPercentage({ score: 30, totalMarks: 50, manualReviewMarks: 10 })).toBe(75);   // 30/40
  });
  it("an all-manual item (no auto-gradable marks) → 0; malformed → 0", () => {
    expect(gradableStrengthPercentage({ score: 0, totalMarks: 20, manualReviewMarks: 20 })).toBe(0);
    expect(gradableStrengthPercentage({ score: 10, totalMarks: 10, manualReviewMarks: 10 })).toBe(0);
    expect(gradableStrengthPercentage({})).toBe(0);
    expect(gradableStrengthPercentage()).toBe(0);
  });
});

describe("learning-module source — completion ratio × 20, non-farmable (req #8)", () => {
  it("one module: 0/3 → 0, 1/3 → 7, 2/3 → 13, 3/3 → 20; a zero-eligible module → 0", () => {
    expect(strengthFromModuleCompletion(0, 3)).toBe(0);
    expect(strengthFromModuleCompletion(1, 3)).toBe(7);
    expect(strengthFromModuleCompletion(2, 3)).toBe(13);
    expect(strengthFromModuleCompletion(3, 3)).toBe(20);
    expect(strengthFromModuleCompletion(5, 0)).toBe(0);   // no eligible activities → no points
  });
  it("completed is capped at total (repeating / over-counting can never exceed the module ceiling)", () => {
    expect(strengthFromModuleCompletion(9, 3)).toBe(20);
    expect(strengthFromModuleCompletion(-2, 3)).toBe(0);
  });
  it("module total re-derives every module (nothing stored is trusted)", () => {
    expect(modulePointsFromCompletion({ m01: { completed: 3, total: 3 }, m02: { completed: 1, total: 4, points: 999 } })).toBe(20 + 5);
    expect(modulePointsFromCompletion({})).toBe(0);
    expect(modulePointsFromCompletion(null)).toBe(0);
  });
});

describe("stages — 25 × 80, numbered 1..25, stage 25 completes at 2000 (req #2, #3, #4, #5)", () => {
  it("the stage for a total: 0→1, 79→1, 80→2, 159→2, 160→3, 1919→24, 1920→25, 2000→25 (clamped, no stage 26)", () => {
    expect(stageForTotal(0)).toBe(1);
    expect(stageForTotal(79)).toBe(1);
    expect(stageForTotal(80)).toBe(2);
    expect(stageForTotal(159)).toBe(2);
    expect(stageForTotal(160)).toBe(3);
    expect(stageForTotal(1919)).toBe(24);
    expect(stageForTotal(1920)).toBe(25);
    expect(stageForTotal(2000)).toBe(25);
    expect(stageForTotal(99999)).toBe(25);
    for (const bad of [-1, NaN, Infinity, "x", null, undefined]) expect(stageForTotal(bad), String(bad)).toBe(1);
  });
  it("every 80-point boundary steps exactly one stage (1..25), no off-by-one across the whole range", () => {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      const start = (stage - 1) * STAGE_SPAN;
      expect(stageForTotal(start), "start " + start).toBe(stage);
      if (stage < STAGE_COUNT) expect(stageForTotal(start + STAGE_SPAN - 1), "end " + start).toBe(stage);
    }
  });
  it("within-stage progress: mid-stage, boundary, and the top stage (full 80/80, 100%, nextStage null)", () => {
    expect(stageProgress(0)).toMatchObject({ stage: 1, stageCount: 25, stageSpan: 80, withinStagePoints: 0, nextStageRemaining: 80, percent: 0, nextStage: 2, totalMax: 2000 });
    expect(stageProgress(88)).toMatchObject({ stage: 2, withinStagePoints: 8, nextStageRemaining: 72, percent: 10, nextStage: 3 });
    expect(stageProgress(1920)).toMatchObject({ stage: 25, withinStagePoints: 0, nextStageRemaining: 0, percent: 0, nextStage: null });   // START of the top stage
    expect(stageProgress(2000)).toMatchObject({ stage: 25, withinStagePoints: 80, nextStageRemaining: 0, percent: 100, nextStage: null });   // COMPLETES at the max
    expect(stageProgress(3000)).toMatchObject({ stage: 25, percent: 100, nextStage: null });   // clamped
  });
});

describe("buildStrengthSummary — the owner's authoritative acceptance scenarios", () => {
  it("empty / missing input → 0 points, stage 1 (backward compatible)", () => {
    const s = buildStrengthSummary();
    expect(s).toMatchObject({ totalPoints: 0, libraryPoints: 0, modulePoints: 0, stage: 1, nextStage: 2, withinStagePoints: 0, nextStageRemaining: 80, percent: 0, totalMax: 2000 });
    expect(buildStrengthSummary({ trainings: "nope", moduleCompletion: "nope" })).toMatchObject({ totalPoints: 0, stage: 1 });
    expect(Number.isNaN(s.totalPoints)).toBe(false);
  });
  it("MIXED (library T+F + modules): T02 80% (32) + F01 90% (36) + module 3/3 (20) = 88 → stage 2, 8/80, 10%", () => {
    const s = buildStrengthSummary({ trainings: { T02: { bestPercentage: 80 }, F01: { bestPercentage: 90 } }, moduleCompletion: { m01: { completed: 3, total: 3 } } });
    expect(s).toMatchObject({ totalPoints: 88, libraryPoints: 68, modulePoints: 20, stage: 2, withinStagePoints: 8, nextStageRemaining: 72, percent: 10, nextStage: 3 });
  });
  it("F-series alone now moves Strength (req #7): F01 100% = 40 → stage 1, 40/80", () => {
    const s = buildStrengthSummary({ trainings: { F01: { bestPercentage: 100 } } });
    expect(s).toMatchObject({ totalPoints: 40, libraryPoints: 40, modulePoints: 0, stage: 1, withinStagePoints: 40, percent: 50 });
  });
  it("FULL: all 36 library items at 100% (1440) + all 28 modules complete (560) = 2000 → stage 25 completes (req #5)", () => {
    const trainings = {};
    for (let i = 1; i <= 30; i++) trainings["T" + String(i).padStart(2, "0")] = { bestPercentage: 100 };
    for (let i = 1; i <= 6; i++) trainings["F" + String(i).padStart(2, "0")] = { bestPercentage: 100 };
    const moduleCompletion = {};
    for (let i = 1; i <= 28; i++) moduleCompletion["m" + i] = { completed: 4, total: 4 };
    const s = buildStrengthSummary({ trainings, moduleCompletion });
    expect(s).toMatchObject({ totalPoints: 2000, libraryPoints: 1440, modulePoints: 560, stage: 25, withinStagePoints: 80, nextStageRemaining: 0, percent: 100, nextStage: null, totalMax: 2000 });
  });
  it("the total is capped at 2000 and never exceeds stage 25 even if sources over-report", () => {
    const trainings = {};
    for (let i = 1; i <= 30; i++) trainings["T" + String(i).padStart(2, "0")] = { bestPercentage: 100 };
    for (let i = 1; i <= 6; i++) trainings["F" + String(i).padStart(2, "0")] = { bestPercentage: 100 };
    const moduleCompletion = {};
    for (let i = 1; i <= 40; i++) moduleCompletion["m" + i] = { completed: 9, total: 9 };   // 40 "modules", over the real 28
    const s = buildStrengthSummary({ trainings, moduleCompletion });
    expect(s.totalPoints).toBe(2000);
    expect(s.stage).toBe(25);
    expect(s.nextStage).toBeNull();
  });
  it("modules are NOT farmable: repeating a completed activity (completed already = total) never adds points (req #8)", () => {
    const once = buildStrengthSummary({ moduleCompletion: { m01: { completed: 3, total: 3 } } }).modulePoints;
    const again = buildStrengthSummary({ moduleCompletion: { m01: { completed: 99, total: 3 } } }).modulePoints;
    expect(once).toBe(20);
    expect(again).toBe(20);
  });
  it("the RETIRED sources (finalized exams, projects) are ignored — passing them never changes the total", () => {
    const base = buildStrengthSummary({ trainings: { T01: { bestPercentage: 100 } } });
    const withOld = buildStrengthSummary({ trainings: { T01: { bestPercentage: 100 } }, finalizedCount: 24, projects: [{ projectCode: "A", overallProgress: 100 }] });
    expect(withOld.totalPoints).toBe(base.totalPoints);
    expect(withOld.totalPoints).toBe(40);
    expect(withOld).not.toHaveProperty("examPoints");
    expect(withOld).not.toHaveProperty("projectPoints");
  });
});
