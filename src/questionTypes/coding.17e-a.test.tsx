// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import ExamPreview from "../ExamPreview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion, newSection, duplicateQuestion, moveQuestionToSection, cloneQuestionWithNewIds, changeQuestionType } from "../examBuilderState";
import { evaluateExamFinalization } from "../examFinalization";
import { validateStructuredExam } from "../examQuality";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { questionTypeDefinition, isKnownQuestionType, effectiveQuestionTypeVersion } from "../questionTypeCatalog";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import * as CQ from "../codingQuestion";
import * as CC from "../codingContract";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as canonical from "../../api/src/lib/exam-canonical.js";
import type { Question } from "../studentQuestionTypes";

// Phase 17E-A — Enterprise Coding Question Authoring. coding@1 (Phase 17A / 17C) is ALREADY a first-class registry plugin; this
// suite pins the authoring contract end to end (COD1–COD35 + the secrecy canary) and drives the gaps 17E-A closes:
//   • a deterministic, teacher-chosen SCORING POLICY (proportional by hidden-test weight, or all-or-nothing) under the PRIVATE key;
//   • a minimal, language-aware STARTER TEMPLATE from the language registry (a new C# / Java question is immediately usable);
//   • INLINE validation in the editor through the ONE canonical validator (no silent invalid state, no ad-hoc alerts);
//   • a sectioned enterprise editor (environment / starter / public / hidden / grading / validation) with accessible limits.
// Everything else (registry, factory, CRUD, clone / move / history, finalization, sanitization, versioning) is a regression guard.
// Fail-first on 236e1f11: the scoring policy, starter templates, inline validation and the sectioned editor do not exist.
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
const { canonicalizeExamContent, stableStringify } = canonical as unknown as { canonicalizeExamContent: (e: unknown) => unknown; stableStringify: (v: unknown) => string };
const X = CQ as unknown as Record<string, any>;     // 17E-A symbols are read at runtime (fail-first: undefined on the baseline)
const Y = CC as unknown as Record<string, any>;

