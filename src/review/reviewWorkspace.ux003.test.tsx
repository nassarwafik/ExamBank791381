// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";
import AssignmentReview from "../AssignmentReview";

// UX-003 — the teacher grading WORKSPACE inside the real AssignmentReview: states derived from the server projection
// (pending never shown as wrong), the prominent «يحتاج إلى تصحيح يدوي» filter and its siblings, navigator counts and jumps,
// previous / next, the exam-style choice rendering with the teacher-only key, the provisional (draft) state of a typed mark,
// and the unsaved-change guard on close (Escape, «إغلاق», «إلغاء»). The save body and the API contract are unchanged.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const Q = (id: string, n: number, over: Record<string, unknown>) => ({ questionId: id, questionNumber: n, text: "نص السؤال " + n, marks: 4, type: "shortAnswer", studentAnswer: { kind: "text", value: "جواب" }, expectedAnswer: { text: "x" }, autoGrade: { score: 4, manualReview: false }, manualScore: null, teacherComment: "", ...over });
const questions = () => [
  Q("q1", 1, { type: "multipleChoice", options: [{ text: "الراوتر" }, { text: "السويتش" }, { text: "الهب" }], studentAnswer: { kind: "choice", index: 1 }, expectedAnswer: { correctOptionIndex: 1 } }),
  Q("q2", 2, { type: "multipleChoice", options: [{ text: "أ" }, { text: "ب" }], studentAnswer: { kind: "choice", index: 0 }, expectedAnswer: { correctOptionIndex: 1 }, autoGrade: { score: 0, manualReview: false } }),
  Q("q3", 3, { autoGrade: { score: 0, manualReview: true } }),                                  // pending (open answer)
  Q("q4", 4, { autoGrade: { score: 2, manualReview: false } }),                                 // partial
  Q("q5", 5, { studentAnswer: null, autoGrade: { score: 0, manualReview: false } }),            // unanswered
  Q("q6", 6, { type: "trueFalse", options: [], studentAnswer: { kind: "choice", index: 0 }, expectedAnswer: { correct: false }, autoGrade: { score: 0, manualReview: true } }), // pending
];
const attempt = { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 10, totalMarks: 24, percentage: 42, manualReviewMarks: 8, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false };
const body = () => ({ ok: true, assignment: { assignmentId: "a1", title: "امتحان الشبكات", totalMarks: 24 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { ...attempt, teacherFeedback: "" }, attempts: [attempt], questions: questions() });

function mount(onClose = vi.fn()) {
  const posts: unknown[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => body() } as Response);
    if (url.includes("/api/assignment-review")) { posts.push(JSON.parse(String(init?.body))); return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, result: { gradingStatus: "pendingReview", finalized: false, score: 14, totalMarks: 24, percentage: 58, manualReviewMarks: 4 } }) } as Response); }
    return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
  }) as unknown as typeof fetch;
  render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={onClose} onSaved={() => {}} />);
  return { posts, onClose };
}
const articles = () => Array.from(document.querySelectorAll(".review-question")) as HTMLElement[];
const statusOf = (el: HTMLElement) => within(el).getByTestId("rv-status").getAttribute("data-state");
const filterBtn = (id: string) => document.querySelector('.rv-filter[data-filter="' + id + '"]') as HTMLButtonElement;

