import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_CATALOG_VERSION, COMPOSER_ITEM_KINDS } from "./composerCatalog";
import { buildStructuredBody, mentionsStructuredKinds, structuredRulesForPrompt } from "./composerStructured";
import { runGeneration, type ComposerTransport } from "./composerRun";
import { validateStructuredExam } from "../examQuality";
import { parseStructuredExamJson } from "../structuredExamImport";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21R — cliFill@1 («فراغات أوامر CLI») in the AI Full Exam Composer. The model writes the COMPLETE command lines and, per blank, the
// answer token and accepted spellings; code blanks EVERY whole-token occurrence of each answer ([[b1]] …), owns the ids and the key, and
// refuses an answer that is missing, too frequent, inside another answer or already written in the stem.
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number } }).gradeExam;
type Json = Record<string, unknown>;
const LINES = ["R1(config)# interface g0/0.20", "R1(config-subif)# encapsulation dot1Q 20", "R1(config-subif)# ip address 192.168.20.1 255.255.255.0"];
const CLI = { text: "أكمل أوامر الواجهة الفرعية للشبكة الافتراضية.", cliLines: LINES, cliBlanks: [{ answer: "20", accepted: [] }, { answer: "192.168.20.1", accepted: [] }] };
const body = (over: Json, part = false) => buildStructuredBody(F.structured({ ...CLI, ...over }), "cliFill", "aiq-1-1", "$.s", "aiq-1-1", part);
const node = (over: Json = {}) => { const b = body(over); if (!b.ok) throw new Error(JSON.stringify(b.issues)); return b.node as Json; };
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const examOf = (questions: Json[]) => ({ examId: "E21R", title: "t", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const score = (q: Json, values: Json | null) => gradeExam(examOf([q]), { q1: values === null ? null : { kind: "fields", values } }).score;

describe("21R-CAT cliFill joins the catalog", () => {
  it("catalog V11; cliFill is its stored key, auto-graded, composite-capable; the general catalog stays bounded", () => {
    expect(COMPOSER_CATALOG_VERSION).toBe("AI_COMPOSER_CATALOG_V11");
    expect(COMPOSER_ITEM_KINDS).toContain("cliFill");
    const t = buildComposerCatalog().questionTypes.find(x => x.kind === "cliFill")!;
    expect([t.key, t.version, t.autoGraded, t.compositeChild]).toEqual(["cliFill", 1, true, true]);
    const p = catalogForPrompt();
    expect(p.length).toBeLessThanOrEqual(9000);
    expect(p).toContain("numericResponse@1 (one number, bounded tolerance) | cliFill@1 (blanks in CLI command text) | chartSelection@1");
    expect(structuredRulesForPrompt()).toContain("- cliFill:");
    expect(mentionsStructuredKinds("أضف سؤال cliFill عن VLAN")).toBe(true);
  });
});

describe("21R-BUILD code places the blanks and owns the key", () => {
  it("every whole-token occurrence is blanked (the sub-interface number too), never a digit inside an address; the student text keeps no answer", () => {
    const n = node();
    expect(n.cli).toBe("R1(config)# interface g0/0.[[b1]]\nR1(config-subif)# encapsulation dot1Q [[b1]]\nR1(config-subif)# ip address [[b2]] 255.255.255.0");
    expect(n.fields).toEqual([{ id: "b1", label: "[1]", correct: "20" }, { id: "b2", label: "[2]", correct: "192.168.20.1" }]);
    const q = { examQuestionId: "q1", marks: 4, ...n };
    expect(validateStructuredExam(examOf([q]) as never).filter(i => i.severity === "error")).toEqual([]);
    expect(score(q, { b1: "20", b2: "192.168.20.1" })).toBe(4);
    expect(score(q, { b1: "20", b2: "192.168.10.1" })).toBe(2);
    expect(score(q, null)).toBe(0);
  });
  it("accepted spellings grade as correct (case-insensitive, like every field)", () => {
    const lines = ["R1(config)# interface g0/0", "R1(config-if)# no shutdown"];
    const n = node({ cliLines: lines, cliBlanks: [{ answer: "g0/0", accepted: ["GigabitEthernet0/0", "gi0/0"] }] });
    expect(n.fields).toEqual([{ id: "b1", label: "[1]", correct: ["g0/0", "GigabitEthernet0/0", "gi0/0"] }]);
    const q = { examQuestionId: "q1", marks: 2, ...n };
    for (const v of ["g0/0", "gigabitethernet0/0", "Gi0/0"]) expect(score(q, { b1: v })).toBe(2);
    expect(score(q, { b1: "g0/1" })).toBe(0);
  });
});

describe("21R-RULES refusals (never repaired into validity)", () => {
  it("a missing answer, an answer in the stem, too many occurrences, an answer inside another, duplicates", () => {
    expect(codes(body({ cliBlanks: [{ answer: "30", accepted: [] }] }))).toEqual(["AI_CLI_ANSWER_MISSING"]);
    expect(codes(body({ text: "أكمل أوامر VLAN 20." }))).toEqual(["AI_CLI_LEAK"]);
    expect(codes(body({ cliLines: ["S1# vlan 20", "S1# vlan 20", "S1# vlan 20", "S1# vlan 20"], cliBlanks: [{ answer: "20", accepted: [] }] }))).toEqual(["AI_CLI_BLANKS"]);
    expect(codes(body({ cliBlanks: [{ answer: "20", accepted: [] }, { answer: "g0/0.20", accepted: [] }] }))).toEqual(["AI_CLI_BLANKS"]);
    expect(codes(body({ cliBlanks: [{ answer: "20", accepted: [] }, { answer: "20", accepted: [] }] }))).toEqual(["AI_CLI_BLANKS"]);
  });
  it("tokens only (no spaces, ≥ 2 characters), no [[ ]] in the lines, bounded sizes, no foreign fields", () => {
    expect(codes(body({ cliBlanks: [{ answer: "dot1Q 20", accepted: [] }] }))).toEqual(["AI_CLI_BLANKS"]);
    expect(codes(body({ cliBlanks: [{ answer: "2", accepted: [] }] }))).toEqual(["AI_CLI_BLANKS"]);
    expect(codes(body({ cliLines: ["R1# show [[x]]"] }))).toEqual(["AI_CLI_LINES"]);
    expect(codes(body({ cliLines: [] }))).toEqual(["AI_CLI_LINES"]);
    expect(codes(body({ cliBlanks: [] }))).toEqual(["AI_CLI_BLANKS"]);
    expect(codes(body({ options: ["x"] }))).toEqual(["AI_STRUCTURED_FOREIGN_FIELDS"]);
  });
});

const INTENT = { v: 1, subject: "الشبكات", totalMarks: 10, teacherInstruction: "فراغات أوامر CLI عن الواجهات الفرعية" };
const PLAN = F.plan("أوامر CLI", "default", [F.planSection("أ", [F.planItem("cliFill", 4)]), F.planSection("ب", [F.planItem("composite", 6)])]);
const SECTION_A = { items: [F.item("cliFill", { structured: F.structured(CLI) })] };
const SECTION_B = { items: [F.item("composite", { composite: F.composite("إعداد الموجّه", F.sourceContext("المخطط", [F.rb("paragraph", { text: "الموجّه R1 يربط شبكتين افتراضيتين." })]), [F.group([
  F.part("cliFill", 3, { linked: true, structured: F.structured({ text: "أكمل أوامر الواجهة.", cliLines: ["R1(config)# interface g0/1", "R1(config-if)# no shutdown"], cliBlanks: [{ answer: "shutdown", accepted: [] }] }) }),
  F.part("multipleChoice", 3, { question: F.mcq("ما وظيفة الأمر؟", ["تشغيل الواجهة", "إيقاف الواجهة"], 0) })
])]) })] };
function transportFor(script: Record<string, unknown[]>) {
  const ai = F.scriptedAi(script);
  const t: ComposerTransport = async b => (await composerApi.handler({ json: async () => b }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-21r" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => "2026-11-09T00:00:00.000Z" })).jsonBody;
  return { t, calls: ai.calls };
}

describe("21R-E2E plan → sections → canonical exam (question and composite child)", () => {
  it("clean verdict, round trip, the student never sees an answer; correct = 10/10, empty = 0", async () => {
    const { t, calls } = transportFor({ ai_exam_plan: [PLAN], ai_exam_section: [SECTION_A, SECTION_B] });
    const r = await runGeneration(t, INTENT, { examId: "EXAM-21R", report: () => {}, nonce: "n21r00" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam as StructuredExam;
    expect(validateStructuredExam(exam).filter(i => i.severity === "error")).toEqual([]);
    const imp = parseStructuredExamJson(JSON.stringify(exam), "cli-21r.json");
    expect(imp.canOpen).toBe(true);
    expect(imp.validationErrors).toEqual([]);
    const student = JSON.stringify(sanitize(exam));
    expect(student).not.toMatch(/"correct"\s*:/);
    expect(student).not.toContain("192.168.20.1");
    expect(student).toContain("[[b1]]");
    expect(calls.filter(c => c.schemaName === "ai_exam_section").every(c => c.prompt.includes(structuredRulesForPrompt()))).toBe(true);
    const [cq, cp] = exam.sections.flatMap(s => s.questions) as unknown as Json[];
    const part = (((cp.composite as Json).groups as Json[])[0].parts as Json[]);
    const right = {
      [cq.examQuestionId as string]: { kind: "fields", values: { b1: "20", b2: "192.168.20.1" } },
      [cp.examQuestionId as string]: { kind: "composite", contexts: {}, parts: { [part[0].id as string]: { kind: "fields", values: { b1: "shutdown" } }, [part[1].id as string]: { kind: "choice", index: 0 } } }
    };
    expect(gradeExam(exam, right).score).toBe(10);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
});
