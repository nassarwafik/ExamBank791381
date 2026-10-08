import { describe, it, expect } from "vitest";
import { convertChartKind, defaultChart, freeId, moveItem, newChartId, parseChartNumber, setBarOrientation } from "./chartEditing";
import { CHART_KINDS, validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { isVisualId } from "../visualGeometry";
import { ALL_CHARTS, donutChart, heatmapChart, horizontalStackedBar, radarChart, rainfallBar, stackedArea, temperatureLine } from "./testing/chartFixtures";

// Phase 21A.1 — authoring helpers: starter charts, kind conversion that keeps data (and says when it cannot), the numeric-cell parser.
const ok = (c: ChartSpecV1) => { const r = validateChartSpec(c); expect(r.issues).toEqual([]); return r.ok ? r.value : c; };

describe("21A1-ED1 ids and starter charts", () => {
  it("freeId returns the first free readable id; newChartId is a valid, distinct visual id", () => {
    expect(freeId("c", ["c1", "c2", "c4"])).toBe("c3");
    expect(freeId("s", [])).toBe("s1");
    const ids = new Set(Array.from({ length: 500 }, () => newChartId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(isVisualId(id), id).toBe(true);
  });
  it("the starter chart of every kind is structurally valid", () => {
    for (const k of CHART_KINDS) expect(validateChartSpec(defaultChart(k, "x")).issues, k).toEqual([]);
  });
});

describe("21A1-ED2 kind conversion", () => {
  it("never throws, always yields the target kind, and keeps id / title / description / source / options", () => {
    for (const c of ALL_CHARTS()) for (const k of CHART_KINDS) {
      const { spec } = convertChartKind(c, k);
      expect(spec.kind).toBe(k);
      expect([spec.id, spec.title, spec.description, spec.source, spec.animation, spec.palette]).toEqual([c.id, c.title, c.description, c.source, c.animation, c.palette]);
    }
  });
  it("a conversion reported lossless yields a VALID chart (nothing for the author to repair)", () => {
    for (const c of ALL_CHARTS()) for (const k of CHART_KINDS) {
      const r = convertChartKind(c, k);
      if (!r.lossy) expect(validateChartSpec(r.spec).issues, c.id + " → " + k).toEqual([]);
    }
  });
  it("between bar / line / area / combo nothing is lost: categories, every series' values (missing values included), axes and reference lines round-trip", () => {
    const start = rainfallBar() as CategoryChartSpec;
    let cur: ChartSpecV1 = start;
    for (const k of ["line", "area", "combo", "bar"] as const) { const r = convertChartKind(cur, k); expect(r.lossy).toBe(false); cur = ok(r.spec); }
    const back = cur as CategoryChartSpec;
    expect(back.categories).toEqual(start.categories);
    expect(back.series.map(s => s.values)).toEqual(start.series.map(s => s.values));
    expect([back.xAxis, back.yAxis, back.referenceLines]).toEqual([start.xAxis, start.yAxis, start.referenceLines]);
    const t = convertChartKind(temperatureLine(), "combo");
    expect(t.lossy).toBe(false);
    expect((ok(t.spec) as CategoryChartSpec).series.map(s => [s.values, s.mark])).toEqual([[[21.5, 23, null, -2, 0], "bar"], [[12, 13, 11, -8, -4], "line"]]);
  });
  it("stacking survives bar ⇄ area; a horizontal bar's numeric axis moves to y when it becomes another kind", () => {
    expect((convertChartKind(stackedArea(), "bar").spec as CategoryChartSpec).stacked).toBe(true);
    const h = convertChartKind(horizontalStackedBar(), "line").spec as CategoryChartSpec;
    expect(ok(h as ChartSpecV1)).toBeTruthy();
    expect([h.xAxis, h.yAxis]).toEqual([undefined, { label: "Votes", min: 0 }]);
  });
  it("category ⇄ heat map and pie ⇄ bar are lossless round trips; radar → category keeps every value", () => {
    const cat = temperatureLine() as CategoryChartSpec;
    const hm = convertChartKind(cat, "heatmap");
    expect(hm.lossy).toBe(true);                                                     // the value-axis label "Temperature" has no place in a heat map
    expect(convertChartKind({ ...cat, yAxis: { unit: "°C" } } as ChartSpecV1, "heatmap").lossy).toBe(false);   // the unit travels
    const back = convertChartKind(ok(hm.spec), "line").spec as CategoryChartSpec;
    expect([back.categories, back.series.map(s => [s.id, s.label, s.values])]).toEqual([cat.categories, cat.series.map(s => [s.id, s.label, s.values])]);
    const pie = donutChart() as Extract<ChartSpecV1, { kind: "pie" }>;
    const bar = convertChartKind(pie, "bar");
    expect(bar.lossy).toBe(false);
    const pie2 = convertChartKind(ok(bar.spec), "pie");
    expect(pie2.lossy).toBe(false);
    expect((pie2.spec as typeof pie).slices).toEqual(pie.slices);
    expect((convertChartKind(radarChart(), "bar").spec as CategoryChartSpec).series.map(s => s.values)).toEqual([[8, 6, 7, 9], [9, 8, 6, 7]]);
    expect(convertChartKind(heatmapChart(), "bar").lossy).toBe(false);
  });
  it("a conversion that cannot hold the data says so (lossy) — several series or missing / negative values into a pie, data into a scatter / histogram / box plot", () => {
    expect(convertChartKind(temperatureLine(), "pie").lossy).toBe(true);
    expect(convertChartKind(rainfallBar(), "pie").lossy).toBe(true);                // its reference line and axis labels have no place in a pie
    const { referenceLines: _r, xAxis: _x, ...plainRain } = rainfallBar() as CategoryChartSpec;
    expect(convertChartKind({ ...plainRain, yAxis: { unit: "mm" } } as ChartSpecV1, "pie").lossy).toBe(false);
    for (const k of ["scatter", "histogram", "boxplot"] as const) expect(convertChartKind(rainfallBar(), k).lossy, k).toBe(true);
    expect(convertChartKind(temperatureLine(), "radar").lossy).toBe(true);
  });
});

describe("21A1-ED3 numeric cells, orientation, reorder", () => {
  it("parseChartNumber: empty → null (missing, never 0); numbers with Arabic-Indic / Persian digits, ٫ and − are accepted; anything else is undefined", () => {
    const cases: [string, number | null | undefined][] = [
      ["", null], ["   ", null], ["12", 12], ["-2.5", -2.5], [".5", 0.5], ["5.", 5], ["1e3", 1000], ["-0", 0], ["١٢٫٥", 12.5], ["۳۴", 34], ["−7", -7],
      ["1,000", undefined], ["12a", undefined], ["--1", undefined], ["Infinity", undefined], ["NaN", undefined], ["0x10", undefined], ["1e999", undefined], ["٫", undefined]
    ];
    for (const [t, want] of cases) expect(parseChartNumber(t), JSON.stringify(t)).toBe(want);
    expect(Object.is(parseChartNumber("-0"), 0)).toBe(true);
  });
  it("orientation change moves the numeric axis with the bars and keeps only the category axis label", () => {
    const v = rainfallBar() as CategoryChartSpec;
    const h = setBarOrientation(v, "horizontal");
    expect([h.orientation, h.xAxis, h.yAxis]).toEqual(["horizontal", { label: "الهطول", unit: "mm" }, { label: "الشهر" }]);
    expect(validateChartSpec(h).issues).toEqual([]);
    const back = setBarOrientation(h, "vertical");
    expect([back.orientation, back.xAxis, back.yAxis]).toEqual([undefined, v.xAxis, v.yAxis]);
    expect(setBarOrientation(v, "vertical")).toBe(v);
  });
  it("moveItem swaps neighbours and is a no-op at the ends", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});
