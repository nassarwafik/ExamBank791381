import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_CATALOG_VERSION, COMPOSER_ITEM_KINDS } from "./composerCatalog";
import { buildChartQuestionSchema, buildChartSelectionQuestion, chartQuestionRulesForPrompt, mentionsChartQuestion } from "./composerChartQuestion";
import { intentAllowedKinds, normalizeComposerIntent } from "./composerIntent";
import { normalizePlanShape, validatePlan } from "./composerPlan";
import { buildModifyPrompt, buildPlanPrompt, buildSectionPrompt } from "./composerPrompts";
import { runGeneration, type ComposerTransport } from "./composerRun";
import type { AiChartPolicy } from "./composerChart";
import { validateStructuredExam } from "../examQuality";
import { parseStructuredExamJson } from "../structuredExamImport";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21P — chartSelection@1 in the AI Full Exam Composer. The model writes a chart descriptor (21A.1 data policy) and a closed task;
// code builds the chart, picks the target kind and COMPUTES the key from the chart's numbers (unique extreme, or every value beyond a
// threshold that splits them), with allOrNothing scoring. The model never names the correct target.
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number } }).gradeExam;
type Json = Record<string, unknown>;
const REQUEST = "عدد الطلاب في الصفوف: السابع 30، الثامن 45، التاسع 25، العاشر 40";
const POLICY: AiChartPolicy = { request: REQUEST, illustrative: false, charts: true };
const ILLUSTRATIVE: AiChartPolicy = { request: "", illustrative: true, charts: true };
const desc = (over: Json = {}): Json => ({ kind: "bar", dataOrigin: "teacherProvided", title: "عدد الطلاب", description: "عدد الطلاب في كل صف.", categories: ["السابع", "الثامن", "التاسع", "العاشر"],
  series: [{ label: "الطلاب", values: [30, 45, 25, 40], mark: "bar" }], points: [], bins: [], boxes: [], xLabel: "الصف", yLabel: "عدد الطلاب", unit: "", stacked: false, horizontal: false, donut: false, ...over });
