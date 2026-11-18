import { describe, it, expect } from "vitest";
import { normalizePlotExpression, readPlotWindow, buildPlotSpec, plotValuesAt, formatPlotNumber, DEFAULT_WINDOW } from "./graphPlotter";

describe("T4 — school notation → the graph engine's language", () => {
  it.each([
    ["2x + 1", "2*x + 1"], ["2(x+1)", "2*(x+1)"], ["(x+1)(x-1)", "(x+1)*(x-1)"], ["(x+1)2", "(x+1)*2"], ["x(x-2)", "x*(x-2)"],
    ["3sin(x)", "3*sin(x)"], ["2π", "2*pi"], ["2pi x", "2*pi x"], ["√(x)", "sqrt(x)"], ["log(x)", "log10(x)"], ["x × 3 ÷ 2 − 1", "x * 3 / 2 - 1"],
    ["0.5x^2", "0.5*x^2"], ["log10(x)", "log10(x)"], ["exp(x)", "exp(x)"], ["x^2(x+1)", "x^2*(x+1)"], ["  x  ", "x"]
  ])("%s → %s", (src, out) => expect(normalizePlotExpression(src)).toBe(out));
});

describe("T4 — the plotting window", () => {
  const w = (xMin: string, xMax: string, yMin: string, yMax: string) => readPlotWindow({ xMin, xMax, yMin, yMax });
  it("accepts numbers, negatives and decimals", () => {
    expect(w("-10", "10", "−5", "5.5")).toEqual({ ok: true, value: { xMin: -10, xMax: 10, yMin: -5, yMax: 5.5 } });
  });
  it("reversed or equal bounds say so (not «too narrow»)", () => {
    for (const r of [w("2", "1", "0", "1"), w("1", "1", "0", "1"), w("0", "1", "1", "0")]) expect(!r.ok && r.message).toMatch(/أقل من الكبرى/);
  });
  it.each([["a", "1", "0", "1"], ["1", "1", "0", "1"], ["2", "1", "0", "1"], ["0", "1", "1", "0"], ["0", "2000000", "0", "1"], ["0", "1e3", "0", "1"], ["0", "0.0000001", "0", "1"]])(
    "refuses %s..%s × %s..%s", (a, b, c, d) => { const r = w(a, b, c, d); expect(r.ok).toBe(false); if (!r.ok) expect(r.message).toMatch(/[؀-ۿ]/); });
});

describe("T4 — building the graph", () => {
  it("draws the non-empty functions as validated explicit curves", () => {
    const r = buildPlotSpec(["x^2 - 4", "", "2x + 1"], DEFAULT_WINDOW, 3, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.curves.map(c => [c.id, c.kind === "explicit" ? c.expression : ""])).toEqual([["f", "x^2 - 4"], ["h", "2*x + 1"]]);
    expect(r.names).toEqual(["f(x)", "h(x)"]);
    expect(r.spec.points).toBeUndefined();
  });
  it("reports each invalid field with the engine's Arabic message and draws nothing", () => {
    const r = buildPlotSpec(["x^2", "y + 1", "foo(x)"], DEFAULT_WINDOW, 3, false);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toBeNull();
    expect(r.errors[1]).toMatch(/y/);
    expect(r.errors[2]).toMatch(/[؀-ۿ]/);
  });
  it("the engine stays the authority: a window it refuses draws nothing", () => {
    const r = buildPlotSpec(["x"], { xMin: 5, xMax: 1, yMin: 0, yMax: 1 }, 1, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/[\u0600-\u06FF]/);
  });
  it("needs at least one function, and never reads beyond the teacher's count", () => {
    const empty = buildPlotSpec(["", ""], DEFAULT_WINDOW, 2, false);
    expect(empty.ok === false && empty.message).toMatch(/دالة واحدة على الأقل/);
    const capped = buildPlotSpec(["x", "x+1", "x+2"], DEFAULT_WINDOW, 1, false);
    expect(capped.ok && capped.spec.curves.length).toBe(1);
  });
  it("refuses an over-long expression and anything that is not an expression", () => {
    expect(buildPlotSpec(["x+".repeat(70) + "1"], DEFAULT_WINDOW, 1, false).ok).toBe(false);
    for (const bad of ["alert(1)", "constructor", "x; 1", "<b>x</b>", "x = 2"]) expect(buildPlotSpec([bad], DEFAULT_WINDOW, 1, false).ok).toBe(false);
  });
  it("with analysis: labelled roots, y-intercept, extremum and intersections from the engine", () => {
    const r = buildPlotSpec(["x^2 - 4", "x + 2"], DEFAULT_WINDOW, 2, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const labels = (r.spec.points ?? []).map(p => p.label);
    expect(labels).toEqual(expect.arrayContaining(["جذر f (-2، 0)", "جذر f (2، 0)", "جذر g (-2، 0)", "مقطع y f (0، -4)", "قيمة صغرى f (0، -4)", "تقاطع f و g (-2، 0)", "تقاطع f و g (3، 5)"]));
    expect(new Set(labels).size).toBe(labels.length);
  });
  it("with analysis: a vertical asymptote becomes a dashed reference line", () => {
    const r = buildPlotSpec(["1/(x-1)"], DEFAULT_WINDOW, 1, true);
    expect(r.ok && (r.spec.lines ?? []).map(l => [l.orientation, l.value, l.role])).toEqual([["vertical", 1, "asymptote"]]);
  });
  it("values at a point, undefined where the function is", () => {
    const r = buildPlotSpec(["sqrt(x)", "x^2"], DEFAULT_WINDOW, 2, false);
    if (!r.ok) throw new Error("fixture");
    expect(plotValuesAt(r.spec, 4)).toEqual([{ name: "f(x)", y: 2 }, { name: "g(x)", y: 16 }]);
    expect(plotValuesAt(r.spec, -1)).toEqual([{ name: "f(x)", y: null }, { name: "g(x)", y: 1 }]);
  });
  it("formats readable numbers", () => {
    expect([formatPlotNumber(2.0000000001), formatPlotNumber(-0), formatPlotNumber(1 / 3)]).toEqual(["2", "0", "0.333333"]);
  });
});
