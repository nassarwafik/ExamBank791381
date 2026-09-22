// Unified Strength presentation — the portal accepts a COMPLETE server payload verbatim and NEVER derives a stage:
// a missing / malformed payload is "unavailable" (null), never a client-side computation from points.
import { describe, it, expect } from "vitest";
import { isServerStrength, normalizeStrength, remainingStrengthPhrase, stagePresentationFromStrength, strengthAuthority, projectContribution } from "./strengthPresentation";
import { STAGE_VISUALS, stageVisual } from "../studentStageVisuals";

const SERVER = {
  rawTotalPoints: 510, totalPoints: 510, examPoints: 300, practicePoints: 150, studyPoints: 20, projectPoints: 40,
  stagePoints: 510, stageMaxPoints: 2000, stageNumber: 7, stageCount: 25, stageBlockSize: 80, stageFloor: 480, withinStagePoints: 30, stagePercent: 38,
  nextStageNumber: 8, nextStageRemaining: 50, pointsToMaximum: 1490, isMaximumStage: false, pathComplete: false,
  legacyRank: { tier: "beginner", level: 1, nextTier: "bronze", levelBlockSize: 400, withinLevelPoints: 110, nextLevelRemaining: 290, percent: 28 },
  projects: [{ projectCode: "899373", overallProgress: 10, strengthPoints: 40 }],
};

describe("isServerStrength / strengthAuthority — the acceptance rule", () => {
  it("accepts the complete server contract; rejects a missing payload, a missing stage field, a non-numeric field, a stage outside 1..25", () => {
    expect(isServerStrength(SERVER)).toBe(true);
    expect(strengthAuthority(SERVER)).toBe("server");
    for (const bad of [undefined, null, "x", 5, {}, { ...SERVER, stageNumber: undefined }, { ...SERVER, stagePercent: "38" }, { ...SERVER, withinStagePoints: NaN }, { ...SERVER, stageNumber: 0 }, { ...SERVER, stageNumber: 26 }, { ...SERVER, stageNumber: 7.5 }, { ...SERVER, projects: "none" }, { ...SERVER, nextStageNumber: "8" }]) {
      expect(isServerStrength(bad), JSON.stringify(bad)?.slice(0, 60)).toBe(false);
      expect(strengthAuthority(bad)).toBe("unavailable");
      expect(normalizeStrength(bad)).toBeNull();
    }
  });
  it("normalizeStrength shapes integers and keeps EVERY progression value the server's; legacyRank is carried, never used for the stage", () => {
    const s = normalizeStrength({ ...SERVER, examPoints: 300.7, projects: [...SERVER.projects, null, { projectCode: "X", overallProgress: "bad", strengthPoints: -3 }] })!;
    expect(s).toMatchObject({ rawTotalPoints: 510, totalPoints: 510, examPoints: 300, stageNumber: 7, withinStagePoints: 30, stagePercent: 38, nextStageNumber: 8, nextStageRemaining: 50, pointsToMaximum: 1490, isMaximumStage: false, pathComplete: false, stageBlockSize: 80, stageMaxPoints: 2000, stageCount: 25 });
    expect(s.legacyRank).toEqual(SERVER.legacyRank);
    expect(s.projects).toEqual([{ projectCode: "899373", overallProgress: 10, strengthPoints: 40 }, { projectCode: "X", overallProgress: 0, strengthPoints: 0 }]);
    expect(projectContribution(s, "899373")).toEqual({ projectCode: "899373", overallProgress: 10, strengthPoints: 40 });
    expect(projectContribution(s, "nope")).toBeNull();
    // an older payload without rawTotalPoints / legacyRank / studyPoints still normalizes (totalPoints is the raw total)
    const older = normalizeStrength({ ...SERVER, rawTotalPoints: undefined, legacyRank: undefined, studyPoints: undefined, pointsToMaximum: undefined })!;
    expect(older).toMatchObject({ rawTotalPoints: 510, studyPoints: 0, legacyRank: null, pointsToMaximum: 1490 });
  });
  it("INCONSISTENT server values are shown as given — 900 points but stage 17 / 11 / 14% is presented as stage 17, 11 / 80, 14% (no recomputation from 900)", () => {
    const s = normalizeStrength({ ...SERVER, rawTotalPoints: 900, totalPoints: 900, stagePoints: 900, stageNumber: 17, withinStagePoints: 11, stagePercent: 14, nextStageNumber: 18, nextStageRemaining: 69 })!;
    expect(s.stageNumber).toBe(17); expect(s.withinStagePoints).toBe(11); expect(s.stagePercent).toBe(14);
    const p = stagePresentationFromStrength(s);
    expect(p.current.stageNumber).toBe(17); expect(p.current.title).toBe("تنين الجليد");
    expect(p.stageLabel).toBe("المرحلة 17 من 25");
    expect(p.next?.stageNumber).toBe(18);
    expect(p.remainingText).toBe("بقي 69 نقطة قوة للوصول إلى المرحلة 18 — سيد العواصف");
    // what a client-side 80-step rule over 900 would produce (stage 12, 20 / 80, 25%) must NOT appear
    expect(p.current.stageNumber).not.toBe(12);
  });
});

