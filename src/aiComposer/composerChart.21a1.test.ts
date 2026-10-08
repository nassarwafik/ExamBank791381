import { describe, it, expect } from "vitest";
import { buildAiChartSchema, mapAiChart, numbersInText, pairedNumber, AI_CHART_SOURCE_LABELS, type AiChartPolicy } from "./composerChart";
import { normalizeComposerPatch, applyComposerPatch } from "./composerPatch";
import { mapAiRichBlocks, buildRichBlockSchema } from "./composerRich";
import { COMPOSER_CATALOG_VERSION, COMPOSER_RICH_BLOCKS, buildComposerCatalog, catalogForPrompt } from "./composerCatalog";
import { RICH_BLOCK_TYPES } from "../richContent/richContentModel";
import { validateChartSpec } from "../charts/chartSpec";
import { rb } from "./testing/composerFakeAi";

// Phase 21A.1 — the AI chart capability (catalog V3): the model fills a flat, closed chart DESCRIPTOR inside a `dataChart` block; code maps it
// (deterministic ids, code-owned provenance label) and the ONE chart authority decides. Teacher data is preserved exactly (every number must
// come from the teacher's request); illustrative data only when the teacher allowed it, and always labelled as illustrative.
const D = (over: Record<string, unknown> = {}) => ({
  kind: "bar", dataOrigin: "teacherProvided", title: "الهطول الشهري", description: "كمية الأمطار لكل شهر بالملّيمتر.",
  categories: ["يناير", "فبراير", "مارس"], series: [{ label: "الهطول", values: [120, 95, 82], mark: "bar" }], points: [], bins: [], boxes: [],
  xLabel: "الشهر", yLabel: "الهطول", unit: "mm", stacked: false, horizontal: false, donut: false, ...over
});
const TEACHER: AiChartPolicy = { request: "أنشئ سؤالًا عن رسم بياني لهطول يناير ١٢٠ وفبراير 95 ومارس 82 ملّيمترًا", illustrative: false, charts: true };
const OPEN: AiChartPolicy = { request: "أي شيء", illustrative: true, charts: true };
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : r.issues!.map(i => i.code));

describe("21A1-AI1 catalog V3 and the chart capability", () => {
  it("the catalog is V3, dataChart is an AI rich block of the 20D.1 vocabulary, and the prompt states the chart contract", () => {
    expect(COMPOSER_CATALOG_VERSION).toBe("AI_COMPOSER_CATALOG_V3");
    expect(COMPOSER_RICH_BLOCKS).toContain("dataChart");
    for (const b of COMPOSER_RICH_BLOCKS) expect(RICH_BLOCK_TYPES).toContain(b);
    const p = catalogForPrompt(buildComposerCatalog());
    const charts = p.split("\n").find(l => l.startsWith("Charts: "))!;
    expect(charts).toContain("dataOrigin teacherProvided = ONLY the numbers the teacher wrote, unchanged");
    expect(charts).not.toMatch(/echarts|formatter|EChartsOption|tooltip|graphic/i);
    expect(p.split("\n").find(l => l.startsWith("Rich blocks: "))).toMatch(/math \(no images, no HTML, no CSS, no URLs\); dataChart/);
  });
  it("the provider schema is closed and carries no engine vocabulary", () => {
    expect(JSON.stringify(buildRichBlockSchema())).toContain('"chart"');
    const s = JSON.stringify(buildAiChartSchema());
    expect(s).not.toMatch(/formatter|tooltip|graphic|echarts|"html"|"option"|"id"|"color"/i);                // no engine vocabulary, no ids, no colours
    const chart = buildAiChartSchema() as { additionalProperties: boolean; required: string[] };
    expect(chart.additionalProperties).toBe(false);
    expect(chart.required).toContain("dataOrigin");
  });
});

