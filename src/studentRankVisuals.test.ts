// UX-7 — the central rank-visual mapping. These tests pin the SEMANTIC binding (tier → author image, Arabic
// level name, level number) through the un-hashed derivative path of each master (Phase 11C: the app ships the sized
// derivatives only), never by Vite's hashed output filename, so they stay valid across builds. The rank cadence itself lives in studentRank.test.ts and is untouched here.
import { describe, it, expect } from "vitest";
import { RANK_VISUALS, rankVisual, type RankVisual } from "./studentRankVisuals";
import { RANK_ORDER, RANK_LABELS, type RankTier } from "./studentRank";
import { VISUAL_SIZES } from "./studentVisualSizes";

describe("studentRankVisuals — the central rank-image mapping", () => {
  it("binds every tier to its OWN author artwork, by the derivative files of that master (image 1→beginner … 6→legendary)", () => {
    // Phase 11C — the app ships only the sized derivatives of each master (src/assets/student-ranks/sized/rank-<tier>-<size>.png).
    const expected: [RankTier, string][] = [["beginner", "rank-beginner"], ["bronze", "rank-bronze"], ["silver", "rank-silver"], ["gold", "rank-gold"], ["diamond", "rank-diamond"], ["legendary", "rank-legendary"]];
    for (const [tier, stem] of expected) {
      for (const size of VISUAL_SIZES) expect(RANK_VISUALS[tier].images[size], tier + " " + size).toMatch(new RegExp("/student-ranks/sized/" + stem + "-" + size + "(\\.|-)"));
    }
    expect(new Set(RANK_ORDER.map(t => RANK_VISUALS[t].images[96])).size).toBe(6);
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
