import { describe, it, expect } from "vitest";
import * as R from "./richContentModel";
import { donutChart, rainfallBar, scatterChart, temperatureLine } from "../charts/testing/chartFixtures";

// Phase 21A.1 — the `dataChart` rich block: a ChartSpecV1 inside RichContentV1 (question stems, scenario sources, composite contexts, section
// and cover instructions all carry RichContentV1, so one block type reaches every stimulus host). The rich authority delegates the chart to
// the ONE chart authority (validateChartSpec), never re-implements it, and bounds charts per document.
const doc = (...blocks: unknown[]) => ({ schemaVersion: 1, blocks });
const para = (t: string) => ({ type: "paragraph", runs: [{ text: t }] });
const codes = (raw: unknown) => R.validateRichContent(raw).issues.map(i => i.code);

describe("21A1-RC1 the dataChart block", () => {
  it("a document mixing prose and charts validates; the canonical value equals the input; charts work inside columns too", () => {
    const d = doc(para("ادرس الرسم ثم أجب."), { type: "dataChart", chart: rainfallBar() }, { type: "columns", columns: [{ blocks: [{ type: "dataChart", chart: donutChart() }] }, { blocks: [para("ملاحظة")] }] });
    const r = R.validateRichContent(d);
    expect(r.issues).toEqual([]);
    expect(r.value).toEqual(d);
    expect(R.projectRichContentForStudent(d)).toEqual(d);
  });
  it("plain text (search / fallback / AI modify projection) carries the chart title, description, source and summary — not raw numbers", () => {
    const t = R.richContentPlainText(doc({ type: "dataChart", chart: rainfallBar() }));
    for (const s of ["الهطول الشهري — 2020", "بيانات توضيحية لأغراض التعلّم", "رسم بالأعمدة — 12 فئة، سلسلة واحدة"]) expect(t).toContain(s);
    expect(t).not.toContain("135");
  });
  it("an invalid chart is refused with RICH_CONTENT_CHART carrying the chart authority's code and the exact path; nothing throws", () => {
    const c = rainfallBar() as Record<string, unknown>;
    (c.series as { values: unknown[] }[])[0].values[3] = "40";
    const r = R.validateRichContent(doc(para("x"), { type: "dataChart", chart: c }));
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ code: "RICH_CONTENT_CHART", path: "richContent.blocks[1].chart.series[0].values[3]" });
    expect(r.issues[0].message).toContain("[CHART_NUMBER_INVALID]");
    for (const bad of [undefined, null, 7, "chart", [], { version: 1 }, { ...rainfallBar(), option: { series: [] } }, { ...rainfallBar(), kind: "graphic" }]) {
      expect(() => R.validateRichContent(doc({ type: "dataChart", chart: bad }))).not.toThrow();
      expect(codes(doc({ type: "dataChart", chart: bad }))).toContain("RICH_CONTENT_CHART");
    }
  });
  it("a raw engine option smuggled next to the chart is an unknown block key; the block never carries anything but type + chart", () => {
    expect(codes(doc({ type: "dataChart", chart: rainfallBar(), option: { tooltip: { formatter: "{b}" } } }))).toContain("RICH_CONTENT_UNKNOWN_KEY");
    expect(codes(doc({ type: "dataChart", chart: rainfallBar(), echarts: {} }))).toContain("RICH_CONTENT_UNKNOWN_KEY");
  });
  it("chart ids are unique within one document (answers and stimulus references name a chart by id)", () => {
    const r = R.validateRichContent(doc({ type: "dataChart", chart: rainfallBar() }, { type: "dataChart", chart: { ...temperatureLine(), id: "rainfall-2020" } }));
    expect(r.ok).toBe(false);
    expect(r.issues.map(i => [i.code, i.path])).toEqual([["RICH_CONTENT_CHART", "richContent.blocks[1].chart.id"]]);
  });
  it("at most RICH_LIMITS.charts charts per document (bounded rendering cost); exactly the limit is accepted", () => {
    const n = R.RICH_LIMITS.charts;
    const charts = (k: number) => Array.from({ length: k }, (_, i) => ({ type: "dataChart", chart: { ...scatterChart(), id: "c" + i } }));
    expect(R.validateRichContent(doc(...charts(n))).ok).toBe(true);
    const over = R.validateRichContent(doc(...charts(n + 1)));
    expect(over.issues.map(i => [i.code, i.path])).toEqual([["RICH_CONTENT_LIMIT", "richContent.blocks[" + n + "]"]]);
  });
  it("the document size counts the chart's STORED prose (title, description, source), never the generated summary (review fix 2, N6)", () => {
    const chart = rainfallBar() as { title: string; description: string; source?: string };
    const stored = chart.title.length + chart.description.length + (chart.source?.length ?? 0);
    const fill = (n: number) => { const out: unknown[] = []; for (let left = n; left > 0; left -= R.RICH_LIMITS.blockChars) out.push(para("x".repeat(Math.min(left, R.RICH_LIMITS.blockChars)))); return out; };
    const exact = doc(...fill(R.RICH_LIMITS.totalChars - stored), { type: "dataChart", chart: rainfallBar() });
    expect(R.validateRichContent(exact).issues).toEqual([]);
    const over = doc(...fill(R.RICH_LIMITS.totalChars - stored + 1), { type: "dataChart", chart: rainfallBar() });
    expect(R.validateRichContent(over).issues.map(i => i.code)).toEqual(["RICH_CONTENT_LIMIT"]);
  });
  it("an older reader's vocabulary (the 15 baseline types) keeps its order: dataChart is appended, never inserted", () => {
    expect(R.RICH_BLOCK_TYPES.indexOf("dataChart")).toBe(R.RICH_BLOCK_TYPES.length - 1);
    expect(R.RICH_BLOCK_TYPES.indexOf("math")).toBe(14);
  });
});
