import { describe, it, expect } from "vitest";
import { getProjectDefinition } from "./registry.js";
import * as gen from "./core.js";
import * as genAnalytics from "./analytics.js";
// Legacy 794589 implementations — the behavior we must preserve exactly.
import * as legacy from "../project-794589-core.js";
import * as legacyAnalytics from "../project-794589-analytics.js";

const NOW = "2026-09-20T00:00:00.000Z";

function approve(ids) {
  const stages = {};
  for (const id of ids) stages[id] = { status: "approved", approvedAt: NOW, approvedBy: "t1" };
  return { stages, history: [], updatedAt: NOW };
}

describe("engine parity with legacy 794589 math", () => {
  const def = getProjectDefinition("794589");
  const bookIds = def.stages.filter(s => s.track === "book").map(s => s.stageId);
  const ptIds = def.stages.filter(s => s.track === "packetTracer").map(s => s.stageId);

  const cases = [
    approve([]),
    approve(bookIds.slice(0, 10)),
    approve([...bookIds.slice(0, 20), ...ptIds.slice(0, 30)]),
    approve([...bookIds, ...ptIds])
  ];

  it("buildStudentSummary matches legacy overall/book/pt for every case", () => {
    for (const p of cases) {
      const g = gen.buildStudentSummary(def, p, NOW);
      const l = legacy.buildStudentSummary(def, p, NOW);
      expect(g.overallProgress).toBe(l.overallProgress);
      expect(g.trackProgress.book).toBe(l.bookProgress);
      expect(g.trackProgress.packetTracer).toBe(l.packetTracerProgress);
      expect(g.complete).toBe(l.complete);
      expect(g.counts).toEqual(l.counts);
      expect(g.readyForReviewCount).toBe(l.readyForReviewCount);
    }
  });

  it("balance insight names the same leading track and diff as legacy", () => {
    const p = approve(bookIds); // book 100, pt 0
    const g = gen.getBalanceInsight(gen.buildTrackProgress(def, p), def);
    const l = legacy.getBalanceInsight(100, 0, def.config.balanceWarningThreshold);
    expect(g.leadingTrackId).toBe(l.leadingTrack);
    expect(g.diff).toBe(l.diff);
  });

  it("analytics perStudent overall + stageCompletion + heatmap match legacy", () => {
    const entries = [
      { studentId: "s1", displayName: "أ", progress: approve(bookIds.slice(0, 12)) },
      { studentId: "s2", displayName: "ب", progress: approve(ptIds.slice(0, 8)) }
    ];
    const g = genAnalytics.buildAnalytics(def, entries, NOW);
    const l = legacyAnalytics.buildAnalytics(def, entries, NOW);
    expect(g.perStudent.map(s => [s.studentId, s.overall])).toEqual(l.perStudent.map(s => [s.studentId, s.overall]));
    expect(g.stageCompletion).toEqual(l.stageCompletion);
    expect(g.buckets).toEqual(l.buckets);
    expect(g.heatmap.stages.length).toBe(l.heatmap.stages.length);
    expect(g.weeklyTrend).toEqual(l.weeklyTrend);
  });

  it("class summary matches legacy totals (avg/complete/ready/stale)", () => {
    const entries = [
      { studentId: "s1", displayName: "أ", progress: approve(bookIds.slice(0, 12)) },
      { studentId: "s2", displayName: "ب", progress: approve([...bookIds, ...ptIds]) }
    ];
    const g = genAnalytics.buildClassSummary(def, entries, NOW);
    const l = legacyAnalytics.buildClassSummary(def, entries, NOW);
    expect(g.avgOverall).toBe(l.avgOverall);
    expect(g.trackAverages.book).toBe(l.avgBook);
    expect(g.trackAverages.packetTracer).toBe(l.avgPacketTracer);
    expect(g.completedCount).toBe(l.completedCount);
    expect(g.totalReadyStages).toBe(l.totalReadyStages);
    expect(g.staleCount).toBe(l.staleCount);
  });
});

describe("engine works generically for new projects", () => {
  it("899373: 50/50 overall across book/access, completion over all required", () => {
    const def = getProjectDefinition("899373");
    const bookIds = def.stages.filter(s => s.track === "book").map(s => s.stageId);
    const accessIds = def.stages.filter(s => s.track === "access").map(s => s.stageId);
    const p = approve(bookIds); // book 100, access 0
    const sum = gen.buildStudentSummary(def, p, NOW);
    expect(sum.trackProgress.book).toBe(100);
    expect(sum.trackProgress.access).toBe(0);
    expect(sum.overallProgress).toBe(50);
    expect(sum.complete).toBe(false);
    const full = gen.buildStudentSummary(def, approve([...bookIds, ...accessIds]), NOW);
    expect(full.complete).toBe(true);
    expect(full.overallProgress).toBe(100);
  });

  it("899373 balance names Access/Book, never Packet Tracer", () => {
    const def = getProjectDefinition("899373");
    const bookIds = def.stages.filter(s => s.track === "book").map(s => s.stageId);
    const b = gen.getBalanceInsight(gen.buildTrackProgress(def, approve(bookIds)), def);
    expect(b.leadingTrackTitle).toBe("الكتاب");
    expect(b.laggingTrackTitle).toBe("Access");
  });

  it("883589: next stage per track follows order", () => {
    const def = getProjectDefinition("883589");
    const bookIds = def.stages.filter(s => s.track === "book").map(s => s.stageId);
    const next = gen.getNextStages(def, approve(bookIds.slice(0, 3)));
    expect(next.book.stageId).toBe("B04");
    expect(next.visualStudio.stageId).toBe("V01");
  });
});
