// UX-7 — the central rank-visual mapping. These tests pin the SEMANTIC binding (tier → author image, Arabic
// level name, level number) by imported-module identity, never by Vite's hashed output filename, so they stay
// valid across builds. The rank cadence itself lives in studentRank.test.ts and is untouched here.
import { describe, it, expect } from "vitest";
import { RANK_VISUALS, rankVisual, type RankVisual } from "./studentRankVisuals";
import { RANK_ORDER, RANK_LABELS, type RankTier } from "./studentRank";
import rankBeginner from "./assets/student-ranks/rank-beginner.png";
import rankBronze from "./assets/student-ranks/rank-bronze.png";
import rankSilver from "./assets/student-ranks/rank-silver.png";
import rankGold from "./assets/student-ranks/rank-gold.png";
import rankDiamond from "./assets/student-ranks/rank-diamond.png";
import rankLegendary from "./assets/student-ranks/rank-legendary.png";

describe("studentRankVisuals — the central rank-image mapping", () => {
  it("binds every tier to the correct author image by module identity (image 1→beginner … 6→legendary)", () => {
    // Identity, not filename: the imported module value must be the exact one the mapping stored.
    expect(RANK_VISUALS.beginner.image).toBe(rankBeginner);   // image 1
    expect(RANK_VISUALS.bronze.image).toBe(rankBronze);       // image 2
    expect(RANK_VISUALS.silver.image).toBe(rankSilver);       // image 3
    expect(RANK_VISUALS.gold.image).toBe(rankGold);           // image 4
    expect(RANK_VISUALS.diamond.image).toBe(rankDiamond);     // image 5
    expect(RANK_VISUALS.legendary.image).toBe(rankLegendary); // image 6
  });

  it("maps each tier to its Arabic level title and 1..6 level number in RANK_ORDER sequence", () => {
    const expected: [RankTier, string, number][] = [
      ["beginner", "بذرة القوة", 1],
      ["bronze", "شعلة صغيرة", 2],
      ["silver", "نمر البرق", 3],
      ["gold", "فارس الجليد", 4],
      ["diamond", "تنين النار", 5],
      ["legendary", "العنقاء الذهبية", 6],
    ];
    for (const [tier, title, level] of expected) {
      expect(RANK_VISUALS[tier].title, tier).toBe(title);
      expect(RANK_VISUALS[tier].level, tier).toBe(level);
      expect(RANK_VISUALS[tier].tier, tier).toBe(tier);
    }
    // levels follow RANK_ORDER exactly (no re-ordered or invented enum)
    expect(RANK_ORDER.map(t => RANK_VISUALS[t].level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reuses the existing RankTier keys only — no extra or missing tiers", () => {
    expect(Object.keys(RANK_VISUALS).sort()).toEqual([...RANK_ORDER].sort());
  });

  it("gives each earned image meaningful Arabic alt text naming the level", () => {
    expect(RANK_VISUALS.beginner.alt).toBe("رتبة بذرة القوة — المستوى 1");
    expect(RANK_VISUALS.legendary.alt).toBe("رتبة العنقاء الذهبية — المستوى 6");
    for (const t of RANK_ORDER) {
      expect(RANK_VISUALS[t].alt, t).toContain(RANK_VISUALS[t].title);
      expect(RANK_VISUALS[t].alt, t).toContain(String(RANK_VISUALS[t].level));
    }
  });

  it("the label (studentRank) and the custom title (visuals) are distinct, complementary strings per tier", () => {
    // The textual rank label stays owned by studentRank; the custom title is the artwork name. They differ.
    for (const t of RANK_ORDER) {
      expect(RANK_LABELS[t], t).not.toBe(RANK_VISUALS[t].title);
    }
  });

  it("rankVisual(tier) returns the same record the mapping holds", () => {
    for (const t of RANK_ORDER) {
      const v: RankVisual = rankVisual(t);
      expect(v).toBe(RANK_VISUALS[t]);
    }
  });
});
