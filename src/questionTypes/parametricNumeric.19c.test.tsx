// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import ExamPreview from "../ExamPreview";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { defaultParametricNumericAnswerKey, defaultParametricNumericConfig } from "../parametricNumericQuestion";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown, options?: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 19C — the v2 parametric authoring UX inside the REAL Builder (no JSON, no AST concepts): eight sections (variables,
// derived values, constraints, question template, answer formula, answer comparison, display format, generate samples), explicit
// integer / decimal kinds, derived values with inline graph validation, per-symbol display formats, a 3 / 5 / 10 PREVIEW-namespace
// sample generator with a TEACHER-ONLY solution inspector, the explicit v1 → v2 upgrade, the v2 student rendering and the teacher
// review of derived values and constraints. Pins come from an independent reference of generator v2. Fail-first on 751003f.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RECT = { v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 2, max: 10, step: 1 }, { id: "b", kind: "integer", min: 3, max: 12, step: 1 }], derivedVariables: [{ id: "area", expression: "a * b" }], constraints: ["a != b"], response: { unit: "none" } };
const RTEXT = "مستطيل طوله {{a}} سم وعرضه {{b}} سم. احسب مساحته.";
const rectQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("parametricNumeric" as never, { examQuestionId: "r1", text: RTEXT, marks: 2 }), parametric: JSON.parse(JSON.stringify(RECT)), answer: { expression: "area", mode: "tolerance", tolerance: 0 }, ...over } as unknown as BuilderQuestion);
const PHYS = { v: 2, generatorVersion: 2, variables: [{ id: "d", kind: "decimal", min: 10, max: 50, step: 0.5 }, { id: "t", kind: "decimal", min: 2, max: 8, step: 0.25 }], derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "fixed", decimals: 2 } }], constraints: [], response: { unit: "label", label: "م/ث" } };
const physQ = () => ({ ...newQuestion("parametricNumeric" as never, { examQuestionId: "q1", text: "قطع جسم {{d}} مترًا في {{t}} ثانية. ما متوسط سرعته؟", marks: 3 }), parametric: JSON.parse(JSON.stringify(PHYS)), answer: { expression: "speed", mode: "tolerance", tolerance: 0.01 } } as unknown as BuilderQuestion);
const V1 = { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } };
const v1Q = () => ({ ...newQuestion("parametricNumeric" as never, { examQuestionId: "q1", text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 4 }), parametric: JSON.parse(JSON.stringify(V1)), answer: { expression: "a * b", mode: "tolerance", tolerance: 0 } } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-19C", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as { parametric: Record<string, unknown> & { variables: Record<string, unknown>[]; derivedVariables: Record<string, unknown>[] }; answer: Record<string, unknown>; text: string } & Record<string, unknown>;
const editorOf = () => screen.findByTestId("qt-editor-parametricNumeric", {}, { timeout: 3000 });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("v2 editor inside the REAL Builder", () => {
  it("shows the eight teacher-facing sections, without JSON or AST vocabulary", async () => {
    await mountBuilder(baseExam([rectQ()]));
    const editor = await editorOf();
    for (const name of ["المتغيرات", "القيم المشتقة", "القيود", "نص السؤال", "صيغة الإجابة", "مقارنة الإجابة", "تنسيق العرض", "توليد العينات"]) expect(within(editor).getByRole("group", { name }), name).toBeTruthy();
    expect(editor.querySelectorAll("textarea").length).toBe(0);
    expect(editor.textContent).not.toMatch(/AST|"variables"|\{"v"|token/i);
  });
  it("explicit integer / decimal kinds: switching to decimal keeps the values and makes the step editable as a decimal", async () => {
    const { hist } = await mountBuilder(baseExam([rectQ()]));
    const editor = await editorOf();
    fireEvent.change(within(editor).getByRole("combobox", { name: "نوع المتغير 1" }), { target: { value: "decimal" } }); await tick();
    fireEvent.change(within(editor).getByRole("spinbutton", { name: "خطوة المتغير 1" }), { target: { value: "0.5" } }); await tick();
    expect(firstQ(hist()).parametric.variables[0]).toEqual({ id: "a", kind: "decimal", min: 2, max: 10, step: 0.5 });
    fireEvent.change(within(editor).getByRole("spinbutton", { name: "خطوة المتغير 1" }), { target: { value: "0.3" } }); await tick();
    expect(within(editor).getByTestId("param-issues").textContent).toMatch(/الخطوة/);                      // inline validation, not at publication
  });
  it("derived values: add, name, formula (LTR), insert into the stem, remove; cycles and unknown symbols are reported inline", async () => {
    const { hist } = await mountBuilder(baseExam([rectQ()]));
    const editor = await editorOf();
    fireEvent.click(within(editor).getByRole("button", { name: "+ قيمة مشتقة" })); await tick();
    const nameBox = within(editor).getByRole("textbox", { name: "اسم القيمة المشتقة 2" }) as HTMLInputElement;
    fireEvent.change(nameBox, { target: { value: "perimeter" } }); await tick();
    const formula = within(editor).getByRole("textbox", { name: "صيغة القيمة المشتقة 2" }) as HTMLInputElement;
    expect(formula.getAttribute("dir")).toBe("ltr");
    fireEvent.change(formula, { target: { value: "2 * (a + b)" } }); await tick();
    expect(firstQ(hist()).parametric.derivedVariables).toEqual([{ id: "area", expression: "a * b" }, { id: "perimeter", expression: "2 * (a + b)" }]);
    fireEvent.click(within(editor).getByRole("button", { name: "إدراج {{perimeter}} في نص السؤال" })); await tick();
    expect(firstQ(hist()).text).toBe(RTEXT + " {{perimeter}}");
    fireEvent.change(formula, { target: { value: "area + perimeter" } }); await tick();
    expect(within(editor).getByTestId("param-issues").textContent).toMatch(/perimeter/);
    fireEvent.change(formula, { target: { value: "area * 2" } }); await tick();
    fireEvent.change(within(editor).getByRole("textbox", { name: "صيغة القيمة المشتقة 1" }), { target: { value: "perimeter / 2" } }); await tick();
    expect(within(editor).getByTestId("param-issues").textContent).toMatch(/حلقة|دوري/);
    fireEvent.change(within(editor).getByRole("textbox", { name: "صيغة القيمة المشتقة 1" }), { target: { value: "cbrt(a)" } }); await tick();
    expect(within(editor).getByTestId("param-issues").textContent).toMatch(/غير صالحة|غير معروفة/);
    fireEvent.click(within(editor).getByRole("button", { name: "حذف القيمة المشتقة 2" })); await tick();
    expect(firstQ(hist()).parametric.derivedVariables.map(d => d.id)).toEqual(["area"]);
  });
  it("display format per symbol (fixed / percentage with decimals) changes only the presentation", async () => {
    const { hist } = await mountBuilder(baseExam([physQ()]));
    const editor = await editorOf();
    fireEvent.change(within(editor).getByRole("combobox", { name: "تنسيق عرض t" }), { target: { value: "fixed" } }); await tick();
    fireEvent.change(within(editor).getByRole("spinbutton", { name: "منازل t العشرية" }), { target: { value: "1" } }); await tick();
    expect(firstQ(hist()).parametric.variables[1]).toEqual({ id: "t", kind: "decimal", min: 2, max: 8, step: 0.25, format: { kind: "fixed", decimals: 1 } });
    expect(firstQ(hist()).answer).toEqual({ expression: "speed", mode: "tolerance", tolerance: 0.01 });
    fireEvent.change(within(editor).getByRole("combobox", { name: "تنسيق عرض speed" }), { target: { value: "plain" } }); await tick();
    expect(firstQ(hist()).parametric.derivedVariables[0]).toEqual({ id: "speed", expression: "d / t" });
  });
  it("generate 3 / 5 / 10 PREVIEW samples (pinned) with the teacher-only inspector; nothing is stored on the question", async () => {
    const { hist } = await mountBuilder(baseExam([rectQ()]));
    const editor = await editorOf();
    const before = JSON.stringify(firstQ(hist()));
    const items = () => within(within(editor).getByTestId("param-samples")).getAllByTestId("param-sample-item");
    expect(items().map(i => i.textContent)).toEqual([expect.stringContaining("مستطيل طوله 5 سم وعرضه 9 سم"), expect.stringContaining("مستطيل طوله 5 سم وعرضه 8 سم"), expect.stringContaining("مستطيل طوله 9 سم وعرضه 6 سم")]);
    expect(within(items()[0]).getByTestId("param-sample-expected").textContent).toContain("45");
    fireEvent.change(within(editor).getByRole("combobox", { name: "عدد العينات" }), { target: { value: "10" } }); await tick();
    expect(items().length).toBe(10);
    fireEvent.change(within(editor).getByRole("combobox", { name: "عدد العينات" }), { target: { value: "5" } }); await tick();
    expect(items().length).toBe(5);
    fireEvent.click(within(editor).getByRole("button", { name: "عينات أخرى" })); await tick();
    expect(items()[0].textContent).toContain("مستطيل طوله 5 سم وعرضه 6 سم");                                // samples 6..10
    fireEvent.click(within(items()[1]).getByRole("button", { name: "فحص الحل للعينة 7" })); await tick();
    const inspector = within(editor).getByTestId("param-inspector");
    expect(inspector.textContent).toMatch(/a\s*=\s*4/); expect(inspector.textContent).toMatch(/area\s*=\s*20/);
    expect(inspector.textContent).toContain("a != b"); expect(inspector.textContent).toContain("✓");
    expect(inspector.textContent).toContain("area"); expect(inspector.textContent).toMatch(/التسامح/);
    expect(JSON.stringify(firstQ(hist()))).toBe(before);                                                     // previews never mutate the question
  });
  it("a v1 (Phase 19B) question stays v1 in the editor until the teacher explicitly upgrades it to v2", async () => {
    const { hist } = await mountBuilder(baseExam([v1Q()]));
    const editor = await editorOf();
    fireEvent.click(within(editor).getByRole("button", { name: "+ متغير" })); await tick();
    expect(firstQ(hist()).parametric.variables[2]).toEqual({ id: "c", kind: "int", min: 1, max: 10, step: 1 });
    expect(firstQ(hist()).parametric.v).toBe(1);
    fireEvent.click(within(editor).getByRole("button", { name: "حذف المتغير 3" })); await tick();
    fireEvent.click(within(editor).getByRole("button", { name: "ترقية إلى الإصدار 2" })); await tick();
    expect(firstQ(hist()).parametric).toEqual({ v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 2, max: 10, step: 1 }, { id: "b", kind: "integer", min: 5, max: 20, step: 1 }], derivedVariables: [], constraints: ["a < b"], response: { unit: "none" } });
    expect(within(await editorOf()).getByRole("group", { name: "القيم المشتقة" })).toBeTruthy();
  });
  it("a new question from the palette is v2 with integer variables", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q0", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    fireEvent.click(within(d).getByRole("tab", { name: "إجابات" })); await tick();
    fireEvent.click(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "parametricNumeric")!); await tick(50);
    const q = hist().present!.sections[0].questions[1] as unknown as { parametric: { v: number; variables: { kind: string }[]; derivedVariables: unknown[] } };
    expect(q.parametric.v).toBe(2); expect(q.parametric.variables.map(v => v.kind)).toEqual(["integer", "integer"]); expect(q.parametric.derivedVariables).toEqual([]);
    // the initial-graph defaults literal is exactly the model's default contract
    const fresh = newQuestion("parametricNumeric" as never) as unknown as { parametric: unknown; answer: unknown };
    expect(fresh.parametric).toEqual(defaultParametricNumericConfig()); expect(fresh.answer).toEqual(defaultParametricNumericAnswerKey());
  });
});