const CANARY = Object.freeze({ stdin: "HIDDEN_STDIN_CANARY_17EA", expected: "HIDDEN_EXPECTED_CANARY_17EA", label: "TEACHER_LABEL_CANARY_17EA", reference: "REFERENCE_SOLUTION_CANARY_17EA" });
const CFG = {
  allowedLanguages: ["csharp", "python"], defaultLanguage: "csharp",
  starterCode: { csharp: "public class Program\n{\n    public static void Main()\n    {\n        // اكتب الحل هنا — Unicode ✓ 🙂\n    }\n}\n", python: "\tx = input()  \n" },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 },
  publicTests: [{ id: "pub-1", title: "مثال", input: "2 3\n", sampleOutput: "5\n" }]
};
const KEY = { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: [{ id: "hid-1", title: CANARY.label, input: CANARY.stdin + "\n", expectedOutput: CANARY.expected + "\n", weight: 2 }, { id: "hid-2", input: "1 1\n", expectedOutput: "2\n", weight: 1 }], referenceSolutions: { csharp: CANARY.reference } };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const codingQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("coding" as never, { examQuestionId: "c1", text: "اقرأ عددين واطبع مجموعهما.", marks: 10 }), questionTypeVersion: 1, coding: clone(CFG), answer: clone(KEY), ...over } as unknown as BuilderQuestion);
const exam = (questions: BuilderQuestion[], extraSections: StructuredExam["sections"] = []): StructuredExam => ({ examId: "EXAM-17EA", title: "امتحان برمجة", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }, ...extraSections] });
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }
const qAt = (h: Hist, s = 0, i = 0) => h.present!.sections[s].questions[i] as unknown as Record<string, any>;
const editor = () => screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("17E-A registry / factory — coding is ONE versioned registry member (COD1–COD5)", () => {
  it("COD1 coding is registered in the catalog and every registry (editor, student renderer, validator)", () => {
    expect(isKnownQuestionType("coding")).toBe(true);
    expect(questionTypeDefinition("coding")?.key).toBe("coding");
    expect(resolveAuthoringEditor("coding", 1)).toBeTruthy();
    expect(resolveStudentRenderer("coding", 1)).toBeTruthy();
  });
  it("COD2 version 1 is the supported version", () => {
    expect(effectiveQuestionTypeVersion("coding", 1)).toBe(1);
    expect(effectiveQuestionTypeVersion("coding", undefined)).toBe(1);
  });
  it("COD3 unsupported versions fail safely (no editor / renderer, a blocking validation error — never a silent downgrade)", () => {
    expect(resolveAuthoringEditor("coding", 3)).toBeUndefined();   // 17F-C2 RF1: coding@2 exists; coding@3 is the unsupported neighbour
    expect(resolveStudentRenderer("coding", 3)).toBeUndefined();
    expect(validateQuestionTypeNode(codingQ() as never, "coding", 3).map(i => i.code)).toContain("UNSUPPORTED_QUESTION_TYPE_VERSION");
  });
  it("COD4 the canonical factory creates a valid coding@1 shell (no hidden test needed for manual grading)", () => {
    const q = newQuestion("coding" as never, { examQuestionId: "n1", text: "س", marks: 5 }) as unknown as Record<string, any>;
    expect(q.presentationType).toBe("coding"); expect(q.questionTypeVersion).toBe(2);   // 17F-C2 RF1: the factory creates coding@2
    expect(CQ.validateCodingQuestion(q)).toEqual([]);
    expect(evaluateExamFinalization(exam([q as never])).canFinalize).toBe(true);
  });
  it("COD5 coding → another type drops coding data only through the canonical change; another type → coding gets the fresh canonical shell", () => {
    const mcq = changeQuestionType(codingQ(), "multipleChoice") as unknown as Record<string, any>;
    expect(mcq.coding).toBeUndefined(); expect(JSON.stringify(mcq)).not.toContain(CANARY.expected);
    expect(mcq.examQuestionId).toBe("c1"); expect(mcq.marks).toBe(10);
    const back = changeQuestionType(newQuestion("multipleChoice", { examQuestionId: "m1", text: "س", marks: 2 }), "coding" as never) as unknown as Record<string, any>;
    expect(back.questionTypeVersion).toBe(2); expect(CQ.validateCodingQuestion(back)).toEqual([]);
  });
});

describe("17E-A validation — the ONE canonical validator (COD6–COD12)", () => {
  const codes = (over: Record<string, unknown>) => CQ.validateCodingQuestion(codingQ(over) as never).map(i => i.code);
  it("COD6 a complete automatic coding question passes", () => { expect(codes({})).toEqual([]); });
  it("COD7 automatic grading without a hidden official test fails (manual grading needs none — 17A contract kept)", () => {
    expect(codes({ answer: { ...clone(KEY), hiddenTests: [] } })).toContain("CODING_AUTO_NO_HIDDEN_TESTS");
    expect(codes({ answer: { ...clone(KEY), gradingMode: "manual", hiddenTests: [] } })).toEqual([]);
  });
  it("COD8 an unsupported language / runtime fails (never converted)", () => {
    expect(codes({ coding: { ...clone(CFG), allowedLanguages: ["csharp", "cobol"] } })).toContain("CODING_LANGUAGE_UNKNOWN");
  });
  it("COD9 limits outside the canonical bounds fail", () => {
    for (const limits of [{ ...CFG.limits, timeMs: 10001 }, { ...CFG.limits, memoryMb: 8 }, { ...CFG.limits, outputBytes: 100 }, { ...CFG.limits, timeMs: 1.5 }]) expect(codes({ coding: { ...clone(CFG), limits } })).toContain("CODING_LIMIT_INVALID");
  });
  it("COD10 a malformed public test fails", () => {
    expect(codes({ coding: { ...clone(CFG), publicTests: [{ id: "pub-1", input: 7 }] } })).toContain("CODING_TEST_MALFORMED");
    expect(codes({ coding: { ...clone(CFG), publicTests: [{ id: "bad id!", input: "" }] } })).toContain("CODING_TEST_ID_INVALID");
  });
  it("COD11 a malformed hidden test fails (missing expected output, duplicate id across public + hidden)", () => {
    expect(codes({ answer: { ...clone(KEY), hiddenTests: [{ id: "hid-1", input: "1", weight: 1 }] } })).toContain("CODING_TEST_MALFORMED");
    expect(codes({ answer: { ...clone(KEY), hiddenTests: [{ id: "pub-1", input: "1", expectedOutput: "1", weight: 1 }] } })).toContain("CODING_TEST_ID_DUPLICATE");
  });
  it("COD12 an invalid grading mode or scoring policy fails", () => {
    expect(codes({ answer: { ...clone(KEY), gradingMode: "ai" } })).toContain("CODING_GRADING_MODE_UNKNOWN");
    expect(codes({ answer: { ...clone(KEY), scoringPolicy: "bestOfThree" } })).toContain("CODING_SCORING_POLICY_UNKNOWN");
    expect(codes({ answer: { ...clone(KEY), scoringPolicy: "allOrNothing" } })).toEqual([]);
    expect(codes({ answer: { ...clone(KEY), scoringPolicy: "proportional" } })).toEqual([]);
  });
});

