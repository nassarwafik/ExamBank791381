import { describe, it, expect } from "vitest";
import { validateChartSpec, CHART_KINDS, CHART_KEYS, CHART_LIMITS, CHART_SPEC_VERSION, type ChartSpecV1 } from "./chartSpec";
import { chartTargets, chartTargetKinds, chartDataTable, chartSummary, chartPlainText, CHART_TARGET_KINDS } from "./chartData";
import * as F from "./testing/chartFixtures";

// Phase 21A.1 — ChartSpecV1, ExamBank's own declarative chart contract: closed kinds, exact keys, stable ids, finite numbers, explicit missing
// values, bounded text / collections / size, deterministic canonical rebuild, and a validator that never throws on hostile input.
// Fail-first on the baseline (ff13899): the module does not exist (the whole suite fails to import).
const ok = (c: unknown): ChartSpecV1 => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value; };
const codes = (c: unknown) => { const r = validateChartSpec(c); return r.ok ? [] : r.issues.map(i => i.code); };
const tag = (c: unknown) => { try { return String(JSON.stringify(c)).slice(0, 120); } catch { return "(unprintable)"; } };
const refused = (c: unknown, code?: string) => { const r = validateChartSpec(c); expect(r.ok, tag(c)).toBe(false); if (code) expect(codes(c)).toContain(code); };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const with_ = (base: ChartSpecV1, patch: Record<string, unknown>) => ({ ...clone(base), ...patch });

describe("21A1-C1 identity: a versioned, closed, ExamBank-owned contract", () => {
  it("version 1; the closed kind list covers the 13 families (bar/column/horizontal/stacked, line, area/stacked, combo, pie/donut, scatter, histogram, radar, boxplot, heatmap)", () => {
    expect(CHART_SPEC_VERSION).toBe(1);
    expect([...CHART_KINDS]).toEqual(["bar", "line", "area", "combo", "pie", "scatter", "histogram", "radar", "boxplot", "heatmap"]);
    expect(Object.isFrozen(CHART_KINDS) && Object.isFrozen(CHART_KEYS) && Object.isFrozen(CHART_LIMITS)).toBe(true);
    for (const k of CHART_KINDS) expect(CHART_KEYS[k].slice(0, 9)).toEqual(["version", "id", "kind", "title", "description", "source", "animation", "palette", "legend"]);
  });
  it("every fixture kind is accepted and rebuilds to an equal canonical value (idempotent)", () => {
    for (const c of F.ALL_CHARTS()) { const v = ok(c); expect(v, c.id).toEqual(c); expect(ok(v)).toEqual(v); }
  });
  it("the canonical rebuild is a fresh object in a fixed key order — never the input object, never a spread of unknown data", () => {
    const input = F.rainfallBar();
    const v = ok(input);
    expect(v).not.toBe(input);
    expect((v as { categories: unknown[] }).categories[0]).not.toBe((input as { categories: unknown[] }).categories[0]);
    const shuffled = Object.fromEntries(Object.entries(clone(input)).reverse());
    expect(Object.keys(ok(shuffled))).toEqual(Object.keys(v));
  });
  it("negative zero is stored as 0; decimals, negatives and zero are kept exactly", () => {
    const v = ok(with_(F.temperatureLine(), { series: [{ id: "tmax", label: "Max", values: [-0, 0.1, -2.75, 0, null] }] })) as { series: { values: unknown[] }[] };
    expect(Object.is(v.series[0].values[0], 0)).toBe(true);
    expect(v.series[0].values).toEqual([0, 0.1, -2.75, 0, null]);
  });
  it("a missing value is an explicit null (kept, never 0); kinds without missing values refuse null", () => {
    const v = ok(F.temperatureLine()) as { series: { values: unknown[] }[] };
    expect(v.series[0].values[2]).toBeNull();
    refused(with_(F.radarChart(), { series: [{ id: "a", label: "a", values: [1, null, 2, 3] }] }), "CHART_VALUE_MISSING");
    refused(with_(F.donutChart(), { slices: [{ id: "a", label: "a", value: null }] }), "CHART_NUMBER_INVALID");
  });
});

