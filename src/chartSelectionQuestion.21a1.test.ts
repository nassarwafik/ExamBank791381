import { describe, it, expect } from "vitest";
import {
  bindChartSelectionAnswerToQuestion, evaluateChartSelection, isChartSelectionAnswerAnswered, normalizeChartSelectionAnswer, projectChartSelectionConfigForStudent,
  scoreChartSelection, validateChartSelectionAnswerKey, validateChartSelectionConfig, validateChartSelectionQuestion
} from "./chartSelectionQuestion";
import { validateQuestionTypeNode } from "./questionTypeValidation";
import { applyRegisteredTypeDefaults } from "./questionTypeDefaults";
import { questionTypeDefinition } from "./questionTypeCatalog";
import { boxplotChart, donutChart, heatmapChart, histogramChart, radarChart, rainfallBar, scatterChart, temperatureLine } from "./charts/testing/chartFixtures";
import type { CategoryChartSpec, ChartSpecV1 } from "./charts/chartSpec";

// Phase 21A.1 — chartSelection@1 (the chart as an ANSWER SURFACE): strict public config / private key, the ingest binder, the grader (exact
// single, exact multiple, range; partial = |S ∩ K| / |S ∪ K|), the student projection and the teacher evaluation. Grading reads semantic
// target keys only — never coordinates — and fails closed (manual review) on any broken authority.
const cfg = (over: Record<string, unknown> = {}) => ({ v: 1, chart: rainfallBar(), target: "category", mode: "single", maxSelections: 1, ...over });
const key = (over: Record<string, unknown> = {}) => ({ scoring: "allOrNothing", correct: ["oct"], ...over });
const ans = (targets: unknown[], chartId: unknown = "rainfall-2020", extra: Record<string, unknown> = {}) => ({ kind: "chartSelection", chartId, targets, ...extra });
const score = (c: unknown, k: unknown, r: unknown, maxMarks = 4) => scoreChartSelection({ config: c, answerKey: k, response: r, maxMarks });
const codes = (r: { ok: boolean; issues: { code: string }[] }) => r.issues.map(i => i.code);

