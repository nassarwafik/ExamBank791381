import { describe, it, expect } from "vitest";
import { getProjectDefinition } from "./registry.js";
import * as gen from "./core.js";
import * as genAnalytics from "./analytics.js";
// Legacy 794589 implementation — the behavior we must preserve exactly. (Phase P-9b: the legacy analytics formatter, a shape
// over this same engine since R33, is gone; the class-level figures are checked against the legacy core per student instead.)
import * as legacy from "../project-794589-core.js";

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

  it("analytics perStudent overall matches the legacy core for every student; stage completion counts approvals", () => {
    const entries = [
      { studentId: "s1", displayName: "أ", progress: approve(bookIds.slice(0, 12)) },
      { studentId: "s2", displayName: "ب", progress: approve(ptIds.slice(0, 8)) }
    ];
    const g = genAnalytics.buildAnalytics(def, entries, NOW);
    const l = entries.map(e => [e.studentId, legacy.buildStudentSummary(def, e.progress, NOW).overallProgress]).sort((a, b) => a[1] - b[1]);
    expect(g.perStudent.map(s => [s.studentId, s.overall])).toEqual(l);
    const active = def.stages.filter(s => s.active === true);
    expect(g.stageCompletion.map(s => s.stageId)).toEqual(active.map(s => s.stageId));
    expect(g.heatmap.stages).toHaveLength(active.length);
    expect(g.stageCompletion.find(s => s.stageId === bookIds[0]).approvedPct).toBe(50);       // one of two students
    expect(g.stageCompletion.find(s => s.stageId === ptIds[ptIds.length - 1]).approvedPct).toBe(0);  // beyond s2's eight
  });

  it("class summary averages and totals match the legacy core per student (avg/complete/ready/stale)", () => {
    const entries = [
      { studentId: "s1", displayName: "أ", progress: approve(bookIds.slice(0, 12)) },
      { studentId: "s2", displayName: "ب", progress: approve([...bookIds, ...ptIds]) }
    ];
    const g = genAnalytics.buildClassSummary(def, entries, NOW);
    const l = entries.map(e => legacy.buildStudentSummary(def, e.progress, NOW));
    const avg = pick => Math.round(l.reduce((sum, x) => sum + pick(x), 0) / l.length);
    expect(g.avgOverall).toBe(avg(x => x.overallProgress));
    expect(g.trackAverages.book).toBe(avg(x => x.bookProgress));
    expect(g.trackAverages.packetTracer).toBe(avg(x => x.packetTracerProgress));
    expect(g.completedCount).toBe(l.filter(x => x.complete).length);
    expect(g.totalReadyStages).toBe(l.reduce((sum, x) => sum + x.readyForReviewCount, 0));
    expect(g.staleCount).toBe(l.filter(x => x.stale).length);                                  // both started and updated now
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
    expect(next.book.stageId).toBe("BK04");                                    // Phase P7: the condensed ids
    expect(next.visualStudio.stageId).toBe("VS01");
  });
});
