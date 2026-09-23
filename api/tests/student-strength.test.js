import { describe, it, expect } from "vitest";
import {
  FINALIZED_EXAM_MAX_POINTS, LEARNING_PRACTICE_MAX_POINTS, LEARNING_PRACTICE_ITEM_COUNT, LEARNING_PRACTICE_MAX_TOTAL,
  STUDY_MODULE_MAX_POINTS, STUDY_MODULE_COUNT, STUDY_MAX_TOTAL, PROJECT_MAX_STRENGTH_POINTS,
  STRENGTH_STAGE_COUNT, STRENGTH_STAGE_POINTS, STRENGTH_STAGE_MAX_POINTS, RANK_ORDER,
  examStrengthFromPercentage, examPointsFromFinalizedResults, isLearningPracticeItem, strengthFromTrainingBest, trainingMaxStrengthPoints, strengthFromTrainingResult,
  strengthFromProjectProgress, practicePointsFromTrainings, studyPointsForModule, studyPointsFromModules,
  gameStrengthFromPercentage, gamePointsFromGames, GAME_MAX_STRENGTH_POINTS,
  strengthStageProgress, rankTierFromStrength, legacyRankProgress, buildStrengthSummary
} from "../src/lib/student-strength.js";
import { listLearningTrainings } from "../src/lib/learning-training-registry.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";

// The Unified Strength policy — 25 stages × 80 points = 2000 visible points fed by finalized school exams (each the
// rounded FINAL percentage, 0..100, uncapped total), Learning Practice (36 items × 40 = 1440), Study Practice
// (28 modules × 20 = 560) and projects (≤ 400 each).
const T_IDS = Array.from({ length: 30 }, (_, i) => "T" + String(i + 1).padStart(2, "0"));
const F_IDS = Array.from({ length: 6 }, (_, i) => "F0" + (i + 1));
const ALL_IDS = [...T_IDS, ...F_IDS];

describe("constants — the centralized policy", () => {
  it("25 stages × 80 points = 2000 visible points; 36 × 40 = 1440; 28 × 20 = 560; 1440 + 560 = 2000", () => {
    expect(STRENGTH_STAGE_COUNT).toBe(25);
    expect(STRENGTH_STAGE_POINTS).toBe(80);
    expect(STRENGTH_STAGE_MAX_POINTS).toBe(2000);
    expect(STRENGTH_STAGE_COUNT * STRENGTH_STAGE_POINTS).toBe(STRENGTH_STAGE_MAX_POINTS);
    expect(LEARNING_PRACTICE_MAX_POINTS).toBe(40);
    expect(LEARNING_PRACTICE_ITEM_COUNT).toBe(36);
    expect(LEARNING_PRACTICE_MAX_TOTAL).toBe(1440);
    expect(STUDY_MODULE_MAX_POINTS).toBe(20);
    expect(STUDY_MODULE_COUNT).toBe(28);
    expect(STUDY_MAX_TOTAL).toBe(560);
    expect(LEARNING_PRACTICE_MAX_TOTAL + STUDY_MAX_TOTAL).toBe(STRENGTH_STAGE_MAX_POINTS);
    expect(FINALIZED_EXAM_MAX_POINTS).toBe(100);
    expect(PROJECT_MAX_STRENGTH_POINTS).toBe(400);
  });
  it("the 36 canonical items are exactly the registry's Learning-Practice ids; the 28 modules are exactly the course's modules", () => {
    const registry = listLearningTrainings().map(t => t.trainingId).sort();
    expect(registry).toEqual([...ALL_IDS].sort());
    expect(registry).toHaveLength(LEARNING_PRACTICE_ITEM_COUNT);
    expect(listLearningModules("791381")).toHaveLength(STUDY_MODULE_COUNT);
  });
});

