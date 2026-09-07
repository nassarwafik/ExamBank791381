import { describe, it, expect } from "vitest";
import { parseDateRange, inRange } from "./date-range.js";

describe("parseDateRange", () => {
  it("empty range (all) => nulls", () => {
    expect(parseDateRange("", "")).toEqual({ from: null, to: null });
    expect(parseDateRange(undefined, undefined)).toEqual({ from: null, to: null });
  });
  it("parses valid from/to; date-only `to` extends to end of day", () => {
    const r = parseDateRange("2026-01-01", "2026-01-31");
    expect(r.from).toBe(Date.parse("2026-01-01"));
    expect(r.to).toBe(Date.parse("2026-01-31") + 86400000 - 1);
  });
  it("throws 400 on an invalid from", () => {
    expect(() => parseDateRange("not-a-date", "")).toThrowError();
    try { parseDateRange("not-a-date", ""); } catch (e) { expect(e.httpStatus).toBe(400); }
  });
  it("throws 400 on an invalid to", () => {
    try { parseDateRange("", "xyz"); } catch (e) { expect(e.httpStatus).toBe(400); }
  });
  it("throws 400 when from > to", () => {
    try { parseDateRange("2026-02-01", "2026-01-01"); } catch (e) { expect(e.httpStatus).toBe(400); }
  });
});

describe("inRange", () => {
  const range = parseDateRange("2026-01-10", "2026-01-20");
  it("empty range matches everything, including missing timestamps", () => {
    const all = { from: null, to: null };
    expect(inRange("2020-01-01T00:00:00Z", all)).toBe(true);
    expect(inRange("", all)).toBe(true);
  });
  it("includes boundary timestamps (inclusive)", () => {
    expect(inRange("2026-01-10T00:00:00.000Z", range)).toBe(true);
    expect(inRange("2026-01-20T23:59:59.000Z", range)).toBe(true);
  });
  it("excludes timestamps outside the range", () => {
    expect(inRange("2026-01-09T23:00:00Z", range)).toBe(false);
    expect(inRange("2026-01-21T00:00:01Z", range)).toBe(false);
  });
  it("excludes a missing/invalid timestamp from a non-empty range", () => {
    expect(inRange("", range)).toBe(false);
    expect(inRange("nonsense", range)).toBe(false);
  });
});
