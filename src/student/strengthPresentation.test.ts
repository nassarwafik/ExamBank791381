// Unified Strength — CLIENT AUTHORITY CONTRACT (25-STAGE model). The server's `dashboard.strength` decides the whole
// progression (totalPoints, stage 1..25, within-stage progress); the portal only maps the stage NUMBER to its uploaded
// artwork/name and displays the server figures. These tests prove:
//   (1) the historical 6-rank progression is RETIRED — studentRank.ts no longer exports any global-strength helper and
//       nothing on the visible Strength path derives a rank from a threshold;
//   (2) a well-formed server payload is trusted as a whole — even when its `stage` deliberately disagrees with what a
//       local `floor(points/80)+1` rule would say, the client shows the SERVER's stage;
//   (3) a missing OR malformed payload falls back, as a WHOLE, to a safe zeroed stage-1 summary (never NaN / negative /
//       off-by-one), so the hero always renders.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { isServerStrength, normalizeStrength, remainingPointsPhrase, stageView, strengthAuthority } from "./strengthPresentation";
import { STAGE_COUNT, STRENGTH_TOTAL_MAX, stageDef } from "./strengthStages";
import type { StudentStrength } from "./types";

/** DELIBERATELY inconsistent: 650 points is `floor(650/80)+1 = 9` under a local rule — the SERVER says stage 7. */
const SYNTHETIC: StudentStrength = {
  totalPoints: 650, libraryPoints: 420, modulePoints: 230,
  stage: 7, stageCount: 25, stageSpan: 80,
  withinStagePoints: 33, nextStageRemaining: 47, percent: 41,
  nextStage: 8, totalMax: 2000,
};

/** The exact zeroed stage-1 fallback (kept in sync with strengthPresentation.emptyStrength). */
const EMPTY: StudentStrength = {
  totalPoints: 0, libraryPoints: 0, modulePoints: 0,
  stage: 1, stageCount: STAGE_COUNT, stageSpan: 80,
  withinStagePoints: 0, nextStageRemaining: 80, percent: 0,
  nextStage: 2, totalMax: STRENGTH_TOTAL_MAX,
};

describe("server payload → trusted completely (the client never re-derives the stage from points)", () => {
  it("is accepted, shaped 1:1, and the stage stays the SERVER's 7 (not the local rule's 9)", () => {
    expect(strengthAuthority(SYNTHETIC)).toBe("server");
    expect(isServerStrength(SYNTHETIC)).toBe(true);
    expect(normalizeStrength(SYNTHETIC)).toEqual(SYNTHETIC);
    const v = stageView(SYNTHETIC);
    expect(v.stage).toBe(7);                          // the server's stage, verbatim
    expect(v.name).toBe(stageDef(7).name);
    expect(v.def.image).toBe(stageDef(7).image);      // the uploaded stage-7 icon
    expect(v.totalPoints).toBe(650);
    expect(v.totalMax).toBe(2000);
    expect(v.withinStagePoints).toBe(33);
    expect(v.percent).toBe(41);
    expect(v.isMax).toBe(false);
    expect(v.nextStage).toBe(8);
    expect(v.nextDef!.name).toBe(stageDef(8).name);
  });

  it("stage 25 completes the ring: nextStage null, percent forced 100, no next artwork", () => {
    const top: StudentStrength = { ...SYNTHETIC, totalPoints: 2000, stage: 25, withinStagePoints: 80, nextStageRemaining: 0, percent: 100, nextStage: null };
    const v = stageView(top);
    expect(v.stage).toBe(25);
    expect(v.isMax).toBe(true);
    expect(v.percent).toBe(100);
    expect(v.nextStage).toBeNull();
    expect(v.nextDef).toBeNull();
    expect(v.name).toBe(stageDef(25).name);
  });

  it("a top-stage payload that still carries a phantom nextStage is normalized to null (no off-by-one past 25)", () => {
    const bogus = normalizeStrength({ ...SYNTHETIC, stage: 25, nextStage: 26 });
    expect(bogus.stage).toBe(25);
    expect(bogus.nextStage).toBeNull();
    expect(stageView(bogus).isMax).toBe(true);
  });

  it("clamps a slightly out-of-range stage into 1..25 without throwing", () => {
    expect(normalizeStrength({ ...SYNTHETIC, stage: 0 }).stage).toBe(1);
    expect(normalizeStrength({ ...SYNTHETIC, stage: 99 }).stage).toBe(25);
  });
});

