import { describe, it, expect } from "vitest";
import { buildClassSummary, buildAnalytics, buildWeeklyTrend } from "./analytics.js";

// The class-level analytics on a small two-track class (book + Packet Tracer, two stages each). Phase P-9b: formerly run through
// the legacy 794589 formatter (project-794589-analytics.js, a shape over this engine since R33), now on the engine directly — the
// same numbers, read from the generic fields (trackAverages, trackProgress).
const NOW = "2026-09-20T00:00:00.000Z";
const config = {
  projectCode: "794589",
  tracks: [{ trackId: "book", title: "الكتاب" }, { trackId: "packetTracer", title: "Packet Tracer" }],
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
    expect(s.trackAverages.book).toBe(50); // (100+50+0)/3
    expect(s.studentsReadyForReview).toBe(1);
    expect(s.totalReadyStages).toBe(1);
    expect(s.completedCount).toBe(0);
    // Phase P-5b — s3 never started (no progress at all): it is «لم يبدأ», no longer counted «بلا تحديث». s1 and s2 were updated
    // recently, so nobody is stale (before P-5b this pinned staleCount 1 for the never-started s3).
    expect(s.staleCount).toBe(0);
  });
});

describe("buildAnalytics", () => {
  const a = buildAnalytics(config, entries, NOW);
  it("perStudent sorted lowest overall first", () => {
    expect(a.perStudent.map(p => p.studentId)).toEqual(["s3", "s2", "s1"]);
    expect(a.perStudent[2]).toMatchObject({ trackProgress: { book: 100, packetTracer: 0 }, overall: 50 });
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

// Phase P-9b — figures the move did not pin yet (the mutation campaign's survivors): a class average that is not whole, ready
// stages counted per stage (not per student), and a retired (inactive) stage kept out of the charts.
describe("class figures: rounding, ready stages, retired stages", () => {
  it("rounds a class average half up (50 and 25 → 38, not 37)", () => {
    const s = buildClassSummary(config, entries.slice(0, 2), NOW);
    expect(s.avgOverall).toBe(38);
    expect(s.trackAverages.book).toBe(75);
  });
  it("counts every stage waiting for review, not every student with one", () => {
    const s4 = { studentId: "s4", displayName: "منى", progress: { updatedAt: NOW, stages: { P01: { status: "ready_for_review" }, P02: { status: "ready_for_review" } } } };
    const s = buildClassSummary(config, [...entries, s4], NOW);
    expect(s.studentsReadyForReview).toBe(2);
    expect(s.totalReadyStages).toBe(3);
  });
  it("leaves a retired stage out of stage completion and the heatmap", () => {
    const retired = { ...config, stages: [...config.stages, { stageId: "B99", track: "book", groupId: "book_g", title: "B99", order: 3, weight: 1, required: true, active: false }] };
    const a = buildAnalytics(retired, entries, NOW);
    expect(a.stageCompletion.map(s => s.stageId)).not.toContain("B99");
    expect(a.heatmap.stages.map(s => s.stageId)).not.toContain("B99");
    expect(a.stageCompletion).toHaveLength(4);
  });
});
