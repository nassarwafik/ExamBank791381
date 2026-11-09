import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_CATALOG_VERSION, COMPOSER_ITEM_KINDS } from "./composerCatalog";
import { buildStructuredBody, buildStructuredSchema, mentionsStructuredKinds, structuredRulesForPrompt } from "./composerStructured";
import { buildModifyPrompt } from "./composerPrompts";
import { runGeneration, type ComposerTransport } from "./composerRun";
import { validateStructuredExam } from "../examQuality";
import { parseStructuredExamJson } from "../structuredExamImport";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21O — the composer generates multiTrueFalse@1, matrix@1, wordBank@1 and numericResponse@1 (questions and composite child parts)
// through the same code-owned `structured` payload as 21N. No free credit: one repeated verdict / column / word never earns the whole
// question, the bank never shows a blank's word at its own position, and a far-off number is never accepted.
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number } }).gradeExam;
type Json = Record<string, unknown>;
type Kind = "multiTrueFalse" | "matrix" | "wordBank" | "numericResponse";
const NEW: Kind[] = ["multiTrueFalse", "matrix", "wordBank", "numericResponse"];
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const body = (kind: Kind, over: Json, part = false, seed = "aiq-1-1") => buildStructuredBody(F.structured(over), kind, seed, "$.s", "aiq-1-1", part);
const node = (kind: Kind, over: Json, part = false, seed = "aiq-1-1") => { const b = body(kind, over, part, seed); if (!b.ok) throw new Error(JSON.stringify(b.issues)); return b.node as Json; };
const examOf = (questions: Json[]) => ({ examId: "E21O", title: "t", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const asQuestion = (n: Json, id: string, marks: number): Json => ({ examQuestionId: id, marks, ...n });
const blocking = (questions: Json[]) => validateStructuredExam(examOf(questions) as never).filter(i => i.severity === "error");
const score = (q: Json, answer: unknown) => gradeExam(examOf([q]), { [q.examQuestionId as string]: answer }).score;

const MTF = { text: "حدّد صحة كل عبارة.", statements: [{ text: "IPv4 = 32 bit", correct: true }, { text: "IPv6 = 64 bit", correct: false }, { text: "MAC = 48 bit", correct: true }, { text: "Port = 8 bit", correct: false }] };
const MX = { text: "حدّد طبقة كل بروتوكول.", columns: ["التطبيقات", "النقل", "الشبكة"], rows: [{ label: "HTTP", column: 0 }, { label: "TCP", column: 1 }, { label: "IP", column: 2 }, { label: "DNS", column: 0 }] };
const WB = { text: "يعمل [1] في طبقة النقل، ويعمل [2] في طبقة الشبكة، ويعمل [3] في طبقة التطبيقات.", blanks: ["TCP", "IP", "HTTP"], distractors: ["Ethernet"] };
const NUM = { text: "احسب عدد العناوين القابلة للاستخدام في الشبكة /26.", expected: 62, tolerance: 0 };

describe("21O-CAT four more structured kinds join the catalog", () => {
  it("catalog V10; every new kind is its stored key, auto-graded and composite-capable; the general catalog stays bounded", () => {
    expect(COMPOSER_CATALOG_VERSION).toBe("AI_COMPOSER_CATALOG_V10");
    const c = buildComposerCatalog();
    for (const k of NEW) { expect(COMPOSER_ITEM_KINDS).toContain(k); const t = c.questionTypes.find(x => x.kind === k)!; expect([t.key, t.version, t.autoGraded, t.compositeChild]).toEqual([k, 1, true, true]); }
    const p = catalogForPrompt(c);
    expect(p.length).toBeLessThanOrEqual(9000);
    expect(p.split("\n").find(l => l.startsWith("Item kinds"))).toContain("categorization@1 (items sorted into categories) | multiTrueFalse@1 (true / false per statement) | matrix@1 (one column per row) | wordBank@1 (blanks filled from a word bank) | numericResponse@1 (one number, bounded tolerance) | ");   // 21P appends chartSelection after these, before smartSim
    const s = buildStructuredSchema() as { properties: Record<string, unknown> };
    for (const k of ["statements", "columns", "rows", "blanks", "expected", "tolerance"]) expect(Object.keys(s.properties)).toContain(k);
  });
});

describe("21O-BUILD code-owned shapes, validated and graded by production code", () => {
  it("multiTrueFalse: r1… boolean fields; correct = full, one repeated verdict = partial only, empty = 0", () => {
    const q = asQuestion(node("multiTrueFalse", MTF), "q1", 4);
    expect(q.fields).toEqual([{ id: "r1", statement: "IPv4 = 32 bit", kind: "boolean", correct: true }, { id: "r2", statement: "IPv6 = 64 bit", kind: "boolean", correct: false }, { id: "r3", statement: "MAC = 48 bit", kind: "boolean", correct: true }, { id: "r4", statement: "Port = 8 bit", kind: "boolean", correct: false }]);
    expect(blocking([q])).toEqual([]);
    expect(score(q, { kind: "fields", values: { r1: true, r2: false, r3: true, r4: false } })).toBe(4);
    expect(score(q, { kind: "fields", values: { r1: true, r2: true, r3: true, r4: true } })).toBe(2);
    expect(score(q, { kind: "fields", values: { r1: false, r2: false, r3: false, r4: false } })).toBe(2);
    expect(score(q, null)).toBe(0);
  });
  it("matrix: x… rows, c… columns; correct = full, one column for every row = partial only, empty = 0", () => {
    const n = node("matrix", MX);
    expect(n.matrix).toEqual({ rows: [{ id: "x1", label: "HTTP" }, { id: "x2", label: "TCP" }, { id: "x3", label: "IP" }, { id: "x4", label: "DNS" }], columns: [{ id: "c1", label: "التطبيقات" }, { id: "c2", label: "النقل" }, { id: "c3", label: "الشبكة" }] });
    expect(n.answer).toEqual({ correctColumnByRow: { x1: "c1", x2: "c2", x3: "c3", x4: "c1" } });
    const q = asQuestion(n, "q1", 4);
    expect(blocking([q])).toEqual([]);
    expect(score(q, { kind: "fields", values: { x1: "c1", x2: "c2", x3: "c3", x4: "c1" } })).toBe(4);
    expect(score(q, { kind: "fields", values: { x1: "c1", x2: "c1", x3: "c1", x4: "c1" } })).toBe(2);
    expect(score(q, null)).toBe(0);
  });
  it("wordBank: [k] fields, a bank of words + distractors in which no blank's word sits at its own position; correct = full, bank order = 0", () => {
    const n = node("wordBank", WB);
    const fields = n.fields as { id: string; label: string; correct: string }[];
    expect(fields.map(f => [f.id, f.label, f.correct])).toEqual([["f1", "[1]", "TCP"], ["f2", "[2]", "IP"], ["f3", "[3]", "HTTP"]]);
    const bank = n.wordBank as string[];
    expect([...bank].sort()).toEqual(["Ethernet", "HTTP", "IP", "TCP"].sort());
    fields.forEach((f, k) => expect(bank[k]).not.toBe(f.correct));
    expect(n.answer).toEqual({ mode: "exactSequence", values: ["TCP", "IP", "HTTP"] });
    const q = asQuestion(n, "q1", 3);
    expect(blocking([q])).toEqual([]);
    expect(score(q, { kind: "sequence", values: ["TCP", "IP", "HTTP"] })).toBe(3);
    expect(score(q, { kind: "sequence", values: bank.slice(0, 3) })).toBe(0);
    expect(score(q, { kind: "sequence", values: ["TCP", "TCP", "TCP"] })).toBe(1);
    expect(score(q, null)).toBe(0);
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const m = node("wordBank", WB, false, seed);
      (m.fields as { correct: string }[]).forEach((f, k) => expect((m.wordBank as string[])[k]).not.toBe(f.correct));
    }
  });
  it("numericResponse: the key is the model's number with a bounded tolerance; inside = full, outside = 0, empty = 0", () => {
    const q = asQuestion(node("numericResponse", NUM), "q1", 2);
    expect(q).toMatchObject({ presentationType: "numericResponse", questionTypeVersion: 1, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 62, tolerance: 0 } });
    expect(blocking([q])).toEqual([]);
    expect(score(q, { kind: "numeric", value: "62" })).toBe(2);
    expect(score(q, { kind: "numeric", value: "64" })).toBe(0);
    const tol = asQuestion(node("numericResponse", { ...NUM, text: "احسب g", expected: 9.81, tolerance: 0.05 }), "q2", 2);
    expect(score(tol, { kind: "numeric", value: "9.85" })).toBe(2);
    expect(score(tol, { kind: "numeric", value: "9.9" })).toBe(0);
    expect(score(q, null)).toBe(0);
  });
});

