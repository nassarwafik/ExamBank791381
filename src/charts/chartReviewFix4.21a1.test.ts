import { describe, it, expect } from "vitest";
import { validateChartSpec, type CategoryChartSpec, type ChartSpecV1 } from "./chartSpec";
import { buildEngineOption, chartHeight, fitText, widthLayout } from "./echartsAdapter";
import { defaultChartTokens } from "./chartTheme";
import { comboChart, histogramChart, radarChart, rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 4 (round-4 lane B): no label wider than its box (pie, B4-1), radar axis names inside the canvas (B4-2), value
// labels that never overlap or leave the canvas (B4-3). A deterministic fake measurement: 6 px per character.
const canon = (c: unknown) => { const r = validateChartSpec(c); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.value as ChartSpecV1; };
const ISO = /[⁦-⁩]/g;
const measure = (t: string) => Array.from(t.replace(ISO, "")).length * 6;
const ctx = { tokens: defaultChartTokens(), animation: "none" as const, compact: false };
const build = (spec: ChartSpecV1, over: Record<string, unknown> = {}) => buildEngineOption(spec, { ...ctx, measure, ...over }) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("21A1-RB21 a pie label is never wider than its 140 px box (round-4 finding B4-1)", () => {
  const pie = (unit?: string) => canon({ version: 1, id: "p", kind: "pie", title: "الطلاب", description: "توزيع الطلاب على المراحل", ...(unit ? { unit } : {}), valueLabels: true,
    slices: [{ id: "a", label: "المرحلة الابتدائية", value: 12500 }, { id: "b", label: "المرحلة المتوسطة", value: 9800 }, { id: "c", label: "المرحلة الثانوية", value: 7600 }, { id: "d", label: "رياض الأطفال", value: 4300 }] });
  const labels = (spec: ChartSpecV1) => { const f = build(spec).series[0].label.formatter as (p: { dataIndex: number }) => string; return [0, 1, 2, 3].map(i => f({ dataIndex: i })); };
  it("a value whose unit leaves the name no room takes its own line: every line within 140 px, the value first on its line", () => {
    for (const unit of ["طالب وطالبة", "ألف دينار كويتي سنويًا"]) for (const l of labels(pie(unit))) {
      const lines = l.split("\n");
      expect(lines.length, l).toBe(2);
      for (const line of lines) expect(measure(line), line).toBeLessThanOrEqual(140);
      expect(lines[1].replace(ISO, "")).toMatch(/^\d/);
    }
  });
  it("a value that leaves the name at least 40 px keeps one line and the name is cut (unchanged)", () => {
    for (const l of labels(pie())) { expect(l.split("\n").length).toBe(1); expect(measure(l)).toBeLessThanOrEqual(140); }
  });
});

describe("21A1-RB22 radar axis names stay inside the canvas (round-4 finding B4-2)", () => {
  const skills = ["التفكير الناقد", "حل المشكلات", "التواصل الكتابي", "العمل الجماعي", "الثقافة الرقمية", "الإبداع والابتكار"];
  const radar = (labels: string[]) => canon({ ...radarChart(), axes: labels.map((label, i) => ({ id: "a" + i, label, max: 10 })), series: [{ id: "s", label: "علي", values: labels.map(() => 5) }] });
  it("with the stage width known, radius + gap + name width fit each half of the canvas, and every name is cut to that width", () => {
    for (const [w, compact] of [[320, true], [360, true], [600, false], [1280, false]] as const) {
      for (const names of [skills, skills.map((_, i) => "مهارة التفكير الناقد وحل المشكلات " + (i + 1))]) {
        const r = build(radar(names), { width: w, compact }).radar;
        expect(typeof r.radius, w + "").toBe("number");
        expect(r.radius + r.axisNameGap + r.axisName.width + 8, w + "").toBeLessThanOrEqual(w / 2);
        for (const n of names) expect(measure(r.axisName.formatter(n)), n).toBeLessThanOrEqual(r.axisName.width);
      }
    }
  });
  it("the radius is never less than half its default; without a width the default radius and the engine's truncation", () => {
    const r = build(radar(skills.map(s => s + " " + s)), { width: 320, compact: true }).radar;
    expect(r.radius).toBeGreaterThanOrEqual(Math.floor(0.58 * 300 / 2 / 2));
    const none = build(radar(skills)).radar;
    expect(none.radius).toBe("66%");
    expect(none.axisName.overflow).toBe("none");                                    // measured: the formatter cuts
  });
  it("the radar layout is part of the width layout (a width change re-applies it)", () => {
    const spec = radar(skills);
    expect(widthLayout(build(spec, { width: 320, compact: true }) as never)).not.toBe(widthLayout(build(spec, { width: 640 }) as never));
  });
});

describe("21A1-RB23 value labels never overlap one another and never leave the canvas (round-4 finding B4-3)", () => {
  const big = (over: Record<string, unknown> = {}) => { const { xAxis: _x, yAxis: _y, referenceLines: _r, ...rest } = rainfallBar() as CategoryChartSpec; void _x; void _y; void _r;
    return canon({ ...rest, categories: rest.categories.slice(0, 8), valueLabels: true, series: [{ id: "s", label: "المبيعات", values: Array.from({ length: 8 }, (_, i) => 1234567 + i * 98765) }], ...over }); };
  it("overlapping value labels are hidden (the table, the tooltip and the list carry every value)", () => {
    expect(build(big(), { width: 360, compact: true }).series[0].labelLayout).toEqual({ hideOverlap: true });
    expect(build(canon({ ...histogramChart(), valueLabels: true }), { width: 360, compact: true }).series[0].labelLayout).toEqual({ hideOverlap: true });
  });
  it("the plot keeps room on its right for the widest value label: half of it beside the last column, all of it beyond a horizontal bar", () => {
    const widest = measure("1925922");
    expect(build(big(), { width: 360, compact: true }).grid.right).toBeGreaterThanOrEqual(Math.ceil(widest / 2) + 4);
    expect(build(big({ orientation: "horizontal" }), { width: 600 }).grid.right).toBeGreaterThanOrEqual(widest + 6);
    expect(build(canon(rainfallBar()), { width: 360, compact: true }).grid.right).toBe(12);                // no value labels: unchanged
  });
  const LONG = "متوسط المبيعات السنوي المستهدف للفروع الرئيسية";
  const ref = [{ id: "r1", value: 1500000, label: LONG }];
  const refLabel = (o: Record<string, any>) => o.series[0].markLine.label; // eslint-disable-line @typescript-eslint/no-explicit-any
  it("with value labels above the columns, a reference line's label sits beyond the plot's right edge: cut to its cap, past the last column's label room, in a reserved margin", () => {
    for (const [w, compact, cap] of [[320, true, 64], [360, true, 64], [600, false, 120], [1280, false, 120]] as const) {
      const o = build(big({ referenceLines: ref }), { width: w, compact }), l = refLabel(o);
      expect(l.position, w + "").toBe("end");
      const shown = l.formatter({ dataIndex: 0 }) as string;
      expect(measure(shown), w + "").toBeLessThanOrEqual(cap);
      expect(shown.replace(ISO, "").endsWith("…")).toBe(true);
      expect(l.distance, w + "").toBeGreaterThanOrEqual(5 + Math.ceil(measure("1925922") / 2) + 4);   // past the last column's value label
      expect(o.grid.right, w + "").toBeGreaterThanOrEqual(l.distance + 8 + measure(shown));             // its padded box inside the margin
    }
    const short = refLabel(build(big({ referenceLines: [{ id: "r1", value: 1500000, label: "الهدف" }] }), { width: 1280 }));
    expect(short.formatter({ dataIndex: 0 }).replace(ISO, "")).toBe("الهدف");                          // a short label is never cut
  });
  it("without value labels, on horizontal bars and beside a secondary axis, the reference label stays inside the plot (unchanged)", () => {
    expect(refLabel(build(canon(rainfallBar()), { width: 360, compact: true })).position).toBe("insideEndTop");
    expect(refLabel(build(big({ referenceLines: ref, orientation: "horizontal" }), { width: 600 })).position).toBe("insideEndTop");
    const combo = canon({ ...comboChart(), valueLabels: true, referenceLines: [{ id: "r", value: 110, label: "الهدف" }] });
    expect(refLabel(build(combo, { width: 600 })).position).toBe("insideEndTop");
    expect(build(canon(rainfallBar()), { width: 360, compact: true }).grid.right).toBe(12);
  });
  it("the first column's value label never lies on the value axis's labels: they step away by what half a slot does not cover", () => {
    const room = Math.ceil(measure("1925922") / 2) + 4;
    for (const [w, compact] of [[200, true], [320, true], [360, true]] as const) {
      const o = build(big(), { width: w, compact });
      expect(o.yAxis.axisLabel.margin - 8, w + "").toBeGreaterThanOrEqual(room - 8 - w / (2 * 8));     // a slot is at most width / count
    }
    expect(build(big(), { width: 200, compact: true }).yAxis.axisLabel.margin).toBeGreaterThan(14);      // beyond the rotation's 6 px
    expect(build(big(), { compact: true }).yAxis.axisLabel.margin - 8).toBeGreaterThanOrEqual(room - 8); // unmeasured: the full room
    expect(build(big(), { width: 1280 }).yAxis.axisLabel.margin).toBeUndefined();                         // a wide slot covers it: unchanged
    const o = build(big(), { width: 320, compact: true });                                                // the gap is part of the width layout
    expect(widthLayout({ ...o, yAxis: { ...o.yAxis, axisLabel: { ...o.yAxis.axisLabel, margin: 40 } } } as never)).not.toBe(widthLayout(o as never));
  });
  it("a rotated category axis: the value axis's lowest label steps 6 px away from the first rotated label; flat axes are unchanged", () => {
    const { referenceLines: _r, ...plain } = rainfallBar() as CategoryChartSpec; void _r;
    const many = canon({ ...plain, categories: Array.from({ length: 30 }, (_, i) => ({ id: "d" + i, label: "اليوم " + (i + 1) })), series: [{ id: "s", label: "س", values: Array.from({ length: 30 }, (_, i) => i) }] });
    const o = build(many, { width: 360, compact: true });
    expect(o.xAxis.axisLabel.rotate).toBe(45);
    expect(o.yAxis.axisLabel.margin).toBe(14);
    expect(build(canon(rainfallBar()), { width: 1280 }).yAxis.axisLabel.margin).toBeUndefined();
  });
});

describe("21A1-RB24 measured cuts keep the bidi isolate and measure in the chart's own font (round-4 findings C4-F4 / C4-F6)", () => {
  const RLI = "⁧", PDI = "⁩";
  it("a cut Arabic axis label is returned isolated (RLI … PDI), measured in \"<size>px <chart font>\"", () => {
    const fonts = new Set<string>();
    const spy = (t: string, f: string) => { fonts.add(f); return measure(t); };
    const spec = canon({ ...rainfallBar(), categories: (rainfallBar() as CategoryChartSpec).categories.map((c, i) => ({ ...c, label: "المنطقة الشمالية الشرقية رقم " + (i + 1) })) });
    const o = build(spec, { width: 1280, measure: spy });
    const cut = o.xAxis.axisLabel.formatter(o.xAxis.data[0]) as string;
    expect(cut.startsWith(RLI) && cut.endsWith(PDI) && cut.includes("…")).toBe(true);
    expect([...fonts]).toEqual(["12px " + defaultChartTokens().font]);
  });
  it("a pie label keeps its name isolated in both forms (one line, and name / value on two lines)", () => {
    const pie = (unit?: string) => canon({ version: 1, id: "p", kind: "pie", title: "ت", description: "توزيع", ...(unit ? { unit } : {}), valueLabels: true, slices: [{ id: "a", label: "المرحلة الابتدائية الأولى", value: 3 }, { id: "b", label: "ب", value: 1 }] });
    for (const spec of [pie(), pie("ألف دينار كويتي سنويًا")]) {
      const l = (build(spec).series[0].label.formatter as (p: { dataIndex: number }) => string)({ dataIndex: 0 });
      expect(l.startsWith(RLI)).toBe(true);
      expect(l.split("\n")[0].endsWith(PDI) || l.split("\n")[0].includes(PDI + ":")).toBe(true);
    }
  });
  it("heat-map columns: the row labels' reserve is capped (110 px), so 20- and 60-character row labels lay the columns out alike", () => {
    const heat = (n: number) => canon({ version: 1, id: "h", kind: "heatmap", title: "ح", description: "نشاط", columns: [1, 2, 3, 4].map(i => ({ id: "k" + i, label: "الأسبوع " + i })),
      rows: [1, 2].map(i => ({ id: "r" + i, label: ("ص".repeat(n - 2)) + " " + i })), values: [[1, 2, 3, 4], [4, 3, 2, 1]] });
    expect(widthLayout(build(heat(20), { width: 800 }) as never)).toBe(widthLayout(build(heat(60), { width: 800 }) as never));
  });
});

describe("21A1-RB25 Review Fix 4 mutation pins (§20.4)", () => {
  it("RU23: a measured cut never returns the uncut text — empty where not even \"…\" fits", () => {
    const f = "12px x";
    expect(fitText("abcdef", 0, f, measure)).toBe("");
    expect(fitText("abcdef", 5, f, measure)).toBe("");                                 // "…" alone is 6 px here
    expect(fitText("abc", 18, f, measure)).toBe("abc");                                // fits: unchanged
    const cut = fitText("abcdefgh", 30, f, measure);
    expect(cut).toBe("abcd…");
    expect(measure(cut)).toBeLessThanOrEqual(30);
  });
  it("RU26 / RU32: pie labels and value labels carry the webfont's line box (1.75 em / 1.7 em)", () => {
    const pie = canon({ version: 1, id: "p", kind: "pie", title: "ت", description: "توزيع", valueLabels: true, slices: [{ id: "a", label: "أ", value: 3 }, { id: "b", label: "ب", value: 1 }] });
    expect(build(pie).series[0].label.lineHeight).toBe(Math.ceil(12 * 1.75));
    expect(build(pie, { width: 360, compact: true }).series[0].label.lineHeight).toBe(Math.ceil(11 * 1.75));
    const bar = canon({ ...(rainfallBar() as CategoryChartSpec), valueLabels: true });
    expect(build(bar).series[0].label.lineHeight).toBe(Math.ceil(12 * 1.7));
    expect(build(bar, { width: 360, compact: true }).series[0].label.lineHeight).toBe(Math.ceil(11 * 1.7));
    expect(build(canon({ ...histogramChart(), valueLabels: true })).series[0].label.lineHeight).toBe(Math.ceil(12 * 1.7));
  });
  it("RU27 / RU28 / RU29: the radar radius shrinks so the names keep their cap — never below half its default", () => {
    const names = ["التفكير الناقد", "حل المشكلات", "التواصل الكتابي", "العمل الجماعي", "الثقافة الرقمية", "الإبداع والابتكار"].map(s => "مهارة " + s + " المتقدمة");
    const spec = canon({ ...radarChart(), axes: names.map((label, i) => ({ id: "a" + i, label, max: 10 })), series: [{ id: "s", label: "علي", values: names.map(() => 5) }] });
    const full = (w: number) => 0.58 * Math.min(w, chartHeight(spec, true)) / 2;
    const r320 = build(spec, { width: 320, compact: true }).radar;
    expect(r320.axisName.width).toBeGreaterThanOrEqual(72);                            // the names keep their phone cap …
    expect(r320.radius).toBeLessThan(Math.round(full(320)));                           // … because the radius gave way
    expect(build(spec, { width: 200, compact: true }).radar.radius).toBe(Math.round(full(200) / 2));   // never below half
  });
  it("RU35: a histogram keeps room on its right for its widest count", () => {
    const h = canon({ ...histogramChart(), valueLabels: true, bins: (histogramChart() as { bins: { start: number; end: number; count: number }[] }).bins.map((b, i) => ({ ...b, count: 12345678 - i })) });
    expect(build(h, { width: 600 }).grid.right).toBeGreaterThanOrEqual(Math.ceil(measure("12345678") / 2) + 4);
  });
});
