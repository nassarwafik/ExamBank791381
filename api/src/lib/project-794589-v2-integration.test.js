import { describe, it, expect } from "vitest";
import { buildClassSnapshotFromDefault } from "./project-794589-template.js";
import { calculateTrackProgress, buildStudentSummary, isStudentComplete, getNextStage } from "./project-794589-core.js";
import { buildAnalytics } from "./project-794589-analytics.js";

const NOW = "2026-09-07T00:00:00.000Z";
const config = buildClassSnapshotFromDefault("cV2", NOW);
const bookIds = config.stages.filter(s => s.track === "book").map(s => s.stageId);
const ptIds = config.stages.filter(s => s.track === "packetTracer").map(s => s.stageId);

function approve(ids) {
  const stages = {};
  for (const id of ids) stages[id] = { status: "approved", approvedAt: NOW, approvedBy: "t1" };
  return { stages, history: [] };
}

describe("progress calculation on V2 template", () => {
  it("book progress is approved/54 by weight (all weight 1)", () => {
    const half = approve(bookIds.slice(0, 27));
    expect(calculateTrackProgress(config.stages, half, "book")).toBe(Math.round((27 / 54) * 100));
  });
  it("packet-tracer progress is approved/51", () => {
    const some = approve(ptIds.slice(0, 25));
    expect(calculateTrackProgress(config.stages, some, "packetTracer")).toBe(Math.round((25 / 51) * 100));
  });
  it("overall uses the 50/50 track weights", () => {
    const p = approve([...bookIds.slice(0, 54), ...ptIds.slice(0, 0)]); // book 100%, pt 0%
    const summary = buildStudentSummary(config, p, NOW);
    expect(summary.bookProgress).toBe(100);
    expect(summary.packetTracerProgress).toBe(0);
    expect(summary.overallProgress).toBe(50);
  });
});

describe("completion on V2 template", () => {
  it("is complete only when all 105 required+active stages are approved", () => {
    const all = approve([...bookIds, ...ptIds]);
    expect(isStudentComplete(config.stages, all)).toBe(true);
    const missingOne = approve([...bookIds, ...ptIds].slice(0, 104));
    expect(isStudentComplete(config.stages, missingOne)).toBe(false);
  });
});

describe("getNextStage on V2 template", () => {
  it("returns the first not-yet-approved stage by order", () => {
    const p = approve(bookIds.slice(0, 3)); // B01..B03 approved
    const next = getNextStage(config.stages, p, "book");
    expect(next.stageId).toBe("B04");
  });
});

describe("analytics + heatmap on V2 template", () => {
  const entries = [
    { studentId: "s1", displayName: "طالب ١", progress: approve(bookIds.slice(0, 10)) },
    { studentId: "s2", displayName: "طالب ٢", progress: approve(ptIds.slice(0, 5)) }
  ];
  const a = buildAnalytics(config, entries, NOW);
  it("heatmap covers exactly the 105 new stages and no old ids", () => {
    expect(a.heatmap.stages).toHaveLength(105);
    const ids = a.heatmap.stages.map(s => s.stageId);
    expect(ids.some(id => /^B/.test(id) && Number(id.slice(1)) > 54)).toBe(false);
    expect(ids.some(id => /^P/.test(id) && Number(id.slice(1)) > 51)).toBe(false);
  });
  it("stage-completion chart references only new ids", () => {
    expect(a.stageCompletion).toHaveLength(105);
    expect(a.stageCompletion.every(s => bookIds.includes(s.stageId) || ptIds.includes(s.stageId))).toBe(true);
  });
});