describe("21O-RULES refusals (never repaired into validity)", () => {
  it("multiTrueFalse needs both verdicts, distinct statements and 2-10 of them", () => {
    expect(codes(body("multiTrueFalse", { ...MTF, statements: MTF.statements.map(s => ({ ...s, correct: true })) }))).toEqual(["AI_MTF_FREE_CREDIT"]);
    expect(codes(body("multiTrueFalse", { ...MTF, statements: MTF.statements.map(s => ({ ...s, correct: false })) }))).toEqual(["AI_MTF_FREE_CREDIT"]);
    expect(codes(body("multiTrueFalse", { ...MTF, statements: [MTF.statements[0], { ...MTF.statements[0], correct: false }] }))).toEqual(["AI_MTF_STATEMENTS"]);
    expect(codes(body("multiTrueFalse", { ...MTF, statements: [MTF.statements[0]] }))).toEqual(["AI_MTF_STATEMENTS"]);
  });
  it("matrix: every column used, column indices in range, distinct rows and columns", () => {
    expect(codes(body("matrix", { ...MX, rows: MX.rows.map(r => ({ ...r, column: r.column === 2 ? 1 : r.column })) }))).toEqual(["AI_MATRIX_UNUSED_COLUMN"]);
    expect(codes(body("matrix", { ...MX, rows: [{ label: "HTTP", column: 3 }, { label: "TCP", column: 1 }] }))).toEqual(["AI_MATRIX_ROWS"]);
    expect(codes(body("matrix", { ...MX, columns: ["أ", "أ", "ب"] }))).toEqual(["AI_MATRIX_COLUMNS"]);
    expect(codes(body("matrix", { ...MX, rows: [{ label: "HTTP", column: 0 }, { label: "http", column: 1 }, { label: "IP", column: 2 }] }))).toEqual(["AI_MATRIX_ROWS"]);
  });
  it("wordBank: distinct words, at least one new distractor, and exactly the markers [1] … [N] in order", () => {
    expect(codes(body("wordBank", { ...WB, distractors: [] }))).toEqual(["AI_WB_DISTRACTORS"]);
    expect(codes(body("wordBank", { ...WB, distractors: ["TCP"] }))).toEqual(["AI_WB_DISTRACTORS"]);
    expect(codes(body("wordBank", { ...WB, blanks: ["TCP", "TCP", "HTTP"] }))).toEqual(["AI_WB_BLANKS"]);
    expect(codes(body("wordBank", { ...WB, text: "يعمل [1] و[3] و[2]." }))).toEqual(["AI_WB_MARKERS"]);
    expect(codes(body("wordBank", { ...WB, text: "يعمل [1] و[2] فقط." }))).toEqual(["AI_WB_MARKERS"]);
  });
  it("numericResponse: a bounded tolerance (≤ 5 %, 0 for a zero answer), both values present, and they stay null for every other kind", () => {
    expect(codes(body("numericResponse", { ...NUM, tolerance: 10 }))).toEqual(["AI_NUM_TOLERANCE"]);
    expect(codes(body("numericResponse", { ...NUM, expected: 0, tolerance: 0.1 }))).toEqual(["AI_NUM_TOLERANCE"]);
    expect(codes(body("numericResponse", { ...NUM, tolerance: -1 }))).toEqual(["AI_NUM_KEY"]);
    expect(codes(body("numericResponse", { ...NUM, expected: null }))).toEqual(["AI_NUM_KEY"]);
    expect(codes(body("numericResponse", { ...NUM, expected: 1e12 }))).toEqual(["AI_NUM_KEY"]);
    expect(codes(body("matrix", { ...MX, expected: 3 }))).toEqual(["AI_STRUCTURED_FOREIGN_FIELDS"]);
    expect(codes(body("wordBank", { ...WB, statements: MTF.statements }))).toEqual(["AI_STRUCTURED_FOREIGN_FIELDS"]);
  });
});

