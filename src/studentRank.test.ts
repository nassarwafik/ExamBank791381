import { describe, it, expect } from "vitest";
import * as studentRank from "./studentRank";
import { RANK_ORDER, RANK_LABELS } from "./studentRank";

// studentRank.ts is now ONLY the six-tier PROJECT rank vocabulary (used by the project-performance feature and the
// project achievement events). The visible Student Strength (نقاط القوة) is the 25-STAGE model, decided by the server
// and presented from src/student/strengthStages.ts — so the old global-strength / finalized progression helpers here
// have been RETIRED. These tests pin the surviving vocabulary and prove the retired helpers are gone.

describe("project rank vocabulary (the surviving surface)", () => {
  it("keeps the six tier ids in order and their Arabic labels", () => {
    expect(RANK_ORDER).toEqual(["beginner", "bronze", "silver", "gold", "diamond", "legendary"]);
    expect(RANK_LABELS).toEqual({ beginner: "مبتدئ", bronze: "برونزي", silver: "فضي", gold: "ذهبي", diamond: "ألماسي", legendary: "أسطوري" });
    for (const t of RANK_ORDER) expect(typeof RANK_LABELS[t]).toBe("string");
  });
});

describe("the old global-strength progression is retired (not authoritative for Student Strength)", () => {
  it("exports none of the removed finalized / strength-threshold helpers", () => {
    for (const gone of [
      "rankTierForStrength", "nextRankForStrength", "rankForStrength", "strengthProgress", "strengthFromFinalized",
      "rankTierForFinalized", "nextRankForFinalized", "rankFor", "rankProgress", "remainingExamsPhrase", "remainingPointsPhrase",
      "RANK_STEP_FINALIZED", "RANK_STEP_STRENGTH_POINTS", "FINALIZED_EXAM_STRENGTH_POINTS",
    ]) {
      expect(studentRank as Record<string, unknown>, gone).not.toHaveProperty(gone);
    }
  });
});
