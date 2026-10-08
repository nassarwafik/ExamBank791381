import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";
import { rainfallBar, scatterChart, comboChart } from "../../src/charts/testing/chartFixtures";

// Phase 21A.1 — chartSelection@1 on the SERVER (the grading authority): the registered grader re-validates the published config (the chart
// through the ONE ChartSpecV1 authority) and the PRIVATE key before comparing semantic target keys (malformed authority ⇒ 0 + manual review;
// malformed student input ⇒ ordinary 0), the draft / submit ingest binds every chart answer to its published question (same chart, known
// targets, no duplicates, the bound) and drops client claims, the student sanitizer never leaks the key, a composite part works through the
// same binder and grader, and the committed shared build is the source of all of it.
const require_ = createRequire(import.meta.url);
const clone = x => JSON.parse(JSON.stringify(x));
const CFG = { v: 1, chart: rainfallBar(), target: "category", mode: "multiple", maxSelections: 3, label: "اختر الأشهر الأكثر مطرًا" };
const KEY = { scoring: "partial", correct: ["jan", "oct"] };
const cq = (over = {}) => ({ examQuestionId: "c1", presentationType: "chartSelection", questionTypeVersion: 1, text: "أي الأشهر تجاوز هطولها 100 mm؟", marks: 4, chartSelection: clone(CFG), answer: clone(KEY), ...over });
const exam = questions => ({ examId: "E21A1", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const g = (r, id) => r.questions.find(x => x.questionId === id);
const sel = (targets, chartId = "rainfall-2020", extra = {}) => ({ kind: "chartSelection", chartId, targets, ...extra });
const compositeQ = () => ({
  examQuestionId: "k1", presentationType: "composite", questionTypeVersion: 1, text: "ادرس الرسم ثم أجب.", marks: 6,
  composite: {
    v: 1,
    contexts: [{ id: "ctxChart", version: 1, kind: "source", title: "المبيعات", sources: [{ id: "src1", version: 1, kind: "rich", title: "الرسم", richContent: { schemaVersion: 1, blocks: [{ type: "dataChart", chart: comboChart() }] } }] }],
    groups: [{ id: "g1", title: "تحليل", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
      { id: "p1", label: "أ", type: "chartSelection", questionTypeVersion: 1, contextId: "ctxChart", text: "في أي ربع كانت المبيعات أعلى؟", marks: 3,
        chartSelection: { v: 1, chart: comboChart(), target: "category", mode: "single", maxSelections: 1 }, answer: { scoring: "allOrNothing", correct: ["q4"] } },
      { id: "p2", label: "ب", type: "numericResponse", questionTypeVersion: 1, contextId: "ctxChart", text: "كم كانت مبيعات الربع الثاني؟", marks: 3, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 120, tolerance: 0 } }
    ] }]
  },
  answer: {}
});

describe("21A1-S1 registered grader (gradeExam)", () => {
  it("chartSelection@1 is registered at exactly version 1 and grades semantic keys with the published scoring", () => {
    expect(typeof resolveGrader("chartSelection", 1)).toBe("function");
    expect(resolveGrader("chartSelection", 2)).toBeUndefined();
    expect(g(gradeExam(exam([cq()]), { c1: sel(["oct", "jan"]) }), "c1")).toMatchObject({ score: 4, correct: true, manualReview: false });
    expect(g(gradeExam(exam([cq()]), { c1: sel(["jan"]) }), "c1")).toMatchObject({ score: 2, correct: false, manualReview: false });
    expect(g(gradeExam(exam([cq({ answer: { scoring: "allOrNothing", correct: ["jan", "oct"] } })]), { c1: sel(["jan"]) }), "c1")).toMatchObject({ score: 0, manualReview: false });
    expect(g(gradeExam(exam([cq()]), {}), "c1")).toMatchObject({ score: 0, manualReview: false });
  });
  it("a client-claimed score / correct flag is never read; another chart's answer is an ordinary 0; a broken key or config ⇒ 0 + manual review", () => {
    expect(g(gradeExam(exam([cq()]), { c1: sel(["feb"], "rainfall-2020", { score: 4, correct: true }) }), "c1")).toMatchObject({ score: 0, correct: false });
    expect(g(gradeExam(exam([cq()]), { c1: sel(["oct", "jan"], "temp-week") }), "c1")).toMatchObject({ score: 0, manualReview: false });
    expect(g(gradeExam(exam([cq({ answer: { scoring: "partial", correct: ["ghost"] } })]), { c1: sel(["oct"]) }), "c1")).toMatchObject({ score: 0, manualReview: true });
    expect(g(gradeExam(exam([cq({ chartSelection: { ...clone(CFG), chart: { ...rainfallBar(), formatter: "{b}" } } })]), { c1: sel(["oct"]) }), "c1")).toMatchObject({ score: 0, manualReview: true });
    expect(g(gradeExam(exam([cq({ questionTypeVersion: 2 })]), { c1: sel(["oct", "jan"]) }), "c1")).toMatchObject({ score: 0, manualReview: true });
  });
});

