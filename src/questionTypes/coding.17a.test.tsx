// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import ExamPreview from "../ExamPreview";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { typeSpecificContentPresent } from "./typeContent";
import { chipsFor } from "./typePresentation";
import { questionTypeDefinition } from "../questionTypeCatalog";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 17A — the coding UI: the lazy, dependency-free CodingEditor (LTR, monospace, line numbers, Tab / Enter indentation,
// bounded size), the student response (language selector, starter code, sample tests, reset through ConfirmDialog, run
// only when a trusted provider reports the language), the teacher authoring panel inside the REAL Builder (languages,
// starter code, public / hidden tests with stable ids, comparator, limits, reference solutions, factual inspector), the
// palette card, the SAME component in the teacher preview, and the teacher review that shows student source as TEXT only.
// Fail-first on 7af619a4: new modules are loaded at runtime; the type is unknown to the registries.
const load = <T,>(p: string): Promise<T> => import(/* @vite-ignore */ p);
type EditorMod = typeof import("../coding/CodingEditor");
type ExecMod = typeof import("../coding/codingExecution");

const CFG = {
  allowedLanguages: ["python", "csharp"], defaultLanguage: "python",
  starterCode: { python: "a, b = map(int, input().split())\n", csharp: "using System;\n" },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 },
  publicTests: [{ id: "pub-1", title: "مثال أول", input: "2 3\n", sampleOutput: "5\n" }]
};
const KEY = { hiddenTests: [{ id: "hid-1", title: "سري", input: "HIDDEN-IN\n", expectedOutput: "HIDDEN-OUT\n", weight: 2 }], comparator: "trimTrailingWhitespace", referenceSolutions: { python: "print(sum(map(int, input().split())))\n" } };
const teacherQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("coding" as never, { examQuestionId: "c1", text: "اقرأ عددين صحيحين واطبع مجموعهما.", marks: 10 }), coding: CFG, answer: KEY, ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-17A", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (over: Record<string, unknown> = {}) => sanitizeExamForStudent(baseExam([teacherQ(over)])).sections[0].questions[0];
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
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as { coding: typeof CFG; answer: typeof KEY } & Record<string, unknown>;

