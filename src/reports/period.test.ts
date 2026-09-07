import { describe, it, expect } from "vitest";
import { formatLocalDate, rangeForPeriod } from "./period";

describe("formatLocalDate (local calendar Y-M-D, not UTC)", () => {
  it("pads month/day and uses local components", () => {
    expect(formatLocalDate(new Date(2026, 0, 3))).toBe("2026-01-03");
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("rangeForPeriod boundaries (N days = today + previous N-1)", () => {
  it("last 7 days spans exactly 7 calendar days", () => {
    const today = new Date(2026, 5, 15); // 2026-06-15
    const r = rangeForPeriod("7", today);
    expect(r.to).toBe("2026-06-15");
    expect(r.from).toBe("2026-06-09"); // 15 - 6
  });
  it("last 30 days spans exactly 30 calendar days", () => {
    const today = new Date(2026, 5, 30);
    const r = rangeForPeriod("30", today);
    expect(r.to).toBe("2026-06-30");
    expect(r.from).toBe("2026-06-01"); // 30 - 29
  });
  it("handles a month boundary", () => {
    const today = new Date(2026, 2, 3); // 2026-03-03
    const r = rangeForPeriod("7", today);
    expect(r.from).toBe("2026-02-25"); // crosses into February
  });
  it("handles a year boundary", () => {
    const today = new Date(2026, 0, 3); // 2026-01-03
    const r = rangeForPeriod("7", today);
    expect(r.from).toBe("2025-12-28");
  });
  it("all / year / custom carry no computed bound", () => {
    expect(rangeForPeriod("all")).toEqual({ from: "", to: "" });
    expect(rangeForPeriod("year")).toEqual({ from: "", to: "" });
    expect(rangeForPeriod("custom")).toEqual({ from: "", to: "" });
  });
});
