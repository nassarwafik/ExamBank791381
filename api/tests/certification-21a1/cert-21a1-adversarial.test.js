import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { validateChartSpec } from "../../../src/charts/chartSpec";
import { validateRichContent } from "../../../src/richContent/richContentModel";
import { buildEngineOption, targetFromEvent } from "../../../src/charts/echartsAdapter";
import { chartTargets } from "../../../src/charts/chartData";
import { defaultChartTokens } from "../../../src/charts/chartTheme";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { mapAiRichBlocks } from "../../../src/aiComposer/composerRich";
import { rb } from "../../../src/aiComposer/testing/composerFakeAi";
import { rainfallBar, scatterChart, temperatureLine } from "../../../src/charts/testing/chartFixtures";

// Phase 21A.1 — the ADVERSARIAL MATRIX (directive §34). Every attack is planted in a REAL exam (a question stem's dataChart block, a
// scenario source's chart and a chartSelection@1 answer surface) and driven through EVERY authority that can meet it: the chart contract,
// the rich-content contract, structured import, finalization, the student projection, server grading, answer ingest, the ECharts adapter
// and the AI intake. A refused attack must be refused everywhere — classified, never repaired, never thrown — and must never reach the
// student; an attack that is merely odd TEXT (template braces, "<b>", a URL) is accepted only as inert literal data that the renderer
// shows as text and the adapter hands to the engine as plain data (no template formatter, no markup channel, no URL loader exists).
const require_ = createRequire(import.meta.url);
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");