describe("21A1-C2 hostile and malformed input is refused (never repaired, never thrown)", () => {
  it("not an object / wrong version / unknown kind / raw ECharts option", () => {
    for (const v of [null, undefined, 42, "chart", [], () => 1]) refused(v, "CHART_INVALID");
    refused(with_(F.rainfallBar(), { version: 2 }), "CHART_VERSION");
    refused(with_(F.rainfallBar(), { kind: "candlestick" }), "CHART_KIND");
    refused(with_(F.rainfallBar(), { kind: "Bar" }), "CHART_KIND");
    refused({ xAxis: { type: "category", data: ["a"] }, yAxis: { type: "value" }, series: [{ type: "bar", data: [1] }] }, "CHART_VERSION");
    refused({ version: 1, kind: "bar", id: "x", title: "t", description: "d", categories: [{ id: "a", label: "a" }], series: [{ id: "s", label: "s", values: [1] }], option: { series: [] } }, "CHART_UNKNOWN_KEY");
  });
  it("executable / engine-specific fields are unknown keys: formatter, tooltip, graphic, dataset, renderItem, on*, raw style", () => {
    for (const k of ["formatter", "tooltip", "graphic", "dataset", "renderItem", "onclick", "itemStyle", "textStyle", "backgroundColor", "series_raw", "echarts", "transform"]) refused(with_(F.rainfallBar(), { [k]: "x" }), "CHART_UNKNOWN_KEY");
    refused(with_(F.rainfallBar(), { series: [{ id: "rain", label: "r", values: F.RAINFALL_2020, formatter: "{a}" }] }), "CHART_UNKNOWN_KEY");
    refused(with_(F.rainfallBar(), { xAxis: { label: "x", axisLabel: { formatter: "function(){}" } } }), "CHART_UNKNOWN_KEY");
  });
  it("prototype keys anywhere are refused (own __proto__ / constructor / prototype)", () => {
    const evil = JSON.parse('{"version":1,"id":"x","kind":"pie","title":"t","description":"d","slices":[{"id":"a","label":"a","value":1,"__proto__":{"polluted":1}}]}');
    refused(evil, "CHART_UNKNOWN_KEY");
    refused(JSON.parse(JSON.stringify(F.donutChart()).replace('"donut":true', '"constructor":{"prototype":{}}')), "CHART_UNKNOWN_KEY");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("numbers: NaN, ±Infinity, numeric strings, booleans, objects and absurd magnitudes are refused", () => {
    for (const bad of [NaN, Infinity, -Infinity, "12", true, {}, [], 1e16, -1e16]) refused(with_(F.rainfallBar(), { series: [{ id: "rain", label: "r", values: [bad, ...F.RAINFALL_2020.slice(1)] }] }));
    refused(with_(F.rainfallBar(), { series: [{ id: "rain", label: "r", values: [NaN, ...F.RAINFALL_2020.slice(1)] }] }), "CHART_NUMBER_INVALID");
    expect(validateChartSpec(with_(F.rainfallBar(), { series: [{ id: "rain", label: "r", values: [1e15, ...F.RAINFALL_2020.slice(1)] }] })).ok).toBe(true);
  });
  it("structure: mismatched value counts, empty series, all-missing series, malformed series, duplicate ids and duplicate labels", () => {
    refused(with_(F.rainfallBar(), { series: [{ id: "rain", label: "r", values: [1, 2] }] }), "CHART_VALUES_LENGTH");
    refused(with_(F.rainfallBar(), { series: [] }), "CHART_EMPTY");
    refused(with_(F.rainfallBar(), { series: [{ id: "rain", label: "r", values: Array(12).fill(null) }] }), "CHART_SERIES_EMPTY");
    refused(with_(F.rainfallBar(), { series: [{ id: "rain", label: "r" }] }), "CHART_INVALID");
    refused(with_(F.rainfallBar(), { series: "rain" }), "CHART_INVALID");
    const dupCat = clone(F.rainfallBar()) as { categories: { id: string }[] }; dupCat.categories[1].id = "jan";
    refused(dupCat, "CHART_ID_DUPLICATE");
    const dupLabel = clone(F.rainfallBar()) as { categories: { label: string }[] }; dupLabel.categories[1].label = " يناير ";
    refused(dupLabel, "CHART_LABEL_DUPLICATE");
    refused(with_(F.temperatureLine(), { series: [{ id: "a", label: "A", values: [1, 2, 3, 4, 5] }, { id: "a", label: "B", values: [1, 2, 3, 4, 5] }] }), "CHART_ID_DUPLICATE");
    refused(with_(F.scatterChart(), { series: [{ id: "s", label: "s", points: [{ id: "p", x: 1, y: 1 }, { id: "p", x: 2, y: 2 }] }] }), "CHART_ID_DUPLICATE");
  });
  it("ids: stable ASCII ids only (no spaces, unicode look-alikes, slashes, prototype names, empty, over 32)", () => {
    for (const bad of ["", "1abc", "a b", "a/b", "аbc", "__proto__", "constructor", "x".repeat(33), 7, null]) refused(with_(F.rainfallBar(), { id: bad }), bad === "__proto__" || bad === "constructor" ? undefined : "CHART_ID_INVALID");
    expect(validateChartSpec(with_(F.rainfallBar(), { id: "a".repeat(32) })).ok).toBe(true);
  });
  it("text: markup, script URLs, control and bidi-override characters are refused; formatter-looking braces and units stay literal text", () => {
    for (const bad of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<svg onload=alert(1)>", "javascript:alert(1)", "a\u0007b", "‮evil", "⁧iso⁩", "<div>x</div>"]) refused(with_(F.rainfallBar(), { title: bad }));
    refused(with_(F.rainfallBar(), { title: "<img src=x onerror=alert(1)>" }), "CHART_TEXT_MARKUP");
    refused(with_(F.rainfallBar(), { title: "‮evil" }), "CHART_TEXT_CONTROL");
    for (const fine of ["{a}{b}{c}", "{@score}", "x < 5 & y > 3", "الكتلة (kg) — 5 m/s²", "سطر أول\nسطر ثانٍ", "‏محاذاة"]) expect(validateChartSpec(with_(F.rainfallBar(), { title: fine })).ok, fine).toBe(true);
    refused(with_(F.rainfallBar(), { title: "   " }), "CHART_TEXT_EMPTY");
    refused(with_(F.rainfallBar(), { description: "" }), "CHART_TEXT_EMPTY");
  });
  it("enums are closed: animation / palette / legend / orientation / combo marks", () => {
    refused(with_(F.rainfallBar(), { animation: "fast" }), "CHART_ENUM_INVALID");
    refused(with_(F.rainfallBar(), { palette: "#ff0000" }), "CHART_ENUM_INVALID");
    refused(with_(F.rainfallBar(), { legend: "top" }), "CHART_ENUM_INVALID");
    refused(with_(F.rainfallBar(), { orientation: "diagonal" }), "CHART_ENUM_INVALID");
    refused(with_(F.comboChart(), { series: [{ id: "a", label: "a", values: [1, 2, 3, 4] }] }), "CHART_ENUM_INVALID");
    refused(with_(F.temperatureLine(), { stacked: true }), "CHART_UNKNOWN_KEY");
    refused(with_(F.temperatureLine(), { orientation: "horizontal" }), "CHART_UNKNOWN_KEY");
  });
  it("kind-specific semantics: pie non-negative with a positive sum; histogram contiguous ascending bins; radar values within axis max; boxplot five-number order; axis min < max", () => {
    refused(with_(F.donutChart(), { slices: [{ id: "a", label: "a", value: -1 }, { id: "b", label: "b", value: 2 }] }), "CHART_VALUE_NEGATIVE");
    refused(with_(F.donutChart(), { slices: [{ id: "a", label: "a", value: 0 }] }), "CHART_SERIES_EMPTY");
    refused(with_(F.histogramChart(), { bins: [{ id: "a", start: 0, end: 10, count: 1 }, { id: "b", start: 12, end: 20, count: 1 }] }), "CHART_BIN_GAP");
    refused(with_(F.histogramChart(), { bins: [{ id: "a", start: 0, end: 10, count: 1 }, { id: "b", start: 5, end: 20, count: 1 }] }), "CHART_BIN_GAP");
    refused(with_(F.histogramChart(), { bins: [{ id: "a", start: 10, end: 10, count: 1 }] }), "CHART_BIN_RANGE");
    refused(with_(F.histogramChart(), { bins: [{ id: "a", start: 0, end: 10, count: -1 }] }), "CHART_VALUE_NEGATIVE");
    refused(with_(F.radarChart(), { series: [{ id: "a", label: "a", values: [11, 1, 1, 1] }] }), "CHART_VALUE_RANGE");
    refused(with_(F.radarChart(), { axes: [{ id: "a", label: "a", max: 10 }, { id: "b", label: "b", max: 10 }] }), "CHART_EMPTY");
    refused(with_(F.boxplotChart(), { boxes: [{ id: "a", label: "a", min: 5, q1: 4, median: 6, q3: 7, max: 8 }] }), "CHART_BOX_ORDER");
    refused(with_(F.rainfallBar(), { yAxis: { label: "y", min: 10, max: 10 } }), "CHART_AXIS_RANGE");
    refused(with_(F.rainfallBar(), { xAxis: { label: "x", unit: "u" } }), "CHART_UNKNOWN_KEY");                         // a category axis is labels only
    refused(with_(F.heatmapChart(), { values: [[1, 2], [3, 4]] }), "CHART_VALUES_LENGTH");
    expect(validateChartSpec(with_(F.scatterChart(), { series: [{ id: "s", label: "s", points: [{ id: "b", x: 3, y: 1 }, { id: "a", x: 1, y: 9 }] }] })).ok).toBe(true);   // unsorted scatter is fine
  });
});

describe("21A1-C3 explicit resource limits (exact boundaries)", () => {
  const cats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "c" + i, label: "c" + i }));
  it("categories 60 / 61; series 8 / 9; data points 480 / 481", () => {
    const bar = (nc: number, ns: number) => ({ version: 1, id: "big", kind: "bar", title: "t", description: "d", categories: cats(nc), series: Array.from({ length: ns }, (_, j) => ({ id: "s" + j, label: "s" + j, values: Array(nc).fill(1) })) });
    expect(validateChartSpec(bar(60, 8)).ok).toBe(true);                                                              // 480 points
    refused(bar(61, 1), "CHART_LIMIT");
    refused(bar(10, 9), "CHART_LIMIT");
    expect(60 * 8).toBe(CHART_LIMITS.dataPoints);
    refused(bar(0, 1), "CHART_EMPTY");
  });
  it("scatter 500 / 501 points across series; slices 24 / 25; bins 40 / 41; radar axes 3..12; boxes 24 / 25; heatmap 24 × 24", () => {
    const sc = (n: number) => ({ version: 1, id: "s", kind: "scatter", title: "t", description: "d", series: [{ id: "a", label: "a", points: Array.from({ length: n }, (_, i) => ({ id: "p" + i, x: i, y: i })) }] });
    expect(validateChartSpec(sc(500)).ok).toBe(true);
    refused(sc(501), "CHART_LIMIT");
    const pie = (n: number) => ({ version: 1, id: "p", kind: "pie", title: "t", description: "d", slices: Array.from({ length: n }, (_, i) => ({ id: "s" + i, label: "s" + i, value: 1 })) });
    expect(validateChartSpec(pie(24)).ok).toBe(true); refused(pie(25), "CHART_LIMIT");
    const hist = (n: number) => ({ version: 1, id: "h", kind: "histogram", title: "t", description: "d", bins: Array.from({ length: n }, (_, i) => ({ id: "b" + i, start: i, end: i + 1, count: 1 })) });
    expect(validateChartSpec(hist(40)).ok).toBe(true); refused(hist(41), "CHART_LIMIT");
    const radar = (n: number) => ({ version: 1, id: "r", kind: "radar", title: "t", description: "d", axes: Array.from({ length: n }, (_, i) => ({ id: "a" + i, label: "a" + i, max: 5 })), series: [{ id: "s", label: "s", values: Array(n).fill(1) }] });
    expect(validateChartSpec(radar(3)).ok && validateChartSpec(radar(12)).ok).toBe(true); refused(radar(13), "CHART_LIMIT"); refused(radar(2), "CHART_EMPTY");
    const heat = (n: number) => ({ version: 1, id: "h", kind: "heatmap", title: "t", description: "d", columns: cats(n), rows: cats(n), values: Array.from({ length: n }, () => Array(n).fill(1)) });
    expect(validateChartSpec(heat(24)).ok).toBe(true); refused(heat(25), "CHART_LIMIT");
  });
  it("text bounds: title 160 / 161, description 1000 / 1001, labels 80 / 81, units 24 / 25; reference lines 4 / 5", () => {
    expect(validateChartSpec(with_(F.rainfallBar(), { title: "t".repeat(160), description: "d".repeat(1000) })).ok).toBe(true);
    refused(with_(F.rainfallBar(), { title: "t".repeat(161) }), "CHART_LIMIT");
    refused(with_(F.rainfallBar(), { description: "d".repeat(1001) }), "CHART_LIMIT");
    refused(with_(F.rainfallBar(), { yAxis: { label: "l".repeat(81) } }), "CHART_LIMIT");
    refused(with_(F.rainfallBar(), { yAxis: { unit: "u".repeat(25) } }), "CHART_LIMIT");
    const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "l" + i, value: i, label: "L" + i }));
    expect(validateChartSpec(with_(F.rainfallBar(), { referenceLines: lines(4) })).ok).toBe(true);
    refused(with_(F.rainfallBar(), { referenceLines: lines(5) }), "CHART_LIMIT");
  });
  it("pathological inputs are refused quickly and never throw (huge arrays, deep nesting, cyclic-looking data)", () => {
    const t0 = Date.now();
    refused(with_(F.rainfallBar(), { categories: Array.from({ length: 100000 }, (_, i) => ({ id: "c" + i, label: "x" })) }), "CHART_LIMIT");
    refused(with_(F.rainfallBar(), { series: Array.from({ length: 10000 }, (_, i) => ({ id: "s" + i, label: "s", values: [] })) }), "CHART_LIMIT");
    let deep: unknown = 1; for (let i = 0; i < 5000; i++) deep = { a: deep };
    refused(with_(F.rainfallBar(), { categories: [deep] }));
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("random garbage never throws (2,000 seeded documents over the contract alphabet)", () => {
    let seed = 2101;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const atoms: unknown[] = [null, 0, -0, 1.5, -3, NaN, Infinity, "", "a", "<b>", "__proto__", true, [], {}, F.RAINFALL_2020, ...CHART_KINDS];
    const keys = ["version", "id", "kind", "title", "description", "categories", "series", "slices", "bins", "axes", "boxes", "columns", "rows", "values", "points", "label", "value", "x", "y", "__proto__", "constructor"];
    const gen = (d: number): unknown => { if (d > 3 || r() < 0.3) return atoms[Math.floor(r() * atoms.length)]; if (r() < 0.5) return Array.from({ length: Math.floor(r() * 4) }, () => gen(d + 1)); const o: Record<string, unknown> = {}; for (let i = 0; i < 4; i++) o[keys[Math.floor(r() * keys.length)]] = gen(d + 1); return o; };
    for (let i = 0; i < 2000; i++) { const doc = { version: 1, ...(gen(0) as object) }; expect(() => validateChartSpec(doc)).not.toThrow(); }
  });
});

