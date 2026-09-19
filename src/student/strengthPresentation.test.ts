// Unified Strength — CLIENT AUTHORITY CONTRACT. The server's `dashboard.strength` decides the progression (tier /
// level / nextTier / block progress); the portal only shapes and labels it. These tests prove (1) a well-formed
// server payload is trusted as a whole — even when its presentation fields deliberately disagree with what a local
// threshold rule would say about totalPoints; (2) a missing OR malformed payload falls back, as a WHOLE, to the
// legacy finalized × 100 path; (3) statically, the current portal path never runs threshold logic over totalPoints.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { isServerStrength, normalizeStrength, progressPresentationFromStrength, rankPresentationFromStrength, strengthAuthority } from "./strengthPresentation";
import type { StudentStrength } from "./types";

/** DELIBERATELY inconsistent: 520 points would be «beginner» under the 400-step rule — the server says «bronze». */
const SYNTHETIC: StudentStrength = {
  totalPoints: 520, examPoints: 300, practicePoints: 20, projectPoints: 200,
  tier: "bronze", level: 2, nextTier: "silver",
  levelBlockSize: 400, withinLevelPoints: 77, nextLevelRemaining: 323, percent: 19,
  projects: [{ projectCode: "899373", overallProgress: 50, strengthPoints: 200 }],
};
const stats = { finalized: 3, averageFinalized: 88.5 };

describe("server payload → trusted completely (no client threshold logic)", () => {
  it("shapes the SERVER tier / nextTier / block progress verbatim — 520 points stay «bronze» because the server said so", () => {
    expect(strengthAuthority(SYNTHETIC)).toBe("server");
    const s = normalizeStrength(SYNTHETIC, 3);
    expect(s).toEqual(SYNTHETIC);
    const rank = rankPresentationFromStrength(s, stats)!;
    expect(rank.tier).toBe("bronze");
    expect(rank.label).toBe("برونزي");
    expect(rank.points).toBe(520);
    expect(rank.finalized).toBe(3);
    expect(rank.averageFinalized).toBe(88.5);
    expect(rank.next).toEqual({ tier: "silver", label: "فضي", remaining: 323, percent: 19 });
    expect(progressPresentationFromStrength(s)).toEqual({ points: 520, withinBlock: 77, needed: 400, remaining: 323, percent: 19 });
  });
  it("tier null → no rank object; nextTier null (top) → no next; the ring still reads the server's block values", () => {
    const none = normalizeStrength({ ...SYNTHETIC, tier: null, level: 0, nextTier: "beginner", totalPoints: 120, withinLevelPoints: 120, nextLevelRemaining: 280, percent: 30 }, 0);
    expect(rankPresentationFromStrength(none, stats)).toBeNull();
    expect(progressPresentationFromStrength(none)).toEqual({ points: 120, withinBlock: 120, needed: 400, remaining: 280, percent: 30 });
    const top = normalizeStrength({ ...SYNTHETIC, tier: "legendary", level: 6, nextTier: null, totalPoints: 3000, withinLevelPoints: 400, nextLevelRemaining: 0, percent: 100 }, 30);
    const rank = rankPresentationFromStrength(top, stats)!;
    expect(rank.tier).toBe("legendary");
    expect(rank.next).toBeNull();
    expect(progressPresentationFromStrength(top)).toEqual({ points: 3000, withinBlock: 400, needed: 400, remaining: 0, percent: 100 });
  });
  it("the real server example (3 exams + 80% T02 + 50% project = 520, beginner → bronze) shapes 1:1", () => {
    const server = { totalPoints: 520, examPoints: 300, practicePoints: 20, projectPoints: 200, tier: "beginner", level: 1, nextTier: "bronze", levelBlockSize: 400, withinLevelPoints: 120, nextLevelRemaining: 280, percent: 30, projects: [{ projectCode: "899373", overallProgress: 50, strengthPoints: 200 }] };
    const s = normalizeStrength(server, 3);
    expect(s).toEqual(server);
    expect(rankPresentationFromStrength(s, stats)?.next).toEqual({ tier: "bronze", label: "برونزي", remaining: 280, percent: 30 });
  });
});