describe("21A1-S2 ingest (draft / submit)", () => {
  it("binds to the published question: rebuilt exactly, client fields dropped, chart order", () => {
    const { answers, rejected } = normalizeDraftAnswers({ c1: sel(["oct", "jan"], "rainfall-2020", { score: 4, coords: [{ x: 10, y: 20 }] }) }, exam([cq()]));
    expect(rejected).toEqual([]);
    expect(answers.c1).toEqual({ kind: "chartSelection", chartId: "rainfall-2020", targets: ["jan", "oct"] });
  });
  it("refuses impossible ids, duplicates, a foreign chart, too many targets, a chart answer on another question, a non-chart answer on a chart question, and a compound part", () => {
    const r = a => normalizeDraftAnswers({ c1: a }, exam([cq()])).rejected;
    expect(r(sel(["ghost"]))).toEqual([{ id: "c1", code: "CHART_SELECTION_TARGET_UNKNOWN" }]);
    expect(r(sel(["oct", "oct"]))).toEqual([{ id: "c1", code: "CHART_SELECTION_DUPLICATE" }]);
    expect(r(sel(["oct"], "temp-week"))).toEqual([{ id: "c1", code: "CHART_SELECTION_CHART_MISMATCH" }]);
    expect(r(sel(["jan", "feb", "mar", "apr"]))).toEqual([{ id: "c1", code: "CHART_SELECTION_TOO_MANY" }]);
    expect(r({ kind: "fields", values: { oct: "x" } })).toEqual([{ id: "c1", code: "CHART_SELECTION_ANSWER_INVALID" }]);
    const other = { examQuestionId: "t1", presentationType: "shortAnswer", text: "x", marks: 1, answer: { text: "y" } };
    expect(normalizeDraftAnswers({ t1: sel(["oct"]) }, exam([other])).rejected).toEqual([{ id: "t1", code: "CHART_SELECTION_QUESTION_MISMATCH" }]);
    const compound = { examQuestionId: "m1", presentationType: "compound", text: "x", marks: 2, parts: [{ id: "p1", type: "shortAnswer", text: "a", marks: 2, answer: { text: "b" } }] };
    expect(normalizeDraftAnswers({ m1: { kind: "compound", parts: { p1: sel(["oct"]) } } }, exam([compound])).rejected).toEqual([{ id: "m1.p1", code: "CHART_SELECTION_QUESTION_MISMATCH" }]);
    expect(normalizeDraftAnswers({ c1: sel(["oct"], "rainfall-2020", { extra: 1 }) }).answers.c1).toEqual(sel(["oct"]));   // unbound: shape only
  });
  it("answered ⇔ at least one target", () => {
    expect([isResponseAnswered(sel(["oct"])), isResponseAnswered(sel([])), isResponseAnswered({ kind: "chartSelection" })]).toEqual([true, false, false]);
  });
});

describe("21A1-S3 student delivery", () => {
  it("the sanitizer keeps the declarative chart (labels, values, units) and never the key, scoring or a smuggled field", () => {
    const out = sanitizeExamForStudent(exam([cq(), cq({ examQuestionId: "c2", chartSelection: { ...clone(CFG), correct: ["oct"] } })]));
    const [a, b] = out.sections[0].questions;
    expect(a.chartSelection).toEqual(CFG);
    expect(a.answer).toEqual({});
    expect(b.chartSelection).toBeUndefined();                                                            // smuggled key ⇒ withheld whole
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/"correct"|"scoring"|partial/);
    expect(json).toContain("يناير");
  });
});

describe("21A1-S4 composite part + shared chart source", () => {
  it("a composite with a rich source chart and a chartSelection part is delivered, bound and graded through the same authorities", () => {
    const q = compositeQ();
    const delivered = sanitizeExamForStudent(exam([q])).sections[0].questions[0];
    expect(delivered.composite.status).toBeUndefined();
    const part = delivered.composite.groups[0].parts[0];
    expect(part.chartSelection.chart.id).toBe("sales-combo");
    expect(JSON.stringify(delivered)).not.toMatch(/"q4"\]|"correct"/);
    expect(delivered.composite.contexts[0].sources[0].richContent.blocks[0].type).toBe("dataChart");
    const { answers, rejected } = normalizeDraftAnswers({ k1: { kind: "composite", parts: { p1: sel(["q4"], "sales-combo", { score: 9 }), p2: { kind: "numeric", value: "120" } }, contexts: {} } }, exam([q]));
    expect(rejected).toEqual([]);
    expect(answers.k1.parts.p1).toEqual(sel(["q4"], "sales-combo"));
    expect(normalizeDraftAnswers({ k1: { kind: "composite", parts: { p1: sel(["q9"], "sales-combo") }, contexts: {} } }, exam([q])).rejected).toEqual([{ id: "k1.p1", code: "CHART_SELECTION_TARGET_UNKNOWN" }]);
    const graded = g(gradeExam(exam([q]), answers), "k1");
    expect(graded).toMatchObject({ score: 6, manualReview: false });
  });
});

describe("21A1-S5 shared build", () => {
  it("the model is a shared entry and the committed build carries the chart authority with it", () => {
    expect(SHARED_ENTRIES).toContain("src/chartSelectionQuestion.ts");
    const built = require_("../src/lib/shared-finalization/chartSelectionQuestion.js");
    expect(built.scoreChartSelection({ config: CFG, answerKey: KEY, response: sel(["jan", "oct"]), maxMarks: 4 })).toMatchObject({ score: 4 });
    expect(typeof require_("../src/lib/shared-finalization/charts/chartSpec.js").validateChartSpec).toBe("function");
  });
  it("a scatter POINT question round-trips through ingest and grading by identity, never by coordinates", () => {
    const q = cq({ chartSelection: { v: 1, chart: scatterChart(), target: "point", mode: "single", maxSelections: 1 }, answer: { scoring: "allOrNothing", correct: ["out"] } });
    const { answers } = normalizeDraftAnswers({ c1: { kind: "chartSelection", chartId: "height-mass", targets: ["out"], x: 155, y: 95 } }, exam([q]));
    expect(answers.c1).toEqual({ kind: "chartSelection", chartId: "height-mass", targets: ["out"] });
    expect(g(gradeExam(exam([q]), answers), "c1")).toMatchObject({ score: 4, correct: true });
  });
});
