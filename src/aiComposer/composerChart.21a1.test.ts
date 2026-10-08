import { describe, it, expect } from "vitest";
import { buildAiChartSchema, mapAiChart, numbersInText, pairedNumber, pairedNumbers, AI_CHART_SOURCE_LABELS, type AiChartPolicy } from "./composerChart";
import { normalizeComposerPatch, applyComposerPatch } from "./composerPatch";
import { mapAiRichBlocks, buildRichBlockSchema } from "./composerRich";
import { COMPOSER_CATALOG_VERSION, COMPOSER_RICH_BLOCKS, buildComposerCatalog, catalogForPrompt } from "./composerCatalog";
import { RICH_BLOCK_TYPES } from "../richContent/richContentModel";
import { validateChartSpec } from "../charts/chartSpec";
import { rb } from "./testing/composerFakeAi";

// Phase 21A.1 — the AI chart capability (catalog V3): the model fills a flat, closed chart DESCRIPTOR inside a `dataChart` block; code maps it
// (deterministic ids, code-owned provenance label) and the ONE chart authority decides. Teacher data is CHECKED against the request: every
// number must occur in it, and a category the teacher wrote with one number keeps that number (what this does not catch: design record
// §11); illustrative data only when the teacher allowed it, and always labelled as illustrative.
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
  it("a number that does not occur in the teacher's request is refused (Arabic-Indic digits in the request count); a category written with one number keeps it", () => {
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
    expect(sorted("1,2345")).toEqual([1.2345]);                                     // a group of four digits is not a thousands group (C2-1 MX5)
    expect(sorted("القيم 120,95,80")).toEqual([80, 95, 120]);                         // a comma list without spaces is a list (C2-3)
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
    expect(pairedNumber("يناير 2024: 120، فبراير 2024: 95", "يناير")).toBeUndefined();          // a year, then the value: unclear — nothing paired (round 3, R3-A1)
    expect(mapAiChart(bar(["يناير", "فبراير"], [120, 95]), 0, P("يناير 2024: 120، فبراير 2024: 95"), "b").ok).toBe(true);
    expect(codes(mapAiChart(bar(["Jan", "Feb"], [80, 120]), 0, P("Jan 120, Feb 80"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(mapAiChart(bar(["Jan", "Feb"], [120, 80]), 0, P("Jan 120, Feb 80"), "b").ok).toBe(true);
    expect(codes(mapAiChart(D({ kind: "pie", categories: ["Jan", "Feb"], series: [{ label: "s", values: [80, 120], mark: "bar" }] }), 0, P("Jan 120, Feb 80"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    // a pie draws its FIRST series only, so the pairing is checked on it whatever else the descriptor carries (review round 2, C2-1 MX6)
    const pie2 = (first: number[]) => D({ kind: "pie", categories: ["Jan", "Feb"], series: [{ label: "s", values: first, mark: "bar" }, { label: "t", values: [120, 80], mark: "bar" }] });
    expect(codes(mapAiChart(pie2([80, 120]), 0, P("Jan 120, Feb 80"), "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(mapAiChart(pie2([120, 80]), 0, P("Jan 120, Feb 80"), "b").ok).toBe(true);
  });
  it("a teacher-data chart's title and description state no number the teacher did not write", () => {
    const req = P("يناير ١٢٠، فبراير 95، مارس 82 عام 2020");
    expect(codes(mapAiChart(D({ title: "ارتفع الهطول 900% إلى 4,500 mm" }), 0, req, "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(codes(mapAiChart(D({ description: "ارتفع بنسبة 900% إلى 4500" }), 0, req, "b"))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);   // C2-1 MX4
    expect(mapAiChart(D({ title: "الهطول الشهري 2020" }), 0, req, "b").ok).toBe(true);
    expect(mapAiChart(D({ description: "كمية الأمطار عام 2020 لكل شهر." }), 0, req, "b").ok).toBe(true);
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

describe("21A1-AI7 pairings are what the teacher WROTE — never invented (review fix 2, N1 / N2 / N5)", () => {
  const P = (request: string): AiChartPolicy => ({ request, illustrative: false, charts: true });
  const bar = (categories: string[], values: number[]) => D({ categories, series: [{ label: "القيمة", values, mark: "bar" }] });
  const pie = (categories: string[], values: number[]) => D({ kind: "pie", categories, series: [{ label: "s", values, mark: "bar" }] });
  const verdict = (raw: unknown, request: string) => { const r = mapAiChart(raw, 0, P(request), "b"); return r.ok ? "ok" : r.issues.map(i => i.code).join(); };
  // [request, labels, correct values, values a misled model could write (a swap / a shift / a duplicate)]
  const CASES: [string, string[], number[], number[]][] = [
    ["Rainfall for Jan, Feb, Mar: 120, 80, 95", ["Jan", "Feb", "Mar"], [120, 80, 95], [120, 80, 120]],
    ["أنشئ رسمًا لهطول في يناير وفبراير ومارس: 120 و80 و95 ملم", ["يناير", "فبراير", "مارس"], [120, 80, 95], [120, 80, 120]],
    ["Jan / Feb / Mar = 120 / 80 / 95", ["Jan", "Feb", "Mar"], [120, 80, 95], [80, 120, 95]],
    ["Rainfall Jan,Feb,Mar: 120,80,95", ["Jan", "Feb", "Mar"], [120, 80, 95], [95, 80, 120]]
  ];
  // round 3 (R3-A1): a year (or any second number) in the label's clause makes the writing unclear — nothing is paired, the correct chart
  // is accepted (a swap is then not detected: record §11 "Not verified")
  const UNCLEAR: [string, string[], number[]][] = [
    ["January 2024 sales were 120, February 2024 sales were 80", ["January", "February"], [120, 80]],
    ["في يناير 2024 بلغت المبيعات 120، وفي فبراير 2024 بلغت 80", ["يناير", "فبراير"], [120, 80]],
    ["Jan (2023) 120, Feb (2023) 80", ["Jan", "Feb"], [120, 80]]
  ];
  it("a correct teacher-data chart is accepted for every phrasing (lists, Arabic lists, slashes, year qualifiers, a comma list without spaces)", () => {
    for (const [req, cats, good] of [...CASES, ...UNCLEAR]) expect(verdict(bar(cats, good), req), req).toBe("ok");
    expect(verdict(pie(["A", "B", "C"], [50, 30, 20]), "Shares of A, B, C: 50%, 30%, 20%")).toBe("ok");
    for (const [req, cats] of UNCLEAR) expect(pairedNumbers(req, cats), req).toEqual(cats.map(() => undefined));
  });
  it("the values a misled model could write instead are refused (a swap, a shift, a duplicate of another category's value)", () => {
    for (const [req, cats, , bad] of CASES) expect(verdict(bar(cats, bad), req), req).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(pie(["A", "B", "C"], [50, 30, 50]), "Shares of A, B, C: 50%, 30%, 20%")).toBe("AI_CHART_DATA_NOT_PROVIDED");
  });
  it("the refusal never states a value (the pairing is a check, never a value to copy)", () => {
    const r = mapAiChart(bar(["Jan", "Feb", "Mar"], [120, 95, 80]), 0, P("Jan 120, Feb 80, Mar 95"), "b");
    expect(r.ok).toBe(false);
    if (!r.ok) for (const i of r.issues) expect(i.message).not.toMatch(/\d/);
  });
  it("pairedNumbers: the list, the qualifier and the one-number rules; nothing is paired where the writing is unclear", () => {
    expect(pairedNumbers("Rainfall for Jan, Feb, Mar: 120, 80, 95", ["Jan", "Feb", "Mar"])).toEqual([120, 80, 95]);
    expect(pairedNumbers("Jan, Feb, Mar: 120, 80", ["Jan", "Feb", "Mar"])).toEqual([undefined, undefined, undefined]);   // lengths differ
    expect(pairedNumbers("Jan 120-130, Feb 80", ["Jan", "Feb"])).toEqual([undefined, 80]);                                // a range
    expect(pairedNumbers("Mar: 120, 80, 95", ["Mar"])).toEqual([undefined]);                                              // a value list
    expect(pairedNumbers("Jan 120 mm, Feb 80 mm", ["Jan", "Feb"])).toEqual([120, 80]);                                    // units between
  });
  it("labels match case-insensitively, without invisible characters or tatweel; an en dash before a digit is a minus", () => {
    expect(verdict(bar(["Jan", "Feb"], [80, 120]), "rainfall jan 120, feb 80")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["ينا\u200Cير", "فبـراير"], [80, 120]), "يناير 120، فبراير 80")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["ينا\u200Cير", "فبـراير"], [120, 80]), "يناير 120، فبراير 80")).toBe("ok");
    expect(verdict(bar(["January", "February"], [5, 3]), "January \u20135, February 3")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect([...numbersInText("January \u20135, range 10\u201320")].sort((a, b) => a - b)).toEqual([-5, 10, 20]);
  });
  it("pins (mutants X3 / X4 / X8): numbers in the description, the sign in a pairing, every category is checked", () => {
    expect(verdict(D({ description: "Rain reached 4,500 mm" }), TEACHER.request)).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["Jan", "Feb"], [5, -5]), "Jan -5, Feb 5")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["Jan", "Feb"], [5, 5]), "Jan -5, Feb 5")).toBe("AI_CHART_DATA_NOT_PROVIDED");                 // round 3 (X4′): the sign is part of the pair
    expect(verdict(bar(["Jan", "Feb", "Mar"], [120, 95, 80]), "Jan 120, Feb 80, Mar 95")).toBe("AI_CHART_DATA_NOT_PROVIDED");
  });
});

describe("21A1-AI9 a pairing only detects a swap — it never invents one (review fix 3, round-3 findings R3-A1 / A2 / A3 / A5 / A7)", () => {
  const P = (request: string): AiChartPolicy => ({ request, illustrative: false, charts: true });
  const bar = (categories: string[], values: (number | null)[]) => D({ categories, series: [{ label: "القيمة", values, mark: "bar" }] });
  const pie = (categories: string[], values: number[]) => D({ kind: "pie", categories, series: [{ label: "s", values, mark: "bar" }] });
  const verdict = (raw: unknown, request: string) => { const r = mapAiChart(raw, 0, P(request), "b"); return r.ok ? "ok" : r.issues.map(i => i.code).join(); };
  it("R3-A1: years and other numbers in the clause, ordinals, labels inside words and a parenthesised list pair nothing — the correct chart passes", () => {
    const cases: [string, string[], number[]][] = [
      ["School A 2000 students in 40 classes, School B 1500 students in 30 classes", ["School A", "School B"], [2000, 1500]],
      ["Jan 2000 (up 5%), Feb 1800", ["Jan", "Feb"], [2000, 1800]],
      ["المدرسة أ 2000 طالب في 40 فصلًا، المدرسة ب 1500 طالب في 30 فصلًا", ["المدرسة أ", "المدرسة ب"], [2000, 1500]],
      ["Jan 15th: 120, Feb 15th: 80", ["Jan", "Feb"], [120, 80]],
      ["Classes A, B, C (30, 28, 25 students) had average scores of 72, 65, 80", ["A", "B", "C"], [72, 65, 80]]
    ];
    for (const [req, cats, good] of cases) expect(verdict(bar(cats, good), req), req).toBe("ok");
    expect(pairedNumbers("Jan 2000 (up 5%), Feb 1800", ["Jan", "Feb"])).toEqual([undefined, 1800]);
    expect(pairedNumbers("Jan 15th: 120, Feb 15th: 80", ["Jan", "Feb"])).toEqual([undefined, undefined]);
    expect(pairedNumbers("Classes A, B, C (30, 28, 25 students) had average scores of 72, 65, 80", ["A", "B", "C"])).toEqual([undefined, undefined, undefined]);
    const req = "عدد الطلاب 120: اختار 40 منهم أ، و30 ب، و20 ج، و30 د";
    expect(pairedNumbers(req, ["أ", "ب", "ج", "د"])).toEqual([undefined, undefined, undefined, undefined]);      // "ب" is not the end of "الطلاب"
    expect(verdict(pie(["أ", "ب", "ج", "د"], [40, 30, 20, 30]), req)).toBe("ok");
    // a label is a whole word: "Jan" never inside "January"; one Arabic proclitic is allowed ("وفبراير", "بيناير")
    expect(pairedNumbers("January 120, Jan 80", ["Jan"])).toEqual([80]);
    expect(pairedNumbers("الهطول بيناير 120 وفبراير 80", ["يناير", "فبراير"])).toEqual([120, 80]);
  });
  it("a misread pairing never refuses a correct chart: only a value that belongs to ANOTHER category (or a missing written value) is refused", () => {
    // "Jan 120 then" is clear, but a model writing Jan = 95 (an unpaired number of the request) is not a swap: not detected by design
    expect(verdict(bar(["Jan", "Feb"], [95, 80]), "Jan 120, Feb 80, total 95")).toBe("ok");
    expect(verdict(bar(["Jan", "Feb"], [80, 80]), "Jan 120, Feb 80, total 95")).toBe("AI_CHART_DATA_NOT_PROVIDED");   // Feb's value
    expect(verdict(bar(["Jan", "Feb"], [120, 120]), "Jan 120, Feb 120")).toBe("ok");                                 // equal values are no swap
  });
  it("R3-A2: a decimal written without a leading digit keeps its point (\".5\", \"٫5\", \"-.5\")", () => {
    expect([...numbersInText("A .5, B .3, C .2")].sort((a, b) => a - b)).toEqual([0.2, 0.3, 0.5]);
    expect([...numbersInText("Jan -.5, Feb .25")].sort((a, b) => a - b)).toEqual([-0.5, 0.25]);
    expect([...numbersInText("يناير ٫5، فبراير ٫8")].sort((a, b) => a - b)).toEqual([0.5, 0.8]);
    expect([...numbersInText("version 1.2.3")].sort((a, b) => a - b)).toEqual([1.2, 3]);
    expect(verdict(pie(["A", "B", "C"], [0.5, 0.3, 0.2]), "A .5, B .3, C .2")).toBe("ok");
    expect(verdict(pie(["A", "B", "C"], [5, 3, 2]), "A .5, B .3, C .2")).toBe("AI_CHART_DATA_NOT_PROVIDED");
  });
  it("R3-A3: a label list is recognised in ANY order, so reordered categories with unmoved values are refused", () => {
    expect(pairedNumbers("Jan, Feb, Mar: 120, 80, 95", ["Mar", "Feb", "Jan"])).toEqual([95, 80, 120]);
    expect(verdict(bar(["Mar", "Feb", "Jan"], [120, 80, 95]), "Jan, Feb, Mar: 120, 80, 95")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["Jan", "Mar", "Feb"], [120, 80, 95]), "Jan, Feb, Mar: 120, 80, 95")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["Mar", "Feb", "Jan"], [95, 80, 120]), "Jan, Feb, Mar: 120, 80, 95")).toBe("ok");
    expect(verdict(bar(["مارس", "فبراير", "يناير"], [120, 95, 82]), "يناير وفبراير ومارس: 120 و95 و82")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["مارس", "فبراير", "يناير"], [82, 95, 120]), "يناير وفبراير ومارس: 120 و95 و82")).toBe("ok");
  });
  it("R3-A5: \"and\" separates list items (never a unit); a value the teacher wrote may not go missing", () => {
    expect(pairedNumbers("Jan, Feb and Mar: 120, 80 and 95", ["Jan", "Feb", "Mar"])).toEqual([120, 80, 95]);
    expect(verdict(bar(["Jan", "Feb", "Mar"], [80, 120, 95]), "Jan, Feb and Mar: 120, 80 and 95")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["Jan", "Feb"], [80, 120]), "Jan and Feb: 120 and 80")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["Jan", "Feb", "Mar"], [120, null, 95]), "Jan 120, Feb 80, Mar 95")).toBe("AI_CHART_DATA_NOT_PROVIDED");
    expect(verdict(bar(["Jan", "Feb", "Mar"], [120, null, 95]), "Jan 120, Mar 95")).toBe("ok");                       // Feb not written
  });
  it("mutation pins (RT06 / RT07 / RT10 / RT17): an ordinal, the end of another word, a label listed twice or with two values pair nothing", () => {
    expect(pairedNumbers("Jan 15th, Feb 80", ["Jan", "Feb"])).toEqual([undefined, 80]);                             // "15th" is a date
    expect(pairedNumbers("عدد الطلاب 120، أ 40، ب 30", ["أ", "ب"])).toEqual([40, 30]);                               // «ب» ending «الطلاب» is not «ب»
    expect(pairedNumbers("Jan, Jan, Feb: 5, 5, 7", ["Jan", "Feb"])).toEqual([undefined, undefined]);                  // a label twice in a list
    expect(pairedNumbers("Jan, Feb: 120, 80. Later Feb, Jan: 90, 100", ["Jan", "Feb"])).toEqual([undefined, undefined]); // two lists disagree
  });
  it("R3-A7 pins: a longer value run pairs nothing; a list item never pairs alone; a clause ends at another label", () => {
    expect(pairedNumbers("Jan, Feb: 120, 80, 95", ["Jan", "Feb"])).toEqual([undefined, undefined]);
    expect(pairedNumbers("Jan and Feb: 120", ["Jan", "Feb"])).toEqual([undefined, undefined]);
    expect(pairedNumbers("Jan 120 Feb 80", ["Jan", "Feb"])).toEqual([120, 80]);
    expect(pairedNumbers("Jan 120 (2020), Feb 80", ["Jan", "Feb"])).toEqual([undefined, 80]);
  });
  it("round-3 lane C pins (N1 / N3): ranges, a number then another, compatibility forms, tatweel, the comma-list rule, 4-digit values", () => {
    expect(pairedNumbers("يناير 120 إلى 130، فبراير 80", ["يناير", "فبراير"])).toEqual([undefined, 80]);            // a range («إلى»)
    expect(pairedNumbers("Jan 120 to 130, Feb 80", ["Jan", "Feb"])).toEqual([undefined, 80]);                         // a range ("to")
    expect(pairedNumbers("Jan 120 80, Feb 95", ["Jan", "Feb"])).toEqual([undefined, 95]);                             // a number, then another
    expect(verdict(bar(["Jan", "Feb"], [80, 80]), "\uFF2A\uFF41\uFF4E 120, Feb 80")).toBe("AI_CHART_DATA_NOT_PROVIDED"); // fullwidth "Ｊａｎ" (NFKC)
    expect(verdict(bar(["يناير", "فبراير"], [80, 80]), "\uFEF3\uFEE8\uFE8E\uFEF3\uFEAE 120، فبراير 80")).toBe("AI_CHART_DATA_NOT_PROVIDED"); // presentation forms
    expect(verdict(bar(["يناير", "فبـراير"], [120, 120]), "يناير 120، فبراير 80")).toBe("AI_CHART_DATA_NOT_PROVIDED");  // a label with tatweel
    expect([...numbersInText("A,B,C 1,200,30")].sort((a, b) => a - b)).toEqual([1, 30, 200]);                        // not all groups 3 digits: a list
    expect(pairedNumbers("Units sold: Jan 2000, Feb 1950, Mar 2050", ["Jan", "Feb", "Mar"])).toEqual([2000, 1950, 2050]);  // 4-digit values pair
    expect(verdict(bar(["Jan", "Feb", "Mar"], [1950, 2050, 2000]), "Units sold: Jan 2000, Feb 1950, Mar 2050")).toBe("AI_CHART_DATA_NOT_PROVIDED");
  });
});