describe("UX-003 grading workspace", () => {
  it("derives every state from the server projection: correct / incorrect / pending / partial / unanswered — pending is never «خاطئة»", async () => {
    mount();
    await screen.findByText("امتحان الشبكات");
    expect(articles().map(statusOf)).toEqual(["correct", "incorrect", "pending", "partial", "unanswered", "pending"]);
    expect(screen.getByTestId("rv-count-pending").textContent).toBe("2");
    expect(screen.getByTestId("rv-count-graded").textContent).toBe("4");
    // text + icon, never colour only
    expect(within(articles()[2]).getByTestId("rv-status").textContent).toContain("بانتظار التصحيح اليدوي");
    expect(within(articles()[4]).getByTestId("rv-status").textContent).toContain("لم يُجب الطالب");
  });

  it("choice questions render exam-style: every option, the student's pick and the correct option marked in text (teacher-only key)", async () => {
    mount();
    await screen.findByText("امتحان الشبكات");
    const q1 = within(articles()[0]).getByTestId("rv-choices");
    expect(q1.textContent).toContain("الراوتر"); expect(q1.textContent).toContain("السويتش"); expect(q1.textContent).toContain("الهب");
    expect(q1.querySelector(".rv-choice.is-picked.is-key.is-right")!.textContent).toContain("✓ اختيار الطالب — صحيح");
    const q2 = within(articles()[1]).getByTestId("rv-choices");
    expect(q2.querySelector(".rv-choice.is-picked.is-wrong")!.textContent).toContain("✗ اختيار الطالب — خطأ");
    expect(q2.querySelector(".rv-choice.is-key:not(.is-picked)")!.textContent).toContain("✓ الإجابة الصحيحة");
    const q6 = within(articles()[5]).getByTestId("rv-choices");                     // trueFalse without stored options → صحيح / غير صحيح
    expect(q6.textContent).toContain("صحيح"); expect(q6.textContent).toContain("غير صحيح");
    expect(q6.querySelector(".rv-choice.is-key")!.textContent).toContain("غير صحيح");
  });

  it("«يحتاج إلى تصحيح يدوي» shows only the unresolved manual reviews; the other filters are exclusive; «الكل» restores", async () => {
    mount();
    await screen.findByText("امتحان الشبكات");
    expect(filterBtn("pending").textContent).toContain("(2)");
    fireEvent.click(filterBtn("pending"));
    expect(filterBtn("pending").getAttribute("aria-pressed")).toBe("true");
    expect(articles().map(a => a.getAttribute("aria-label"))).toEqual(["السؤال 3", "السؤال 6"]);
    fireEvent.click(filterBtn("incorrect"));
    expect(articles().map(a => a.getAttribute("aria-label"))).toEqual(["السؤال 2"]);
    fireEvent.click(filterBtn("graded"));
    expect(articles().length).toBe(4);
    fireEvent.click(filterBtn("correct"));
    expect(articles().map(a => a.getAttribute("aria-label"))).toEqual(["السؤال 1"]);
    fireEvent.click(filterBtn("partial"));
    expect(articles().map(a => a.getAttribute("aria-label"))).toEqual(["السؤال 4"]);
    fireEvent.click(filterBtn("all"));
    expect(articles().length).toBe(6);
  });

  it("navigator: one button per question with its state in text; a jump focuses the question (switching to «الكل» when it is filtered out)", async () => {
    mount();
    await screen.findByText("امتحان الشبكات");
    const nav = screen.getByTestId("rv-nav");
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.length).toBe(6);
    expect(buttons[2].getAttribute("aria-label")).toBe("السؤال 3 — بانتظار التصحيح اليدوي");
    expect(nav.textContent).toContain("بانتظار التصحيح اليدوي: 2");
    fireEvent.click(filterBtn("pending"));
    expect(within(nav).getAllByRole("button")[0].getAttribute("aria-label")).toContain("خارج التصفية الحالية");
    fireEvent.click(within(nav).getAllByRole("button")[0]);                       // jump to q1 while filtered → back to الكل
    await waitFor(() => expect(filterBtn("all").getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("السؤال 1"));
    expect(within(nav).getAllByRole("button")[0].getAttribute("aria-current")).toBe("true");
  });

  it("previous / next move through the visible questions; «التالي بانتظار التصحيح» jumps to the next pending one", async () => {
    mount();
    await screen.findByText("امتحان الشبكات");
    const next = screen.getByRole("button", { name: /السؤال التالي/ }), prev = screen.getByRole("button", { name: /السؤال السابق/ });
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(next);
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("السؤال 2"));
    fireEvent.click(screen.getByTestId("rv-next-pending"));
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("السؤال 3"));
    fireEvent.click(screen.getByTestId("rv-next-pending"));
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("السؤال 6"));
    fireEvent.click(screen.getByTestId("rv-next-pending"));                      // wraps
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("السؤال 3"));
    expect(screen.getByText(/السؤال 3 من 6 المعروضة/)).toBeTruthy();
  });

  it("a typed mark is a provisional state (غير محفوظ) and shows the unsaved indicator; the save sends the unchanged override body", async () => {
    const { posts } = mount();
    await screen.findByText("امتحان الشبكات");
    const q3 = articles()[2];
    fireEvent.change(within(q3).getByLabelText(/علامة المعلم/), { target: { value: "3" } });
    expect(statusOf(q3)).toBe("partial");
    expect(within(q3).getByTestId("rv-status").textContent).toContain("(غير محفوظ)");
    expect(screen.getByText("● تعديلات غير محفوظة")).toBeTruthy();
    expect(screen.getByTestId("rv-count-pending").textContent).toBe("1");          // the draft resolves it in the counts
    fireEvent.click(screen.getByText(/حفظ واعتماد التصحيح/));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]).toMatchObject({ action: "saveReview", assignmentId: "a1", studentId: "s1", attemptNumber: 1, overrides: { q3: { score: 3, comment: "" } } });
  });

  it("closing with unsaved edits asks first (Escape, «إغلاق», «إلغاء»); «البقاء» keeps everything; without edits it closes at once", async () => {
    const { onClose } = mount();
    await screen.findByText("امتحان الشبكات");
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));                 // clean → closes immediately
    cleanup();
    const second = mount();
    await screen.findByText("امتحان الشبكات");
    fireEvent.change(within(articles()[2]).getByLabelText(/علامة المعلم/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /إلغاء/ }));
    const dlg = await screen.findByRole("dialog", { name: "تعديلات تصحيح غير محفوظة" });
    expect(dlg.textContent).toContain("لم تُحفظ بعد");
    fireEvent.click(screen.getByRole("button", { name: "البقاء في التصحيح" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديلات تصحيح غير محفوظة" })).toBeNull());
    expect(second.onClose).not.toHaveBeenCalled();
    expect((within(articles()[2]).getByLabelText(/علامة المعلم/) as HTMLInputElement).value).toBe("2");
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await screen.findByRole("dialog", { name: "تعديلات تصحيح غير محفوظة" });
    fireEvent.click(screen.getByRole("button", { name: "الخروج دون حفظ" }));
    await waitFor(() => expect(second.onClose).toHaveBeenCalledTimes(1));
  });
});