describe("Learning Practice — every one of the 36 items, max 40, best percentage only", () => {
  it("T01–T30 AND F01–F06 are all eligible (max 40); malformed / foreign ids never count (max 0)", () => {
    for (const id of ALL_IDS) { expect(isLearningPracticeItem(id), id).toBe(true); expect(trainingMaxStrengthPoints(id), id).toBe(40); }
    for (const bad of ["", null, undefined, "T", "t01", "TT01", "F", "F07", "F00", "T00", "T31", "X01", "T01;F01", 1]) { expect(isLearningPracticeItem(bad)).toBe(false); expect(trainingMaxStrengthPoints(bad)).toBe(0); }
    expect(isLearningPracticeItem(" T05 ")).toBe(true);                       // ids are trimmed like everywhere else
  });
  it("round(best × 40 / 100): 0 → 0, 25 → 10, 40 → 16, 50 → 20, 60 → 24, 75 → 30, 80 → 32, 90 → 36, 100 → 40; clamped and NaN-safe", () => {
    const table = [[0, 0], [25, 10], [40, 16], [50, 20], [60, 24], [75, 30], [80, 32], [90, 36], [100, 40]];
    for (const [pct, pts] of table) expect(strengthFromTrainingBest(pct), pct + "%").toBe(pts);
    expect(strengthFromTrainingBest(150)).toBe(40); expect(strengthFromTrainingBest(-5)).toBe(0); expect(strengthFromTrainingBest("abc")).toBe(0); expect(strengthFromTrainingBest(NaN)).toBe(0);
    expect(strengthFromTrainingBest(99)).toBe(40);                            // 39.6 rounds half-up to 40
    expect(strengthFromTrainingBest(98)).toBe(39);
  });
  it("an F item earns exactly like a T item — F01 at 100% = 40, F06 at 85% = 34, T05 at 80% = 32; an unknown id = 0", () => {
    expect(strengthFromTrainingResult("F01", 100)).toBe(40);
    expect(strengthFromTrainingResult("F06", 85)).toBe(34);
    expect(strengthFromTrainingResult("T05", 80)).toBe(32);
    expect(strengthFromTrainingResult("X99", 100)).toBe(0);
  });
  it("36 perfect items = 1440; stored bestPoints are ignored (bestPercentage 80 with bestPoints 20 is worth 32); malformed entries add 0", () => {
    expect(practicePointsFromTrainings(Object.fromEntries(ALL_IDS.map(id => [id, { bestPercentage: 100 }])))).toBe(1440);
    expect(practicePointsFromTrainings({ T08: { bestPercentage: 80, bestPoints: 20 } })).toBe(32);
    expect(practicePointsFromTrainings({ T08: { bestPercentage: 80, bestPoints: 999 }, F02: { bestPercentage: 50, bestPoints: 0 } })).toBe(32 + 20);
    expect(practicePointsFromTrainings({ T01: "x", T02: null, T03: { bestPercentage: "abc" }, X01: { bestPercentage: 100 } })).toBe(0);
    expect(practicePointsFromTrainings(null)).toBe(0);
  });
});

describe("Study Practice — 28 modules × 20", () => {
  it("round(completed / eligible × 20): 0% → 0, 25% → 5, 50% → 10, 75% → 15, 100% → 20; eligible 0 → 0; completed is clamped to eligible", () => {
    expect(studyPointsForModule({ completed: 0, eligible: 40 })).toBe(0);
    expect(studyPointsForModule({ completed: 10, eligible: 40 })).toBe(5);
    expect(studyPointsForModule({ completed: 20, eligible: 40 })).toBe(10);
    expect(studyPointsForModule({ completed: 30, eligible: 40 })).toBe(15);
    expect(studyPointsForModule({ completed: 40, eligible: 40 })).toBe(20);
    expect(studyPointsForModule({ completed: 1, eligible: 43 })).toBe(0);      // 0.47 rounds to 0
    expect(studyPointsForModule({ completed: 2, eligible: 43 })).toBe(1);
    expect(studyPointsForModule({ completed: 5, eligible: 0 })).toBe(0);
    expect(studyPointsForModule({ completed: 99, eligible: 10 })).toBe(20);   // never above 20
    expect(studyPointsForModule({ completed: -3, eligible: 10 })).toBe(0);
    expect(studyPointsForModule(null)).toBe(0); expect(studyPointsForModule({})).toBe(0);
  });
  it("28 fully completed modules = 560; a partially completed set sums module by module; nothing stored is trusted", () => {
    const full = Object.fromEntries(Array.from({ length: 28 }, (_, i) => ["791381-m" + String(i + 1).padStart(2, "0"), { completed: 7, eligible: 7 }]));
    expect(studyPointsFromModules(full)).toBe(560);
    expect(studyPointsFromModules({ a: { completed: 1, eligible: 4 }, b: { completed: 3, eligible: 4 }, c: { completed: 0, eligible: 0 }, d: { points: 999 } })).toBe(5 + 15);
    expect(studyPointsFromModules(null)).toBe(0);
  });
});