describe("21A1-AI8 merged AI chart ids at any depth, several at once (review fix 2, N3 / N5)", () => {
  const exam = (blocks: unknown[]) => ({ schemaVersion: 2, examId: "E1", title: "E", status: "draft", metadata: {}, sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [
    { examQuestionId: "q1", presentationType: "multipleChoice", questionTypeVersion: 1, text: "أي شهر أكثر هطولًا؟", marks: 2, options: [{ text: "يناير" }, { text: "فبراير" }], answer: { correctOptionIndex: 0 },
      richContent: { schemaVersion: 1, blocks } }] }] });
  const chart = (id: string) => { const r = mapAiChart(D(), 0, TEACHER, "$"); if (!r.ok) throw new Error("fixture"); return { type: "dataChart", chart: { ...r.chart, id } }; };
  const merge = (blocks: unknown[], incoming: number, richMode: "append" | "prepend") => {
    const charts = Array.from({ length: incoming }, (_, i) => rb("dataChart", { chart: D({ title: "الحرارة " + "أبجد"[i], categories: ["يناير", "فبراير"], series: [{ label: "الحرارة", values: [30, 25], mark: "bar" }] }) }));
    const op = { op: "updateQuestionRichContent", sectionId: null, questionId: "q1", partId: null, position: null, text: null, title: null, marks: null, preset: null, tableVariant: null, variant: null,
      richBlocks: charts, richMode, item: null, section: null, items: null, reason: "أضف رسومًا" };
    const e = exam(blocks);
    const ctx = { exam: e, mode: "improveContent", scope: { kind: "question", questionId: "q1" }, nonce: "abc123", request: "أضف رسم الحرارة: يناير 30، فبراير 25" };
    const n = normalizeComposerPatch({ summary: "إضافة رسم", operations: [op] }, ctx as never);
    if (!n.ok) return { ok: false as const, why: JSON.stringify(n).slice(0, 300) };
    const d = applyComposerPatch(e as never, n.patch, { now: "2026-01-01T00:00:00Z", request: ctx.request } as never) as { ok: boolean; exam?: { sections: { questions: { richContent: { blocks: Record<string, unknown>[] } }[] }[] } };
    return d.ok ? { ok: true as const, blocks: d.exam!.sections[0].questions[0].richContent.blocks } : { ok: false as const, why: JSON.stringify(d).slice(0, 300) };
  };
  const ids = (blocks: Record<string, unknown>[]): string[] => blocks.flatMap(b => b.type === "dataChart" ? [(b.chart as { id: string }).id]
    : b.type === "columns" ? (b.columns as { blocks: Record<string, unknown>[] }[]).flatMap(c => ids(c.blocks)) : []);
  it("a chart inside a columns block counts as taken (append and prepend)", () => {
    const nested = [{ type: "columns", columns: [{ blocks: [chart("chart1")] }, { blocks: [{ type: "paragraph", runs: [{ text: "نص" }] }] }] }];
    for (const mode of ["append", "prepend"] as const) {
      const r = merge(nested, 1, mode);
      expect(r.ok, r.ok ? "" : r.why).toBe(true);
      if (r.ok) expect(ids(r.blocks).sort()).toEqual(["chart1", "chart2"]);
    }
  });
  it("several incoming charts: every kept or renumbered id is reserved (into [chart1, chart2] and into [chart2])", () => {
    const a = merge([chart("chart1"), chart("chart2")], 2, "append");
    expect(a.ok, a.ok ? "" : a.why).toBe(true);
    if (a.ok) expect(ids(a.blocks).sort()).toEqual(["chart1", "chart2", "chart3", "chart4"]);
    const b = merge([chart("chart2")], 2, "append");
    expect(b.ok, b.ok ? "" : b.why).toBe(true);
    if (b.ok) expect(ids(b.blocks).sort()).toEqual(["chart1", "chart2", "chart3"]);
  });
});
