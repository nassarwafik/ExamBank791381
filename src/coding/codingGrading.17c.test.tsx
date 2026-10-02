// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, within, waitFor, act } from "@testing-library/react";
import AssignmentReview from "../AssignmentReview";
import StudentExamPage from "../StudentExamPage";
import type { QuestionBody } from "../examTypes";

// Phase 17C — 17C-H (UI):
//   • the coding editor replaces «طريقة التقييم الحالية: مراجعة يدوية» with an explicit OFFICIAL grading control (manual vs
//     hidden tests), explains the server-side secrecy, shows hidden-test count / total weight / comparator, warns that hidden tests
//     in MANUAL mode are not used for the official mark, and never deletes teacher data when switching modes;
//   • the teacher review shows the automatic grading block (state, automatic score, comparator, tests with expected output from
//     the teacher snapshot, bounded actual output / stderr), a technical failure as such (never «wrong answer»), and retry /
//     force-regrade actions; the manual override controls keep working;
//   • the student only sees that automatic coding grading is still completing — never hidden test details.
// Fail-first on 543fa9f4: no grading-mode control, no automatic grading block, no pending message.
const load = <T,>(p: string): Promise<T> => import(/* @vite-ignore */ p);
type EditorMod = typeof import("../questionTypes/editors/CodingQuestionEditor");
const CFG = { allowedLanguages: ["python", "java"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 }, publicTests: [] };
const HIDDEN = [{ id: "h1", title: "صغير", input: "1 2\n", expectedOutput: "3\n", weight: 1 }, { id: "h2", input: "5 5\n", expectedOutput: "10\n", weight: 3 }];