describe("17E-A grading strategy — deterministic scoring policy owned by SmartAssess", () => {
  it("the policy is canonical data: proportional (default, also when missing) or allOrNothing", () => {
    expect(X.CODING_SCORING_POLICIES).toEqual(["proportional", "allOrNothing"]);
    expect(X.codingScoringPolicy(undefined)).toBe("proportional");
    expect(X.codingScoringPolicy({})).toBe("proportional");
    expect(X.codingScoringPolicy({ scoringPolicy: "allOrNothing" })).toBe("allOrNothing");
    expect(X.codingScoringPolicy({ scoringPolicy: "weird" })).toBe("proportional");
  });
  it("officialCodingScoreFor: proportional = marks × passedWeight / totalWeight; allOrNothing = full marks only when EVERY hidden case passed", () => {
    const ev = (passedCount: number, passedWeight: number, compileError = false) => ({ kind: "complete", passedWeight, totalWeight: 6, passedCount, testCount: 3, compileError, cases: [] });
    expect(Y.officialCodingScoreFor("proportional", 10, ev(2, 3))).toBe(5);
    expect(Y.officialCodingScoreFor("allOrNothing", 10, ev(2, 5))).toBe(0);
    expect(Y.officialCodingScoreFor("allOrNothing", 10, ev(3, 6))).toBe(10);
    expect(Y.officialCodingScoreFor("allOrNothing", 10, ev(0, 0, true))).toBe(0);
    expect(Y.officialCodingScoreFor("allOrNothing", 7.5, ev(3, 6))).toBe(7.5);
    // a zero-weight case still has to PASS under all-or-nothing (weights do not excuse a failing case)
    expect(Y.officialCodingScoreFor("allOrNothing", 10, { ...ev(2, 6), testCount: 3 })).toBe(0);
    expect(Y.officialCodingScoreFor("proportional", 10, ev(2, 3))).toBe(CC.officialCodingScore(10, 3, 6));
  });
  it("the policy is PRIVATE: the student projection never carries it", () => {
    const s = sanitizeExamForStudent(exam([codingQ({ answer: { ...clone(KEY), scoringPolicy: "allOrNothing" } })]));
    expect(JSON.stringify(s)).not.toMatch(/scoringPolicy|allOrNothing|gradingMode/);
  });
});