describe("stagePresentationFromStrength — copy for stages 1–24, stage 25 in progress, and the complete path", () => {
  it("stage 7 (510 points): current ذئب الرياح · مرحلة البناء · next سيد الأمواج · «بقي 50 نقطة قوة للوصول إلى المرحلة 8 — سيد الأمواج»", () => {
    const p = stagePresentationFromStrength(normalizeStrength(SERVER)!);
    expect(p.current).toEqual(stageVisual(7));
    expect(p.current.title).toBe("ذئب الرياح"); expect(p.current.group.label).toBe("مرحلة البناء");
    expect(p.next).toEqual(stageVisual(8));
    expect(p.stageLabel).toBe("المرحلة 7 من 25");
    expect(p.progressLabel).toBe("التقدم نحو المرحلة 8 — سيد الأمواج");
    expect(p.remainingText).toBe("بقي 50 نقطة قوة للوصول إلى المرحلة 8 — سيد الأمواج");
  });
  it("zero points: stage 1 بذرة القوة, 0 / 80, next شعلة صغيرة — never «no rank»", () => {
    const p = stagePresentationFromStrength(normalizeStrength({ ...SERVER, rawTotalPoints: 0, totalPoints: 0, examPoints: 0, practicePoints: 0, studyPoints: 0, projectPoints: 0, stagePoints: 0, stageNumber: 1, stageFloor: 0, withinStagePoints: 0, stagePercent: 0, nextStageNumber: 2, nextStageRemaining: 80, pointsToMaximum: 2000, legacyRank: null, projects: [] })!);
    expect(p.current.stageNumber).toBe(1); expect(p.current.title).toBe("بذرة القوة"); expect(p.current.group.label).toBe("بداية الرحلة");
    expect(p.stageLabel).toBe("المرحلة 1 من 25");
    expect(p.next?.title).toBe("شعلة صغيرة");
    expect(p.remainingText).toBe("بقي 80 نقطة قوة للوصول إلى المرحلة 2 — شعلة صغيرة");
  });
  it("stage 25 at 1960: no next stage, «بقي 40 نقطة قوة لإكمال مسار القوة»; at 2000: «أكملت مسار القوة»; raw 2675 is still stage 25 complete", () => {
    const at1960 = stagePresentationFromStrength(normalizeStrength({ ...SERVER, rawTotalPoints: 1960, totalPoints: 1960, stagePoints: 1960, stageNumber: 25, stageFloor: 1920, withinStagePoints: 40, stagePercent: 50, nextStageNumber: null, nextStageRemaining: 0, pointsToMaximum: 40, isMaximumStage: true, pathComplete: false })!);
    expect(at1960.current.title).toBe("أسطورة القوة"); expect(at1960.current.group.label).toBe("مرحلة الأسطورة");
    expect(at1960.next).toBeNull();
    expect(at1960.progressLabel).toBe("التقدم نحو إكمال مسار القوة");
    expect(at1960.remainingText).toBe("بقي 40 نقطة قوة لإكمال مسار القوة");
    for (const raw of [2000, 2675]) {
      const done = stagePresentationFromStrength(normalizeStrength({ ...SERVER, rawTotalPoints: raw, totalPoints: raw, stagePoints: 2000, stageNumber: 25, stageFloor: 1920, withinStagePoints: 80, stagePercent: 100, nextStageNumber: null, nextStageRemaining: 0, pointsToMaximum: 0, isMaximumStage: true, pathComplete: true })!);
      expect(done.next).toBeNull(); expect(done.remainingText).toBe("أكملت مسار القوة"); expect(done.progressLabel).toBe("اكتمال مسار القوة");
      expect(done.current.stageNumber).toBe(25);
    }
    expect(STAGE_VISUALS.some(v => v.stageNumber === 26)).toBe(false);
  });
  it("remainingStrengthPhrase: 1 → «بقيت نقطة قوة واحدة», 2 → «بقيت نقطتا قوة», n → «بقي n نقطة قوة»", () => {
    expect(remainingStrengthPhrase(1)).toBe("بقيت نقطة قوة واحدة");
    expect(remainingStrengthPhrase(2)).toBe("بقيت نقطتا قوة");
    expect(remainingStrengthPhrase(50)).toBe("بقي 50 نقطة قوة");
    expect(remainingStrengthPhrase(0)).toBe("بقيت نقطة قوة واحدة");
  });
});
