import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_CATALOG_VERSION, COMPOSER_ITEM_KINDS, COMPOSER_STRUCTURED_TYPES } from "./composerCatalog";
import { buildStructuredBody, buildStructuredSchema, isDerangement, mentionsStructuredKinds, structuredRulesForPrompt } from "./composerStructured";
import { buildModifyPrompt, buildPlanPrompt, buildSectionPrompt } from "./composerPrompts";
import { normalizeComposerIntent } from "./composerIntent";
import { normalizePlanShape, validatePlan } from "./composerPlan";
import { buildItemSchema, normalizeSectionDraft } from "./composerDraft";
import { runGeneration, type ComposerTransport } from "./composerRun";
import { validateStructuredExam } from "../examQuality";
import { parseStructuredExamJson } from "../structuredExamImport";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21N — the composer generates multipleSelect@1, matching@1, ordering@1 and categorization@1 (questions and composite child parts).
// The model writes content only; code owns ids, option order, the shuffled display order and every answer key, in the exact shape the
// structured builder writes. No free credit: "select all", "1, 2, 3 …" and "option k for row k" earn nothing; every category is used.
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number; questions: { score: number; maxMarks: number }[] } }).gradeExam;
type Json = Record<string, unknown>;
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const body = (kind: (typeof COMPOSER_STRUCTURED_TYPES)[number], over: Json, part = false) => buildStructuredBody(F.structured(over), kind, "aiq-1-1", "$.s", "aiq-1-1", part);
const node = (kind: (typeof COMPOSER_STRUCTURED_TYPES)[number], over: Json, part = false) => { const b = body(kind, over, part); if (!b.ok) throw new Error(JSON.stringify(b.issues)); return b.node as Json; };
const examOf = (questions: Json[]) => ({ examId: "E21N", title: "t", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const asQuestion = (n: Json, id: string, marks: number) => ({ examQuestionId: id, marks, ...n });
const blocking = (questions: Json[]) => validateStructuredExam(examOf(questions) as never).filter(i => i.severity === "error");
const score = (q: Json, answer: unknown) => gradeExam(examOf([q]), { [q.examQuestionId as string]: answer }).score;

const MS = { text: "اختر كل البروتوكولات التي تعمل في طبقة النقل.", options: ["TCP", "UDP", "IP", "HTTP"], correctOptions: [0, 1] };
const MATCH = { text: "صِل كل بروتوكول بطبقته.", pairs: [{ left: "HTTP", right: "التطبيقات" }, { left: "TCP", right: "النقل" }, { left: "IP", right: "الشبكة" }], distractors: ["الجلسة"] };
const ORDER = { text: "رتّب مراحل DHCP.", sequence: ["Discover", "Offer", "Request", "Acknowledge"] };
const CAT = { text: "صنّف الأجهزة حسب الطبقة.", categories: ["الطبقة الثانية", "الطبقة الثالثة"], entries: [{ label: "Switch", category: 0 }, { label: "Router", category: 1 }, { label: "Bridge", category: 0 }, { label: "L3 Switch", category: 1 }] };

describe("21N-CAT the four structured kinds join the catalog", () => {
  it("catalog V7, every kind is its stored key at the authoring version; the Item kinds line is compact and the general catalog stays bounded", () => {
    expect(COMPOSER_CATALOG_VERSION).toBe("AI_COMPOSER_CATALOG_V7");
    const c = buildComposerCatalog();
    for (const k of COMPOSER_STRUCTURED_TYPES) { expect(COMPOSER_ITEM_KINDS).toContain(k); const t = c.questionTypes.find(x => x.kind === k)!; expect([t.key, t.version, t.autoGraded, t.compositeChild]).toEqual([k, 1, true, true]); }
    const p = catalogForPrompt(c);
    expect(p.length).toBeLessThanOrEqual(9000);
    const line = p.split("\n").find(l => l.startsWith("Item kinds"))!;
    expect(line).toContain("multipleSelect@1 (several correct options) | matching@1 (one-to-one pairs) | ordering@1 (a sequence, given in its correct order) | categorization@1 (items sorted into categories) | smartSim@1");
    expect(line).toContain("coding@2 manual (public material only");
    expect(p).not.toContain("STRUCTURED QUESTION RULES");
  });
  it("the wire schema offers only the scorings that refuse 'select every option'", () => {
    const s = buildStructuredSchema() as { properties: Record<string, { enum?: string[] }> };
    expect(s.properties.scoring.enum).toEqual(["allOrNothing", "partialWithPenalty"]);
    const item = buildItemSchema() as { properties: Record<string, unknown> };
    expect(Object.keys(item.properties)).toContain("structured");
  });
});

describe("21N-BUILD code-owned shapes, validated by the production validators and graded by the production grader", () => {
  it("multipleSelect: code ids, sorted key, clean validation; correct = full, select-all = 0 (both scorings), partial with penalty", () => {
    const q = asQuestion(node("multipleSelect", MS), "q1", 4);
    expect(q).toMatchObject({ presentationType: "multipleSelect", questionTypeVersion: 1, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }, { id: "o4", text: "HTTP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "allOrNothing" } });
    expect(blocking([q])).toEqual([]);
    const pick = (...ids: string[]) => ({ kind: "multiChoice", optionIds: ids });
    expect(score(q, pick("o1", "o2"))).toBe(4);
    expect(score(q, pick("o1", "o2", "o3", "o4"))).toBe(0);
    const pen = asQuestion(node("multipleSelect", { ...MS, scoring: "partialWithPenalty" }), "q2", 4);
    expect(score(pen, pick("o1", "o2", "o3", "o4"))).toBe(0);
    expect(score(pen, pick("o1"))).toBe(2);
    expect(score(pen, null)).toBe(0);
  });
  it("ordering: the display order is a derangement of the correct order; correct = full, 1..N in display order = 0, empty = 0", () => {
    const n = node("ordering", ORDER);
    const fields = n.fields as { label: string; correct: string }[];
    expect(n.wordBank).toEqual(["1", "2", "3", "4"]);
    expect(fields.map(f => f.label).sort()).toEqual([...ORDER.sequence].sort());
    expect(fields.every(f => f.label !== ORDER.sequence[Number(f.correct) - 1] ? false : true)).toBe(true);
    expect(fields.every((f, k) => Number(f.correct) - 1 !== k)).toBe(true);                   // no item starts at its own position
    expect(n.answer).toEqual({ mode: "exactSequence", values: fields.map(f => f.correct) });
    const q = asQuestion(n, "q1", 4);
    expect(blocking([q])).toEqual([]);
    expect(score(q, { kind: "sequence", values: fields.map(f => f.correct) })).toBe(4);
    expect(score(q, { kind: "sequence", values: ["1", "2", "3", "4"] })).toBe(0);
    expect(score(q, null)).toBe(0);
  });
  it("matching: the builder's table + per-row selects; one-to-one; no row's answer at its own option position; correct = full, diagonal = 0", () => {
    const n = node("matching", MATCH);
    expect(String(n.text).startsWith("صِل كل بروتوكول بطبقته.\n| العمود أ | العمود ب |")).toBe(true);
    const fields = n.fields as { label: string; correct: string; options: { text: string }[] }[];
    expect(fields.map(f => [f.label, f.correct])).toEqual(MATCH.pairs.map(p => [p.left, p.right]));
    const opts = fields[0].options.map(o => o.text);
    expect([...opts].sort()).toEqual(["التطبيقات", "النقل", "الشبكة", "الجلسة"].sort());
    for (const f of fields) expect(f.options).toEqual(fields[0].options);
    fields.forEach((f, row) => expect(opts[row]).not.toBe(f.correct));
    expect(n.answer).toEqual({ text: "HTTP=التطبيقات;TCP=النقل;IP=الشبكة" });
    const q = asQuestion(n, "q1", 6);
    expect(blocking([q])).toEqual([]);
    expect(score(q, { kind: "table", values: fields.map(f => f.correct) })).toBe(6);
    expect(score(q, { kind: "table", values: fields.map((_, row) => opts[row]) })).toBe(0);
    expect(score(q, null)).toBe(0);
    const titled = node("matching", { ...MATCH, headers: ["البروتوكول", "الطبقة"] });
    expect(String(titled.text)).toContain("| البروتوكول | الطبقة |");
  });
  it("categorization: code ids k1… / t1…; correct = full, all in one category = partial only, empty = 0", () => {
    const n = node("categorization", CAT);
    expect(n.categorization).toEqual({ categories: [{ id: "k1", label: "الطبقة الثانية" }, { id: "k2", label: "الطبقة الثالثة" }], items: [{ id: "t1", label: "Switch" }, { id: "t2", label: "Router" }, { id: "t3", label: "Bridge" }, { id: "t4", label: "L3 Switch" }] });
    expect(n.answer).toEqual({ correctCategoryByItem: { t1: "k1", t2: "k2", t3: "k1", t4: "k2" } });
    const q = asQuestion(n, "q1", 4);
    expect(blocking([q])).toEqual([]);
    expect(score(q, { kind: "fields", values: { t1: "k1", t2: "k2", t3: "k1", t4: "k2" } })).toBe(4);
    expect(score(q, { kind: "fields", values: { t1: "k1", t2: "k1", t3: "k1", t4: "k1" } })).toBe(2);
    expect(score(q, null)).toBe(0);
  });
  it("deterministic: the same item id always stores the same question; another id may shuffle differently but keeps the rules", () => {
    expect(node("ordering", ORDER)).toEqual(node("ordering", ORDER));
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const b = buildStructuredBody(F.structured(ORDER), "ordering", seed, "$", seed);
      if (!b.ok) throw new Error("ordering");
      expect(isDerangement((b.node.fields as { correct: string }[]).map(f => Number(f.correct) - 1))).toBe(true);
      const m = buildStructuredBody(F.structured({ ...MATCH, distractors: [] }), "matching", seed, "$", seed);
      if (!m.ok) throw new Error("matching");
      const mf = m.node.fields as { correct: string; options: { text: string }[] }[];
      mf.forEach((f, row) => expect(f.options[row].text).not.toBe(f.correct));
    }
  });
});

describe("21N-RULES refusals (never repaired into validity)", () => {
  it("multipleSelect: too few wrong options, out-of-range / duplicate / missing correct indices, duplicate or too few options", () => {
    expect(codes(body("multipleSelect", { ...MS, correctOptions: [0, 1, 2] }))).toEqual(["AI_MS_FREE_CREDIT"]);
    expect(codes(body("multipleSelect", { ...MS, correctOptions: [4] }))).toEqual(["AI_MS_CORRECT"]);
    expect(codes(body("multipleSelect", { ...MS, correctOptions: [0, 0] }))).toEqual(["AI_MS_CORRECT"]);
    expect(codes(body("multipleSelect", { ...MS, correctOptions: [] }))).toEqual(["AI_MS_CORRECT"]);
    expect(codes(body("multipleSelect", { ...MS, options: ["TCP", "tcp ", "IP"] }))).toEqual(["AI_MS_OPTIONS"]);
    expect(codes(body("multipleSelect", { ...MS, options: ["TCP", "UDP"], correctOptions: [0] }))).toEqual(["AI_MS_OPTIONS"]);
    expect(codes(body("multipleSelect", { ...MS, scoring: "partialNoPenalty" }))).toEqual(["AI_STRUCTURED_MALFORMED"]);
  });
  it("ordering / matching / categorization: duplicates, sizes, separators, one-to-one, empty categories", () => {
    expect(codes(body("ordering", { ...ORDER, sequence: ["A", "B"] }))).toEqual(["AI_ORDER_ITEMS"]);
    expect(codes(body("ordering", { ...ORDER, sequence: ["A", "B", "a"] }))).toEqual(["AI_ORDER_ITEMS"]);
    expect(codes(body("matching", { ...MATCH, pairs: [{ left: "HTTP", right: "التطبيقات" }, { left: "TCP", right: "التطبيقات" }] }))).toEqual(["AI_MATCH_ONE_TO_ONE"]);
    expect(codes(body("matching", { ...MATCH, pairs: [{ left: "A|B", right: "x" }, { left: "C", right: "y" }] }))).toEqual(["AI_MATCH_PAIRS"]);
    expect(codes(body("matching", { ...MATCH, pairs: [{ left: "A", right: "x=1" }, { left: "C", right: "y" }] }))).toEqual(["AI_MATCH_PAIRS"]);
    expect(codes(body("matching", { ...MATCH, distractors: ["النقل"] }))).toEqual(["AI_MATCH_PAIRS"]);
    expect(codes(body("matching", { ...MATCH, headers: ["واحد"] }))).toEqual(["AI_MATCH_PAIRS"]);
    expect(codes(body("matching", { ...MATCH, pairs: [MATCH.pairs[0]] }))).toEqual(["AI_MATCH_PAIRS"]);
    expect(codes(body("categorization", { ...CAT, categories: ["أ", "ب", "ج"] }))).toEqual(["AI_CAT_EMPTY_CATEGORY"]);
    expect(codes(body("categorization", { ...CAT, entries: [{ label: "Switch", category: 0 }, { label: "Router", category: 5 }] }))).toEqual(["AI_CAT_ITEMS"]);
    expect(codes(body("categorization", { ...CAT, categories: ["أ"] }))).toEqual(["AI_CAT_CATEGORIES"]);
  });
  it("a payload that fills another kind's lists, a missing key or an empty stem is refused", () => {
    expect(codes(body("ordering", { ...ORDER, options: ["x"] }))).toEqual(["AI_STRUCTURED_FOREIGN_FIELDS"]);
    expect(codes(body("multipleSelect", { ...MS, entries: [{ label: "x", category: 0 }] }))).toEqual(["AI_STRUCTURED_FOREIGN_FIELDS"]);
    const { sequence: _s, ...missing } = F.structured(ORDER); void _s;
    expect(codes(buildStructuredBody(missing, "ordering", "s", "$", "q"))).toEqual(["AI_STRUCTURED_MALFORMED"]);
    expect(codes(body("ordering", { ...ORDER, text: "" }))).toEqual(["AI_STRUCTURED_MALFORMED"]);
  });
});

// ── through the real endpoint and orchestration ────────────────────────────────────────────────────────────────────────────────────────
const INTENT = { v: 1, subject: "الشبكات", totalMarks: 30, teacherInstruction: "اختيار متعدد ومطابقة وترتيب وتصنيف" };
const PLAN = F.plan("أسئلة منظَّمة", "default", [
  F.planSection("أ", [F.planItem("multipleSelect", 4), F.planItem("matching", 6), F.planItem("ordering", 4), F.planItem("categorization", 4)]),
  F.planSection("ب", [F.planItem("composite", 12)])
]);
const SECTION_A = { items: [
  F.item("multipleSelect", { structured: F.structured(MS) }), F.item("matching", { structured: F.structured(MATCH) }),
  F.item("ordering", { structured: F.structured(ORDER) }), F.item("categorization", { structured: F.structured(CAT) })
] };
const SECTION_B = { items: [F.item("composite", { composite: F.composite("نص عن طبقات الشبكة", F.sourceContext("المصدر", [F.rb("paragraph", { text: "تعمل البروتوكولات في طبقات." })]), [F.group([
  F.part("multipleSelect", 3, { linked: true, structured: F.structured(MS) }), F.part("matching", 3, { linked: true, structured: F.structured(MATCH) }),
  F.part("ordering", 3, { structured: F.structured(ORDER) }), F.part("categorization", 3, { structured: F.structured(CAT) })
])]) })] };
function transportFor(script: Record<string, unknown[]>) {
  const ai = F.scriptedAi(script);
  const t: ComposerTransport = async b => (await composerApi.handler({ json: async () => b }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-21n" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => "2026-11-09T00:00:00.000Z" })).jsonBody;
  return { t, calls: ai.calls };
}

describe("21N-E2E plan → sections → canonical exam (questions and composite child parts)", () => {
  it("clean verdict, exact marks, round trip, the student payload holds no key, correct answers = full marks, naive answers and empty = 0", async () => {
    const { t, calls } = transportFor({ ai_exam_plan: [PLAN], ai_exam_section: [SECTION_A, SECTION_B] });
    const r = await runGeneration(t, INTENT, { examId: "EXAM-21N", report: () => {}, nonce: "n21n00" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam as StructuredExam;
    expect(validateStructuredExam(exam).filter(i => i.severity === "error")).toEqual([]);
    expect(exam.sections.flatMap(s => s.questions).map(q => [q.presentationType, q.marks])).toEqual([["multipleSelect", 4], ["matching", 6], ["ordering", 4], ["categorization", 4], ["composite", 12]]);
    const imp = parseStructuredExamJson(JSON.stringify(exam), "structured.json");
    expect(imp.canOpen).toBe(true);
    expect(imp.validationErrors).toEqual([]);
    const student = JSON.stringify(sanitize(exam));
    expect(student).not.toMatch(/"(correct|correctOptionIds|correctCategoryByItem|values|scoring)"\s*:/);
    expect(student).not.toMatch(/"answer":\{[^}]/);                                                // the sanitizer keeps an EMPTY answer only
    for (const label of ["Discover", "التطبيقات", "Bridge", "TCP"]) expect(student).toContain(label);
    // the section prompt carried the structured rules; the plan prompt did not
    expect(calls.find(c => c.schemaName === "ai_exam_plan")!.prompt).not.toContain("STRUCTURED QUESTION RULES");
    expect(calls.filter(c => c.schemaName === "ai_exam_section").every(c => c.prompt.includes(structuredRulesForPrompt()))).toBe(true);
    // grading: the correct answer of every question / part, then the naive answers, then nothing
    const [ms, mt, od, ct, cp] = exam.sections.flatMap(s => s.questions) as unknown as Json[];
    const fieldsOf = (q: Json) => q.fields as { id: string; correct: string; options?: { text: string }[] }[];
    const parts = ((cp.composite as Json).groups as Json[])[0].parts as Json[];
    const right: Json = {
      [ms.examQuestionId as string]: { kind: "multiChoice", optionIds: (ms.answer as Json).correctOptionIds },
      [mt.examQuestionId as string]: { kind: "table", values: fieldsOf(mt).map(f => f.correct) },
      [od.examQuestionId as string]: { kind: "sequence", values: fieldsOf(od).map(f => f.correct) },
      [ct.examQuestionId as string]: { kind: "fields", values: (ct.answer as Json).correctCategoryByItem },
      [cp.examQuestionId as string]: { kind: "composite", contexts: {}, parts: {
        [parts[0].id as string]: { kind: "multiChoice", optionIds: (parts[0].answer as Json).correctOptionIds },
        [parts[1].id as string]: { kind: "fields", values: Object.fromEntries(fieldsOf(parts[1]).map(f => [f.id, f.correct])) },
        [parts[2].id as string]: { kind: "fields", values: Object.fromEntries(fieldsOf(parts[2]).map(f => [f.id, f.correct])) },
        [parts[3].id as string]: { kind: "fields", values: (parts[3].answer as Json).correctCategoryByItem }
      } }
    };
    expect(gradeExam(exam, right).score).toBe(30);
    const naive: Json = {
      [ms.examQuestionId as string]: { kind: "multiChoice", optionIds: (ms.options as { id: string }[]).map(o => o.id) },
      [mt.examQuestionId as string]: { kind: "table", values: fieldsOf(mt).map((_, row) => fieldsOf(mt)[0].options![row].text) },
      [od.examQuestionId as string]: { kind: "sequence", values: fieldsOf(od).map((_, k) => String(k + 1)) },
      [cp.examQuestionId as string]: { kind: "composite", contexts: {}, parts: {
        [parts[0].id as string]: { kind: "multiChoice", optionIds: (parts[0].options as { id: string }[]).map(o => o.id) },
        [parts[1].id as string]: { kind: "fields", values: Object.fromEntries(fieldsOf(parts[1]).map((f, row) => [f.id, f.options![row].text])) },
        [parts[2].id as string]: { kind: "fields", values: Object.fromEntries(fieldsOf(parts[2]).map((f, k) => [f.id, String(k + 1)])) }
      } }
    };
    expect(gradeExam(exam, naive).score).toBe(0);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
  it("a composite child of a structured kind needs `structured` (a 19A draft in its place is refused) and the matching child stores per-row selects", () => {
    const intent = (() => { const x = normalizeComposerIntent(INTENT); if (!x.ok) throw new Error("intent"); return x.intent; })();
    const s = normalizePlanShape(PLAN); if (!s.ok) throw new Error("plan");
    const plan = validatePlan(s.plan, intent).plan;
    const wrong = { items: [F.item("composite", { composite: F.composite("نص", null, [F.group([F.part("ordering", 12, { question: F.shortAns("رتّب") })])]) })] };
    expect(codes(normalizeSectionDraft(wrong, plan.sections[1], 1, { nonce: "abc123" }))).toEqual(["AI_COMPOSITE_MALFORMED"]);
    const ok = normalizeSectionDraft(SECTION_B, plan.sections[1], 1, { nonce: "abc123" });
    if (!ok.ok) throw new Error(JSON.stringify(ok.issues));
    const child = (((ok.section.questions[0] as unknown as Json).composite as Json).groups as Json[])[0].parts as Json[];
    expect(child[1]).toMatchObject({ type: "matching", text: "صِل كل بروتوكول بطبقته.", contextId: "ctx1" });
    expect(String(child[1].text)).not.toContain("|");
    expect(child[2]).not.toHaveProperty("contextId");
  });
});

describe("21N-PROMPT the structured rules travel on demand", () => {
  const intent = (() => { const x = normalizeComposerIntent(INTENT); if (!x.ok) throw new Error("intent"); return x.intent; })();
  it("section prompts of structured or composite sections carry the rules; the plan prompt and other sections do not", () => {
    const s = normalizePlanShape(F.plan("p", "default", [F.planSection("أ", [F.planItem("ordering", 10)]), F.planSection("ب", [F.planItem("multipleChoice", 10)]), F.planSection("ج", [F.planItem("composite", 10)])], {}));
    if (!s.ok) throw new Error("plan");
    const plan = validatePlan(s.plan, { ...intent, totalMarks: 30 }).plan;
    expect(buildPlanPrompt(intent)).not.toContain(structuredRulesForPrompt());
    expect(buildSectionPrompt(intent, plan, 0)).toContain(structuredRulesForPrompt());
    expect(buildSectionPrompt(intent, plan, 1)).not.toContain(structuredRulesForPrompt());
    expect(buildSectionPrompt(intent, plan, 2)).toContain(structuredRulesForPrompt());
  });
  it("modify prompts carry the rules when the request or the exam involves a structured kind", () => {
    const empty = { v: 1, examId: "E", title: "t", sections: [] } as never;
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "أضف سؤال مطابقة عن الطبقات")).toContain(structuredRulesForPrompt());
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "add a Python loops section")).not.toContain(structuredRulesForPrompt());
    expect(mentionsStructuredKinds(JSON.stringify({ type: "categorization" }))).toBe(true);
    expect(mentionsStructuredKinds("امتحان فيزياء عن البندول")).toBe(false);
  });
});