const clone = v => JSON.parse(JSON.stringify(v));
const para = text => ({ type: "paragraph", runs: [{ text }] });
/** The host exam: q1 (MCQ, rich stem with the chart), q2 (chartSelection on the chart), a scenario source carrying the chart. */
function hostExam(chart) {
  return {
    schemaVersion: 2, examId: "ADV-21A1", title: "مصفوفة الهجوم", status: "draft", metadata: {},
    sections: [{
      id: "s1", title: "الهجمات", gradingPolicy: "all",
      scenarios: [{ id: "sc1", version: 1, title: "مصدر", sources: [{ id: "src1", version: 1, kind: "rich", title: "رسم", richContent: { schemaVersion: 1, blocks: [para("مصدر."), { type: "dataChart", chart: clone(chart) }] } }], questionIds: ["q1"] }],
      questions: [
        { examQuestionId: "q1", presentationType: "multipleChoice", text: "أي شهر؟", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, richContent: { schemaVersion: 1, blocks: [para("ادرس الرسم."), { type: "dataChart", chart: clone(chart) }] } },
        { examQuestionId: "q2", presentationType: "chartSelection", questionTypeVersion: 1, text: "حدّد على الرسم.", marks: 3, chartSelection: { v: 1, chart: clone(chart), target: "category", mode: "single", maxSelections: 1 }, answer: { scoring: "allOrNothing", correct: ["oct"] } }
      ]
    }]
  };
}
const set = (o, path, v) => { const ks = path.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; return o; };
const withChart = (mut) => { const c = clone(rainfallBar()); mut(c); return c; };
/** A JSON-parsed object carrying an OWN "__proto__" / "constructor" key (as an attacker's JSON body would). */
const ownKey = (base, key, value) => JSON.parse(JSON.stringify(base).replace(/^\{/, "{" + JSON.stringify(key) + ":" + JSON.stringify(value) + ","));
const nested = depth => JSON.parse("[".repeat(depth) + "1" + "]".repeat(depth));

// ── chart attacks that MUST be refused: [name, chart, expected chart-contract code, marker that must never reach the student] ─────────────
const REFUSED = [
  ["script-looking title", withChart(c => { c.title = "<script>alert(1)</script>"; }), "CHART_TEXT_MARKUP", "<script"],
  ["<img onerror> category label", withChart(c => { c.categories[0].label = "<img src=x onerror=alert(1)>"; }), "CHART_TEXT_MARKUP", "onerror"],
  ["SVG-looking series label", withChart(c => { c.series[0].label = "<svg onload=alert(1)>"; }), "CHART_TEXT_MARKUP", "<svg"],
  ["HTML anchor in a description", withChart(c => { c.description = "انقر <a href=\"https://evil.example\">هنا</a>"; }), "CHART_TEXT_MARKUP", "evil.example"],
  ["javascript: URL in a source", withChart(c => { c.source = "javascript:alert(1)"; }), "CHART_TEXT_MARKUP", "javascript:"],
  ["data:text/html URL in an axis unit", withChart(c => { c.yAxis.unit = "data:text/html,x"; }), "CHART_TEXT_MARKUP", "data:text/html"],
  ["extremely long label (81)", withChart(c => { c.categories[0].label = "ي".repeat(81); }), "CHART_LIMIT", "ي".repeat(81)],
  ["extremely long title (10 000)", withChart(c => { c.title = "LONGTITLE".repeat(1112); }), "CHART_LIMIT", "LONGTITLELONGTITLE"],
  ["bidi override (RLO) in a label", withChart(c => { c.categories[1].label = "‮fbe"; }), "CHART_TEXT_CONTROL", "‮"],
  ["malformed RTL: an unterminated RLI isolate", withChart(c => { c.title = "⁧الهطول"; }), "CHART_TEXT_CONTROL", "⁧"],
  ["control character in a title", withChart(c => { c.title = "a\u0007b"; }), "CHART_TEXT_CONTROL", "a\u0007b"],
  ["numeric string value", withChart(c => { c.series[0].values[0] = "120"; }), "CHART_NUMBER_INVALID", null],
  ["boolean value", withChart(c => { c.series[0].values[0] = true; }), "CHART_NUMBER_INVALID", null],
  ["absurd magnitude (1e300)", withChart(c => { c.series[0].values[0] = 1e300; }), "CHART_LIMIT", null],
  ["deeply nested malformed value (depth 4000)", withChart(c => { c.series[0].values[0] = nested(4000); }), "CHART_NUMBER_INVALID", null],
  ["thousands of categories (2 000)", withChart(c => { c.categories = Array.from({ length: 2000 }, (_, i) => ({ id: "c" + i, label: "L" + i })); c.series[0].values = Array(2000).fill(1); }), "CHART_LIMIT", null],
  ["huge series count (500)", withChart(c => { c.series = Array.from({ length: 500 }, (_, i) => ({ id: "s" + i, label: "S" + i, values: Array(12).fill(1) })); }), "CHART_LIMIT", null],
  ["duplicate category ids", withChart(c => { c.categories[1].id = "jan"; }), null, null],
  ["duplicate category labels", withChart(c => { c.categories[1].label = c.categories[0].label; }), null, null],
  ["empty series", withChart(c => { c.series = []; }), null, null],
  ["series with no values", withChart(c => { c.series[0].values = []; }), null, null],
  ["prototype key: own __proto__ on the chart", ownKey(rainfallBar(), "__proto__", { polluted: true }), "CHART_UNKNOWN_KEY", "polluted"],
  ["prototype key: own constructor on a category", withChart(c => { c.categories[0] = ownKey(c.categories[0], "constructor", { prototype: { x: 1 } }); }), "CHART_UNKNOWN_KEY", null],
  ["prototype name as an id", withChart(c => { c.categories[0].id = "__proto__"; }), null, null],
  ["unicode look-alike id (Cyrillic а)", withChart(c => { c.categories[0].id = "jаn"; }), null, null],
  ["raw ECharts option instead of a spec", { series: [{ type: "bar", data: [1, 2] }], xAxis: { type: "category" }, yAxis: {} }, null, null],
  ["raw ECharts option smuggled in a spec", withChart(c => { c.option = { series: [{ type: "bar" }] }; }), "CHART_UNKNOWN_KEY", null],
  ["formatter function source smuggled as a key", withChart(c => { c.formatter = "function(p){return p.name}"; }), "CHART_UNKNOWN_KEY", "function(p)"],
  ["engine tooltip / graphic / renderItem components", withChart(c => { c.tooltip = { formatter: "{b}" }; c.graphic = [{ type: "image", style: { image: "https://evil.example/x.png" } }]; }), "CHART_UNKNOWN_KEY", "evil.example"],
  ["hidden answer injection inside the chart", withChart(c => { c.answer = { correct: ["oct"] }; }), "CHART_UNKNOWN_KEY", null],
  ["unknown kind (graphic)", withChart(c => { c.kind = "graphic"; }), null, null],
  // review fix A1: a JSON object with no usable toString / valueOf used to make the validator THROW (taking the whole exam down)
  ["kind is an object with a non-callable toString", withChart(c => { c.kind = { toString: 1 }; }), "CHART_KIND", null],
  ["kind is an object with non-callable toString and valueOf", withChart(c => { c.kind = { toString: 1, valueOf: 1 }; }), "CHART_KIND", null],
  // review fix A3: C1 controls, line / paragraph separators and invisible format characters are not prose
  ["C1 control (8-bit CSI U+009B) in a category label", withChart(c => { c.categories[0].label = "Jan\u009B31m"; }), "CHART_TEXT_CONTROL", "\u009B"],
  ["NEL (U+0085) in a series label", withChart(c => { c.series[0].label = "a\u0085b"; }), "CHART_TEXT_CONTROL", "\u0085"],
  ["line separator (U+2028) in a title", withChart(c => { c.title = "a\u2028b"; }), "CHART_TEXT_CONTROL", "\u2028"],
  ["zero-width space (U+200B) making a look-alike label", withChart(c => { c.categories[1].label = "ين\u200Bاير"; }), "CHART_TEXT_CONTROL", "\u200B"],
  ["BOM (U+FEFF) in a description", withChart(c => { c.description = "\uFEFFوصف"; }), "CHART_TEXT_CONTROL", "\uFEFF"],
  ["deprecated format character (U+206E) in a source", withChart(c => { c.source = "a\u206Eb"; }), "CHART_TEXT_CONTROL", "\u206E"],
  ["interlinear annotation (U+FFF9) in a unit", withChart(c => { c.yAxis.unit = "\uFFF9mm"; }), "CHART_TEXT_CONTROL", "\uFFF9"],
  ["future version", withChart(c => { c.version = 2; }), null, null]
];

describe("21A1-ADV1 refused attacks are refused by EVERY authority and never reach the student", () => {
  for (const [name, chart, code, marker] of REFUSED) {
    it(name, () => {
      const t0 = Date.now();
      const v = validateChartSpec(chart);
      expect(v.ok, name).toBe(false);
      if (code) expect(v.issues.map(i => i.code), name).toContain(code);
      const rc = validateRichContent({ schemaVersion: 1, blocks: [{ type: "dataChart", chart }] });
      expect(rc.ok, name).toBe(false);
      expect(rc.issues.map(i => i.code), name).toContain("RICH_CONTENT_CHART");
      const exam = hostExam(chart);
      // structured import reports an error (the editor never opens a silently repaired copy); finalization blocks publishing
      const imp = parseStructuredExamJson(JSON.stringify(exam), "adv.json");
      expect(imp.parseErrors.length + imp.validationErrors.filter(i => i.severity === "error").length, name).toBeGreaterThan(0);
      expect(evaluateExamFinalization(exam).canFinalize, name).toBe(false);
      // the student projection withholds every copy of the hostile chart (stem → text fallback, source refused, answer surface withheld)
      const p = sanitizeExamForStudent(exam, {});
      const pq = p.sections[0].questions;
      expect(pq[0].richContent, name).toBeUndefined();
      expect(pq[1].chartSelection, name).toBeUndefined();
      expect(JSON.stringify(p), name).not.toContain('"dataChart"');
      if (marker) expect(JSON.stringify(p), name).not.toContain(marker);
      // grading fails CLOSED: a chart question with a broken surface goes to teacher review, never a silent zero, never credit
      const g = gradeExam(exam, { q2: { kind: "chartSelection", chartId: "rainfall-2020", targets: ["oct"] } });
      const q2 = (g.questions || []).find(x => x.questionId === "q2");
      expect([q2.score, q2.manualReview], name).toEqual([0, true]);
      expect(Date.now() - t0, name + " must be refused quickly").toBeLessThan(2000);
    });
  }
});

// ── odd but harmless TEXT / data: accepted ONLY as inert literal data ────────────────────────────────────────────────────────────────
const LITERAL = [
  ["formatter-looking template text", withChart(c => { c.categories[0].label = "{b}: {c}"; c.title = "{a|rich} ${x} {{y}}"; }), "{b}: {c}"],
  ["HTML-looking but non-structural text (<b>)", withChart(c => { c.series[0].label = "<b>bold</b>"; }), "<b>bold</b>"],
  ["an external URL as plain text (no loader exists)", withChart(c => { c.source = "https://data.example.org/rain.csv"; }), "https://data.example.org/rain.csv"],
  ["Arabic with numbers, units and plain LRM marks", withChart(c => { c.categories[0].label = "يناير ‎2020‎ (mm)"; }), "يناير ‎2020‎ (mm)"]
];

describe("21A1-ADV2 harmless odd text is literal data only", () => {
  for (const [name, chart, literal] of LITERAL) {
    it(name, () => {
      const v = validateChartSpec(chart);
      expect(v.issues, name).toEqual([]);
      const p = sanitizeExamForStudent(hostExam(chart), {});
      expect(JSON.stringify(p.sections[0].questions[0].richContent), name).toContain(JSON.stringify(literal).slice(1, -1));
      const option = buildEngineOption(v.value, { tokens: defaultChartTokens(), animation: "none", compact: false });
      // the engine receives the text only as data values; every formatter is a code FUNCTION, never a template string
      const strings = [];
      const walk = (x, k) => { if (typeof x === "string") strings.push([k, x]); else if (x && typeof x === "object") for (const [kk, vv] of Object.entries(x)) walk(vv, kk); };
      walk(option, "");
      expect(strings.filter(([k]) => k === "formatter"), name).toEqual([]);
      expect(strings.filter(([k]) => /^(rich|html|image|url|src|href)$/i.test(k)), name).toEqual([]);
    });
  }
  it("negative zero is stored as 0; an unsorted scatter is kept in authored order and selected by identity", () => {
    const z = validateChartSpec(withChart(c => { c.series[0].values[5] = -0; }));
    expect(Object.is(z.ok && z.value.series[0].values[5], 0)).toBe(true);
    const s = scatterChart();
    s.series[0].points.reverse();
    const v = validateChartSpec(s);
    expect(v.ok && v.value.series[0].points.map(p => p.id)).toEqual(["out", "p2", "p3", "p1"]);
    expect(chartTargets(v.value, "point").map(t => t.key)).toEqual(["out", "p2", "p3", "p1"]);
    expect(targetFromEvent(v.value, "point", { type: "click", componentType: "series", seriesIndex: 0, dataIndex: 0 })).toBe("out");
  });
});

// ── malformed interaction targets: refused at ingest, worthless at grading ─────────────────────────────────────────────────────────────
describe("21A1-ADV3 malformed interaction targets", () => {
  const exam = hostExam(rainfallBar());
  const cases = [
    // [name, answer, ingest refusal code (null = accepted and rebuilt), score the grader gives the RAW answer]
    ["targets not an array", { kind: "chartSelection", chartId: "rainfall-2020", targets: "oct" }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["numeric target", { kind: "chartSelection", chartId: "rainfall-2020", targets: [9] }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["null target", { kind: "chartSelection", chartId: "rainfall-2020", targets: [null] }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["object target", { kind: "chartSelection", chartId: "rainfall-2020", targets: [{ id: "oct" }] }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["nested array target", { kind: "chartSelection", chartId: "rainfall-2020", targets: [["oct"]] }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["prototype name target", { kind: "chartSelection", chartId: "rainfall-2020", targets: ["__proto__"] }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["impossible datum id", { kind: "chartSelection", chartId: "rainfall-2020", targets: ["rain/xyz"] }, "CHART_SELECTION_TARGET_UNKNOWN", 0],
    ["look-alike target (Cyrillic о)", { kind: "chartSelection", chartId: "rainfall-2020", targets: ["оct"] }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["coordinates instead of a target", { kind: "chartSelection", chartId: "rainfall-2020", targets: [], x: 410, y: 22 }, null, 0],
    ["10 000 targets", { kind: "chartSelection", chartId: "rainfall-2020", targets: Array.from({ length: 10000 }, (_, i) => "t" + i) }, "CHART_SELECTION_TOO_MANY", 0],
    ["another chart's id", { kind: "chartSelection", chartId: "temp-week", targets: ["oct"] }, "CHART_SELECTION_CHART_MISMATCH", 0],
    ["missing chart id", { kind: "chartSelection", targets: ["oct"] }, "CHART_SELECTION_ANSWER_INVALID", 0],
    ["a self-score on a correct answer (dropped; the grader recomputes)", { kind: "chartSelection", chartId: "rainfall-2020", targets: ["oct"], score: 999, correct: true }, null, 3],
    ["prototype key on the answer", ownKey({ kind: "chartSelection", chartId: "rainfall-2020", targets: ["feb"] }, "__proto__", { score: 3 }), null, 0]
  ];
  for (const [name, answer, code, score] of cases) {
    it(name, () => {
      const n = normalizeDraftAnswers({ q2: answer }, exam);
      if (code) {
        expect(n.rejected, name).toEqual([{ id: "q2", code }]);
        expect(n.answers, name).toEqual({});
      } else {
        // accepted shape: rebuilt to exactly { kind, chartId, targets } — nothing else survives
        expect(Object.keys(n.answers.q2).sort(), name).toEqual(["chartId", "kind", "targets"]);
      }
      const g = gradeExam(exam, { q2: answer });
      const q2 = g.questions.find(x => x.questionId === "q2");
      expect([q2.score, !!q2.manualReview], name).toEqual([score, false]);
    });
  }
});

describe("21A1-ADV4 hidden answer injection and smuggling around the chart", () => {
  it("a key smuggled into the PUBLIC chartSelection config withholds the whole surface from the student and blocks publishing", () => {
    const exam = hostExam(rainfallBar());
    exam.sections[0].questions[1].chartSelection.correct = ["oct"];
    expect(evaluateExamFinalization(exam).canFinalize).toBe(false);
    const p = sanitizeExamForStudent(exam, {});
    expect(p.sections[0].questions[1].chartSelection).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain('"oct"]');
  });
  it("an answer key smuggled next to a dataChart block is an unknown block key (the block carries only type + chart)", () => {
    const rc = validateRichContent({ schemaVersion: 1, blocks: [{ type: "dataChart", chart: rainfallBar(), correct: ["oct"] }] });
    expect(rc.ok).toBe(false);
    const exam = hostExam(rainfallBar());
    exam.sections[0].questions[0].richContent.blocks[1].correct = ["oct"];
    expect(JSON.stringify(sanitizeExamForStudent(exam, {}))).not.toContain('"correct"');
  });
  it("a valid exam's projection never carries the key, the scoring or a teacher note — the chart data is the only chart payload", () => {
    const exam = hostExam(temperatureLine());
    set(exam, "sections.0.questions.1.chartSelection.target", "datum");
    set(exam, "sections.0.questions.1.answer", { scoring: "allOrNothing", correct: ["tmax/tue"] });
    exam.sections[0].questions[1].teacherNote = "CHART21A1-ADV-NOTE";
    expect(evaluateExamFinalization(exam).blockers.map(b => b.message)).toEqual([]);
    const s = JSON.stringify(sanitizeExamForStudent(exam, {}));
    expect(s).not.toMatch(/tmax\/tue|allOrNothing|CHART21A1-ADV-NOTE|correctOptionIndex/);
    expect(s).toContain('"temp-week"');
  });
});

describe("21A1-ADV5 the AI intake meets the same attacks", () => {
  const D = over => ({ kind: "bar", dataOrigin: "illustrative", title: "الهطول", description: "وصف.", categories: ["يناير", "فبراير", "مارس"], series: [{ label: "الهطول", values: [1, 2, 3], mark: "bar" }],
    points: [], bins: [], boxes: [], xLabel: "", yLabel: "", unit: "", stacked: false, horizontal: false, donut: false, ...over });
  const OPEN = { request: "أي شيء", illustrative: true, charts: true };
  const attacks = [
    ["script title", D({ title: "<script>alert(1)</script>" })],
    ["img onerror category", D({ categories: ["<img src=x onerror=alert(1)>", "b", "c"] })],
    ["svg series label", D({ series: [{ label: "<svg onload=x>", values: [1, 2, 3], mark: "bar" }] })],
    ["bidi override", D({ description: "‮abc" })],
    ["long label", D({ categories: ["x".repeat(81), "b", "c"] })],
    ["raw option key", { ...D(), option: { series: [] } }],
    ["formatter key", { ...D(), formatter: "{b}" }],
    ["string number", D({ series: [{ label: "s", values: ["1", 2, 3], mark: "bar" }] })],
    ["unknown kind", D({ kind: "graphic" })],
    ["hidden answer", { ...D(), correct: ["c1"] }],
    ["too many points", D({ kind: "scatter", series: [{ label: "s", values: [], mark: "bar" }], points: Array.from({ length: 2000 }, (_, i) => ({ series: 1, x: i, y: i, label: "" })) })]
  ];
  for (const [name, d] of attacks) {
    it(name + " — refused, nothing returned to store", () => {
      const r = mapAiRichBlocks([rb("dataChart", { chart: d })], "stem", OPEN);
      expect(r.ok, name).toBe(false);
      expect(r.richContent, name).toBeUndefined();
    });
  }
});

describe("21A1-ADV6 exotic JSON objects never make an authority throw (review fix A1)", () => {
  const { evaluateServerFinalization } = require_("../../src/lib/server-finalization.js");
  for (const kind of [{ toString: 1 }, { toString: 1, valueOf: 1 }]) {
    it("chart kind " + JSON.stringify(kind) + " in a stem chart AND a chartSelection config: every authority answers, the exam stays usable", () => {
      const exam = hostExam(withChart(c => { c.kind = kind; }));
      expect(() => sanitizeExamForStudent(exam, {})).not.toThrow();
      expect(sanitizeExamForStudent(exam, {}).sections[0].questions[1].chartSelection).toBeUndefined();
      expect(evaluateExamFinalization(exam).canFinalize).toBe(false);
      expect(() => evaluateServerFinalization(exam)).not.toThrow();
      // the MCQ is still graded; the broken chart question fails closed to review
      const g = gradeExam(exam, { q1: { kind: "choice", index: 0 }, q2: { kind: "chartSelection", chartId: "rainfall-2020", targets: ["oct"] } });
      expect(g.questions.map(q => [q.questionId, q.score, !!q.manualReview])).toEqual([["q1", 2, false], ["q2", 0, true]]);
      expect(() => normalizeDraftAnswers({ q2: { kind: "chartSelection", chartId: "rainfall-2020", targets: ["oct"] } }, exam)).not.toThrow();
      expect(() => parseStructuredExamJson(JSON.stringify(exam), "x.json")).not.toThrow();
    });
  }
  it("a rich block whose type is such an object is refused (RICH_CONTENT_BLOCK_TYPE), not thrown", () => {
    const r = validateRichContent({ schemaVersion: 1, blocks: [{ type: { toString: 1 } }] });
    expect([r.ok, r.ok ? [] : r.issues.map(i => i.code)]).toEqual([false, ["RICH_CONTENT_BLOCK_TYPE"]]);
  });
});