describe("21A1-C4 semantic targets, data table and summary derive from the ONE spec", () => {
  it("target kinds per chart kind (heatmap is not a V1 answer surface)", () => {
    expect([...CHART_TARGET_KINDS]).toEqual(["category", "series", "datum", "point", "bin"]);
    const kinds = Object.fromEntries(F.ALL_CHARTS().map(c => [c.id, [...chartTargetKinds(ok(c))]]));
    expect(kinds).toMatchObject({ "rainfall-2020": ["category", "series", "datum"], budget: ["category"], "height-mass": ["point", "series"], scores: ["bin"], skills: ["series"], "class-scores": ["category"], activity: [] });
  });
  it("datum keys are seriesId/categoryId for present values only; single-series labels are the category; order is the chart's own order", () => {
    const line = ok(F.temperatureLine());
    const datums = chartTargets(line, "datum");
    expect(datums.map(d => d.key)).toEqual(["tmax/mon", "tmax/tue", "tmax/thu", "tmax/fri", "tmin/mon", "tmin/tue", "tmin/wed", "tmin/thu", "tmin/fri"]);
    expect(datums[0]).toEqual({ key: "tmax/mon", label: "Max °C — MON", kind: "datum", seriesId: "tmax", categoryId: "mon", value: 21.5 });
    const rain = ok(F.rainfallBar());
    expect(chartTargets(rain, "datum")[9]).toMatchObject({ key: "rain/oct", label: "أكتوبر", value: 135 });
    expect(chartTargets(rain, "category").map(c => c.key)).toEqual(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]);
    expect(chartTargets(ok(F.scatterChart()), "point").map(p => p.key)).toEqual(["p1", "p3", "p2", "out"]);
    expect(chartTargets(ok(F.histogramChart()), "bin").map(b => [b.key, b.label])).toEqual([["b0", "[0 – 10)"], ["b1", "[10 – 20)"], ["b2", "[20 – 30)"], ["b3", "[30 – 40)"]]);
    expect(chartTargets(ok(F.donutChart()), "datum")).toEqual([]);                                                // unsupported kind → nothing selectable
  });
  it("the accessible data table carries every value (missing stays null) with the same labels", () => {
    const t = chartDataTable(ok(F.temperatureLine()));
    expect(t.columns).toEqual(["Day", "Max °C", "Min °C"]);
    expect(t.rows[2]).toEqual({ header: "WED", cells: [null, 11] });
    expect(chartDataTable(ok(F.rainfallBar())).rows.map(r => r.cells[0])).toEqual(F.RAINFALL_2020);
    for (const c of F.ALL_CHARTS()) expect(chartDataTable(ok(c)).rows.length, c.id).toBeGreaterThan(0);
  });
  it("summary and plain text name the kind, sizes, title, description and source", () => {
    expect(chartSummary(ok(F.rainfallBar()))).toBe("رسم بالأعمدة — 12 فئات، 1 سلسلة");
    expect(chartSummary(ok(F.donutChart()))).toBe("رسم حلقي — 3 شرائح");
    expect(chartPlainText(ok(F.rainfallBar()))).toContain("الهطول الشهري — 2020\nكمية الأمطار");
  });
});
