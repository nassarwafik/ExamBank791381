import { describe, it, expect } from "vitest";
import {
  calculateTrackProgress, calculateOverallProgress, countStatuses, getNextStage,
  getBalanceInsight, isStudentComplete, getStaleState, buildStudentSummary, progressBucket, stageStatus
} from "./project-794589-core.js";

const NOW = "2026-09-10T00:00:00.000Z";

function stage(id, track, over = {}) {
  return { stageId: id, track, groupId: track + "_g", title: id, order: Number(id.slice(1)), weight: 1, required: true, active: true, ...over };
}
function progress(map) {
  const stages = {};
  for (const [k, v] of Object.entries(map)) stages[k] = typeof v === "string" ? { status: v } : v;
  return { stages, updatedAt: NOW };
}

const config = {
  trackWeights: { book: 50, packetTracer: 50 },
  config: { staleDays: 7 },
  stages: [
    stage("B01", "book"), stage("B02", "book"), stage("B03", "book", { required: false }),
    stage("B04", "book", { active: false }),
    stage("P01", "packetTracer"), stage("P02", "packetTracer")
  ]
};

describe("stage status transitions & progress counting", () => {
  it("unknown stage defaults to not_started", () => {
    expect(stageStatus(progress({}), "B01")).toBe("not_started");
  });
  it("approved stage counts, ready_for_review does not", () => {
    const p = progress({ B01: "approved", B02: "ready_for_review" });
    // book required+active = B01,B02 (B03 optional, B04 inactive excluded). 1 of 2 approved = 50%.
    expect(calculateTrackProgress(config.stages, p, "book")).toBe(50);
  });
  it("ready_for_review is not counted as approved progress", () => {
    const p = progress({ B01: "ready_for_review", B02: "ready_for_review" });
    expect(calculateTrackProgress(config.stages, p, "book")).toBe(0);
  });
  it("optional stage does not change the percentage denominator", () => {
    // approving optional B03 alone keeps book at 0 (only required B01,B02 count).
    expect(calculateTrackProgress(config.stages, progress({ B03: "approved" }), "book")).toBe(0);
  });
  it("inactive stage never counts", () => {
    expect(calculateTrackProgress(config.stages, progress({ B04: "approved" }), "book")).toBe(0);
  });
  it("packetTracer progress is independent of book", () => {
    expect(calculateTrackProgress(config.stages, progress({ P01: "approved" }), "packetTracer")).toBe(50);
  });
});

describe("weighted overall progress", () => {
  it("blends the two tracks by weight", () => {
    expect(calculateOverallProgress(80, 60, { book: 50, packetTracer: 50 })).toBe(70);
    expect(calculateOverallProgress(80, 60, { book: 75, packetTracer: 25 })).toBe(75);
  });
  it("respects stage weight in a track", () => {
    const cfg = [stage("B01", "book", { weight: 3 }), stage("B02", "book", { weight: 1 })];
    // approve only the weight-3 stage => 3/4 = 75%.
    expect(calculateTrackProgress(cfg, progress({ B01: "approved" }), "book")).toBe(75);
  });
});

describe("counts / next / balance / complete / stale", () => {
  it("countStatuses covers all active stages of a track", () => {
    const c = countStatuses(config.stages, progress({ B01: "approved", B02: "in_progress" }), "book");
    expect(c).toEqual({ not_started: 1, in_progress: 1, ready_for_review: 0, approved: 1 }); // B01,B02,B03 active
  });
  it("getNextStage returns first required+active unapproved by order", () => {
    expect(getNextStage(config.stages, progress({ B01: "approved" }), "book").stageId).toBe("B02");
    expect(getNextStage(config.stages, progress({ B01: "approved", B02: "approved" }), "book")).toBeNull();
  });
  it("balance insight only above threshold", () => {
    expect(getBalanceInsight(80, 60, 25)).toBeNull();
    expect(getBalanceInsight(80, 50, 25)).toEqual({ leadingTrack: "book", diff: 30 });
    expect(getBalanceInsight(40, 80, 25)).toEqual({ leadingTrack: "packetTracer", diff: 40 });
  });
  it("complete requires all required+active approved in both tracks", () => {
    expect(isStudentComplete(config.stages, progress({ B01: "approved", B02: "approved", P01: "approved", P02: "approved" }))).toBe(true);
    expect(isStudentComplete(config.stages, progress({ B01: "approved", B02: "approved", P01: "approved" }))).toBe(false);
  });
  it("stale only when not complete and past staleDays", () => {
    expect(getStaleState("2026-09-01T00:00:00.000Z", 7, NOW, false)).toBe(true);  // 9 days
    expect(getStaleState("2026-09-08T00:00:00.000Z", 7, NOW, false)).toBe(false); // 2 days
    expect(getStaleState("2026-08-01T00:00:00.000Z", 7, NOW, true)).toBe(false);  // complete never stale
  });
  it("progressBucket maps percentages to buckets", () => {
    expect(progressBucket(0)).toBe("0-25");
    expect(progressBucket(50)).toBe("26-50");
    expect(progressBucket(75)).toBe("51-75");
    expect(progressBucket(90)).toBe("76-99");
    expect(progressBucket(100)).toBe("100");
  });
});

describe("buildStudentSummary", () => {
  it("produces the lightweight card with counts and flags", () => {
    const sum = buildStudentSummary(config, progress({ B01: "approved", P01: "ready_for_review" }), NOW);
    expect(sum.bookProgress).toBe(50);
    expect(sum.packetTracerProgress).toBe(0);
    expect(sum.overallProgress).toBe(25);
    expect(sum.readyForReviewCount).toBe(1);
    expect(sum.complete).toBe(false);
  });
  it("a null progress doc is all not_started and stale (never updated)", () => {
    const sum = buildStudentSummary(config, null, NOW);
    expect(sum.overallProgress).toBe(0);
    expect(sum.stale).toBe(true);
  });
});
