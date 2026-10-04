// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StudentQuestionCard from "../StudentQuestionCard";
import ExamPreview from "../ExamPreview";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import { codingCompileErrorPolicy, projectCodingConfigForStudent, normalizeCodeAnswer, bindCodeAnswerToQuestion } from "../codingQuestion";
import { codingGradingStatusOf, isCodingGradingOpen, isCodingReviewRequired, scoreWithheld, withheldScoreLabel, REVIEW_SCORE_LABEL, PENDING_SCORE_LABEL } from "../codingGradingStatus";
import { setEditorEngineLoader } from "../coding/editor/editorEngine";
import { EDITOR_PREFERENCES_KEY, resetEditorPreferencesForTests } from "../coding/workspace/editorPreferences";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 18B — the enterprise coding workspace inside the REAL student card (sanitized question, canonical Answer seam) and the
// teacher preview. The academic answer is the ONLY thing that leaves this component: focus mode, editor preferences, language
// visibility and the status rows are presentation. Reset-to-starter keeps its 17A confirmation contract. coding@1 and coding@2
// render through the same workspace; compileErrorPolicy / reviewRequired stay exactly the 17F-C2 contract (pins, pure).
// Fail-first on the 17F baseline: «D1 preview» (Escape in the editor closed the teacher preview) and every focus-mode /
// preference assertion (the workspace did not exist).

const CFG = {
  allowedLanguages: ["python", "csharp"], defaultLanguage: "python",
  starterCode: { python: "a, b = map(int, input().split())\n", csharp: "using System;\n" },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 },
  publicTests: [{ id: "pub-1", title: "مثال أول", input: "2 3\n", sampleOutput: "5\n" }]
};
const KEY = { hiddenTests: [{ id: "hid-1", title: "سري", input: "HIDDEN-IN\n", expectedOutput: "HIDDEN-OUT\n", weight: 2 }], comparator: "trimTrailingWhitespace", referenceSolutions: { python: "print(sum(map(int, input().split())))\n" }, gradingMode: "hiddenTests", compileErrorPolicy: "manualReview" };
const teacherQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("coding" as never, { examQuestionId: "c1", text: "اقرأ عددين صحيحين واطبع مجموعهما.", marks: 10 }), coding: CFG, answer: KEY, ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-18B", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (over: Record<string, unknown> = {}) => sanitizeExamForStudent(baseExam([teacherQ(over)])).sections[0].questions[0];
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

function StudentHarness({ q, initial, disabled }: { q: Question; initial?: Answer; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <div dir="rtl"><StudentQuestionCard q={q} index={0} id="c1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></div>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");
const editorBox = async () => (await screen.findByRole("textbox", { name: /محرر الكود/ }, { timeout: 3000 })) as HTMLTextAreaElement;
const focusButton = () => screen.getByRole("button", { name: /وضع التركيز/ });
const workspace = () => screen.getByTestId("coding-response");
const SECRET = /HIDDEN-IN|HIDDEN-OUT|hid-1|سري|print\(sum|compileErrorPolicy|hiddenTests|referenceSolutions|expectedOutput|manualReview|gradingMode/;

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); setEditorEngineLoader(null); resetEditorPreferencesForTests(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setEditorEngineLoader(undefined); resetEditorPreferencesForTests(); });