function StudentHarness({ q, initial, wrap, disabled }: { q: Question; initial?: Answer; wrap?: (n: ReactNode) => ReactNode; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  const card = <StudentQuestionCard q={q} index={0} id="c1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} />;
  return <>{wrap ? wrap(card) : card}<output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");
const editorBox = async () => (await screen.findByRole("textbox", { name: /محرر الكود/ }, { timeout: 3000 })) as HTMLTextAreaElement;

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("C5 — CodingEditor: lazy, dependency-free, accessible, LTR", () => {
  it("renders a labelled LTR monospace textarea with a line-number gutter (one text node, not one element per line)", async () => {
    const { default: CodingEditor } = await load<EditorMod>("../coding/CodingEditor");
    render(<CodingEditor value={"a\nb\nc"} onChange={() => {}} language="python" label="محرر الكود" />);
    const ta = screen.getByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA"); expect(ta.getAttribute("dir")).toBe("ltr");
    expect(ta.getAttribute("spellcheck")).toBe("false"); expect(ta.getAttribute("autocapitalize")).toBe("off"); expect(ta.getAttribute("wrap")).toBe("off");
    expect(ta.className).toContain("cx-code-input");
    const gutter = screen.getByTestId("code-gutter");
    expect(gutter.getAttribute("aria-hidden")).toBe("true"); expect(gutter.textContent).toBe("1\n2\n3"); expect(gutter.children.length).toBe(0);
    expect(ta.closest("[dir=ltr]")).toBeTruthy();
  });
  it("Tab inserts the language's indent unit, Shift+Tab outdents, Escape then Tab leaves the editor (no keyboard trap)", async () => {
    const { default: CodingEditor } = await load<EditorMod>("../coding/CodingEditor");
    const onChange = vi.fn();
    const { rerender } = render(<CodingEditor value={"x"} onChange={onChange} language="python" label="محرر الكود" />);
    const ta = screen.getByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement;
    ta.setSelectionRange(0, 0);
    expect(fireEvent.keyDown(ta, { key: "Tab" })).toBe(false);                                     // prevented: indentation, not focus move
    expect(onChange).toHaveBeenLastCalledWith("    x");                                             // python indent unit = 4 spaces
    rerender(<CodingEditor value={"    x"} onChange={onChange} language="python" label="محرر الكود" />);
    ta.setSelectionRange(4, 4);
    fireEvent.keyDown(ta, { key: "Tab", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith("x");
    rerender(<CodingEditor value={"y"} onChange={onChange} language="csharp" label="محرر الكود" />);
    ta.setSelectionRange(0, 0);
    fireEvent.keyDown(ta, { key: "Tab" });
    expect(onChange).toHaveBeenLastCalledWith("    y");                                             // C# indent unit = 4 spaces (registry data)
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(fireEvent.keyDown(ta, { key: "Tab" })).toBe(true);                                      // released: the browser moves focus
    expect(screen.getByText(/Esc/)).toBeTruthy();                                                   // the escape hatch is documented on screen
  });
  it("Enter keeps the current indentation (and adds one unit after an opening ':' '{' '(' '[')", async () => {
    const { default: CodingEditor } = await load<EditorMod>("../coding/CodingEditor");
    const onChange = vi.fn();
    const { rerender } = render(<CodingEditor value={"    total = 0"} onChange={onChange} language="python" label="محرر الكود" />);
    const ta = screen.getByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement;
    ta.setSelectionRange(13, 13);
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("    total = 0\n    ");
    rerender(<CodingEditor value={"for i in x:"} onChange={onChange} language="python" label="محرر الكود" />);
    ta.setSelectionRange(11, 11);
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("for i in x:\n    ");
  });
  it("a change above maxBytes (UTF-8) is refused with an Arabic message; near the limit a size indicator appears", async () => {
    const { default: CodingEditor } = await load<EditorMod>("../coding/CodingEditor");
    const onChange = vi.fn();
    render(<CodingEditor value={"x".repeat(900)} onChange={onChange} language="python" label="محرر الكود" maxBytes={1024} />);
    const ta = screen.getByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement;
    expect(screen.getByTestId("code-size").textContent).toMatch(/900/);
    fireEvent.change(ta, { target: { value: "x".repeat(1025) } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/الحد الأقصى/);
    fireEvent.change(ta, { target: { value: "ب".repeat(512) } });                                    // exactly 1024 bytes
    expect(onChange).toHaveBeenLastCalledWith("ب".repeat(512));
  });
  it("readOnly renders a non-editable source (review / submitted)", async () => {
    const { default: CodingEditor } = await load<EditorMod>("../coding/CodingEditor");
    render(<CodingEditor value={"print(1)"} onChange={() => {}} language="python" label="محرر الكود" readOnly />);
    expect((screen.getByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement).readOnly).toBe(true);
  });
});

describe("Student response — registered renderer, starter code, language selection, samples, reset, run gating", () => {
  it("coding@1 has a lazy authoring editor and student renderer (coding@2 too since 17F-C2 RF1, coding@3 since 19F; no V4); the card renders the coding response for the sanitized question", async () => {
    expect(resolveAuthoringEditor("coding", 1)).toBeTruthy(); expect(resolveAuthoringEditor("coding", 4)).toBeUndefined();
    expect(resolveStudentRenderer("coding", 1)?.label).toBe("برمجة / كتابة كود"); expect(resolveStudentRenderer("coding", 4)).toBeUndefined();
    render(<StudentHarness q={studentQ()} />);
    expect(await screen.findByTestId("coding-response", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId("iex-unsupported")).toBeNull();
  });
  it("C7 the editor starts with the default language's starter code; nothing is recorded until the student edits; the first edit records {kind:'code', language, languageVersion, source}", async () => {
    render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    expect(ta.value).toBe(CFG.starterCode.python);
    expect(answerOut()).toBeNull();
    fireEvent.change(ta, { target: { value: CFG.starterCode.python + "print(a + b)\n" } });
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: CFG.starterCode.python + "print(a + b)\n" });
  });
  it("C6 the language selector lists ONLY the allowed languages; switching an untouched editor loads that language's starter; the selection persists in the Answer and on remount", async () => {
    const { unmount } = render(<StudentHarness q={studentQ()} />);
    const sel = (await screen.findByRole("combobox", { name: "لغة البرمجة" }, { timeout: 3000 })) as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.value)).toEqual(["python", "csharp"]);
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(["Python", "C#"]);
    fireEvent.change(sel, { target: { value: "csharp" } });
    const ta = await editorBox();
    expect(ta.value).toBe(CFG.starterCode.csharp);
    expect(answerOut()).toMatchObject({ kind: "code", language: "csharp", source: CFG.starterCode.csharp });
    fireEvent.change(ta, { target: { value: "Console.WriteLine(5);\n" } });
    const saved = answerOut();
    expect(saved).toEqual({ kind: "code", language: "csharp", languageVersion: 1, source: "Console.WriteLine(5);\n" });
    unmount();
    render(<StudentHarness q={studentQ()} initial={saved} />);
    expect(((await screen.findByRole("combobox", { name: "لغة البرمجة" })) as HTMLSelectElement).value).toBe("csharp");
    expect((await editorBox()).value).toBe("Console.WriteLine(5);\n");
  });
  it("switching language after editing keeps the student's source (never destroys work)", async () => {
    render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    fireEvent.change(ta, { target: { value: "my own code\n" } });
    fireEvent.change(screen.getByRole("combobox", { name: "لغة البرمجة" }), { target: { value: "csharp" } });
    expect(answerOut()).toEqual({ kind: "code", language: "csharp", languageVersion: 1, source: "my own code\n" });
  });
  it("public sample tests are shown (input + sample output, LTR); no hidden test is present anywhere in the DOM", async () => {
    render(<StudentHarness q={studentQ()} />);
    const sample = await screen.findByTestId("coding-sample-test", {}, { timeout: 3000 });
    expect(sample.textContent).toContain("مثال أول"); expect(sample.textContent).toContain("2 3"); expect(sample.textContent).toContain("5");
    expect(document.body.innerHTML).not.toMatch(/HIDDEN-IN|HIDDEN-OUT|hid-1|سري|print\(sum/);
  });
  it("reset to starter goes through the shared ConfirmDialog (never window.confirm) when meaningful source would be lost", async () => {
    if (typeof window.confirm !== "function") (window as unknown as { confirm: () => boolean }).confirm = () => false;   // happy-dom has none
    const native = vi.spyOn(window, "confirm");
    render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    fireEvent.change(ta, { target: { value: "lots of work\n" } });
    fireEvent.click(screen.getByRole("button", { name: "استعادة الكود الابتدائي" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg.textContent).toMatch(/الكود الابتدائي/);
    fireEvent.click(within(dlg).getByRole("button", { name: "استعادة" }));
    await tick();
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: CFG.starterCode.python });
    expect(native).not.toHaveBeenCalled();
  });
  it("C33 provider unavailable is a NORMAL state: an Arabic notice, no «تشغيل» button, the question stays fully answerable", async () => {
    render(<StudentHarness q={studentQ()} />);
    const note = await screen.findByTestId("coding-run-unavailable", {}, { timeout: 3000 });
    expect(note.textContent).toBe("تشغيل الكود غير متاح حاليًا؛ يمكن حفظ الإجابة وتسليمها للمراجعة.");
    expect(screen.queryByRole("button", { name: "تشغيل" })).toBeNull();
    fireEvent.change(await editorBox(), { target: { value: "print(1)\n" } });
    expect(answerOut()).toMatchObject({ kind: "code", source: "print(1)\n" });
  });
  it("C34 «تشغيل» appears ONLY for a language the trusted provider reports; results render with Arabic status labels and are never stored in the Answer", async () => {
    const { CodingExecutionContext } = await load<ExecMod>("../coding/codingExecution");
    const run = vi.fn(async () => ({ status: "compile-error" as const, stdout: "", stderr: "SyntaxError: <b>bad</b>" }));
    const service = { capabilities: { available: true, languages: [{ key: "python", languageVersion: 1 }] }, run };
    render(<StudentHarness q={studentQ()} wrap={n => <CodingExecutionContext.Provider value={service}>{n}</CodingExecutionContext.Provider>} />);
    const btn = await screen.findByRole("button", { name: "تشغيل" }, { timeout: 3000 });
    fireEvent.change(await editorBox(), { target: { value: "print(\n" } });
    fireEvent.click(btn); await tick(20);
    expect(run).toHaveBeenCalledTimes(1);
    expect((run.mock.calls[0] as unknown[])[0]).toEqual({ language: "python", languageVersion: 1, source: "print(\n", stdin: "2 3\n", testId: "pub-1" });
    const result = await screen.findByTestId("coding-result");
    expect(result.getAttribute("data-status")).toBe("compile-error"); expect(result.textContent).toContain("خطأ في الترجمة");
    expect(result.querySelector("b")).toBeNull(); expect(result.textContent).toContain("<b>bad</b>");    // stderr is TEXT
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: "print(\n" });
    fireEvent.change(screen.getByRole("combobox", { name: "لغة البرمجة" }), { target: { value: "csharp" } });
    expect(screen.queryByRole("button", { name: "تشغيل" })).toBeNull();                                // not offered for C#
    expect(screen.getByTestId("coding-run-unavailable")).toBeTruthy();
  });
  it("the student selector lists EXACTLY the teacher-allowed languages drawn from Python / Java / C# — never JavaScript / TypeScript / C++ / SQL", async () => {
    const { unmount } = render(<StudentHarness q={studentQ({ coding: { ...CFG, allowedLanguages: ["python", "java"], starterCode: {} } })} />);
    let sel = (await screen.findByRole("combobox", { name: "لغة البرمجة" }, { timeout: 3000 })) as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(["Python", "Java"]);
    unmount();
    render(<StudentHarness q={studentQ({ coding: { ...CFG, allowedLanguages: ["python", "java", "csharp"], starterCode: {} } })} />);
    sel = (await screen.findByRole("combobox", { name: "لغة البرمجة" }, { timeout: 3000 })) as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(["Python", "Java", "C#"]);
    expect(document.body.textContent).not.toMatch(/JavaScript|TypeScript|C\+\+|SQL/);
  });
  it("C24 / C44 an unknown or malformed language config renders a safe Arabic panel (no editor, no crash) — never silently another language", async () => {
    const q = { ...studentQ(), coding: { ...CFG, allowedLanguages: ["cobol"], defaultLanguage: "cobol" } } as unknown as Question;
    render(<StudentHarness q={q} />);
    const panel = await screen.findByTestId("coding-config-invalid", {}, { timeout: 3000 });
    expect(panel.textContent).toMatch(/غير صالح|غير مدعوم/);
    expect(screen.queryByRole("textbox", { name: /محرر الكود/ })).toBeNull();
  });
  it("disabled (submitted / ended) → the source is read-only and the language cannot change", async () => {
    render(<StudentHarness q={studentQ()} initial={{ kind: "code", language: "python", languageVersion: 1, source: "print(9)\n" } as unknown as Answer} disabled />);
    expect((await editorBox()).readOnly).toBe(true);
    expect((screen.getByRole("combobox", { name: "لغة البرمجة" }) as HTMLSelectElement).disabled).toBe(true);
  });
  it("the student renderer never forwards private data even when handed a teacher-side question (defense in depth)", async () => {
    const raw = { ...teacherQ(), coding: { ...CFG, hiddenTests: KEY.hiddenTests, referenceSolutions: KEY.referenceSolutions } } as unknown as Question;
    render(<StudentHarness q={raw} />);
    await editorBox();
    expect(document.body.innerHTML).not.toMatch(/HIDDEN-IN|HIDDEN-OUT|print\(sum/);
  });
});

describe("C27 — the teacher preview uses the SAME student coding component (no fake editor, no private data)", () => {
  it("ExamPreview renders coding-response for the teacher's question and leaks no hidden test / reference solution", async () => {
    render(<ExamPreview exam={baseExam([teacherQ()]) as never} onClose={() => {}} />);
    expect(await screen.findByTestId("coding-response", {}, { timeout: 3000 })).toBeTruthy();
    expect((await editorBox()).value).toBe(CFG.starterCode.python);
    expect(document.body.innerHTML).not.toMatch(/HIDDEN-IN|HIDDEN-OUT|hid-1|print\(sum/);
  });
});

describe("C28 / C29 — teacher review shows the submitted source safely", () => {
  const evil = "<img src=x onerror=\"window.__pwned=1\"><script>window.__pwned=2</script>\nprint('ok')\n";
  const reviewBody = () => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب البرمجة", totalMarks: 10 }, student: { studentId: "s1", studentName: "أحمد", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview" }], questions: [{ questionId: "c1", questionNumber: 1, text: "اقرأ عددين", marks: 10, type: "coding", studentAnswer: { kind: "code", language: "python", languageVersion: 1, source: evil }, expectedAnswer: KEY, autoGrade: { score: 0, manualReview: true }, manualScore: null, teacherComment: "" }] });
  function mountReview() {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => reviewBody() } as Response)) as unknown as typeof fetch;
    return render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
  }
  it("language badge, monospace read-only source with line numbers in a bounded scroll box, copy button; manual marks stay the official authority", async () => {
    mountReview();
    const view = await screen.findByTestId("code-review-source", {}, { timeout: 3000 });
    expect(screen.getByTestId("code-review-language").textContent).toBe("Python");
    expect(view.textContent).toContain("print('ok')");
    expect(view.className).toContain("cx-code-view");
    expect(screen.getByTestId("code-review-gutter").textContent).toBe("1\n2\n3");
    expect(screen.getByRole("button", { name: "نسخ الكود" })).toBeTruthy();
    expect(screen.getByLabelText(/علامة المعلم/)).toBeTruthy();
    expect(screen.getByText(/يحتاج تصحيحًا يدويًا/)).toBeTruthy();
  });
  it("C29 the student source is rendered as TEXT: no element is created from it, no handler runs", async () => {
    mountReview();
    const view = await screen.findByTestId("code-review-source", {}, { timeout: 3000 });
    expect(view.textContent).toContain("<script>window.__pwned=2</script>");
    expect(view.querySelector("img, script")).toBeNull();
    expect(document.querySelectorAll("script").length).toBe(0);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
  it("the teacher-side panel summarises the private key factually (hidden test count, comparator, reference solution as text) instead of raw JSON", async () => {
    mountReview();
    const key = await screen.findByTestId("code-review-key", {}, { timeout: 3000 });
    expect(key.textContent).toMatch(/اختبارات مخفية: 1/);
    expect(key.textContent).toContain("print(sum(map(int, input().split())))");
    expect(key.textContent).not.toMatch(/\{"hiddenTests"/);
  });
});

describe("Teacher authoring panel inside the REAL Builder", () => {
  it("C35 palette: 17 cards; «برمجة / كتابة كود» under «تفاعلي» with factual chips (manual today, code answer — never «تصحيح تلقائي»); picking it creates coding@1 and mounts the lazy editor", async () => {
    expect(chipsFor(questionTypeDefinition("coding")!)).toEqual(expect.arrayContaining(["تصحيح يدوي حاليًا", "إجابة برمجية"]));
    expect(chipsFor(questionTypeDefinition("coding")!)).not.toContain("تصحيح تلقائي");
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(29);   /* 21D-B.3 adds meshPartSelection (after scene3DSelection) · 20D adds composite · 21A.1 adds chartSelection · 21A.2 adds functionGraphSelection */                                    // 18C adds networkCli · 19A adds inlineCloze · 19B adds parametricNumeric · 19D adds hotspot / labelDiagram · 19E adds openResponse
    fireEvent.click(within(d).getByRole("tab", { name: "تفاعلي" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "coding")!;
    expect(card.textContent).toContain("برمجة / كتابة كود"); expect(card.textContent).toContain("تصحيح يدوي حاليًا"); expect(card.textContent).toContain("إجابة برمجية");
    fireEvent.click(card); await tick(40);
    const q = hist().present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect(q.presentationType).toBe("coding"); expect(q.questionTypeVersion).toBe(2);   // 17F-C2 RF1: new authoring = coding@2
    expect(await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 })).toBeTruthy();
  });
  it("factual inspector + teacher help: type, version, current grading = manual review, languages; the honest 17A explanation", async () => {
    await mountBuilder(baseExam([teacherQ()]));
    const ed = await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    const insp = within(ed).getByTestId("coding-inspector");
    expect(insp.textContent).toContain("نوع السؤال: برمجة"); expect(insp.textContent).toContain("الإصدار: 2");   // 19F: the inspector shows the node's REAL version (it was a hard-coded «1»; this question is authored at coding@2)
    expect(insp.textContent).toContain("طريقة التصحيح الرسمي: يدوي بواسطة المعلم");   // Phase 17C: explicit official mode (default manual) expect(insp.textContent).toContain("Python"); expect(insp.textContent).toContain("C#");
    expect(within(ed).getAllByRole("checkbox").map(c => c.getAttribute("aria-label"))).toEqual(["Python", "Java", "C#"]);   // registry-driven, exactly three
    expect(ed.textContent).not.toMatch(/JavaScript|TypeScript|C\+\+|SQL/);
    // Phase 17C — the 17A "automatic grading not connected yet" explanation is replaced by the current, factual one.
    expect(ed.textContent).toContain("يكتب الطالب الكود ويسلّمه، ويمكنه تجربته على الأمثلة الظاهرة عبر محرك التنفيذ المعزول.");
    expect(ed.textContent).toContain("العلامة الرسمية إما من المعلم، أو تُحتسب تلقائيًا على الخادم من الاختبارات المخفية.");
    for (const h of ["اللغات المسموحة", "اللغة الافتراضية", "الكود الابتدائي", "أمثلة ظاهرة للطالب", "اختبارات مخفية للتصحيح", "حدود التنفيذ"]) expect(ed.textContent, h).toContain(h);
  });
  it("languages + default + starter code + limits + comparator edit the canonical config (allowed languages are registry data)", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ()]));
    await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("checkbox", { name: "Java" })); await tick();
    expect(firstQ(hist()).coding.allowedLanguages).toEqual(["python", "csharp", "java"]);
    fireEvent.change(screen.getByRole("combobox", { name: "اللغة الافتراضية" }), { target: { value: "java" } }); await tick();
    expect(firstQ(hist()).coding.defaultLanguage).toBe("java");
    fireEvent.change(screen.getByRole("textbox", { name: "محرر الكود — الكود الابتدائي — Java" }), { target: { value: "class Main {}\n" } }); await tick();
    expect(firstQ(hist()).coding.starterCode).toEqual({ ...CFG.starterCode, java: "class Main {}\n" });
    fireEvent.change(screen.getByRole("spinbutton", { name: "حد الوقت (ملّي ثانية)" }), { target: { value: "3000" } }); await tick();
    expect(firstQ(hist()).coding.limits.timeMs).toBe(3000);
    fireEvent.change(screen.getByRole("combobox", { name: "طريقة مقارنة المخرجات" }), { target: { value: "exact" } }); await tick();
    expect(firstQ(hist()).answer.comparator).toBe("exact");
    fireEvent.click(screen.getByRole("checkbox", { name: "Java" })); await tick();                    // un-allow → default falls back, starter for java removed
    expect(firstQ(hist()).coding.allowedLanguages).toEqual(["python", "csharp"]);
    expect(firstQ(hist()).coding.defaultLanguage).toBe("python");
    expect(Object.keys(firstQ(hist()).coding.starterCode)).toEqual(["python", "csharp"]);
  });
  it("public samples + hidden tests: add / edit / duplicate / reorder / delete with STABLE ids; hidden rows are marked «مخفي عن الطالب»; weights are numbers", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ({ answer: { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {} } })]));
    await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "إضافة اختبار مخفي" })); await tick();
    fireEvent.click(screen.getByRole("button", { name: "إضافة اختبار مخفي" })); await tick();
    let hidden = firstQ(hist()).answer.hiddenTests;
    expect(hidden.length).toBe(2);
    const [idA, idB] = hidden.map(t => t.id);
    expect(idA).not.toBe(idB); expect(idA).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(screen.getAllByText("مخفي عن الطالب").length).toBe(2);
    fireEvent.change(screen.getByRole("textbox", { name: "مدخلات الاختبار المخفي 2" }), { target: { value: "B-in" } }); await tick();
    fireEvent.change(screen.getByRole("textbox", { name: "المخرجات المتوقعة للاختبار المخفي 2" }), { target: { value: "B-out" } }); await tick();
    fireEvent.change(screen.getByRole("spinbutton", { name: "وزن الاختبار المخفي 2" }), { target: { value: "3" } }); await tick();
    fireEvent.click(screen.getByRole("button", { name: "تحريك الاختبار المخفي 2 لأعلى" })); await tick();
    hidden = firstQ(hist()).answer.hiddenTests;
    expect(hidden.map(t => t.id)).toEqual([idB, idA]);                                            // ids travel with their rows
    expect(hidden[0]).toMatchObject({ id: idB, input: "B-in", expectedOutput: "B-out", weight: 3 });
    fireEvent.click(screen.getByRole("button", { name: "تكرار الاختبار المخفي 1" })); await tick();
    hidden = firstQ(hist()).answer.hiddenTests;
    expect(hidden.length).toBe(3); expect(hidden[0].id).toBe(idB); expect(hidden[2].id).toBe(idA);
    expect(hidden[1].id).not.toBe(idB); expect(hidden[1]).toMatchObject({ input: "B-in", expectedOutput: "B-out", weight: 3 });
    fireEvent.click(screen.getByRole("button", { name: "حذف الاختبار المخفي 2" })); await tick();
    expect(firstQ(hist()).answer.hiddenTests.map(t => t.id)).toEqual([idB, idA]);
    fireEvent.click(screen.getByRole("button", { name: "إضافة مثال ظاهر" })); await tick();
    const pubs = firstQ(hist()).coding.publicTests;
    expect(pubs.length).toBe(2); expect(pubs[0].id).toBe("pub-1");
    fireEvent.change(screen.getByRole("textbox", { name: "المخرجات النموذجية للمثال 2" }), { target: { value: "42\n" } }); await tick();
    expect(firstQ(hist()).coding.publicTests[1]).toMatchObject({ sampleOutput: "42\n" });
  });
  it("reference solutions are PRIVATE (stored under answer, labelled teacher-only); undo / redo restore the exact config", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ({ answer: { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {} } })]));
    await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    const ref = screen.getByRole("textbox", { name: "محرر الكود — الحل المرجعي — Python" });
    expect(ref.closest("[data-private=true]")).toBeTruthy();
    fireEvent.change(ref, { target: { value: "print(1)\n" } }); await tick();
    expect(firstQ(hist()).answer.referenceSolutions).toEqual({ python: "print(1)\n" });
    expect(firstQ(hist()).coding).not.toHaveProperty("referenceSolutions");
    act(() => hist().undo()); await tick();
    expect(firstQ(hist()).answer.referenceSolutions).toEqual({});
    act(() => hist().redo()); await tick();
    expect(firstQ(hist()).answer.referenceSolutions).toEqual({ python: "print(1)\n" });
  });
  it("an unknown stored language shows an unsupported-language state (no crash, not silently converted) and finalization blocks", async () => {
    await mountBuilder(baseExam([teacherQ({ coding: { ...CFG, allowedLanguages: ["python", "cobol"] } })]));
    const ed = await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    expect(within(ed).getByTestId("coding-unsupported-language").textContent).toContain("cobol");
  });
  it("C25 / C51 changing away from an authored coding question requires the destructive type-change confirmation", () => {
    expect(typeSpecificContentPresent(teacherQ() as unknown as Record<string, unknown>)).toBe(true);
    expect(typeSpecificContentPresent(newQuestion("coding" as never) as unknown as Record<string, unknown>)).toBe(false);
    expect(typeSpecificContentPresent(teacherQ({ coding: { ...CFG, starterCode: {}, publicTests: [] }, answer: { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: { python: "x" } } }) as unknown as Record<string, unknown>)).toBe(true);
  });
});

describe("Large editor performance (5 KB / 25 KB / near the 64 KB limit)", () => {
  it("renders and edits large sources through ONE textarea and ONE gutter text node", async () => {
    const { default: CodingEditor } = await load<EditorMod>("../coding/CodingEditor");
    for (const kb of [5, 25, 63]) {
      const line = "value = value + 1  # تعليق\n";
      const src = line.repeat(Math.floor(kb * 1024 / new TextEncoder().encode(line).length));
      const onChange = vi.fn();
      const t0 = performance.now();
      const { unmount } = render(<CodingEditor value={src} onChange={onChange} language="python" label="محرر الكود" maxBytes={65536} />);
      const ta = screen.getByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: src + "x" } });
      const ms = performance.now() - t0;
      expect(onChange).toHaveBeenCalledWith(src + "x");
      expect(screen.getByTestId("code-gutter").children.length).toBe(0);
      expect(document.querySelectorAll(".cx-code-editor *").length).toBeLessThan(20);
      expect(ms, kb + " KB").toBeLessThan(1500);
      unmount();
    }
  });
});