describe("17E-A starter templates — minimal, language-aware, registry data", () => {
  it("every registered language has a template; C# and Java compile-ready shells, Python none (a script needs no shell)", () => {
    for (const l of CQ.CODING_LANGUAGES) expect(typeof X.codingStarterTemplate(l.key), l.key).toBe("string");
    expect(X.codingStarterTemplate("csharp")).toMatch(/class Program[\s\S]*static void Main\(\)/);
    expect(X.codingStarterTemplate("java")).toMatch(/public class Main[\s\S]*public static void main\(String\[\] args\)/);
    expect(X.codingStarterTemplate("python")).toBe("");
    expect(X.codingStarterTemplate("cobol")).toBe("");
    for (const l of CQ.CODING_LANGUAGES) expect(CQ.utf8ByteLength(X.codingStarterTemplate(l.key))).toBeLessThan(400);   // minimal, never a giant template
  });
  it("a template never carries hidden-test or grading material and is valid starter code", () => {
    const q = codingQ({ coding: { ...clone(CFG), allowedLanguages: ["csharp", "java"], defaultLanguage: "csharp", starterCode: { csharp: X.codingStarterTemplate("csharp"), java: X.codingStarterTemplate("java") } } });
    expect(CQ.validateCodingQuestion(q as never)).toEqual([]);
  });
});

