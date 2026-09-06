import { describe, it, expect } from "vitest";
import { buildClassSummary, buildAnalytics, buildWeeklyTrend } from "./project-794589-analytics.js";

const NOW = "2026-09-20T00:00:00.000Z";
const config = {
  trackWeights: { book: 50, packetTracer: 50 },
  config: { staleDays: 7 },
  groups: [{ groupId: "book_g", track: "book", title: "كتاب", order: 1 }, { groupId: "pt_g", track: "packetTracer", title: "PT", order: 2 }],
  stages: [
    { stageId: "B01", track: "book", groupId: "book_g", title: "B01", order: 1, weight: 1, required: true, active: true },
    { stageId: "B02", track: "book", groupId: "book_g", title: "B02", order: 2, weight: 1, required: true, active: true },
    { stageId: "P01", track: "packetTracer", groupId: "pt_g", title: "P01", order: 1, weight: 1, required: true, active: true },
    { stageId: "P02", track: "packetTracer", groupId: "pt_g", title: "P02", order: 2, weight: 1, required: true, active: true }
  ]
};
const entries = [
  { studentId: "s1", displayName: "أحمد", progress: { updatedAt: NOW, stages: { B01: { status: "approved", approvedAt: "2026-09-05T00:00:00.000Z" }, B02: { status: "approved", approvedAt: "2026-09-12T00:00:00.000Z" }, P01: { status: "ready_for_review" } } } },
  { studentId: "s2", displayName: "سارة", progress: { updatedAt: NOW, stages: { B01: { status: "approved", approvedAt: "2026-09-05T00:00:00.000Z" } } } },
  { studentId: "s3", displayName: "خالد", progress: null }
];

describe("buildClassSummary", () => {
  it("averages progress and counts ready/complete/stale", () => {
    const s = buildClassSummary(config, entries, NOW);
    expect(s.studentCount).toBe(3);
    // s1: book 100, pt 0 -> overall 50; s2: book 50 pt 0 -> 25; s3: 0. avg overall = round(75/3)=25.
    expect(s.avgOverall).toBe(25);
    expect(s.avgBook).toBe(50); // (100+50+0)/3
    expect(s.studentsReadyForReview).toBe(1);
    expect(s.totalReadyStages).toBe(1);
    expect(s.completedCount).toBe(0);
    expect(s.staleCount).toBe(1); // s3 never updated
  });
});

describe("buildAnalytics", () => {
  const a = buildAnalytics(config, entries, NOW);
  it("perStudent sorted lowest overall first", () => {
    expect(a.perStudent.map(p => p.studentId)).toEqual(["s3", "s2", "s1"]);
    expect(a.perStudent[2]).toMatchObject({ book: 100, packetTracer: 0, overall: 50 });
  });
  it("stageCompletion is approved% across students", () => {
    const b01 = a.stageCompletion.find(s => s.stageId === "B01");
    expect(b01.approvedPct).toBe(67); // 2 of 3 approved
    const p01 = a.stageCompletion.find(s => s.stageId === "P01");
    expect(p01.approvedPct).toBe(0); // ready_for_review is not approved
  });
  it("buckets distribute overall progress", () => {
    // overalls: 50, 25, 0 -> buckets 0-25:2 (0 and 25), 26-50:1 (50)
    expect(a.buckets["0-25"]).toBe(2);
    expect(a.buckets["26-50"]).toBe(1);
  });
  it("heatmap has all active stages and one status row per student", () => {
    expect(a.heatmap.stages).toHaveLength(4);
    expect(a.heatmap.statuses).toHaveLength(3);
    expect(a.heatmap.statuses[0].B01).toBe("approved");
  });
});

describe("buildWeeklyTrend", () => {
  it("reconstructs class average using approvedAt timestamps", () => {
    const trend = buildWeeklyTrend(config, entries, NOW);
    expect(trend.length).toBeGreaterThan(0);
    // last point should reflect the current state (avg overall 25).
    expect(trend[trend.length - 1].avgOverall).toBe(25);
    // earlier point (before B02 approved on 09-12) has s1 at book 50 only.
    expect(trend[0].avgOverall).toBeLessThanOrEqual(25);
  });
});
