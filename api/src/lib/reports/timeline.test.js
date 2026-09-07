import { describe, it, expect } from "vitest";
import { buildHistoryTimeline, statusAsOf } from "./timeline.js";

// One-track project, two required stages, weights 1, track weight 100 -> overall == book%.
const def = {
  tracks: [{ trackId: "book", title: "الكتاب" }],
  trackWeights: { book: 100 },
  stages: [
    { stageId: "B01", track: "book", active: true, required: true, weight: 1 },
    { stageId: "B02", track: "book", active: true, required: true, weight: 1 }
  ]
};
const NOW = "2026-02-01T00:00:00.000Z";

describe("statusAsOf", () => {
  it("last event before the cutoff wins (handles un-approval)", () => {
    const history = [
      { stageId: "B01", type: "status", toStatus: "approved", createdAt: "2026-01-01T00:00:00Z" },
      { stageId: "B01", type: "status", toStatus: "in_progress", createdAt: "2026-01-10T00:00:00Z" }
    ];
    expect(statusAsOf(history, Date.parse("2026-01-05T00:00:00Z")).stages.B01.status).toBe("approved");
    expect(statusAsOf(history, Date.parse("2026-01-15T00:00:00Z")).stages.B01.status).toBe("in_progress");
  });
});

describe("buildHistoryTimeline", () => {
  it("empty history -> empty timeline (never invents points)", () => {
    expect(buildHistoryTimeline(def, [{ studentId: "s1", progress: { history: [] } }], { from: null, to: null }, NOW)).toEqual([]);
    expect(buildHistoryTimeline(def, [{ studentId: "s1", progress: null }], { from: null, to: null }, NOW)).toEqual([]);
  });
  it("an approved event increases progress; a later un-approval lowers it", () => {
    const progress = { history: [
      { stageId: "B01", type: "status", toStatus: "approved", createdAt: "2026-01-05T00:00:00Z" },
      { stageId: "B02", type: "status", toStatus: "approved", createdAt: "2026-01-12T00:00:00Z" },
      { stageId: "B01", type: "status", toStatus: "in_progress", createdAt: "2026-01-26T00:00:00Z" }
    ] };
    const pts = buildHistoryTimeline(def, [{ studentId: "s1", progress }], { from: null, to: null }, NOW);
    // progress rises to 100% (both approved) then drops to 50% after B01 is un-approved.
    const max = Math.max(...pts.map(p => p.avgOverall));
    expect(max).toBe(100);
    expect(pts[pts.length - 1].avgOverall).toBe(50);
  });
  it("class timeline averages across students", () => {
    const entries = [
      { studentId: "s1", progress: { history: [{ stageId: "B01", type: "status", toStatus: "approved", createdAt: "2026-01-05T00:00:00Z" }, { stageId: "B02", type: "status", toStatus: "approved", createdAt: "2026-01-05T00:00:00Z" }] } },
      { studentId: "s2", progress: { history: [] } }
    ];
    const pts = buildHistoryTimeline(def, entries, { from: null, to: null }, NOW);
    // s1 at 100, s2 at 0 -> class average 50.
    expect(pts[pts.length - 1].avgOverall).toBe(50);
  });
  it("excludes points outside the date range", () => {
    const progress = { history: [{ stageId: "B01", type: "status", toStatus: "approved", createdAt: "2026-01-05T00:00:00Z" }] };
    const range = { from: Date.parse("2026-01-19"), to: Date.parse("2026-02-01") + 86400000 - 1 };
    const pts = buildHistoryTimeline(def, [{ studentId: "s1", progress }], range, NOW);
    expect(pts.every(p => Date.parse(p.weekStart) >= range.from)).toBe(true);
  });
});