const INTENT = { v: 1, subject: "الشبكات", totalMarks: 25, teacherInstruction: "صح وخطأ متعدد ومصفوفة وبنك كلمات وإجابة رقمية" };
const PLAN = F.plan("أسئلة منظَّمة 2", "default", [
  F.planSection("أ", [F.planItem("multiTrueFalse", 4), F.planItem("matrix", 4), F.planItem("wordBank", 3), F.planItem("numericResponse", 2)]),
  F.planSection("ب", [F.planItem("composite", 12)])
]);
const SECTION_A = { items: NEW.map((k, i) => F.item(k, { structured: F.structured([MTF, MX, WB, NUM][i]) })) };
const SECTION_B = { items: [F.item("composite", { composite: F.composite("نص عن طبقات الشبكة", F.sourceContext("المصدر", [F.rb("paragraph", { text: "تعمل البروتوكولات في طبقات." })]), [F.group(
  NEW.map((k, i) => F.part(k, 3, { linked: i === 0, structured: F.structured([MTF, MX, WB, NUM][i]) })))]) })] };
function transportFor(script: Record<string, unknown[]>) {
  const ai = F.scriptedAi(script);
  const t: ComposerTransport = async b => (await composerApi.handler({ json: async () => b }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-21o" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => "2026-11-09T00:00:00.000Z" })).jsonBody;
  return { t, calls: ai.calls };
}

describe("21O-E2E plan → sections → canonical exam (questions and composite child parts)", () => {
  it("clean verdict, exact marks, round trip, no key reaches the student; correct = 25/25, naive answers and empty earn no full question", async () => {
    const { t, calls } = transportFor({ ai_exam_plan: [PLAN], ai_exam_section: [SECTION_A, SECTION_B] });
    const r = await runGeneration(t, INTENT, { examId: "EXAM-21O", report: () => {}, nonce: "n21o00" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam as StructuredExam;
    expect(validateStructuredExam(exam).filter(i => i.severity === "error")).toEqual([]);
    expect(exam.sections.flatMap(s => s.questions).map(q => [q.presentationType, q.marks])).toEqual([["multiTrueFalse", 4], ["matrix", 4], ["wordBank", 3], ["numericResponse", 2], ["composite", 12]]);
    const imp = parseStructuredExamJson(JSON.stringify(exam), "structured-21o.json");
    expect(imp.canOpen).toBe(true);
    expect(imp.validationErrors).toEqual([]);
    const student = JSON.stringify(sanitize(exam));
    expect(student).not.toMatch(/"(correct|correctColumnByRow|values|expected|tolerance)"\s*:/);
    expect(student).not.toMatch(/"answer":\{[^}]/);
    for (const label of ["IPv6 = 64 bit", "DNS", "Ethernet", "/26"]) expect(student).toContain(label);
    expect(calls.filter(c => c.schemaName === "ai_exam_section").every(c => c.prompt.includes(structuredRulesForPrompt()))).toBe(true);
    const [mt, mx, wb, nr, cp] = exam.sections.flatMap(s => s.questions) as unknown as Json[];
    const parts = ((cp.composite as Json).groups as Json[])[0].parts as Json[];
    const fieldMap = (q: Json) => Object.fromEntries((q.fields as { id: string; correct: unknown }[]).map(f => [f.id, f.correct]));
    const right: Json = {
      [mt.examQuestionId as string]: { kind: "fields", values: fieldMap(mt) },
      [mx.examQuestionId as string]: { kind: "fields", values: (mx.answer as Json).correctColumnByRow },
      [wb.examQuestionId as string]: { kind: "sequence", values: (wb.answer as Json).values },
      [nr.examQuestionId as string]: { kind: "numeric", value: "62" },
      [cp.examQuestionId as string]: { kind: "composite", contexts: {}, parts: {
        [parts[0].id as string]: { kind: "fields", values: fieldMap(parts[0]) },
        [parts[1].id as string]: { kind: "fields", values: (parts[1].answer as Json).correctColumnByRow },
        [parts[2].id as string]: { kind: "fields", values: fieldMap(parts[2]) },
        [parts[3].id as string]: { kind: "numeric", value: "62" }
      } }
    };
    expect(gradeExam(exam, right).score).toBe(25);
    const bankOrder = (q: Json) => Object.fromEntries((q.fields as { id: string }[]).map((f, k) => [f.id, (q.wordBank as string[])[k]]));
    const naive: Json = {
      [wb.examQuestionId as string]: { kind: "sequence", values: (wb.wordBank as string[]).slice(0, 3) },
      [nr.examQuestionId as string]: { kind: "numeric", value: "64" },
      [cp.examQuestionId as string]: { kind: "composite", contexts: {}, parts: { [parts[2].id as string]: { kind: "fields", values: bankOrder(parts[2]) }, [parts[3].id as string]: { kind: "numeric", value: "0" } } }
    };
    expect(gradeExam(exam, naive).score).toBe(0);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
});

describe("21O-PROMPT the rules travel on demand and name the new kinds", () => {
  it("the rules block covers the four kinds; modify prompts carry it when the request names one", () => {
    const rules = structuredRulesForPrompt();
    for (const k of NEW) expect(rules).toContain("- " + k + ":");
    const empty = { v: 1, examId: "E", title: "t", sections: [] } as never;
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "أضف سؤال صح وخطأ متعدد عن العناوين")).toContain(rules);
    expect(buildModifyPrompt(empty, "generateSection", { kind: "exam" }, "add a word bank question about OSI")).toContain(rules);
    for (const t of ["مصفوفة", "إجابة رقمية", JSON.stringify({ type: "numericResponse" })]) expect(mentionsStructuredKinds(t)).toBe(true);
    expect(mentionsStructuredKinds("امتحان فيزياء عن البندول")).toBe(false);
  });
});
