import { describe, it, expect } from "vitest";
import { round, average, trendDelta, trendLabel } from "./teacher-analytics-core.js";

describe("round", () => {
  it("rounds to one decimal by default", () => {
    expect(round(66.6666)).toBe(66.7);
  });
  it("supports a custom digit count", () => {
    expect(round(66.6666, 2)).toBe(66.67);
  });
});

describe("average", () => {
  it("returns null for an empty list", () => {
    expect(average([])).toBeNull();
  });
  it("treats non-finite values as 0 rather than dropping or crashing on them", () => {
    expect(average([80, NaN, 90])).toBeCloseTo(56.7, 5);
  });
});

describe("trendDelta", () => {
  it("returns 0 with fewer than two points", () => {
    expect(trendDelta([{ percentage: 80 }])).toBe(0);
  });
  it("compares first vs last with exactly two or three points", () => {
    expect(trendDelta([{ percentage: 60 }, { percentage: 75 }])).toBe(15);
  });
  it("compares the last two vs the previous two once four or more points exist", () => {
    const points = [{ percentage: 50 }, { percentage: 50 }, { percentage: 90 }, { percentage: 90 }];
    expect(trendDelta(points)).toBe(40);
  });
});

describe("trendLabel", () => {
  it("labels a delta of +5 or more as improving", () => {
    expect(trendLabel(5)).toBe("improving");
  });
  it("labels a delta of -5 or less as declining", () => {
    expect(trendLabel(-5)).toBe("declining");
  });
  it("labels anything in between as stable", () => {
    expect(trendLabel(0)).toBe("stable");
    expect(trendLabel(4.9)).toBe("stable");
  });
});