describe("fallback — a missing / malformed payload becomes a safe zeroed stage-1 summary (never NaN / negative)", () => {
  it("no payload (undefined / null / non-object) → the zeroed stage-1 fallback", () => {
    for (const raw of [undefined, null, "x", 7]) {
      expect(strengthAuthority(raw)).toBe("fallback");
      expect(normalizeStrength(raw)).toEqual(EMPTY);
    }
    // and a fallback stageView never breaks the hero
    const v = stageView(null);
    expect(v.stage).toBe(1);
    expect(v.totalPoints).toBe(0);
    expect(v.percent).toBe(0);
    expect(Number.isNaN(v.percent)).toBe(false);
    expect(v.def.image).toBe(stageDef(1).image);
  });

  it("a malformed / incomplete payload is rejected as a WHOLE (never partially accepted + locally recomputed)", () => {
    const cases: unknown[] = [
      { ...SYNTHETIC, stage: "7" },              // non-numeric field
      { ...SYNTHETIC, percent: Number.NaN },     // NaN
      { ...SYNTHETIC, nextStage: "8" },          // nextStage neither number nor null
      { totalPoints: 650 },                      // points only (an old partial shape)
      { ...SYNTHETIC, totalMax: undefined },     // missing field
    ];
    for (const raw of cases) {
      expect(strengthAuthority(raw), JSON.stringify(raw)).toBe("fallback");
      expect(normalizeStrength(raw), JSON.stringify(raw)).toEqual(EMPTY);
    }
  });
});

describe("remaining-points phrase (Arabic singular / dual / plural)", () => {
  it("reads naturally for 1, 2 and n", () => {
    expect(remainingPointsPhrase(1)).toBe("بقيت نقطة قوة واحدة");
    expect(remainingPointsPhrase(2)).toBe("بقيت نقطتا قوة");
    expect(remainingPointsPhrase(47)).toBe("بقي 47 نقطة قوة");
    expect(remainingPointsPhrase(0)).toBe("بقيت نقطة قوة واحدة");   // guarded to at least 1
  });
});

describe("static authority guards — the old 6-rank progression is retired for the visible Strength path", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^import [\s\S]*?;$/gm, "");

  it("studentRank.ts no longer exports any global-strength / finalized progression helper", () => {
    const src = read("studentRank.ts");
    for (const gone of ["rankTierForStrength", "nextRankForStrength", "rankForStrength", "strengthProgress", "strengthFromFinalized", "rankTierForFinalized", "nextRankForFinalized", "remainingExamsPhrase", "RANK_STEP_STRENGTH_POINTS", "RANK_STEP_FINALIZED"]) {
      expect(src, gone).not.toContain(gone);
    }
  });

  it("strengthPresentation.ts derives NOTHING from a threshold: it does not import studentRank and never calls stageForPoints", () => {
    const src = code(read("student/strengthPresentation.ts"));
    expect(src).not.toMatch(/studentRank/);
    expect(src).not.toMatch(/stageForPoints\(/);       // the stage is only ever the server's, never recomputed here
    expect(src).not.toMatch(/RANK_STEP|% ?80|\/ ?80/);
  });

  it("StudentPortal.tsx wires the server strength straight through — no client rank/progress derivation", () => {
    const portal = code(read("StudentPortal.tsx"));
    expect(portal).toContain("normalizeStrength(j.strength)");
    expect(portal).not.toMatch(/rankPresentationFromStrength|progressPresentationFromStrength|rankForStrength|strengthProgress\(/);
  });
});
