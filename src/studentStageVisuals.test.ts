// The 25-stage visual authority: exactly 25 mappings, the owner's approved order and names, five presentation groups,
// distinct image modules, meaningful alt text, safe accessor — and never a stage 26.
import { describe, it, expect } from "vitest";
import { STAGE_COUNT, STAGE_GROUPS, STAGE_VISUALS, stageGroupOf, stageVisual } from "./studentStageVisuals";

const APPROVED = [
  "بذرة القوة", "شعلة صغيرة", "نمر البرق", "فارس الجليد", "تنين النار",
  "العنقاء الذهبية", "ذئب الرياح", "سيد الأمواج", "صقر العاصفة", "أسد البلور",
  "حارس الغابة", "محارب الظلال", "سيد النجوم", "بطل العناصر", "ملك الصواعق",
  "فارس الشمس", "تنين الجليد", "سيد العواصف", "حامي الأساطير", "العنقاء الملكية",
  "أسد المجرة", "سيد الأكوان", "تنين النور", "ملك السيادة", "أسطورة القوة",
];

describe("studentStageVisuals — the one central mapping", () => {
  it("has exactly 25 stages, numbered 1..25 in order, with the owner's approved titles", () => {
    expect(STAGE_COUNT).toBe(25);
    expect(STAGE_VISUALS).toHaveLength(25);
    expect(STAGE_VISUALS.map(v => v.stageNumber)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(STAGE_VISUALS.map(v => v.title)).toEqual(APPROVED);
  });
  it("every stage has its own image module (25 distinct, all stage-NN.png of src/assets/student-stages) and a meaningful alt «المرحلة n — title»", () => {
    const images = STAGE_VISUALS.map(v => v.image);
    expect(new Set(images).size).toBe(25);
    STAGE_VISUALS.forEach((v, i) => {
      expect(typeof v.image).toBe("string"); expect(v.image.length).toBeGreaterThan(0);
      expect(v.image, v.title).toMatch(new RegExp("stage-" + String(i + 1).padStart(2, "0")));
      expect(v.alt).toBe("المرحلة " + (i + 1) + " — " + v.title);
    });
  });
  it("groups (presentation only): 1–5 بداية الرحلة · 6–10 مرحلة البناء · 11–15 مرحلة التمكّن · 16–20 مرحلة الريادة · 21–25 مرحلة الأسطورة", () => {
    expect(STAGE_GROUPS.map(g => [g.id, g.label, g.from, g.to])).toEqual([[1, "بداية الرحلة", 1, 5], [2, "مرحلة البناء", 6, 10], [3, "مرحلة التمكّن", 11, 15], [4, "مرحلة الريادة", 16, 20], [5, "مرحلة الأسطورة", 21, 25]]);
    for (const v of STAGE_VISUALS) { expect(v.group).toEqual(stageGroupOf(v.stageNumber)); expect(v.stageNumber).toBeGreaterThanOrEqual(v.group.from); expect(v.stageNumber).toBeLessThanOrEqual(v.group.to); }
    expect(stageGroupOf(1).label).toBe("بداية الرحلة"); expect(stageGroupOf(5).label).toBe("بداية الرحلة"); expect(stageGroupOf(6).label).toBe("مرحلة البناء");
    expect(stageGroupOf(15).label).toBe("مرحلة التمكّن"); expect(stageGroupOf(16).label).toBe("مرحلة الريادة"); expect(stageGroupOf(21).label).toBe("مرحلة الأسطورة"); expect(stageGroupOf(25).label).toBe("مرحلة الأسطورة");
  });
  it("stageVisual(n) returns the exact stage; out-of-range / malformed values never crash and never produce a stage 26", () => {
    expect(stageVisual(1).title).toBe("بذرة القوة"); expect(stageVisual(7).title).toBe("ذئب الرياح"); expect(stageVisual(25).title).toBe("أسطورة القوة");
    expect(stageVisual(26).stageNumber).toBe(25); expect(stageVisual(999).stageNumber).toBe(25);
    expect(stageVisual(0).stageNumber).toBe(1); expect(stageVisual(-4).stageNumber).toBe(1); expect(stageVisual(NaN).stageNumber).toBe(1); expect(stageVisual(7.9).stageNumber).toBe(7);
    expect(STAGE_VISUALS.find(v => v.stageNumber === 26)).toBeUndefined();
  });
});