describe("17E-A enterprise editor — sections, policy, templates, inline validation (COD13–COD18)", () => {
  it("the editor is organised in logical sections in order: environment → starter → public → hidden → grading → validation", async () => {
    await mountBuilder(exam([codingQ()]));
    const ed = await editor();
    const order = ["البيئة والتنفيذ", "الكود الابتدائي", "أمثلة ظاهرة للطالب", "اختبارات مخفية للتصحيح", "التصحيح والعلامة", "التحقق من السؤال"];
    const legends = [...ed.querySelectorAll("[data-coding-section]")].map(n => n.getAttribute("data-coding-section"));
    expect(legends).toEqual(order);
    expect(ed.querySelector("[data-coding-section='اختبارات مخفية للتصحيح']")?.getAttribute("data-private")).toBe("true");
  });
  it("COD13 language selection updates the canonical runtime identity; enabling C# seeds the minimal C# template when it has none", async () => {
    const { hist } = await mountBuilder(exam([codingQ({ coding: { ...clone(CFG), allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {} } })]));
    await editor();
    fireEvent.click(screen.getByRole("checkbox", { name: "C#" })); await tick();
    expect(qAt(hist()).coding.allowedLanguages).toEqual(["python", "csharp"]);
    expect(qAt(hist()).coding.starterCode.csharp).toBe(X.codingStarterTemplate("csharp"));
    fireEvent.change(screen.getByRole("combobox", { name: "اللغة الافتراضية" }), { target: { value: "csharp" } }); await tick();
    expect(qAt(hist()).coding.defaultLanguage).toBe("csharp");
    expect(CQ.validateCodingQuestion(qAt(hist()) as never)).toEqual([]);
  });
  it("enabling a language with EXISTING starter code never overwrites it; an emptied starter can be restored explicitly", async () => {
    const { hist } = await mountBuilder(exam([codingQ()]));
    await editor();
    const before = qAt(hist()).coding.starterCode.csharp;
    fireEvent.change(screen.getByRole("textbox", { name: "محرر الكود — الكود الابتدائي — C#" }), { target: { value: "" } }); await tick();
    expect(qAt(hist()).coding.starterCode.csharp).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "إدراج القالب الأساسي — C#" })); await tick();
    expect(qAt(hist()).coding.starterCode.csharp).toBe(X.codingStarterTemplate("csharp"));
    expect(before).not.toBe(X.codingStarterTemplate("csharp"));
    expect(screen.queryByRole("button", { name: "إدراج القالب الأساسي — Python" })).toBeNull();    // python has no template
  });
  it("enabling Java whose starter code is ALREADY stored keeps the teacher's code byte-for-byte (the registry template is never substituted)", async () => {
    // teacher-authored Java kept on the node while Java is not allowed (e.g. imported / disabled earlier): tabs, trailing
    // spaces, CRLF + LF, Arabic and astral Unicode — any substitution or normalisation changes these bytes
    const mine = "// كود المعلم ✓ 🙂\r\npublic class Main {\n\tpublic static void main(String[] args) {  \n\t\tSystem.out.println(\"مرحبا\");\n\t}\n}\n\n";
    const { hist } = await mountBuilder(exam([codingQ({ coding: { ...clone(CFG), starterCode: { ...clone(CFG.starterCode), java: mine } } })]));
    await editor();
    const others = clone(qAt(hist()).coding.starterCode as Record<string, string>);
    expect(qAt(hist()).coding.allowedLanguages).toEqual(["csharp", "python"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Java" })); await tick();
    const after = qAt(hist()).coding;
    expect(after.allowedLanguages).toEqual(["csharp", "python", "java"]);
    expect(after.starterCode.java).toBe(mine);
    expect(after.starterCode.java).not.toBe(X.codingStarterTemplate("java"));
    expect({ csharp: after.starterCode.csharp, python: after.starterCode.python }).toEqual({ csharp: others.csharp, python: others.python });
    expect(Object.keys(after.starterCode).sort()).toEqual(["csharp", "java", "python"]);
    expect(screen.queryByRole("button", { name: "إدراج القالب الأساسي — Java" })).toBeNull();      // nothing to restore: the code is there
    expect(CQ.validateCodingQuestion(qAt(hist()) as never)).toEqual([]);
  });
  it("COD14 starter code persists byte-for-byte (whitespace, tabs, trailing spaces, Arabic, emoji) through undo / redo", async () => {
    const { hist } = await mountBuilder(exam([codingQ()]));
    await editor();
    const src = "\tline  \r\n// تعليق 🙂\n\n";
    fireEvent.change(screen.getByRole("textbox", { name: "محرر الكود — الكود الابتدائي — Python" }), { target: { value: src } }); await tick();
    expect(qAt(hist()).coding.starterCode.python).toBe(src);
    act(() => hist().undo()); await tick();
    expect(qAt(hist()).coding.starterCode.python).toBe(CFG.starterCode.python);
    act(() => hist().redo()); await tick();
    expect(qAt(hist()).coding.starterCode.python).toBe(src);
  });
  it("COD15 / COD16 / COD17 public + hidden CRUD with stable ids; reorder is deterministic and drives the official case order", async () => {
    const { hist } = await mountBuilder(exam([codingQ()]));
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "إضافة مثال ظاهر" })); await tick();
    expect(qAt(hist()).coding.publicTests).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "حذف المثال 2" })); await tick();
    expect(qAt(hist()).coding.publicTests.map((t: { id: string }) => t.id)).toEqual(["pub-1"]);
    fireEvent.click(screen.getByRole("button", { name: "تحريك الاختبار المخفي 2 لأعلى" })); await tick();
    const ids = qAt(hist()).answer.hiddenTests.map((t: { id: string }) => t.id);
    expect(ids).toEqual(["hid-2", "hid-1"]);
    // the official execution contract follows the stored order: c01 ↔ first hidden test (one token function)
    expect(ids.map((_: string, i: number) => CC.officialCaseToken(i))).toEqual(["c01", "c02"]);
    fireEvent.change(screen.getByRole("textbox", { name: "المخرجات المتوقعة للاختبار المخفي 1" }), { target: { value: "3\n" } }); await tick();
    expect(qAt(hist()).answer.hiddenTests[0]).toMatchObject({ id: "hid-2", expectedOutput: "3\n" });
  });
  it("COD18 grading mode + scoring policy persist under the PRIVATE key; switching never deletes hidden tests", async () => {
    const { hist } = await mountBuilder(exam([codingQ()]));
    const ed = await editor();
    const grading = within(ed.querySelector("[data-coding-section='التصحيح والعلامة']") as HTMLElement);
    expect((grading.getByRole("radio", { name: "علامة نسبية حسب أوزان الاختبارات" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(grading.getByRole("radio", { name: "كل شيء أو لا شيء" })); await tick();
    expect(qAt(hist()).answer.scoringPolicy).toBe("allOrNothing");
    expect(qAt(hist()).answer.hiddenTests).toHaveLength(2);
    expect(qAt(hist()).coding.scoringPolicy).toBeUndefined();                                      // never in the public config
    expect(grading.getByTestId("coding-mark-semantics").textContent).toContain("10");
    fireEvent.click(grading.getByRole("radio", { name: "يدوي بواسطة المعلم" })); await tick();
    expect(qAt(hist()).answer).toMatchObject({ gradingMode: "manual", scoringPolicy: "allOrNothing" });
    expect(qAt(hist()).answer.hiddenTests).toHaveLength(2);
  });
  it("inline validation uses the canonical validator: problems are listed in the editor and the limit field is marked invalid", async () => {
    const { hist } = await mountBuilder(exam([codingQ({ answer: { ...clone(KEY), hiddenTests: [] } })]));
    const ed = await editor();
    const panel = within(ed).getByTestId("coding-validation");
    expect(within(panel).getAllByRole("listitem").map(li => li.textContent).join(" ")).toContain("التصحيح التلقائي يحتاج إلى اختبار مخفي واحد على الأقل.");
    const time = screen.getByRole("spinbutton", { name: "حد الوقت (ملّي ثانية)" });
    expect(time.getAttribute("aria-invalid")).not.toBe("true");
    fireEvent.change(time, { target: { value: "99999" } }); await tick();
    expect(qAt(hist()).coding.limits.timeMs).toBe(99999);
    expect(screen.getByRole("spinbutton", { name: "حد الوقت (ملّي ثانية)" }).getAttribute("aria-invalid")).toBe("true");
    const hint = document.getElementById(screen.getByRole("spinbutton", { name: "حد الوقت (ملّي ثانية)" }).getAttribute("aria-describedby") || "");
    expect(hint?.textContent).toContain("250"); expect(hint?.textContent).toContain("10000");
    expect(within(panel).getAllByRole("listitem").map(li => li.textContent).join(" ")).toContain("حدود التنفيذ");
    fireEvent.click(screen.getByRole("button", { name: "إضافة اختبار مخفي" })); await tick();
    fireEvent.change(screen.getByRole("spinbutton", { name: "حد الوقت (ملّي ثانية)" }), { target: { value: "2000" } }); await tick();
    expect(within(within(ed).getByTestId("coding-validation")).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(ed).getByTestId("coding-validation").textContent).toContain("لا توجد مشكلات في إعداد سؤال البرمجة.");
  });
  it("the limits section states the authority honestly: official grading captures at most 17 KB of output per hidden test", async () => {
    await mountBuilder(exam([codingQ()]));
    const ed = await editor();
    expect(ed.querySelector("[data-coding-section='البيئة والتنفيذ']")?.textContent).toContain(String(CC.OFFICIAL_STDOUT_CAPTURE_BYTES));
  });
  it("accessibility: every destructive / reorder control has a name; source and test I/O stay LTR inside the RTL editor", async () => {
    await mountBuilder(exam([codingQ()]));
    const ed = await editor();
    for (const b of within(ed).getAllByRole("button")) expect((b.getAttribute("aria-label") || b.textContent || "").trim(), b.outerHTML).not.toBe("");
    for (const t of ed.querySelectorAll("textarea.cx-io")) expect(t.getAttribute("dir")).toBe("ltr");
    expect(within(ed).getByRole("textbox", { name: "محرر الكود — الكود الابتدائي — C#" }).getAttribute("dir")).toBe("ltr");
  });
});

describe("17E-A Builder integration (COD19–COD23)", () => {
  it("COD19 insert from the palette creates coding@1 and mounts the editor", async () => {
    const { hist } = await mountBuilder(exam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    fireEvent.click(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "coding")!); await tick(40);
    expect(qAt(hist(), 0, 1)).toMatchObject({ presentationType: "coding", questionTypeVersion: 2 });
    expect(await editor()).toBeTruthy();
  });
  it("COD20 / COD21 clone and move keep coding + private key byte-for-byte with a NEW question identity", () => {
    const q = codingQ();
    const s2 = newSection({ id: "sec-2", title: "ثانٍ" });
    const ex = exam([q], [s2]);
    const dup = duplicateQuestion(ex.sections, "sec-1", "c1");
    const copy = dup[0].questions[1] as unknown as Record<string, unknown>;
    expect(copy.examQuestionId).not.toBe("c1");
    expect(copy.coding).toEqual(CFG); expect(copy.answer).toEqual(KEY);
    const cloned = cloneQuestionWithNewIds(q) as unknown as Record<string, unknown>;
    expect(cloned.coding).toEqual(CFG); expect(cloned.answer).toEqual(KEY);
    const moved = moveQuestionToSection(ex.sections, "sec-1", "c1", "sec-2");
    expect(moved[1].questions[0]).toEqual(q);
  });
  it("COD22 / COD23 edits survive undo / redo and question switching (no stale selection)", async () => {
    const other = newQuestion("shortAnswer" as never, { examQuestionId: "s1", text: "س", marks: 2 });
    const { hist } = await mountBuilder(exam([codingQ(), other]));
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "إضافة اختبار مخفي" })); await tick();
    expect(qAt(hist()).answer.hiddenTests).toHaveLength(3);
    act(() => hist().undo()); await tick();
    expect(qAt(hist()).answer.hiddenTests).toHaveLength(2);
    act(() => hist().redo()); await tick();
    expect(qAt(hist()).answer.hiddenTests).toHaveLength(3);
    expect(qAt(hist(), 0, 1).examQuestionId).toBe("s1");                                             // the neighbour is untouched
    expect(qAt(hist()).coding).toEqual(CFG);
  });
});