describe("21A1-AI2 descriptor → ChartSpecV1", () => {
  it("maps every kind with code-owned ids and provenance; the chart authority accepts the result", () => {
    const kinds: Record<string, Record<string, unknown>> = {
      bar: D(), line: D({ kind: "line" }), area: D({ kind: "area", stacked: true }), combo: D({ kind: "combo", series: [{ label: "أ", values: [120, 95, 82], mark: "bar" }, { label: "ب", values: [1, 2, 3], mark: "line" }] }),
      pie: D({ kind: "pie", donut: true }), scatter: D({ kind: "scatter", series: [{ label: "الطلاب", values: [], mark: "bar" }], points: [{ series: 1, x: 1, y: 2, label: "" }, { series: 1, x: 3, y: 4, label: "شاذّة" }] }),
      histogram: D({ kind: "histogram", bins: [{ start: 0, end: 10, count: 2 }, { start: 10, end: 20, count: 5 }] }), radar: D({ kind: "radar", series: [{ label: "علي", values: [8, 6, 7], mark: "bar" }] }),
      boxplot: D({ kind: "boxplot", boxes: [{ label: "أ", min: 1, q1: 2, median: 3, q3: 4, max: 5 }] }), heatmap: D({ kind: "heatmap", series: [{ label: "الأحد", values: [1, null, 3], mark: "bar" }] })
    };
    for (const [k, d] of Object.entries(kinds)) {
      const r = mapAiChart({ ...d, dataOrigin: "illustrative" }, 2, OPEN, "b");
      expect(r.ok, k + JSON.stringify(r)).toBe(true);
      if (!r.ok) continue;
      expect(r.chart.id).toBe("chart3");
      expect(r.chart.source).toBe(AI_CHART_SOURCE_LABELS.illustrative);
      expect(validateChartSpec(r.chart).issues, k).toEqual([]);
    }
  });
  it("a horizontal bar puts the numeric axis (with the unit) on x", () => {
    const r = mapAiChart(D({ horizontal: true }), 0, TEACHER, "b");
    expect(r.ok && [r.chart.kind, (r.chart as { orientation?: string }).orientation, (r.chart as { xAxis?: unknown }).xAxis]).toEqual(["bar", "horizontal", { label: "الهطول", unit: "mm" }]);
  });
});