describe("the 25-stage path — every threshold pair, the extremes, no stage 26", () => {
  const boundaries = Array.from({ length: 24 }, (_, i) => (i + 1) * 80);   // 80, 160, …, 1920
  it("each of the 24 boundaries: one point below stays on stage n (79/80 = 99%), the boundary itself opens stage n + 1 (0/80 = 0%)", () => {
    boundaries.forEach((b, i) => {
      const below = strengthStageProgress(b - 1), at = strengthStageProgress(b);
      expect(below.stageNumber, (b - 1) + " points").toBe(i + 1);
      expect(below).toMatchObject({ withinStagePoints: 79, stagePercent: 99, nextStageRemaining: 1, nextStageNumber: i + 2, stagePoints: b - 1, isMaximumStage: false });
      expect(at.stageNumber, b + " points").toBe(i + 2);
      expect(at).toMatchObject({ withinStagePoints: 0, stagePercent: 0, stageFloor: b, stagePoints: b, isMaximumStage: i + 2 === 25, nextStageNumber: i + 2 === 25 ? null : i + 3, nextStageRemaining: i + 2 === 25 ? 0 : 80 });
    });
  });
  it("0 → stage 1 (0 / 80, 0%, 2000 to go); 1999 → stage 25 (79 / 80, 99%); 2000 / 2001 / 9999 → stage 25, 80 / 80, 100%, path complete, no next", () => {
    expect(strengthStageProgress(0)).toEqual({ rawTotalPoints: 0, stagePoints: 0, stageMaxPoints: 2000, stageNumber: 1, stageCount: 25, stageBlockSize: 80, stageFloor: 0, withinStagePoints: 0, stagePercent: 0, nextStageNumber: 2, nextStageRemaining: 80, pointsToMaximum: 2000, isMaximumStage: false, pathComplete: false });
    expect(strengthStageProgress(1999)).toMatchObject({ stagePoints: 1999, stageNumber: 25, stageFloor: 1920, withinStagePoints: 79, stagePercent: 99, nextStageNumber: null, nextStageRemaining: 0, pointsToMaximum: 1, isMaximumStage: true, pathComplete: false });
    for (const raw of [2000, 2001, 9999]) {
      const s = strengthStageProgress(raw);
      expect(s, raw + " points").toMatchObject({ rawTotalPoints: raw, stagePoints: 2000, stageNumber: 25, withinStagePoints: 80, stagePercent: 100, nextStageNumber: null, nextStageRemaining: 0, pointsToMaximum: 0, isMaximumStage: true, pathComplete: true });
      expect(s.stageNumber).toBeLessThanOrEqual(25);
    }
    // the raw total is preserved, only the path is capped
    expect(strengthStageProgress(2675)).toMatchObject({ rawTotalPoints: 2675, stagePoints: 2000, stageNumber: 25, stagePercent: 100 });
  });
  it("worked examples: 510 → stage 7, 30 / 80, 38%, 50 to stage 8; 1960 → stage 25, 40 / 80, 50%, 40 to complete the path", () => {
    expect(strengthStageProgress(510)).toMatchObject({ stageNumber: 7, stageFloor: 480, withinStagePoints: 30, stagePercent: 38, nextStageNumber: 8, nextStageRemaining: 50 });
    expect(strengthStageProgress(1960)).toMatchObject({ stageNumber: 25, stageFloor: 1920, withinStagePoints: 40, stagePercent: 50, nextStageNumber: null, nextStageRemaining: 0, pointsToMaximum: 40, isMaximumStage: true, pathComplete: false });
  });
  it("stageNumber never exceeds 25 and never drops below 1 for any input (sweep 0..2500 + junk)", () => {
    for (let raw = 0; raw <= 2500; raw++) {
      const s = strengthStageProgress(raw);
      expect(s.stageNumber).toBeGreaterThanOrEqual(1); expect(s.stageNumber).toBeLessThanOrEqual(25);
      expect(s.withinStagePoints).toBeGreaterThanOrEqual(0); expect(s.withinStagePoints).toBeLessThanOrEqual(80);
      expect(s.stagePercent).toBeGreaterThanOrEqual(0); expect(s.stagePercent).toBeLessThanOrEqual(100);
      if (s.stageNumber < 25) expect(s.stageFloor + s.withinStagePoints).toBe(raw);
    }
    for (const junk of [null, undefined, NaN, -50, "abc", Infinity]) expect(strengthStageProgress(junk).stageNumber).toBe(1);
  });
});