describe("17E-A student secrecy boundary (COD25–COD29 + canary)", () => {
  const studentQ = () => sanitizeExamForStudent(exam([codingQ()])).sections[0].questions[0];
  it("COD25 / COD26 the student payload keeps prompt, marks, language identity, starter code, public tests and limits", () => {
    const s = studentQ() as unknown as Record<string, any>;
    expect(s.text).toBe("اقرأ عددين واطبع مجموعهما."); expect(s.marks).toBe(10);
    expect(s.coding.allowedLanguages).toEqual(["csharp", "python"]); expect(s.coding.defaultLanguage).toBe("csharp");
    expect(s.coding.starterCode).toEqual(CFG.starterCode);
    expect(s.coding.publicTests).toEqual(CFG.publicTests);
    expect(s.coding.limits).toEqual(CFG.limits);
  });
  it("COD27 / COD28 / COD29 + CANARY: no hidden stdin / expected output / teacher label / reference / grading internals anywhere — serialized payload AND rendered student UI AND teacher preview", async () => {
    const sanitized = sanitizeExamForStudent(exam([codingQ({ answer: { ...clone(KEY), scoringPolicy: "allOrNothing" } })]));
    const payload = JSON.stringify(sanitized);
    for (const c of Object.values(CANARY)) expect(payload, c).not.toContain(c);
    expect(payload).not.toMatch(/hiddenTests|expectedOutput|referenceSolutions|comparator|weight|gradingMode|scoringPolicy/);
    const answer = (sanitized.sections[0].questions[0] as unknown as { answer?: unknown }).answer;
    expect(answer === undefined || JSON.stringify(answer) === "{}", "the private key is blanked").toBe(true);
    // smuggling attempt: private material copied into the PUBLIC object is still stripped by the allow-list projection
    const smuggled = JSON.stringify(sanitizeExamForStudent(exam([codingQ({ coding: { ...clone(CFG), hiddenTests: KEY.hiddenTests, publicTests: [{ id: "pub-1", input: "1", sampleOutput: "1", note: CANARY.label, expectedOutput: CANARY.expected }] } })])));
    for (const c of Object.values(CANARY)) expect(smuggled, c).not.toContain(c);
    // the scoring policy smuggled onto the question node itself is stripped too (grading-secret denylist, defense in depth)
    expect(JSON.stringify(sanitizeExamForStudent(exam([codingQ({ scoringPolicy: "allOrNothing", gradingMode: "hiddenTests" })])))).not.toMatch(/scoringPolicy|allOrNothing|gradingMode/);
    const q = studentQ();
    render(<StudentQuestionCard q={q} index={0} id="c1" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={() => {}} />);
    await screen.findByRole("textbox", { name: /محرر الكود/ }, { timeout: 3000 });
    for (const c of Object.values(CANARY)) expect(document.body.innerHTML, c).not.toContain(c);
    cleanup();
    render(<ExamPreview exam={exam([codingQ()]) as never} onClose={() => {}} />);
    await screen.findAllByRole("textbox", { name: /محرر الكود/ }, { timeout: 3000 });
    for (const c of Object.values(CANARY)) expect(document.body.innerHTML, c).not.toContain(c);
  });
});