describe("v2 student rendering, preview and review", () => {
  function StudentHarness({ q }: { q: Question }) {
    const [a, setA] = useState<Answer | undefined>();
    return <><StudentQuestionCard q={q} index={0} id="q1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
  }
  it("the student sees the formatted per-attempt stem (pinned d = 32, t = 3.75) and a unit label; no formula or derived value in the DOM", async () => {
    const q = sanitizeExamForStudent(baseExam([physQ()]), { parametric: { assignmentId: "asg-19c", studentId: "stu-1", attemptNumber: 1 } }).sections[0].questions[0];
    render(<StudentHarness q={q} />);
    await screen.findByRole("textbox", { name: "السؤال 1 — القيمة" }, { timeout: 3000 });
    expect(screen.getByText("قطع جسم 32 مترًا في 3.75 ثانية. ما متوسط سرعته؟")).toBeTruthy();
    expect(screen.getByTestId("param-unit-label").textContent).toBe("م/ث");
    expect(document.body.innerHTML).not.toMatch(/d \/ t|speed|8\.53|derivedVariables/);
  });
  it("teacher preview renders a v2 PREVIEW sample (pinned sample 1: 44 m in 2.5 s) and never the answer", async () => {
    render(<ExamPreview exam={baseExam([physQ()]) as never} onClose={() => {}} />);
    expect((await screen.findByTestId("param-preview-text", {}, { timeout: 3000 })).textContent).toBe("قطع جسم 44 مترًا في 2.5 ثانية. ما متوسط سرعته؟");
    expect(document.body.innerHTML).not.toMatch(/17\.6|d \/ t/);
  });
  it("the review shows the official instance with derived values and constraint evaluation (teacher only)", async () => {
    const instance = { ok: true, generatorVersion: 2, seedDigest: "7ddbf2fb1401d717e72f9663f92d286a", identity: { assignmentId: "a1", studentId: "s1", attemptNumber: 1, questionKey: "r1" }, values: { a: 8, b: 10 }, derived: { area: 80 }, text: "مستطيل طوله 8 سم وعرضه 10 سم. احسب مساحته.", expected: 80, constraints: [{ source: "a != b", left: 8, right: 10, holds: true }] };
    const body = { ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 2 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2, totalMarks: 2, percentage: 100, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2, totalMarks: 2, percentage: 100, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }], questions: [{ questionId: "r1", questionNumber: 1, text: RTEXT, marks: 2, type: "parametricNumeric", parametricInstance: instance, studentAnswer: { kind: "numeric", value: "80" }, expectedAnswer: { expression: "area", mode: "tolerance", tolerance: 0 }, autoGrade: { score: 2, manualReview: false }, manualScore: null, teacherComment: "" }] };
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("param-review", {}, { timeout: 3000 });
    expect(within(view).getByTestId("param-review-derived").textContent).toMatch(/area\s*=\s*80/);
    expect(within(view).getByTestId("param-review-constraints").textContent).toMatch(/a != b.*✓/);
    expect(within(view).getByTestId("param-review-audit").textContent).toMatch(/الإصدار 2/);
  });
});

describe("module hygiene", () => {
  it("the editor and the sample / inspector code never call the network or a live-attempt API; the editor stays lazy", () => {
    const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["src/questionTypes/editors/ParametricNumericEditor.tsx", "src/parametric/ParametricReviewView.tsx"])
      expect(strip(fs.readFileSync(path.join(repo, f), "utf8")), f).not.toMatch(/fetch\(|apiRequest|student-submission|student-assignment|XMLHttpRequest|localStorage|Math\.random|innerHTML|\beval\s*\(|new Function/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("parametricNumeric", 1, lazy\(\(\) => import\("\.\/editors\/ParametricNumericEditor"\)\)\)/);
  });
});