function EditorHost({ initial, Editor, onNode }: { initial: Partial<QuestionBody>; Editor: EditorMod["default"]; onNode: (n: Partial<QuestionBody>) => void }) {
  const [node, setNode] = useState<Partial<QuestionBody>>(initial);
  return <Editor node={node as QuestionBody} onChange={patch => setNode(n => { const next = { ...n, ...patch }; onNode(next); return next; })} disabled={false} />;
}
async function mountEditor(answer: Record<string, unknown>) {
  const { default: Editor } = await load<EditorMod>("../questionTypes/editors/CodingQuestionEditor");
  let last: Partial<QuestionBody> = {};
  render(<EditorHost Editor={Editor} initial={{ coding: CFG as never, answer }} onNode={n => { last = n; }} />);
  return { node: () => last };
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("17C-H editor — explicit official grading mode", () => {
  it("the old «manual only» inspector line is replaced by a labelled radio group; default (no mode) is manual", async () => {
    await mountEditor({ hiddenTests: HIDDEN, comparator: "exact" });
    const ed = await screen.findByTestId("qt-editor-coding", {}, { timeout: 3000 });
    expect(ed.textContent).not.toContain("طريقة التقييم الحالية: مراجعة يدوية");
    const group = screen.getByRole("radiogroup", { name: "طريقة التصحيح الرسمي" });
    const manual = within(group).getByRole("radio", { name: "يدوي بواسطة المعلم" }) as HTMLInputElement;
    const auto = within(group).getByRole("radio", { name: "تلقائي بواسطة الاختبارات المخفية" }) as HTMLInputElement;
    expect(manual.checked).toBe(true); expect(auto.checked).toBe(false);
  });
  it("manual mode with hidden tests warns they are NOT used for the official mark (and keeps them)", async () => {
    await mountEditor({ hiddenTests: HIDDEN, comparator: "exact", gradingMode: "manual" });
    expect((await screen.findByTestId("coding-manual-hidden-notice", {}, { timeout: 3000 })).textContent).toMatch(/لا تُستخدم في العلامة الرسمية/);
  });
  it("switching to automatic stores gradingMode under the PRIVATE answer key, keeps the hidden tests, and explains server-side grading + counts", async () => {
    const h = await mountEditor({ hiddenTests: HIDDEN, comparator: "normalizeWhitespace", referenceSolutions: { python: "print(1)" } });
    fireEvent.click(await screen.findByRole("radio", { name: "تلقائي بواسطة الاختبارات المخفية" }, { timeout: 3000 }));
    expect(h.node().answer).toMatchObject({ gradingMode: "hiddenTests", hiddenTests: HIDDEN, comparator: "normalizeWhitespace", referenceSolutions: { python: "print(1)" } });
    expect((h.node().coding as unknown as Record<string, unknown>).gradingMode).toBeUndefined();
    const info = screen.getByTestId("coding-auto-info");
    expect(info.textContent).toMatch(/الاختبارات المخفية لا تظهر للطالب/);
    expect(info.textContent).toMatch(/يتم احتساب العلامة على الخادم بواسطة محرك التنفيذ المعزول/);
    expect(info.textContent).toMatch(/عدد الاختبارات المخفية: 2/);
    expect(info.textContent).toMatch(/مجموع الأوزان: 4/);
    expect(info.textContent).toMatch(/طريقة المقارنة: توحيد كل المسافات/);
    // back to manual: the hidden tests are still there (teacher data is never deleted by a mode switch)
    fireEvent.click(screen.getByRole("radio", { name: "يدوي بواسطة المعلم" }));
    expect(h.node().answer).toMatchObject({ gradingMode: "manual", hiddenTests: HIDDEN });
  });
  it("automatic mode with no hidden test shows a blocking hint; reference solutions stay labelled as teacher aids only", async () => {
    await mountEditor({ gradingMode: "hiddenTests", hiddenTests: [] });
    expect((await screen.findByTestId("coding-auto-info", {}, { timeout: 3000 })).textContent).toMatch(/أضف اختبارًا مخفيًا واحدًا على الأقل/);
    expect(screen.getByTestId("qt-editor-coding").textContent).toMatch(/لا يُصحَّح بمقارنة نص الكود بها/);
  });
});

const A = (over: Record<string, unknown> = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 6.67, totalMarks: 10, percentage: 66.7, manualReviewMarks: 0, finalized: true, gradingStatus: "final", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false, ...over });
// Phase 17E-D — the review question now carries the formal teacher evidence contract (`codingEvidence`, contract 1) instead of the
// 17C ad-hoc `codingAutoGrade` view; the intent of these 17C tests is unchanged (labels updated to the 17E-D vocabulary).
const codingQ = (codingEvidence: Record<string, unknown> | null, over: Record<string, unknown> = {}) => ({ questionId: "auto1", questionNumber: 1, text: "اطبع المجموع", marks: 10, type: "coding", studentAnswer: { kind: "code", language: "python", languageVersion: 1, source: "print(1)" }, expectedAnswer: { gradingMode: "hiddenTests", hiddenTests: HIDDEN, comparator: "trimTrailingWhitespace" }, autoGrade: { score: 6.67, manualReview: false }, manualScore: null, teacherComment: "", codingEvidence, ...over });
const EV = (over: Record<string, unknown>) => ({ contract: 1, status: "complete", automaticStatus: "complete", revision: 1, resultRevision: null, resultCurrent: false, gradingMode: "hiddenTests", language: "python", languageVersion: 1, scoringPolicy: "proportional", comparator: "trimTrailingWhitespace", testCount: 2, maxMarks: 10, automaticScore: null, passedCount: null, passedWeight: null, totalWeight: null, outcome: null, completedAt: null, override: { active: false, score: null }, effectiveScore: null, recovery: { state: "none" }, technicalCode: null, incomplete: false, cases: [], ...over });
const COMPLETE = EV({ resultRevision: 1, resultCurrent: true, automaticScore: 6.67, effectiveScore: 6.67, passedCount: 1, passedWeight: 1, totalWeight: 4, outcome: "graded", completedAt: "2026-03-01T10:00:00.000Z", cases: [
  { testId: "h1", title: "صغير", weight: 1, outcome: "passed", durationMs: 12, expectedOutput: "3\n" },
  { testId: "h2", title: "", weight: 3, outcome: "wrong-output", durationMs: 9, expectedOutput: "10\n", actualPreview: "11\n", stderrPreview: "warn: x" }
] });
function mountReview(question: Record<string, unknown>, attempt = A(), onRegrade?: (body: Record<string, unknown>) => unknown) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    calls.push({ url, method, body: init && init.body ? JSON.parse(String(init.body)) : null });
    if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student: { studentId: "s1", studentName: "أ", studentCode: "S1" }, attempt: { ...attempt, teacherFeedback: "" }, attempts: [attempt], questions: [question] }) } as Response);
    if (url.includes("/api/coding/regrade")) return Promise.resolve({ status: 200, ok: true, json: async () => (onRegrade ? onRegrade(JSON.parse(String(init!.body))) : { ok: true, state: "dispatched", revision: 2 }) } as Response);
    return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, result: { gradingStatus: "final", finalized: true, score: 10, totalMarks: 10, percentage: 100, manualReviewMarks: 0 } }) } as Response);
  }) as unknown as typeof fetch;
  render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
  return calls;
}