describe("17E-A finalization / serialization / versioning (COD30, COD31, COD34, COD35)", () => {
  it("COD30 a valid coding assessment passes the canonical finalization gate (both scoring policies)", () => {
    expect(evaluateExamFinalization(exam([codingQ()])).canFinalize).toBe(true);
    expect(evaluateExamFinalization(exam([codingQ({ answer: { ...clone(KEY), scoringPolicy: "allOrNothing" } })])).canFinalize).toBe(true);
  });
  it("COD31 an invalid coding assessment blocks finalization through the SAME authority (no second publish check)", () => {
    for (const bad of [{ answer: { ...clone(KEY), hiddenTests: [] } }, { answer: { ...clone(KEY), scoringPolicy: "x" } }, { coding: { ...clone(CFG), limits: { ...CFG.limits, memoryMb: 9999 } } }, { coding: { ...clone(CFG), allowedLanguages: ["cobol"], defaultLanguage: "cobol" } }]) {
      const e = exam([codingQ(bad)]);
      expect(evaluateExamFinalization(e).canFinalize, JSON.stringify(bad).slice(0, 60)).toBe(false);
      expect(validateStructuredExam(e).some(i => i.severity === "error")).toBe(true);
    }
  });
  it("COD34 export / import round trip: deterministic canonical JSON, identity + version + hidden tests + policy retained", () => {
    const e = exam([codingQ({ answer: { ...clone(KEY), scoringPolicy: "allOrNothing" } })]);
    const text = stableStringify(canonicalizeExamContent(e));
    const back = JSON.parse(text);
    expect(stableStringify(canonicalizeExamContent(back))).toBe(text);
    const q = back.sections[0].questions[0];
    expect(q.presentationType).toBe("coding"); expect(q.questionTypeVersion).toBe(1);
    expect(q.answer.hiddenTests).toEqual(KEY.hiddenTests); expect(q.answer.scoringPolicy).toBe("allOrNothing");
    expect(q.coding.starterCode).toEqual(CFG.starterCode);
  });
  it("COD35 an unknown coding version fails safely: kept as stored (no downgrade), blocks finalization, students get no renderer", () => {
    const e = exam([codingQ({ questionTypeVersion: 3 })]);   // 17F-C2 RF1: coding@2 is supported; coding@3 is the unknown version
    expect(evaluateExamFinalization(e).canFinalize).toBe(false);
    const back = JSON.parse(stableStringify(canonicalizeExamContent(e)));
    expect(back.sections[0].questions[0].questionTypeVersion).toBe(3);
    expect(resolveStudentRenderer("coding", 3)).toBeUndefined();
  });
});

describe("17E-A backward compatibility — Phase 16A types and legacy types are unchanged", () => {
  it("multipleSelect, numericResponse, matrix, categorization and legacy multipleChoice still create valid canonical shells", () => {
    for (const t of ["multipleSelect", "numericResponse", "matrix", "categorization", "multipleChoice", "shortAnswer"]) {
      const q = newQuestion(t as never, { examQuestionId: "x-" + t, text: "س", marks: 2 }) as unknown as Record<string, unknown>;
      expect(isKnownQuestionType(t), t).toBe(true);
      expect(q.coding, t).toBeUndefined();
      expect((q.answer as Record<string, unknown> | undefined)?.scoringPolicy, t).toBeUndefined();
    }
  });
  it("an existing 17A / 17C coding question WITHOUT a scoring policy is unchanged and still valid (proportional by default)", () => {
    const legacy = codingQ();
    expect((legacy as unknown as { answer: Record<string, unknown> }).answer.scoringPolicy).toBeUndefined();
    expect(CQ.validateCodingQuestion(legacy as never)).toEqual([]);
    expect(X.codingScoringPolicy((legacy as unknown as { answer: unknown }).answer)).toBe("proportional");
  });
});