describe("finalized school exams — each result contributes its rounded final percentage (0..100), summed", () => {
  it("ONE result = round(clamp(final %, 0, 100)): 100 → 100, 70 → 70, 20 → 20, 0 → 0; decimals half-up; out-of-range/NaN safe", () => {
    expect(examStrengthFromPercentage(100)).toBe(100);
    expect(examStrengthFromPercentage(70)).toBe(70);
    expect(examStrengthFromPercentage(20)).toBe(20);
    expect(examStrengthFromPercentage(0)).toBe(0);
    expect(examStrengthFromPercentage(84.0)).toBe(84);
    expect(examStrengthFromPercentage(84.4)).toBe(84);
    expect(examStrengthFromPercentage(84.5)).toBe(85);
    expect(examStrengthFromPercentage(99.6)).toBe(100);
    expect(examStrengthFromPercentage(-20)).toBe(0);       // clamped, never negative
    expect(examStrengthFromPercentage(130)).toBe(100);     // clamped, never above 100 for one exam
    expect(examStrengthFromPercentage(NaN)).toBe(0);
    expect(examStrengthFromPercentage("abc")).toBe(0);
    expect(examStrengthFromPercentage(Infinity)).toBe(0);
  });
  it("the total is the SUM of final percentages (never count × 100): [] → 0, [100] → 100, [70] → 70, [0] → 0, [100,70] → 170, [100,90,70,55] → 315", () => {
    expect(examPointsFromFinalizedResults([])).toBe(0);
    expect(examPointsFromFinalizedResults([100])).toBe(100);
    expect(examPointsFromFinalizedResults([70])).toBe(70);
    expect(examPointsFromFinalizedResults([0])).toBe(0);
    expect(examPointsFromFinalizedResults([100, 70])).toBe(170);
    expect(examPointsFromFinalizedResults([100, 90, 70, 55])).toBe(315);
    expect(examPointsFromFinalizedResults([84.4, 84.5])).toBe(169);          // 84 + 85
    expect(examPointsFromFinalizedResults([-20, 130, NaN, 50])).toBe(150);   // 0 + 100 + 0 + 50
    expect(examPointsFromFinalizedResults(undefined)).toBe(0);               // older caller / no assignments
    expect(examPointsFromFinalizedResults("x")).toBe(0);
    expect(examPointsFromFinalizedResults(3)).toBe(0);                       // a bare count is NOT accepted as points
  });
  it("projects round(progress × 4) ≤ 400 each — unchanged", () => {
    for (const [p, pts] of [[0, 0], [1, 4], [25, 100], [50, 200], [75, 300], [100, 400], [140, 400]]) expect(strengthFromProjectProgress(p), p + "%").toBe(pts);
  });
  it("raw = exams + practice + study + projects; the raw total survives above 2000 while the path caps at 25 / 2000 / 100%", () => {
    const s = buildStrengthSummary({
      finalizedPercentages: Array(12).fill(100),                                                   // 1200 (12 × 100%)
      trainings: Object.fromEntries(ALL_IDS.map(id => [id, { bestPercentage: 100 }])),             // 1440
      study: { m1: { completed: 4, eligible: 4 } },                                                //   20
      projects: [{ projectCode: "P", overallProgress: 100 }]                                       //  400
    });
    expect(s).toMatchObject({ examPoints: 1200, practicePoints: 1440, studyPoints: 20, projectPoints: 400, rawTotalPoints: 3060, totalPoints: 3060, stagePoints: 2000, stageNumber: 25, stagePercent: 100, withinStagePoints: 80, nextStageNumber: null, nextStageRemaining: 0, pointsToMaximum: 0, isMaximumStage: true, pathComplete: true, stageCount: 25, stageBlockSize: 80, stageMaxPoints: 2000 });
    expect(s.projects).toEqual([{ projectCode: "P", overallProgress: 100, strengthPoints: 400 }]);
  });
  it("Learning Practice + Study alone fill the path exactly: 1440 + 560 = 2000 = stage 25 complete", () => {
    const study = Object.fromEntries(Array.from({ length: 28 }, (_, i) => ["m" + i, { completed: 3, eligible: 3 }]));
    const s = buildStrengthSummary({ finalizedPercentages: [], trainings: Object.fromEntries(ALL_IDS.map(id => [id, { bestPercentage: 100 }])), study, projects: [] });
    expect(s).toMatchObject({ practicePoints: 1440, studyPoints: 560, rawTotalPoints: 2000, stagePoints: 2000, stageNumber: 25, pathComplete: true });
  });
  it("zero everything → stage 1, 0 / 80, 0 / 2000; the mixed example 300 + 32 + 10 + 200 = 542 → stage 7, 62 / 80, 78%", () => {
    expect(buildStrengthSummary({})).toMatchObject({ rawTotalPoints: 0, totalPoints: 0, stageNumber: 1, stagePoints: 0, withinStagePoints: 0, stagePercent: 0, nextStageNumber: 2, nextStageRemaining: 80, pointsToMaximum: 2000, projects: [] });
    expect(buildStrengthSummary({ finalizedPercentages: [100, 100, 100], trainings: { T02: { bestPercentage: 80 } }, study: { m: { completed: 1, eligible: 2 } }, projects: [{ projectCode: "P", overallProgress: 50 }] }))
      .toMatchObject({ examPoints: 300, practicePoints: 32, studyPoints: 10, projectPoints: 200, rawTotalPoints: 542, stageNumber: 7, withinStagePoints: 62, stagePercent: 78, nextStageNumber: 8, nextStageRemaining: 18 });
  });
  it("legacyRank (six-rank cadence, historical events only) is carried but never decides the stage", () => {
    const s = buildStrengthSummary({ finalizedPercentages: [100, 100, 100, 100] });
    expect(s.stageNumber).toBe(6);                                       // 400 points → stage 6 on the 25-stage path
    expect(s.legacyRank).toEqual({ tier: "beginner", level: 1, nextTier: "bronze", levelBlockSize: 400, withinLevelPoints: 0, nextLevelRemaining: 400, percent: 0 });
    expect(rankTierFromStrength(399)).toBeNull(); expect(rankTierFromStrength(2400)).toBe("legendary"); expect(RANK_ORDER).toHaveLength(6);
    expect(legacyRankProgress(2500)).toMatchObject({ tier: "legendary", nextTier: null, percent: 100 });
    expect(buildStrengthSummary({ finalizedCount: 0 }).legacyRank.tier).toBeNull();
  });
});