describe("21A1-CS1 public config", () => {
  it("accepts every target kind a chart offers, rebuilds a canonical copy, and refuses unknown fields", () => {
    const cases: [ChartSpecV1, string][] = [[rainfallBar(), "category"], [temperatureLine(), "series"], [temperatureLine(), "datum"], [scatterChart(), "point"], [histogramChart(), "bin"], [radarChart(), "series"], [donutChart(), "category"], [boxplotChart(), "category"]];
    for (const [chart, target] of cases) {
      const r = validateChartSelectionConfig(cfg({ chart, target }));
      expect(r.issues, chart.kind + "/" + target).toEqual([]);
      if (r.ok) expect(r.config).toEqual({ v: 1, chart, target, mode: "single", maxSelections: 1 });
    }
    expect(codes(validateChartSelectionConfig({ ...cfg(), correct: ["oct"] }))).toContain("CHART_SELECTION_UNKNOWN_KEY");
    expect(codes(validateChartSelectionConfig({ ...cfg(), option: {} }))).toContain("CHART_SELECTION_UNKNOWN_KEY");
  });
  it("refusals: version, invalid chart (path into the chart), unsupported target, heat map, range on series, bounds, markup label, missing", () => {
    expect(codes(validateChartSelectionConfig(cfg({ v: 2 })))).toContain("CHART_SELECTION_VERSION");
    const bad = validateChartSelectionConfig(cfg({ chart: { ...rainfallBar(), title: "<script>x</script>" } }));
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]).toMatchObject({ code: "CHART_SELECTION_CHART_INVALID", path: "chartSelection.chart.title" });
    expect(codes(validateChartSelectionConfig(cfg({ target: "point" })))).toContain("CHART_SELECTION_TARGET_UNSUPPORTED");
    expect(codes(validateChartSelectionConfig(cfg({ chart: heatmapChart(), target: "category" })))).toContain("CHART_SELECTION_TARGET_UNSUPPORTED");
    expect(codes(validateChartSelectionConfig(cfg({ target: "anything" })))).toContain("CHART_SELECTION_TARGET_INVALID");
    expect(codes(validateChartSelectionConfig(cfg({ chart: temperatureLine(), target: "series", mode: "range", maxSelections: 2 })))).toContain("CHART_SELECTION_RANGE_UNSUPPORTED");
    expect(codes(validateChartSelectionConfig(cfg({ maxSelections: 2 })))).toContain("CHART_SELECTION_MAX_INVALID");               // single ⇒ 1
    expect(codes(validateChartSelectionConfig(cfg({ mode: "multiple", maxSelections: 13 })))).toContain("CHART_SELECTION_MAX_INVALID");   // > 12 months
    expect(codes(validateChartSelectionConfig(cfg({ mode: "multiple", maxSelections: 1.5 })))).toContain("CHART_SELECTION_MAX_INVALID");
    expect(codes(validateChartSelectionConfig(cfg({ mode: "toggle" })))).toContain("CHART_SELECTION_MODE_INVALID");
    expect(codes(validateChartSelectionConfig(cfg({ label: "<img src=x onerror=alert(1)> اختر" })))).toContain("CHART_SELECTION_LABEL_INVALID");
    expect(codes(validateChartSelectionConfig(cfg({ label: "   " })))).toContain("CHART_SELECTION_LABEL_INVALID");
    const one = rainfallBar() as CategoryChartSpec;
    one.categories = one.categories.slice(0, 1); one.series[0].values = one.series[0].values.slice(0, 1);
    expect(codes(validateChartSelectionConfig(cfg({ chart: one, referenceLines: undefined })))).toContain("CHART_SELECTION_UNKNOWN_KEY");
    expect(codes(validateChartSelectionConfig(cfg({ chart: one })))).toContain("CHART_SELECTION_TARGETS_TOO_FEW");
    for (const raw of [undefined, null, "x", [], 5]) expect(codes(validateChartSelectionConfig(raw))).toEqual(["CHART_SELECTION_CONFIG_MISSING"]);
  });
});