describe("18B D1 — Escape inside the coding editor must not close the teacher preview (fail-first on the 17F baseline)", () => {
  it("the preview stays open when Escape is pressed in the code editor; Escape elsewhere in the preview still closes it", async () => {
    const onClose = vi.fn();
    render(<ExamPreview exam={baseExam([teacherQ()]) as never} onClose={onClose} />);
    const ta = await editorBox();
    ta.focus();
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    const close = screen.getByRole("button", { name: /إغلاق المعاينة/ });
    close.focus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("18B — focus mode and preferences never touch the academic answer", () => {
  it("entering and leaving focus mode keeps the Answer object byte-identical (no emit); typing in focus mode emits the canonical shape only", async () => {
    render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    fireEvent.change(ta, { target: { value: "x = 1  # سلام 🎉\n" } });
    const before = JSON.stringify(answerOut());
    fireEvent.click(focusButton());
    expect(workspace().getAttribute("data-focus-mode")).toBe("true");
    expect(JSON.stringify(answerOut())).toBe(before);
    expect(screen.getByRole("textbox", { name: /محرر الكود/ })).toBe(ta);                                   // the SAME element: nothing remounted
    fireEvent.change(ta, { target: { value: "x = 1  # سلام 🎉\ny = 2\n" } });
    expect(Object.keys(answerOut()).sort()).toEqual(["kind", "language", "languageVersion", "source"]);
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: "x = 1  # سلام 🎉\ny = 2\n" });
    const after = JSON.stringify(answerOut());
    fireEvent.click(focusButton());
    expect(workspace().getAttribute("data-focus-mode")).toBe("false");
    expect(JSON.stringify(answerOut())).toBe(after);
    expect(ta.value).toBe("x = 1  # سلام 🎉\ny = 2\n");
  });
  it("changing every editor preference leaves the Answer, the language and the version unchanged, stores nothing but UI values locally", async () => {
    render(<StudentHarness q={studentQ()} initial={{ kind: "code", language: "csharp", languageVersion: 1, source: "using System;\nclass P {}\n" }} />);
    const ta = await editorBox();
    const before = JSON.stringify(answerOut());
    fireEvent.click(screen.getByText("إعدادات المحرر"));
    fireEvent.change(screen.getByRole("combobox", { name: "حجم الخط" }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "التفاف الأسطر" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "الخريطة المصغّرة" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "أرقام الأسطر" }));
    expect(JSON.stringify(answerOut())).toBe(before);
    expect(ta.value).toBe("using System;\nclass P {}\n");
    expect(ta.getAttribute("wrap")).toBe("soft");
    expect((screen.getByRole("combobox", { name: "لغة البرمجة" }) as HTMLSelectElement).value).toBe("csharp");
    const stored = JSON.parse(localStorage.getItem(EDITOR_PREFERENCES_KEY) || "{}");
    expect(stored).toEqual({ fontSize: 18, wordWrap: true, minimap: true, lineNumbers: false });
    expect(JSON.stringify(stored)).not.toMatch(/source|language|kind|answer/);
  });
  it("the selected language and its contract version are visible in the workspace and follow an explicit language change only", async () => {
    render(<StudentHarness q={studentQ()} />);
    await editorBox();
    const badge = screen.getByTestId("coding-workspace-language");
    expect(badge.textContent).toBe("Python · عقد v1");
    fireEvent.click(focusButton());
    expect(badge.textContent).toBe("Python · عقد v1");
    fireEvent.change(screen.getByRole("combobox", { name: "لغة البرمجة" }), { target: { value: "csharp" } });
    expect(badge.textContent).toBe("C# · عقد v1");
    expect(answerOut()).toMatchObject({ language: "csharp", languageVersion: 1 });
  });
  it("mobile-sized context (native editor): the workspace toolbar, focus mode and exit stay reachable; the source survives an orientation-like rerender", async () => {
    const { rerender } = render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    fireEvent.change(ta, { target: { value: "print(1)\n" } });
    fireEvent.click(focusButton());
    act(() => { window.dispatchEvent(new Event("orientationchange")); window.dispatchEvent(new Event("resize")); });
    rerender(<StudentHarness q={studentQ()} />);
    expect(screen.getByRole("textbox", { name: /محرر الكود/ })).toBe(ta);
    expect(ta.value).toBe("print(1)\n");
    expect(answerOut().source).toBe("print(1)\n");
    fireEvent.click(screen.getByRole("button", { name: "الخروج من وضع التركيز" }));
    expect(workspace().getAttribute("data-focus-mode")).toBe("false");
  });
});

describe("18B — reset to starter code (canonical starterCode, 17A confirmation contract)", () => {
  const starter = CFG.starterCode.python;
  it("reset asks for confirmation when the source differs; CANCEL changes nothing (answer, editor, focus state)", async () => {
    render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    fireEvent.change(ta, { target: { value: "my work\n" } });
    fireEvent.click(focusButton());
    fireEvent.click(screen.getByRole("button", { name: "استعادة الكود الابتدائي" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg.textContent).toMatch(/الكود الابتدائي/);
    fireEvent.click(within(dlg).getByRole("button", { name: "إلغاء" }));
    await tick();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: "my work\n" });
    expect(ta.value).toBe("my work\n");
    expect(workspace().getAttribute("data-focus-mode")).toBe("true");
  });
  it("CONFIRM restores EXACTLY the configured starter (trailing newline included) and nothing else", async () => {
    render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    fireEvent.change(ta, { target: { value: "lots of work" } });
    fireEvent.click(screen.getByRole("button", { name: "استعادة الكود الابتدائي" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "استعادة" }));
    await tick();
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: starter });
    expect(ta.value).toBe(starter);
  });
  it("the confirmation dialog is a real accessible dialog (named, modal) and focus starts on the safe «إلغاء» button", async () => {
    render(<StudentHarness q={studentQ()} />);
    const ta = await editorBox();
    fireEvent.change(ta, { target: { value: "work" } });
    fireEvent.click(screen.getByRole("button", { name: "استعادة الكود الابتدائي" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("aria-labelledby")).toBeTruthy();
    await tick();
    expect(document.activeElement).toBe(within(dlg).getByRole("button", { name: "إلغاء" }));
  });
  it("no reset control is offered when the question has no starter for the language (nothing to restore)", async () => {
    render(<StudentHarness q={studentQ({ coding: { ...CFG, starterCode: {} } })} />);
    await editorBox();
    expect(screen.queryByRole("button", { name: "استعادة الكود الابتدائي" })).toBeNull();
  });
});

describe("18B — read-only, secrets and version compatibility", () => {
  it("disabled (submitted / expired / paused): the editor cannot be edited, the toolbar actions are disabled, and focus mode exits when the attempt stops being writable", async () => {
    const { rerender } = render(<StudentHarness q={studentQ()} initial={{ kind: "code", language: "python", languageVersion: 1, source: "final\n" }} />);
    const ta = await editorBox();
    fireEvent.click(focusButton());
    expect(workspace().getAttribute("data-focus-mode")).toBe("true");
    rerender(<StudentHarness q={studentQ()} initial={{ kind: "code", language: "python", languageVersion: 1, source: "final\n" }} disabled />);
    expect(workspace().getAttribute("data-focus-mode")).toBe("false");
    expect(ta.readOnly).toBe(true);
    fireEvent.change(ta, { target: { value: "hacked" } });
    expect(ta.value).toBe("final\n");                                                                       // controlled + readOnly
    expect((screen.getByRole("combobox", { name: "لغة البرمجة" }) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "استعادة الكود الابتدائي" }) as HTMLButtonElement).disabled).toBe(true);
    expect(answerOut().source).toBe("final\n");
  });
  it("no grading secret (hidden tests, reference solution, policy, mode) is in the DOM in normal OR focus mode, from a teacher-side question handed directly to the renderer", async () => {
    render(<StudentHarness q={teacherQ() as unknown as Question} />);
    await editorBox();
    expect(document.body.innerHTML).not.toMatch(SECRET);
    fireEvent.click(focusButton());
    fireEvent.click(screen.getByText("إعدادات المحرر"));
    expect(document.body.innerHTML).not.toMatch(SECRET);
    expect(document.body.innerHTML).toContain("مثال أول");                                                  // the public sample stays
  });
  it("coding@1 and coding@2 render through the same workspace and emit the same canonical Answer", async () => {
    for (const version of [undefined, 1, 2]) {
      cleanup();
      render(<StudentHarness q={studentQ(version === undefined ? {} : { questionTypeVersion: version })} />);
      const ta = await editorBox();
      expect(screen.getByTestId("coding-response")).toBeTruthy();
      expect(focusButton()).toBeTruthy();
      fireEvent.change(ta, { target: { value: "v" + String(version) } });
      expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: "v" + String(version) });
    }
  });
  it("compileErrorPolicy (17F-C2) is untouched: coding@1 absent/zero ⇒ zero and manualReview ⇒ undefined; coding@2 explicit only; the student projection never carries it", () => {
    expect(codingCompileErrorPolicy({}, 1)).toBe("zero");
    expect(codingCompileErrorPolicy({ compileErrorPolicy: "zero" }, 1)).toBe("zero");
    expect(codingCompileErrorPolicy({ compileErrorPolicy: "manualReview" }, 1)).toBeUndefined();
    expect(codingCompileErrorPolicy({}, 2)).toBeUndefined();
    expect(codingCompileErrorPolicy({ compileErrorPolicy: "manualReview" }, 2)).toBe("manualReview");
    expect(codingCompileErrorPolicy({ compileErrorPolicy: "zero" }, 2)).toBe("zero");
    expect(codingCompileErrorPolicy({ compileErrorPolicy: "lenient" }, 2)).toBeUndefined();
    const projected = projectCodingConfigForStudent({ ...CFG, compileErrorPolicy: "zero", hiddenTests: KEY.hiddenTests, referenceSolutions: KEY.referenceSolutions }) as unknown as Record<string, unknown>;
    expect(Object.keys(projected).sort()).toEqual(["allowedLanguages", "defaultLanguage", "inputMode", "limits", "outputMode", "publicTests", "starterCode", "taskMode"]);
  });
  it("reviewRequired (17F-C2) is untouched: not open, not polled, the score is withheld with the teacher-review label", () => {
    expect(codingGradingStatusOf({ autoGradingStatus: "reviewRequired" })).toBe("reviewRequired");
    expect(isCodingGradingOpen("reviewRequired")).toBe(false);
    expect(isCodingReviewRequired("reviewRequired")).toBe(true);
    expect(scoreWithheld({ autoGradingStatus: "reviewRequired" })).toBe(true);
    expect(withheldScoreLabel({ autoGradingStatus: "reviewRequired" })).toBe(REVIEW_SCORE_LABEL);
    expect(withheldScoreLabel({ autoGradingStatus: "queued" })).toBe(PENDING_SCORE_LABEL);
  });
  it("the answer ingest contract is untouched: extra UI fields are dropped, the source is never altered, the binding to the question holds", () => {
    const raw = { kind: "code", language: "python", languageVersion: 1, source: "  x = 1 \r\n", fontSize: 18, wordWrap: true, focusMode: true };
    const n = normalizeCodeAnswer(raw);
    expect(n).toEqual({ ok: true, answer: { kind: "code", language: "python", languageVersion: 1, source: "  x = 1 \r\n" } });
    const bound = bindCodeAnswerToQuestion(raw, { presentationType: "coding", questionTypeVersion: 2, coding: CFG });
    expect(bound).toEqual({ ok: true, answer: { kind: "code", language: "python", languageVersion: 1, source: "  x = 1 \r\n" } });
  });
});
