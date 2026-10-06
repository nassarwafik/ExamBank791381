// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import StudentQuestionCard from "../StudentQuestionCard";
import CompoundQuestion from "../CompoundQuestion";
import StructuredExamBuilder from "../StructuredExamBuilder";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import type { Question } from "../studentQuestionTypes";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import { StudentAttemptContext, TeacherPreviewContext } from "./studentAttemptContext";

// Phase 19F — the advanced coding modes in the UI: the coding@3 LOCKED TEMPLATE student editor (locked text is never an input and is
// told apart by a visible label + frame, not colour; gaps are native LTR textareas with no autocomplete; keyboard gap navigation and
// reset; the Answer is ONLY gap values; practice runs send values), the shared read-only CODE STIMULUS (text, never HTML), the
// palette PRESETS (what each creates is stated; the catalog stays 23 types), the coding@3 template AUTHORING (paste → mark gaps → no
// JSON), the stimulus authoring control and the teacher review of a template answer. Fail-first on 784a59e: none of this exists.
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;
const TEMPLATE = { language: "python", segments: [
  { kind: "locked", text: "a, b = map(int, input().split())\n" },
  { kind: "editable", id: "gap1", starter: "s = 0\n" },
  { kind: "locked", text: "print(s)\n" },
  { kind: "editable", id: "gap2", starter: "" }
] };
const V3 = (over: Record<string, unknown> = {}) => ({ examQuestionId: "c1", presentationType: "coding", questionTypeVersion: 3, text: "أكمل البرنامج", marks: 10, coding: { allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 }, publicTests: [{ id: "p1", title: "مثال", input: "2 3\n", sampleOutput: "5\n" }], template: TEMPLATE }, answer: { hiddenTests: [{ id: "h1", input: "SECRET-IN", expectedOutput: "SECRET-OUT", weight: 1 }], comparator: "trimTrailingWhitespace", referenceSolutions: { python: "SECRET-REF" }, compileErrorPolicy: "manualReview" }, ...over });
const baseExam = (questions: unknown[]): StructuredExam => ({ examId: "EXAM-19F", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: questions as BuilderQuestion[] }] } as StructuredExam);
const studentQ = (q: unknown = V3()) => sanitizeExamForStudent(baseExam([q])).sections[0].questions[0];
const tick = (ms = 20) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