// ── Phase 4E — educational-game Strength (gamePoints) ───────────────────────────────────────────────────────────
describe("Phase 4E — gamePoints (assigned educational games)", () => {
  it("gameStrengthFromPercentage = round(pct × 20 / 100), clamped 0..20", () => {
    expect(GAME_MAX_STRENGTH_POINTS).toBe(20);
    expect([100, 90, 75, 50, 25, 0].map(gameStrengthFromPercentage)).toEqual([20, 18, 15, 10, 5, 0]);
    // rounding for non-integer conversions: 63% → 12.6 → 13, 62% → 12.4 → 12, 12.5 → 13 (half-up)
    expect(gameStrengthFromPercentage(63)).toBe(13);
    expect(gameStrengthFromPercentage(62)).toBe(12);
    // defensive clamp 0..20 for out-of-range / malformed
    expect(gameStrengthFromPercentage(150)).toBe(20);
    expect(gameStrengthFromPercentage(-40)).toBe(0);
    expect(gameStrengthFromPercentage(NaN)).toBe(0);
    expect(gameStrengthFromPercentage("x")).toBe(0);
  });
  it("gamePointsFromGames sums per-game contributions (each ≤20) with NO global cap", () => {
    expect(gamePointsFromGames([])).toBe(0);
    expect(gamePointsFromGames(undefined)).toBe(0);
    expect(gamePointsFromGames([100])).toBe(20);
    expect(gamePointsFromGames([100, 50])).toBe(30);                     // two different assigned games ADD
    expect(gamePointsFromGames([{ bestPercentage: 90 }, { percentage: 50 }])).toBe(28);   // 18 + 10
    // no global cap — ten perfect games = 200 (well past any 100/200 style cap), each still individually ≤20
    expect(gamePointsFromGames(Array(10).fill(100))).toBe(200);
  });
  it("buildStrengthSummary adds gamePoints exactly once into rawTotalPoints; absent games → 0 (backward compatible)", () => {
    const withGames = buildStrengthSummary({ finalizedPercentages: [100], games: [100, 50] });
    expect(withGames.gamePoints).toBe(30);
    expect(withGames.examPoints).toBe(100);
    expect(withGames.rawTotalPoints).toBe(130);                          // 100 exam + 30 game, counted once
    expect(withGames.totalPoints).toBe(130);
    const noGames = buildStrengthSummary({ finalizedPercentages: [100] });
    expect(noGames.gamePoints).toBe(0);
    expect(noGames.rawTotalPoints).toBe(100);                           // unchanged for a student with no game data
  });
  it("gamePoints participate in the stage path but stagePoints still caps at 2000 while rawTotalPoints may exceed it", () => {
    // 30 finalized 100% exams (3000) + 5 perfect games (100) → raw 3100, stage capped at 2000 (stage 25)
    const s = buildStrengthSummary({ finalizedPercentages: Array(30).fill(100), games: Array(5).fill(100) });
    expect(s.gamePoints).toBe(100);
    expect(s.rawTotalPoints).toBe(3100);                                 // uncapped raw includes gamePoints
    expect(s.stagePoints).toBe(2000);                                   // visible path still capped at 2000
    expect(s.stageNumber).toBe(25);
  });
  it("game MEDAL tier / podium placement can NOT be turned into gamePoints — only a performance percentage is used", () => {
    // The API layer only ever passes a performance percentage; there is no code path from a medal/rank into gamePoints.
    // Proven here at the policy layer: gamePoints is a pure function of percentages, with no medal/placement input.
    expect(gamePointsFromGames([{ bestPercentage: 100, medal: "gold", placement: 1 }])).toBe(20);   // extra fields ignored
    expect(gamePointsFromGames([{ placement: 1 }])).toBe(0);            // a placement with no percentage → 0
  });
});
