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
import { answered } from "../answerState";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { chipsFor, typeDescription, typeIcon } from "./typePresentation";
import { QUESTION_TYPE_CATALOG, questionTypeDefinition, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { evaluateExamFinalization } from "../examFinalization";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown, options?: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 19B — the parametricNumeric@1 UI: catalog / palette identity and defaults, the lazy student renderer (the sanitized
// per-attempt stem + a labelled numeric input / unit input or label, restore, read-only, unavailable state, no private data in
// the DOM), the teacher preview with a PREVIEW-namespace sample, the lazy editor inside the REAL Builder (variables, constraints,
// answer expression, tolerance / range, unit policy, placeholder insertion, sample refresh with the teacher-only sample answer,
// inline canonical validation — never raw JSON), the teacher review of the exact official instance and the lazy-import guard.
// Pinned samples come from an independent reference of generator v1. New-function suite (fail-first on b8aa6ce).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CFG = { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } };
const KEY = { expression: "a * b", mode: "tolerance", tolerance: 0 };
const TEXT = "احسب ناتج ضرب {{a}} في {{b}}.";
const teacherQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("parametricNumeric" as never, { examQuestionId: "q1", text: TEXT, marks: 4 }), parametric: JSON.parse(JSON.stringify(CFG)), answer: JSON.parse(JSON.stringify(KEY)), ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-19B", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const IDENTITY = { parametric: { assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1 } };
const studentQ = (over: Record<string, unknown> = {}, ctx: unknown = IDENTITY) => sanitizeExamForStudent(baseExam([teacherQ(over)]), ctx).sections[0].questions[0];
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
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as { parametric: typeof CFG; answer: Record<string, unknown>; text: string } & Record<string, unknown>;

function StudentHarness({ q, initial, disabled }: { q: Question; initial?: Answer; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <><StudentQuestionCard q={q} index={0} id="q1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("catalog, defaults, finalization", () => {
  it("catalog row: response family, auto-graded, offline, NOT compound, no partial credit; responseKinds ['numeric']; version 1 only; 20 production types", () => {
    const d = questionTypeDefinition("parametricNumeric")!;
    expect(d).toMatchObject({ key: "parametricNumeric", version: 1, label: "سؤال رقمي بمعطيات متغيرة", category: "response", gradingMode: "auto", legacy: false });
    expect(d.capabilities).toMatchObject({ autoGrading: true, partialCredit: false, offline: true, compoundPart: false, interactive: false, manualGrading: false, requiresImage: false });
    expect(d.responseKinds).toEqual(["numeric"]);
    expect(QUESTION_TYPE_CATALOG.length).toBe(23); expect(QUESTION_TYPE_CATALOG.at(-4)!.key).toBe("parametricNumeric");   // 19D appends hotspot / labelDiagram · 19E appends openResponse
    expect(supportsQuestionTypeVersion("parametricNumeric", 1)).toBe(true); expect(supportsQuestionTypeVersion("parametricNumeric", 2)).toBe(false);
    expect(typeDescription(d)).toMatch(/متغيرة/); expect(typeIcon(d)).toBe("ƒx"); expect(chipsFor(d)).toEqual(["تصحيح تلقائي"]);
    expect(resolveAuthoringEditor("parametricNumeric", 1)).toBeTruthy(); expect(resolveStudentRenderer("parametricNumeric", 1)?.key).toBe("parametricNumeric");
    expect(resolveAuthoringEditor("parametricNumeric", 2)).toBeUndefined(); expect(resolveStudentRenderer("parametricNumeric", 2)).toBeUndefined();
  });
  it("newQuestion seeds a valid config at version 1 whose EMPTY expression blocks finalization; a complete question finalizes; compound part refused", () => {
    const q = newQuestion("parametricNumeric" as never) as unknown as Record<string, unknown>;
    expect(q.questionTypeVersion).toBe(1);
    expect(validateQuestionTypeNode(q, "parametricNumeric", 1).map(i => i.code)).toContain("PARAM_ANSWER_EXPRESSION_MISSING");
    expect(validateQuestionTypeNode(teacherQ() as unknown as Record<string, unknown>, "parametricNumeric", 1)).toEqual([]);
    expect(validateQuestionTypeNode(teacherQ() as unknown as Record<string, unknown>, "parametricNumeric", 1, { part: true }).map(i => i.code)).toEqual(["TYPE_NOT_COMPOUND_CAPABLE"]);
    const blocked = evaluateExamFinalization(baseExam([teacherQ({ answer: { ...KEY, expression: "eval(a)" } })]) as never);
    expect(blocked.canFinalize).toBe(false); expect(JSON.stringify(blocked.blockers)).toContain("PARAM_ANSWER_EXPRESSION_INVALID");
    const fine = evaluateExamFinalization(baseExam([teacherQ()]) as never);
    expect(JSON.stringify(fine.blockers)).not.toMatch(/PARAM_/); expect(fine.structuralErrors).toEqual([]);
  });
});

describe("student renderer", () => {
  it("shows the per-attempt stem (pinned 2 × 13) and a labelled numeric input; typing emits { kind: numeric, value }", async () => {
    render(<StudentHarness q={studentQ()} />);
    const input = await screen.findByRole("textbox", { name: "السؤال 1 — القيمة" }, { timeout: 3000 });
    expect(screen.getByText("احسب ناتج ضرب 2 في 13.")).toBeTruthy();
    expect(input.getAttribute("inputmode")).toBe("decimal"); expect(input.getAttribute("dir")).toBe("ltr");
    fireEvent.change(input, { target: { value: "26" } }); await tick();
    expect(answerOut()).toEqual({ kind: "numeric", value: "26" });
    expect(answered(answerOut())).toBe(true);
    expect(document.body.innerHTML).not.toMatch(/a \* b|tolerance|expression|a &lt; b/);
  });
  it("unit input when the response requires a unit; a fixed unit label otherwise; restore pre-fills; disabled is read-only", async () => {
    render(<StudentHarness q={studentQ({ parametric: { ...CFG, response: { unit: "input" } }, answer: { ...KEY, unit: "cm" } })} initial={{ kind: "numeric", value: "26", unit: "cm" }} />);
    const unit = await screen.findByRole("textbox", { name: "السؤال 1 — الوحدة" }, { timeout: 3000 }) as HTMLInputElement;
    expect(unit.value).toBe("cm"); expect((screen.getByRole("textbox", { name: "السؤال 1 — القيمة" }) as HTMLInputElement).value).toBe("26");
    fireEvent.change(unit, { target: { value: "mm" } }); await tick();
    expect(answerOut()).toEqual({ kind: "numeric", value: "26", unit: "mm" });
    expect(document.body.innerHTML).not.toMatch(/>cm</);                                                  // the expected unit is never shown
    cleanup();
    render(<StudentHarness q={studentQ({ parametric: { ...CFG, response: { unit: "label", label: "سم" } } })} disabled />);
    const v = await screen.findByRole("textbox", { name: "السؤال 1 — القيمة" }, { timeout: 3000 }) as HTMLInputElement;
    expect(v.disabled).toBe(true); expect(screen.getByTestId("param-unit-label").textContent).toBe("سم");
  });
  it("an unavailable projection (no identity / invalid config) renders an explicit notice and no input", async () => {
    render(<StudentHarness q={studentQ({}, null)} />);                                     // no server identity
    expect(await screen.findByTestId("param-unavailable", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\{\{|\}\}/);
  });
  it("teacher preview: the SAME renderer generates a PREVIEW-namespace sample (pinned sample 1: 7 × 15) and never shows the answer", async () => {
    render(<ExamPreview exam={baseExam([teacherQ()]) as never} onClose={() => {}} />);
    expect(await screen.findByTestId("param-preview-note", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByTestId("param-preview-text").textContent).toBe("احسب ناتج ضرب 7 في 15.");
    expect(document.body.innerHTML).not.toMatch(/105|a \* b/);
  });
});

describe("authoring editor inside the REAL Builder", () => {
  it("adding «سؤال رقمي بمعطيات متغيرة» from the palette creates parametricNumeric@1 and mounts the lazy editor with the canonical blocker", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q0", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(23);   // 19D appends hotspot / labelDiagram · 19E appends openResponse
    fireEvent.click(within(d).getByRole("tab", { name: "إجابات" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "parametricNumeric")!;
    expect(card.textContent).toContain("سؤال رقمي بمعطيات متغيرة");
    fireEvent.click(card); await tick(50);
    const q = hist().present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect(q.presentationType).toBe("parametricNumeric"); expect(q.questionTypeVersion).toBe(1);
    const editor = await screen.findByTestId("qt-editor-parametricNumeric", {}, { timeout: 3000 });
    expect(within(editor).getByTestId("param-issues").textContent).toMatch(/تعبير الإجابة/);
  });
  it("sample preview (teacher-only answer), sample refresh, expression edit with inline validation, variables, constraints, tolerance / range, unit policy, placeholder insertion — no raw JSON", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ()]));
    const editor = await screen.findByTestId("qt-editor-parametricNumeric", {}, { timeout: 3000 });
    const sample = () => within(editor).getByTestId("param-sample");
    expect(sample().textContent).toContain("احسب ناتج ضرب 7 في 15."); expect(within(sample()).getByTestId("param-sample-answer").textContent).toContain("105");
    expect(sample().textContent).toMatch(/عينة معاينة/);
    fireEvent.click(within(editor).getByRole("button", { name: "عينة جديدة" })); await tick();
    expect(sample().textContent).toContain("احسب ناتج ضرب 8 في 17."); expect(within(sample()).getByTestId("param-sample-answer").textContent).toContain("136");
    const expr = within(editor).getByRole("textbox", { name: "تعبير الإجابة" }) as HTMLInputElement;
    expect(expr.getAttribute("dir")).toBe("ltr");
    fireEvent.change(expr, { target: { value: "a + b" } }); await tick();
    expect(firstQ(hist()).answer.expression).toBe("a + b"); expect(within(sample()).getByTestId("param-sample-answer").textContent).toContain("25");
    fireEvent.change(expr, { target: { value: "sqrt(a)" } }); await tick();
    expect(within(editor).getByTestId("param-issues").textContent).toMatch(/تعبير الإجابة/);
    fireEvent.change(expr, { target: { value: "a * b" } }); await tick();
    // variables: add (next free id), edit bounds, remove
    fireEvent.click(within(editor).getByRole("button", { name: "+ متغير" })); await tick();
    expect(firstQ(hist()).parametric.variables.map(v => v.id)).toEqual(["a", "b", "c"]);
    fireEvent.change(within(editor).getByRole("spinbutton", { name: "أعلى قيمة للمتغير 3" }), { target: { value: "50" } }); await tick();
    expect(firstQ(hist()).parametric.variables[2]).toEqual({ id: "c", kind: "int", min: 1, max: 50, step: 1 });
    fireEvent.change(within(editor).getByRole("textbox", { name: "معرّف المتغير 3" }), { target: { value: "hosts" } }); await tick();
    expect(firstQ(hist()).parametric.variables[2].id).toBe("hosts");
    fireEvent.click(within(editor).getByRole("button", { name: "إدراج {{hosts}} في نص السؤال" })); await tick();
    expect(firstQ(hist()).text).toBe(TEXT + " {{hosts}}");
    fireEvent.click(within(editor).getByRole("button", { name: "حذف المتغير 3" })); await tick();
    expect(firstQ(hist()).parametric.variables.map(v => v.id)).toEqual(["a", "b"]);
    expect(within(editor).getByTestId("param-issues").textContent).toMatch(/hosts/);                       // the stem now names an unknown variable
    // constraints
    fireEvent.click(within(editor).getByRole("button", { name: "+ قيد" })); await tick();
    fireEvent.change(within(editor).getByRole("textbox", { name: "القيد 2" }), { target: { value: "a + b <= 20" } }); await tick();
    expect(firstQ(hist()).parametric.constraints).toEqual(["a < b", "a + b <= 20"]);
    fireEvent.click(within(editor).getByRole("button", { name: "حذف القيد 1" })); await tick();
    expect(firstQ(hist()).parametric.constraints).toEqual(["a + b <= 20"]);
    // grading mode and unit policy
    fireEvent.change(within(editor).getByRole("combobox", { name: "طريقة المقارنة" }), { target: { value: "range" } }); await tick();
    expect(firstQ(hist()).answer).toEqual({ expression: "a * b", mode: "range", below: 0, above: 0 });
    fireEvent.change(within(editor).getByRole("spinbutton", { name: "أعلى من الناتج بمقدار" }), { target: { value: "2" } }); await tick();
    expect(firstQ(hist()).answer.above).toBe(2);
    fireEvent.change(within(editor).getByRole("combobox", { name: "وحدة الإجابة" }), { target: { value: "input" } }); await tick();
    expect(firstQ(hist()).parametric.response).toEqual({ unit: "input" });
    fireEvent.change(within(editor).getByRole("textbox", { name: "الوحدة الصحيحة" }), { target: { value: "cm" } }); await tick();
    expect(firstQ(hist()).answer.unit).toBe("cm");
    fireEvent.change(within(editor).getByRole("combobox", { name: "وحدة الإجابة" }), { target: { value: "none" } }); await tick();
    expect(firstQ(hist()).answer.unit).toBeUndefined();
    expect(editor.querySelectorAll("textarea").length).toBe(0);
    expect(editor.textContent).not.toMatch(/"variables"|\{"v"/);
  });
});

describe("teacher review", () => {
  const instance = { ok: true, generatorVersion: 1, seedDigest: "896b187e1b0615f2313ff4fd48a8a628", identity: { assignmentId: "a1", studentId: "s1", attemptNumber: 1, questionKey: "q1" }, values: { a: 2, b: 13 }, text: "احسب ناتج ضرب 2 في 13.", expected: 26 };
  const body = (parametricInstance: unknown, studentAnswer: unknown = { kind: "numeric", value: "26" }) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 4 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 4, totalMarks: 4, percentage: 100, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 4, totalMarks: 4, percentage: 100, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }], questions: [{ questionId: "q1", questionNumber: 1, text: TEXT, marks: 4, type: "parametricNumeric", parametricInstance, studentAnswer, expectedAnswer: KEY, autoGrade: { score: 4, manualReview: false }, manualScore: null, teacherComment: "" }] });
  it("shows the EXACT official instance, the student's answer, the authoritative expected value and the audit identity; student text is text", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body(instance, { kind: "numeric", value: "<img src=x onerror=alert(1)>" }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("param-review", {}, { timeout: 3000 });
    expect(view.textContent).toContain("احسب ناتج ضرب 2 في 13.");
    expect(within(view).getByTestId("param-review-values").textContent).toMatch(/a\s*=\s*2/);
    expect(within(view).getByTestId("param-review-expected").textContent).toContain("26");
    expect(within(view).getByTestId("param-review-audit").textContent).toMatch(/896b187e1b0615f2313ff4fd48a8a628/);
    expect(within(view).getByTestId("param-review-audit").textContent).toMatch(/1/);
    expect(view.querySelector("img")).toBeNull();
  });
  it("an instance the server could not regenerate is an explicit manual-review state (no expected value)", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body({ ok: false, code: "PARAM_AUTHORITY_INVALID", message: "x" }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("param-review", {}, { timeout: 3000 });
    expect(within(view).getByTestId("param-review-unavailable").textContent).toMatch(/تصحيح يدوي/);
    expect(within(view).queryByTestId("param-review-expected")).toBeNull();
  });
});