describe("21A1-AI3 data integrity", () => {
  it("teacher-provided numbers are preserved exactly (Arabic-Indic digits in the request count); a changed or invented number is refused", () => {
    expect(mapAiChart(D(), 0, TEACHER, "b").ok).toBe(true);
    expect(codes(mapAiChart(D({ series: [{ label: "الهطول", values: [121, 95, 82], mark: "bar" }] }), 0, TEACHER, "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(codes(mapAiChart(D({ series: [{ label: "الهطول", values: [120, 95, 82, 40], mark: "bar" }], categories: ["a", "b", "c", "d"] }), 0, TEACHER, "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    // (review fix A2: the sign is kept — "-3" is −3 only; it used to admit 3 as well)
    expect([...numbersInText("١٢٠ و 95٫5 و -3 و 1,5")].sort((a, b) => a - b)).toEqual([-3, 1.5, 95.5, 120]);
  });
  it("illustrative data needs the teacher's permission and is always labelled by code as illustrative (never presented as real)", () => {
    expect(codes(mapAiChart(D({ dataOrigin: "illustrative" }), 0, TEACHER, "b"))).toEqual(["AI_CHART_ILLUSTRATIVE_NOT_ALLOWED"]);
    const r = mapAiChart(D({ dataOrigin: "illustrative", title: "مصدر: البنك الدولي" }), 0, OPEN, "b");
    expect(r.ok && r.chart.source).toBe(AI_CHART_SOURCE_LABELS.illustrative);
  });
  it("without a policy no AI chart is accepted (fail closed); malformed descriptors and markup are refused", () => {
    expect(codes(mapAiChart(D(), 0, undefined, "b"))).toEqual(["AI_CHART_POLICY_MISSING"]);
    expect(codes(mapAiChart({ ...D(), option: {} }, 0, OPEN, "b"))).toEqual(["AI_CHART_MALFORMED"]);
    expect(codes(mapAiChart(D({ kind: "graphic" }), 0, OPEN, "b"))).toEqual(["AI_CHART_MALFORMED"]);
    expect(codes(mapAiChart(D({ series: [{ label: "x", values: [Infinity], mark: "bar" }] }), 0, OPEN, "b"))).toEqual(["AI_CHART_MALFORMED"]);
  });
});

describe("21A1-AI4 through the rich block mapper", () => {
  it("a dataChart block becomes a validated chart; markup in a label is refused by the chart authority (section repair)", () => {
    const ok = mapAiRichBlocks([rb("paragraph", { text: "ادرس الرسم." }), rb("dataChart", { chart: D() })], "stem", TEACHER);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.richContent!.blocks[1]).toMatchObject({ type: "dataChart", chart: { id: "chart2", kind: "bar" } });
    const bad = mapAiRichBlocks([rb("dataChart", { chart: D({ title: "<script>x</script>" }) })], "stem", TEACHER);
    expect(bad.ok).toBe(false);
    expect(codes(mapAiRichBlocks([rb("dataChart", { chart: null })], "stem", TEACHER))).toEqual(["AI_RICH_CONTENT_INVALID"]);
    expect(codes(mapAiRichBlocks([rb("dataChart", { chart: D() })], "stem"))).toContain("AI_CHART_POLICY_MISSING");
  });
  it("a non-chart block carrying a chart descriptor ignores it (the flat descriptor is per block type, like every other field)", () => {
    const r = mapAiRichBlocks([rb("paragraph", { text: "نص", chart: D() })], "stem", TEACHER);
    expect(r.ok && r.richContent!.blocks).toEqual([{ type: "paragraph", runs: [{ text: "نص" }] }]);
  });
});

describe("21A1-AI5 teacher numbers are read strictly (review fix A2)", () => {
  const sorted = (t: string) => [...numbersInText(t)].sort((a, b) => a - b);
  it("thousands separators, decimal separators, signs, ranges and exponents keep their written value", () => {
    expect(sorted("January 1,200 units")).toEqual([1200]);
    expect(sorted("١٬٢٠٠ وحدة")).toEqual([1200]);
    expect(sorted("2,000,000 و 12,5 و 3.14")).toEqual([3.14, 12.5, 2000000]);
    expect(sorted("January -5, February 3")).toEqual([-5, 3]);
    expect(sorted("range 10-20")).toEqual([10, 20]);
    expect(sorted("−4 درجات")).toEqual([-4]);
    expect(sorted("1.5e3")).toEqual([1500]);
  });
  const P = (request: string): AiChartPolicy => ({ request, illustrative: false, charts: true });
  const bar = (categories: string[], values: number[], over: Record<string, unknown> = {}) => D({ categories, series: [{ label: "القيمة", values, mark: "bar" }], ...over });
  it("a changed reading of a teacher number is refused (1,200 → 1.2; −5 → 5; a range bound made negative; Arabic thousands split)", () => {
    expect(codes(mapAiChart(bar(["January", "February"], [1.2, 800]), 0, P("January 1,200 units, February 800"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(mapAiChart(bar(["January", "February"], [1200, 800]), 0, P("January 1,200 units, February 800"), "b").ok).toBe(true);
    expect(codes(mapAiChart(bar(["January", "February"], [5, 3]), 0, P("January -5, February 3"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(codes(mapAiChart(bar(["a", "b"], [-20, 10]), 0, P("range 10-20"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(codes(mapAiChart(bar(["a", "b"], [200, 1]), 0, P("المبيعات ١٬٢٠٠"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
  });
  it("where the request pairs a category with a number, a single-series chart must keep the pair (a swap is refused)", () => {
    expect(pairedNumber("Jan 120, Feb 80", "Feb")).toBe(80);
    expect(pairedNumber("يناير ١٢٠ ملم، وفبراير 95 ملم", "فبراير")).toBe(95);
    expect(pairedNumber("Q10 = 5, Q1 = 7", "Q1")).toBe(7);                                   // "Q1" never pairs with the 0 of "Q10"
    expect(pairedNumber("Q10 was high; Q1: 7", "Q1")).toBe(7);                               // …even when nothing follows that 0 (mutant RA10)
    expect(pairedNumber("January was wet: 120 then 80", "January")).toBeUndefined();
    expect(pairedNumber("Jan 120 in the north, Jan 80 in the south", "Jan")).toBeUndefined();     // two different numbers: not a pairing
    expect(pairedNumber("Jan 120; again Jan 120", "Jan")).toBe(120);
    expect(pairedNumber("يناير 2024: 120، فبراير 2024: 95", "يناير")).toBeUndefined();          // a year qualifier, then the value: no pairing
    expect(mapAiChart(bar(["يناير", "فبراير"], [120, 95]), 0, P("يناير 2024: 120، فبراير 2024: 95"), "b").ok).toBe(true);
    expect(codes(mapAiChart(bar(["Jan", "Feb"], [80, 120]), 0, P("Jan 120, Feb 80"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(mapAiChart(bar(["Jan", "Feb"], [120, 80]), 0, P("Jan 120, Feb 80"), "b").ok).toBe(true);
    expect(codes(mapAiChart(D({ kind: "pie", categories: ["Jan", "Feb"], series: [{ label: "s", values: [80, 120], mark: "bar" }] }), 0, P("Jan 120, Feb 80"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
  });
  it("a teacher-data chart's title and description state no number the teacher did not write", () => {
    const req = P("يناير ١٢٠، فبراير 95، مارس 82 عام 2020");
    expect(codes(mapAiChart(D({ title: "ارتفع الهطول 900% إلى 4,500 mm" }), 0, req, "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(mapAiChart(D({ title: "الهطول الشهري 2020" }), 0, req, "b").ok).toBe(true);
    // invented (illustrative) charts are labelled illustrative by code and are not held to the request
    expect(mapAiChart(D({ dataOrigin: "illustrative", title: "الهطول 2031", series: [{ label: "x", values: [1, 2, 3], mark: "bar" }] }), 0, OPEN, "b").ok).toBe(true);
  });
});

describe("21A1-AI6 AI charts merged into an existing stem (review fix A4)", () => {
  it("appending / prepending a chart to a stem that already has one renumbers the incoming chart id instead of failing on a duplicate", () => {
    const existing = mapAiChart(D(), 0, TEACHER, "$");
    if (!existing.ok) throw new Error("fixture");
    const exam = { schemaVersion: 2, examId: "E1", title: "E", status: "draft", metadata: {}, sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [
      { examQuestionId: "q1", presentationType: "multipleChoice", questionTypeVersion: 1, text: "أي شهر أكثر هطولًا؟", marks: 2, options: [{ text: "يناير" }, { text: "فبراير" }], answer: { correctOptionIndex: 0 },
        richContent: { schemaVersion: 1, blocks: [{ type: "dataChart", chart: existing.chart }] } }] }] };
    for (const richMode of ["append", "prepend"]) {
      const op = { op: "updateQuestionRichContent", sectionId: null, questionId: "q1", partId: null, position: null, text: null, title: null, marks: null, preset: null, tableVariant: null, variant: null,
        richBlocks: [rb("dataChart", { chart: D({ title: "الحرارة", categories: ["يناير", "فبراير"], series: [{ label: "الحرارة", values: [30, 25], mark: "bar" }] }) })], richMode, item: null, section: null, items: null, reason: "أضف رسمًا ثانيًا" };
      const ctx = { exam, mode: "improveContent", scope: { kind: "question", questionId: "q1" }, nonce: "abc123", request: "أضف رسم الحرارة: يناير 30، فبراير 25" };
      const n = normalizeComposerPatch({ summary: "إضافة رسم", operations: [op] }, ctx as never);
      expect(n.ok, JSON.stringify(n)).toBe(true);
      if (!n.ok) continue;
      const d = applyComposerPatch(exam as never, n.patch, { now: "2026-01-01T00:00:00Z", request: ctx.request } as never) as { ok: boolean; exam?: { sections: { questions: { richContent: { blocks: { chart: { id: string } }[] } }[] }[] } };
      expect(d.ok, richMode + " " + JSON.stringify(d).slice(0, 300)).toBe(true);
      const ids = d.exam!.sections[0].questions[0].richContent.blocks.map(b => b.chart.id);
      expect(ids.sort(), richMode).toEqual(["chart1", "chart2"]);
    }
  });
});