describe("21A1-CS2 private key", () => {
  it("valid keys are canonical (chart order); single needs exactly one; the key must be reachable; a range must be contiguous", () => {
    expect(validateChartSelectionAnswerKey(key(), cfg())).toMatchObject({ ok: true, key: { scoring: "allOrNothing", correct: ["oct"] } });
    const multi = cfg({ mode: "multiple", maxSelections: 3 });
    expect(validateChartSelectionAnswerKey(key({ correct: ["nov", "jan", "oct"] }), multi)).toMatchObject({ ok: true, key: { correct: ["jan", "oct", "nov"] } });
    expect(codes(validateChartSelectionAnswerKey(key({ correct: ["jan", "oct"] }), cfg()))).toContain("CHART_SELECTION_KEY_SINGLE");
    expect(codes(validateChartSelectionAnswerKey(key({ correct: [] }), cfg()))).toContain("CHART_SELECTION_KEY_EMPTY");
    expect(codes(validateChartSelectionAnswerKey(key({ correct: ["oct", "oct"] }), multi))).toContain("CHART_SELECTION_KEY_DUPLICATE");
    expect(codes(validateChartSelectionAnswerKey(key({ correct: ["octo"] }), cfg()))).toContain("CHART_SELECTION_KEY_UNKNOWN_TARGET");
    expect(codes(validateChartSelectionAnswerKey(key({ correct: ["jan", "feb", "mar", "apr"] }), multi))).toContain("CHART_SELECTION_KEY_UNREACHABLE");
    const range = cfg({ mode: "range", maxSelections: 12 });
    expect(validateChartSelectionAnswerKey(key({ correct: ["may", "jun", "jul", "aug"] }), range).ok).toBe(true);
    expect(codes(validateChartSelectionAnswerKey(key({ correct: ["may", "jul"] }), range))).toContain("CHART_SELECTION_KEY_RANGE");
    expect(codes(validateChartSelectionAnswerKey(key({ scoring: "partial" }), cfg()))).toContain("CHART_SELECTION_SCORING_UNKNOWN");
    expect(codes(validateChartSelectionAnswerKey(key({ scoring: "bonus" }), multi))).toContain("CHART_SELECTION_SCORING_UNKNOWN");
    expect(codes(validateChartSelectionAnswerKey({ ...key(), weights: {} }, cfg()))).toContain("CHART_SELECTION_KEY_INVALID");
    expect(codes(validateChartSelectionAnswerKey(key(), cfg({ v: 9 })))).toEqual(["CHART_SELECTION_KEY_CONFIG_INVALID"]);
  });
  it("finalization runs the same rules through the type registry; a fresh question (no chart yet) is blocked, never silently accepted", () => {
    expect(validateChartSelectionQuestion({ presentationType: "chartSelection", questionTypeVersion: 1, chartSelection: cfg(), answer: key() })).toEqual([]);
    const node: Record<string, unknown> = { presentationType: "chartSelection", questionTypeVersion: 1 };
    expect(applyRegisteredTypeDefaults("chartSelection", 1, (k, v) => { if (!(k in node)) node[k] = v; }, p => p + "1")).toBe(true);
    expect(node.chartSelection).toEqual({ v: 1, target: "category", mode: "single", maxSelections: 1 });
    expect(validateQuestionTypeNode(node, "chartSelection", 1).map(i => i.code)).toEqual(["CHART_SELECTION_CHART_INVALID"]);           // the key is judged once a chart exists
    expect(validateChartSelectionQuestion({ presentationType: "chartSelection", questionTypeVersion: 2, chartSelection: cfg(), answer: key() }).map(i => i.code)).toContain("CHART_SELECTION_VERSION_UNSUPPORTED");
  });
  it("catalog identity: auto-graded, partial credit, interactive, offline; not a compound part; no image", () => {
    const d = questionTypeDefinition("chartSelection")!;
    expect([d.version, d.label, d.category, d.gradingMode, d.responseKinds]).toEqual([1, "اختيار من رسم بياني", "interactive", "auto", ["chartSelection"]]);
    expect(d.capabilities).toEqual({ autoGrading: true, manualGrading: false, hybridGrading: false, partialCredit: true, compoundPart: false, interactive: true, requiresImage: false, offline: true });
  });
});