describe("17C-H teacher review — automatic grading block", () => {
  it("a completed automatic grade shows state, automatic score, comparator, test count and per-test evidence (expected from the snapshot, bounded actual output)", async () => {
    mountReview(codingQ(COMPLETE));
    const block = await screen.findByTestId("coding-autograde", {}, { timeout: 3000 });
    expect(block.textContent).toMatch(/التصحيح الآلي/);
    expect(block.textContent).toMatch(/اكتمل التصحيح الآلي/);
    expect(block.textContent).toMatch(/العلامة الآلية: 6\.67 \/ 10/);
    expect(block.textContent).toMatch(/طريقة المقارنة\s*تجاهل المسافات في نهايات الأسطر/);
    expect(block.textContent).toMatch(/عدد الاختبارات\s*2/);
    const rows = within(block).getAllByTestId("coding-autograde-case");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/صغير/); expect(rows[0].textContent).toMatch(/ناجح/);
    expect(rows[1].textContent).toMatch(/h2/); expect(rows[1].textContent).toMatch(/مخرجات غير مطابقة/);
    expect(rows[1].textContent).toMatch(/10/); expect(rows[1].textContent).toMatch(/11/); expect(rows[1].textContent).toMatch(/warn: x/);
    expect(within(block).getByRole("button", { name: "إعادة التصحيح بإصدار جديد" })).toBeTruthy();
  });
  it("a TECHNICAL failure is shown as such (never «wrong answer») with a retry button that posts ONLY identifiers", async () => {
    const calls = mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", technicalCode: "RUNNER_BUSY", comparator: "exact" }), { autoGrade: { score: 0, manualReview: true } }), A({ finalized: false, gradingStatus: "pendingReview", manualReviewMarks: 10 }));
    const block = await screen.findByTestId("coding-autograde", {}, { timeout: 3000 });
    expect(block.textContent).toMatch(/تعذر إكمال التصحيح الآلي لأسباب تقنية/);
    expect(block.textContent).not.toMatch(/إجابة خاطئة|فاشل/);
    fireEvent.click(within(block).getByRole("button", { name: "إعادة محاولة التصحيح" }));
    await waitFor(() => expect(calls.some(c => c.url.includes("/api/coding/regrade"))).toBe(true));
    const body = calls.find(c => c.url.includes("/api/coding/regrade"))!.body as Record<string, unknown>;
    expect(body).toEqual({ action: "retry", assignmentId: "a1", studentId: "s1", attemptNumber: 1, questionId: "auto1" });
  });
  it("a pending automatic grade says so, and the manual controls (teacher mark / comment / use automatic mark) still work", async () => {
    mountReview(codingQ(EV({ status: "processing", automaticStatus: "processing", comparator: "exact" }), { autoGrade: { score: 0, manualReview: true } }), A({ finalized: false, gradingStatus: "pendingReview", manualReviewMarks: 10 }));
    const block = await screen.findByTestId("coding-autograde", {}, { timeout: 3000 });
    expect(block.textContent).toMatch(/جارٍ التصحيح الآلي/);
    expect(screen.getByText("استخدم العلامة الآلية")).toBeTruthy();
    expect(screen.getByText(/علامة المعلم/)).toBeTruthy();
  });
  it("force regrade asks the server (identifiers only, after the 17E-D confirmation) and reloads", async () => {
    const calls = mountReview(codingQ(COMPLETE));
    const block = await screen.findByTestId("coding-autograde", {}, { timeout: 3000 });
    fireEvent.click(within(block).getByRole("button", { name: "إعادة التصحيح بإصدار جديد" }));
    const dlg = await waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm"); return el; });
    await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: "بدء إعادة التصحيح" })); });
    await waitFor(() => expect(calls.filter(c => c.url.includes("/api/coding/regrade"))).toHaveLength(1));
    expect(calls.find(c => c.url.includes("/api/coding/regrade"))!.body).toEqual({ action: "force", assignmentId: "a1", studentId: "s1", attemptNumber: 1, questionId: "auto1" });
    await waitFor(() => expect(calls.filter(c => c.url.includes("/api/assignment-review") && c.method === "GET").length).toBeGreaterThanOrEqual(2));
  });
});

describe("17C-H student — safe pending state only", () => {
  const fullExam = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "ق", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال", marks: 10 }] }] };
  const assignment = { assignmentId: "a1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 10, exam: fullExam };
  const base = { attemptsUsed: 1, allowedAttempts: 1, canAttempt: false, dueClosed: false, availability: "open", durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: false, serverNow: "2026-03-01T12:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: false, draftAnswers: {}, draftSavedAt: "" };
  function mountState(latestResult: Record<string, unknown>) {
    const state = { ...base, latestResult, attempts: [latestResult] };
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: true, state }) } as unknown as Response)) as unknown as typeof fetch;
    return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أ" className="ص" onBack={() => {}} onLogout={() => {}} />);
  }
  it("pending automatic coding grading: the submission is complete; the page says automatic grading is still completing — nothing about tests", async () => {
    mountState({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview", autoGradingPending: true, timedOut: false });
    const note = await screen.findByTestId("coding-grading-pending", {}, { timeout: 3000 });
    expect(note.textContent).toMatch(/تم تسليم الامتحان بنجاح/);
    expect(note.textContent).toMatch(/جارٍ استكمال التصحيح الآلي لأسئلة البرمجة/);
    expect(document.body.textContent).not.toMatch(/اختبار مخفي|hidden|expected|المخرجات المتوقعة/i);
  });
  it("without pending automatic grading there is no such message", async () => {
    mountState({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 10, totalMarks: 10, percentage: 100, manualReviewMarks: 0, finalized: true, gradingStatus: "final", timedOut: false });
    await screen.findByText(/العلامة النهائية معتمدة/);
    expect(screen.queryByTestId("coding-grading-pending")).toBeNull();
  });
});
