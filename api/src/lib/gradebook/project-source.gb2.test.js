// Class gradebook GB2 — a project column's evidence from the student's progress document (docs/enterprise-class-gradebook-gb.md §4.3).
// A complete project counts its grade; a project in progress is pending (a partial total is never a final mark); no record is «—».
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const cjs = createRequire(import.meta.url);
const { projectEvidenceFromProgress } = cjs("./project-source.js");
const { calculateProjectGrade } = cjs("../project-tracker/performance.js");

const DEF = {
  projectCode: "test", title: "مشروع", config: { staleDays: 7 },
  tracks: [{ trackId: "t1", title: "المسار" }], trackWeights: { t1: 1 },
  stages: [{ stageId: "a", track: "t1", title: "أ", active: true, required: true, weight: 1, order: 1 }, { stageId: "b", track: "t1", title: "ب", active: true, required: true, weight: 1, order: 2 }]
};
const NOW = new Date("2026-11-18T10:00:00.000Z");
const doc = stages => ({ studentId: "u1", updatedAt: "2026-11-17T10:00:00.000Z", stages });

describe("GB2 — project evidence", () => {
  it("no progress document → none («—», never a zero)", () => {
    expect(projectEvidenceFromProgress(DEF, null, NOW)).toEqual({ kind: "none" });
    expect(projectEvidenceFromProgress(DEF, undefined, NOW)).toEqual({ kind: "none" });
  });
  it("every active stage approved → final, the project tracker's own grade", () => {
    const d = doc({ a: { status: "approved", score: 80 }, b: { status: "approved", score: 60 } });
    const e = projectEvidenceFromProgress(DEF, d, NOW);
    expect(e.kind).toBe("final");
    expect(e.percent).toBeCloseTo(calculateProjectGrade(DEF, d), 12);
    expect(e.percent).toBeCloseTo(70, 12);
  });
  it("started but not complete → pending, even with a partial grade", () => {
    expect(projectEvidenceFromProgress(DEF, doc({ a: { status: "approved", score: 100 } }), NOW)).toEqual({ kind: "pending" });
    expect(projectEvidenceFromProgress(DEF, doc({ a: { status: "approved", score: 90 }, b: { status: "ready_for_review" } }), NOW)).toEqual({ kind: "pending" });
    expect(projectEvidenceFromProgress(DEF, doc({}), NOW)).toEqual({ kind: "pending" });
  });
  it("an unreadable document or definition → unclassified (fail closed)", () => {
    expect(projectEvidenceFromProgress(DEF, "x", NOW)).toEqual({ kind: "unclassified" });
    expect(projectEvidenceFromProgress(DEF, [], NOW)).toEqual({ kind: "unclassified" });
    expect(projectEvidenceFromProgress(null, doc({ a: { status: "approved", score: 80 } }), NOW).kind).not.toBe("final");
  });
});