describe("21A1-CS3 ingest binding", () => {
  const q = (over: Record<string, unknown> = {}) => ({ presentationType: "chartSelection", chartSelection: cfg({ mode: "multiple", maxSelections: 3 }), answer: key(), ...over });
  it("rebuilds exactly { kind, chartId, targets } in chart order; client score / coordinates / extra fields are dropped", () => {
    expect(bindChartSelectionAnswerToQuestion(ans(["nov", "jan"], "rainfall-2020", { score: 4, x: 120, y: 33, correct: true }), q())).toEqual({ ok: true, answer: { kind: "chartSelection", chartId: "rainfall-2020", targets: ["jan", "nov"] } });
    expect(bindChartSelectionAnswerToQuestion(ans([]), q())).toEqual({ ok: true, answer: { kind: "chartSelection", chartId: "rainfall-2020", targets: [] } });
  });
  it("refuses another chart, unknown / duplicate / non-string targets, too many targets, a broken range and malformed shapes — never repaired", () => {
    const c = (a: unknown, over?: Record<string, unknown>) => { const r = bindChartSelectionAnswerToQuestion(a, q(over)); return r.ok ? "ok" : r.code; };
    expect(c(ans(["oct"], "temp-week"))).toBe("CHART_SELECTION_CHART_MISMATCH");
    expect(c(ans(["octo"]))).toBe("CHART_SELECTION_TARGET_UNKNOWN");
    expect(c(ans(["rain/oct"]))).toBe("CHART_SELECTION_TARGET_UNKNOWN");
    expect(c(ans(["oct", "oct"]))).toBe("CHART_SELECTION_DUPLICATE");
    expect(c(ans(["jan", "feb", "mar", "apr"]))).toBe("CHART_SELECTION_TOO_MANY");
    expect(c(ans([7]))).toBe("CHART_SELECTION_ANSWER_INVALID");
    expect(c(ans(["__proto__"]))).toBe("CHART_SELECTION_ANSWER_INVALID");                                  // not even a well-formed target key
    expect(c(ans(["jan", "mar"]), { chartSelection: cfg({ mode: "range", maxSelections: 12 }) })).toBe("CHART_SELECTION_RANGE_INVALID");
    for (const bad of [null, "x", { kind: "fields", values: {} }, { kind: "chartSelection", chartId: "rainfall-2020" }, { kind: "chartSelection", chartId: 5, targets: [] }, { kind: "chartSelection", chartId: "a b", targets: [] }])
      expect(c(bad)).toBe("CHART_SELECTION_ANSWER_INVALID");
    expect(c({ kind: "chartSelection", chartId: "rainfall-2020", targets: Array.from({ length: 501 }, (_, i) => "t" + i) })).toBe("CHART_SELECTION_TOO_MANY");
  });
  it("a defective published config keeps a shape-valid answer (the student's work survives a teacher defect; grading still fails closed)", () => {
    expect(bindChartSelectionAnswerToQuestion(ans(["oct"]), q({ chartSelection: { v: 1, target: "category" } }))).toEqual({ ok: true, answer: { kind: "chartSelection", chartId: "rainfall-2020", targets: ["oct"] } });
    expect(normalizeChartSelectionAnswer(ans(["rain/oct", "x1"]))).toEqual({ ok: true, answer: ans(["rain/oct", "x1"]) });
    expect(normalizeChartSelectionAnswer(ans(["a/b/c"]))).toEqual({ ok: false, code: "CHART_SELECTION_ANSWER_INVALID" });
    expect([isChartSelectionAnswerAnswered(ans(["oct"])), isChartSelectionAnswerAnswered(ans([])), isChartSelectionAnswerAnswered({ kind: "fields" })]).toEqual([true, false, false]);
  });
});