describe("legacy fallback — used as a WHOLE, never mixed", () => {
  it("no payload (undefined / null / non-object) → finalized × 100 through the compatibility rule", () => {
    for (const raw of [undefined, null, "x", 7]) expect(strengthAuthority(raw)).toBe("legacy");
    expect(normalizeStrength(undefined, 3)).toEqual({ totalPoints: 300, examPoints: 300, practicePoints: 0, projectPoints: 0, tier: null, level: 0, nextTier: "beginner", levelBlockSize: 400, withinLevelPoints: 300, nextLevelRemaining: 100, percent: 75, projects: [] });
    expect(normalizeStrength(null, 4)).toMatchObject({ totalPoints: 400, tier: "beginner", level: 1, nextTier: "bronze", withinLevelPoints: 0, nextLevelRemaining: 400, percent: 0 });
    expect(normalizeStrength(null, 5)).toMatchObject({ totalPoints: 500, tier: "beginner", nextTier: "bronze", withinLevelPoints: 100, nextLevelRemaining: 300, percent: 25 });
    expect(normalizeStrength(null, 24)).toMatchObject({ totalPoints: 2400, tier: "legendary", level: 6, nextTier: null, withinLevelPoints: 400, nextLevelRemaining: 0, percent: 100 });
    expect(normalizeStrength(null, -2)).toMatchObject({ totalPoints: 0, tier: null, nextTier: "beginner" });
  });
  it("a malformed / incomplete strength object is rejected as a WHOLE (never partially accepted + locally recomputed)", () => {
    const cases: unknown[] = [
      { ...SYNTHETIC, tier: undefined },                    // missing tier
      { ...SYNTHETIC, nextTier: "platinum" },               // unknown tier id
      { ...SYNTHETIC, withinLevelPoints: "77" },            // non-numeric
      { ...SYNTHETIC, percent: Number.NaN },                // NaN
      { totalPoints: 520 },                                 // points only (the OLD partial shape)
      { ...SYNTHETIC, projects: "none" },                   // projects not an array
    ];
    for (const raw of cases) {
      expect(strengthAuthority(raw), JSON.stringify(raw)).toBe("legacy");
      expect(normalizeStrength(raw, 3), JSON.stringify(raw)).toEqual(normalizeStrength(null, 3));   // identical to the no-payload path
    }
    expect(isServerStrength(SYNTHETIC)).toBe(true);
  });
});

describe("static authority guards", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^import [\s\S]*?;$/gm, "");
  it("StudentPortal no longer calls the client-side Strength policy helpers for the current server payload", () => {
    const portal = code(read("StudentPortal.tsx"));
    expect(portal).not.toMatch(/rankForStrength\(|strengthProgress\(|rankTierForStrength\(|nextRankForStrength\(|rankFor\(|rankProgress\(/);
    expect(portal).not.toMatch(/RANK_STEP_STRENGTH_POINTS|RANK_STEP_FINALIZED|% ?400|\/ ?400/);
    expect(portal).toContain("rankPresentationFromStrength(strength, stats)");
    expect(portal).toContain("progressPresentationFromStrength(");
  });
  it("the server path of strengthPresentation.ts contains no threshold arithmetic; the policy helpers appear only inside the legacy fallback", () => {
    const src = code(read("student/strengthPresentation.ts"));
    const cut = src.indexOf("function legacyStrength(");
    expect(cut).toBeGreaterThan(0);
    const serverPath = src.slice(0, cut), legacyPath = src.slice(cut);
    expect(serverPath).not.toMatch(/rankTierForStrength\(|nextRankForStrength\(|strengthProgress\(|strengthFromFinalized\(|rankForStrength\(/);
    expect(serverPath).not.toMatch(/Math\.floor|Math\.round|\s%\s|\s\/\s|RANK_STEP_STRENGTH_POINTS|400/);
    expect(serverPath).not.toMatch(/RANK_ORDER\[|indexOf\(/);                   // tier is never positioned/derived, only validated
    expect(legacyPath).toMatch(/rankTierForStrength\(examPoints\)/);            // the ONLY client-side rank derivation
  });
});