describe("lazy loading and module hygiene", () => {
  it("the renderer and the editor are reached ONLY through the registries' import() edges; no innerHTML / eval / network in the new UI modules", () => {
    const srcFiles: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p); } };
    walk(path.join(repo, "src"));
    const staticImporters = (name: string) => srcFiles.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f));
    expect(staticImporters("editors/ParametricNumericEditor")).toEqual([]); expect(staticImporters("student/ParametricNumericResponse")).toEqual([]);
    expect(staticImporters("parametric/ParametricReviewView")).toEqual(["src/AssignmentReview.tsx"]);
    const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["src/parametric/ParametricReviewView.tsx", "src/questionTypes/student/ParametricNumericResponse.tsx", "src/questionTypes/editors/ParametricNumericEditor.tsx"])
      expect(strip(fs.readFileSync(path.join(repo, f), "utf8")), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\s*\(|new Function|fetch\(|XMLHttpRequest|localStorage|Math\.random|https?:\/\//);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/studentRegistry.tsx"), "utf8")).toMatch(/registerStudentRenderer\("parametricNumeric", 1, lazy\(\(\) => import\("\.\/student\/ParametricNumericResponse"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("parametricNumeric", 1, lazy\(\(\) => import\("\.\/editors\/ParametricNumericEditor"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "scripts/check-bundle-budget.mjs"), "utf8")).toMatch(/PARAMETRIC_SIGNATURES/);
  });
});