describe("21A1-CS4 grading (semantic, deterministic, fail closed)", () => {
  it("exact single: the key earns full marks, anything else 0; unanswered is an ordinary 0", () => {
    expect(score(cfg(), key(), ans(["oct"]))).toEqual({ score: 4, correct: true, manualReview: false, parts: { correct: 1, total: 1 } });
    expect(score(cfg(), key(), ans(["jan"]))).toMatchObject({ score: 0, correct: false, manualReview: false });
    expect(score(cfg(), key(), ans([]))).toMatchObject({ score: 0, manualReview: false });
    expect(score(cfg(), key(), undefined)).toMatchObject({ score: 0, manualReview: false });
  });
  it("exact multiple (allOrNothing) ignores order and pays only the exact set; partial = |S ∩ K| / |S ∪ K| (selecting every target earns |K| / |T|)", () => {
    const m = cfg({ mode: "multiple", maxSelections: 12 }), k = key({ correct: ["jan", "oct"] }), kp = key({ scoring: "partial", correct: ["jan", "oct"] });
    expect(score(m, k, ans(["oct", "jan"])).score).toBe(4);
    expect(score(m, k, ans(["jan"])).score).toBe(0);
    expect(score(m, k, ans(["jan", "oct", "nov"])).score).toBe(0);
    expect(score(m, kp, ans(["jan"])).score).toBe(2);                                                   // 1 / 2
    expect(score(m, kp, ans(["jan", "oct", "nov"])).score).toBeCloseTo(4 * 2 / 3, 10);                // 2 / 3
    expect(score(m, kp, ans(["feb", "mar"])).score).toBe(0);
    const all = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    expect(score(m, kp, ans(all)).score).toBeCloseTo(4 * 2 / 12, 10);
    expect(score(m, kp, ans(["oct", "jan"]))).toMatchObject({ score: 4, correct: true, parts: { correct: 2, total: 2 } });
  });
  it("range: the dry season is a contiguous run; partial credit by overlap; a non-contiguous response is malformed (0, no review)", () => {
    const r = cfg({ mode: "range", maxSelections: 12 }), k = key({ correct: ["may", "jun", "jul", "aug"] }), kp = key({ scoring: "partial", correct: ["may", "jun", "jul", "aug"] });
    expect(score(r, k, ans(["may", "jun", "jul", "aug"])).score).toBe(4);
    expect(score(r, kp, ans(["jun", "jul", "aug", "sep"])).score).toBeCloseTo(4 * 3 / 5, 10);
    expect(score(r, kp, ans(["may", "jul"]))).toMatchObject({ score: 0, manualReview: false });
  });
  it("point and datum targets grade by identity; another chart, duplicates and unknown targets are malformed (ordinary 0)", () => {
    expect(score(cfg({ chart: scatterChart(), target: "point" }), key({ correct: ["out"] }), ans(["out"], "height-mass")).score).toBe(4);
    expect(score(cfg({ chart: temperatureLine(), target: "datum" }), key({ correct: ["tmin/thu"] }), ans(["tmin/thu"], "temp-week")).score).toBe(4);
    expect(score(cfg(), key(), ans(["oct"], "other-chart"))).toMatchObject({ score: 0, manualReview: false });
    expect(score(cfg({ mode: "multiple", maxSelections: 2 }), key(), ans(["oct", "oct"]))).toMatchObject({ score: 0, manualReview: false });
    expect(score(cfg(), key(), ans(["dec "]))).toMatchObject({ score: 0, manualReview: false });
  });
  it("a broken config or key fails CLOSED to teacher review (never a silent academic zero, never full credit)", () => {
    expect(score(cfg({ v: 2 }), key(), ans(["oct"]))).toEqual({ score: 0, correct: false, manualReview: true, parts: { correct: 0, total: 0 } });
    expect(score(cfg(), key({ correct: ["nope"] }), ans(["nope"]))).toMatchObject({ score: 0, manualReview: true });
    expect(score(cfg(), undefined, ans(["oct"]))).toMatchObject({ score: 0, manualReview: true });
    expect(score(cfg(), key(), ans(["oct"]), Number.NaN).score).toBe(0);
    expect(score(cfg(), key(), ans(["oct"]), -3).score).toBe(0);
  });
});

describe("21A1-CS5 projection and teacher evaluation", () => {
  it("the student projection is the canonical public config only; a config smuggling a key is withheld whole", () => {
    expect(projectChartSelectionConfigForStudent(cfg())).toEqual(cfg());
    expect(projectChartSelectionConfigForStudent({ ...cfg(), correct: ["oct"] })).toBeNull();
    expect(projectChartSelectionConfigForStudent({ ...cfg(), chart: { ...rainfallBar(), answer: "oct" } })).toBeNull();
    expect(JSON.stringify(projectChartSelectionConfigForStudent(cfg()))).not.toMatch(/correct|scoring/);
  });
  it("evaluation marks every target: ✓ selected & correct, ✗ selected only, missed correct only", () => {
    const e = evaluateChartSelection(cfg({ mode: "multiple", maxSelections: 3 }), key({ correct: ["jan", "oct"] }), ans(["oct", "feb"]));
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.results.filter(r => r.mark).map(r => [r.key, r.mark])).toEqual([["jan", "missed"], ["feb", "incorrect"], ["oct", "correct"]]);
      expect([e.correct, e.total, e.exact]).toEqual([1, 2, false]);
    }
    expect(evaluateChartSelection(cfg({ v: 3 }), key(), ans(["oct"])).ok).toBe(false);
  });
});