const cq = (task: string, threshold: number | null, chart: Json = desc(), text = "اختر من الرسم.") => ({ text, chart, task, threshold });
const build = (raw: unknown, policy: AiChartPolicy | undefined = POLICY, marks = 2) => buildChartSelectionQuestion(raw, "q1", marks, policy, "$.cq");
const ok = (raw: unknown, policy?: AiChartPolicy) => { const r = build(raw, policy); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.question as unknown as Json; };
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const examOf = (questions: Json[]) => ({ examId: "E21P", title: "t", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const blocking = (q: Json) => validateStructuredExam(examOf([q]) as never).filter(i => i.severity === "error");
const pick = (...targets: string[]) => ({ kind: "chartSelection", chartId: "chart1", targets });
const score = (q: Json, a: unknown) => gradeExam(examOf([q]), { q1: a }).score;
const cfg = (q: Json) => q.chartSelection as { target: string; mode: string; maxSelections: number; chart: { kind: string } };

describe("21P-CAT chartSelection joins the catalog", () => {
  it("catalog V10, chartSelection is its stored key, auto-graded; the general catalog stays bounded; the rules travel on demand", () => {
    expect(COMPOSER_CATALOG_VERSION).toBe("AI_COMPOSER_CATALOG_V10");
    expect(COMPOSER_ITEM_KINDS).toContain("chartSelection");
    const t = buildComposerCatalog().questionTypes.find(x => x.kind === "chartSelection")!;
    expect([t.key, t.version, t.autoGraded]).toEqual(["chartSelection", 1, true]);
    const p = catalogForPrompt();
    expect(p.length).toBeLessThanOrEqual(9000);
    expect(p).toContain("numericResponse@1 (one number, bounded tolerance) | chartSelection@1 (select on a chart; code computes the key) | smartSim@1");
    expect(p).not.toContain("CHART QUESTION RULES");
  });
  it("the wire offers no key field: the task and threshold only; kind / task are code-checked strings", () => {
    const s = buildChartQuestionSchema() as { properties: Record<string, { type?: string; properties?: Record<string, { type?: string }> }> };
    expect(Object.keys(s.properties)).toEqual(["text", "chart", "task", "threshold"]);
    expect(s.properties.task.type).toBe("string");
    expect(s.properties.chart.properties!.kind.type).toBe("string");
  });
  it("a chart question needs the charts AND rich-content toggles (the AI chart policy)", () => {
    const of = (caps: Json) => { const r = normalizeComposerIntent({ v: 1, subject: "s", totalMarks: 10, capabilities: caps }); if (!r.ok) throw new Error("intent"); return intentAllowedKinds(r.intent); };
    expect(of({})).toContain("chartSelection");
    expect(of({ charts: false })).not.toContain("chartSelection");
    expect(of({ richContent: false })).not.toContain("chartSelection");
  });
});

describe("21P-KEY code computes the key from the chart's numbers", () => {
  it("bar, one series, max: the student picks one category; correct = full, any other = 0, empty = 0", () => {
    const q = ok(cq("max", null));
    expect([cfg(q).target, cfg(q).mode, cfg(q).maxSelections, cfg(q).chart.kind]).toEqual(["category", "single", 1, "bar"]);
    expect(q.answer).toEqual({ scoring: "allOrNothing", correct: ["c2"] });
    expect(blocking(q)).toEqual([]);
    expect(score(q, pick("c2"))).toBe(2);
    expect(score(q, pick("c4"))).toBe(0);
    expect(score(q, null)).toBe(0);
  });
  it("min picks the smallest; above / below pick every value beyond the threshold; select-all = 0 (allOrNothing)", () => {
    expect(ok(cq("min", null)).answer).toEqual({ scoring: "allOrNothing", correct: ["c3"] });
    const above = ok(cq("above", 35));
    expect([cfg(above).mode, cfg(above).maxSelections]).toEqual(["multiple", 4]);
    expect(above.answer).toEqual({ scoring: "allOrNothing", correct: ["c2", "c4"] });
    expect(blocking(above)).toEqual([]);
    expect(score(above, pick("c2", "c4"))).toBe(2);
    expect(score(above, pick("c1", "c2", "c3", "c4"))).toBe(0);
    expect(score(above, pick("c2"))).toBe(0);
    expect(ok(cq("below", 35)).answer).toEqual({ scoring: "allOrNothing", correct: ["c1", "c3"] });
  });
  it("pie → slices, histogram → bins, several series → single values (seriesId/categoryId)", () => {
    const pie = ok(cq("max", null, desc({ kind: "pie" })));
    expect([cfg(pie).target, pie.answer]).toEqual(["category", { scoring: "allOrNothing", correct: ["p2"] }]);
    expect(blocking(pie)).toEqual([]);
    const hist = ok(cq("above", 3, desc({ kind: "histogram", dataOrigin: "illustrative", categories: [], series: [], bins: [{ start: 0, end: 10, count: 2 }, { start: 10, end: 20, count: 5 }, { start: 20, end: 30, count: 4 }] }), "اختر الفئات."), ILLUSTRATIVE);
    expect([cfg(hist).target, hist.answer]).toEqual(["bin", { scoring: "allOrNothing", correct: ["b2", "b3"] }]);
    expect(blocking(hist)).toEqual([]);
    const two = ok(cq("max", null, desc({ dataOrigin: "illustrative", categories: ["أ", "ب"], series: [{ label: "2023", values: [3, 9], mark: "bar" }, { label: "2024", values: [7, 4], mark: "bar" }] })), ILLUSTRATIVE);
    expect([cfg(two).target, two.answer]).toEqual(["datum", { scoring: "allOrNothing", correct: ["s1/c2"] }]);
    expect(blocking(two)).toEqual([]);
  });
});

describe("21P-RULES refusals (never repaired into validity)", () => {
  it("ties, a threshold on a value, a threshold that selects nothing or everything, a stray threshold, a missing one", () => {
    expect(codes(build(cq("max", null, desc({ dataOrigin: "illustrative", series: [{ label: "x", values: [45, 45, 25, 40], mark: "bar" }] })), ILLUSTRATIVE))).toEqual(["AI_CHARTQ_TIE"]);
    expect(codes(build(cq("above", 40)))).toEqual(["AI_CHARTQ_THRESHOLD"]);
    expect(codes(build(cq("above", 100)))).toEqual(["AI_CHARTQ_THRESHOLD"]);
    expect(codes(build(cq("below", 100)))).toEqual(["AI_CHARTQ_THRESHOLD"]);
    expect(codes(build(cq("max", 10)))).toEqual(["AI_CHARTQ_THRESHOLD"]);
    expect(codes(build(cq("above", null)))).toEqual(["AI_CHARTQ_THRESHOLD"]);
  });
  it("unsupported chart kinds, empty values, unknown task / kind strings", () => {
    expect(codes(build(cq("max", null, desc({ dataOrigin: "illustrative", kind: "scatter", categories: [], series: [{ label: "s", values: [], mark: "bar" }], points: [{ series: 1, x: 1, y: 2, label: "" }, { series: 1, x: 2, y: 3, label: "" }] })), ILLUSTRATIVE))).toEqual(["AI_CHARTQ_KIND"]);
    expect(codes(build(cq("max", null, desc({ dataOrigin: "illustrative", series: [{ label: "x", values: [30, null, 25, 40], mark: "bar" }] })), ILLUSTRATIVE))).toEqual(["AI_CHARTQ_KIND"]);
    expect(codes(build(cq("median", null)))).toEqual(["AI_CHARTQ_MALFORMED"]);
    expect(codes(build(cq("max", null, desc({ kind: "bubble" }))))).toEqual(["AI_CHART_MALFORMED"]);
  });
  it("the 21A.1 data policy holds: invented numbers need consent, teacher numbers must come from the request, no policy = refused", () => {
    expect(codes(build(cq("max", null, desc({ dataOrigin: "illustrative" }))))).toEqual(["AI_CHART_ILLUSTRATIVE_NOT_ALLOWED"]);
    expect(codes(build(cq("max", null, desc({ series: [{ label: "x", values: [30, 46, 25, 40], mark: "bar" }] }))))).toEqual(["AI_CHART_DATA_NOT_PROVIDED"]);
    expect(codes(buildChartSelectionQuestion(cq("max", null), "q1", 2, undefined, "$.cq"))).toEqual(["AI_CHART_POLICY_MISSING"]);
    expect(codes(build({ ...cq("max", null), correct: ["c2"] }))).toEqual(["AI_CHARTQ_MALFORMED"]);
  });
});

const INTENT = { v: 1, subject: "الإحصاء", totalMarks: 6, teacherInstruction: REQUEST };
const PLAN = F.plan("قراءة الرسوم", "default", [F.planSection("أ", [F.planItem("chartSelection", 2), F.planItem("chartSelection", 2), F.planItem("multipleChoice", 2)])]);
const SECTION = { items: [
  F.item("chartSelection", { chartQuestion: cq("max", null, desc(), "أي صف فيه أكبر عدد من الطلاب؟") }),
  F.item("chartSelection", { chartQuestion: cq("above", 35, desc(), "اختر كل الصفوف التي يزيد عدد طلابها على 35.") }),
  F.item("multipleChoice", { question: F.mcq("ما نوع هذا الرسم؟", ["أعمدة", "دائري"]) })
] };
function transportFor(script: Record<string, unknown[]>) {
  const ai = F.scriptedAi(script);
  const t: ComposerTransport = async b => (await composerApi.handler({ json: async () => b }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-21p" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => "2026-11-09T00:00:00.000Z" })).jsonBody;
  return { t, calls: ai.calls };
}

describe("21P-E2E plan → section → canonical exam through the real endpoint", () => {
  it("clean verdict, round trip, no key reaches the student; correct = 6/6, select-all and empty = 0", async () => {
    const { t, calls } = transportFor({ ai_exam_plan: [PLAN], ai_exam_section: [SECTION] });
    const r = await runGeneration(t, INTENT, { examId: "EXAM-21P", report: () => {}, nonce: "n21p00" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam as StructuredExam;
    expect(validateStructuredExam(exam).filter(i => i.severity === "error")).toEqual([]);
    const qs = exam.sections[0].questions as unknown as Json[];
    expect(qs.map(q => [q.presentationType, q.marks])).toEqual([["chartSelection", 2], ["chartSelection", 2], ["multipleChoice", 2]]);
    const imp = parseStructuredExamJson(JSON.stringify(exam), "chart-21p.json");
    expect(imp.canOpen).toBe(true);
    expect(imp.validationErrors).toEqual([]);
    const student = JSON.stringify(sanitize(exam));
    expect(student).not.toMatch(/"(correct|correctOptionIndex|scoring)"\s*:/);
    expect(student).toContain("الثامن");
    expect(calls.find(c => c.schemaName === "ai_exam_plan")!.prompt).not.toContain(chartQuestionRulesForPrompt());
    expect(calls.find(c => c.schemaName === "ai_exam_section")!.prompt).toContain(chartQuestionRulesForPrompt());
    const id = (i: number) => qs[i].examQuestionId as string;
    const mcqKey = (qs[2].answer as { correctOptionIndex: number }).correctOptionIndex;
    expect(gradeExam(exam, { [id(0)]: pick("c2"), [id(1)]: pick("c2", "c4"), [id(2)]: { kind: "choice", index: mcqKey } }).score).toBe(6);
    expect(gradeExam(exam, { [id(1)]: pick("c1", "c2", "c3", "c4") }).score).toBe(0);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
});

describe("21P-PROMPT the rules travel on demand", () => {
  it("only sections that plan a chartSelection question, and modify prompts that mention one, carry the rules", () => {
    const x = normalizeComposerIntent(INTENT); if (!x.ok) throw new Error("intent");
    const s = normalizePlanShape(F.plan("p", "default", [F.planSection("أ", [F.planItem("chartSelection", 3)]), F.planSection("ب", [F.planItem("multipleChoice", 3)])]));
    if (!s.ok) throw new Error("plan");
    const plan = validatePlan(s.plan, x.intent).plan;
    expect(buildPlanPrompt(x.intent)).not.toContain(chartQuestionRulesForPrompt());
    expect(buildSectionPrompt(x.intent, plan, 0)).toContain(chartQuestionRulesForPrompt());
    expect(buildSectionPrompt(x.intent, plan, 1)).not.toContain(chartQuestionRulesForPrompt());
    const empty = { v: 1, examId: "E", title: "t", sections: [] } as never;
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "أضف سؤال اختيار من رسم بياني عن الأمطار")).toContain(chartQuestionRulesForPrompt());
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "add a Python loops section")).not.toContain(chartQuestionRulesForPrompt());
    expect(mentionsChartQuestion(JSON.stringify({ type: "chartSelection" }))).toBe(true);
  });
});