function StudentHarness({ q, initial, wrap }: { q: Question; initial?: Answer; wrap?: (n: ReactNode) => ReactNode }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  const card = <StudentQuestionCard q={q} index={0} id="c1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} />;
  return <>{wrap ? wrap(card) : card}<output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");
const gaps = async () => { await screen.findByTestId("coding-template-response", {}, { timeout: 3000 }); return screen.getAllByTestId("coding-template-input") as HTMLTextAreaElement[]; };

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("19F-U1 — the coding@3 student editor: locked vs editable, values-only answer", () => {
  it("U1 locked text is read-only text (never an input), labelled «مقفل» and named for AT; each gap is a labelled LTR textarea without autocomplete", async () => {
    render(<StudentHarness q={studentQ()} />);
    const inputs = await gaps();
    expect(inputs).toHaveLength(2);
    const locked = screen.getAllByTestId("coding-template-locked");
    expect(locked).toHaveLength(2);
    for (const l of locked) {
      expect(l.querySelector("textarea, input, [contenteditable]")).toBeNull();
      expect(l.textContent).toContain("مقفل");
      expect(l.querySelector("pre")!.getAttribute("aria-label")).toBe("كود مقفل للقراءة فقط");
    }
    expect(locked[0].querySelector("pre")!.textContent).toBe("a, b = map(int, input().split())\n");
    expect(inputs[0].getAttribute("aria-label")).toContain("فراغ 1 من 2");
    for (const g of inputs) {
      expect(g.getAttribute("dir")).toBe("ltr"); expect(g.getAttribute("spellcheck")).toBe("false"); expect(g.getAttribute("autocomplete")).toBe("off");
      expect(g.getAttribute("autocorrect")).toBe("off"); expect(g.getAttribute("autocapitalize")).toBe("off");
    }
    expect(inputs[0].value).toBe("s = 0\n");
    expect(screen.getByTestId("coding-template-code").getAttribute("dir")).toBe("ltr");
    expect(answerOut()).toBe(null);                                                     // nothing recorded before an edit
    expect(document.body.innerHTML).not.toMatch(/SECRET-/);
  });
  it("U2 editing a gap emits ONLY the gap values (every gap, never a source or locked text)", async () => {
    render(<StudentHarness q={studentQ()} />);
    const [g1] = await gaps();
    fireEvent.change(g1, { target: { value: "s = a + b\n" } });
    expect(answerOut()).toEqual({ kind: "codeTemplate", language: "python", languageVersion: 1, values: { gap1: "s = a + b\n", gap2: "" } });
    expect(JSON.stringify(answerOut())).not.toMatch(/source|input\(\)|print\(s\)/);
    expect(screen.getByTestId("coding-template-full").textContent).toContain("a, b = map(int, input().split())\ns = a + b\nprint(s)\n");
  });
  it("U3 a restored answer is shown; Alt+↓ / Alt+↑ move between gaps; plain Tab is never captured (no keyboard trap)", async () => {
    render(<StudentHarness q={studentQ()} initial={{ kind: "codeTemplate", language: "python", languageVersion: 1, values: { gap1: "s = 1\n", gap2: "# x" } } as Answer} />);
    const [g1, g2] = await gaps();
    expect(g1.value).toBe("s = 1\n"); expect(g2.value).toBe("# x");
    g1.focus();
    fireEvent.keyDown(g1, { key: "ArrowDown", altKey: true });
    expect(document.activeElement).toBe(g2);
    fireEvent.keyDown(g2, { key: "ArrowUp", altKey: true });
    expect(document.activeElement).toBe(g1);
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    g1.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
  it("U4 per-gap reset restores the starter; «استعادة كل الفراغات» asks first, then restores every starter", async () => {
    render(<StudentHarness q={studentQ()} />);
    const [g1] = await gaps();
    fireEvent.change(g1, { target: { value: "s = 9\n" } });
    fireEvent.click(screen.getByRole("button", { name: "استعادة النص الابتدائي للفراغ 1" }));
    expect(answerOut().values.gap1).toBe("s = 0\n");
    fireEvent.change(g1, { target: { value: "s = 7\n" } });
    fireEvent.click(screen.getByRole("button", { name: "استعادة كل الفراغات" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "استعادة" }));
    await waitFor(() => expect(answerOut().values).toEqual({ gap1: "s = 0\n", gap2: "" }));
  });
  it("U5 an oversized gap edit is refused with an alert (never saved, never truncated)", async () => {
    render(<StudentHarness q={studentQ()} />);
    const [g1] = await gaps();
    fireEvent.change(g1, { target: { value: "x".repeat(16385) } });
    expect(answerOut()).toBe(null);
    expect(screen.getByTestId("coding-template-limit").getAttribute("role")).toBe("alert");
  });
  it("U6 a practice run sends the gap VALUES (never a source); the result is practice text only", async () => {
    const calls: { path: string; body: Record<string, unknown> | null }[] = [];
    const api = vi.fn(async (p: string, init: RequestInit = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : null;
      calls.push({ path: p, body });
      const json = p.endsWith("/capabilities") ? { ok: true, available: true, languages: [{ key: "python", languageVersion: 1 }] } : { ok: true, result: { status: "success", stdout: "5\n", stderr: "", exitCode: 0, durationMs: 3 } };
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    });
    render(<StudentHarness q={studentQ()} wrap={n => <StudentAttemptContext.Provider value={{ assignmentId: "asg", request: api }}>{n}</StudentAttemptContext.Provider>} />);
    const [g1] = await gaps();
    fireEvent.change(g1, { target: { value: "s = a + b\n" } });
    fireEvent.click(await screen.findByRole("button", { name: "تشغيل" }, { timeout: 3000 }));
    await screen.findByTestId("coding-result");
    const run = calls.find(c => c.path === "/api/coding/run")!;
    expect(Object.keys(run.body!).sort()).toEqual(["assignmentId", "language", "languageVersion", "questionId", "stdin", "values"]);
    expect(run.body!.values).toEqual({ gap1: "s = a + b\n", gap2: "" });
    expect(answerOut()).toEqual({ kind: "codeTemplate", language: "python", languageVersion: 1, values: { gap1: "s = a + b\n", gap2: "" } });
  });
  it("U7 the teacher preview says what it is and never runs code; a malformed template renders an explicit notice, no editor", async () => {
    render(<StudentHarness q={studentQ()} wrap={n => <TeacherPreviewContext.Provider value={true}>{n}</TeacherPreviewContext.Provider>} />);
    expect(await screen.findByTestId("coding-template-preview-note", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByTestId("coding-run-preview")).toBeTruthy();
    cleanup();
    const broken = { ...studentQ(), coding: { ...(studentQ() as unknown as { coding: Record<string, unknown> }).coding, template: { language: "python", segments: [{ kind: "locked", text: "x" }] } } } as unknown as Question;
    render(<StudentHarness q={broken} />);
    expect(await screen.findByTestId("coding-config-invalid", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId("coding-template-input")).toBeNull();
  });
});

describe("19F-U2 — the read-only code stimulus (predict output / trace)", () => {
  const STIM = { language: "python", source: "<img src=x onerror=\"window.__pwn=1\">\nprint('<b>hi</b>')\n", label: "البرنامج" };
  const mcq = (codeStimulus: unknown = STIM) => ({ examQuestionId: "m1", presentationType: "multipleChoice", text: "ما الناتج؟", marks: 2, codeStimulus, options: [{ text: "hi" }, { text: "<b>hi</b>" }], answer: { correctOptionIndex: 1 } });
  it("U8 shown under the prompt as TEXT in an LTR, focusable, named <pre><code> — never HTML, never executed", async () => {
    render(<StudentHarness q={studentQ(mcq())} />);
    const fig = await screen.findByTestId("code-stimulus", {}, { timeout: 3000 });
    const pre = fig.querySelector("pre")!;
    expect(pre.getAttribute("dir")).toBe("ltr"); expect(pre.getAttribute("tabindex")).toBe("0");
    expect(pre.getAttribute("aria-label")).toBe("البرنامج (Python)");
    expect(pre.querySelector("code")!.textContent).toBe(STIM.source);
    expect(fig.querySelector("img, b")).toBeNull();
    expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
  it("U9 a malformed stimulus renders nothing; a question without one renders no figure; a compound question shows its own", async () => {
    render(<StudentHarness q={{ ...studentQ(mcq()), codeStimulus: { ...STIM, extra: 1 } } as unknown as Question} />);
    await tick(60);
    expect(screen.queryByTestId("code-stimulus")).toBeNull();
    cleanup();
    render(<StudentHarness q={studentQ({ ...mcq(), codeStimulus: undefined })} />);
    await tick(60);
    expect(screen.queryByTestId("code-stimulus")).toBeNull();
    cleanup();
    const cq = { examQuestionId: "cq", presentationType: "compound", text: "تتبع", marks: 2, codeStimulus: { language: "java", source: "int x = 1;" }, parts: [{ id: "p1", type: "shortAnswer", text: "x؟", marks: 2 }] };
    render(<CompoundQuestion q={studentQ(cq)} index={0} id="cq" answer={undefined} onPart={() => {}} />);
    const fig = await screen.findByTestId("code-stimulus", {}, { timeout: 3000 });
    expect(fig.querySelector("pre")!.getAttribute("aria-label")).toBe("كود السؤال بلغة Java");
  });
});

describe("19F-U3 — palette presets: six modes, each saying what it creates; the catalog stays 23", () => {
  it("U10 the presets group lists the six modes with «ينشئ: …»; type cards are still exactly 23", async () => {
    await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card")).toHaveLength(25);   /* 20D adds composite */
    const group = within(d).getByTestId("qt-coding-presets");
    const cards = within(group).getAllByTestId("qt-preset-card");
    expect(cards.map(c => c.getAttribute("data-preset-key"))).toEqual(["writeProgram", "fixBug", "completeCode", "lockedTemplate", "predictOutput", "traceExecution"]);
    expect(cards.map(c => c.querySelector(".qt-card-label")!.textContent)).toEqual(["كتابة برنامج كامل", "إصلاح خطأ", "إكمال كود", "إكمال كود بأجزاء مقفلة", "توقع الناتج", "تتبع التنفيذ"]);
    for (const c of cards) expect(within(c).getByTestId("qt-preset-creates").textContent).toMatch(/^ينشئ: /);
    expect(within(group).getByText(/لا يُنشئ أي اختبار مخفي/)).toBeTruthy();
  });
  it("U11 picking presets adds the stated question: locked template → coding@3 (chosen language); predict output → multipleChoice + stimulus; trace → tableFill + stimulus", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    const pick = async (key: string, language?: string) => {
      fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
      const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
      if (language) fireEvent.change(within(d).getByRole("combobox", { name: "لغة البرمجة لأمثلة الأنماط" }), { target: { value: language } });
      fireEvent.click(within(d).getAllByTestId("qt-preset-card").find(c => c.getAttribute("data-preset-key") === key)!);
      await tick(30);
    };
    await pick("lockedTemplate", "java");
    await pick("predictOutput");
    await pick("traceExecution");
    const qs = hist().present!.sections[0].questions as unknown as Record<string, any>[];
    expect(qs.map(q => [q.presentationType, q.questionTypeVersion ?? null])).toEqual([["multipleChoice", null], ["coding", 3], ["multipleChoice", null], ["tableFill", null]]);
    expect(qs[1].coding.template.language).toBe("java"); expect(qs[1].coding.allowedLanguages).toEqual(["java"]);
    expect(qs[2].codeStimulus.language).toBe("python"); expect(qs[3].codeStimulus.source).toContain("x = x * 2");
  });
});

describe("19F-U4 — coding@3 authoring: the real version, the template section, no JSON", () => {
  it("U12 the inspector shows «الإصدار: 3» + the mode; the template section replaces the starter editor and language checkboxes", async () => {
    await mountBuilder(baseExam([V3()]));
    const ed = await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    const insp = within(ed).getByTestId("coding-inspector");
    expect(insp.textContent).toContain("الإصدار: 3"); expect(insp.textContent).toContain("النمط: إكمال كود بأجزاء مقفلة");
    expect(within(ed).getByTestId("coding-template-editor")).toBeTruthy();
    expect(within(ed).queryByText("الكود الابتدائي", { selector: "legend" })).toBeNull();
    expect(within(ed).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(ed).getAllByTestId("coding-template-author-gap").map(g => g.getAttribute("data-gap-id"))).toEqual(["gap1", "gap2"]);
    expect(within(ed).getByTestId("coding-template-author-preview").textContent).toContain("a, b = map(int, input().split())\ns = 0\nprint(s)\n");
  });
  it("U13 paste a program, select a span, «اجعل النص المحدد فراغًا» → a generated gap id; the canonical validator is satisfied", async () => {
    const { hist } = await mountBuilder(baseExam([V3()]));
    const ed = await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    fireEvent.change(within(ed).getByTestId("coding-template-paste"), { target: { value: "x = 1\nprint(x)\n" } });
    fireEvent.click(within(ed).getByRole("button", { name: "استبدال القالب بهذا البرنامج" }));
    await tick(20);
    let q = hist().present!.sections[0].questions[0] as unknown as Record<string, any>;
    expect(q.coding.template.segments).toEqual([{ kind: "locked", text: "x = 1\nprint(x)\n" }]);
    const lockedArea = within(screen.getByTestId("qt-editor-coding")).getAllByTestId("coding-template-author-locked")[0].querySelector("textarea")!;
    lockedArea.setSelectionRange(4, 5);
    fireEvent.click(within(screen.getByTestId("qt-editor-coding")).getByRole("button", { name: "اجعل النص المحدد فراغًا" }));
    await tick(20);
    q = hist().present!.sections[0].questions[0] as unknown as Record<string, any>;
    expect(q.coding.template.segments).toEqual([{ kind: "locked", text: "x = " }, { kind: "editable", id: "gap1", starter: "1" }, { kind: "locked", text: "\nprint(x)\n" }]);
    expect(within(screen.getByTestId("qt-editor-coding")).getByTestId("coding-validation").textContent).not.toMatch(/CODING_TEMPLATE|القالب المقفل/);
  });
  it("U14 changing the template language keeps allowed / default languages in step (one language)", async () => {
    const { hist } = await mountBuilder(baseExam([V3()]));
    const ed = await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    fireEvent.change(within(ed).getByRole("combobox", { name: "لغة القالب" }), { target: { value: "csharp" } });
    await tick(20);
    const q = hist().present!.sections[0].questions[0] as unknown as Record<string, any>;
    expect([q.coding.template.language, q.coding.allowedLanguages, q.coding.defaultLanguage]).toEqual(["csharp", ["csharp"], "csharp"]);
    expect(q.answer.referenceSolutions).toEqual({});
  });
});

describe("19F-U5 — stimulus authoring and the teacher review of a template answer", () => {
  it("U15 a teacher adds, edits and removes a read-only code stimulus on an ordinary question", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("shortAnswer", { examQuestionId: "q1", text: "ما الناتج؟" })]));
    fireEvent.click(screen.getByRole("button", { name: /إضافة كود مرفق للقراءة/ }));
    await tick(20);
    const ed = screen.getByTestId("code-stimulus-editor");
    fireEvent.change(within(ed).getByLabelText("الكود"), { target: { value: "print(2 * 3)\n" } });
    await tick(20);
    expect((hist().present!.sections[0].questions[0] as unknown as Record<string, any>).codeStimulus).toEqual({ language: "python", source: "print(2 * 3)\n" });
    fireEvent.change(within(ed).getByLabelText("الكود"), { target: { value: "" } });
    expect(within(screen.getByTestId("code-stimulus-editor")).getByRole("alert").textContent).toContain("اكتب الكود المرفق");
    fireEvent.click(within(screen.getByTestId("code-stimulus-editor")).getByRole("button", { name: "إزالة الكود المرفق" }));
    await tick(20);
    expect((hist().present!.sections[0].questions[0] as unknown as Record<string, any>).codeStimulus).toBeUndefined();
  });
  it("U16 the review shows the SERVER-reconstructed program for a template answer, or an explicit notice — never a guessed source", async () => {
    const body = (codeTemplateReview: unknown) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student: { studentId: "s1", studentName: "أحمد", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-10-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-10-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview" }], questions: [{ questionId: "c1", questionNumber: 1, text: "أكمل", marks: 10, type: "coding", questionTypeVersion: 3, studentAnswer: { kind: "codeTemplate", language: "python", languageVersion: 1, values: { gap1: "s = a + b\n" } }, codeTemplateReview, codeStimulus: { language: "python", source: "print('stim')" }, expectedAnswer: {}, autoGrade: { score: 0, manualReview: true }, manualScore: null, teacherComment: "" }] });
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body({ ok: true, language: "python", source: "a = 1\ns = a + b\nprint(s)\n" }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("code-review-source", {}, { timeout: 3000 });
    expect(view.textContent).toContain("s = a + b");
    expect(screen.getByTestId("review-code-stimulus").textContent).toContain("print('stim')");
    cleanup();
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body({ ok: false, code: "CODE_TEMPLATE_GAP_MISSING" }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    expect(await screen.findByTestId("code-template-review-invalid", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId("code-review-source")).toBeNull();
  });
});
